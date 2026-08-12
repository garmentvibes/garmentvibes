"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Upload, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatPrice } from "@/lib/utils";
import { WHOLESALE_PRODUCTS, getWholesaleProductBySku } from "@/lib/mock/wholesale-products";
import { useWholesaleOrderStore } from "@/lib/stores/wholesale-order-store";
import { wholesalePriceForQty } from "@/types/catalog";

function downloadCsv(filename: string, content: string) {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export default function QuickOrderPage() {
  const [qtyBySku, setQtyBySku] = useState<Record<string, number>>({});
  const upsertLine = useWholesaleOrderStore((s) => s.upsertLine);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function addAll() {
    let added = 0;
    for (const product of WHOLESALE_PRODUCTS) {
      const qty = qtyBySku[product.sku] ?? 0;
      if (qty >= product.moq) {
        upsertLine({
          productId: product.id,
          sku: product.sku,
          slug: product.slug,
          name: product.name,
          image: product.images[0],
          pricePerUnit: wholesalePriceForQty(product, qty),
          currency: product.currency,
          qty,
          packSize: product.packSize,
          moq: product.moq,
        });
        added++;
      }
    }
    if (added === 0) {
      toast.error("Enter a quantity that meets the MOQ for at least one item");
    } else {
      toast.success(`${added} item(s) added to your order`);
      setQtyBySku({});
    }
  }

  function handleTemplateDownload() {
    const rows = ["sku,quantity", ...WHOLESALE_PRODUCTS.map((p) => `${p.sku},${p.moq}`)];
    downloadCsv("garmentvibes-quick-order-template.csv", rows.join("\n"));
  }

  function handleCsvUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result ?? "");
      const lines = text.split(/\r?\n/).filter(Boolean);
      const updates: Record<string, number> = {};
      let matched = 0;
      let skipped = 0;

      for (const line of lines) {
        const [sku, qtyRaw] = line.split(",").map((v) => v.trim());
        if (!sku || sku.toLowerCase() === "sku") continue; // skip header row
        const product = getWholesaleProductBySku(sku);
        const qty = Number(qtyRaw);
        if (product && Number.isFinite(qty) && qty > 0) {
          updates[product.sku] = qty;
          matched++;
        } else {
          skipped++;
        }
      }

      setQtyBySku((prev) => ({ ...prev, ...updates }));
      if (matched > 0) {
        toast.success(`Matched ${matched} SKU(s) from file${skipped ? `, skipped ${skipped}` : ""}`);
      } else {
        toast.error("No valid SKU rows found in that file");
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Quick Order</h1>
          <p className="mt-1 text-sm text-slate-500">Enter quantities by SKU, or upload a CSV.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={handleTemplateDownload}>
            <Download className="mr-1.5 h-4 w-4" /> Download CSV Template
          </Button>
          <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}>
            <Upload className="mr-1.5 h-4 w-4" /> Upload CSV
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={handleCsvUpload}
          />
          <Link href="/wholesale/order">
            <Button variant="outline" size="sm">
              Review Order
            </Button>
          </Link>
        </div>
      </div>

      <div className="mt-6 overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
            <tr>
              <th className="px-4 py-3">SKU</th>
              <th className="px-4 py-3">Product</th>
              <th className="px-4 py-3">MOQ</th>
              <th className="px-4 py-3">Best price/unit</th>
              <th className="px-4 py-3">Quantity</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {WHOLESALE_PRODUCTS.map((product) => {
              const qty = qtyBySku[product.sku] ?? 0;
              const bestTier = product.priceTiers[product.priceTiers.length - 1];
              return (
                <tr key={product.sku}>
                  <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-slate-500">
                    {product.sku}
                  </td>
                  <td className="px-4 py-3 text-slate-800">{product.name}</td>
                  <td className="px-4 py-3 text-slate-500">{product.moq}</td>
                  <td className="px-4 py-3 text-slate-800">{formatPrice(bestTier.pricePerUnit)}</td>
                  <td className="px-4 py-3">
                    <input
                      type="number"
                      min={0}
                      step={product.packSize}
                      value={qty || ""}
                      placeholder="0"
                      onChange={(e) =>
                        setQtyBySku((prev) => ({
                          ...prev,
                          [product.sku]: Number(e.target.value) || 0,
                        }))
                      }
                      className="h-9 w-24 rounded-md border border-slate-300 px-2 text-sm focus:border-blue-600 focus:outline-none"
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <Button variant="wholesale" size="lg" className="mt-6" onClick={addAll}>
        Add Selected Items to Order
      </Button>
    </div>
  );
}
