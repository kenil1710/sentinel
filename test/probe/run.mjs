// Throwaway studio-dev probe for v2 design decisions. node probe/run.mjs <step>
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { createClient, createAccount } from "genlayer-js";
import { CHAINS, accounts, fundOnStudio, deploy, connect, gen } from "../harness.mjs";
const chain = CHAINS.studiodev;
const stateF = new URL("./state.json", import.meta.url);
const st = existsSync(stateF) ? JSON.parse(readFileSync(stateF, "utf8")) : {};
const save = () => writeFileSync(stateF, JSON.stringify(st, null, 2));
const step = process.argv[2];
const acc = accounts();
if (step === "deploy") {
  const account = createAccount(acc.probe.key);
  await fundOnStudio(chain, account.address, 50n * 10n ** 18n);
  const wallet = createClient({ chain, account }); const read = createClient({ chain });
  const r = await deploy({ chain, wallet, read, code: readFileSync(new URL("./Probe.py", import.meta.url), "utf8"), args: [] });
  console.log(r.ok, r.address, r.out?.revertReason, r.out?.stderr?.slice(-500)); st.addr = r.address; save();
} else {
  const c = connect({ address: st.addr, role: "probe" });
  const args = JSON.parse(process.argv[3] ?? "[]"); const value = BigInt(process.argv[4] ?? "0");
  const out = await c.send(step, args, value);
  console.log(step, out.status, out.exec, "ok=", out.ok, "reverted=", out.reverted, out.revertReason?.slice(0, 200), JSON.stringify(out.returned)?.slice(0, 300), `${out.seconds}s`);
  console.log(await c.view("bal", []));
}
