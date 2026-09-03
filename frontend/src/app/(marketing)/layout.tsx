import { MarketingHeader } from "@/components/MarketingHeader";
import { Footer } from "@/components/Footer";

/**
 * The landing page only. No wallet control, no network badge, and no mention of
 * which testnet this happens to be on — none of that is what a first-time
 * reader is here to decide. The header's only action is a link into the app,
 * where the wallet lives.
 */
export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <MarketingHeader />
      <main className="flex-1">{children}</main>
      <Footer variant="marketing" />
    </>
  );
}
