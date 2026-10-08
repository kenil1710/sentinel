/**
 * The ONLY RPC endpoints the app reads the five watched chains through, and
 * only to look up a transaction's block time and sender for the challenge
 * form. The contract never uses these: validators read Blockscout themselves.
 */
export const CHAIN_RPC: Record<string, string> = {
  ethereum: "https://ethereum-rpc.publicnode.com",
  base: "https://base-rpc.publicnode.com",
  arbitrum: "https://arb1.arbitrum.io/rpc",
  polygon: "https://polygon-bor-rpc.publicnode.com",
  robinhood: "https://rpc.mainnet.chain.robinhood.com",
};

export async function chainRpc<T>(chain: string, method: string, params: unknown[]): Promise<T> {
  const url = CHAIN_RPC[chain];
  if (!url) throw new Error(`unsupported chain ${chain}`);
  let last: unknown;
  for (let i = 0; i < 3; i++) {
    try {
      const res = await fetch(url, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
        signal: AbortSignal.timeout(15_000), cache: "no-store",
      });
      const j = await res.json();
      if (j.error) throw new Error(j.error.message ?? "rpc error");
      return j.result as T;
    } catch (e) {
      last = e;
      await new Promise((r) => setTimeout(r, 800 * (i + 1)));
    }
  }
  throw last;
}
