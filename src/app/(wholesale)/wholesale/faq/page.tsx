import { ContentPage } from "@/components/shared/content-page";
import { JsonLd } from "@/components/shared/json-ld";
import { faqSchema } from "@/lib/seo";

export const metadata = {
  title: "Wholesale FAQ",
  description:
    "Answers on minimum order quantities, size runs, lead times, credit terms and claims for GarmentVibes trade buyers.",
};

const FAQS = [
  {
    q: "What's the minimum order to get started?",
    a: "It varies by product — check the MOQ listed on each product page. Most products start between 48 and 200 units.",
  },
  {
    q: "Can I mix sizes within a pack?",
    a: "Yes — packs ship in a standard size ratio shown on each product page (e.g. S-M-L-XL 2:4:4:2), so you get a balanced size run automatically.",
  },
  {
    q: "How does tiered pricing work?",
    a: "The more units you order, the lower your price per unit. The pricing table on each product page shows exactly which quantity unlocks each tier — the Pricing Calculator tool can help you plan this.",
  },
  {
    q: "Can multiple people from my company place orders?",
    a: "Yes — invite teammates from Business Settings > Team Members, and assign them a role (Admin, Purchaser, or Viewer).",
  },
  {
    q: "Do you offer credit terms?",
    a: "Credit terms are evaluated on a case-by-case basis once your business account is verified. Contact us to discuss.",
  },
];

export default function WholesaleFaqPage() {
  return (
    <ContentPage title="Wholesale FAQ" accent="text-blue-800">
      <JsonLd data={faqSchema(FAQS.map((f) => ({ question: f.q, answer: f.a })))} />
      <div className="space-y-3">
        {FAQS.map((item) => (
          <details key={item.q} className="rounded-lg border border-slate-200 p-4">
            <summary className="cursor-pointer font-medium text-slate-900">{item.q}</summary>
            <p className="mt-2 text-sm text-slate-600">{item.a}</p>
          </details>
        ))}
      </div>
    </ContentPage>
  );
}
