import Link from "next/link";
import { ContentPage } from "@/components/shared/content-page";
import { BUSINESS_INFO } from "@/lib/business-info";

export const metadata = {
  title: "Grievance Redressal",
  description:
    "How to escalate an unresolved complaint to the GarmentVibes Grievance Officer, and the response times we commit to.",
};

export default function GrievancePage() {
  const { grievanceOfficer: officer } = BUSINESS_INFO;

  return (
    <ContentPage title="Grievance Redressal" accent="text-rose-700">
      <p>
        In accordance with the Consumer Protection (E-Commerce) Rules, 2020 and the Information
        Technology Act, 2000, the contact details of our Grievance Officer are published below.
      </p>

      <div className="rounded-lg border border-neutral-200 bg-white p-5 not-prose">
        <h2 className="text-base font-semibold text-neutral-900">{officer.designation}</h2>
        <dl className="mt-3 space-y-1.5 text-sm">
          <div className="flex gap-2">
            <dt className="w-24 shrink-0 text-neutral-500">Name</dt>
            <dd className="text-neutral-800">{officer.name}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="w-24 shrink-0 text-neutral-500">Entity</dt>
            <dd className="text-neutral-800">{BUSINESS_INFO.legalName}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="w-24 shrink-0 text-neutral-500">Email</dt>
            <dd>
              <a href={`mailto:${officer.email}`} className="text-rose-700 underline">
                {officer.email}
              </a>
            </dd>
          </div>
          <div className="flex gap-2">
            <dt className="w-24 shrink-0 text-neutral-500">Phone</dt>
            <dd className="text-neutral-800">{BUSINESS_INFO.supportPhone}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="w-24 shrink-0 text-neutral-500">Address</dt>
            <dd className="text-neutral-800">{BUSINESS_INFO.address}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="w-24 shrink-0 text-neutral-500">Hours</dt>
            <dd className="text-neutral-800">{BUSINESS_INFO.supportHours}</dd>
          </div>
        </dl>
      </div>

      <h2>How we handle complaints</h2>
      <ol className="list-decimal space-y-1 pl-5">
        <li>
          <strong>Try support first.</strong> Most issues — delivery delays, returns, refunds — are
          resolved fastest by emailing{" "}
          <a href={`mailto:${BUSINESS_INFO.supportEmail}`} className="text-rose-700 underline">
            {BUSINESS_INFO.supportEmail}
          </a>{" "}
          with your order ID.
        </li>
        <li>
          <strong>Escalate if unresolved.</strong> Write to the Grievance Officer above with your
          order ID, a description of the issue, and any prior correspondence.
        </li>
        <li>
          <strong>Acknowledgement.</strong> We acknowledge every complaint within{" "}
          {officer.responseWindow}.
        </li>
        <li>
          <strong>Resolution.</strong> We aim to resolve complaints within {officer.resolutionWindow}{" "}
          of receipt, as required under the rules.
        </li>
      </ol>

      <h2>What to include</h2>
      <ul>
        <li>Your name and registered email/phone</li>
        <li>Order ID (if applicable)</li>
        <li>A clear description of the issue and what outcome you&apos;re seeking</li>
        <li>Supporting photos, for damaged or incorrect items</li>
      </ul>

      <p className="text-xs text-neutral-500">
        Related: <Link href="/shop/refund-policy" className="underline">Refund &amp; Cancellation
        Policy</Link>, <Link href="/shop/shipping-policy" className="underline">Shipping Policy</Link>,{" "}
        <Link href="/shop/terms" className="underline">Terms of Service</Link>.
      </p>
    </ContentPage>
  );
}
