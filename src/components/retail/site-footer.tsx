import Link from "next/link";
import { BUSINESS_INFO } from "@/lib/business-info";

const FOOTER_LINKS = [
  { href: "/shop/about", label: "About Us" },
  { href: "/shop/contact", label: "Contact" },
  { href: "/shop/faq", label: "FAQ" },
  { href: "/shop/shipping-policy", label: "Shipping Policy" },
  { href: "/shop/refund-policy", label: "Refund & Cancellation" },
  { href: "/shop/terms", label: "Terms of Service" },
  { href: "/shop/privacy", label: "Privacy Policy" },
  { href: "/shop/grievance", label: "Grievance Redressal" },
];

export function RetailSiteFooter() {
  return (
    <footer className="mt-16 border-t border-neutral-200 bg-white">
      <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-10 text-sm text-neutral-500 sm:px-6">
        <div className="flex flex-wrap gap-x-6 gap-y-2">
          {FOOTER_LINKS.map((link) => (
            <Link key={link.href} href={link.href} className="hover:text-rose-700">
              {link.label}
            </Link>
          ))}
        </div>
        <div className="flex flex-wrap gap-6 border-t border-neutral-100 pt-4">
          <Link href="/wholesale" className="hover:text-rose-700">
            Sell wholesale on GarmentVibes &rarr;
          </Link>
        </div>
        <div className="border-t border-neutral-100 pt-4 text-xs text-neutral-500">
          <p>
            &copy; {new Date().getFullYear()} GarmentVibes — operated by {BUSINESS_INFO.legalName}.
            All rights reserved.
          </p>
          <p className="mt-1">GSTIN {BUSINESS_INFO.gstin}</p>
        </div>
      </div>
    </footer>
  );
}
