#!/usr/bin/env python3
"""
Measures the deploy size ceiling on a network by PROVING the transport rather
than guessing at it.

PredictStake recorded Bradbury refusing 59,278 bytes with BlockPubdataLimitReached
and accepting 43,342. Sentinel's artifact lands at 51,257 - inside that gap, where
neither outcome is known. So it is measured.

Deploys a trivial contract padded with a comment block to an EXACT byte size and
reads a value back from it. A contract that deploys and answers is a size that
works; anything else is the ceiling.

    python3 test/size_gate.py 51257 55000
"""
import subprocess
import sys
import tempfile
import os

HEAD = '# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }\n'
BODY = '''from genlayer import *


class SizeGate(gl.Contract):
	marker: str

	def __init__(self):
		self.marker = "ok"

	@gl.public.view
	def get_marker(self) -> str:
		return str(self.marker)
'''


def build(target: int) -> str:
	base = HEAD + BODY
	if len(base) > target:
		raise SystemExit(f"floor is {len(base)} bytes; {target} is below it")
	# Pad with a trailing comment block, which the VM stores but never parses as
	# the runner header (that is line 1 alone).
	need = target - len(base) - 1
	pad = "\n# " + ("p" * max(0, need - 3))
	out = base + pad + "\n"
	while len(out) > target:
		out = out[:-2] + "\n"
	while len(out) < target:
		out = out[:-1] + "p\n"
	return out


def attempt(size: int) -> bool:
	src = build(size)
	assert len(src) == size, (len(src), size)
	fd, path = tempfile.mkstemp(suffix=".py", dir="contracts", prefix="_sizegate_")
	os.write(fd, src.encode())
	os.close(fd)
	try:
		res = subprocess.run(["genlayer", "deploy", "--contract", path],
			capture_output=True, text=True, timeout=600)
		blob = res.stdout + res.stderr
		addr = ""
		for line in blob.split("\n"):
			if "Contract Address" in line:
				addr = line.split("'")[-2] if "'" in line else ""
		if not addr:
			reason = "BlockPubdataLimitReached" if "BlockPubdataLimit" in blob else \
				("timeout" if "timed out" in blob.lower() else "no address returned")
			print(f"  {size:>7,} bytes  REFUSED  ({reason})")
			return False
		chk = subprocess.run(["genlayer", "call", addr, "get_marker"],
			capture_output=True, text=True, timeout=300)
		ok = "ok" in chk.stdout
		print(f"  {size:>7,} bytes  {'ACCEPTED' if ok else 'DEPLOYED BUT MUTE'}  {addr}")
		return ok
	except subprocess.TimeoutExpired:
		print(f"  {size:>7,} bytes  TIMEOUT")
		return False
	finally:
		os.unlink(path)


if __name__ == "__main__":
	sizes = [int(a) for a in sys.argv[1:]] or [48000, 52000, 56000, 60000]
	net = subprocess.run(["genlayer", "network"], capture_output=True, text=True)
	print("Size gate — deploying padded contracts to the ACTIVE network\n")
	results = {}
	for s in sizes:
		results[s] = attempt(s)
	print()
	ok = [s for s in sizes if results[s]]
	bad = [s for s in sizes if not results[s]]
	if ok:
		print(f"largest accepted: {max(ok):,}")
	if bad:
		print(f"smallest refused: {min(bad):,}")
