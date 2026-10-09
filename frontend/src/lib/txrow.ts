/**
 * One Blockscout transaction as the patrol reads it. No imports, so the patrol
 * tests load the exact converter the bot uses live.
 */
export interface TxRow {
  hash: string;
  epoch: number;
  from: string;
  to: string;
  created: string;
  value: string;
  rawInput: string;
  status: string;
  /** [token, from, to, raw value]; null when the list row did not carry them. */
  transfers: { token: string; from: string; to: string; value: string }[] | null;
}

const node = (x: unknown) => String(((x ?? {}) as { hash?: string }).hash ?? "").toLowerCase();

export function toRow(r: Record<string, unknown>): TxRow {
  const ts = String(r.timestamp ?? "");
  const tt = r.token_transfers as unknown[] | null | undefined;
  return {
    hash: String(r.hash ?? "").toLowerCase(),
    epoch: ts ? Math.floor(Date.parse(ts) / 1000) || 0 : 0,
    from: node(r.from), to: node(r.to), created: node(r.created_contract),
    value: String(r.value ?? "0"), rawInput: String(r.raw_input ?? "0x").toLowerCase(), status: String(r.status ?? ""),
    transfers: Array.isArray(tt) ? tt.map((t) => {
      const x = (t ?? {}) as Record<string, unknown>;
      const token = (x.token ?? {}) as { address_hash?: string; address?: string };
      return { token: String(token.address_hash ?? token.address ?? "").toLowerCase(), from: node(x.from), to: node(x.to),
        value: String(((x.total ?? {}) as { value?: string }).value ?? "0") };
    }) : null,
  };
}
