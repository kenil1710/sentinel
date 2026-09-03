# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }

# Throwaway diagnostic, not part of Sentinel. It answers the question the whole
# project rests on before a line of the contract is written:
#
#   Can a GenLayer validator fetch a WALLET'S TRANSACTION LIST from Blockscout,
#   and does the row shape carry enough to judge a plain-English mandate?
#
# TokenScope proved /api/v2/tokens/{a} and /api/v2/addresses/{a} answer from
# validator egress on all four chains. What is NOT established is
# /api/v2/addresses/{a}/transactions — a different endpoint, a different row
# shape, and the one Sentinel's entire patrol loop reads.
#
# TokenScope also measured that Blockscout REJECTS unknown query parameters
# with a 422 (`?type=ERC-20` -> "Unexpected field: type"). The brief asks for
# `?limit=5`. That is probed both ways deliberately: if `limit` is unexpected,
# every patrol fetch would 422 and the project would silently have no data.
#
# Line 1 must stay the runner pin. A comment above it makes the contract
# undeployable and the only error reported is `invalid_contract`.

from genlayer import *

import json


def _status(res) -> int:
    s = getattr(res, "status_code", None)
    if s is None:
        s = getattr(res, "status", None)
    if s is None:
        return 0
    return int(s)


def _body(res) -> str:
    b = getattr(res, "body", None)
    if b is None:
        b = getattr(res, "text", None)
    if b is None:
        return ""
    if isinstance(b, bytes):
        return b.decode("utf-8", errors="ignore")
    return str(b)


def _fetch(url: str) -> tuple:
    try:
        res = gl.nondet.web.request(url, method="GET")
    except AttributeError:
        res = gl.nondet.web.get(url)
    return _status(res), _body(res)


def _describe(d) -> dict:
    out = {}
    if not isinstance(d, dict):
        return {"_type": type(d).__name__}
    for k in sorted(d.keys()):
        v = d[k]
        if isinstance(v, dict):
            out[str(k)] = "dict{" + ",".join(sorted([str(x) for x in v.keys()])[:16]) + "}"
        elif isinstance(v, list):
            out[str(k)] = "list[" + str(len(v)) + "]"
        else:
            out[str(k)] = str(type(v).__name__) + "=" + str(v)[:100]
    return out


def _addr_node(o) -> dict:
    o = o if isinstance(o, dict) else {}
    md = o.get("metadata") or {}
    tags = md.get("tags") or []
    names = []
    for t in tags:
        if isinstance(t, dict):
            n = t.get("name")
            if n is not None:
                names.append(str(n))
    names.sort()
    return {"hash": str(o.get("hash") or "").lower(), "name": o.get("name"),
            "is_contract": o.get("is_contract"), "is_verified": o.get("is_verified"),
            "is_scam": o.get("is_scam"), "tags": names}


def _project(d: dict) -> dict:
    """The STABLE subset of a Blockscout transaction document.

    Measured: `confirmations`, `exchange_rate`, `has_error_in_internal_transactions`
    and the nested `token.holders_count` / `token.total_supply` all move between
    two fetches seconds apart. None of them can judge a mandate, and every one of
    them would make two validators disagree. They are excluded here."""
    tr = []
    for t in (d.get("token_transfers") or []):
        if not isinstance(t, dict):
            continue
        tok = t.get("token") or {}
        tot = t.get("total") or {}
        tr.append({"sym": tok.get("symbol"),
                   "addr": str(tok.get("address_hash") or "").lower(),
                   "dec": tot.get("decimals"), "val": tot.get("value"),
                   "type": t.get("type"),
                   "from": str((t.get("from") or {}).get("hash") or "").lower(),
                   "to": str((t.get("to") or {}).get("hash") or "").lower()})
    di = d.get("decoded_input") or {}
    return {"hash": str(d.get("hash") or "").lower(), "status": d.get("status"),
            "result": d.get("result"), "value": str(d.get("value")),
            "method": d.get("method"), "block_number": d.get("block_number"),
            "timestamp": d.get("timestamp"), "nonce": d.get("nonce"),
            "gas_used": str(d.get("gas_used")),
            "method_call": di.get("method_call"),
            "from": _addr_node(d.get("from")), "to": _addr_node(d.get("to")),
            "transfers": tr}


