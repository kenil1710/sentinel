/**
 * Deploys the Sentinel BUILD ARTIFACT — never the readable source.
 *
 *   node deploy.mjs --network=studionet
 *   node deploy.mjs --network=bradbury --keystore=mywallet
 *
 * What is on chain is then byte-identical to what deployments.json records a
 * checksum for, which is the only way `python3 tools/verify_onchain.py` can be
 * a meaningful check rather than a formality.
 *
 * WHO SIGNS: without --keystore the plaintext `client` account in
 * .accounts.json signs, which is right for gasless Studionet and wrong for
 * Bradbury. --keystore=<name> unlocks a real GenLayer CLI wallet instead. The
 * signer becomes the OWNER — the account that can pause, price and sweep the
 * contract — so use the funded wallet, not a throwaway.
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { createClient, createAccount } from "genlayer-js";
import { CHAINS, argOf, outcomeOf, contractAddressOf, fundOnStudio, retry, sleep } from "./harness.mjs";
import { resolveSigner } from "./keystore.mjs";

const networkName = argOf("network", "studionet");
const penaltyBps = Number(argOf("penalty-bps", "2000"));
const chain = CHAINS[networkName];
if (!chain) throw new Error(`unknown network ${networkName}`);

const ARTIFACT = new URL("../build/Sentinel.min.py", import.meta.url);
const code = readFileSync(ARTIFACT);

const signer = resolveSigner(process.argv, new URL("./.accounts.json", import.meta.url));
const account = createAccount(signer.key);
const wallet = createClient({ chain, account });
const read = createClient({ chain });

console.log(`\nSentinel deploy → ${networkName}`);
console.log(`  artifact   build/Sentinel.min.py  (${code.length.toLocaleString()} bytes)`);
console.log(`  signer     ${signer.label}`);

// The MEASURED ceiling. test/size_gate.py recorded 51,257 accepted and 53,500
// refused on Bradbury. Refusing here beats discovering it after a 4-minute wait.
if (!chain.isStudio && code.length > 51_257) {
  console.error(`\nArtifact is ${code.length} bytes; Bradbury refused 53,500 and accepted 51,257.`);
  console.error(`Re-measure with: python3 test/size_gate.py <size>`);
  process.exit(1);
}

if (chain.isStudio) {
  await fundOnStudio(chain, account.address, 100n * 10n ** 18n);
} else {
  const balance = await read.getBalance({ address: account.address });
  const gen = Number(balance) / 1e18;
  console.log(`  balance    ${gen.toFixed(4)} GEN`);
  if (gen < 0.3) {
    console.error(`\nRefusing to start below 0.3 GEN — fund ${account.address}.`);
    process.exit(1);
  }
}

const hash = await retry(
  () => wallet.deployContract({ code, args: [penaltyBps], leaderOnly: false }),
  { label: "deploy" },
);
console.log(`  tx         ${hash}`);

const started = Date.now();
let address = null;
for (;;) {
  await sleep(chain.isStudio ? 2000 : 5000);
  const tx = await read.getTransaction({ hash }).catch(() => null);
  const out = outcomeOf(tx);
  if (out.settled) {
    if (!out.ok) {
      console.error(`\nDeploy failed: ${out.status} ${out.revertReason || out.stderr}`);
      process.exit(1);
    }
    address = contractAddressOf(tx);
    break;
  }
  if (Date.now() - started > 900_000) {
    console.error("\nDeploy never settled in 900s");
    process.exit(1);
  }
}
if (!address) {
  console.error("\nDeployed but no contract address in the receipt — refusing to record it");
  process.exit(1);
}
console.log(`  address    ${address}`);

// Prove it ANSWERS before recording it. A deploy that lands but cannot be read
// is not a deploy anyone can use, and recording it would publish a dead link.
const cfg = JSON.parse(await retry(
  () => read.readContract({ address, functionName: "get_config", args: [] }),
  { label: "get_config" },
));
const stats = JSON.parse(await retry(
  () => read.readContract({ address, functionName: "get_stats", args: [] }),
  { label: "get_stats" },
));
console.log(`  owner      ${cfg.owner}`);
console.log(`  min bond   ${cfg.min_bond_text} GEN    stake ${cfg.challenge_stake_text} GEN`);
console.log(`  penalty    ${cfg.penalty_bps} bps      chains ${cfg.chains.join(", ")}`);
console.log(`  agents     ${stats.agents_registered}`);

const path = new URL("../deployments.json", import.meta.url);
const doc = existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : {};
doc.deployments = doc.deployments || {};
doc.deployments[networkName] = {
  ...(doc.deployments[networkName] || {}),
  network: networkName,
  Sentinel: { address },
  owner: cfg.owner,
  artifact_bytes: code.length,
  deployed_at: new Date().toISOString(),
};
writeFileSync(path, JSON.stringify(doc, null, 2) + "\n");
console.log(`\n✔ recorded in deployments.json\n`);
