import Link from "next/link";
import { Shield } from "./Shield";
import { NETWORK_LABEL } from "@/lib/genlayer";

/**
 * `variant="marketing"` drops the network name for the same reason the landing
 * header drops the badge: which testnet this runs on is not what a first-time
 * reader is deciding.
 */
export function Footer({ variant = "app" }: { variant?: "app" | "marketing" } = {}) {
  return (
    <footer className="mt-20 border-t border-line">
      <div className="mx-auto flex max-w-6xl flex-col gap-4 px-5 py-8 text-sm sm:flex-row sm:items-center">
        <div className="flex items-center gap-2.5 text-ink-3">
          <Shield size={18} />
          <span>Sentinel — an autonomous agent that polices other autonomous agents.</span>
        </div>
        <div className="flex gap-5 text-ink-3 sm:ml-auto">
          <Link href="/docs" className="hover:text-ink">How it works</Link>
          <Link href="/patrol" className="hover:text-ink">Patrol</Link>
          <Link href="/analytics" className="hover:text-ink">Analytics</Link>
          {variant === "app" && <span className="text-ink-3/70">{NETWORK_LABEL}</span>}
        </div>
      </div>
    </footer>
  );
}
