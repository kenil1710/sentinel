# v0.3.0
# { "Depends": "py-genlayer:5jycge4q8k23462jtb0b9fyey1s9qz928sz2nbrd9mg4sxqg2qng" }
import genlayer as gl
from genlayer import *
from dataclasses import dataclass
import json

# SentinelConsumer - what another contract does with Sentinel's register.
#
#   is_in_good_standing(chain, wallet) -> bool     any contract, free, by view
#   act_for_agent(chain, wallet, instruction)       a demo gate: it carries out
#       an instruction only for the agent's own operator, and only while
#       Sentinel says the agent is in good standing. Every request is logged,
#       carried out or refused, with the reasons Sentinel gave.
#
# Good standing is Sentinel's definition (get_standing): ACTIVE, bond at or
# above the minimum, no final CRITICAL breach, and no provisional BREACH ruling
# still open. This contract judges nothing itself and holds no value: no
# payable method, no transfer, no owner, no setter. The Sentinel address is
# fixed at deployment.

MAX_INSTRUCTION = 200
MAX_PAGE = 100


def _norm_wallet(value) -> str:
	s = str(value).strip().lower()
	if len(s) != 42 or s[:2] != "0x":
		return ""
	for ch in s[2:]:
		if ch not in "0123456789abcdef":
			return ""
	return s


@gl.storage.allow
@dataclass
class Request:
	request_id: u32
	sender: str
	chain: str
	wallet: str
	agent_id: i64
	instruction: str
	carried_out: bool
	reasons: str
	at: str


class SentinelConsumer(gl.contract.Contract):
	sentinel: Address
	requests: gl.storage.TreeMap[u32, Request]
	next_request: u32
	carried_out: u32
	refused: u32

	def __init__(self, sentinel_address: str):
		w = _norm_wallet(sentinel_address)
		if not w:
			raise gl.vm.UserError("sentinel_address must be a 0x address")
		self.sentinel = Address(w)

	def _standing(self, chain: str, wallet: str) -> dict:
		try:
			raw = gl.contract.get_at(self.sentinel).view().get_standing_by_wallet(str(chain), str(wallet))
			got = json.loads(raw) if isinstance(raw, str) else raw
		except Exception:
			return {"reachable": False, "found": False, "good_standing": False,
				"reasons": ["Sentinel could not be read"]}
		if not isinstance(got, dict):
			return {"reachable": False, "found": False, "good_standing": False,
				"reasons": ["Sentinel returned nothing usable"]}
		got["reachable"] = True
		return got

	@gl.public.view
	def source(self) -> str:
		return self.sentinel.as_hex.lower()

	@gl.public.view
	def is_in_good_standing(self, chain: str, wallet: str) -> bool:
		s = self._standing(chain, wallet)
		return bool(s.get("reachable")) and bool(s.get("found")) and bool(s.get("good_standing"))

	@gl.public.view
	def standing(self, chain: str, wallet: str) -> str:
		return json.dumps(self._standing(chain, wallet))

	@gl.public.write
	def act_for_agent(self, chain: str, wallet: str, instruction: str) -> str:
		"""Carry out `instruction` for an agent, or refuse and say why. Either
		way the request is logged; nothing is written before Sentinel has been
		read, and nothing after this method can revert."""
		sender = gl.message.sender_address.as_hex.lower()
		s = self._standing(chain, wallet)
		reasons = [str(r) for r in (s.get("reasons") or [])]
		if bool(s.get("found")) and str(s.get("operator", "")).lower() != sender:
			reasons.append("only the agent's operator may ask this contract to act for it")
		ok = bool(s.get("reachable")) and bool(s.get("found")) and bool(s.get("good_standing")) and len(reasons) == 0
		rid = int(self.next_request)
		self.next_request = u32(rid + 1)
		self.requests[u32(rid)] = Request(
			request_id=u32(rid), sender=sender, chain=str(chain).strip().lower()[:20],
			wallet=_norm_wallet(wallet), agent_id=i64(int(s.get("agent_id", -1)) if s.get("found") else -1),
			instruction=" ".join(str(instruction).split())[:MAX_INSTRUCTION], carried_out=ok,
			reasons=json.dumps(reasons), at=str(gl.message.raw.get("datetime", "")))
		if ok:
			self.carried_out = u32(int(self.carried_out) + 1)
		else:
			self.refused = u32(int(self.refused) + 1)
		return json.dumps({"ok": ok, "request_id": rid, "carried_out": ok, "reasons": reasons})

	@gl.public.view
	def get_requests(self, count: int) -> str:
		n = int(self.next_request)
		limit = max(1, min(int(count), MAX_PAGE))
		out = []
		for rid in range(n - 1, max(-1, n - 1 - limit), -1):
			r = self.requests.get(u32(rid))
			if r is None:
				continue
			out.append({"request_id": int(r.request_id), "sender": str(r.sender), "chain": str(r.chain),
				"wallet": str(r.wallet), "agent_id": int(r.agent_id), "instruction": str(r.instruction),
				"carried_out": bool(r.carried_out), "reasons": json.loads(str(r.reasons)), "at": str(r.at)})
		return json.dumps({"sentinel": self.sentinel.as_hex.lower(), "total": n,
			"carried_out": int(self.carried_out), "refused": int(self.refused), "requests": out})
