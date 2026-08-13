import { ContentPage } from "@/components/shared/content-page";
import { JsonLd } from "@/components/shared/json-ld";
import { faqSchema } from "@/lib/seo";

export const metadata = { title: "FAQ" };

const FAQS = [
  {
    q: "How long does delivery take?",
    a: "Most orders are delivered within 3-7 business days depending on your location. You'll get tracking details by email once your order ships.",
  },
  {
    q: "What is your return policy?",
    a: "We accept returns within 7 days of delivery for unused items with original tags and packaging. See the Refund & Cancellation Policy for full details, including refund timelines.",
  },
  {
    q: "Can I cancel an order?",
    a: "Yes — you can cancel from My Orders at any time before the order ships, at no charge. Once shipped, you can refuse delivery or raise a return instead.",
  },
  {
    q: "Do you offer Cash on Delivery?",
    a: "Cash on Delivery and online payments will both be supported once payments go live. Right now, checkout is running in a simulated (no real charge) mode.",
  },
  {
    q: "How do I track my order?",
    a: "Go to My Orders in your account to see the status of every order you've placed.",
  },
  {
    q: "Can I change my delivery address after placing an order?",
    a: "Contact support as soon as possible — we can update the address if the order hasn't shipped yet.",
  },
];

export default function FaqPage() {
  return (
    <ContentPage title="Frequently Asked Questions" accent="text-rose-700">
      <JsonLd data={faqSchema(FAQS.map((f) => ({ question: f.q, answer: f.a })))} />
      <div className="space-y-3">
        {FAQS.map((item) => (
          <details key={item.q} className="rounded-lg border border-neutral-200 p-4">
            <summary className="cursor-pointer font-medium text-neutral-900">{item.q}</summary>
            <p className="mt-2 text-sm text-neutral-600">{item.a}</p>
          </details>
        ))}
      </div>
    </ContentPage>
  );
}
