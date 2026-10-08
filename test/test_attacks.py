"""Attack round 1 against Sentinel v2.0.0 as deployed (commit 1830a34), written
before any fix. Each test states the attack; on v2.0.0 every test here FAILS.

    cd test && python3 -m unittest -q test_attacks
"""
import json
import unittest

import fixtures as F
import stub
from fixtures import C, tx, view

OP, OP2, W1, W2, RES, OUT = F.OP, F.OP2, F.W1, F.W2, F.RES, F.OUT
HOUR = 3600


def world():
    F.fresh_world()
    return F.new_contract()


class A1_StallImmunisesTransaction(unittest.TestCase):
    """MEDIUM. A challenge that no panel settles before its deadline is refunded
    by settle_stalled - and its transaction stays claimed for ever. A friend of
    the operator files first on the agent's real breach with an accusation built
    to split the panel (or simply on a chain whose explorer is flaky), lets it
    stall, gets the stake back, and nobody can ever challenge that transaction.
    A stalled challenge decided nothing, so it must not retire the transaction."""

    def test_stalled_challenge_releases_its_transaction(self):
        c = world()
        F.registered(c)
        F.filed(c, sender=OUT)
        tx(c, "settle_stalled", 0, sender=OUT, at=F.NOW + 86401)
        self.assertFalse(view(c, "is_tx_challenged", "ethereum", F.SWAP_HASH, 0)["challenged"])
        o = tx(c, "challenge_agent", 0, F.SWAP_HASH, F.SWAP_TS, "C1", "a real accusation after the stall",
               sender=W1, value=F.STAKE, at=F.NOW + 86500)
        self.assertTrue(o.json["ok"], o.json)


class A2_ReregistrationLaundersTheRecord(unittest.TestCase):
    """MEDIUM. An operator whose agent has a final CRITICAL breach unregisters,
    waits the timelock, and registers the same wallet again: get_standing_by_wallet,
    /api/check and the badge then read the fresh agent - good standing, clean
    record - and the repeat multiplier starts again from 1."""

    def laundered(self):
        c = world()
        F.registered(c)
        F.filed(c, clause="C3")
        F.ruled(c, judge=F.breach(clause="C3", severity="CRITICAL", quote="Never send funds to an address"))
        tx(c, "finalize", 0, sender=RES, at=F.NOW + 2 * HOUR)
        tx(c, "unregister", 0, sender=OP, at=F.NOW + 3 * HOUR)
        tx(c, "finalize_unregister", 0, sender=OUT, at=F.NOW + 5 * HOUR)
        F.registered(c, operator=OP, at=F.NOW + 6 * HOUR)
        return c

    def test_standing_by_wallet_remembers_previous_registrations(self):
        c = self.laundered()
        s = view(c, "get_standing_by_wallet", "ethereum", F.SWAP_WALLET)
        self.assertFalse(s["good_standing"], s)
        self.assertTrue(any("previous registration" in r for r in s["reasons"]), s)

    def test_repeat_multiplier_counts_previous_registrations(self):
        c = self.laundered()
        h2 = "0x" + "7" * 64
        F.put_doc("ethereum", h2, F.swap_doc(hash=h2))
        o = tx(c, "challenge_agent", 1, h2, F.NOW + 6 * HOUR + 10, "C1", "breach after re-registering",
               sender=W1, value=F.STAKE, at=F.NOW + 7 * HOUR)
        self.assertTrue(o.json["ok"], o.json)
        self.assertEqual(view(c, "get_challenge", 1)["snapshot"]["prior_breaches"], 1)


class A3_PrecedentIgnoresDirection(unittest.TestCase):
    """MEDIUM. The transaction kind a precedent covers lists the tokens moved but
    not which way. A friend files a weak challenge on a deposit the agent merely
    RECEIVED (token X in) and loses; the precedent then covers the agent SENDING
    token X through the same contract and selector, so the patrol stops looking
    at exactly the breach an "only send USDT" clause exists to catch."""

    def test_kind_distinguishes_sent_from_received(self):
        recv = F.swap_doc()
        sent = json.loads(json.dumps(recv))
        for t in sent["token_transfers"]:
            t["from"], t["to"] = t["to"], t["from"]
        w = F.SWAP_WALLET
        self.assertNotEqual(C._tx_kind(C._core(recv), w), C._tx_kind(C._core(sent), w))


class A4_LeaderWritesTheEvidence(unittest.TestCase):
    """MEDIUM. The transaction record stored on a ruling - shown to everyone as
    "the record the panel read" - is the leader's text and no validator checks
    it. A dishonest leader that agrees on the verdict can store a fabricated
    record (different amounts, a different token) beside a real ruling."""

    def test_forged_evidence_is_rejected(self):
        c = world()
        F.registered(c)
        F.filed(c)
        F.answers(judge=F.breach())
        stub.FORGE["mutate"] = lambda r: dict(r, evidence=r["evidence"].replace("WFC", "USDC"))
        o = tx(c, "resolve_challenge", 0, sender=RES, at=F.NOW + 60)
        self.assertTrue(o.rolled, "a forged record was stored")


class A5_ContestedRulingTeachesThePatrol(unittest.TestCase):
    """LOW. A COMPLIANT ruling the challenger appealed, but that no panel got to
    before the appeal deadline, still becomes a precedent: the bot learns from a
    ruling that was disputed and never re-examined."""

    def test_expired_appeal_creates_no_precedent(self):
        c = world()
        F.registered(c)
        F.filed(c)
        F.ruled(c, judge=F.compliant())
        tx(c, "appeal", 0, "Counter-evidence: a completely different argument about the WFC leg of the swap and its pool.",
           sender=W1, value=F.STAKE, at=F.NOW + 100)
        tx(c, "expire_appeal", 0, sender=OUT, at=F.NOW + 100 + 86401)
        self.assertEqual(view(c, "get_precedents", -1)["precedents"], [])


if __name__ == "__main__":
    unittest.main()
