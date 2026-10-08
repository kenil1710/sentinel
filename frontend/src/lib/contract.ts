/**
 * Typed access to Sentinel v2 and SentinelConsumer.
 *
 * Two rules run through this file:
 *
 * 1. EVERY VIEW RETURNS A JSON STRING; it is parsed here.
 *
 * 2. A WRITE IS NOT DONE WHEN IT IS SENT, AND NOT EVEN WHEN IT IS ACCEPTED.
 *    `send` reports each phase (signing -> submitted -> accepted -> finalized)
 *    and only reports success after the caller's `confirm` has re-read the
 *    contract and found the effect it asked for. A payable call that the
 *    contract turned down is a SUCCESSFUL transaction returning ok:false (the
 *    value is credited to the sender's claimable balance), so it is shown as
 *    "rejected", never as success.
 */
import type { CalldataEncodable, TransactionHash } from "genlayer-js/types";
import { encodeExternalMessageFeeParams } from "genlayer-js";
import { CONSUMER_ADDRESS, CONTRACT_ADDRESS, NETWORK, activeContract, getReadClient, getWalletClient } from "./genlayer";
import type {
  Agent, Challenge, Config, Ledger, MandateVersion, Precedent, PreviewChallenge, Stats,
  TrackView, TxProgress, Watcher, WriteResult,
} from "@/types";

const READ_TIMEOUT_MS = 45_000;

