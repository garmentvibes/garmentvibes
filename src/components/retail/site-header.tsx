"use client";

import { useState } from "react";
import Link from "next/link";
import { ShoppingBag, User, Heart, Menu, X } from "lucide-react";
import { useCartStore, cartTotals } from "@/lib/stores/cart-store";
import { useSessionStore } from "@/lib/stores/session-store";
import { useWishlistStore } from "@/lib/stores/wishlist-store";
import { useHasMounted } from "@/lib/hooks/use-has-mounted";
import { MegaMenu } from "@/components/retail/mega-menu";
import { SearchBox } from "@/components/retail/search-box";
import { RETAIL_TAXONOMY, CATEGORY_LABELS } from "@/lib/mock/category-taxonomy";
import type { RetailCategory } from "@/types/catalog";

const NAV_CATEGORIES: RetailCategory[] = ["women", "men", "kids"];

export function RetailSiteHeader() {
  const [menuOpen, setMenuOpen] = useState(false);

  const mounted = useHasMounted();
  const lines = useCartStore((s) => s.lines);
  const { totalItems: totalItemsRaw } = cartTotals(lines);
  const totalItems = mounted ? totalItemsRaw : 0;
  const wishlistCountRaw = useWishlistStore((s) => s.productIds.length);
  const wishlistCount = mounted ? wishlistCountRaw : 0;
  const userRaw = useSessionStore((s) => s.user);
  const user = mounted ? userRaw : null;

  return (
    <header className="sticky top-0 z-40 border-b border-neutral-200 bg-white/95 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center gap-6 px-4 py-3 sm:px-6">
        <button
          type="button"
          className="text-neutral-700 sm:hidden"
          aria-label="Open menu"
          onClick={() => setMenuOpen((v) => !v)}
        >
          {menuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>

        <Link href="/shop" className="text-lg font-bold tracking-tight text-rose-700">
          GarmentVibes
        </Link>

        <MegaMenu />

        <SearchBox className="ml-auto hidden max-w-xs flex-1 sm:block" />

        <div className="ml-auto flex items-center gap-4 sm:ml-0">
          <Link
            href="/shop/wishlist"
            aria-label="Wishlist"
            className="relative hidden items-center text-neutral-700 hover:text-rose-600 sm:flex"
          >
            <Heart className="h-5 w-5" />
            {wishlistCount > 0 && (
              <span className="absolute -right-2 -top-2 flex h-4 w-4 items-center justify-center rounded-full bg-rose-600 text-[10px] font-bold text-white">
                {wishlistCount}
              </span>
            )}
          </Link>

          <Link
            href={user?.role === "retail" ? "/shop/account" : "/shop/login"}
            className="flex items-center gap-1.5 text-sm text-neutral-700 hover:text-rose-600"
          >
            <User className="h-5 w-5" />
            <span className="hidden sm:inline">{user?.role === "retail" ? user.name.split(" ")[0] : "Sign in"}</span>
          </Link>

          <Link
            href="/shop/cart"
            aria-label="Cart"
            className="relative flex items-center text-neutral-700 hover:text-rose-600"
          >
            <ShoppingBag className="h-5 w-5" />
            {totalItems > 0 && (
              <span className="absolute -right-2 -top-2 flex h-4 w-4 items-center justify-center rounded-full bg-rose-600 text-[10px] font-bold text-white">
                {totalItems}
              </span>
            )}
          </Link>
        </div>
      </div>

      {menuOpen && (
        <div className="border-t border-neutral-200 bg-white px-4 py-4 sm:hidden">
          <SearchBox className="mb-4" onNavigate={() => setMenuOpen(false)} />
          <nav className="flex flex-col gap-1 text-sm font-medium text-neutral-700">
            {NAV_CATEGORIES.map((category) => (
              <details key={category} className="group">
                <summary className="flex cursor-pointer list-none items-center justify-between py-2">
                  <Link href={`/shop/${category}`} onClick={() => setMenuOpen(false)}>
                    {CATEGORY_LABELS[category]}
                  </Link>
                  <span className="text-neutral-500 group-open:rotate-180">&#9662;</span>
                </summary>
                <div className="grid grid-cols-2 gap-3 py-2 pl-3">
                  {RETAIL_TAXONOMY[category].map((dept) => (
                    <div key={dept.label}>
                      <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
                        {dept.label}
                      </p>
                      <ul className="mt-1 space-y-1">
                        {dept.subcategories.map((sub) => (
                          <li key={sub}>
                            <Link
                              href={`/shop/${category}?subcategory=${encodeURIComponent(sub)}`}
                              onClick={() => setMenuOpen(false)}
                              className="text-neutral-600"
                            >
                              {sub}
                            </Link>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              </details>
            ))}
            <div className="mt-2 flex flex-col gap-3 border-t border-neutral-100 pt-3">
              <Link href="/shop/wishlist" onClick={() => setMenuOpen(false)}>
                Wishlist {wishlistCount > 0 && `(${wishlistCount})`}
              </Link>
              <Link href="/shop/orders" onClick={() => setMenuOpen(false)}>
                My Orders
              </Link>
              <Link href="/shop/addresses" onClick={() => setMenuOpen(false)}>
                My Addresses
              </Link>
            </div>
          </nav>
        </div>
      )}
    </header>
  );
}
