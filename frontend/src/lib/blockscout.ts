/**
 * The patrol bot's read of the five explorers. Only the bot reads these lists:
 * it PROPOSES, and validators read the one transaction a challenge names.
 *
 * MEASURED 2026-10-08: base, arbitrum, polygon and robinhood Blockscout answer
 * this server (and a laptop) with a Cloudflare 403 interstitial; only
 * eth.blockscout.com answers a plain GET. Validators clear the check with a
 * real browser (gl.nondet.web.render), a serverless function cannot. So a 403
 * here is TRANSIENT and SKIPS the agent - it never clears it - and the patrol
 * effectively covers Ethereum; the other chains rely on open challengers.
 */
import { EXPLORER_HOST } from "./format";

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36";
const HEADERS = { accept: "application/json", "user-agent": UA };

export class TransientBlockscout extends Error {}

export type { TxRow } from "./txrow";
import { toRow, type TxRow } from "./txrow";
export { toRow };

async function get(chain: string, path: string): Promise<unknown | null> {
  const host = EXPLORER_HOST[chain];
  if (!host) throw new Error(`unsupported chain ${chain}`);
  let res: Response;
  try {
    res = await fetch(`https://${host}/api/v2/${path}`, { headers: HEADERS, signal: AbortSignal.timeout(25_000), cache: "no-store" });
  } catch (e) {
    throw new TransientBlockscout(`${chain}: ${String((e as Error)?.message ?? e)}`);
  }
  if (res.status === 403 || res.status === 429 || res.status >= 500) throw new TransientBlockscout(`${chain}: explorer returned ${res.status}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`${chain}: explorer returned ${res.status}`);
  try { return await res.json(); } catch { throw new TransientBlockscout(`${chain}: unreadable JSON`); }
}

export async function recentTransactions(chain: string, wallet: string): Promise<TxRow[]> {
  const doc = (await get(chain, `addresses/${wallet}/transactions`)) as { items?: Record<string, unknown>[] } | null;
  return (doc?.items ?? []).map(toRow);
}

/** The document validators read, plus its row form. */
export async function oneTransaction(chain: string, hash: string): Promise<{ row: TxRow; doc: Record<string, unknown> } | null> {
  const doc = (await get(chain, `transactions/${hash}`)) as Record<string, unknown> | null;
  return doc ? { row: toRow(doc), doc } : null;
}
