/**
 *   GET /api/txinfo?chain=base&hash=0x…
 *
 * The block time a challenge must name, and who sent the transaction, read
 * from the chain's own RPC (allowlisted in lib/chains.ts). The contract picks
 * the mandate version from this time and the validators check it against
 * Blockscout; a wrong time voids the filing, so the form fills it from here.
 */
import { NextResponse } from "next/server";
import { CHAIN_RPC, chainRpc } from "@/lib/chains";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const chain = String(url.searchParams.get("chain") ?? "").toLowerCase();
  const hash = String(url.searchParams.get("hash") ?? "").trim().toLowerCase();
  if (!CHAIN_RPC[chain]) return NextResponse.json({ found: false, error: "unsupported chain" }, { status: 400 });
  if (!/^0x[0-9a-f]{64}$/.test(hash)) return NextResponse.json({ found: false, error: "not a transaction hash" }, { status: 400 });
  try {
    const tx = await chainRpc<{ blockNumber: string | null; from: string; to: string | null; value: string; input: string } | null>(
      chain, "eth_getTransactionByHash", [hash]);
    if (!tx) return NextResponse.json({ found: false, chain, hash });
    if (!tx.blockNumber) return NextResponse.json({ found: true, mined: false, chain, hash });
    const block = await chainRpc<{ timestamp: string }>(chain, "eth_getBlockByNumber", [tx.blockNumber, false]);
    return NextResponse.json({
      found: true, mined: true, chain, hash, block: parseInt(tx.blockNumber, 16), timestamp: parseInt(block.timestamp, 16),
      from: tx.from.toLowerCase(), to: (tx.to ?? "").toLowerCase(), value: BigInt(tx.value).toString(),
      selector: tx.input === "0x" ? "plain" : tx.input.slice(0, 10),
    }, { headers: { "cache-control": "public, max-age=60" } });
  } catch (e) {
    return NextResponse.json({ found: false, chain, hash, error: String((e as Error)?.message ?? e).slice(0, 160) }, { status: 502 });
  }
}
