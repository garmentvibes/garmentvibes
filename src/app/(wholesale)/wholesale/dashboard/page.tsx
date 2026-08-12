import { Badge } from "@/components/ui/badge";
import { formatPrice } from "@/lib/utils";

const MOCK_ORDERS = [
  { id: "GVQ84213567", date: "2026-08-05", units: 480, total: 22032000, status: "Confirmed" as const },
  { id: "GVQ84119042", date: "2026-07-22", units: 240, total: 9576000, status: "Shipped" as const },
  { id: "GVQ83997211", date: "2026-07-02", units: 120, total: 4788000, status: "Delivered" as const },
];

const STATUS_VARIANT = {
  Confirmed: "wholesale",
  Shipped: "warning",
  Delivered: "success",
} as const;

export default function WholesaleDashboardPage() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <h1 className="text-2xl font-bold text-slate-900">Account Dashboard</h1>
      <p className="mt-1 text-sm text-slate-500">
        Sample order history — will reflect real orders once accounts are connected.
      </p>

      <div className="mt-6 overflow-hidden rounded-lg border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
            <tr>
              <th className="px-4 py-3">Reference</th>
              <th className="px-4 py-3">Date</th>
              <th className="px-4 py-3">Units</th>
              <th className="px-4 py-3">Total</th>
              <th className="px-4 py-3">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {MOCK_ORDERS.map((order) => (
              <tr key={order.id}>
                <td className="px-4 py-3 font-mono text-xs text-slate-500">{order.id}</td>
                <td className="px-4 py-3 text-slate-700">{order.date}</td>
                <td className="px-4 py-3 text-slate-700">{order.units}</td>
                <td className="px-4 py-3 text-slate-800">{formatPrice(order.total)}</td>
                <td className="px-4 py-3">
                  <Badge variant={STATUS_VARIANT[order.status]}>{order.status}</Badge>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
