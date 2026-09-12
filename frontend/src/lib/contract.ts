/**
 * Typed access to the Sentinel contract.
 *
 * Two rules run through this file:
 *
 * 1. EVERY VIEW RETURNS A JSON STRING. The contract serialises with json.dumps,
 *    so `readContract` hands back text that has to be parsed. A caller that
 *    treats the result as an object gets `undefined` for every field and
 *    renders a page of blanks rather than an error.
 *
 * 2. A PAYABLE WRITE CAN SUCCEED AND STILL HAVE BEEN TURNED DOWN. Sentinel
 *    refunds rather than reverts on bad input, because a GenVM revert rolls
 *    back storage but NOT the incoming value. So a rejection arrives as a
 *    SUCCESSFUL transaction whose return value says `ok: false`, and
 *    `readWriteResult` is what tells the two apart. No caller may skip it:
 *    treating a rejection as a confirmation would show someone a registered
 *    agent that does not exist and a bond that has already been sent back.
 */
import type { CalldataEncodable, TransactionHash } from "genlayer-js/types";
import { CONTRACT_ADDRESS, NETWORK, getReadClient, getWalletClient } from "./genlayer";
import type {
  Agent, AgentSummary, AgentType, Challenge, ComplianceScore, Config,
  PatrolPreview, Stats, Treasury, VerifyResult, Watcher, WriteResult,
} from "@/types";

/** Reads are capped so a hung endpoint surfaces as an error, not a spinner. */
const READ_TIMEOUT_MS = 30_000;

async function withTimeout<T>(work: Promise<T>, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const guard = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`${label} timed out after ${READ_TIMEOUT_MS / 1000}s`)),
      READ_TIMEOUT_MS,
    );
  });
  try {
    return await Promise.race([work, guard]);
  } finally {
    clearTimeout(timer!);
  }
}

async function view<T>(functionName: string, args: CalldataEncodable[] = []): Promise<T> {
  const client = getReadClient();
  const raw = await withTimeout(
    client.readContract({ address: CONTRACT_ADDRESS, functionName, args }) as Promise<unknown>,
    functionName,
  );
  if (typeof raw !== "string") return raw as T;
  try {
    return JSON.parse(raw) as T;
  } catch {
    throw new Error(`${functionName} returned text that is not JSON: ${raw.slice(0, 160)}`);
  }
}

// ── Reads ──────────────────────────────────────────────────────────────────

export const getConfig = () => view<Config>("get_config");
export const getStats = () => view<Stats>("get_stats");
export const getTreasury = () => view<Treasury>("get_treasury");
export const getAgent = (id: number) => view<Agent>("get_agent", [id]);
export const getChallenge = (id: number) => view<Challenge>("get_challenge", [id]);
export const getComplianceScore = (id: number) => view<ComplianceScore>("get_compliance_score", [id]);
export const verifyChallenge = (id: number) => view<VerifyResult>("verify_challenge", [id]);
export const getWatcher = (addr: string) => view<Watcher>("get_watcher", [addr]);
export const previewChallenge = (id: number, tx: string) =>
  view<PatrolPreview>("preview_challenge", [id, tx]);

export const getActiveAgents = (count = 60) =>
  view<{ count: number; agents: AgentSummary[] }>("get_active_agents", [count]);
export const getAgentsByType = (agentType: string, count = 60) =>
  view<{ agent_type: string; count: number; agents: AgentSummary[] }>("get_agents_by_type", [agentType, count]);
export const getAgentsByChain = (chain: string, count = 60) =>
  view<{ chain: string; count: number; agents: AgentSummary[] }>("get_agents_by_chain", [chain, count]);
export const getAgentsByOperator = (addr: string, count = 60) =>
  view<{ operator: string; count: number; agents: AgentSummary[] }>("get_agents_by_operator", [addr, count]);
export const getPatrolQueue = (count = 25) =>
  view<{ count: number; now: number; queue: AgentSummary[] }>("get_patrol_queue", [count]);
export const getChallenges = (count = 60) =>
  view<{ count: number; challenges: Challenge[] }>("get_challenges", [count]);
export const getPendingChallenges = (count = 60) =>
  view<{ count: number; now: number; challenges: Challenge[] }>("get_pending_challenges", [count]);
export const getAgentHistory = (id: number, count = 60) =>
  view<{ agent_id: number; wallet: string; chain: string; mandate: string; count: number; challenges: Challenge[] }>(
    "get_agent_history", [id, count]);
export const getLeaderboard = (count = 25) =>
  view<{ count: number; watchers: Watcher[] }>("get_leaderboard", [count]);
/**
 * Find an agent by the wallet it watches.
 *
 * This is the RECOVERY PATH for a write whose return payload did not survive
 * the transport. `readWriteResult` deliberately reports such a transaction as
 * `ok` with empty data — it settled, the money moved, and only the readable
 * value is missing — which leaves the caller holding a successful registration
 * and no agent id. The wallet is claimed on chain by then (`wallet_claimed`),
 * so the id can simply be read back rather than guessed at or given up on.
 */
