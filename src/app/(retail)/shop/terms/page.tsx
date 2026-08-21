import Link from "next/link";
import { ContentPage } from "@/components/shared/content-page";
import { BUSINESS_INFO } from "@/lib/business-info";

export const metadata = {
  title: "Terms of Service",
  description:
    "The terms you agree to when buying from GarmentVibes, covering orders, pricing, delivery and liability.",
};

export default function TermsPage() {
  return (
    <ContentPage title="Terms of Service" subtitle="Last updated: August 2026" accent="text-rose-700">
      <p>
        By using GarmentVibes, you agree to the terms below. Please read them carefully before placing
        an order.
      </p>
      <p className="text-xs text-neutral-400">
        GarmentVibes is operated by {BUSINESS_INFO.legalName} (proprietor {BUSINESS_INFO.proprietor}),
        GSTIN {BUSINESS_INFO.gstin}, registered at {BUSINESS_INFO.address}.
      </p>
      <h2>1. Orders &amp; Pricing</h2>
      <p>
        All prices are listed in Indian Rupees (INR) and are inclusive of applicable taxes unless
        stated otherwise. We reserve the right to correct pricing errors and cancel orders placed at
        an incorrect price.
      </p>
      <h2>2. Payments</h2>
      <p>
        Payment processing is currently in a simulated mode while our payment integration is being
        completed. No real charges are made yet.
      </p>
      <h2>3. Shipping</h2>
      <p>
        Delivery timelines are estimates and may vary due to courier delays, weather, or regional
        restrictions. See our Shipping Policy for details.
      </p>
      <h2>4. Returns &amp; Cancellations</h2>
      <p>
        Orders can be cancelled before shipping, and eligible items returned within 7 days of
        delivery. Full details, including refund timelines, are in our{" "}
        <Link href="/shop/refund-policy" className="text-rose-600 underline">
          Refund &amp; Cancellation Policy
        </Link>
        .
      </p>

      <h2>5. Account Responsibility</h2>
      <p>
        You are responsible for maintaining the confidentiality of your account credentials and for
        all activity under your account.
      </p>
      <h2>6. Grievance Redressal</h2>
      <p>
        For complaints that support cannot resolve, contact details for our Grievance Officer are
        published on the{" "}
        <Link href="/shop/grievance" className="text-rose-600 underline">
          Grievance Redressal
        </Link>{" "}
        page, as required under the Consumer Protection (E-Commerce) Rules, 2020.
      </p>
      <h2>7. Changes to These Terms</h2>
      <p>We may update these terms from time to time. Continued use of the site means you accept the changes.</p>
    </ContentPage>
  );
}
