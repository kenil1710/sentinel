import { AppHeader } from "@/components/AppHeader";
import { Footer } from "@/components/Footer";
import { DemoBanner } from "@/components/DemoBanner";

/** Every page that can touch the chain: wallet control and network badge. */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <AppHeader />
      <DemoBanner />
      <main className="flex-1">{children}</main>
      <Footer />
    </>
  );
}