export const getAgentByWallet = (chain: string, wallet: string) =>
  view<{ found: boolean; agent?: Agent }>("get_agent_by_wallet", [chain, wallet]);

export const isTxChallenged = (chain: string, tx: string) =>
  view<{ valid: boolean; challenged: boolean; challenge_id?: number; verdict?: string }>(
    "is_tx_challenged", [chain, tx]);

// ── Writes ─────────────────────────────────────────────────────────────────

/**
 * Turn a settled receipt into one of three states.
 *
 * The contract's own `ok: false` is the middle one, and it is NOT an error —
 * the transaction succeeded and the money came back.
 */
function readWriteResult<T>(hash: string, tx: unknown): WriteResult<T> {
  const receipt = (tx as { consensus_data?: { leader_receipt?: unknown[] } })?.consensus_data?.leader_receipt?.[0] as
    | { result?: { payload?: unknown; status?: string }; execution_result?: string }
    | undefined;
  const named = (tx as { txExecutionResultName?: string })?.txExecutionResultName;

  if (named === "FINISHED_WITH_ERROR" || receipt?.execution_result === "ERROR" ||
      receipt?.result?.status === "rollback") {
    const payload = receipt?.result?.payload;
    return { kind: "failed", hash, error: typeof payload === "string" ? payload : "The transaction reverted" };
  }

  const payload = receipt?.result?.payload as { readable?: string } | string | undefined;
  let text: string | null = null;
  if (typeof payload === "string") text = payload;
  else if (payload && typeof payload.readable === "string") text = payload.readable;

  if (text === null) {
    /**
     * A transaction can settle with no readable return value — the payload
     * lives in `consensus_data` and is not always populated. That is a property
     * of the transport, not a rejection: callers refetch the contract state
     * instead of showing an error.
     */
    return { kind: "ok", hash, data: {} as T };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    try {
      parsed = JSON.parse(JSON.parse(text) as string);
    } catch {
      return { kind: "ok", hash, data: {} as T };
    }
  }
  const body = parsed as { ok?: boolean; reason?: string; refunded?: string };
  if (body && body.ok === false) {
    return {
      kind: "rejected",
      hash,
      reason: String(body.reason ?? "The contract turned this down"),
      refunded: String(body.refunded ?? "0"),
    };
  }
  return { kind: "ok", hash, data: (parsed ?? {}) as T };
}

/**
 * Whether this network charges a fee deposit on a write.
 *
 * Cached for the tab: the policy does not change between two clicks, and asking
 * again would put an extra RPC round trip in front of every confirmation
 * dialog. `null` means "not asked yet"; a failure to read is treated as "fees
 * are required", because sending a zero-fee write to a chain that charges is
 * refused outright, while overpaying a chain that does not is merely wasteful.
 */
let feePolicyEnabled: boolean | null = null;

async function feesRequired(wallet: ReturnType<typeof getWalletClient>): Promise<boolean> {
  if (feePolicyEnabled !== null) return feePolicyEnabled;
  try {
    const policy = await wallet.getCurrentFeePolicy();
    feePolicyEnabled = Boolean(policy?.enabled);
  } catch {
    feePolicyEnabled = true;
  }
  return feePolicyEnabled;
}

/**
 * The contract's own refusal, dug out of a failed FEE ESTIMATE.
 *
 * A non-payable write that `gl.vm.UserError`s never reaches settlement: the
 * estimate simulates the call first, the simulation reverts, and the SDK throws
 * a viem `InvalidInputRpcError` whose message is "Missing or invalid
 * parameters. Double check you have provided the correct parameters." The
 * parameters were fine. The CONTRACT said no, and surfacing viem's guess
 * instead sends an operator off to re-check an address that was never wrong.
 *
 * The real sentence is on the simulated receipt, base64 of one length-prefixed
 * string — the same payload `readWriteResult` reads when a write does settle as
 * a rollback. Both spellings are accepted here because the estimate carries the
 * encoded string directly where a settled receipt nests it under `payload`.
 *
 * Only reached by `withdraw_bond`, `update_mandate`, `resolve_challenge` and
 * `settle_stalled`. The payable writes refund rather than raise, so their
 * simulation succeeds and their rejection arrives through `readWriteResult`.
 */
function contractRefusal(error: unknown): string | null {
  type Node = { cause?: unknown; data?: { receipt?: { result?: unknown } } };
  let node = error as Node | undefined;
  for (let depth = 0; node && depth < 6; depth++, node = node.cause as Node | undefined) {
    const result = node?.data?.receipt?.result;
    const encoded = typeof result === "string"
      ? result
      : typeof (result as { payload?: unknown })?.payload === "string"
        ? ((result as { payload: string }).payload)
        : null;
    if (!encoded) continue;
    let bytes: Uint8Array;
    try {
      bytes = Uint8Array.from(atob(encoded), (c) => c.charCodeAt(0));
    } catch {
      continue;
    }
    // A leading length/tag byte precedes the text; anything below space is not
    // part of the sentence.
    let start = 0;
    while (start < bytes.length && bytes[start] < 0x20) start++;
    const text = new TextDecoder().decode(bytes.subarray(start)).trim();
    if (text) return text;
  }
  return null;
}

