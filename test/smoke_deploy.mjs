// Deploys the WORKING TREE contracts/Sentinel.py as a throwaway DEMO instance
// (never recorded) to catch runtime errors before the real deploy from HEAD.
import { readFileSync, writeFileSync } from "node:fs";
import { createClient, createAccount } from "genlayer-js";
import { CHAINS, accounts, deploy } from "./harness.mjs";
const chain = CHAINS.studiodev;
const account = createAccount(accounts().probe.key);
const wallet = createClient({ chain, account }); const read = createClient({ chain });
const file = process.argv[2] ?? "../contracts/Sentinel.py";
const args = JSON.parse(process.argv[3] ?? '["DEMO"]');
const r = await deploy({ chain, wallet, read, code: readFileSync(new URL(file, import.meta.url), "utf8"), args, label: "smoke" });
console.log(r.ok, r.address, r.reason ?? "", r.out?.revertReason ?? "", (r.out?.stderr ?? "").slice(-1500));
if (r.ok) {
  writeFileSync(new URL("./probe/smoke.json", import.meta.url), JSON.stringify({ address: r.address }));
  console.log(await read.readContract({ address: r.address, functionName: "get_config", args: [] }));
}
