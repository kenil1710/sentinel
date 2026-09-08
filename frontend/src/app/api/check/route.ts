/**
 * The public compliance API.
 *
 *   GET /api/check?wallet=0x…&chain=ethereum
 *
 * One question, answered without a wallet, a key or a rate limit: is this
 * address registered under a mandate, and what has happened to it since?
 *
 * The point is that it is USEFUL TO SOMEONE ELSE'S SOFTWARE. A DEX front end
 * can call this before routing an order; a treasury dashboard can call it
 * before approving a counterparty. Sentinel is only worth anything if a
 * compliance record can be read by whoever is about to take the risk, and that
 * means an endpoint with no ceremony in front of it.
 *
 * Everything returned is already public on chain. There is no private data
 * here to leak, which is why it needs no authentication.
 */
import { NextResponse } from "next/server";
import { createClient } from "genlayer-js";
import { studioDevnet } from "genlayer-js/chains";
import { EXPLORER_HOST } from "@/lib/format";

export const dynamic = "force-dynamic";

const CHAINS = { studiodev: studioDevnet } as const;

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, OPTIONS",
  "access-control-allow-headers": "content-type",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const wallet = String(url.searchParams.get("wallet") ?? "").trim();
  const chain = String(url.searchParams.get("chain") ?? "ethereum").trim().toLowerCase();

  if (!/^0x[0-9a-fA-F]{40}$/.test(wallet)) {
    return NextResponse.json(
      { error: "wallet must be a 0x-prefixed 40-character address" },
      { status: 400, headers: CORS },
    );
  }
  if (!EXPLORER_HOST[chain]) {
    return NextResponse.json(
      { error: `chain must be one of ${Object.keys(EXPLORER_HOST).join(", ")}` },
      { status: 400, headers: CORS },
    );
  }

  const networkName = (process.env.NEXT_PUBLIC_NETWORK ?? "studiodev") as keyof typeof CHAINS;
  const address = process.env.NEXT_PUBLIC_CONTRACT_ADDRESS as `0x${string}` | undefined;
  const gl = CHAINS[networkName];
  if (!gl || !address) {
    return NextResponse.json({ error: "the service is not configured" }, { status: 500, headers: CORS });
  }

  const read = createClient({ chain: gl });
  const view = async <T,>(fn: string, args: unknown[]): Promise<T> => {
    const raw = await read.readContract({ address, functionName: fn, args: args as never });
    return typeof raw === "string" ? (JSON.parse(raw) as T) : (raw as T);
  };

  try {
    const found = await view<{ found: boolean; agent?: Record<string, unknown> }>(
      "get_agent_by_wallet", [chain, wallet.toLowerCase()]);

    // An unregistered wallet is a normal answer, not an error. It is also the
    // answer callers will get most of the time, so it stays cheap and small.
    if (!found.found || !found.agent) {
      return NextResponse.json(
        {
          registered: false,
          wallet: wallet.toLowerCase(),
          chain,
          checked_at: new Date().toISOString(),
          network: networkName,
          contract: address,
        },
        { headers: { ...CORS, "cache-control": "s-maxage=15, stale-while-revalidate=45" } },
      );
    }

    const a = found.agent as Record<string, string | number | boolean>;
    const id = Number(a.agent_id);
    const [score, history] = await Promise.all([
      view<Record<string, number | string>>("get_compliance_score", [id]),
      view<{ challenges: Record<string, unknown>[] }>("get_agent_history", [id, 10]),
    ]);

    const decided = Number(score.decided ?? 0);
    return NextResponse.json(
      {
        registered: true,
        wallet: String(a.wallet),
        chain: String(a.chain),
        agent_id: id,
        name: String(a.name ?? ""),
        agent_type: String(a.agent_type ?? "CUSTOM"),
        description: String(a.description ?? ""),
        operator: String(a.operator),
        operator_url: String(a.operator_url ?? ""),
        status: String(a.status),
        mandate: String(a.mandate),

        compliance: {
          // Basis points AND percent, because a caller comparing thresholds
          // wants the integer and a caller rendering a badge wants the number
          // people read.
          score_bps: Number(score.compliance_bps ?? 10000),
          score_percent: Number(score.compliance_percent ?? 100),
          decided,
          compliant: Number(score.compliant ?? 0),
          violations: Number(score.violations ?? 0),
          inconclusive: Number(score.inconclusive ?? 0),
          pending: Number(score.pending ?? 0),
          // Say plainly when a perfect score means "never tested" rather than
          // "tested and clean". A caller that misses this distinction is the
          // one this endpoint exists to protect.
          untested: decided === 0,
          basis: String(score.basis ?? ""),
        },

        bond: {
          wei: String(a.bond),
          total_slashed_wei: String(a.total_slashed ?? "0"),
          challengeable: Boolean(a.challengeable),
        },

        activity: {
          challenges: Number(a.challenge_count ?? 0),
          violations: Number(a.violation_count ?? 0),
          pending: Number(a.pending_count ?? 0),
          registered_at: Number(a.registered_at ?? 0),
          last_checked: Number(a.last_checked ?? 0),
        },

        recent_verdicts: (history.challenges ?? []).slice(0, 5).map((c) => ({
          challenge_id: Number(c.challenge_id),
          tx_hash: String(c.tx_hash),
          verdict: String(c.verdict),
          status: String(c.status),
          settled_at: Number(c.settled_at),
        })),

        explorer: `https://${EXPLORER_HOST[chain]}/address/${String(a.wallet)}`,
        agent_url: `${url.origin}/agent/${id}`,
        checked_at: new Date().toISOString(),
        network: networkName,
        contract: address,
      },
      { headers: { ...CORS, "cache-control": "s-maxage=15, stale-while-revalidate=45" } },
    );
  } catch (e) {
    return NextResponse.json(
      { error: `could not read the register: ${String((e as Error)?.message ?? e)}` },
      { status: 502, headers: CORS },
    );
  }
}
