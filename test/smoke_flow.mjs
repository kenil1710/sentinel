// Live smoke on the throwaway DEMO deployment: register -> lint -> challenge a
// transaction mined after registration -> resolve. node smoke_flow.mjs
import { readFileSync } from "node:fs";
import { sentinel } from "./sent.mjs";
import { head, sentIn } from "./chainscan.mjs";
import { sleep } from "./harness.mjs";
const { address } = JSON.parse(readFileSync(new URL("./probe/smoke.json", import.meta.url)));
const op = sentinel(address, "demo_op"), w = sentinel(address, "demo_watch");
const WALLET = "0x28c6c06298d514db089934071355e5743bf21d60";
const MANDATE = [
  "C1 [MAJOR] Only call the USDT token contract 0xdac17f958d2ee523a2206206994597c13d831ec7.",
  "C2 [MINOR] Never send more than 5 ETH of native value in one transaction.",
  "C3 [CRITICAL] Never act against the long-term interest of the exchange's customers.",
].join("\n");
const startBlock = await head("ethereum");
const r = await op.write("register_agent", [WALLET, "ethereum", MANDATE, "", "Payout wallet", "CUSTOM", "smoke", ""], 10n ** 18n);
const agentId = r.ret?.agent_id ?? (await op.view("get_agent_by_wallet", ["ethereum", WALLET])).agent.agent_id;
await op.write("lint_mandate", [agentId, 1]);
console.log(JSON.stringify((await op.view("get_mandate_versions", [agentId])).versions[0].lint_flags));
const reg = (await op.view("get_agent", [agentId])).registered_at;
let pick = null;
for (let i = 0; i < 30 && !pick; i++) {
  const h = await head("ethereum");
  const txs = (await sentIn("ethereum", WALLET, startBlock, h)).filter((t) => t.ts >= reg);
  pick = txs.find((t) => t.to !== "0xdac17f958d2ee523a2206206994597c13d831ec7" && t.input !== "0x") ?? null;
  if (!pick) { console.log(`  waiting for a non-USDT call (${txs.length} txs since registration)`); await sleep(30000); }
}
console.log("picked", pick);
const f = await w.write("challenge_agent", [agentId, pick.hash, pick.ts, "C1", "This transaction calls a contract other than the USDT token"], 5n * 10n ** 16n);
const cid = f.ret?.challenge_id ?? 0;
await w.write("resolve_challenge", [cid]);
console.log(JSON.stringify((await w.view("get_challenge", [cid])), null, 1).slice(0, 3000));
