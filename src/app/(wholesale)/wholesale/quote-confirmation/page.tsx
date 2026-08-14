import { Suspense } from "react";
import Link from "next/link";
import { CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { QuoteRefLabel } from "./quote-ref-label";

export const metadata = { title: "Request Received" };

export default function QuoteConfirmationPage() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-24 text-center sm:px-6">
      <CheckCircle2 className="mx-auto h-14 w-14 text-blue-700" />
      <h1 className="mt-4 text-2xl font-bold text-slate-900">Request received!</h1>
      <Suspense fallback={null}>
        <QuoteRefLabel />
      </Suspense>
      <p className="mt-2 text-slate-500">
        Our wholesale team will confirm pricing and lead time within one business day.
      </p>
      <Link href="/wholesale">
        <Button variant="wholesale" className="mt-6">
          Back to Catalog
        </Button>
      </Link>
    </div>
  );
}
