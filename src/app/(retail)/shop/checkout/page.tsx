"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { phoneField, pincodeField } from "@/lib/validation/address";
import { toast } from "sonner";
import { Tag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useCartStore, cartTotals } from "@/lib/stores/cart-store";
import { useAddressStore } from "@/lib/stores/address-store";
import { useSessionStore } from "@/lib/stores/session-store";
import { useHasMounted } from "@/lib/hooks/use-has-mounted";
import { formatPrice, generateReferenceId } from "@/lib/utils";
import { track } from "@/lib/analytics";
import { notify } from "@/lib/stores/notification-store";
import { usePromoStore } from "@/lib/stores/promo-store";
import { useReferralStore, referralsUsedBy } from "@/lib/stores/referral-store";
import { evaluatePromo } from "@/lib/promo-eligibility";
import { checkReferral, rewardCodeFor, REFERRAL_FRIEND_PERCENT } from "@/lib/referrals";
import { useNow } from "@/lib/hooks/use-now";
import { computeGst } from "@/lib/gst";
import { isServerPriceable } from "@/lib/pricing";
import { placeRetailOrder, releaseRetailOrder } from "@/lib/orders/actions";
import { getRetailProductById } from "@/lib/mock/retail-products";
import { reportError } from "@/lib/analytics";
import {
  createPaymentOrder,
  loadRazorpayScript,
  openRazorpayCheckout,
} from "@/lib/razorpay/checkout-client";
import {
  codFee,
  paymentMethods,
  razorpayMethod,
  resolveSelection,
  type PaymentMethodId,
} from "@/lib/payment-methods";
import { PaymentMethodPicker } from "@/components/retail/payment-method-picker";

// Public key id. Safe in the bundle — it identifies the merchant and cannot
// authorise anything on its own. The secret stays server-side.
const RAZORPAY_KEY_ID = process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID ?? "";

