/**
 * Read-only helpers over the five chains' public RPCs, for seeding and for
 * checking a BREACH by hand. Nothing here is trusted by the contract: the
 * validators read Blockscout themselves. These only find transaction hashes and
 * block times to file, and decode what a transaction did.
 */
export const RPC = {
  ethereum: "https://ethereum-rpc.publicnode.com",
  base: "https://base-rpc.publicnode.com",
  arbitrum: "https://arb1.arbitrum.io/rpc",
  polygon: "https://polygon-bor-rpc.publicnode.com",
  robinhood: "https://rpc.mainnet.chain.robinhood.com",
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function rpc(chain, method, params, tries = 5) {
  let last;
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(RPC[chain], {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
        signal: AbortSignal.timeout(30_000),
      });
      const j = await res.json();
      if (j.error) throw new Error(JSON.stringify(j.error));
      return j.result;
    } catch (e) { last = e; await sleep(1500 * (i + 1)); }
  }
  throw last;
}
export const head = async (chain) => parseInt(await rpc(chain, "eth_blockNumber", []), 16);
export const nonceOf = async (chain, w) => parseInt(await rpc(chain, "eth_getTransactionCount", [w, "latest"]), 16);
export const block = (chain, n, full = true) => rpc(chain, "eth_getBlockByNumber", ["0x" + n.toString(16), full]);

/** Block time of a transaction: what challenge_agent needs as block_timestamp. */
export async function txTime(chain, hash) {
  const tx = await rpc(chain, "eth_getTransactionByHash", [hash]);
  if (!tx?.blockNumber) return null;
  const b = await rpc(chain, "eth_getBlockByNumber", [tx.blockNumber, false]);
  return { block: parseInt(tx.blockNumber, 16), ts: parseInt(b.timestamp, 16), tx };
}

/** Transactions SENT by `wallet` in blocks (from, to]. */
export async function sentIn(chain, wallet, from, to) {
  const w = wallet.toLowerCase();
  const out = [];
  for (let n = from + 1; n <= to; n++) {
    const b = await block(chain, n);
    for (const t of b?.transactions ?? []) {
      if (String(t.from).toLowerCase() === w) out.push({ hash: t.hash, block: n, ts: parseInt(b.timestamp, 16), to: (t.to ?? "").toLowerCase(), value: BigInt(t.value), input: t.input });
    }
  }
  return out;
}

/** Receipt with decoded ERC-20 Transfer logs. */
export async function receipt(chain, hash) {
  const r = await rpc(chain, "eth_getTransactionReceipt", [hash]);
  const T = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
  const transfers = (r?.logs ?? []).filter((l) => l.topics?.[0] === T && l.topics.length === 3).map((l) => ({
    token: l.address.toLowerCase(), from: "0x" + l.topics[1].slice(26), to: "0x" + l.topics[2].slice(26),
    value: BigInt(l.data === "0x" ? 0 : l.data),
  }));
  return { status: r?.status, from: r?.from, to: r?.to, transfers };
}

const nonceAt = async (chain, w, n) => parseInt(await rpc(chain, "eth_getTransactionCount", [w, "0x" + n.toString(16)]), 16);

/**
 * Transactions SENT by `wallet` after block `from`, found by bisecting on the
 * account nonce rather than reading every block: O(log blocks) reads per
 * transaction, which is what makes a 4-blocks-a-second chain affordable.
 * Returns at most `max`, oldest first, with block time.
 */
export async function sentSince(chain, wallet, from, max = 10) {
  if (chain === "ethereum") {
    // eth.blockscout.com answers a plain GET (the other four explorers sit behind
    // Cloudflare), and public Ethereum nodes refuse nonce queries at older blocks.
    const r = await fetch(`https://eth.blockscout.com/api/v2/addresses/${wallet}/transactions?filter=from`,
      { signal: AbortSignal.timeout(30_000) }).then((x) => x.json());
    return (r.items ?? []).filter((t) => t.block_number > from).reverse().slice(0, max).map((t) => ({
      hash: t.hash.toLowerCase(), block: t.block_number, ts: Math.floor(Date.parse(t.timestamp) / 1000),
      to: String(t.to?.hash ?? "").toLowerCase(), value: BigInt(t.value ?? "0"),
      selector: (t.raw_input ?? "0x") === "0x" ? "plain" : String(t.raw_input).slice(0, 10), input: String(t.raw_input ?? "0x"),
    }));
  }
  try {
    return await sentByNonce(chain, wallet, from, max);
  } catch (e) {
    if (!/historical state|missing trie|header not found|archive/i.test(String(e?.message ?? e))) throw e;
    // A pruned node cannot answer the nonce at a past block: read the blocks.
    const to = await head(chain);
    return (await sentIn(chain, wallet, Math.max(from, to - 150), to)).slice(0, max)
      .map((t) => ({ ...t, selector: t.input === "0x" ? "plain" : t.input.slice(0, 10) }));
  }
}

async function sentByNonce(chain, wallet, from, max) {
  const w = wallet.toLowerCase();
  const to = await head(chain);
  const n0 = await nonceAt(chain, w, from);
  const n1 = await nonceAt(chain, w, to);
  const out = [];
  let lo = from;
  for (let k = n0; k < n1 && out.length < max; k++) {
    // smallest block b in (lo, to] with nonce(b) > k
    let a = lo, b = to;
    while (b - a > 1) {
      const m = Math.floor((a + b) / 2);
      if ((await nonceAt(chain, w, m)) > k) b = m; else a = m;
    }
    const blk = await block(chain, b);
    for (const t of blk?.transactions ?? []) {
      if (String(t.from).toLowerCase() === w && parseInt(t.nonce, 16) === k) {
        out.push({ hash: t.hash, block: b, ts: parseInt(blk.timestamp, 16), to: (t.to ?? "").toLowerCase(),
          value: BigInt(t.value), selector: t.input === "0x" ? "plain" : t.input.slice(0, 10), input: t.input });
      }
    }
    lo = a;
  }
  return out;
}
