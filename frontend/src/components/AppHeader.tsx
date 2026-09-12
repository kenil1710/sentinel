"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Shield } from "./Shield";
import { Icon } from "./icons";
import type { IconName } from "./icons";
import { useWallet } from "./WalletProvider";
import { NETWORK_LABEL, IS_GASLESS } from "@/lib/genlayer";
import { formatGen, shortAddress } from "@/lib/format";

const NAV: { href: string; label: string; icon: IconName }[] = [
  { href: "/agents", label: "Agents", icon: "agents" },
  { href: "/patrol", label: "Patrol", icon: "patrol" },
  { href: "/analytics", label: "Analytics", icon: "analytics" },
  { href: "/leaderboard", label: "Watchers", icon: "watchers" },
  { href: "/docs", label: "How it works", icon: "docs" },
];

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

        <nav className="hidden items-center gap-1 md:flex">
          {NAV.map((item) => {
            const active = path === item.href || path.startsWith(item.href + "/");
            return (
              <Link key={item.href} href={item.href}
                className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm transition-colors ${
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
          <span className="hidden rounded-md border border-line bg-panel px-2.5 py-1 text-[11px] text-ink-3 sm:inline-flex items-center gap-1.5">
            <span className="size-1.5 rounded-full bg-signal" />
            {NETWORK_LABEL}
          </span>

          <Link href="/register"
            className="hidden items-center gap-1.5 rounded-md bg-signal px-3.5 py-1.5 text-sm font-medium text-white transition-opacity hover:opacity-90 sm:flex">
            <Icon name="register" size={15} />
            Register an agent
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

          <button onClick={() => setOpen((v) => !v)} aria-label="Menu"
            className="rounded-md border border-line bg-panel p-1.5 text-ink-2 md:hidden">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M2 4h12M2 8h12M2 12h12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      </div>

      {open && (
        <nav className="border-t border-line bg-panel px-5 py-2 md:hidden">
          {[...NAV, { href: "/register", label: "Register an agent", icon: "register" as IconName }].map((item) => (
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
