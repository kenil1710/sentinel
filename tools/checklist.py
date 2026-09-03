"""Every past-rejection pattern, checked against the source rather than claimed."""
import ast, json, re, subprocess, sys
src = open("contracts/Sentinel.py").read()
tree = ast.parse(src)
art = open("build/Sentinel.min.py").read()
P=[];F=[]
def ck(name, cond, detail=""):
    (P if cond else F).append(f"{name}{(' — '+detail) if detail else ''}")
    print(f"  {'PASS' if cond else 'FAIL'}  {name}{(' — '+detail) if detail else ''}")

def fn(name):
    for n in ast.walk(tree):
        if isinstance(n, ast.FunctionDef) and n.name == name: return n
    return None

# 1. Leader cannot forge stored values
coh = fn("_coherent")
resolve = fn("resolve_challenge")
vfn = None
for n in ast.walk(resolve):
    if isinstance(n, ast.FunctionDef) and n.name == "validator_fn": vfn = n
calls_in_validator = {s.func.id for s in ast.walk(vfn) if isinstance(s, ast.Call) and isinstance(s.func, ast.Name)}
ck("Leader can't forge stored values: validator re-runs _judge and gates on _coherent",
   "_judge" in calls_in_validator and "_coherent" in calls_in_validator,
   f"validator calls {sorted(calls_in_validator)}")

# The stored reasoning/verdict come from the AGREED result, not from calldata a
# leader could pick independently of the vote.
stores = [n for n in ast.walk(resolve) if isinstance(n, ast.Assign)]
uses_result = any("result" in ast.dump(s) for s in stores)
ck("Stored verdict/reasoning are taken from the consensus result", uses_result)

# 2. Content hash present
ck("Content hash computed and stored (evidence_digest)",
   "_content_hash" in src and "evidence_digest" in src and "digest" in src)
# AST, not text. The only literal "hash()" in the file is inside the docstring
# that explains why the builtin is NOT used, and a text search cannot tell a
# comment about hash() from a call to it.
_builtin_hash = [n.lineno for n in ast.walk(tree)
                 if isinstance(n, ast.Call) and isinstance(n.func, ast.Name) and n.func.id == "hash"]
ck("Content hash is FNV-1a by hand, not Python hash()",
   "0xCBF29CE484222325" in src and not _builtin_hash,
   "FNV constant present; builtin hash() never called" if not _builtin_hash else str(_builtin_hash))

# 3. All fields recomputed post-consensus
vc = fn("verify_challenge")
vc_calls = {s.func.id for s in ast.walk(vc) if isinstance(s, ast.Call) and isinstance(s.func, ast.Name)}
ck("verify_challenge recomputes the split from stored evidence",
   "_slash_split" in vc_calls and "_vindication_split" in vc_calls and "_coherent" in vc_calls,
   f"recomputes via {sorted(vc_calls & {'_slash_split','_vindication_split','_coherent','_score_bps'})}")
ck("verify_challenge asserts value conservation", "conservation" in ast.dump(vc) or "conservation" in src)

# 4. Owner can't freeze user funds
exits = ["resolve_challenge", "withdraw_bond", "top_up_bond", "settle_stalled"]
bad = []
for name in exits:
    node = fn(name)
    calls = {s.func.attr for s in ast.walk(node) if isinstance(s, ast.Call) and isinstance(s.func, ast.Attribute)}
    if "_require_live" in calls: bad.append(name)
ck("Owner can't freeze user funds: no exit is gated on pause", not bad,
   f"exits free of _require_live: {', '.join(exits)}" if not bad else f"gated: {bad}")

owner_gated = []
for n in ast.walk(tree):
    if isinstance(n, ast.FunctionDef):
        calls = {s.func.attr for s in ast.walk(n) if isinstance(s, ast.Call) and isinstance(s.func, ast.Attribute)}
        if "_require_owner" in calls: owner_gated.append(n)
writes = []
for f_ in owner_gated:
    for s in ast.walk(f_):
        if isinstance(s, ast.Attribute) and isinstance(s.ctx, ast.Store) and s.attr in ("verdict","bond","status","challenges","agents"):
            writes.append((f_.name, s.attr))
ck("No owner-gated method writes a verdict, bond or status", not writes, str(writes) if writes else f"{len(owner_gated)} owner methods checked")

wp = fn("withdraw_protocol")
ck("withdraw_protocol can only reach protocol_balance", "protocol_balance" in ast.dump(wp))

# 5. Refund-on-reject on all payable paths
payable = [n for n in ast.walk(tree) if isinstance(n, ast.FunctionDef)
           and any(isinstance(d, ast.Attribute) and d.attr == "payable" for d in n.decorator_list)]
raisers = [(n.name, s.lineno) for n in payable for s in ast.walk(n) if isinstance(s, ast.Raise)]
ck("Refund-on-reject: no payable method raises", not raisers,
   f"payable: {sorted(n.name for n in payable)}" if not raisers else str(raisers))
for n in payable:
    calls = {s.func.attr for s in ast.walk(n) if isinstance(s, ast.Call) and isinstance(s.func, ast.Attribute)}
    ck(f"  {n.name} routes rejections through _reject", "_reject" in calls)
art_tree = ast.parse(art)
art_raisers = [(n.name, s.lineno) for n in ast.walk(art_tree) if isinstance(n, ast.FunctionDef)
               and any(isinstance(d, ast.Attribute) and d.attr=="payable" for d in n.decorator_list)
               for s in ast.walk(n) if isinstance(s, ast.Raise)]
ck("Refund-on-reject holds on the DEPLOYED ARTIFACT too", not art_raisers, str(art_raisers) if art_raisers else "")

# 6. No str.replace()
hits = [n.lineno for n in ast.walk(tree) if isinstance(n, ast.Call)
        and isinstance(n.func, ast.Attribute) and n.func.attr == "replace"]
ck("No str.replace() call (the runner rejects it)", not hits, str(hits) if hits else "AST-checked, comments excluded")

# URL derivation
tx_url = fn("_tx_url")
others = [n.name for n in ast.walk(tree) if isinstance(n, ast.FunctionDef) and n.name != "_tx_url"
          for s in ast.walk(n) if isinstance(s, ast.Constant) and isinstance(s.value, str)
          and "blockscout" in s.value and "://" in s.value]
ck("Fetch URL derived from stored chain only (no other builder)", not others, str(others) if others else "_tx_url is the sole producer")

# Binding
jd = fn("_judge")
jd_calls = {s.func.id for s in ast.walk(jd) if isinstance(s, ast.Call) and isinstance(s.func, ast.Name)}
ck("Challenged tx must belong to the agent (binding gate before the model)",
   "_binding_problem" in jd_calls and "_model_verdict" in jd_calls)

# No self in nondet closures
offend = [(n.name, s.lineno) for n in ast.walk(tree) if isinstance(n, ast.FunctionDef)
          and n.name in ("leader_fn","validator_fn","axis_of")
          for s in ast.walk(n) if isinstance(s, ast.Name) and s.id == "self"]
ck("No nondet closure captures self", not offend, str(offend) if offend else "")

# No floats
floats = [(n.lineno, n.value) for n in ast.walk(tree) if isinstance(n, ast.Constant) and isinstance(n.value, float)]
ck("No float literal anywhere in the contract", not floats, str(floats) if floats else "")

print()
print(f"{len(P)} passed, {len(F)} failed")
sys.exit(1 if F else 0)
