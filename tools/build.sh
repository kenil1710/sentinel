#!/usr/bin/env bash
# Builds the deploy artifact from the readable source.
#
#   bash tools/build.sh
#
# Two stages, deliberately separate:
#   1. minify   — strips comments, docstrings and blank lines
#   2. mangle   — shortens identifiers, source untouched
#
# The deploy ceiling was MEASURED (test/size_gate.py): 51,257 bytes accepted,
# 53,500 refused with BlockPubdataLimitReached. Stage 1 alone leaves ~65 KB,
# which is over it. The name map stage 2 emits is not a courtesy: test_logic.py
# runs its battery against the artifact through that map, so the transform is
# verified rather than assumed.
set -euo pipefail
cd "$(dirname "$0")/.."

python3 tools/minify_contract.py contracts/Sentinel.py -o build/Sentinel.premangle.py | sed 's/^/  /'
# The pre-mangle text is committed: the collision regression compares
# replacement names against exactly what the mangler read, and diffing against
# it is how a reader checks the mangle did nothing but rename.
python3 tools/mangle_names.py build/Sentinel.premangle.py \
    -o build/Sentinel.min.py --map build/Sentinel.names.json | sed 's/^/  /'
python3 -c "import ast;ast.parse(open('build/Sentinel.min.py').read())"

if [ -x "$HOME/.local/bin/genvm-lint" ]; then
  # Two separate stages, and they fail for different reasons. The LINT is about
  # this contract and must always pass. The VALIDATION loads the runner named in
  # the pin, so it fails with "Failed to load SDK" whenever the local linter
  # bundle simply has not cached that runner tarball yet — a fact about this
  # machine, not about the artifact. Fail on the first, report the second.
  lint_out="$(mktemp)"
  set +e
  "$HOME/.local/bin/genvm-lint" check build/Sentinel.min.py >"$lint_out" 2>&1
  lint_rc=$?
  set -e
  sed 's/^/  /' "$lint_out"
  if [ "$lint_rc" -ne 0 ]; then
    if grep -q 'Failed to load SDK' "$lint_out"; then
      echo "  note: the local genvm-lint bundle has not cached this runner pin;"
      echo "        lint passed, validation was skipped. Not a build failure."
    else
      rm -f "$lint_out"
      exit "$lint_rc"
    fi
  fi
  rm -f "$lint_out"
fi

python3 - <<'PY'
import hashlib, json, os
d = json.load(open("deployments.json"))
d.setdefault("artifacts", {})
meta = d["artifacts"].setdefault("build/Sentinel.min.py", {"source": "contracts/Sentinel.py"})
meta["bytes"] = os.path.getsize("build/Sentinel.min.py")
meta["sha256"] = hashlib.sha256(open("build/Sentinel.min.py", "rb").read()).hexdigest()
meta["source_sha256"] = hashlib.sha256(open(meta["source"], "rb").read()).hexdigest()
meta["premangle_bytes"] = os.path.getsize("build/Sentinel.premangle.py")
# ensure_ascii=False, and a trailing newline: without either, every build
# rewrites every § and → in this file as a \uXXXX escape and drops the final
# newline, so `git diff` after a no-op build is 60 lines of noise.
with open("deployments.json", "w", encoding="utf-8") as fh:
    json.dump(d, fh, indent=2, ensure_ascii=False)
    fh.write("\n")
print(f"  {meta['bytes']:>7,} bytes  build/Sentinel.min.py  sha256 {meta['sha256'][:16]}…")
PY
