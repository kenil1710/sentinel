/**
 * Creates test/.accounts.json with a stable, reusable pool of signing keys.
 *
 * A POOL rather than one key because Sentinel's rules are RELATIONAL: an
 * operator may not challenge their own agent, one wallet is rate limited
 * between challenges, and the leaderboard ranks watchers against each other.
 * None of those is expressible with a single address — the self-challenge
 * rejection needs an operator AND a separate watcher to even be stated.
 *
 * Keys are written by hand rather than read off `createAccount()`, because that
 * helper does NOT expose a `privateKey` field — it returns a viem account whose
 * key stays private to the closure. Persisting `account.privateKey` therefore
 * writes `undefined`, JSON.stringify drops the field entirely, and every later
 * `createAccount(undefined)` silently mints a brand-new random account. On
 * gasless Studionet that failure is invisible: every run works, just from a
 * different address each time. It surfaces only later, as cooldown and quota
 * tests that can never trigger and an owner nobody holds the key to.
 *
 * Existing roles are PRESERVED across runs unless --force is passed, so a
 * funded address is never silently replaced.
 *
 * Usage: node accounts.mjs [--force]
 */
import { createAccount } from "genlayer-js";
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";

const target = new URL("./.accounts.json", import.meta.url);
const force = process.argv.includes("--force");

// `client` deploys and owns the contract. `operator` and `operator2` register
// agents and post bonds. `watcher` and `watcher2` file challenges — two of them
// because the per-wallet cooldown makes a single watcher unable to file two
// challenges in one run, and because the leaderboard needs someone to rank
// against. `resolver` calls resolve_challenge from an address with no stake in
// the outcome, which is what proves judgement is permissionless rather than a
// challenger privilege; `outsider` only ever probes access control.
const ROLES = [
  "client",
  "operator",
  "operator2",
  "watcher",
  "watcher2",
  "resolver",
  "outsider",
];

const existing = existsSync(target) && !force ? JSON.parse(readFileSync(target, "utf8")) : {};
const out = {};
let created = 0;

for (const role of ROLES) {
  if (existing[role]?.key) {
    out[role] = existing[role];
    continue;
  }
  const key = `0x${randomBytes(32).toString("hex")}`;
  const account = createAccount(key);
  // Round-trip assertion: the stored address must be the one this key actually
  // derives. Without it a mismatch just sits in the file looking plausible.
  if (createAccount(key).address !== account.address) {
    throw new Error(`key for ${role} does not derive a stable address`);
  }
  out[role] = { key, address: account.address };
  created++;
}

writeFileSync(target, JSON.stringify(out, null, 2) + "\n");

console.log(`wrote .accounts.json — ${created} new, ${ROLES.length - created} preserved`);
for (const role of ROLES) console.log(`  ${role.padEnd(12)} ${out[role].address}`);
console.log(`\n(gasless on Studionet; fund these before using Bradbury)`);
