#!/usr/bin/env python3
"""
Proves the code AT AN ADDRESS is byte-identical to a local artifact.

    python3 tools/verify_onchain.py <address> build/PredictStake.min.py

`genlayer code` does not print the contract source alone: it prints a blank
line, a `Result:` header, the source, and trailing blanks. Diffing against that
raw output reports a mismatch for a contract that is in fact identical — which
is worse than no check, because it teaches you to ignore the check. This strips
the chrome and compares sha256.

Exit 0 on a match, 1 on a difference.
"""
import hashlib
import subprocess
import sys


def on_chain(address: str) -> str:
    raw = subprocess.run(["genlayer", "code", address],
                         capture_output=True, text=True, check=False).stdout
    marker = raw.find("Result:")
    body = raw[marker + len("Result:"):] if marker >= 0 else raw
    return body.strip("\n") + "\n"


def main() -> int:
    if len(sys.argv) != 3:
        print(__doc__.strip(), file=sys.stderr)
        return 2
    address, artifact = sys.argv[1], sys.argv[2]
    got = on_chain(address)
    want = open(artifact, encoding="utf8").read()
    a = hashlib.sha256(got.encode()).hexdigest()
    b = hashlib.sha256(want.encode()).hexdigest()
    if a == b:
        print(f"MATCH  {address}\n       {artifact}\n       sha256 {a}  ({len(want):,} bytes)")
        return 0
    print(f"DIFFER {address}\n       on-chain {a} ({len(got):,} bytes)\n"
          f"       artifact {b} ({len(want):,} bytes)", file=sys.stderr)
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
