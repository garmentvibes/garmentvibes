"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Tag, Truck, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useCartStore, cartTotals } from "@/lib/stores/cart-store";
import { useAddressStore } from "@/lib/stores/address-store";
import { useSessionStore } from "@/lib/stores/session-store";
import { useHasMounted } from "@/lib/hooks/use-has-mounted";
import { cn, formatPrice, generateReferenceId } from "@/lib/utils";
import { track } from "@/lib/analytics";
import { notify } from "@/lib/stores/notification-store";
import { usePromoStore, promoPercentFromStore } from "@/lib/stores/promo-store";
import { useNow } from "@/lib/hooks/use-now";
import { computeGst } from "@/lib/gst";
import { getRetailProductById } from "@/lib/mock/retail-products";
import { reportError } from "@/lib/analytics";
import {
  createPaymentOrder,
  loadRazorpayScript,
  openRazorpayCheckout,
} from "@/lib/razorpay/checkout-client";

// Public key id. Safe in the bundle — it identifies the merchant and cannot
// authorise anything on its own. The secret stays server-side.
const RAZORPAY_KEY_ID = process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID ?? "";

const checkoutSchema = z.object({
  fullName: z.string().min(2, "Enter your full name"),
  phone: z.string().min(10, "Enter a valid phone number"),
  addressLine1: z.string().min(5, "Enter your address"),
  city: z.string().min(2, "Enter your city"),
  state: z.string().min(2, "Enter your state"),
  pincode: z.string().min(4, "Enter a valid PIN code"),
});

type CheckoutForm = z.infer<typeof checkoutSchema>;

