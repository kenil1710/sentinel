/**
 * Server-side reads of the CANONICAL Sentinel, for the public API, the badge
 * and the patrol bot. One address, from lib/deployments.ts.
 */
import { createClient } from "genlayer-js";
import { studioDevnet } from "genlayer-js/chains";
import { DEPLOYMENTS } from "./deployments";
import type { Agent } from "@/types";

export const SENTINEL = DEPLOYMENTS.sentinel as `0x${string}`;

export async function readSentinel<T>(functionName: string, args: unknown[] = [], address: `0x${string}` = SENTINEL): Promise<T> {
  const client = createClient({ chain: studioDevnet });
  let last: unknown;
  for (let i = 0; i < 3; i++) {
    try {
      const raw = await Promise.race([
        client.readContract({ address, functionName, args: args as never }),
        new Promise<never>((_, rej) => setTimeout(() => rej(new Error(`${functionName} timed out`)), 25_000)),
      ]);
      return (typeof raw === "string" ? JSON.parse(raw) : raw) as T;
    } catch (e) {
      last = e;
      await new Promise((r) => setTimeout(r, 1500 * (i + 1)));
    }
  }
  throw last;
}

/** An agent by wallet (with its chain) or by numeric id; null when not registered. */
export async function lookup(agentParam: string, chain: string): Promise<Agent | null> {
  if (/^\d{1,9}$/.test(agentParam)) {
    try { return await readSentinel<Agent>("get_agent", [Number(agentParam)]); } catch { return null; }
  }
  const r = await readSentinel<{ found: boolean; agent?: Agent }>("get_agent_by_wallet", [chain, agentParam]);
  return r.found && r.agent ? r.agent : null;
}

