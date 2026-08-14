import { RetailSiteHeader } from "@/components/retail/site-header";
import { RetailSiteFooter } from "@/components/retail/site-footer";

export default function RetailLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-neutral-50">
      <RetailSiteHeader />
      <main className="flex-1">{children}</main>
      <RetailSiteFooter />
    </div>
  );
}
