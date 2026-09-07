/** Shapes the contract's views return. Every view emits a JSON *string*. */

export type Chain = "ethereum" | "base" | "arbitrum" | "polygon" | "robinhood";
export type AgentStatus = "ACTIVE" | "WITHDRAWN" | "SLASHED_OUT";
export type ChallengeStatus = "PENDING" | "SETTLED" | "REFUNDED";
export type Verdict = "" | "VIOLATION" | "COMPLIANT" | "INCONCLUSIVE";
export type AgentType = "TRADING" | "DEFI" | "SHOPPING" | "CONTENT" | "CUSTOM";

export interface Config {
  owner: string;
  paused: boolean;
  min_bond: string;
  min_bond_text: string;
  challenge_stake: string;
  challenge_stake_text: string;
  penalty_bps: number;
  bounty_bps: number;
  vindication_bps: number;
  challenge_cooldown: number;
  max_pending_per_agent: number;
  resolution_window: number;
  max_mandate_chars: number;
  min_mandate_chars: number;
  max_reason_chars: number;
  chains: Chain[];
  explorers: Record<Chain, string>;
  verdicts: string[];
  agent_types: AgentType[];
  max_name_chars: number;
  max_description_chars: number;
  max_url_chars: number;
}

export interface Agent {
  agent_id: number;
  operator: string;
  wallet: string;
  chain: Chain;
  explorer: string;
  mandate: string;
  name: string;
  agent_type: AgentType;
  description: string;
  operator_url: string;
  bond: string;
  status: AgentStatus;
  registered_at: number;
  mandate_updated_at: number;
  last_checked: number;
  challenge_count: number;
  violation_count: number;
  compliant_count: number;
  inconclusive_count: number;
  pending_count: number;
  total_slashed: string;
  total_topped_up: string;
  compliance_bps: number;
  decided_count: number;
  challengeable: boolean;
}

/** What list views return: the agent record minus detail-only fields. */
export interface AgentSummary
  extends Omit<Agent,
    "mandate" | "explorer" | "total_topped_up" | "mandate_updated_at" |
    "inconclusive_count" | "description" | "operator_url"> {
  mandate_preview: string;
  /** Present only on the patrol queue, which re-adds them. */
  mandate?: string;
  explorer?: string;
  seconds_since_check?: number;
}

export interface Settlement {
  bond_before: string;
  penalty: string;
  bounty: string;
  protocol_cut: string;
  operator_award: string;
  refunded: string;
}

export interface Challenge {
  challenge_id: number;
  agent_id: number;
  challenger: string;
  tx_hash: string;
  chain: Chain;
  tx_url: string;
  reason: string;
  stake: string;
  status: ChallengeStatus;
  verdict: Verdict;
  filed_at: number;
  settled_at: number;
  reasoning: string;
  evidence_digest: string;
  injection_flagged: boolean;
  confidence: number;
  stalled: boolean;
  settlement: Settlement;
  stalled_eligible: boolean;
  stalled_in: number;
}

export interface Stats {
  agents_registered: number;
  agents_active: number;
  bond_under_watch: string;
  bond_under_watch_text: string;
  challenges_filed: number;
  challenges_settled: number;
  violations: number;
  compliant: number;
  inconclusive: number;
  stalled: number;
  patrols_run: number;
  bounties_paid: string;
  bounties_paid_text: string;
  total_slashed: string;
  total_slashed_text: string;
  total_bonded: string;
  watchers: number;
  violation_rate_bps: number;
  chains: Chain[];
}

export interface Watcher {
  watcher: string;
  upheld: number;
  refuted: number;
  inconclusive: number;
  filed: number;
  earned: string;
  earned_text?: string;
  staked: string;
  accuracy_bps: number;
  decided: number;
  known?: boolean;
}

export interface ComplianceScore {
  agent_id: number;
  compliance_bps: number;
  compliance_percent: number;
  decided: number;
  compliant: number;
  violations: number;
  inconclusive: number;
  pending: number;
  basis: string;
}

export interface PatrolPreview {
  agent_id: number;
  chain: Chain;
  tx_hash: string;
  tx_url: string;
  stake_required: string;
  stake_required_text: string;
  valid_hash: boolean;
  already_challenged: boolean;
  agent_challengeable: boolean;
  if_violation: { you_receive: string; you_receive_text: string; bounty: string; operator_slashed: string; protocol_cut: string };
  if_compliant: { you_receive: string; you_lose: string; you_lose_text: string; operator_receives: string; protocol_cut: string };
  if_inconclusive: { you_receive: string; you_receive_text: string; operator_affected: boolean };
}

export interface VerifyResult {
  challenge_id: number;
  verdict: Verdict;
  status: ChallengeStatus;
  settled: boolean;
  evidence_digest: string;
  reasoning: string;
  coherent: boolean;
  injection_flagged: boolean;
  checks: { field: string; expected: string; actual: string; ok: boolean }[];
  all_ok: boolean;
  paid_out: string;
  retained: string;
  conservation: { in: string; out: string; balanced: boolean };
}

export interface Treasury {
  locked_bonds: string;
  locked_stakes: string;
  protocol_balance: string;
  owed_total: string;
  owed_text: string;
  total_bonded: string;
  total_slashed: string;
  total_bounties: string;
  total_paid: string;
  total_refunded: string;
  last_out_epoch: number;
}

/**
 * The three states a write can land in.
 *
 * `rejected` is the one that does not exist on most chains: Sentinel's payable
 * methods REFUND rather than revert on bad input, so a rejection arrives as a
 * SUCCESSFUL transaction whose return value says `ok: false`. Rendering that as
 * a confirmation would show someone a bond that was already sent back.
 */
export type WriteResult<T = Record<string, unknown>> =
  | { kind: "ok"; hash: string; data: T }
  | { kind: "rejected"; hash: string; reason: string; refunded: string }
  | { kind: "failed"; hash: string | null; error: string };

/** One agent's row in a patrol run. */
export interface PatrolRow {
  agent_id: number;
  wallet: string;
  chain: Chain;
  scanned: number;
  skipped_already_challenged: number;
  flagged: { tx_hash: string; reason: string; filed: boolean; challenge_id?: number; error?: string }[];
  error?: string;
}

export interface PatrolReport {
  ok: boolean;
  started_at: string;
  finished_at: string;
  seconds: number;
  network: string;
  contract: string;
  patrolled: number;
  transactions_scanned: number;
  challenges_filed: number;
  dry_run: boolean;
  rows: PatrolRow[];
  notes: string[];
}
