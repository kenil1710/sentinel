/**
 * Drives every path of the DEMO Sentinel (90 s appeal / mandate / withdrawal
 * windows, 600 s resolution / appeal-judgment / lint windows) end to end, on
 * real transactions mined after registration, and ends with every bond
 * released, every stake settled and every balance claimed: the books at 0.
 *
 *   node seed_demo.mjs        resumable; state in docs/seed-demo.json
 *
 * Paths: refused registration, refused filings (operator, wrong stake, no
 * mandate yet, unknown clause, duplicate), BREACH / COMPLIANT / INCONCLUSIVE as
 * the validators decide, an appeal refused by the novelty gate, an appeal
 * judged, an appeal left to expire, a VOID filing (wrong block time) then a
 * correct refiling, a challenge settled as stalled, a mandate edit and its
 * delay, a lint closed as INCONCLUSIVE, a withdrawal over what open challenges hold back refused, one timelocked
 * then executed, a cancelled withdrawal, a top-up, unregister, and claims.
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { sentinel } from "./sent.mjs";
import { sentSince, head } from "./chainscan.mjs";
import { sleep } from "./harness.mjs";

const root = new URL("..", import.meta.url).pathname;
const dep = JSON.parse(readFileSync(root + "deployments.json", "utf8"));
const ADDRESS = process.env.SENTINEL_DEMO ?? dep.contracts.SentinelDemo.address;
const STATE = root + "docs/seed-demo.json";
const GEN = 10n ** 18n, STAKE = 5n * 10n ** 16n;
const USDT = "0xdac17f958d2ee523a2206206994597c13d831ec7";
const WALLET = "0x559432e18b281731c054cd703d4b49872be4ed53";   // a USDT payout bot on Ethereum
const MANDATE = ["C1 [MAJOR] Only move USDT 0xdac17f958d2ee523a2206206994597c13d831ec7.",
  "C2 [MINOR] Never send native ETH.",
  "C3 [CRITICAL] Never move more than 1,000,000 USDT in one transaction."].join("\n");
const MANDATE_V2 = ["C1 [MAJOR] Only move USDT 0xdac17f958d2ee523a2206206994597c13d831ec7 or USDC 0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48.",
  "C2 [MINOR] Never send native ETH.", "C3 [MINOR] Never act against the customer's interest."].join("\n");

const st = existsSync(STATE) ? JSON.parse(readFileSync(STATE, "utf8")) : { contract: ADDRESS, started_at: new Date().toISOString(), steps: [], done: {} };
if (st.contract !== ADDRESS) { console.error("state belongs to another contract"); process.exit(1); }
const save = () => writeFileSync(STATE, JSON.stringify(st, (k, v) => (typeof v === "bigint" ? v.toString() : v), 2) + "\n");
const op = sentinel(ADDRESS, "demo_op"), w1 = sentinel(ADDRESS, "demo_watch"), w2 = sentinel(ADDRESS, "demo_watch2"), any = sentinel(ADDRESS, "resolver");
const view = (fn, args = []) => any.view(fn, args);
const nowS = () => Math.floor(Date.now() / 1000);

async function step(name, fn) {
  if (st.done[name]) return st.done[name];
  console.log(`\n== ${name}`);
  const out = await fn();
  const rec = { name, at: new Date().toISOString(), ...(out ?? {}) };
  st.steps.push(rec);
  st.done[name] = rec;
  save();
  return rec;
}
const r = (o) => ({ hash: o.hash, status: o.status, returned: o.ret ?? null, revert: o.reverted ? o.revertReason || null : null });
const until = async (label, cond, every = 15_000, max = 1_200_000) => {
  const t0 = Date.now();
  for (;;) {
    const v = await cond();
    if (v) return v;
    if (Date.now() - t0 > max) throw new Error(`timed out waiting for ${label}`);
    await sleep(every);
  }
};
let txCursor = null;
async function nextTx(pred = () => true) {
  const reg = (await view("get_agent", [0])).registered_at;
  return until("a new transaction from the payout bot", async () => {
    const txs = await sentSince("ethereum", WALLET, txCursor ?? st.start_block, 30);
    for (const t of txs) {
      txCursor = Math.max(txCursor ?? 0, t.block - 1);
      if (t.ts >= reg && !Object.values(st.done).some((d) => d.tx === t.hash) && pred(t)) return t;
    }
    return null;
  }, 20_000);
}
const ch = (id) => view("get_challenge", [id]);
/** File and read the id back from contract state (a receipt is not proof). */
async function file(client, t, ts, clause, reason) {
  const o = await client.write("challenge_agent", [0, t.hash, ts, clause, reason], STAKE);
  const k = await view("is_tx_challenged", ["ethereum", t.hash, 0]);
  return { tx: t.hash, challenge_id: k.challenged ? k.challenge_id : null, ...r(o) };
}
const id = (name) => st.done[name].challenge_id;
const ledger = () => view("get_ledger");

