"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { useDeployment } from "./useDeployment";
import { Shield } from "./Shield";
import { Icon } from "./icons";
import type { IconName } from "./icons";
import { useWallet } from "./WalletProvider";
import { NETWORK_LABEL, IS_GASLESS, setDeployment } from "@/lib/genlayer";
import type { Deployment } from "@/lib/genlayer";
import { formatGen, shortAddress } from "@/lib/format";

const NAV: { href: string; label: string; icon: IconName }[] = [
  { href: "/agents", label: "Agents", icon: "agents" },
  { href: "/challenges", label: "Challenges", icon: "challenges" },
  { href: "/precedents", label: "Precedents", icon: "verify" },
  { href: "/patrol", label: "Patrol", icon: "patrol" },
  { href: "/leaderboard", label: "Watchers", icon: "watchers" },
  { href: "/consumer", label: "Consumer", icon: "trustless" },
  { href: "/docs", label: "How it works", icon: "docs" },
];

/** Canonical register by default; the demo deployment has 90-second windows. */
function DeploymentSwitch() {
  const d = useDeployment();
  const pick = (next: Deployment) => { setDeployment(next); window.location.reload(); };
  return (
    <div role="group" aria-label="Which deployment" className="hidden items-center rounded-md border border-line bg-panel p-0.5 text-[11px] lg:flex">
      {(["canonical", "demo"] as const).map((x) => (
        <button key={x} onClick={() => pick(x)} aria-pressed={d === x}
          title={x === "canonical" ? "The register: 1 h appeal window" : "Same code, 90 s windows, for trying every path"}
          className={`rounded px-2 py-1 ${d === x ? "bg-ink text-white" : "text-ink-2 hover:text-ink"}`}>
          {x === "canonical" ? "Canonical" : "Demo"}
        </button>
      ))}
    </div>
  );
}

export function AppHeader() {
  const path = usePathname();
  const { account, balance, connect, disconnect, connecting, hasWallet, onWrongNetwork, switchNetwork, error } = useWallet();
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-ground/92 backdrop-blur-md">
      <div className="relative h-px overflow-hidden scanline" />
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-6 px-5">
        <Link href="/" className="flex items-center gap-2.5 text-signal shrink-0">
          <Shield size={26} />
          <span className="text-[15px] font-semibold tracking-tight text-ink">Sentinel</span>
        </Link>

        <nav aria-label="Main" className="hidden items-center gap-0.5 xl:flex">
          {NAV.map((item) => {
            const active = path === item.href || path.startsWith(item.href + "/");
            return (
              <Link key={item.href} href={item.href}
                aria-current={active ? "page" : undefined}
                className={`flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm transition-colors ${
                  active ? "bg-panel-2 text-ink" : "text-ink-2 hover:text-ink hover:bg-panel"}`}>
                {/* The icon is decoration on a labelled link — it never carries
                    the destination on its own. */}
                <Icon name={item.icon} size={15} className={active ? "text-signal" : "opacity-70"} />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="ml-auto flex items-center gap-2.5">
          <DeploymentSwitch />
          <span className="hidden rounded-md border border-line bg-panel px-2.5 py-1 text-[11px] text-ink-2 2xl:inline-flex items-center gap-1.5">
            <span className="size-1.5 rounded-full bg-signal" />
            {NETWORK_LABEL}
          </span>
          <Link href="/balance" className="hidden rounded-md border border-line bg-panel px-2.5 py-1.5 text-sm text-ink-2 hover:text-ink sm:inline-block">Balance</Link>

          <Link href="/register"
            className="hidden items-center gap-1.5 rounded-md bg-signal px-3.5 py-1.5 text-sm font-medium text-white transition-opacity hover:opacity-90 sm:flex">
            <Icon name="register" size={15} />
            Register
          </Link>

          {onWrongNetwork ? (
            <button onClick={switchNetwork}
              className="rounded-md border border-neutral/40 bg-neutral/10 px-3 py-1.5 text-sm text-neutral-ink">
              Switch to {NETWORK_LABEL}
            </button>
          ) : account ? (
            <button onClick={disconnect} title={account}
              className="mono rounded-md border border-line bg-panel px-3 py-1.5 text-xs text-ink-2 hover:text-ink">
              {shortAddress(account)}
              {balance !== null && !IS_GASLESS && (
                <span className="ml-2 text-ink-3">{formatGen(balance, 2)}</span>
              )}
            </button>
          ) : (
            <button onClick={connect} disabled={connecting}
              className="rounded-md border border-line bg-panel px-3 py-1.5 text-sm text-ink-2 hover:text-ink disabled:opacity-50">
              {connecting ? "Connecting…" : hasWallet ? "Connect wallet" : "Install a wallet"}
            </button>
          )}

          <button onClick={() => setOpen((v) => !v)} aria-label="Menu" aria-expanded={open}
            className="rounded-md border border-line bg-panel p-1.5 text-ink-2 xl:hidden">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M2 4h12M2 8h12M2 12h12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      </div>

      {open && (
        <nav aria-label="Main" className="border-t border-line bg-panel px-5 py-2 xl:hidden">
          {[...NAV, { href: "/balance", label: "Balance", icon: "bond" as IconName }, { href: "/register", label: "Register an agent", icon: "register" as IconName }].map((item) => (
            <Link key={item.href} href={item.href} onClick={() => setOpen(false)}
              className="flex items-center gap-2.5 rounded-md px-2 py-2.5 text-sm text-ink-2 hover:text-ink">
              <Icon name={item.icon} size={16} className="opacity-70" />
              {item.label}
            </Link>
          ))}
        </nav>
      )}

      {error && (
        <div className="border-t border-violation/25 bg-violation/10 px-5 py-2 text-center text-xs text-violation-ink">
          {error}
        </div>
      )}
    </header>
  );
}
