import type { Metadata } from "next";
import "./globals.css";
import { WalletProvider } from "@/components/WalletProvider";
import { AppHeader } from "@/components/AppHeader";
import { Footer } from "@/components/Footer";

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

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="antialiased">
        <WalletProvider>
          <div className="flex min-h-screen flex-col">
            <AppHeader />
            <main className="flex-1">{children}</main>
            <Footer />
          </div>
        </WalletProvider>
      </body>
    </html>
  );
}
