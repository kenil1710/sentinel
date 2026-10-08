/**
 * For every address in deployments.json: read the code back from Studio Dev
 * with gen_getContractCode and compare it byte for byte with the same file at
 * HEAD. Also checks the recorded sha256 and that no commit since the deploy
 * commit touched contracts/.  node tools/verify_source.mjs  (exit 1 on any mismatch)
 */
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
const root = new URL("..", import.meta.url).pathname;
const git = (...a) => execFileSync("git", ["-C", root, ...a]).toString().trim();
const sha = (b) => createHash("sha256").update(b).digest("hex");
const dep = JSON.parse(readFileSync(root + "deployments.json", "utf8"));
const RPC = dep.rpc ?? "https://studio-dev.genlayer.com/api";
async function code(address) {
  for (let i = 0; i < 6; i++) {
    try {
      const r = await fetch(RPC, { method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "gen_getContractCode", params: [address] }) });
      const j = await r.json();
      if (j.result) return Buffer.from(j.result, "base64");
      throw new Error(JSON.stringify(j.error));
    } catch (e) { await new Promise((r) => setTimeout(r, 3000 * (i + 1))); }
  }
  throw new Error("gen_getContractCode failed for " + address);
}
let bad = 0;
const commits = new Set();
for (const [name, rec] of Object.entries(dep.contracts)) {
  const onChain = await code(rec.address);
  const atHead = Buffer.from(execFileSync("git", ["-C", root, "show", `HEAD:${rec.file}`]));
  commits.add(rec.commit);
  const same = onChain.equals(atHead), recorded = rec.sha256 === sha(atHead);
  const touched = git("log", "--format=%H", `${rec.commit}..HEAD`, "--", "contracts");
  if (!same || !recorded || touched !== "") bad++;
  console.log(`${name.padEnd(17)} ${rec.address}  ${onChain.length} bytes  sha256 ${sha(onChain).slice(0, 16)}  ${same ? "identical to HEAD" : "DIFFERS FROM HEAD"}  ${recorded ? "matches deployments.json" : "MISMATCH"}  deploy commit ${rec.commit.slice(0, 10)}  ${touched === "" ? "contracts/ unchanged since" : "contracts/ CHANGED since: " + touched.split("\n").join(",")}`);
}
if (commits.size !== 1) { bad++; console.log("deployments come from more than one commit:", [...commits]); }
else console.log(`all deployments from one commit: ${[...commits][0]}`);
process.exit(bad ? 1 : 0);