st.start_block ??= await head("ethereum");
save();

await step("refused_register_bad_mandate", async () => r(await op.write("register_agent", [WALLET, "ethereum", "be good", "", "x", "CUSTOM", "", ""], GEN)));
await step("register", async () => {
  const o = await op.write("register_agent", [WALLET, "ethereum", MANDATE, "", "USDT payout bot (demo)", "CUSTOM", "Demo copy of a real Ethereum payout bot.", ""], GEN);
  return { ...r(o), agent: await view("get_agent", [0]) };
});
await step("lint_v1", async () => { const o = await any.write("lint_mandate", [0, 1]); return { ...r(o), version: (await view("get_mandate_versions", [0])).versions[0] }; });

const t1 = await nextTx((t) => t.to === USDT);
await step("refused_by_operator", async () => ({ tx: t1.hash, ...r(await op.write("challenge_agent", [0, t1.hash, t1.ts, "C1", "operator trying to challenge"], STAKE)) }));
await step("refused_wrong_stake", async () => r(await w1.write("challenge_agent", [0, t1.hash, t1.ts, "C1", "wrong stake attached"], STAKE + 1n)));
await step("refused_unknown_clause", async () => r(await w1.write("challenge_agent", [0, t1.hash, t1.ts, "C9", "no such clause here"], STAKE)));
await step("refused_before_registration", async () => r(await w1.write("challenge_agent", [0, t1.hash, 1700000000, "C1", "mined long before registration"], STAKE)));

// A: an ordinary challenge, appealed by whoever lost, with a novelty-gate refusal first.
await step("A_file", async () => file(w1, t1, t1.ts, "C1", "The bot moved a token; checking it is really the listed USDT contract."));
await step("A_duplicate_refused", async () => r(await w2.write("challenge_agent", [0, t1.hash, t1.ts, "C2", "same transaction, another clause"], STAKE)));
// v2.1.0: an open challenge holds back what it could slash (here the CRITICAL rate, 50%); asking for more is refused.
await step("A_withdraw_over_held_refused", async () => ({ agent: await view("get_agent", [0]),
  ...r(await op.write("request_withdrawal", [0, (GEN / 2n + 1n).toString()])) }));
await step("A_resolve", async () => { const o = await any.write("resolve_challenge", [id("A_file")]); return { ...r(o), challenge: await ch(id("A_file")) }; });
await step("A_appeal_resend_refused", async () => {
  const c = await ch(id("A_file"));
  const loser = c.ruling.verdict === "BREACH" ? op : w1;
  return { verdict: c.ruling.verdict, ...r(await loser.write("appeal", [c.challenge_id, c.ruling.reasoning], STAKE)) };
});
await step("A_appeal", async () => {
  const c = await ch(id("A_file"));
  if (c.status !== "CONTESTABLE") return { skipped: `status ${c.status}` };
  const loser = c.ruling.verdict === "BREACH" ? op : w1;
  const text = c.ruling.verdict === "BREACH"
    ? "Counter-evidence: the only token contract this transaction touched is 0xdac17f958d2ee523a2206206994597c13d831ec7, which is the address clause C1 names. No other token moved and no native value was sent."
    : "Counter-evidence: Blockscout shows this transfer went through the token contract at the address named in C1, but the clause binds the bot to USDT moves only and the panel did not check the recipient of the transfer leg.";
  return { by: loser.role, ...r(await loser.write("appeal", [c.challenge_id, text], STAKE)) };
});
await step("A_resolve_appeal", async () => {
  const c = await ch(id("A_file"));
  if (c.status !== "APPEALED") return { skipped: `status ${c.status}` };
  const o = await any.write("resolve_appeal", [c.challenge_id]);
  return { ...r(o), challenge: await ch(c.challenge_id) };
});

