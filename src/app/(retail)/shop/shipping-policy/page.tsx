import { ContentPage } from "@/components/shared/content-page";

export const metadata = { title: "Shipping Policy" };

export default function ShippingPolicyPage() {
  return (
    <ContentPage title="Shipping Policy" accent="text-rose-700">
      <h2>Delivery Timelines</h2>
      <ul>
        <li>Metro cities: 2-4 business days</li>
        <li>Other cities &amp; towns: 4-7 business days</li>
        <li>Remote areas: 7-10 business days</li>
      </ul>
      <h2>Shipping Charges</h2>
      <p>Standard delivery is free on all orders. Expedited shipping options may be added in the future.</p>
      <h2>Order Tracking</h2>
      <p>
        Once your order ships, you can track its status from the My Orders section of your account.
      </p>
      <h2>Delays</h2>
      <p>
        Delivery estimates may occasionally be affected by weather, courier availability, or regional
        restrictions. We&apos;ll notify you by email if your order is significantly delayed.
      </p>
    </ContentPage>
  );
}
