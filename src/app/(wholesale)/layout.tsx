import { WholesaleSiteHeader } from "@/components/wholesale/site-header";
import { WholesaleSiteFooter } from "@/components/wholesale/site-footer";
import { PendingApprovalBanner } from "@/components/wholesale/pending-approval-banner";

export default function WholesaleLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-slate-50">
      <WholesaleSiteHeader />
      <PendingApprovalBanner />
      <main className="flex-1">{children}</main>
      <WholesaleSiteFooter />
    </div>
  );
}
