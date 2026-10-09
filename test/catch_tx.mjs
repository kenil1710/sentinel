/**
 * Waits for a wallet's NEXT transaction that matches a rule, by watching its
 * latest nonce and scanning only the newest blocks when it moves (for public
 * nodes that refuse historical-state queries), then hands it to the seed state
 * as FOUND so seed_canonical.mjs files and drives it.
 *   node catch_tx.mjs <case> <chain> <wallet> <to-equals|to-not> <address> [minutes]
 */
import { readFileSync, writeFileSync } from "node:fs";
import { head, nonceOf, block } from "./chainscan.mjs";
import { sleep } from "./harness.mjs";
const [name, chain, wallet, mode, addr, minutes = "45"] = process.argv.slice(2);
const w = wallet.toLowerCase(), a = addr.toLowerCase();
const STATE = new URL("../docs/seed-canonical.json", import.meta.url);
const until = Date.now() + Number(minutes) * 60_000;
let lastHead = await head(chain), lastNonce = await nonceOf(chain, w);
while (Date.now() < until) {
  await sleep(12_000);
  const n = await nonceOf(chain, w).catch(() => lastNonce);
  const h = await head(chain).catch(() => lastHead);
  if (n > lastNonce) {
    for (let b = Math.max(lastHead + 1, h - 400); b <= h; b++) {
      const blk = await block(chain, b).catch(() => null);
      for (const t of blk?.transactions ?? []) {
        if (String(t.from).toLowerCase() !== w) continue;
        const to = String(t.to ?? "").toLowerCase();
        if ((mode === "to-equals" && to === a) || (mode === "to-not" && to !== a && t.input !== "0x")) {
          if (process.env.FOUND_FILE) {
            const side = (() => { try { return JSON.parse(readFileSync(process.env.FOUND_FILE, "utf8")); } catch { return {}; } })();
            side[name] = { hash: t.hash, block: b, ts: parseInt(blk.timestamp, 16), to, selector: t.input === "0x" ? "plain" : t.input.slice(0, 10),
              value: BigInt(t.value).toString(), input: t.input.slice(0, 200) };
            writeFileSync(process.env.FOUND_FILE, JSON.stringify(side, null, 2));
            console.log(`caught ${name} ${t.hash}`);
            process.exit(0);
          }
          const st = JSON.parse(readFileSync(STATE, "utf8"));
          st.cases[name] = { ...(st.cases[name] ?? {}), state: "FOUND", tx: { hash: t.hash, block: b, ts: parseInt(blk.timestamp, 16), to,
            selector: t.input === "0x" ? "plain" : t.input.slice(0, 10), value: BigInt(t.value).toString(), input: t.input.slice(0, 200) } };
          st.events.push({ at: new Date().toISOString(), kind: "tx_found", case: name, chain, hash: t.hash, block: b, to, by: "catch_tx" });
          writeFileSync(STATE, JSON.stringify(st, null, 2) + "\n");
          console.log("FOUND", name, t.hash, b, to);
          process.exit(0);
        }
      }
    }
  }
  lastNonce = n; lastHead = h;
}
console.log("nothing matching within", minutes, "minutes");
