"use client";

import Link from "next/link";
import { ShoppingBag, User, Search } from "lucide-react";
import { useCartStore, cartTotals } from "@/lib/stores/cart-store";
import { useSessionStore } from "@/lib/stores/session-store";

const NAV_LINKS = [
  { href: "/shop/women", label: "Women" },
  { href: "/shop/men", label: "Men" },
  { href: "/shop/kids", label: "Kids" },
];

export function RetailSiteHeader() {
  const lines = useCartStore((s) => s.lines);
  const { totalItems } = cartTotals(lines);
  const user = useSessionStore((s) => s.user);

  return (
    <header className="sticky top-0 z-40 border-b border-neutral-200 bg-white/95 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center gap-6 px-4 py-3 sm:px-6">
        <Link href="/shop" className="text-lg font-bold tracking-tight text-rose-600">
          GarmentVibes
        </Link>

        <nav className="hidden gap-5 text-sm font-medium text-neutral-700 sm:flex">
          {NAV_LINKS.map((link) => (
            <Link key={link.href} href={link.href} className="hover:text-rose-600">
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-4">
          <button
            type="button"
            className="hidden items-center gap-2 rounded-full border border-neutral-200 px-3 py-1.5 text-sm text-neutral-500 sm:flex"
            aria-label="Search"
          >
            <Search className="h-4 w-4" />
            Search products
          </button>

          <Link
            href={user?.role === "retail" ? "/shop/account" : "/shop/login"}
            className="flex items-center gap-1.5 text-sm text-neutral-700 hover:text-rose-600"
          >
            <User className="h-5 w-5" />
            <span className="hidden sm:inline">{user?.role === "retail" ? user.name.split(" ")[0] : "Sign in"}</span>
          </Link>

          <Link href="/shop/cart" className="relative flex items-center text-neutral-700 hover:text-rose-600">
            <ShoppingBag className="h-5 w-5" />
            {totalItems > 0 && (
              <span className="absolute -right-2 -top-2 flex h-4 w-4 items-center justify-center rounded-full bg-rose-600 text-[10px] font-bold text-white">
                {totalItems}
              </span>
            )}
          </Link>
        </div>
      </div>
    </header>
  );
}