// B: ruled, not appealed, finalized after the 90 s window.
const t2 = await nextTx((t) => t.to === USDT);
await step("B_file", async () => file(w2, t2, t2.ts, "C2", "Checking whether this payout carried native ETH."));
await step("B_resolve", async () => ({ ...r(await any.write("resolve_challenge", [id("B_file")])), challenge: await ch(id("B_file")) }));
await step("B_finalize", async () => {
  const c = await until("B to be finalizable or final", async () => { const x = await ch(id("B_file")); return x.status === "FINAL" || (x.status === "CONTESTABLE" && nowS() > x.ruling.contest_deadline + 5) ? x : null; });
  if (c.status === "FINAL") return { already: "FINAL", challenge: c };
  return { ...r(await any.write("finalize", [c.challenge_id])), challenge: await ch(c.challenge_id) };
});

// C: a filing with the wrong block time is VOID; the correct refiling is judged.
const t3 = await nextTx((t) => t.to === USDT);
await step("C_file_wrong_time", async () => file(w1, t3, t3.ts - 1, "C1", "Filed with a block time one second off on purpose."));
await step("C_resolve_void", async () => ({ ...r(await any.write("resolve_challenge", [id("C_file_wrong_time")])), challenge: await ch(id("C_file_wrong_time")) }));
await step("C_refile_correct_time", async () => file(w1, t3, t3.ts, "C1", "Refiled with the correct block time."));
await step("C_resolve_refiled", async () => ({ ...r(await any.write("resolve_challenge", [id("C_refile_correct_time")])), challenge: await ch(id("C_refile_correct_time")) }));

// D: a challenge nobody resolves: settled as stalled after the 600 s window.
const t4 = await nextTx((t) => t.to === USDT);
await step("D_file_unjudged", async () => file(w2, t4, t4.ts, "C3", "Checking the size of this USDT payout."));

// E: mandate edit with its delay; v2 lint is left to expire.
await step("E_update_mandate", async () => ({ ...r(await op.write("update_mandate", [0, MANDATE_V2, ""])), versions: await view("get_mandate_versions", [0]) }));

// F: an appeal left to expire (if the ruling is appealable).
const t5 = await nextTx((t) => t.to === USDT);
await step("F_file", async () => file(w1, t5, t5.ts, "C1", "A second look at a USDT payout for the expiry path."));
await step("F_resolve", async () => ({ ...r(await any.write("resolve_challenge", [id("F_file")])), challenge: await ch(id("F_file")) }));
await step("F_appeal", async () => {
  const c = await ch(id("F_file"));
  if (c.status !== "CONTESTABLE") return { skipped: `status ${c.status}` };
  const loser = c.ruling.verdict === "BREACH" ? op : w1;
  return { by: loser.role, ...r(await loser.write("appeal", [c.challenge_id, "Appeal filed to exercise the expiry path: nobody will ask a fresh panel to judge this, so after the appeal deadline anyone may close it and the first ruling stands."], STAKE)) };
});

await step("D_settle_stalled", async () => {
  await until("D's resolution window", async () => nowS() > (await ch(id("D_file_unjudged"))).resolve_deadline + 5, 20_000, 1_500_000);
  return { ...r(await any.write("settle_stalled", [id("D_file_unjudged")])), challenge: await ch(id("D_file_unjudged")) };
});

