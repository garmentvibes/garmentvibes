"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Tag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useCartStore, cartTotals } from "@/lib/stores/cart-store";
import { useAddressStore } from "@/lib/stores/address-store";
import { formatPrice, generateReferenceId } from "@/lib/utils";

const checkoutSchema = z.object({
  fullName: z.string().min(2, "Enter your full name"),
  phone: z.string().min(10, "Enter a valid phone number"),
  addressLine1: z.string().min(5, "Enter your address"),
  city: z.string().min(2, "Enter your city"),
  state: z.string().min(2, "Enter your state"),
  pincode: z.string().min(4, "Enter a valid PIN code"),
});

type CheckoutForm = z.infer<typeof checkoutSchema>;

const PROMO_CODES: Record<string, number> = {
  GARMENT10: 10,
  WELCOME5: 5,
};

export default function CheckoutPage() {
  const router = useRouter();
  const lines = useCartStore((s) => s.lines);
  const clear = useCartStore((s) => s.clear);
  const addresses = useAddressStore((s) => s.addresses);
  const { totalItems, totalPrice } = cartTotals(lines);

  const [promoInput, setPromoInput] = useState("");
  const [appliedPromo, setAppliedPromo] = useState<{ code: string; percent: number } | null>(null);

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<CheckoutForm>({ resolver: zodResolver(checkoutSchema) });

  function applyPromo() {
    const code = promoInput.trim().toUpperCase();
    const percent = PROMO_CODES[code];
    if (!percent) {
      toast.error("Invalid promo code");
      return;
    }
    setAppliedPromo({ code, percent });
    toast.success(`${code} applied — ${percent}% off`);
  }

  function fillFromSavedAddress(id: string) {
    const addr = addresses.find((a) => a.id === id);
    if (!addr) return;
    setValue("fullName", addr.fullName);
    setValue("phone", addr.phone);
    setValue("addressLine1", addr.addressLine1);
    setValue("city", addr.city);
    setValue("state", addr.state);
    setValue("pincode", addr.pincode);
  }

  const discount = appliedPromo ? Math.round((totalPrice * appliedPromo.percent) / 100) : 0;
  const finalTotal = totalPrice - discount;

  function onSubmit() {
    // Payments (Stripe / Razorpay) are stubbed for now — Phase 5 wires real checkout.
    const orderId = generateReferenceId("GV");
    clear();
    router.push(`/shop/order-confirmation?order=${orderId}`);
  }

  if (lines.length === 0) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-20 text-center sm:px-6">
        <p className="text-neutral-500">Your bag is empty. Add something before checking out.</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <h1 className="text-2xl font-bold text-neutral-900">Checkout</h1>

      <div className="mt-6 grid grid-cols-1 gap-8 lg:grid-cols-3">
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 lg:col-span-2">
          <h2 className="font-semibold text-neutral-900">Delivery Address</h2>

          {addresses.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {addresses.map((addr) => (
                <button
                  key={addr.id}
                  type="button"
                  onClick={() => fillFromSavedAddress(addr.id)}
                  className="rounded-full border border-neutral-300 px-3 py-1 text-xs font-medium text-neutral-600 hover:border-rose-400 hover:text-rose-600"
                >
                  Use {addr.label}
                </button>
              ))}
              <Link href="/shop/addresses" className="text-xs text-neutral-400 underline underline-offset-2">
                Manage addresses
              </Link>
            </div>
          )}

          <div>
            <Label htmlFor="fullName">Full name</Label>
            <Input id="fullName" {...register("fullName")} />
            {errors.fullName && <p className="mt-1 text-xs text-red-600">{errors.fullName.message}</p>}
          </div>

          <div>
            <Label htmlFor="phone">Phone number</Label>
            <Input id="phone" type="tel" {...register("phone")} />
            {errors.phone && <p className="mt-1 text-xs text-red-600">{errors.phone.message}</p>}
          </div>

          <div>
            <Label htmlFor="addressLine1">Address</Label>
            <Input id="addressLine1" {...register("addressLine1")} />
            {errors.addressLine1 && (
              <p className="mt-1 text-xs text-red-600">{errors.addressLine1.message}</p>
            )}
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label htmlFor="city">City</Label>
              <Input id="city" {...register("city")} />
              {errors.city && <p className="mt-1 text-xs text-red-600">{errors.city.message}</p>}
            </div>
            <div>
              <Label htmlFor="state">State</Label>
              <Input id="state" {...register("state")} />
              {errors.state && <p className="mt-1 text-xs text-red-600">{errors.state.message}</p>}
            </div>
            <div>
              <Label htmlFor="pincode">PIN code</Label>
              <Input id="pincode" {...register("pincode")} />
              {errors.pincode && <p className="mt-1 text-xs text-red-600">{errors.pincode.message}</p>}
            </div>
          </div>

          <div className="rounded-md border border-dashed border-neutral-300 bg-neutral-50 p-4 text-sm text-neutral-500">
            Payment method: Stripe / Razorpay checkout is coming in a later build phase. Placing an
            order here simulates a successful payment.
          </div>

          <Button type="submit" variant="retail" size="lg" className="w-full" disabled={isSubmitting}>
            Place Order &middot; {formatPrice(finalTotal)}
          </Button>
        </form>

        <div className="h-fit rounded-lg border border-neutral-200 bg-white p-5">
          <h2 className="font-semibold text-neutral-900">Order Summary</h2>
          <ul className="mt-3 space-y-2 text-sm text-neutral-600">
            {lines.map((line) => (
              <li key={line.key} className="flex justify-between">
                <span className="truncate pr-2">
                  {line.name} ({line.size}) &times; {line.qty}
                </span>
                <span>{formatPrice(line.price * line.qty)}</span>
              </li>
            ))}
          </ul>

          <div className="mt-3 border-t border-neutral-200 pt-3">
            {appliedPromo ? (
              <div className="flex items-center justify-between text-sm text-green-700">
                <span className="flex items-center gap-1">
                  <Tag className="h-3.5 w-3.5" /> {appliedPromo.code} applied
                </span>
                <button type="button" onClick={() => setAppliedPromo(null)} className="text-xs underline">
                  Remove
                </button>
              </div>
            ) : (
              <div className="flex gap-2">
                <Input
                  placeholder="Promo code"
                  value={promoInput}
                  onChange={(e) => setPromoInput(e.target.value)}
                  className="h-9"
                />
                <Button type="button" variant="outline" size="sm" onClick={applyPromo}>
                  Apply
                </Button>
              </div>
            )}
          </div>

          <div className="mt-3 flex justify-between text-sm text-neutral-600">
            <span>Subtotal</span>
            <span>{formatPrice(totalPrice)}</span>
          </div>
          {discount > 0 && (
            <div className="mt-1 flex justify-between text-sm text-green-700">
              <span>Discount</span>
              <span>-{formatPrice(discount)}</span>
            </div>
          )}
          <div className="mt-3 flex justify-between border-t border-neutral-200 pt-3 font-semibold text-neutral-900">
            <span>Total ({totalItems} items)</span>
            <span>{formatPrice(finalTotal)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
