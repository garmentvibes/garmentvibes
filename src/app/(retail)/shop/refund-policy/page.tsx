import Link from "next/link";
import { ContentPage } from "@/components/shared/content-page";
import { BUSINESS_INFO } from "@/lib/business-info";

export const metadata = {
  title: "Refund & Cancellation Policy",
  description:
    "How to cancel an order, request a return or exchange, and when refunds are processed at GarmentVibes.",
};

export default function RefundPolicyPage() {
  return (
    <ContentPage
      title="Refund &amp; Cancellation Policy"
      subtitle="Last updated: August 2026"
      accent="text-rose-700"
    >
      <p>
        We want you to be happy with what you buy from GarmentVibes. This policy explains when you
        can cancel an order, when you can return an item, and how refunds are processed.
      </p>

      <h2>1. Order Cancellation</h2>
      <ul>
        <li>
          You can cancel an order yourself from <strong>My Orders</strong> at any time before it has
          been shipped, at no charge.
        </li>
        <li>
          Once an order has shipped it can no longer be cancelled — you can refuse delivery or raise
          a return once it arrives.
        </li>
        <li>
          We may cancel an order if the item is out of stock, the delivery address is not
          serviceable, or we detect fraudulent activity. You will be refunded in full.
        </li>
      </ul>

      <h2>2. Returns</h2>
      <ul>
        <li>
          Return requests must be raised within <strong>7 days</strong> of delivery.
        </li>
        <li>
          Items must be unused and unwashed, with all original tags and packaging intact.
        </li>
        <li>
          For hygiene reasons, innerwear and pierced jewellery cannot be returned unless the item is
          damaged or incorrect.
        </li>
        <li>
          If you received a damaged, defective or incorrect item, contact us within 48 hours of
          delivery and we will arrange a free replacement or full refund.
        </li>
      </ul>

      <h2>3. Refund Timelines</h2>
      <p>
        Refunds are initiated once the returned item reaches us and passes a quality check
        (typically 2–3 business days after pickup).
      </p>
      <ul>
        <li>
          <strong>Online payments</strong> — credited back to the original payment method within
          5–7 business days of initiation.
        </li>
        <li>
          <strong>Cash on Delivery</strong> — credited to a bank account you provide, within 5–7
          business days of initiation.
        </li>
      </ul>
      <p>
        The time taken for the amount to reflect in your account depends on your bank or card
        issuer and is outside our control.
      </p>

      <h2>4. Shipping Charges</h2>
      <p>
        Standard delivery is free. Where a return is due to our error (damaged, defective or wrong
        item), return pickup is also free. For change-of-mind returns, a pickup fee may be deducted
        from the refund; the amount will be shown before you confirm the return.
      </p>

      <h2>5. Exchanges</h2>
      <p>
        Size or colour exchanges are subject to availability. If the replacement is unavailable, the
        return is processed as a refund instead.
      </p>

      <h2>6. How to Raise a Request</h2>
      <p>
        Go to <strong>My Orders</strong> and select the order, or email{" "}
        <a href={`mailto:${BUSINESS_INFO.supportEmail}`} className="text-rose-700 underline">
          {BUSINESS_INFO.supportEmail}
        </a>{" "}
        with your order ID. If your concern isn&apos;t resolved to your satisfaction, you can
        escalate to our Grievance Officer — see the{" "}
        <Link href="/shop/grievance" className="text-rose-700 underline">
          Grievance Redressal
        </Link>{" "}
        page.
      </p>

      <p className="text-xs text-neutral-500">
        Wholesale/bulk orders are governed separately — see the Wholesale Terms. Bulk orders already
        in production may not be cancellable.
      </p>
    </ContentPage>
  );
}
