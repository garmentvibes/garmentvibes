import { RetailSiteHeader } from "@/components/retail/site-header";
import { RetailSiteFooter } from "@/components/retail/site-footer";
import { InstallQrCard } from "@/components/retail/install-qr-card";
import { CartRecoveryPrompt } from "@/components/retail/cart-recovery-prompt";
import { CatalogueProvider } from "@/components/shared/catalogue-provider";
import { getRetailCatalogue } from "@/lib/catalogue/retail";

export default async function RetailLayout({ children }: { children: React.ReactNode }) {
  // Read here rather than in each client component that needs it. The search
  // box and the recently-viewed rail both want the whole catalogue and neither
  // can await; importing the module instead would have them showing last
  // season's prices beside listings showing this season's.
  const catalogue = await getRetailCatalogue();

  return (
    <CatalogueProvider catalogue={catalogue}>
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
    </CatalogueProvider>
  );
}
