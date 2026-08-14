import { ContentPage } from "@/components/shared/content-page";

export const metadata = { title: "Privacy Policy" };

export default function PrivacyPage() {
  return (
    <ContentPage title="Privacy Policy" subtitle="Last updated: August 2026" accent="text-rose-700">
      <p>
        Your privacy matters to us. This page explains what information we collect and how we use it.
      </p>
      <h2>Information We Collect</h2>
      <ul>
        <li>Account details: name, email, phone number</li>
        <li>Order details: delivery address, order history</li>
        <li>Usage data: pages viewed, products browsed (used to improve recommendations)</li>
      </ul>
      <h2>How We Use Your Information</h2>
      <p>
        We use your information to process orders, provide customer support, and improve your
        shopping experience. We do not sell your personal data to third parties.
      </p>
      <h2>Data Storage</h2>
      <p>
        Your data is stored securely. Right now, the storefront is running with placeholder local
        data while our backend is being finalized — no real account data is being persisted to a
        server yet.
      </p>
      <h2>Your Rights</h2>
      <p>
        You can request access to, correction of, or deletion of your personal data at any time by
        contacting support@garmentvibes.com.
      </p>
      <h2>Cookies</h2>
      <p>We use essential cookies/local storage to keep you signed in and remember your cart and wishlist.</p>
    </ContentPage>
  );
}
