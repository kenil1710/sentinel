/**
 * Server-side proxy for an agent's recent transactions.
 *
 * The browser cannot fetch Blockscout directly — no CORS on those endpoints for
 * an arbitrary origin — and going through here also means the 0.5–1.0 MB list
 * (docs/PROBE.md §2) is trimmed to the handful of fields the UI renders before
 * it crosses the wire.
 */
import { NextResponse } from "next/server";
import { recentTransactions, TransientBlockscout } from "@/lib/blockscout";
import { EXPLORER_HOST } from "@/lib/format";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const chain = String(url.searchParams.get("chain") ?? "");
  const wallet = String(url.searchParams.get("wallet") ?? "");

  if (!EXPLORER_HOST[chain]) {
    return NextResponse.json({ ok: false, error: "unsupported chain" }, { status: 400 });
  }
  if (!/^0x[0-9a-fA-F]{40}$/.test(wallet)) {
    return NextResponse.json({ ok: false, error: "bad wallet address" }, { status: 400 });
  }

  try {
    const rows = await recentTransactions(chain, wallet);
    return NextResponse.json(
      { ok: true, count: rows.length, transactions: rows.slice(0, 25) },
      /*
       * Five minutes at the edge. A cold fetch of a busy wallet's list is a
       * measured 9s — Blockscout serves 0.5-1.0 MB and this route trims it —
       * and an agent page that takes nine seconds to fill in reads as broken.
       * The patrol bot does not come through here (it calls Blockscout
       * directly), so nothing that decides a challenge is served from a cache.
       */
      { headers: { "cache-control": "s-maxage=300, stale-while-revalidate=600" } },
    );
  } catch (e) {
    if (e instanceof TransientBlockscout) {
      // Say WHICH it is. "No transactions" and "the explorer is down" look the
      // same in a UI that collapses them, and they mean opposite things.
      return NextResponse.json(
        { ok: false, transient: true, error: e.message }, { status: 503 },
      );
    }
    return NextResponse.json(
      { ok: false, error: String((e as Error)?.message ?? e) }, { status: 502 },
    );
  }
}
