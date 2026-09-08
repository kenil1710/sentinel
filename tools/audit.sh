#!/usr/bin/env bash
# Repository and deployment audit for Sentinel.
#
#   bash tools/audit.sh
#
# Checks the LIVE Studio Dev deployment and the LIVE Vercel site, not local files
# alone. A check that only reads the repository can pass while the thing anyone
# else can reach is broken.
set -uo pipefail
cd "$(dirname "$0")/.."

PASS=0; FAIL=0; SKIP=0
ok()   { PASS=$((PASS+1)); printf "  \033[32m✔\033[0m %s\n" "$1"; }
bad()  { FAIL=$((FAIL+1)); printf "  \033[31m✘\033[0m %s\n" "$1"; }
skip() { SKIP=$((SKIP+1)); printf "  \033[33m○\033[0m %s\n" "$1"; }
sec()  { printf "\n\033[1m%s\033[0m\n" "$1"; }

CONTRACT=$(python3 -c "import json;print(json.load(open('deployments.json'))['deployments']['studiodev']['Sentinel']['address'])" 2>/dev/null || echo "")
SITE=$(python3 -c "import json;print(json.load(open('deployments.json')).get('frontend',{}).get('url',''))" 2>/dev/null || echo "")

# ─────────────────────────────────────────────────────────────────────────────
sec "Build artifact"
# ─────────────────────────────────────────────────────────────────────────────
# This gate runs FIRST because it is the constraint that decides whether the
# project can deploy at all. test/size_gate.py deploys a padded contract to
# a live network and reads a value back from it; re-measured when the profile fields
# were added:
#
#   51,257 ACCEPTED   51,692 ACCEPTED   52,400 ACCEPTED
#   53,000 ACCEPTED   53,500 REFUSED (BlockPubdataLimitReached)
if [ -f build/Sentinel.min.py ]; then
  BYTES=$(wc -c < build/Sentinel.min.py | tr -d ' ')
  if [ "$BYTES" -lt 53000 ]; then ok "artifact is ${BYTES} bytes, under the 53,000 budget (MEASURED: 53,000 accepted, 53,500 refused)"
  else bad "artifact is ${BYTES} bytes — over budget"; fi
  sed -n '2p' build/Sentinel.min.py | grep -q 'py-genlayer:' && ok "runner pin survived the mangle" || bad "runner pin missing from the artifact"
  python3 -c "import ast;ast.parse(open('build/Sentinel.min.py').read())" 2>/dev/null && ok "artifact parses" || bad "artifact does not parse"
else bad "build/Sentinel.min.py missing — run bash tools/build.sh"; fi

if [ -x "$HOME/.local/bin/genvm-lint" ]; then
  # Captured to a variable rather than piped into `grep -q`. Under `pipefail` a
  # `grep -q` that matches EXITS EARLY, the linter gets SIGPIPE, and the
  # pipeline's status becomes 141 — so a linter that passed was reported as a
  # failure. A check that cries wolf is worse than no check.
  LINT_OUT=$("$HOME/.local/bin/genvm-lint" check build/Sentinel.min.py 2>&1)
  case "$LINT_OUT" in
    *"Lint passed"*) ok "genvm-lint passes on the artifact" ;;
    *) bad "genvm-lint fails on the artifact" ;;
  esac
  # The linter counts the ABI independently of the source, so this is the one
  # number in the repository that cannot drift from the contract by accident.
  METHODS=$(printf '%s' "$LINT_OUT" | sed -n 's/.*Methods: \([0-9]*\) .*/\1/p' | head -1)
  [ "$METHODS" = "36" ] && ok "the ABI is the documented 36 public methods" \
    || bad "the ABI has ${METHODS:-?} public methods, not the documented 36"
else skip "genvm-lint not installed"; fi

# ─────────────────────────────────────────────────────────────────────────────
sec "Contract source invariants"
# ─────────────────────────────────────────────────────────────────────────────
sed -n '1p' contracts/Sentinel.py | grep -q '^# v0\.3\.0$' \
  && ok "the runner version is line 1 of the source" || bad "line 1 is not the runner version"
sed -n '2p' contracts/Sentinel.py | grep -q '^# { "Depends": "py-genlayer:' \
  && ok "runner pin is line 2 of the source" || bad "runner pin is not line 2"