async function withTimeout<T>(work: Promise<T>, label: string, ms = READ_TIMEOUT_MS): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const guard = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms / 1000}s`)), ms);
  });
  try {
    return await Promise.race([work, guard]);
  } finally {
    clearTimeout(timer!);
  }
}

async function viewOf<T>(address: `0x${string}`, functionName: string, args: CalldataEncodable[] = []): Promise<T> {
  const raw = await withTimeout(
    getReadClient().readContract({ address, functionName, args }) as Promise<unknown>, functionName);
  if (typeof raw !== "string") return raw as T;
  try {
    return JSON.parse(raw) as T;
  } catch {
    throw new Error(`${functionName} returned text that is not JSON: ${raw.slice(0, 160)}`);
  }
}
const view = <T,>(fn: string, args: CalldataEncodable[] = []) => viewOf<T>(activeContract(), fn, args);

// ── Reads ──────────────────────────────────────────────────────────────────

export const getConfig = () => view<Config>("get_config");
export const getStats = () => view<Stats>("get_stats");
/** Always the canonical register, whatever the deployment switch says (landing page, patrol). */
export const getCanonicalStats = () => viewOf<Stats>(CONTRACT_ADDRESS, "get_stats");
export const getLedger = () => view<Ledger>("get_ledger");
export const getAgent = (id: number) => view<Agent>("get_agent", [id]);
export const getAgents = (offset = 0, count = 100) =>
  view<{ total: number; offset: number; count: number; agents: Agent[] }>("get_agents", [offset, count]);
export const getAgentByWallet = (chain: string, wallet: string) =>
  view<{ found: boolean; agent?: Agent }>("get_agent_by_wallet", [chain, wallet]);
export const getAgentsByOperator = (operator: string) =>
  view<{ operator: string; count: number; agents: Agent[] }>("get_agents_by_operator", [operator]);
export const getMandateVersions = (id: number) =>
  view<{ agent_id: number; count: number; versions: MandateVersion[] }>("get_mandate_versions", [id]);
export const getVersionAt = (id: number, ts: number) =>
  view<{ agent_id: number; found: boolean; version: MandateVersion | null }>("get_version_at", [id, ts]);
export const getChallenge = (id: number) => view<Challenge>("get_challenge", [id]);
export const getChallenges = (offset = 0, count = 100) =>
  view<{ total: number; offset: number; count: number; challenges: Challenge[] }>("get_challenges", [offset, count]);
export const getOpenChallenges = (count = 100) =>
  view<{ count: number; challenges: Challenge[] }>("get_open_challenges", [count]);
export const getAgentChallenges = (id: number, count = 100) =>
  view<{ agent_id: number; count: number; challenges: Challenge[] }>("get_agent_challenges", [id, count]);
export const getTrackRecord = (id: number) => view<TrackView>("get_track_record", [id]);
export const getStanding = (id: number) =>
  view<{ found: boolean; good_standing: boolean; reasons: string[] }>("get_standing", [id]);
export const getPrecedents = (agentId = -1) =>
  view<{ agent_id: number; precedents: Precedent[] }>("get_precedents", [agentId]);
export const getClaimable = (address: string) =>
  view<{ address: string; claimable: string; claimed: string }>("get_claimable", [address]);
export const getWatchers = () => view<{ count: number; watchers: Watcher[] }>("get_watchers");
export const isTxChallenged = (chain: string, tx: string, agentId: number) =>
  view<{ valid: boolean; challenged: boolean; challenge_id?: number }>("is_tx_challenged", [chain, tx, agentId]);
export const previewChallenge = (id: number, ts: number, clause: string) =>
  view<PreviewChallenge>("preview_challenge", [id, ts, clause]);

export const consumerRequests = (count = 25) =>
  viewOf<{ sentinel: string; total: number; carried_out: number; refused: number;
    requests: { request_id: number; sender: string; chain: string; wallet: string; agent_id: number;
      instruction: string; carried_out: boolean; reasons: string[]; at: string }[] }>(
    CONSUMER_ADDRESS, "get_requests", [count]);
export const consumerStanding = async (chain: string, wallet: string) => {
  const raw = await withTimeout(getReadClient().readContract({
    address: CONSUMER_ADDRESS, functionName: "is_in_good_standing", args: [chain, wallet] }) as Promise<unknown>,
  "is_in_good_standing");
  return Boolean(raw);
};

// ── Writes ─────────────────────────────────────────────────────────────────

const STATUS_NAMES = ["PENDING", "PROPOSING", "COMMITTING", "REVEALING", "ACCEPTED", "FINALIZED", "UNDETERMINED", "CANCELED"];

function statusName(tx: unknown): string {
  const s = (tx as { status?: number | string; statusName?: string })?.status;
  if (typeof s === "number") return STATUS_NAMES[s] ?? "";
  return String((tx as { statusName?: string })?.statusName ?? s ?? "");
}

/** The SDK's `readable` rendering drops commas between map entries; put them back. */
export function repairReadable(text: string): string {
  let out = "";
  let inString = false;
  let escaped = false;
  for (const ch of text) {
    if (inString) {
      out += ch;
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') {
      const prev = out.replace(/\s+$/, "").slice(-1);
      if (prev && !"{[,:".includes(prev)) out += ",";
      out += ch;
      inString = true;
      continue;
    }
    out += ch;
  }
  return out;
}

function returned(tx: unknown): { reverted: boolean; reason: string; body: Record<string, unknown> | null } {
  const receipt = (tx as { consensus_data?: { leader_receipt?: unknown[] } })?.consensus_data?.leader_receipt?.[0] as
    | { result?: { payload?: unknown; status?: string }; execution_result?: string } | undefined;
  const reverted = receipt?.execution_result === "ERROR" || receipt?.result?.status === "rollback" ||
    (tx as { txExecutionResultName?: string })?.txExecutionResultName === "FINISHED_WITH_ERROR";
  const payload = receipt?.result?.payload as { readable?: string } | string | undefined;
  if (reverted) return { reverted, reason: typeof payload === "string" ? payload : "The contract refused this call", body: null };
  const text = typeof payload === "string" ? payload : typeof payload?.readable === "string" ? payload.readable : null;
  if (!text) return { reverted: false, reason: "", body: null };
  for (const candidate of [text, repairReadable(text)]) {
    try {
      let v: unknown = JSON.parse(candidate);
      if (typeof v === "string") v = JSON.parse(v);
      if (v && typeof v === "object") return { reverted: false, reason: "", body: v as Record<string, unknown> };
    } catch { /* next */ }
  }
  return { reverted: false, reason: "", body: null };
}

/** The contract's own refusal, from a failed fee simulation (a non-payable write that would revert). */
function contractRefusal(error: unknown): string | null {
  type Node = { cause?: unknown; data?: { receipt?: { result?: unknown } } };
  let node = error as Node | undefined;
  for (let depth = 0; node && depth < 6; depth++, node = node.cause as Node | undefined) {
    const result = node?.data?.receipt?.result;
    const encoded = typeof result === "string" ? result
      : typeof (result as { payload?: unknown })?.payload === "string" ? (result as { payload: string }).payload : null;
    if (!encoded) continue;
    try {
      const bytes = Uint8Array.from(atob(encoded), (c) => c.charCodeAt(0));
      let start = 0;
      while (start < bytes.length && bytes[start] < 0x20) start++;
      const text = new TextDecoder().decode(bytes.subarray(start)).trim();
      if (text) return text;
    } catch { /* not base64 */ }
  }
  return null;
}

let feePolicyEnabled: boolean | null = null;

/**
 * Studio Dev refuses a write that carries no fee. The fee is estimated per
 * call by simulating it; if the simulation fails the generic policy estimate is
 * used, and a call that posts a value transfer (claim) names its recipient so
 * the transfer has an allocation to draw on.
 */
async function feesFor(wallet: ReturnType<typeof getWalletClient>, account: `0x${string}`,
    address: `0x${string}`, functionName: string, args: CalldataEncodable[], value: bigint) {
  if (feePolicyEnabled === null) {
    try { feePolicyEnabled = Boolean((await wallet.getCurrentFeePolicy())?.enabled); } catch { feePolicyEnabled = true; }
  }
  if (!feePolicyEnabled) return undefined;
  try {
    return await withTimeout(wallet.estimateTransactionFeesForWrite({ address, functionName, args, value }), "fee estimate", 30_000);
  } catch (e) {
    const refusal = contractRefusal(e);
    if (refusal) throw new Error(refusal);
    const messageAllocations = functionName === "claim" ? [{
      messageType: 0, recipient: account, budget: 10n ** 17n,
      feeParams: encodeExternalMessageFeeParams({ gasLimit: 200_000n, maxGasPrice: 250_000_000n }),
    }] : undefined;
    return withTimeout(wallet.estimateTransactionFees(messageAllocations ? { messageAllocations } : {}), "fee estimate", 30_000);
  }
}

export interface SendOptions<T> {
  /** Re-reads the contract and says whether the call did what it was for. */
  confirm?: (body: T | null) => Promise<boolean>;
  onProgress?: (p: TxProgress) => void;
  address?: `0x${string}`;
}

/**
 * Submit, then follow the transaction to ACCEPTED, confirm the effect against
 * contract state, report success, and keep following it to FINALIZED.
 */
export async function send<T>(account: `0x${string}`, functionName: string, args: CalldataEncodable[],
    value = 0n, opts: SendOptions<T> = {}): Promise<WriteResult<T>> {
  const address = opts.address ?? activeContract();
  const report = (p: TxProgress) => opts.onProgress?.(p);
  const wallet = getWalletClient(account);
  const read = getReadClient();
  let hash: string;
  report({ phase: "signing", hash: null, message: "Waiting for your wallet to sign…" });
  try {
    const fees = await feesFor(wallet, account, address, functionName, args, value);
    hash = await wallet.writeContract({ address, functionName, args, value, ...(fees ? { fees } : {}) });
  } catch (e) {
    const message = String((e as Error)?.message ?? e);
    const funding = /insufficient|exceeds balance|not enough/i.test(message)
      ? (NETWORK === "studiodev" ? "This wallet does not hold enough GEN for the value and the network fee. Fund it from the Studio Dev faucet." : "Not enough GEN.")
      : null;
    const error = contractRefusal(e) ?? funding ?? message;
    report({ phase: "failed", hash: null, message: error });
    return { kind: "failed", hash: null, error };
  }
  report({ phase: "submitted", hash, message: "Submitted. Validators are processing it." });

  const started = Date.now();
  let tx: unknown = null;
  for (;;) {
    await new Promise((r) => setTimeout(r, 3500));
    try { tx = await read.getTransaction({ hash: hash as TransactionHash }); } catch { /* keep polling */ }
    const name = statusName(tx);
    if (name === "ACCEPTED" || name === "FINALIZED") break;
    if (name === "UNDETERMINED") {
      const error = "The validators did not agree, so nothing was written. The transaction can be sent again.";
      report({ phase: "failed", hash, message: error });
      return { kind: "failed", hash, error };
    }
    if (name === "CANCELED") {
      report({ phase: "failed", hash, message: "The transaction was canceled." });
      return { kind: "failed", hash, error: "The transaction was canceled." };
    }
    if (Date.now() - started > 600_000) {
      const error = "Not accepted within 10 minutes. It may still land; check the explorer.";
      report({ phase: "failed", hash, message: error });
      return { kind: "failed", hash, error };
    }
  }
  const r = returned(tx);
  if (r.reverted) {
    report({ phase: "failed", hash, message: r.reason });
    return { kind: "failed", hash, error: r.reason };
  }
  if (r.body && r.body.ok === false) {
    const reasons = Array.isArray(r.body.reasons) ? (r.body.reasons as string[]).join("; ") : "";
    const reason = String(r.body.reason ?? (reasons || "The contract turned this down"));
    report({ phase: "rejected", hash, message: reason });
    return { kind: "rejected", hash, reason };
  }
  if (opts.confirm) {
    report({ phase: "accepted", hash, message: "Accepted. Re-reading the contract to confirm…" });
    let ok = false;
    for (let i = 0; i < 6 && !ok; i++) {
      try { ok = await opts.confirm(r.body as T | null); } catch { ok = false; }
      if (!ok) await new Promise((res) => setTimeout(res, 4000));
    }
    if (!ok) {
      const error = "Accepted, but the contract state does not show the change. Nothing is claimed until it does.";
      report({ phase: "failed", hash, message: error });
      return { kind: "failed", hash, error };
    }
  }
  report({ phase: "accepted", hash, message: "Accepted and confirmed in contract state. Waiting for finality…" });
  void (async () => {
    for (let i = 0; i < 120; i++) {
      await new Promise((res) => setTimeout(res, 10_000));
      try {
        const t = await read.getTransaction({ hash: hash as TransactionHash });
        if (statusName(t) === "FINALIZED") {
          report({ phase: "finalized", hash, message: "Finalized." });
          return;
        }
      } catch { /* keep waiting */ }
    }
  })();
  return { kind: "ok", hash, data: (r.body ?? {}) as T };
}

type Opts<T> = SendOptions<T>;
type Acc = `0x${string}`;

export const registerAgent = (a: Acc, wallet: string, chain: string, mandate: string, table: string,
  profile: { name: string; agentType: string; description: string; operatorUrl: string }, bond: bigint, o: Opts<{ agent_id: number }>) =>
  send(a, "register_agent", [wallet, chain, mandate, table, profile.name, profile.agentType, profile.description, profile.operatorUrl], bond, o);
export const lintMandate = (a: Acc, id: number, v: number, o: Opts<unknown>) => send(a, "lint_mandate", [id, v], 0n, o);
export const closeLint = (a: Acc, id: number, v: number, o: Opts<unknown>) => send(a, "close_lint", [id, v], 0n, o);
export const updateMandate = (a: Acc, id: number, mandate: string, table: string, o: Opts<unknown>) =>
  send(a, "update_mandate", [id, mandate, table], 0n, o);
export const challengeAgent = (a: Acc, id: number, tx: string, ts: number, clause: string, reason: string, stake: bigint,
  o: Opts<{ challenge_id: number }>) => send(a, "challenge_agent", [id, tx, ts, clause, reason], stake, o);
export const resolveChallenge = (a: Acc, cid: number, o: Opts<unknown>) => send(a, "resolve_challenge", [cid], 0n, o);
export const appealRuling = (a: Acc, cid: number, text: string, bond: bigint, o: Opts<unknown>) => send(a, "appeal", [cid, text], bond, o);
export const resolveAppeal = (a: Acc, cid: number, o: Opts<unknown>) => send(a, "resolve_appeal", [cid], 0n, o);
export const expireAppeal = (a: Acc, cid: number, o: Opts<unknown>) => send(a, "expire_appeal", [cid], 0n, o);
export const finalizeRuling = (a: Acc, cid: number, o: Opts<unknown>) => send(a, "finalize", [cid], 0n, o);
export const settleStalled = (a: Acc, cid: number, o: Opts<unknown>) => send(a, "settle_stalled", [cid], 0n, o);
export const topUpBond = (a: Acc, id: number, amount: bigint, o: Opts<unknown>) => send(a, "top_up_bond", [id], amount, o);
export const requestWithdrawal = (a: Acc, id: number, amount: bigint, o: Opts<unknown>) =>
  send(a, "request_withdrawal", [id, amount.toString()], 0n, o);
export const cancelWithdrawal = (a: Acc, id: number, o: Opts<unknown>) => send(a, "cancel_withdrawal", [id], 0n, o);
export const executeWithdrawal = (a: Acc, id: number, o: Opts<unknown>) => send(a, "execute_withdrawal", [id], 0n, o);
export const unregisterAgent = (a: Acc, id: number, o: Opts<unknown>) => send(a, "unregister", [id], 0n, o);
export const finalizeUnregister = (a: Acc, id: number, o: Opts<unknown>) => send(a, "finalize_unregister", [id], 0n, o);
export const claimBalance = (a: Acc, o: Opts<unknown>) => send(a, "claim", [], 0n, o);
export const actForAgent = (a: Acc, chain: string, wallet: string, instruction: string, o: Opts<{ carried_out: boolean; reasons: string[] }>) =>
  send(a, "act_for_agent", [chain, wallet, instruction], 0n, { ...o, address: CONSUMER_ADDRESS });
