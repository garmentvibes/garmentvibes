"use client";

import Link from "next/link";
import { ClipboardList, User } from "lucide-react";
import { useWholesaleOrderStore, wholesaleOrderTotals } from "@/lib/stores/wholesale-order-store";
import { useSessionStore } from "@/lib/stores/session-store";

const NAV_LINKS = [
  { href: "/wholesale/catalog", label: "Catalog" },
  { href: "/wholesale/quick-order", label: "Quick Order" },
  { href: "/wholesale/dashboard", label: "Dashboard" },
];

export function WholesaleSiteHeader() {
  const lines = useWholesaleOrderStore((s) => s.lines);
  const { totalUnits } = wholesaleOrderTotals(lines);
  const user = useSessionStore((s) => s.user);

  return (
    <header className="sticky top-0 z-40 border-b border-blue-900/10 bg-slate-900 text-white">
      <div className="mx-auto flex max-w-6xl items-center gap-6 px-4 py-3 sm:px-6">
        <Link href="/wholesale" className="text-lg font-bold tracking-tight">
          GarmentVibes <span className="text-blue-400">B2B</span>
        </Link>

        <nav className="hidden gap-5 text-sm font-medium text-slate-300 sm:flex">
          {NAV_LINKS.map((link) => (
            <Link key={link.href} href={link.href} className="hover:text-white">
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-4">
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
    </header>
  );
}