sed -n '3p' contracts/Sentinel.py | grep -q '^import genlayer as gl$' \
  && ok "nothing sits between the header and the imports" || bad "something sits between the header and the imports"
# AST, not grep. The source explains the hazard in two comments, and a text
# search cannot tell a comment about .replace() from a call to it — which is
# exactly the false positive this check produced before.
python3 - <<'PY' && ok "no str.replace() CALL anywhere (the runner rejects it)" || bad "str.replace() is called — the runner rejects it"
import ast, sys
tree = ast.parse(open("contracts/Sentinel.py").read())
hits = [n.lineno for n in ast.walk(tree)
        if isinstance(n, ast.Call) and isinstance(n.func, ast.Attribute)
        and n.func.attr == "replace"]
sys.exit(1 if hits else 0)
PY
grep -cE '^\s*self\.[a-z_]+ = ' contracts/Sentinel.py >/dev/null && ok "storage is assigned in __init__"

# ─────────────────────────────────────────────────────────────────────────────
sec "Offline test suites"
# ─────────────────────────────────────────────────────────────────────────────
LOGIC=$(python3 test/test_logic.py 2>&1 | tail -3)
if echo "$LOGIC" | grep -q "^OK"; then
  N=$(echo "$LOGIC" | grep -oE "Ran [0-9]+" | grep -oE "[0-9]+")
  ok "test_logic.py — ${N} tests, all passing"
else bad "test_logic.py FAILED: $(echo "$LOGIC" | tail -1)"; fi

CHECK=$(python3 tools/checklist.py 2>&1 | tail -1)
if echo "$CHECK" | grep -q "0 failed"; then
  ok "checklist.py — $(echo "$CHECK" | grep -oE '[0-9]+ passed') rejection-pattern checks (AST)"
else bad "checklist.py FAILED: $CHECK"; fi

PATROL=$(node --experimental-strip-types --no-warnings test/test_patrol.mjs 2>&1 | tail -2)
if echo "$PATROL" | grep -q "0 failed"; then
  ok "test_patrol.mjs — $(echo "$PATROL" | grep -oE '[0-9]+ passed')"
else bad "test_patrol.mjs FAILED: $PATROL"; fi

# ─────────────────────────────────────────────────────────────────────────────
sec "Live Studio Dev deployment"
# ─────────────────────────────────────────────────────────────────────────────
if [ -z "$CONTRACT" ]; then
  bad "no Studio Dev address recorded in deployments.json"
