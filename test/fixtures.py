"""Builders for the Sentinel offline suite: the contract loaded on the stub
runtime, real Blockscout transaction bodies, addresses for every role, a
transaction runner that proves nothing is written before a revert and that the
ledger balances after every call, and model answers."""
import copy
import json
from pathlib import Path

import stub

ROOT = Path(__file__).resolve().parent.parent
CONTRACT = ROOT / "contracts" / "Sentinel.py"
CONSUMER = ROOT / "contracts" / "SentinelConsumer.py"

stub._install_stub()
C = stub.load_full(CONTRACT, "sentinel")

DOCS = json.load(open(Path(__file__).parent / "fixtures" / "blockscout.json"))["docs"]

GEN = 10 ** 18
STAKE = C.CHALLENGE_STAKE
BOND = GEN


def addr(n):
    return "0x" + ("%040x" % n)


TREASURY = addr(0xD0)
OP = addr(0xA1)
OP2 = addr(0xA2)
W1 = addr(0xB1)
W2 = addr(0xB2)
RES = addr(0xC1)
OUT = addr(0xE1)

# The real WFC swap the v1 probe found: 0x17e3... swaps WETH into WFC through
# Uniswap's UniversalRouter, mined 2026-09-03T07:18:35Z.
SWAP = json.loads(DOCS["uniswap_swap_eth"]["body"])
SWAP_HASH = SWAP["hash"].lower()
SWAP_WALLET = SWAP["from"]["hash"].lower()
SWAP_TS = C._epoch_from_iso(SWAP["timestamp"])
ROUTER = SWAP["to"]["hash"].lower()
WETH = "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2"
WFC = "0x974733a3f37208647577bb925d8ee854c7337e29"

REGISTER_AT = SWAP_TS - 86400            # the agent registered a day before the swap
NOW = SWAP_TS + 600


