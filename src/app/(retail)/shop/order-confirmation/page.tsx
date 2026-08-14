import { Suspense } from "react";
import Link from "next/link";
import { CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { OrderIdLabel } from "./order-id-label";

export const metadata = { title: "Order Confirmed" };

export default function OrderConfirmationPage() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-24 text-center sm:px-6">
      <CheckCircle2 className="mx-auto h-14 w-14 text-green-600" />
      <h1 className="mt-4 text-2xl font-bold text-neutral-900">Order placed!</h1>
      <Suspense fallback={null}>
        <OrderIdLabel />
      </Suspense>
      <p className="mt-2 text-neutral-500">
        We&apos;ve received your order and will notify you once it ships.
      </p>
      <Link href="/shop">
        <Button variant="retail" className="mt-6">
          Continue Shopping
        </Button>
      </Link>
    </div>
  );
}
