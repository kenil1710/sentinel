"""SentinelConsumer against a Sentinel on the stub runtime: the cross-contract
standing read, the operator-only gate, and refusals that say why.

    cd test && python3 -m unittest -q test_consumer
"""
import json
import unittest

import fixtures as F
import stub
from fixtures import C, tx, view

K = stub.load_full(F.CONSUMER, "consumer")
SENTINEL_ADDR = F.addr(0x5E)


def setup():
    F.fresh_world()
    c = F.new_contract()
    stub.CONTRACTS.clear()
    stub.CONTRACTS[SENTINEL_ADDR] = c
    k = K.SentinelConsumer(SENTINEL_ADDR)
    for name in K.SentinelConsumer.__annotations__:
        getattr(k, name)
    return c, k


def act(k, sender, chain="ethereum", wallet=F.SWAP_WALLET, instruction="rebalance 10% into USDC"):
    stub.MESSAGE.sender_address = stub._Addr(sender)
    return json.loads(k.act_for_agent(chain, wallet, instruction))


class Consumer(unittest.TestCase):
    def test_good_standing_carries_out_for_operator_only(self):
        c, k = setup()
        F.registered(c)
        self.assertTrue(k.is_in_good_standing("ethereum", F.SWAP_WALLET))
        self.assertTrue(act(k, F.OP)["carried_out"])
        r = act(k, F.OUT)
        self.assertFalse(r["carried_out"])
        self.assertIn("operator", r["reasons"][0])
        got = json.loads(k.get_requests(10))
        self.assertEqual((got["carried_out"], got["refused"]), (1, 1))

    def test_refuses_with_open_breach_and_says_why(self):
        c, k = setup()
        F.registered(c)
        F.filed(c)
        F.ruled(c)
        self.assertFalse(k.is_in_good_standing("ethereum", F.SWAP_WALLET))
        r = act(k, F.OP)
        self.assertFalse(r["carried_out"])
        self.assertIn("provisional BREACH", r["reasons"][0])

    def test_refuses_unknown_and_paused(self):
        c, k = setup()
        self.assertFalse(k.is_in_good_standing("ethereum", F.SWAP_WALLET))
        self.assertIn("not registered", act(k, F.OP)["reasons"][0])
        F.registered(c, bond=6 * 10 ** 17)
        tx(c, "request_withdrawal", 0, str(2 * 10 ** 17), sender=F.OP, at=F.NOW)
        tx(c, "execute_withdrawal", 0, sender=F.OUT, at=F.NOW + 3600)
        self.assertFalse(k.is_in_good_standing("ethereum", F.SWAP_WALLET))

    def test_unreachable_sentinel_refuses(self):
        c, k = setup()
        stub.CONTRACTS.clear()
        self.assertFalse(k.is_in_good_standing("ethereum", F.SWAP_WALLET))
        self.assertFalse(act(k, F.OP)["carried_out"])

    def test_no_value_no_owner(self):
        import ast
        tree = ast.parse(F.CONSUMER.read_text())
        code = "\n".join(ast.unparse(n) for n in tree.body if not isinstance(n, ast.Expr))
        for needle in ("write.payable", "emit_transfer", "owner", "def set_", "gl.message.value"):
            self.assertNotIn(needle, code)

    def test_no_write_before_revert(self):
        import subprocess, sys
        r = subprocess.run([sys.executable, str(F.ROOT / "tools" / "scan_writes.py"), str(F.CONSUMER)], capture_output=True, text=True)
        self.assertEqual(r.returncode, 0, r.stdout)


if __name__ == "__main__":
    unittest.main()
