import { RetailSiteHeader } from "@/components/retail/site-header";
import { RetailSiteFooter } from "@/components/retail/site-footer";
import { InstallQrCard } from "@/components/retail/install-qr-card";
import { CartRecoveryPrompt } from "@/components/retail/cart-recovery-prompt";

export default function RetailLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-neutral-50">
      <RetailSiteHeader />
      {/* Below the header so it reads as a notice about the site rather than
          as part of the navigation, and above main so it is the first thing
          in the content order for a screen reader. */}
      <CartRecoveryPrompt />
      <main className="flex-1">{children}</main>
      <RetailSiteFooter />
      <InstallQrCard />
    </div>
  );
}
