"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ClipboardList, User, Search, Menu, X } from "lucide-react";
import { useWholesaleOrderStore, wholesaleOrderTotals } from "@/lib/stores/wholesale-order-store";
import { useSessionStore } from "@/lib/stores/session-store";
import { useHasMounted } from "@/lib/hooks/use-has-mounted";

const NAV_LINKS = [
  { href: "/wholesale/catalog", label: "Catalog" },
  { href: "/wholesale/quick-order", label: "Quick Order" },
  { href: "/wholesale/pricing-calculator", label: "Pricing Calculator" },
  { href: "/wholesale/dashboard", label: "Dashboard" },
];

export function WholesaleSiteHeader() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [query, setQuery] = useState("");
  const router = useRouter();

  const mounted = useHasMounted();
  const lines = useWholesaleOrderStore((s) => s.lines);
  const { totalUnits: totalUnitsRaw } = wholesaleOrderTotals(lines);
  const totalUnits = mounted ? totalUnitsRaw : 0;
  const userRaw = useSessionStore((s) => s.user);
  const user = mounted ? userRaw : null;

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!query.trim()) return;
    setMenuOpen(false);
    router.push(`/wholesale/search?q=${encodeURIComponent(query.trim())}`);
  }

  return (
    <header className="sticky top-0 z-40 border-b border-blue-900/10 bg-slate-900 text-white">
      <div className="mx-auto flex max-w-6xl items-center gap-6 px-4 py-3 sm:px-6">
        <button
          type="button"
          className="text-slate-300 lg:hidden"
          aria-label="Open menu"
          onClick={() => setMenuOpen((v) => !v)}
        >
          {menuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>

        <Link href="/wholesale" className="text-lg font-bold tracking-tight">
          GarmentVibes <span className="text-blue-400">B2B</span>
        </Link>

        <nav className="hidden gap-5 text-sm font-medium text-slate-300 lg:flex">
          {NAV_LINKS.map((link) => (
            <Link key={link.href} href={link.href} className="hover:text-white">
              {link.label}
            </Link>
          ))}
        </nav>

        <form onSubmit={handleSearch} className="ml-auto hidden max-w-xs flex-1 lg:flex">
          <div className="flex w-full items-center gap-2 rounded-full border border-slate-700 bg-slate-800 px-3 py-1.5 text-sm text-slate-300 focus-within:border-blue-500">
            <Search className="h-4 w-4 shrink-0" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search SKU / product"
              className="w-full bg-transparent text-white outline-none placeholder:text-slate-400"
            />
          </div>
        </form>

        <div className="ml-auto flex items-center gap-4 lg:ml-0">
          <Link
            href={user?.role === "wholesale" ? "/wholesale/account" : "/wholesale/login"}
            className="flex items-center gap-1.5 text-sm text-slate-300 hover:text-white"
          >
            <User className="h-5 w-5" />
            <span className="hidden sm:inline">
              {user?.role === "wholesale" ? user.businessName ?? user.name : "Sign in"}
            </span>
          </Link>

          <Link href="/wholesale/order" className="relative flex items-center text-slate-300 hover:text-white">
            <ClipboardList className="h-5 w-5" />
            {totalUnits > 0 && (
              <span className="absolute -right-2 -top-2 flex h-4 w-4 items-center justify-center rounded-full bg-blue-500 text-[10px] font-bold text-white">
                {totalUnits > 99 ? "99+" : totalUnits}
              </span>
            )}
          </Link>
        </div>
      </div>

      {menuOpen && (
        <div className="border-t border-slate-800 bg-slate-900 px-4 py-4 lg:hidden">
          <form
            onSubmit={handleSearch}
            className="mb-4 flex items-center gap-2 rounded-full border border-slate-700 bg-slate-800 px-3 py-1.5 text-sm"
          >
            <Search className="h-4 w-4 shrink-0 text-slate-400" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search SKU / product"
              className="w-full bg-transparent text-white outline-none placeholder:text-slate-400"
            />
          </form>
          <nav className="flex flex-col gap-3 text-sm font-medium text-slate-300">
            {NAV_LINKS.map((link) => (
              <Link key={link.href} href={link.href} onClick={() => setMenuOpen(false)}>
                {link.label}
              </Link>
            ))}
            <Link href="/wholesale/settings" onClick={() => setMenuOpen(false)}>
              Business Settings
            </Link>
            <Link href="/wholesale/team" onClick={() => setMenuOpen(false)}>
              Team Members
            </Link>
          </nav>
        </div>
      )}
    </header>
  );
}
