import { ContentPage } from "@/components/shared/content-page";

export const metadata = { title: "How Wholesale Works" };

const STEPS = [
  {
    title: "1. Browse the catalog",
    body: "Explore products by category, filter by MOQ, and compare tiered pricing across quantity breaks.",
  },
  {
    title: "2. Hit your price tier",
    body: "The more you order, the lower your per-unit price. Each product shows exactly how many units unlock the next tier.",
  },
  {
    title: "3. Place a quick order or request a quote",
    body: "Add items individually, bulk-upload a CSV of SKUs and quantities, or request a custom quote for larger or recurring orders.",
  },
  {
    title: "4. We confirm and ship",
    body: "Our team confirms pricing and lead time, then ships to your registered ship-to address.",
  },
];

export default function HowItWorksPage() {
  return (
    <ContentPage title="How Wholesale Works" accent="text-blue-800">
      <p>
        GarmentVibes Wholesale is built for retailers, boutiques, and resellers who need apparel in
        bulk — with transparent, quantity-based pricing and no negotiation back-and-forth required.
      </p>
      <div className="space-y-5">
        {STEPS.map((step) => (
          <div key={step.title}>
            <h2 className="text-base font-semibold text-slate-900">{step.title}</h2>
            <p className="mt-1 text-sm text-slate-600">{step.body}</p>
          </div>
        ))}
      </div>
      <h2>MOQ &amp; Pack Sizes</h2>
      <p>
        Every product has a Minimum Order Quantity (MOQ) and is sold in multiples of its pack size, so
        your order always matches how it ships — no partial packs.
      </p>
    </ContentPage>
  );
}
