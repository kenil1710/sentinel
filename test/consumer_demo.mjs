/**
 * Exercises SentinelConsumer against the canonical register: one request the
 * gate carries out (the agent's own operator, agent in good standing), one it
 * refuses because the agent is not in good standing, and one it refuses because
 * the caller is not the operator. Appends to docs/seed-canonical.json.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { connect, returnedJson } from "./harness.mjs";
const dep = JSON.parse(readFileSync(new URL("../deployments.json", import.meta.url), "utf8"));
const CONS = dep.contracts.SentinelConsumer.address;
const st = JSON.parse(readFileSync(new URL("../docs/seed-canonical.json", import.meta.url), "utf8"));
const runs = [
  ["operator", "base", st.agents.base.wallet, "move the hourly float into the USDC payout wallet"],
  ["operator", "ethereum", st.agents.e1.wallet, "rebalance 10% of the treasury into USDC"],
  ["outsider", "robinhood", st.agents.rh2.wallet, "pause the keeper for maintenance"],
];
st.consumer = [];
for (const [role, chain, wallet, instruction] of runs) {
  const c = connect({ address: CONS, role });
  const out = await c.send("act_for_agent", [chain, wallet, instruction]);
  const r = returnedJson(out);
  console.log(role, chain, out.status, out.hash, JSON.stringify(r));
  st.consumer.push({ role, chain, wallet, instruction, hash: out.hash, status: out.status, result: r });
}
const c = connect({ address: CONS, role: "outsider" });
console.log(await c.view("get_requests", [10]));
writeFileSync(new URL("../docs/seed-canonical.json", import.meta.url), JSON.stringify(st, null, 2) + "\n");
