"""Attack round 2, aimed only at the round-1 fixes in v2.0.1 (commit 43aeabb),
written before any fix. On v2.0.1 every test here FAILS.

    cd test && python3 -m unittest -q test_attacks_r2
"""
import unittest

import fixtures as F
from fixtures import tx, view

OP, OP2, W1, W2, RES, OUT = F.OP, F.OP2, F.W1, F.W2, F.RES, F.OUT
HOUR = 3600
ATTACKER = F.addr(0xBAD)


def poisoned():
    """A stranger registers a wallet it does not run under a mandate the wallet
    is sure to break, has a friend prove a CRITICAL breach (losing half its own
    bond to the treasury), and unregisters. Then the wallet's real operator
    registers it under an honest mandate."""
    F.fresh_world()
    c = F.new_contract()
    F.registered(c, operator=ATTACKER)
    F.filed(c, clause="C3", sender=W2)
    F.ruled(c, judge=F.breach(clause="C3", severity="CRITICAL", quote="Never send funds to an address"))
    tx(c, "finalize", 0, sender=RES, at=F.NOW + 2 * HOUR)
    tx(c, "unregister", 0, sender=ATTACKER, at=F.NOW + 3 * HOUR)
    tx(c, "finalize_unregister", 0, sender=OUT, at=F.NOW + 5 * HOUR)
    F.registered(c, operator=OP, at=F.NOW + 6 * HOUR)
    return c


class B1_StrangerPoisonsAWallet(unittest.TestCase):
    """MEDIUM, introduced by the A2 fix. Registration does not prove control of a
    wallet, so counting EVERY earlier registration lets anyone frame a wallet:
    the real operator's agent is born out of good standing, and its first breach
    is slashed with a repeat multiplier it never earned."""

    def test_real_operator_not_framed_out_of_good_standing(self):
        c = poisoned()
        s = view(c, "get_standing", 1)
        self.assertTrue(s["good_standing"], s)

    def test_real_operator_not_charged_a_multiplier_it_never_earned(self):
        c = poisoned()
        h2 = "0x" + "8" * 64
        F.put_doc("ethereum", h2, F.swap_doc(hash=h2))
        o = tx(c, "challenge_agent", 1, h2, F.NOW + 6 * HOUR + 10, "C1", "an ordinary accusation later on",
               sender=W1, value=F.STAKE, at=F.NOW + 7 * HOUR)
        self.assertTrue(o.json["ok"], o.json)
        self.assertEqual(view(c, "get_challenge", 1)["snapshot"]["multiplier_bps"], 10000)

    def test_history_still_shown(self):
        c = poisoned()
        prev = view(c, "get_agent", 1)["previous_registrations"]
        self.assertEqual([p["agent_id"] for p in prev], [0])
        self.assertFalse(prev[0]["same_operator"])


class B2_LaunderingStillCaught(unittest.TestCase):
    """The A2 protection must survive the B1 fix: the SAME operator who
    re-registers its own wallet keeps its record."""

    def test_same_operator_keeps_its_record(self):
        F.fresh_world()
        c = F.new_contract()
        F.registered(c)
        F.filed(c, clause="C3")
        F.ruled(c, judge=F.breach(clause="C3", severity="CRITICAL", quote="Never send funds to an address"))
        tx(c, "finalize", 0, sender=RES, at=F.NOW + 2 * HOUR)
        tx(c, "unregister", 0, sender=OP, at=F.NOW + 3 * HOUR)
        tx(c, "finalize_unregister", 0, sender=OUT, at=F.NOW + 5 * HOUR)
        F.registered(c, operator=OP, at=F.NOW + 6 * HOUR)
        s = view(c, "get_standing", 1)
        self.assertFalse(s["good_standing"])
        self.assertTrue(view(c, "get_agent", 1)["previous_registrations"][0]["same_operator"])


if __name__ == "__main__":
    unittest.main()
