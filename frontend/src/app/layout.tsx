import type { Metadata } from "next";
import "./globals.css";
import { WalletProvider } from "@/components/WalletProvider";

export const metadata: Metadata = {
  title: "Sentinel — who watches your AI agents?",
  description:
    "Operators register autonomous agents with plain-English mandates on-chain and post a bond. " +
    "Sentinel patrols public blockchains for breaches and files challenges on GenLayer, where five " +
    "validators independently read the transaction and judge it.",
  openGraph: {
    title: "Sentinel — who watches your AI agents?",
    description:
      "An autonomous agent that polices other autonomous agents. Mandates on-chain, bonds at risk, verdicts by consensus.",
    type: "website",
  },
};

/**
 * The root layout carries the WalletProvider and the footer, and NO HEADER.
 *
 * The header is chosen by the route group instead: `(marketing)` gets a header
 * with no wallet control and no network badge, `(app)` gets the full one. That
 * split is structural rather than a conditional inside one component — the
 * landing page has no route to a wallet prompt at all, which is the point.
 *
 * The provider itself stays at the root because it is inert until something
 * calls `connect()`, and hoisting it means moving between the two groups does
 * not tear down and rebuild the connection.
 */
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="antialiased">
        <WalletProvider>
          <div className="flex min-h-screen flex-col">{children}</div>
        </WalletProvider>
      </body>
    </html>
  );
}