def _fnv(s: str) -> str:
    """FNV-1a by hand. Python's hash() is seeded per process, so it cannot be
    compared across validators."""
    h = 0xcbf29ce484222325
    for ch in s:
        h = (h ^ (ord(ch) & 0xFF)) & 0xFFFFFFFFFFFFFFFF
        h = (h * 0x100000001b3) & 0xFFFFFFFFFFFFFFFF
    return format(h, "016x")


class RenderProbe(gl.Contract):
    text: str
    text_len: u32
    statuses: str

    def __init__(self):
        self.text = ""
        self.text_len = u32(0)
        self.statuses = ""

    @gl.public.write
    def probe_statuses(self, urls: list) -> None:
        """HTTP status + body length for each plain GET, one transaction.

        Distinguishes 'blocked' from 'empty': a 403 is an egress block, a 422 is
        a rejected query parameter, and a 200 with a 40-byte body is an endpoint
        that exists and says nothing. Those call for three different pivots."""
        targets = [str(u) for u in urls][:12]

        def leader_fn() -> dict:
            found = {}
            for u in targets:
                try:
                    st, body = _fetch(u)
                    found[u] = {"status": st, "len": len(body), "head": body[:220]}
                except Exception as e:
                    found[u] = {"status": -1, "len": -1, "err": str(e)[:220]}
            return found

        def validator_fn(leader_result: gl.vm.Result) -> bool:
            # Shape only. A validator that re-fetched would disagree on every
            # live transaction list, and the probe would never commit — which is
            # the whole reason Sentinel agrees on a verdict, not on bytes.
            return isinstance(leader_result, gl.vm.Return)

        self.statuses = json.dumps(gl.vm.run_nondet(leader_fn, validator_fn))

    @gl.public.write
    def probe_keys(self, url: str) -> None:
        """The document's SHAPE, not its bytes: top-level keys with type and a
        sample of each, plus the same for the first two rows of the list it
        carries. A 60 KB page read 200 characters at a time takes a dozen
        transactions to understand; its key list takes one."""

        def leader_fn() -> dict:
            st, body = _fetch(url)
            try:
                doc = json.loads(body)
            except ValueError:
                return {"status": st, "len": len(body), "err": "unparseable",
                        "head": body[:400]}
            info = {"status": st, "len": len(body)}
            if isinstance(doc, dict):
                info["top"] = _describe(doc)
                rows = doc.get("items")
                if isinstance(rows, list) and len(rows) > 0:
                    info["list_len"] = len(rows)
                    info["item0"] = _describe(rows[0])
                    if len(rows) > 1:
                        info["item1"] = _describe(rows[1])
            elif isinstance(doc, list):
                info["top"] = "list[" + str(len(doc)) + "]"
                if len(doc) > 0:
                    info["item0"] = _describe(doc[0])
            return info

        def validator_fn(leader_result: gl.vm.Result) -> bool:
            return isinstance(leader_result, gl.vm.Return)

        self.statuses = json.dumps(gl.vm.run_nondet(leader_fn, validator_fn))

    @gl.public.write
    def probe_nested(self, url: str, path: str) -> None:
        """Walk into a row and describe a NESTED object. The interesting parts
        of a transaction row (`to`, `from`, `decoded_input`, `token_transfers`)
        are dicts, and `_describe` flattens them to 'dict{...}' one level up.

        path is like `items.0.to` or `items.0.decoded_input`."""
        steps = [s for s in str(path).split(".") if s != ""]

        def leader_fn() -> dict:
            st, body = _fetch(url)
            try:
                doc = json.loads(body)
            except ValueError:
                return {"status": st, "err": "unparseable", "head": body[:300]}
            cur = doc
            for s in steps:
                if isinstance(cur, list):
                    try:
                        cur = cur[int(s)]
                    except (ValueError, IndexError):
                        return {"status": st, "err": "no index " + s}
                elif isinstance(cur, dict):
                    if s not in cur:
                        return {"status": st, "err": "no key " + s,
                                "have": sorted([str(k) for k in cur.keys()])}
                    cur = cur[s]
                else:
                    return {"status": st, "err": "leaf at " + s,
                            "value": str(cur)[:200]}
            if isinstance(cur, dict):
                return {"status": st, "node": _describe(cur)}
            if isinstance(cur, list):
                out = {"status": st, "len": len(cur)}
                if len(cur) > 0 and isinstance(cur[0], dict):
                    out["item0"] = _describe(cur[0])
                elif len(cur) > 0:
                    out["item0"] = str(cur[0])[:200]
                return out
            return {"status": st, "value": str(cur)[:400]}

        def validator_fn(leader_result: gl.vm.Result) -> bool:
            return isinstance(leader_result, gl.vm.Return)

        self.statuses = json.dumps(gl.vm.run_nondet(leader_fn, validator_fn))

    @gl.public.write
    def probe_get(self, url: str, start: int, count: int) -> None:
        """Raw GET, keeping a window of the body — for when the shape is not
        enough and the actual bytes matter."""
        begin = int(start)
        span = int(count)
        if span <= 0 or span > 12000:
            span = 12000

        def leader_fn() -> dict:
            st, body = _fetch(url)
            return {"len": len(body), "status": st,
                    "window": body[begin:begin + span]}

        def validator_fn(leader_result: gl.vm.Result) -> bool:
            return isinstance(leader_result, gl.vm.Return)

        out = gl.vm.run_nondet(leader_fn, validator_fn)
        self.text_len = u32(int(out["len"]))
        self.text = str(out["window"])

    @gl.public.write
    def probe_projection(self, url: str) -> None:
        """THE consensus question, asked directly.

        Every validator RE-FETCHES the url, projects it to the stable subset and
        compares the hash of that projection. If this transaction commits, five
        independent nodes fetching Blockscout seconds apart agreed on the same
        view of one transaction — which is the entire premise Sentinel rests on.

        If it lands UNDETERMINED, the projection is still too wide and the
        contract must narrow it before a single line of it is written."""

        def leader_fn() -> dict:
            st, body = _fetch(url)
            if st >= 500 or st == 0:
                return {"status": st, "transient": True}
            try:
                doc = json.loads(body)
            except ValueError:
                return {"status": st, "err": "unparseable"}
            proj = _project(doc)
            return {"status": st, "digest": _fnv(json.dumps(proj, sort_keys=True,
                                                            separators=(",", ":"))),
                    "raw_len": len(body),
                    "proj_len": len(json.dumps(proj, separators=(",", ":")))}

        def validator_fn(leader_result: gl.vm.Result) -> bool:
            if not isinstance(leader_result, gl.vm.Return):
                return False
            mine = leader_fn()
            theirs = leader_result.calldata
            if not isinstance(theirs, dict):
                return False
            if mine.get("transient") or theirs.get("transient"):
                return bool(mine.get("transient")) == bool(theirs.get("transient"))
            return str(mine.get("digest")) == str(theirs.get("digest"))

        self.statuses = json.dumps(gl.vm.run_nondet(leader_fn, validator_fn))

    @gl.public.view
    def get_statuses(self) -> str:
        return str(self.statuses)

    @gl.public.view
    def get_len(self) -> int:
        return int(self.text_len)

    @gl.public.view
    def get_slice(self, start: int, count: int) -> str:
        s = str(self.text)
        a = int(start)
        n = int(count)
        if a < 0:
            a = 0
        if n <= 0 or n > 4000:
            n = 4000
        return s[a:a + n]