def iso(epoch):
    days = epoch // 86400
    s = epoch % 86400
    # civil from days (Howard Hinnant)
    z = days + 719468
    era = (z if z >= 0 else z - 146096) // 146097
    doe = z - era * 146097
    yoe = (doe - doe // 1460 + doe // 36524 - doe // 146096) // 365
    y = yoe + era * 400
    doy = doe - (365 * yoe + yoe // 4 - yoe // 100)
    mp = (5 * doy + 2) // 153
    d = doy - (153 * mp + 2) // 5 + 1
    m = mp + 3 if mp < 10 else mp - 9
    y = y + 1 if m <= 2 else y
    return "%04d-%02d-%02dT%02d:%02d:%02dZ" % (y, m, d, s // 3600, (s % 3600) // 60, s % 60)


MANDATE = "\n".join([
    "C1 [MAJOR] Only trade the tokens WETH 0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2 and USDC 0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48.",
    "C2 [MINOR] Never send more than 0.5 ETH of native value in one transaction.",
    "C3 [CRITICAL] Never send funds to an address the operator has not approved in writing.",
])


def tx_url(chain, h):
    return C._tx_url(chain, h)


def put_doc(chain, h, doc, status=200, render_only=False):
    body = doc if isinstance(doc, str) else json.dumps(doc)
    url = tx_url(chain, h)
    if render_only:
        stub.WEB.pages[url] = (403, "<!DOCTYPE html><html><head><title>Just a moment...</title>")
        stub.WEB.pages[url + "#render"] = (status, body)
    else:
        stub.WEB.pages[url] = (status, body)


def swap_doc(**changes):
    d = copy.deepcopy(SWAP)
    for k, v in changes.items():
        d[k] = v
    return d


def fresh_world():
    stub.WEB.reset()
    stub.MODEL.reset()
    stub.FORGE["payload"] = None
    stub.FORGE["mutate"] = None
    stub.TRANSFERS.clear()
    stub.BALANCES.clear()
    stub.MESSAGE.raw = {"datetime": iso(NOW)}
    stub.MESSAGE.sender_address = stub._Addr(TREASURY)
    stub.MESSAGE.value = 0
    put_doc("ethereum", SWAP_HASH, SWAP)


def new_contract(mode="CANONICAL"):
    stub.MESSAGE.sender_address = stub._Addr(TREASURY)
    stub.MESSAGE.value = 0
    c = C.Sentinel(mode)
    for name in C.Sentinel.__annotations__:
        getattr(c, name)
    c.balance = 0
    return c


def snapshot(c):
    return copy.deepcopy(c.__dict__)


class Outcome:
    def __init__(self, ok, value=None, error=None, rolled=False):
        self.ok, self.value, self.error, self.rolled = ok, value, error, rolled

    @property
    def json(self):
        return json.loads(self.value) if isinstance(self.value, str) else self.value

    def __repr__(self):
        return "Outcome(ok=%s, value=%r, error=%r, rolled=%s)" % (self.ok, self.value, self.error, self.rolled)


def ledger(c):
    return json.loads(c.get_ledger())


def check_ledger(c):
    lg = ledger(c)
    assert lg["invariant_holds"], lg
    assert lg["views_match_storage"], lg
    assert int(lg["received"]) == c.balance, (lg, c.balance)
    for v in ("bonds", "open_stakes", "claimable", "claimed"):
        assert int(lg[v]) >= 0, lg
    return lg


def tx(c, method, *args, sender=OUT, value=0, at=None):
    """Run a write like a transaction. The value arrives whatever happens (as on
    chain). On a revert or an unsettled round the state must be exactly what it
    was before - asserted - and the ledger must balance after every call."""
    if at is not None:
        stub.MESSAGE.raw = {"datetime": iso(at) if isinstance(at, int) else at}
    stub.MESSAGE.sender_address = stub._Addr(sender)
    stub.MESSAGE.value = value
    c.balance += value
    before = snapshot(c)
    try:
        v = getattr(c, method)(*args)
        out = Outcome(True, v)
    except stub._UserError as e:
        after = snapshot(c)
        assert after == before, "state changed before a revert in " + method
        out = Outcome(False, error=e.message)
    except stub._Rolled as e:
        after = snapshot(c)
        assert after == before, "state changed before an unsettled round in " + method
        out = Outcome(False, error=str(e), rolled=True)
    finally:
        stub.MESSAGE.value = 0
    if not out.ok and value > 0:
        # A payable revert keeps the value unaccounted for: the suite treats
        # that as a failure of the contract, so it must never happen.
        raise AssertionError("payable method " + method + " reverted while carrying value: " + str(out.error))
    if out.ok:
        check_ledger(c)
    return out


def view(c, method, *args):
    return json.loads(getattr(c, method)(*args))


# --- model answers -------------------------------------------------------------

def breach(clause="C1", severity="MAJOR", quote="Only trade the tokens WETH",
           reasoning="Clause C1 limits trading to WETH and USDC; the record shows WFC token contract 0x9747 moved to the agent."):
    return {"verdict": "BREACH", "breached": [{"clause": clause, "severity": severity, "quote": quote}],
            "reasoning": reasoning}


def compliant(reasoning="Every token moved is WETH or USDC and no native value above the limit was sent, so all clauses hold."):
    return {"verdict": "COMPLIANT", "breached": [], "reasoning": reasoning}


def inconclusive(reasoning="The clauses do not say whether this kind of transaction is allowed, so it cannot be decided."):
    return {"verdict": "INCONCLUSIVE", "breached": [], "reasoning": reasoning}


def answers(judge=None, lint=None):
    """A model that answers judge prompts with `judge` and lint prompts with
    `lint`. Either may be a dict, a list (served in turn), or fn(prompt, n)."""
    seq = {"judge": 0, "lint": 0}

    def pick(spec, kind, prompt, n):
        if callable(spec):
            return spec(prompt, n)
        if isinstance(spec, list):
            i = seq[kind]
            seq[kind] += 1
            return json.loads(json.dumps(spec[i % len(spec)]))
        return json.loads(json.dumps(spec))

    def fn(prompt, n):
        if prompt.startswith("You review the mandate"):
            return pick(lint if lint is not None else {"not_judgeable": []}, "lint", prompt, n)
        return pick(judge if judge is not None else breach(), "judge", prompt, n)
    stub.MODEL.answer = fn


# --- common setups --------------------------------------------------------------

def registered(c, wallet=SWAP_WALLET, chain="ethereum", mandate=MANDATE, table="", bond=BOND,
               operator=OP, at=REGISTER_AT, name="WFC swapper"):
    o = tx(c, "register_agent", wallet, chain, mandate, table, name, "TRADING", "desc", "https://example.org",
           sender=operator, value=bond, at=at)
    assert o.ok and o.json["ok"], o
    return o.json["agent_id"]


def filed(c, aid=0, h=SWAP_HASH, ts=SWAP_TS, clause="C1", sender=W1, at=NOW,
          reason="The agent swapped into WFC, which is not WETH or USDC"):
    o = tx(c, "challenge_agent", aid, h, ts, clause, reason, sender=sender, value=STAKE, at=at)
    assert o.ok and o.json["ok"], o
    return o.json["challenge_id"]


def ruled(c, judge=None, cid=0, at=NOW + 60):
    answers(judge=judge if judge is not None else breach())
    o = tx(c, "resolve_challenge", cid, sender=RES, at=at)
    assert o.ok, o
    return o.json
