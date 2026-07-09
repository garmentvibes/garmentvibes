import Link from "next/link";
import { Badge } from "@/components/ui/badge";

export default function WholesaleHomePage() {
  return (
    <div className="mx-auto flex max-w-2xl flex-col items-center gap-4 px-6 py-24 text-center">
      <Badge variant="wholesale">Wholesale</Badge>
      <h1 className="text-3xl font-bold">The B2B wholesale portal lands here</h1>
      <p className="text-neutral-600">
        Bulk catalog, tiered pricing, quick-order by SKU, quote requests and account dashboard are
        coming in the next build phase.
      </p>
      <Link href="/" className="text-sm text-blue-700 underline underline-offset-4">
        &larr; Back to GarmentVibes home
      </Link>
    </div>
  );
}
