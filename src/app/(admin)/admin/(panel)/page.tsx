"use client";

import Link from "next/link";
import { Package, ShoppingCart, FileText, Building2, ArrowRight, Undo2, BellOff } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { formatPrice } from "@/lib/utils";
import { useAdminQuotes } from "@/lib/hooks/use-admin-quotes";
import { useAdminOrders } from "@/lib/hooks/use-admin-orders";
import { useWholesaleAccounts } from "@/lib/stores/admin-accounts-store";
import {
  useAdminRetailProducts,
  useAdminWholesaleProducts,
} from "@/lib/stores/admin-catalog-store";
import { useStockStore, getTotalStock, LOW_STOCK_THRESHOLD } from "@/lib/stores/stock-store";
import { useAllReturns } from "@/lib/hooks/use-returns";
import { useNotificationStore } from "@/lib/stores/notification-store";
import { NOTIFICATION_TEMPLATES } from "@/lib/notifications/templates";
import { retailOrderTotal, wholesaleQuoteTotal } from "@/types/admin";

export default function AdminDashboardPage() {
  const retailProducts = useAdminRetailProducts();
  const wholesaleProducts = useAdminWholesaleProducts();
  const { orders } = useAdminOrders();
  const { quotes } = useAdminQuotes();
  const accounts = useWholesaleAccounts();
  const { requests: returns } = useAllReturns();
  const messages = useNotificationStore((s) => s.messages);

  const stockOverrides = useStockStore((s) => s.overrides);
  const lowStock = retailProducts
    .map((p) => ({ product: p, total: getTotalStock(stockOverrides, p) }))
    .filter((x) => x.total <= LOW_STOCK_THRESHOLD)
    .sort((a, b) => a.total - b.total);

  const openReturns = returns.filter((r) => r.status === "requested");
  // A failed message means a customer was never told something we promised to
  // tell them — a shipment, a refund. It needs to be visible, not buried.
  const failedMessages = messages.filter((m) => m.status === "failed");

  const openOrders = orders.filter((o) => !["delivered", "cancelled"].includes(o.status));
  const openQuotes = quotes.filter((q) => ["requested", "quoted"].includes(q.status));
  const pendingAccounts = accounts.filter((a) => a.status === "pending");
  const retailRevenue = orders
    .filter((o) => o.status !== "cancelled")
    .reduce((sum, o) => sum + retailOrderTotal(o), 0);

  const stats = [
    {
      label: "Products",
      value: `${retailProducts.length + wholesaleProducts.length}`,
      sub: `${retailProducts.length} retail · ${wholesaleProducts.length} wholesale`,
      href: "/admin/products",
      icon: Package,
    },
    {
      label: "Open retail orders",
      value: `${openOrders.length}`,
      sub: `${orders.length} total · ${formatPrice(retailRevenue)} booked`,
      href: "/admin/orders",
      icon: ShoppingCart,
    },
    {
      label: "Quotes awaiting action",
      value: `${openQuotes.length}`,
      sub: `${quotes.length} total requests`,
      href: "/admin/quotes",
      icon: FileText,
    },
    {
      label: "Accounts pending approval",
      value: `${pendingAccounts.length}`,
      sub: `${accounts.length} registered businesses`,
      href: "/admin/accounts",
      icon: Building2,
    },
    {
      label: "Returns to review",
      value: `${openReturns.length}`,
      sub: `${returns.length} raised in total`,
      href: "/admin/returns",
      icon: Undo2,
    },
    {
      label: "Failed messages",
      value: `${failedMessages.length}`,
      sub:
        failedMessages.length > 0
          ? "customers never received these"
          : `${messages.length} sent or queued`,
      href: "/admin/notifications",
      icon: BellOff,
    },
  ];

  return (
    <div className="mx-auto max-w-6xl">
      <h1 className="text-2xl font-bold text-neutral-900">Dashboard</h1>
      <p className="mt-1 text-sm text-neutral-500">Everything needing attention, at a glance.</p>

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {stats.map((stat) => {
          const Icon = stat.icon;
          return (
            <Link
              key={stat.label}
              href={stat.href}
              className="rounded-lg border border-neutral-200 bg-white p-5 transition-colors hover:border-neutral-300"
            >
              <div className="flex items-center justify-between">
                <Icon className="h-5 w-5 text-neutral-400" />
                <ArrowRight className="h-4 w-4 text-neutral-300" />
              </div>
              <p className="mt-3 text-2xl font-bold text-neutral-900">{stat.value}</p>
              <p className="text-sm font-medium text-neutral-700">{stat.label}</p>
              <p className="mt-1 text-xs text-neutral-400">{stat.sub}</p>
            </Link>
          );
        })}
      </div>

      {failedMessages.length > 0 && (
        <section className="mt-8 rounded-lg border border-red-200 bg-red-50 p-5">
          <h2 className="font-semibold text-red-900">
            {failedMessages.length} message{failedMessages.length === 1 ? "" : "s"} failed to send
          </h2>
          <p className="mt-1 text-sm text-red-800">
            These customers were never told what we promised to tell them. Check the recipient
            details and resend.
          </p>
          <ul className="mt-3 space-y-1 text-sm text-red-900">
            {failedMessages.slice(0, 3).map((m) => (
              <li key={m.id}>
                &middot; {NOTIFICATION_TEMPLATES[m.templateId].label} to {m.recipient}
                {m.failureReason ? ` — ${m.failureReason}` : ""}
              </li>
            ))}
          </ul>
          <Link
            href="/admin/notifications"
            className="mt-3 inline-block text-sm font-medium text-red-900 underline"
          >
            Review the outbox
          </Link>
        </section>
      )}

      {pendingAccounts.length > 0 && (
        <section className="mt-8 rounded-lg border border-amber-200 bg-amber-50 p-5">
          <h2 className="font-semibold text-amber-900">
            {pendingAccounts.length} wholesale account
            {pendingAccounts.length === 1 ? "" : "s"} waiting on you
          </h2>
          <p className="mt-1 text-sm text-amber-800">
            These businesses can browse and request quotes, but can&apos;t place orders directly
            until approved.
          </p>
          <ul className="mt-3 space-y-1 text-sm text-amber-900">
            {pendingAccounts.slice(0, 3).map((a) => (
              <li key={a.id}>
                &middot; {a.businessName} — {a.contactName} ({a.registeredAt})
              </li>
            ))}
          </ul>
          <Link
            href="/admin/accounts"
            className="mt-3 inline-block text-sm font-medium text-amber-900 underline underline-offset-4"
          >
            Review approvals
          </Link>
        </section>
      )}

      {lowStock.length > 0 && (
        <section className="mt-6 rounded-lg border border-red-200 bg-red-50 p-5">
          <h2 className="font-semibold text-red-900">
            {lowStock.length} product{lowStock.length === 1 ? "" : "s"} low or out of stock
          </h2>
          <ul className="mt-2 space-y-1 text-sm text-red-900">
            {lowStock.slice(0, 5).map(({ product, total }) => (
              <li key={product.id}>
                &middot;{" "}
                <Link
                  href={`/admin/products/retail/${product.id}`}
                  className="underline underline-offset-4"
                >
                  {product.name}
                </Link>{" "}
                — {total === 0 ? "out of stock" : `${total} left across all sizes`}
              </li>
            ))}
          </ul>
          {lowStock.length > 5 && (
            <p className="mt-2 text-xs text-red-800">
              and {lowStock.length - 5} more — see Products
            </p>
          )}
        </section>
      )}

      <section className="mt-8">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-semibold text-neutral-900">Recent retail orders</h2>
          <Link href="/admin/orders" className="text-sm text-neutral-500 hover:text-neutral-800">
            View all
          </Link>
        </div>
        <div className="overflow-x-auto rounded-lg border border-neutral-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-neutral-50 text-left text-xs uppercase text-neutral-500">
              <tr>
                <th className="px-4 py-3">Order</th>
                <th className="px-4 py-3">Customer</th>
                <th className="px-4 py-3">Total</th>
                <th className="px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {orders.slice(0, 5).map((order) => (
                <tr key={order.id}>
                  <td className="px-4 py-3">
                    <Link
                      href={`/admin/orders/${order.id}`}
                      className="font-mono text-xs text-neutral-700 hover:underline"
                    >
                      {order.id}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-neutral-700">{order.customerName}</td>
                  <td className="px-4 py-3 text-neutral-800">
                    {formatPrice(retailOrderTotal(order))}
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant="outline" className="capitalize">
                      {order.status}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mt-8">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-semibold text-neutral-900">Recent quotes &amp; bulk orders</h2>
          <Link href="/admin/quotes" className="text-sm text-neutral-500 hover:text-neutral-800">
            View all
          </Link>
        </div>
        <div className="overflow-x-auto rounded-lg border border-neutral-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-neutral-50 text-left text-xs uppercase text-neutral-500">
              <tr>
                <th className="px-4 py-3">Reference</th>
                <th className="px-4 py-3">Business</th>
                <th className="px-4 py-3">Estimated</th>
                <th className="px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {quotes.slice(0, 5).map((quote) => (
                <tr key={quote.id}>
                  <td className="px-4 py-3">
                    <Link
                      href={`/admin/quotes/${quote.id}`}
                      className="font-mono text-xs text-neutral-700 hover:underline"
                    >
                      {quote.id}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-neutral-700">{quote.businessName}</td>
                  <td className="px-4 py-3 text-neutral-800">
                    {formatPrice(wholesaleQuoteTotal(quote))}
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant="outline" className="capitalize">
                      {quote.status.replace("_", " ")}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
