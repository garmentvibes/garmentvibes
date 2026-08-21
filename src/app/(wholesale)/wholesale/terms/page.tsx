import { ContentPage } from "@/components/shared/content-page";
import { BUSINESS_INFO } from "@/lib/business-info";

export const metadata = {
  title: "Wholesale Terms",
  description:
    "Trade terms for GarmentVibes wholesale accounts: payment terms, order confirmation, dispatch and short-shipment claims.",
};

export default function WholesaleTermsPage() {
  return (
    <ContentPage title="Wholesale Terms" subtitle="Last updated: August 2026" accent="text-blue-800">
      <p className="text-xs text-slate-400">
        GarmentVibes Wholesale is operated by {BUSINESS_INFO.legalName} (proprietor{" "}
        {BUSINESS_INFO.proprietor}), GSTIN {BUSINESS_INFO.gstin}, registered at {BUSINESS_INFO.address}.
      </p>
      <h2>1. Eligibility</h2>
      <p>
        Wholesale accounts are intended for registered businesses — retailers, boutiques, and
        resellers. We may request business verification details before confirming larger orders.
      </p>
      <h2>2. Minimum Order Quantities</h2>
      <p>
        Each product has a published MOQ and pack size. Orders below MOQ cannot be placed through
        Quick Order or the standard catalog flow.
      </p>
      <h2>3. Pricing &amp; Quotes</h2>
      <p>
        Tiered pricing shown in the catalog is indicative. Submitting a quote request does not confirm
        an order — our team will confirm final pricing, taxes, and lead time before fulfillment.
      </p>
      <h2>4. Payment Terms</h2>
      <p>
        Payment terms (advance, partial, or credit) will be discussed on account setup. Payment
        processing is currently in a simulated mode while our payment integration is being completed.
      </p>
      <h2>5. Lead Times</h2>
      <p>
        Lead times shown per product are estimates from order confirmation, not from quote request.
      </p>
      <h2>6. Cancellations</h2>
      <p>Bulk orders already in production may not be cancellable. Contact your account manager as early as possible.</p>
    </ContentPage>
  );
}