const checkoutSchema = z.object({
  fullName: z.string().min(2, "Enter your full name"),
  phone: phoneField,
  addressLine1: z.string().min(5, "Enter your address"),
  city: z.string().min(2, "Enter your city"),
  state: z.string().min(2, "Enter your state"),
  pincode: pincodeField,
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
  const promoRedemptions = usePromoStore((s) => s.redemptions);
  const redeemPromo = usePromoStore((s) => s.redeem);
  const issuePromo = usePromoStore((s) => s.add);
  const referrals = useReferralStore((s) => s.referrals);
  const knownEmails = useReferralStore((s) => s.knownEmails);
  const recordReferral = useReferralStore((s) => s.record);
  const markRewarded = useReferralStore((s) => s.markRewarded);
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
  const [appliedPromo, setAppliedPromo] = useState<{
    code: string;
    percent: number;
    /** Set when the code was a referral rather than a campaign code. */
    referrer?: string;
  } | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethodId | null>(null);

  const {
    register,
    handleSubmit,
    setValue,
    control,
    formState: { errors, isSubmitting },
  } = useForm<CheckoutForm>({ resolver: zodResolver(checkoutSchema) });

  // Availability depends on the PIN code, so it has to be watched rather than
  // read at submit time: a customer who types a remote PIN code with COD
  // selected must see the option withdrawn while they can still react to it.
  //
  // useWatch rather than watch(): watch() returns a fresh function on every
  // render, which makes React Compiler skip memoising this entire component.
  const pincode = useWatch({ control, name: "pincode" }) ?? "";

  function applyPromo() {
    const code = promoInput.trim().toUpperCase();

    // A referral code is not a promo code — it identifies a person rather
    // than a campaign — so it is resolved first and, if it matches, applied
    // on its own terms.
    const referral = checkReferral({
      code,
      customerEmail: user?.email ?? "",
      knownCustomerEmails: knownEmails,
      alreadyUsed: referralsUsedBy(referrals, user?.email ?? ""),
      // The mock order history is shared, so nobody looks like a first-time
      // buyer. Treated as new here; the real check is `exists(select 1 from
      // retail_orders where user_id = ...)` once orders are in the database.
      hasOrderedBefore: false,
    });

    if (referral.ok && referral.referrerEmail) {
      setAppliedPromo({ code, percent: REFERRAL_FRIEND_PERCENT, referrer: referral.referrerEmail });
      toast.success(`Referral applied — ${REFERRAL_FRIEND_PERCENT}% off your first order`);
      return;
    }

    // A code that looks like a referral but was refused should say why,
    // rather than falling through to "we don't recognise that code".
    if (referral.reason && referral.reason !== "unknown") {
      toast.error(referral.error);
      return;
    }

    // Reads the managed list, so a code deactivated or expired in admin stops
    // working immediately rather than at the next deploy.
    const result = evaluatePromo({
      input: code,
      codes: promoCodes,
      redemptions: promoRedemptions,
      customerEmail: user?.email,
      now: now ?? Date.now(),
    });

    if (!result.ok) {
      toast.error(result.error);
      return;
    }

    setAppliedPromo({ code, percent: result.percent });
    toast.success(`${code} applied — ${result.percent}% off`);
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

  // Derived, not stored. Storing the resolved selection would mean keeping it
  // in sync with the PIN code through an effect, and the window where it is
  // stale is exactly the window where someone submits an order paid by a
  // method we have just withdrawn.
  const methodOptions = paymentMethods({
    total: finalTotal,
    pincode,
    gatewayConfigured: Boolean(RAZORPAY_KEY_ID),
    // Admin-created and referral codes are quoted here but cannot be priced
    // by the payment route, so the gateway would charge full list. Rather
    // than dropping the discount or overcharging, online payment steps aside
    // and COD collects the figure on the screen.
    promoBlocksOnline: Boolean(appliedPromo) && !isServerPriceable(appliedPromo?.code),
  });
  const selectedMethod = resolveSelection(methodOptions, paymentMethod);
  // resolveSelection returns a method even when none is available, so that its
  // return type stays honest. Whether anything is actually selectable is a
  // separate question, and it gates the submit button.
  const hasSelectableMethod = methodOptions.some((option) => option.available);
  const codCharge = selectedMethod === "cod" ? codFee(finalTotal) : 0;
  const amountPayable = finalTotal + codCharge;

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

  /**
   * Settles whatever code was applied, at order time rather than at "Apply".
   *
   * Recording a redemption when the code is typed would burn a
   * one-per-customer code for anyone who changes their mind and abandons the
   * checkout — the commonest thing that happens on this page.
   */
  function settlePromo() {
    if (!appliedPromo || !user?.email) return;

    if (appliedPromo.referrer) {
      recordReferral({
        referrerEmail: appliedPromo.referrer,
        friendEmail: user.email,
        code: appliedPromo.code,
      });

      // The referrer earns their reward now, because the referral is only
      // worth anything once the invited customer actually orders.
      const reward = rewardCodeFor(appliedPromo.referrer, user.email);
      issuePromo(reward);
      markRewarded(user.email, reward.code);
      return;
    }

    redeemPromo(appliedPromo.code, user.email);
  }

  /** Shared tail of every successful order, however it was paid for. */
  function completeOrder(data: CheckoutForm, orderId: string) {
    settlePromo();
    track({ name: "purchase", orderId, value: amountPayable, paymentMethod: selectedMethod });
    notify({
      templateId: "order_placed",
      recipientName: data.fullName,
      email: user?.email ?? "",
      phone: data.phone,
      relatedTo: orderId,
      // The amount the customer owes, which for COD includes the handling
      // fee — the figure they will be asked for at the door.
      vars: { name: data.fullName, orderId, amount: formatPrice(amountPayable) },
    });
    clear();
    router.push(`/shop/order-confirmation?order=${orderId}&method=${selectedMethod}`);
  }

  /**
   * Writes the order to the database before any money moves.
   *
   * This is the ordering that makes a payment reconcilable: a gateway order
   * is created against a row that already exists, so a payment can never
   * arrive for something we have no record of. The cost is that stock is
   * taken before the customer has paid, which is why every failure path below
   * releases it again.
   *
   * Returns null when there is no database to place into — the state this
   * deployment is in — and the caller then runs the local-only flow exactly
   * as before.
   */
  async function placeServerSide(data: CheckoutForm) {
    const result = await placeRetailOrder({
      lines,
      address: data,
      customerEmail: user?.email ?? "",
      paymentMethod: selectedMethod,
      promo: appliedPromo ? { code: appliedPromo.code, percent: appliedPromo.percent } : null,
      reference: generateReferenceId("GV"),
    });

    if (result.ok) return result;

    // Two reasons to fall through to the local-only flow rather than stop.
    //
    // `not_configured` — no Supabase project. Expected, and the older path is
    // the whole point of keeping it.
    //
    // `not_signed_in` — there IS a project, but the customer has no Supabase
    // session, because the retail session is still the localStorage mock in
    // session-store.ts. Every retail customer hits this. Treating it as fatal
    // (which this did) breaks checkout outright the first time the app is
    // deployed with Supabase keys set: the customer fills the form, presses
    // Place Order, and is told to sign in when they already have.
    //
    // Falling through keeps the shop working, at the cost of the order not
    // being persisted — which is exactly where things stood before the order
    // was wired up at all, so nothing regresses. It stops being a compromise
    // when retail auth is real; until then the log line is what makes the gap
    // visible rather than silent.
    if (result.reason === "not_configured") return null;
    if (result.reason === "not_signed_in") {
      reportError(
        new Error("Order not persisted: customer has no Supabase session"),
        "place-retail-order"
      );
      return null;
    }

    toast.error(result.error);
    return { failed: true } as const;
  }

  async function onSubmit(data: CheckoutForm) {
    const placed = await placeServerSide(data);
    if (placed && "failed" in placed) return;

    // Cash on Delivery takes no payment now, so it never touches the gateway.
    // place_retail_order() already wrote it as confirmed.
    if (selectedMethod === "cod") {
      completeOrder(data, placed?.reference ?? generateReferenceId("GV"));
      return;
    }

    // Online payment. When the order was placed above, the gateway order is
    // created against it by reference and for its stored total; otherwise the
    // route prices from the catalogue as it always did.
    let handoff;
    try {
      handoff = placed
        ? await createPaymentOrder({ reference: placed.reference })
        : await createPaymentOrder({
            items: lines.map((line) => ({ productId: line.productId, qty: line.qty })),
            promoCode: appliedPromo?.code,
          });
    } catch (error) {
      reportError(error, "razorpay-create-order");
      // The order exists and holds stock, but there is no payment to wait for.
      if (placed) await releaseRetailOrder(placed.orderId);
      toast.error(error instanceof Error ? error.message : "Could not start the payment");
      return;
    }

    // 503: no merchant keys on this deployment, so the payment is simulated.
    // The order stands and is left pending — it has not been paid for, and
    // saying otherwise would put invented revenue in the admin panel.
    if (!handoff) {
      completeOrder(data, placed?.reference ?? generateReferenceId("GV"));
      return;
    }

    const scriptReady = await loadRazorpayScript();
    if (!scriptReady) {
      if (placed) await releaseRetailOrder(placed.orderId);
      toast.error("Could not reach the payment provider. Check your connection and try again.");
      return;
    }

    try {
      const result = await openRazorpayCheckout({
        keyId: RAZORPAY_KEY_ID,
        handoff,
        customer: { name: data.fullName, email: user?.email ?? "", contact: data.phone },
        // Carries the choice already made above into the gateway, so the
        // modal opens on UPI for someone who picked UPI.
        method: razorpayMethod(selectedMethod),
      });

      if (!result.paid) {
        // Covers both a dismissed modal and a payment the server would not
        // verify. The stock goes back — otherwise closing the gateway window
        // would quietly take the last unit of something out of the catalogue
        // for good. Nothing is cleared, so the cart survives a retry.
        if (placed) await releaseRetailOrder(placed.orderId);
        toast.error("Payment was not completed. Your bag is still here.");
        return;
      }

      completeOrder(data, handoff.receipt);
    } catch (error) {
      reportError(error, "razorpay-checkout");
      // Deliberately NOT released. The throw could have come after the money
      // moved, and releasing here would restore stock for an order that was
      // in fact paid for. A pending order with a webhook still to arrive is
      // recoverable; stock invented back onto the shelf is not.
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
          <PaymentMethodPicker
            options={methodOptions}
            selected={selectedMethod}
            onSelect={setPaymentMethod}
          />

          <div className="rounded-md border border-dashed border-neutral-300 bg-neutral-50 p-4 text-sm text-neutral-500">
            {!hasSelectableMethod
              ? "There is no way to pay for this order as it stands. Removing the discount code will bring online payment back."
              : selectedMethod === "cod"
                ? "You'll pay the delivery agent in cash when your order arrives."
                : RAZORPAY_KEY_ID
                  ? "You'll be taken to Razorpay to complete payment securely, opening on the method you chose."
                  : "Razorpay is integrated but no merchant keys are configured on this deployment, so placing an order here simulates a successful payment."}
          </div>

          {/* Disabled when nothing is selectable, which happens on an order
              above the COD ceiling carrying a code the payment route cannot
              price. Leaving it enabled would send the customer into a payment
              the server is about to refuse. */}
          <Button
            type="submit"
            variant="retail"
            size="lg"
            className="w-full"
            disabled={isSubmitting || !hasSelectableMethod}
          >
            {selectedMethod === "cod" ? "Place Order (COD)" : "Place Order"} &middot;{" "}
            {formatPrice(amountPayable)}
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
          {codCharge > 0 && (
            <div className="mt-1 flex justify-between text-sm text-neutral-600">
              <span>Cash on Delivery fee</span>
              <span>+{formatPrice(codCharge)}</span>
            </div>
          )}
          <div className="mt-3 flex justify-between border-t border-neutral-200 pt-3 font-semibold text-neutral-900">
            <span>Total ({totalItems} items)</span>
            <span>{formatPrice(amountPayable)}</span>
          </div>
          <p className="mt-1 text-xs text-neutral-400">
            {/* Scoped to the garments. The COD fee is a service charge with
                its own rate, and quietly folding it into this figure would
                misstate the tax on the invoice. */}
            Includes GST {formatPrice(includedGst)} on items
          </p>
        </div>
      </div>
    </div>
  );
}
