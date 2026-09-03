#!/usr/bin/env bash
# Builds the deploy artifact from the readable source.
#
#   bash tools/build.sh
#
# Two stages, deliberately separate:
#   1. minify   — strips comments, docstrings and blank lines
#   2. mangle   — shortens identifiers, source untouched
#
# Bradbury's ceiling was MEASURED (test/size_gate.py): 51,257 bytes accepted,
# 53,500 refused with BlockPubdataLimitReached. Stage 1 alone leaves ~62 KB,
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
  "$HOME/.local/bin/genvm-lint" check build/Sentinel.min.py | grep -E 'Lint passed|Validation passed' | sed 's/^/  /'
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
json.dump(d, open("deployments.json", "w"), indent=2)
print(f"  {meta['bytes']:>7,} bytes  build/Sentinel.min.py  sha256 {meta['sha256'][:16]}…")
PY
