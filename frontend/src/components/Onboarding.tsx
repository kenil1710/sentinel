"use client";

import Link from "next/link";
import { CHAIN_ID_HEX, NETWORK_LABEL, chain } from "@/lib/genlayer";

/**
 * What someone arriving with an empty wallet has to do first.
 *
 * ONE SOURCE, TWO PLACES. The register page needs the short version and the
 * docs page needs the walkthrough, and the two saying different chain IDs is a
 * worse failure than either being absent — a judge who pastes a stale number
 * into MetaMask gets a network that resolves nothing, and has no way to tell
 * whose fault that is.
 *
 * The RPC and the chain ID are READ FROM THE CHAIN THIS BUILD DIALS, never
 * typed in. `lib/genlayer` already derives `CHAIN_ID_HEX` from `chain.id` for
 * exactly this reason; printing a literal here would be a second copy that
 * cannot be wrong at build time and cannot be right after a network change.
 */
export const FAUCET_URL = "https://studio-next.genlayer.com";

const RPC_URL = chain.rpcUrls.default.http[0];
const CHAIN_ID = String(chain.id);
const SYMBOL = chain.nativeCurrency.symbol;

/** The three values MetaMask asks for, in the order its form asks for them. */
export function NetworkFacts({ className = "" }: { className?: string }) {
  return (
    <dl className={`grid gap-x-4 gap-y-1.5 text-[12px] sm:grid-cols-[auto_1fr] ${className}`}>
      <Fact k="RPC URL" v={RPC_URL} />
      <Fact k="Chain ID" v={`${CHAIN_ID} (hex ${CHAIN_ID_HEX})`} />
      <Fact k="Currency symbol" v={SYMBOL} />
    </dl>
  );
}

function Fact({ k, v }: { k: string; v: string }) {
  return (
    <>
      <dt className="text-ink-3 sm:text-right">{k}</dt>
      <dd className="mono break-all text-ink-2">{v}</dd>
    </>
  );
}

/**
 * The short version, for someone already on the register form.
 *
 * Collapsed by default. Anyone who has done this once does not need it again,
 * and an open block of setup instructions above the form makes the form look
 * like the second half of a chore.
 */
export function FaucetNote() {
  return (
    <details className="mt-5 rounded-lg border border-signal/25 bg-signal/[0.06] px-4 py-3 [&[open]>summary_svg]:rotate-90">
      <summary className="flex cursor-pointer list-none items-center gap-2 text-[13px] text-ink">
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" className="shrink-0 text-ink-3 transition-transform">
          <path d="M4 2.5L8 6l-4 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <span className="font-medium">First time?</span>
        <span className="text-ink-2">
          Get testnet GEN from the faucet, and add {NETWORK_LABEL} to your wallet.
        </span>
      </summary>

      <div className="mt-3 space-y-2.5 border-t border-signal/20 pt-3 text-[13px] leading-relaxed text-ink-2">
        <p>
          A bond is real {SYMBOL} on {NETWORK_LABEL}, so an empty wallet cannot register.
          Fund it at{" "}
          <a href={FAUCET_URL} target="_blank" rel="noreferrer"
            className="mono text-signal hover:underline">studio-next.genlayer.com</a>{" "}
          — the faucet is there.
        </p>
        <p>
          <span className="text-ink">Connect wallet adds the network for you</span>, and
          switches to it if you are somewhere else. These are the same values, if you would
          rather add it by hand:
        </p>
        <NetworkFacts className="rounded-md bg-panel-2 px-3 py-2.5" />
      </div>
    </details>
  );
}

/**
 * The walkthrough, for the docs page: four steps, in the order they have to
 * happen. Step 2 is the one that is easy to over-explain — the app does it
 * automatically — so it says so first and gives the manual values second.
 */
export function GettingStarted() {
  const steps: { title: string; body: React.ReactNode }[] = [
    {
      title: "Get testnet GEN",
      body: (
        <>
          Visit{" "}
          <a href={FAUCET_URL} target="_blank" rel="noreferrer"
            className="mono text-signal hover:underline">studio-next.genlayer.com</a>{" "}
          and claim {SYMBOL} from the faucet. Everything on Sentinel that carries weight
          carries money: a bond is at least 0.5 {SYMBOL} and a challenge stakes 0.05, so an
          empty wallet can read the register but cannot act on it.
        </>
      ),
    },
    {
      title: `Add ${NETWORK_LABEL} to your wallet`,
      body: (
        <>
          <span className="text-ink">Connect wallet does this for you</span> — it offers to
          add the network if your wallet does not know it, and to switch if you are on
          another one. To add it by hand instead:
          <NetworkFacts className="mt-2.5 rounded-md bg-panel-2 px-3 py-2.5" />
        </>
      ),
    },
    {
      title: "Connect your wallet",
      body: (
        <>
          Use <span className="text-ink">Connect wallet</span> in the header. Nothing is
          signed by connecting; it only lets the site see which address you are, which is
          what decides whether you are shown an agent&apos;s operator controls.
        </>
      ),
    },
    {
      title: "Register an agent, or challenge one",
      body: (
        <>
          <Link href="/register" className="text-signal hover:underline">Register an agent</Link>{" "}
          to publish a mandate and post a bond against it, or{" "}
          <Link href="/agents" className="text-signal hover:underline">browse the register</Link>{" "}
          and stake 0.05 {SYMBOL} that one of them broke its own rules. You do not have to
          own an agent to challenge one — that is rather the point.
        </>
      ),
    },
  ];

  return (
    <ol className="mt-4 space-y-3">
      {steps.map((s, i) => (
        <li key={s.title}
          className="rounded-xl border border-line bg-panel p-5 shadow-[var(--shadow-card)]">
          <div className="flex items-baseline gap-3">
            <span className="mono text-xs text-signal">Step {i + 1}</span>
            <span className="text-[15px] font-medium">{s.title}</span>
          </div>
          <div className="mt-2 text-[13px] leading-relaxed text-ink-2">{s.body}</div>
        </li>
      ))}
    </ol>
  );
}
