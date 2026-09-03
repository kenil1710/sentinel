/**
 * Blockscout access for the PATROL BOT only.
 *
 * The validators never come here. They fetch ONE transaction by hash, from
 * inside the contract, because a challenge names an immutable tx_hash and the
 * thing being judged has to be fixed before the round starts.
 *
 * The patrol bot reads the LIST, which is a different problem:
 *
 *   - It is 0.5–1.0 MB for fifty rows (docs/PROBE.md §2). Pulling that through
 *     five validators to judge one transaction would be absurd.
 *   - It moves constantly. A new transaction arrives and every reader sees a
 *     different fifty rows.
 *
 * Neither matters here, because the bot only ever PROPOSES. It decides nothing;
 * its output is a challenge naming one transaction, and five validators decide
 * that. So the bot is allowed to read a moving document.
 *
 * NO QUERY PARAMETERS. docs/PROBE.md §1: Blockscout rejects unknown query
 * parameters with a 422 rather than ignoring them, and the obvious `?limit=5`
 * is one of them. A patrol that 422'd every fetch would report "no violations
 * found" forever — the worst failure a watchdog can have, because it is silent
 * and it looks like success.
 */
import { EXPLORER_HOST } from "./format";

export interface TxRow {
  hash: string;
  timestamp: string;
  epoch: number;
  value: string;
  method: string | null;
  methodCall: string | null;
  result: string | null;
  from: string;
  to: string;
  toName: string | null;
  toIsContract: boolean;
  toIsVerified: boolean;
  toIsScam: boolean;
  toTags: string[];
  transfers: { sym: string; addr: string; value: string; decimals: string }[];
}

export class TransientBlockscout extends Error {}

function addr(node: unknown): {
  hash: string; name: string | null; is_contract: boolean;
  is_verified: boolean; is_scam: boolean; tags: string[];
} {
  const o = (node ?? {}) as Record<string, unknown>;
  const md = (o.metadata ?? {}) as { tags?: { name?: string }[] };
  return {
    hash: String(o.hash ?? "").toLowerCase(),
    name: (o.name as string) ?? null,
    is_contract: Boolean(o.is_contract),
    is_verified: Boolean(o.is_verified),
    is_scam: Boolean(o.is_scam),
    tags: (md.tags ?? []).map((t) => String(t?.name ?? "")).filter(Boolean),
  };
}

function toRow(raw: unknown): TxRow {
  const r = (raw ?? {}) as Record<string, unknown>;
  const to = addr(r.to);
  const from = addr(r.from);
  const decoded = (r.decoded_input ?? {}) as { method_call?: string };
  const transfers = ((r.token_transfers as unknown[]) ?? []).map((t) => {
    const row = (t ?? {}) as Record<string, unknown>;
    const token = (row.token ?? {}) as Record<string, unknown>;
    const total = (row.total ?? {}) as Record<string, unknown>;
    return {
      sym: String(token.symbol ?? "?"),
      addr: String(token.address_hash ?? "").toLowerCase(),
      value: String(total.value ?? "0"),
      decimals: String(total.decimals ?? "18"),
    };
  });
  const ts = String(r.timestamp ?? "");
  return {
    hash: String(r.hash ?? "").toLowerCase(),
    timestamp: ts,
    epoch: ts ? Math.floor(Date.parse(ts) / 1000) || 0 : 0,
    value: String(r.value ?? "0"),
    method: (r.method as string) ?? null,
    methodCall: decoded.method_call ?? null,
    result: (r.result as string) ?? null,
    from: from.hash,
    to: to.hash,
    toName: to.name,
    toIsContract: to.is_contract,
    toIsVerified: to.is_verified,
    toIsScam: to.is_scam,
    toTags: to.tags,
    transfers,
  };
}

/**
 * Recent transactions for one wallet.
 *
 * Throws `TransientBlockscout` on 5xx/429/no-connection. That distinction is
 * load-bearing: base.blockscout.com answered 500 to every endpoint for the
 * whole of the probe (docs/PROBE.md §6), and reading that as "this wallet has
 * no transactions" would silently clear every agent on that chain.
 */
export async function recentTransactions(chain: string, wallet: string): Promise<TxRow[]> {
  const host = EXPLORER_HOST[chain];
  if (!host) throw new Error(`unsupported chain ${chain}`);
  const url = `https://${host}/api/v2/addresses/${wallet}/transactions`;

  let res: Response;
  try {
    res = await fetch(url, {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(25_000),
      cache: "no-store",
    });
  } catch (e) {
    throw new TransientBlockscout(`${chain}: ${String((e as Error)?.message ?? e)}`);
  }
  if (res.status === 429 || res.status >= 500) {
    throw new TransientBlockscout(`${chain}: explorer returned ${res.status}`);
  }
  if (res.status === 404) return [];
  if (!res.ok) throw new Error(`${chain}: explorer returned ${res.status}`);

  let doc: { items?: unknown[] };
  try {
    doc = (await res.json()) as { items?: unknown[] };
  } catch {
    throw new TransientBlockscout(`${chain}: explorer returned unreadable JSON`);
  }
  return (doc.items ?? []).map(toRow);
}

/**
 * ONE transaction, by hash — the same document the validators read.
 *
 * This exists because of a measured asymmetry: the ADDRESS LIST endpoint
 * returns `token_transfers: null` on every row, while the single-transaction
 * endpoint returns the full list. So a rule about which TOKENS moved — the rule
 * that catches a swap into an unlisted token, which is the whole motivating
 * example — cannot be evaluated from the list at all.
 *
 * The bot therefore uses the list to find CANDIDATES cheaply (value, verified
 * status, scam flag and the counterparty are all present there) and enriches
 * only those candidates with this second fetch. Doing it for all fifty rows
 * would be fifty extra requests per agent per patrol.
 */
export async function oneTransaction(chain: string, hash: string): Promise<TxRow | null> {
  const host = EXPLORER_HOST[chain];
  if (!host) throw new Error(`unsupported chain ${chain}`);
  const url = `https://${host}/api/v2/transactions/${hash}`;

  let res: Response;
  try {
    res = await fetch(url, {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(20_000),
      cache: "no-store",
    });
  } catch (e) {
    throw new TransientBlockscout(`${chain}: ${String((e as Error)?.message ?? e)}`);
  }
  if (res.status === 429 || res.status >= 500) {
    throw new TransientBlockscout(`${chain}: explorer returned ${res.status}`);
  }
  if (res.status === 404) return null;
  if (!res.ok) return null;
  try {
    return toRow(await res.json());
  } catch {
    throw new TransientBlockscout(`${chain}: unreadable transaction document`);
  }
}
