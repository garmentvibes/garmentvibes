"use client";

import Link from "next/link";
import Image from "next/image";
import { Minus, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cartTotals } from "@/lib/stores/cart-store";
import { useCart } from "@/lib/hooks/use-cart";
import { formatPrice } from "@/lib/utils";

export default function CartPage() {
  const { lines, setQty, removeLine } = useCart();
  const { totalItems, totalPrice } = cartTotals(lines);

  if (lines.length === 0) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-20 text-center sm:px-6">
        <h1 className="text-xl font-bold text-neutral-900">Your bag is empty</h1>
        <p className="mt-2 text-neutral-500">Looks like you haven&apos;t added anything yet.</p>
        <Link href="/shop">
          <Button variant="retail" className="mt-6">
            Continue Shopping
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <h1 className="text-2xl font-bold text-neutral-900">My Bag ({totalItems})</h1>

      <div className="mt-6 grid grid-cols-1 gap-8 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          {lines.map((line) => (
            <div key={line.key} className="flex gap-4 rounded-lg border border-neutral-200 bg-white p-4">
              <Image
                src={line.image}
                alt={line.name}
                width={80}
                height={96}
                className="h-24 w-20 rounded object-cover"
              />
              <div className="flex-1">
                <p className="font-medium text-neutral-900">{line.name}</p>
                <p className="text-sm text-neutral-500">
                  Size: {line.size} &middot; Color: {line.color}
                </p>
                <p className="mt-1 font-semibold text-neutral-900">{formatPrice(line.price)}</p>

                <div className="mt-3 flex items-center gap-3">
                  <div className="flex items-center rounded-md border border-neutral-300">
                    <button
                      type="button"
                      className="p-1.5 hover:bg-neutral-50"
                      onClick={() => setQty(line.key, line.qty - 1)}
                      aria-label="Decrease quantity"
                    >
                      <Minus className="h-3.5 w-3.5" />
                    </button>
                    <span className="w-8 text-center text-sm">{line.qty}</span>
                    <button
                      type="button"
                      className="p-1.5 hover:bg-neutral-50"
                      onClick={() => setQty(line.key, line.qty + 1)}
                      aria-label="Increase quantity"
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeLine(line.key)}
                    className="flex items-center gap-1 text-sm text-neutral-500 hover:text-red-600"
                  >
                    <Trash2 className="h-3.5 w-3.5" /> Remove
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="h-fit rounded-lg border border-neutral-200 bg-white p-5">
          <h2 className="font-semibold text-neutral-900">Order Summary</h2>
          <div className="mt-4 flex justify-between text-sm text-neutral-600">
            <span>Subtotal ({totalItems} items)</span>
            <span>{formatPrice(totalPrice)}</span>
          </div>
          <div className="mt-1 flex justify-between text-sm text-neutral-600">
            <span>Delivery</span>
            <span className="text-green-700">Free</span>
          </div>
          <div className="mt-3 flex justify-between border-t border-neutral-200 pt-3 font-semibold text-neutral-900">
            <span>Total</span>
            <span>{formatPrice(totalPrice)}</span>
          </div>
          <Link href="/shop/checkout">
            <Button variant="retail" size="lg" className="mt-5 w-full">
              Proceed to Checkout
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
