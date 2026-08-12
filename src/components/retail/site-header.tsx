"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ShoppingBag, User, Search, Heart, Menu, X } from "lucide-react";
import { useCartStore, cartTotals } from "@/lib/stores/cart-store";
import { useSessionStore } from "@/lib/stores/session-store";
import { useWishlistStore } from "@/lib/stores/wishlist-store";
import { useHasMounted } from "@/lib/hooks/use-has-mounted";

const NAV_LINKS = [
  { href: "/shop/women", label: "Women" },
  { href: "/shop/men", label: "Men" },
  { href: "/shop/kids", label: "Kids" },
];

export function RetailSiteHeader() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [query, setQuery] = useState("");
  const router = useRouter();

  const mounted = useHasMounted();
  const lines = useCartStore((s) => s.lines);
  const { totalItems: totalItemsRaw } = cartTotals(lines);
  const totalItems = mounted ? totalItemsRaw : 0;
  const wishlistCountRaw = useWishlistStore((s) => s.productIds.length);
  const wishlistCount = mounted ? wishlistCountRaw : 0;
  const userRaw = useSessionStore((s) => s.user);
  const user = mounted ? userRaw : null;

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!query.trim()) return;
    setMenuOpen(false);
    router.push(`/shop/search?q=${encodeURIComponent(query.trim())}`);
  }

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

        <form onSubmit={handleSearch} className="ml-auto hidden flex-1 max-w-xs sm:flex">
          <div className="flex w-full items-center gap-2 rounded-full border border-neutral-200 px-3 py-1.5 text-sm text-neutral-500 focus-within:border-rose-400">
            <Search className="h-4 w-4 shrink-0" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search products"
              className="w-full bg-transparent text-neutral-800 outline-none placeholder:text-neutral-400"
            />
          </div>
        </form>

        <div className="ml-auto flex items-center gap-4 sm:ml-0">
          <Link
            href="/shop/wishlist"
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

      {menuOpen && (
        <div className="border-t border-neutral-200 bg-white px-4 py-4 sm:hidden">
          <form onSubmit={handleSearch} className="mb-4 flex items-center gap-2 rounded-full border border-neutral-200 px-3 py-1.5 text-sm">
            <Search className="h-4 w-4 shrink-0 text-neutral-400" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search products"
              className="w-full bg-transparent outline-none placeholder:text-neutral-400"
            />
          </form>
          <nav className="flex flex-col gap-3 text-sm font-medium text-neutral-700">
            {NAV_LINKS.map((link) => (
              <Link key={link.href} href={link.href} onClick={() => setMenuOpen(false)}>
                {link.label}
              </Link>
            ))}
            <Link href="/shop/wishlist" onClick={() => setMenuOpen(false)}>
              Wishlist {wishlistCount > 0 && `(${wishlistCount})`}
            </Link>
            <Link href="/shop/orders" onClick={() => setMenuOpen(false)}>
              My Orders
            </Link>
            <Link href="/shop/addresses" onClick={() => setMenuOpen(false)}>
              My Addresses
            </Link>
          </nav>
        </div>
      )}
    </header>
  );
}