else
  ok "address recorded: $CONTRACT"
  genlayer network set studio-dev >/dev/null 2>&1
  VERIFY=$(python3 tools/verify_onchain.py "$CONTRACT" build/Sentinel.min.py 2>&1)
  case "$VERIFY" in
    MATCH*)      ok "on-chain code is BYTE-IDENTICAL to build/Sentinel.min.py" ;;
    EQUIVALENT*) ok "on-chain code is the SAME PROGRAM as build/Sentinel.min.py (private identifier names differ)" ;;
    *)           bad "on-chain code differs from the local artifact" ;;
  esac

  CFG=$(genlayer call "$CONTRACT" get_config 2>/dev/null | grep -o '{.*}' | head -1)
  if [ -n "$CFG" ]; then
    ok "get_config answers on chain"
    echo "$CFG" | grep -q '"min_bond": "500000000000000000"' && ok "min bond is the shipped 0.5 GEN" || bad "min bond is not 0.5 GEN"
    echo "$CFG" | grep -q '"challenge_stake": "50000000000000000"' && ok "challenge stake is the shipped 0.05 GEN" || bad "challenge stake is not 0.05 GEN"
    echo "$CFG" | grep -q '"penalty_bps": 2000' && ok "penalty is the shipped 2000 bps" || bad "penalty is not 2000 bps"
    echo "$CFG" | grep -q '"max_mandate_chars": 1000' && ok "mandate ceiling is the plan's 1000 chars" || bad "mandate ceiling is not 1000"
    echo "$CFG" | grep -q '"agent_types"' && echo "$CFG" | grep -q 'TRADING' && echo "$CFG" | grep -q 'SHOPPING' \
      && ok "the five agent types are published on chain" || bad "agent_types missing from get_config"
    echo "$CFG" | grep -q 'eth.blockscout.com' && echo "$CFG" | grep -q 'base.blockscout.com' \
      && echo "$CFG" | grep -q 'arbitrum.blockscout.com' && echo "$CFG" | grep -q 'polygon.blockscout.com' \
      && echo "$CFG" | grep -q 'robinhoodchain.blockscout.com' \
      && ok "all five chains are configured with their explorers" || bad "chain/explorer table incomplete"
    echo "$CFG" | grep -q '"paused": false' && ok "contract is not paused" || bad "contract is paused"
  else bad "get_config did not answer"; fi

  STATS=$(genlayer call "$CONTRACT" get_stats 2>/dev/null | grep -o '{.*}' | head -1)
  if [ -n "$STATS" ]; then
    ok "get_stats answers on chain"
    AGENTS=$(echo "$STATS" | python3 -c "import json,sys;print(json.load(sys.stdin)['agents_registered'])" 2>/dev/null || echo 0)
    VIOL=$(echo "$STATS" | python3 -c "import json,sys;print(json.load(sys.stdin)['violations'])" 2>/dev/null || echo 0)
    SETTLED=$(echo "$STATS" | python3 -c "import json,sys;print(json.load(sys.stdin)['challenges_settled'])" 2>/dev/null || echo 0)
    [ "$AGENTS" -ge 8 ] && ok "the register is populated (${AGENTS} agents)" || bad "only ${AGENTS} agents registered — the register looks empty"

    # The profile must actually be stored, not merely accepted.
    A0=$(genlayer call "$CONTRACT" get_agent --args 0 2>/dev/null | grep -o '{.*}' | head -1)
    echo "$A0" | grep -q '"name"' && echo "$A0" | grep -q '"agent_type"' \
      && ok "agents carry a stored profile (name, type, description, operator URL)" \
      || bad "the agent record has no profile fields"
    echo "$A0" | grep -qE '"operator_url": "(https?://[^"]*)?"' \
      && ok "the stored operator URL is http/https or empty (never javascript:)" \
      || bad "an operator URL with a non-http scheme is stored on chain"
    # The new type view has to FILTER, not merely answer. A view that returns
    # every agent whatever you ask it for would pass a bare "it responded" check.
    BYTYPE=$(genlayer call "$CONTRACT" get_agents_by_type --args TRADING --args 50 2>/dev/null | grep -o '{.*}' | head -1)
    NTYPE=$(echo "$BYTYPE" | python3 -c "
import json,sys
d=json.load(sys.stdin); a=d.get('agents',[])
print(len(a) if a and all(x.get('agent_type')=='TRADING' for x in a) else -1)
" 2>/dev/null || echo -1)
    [ "$NTYPE" -gt 0 ] && ok "get_agents_by_type(TRADING) returns ${NTYPE} agents, all of them TRADING" \
      || bad "get_agents_by_type did not filter by type"

    # The register has to be DIVERSE. Eleven agents that are all the same type on
    # the same chain would satisfy the count above and prove nothing.
    ACTIVE=$(genlayer call "$CONTRACT" get_active_agents --args 50 2>/dev/null | grep -o '{.*}' | head -1)
    DIV=$(echo "$ACTIVE" | python3 -c "
import json,sys
a=json.load(sys.stdin).get('agents',[])
print(len({x.get('chain') for x in a}), len({x.get('agent_type') for x in a}))
" 2>/dev/null || echo "0 0")
    NCHAIN=$(echo "$DIV" | cut -d' ' -f1); NKIND=$(echo "$DIV" | cut -d' ' -f2)
    # Five, not four. `get_config` advertises five chains, and a chain the
    # contract claims but the register cannot demonstrate is a claim nobody can
    # check. Base was missing until base.blockscout.com came back up; Robinhood
    # arrived with the fifth-chain work.
    { [ "$NCHAIN" -ge 5 ] && [ "$NKIND" -ge 3 ]; } \
      && ok "the register spans all ${NCHAIN} configured chains and ${NKIND} agent types" \
      || bad "the register is not diverse (chains=${NCHAIN} of 5, types=${NKIND})"

    [ "$SETTLED" -gt 0 ] && ok "challenges have been judged by validators (${SETTLED} settled)" || bad "no challenge has been settled"
    [ "$VIOL" -gt 0 ] && ok "a real violation was proven on chain (${VIOL})" || skip "no violation proven yet"
  else bad "get_stats did not answer"; fi
fi

# ─────────────────────────────────────────────────────────────────────────────
sec "Live site"
# ─────────────────────────────────────────────────────────────────────────────
if [ -z "$SITE" ]; then skip "no frontend URL recorded"; else
  for p in / /agents /register /patrol /leaderboard /docs /agent/0 /challenge/0; do
    CODE=$(curl -s -o /dev/null -w "%{http_code}" --max-time 30 "${SITE}${p}")
    [ "$CODE" = "200" ] && ok "${p} → 200" || bad "${p} → ${CODE}"
  done
  # The security property that matters most: a public URL must never be able to
  # spend the bot's stake.
  # A full patrol walks eleven agents and ~120 transactions through Blockscout
  # one at a time; measured at 111s on the live site. A 120s ceiling was close
  # enough to that to fail on a cold start and report a working endpoint broken.
  DRY=$(curl -s --max-time 280 "${SITE}/api/patrol?dry=0" | python3 -c "import json,sys;print(json.load(sys.stdin)['dry_run'])" 2>/dev/null || echo "error")
  [ "$DRY" = "True" ] && ok "/api/patrol forces a DRY RUN for an unauthenticated caller" \
    || bad "/api/patrol did not force a dry run for a public caller (got: $DRY)"
  TXS=$(curl -s --max-time 45 "${SITE}/api/txs?chain=ethereum&wallet=0x17e3048c1b20dfeb2d64b77fcd619bd74a3faca5" \
    | python3 -c "import json,sys;print(json.load(sys.stdin).get('ok'))" 2>/dev/null || echo "error")
  [ "$TXS" = "True" ] && ok "/api/txs reads live Blockscout" || bad "/api/txs failed (got: $TXS)"

  # The public compliance API, on the live site.
  CHK=$(curl -s --max-time 45 "${SITE}/api/check?wallet=0x0000000000000000000000000000000000000001&chain=ethereum" \
    | python3 -c "import json,sys;print(json.load(sys.stdin).get('registered'))" 2>/dev/null || echo "error")
  [ "$CHK" = "False" ] && ok "/api/check answers {registered:false} for an unknown wallet" \
    || bad "/api/check did not answer for an unknown wallet (got: $CHK)"
  CHK2=$(curl -s --max-time 45 "${SITE}/api/check?wallet=0x17e3048c1b20dfeb2d64b77fcd619bd74a3faca5&chain=ethereum" \
    | python3 -c "
import json,sys
d=json.load(sys.stdin)
print('ok' if d.get('registered') and d.get('mandate') and 'untested' in (d.get('compliance') or {}) else 'bad')
" 2>/dev/null || echo "error")
  [ "$CHK2" = "ok" ] && ok "/api/check returns the mandate, score and the untested flag" \
    || bad "/api/check response is incomplete (got: $CHK2)"
  CHK3=$(curl -s -o /dev/null -w "%{http_code}" --max-time 30 "${SITE}/api/check?wallet=nope")
  [ "$CHK3" = "400" ] && ok "/api/check rejects a malformed wallet with 400" || bad "/api/check gave $CHK3 for a bad wallet"

  # The endpoint is advertised as callable from a browser. That is a header, not
  # a promise, so read the header off the live response.
  ACAO=$(curl -s -D - -o /dev/null --max-time 45 \
    "${SITE}/api/check?wallet=0x0000000000000000000000000000000000000001&chain=ethereum" \
    | grep -i '^access-control-allow-origin:' | tr -d '\r' | awk '{print $2}')
  [ "$ACAO" = "*" ] && ok "/api/check sends an open CORS header, so a browser can call it" \
    || bad "/api/check CORS header is '${ACAO}' — a browser could not call it"

  # The end-to-end tie: a verdict the validators reached on chain has to be
  # readable by somebody else's software through the public endpoint.
  CHK4=$(curl -s --max-time 45 "${SITE}/api/check?wallet=0x17e3048c1b20dfeb2d64b77fcd619bd74a3faca5&chain=ethereum" \
    | python3 -c "
import json,sys
d=json.load(sys.stdin)
v=d.get('recent_verdicts') or []
c=d.get('compliance') or {}
print('ok' if any(x.get('verdict')=='VIOLATION' for x in v) and c.get('untested') is False else 'bad')
" 2>/dev/null || echo "error")
  [ "$CHK4" = "ok" ] && ok "/api/check surfaces the settled VIOLATION and clears the untested flag" \
    || bad "/api/check does not show the settled verdict (got: $CHK4)"

  DOCS=$(curl -s --max-time 30 "${SITE}/docs")
  echo "$DOCS" | grep -q "/api/check" && ok "/docs documents the public compliance API" \
    || bad "/docs does not document /api/check"

  # The marketing / app split, verified on the served HTML rather than asserted.
  # The landing page must offer no wallet prompt and name no network; every page
  # that can touch the chain must offer both.
  LAND=$(curl -s --max-time 30 "${SITE}/")
  if echo "$LAND" | grep -qE "Connect wallet|Install a wallet"; then
    bad "landing page carries a wallet control"
  else ok "landing page carries NO wallet control"; fi
  if echo "$LAND" | grep -qE "Studio Dev"; then
    bad "landing page names a network"
  else ok "landing page names NO network"; fi

  APPOK=1
  for p in /agents /register /patrol /leaderboard /docs; do
    H=$(curl -s --max-time 30 "${SITE}${p}")
    echo "$H" | grep -qE "Connect wallet|Install a wallet" || APPOK=0
    echo "$H" | grep -qE "Studio Dev" || APPOK=0
  done
  [ "$APPOK" = "1" ] && ok "every app page carries the wallet control and the network badge" \
    || bad "an app page is missing the wallet control or the network badge"
fi

# ─────────────────────────────────────────────────────────────────────────────
sec "Frontend gates"
# ─────────────────────────────────────────────────────────────────────────────
if [ -d frontend/node_modules ]; then
  (cd frontend && npx tsc --noEmit >/dev/null 2>&1) && ok "tsc --noEmit is clean" || bad "tsc --noEmit reports errors"
  (cd frontend && npx eslint . --max-warnings=0 >/dev/null 2>&1) && ok "eslint --max-warnings=0 is clean" || bad "eslint reports problems"
else skip "frontend/node_modules missing — run npm install"; fi

[ -f "frontend/src/app/(marketing)/layout.tsx" ] && [ -f "frontend/src/app/(app)/layout.tsx" ] \
  && ok "route groups split marketing from app structurally" || bad "route groups missing"
grep -q "WalletProvider" "frontend/src/app/(marketing)/layout.tsx" 2>/dev/null \
  && bad "the marketing layout imports the wallet provider" \
  || ok "the marketing layout has no wallet import path"

grep -q 'PATROL_PRIVATE_KEY' frontend/.env.example && ok ".env.example documents the patrol key" || bad ".env.example missing the patrol key"
grep -q 'NEXT_PUBLIC_PATROL_PRIVATE_KEY' frontend/src/app/api/patrol/route.ts 2>/dev/null \
  && bad "the patrol key is exposed with a NEXT_PUBLIC_ prefix" || ok "the patrol key is never NEXT_PUBLIC_"
[ -f frontend/.gitignore ] && grep -q '.env.local' frontend/.gitignore && ok ".env.local is gitignored" || bad ".env.local is not gitignored"

# ─────────────────────────────────────────────────────────────────────────────
sec "Documentation"
# ─────────────────────────────────────────────────────────────────────────────
for f in README.md contracts/NOTES.md docs/PROBE.md deployments.json frontend/CRON.md; do
  [ -f "$f" ] && ok "$f present" || bad "$f missing"
done
grep -q "one round in four" contracts/NOTES.md && ok "NOTES.md records the consensus measurement" || bad "NOTES.md missing the consensus measurement"
grep -q "422" docs/PROBE.md && ok "PROBE.md records the ?limit=5 finding" || bad "PROBE.md missing the query-parameter finding"

# ─────────────────────────────────────────────────────────────────────────────
printf "\n\033[1m%d passed, %d failed, %d skipped\033[0m\n\n" "$PASS" "$FAIL" "$SKIP"
[ "$FAIL" -eq 0 ]
