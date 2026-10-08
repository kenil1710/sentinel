/**
 * Creates test/.accounts.json (gitignored): throwaway Studio Dev signing keys.
 * Existing roles are kept unless --force is passed, so a funded address is never
 * silently replaced. Keys never leave this file; scripts print addresses only.
 *
 *   deployer    deploys canonical, demo and SentinelConsumer (and is the treasury)
 *   operator    registers agents on canonical
 *   operator2   a second operator (identity checks: cannot act for operator's agents)
 *   watcher     files challenges on canonical
 *   watcher2    a second, independent challenger (open-challenger win and loss)
 *   resolver    calls the permissionless writes (resolve, finalize, settle)
 *   outsider    only ever probes access control
 *   demo_op     operator on the demo deployment
 *   demo_watch  challenger on the demo deployment
 *   demo_watch2 second challenger on the demo deployment
 *   probe       throwaway GenVM probes
 *
 *   node accounts.mjs [--force]
 */
import { createAccount } from "genlayer-js";
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";

const target = new URL("./.accounts.json", import.meta.url);
const force = process.argv.includes("--force");
const ROLES = ["deployer", "operator", "operator2", "watcher", "watcher2", "resolver", "outsider",
  "demo_op", "demo_watch", "demo_watch2", "probe"];
const existing = existsSync(target) && !force ? JSON.parse(readFileSync(target, "utf8")) : {};
const out = {};
for (const role of ROLES) {
  if (existing[role]?.key) { out[role] = existing[role]; continue; }
  const key = `0x${randomBytes(32).toString("hex")}`;
  out[role] = { key, address: createAccount(key).address };
}
writeFileSync(target, JSON.stringify(out, null, 2) + "\n", { mode: 0o600 });
for (const role of ROLES) console.log(`  ${role.padEnd(11)} ${out[role].address}`);
