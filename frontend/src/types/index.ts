/**
 * Shapes of what Sentinel v2's views return. Every amount is a WEI STRING and
 * every time is unix seconds; views carry no clock, so "is this deadline past"
 * is always decided here against Date.now().
 */

export type Chain = "ethereum" | "base" | "arbitrum" | "polygon" | "robinhood";
export type Severity = "MINOR" | "MAJOR" | "CRITICAL";
export type Verdict = "BREACH" | "COMPLIANT" | "INCONCLUSIVE" | "VOID" | "";
export type AgentStatus = "ACTIVE" | "PAUSED" | "UNREGISTERING" | "RETIRED";
export type ChallengeStatus = "PENDING" | "CONTESTABLE" | "APPEALED" | "FINAL";
export type AgentType = "TRADING" | "DEFI" | "SHOPPING" | "CONTENT" | "CUSTOM";

export interface Clause { id: string; severity: Severity; text: string }
export interface LintFlag { clause: string; quote: string }

export interface MandateVersion {
  version: number;
  text: string;
  clauses: Clause[];
  mandate_hash: string;
  created_at: number;
  effective_from: number;
  severity_bps: Record<Severity, number>;
  repeat_step_bps: number;
  repeat_cap_bps: number;
  lint_status: "PENDING" | "DONE" | "INCONCLUSIVE";
  lint_flags: LintFlag[];
  lint_deadline: number;
}

export interface TrackRecord {
  breaches: Record<Severity, number>;
  breaches_total: number;
  compliant: number;
  inconclusive: number;
  void: number;
  overrulings: number;
  appeals_won: number;
  appeals_lost: number;
  last_breach_at: number;
  total_slashed: string;
}

export interface Standing { good_standing: boolean; reasons: string[] }

export interface Agent {
  agent_id: number;
  operator: string;
  wallet: string;
  chain: Chain;
  explorer: string;
  name: string;
  agent_type: AgentType;
  description: string;
  operator_url: string;
  bond: string;
  status: AgentStatus;
  registered_at: number;
  versions: number;
  latest_version: MandateVersion | null;
  open_count: number;
  challenge_count: number;
  withdraw_amount: string;
  withdraw_unlock_at: number;
  unregister_unlock_at: number;
  last_checked: number;
  track_record: TrackRecord;
  standing: Standing;
}

export interface Snapshot {
  mandate_version: number;
  mandate_hash: string;
  clauses: Clause[];
  lint_status: string;
  lint_flags: LintFlag[];
  severity_bps: Record<Severity, number>;
  multiplier_bps: number;
  prior_breaches: number;
  bond_at_filing: string;
  bounty_bps: number;
  appeal_window: number;
  appeal_bond: string;
  appeal_resolve_window: number;
}

export interface Ruling {
  verdict: Verdict;
  clause: string;
  severity: Severity | "";
  quote: string;
  code: string;
  reasoning: string;
  digest: string;
  tx_kind: string;
  evidence: string;
  injection_flagged: boolean;
  ruled_at: number;
  contest_deadline: number;
}

export interface Appeal {
  appellant: string;
  role: "OPERATOR" | "CHALLENGER" | "";
  text: string;
  stake: string;
  appealed_at: number;
  deadline: number;
  verdict: Verdict;
  clause: string;
  severity: string;
  quote: string;
  code: string;
  reasoning: string;
  outcome: "UPHELD" | "REJECTED" | "EXPIRED" | "";
}

export interface FinalRuling {
  verdict: Verdict;
  clause: string;
  severity: string;
  how: string;
  finalized_at: number;
  slash: string;
  bounty: string;
  treasury_cut: string;
  to_operator: string;
  to_challenger: string;
  precedent_key: string;
}

export interface Challenge {
  challenge_id: number;
  agent_id: number;
  challenger: string;
  chain: Chain;
  tx_hash: string;
  tx_url: string;
  wallet: string;
  alleged_clause: string;
  reason: string;
  stake: string;
  tx_timestamp: number;
  snapshot: Snapshot;
  filed_at: number;
  resolve_deadline: number;
  status: ChallengeStatus;
  ruling: Ruling;
  appeal: Appeal;
  final: FinalRuling;
}

