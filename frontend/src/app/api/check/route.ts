/**
 * The public compliance API, answered from the chain.
 *
 *   GET /api/check?agent=0x…&chain=ethereum     (wallet= is accepted too)
 *   GET /api/check?agent=12                      (an agent id)
 *
 * No key, no account. Every field is read from the canonical Sentinel
 * contract at request time (get_agent_by_wallet / get_agent, get_track_record,
 * get_agent_challenges); nothing is cached beyond 30 seconds and nothing is
 * computed here except the shape of the answer.
 */
import { NextResponse } from "next/server";
import { lookup, readSentinel, SENTINEL } from "@/lib/server";
import { DEPLOYMENTS } from "@/lib/deployments";
import type { Agent, Challenge, TrackView } from "@/types";

export const dynamic = "force-dynamic";

const CORS = { "access-control-allow-origin": "*", "access-control-allow-methods": "GET, OPTIONS",
  "access-control-allow-headers": "content-type" };
const CHAINS = ["ethereum", "base", "arbitrum", "polygon", "robinhood"];

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const agentParam = String(url.searchParams.get("agent") ?? url.searchParams.get("wallet") ?? "").trim();
  const chain = String(url.searchParams.get("chain") ?? "ethereum").trim().toLowerCase();
  if (!/^0x[0-9a-fA-F]{40}$/.test(agentParam) && !/^\d{1,9}$/.test(agentParam)) {
    return NextResponse.json({ error: "agent must be a 0x wallet address (with chain=) or an agent id" }, { status: 400, headers: CORS });
  }
  if (!CHAINS.includes(chain)) {
    return NextResponse.json({ error: `chain must be one of ${CHAINS.join(", ")}` }, { status: 400, headers: CORS });
  }
  let agent: Agent | null;
  try {
    agent = await lookup(agentParam, chain);
  } catch (e) {
    return NextResponse.json({ error: "the chain did not answer", detail: String((e as Error)?.message ?? e).slice(0, 160) },
      { status: 502, headers: CORS });
  }
  const source = { contract: SENTINEL, network: "GenLayer Studio Dev", chain_id: DEPLOYMENTS.chainId,
    explorer: `${DEPLOYMENTS.explorer}/address/${SENTINEL}`, read_at: new Date().toISOString() };
  if (!agent) {
    return NextResponse.json({ registered: false, agent: agentParam.toLowerCase(), chain, good_standing: false, source },
      { headers: { ...CORS, "cache-control": "public, max-age=30" } });
  }
  const [track, history] = await Promise.all([
    readSentinel<TrackView>("get_track_record", [agent.agent_id]),
    readSentinel<{ challenges: Challenge[] }>("get_agent_challenges", [agent.agent_id, 20]),
  ]);
  const finals = history.challenges.filter((c) => c.status === "FINAL").slice(0, 5).map((c) => ({
    challenge_id: c.challenge_id, tx_hash: c.tx_hash, verdict: c.final.verdict, clause: c.final.clause,
    severity: c.final.severity, slash: c.final.slash, finalized_at: c.final.finalized_at, how: c.final.how,
  }));
  return NextResponse.json({
    registered: true,
    agent_id: agent.agent_id, chain: agent.chain, wallet: agent.wallet, operator: agent.operator, name: agent.name,
    status: agent.status, bond_wei: agent.bond,
    good_standing: agent.standing.good_standing, reasons: agent.standing.reasons,
    open_challenges: agent.open_count,
    mandate: agent.latest_version && {
      version: agent.latest_version.version, mandate_hash: agent.latest_version.mandate_hash,
      effective_from: agent.latest_version.effective_from, clauses: agent.latest_version.clauses,
      lint: { status: agent.latest_version.lint_status, not_judgeable: agent.latest_version.lint_flags.map((f) => f.clause) },
    },
    track_record: track.track_record,
    track_record_matches_storage: track.views_match_storage,
    recent_final_rulings: finals,
    badge: `${url.origin}/badge/${agent.wallet}.svg?chain=${agent.chain}`,
    source,
  }, { headers: { ...CORS, "cache-control": "public, max-age=30" } });
}
