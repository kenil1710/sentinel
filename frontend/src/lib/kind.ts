/**
 * The contract's `_tx_kind`, ported exactly: what KIND of transaction this is,
 * from immutable facts only - counterparty, function selector, the set of
 * tokens moved, and a coarse native-value bucket. A precedent key covers one
 * kind, so this must produce byte-for-byte the same string as the contract
 * (test/test_kind.mjs checks both against the same Blockscout documents).
 */
export interface KindInput {
  to: string;
  created: string;
  rawInput: string;
  value: string;
  tokens: string[];
}

export function valueBucket(wei: string): string {
  let v: bigint;
  try { v = BigInt(wei || "0"); } catch { v = 0n; }
  if (v <= 0n) return "0";
  if (v < 10n ** 16n) return "lt0.01";
  if (v < 10n ** 17n) return "lt0.1";
  if (v < 10n ** 18n) return "lt1";
  if (v < 10n * 10n ** 18n) return "lt10";
  return "ge10";
}

export function txKind(k: KindInput): string {
  const raw = (k.rawInput || "0x").toLowerCase();
  const sel = raw.length >= 10 ? raw.slice(0, 10) : raw;
  const tokens = [...new Set(k.tokens.map((t) => t.toLowerCase()).filter(Boolean))].sort();
  const kind = sel.length >= 10 ? "call" : "send";
  return `${kind}:${(k.to || k.created || "").toLowerCase()}:${sel}:${tokens.join(",")}:${valueBucket(k.value)}`;
}

/** The kind of a Blockscout /api/v2/transactions/{hash} document. */
export function kindOfDoc(doc: Record<string, unknown>): string {
  const node = (x: unknown) => String(((x ?? {}) as { hash?: string }).hash ?? "").toLowerCase();
  const transfers = ((doc.token_transfers as unknown[]) ?? []) as { token?: { address_hash?: string; address?: string } }[];
  return txKind({
    to: node(doc.to),
    created: node(doc.created_contract),
    rawInput: String(doc.raw_input ?? "0x"),
    value: String(doc.value ?? "0"),
    tokens: transfers.map((t) => String(t?.token?.address_hash ?? t?.token?.address ?? "")),
  });
}
