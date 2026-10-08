// Tops every role in .accounts.json up from the Studio faucet (sim_fundAccount).
import { createClient } from "genlayer-js";
import { CHAINS, accounts, fundOnStudio, gen, sleep } from "./harness.mjs";
const chain = CHAINS.studiodev; const read = createClient({ chain });
const want = BigInt(process.argv[2] ?? "200") * 10n ** 18n;
for (const [role, a] of Object.entries(accounts())) {
  const before = await read.getBalance({ address: a.address }).catch(() => -1n);
  if (before >= want / 2n) { console.log(role.padEnd(11), a.address, gen(before), "(ok)"); continue; }
  const ok = await fundOnStudio(chain, a.address, want);
  await sleep(2500);
  const after = await read.getBalance({ address: a.address }).catch(() => -1n);
  console.log(role.padEnd(11), a.address, gen(before), "->", gen(after), ok ? "" : "(faucet did not confirm)");
}
