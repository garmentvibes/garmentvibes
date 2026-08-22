"use client";

import { use } from "react";
import Link from "next/link";
import { WholesaleProductForm } from "@/components/admin/wholesale-product-form";
import { useAdminWholesaleProduct } from "@/lib/stores/admin-catalog-store";
import { useHasMounted } from "@/lib/hooks/use-has-mounted";

export default function EditWholesaleProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const mounted = useHasMounted();
  const product = useAdminWholesaleProduct(id);

  // Locally-created products only exist after the store rehydrates, so avoid
  // flashing "not found" during the first render.
  if (!mounted) return null;

  if (!product) {
    return (
      <div className="mx-auto max-w-3xl py-16 text-center">
        <p className="text-neutral-500">Product not found.</p>
        <Link href="/admin/products" className="mt-4 inline-block text-sm underline">
          Back to products
        </Link>
      </div>
    );
  }

  return <WholesaleProductForm product={product} />;
}
