"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Package,
  ShoppingCart,
  FileText,
  Building2,
  Bell,
  MessageCircleQuestion,
  LifeBuoy,
  Undo2,
  Tag,
  PackageX,
  IndianRupee,
  LogOut,
  Menu,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { signOutAdmin } from "@/lib/auth/actions";
import type { StaffUser } from "@/lib/auth/dal";

const NAV = [
  { href: "/admin", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { href: "/admin/products", label: "Products", icon: Package },
  { href: "/admin/orders", label: "Retail Orders", icon: ShoppingCart },
  { href: "/admin/quotes", label: "Quotes & Bulk Orders", icon: FileText },
  { href: "/admin/support", label: "Customer Support", icon: LifeBuoy },
  { href: "/admin/questions", label: "Product Questions", icon: MessageCircleQuestion },
  { href: "/admin/returns", label: "Returns", icon: Undo2 },
  { href: "/admin/claims", label: "Wholesale Claims", icon: PackageX },
  { href: "/admin/credit", label: "Credit Ledger", icon: IndianRupee },
  { href: "/admin/promos", label: "Promo Codes", icon: Tag },
  { href: "/admin/accounts", label: "Wholesale Accounts", icon: Building2 },
  { href: "/admin/notifications", label: "Notifications", icon: Bell },
];

/**
 * `user` is resolved on the server by admin/(panel)/layout.tsx and passed in.
 *
 * That direction matters: this component no longer decides who is allowed to
 * see it, so there is no client-side check to defeat. By the time this
 * renders, the server has already established that the request is from staff.
 */
export function AdminShell({ user, children }: { user: StaffUser; children: React.ReactNode }) {
  const pathname = usePathname();
  const [navOpen, setNavOpen] = useState(false);

  return (
    <div className="flex min-h-screen bg-neutral-50">
      {/* Sidebar */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 w-64 shrink-0 bg-neutral-900 text-neutral-300 transition-transform lg:static lg:translate-x-0",
          navOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <div className="flex items-center justify-between px-5 py-4">
          <Link href="/admin" className="text-base font-bold tracking-tight text-white">
            GarmentVibes <span className="text-emerald-400">Admin</span>
          </Link>
          <button
            type="button"
            className="text-neutral-400 lg:hidden"
            aria-label="Close menu"
            onClick={() => setNavOpen(false)}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <nav className="mt-2 flex flex-col gap-1 px-3">
          {NAV.map((item) => {
            const active = item.exact ? pathname === item.href : pathname.startsWith(item.href);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setNavOpen(false)}
                className={cn(
                  "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                  active ? "bg-neutral-800 text-white" : "hover:bg-neutral-800/60 hover:text-white"
                )}
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="absolute inset-x-0 bottom-0 border-t border-neutral-800 p-3">
          <p className="px-2 pb-2 text-xs text-neutral-500">Signed in as {user.email}</p>
          {/* A form posting to a Server Action, not an onClick: signing out
              has to clear an HttpOnly cookie, which only the server can do. */}
          <form action={signOutAdmin}>
            <button
              type="submit"
              className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm text-neutral-400 hover:bg-neutral-800/60 hover:text-white"
            >
              <LogOut className="h-4 w-4" /> Sign out
            </button>
          </form>
        </div>
      </aside>

      {navOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/40 lg:hidden"
          onClick={() => setNavOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Main */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-3 border-b border-neutral-200 bg-white px-4 py-3 lg:hidden">
          <button
            type="button"
            aria-label="Open menu"
            onClick={() => setNavOpen(true)}
            className="text-neutral-700"
          >
            <Menu className="h-5 w-5" />
          </button>
          <span className="font-semibold text-neutral-900">Admin</span>
        </header>

        <div className="bg-amber-50 px-4 py-2 text-center text-xs text-amber-800 sm:px-6">
          Demo mode — changes are saved to this browser only. They will write to the database once
          Supabase is connected, and are not yet visible on the live storefront.
        </div>

        {user.demo && (
          <div className="bg-red-50 px-4 py-2 text-center text-xs font-medium text-red-800 sm:px-6">
            Demo sign-in — no password was checked. This deployment has no Supabase project, so
            <code className="mx-1 rounded bg-red-100 px-1">ALLOW_DEMO_ADMIN</code>
            let anyone through. Never serve this configuration publicly.
          </div>
        )}

        <main className="min-w-0 flex-1 p-4 sm:p-6">{children}</main>
      </div>
    </div>
  );
}