await step("F_expire_appeal", async () => {
  const c = await ch(id("F_file"));
  if (c.status !== "APPEALED") return { skipped: `status ${c.status}` };
  await until("F's appeal deadline", async () => nowS() > (await ch(c.challenge_id)).appeal.deadline + 5, 20_000, 1_500_000);
  return { ...r(await any.write("expire_appeal", [c.challenge_id])), challenge: await ch(c.challenge_id) };
});
await step("E_close_lint_v2", async () => {
  await until("v2 lint deadline", async () => nowS() > (await view("get_mandate_versions", [0])).versions[1].lint_deadline + 5, 20_000, 1_500_000);
  return { ...r(await any.write("close_lint", [0, 2])), versions: await view("get_mandate_versions", [0]) };
});

// Finish everything still open, then the bond lifecycle, then drain.
await step("finish_open", async () => {
  const done = [];
  for (const c of (await view("get_open_challenges", [50])).challenges) {
    if (c.status === "CONTESTABLE") {
      await until(`#${c.challenge_id} window`, async () => nowS() > c.ruling.contest_deadline + 5);
      done.push({ id: c.challenge_id, ...r(await any.write("finalize", [c.challenge_id])) });
    } else if (c.status === "PENDING") {
      done.push({ id: c.challenge_id, ...r(await any.write("resolve_challenge", [c.challenge_id])) });
    } else if (c.status === "APPEALED") {
      done.push({ id: c.challenge_id, ...r(await any.write("resolve_appeal", [c.challenge_id])) });
    }
  }
  return { done, open_after: (await view("get_open_challenges", [50])).count };
});
await step("finish_open_again", async () => {
  const done = [];
  for (const c of (await view("get_open_challenges", [50])).challenges) {
    if (c.status === "CONTESTABLE") {
      await until(`#${c.challenge_id} window`, async () => nowS() > c.ruling.contest_deadline + 5);
      done.push({ id: c.challenge_id, ...r(await any.write("finalize", [c.challenge_id])) });
    }
  }
  return { done, open_after: (await view("get_open_challenges", [50])).count };
});
await step("top_up", async () => ({ ...r(await op.write("top_up_bond", [0], GEN / 10n)), bond: (await view("get_agent", [0])).bond }));
await step("withdraw_request_then_cancel", async () => {
  const a = r(await op.write("request_withdrawal", [0, (GEN / 10n).toString()]));
  const b = r(await op.write("cancel_withdrawal", [0]));
  return { request: a, cancel: b };
});
await step("withdraw_request", async () => ({ ...r(await op.write("request_withdrawal", [0, (GEN / 4n).toString()])), agent: await view("get_agent", [0]) }));
await step("withdraw_early_refused", async () => r(await any.write("execute_withdrawal", [0])));
await step("withdraw_execute", async () => {
  await until("withdrawal unlock", async () => nowS() > (await view("get_agent", [0])).withdraw_unlock_at + 3, 10_000);
  return { ...r(await any.write("execute_withdrawal", [0])), agent: await view("get_agent", [0]) };
});
await step("unregister", async () => ({ ...r(await op.write("unregister", [0])), agent: await view("get_agent", [0]) }));
await step("finalize_unregister", async () => {
  await until("unregister unlock", async () => nowS() > (await view("get_agent", [0])).unregister_unlock_at + 3, 10_000);
  return { ...r(await any.write("finalize_unregister", [0])), agent: await view("get_agent", [0]) };
});
await step("claims", async () => {
  const cfg = await view("get_config");
  const out = {};
  for (const c of [op, w1, w2, any, sentinel(ADDRESS, "deployer")]) {
    const bal = await view("get_claimable", [c.account.address]);
    if (BigInt(bal.claimable) > 0n) out[c.role] = { amount: bal.claimable, ...r(await c.write("claim", [])) };
  }
  out.treasury = cfg.treasury;
  return out;
});
await step("final_ledger", async () => ({ ledger: await ledger(), stats: await view("get_stats") }));
console.log(JSON.stringify(st.done.final_ledger.ledger, null, 1));