export interface Precedent {
  key: string;
  agent_id: number;
  tx_kind: string;
  clause_id: string;
  clause_hash: string;
  challenge_id: number;
  created_at: number;
  active: boolean;
  vetoed_by: number;
}

export interface Stats {
  agents_registered: number;
  agents_by_status: Record<AgentStatus, number>;
  challenges_filed: number;
  challenges_open: number;
  final: Record<"BREACH" | "COMPLIANT" | "INCONCLUSIVE" | "VOID", number>;
  stalled: number;
  appeals: { filed: number; upheld: number; rejected: number; expired: number };
  precedents: number;
  precedents_active: number;
  total_bonds: string;
  total_slashed: string;
  total_bounties: string;
  total_treasury: string;
  patrols_run: number;
  watchers: number;
}

export interface Ledger {
  received: string;
  bonds: string;
  open_stakes: string;
  claimable: string;
  claimed: string;
  recomputed: { bonds: string; open_stakes: string; claimable: string; claimed: string };
  invariant_holds: boolean;
  views_match_storage: boolean;
  held_now: string;
  on_chain_balance: string;
  undelivered_transfers: string;
  note: string;
}

export interface Config {
  version: string;
  mode: "CANONICAL" | "DEMO";
  treasury: string;
  min_bond: string;
  challenge_stake: string;
  appeal_bond: string;
  bounty_bps: number;
  appeal_window: number;
  mandate_delay: number;
  withdraw_delay: number;
  resolve_window: number;
  appeal_resolve_window: number;
  lint_window: number;
  max_open_per_agent: number;
  chains: Chain[];
  explorers: Record<Chain, string>;
  severity_bounds: Record<Severity, [number, number]>;
  step_bounds: [number, number];
  cap_bounds: [number, number];
  default_table: string;
  agent_types: AgentType[];
  max_clauses: number;
  max_clause_chars: number;
  max_reason_chars: number;
  min_appeal_chars: number;
  max_appeal_chars: number;
}

export interface Watcher {
  watcher: string;
  filed: number;
  won: number;
  lost: number;
  void_or_inconclusive: number;
  earned: string;
}

export interface TrackView {
  agent_id: number;
  track_record: TrackRecord;
  recomputed: Omit<TrackRecord, "breaches_total">;
  views_match_storage: boolean;
}

export interface PreviewChallenge {
  ok: boolean;
  reason?: string;
  version: number;
  clause_severity: Severity | "";
  multiplier_bps: number;
  bond: string;
  stake: string;
  if_breach: { slash: string; you_receive: string; bounty: string; treasury: string };
  if_compliant: { you_lose: string; operator_receives: string };
  if_inconclusive: { you_receive: string };
}

/** What a write did, in the words the UI shows. */
export type TxPhase = "signing" | "submitted" | "accepted" | "finalized" | "rejected" | "failed";
export interface TxProgress {
  phase: TxPhase;
  hash: string | null;
  message: string;
}

export type WriteResult<T> =
  | { kind: "ok"; hash: string; data: T }
  | { kind: "rejected"; hash: string; reason: string }
  | { kind: "failed"; hash: string | null; error: string };

export interface PatrolRow {
  agent_id: number;
  wallet: string;
  chain: Chain;
  scanned: number;
  skipped_already_challenged: number;
  flagged: { tx_hash: string; reason: string; clause: string; filed: boolean; challenge_id?: number; error?: string }[];
  skipped_precedent: { tx_hash: string; clause: string; tx_kind: string; precedent_key: string; challenge_id: number }[];
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
  skipped_by_precedent: number;
  dry_run: boolean;
  actions: { challenge_id: number; action: string; result: string }[];
  rows: PatrolRow[];
  notes: string[];
}