/**
 * A wallet that cannot cover the deposit fails inside the SDK with a message
 * written for a developer. Say what the person actually has to do instead, and
 * name the network so "get some GEN" is followed by "from where".
 */
function fundingHint(message: string, network: string): string | null {
  if (!/insufficient|exceeds balance|not enough|balance too low/i.test(message)) return null;
  return network === "studiodev"
    ? "This wallet does not hold enough GEN to cover the bond and the network fee. " +
      "Studio Dev is a development network — fund the address from the Studio faucet and try again."
    : "This wallet does not hold enough GEN to cover the bond and the network fee.";
}

async function send<T>(
  account: `0x${string}`,
  functionName: string,
  args: CalldataEncodable[],
  value = 0n,
): Promise<WriteResult<T>> {
  const wallet = getWalletClient(account);
  const read = getReadClient();
  let hash: string;
  try {
    /*
     * Studio Dev charges a fee deposit on every write; Bradbury, which this
     * app was first built against, does not. A `writeContract` with no `fees`
     * sends a zero-fee transaction, and the consensus contract refuses it — so
     * every register and every challenge from the browser failed here, with an
     * error that pointed at the contract rather than at the missing deposit.
     *
     * Estimated per call, against the real calldata: the deposit depends on the
     * method and its arguments, so a mandate of 900 characters does not cost
     * what one of 30 does.
     */
    const fees = (await feesRequired(wallet))
      ? await wallet.estimateTransactionFeesForWrite({
          address: CONTRACT_ADDRESS, functionName, args, value,
        })
      : undefined;
    hash = await wallet.writeContract({
      address: CONTRACT_ADDRESS, functionName, args, value,
      ...(fees ? { fees } : {}),
    });
  } catch (e) {
    const message = String((e as Error)?.message ?? e);
    // Most specific first: what the contract said, then what the wallet is
    // short of, then whatever the SDK managed to say.
    return {
      kind: "failed", hash: null,
      error: contractRefusal(e) ?? fundingHint(message, NETWORK) ?? message,
    };
  }

  const started = Date.now();
  for (;;) {
    await new Promise((r) => setTimeout(r, 3000));
    let tx: unknown = null;
    try {
      tx = await read.getTransaction({ hash: hash as TransactionHash });
    } catch {
      // Transient RPC noise. Keep polling; absence of an answer is not an answer.
    }
    const status = (tx as { status?: number | string })?.status;
    const name = typeof status === "number"
      ? ["PENDING", "PROPOSING", "COMMITTING", "REVEALING", "ACCEPTED", "FINALIZED", "UNDETERMINED", "CANCELED"][status] ?? ""
      : String(status ?? "");
    if (["ACCEPTED", "FINALIZED", "UNDETERMINED", "CANCELED"].includes(name)) {
      if (name === "UNDETERMINED") {
        return {
          kind: "failed", hash,
          error: "The validators did not converge on this one. Nothing was changed — try again in a moment.",
        };
      }
      if (name === "CANCELED") return { kind: "failed", hash, error: "The transaction was canceled." };
      return readWriteResult<T>(hash, tx);
    }
    if (Date.now() - started > 300_000) {
      return { kind: "failed", hash, error: "The transaction did not settle within 5 minutes." };
    }
  }
}

/**
 * The four profile arguments are positional and every one may be an empty
 * string. They are passed explicitly rather than defaulted here so a caller
 * cannot silently register an agent under a profile it never chose.
 */
export const registerAgent = (
  account: `0x${string}`, wallet: string, chain: string, mandate: string,
  profile: { name: string; agentType: AgentType; description: string; operatorUrl: string },
  bondWei: bigint,
) => send<{ agent_id: number; chain: string; wallet: string; bond: string; status: string; agent_type: string }>(
  account, "register_agent",
  [wallet, chain, mandate, profile.name, profile.agentType, profile.description, profile.operatorUrl],
  bondWei);

export const challengeAgent = (
  account: `0x${string}`, agentId: number, txHash: string, reason: string, stakeWei: bigint,
) => send<{ challenge_id: number; agent_id: number; tx_hash: string; stake: string }>(
  account, "challenge_agent", [agentId, txHash, reason], stakeWei);

export const topUpBond = (account: `0x${string}`, agentId: number, amountWei: bigint) =>
  send<{ agent_id: number; bond: string; reactivated: boolean }>(
    account, "top_up_bond", [agentId], amountWei);

export const withdrawBond = (account: `0x${string}`, agentId: number) =>
  send<{ agent_id: number; withdrawn: string }>(account, "withdraw_bond", [agentId]);

export const updateMandate = (account: `0x${string}`, agentId: number, mandate: string) =>
  send<{ agent_id: number; mandate: string }>(account, "update_mandate", [agentId, mandate]);

export const resolveChallenge = (account: `0x${string}`, challengeId: number) =>
  send<{ challenge_id: number; verdict: string; reasoning: string }>(
    account, "resolve_challenge", [challengeId]);

export const settleStalled = (account: `0x${string}`, challengeId: number) =>
  send<{ challenge_id: number; refunded: string }>(account, "settle_stalled", [challengeId]);
