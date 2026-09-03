"use client";

import Link from "next/link";
import { useState } from "react";
import { Shield } from "./Shield";

/**
 * The landing page header.
 *
 * Deliberately carries NO wallet control and NO network badge. A first-time
 * reader is deciding whether the idea is worth their attention, and a "Connect
 * wallet" button asks them to commit before the page has made its case — while
 * a "Bradbury" chip names an implementation detail that means nothing yet.
 *
 * This is a separate component rather than a flag on AppHeader so that the
 * marketing route group has no import path to a wallet prompt at all.
 */
const NAV = [
  { href: "/agents", label: "Agents" },
  { href: "/patrol", label: "Patrol" },
  { href: "/leaderboard", label: "Watchers" },
  { href: "/docs", label: "How it works" },
];

export function MarketingHeader() {
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-ground/85 backdrop-blur-md">
      <div className="relative h-px overflow-hidden scanline" />
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-6 px-5">
        <Link href="/" className="flex items-center gap-2.5 text-signal shrink-0">
          <Shield size={26} />
          <span className="text-[15px] font-semibold tracking-tight text-ink">Sentinel</span>
        </Link>

        <nav className="hidden items-center gap-1 md:flex">
          {NAV.map((item) => (
            <Link key={item.href} href={item.href}
              className="rounded-md px-3 py-1.5 text-sm text-ink-2 transition-colors hover:bg-panel hover:text-ink">
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-2.5">
          <Link href="/docs" className="hidden text-sm text-ink-2 hover:text-ink sm:block">
            How it works
          </Link>
          <Link href="/register"
            className="rounded-md bg-signal px-3.5 py-1.5 text-sm font-medium text-ground transition-opacity hover:opacity-90">
            Register an agent
          </Link>

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
          {NAV.map((item) => (
            <Link key={item.href} href={item.href} onClick={() => setOpen(false)}
              className="block rounded-md px-2 py-2.5 text-sm text-ink-2 hover:text-ink">
              {item.label}
            </Link>
          ))}
        </nav>
      )}
    </header>
  );
}
