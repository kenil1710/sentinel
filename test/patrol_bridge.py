"""Drives the contract on the stub runtime for test/test_patrol.mjs, so the
patrol's learning tests run end to end: the bot computes a transaction kind in
TypeScript, the contract (Python) decides whether a precedent covers it.

    python3 -c "import patrol_bridge as B; w = B.World(); ...; B.out(...)"
"""
import json

import fixtures as F
from fixtures import tx, view

HOUR = 3600


class World:
    def __init__(self, mandate=F.MANDATE, table=""):
        F.fresh_world()
        self.c = F.new_contract()
        self.t = F.NOW
        self.n = 0
        o = tx(self.c, "register_agent", F.SWAP_WALLET, "ethereum", mandate, table, "n", "TRADING", "d", "",
               sender=F.OP, value=10 * F.GEN, at=F.REGISTER_AT)
        assert o.ok and o.json["ok"], o

    def judged(self, doc, clause="C1", judge="compliant", final=True, serve=True,
               reason="The agent moved a token the clause does not list"):
        """File, rule and (optionally) finalize a challenge on `doc`."""
        h = doc["hash"].lower()
        if serve:
            F.put_doc("ethereum", h, doc)
        ts = F.C._epoch_from_iso(doc["timestamp"])
        self.n += 1
        self.t += 3 * HOUR
        o = tx(self.c, "challenge_agent", 0, h, ts, clause, reason, sender=F.addr(0xD000 + self.n),
               value=F.STAKE, at=self.t)
        if not o.json["ok"]:
            return {"filed": False, "reason": o.json["reason"]}
        cid = o.json["challenge_id"]
        answer = {"compliant": F.compliant(), "inconclusive": F.inconclusive(), "breach": F.breach()}[judge]
        F.answers(judge=answer)
        tx(self.c, "resolve_challenge", cid, sender=F.RES, at=self.t + 60)
        if final and view(self.c, "get_challenge", cid)["status"] == "CONTESTABLE":
            tx(self.c, "finalize", cid, sender=F.RES, at=self.t + 61 + HOUR)
        self.t += 2 * HOUR
        return {"filed": True, "challenge": view(self.c, "get_challenge", cid)}

    def update(self, mandate, table=""):
        o = tx(self.c, "update_mandate", 0, mandate, table, sender=F.OP, at=self.t)
        assert o.ok, o
        self.t += HOUR + 1
        return o.json

    def query(self, clause, kind, ts):
        return view(self.c, "precedent_for", 0, clause, kind, ts)

    def precedents(self):
        return view(self.c, "get_precedents", -1)["precedents"]


def out(value):
    print(json.dumps(value))
