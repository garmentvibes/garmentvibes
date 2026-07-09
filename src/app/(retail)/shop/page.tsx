import Link from "next/link";
import { Badge } from "@/components/ui/badge";

export default function ShopHomePage() {
  return (
    <div className="mx-auto flex max-w-2xl flex-col items-center gap-4 px-6 py-24 text-center">
      <Badge variant="retail">Retail</Badge>
      <h1 className="text-3xl font-bold">The retail storefront lands here</h1>
      <p className="text-neutral-600">
        Home banners, category browsing, product listings, cart and checkout are coming in the
        next build phase.
      </p>
      <Link href="/" className="text-sm text-rose-600 underline underline-offset-4">
        &larr; Back to GarmentVibes home
      </Link>
    </div>
  );
}
