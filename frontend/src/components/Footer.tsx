import Link from "next/link";
import { Shield } from "./Shield";
import { CONTRACT_ADDRESS, EXPLORER_BASE, NETWORK_LABEL } from "@/lib/genlayer";

const REPO_URL = "https://github.com/kenil1710/sentinel";

/**
 * `variant="marketing"` drops the network name for the same reason the landing
 * header drops the badge: which testnet this runs on is not what a first-time
 * reader is deciding.
 *
 * Both variants carry the source link. Everything this project claims is
 * checkable — the contract is on chain, the verdicts are on chain — and a
 * reader who wants to check has to be able to reach the code from any page,
 * including the one they landed on. The contract link is app-only because it
 * names the deployment, and it goes to the block explorer rather than being
 * printed as bare text so it can actually be followed.
 */
export function Footer({ variant = "app" }: { variant?: "app" | "marketing" } = {}) {
  return (
    <footer className="mt-20 border-t border-line">
      <div className="mx-auto flex max-w-6xl flex-col gap-4 px-5 py-8 text-sm sm:flex-row sm:items-center">
        <div className="flex items-center gap-2.5 text-ink-3">
          <Shield size={18} />
          <span>Sentinel — an autonomous agent that polices other autonomous agents.</span>
        </div>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-ink-3 sm:ml-auto">
          <Link href="/docs" className="hover:text-ink">How it works</Link>
          <Link href="/patrol" className="hover:text-ink">Patrol</Link>
          <Link href="/analytics" className="hover:text-ink">Analytics</Link>
          <a href={REPO_URL} target="_blank" rel="noopener noreferrer"
            className="hover:text-ink">Source ↗</a>
          {variant === "app" && (
            <a href={`${EXPLORER_BASE}/address/${CONTRACT_ADDRESS}`}
              target="_blank" rel="noopener noreferrer"
              title={CONTRACT_ADDRESS}
              className="font-mono text-[12px] text-ink-3/70 hover:text-ink">
              {NETWORK_LABEL} · {CONTRACT_ADDRESS.slice(0, 6)}…{CONTRACT_ADDRESS.slice(-4)} ↗
            </a>
          )}
        </div>
      </div>
    </footer>
  );
}
