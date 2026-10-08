# v0.3.0
# { "Depends": "py-genlayer:5jycge4q8k23462jtb0b9fyey1s9qz928sz2nbrd9mg4sxqg2qng" }
import genlayer as gl
from genlayer import *
import json


class Probe(gl.contract.Contract):
    n: u32
    got: u256
    note: str
    fetched: str

    def __init__(self):
        self.note = "init"

    @gl.public.write.payable
    def deposit(self) -> str:
        self.got = u256(int(self.got) + int(gl.message.value))
        return json.dumps({"value": str(int(gl.message.value)), "balance": str(int(self.balance))})

    @gl.public.view
    def bal(self) -> str:
        return json.dumps({"balance": str(int(self.balance)), "got": str(int(self.got)), "n": int(self.n),
                           "note": self.note, "fetched": self.fetched[:3000]})

    @gl.public.write
    def disagree(self) -> None:
        self.n = u32(int(self.n) + 1)

        def leader():
            return "x"

        def val(r):
            return False
        gl.vm.run_nondet(leader, val)
        self.note = "written-after-disagree"

    @gl.public.write
    def cross(self, addr: str) -> None:
        r = gl.contract.get_at(Address(addr)).view().get_stats()
        self.note = "cross:" + str(r)[:300]

    @gl.public.write
    def pay(self, to: str, amt: int) -> None:
        gl.chain.Account(Address(to)).emit_transfer(u256(int(amt)))
        self.note = "paid " + str(amt)

    @gl.public.write
    def fetch(self, urls: list) -> None:
        us = [str(u) for u in urls]

        def leader():
            out = []
            for u in us:
                try:
                    r = gl.nondet.web.request(u, method="GET")
                    b = r.body.decode("utf-8", errors="ignore") if isinstance(r.body, bytes) else str(r.body)
                    out.append([u[8:40], int(getattr(r, "status", 0) or 0), len(b), b[:120]])
                except Exception as e:
                    out.append([u[8:40], -1, 0, str(e)[:200]])
            return out

        def val(r):
            return True
        self.fetched = json.dumps(gl.vm.run_nondet(leader, val))

    @gl.public.write
    def render(self, url: str) -> None:
        u = str(url)

        def leader():
            try:
                return str(gl.nondet.web.render(u, mode="text"))[:300]
            except Exception as e:
                return "ERR " + str(e)[:300]

        def val(r):
            return True
        self.fetched = gl.vm.run_nondet(leader, val)
