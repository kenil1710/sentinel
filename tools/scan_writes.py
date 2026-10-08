"""No state written before any check that can revert.

For every @gl.public.write method of a contract, walk its statements in source
order (nested defs - the nondet leader / validator - are skipped: they never
write storage) and record

  * writes:  assignments / aug-assignments / deletes whose target is rooted at
             `self` or at a local alias of storage (x = self.<...>), calls of
             append / pop / get_or_insert_default on such a root, and calls to
             the private helpers that write (_credit, _finalize, ...);
  * reverts: `raise`, calls to the private helpers that may raise (_agent,
             _challenge), and every consensus round (gl.vm.run_nondet,
             self._run_judge): a round the validators do not settle commits
             nothing, exactly like a revert.

A method passes if no revert appears after its first write. Payable methods
must also contain no revert at all (a revert keeps the value unaccounted for).

   python3 tools/scan_writes.py [path] [ClassName]   (exit 1 on any violation)
"""
import ast
import sys
from pathlib import Path

SRC = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(__file__).resolve().parent.parent / "contracts" / "Sentinel.py"
CLASS = sys.argv[2] if len(sys.argv) > 2 else None
RAISING_HELPERS = {"_agent", "_challenge", "_run_judge"}
WRITING_HELPERS = {"_credit", "_finalize", "_receive", "_refuse", "_live_add", "_live_remove", "_touch_watcher",
                   "_new_version", "_maybe_precedent", "_veto", "_set_bond", "_record"}
MUTATORS = {"append", "pop", "get_or_insert_default", "append_new_get"}


def decorators(f):
    return [ast.unparse(d) for d in f.decorator_list]


def is_write(f):
    return any(d.startswith("gl.public.write") for d in decorators(f))


def is_payable(f):
    return any(d == "gl.public.write.payable" for d in decorators(f))


def root(node):
    while isinstance(node, (ast.Attribute, ast.Subscript, ast.Call)):
        node = node.func if isinstance(node, ast.Call) else node.value
    return node.id if isinstance(node, ast.Name) else ""


def scan(f):
    aliases = {"self"}
    events = []

    def classify_call(n):
        fn = n.func
        if isinstance(fn, ast.Attribute):
            if isinstance(fn.value, ast.Name) and fn.value.id == "self":
                if fn.attr in RAISING_HELPERS:
                    events.append(("revert", n.lineno, "self." + fn.attr + "()"))
                if fn.attr in WRITING_HELPERS:
                    events.append(("write", n.lineno, "self." + fn.attr + "()"))
            if fn.attr in MUTATORS and root(fn.value) in aliases:
                events.append(("write", n.lineno, ast.unparse(fn)[:60]))
            if ast.unparse(fn) in ("gl.vm.run_nondet", "gl.vm.run_nondet_unsafe"):
                events.append(("revert", n.lineno, "consensus round"))

    def visit(stmts):
        for s in stmts:
            if isinstance(s, (ast.FunctionDef, ast.AsyncFunctionDef, ast.Lambda)):
                continue
            if isinstance(s, ast.Assign) and len(s.targets) == 1 and isinstance(s.targets[0], ast.Name):
                src = ast.unparse(s.value)
                if src.startswith("self.") and not src.startswith("self._now") and not src.startswith("self._sender"):
                    aliases.add(s.targets[0].id)
            if isinstance(s, ast.Assign) and len(s.targets) == 1 and isinstance(s.targets[0], ast.Tuple):
                src = ast.unparse(s.value)
                if src.startswith("self."):
                    for e in s.targets[0].elts:
                        if isinstance(e, ast.Name):
                            aliases.add(e.id)
            compound = isinstance(s, (ast.If, ast.For, ast.While, ast.Try, ast.With))
            nodes = [] if compound else list(ast.walk(s))
            if isinstance(s, (ast.If, ast.While)):
                nodes = list(ast.walk(s.test))
            if isinstance(s, ast.For):
                nodes = list(ast.walk(s.iter))
            for n in nodes:
                if isinstance(n, (ast.FunctionDef, ast.Lambda)):
                    continue
                if isinstance(n, ast.Raise):
                    events.append(("revert", n.lineno, "raise"))
                elif isinstance(n, ast.Call):
                    classify_call(n)
                elif isinstance(n, (ast.Assign, ast.AugAssign, ast.Delete)):
                    targets = n.targets if isinstance(n, (ast.Assign, ast.Delete)) else [n.target]
                    for t in targets:
                        if isinstance(t, (ast.Attribute, ast.Subscript)) and root(t) in aliases:
                            events.append(("write", n.lineno, ast.unparse(t)[:60]))
            if isinstance(s, (ast.If, ast.For, ast.While)):
                visit(s.body)
                visit(s.orelse)
            elif isinstance(s, ast.Try):
                visit(s.body)
                for h in s.handlers:
                    visit(h.body)
                visit(s.orelse)
                visit(s.finalbody)
            elif isinstance(s, ast.With):
                visit(s.body)

    visit(f.body)
    events.sort(key=lambda e: e[1])
    first_write = next((e for e in events if e[0] == "write"), None)
    late = [e for e in events if e[0] == "revert" and first_write and e[1] > first_write[1]]
    return events, first_write, late


def run(path=SRC, cls_name=CLASS, out=sys.stdout):
    tree = ast.parse(Path(path).read_text())
    classes = [n for n in tree.body if isinstance(n, ast.ClassDef) and
               any(ast.unparse(b) == "gl.contract.Contract" for b in n.bases)]
    cls = next(c for c in classes if cls_name is None or c.name == cls_name)
    methods = [f for f in cls.body if isinstance(f, ast.FunctionDef) and is_write(f)]
    bad = 0
    rows = []
    for f in methods:
        events, fw, late = scan(f)
        reverts = [e for e in events if e[0] == "revert"]
        lr = max((e for e in reverts if not fw or e[1] < fw[1]), key=lambda e: e[1], default=None)
        payable_raise = is_payable(f) and reverts
        ok = not late and not payable_raise
        bad += 0 if ok else 1
        rows.append((f.name, ok))
        print(f"{f.name:20} {'payable' if is_payable(f) else 'write  '}  first write "
              f"{('L%d %s' % (fw[1], fw[2]))[:44] if fw else '-':46} last revert before it "
              f"{('L%d %s' % (lr[1], lr[2]))[:28] if lr else '-':30} "
              f"{'PASS' if ok else 'FAIL ' + str(late or reverts)}", file=out)
    print(f"{len(methods)} write methods scanned in {cls.name}, {bad} violation(s)", file=out)
    return bad, rows


if __name__ == "__main__":
    n, _ = run()
    sys.exit(1 if n else 0)