export default function CheckoutPage() {
  const router = useRouter();
  const mounted = useHasMounted();
  const user = useSessionStore((s) => s.user);
  const lines = useCartStore((s) => s.lines);
  const clear = useCartStore((s) => s.clear);
  const addresses = useAddressStore((s) => s.addresses);
  const promoCodes = usePromoStore((s) => s.codes);
  const now = useNow();
  const { totalItems, totalPrice } = cartTotals(lines);

  // Fire once the persisted cart has hydrated, so the event carries the real
  // basket rather than the empty pre-hydration one.
  const checkoutStarted = useRef(false);
  useEffect(() => {
    if (!mounted || checkoutStarted.current || lines.length === 0) return;
    checkoutStarted.current = true;
    track({ name: "begin_checkout", itemCount: totalItems, value: totalPrice });
  }, [mounted, lines.length, totalItems, totalPrice]);

  const [promoInput, setPromoInput] = useState("");
  const [appliedPromo, setAppliedPromo] = useState<{ code: string; percent: number } | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<"online" | "cod">("online");

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<CheckoutForm>({ resolver: zodResolver(checkoutSchema) });

  function applyPromo() {
    const code = promoInput.trim().toUpperCase();
    // Reads the managed list, so a code deactivated or expired in admin stops
    // working immediately rather than at the next deploy.
    const percent = promoPercentFromStore(promoCodes, code, now ?? 0);
    if (!percent) {
      toast.error("Invalid or expired promo code");
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

  // Prices already include GST, so this is the tax contained in what the
  // customer pays — shown for transparency, never added on top. A promo
  // reduces the amount charged, so it reduces the tax within it; each line
  // is scaled by the same ratio before the split, since rates differ by
  // per-piece price and a single blended rate would be wrong.
  const includedGst =
    totalPrice === 0
      ? 0
      : computeGst(
          lines.map((line) => ({
            name: line.name,
            qty: line.qty,
            price: Math.round((line.price * finalTotal) / totalPrice),
            subcategory: getRetailProductById(line.productId)?.subcategory,
          })),
          // Place of supply only decides CGST+SGST vs IGST; the total tax is
          // the same either way, and that total is all this line shows.
          ""
        ).totalTax;

  /** Shared tail of every successful order, however it was paid for. */
  function completeOrder(data: CheckoutForm, orderId: string) {
    track({ name: "purchase", orderId, value: finalTotal, paymentMethod });
    notify({
      templateId: "order_placed",
      recipientName: data.fullName,
      email: user?.email ?? "",
      phone: data.phone,
      relatedTo: orderId,
      vars: { name: data.fullName, orderId, amount: formatPrice(finalTotal) },
    });
    clear();
    router.push(`/shop/order-confirmation?order=${orderId}&method=${paymentMethod}`);
  }

  async function onSubmit(data: CheckoutForm) {
    // Cash on Delivery takes no payment now, so it never touches the gateway.
    if (paymentMethod === "cod") {
      completeOrder(data, generateReferenceId("GV"));
      return;
    }

    // Online payment. The server prices the order and creates the Razorpay
    // order; a 503 means no keys are configured on this deployment, which is
    // the current state, so we fall back to the simulated flow rather than
    // dead-ending the customer.
    let handoff;
    try {
      handoff = await createPaymentOrder({
        items: lines.map((line) => ({ productId: line.productId, qty: line.qty })),
        promoCode: appliedPromo?.code,
      });
    } catch (error) {
      reportError(error, "razorpay-create-order");
      toast.error(error instanceof Error ? error.message : "Could not start the payment");
      return;
    }

    if (!handoff) {
      completeOrder(data, generateReferenceId("GV"));
      return;
    }

    const scriptReady = await loadRazorpayScript();
    if (!scriptReady) {
      toast.error("Could not reach the payment provider. Check your connection and try again.");
      return;
    }

    try {
      const result = await openRazorpayCheckout({
        keyId: RAZORPAY_KEY_ID,
        handoff,
        customer: { name: data.fullName, email: user?.email ?? "", contact: data.phone },
      });

      if (!result.paid) {
        // Covers both a dismissed modal and a payment the server would not
        // verify. Nothing is cleared, so the cart survives a retry.
        toast.error("Payment was not completed. Your bag is still here.");
        return;
      }

      completeOrder(data, handoff.receipt);
    } catch (error) {
      reportError(error, "razorpay-checkout");
      toast.error("Something went wrong during payment. You have not been charged twice.");
    }
  }

  // Not signed in yet — require an account before checkout (guest checkout
  // isn't supported, per product decision).
  if (!mounted) return null;
  if (!user || user.role !== "retail") {
    return (
      <div className="mx-auto max-w-sm px-4 py-20 text-center sm:px-6">
        <h1 className="text-xl font-bold text-neutral-900">Sign in to check out</h1>
        <p className="mt-2 text-neutral-500">
          Create an account or sign in to save your address and complete your order.
        </p>
        <Link href="/shop/login?redirect=/shop/checkout">
          <Button variant="retail" className="mt-6 w-full">
            Sign In
          </Button>
        </Link>
        <Link href="/shop/signup?redirect=/shop/checkout">
          <Button variant="outline" className="mt-2 w-full">
            Create Account
          </Button>
        </Link>
      </div>
    );
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

          <h2 className="pt-2 font-semibold text-neutral-900">Payment Method</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => setPaymentMethod("online")}
              className={cn(
                "flex items-center gap-3 rounded-md border p-3 text-left text-sm",
                paymentMethod === "online" ? "border-rose-600 bg-rose-50" : "border-neutral-300"
              )}
            >
              <Wallet className="h-5 w-5 text-rose-600" />
              <div>
                <p className="font-medium text-neutral-900">Pay Online</p>
                <p className="text-xs text-neutral-500">UPI, Cards, Netbanking via Razorpay</p>
              </div>
            </button>
            <button
              type="button"
              onClick={() => setPaymentMethod("cod")}
              className={cn(
                "flex items-center gap-3 rounded-md border p-3 text-left text-sm",
                paymentMethod === "cod" ? "border-rose-600 bg-rose-50" : "border-neutral-300"
              )}
            >
              <Truck className="h-5 w-5 text-rose-600" />
              <div>
                <p className="font-medium text-neutral-900">Cash on Delivery</p>
                <p className="text-xs text-neutral-500">Pay when your order arrives</p>
              </div>
            </button>
          </div>

          <div className="rounded-md border border-dashed border-neutral-300 bg-neutral-50 p-4 text-sm text-neutral-500">
            {paymentMethod === "online"
              ? RAZORPAY_KEY_ID
                ? "You'll be taken to Razorpay to complete payment securely. Cards, UPI, net banking and wallets are supported."
                : "Razorpay is integrated but no merchant keys are configured on this deployment, so placing an order here simulates a successful payment."
              : "You'll pay in cash to the delivery agent when your order arrives."}
          </div>

          <Button type="submit" variant="retail" size="lg" className="w-full" disabled={isSubmitting}>
            {paymentMethod === "cod" ? "Place Order (COD)" : "Place Order"} &middot; {formatPrice(finalTotal)}
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
          <p className="mt-1 text-xs text-neutral-400">
            Inclusive of GST {formatPrice(includedGst)}
          </p>
        </div>
      </div>
    </div>
  );
}
