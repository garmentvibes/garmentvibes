import { WholesaleSiteHeader } from "@/components/wholesale/site-header";
import { WholesaleSiteFooter } from "@/components/wholesale/site-footer";
import { PendingApprovalBanner } from "@/components/wholesale/pending-approval-banner";
import { WholesaleCatalogueProvider } from "@/components/shared/catalogue-provider";
import { getWholesaleCatalogue } from "@/lib/catalogue/wholesale";

export default async function WholesaleLayout({ children }: { children: React.ReactNode }) {
  // Read once here: the quick-order grid, the pricing calculator, search and
  // the price-list export are all client components that need the whole
  // catalogue and cannot await it.
  const catalogue = await getWholesaleCatalogue();

  return (
    <WholesaleCatalogueProvider catalogue={catalogue}>
    <div className="flex min-h-screen flex-col bg-slate-50">
      <WholesaleSiteHeader />
      <PendingApprovalBanner />
      <main className="flex-1">{children}</main>
      <WholesaleSiteFooter />
    </div>
    </WholesaleCatalogueProvider>
  );
}
