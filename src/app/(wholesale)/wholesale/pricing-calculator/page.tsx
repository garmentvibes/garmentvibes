"use client";

import { useState } from "react";
import { Calculator } from "lucide-react";
import { formatPrice } from "@/lib/utils";
import { WHOLESALE_PRODUCTS } from "@/lib/mock/wholesale-products";
import { wholesalePriceForQty } from "@/types/catalog";

export default function PricingCalculatorPage() {
  const [productId, setProductId] = useState(WHOLESALE_PRODUCTS[0].id);
  const [qty, setQty] = useState(WHOLESALE_PRODUCTS[0].moq);

  const product = WHOLESALE_PRODUCTS.find((p) => p.id === productId) ?? WHOLESALE_PRODUCTS[0];
  const unitPrice = wholesalePriceForQty(product, qty);
  const total = unitPrice * qty;
  const baseUnitPrice = product.priceTiers[0].pricePerUnit;
  const savingsPercent = Math.round(((baseUnitPrice - unitPrice) / baseUnitPrice) * 100);

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <div className="flex items-center gap-2">
        <Calculator className="h-6 w-6 text-blue-700" />
        <h1 className="text-2xl font-bold text-slate-900">Bulk Pricing Calculator</h1>
      </div>
      <p className="mt-1 text-sm text-slate-500">
        See how your per-unit price drops as order quantity increases.
      </p>

      <div className="mt-6 rounded-lg border border-slate-200 bg-white p-6">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="calc-product" className="mb-1 block text-sm font-medium text-slate-700">
              Product
            </label>
            <select
              id="calc-product"
              value={productId}
              onChange={(e) => {
                const next = WHOLESALE_PRODUCTS.find((p) => p.id === e.target.value);
                setProductId(e.target.value);
                if (next) setQty(next.moq);
              }}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-blue-600 focus:outline-none"
            >
              {WHOLESALE_PRODUCTS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.sku})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="calc-qty" className="mb-1 block text-sm font-medium text-slate-700">
              Quantity <span className="text-slate-400">(MOQ {product.moq})</span>
            </label>
            <input
              id="calc-qty"
              type="number"
              min={product.moq}
              step={product.packSize}
              value={qty}
              onChange={(e) => setQty(Math.max(product.moq, Number(e.target.value) || product.moq))}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-blue-600 focus:outline-none"
            />
          </div>
        </div>

        <div className="mt-6 grid grid-cols-1 gap-4 rounded-lg bg-blue-50 p-5 sm:grid-cols-3">
          <div>
            <p className="text-xs uppercase text-blue-600">Price per unit</p>
            <p className="text-xl font-bold text-blue-900">{formatPrice(unitPrice)}</p>
          </div>
          <div>
            <p className="text-xs uppercase text-blue-600">Order total</p>
            <p className="text-xl font-bold text-blue-900">{formatPrice(total)}</p>
          </div>
          <div>
            <p className="text-xs uppercase text-blue-600">You save</p>
            <p className="text-xl font-bold text-blue-900">{Math.max(savingsPercent, 0)}%</p>
          </div>
        </div>

        <table className="mt-6 w-full text-sm">
          <thead className="text-left text-xs uppercase text-slate-400">
            <tr>
              <th className="py-1.5">Quantity</th>
              <th className="py-1.5">Price / unit</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {product.priceTiers.map((tier, i) => {
              const next = product.priceTiers[i + 1];
              const range = next ? `${tier.minQty} - ${next.minQty - 1}` : `${tier.minQty}+`;
              const active = unitPrice === tier.pricePerUnit;
              return (
                <tr key={tier.minQty} className={active ? "bg-blue-50" : ""}>
                  <td className="py-1.5 text-slate-700">{range} units</td>
                  <td className="py-1.5 font-medium text-slate-900">{formatPrice(tier.pricePerUnit)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
