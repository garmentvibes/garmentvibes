"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { ArrowLeft, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAdminCatalogStore } from "@/lib/stores/admin-catalog-store";
import { placeholderImage } from "@/lib/mock/placeholder-image";
import { WHOLESALE_TAXONOMY, WHOLESALE_CATEGORY_LABELS } from "@/lib/mock/wholesale-taxonomy";
import type { WholesaleCategory, WholesaleProduct } from "@/types/catalog";
import { saveWholesaleProduct } from "@/lib/admin/products/actions";
import { parseWholesaleProductForm } from "@/lib/admin/products/wholesale-form";

const CATEGORIES: WholesaleCategory[] = ["women", "men", "kids", "unisex", "fabric"];

const toRupees = (minor: number) => String(Math.round(minor / 100));

interface TierDraft {
  minQty: string;
  pricePerUnit: string;
}

/** Whether this deployment has a database to save products to. */
const CONFIGURED = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

export function WholesaleProductForm({ product }: { product?: WholesaleProduct }) {
  const router = useRouter();
  const updateWholesale = useAdminCatalogStore((s) => s.updateWholesale);
  const addWholesale = useAdminCatalogStore((s) => s.addWholesale);
  const isEdit = Boolean(product);

  const [form, setForm] = useState({
    name: product?.name ?? "",
    sku: product?.sku ?? "",
    category: product?.category ?? ("unisex" as WholesaleCategory),
    subcategory: product?.subcategory ?? "",
    description: product?.description ?? "",
    moq: product ? String(product.moq) : "",
    packSize: product ? String(product.packSize) : "",
    fabric: product?.fabric ?? "",
    sizeRun: product?.sizeRun ?? "",
    colors: product?.colors.join(", ") ?? "",
    leadTimeDays: product ? String(product.leadTimeDays) : "",
  });

  const [tiers, setTiers] = useState<TierDraft[]>(
    product?.priceTiers.map((t) => ({
      minQty: String(t.minQty),
      pricePerUnit: toRupees(t.pricePerUnit),
    })) ?? [{ minQty: "", pricePerUnit: "" }]
  );

  const subcategoryOptions = WHOLESALE_TAXONOMY[form.category].flatMap((d) => d.subcategories);

  function set<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function updateTier(index: number, key: keyof TierDraft, value: string) {
    setTiers((prev) => prev.map((t, i) => (i === index ? { ...t, [key]: value } : t)));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();

    const input = { ...form, tiers };

    // Parsed here as well as in the action, so an admin sees the problem
    // without a round trip. The action's copy is the one that binds.
    const parsed = parseWholesaleProductForm(input);
    if (!parsed.ok) {
      toast.error(parsed.error);
      return;
    }

    if (CONFIGURED) {
      const result = await saveWholesaleProduct(product?.slug ?? null, input);

      if (result.error) {
        toast.error(result.error);
        return;
      }

      if (!result.notConfigured) {
        toast.success(`${parsed.value.name} ${isEdit ? "updated" : "created"}`);
        router.push("/admin/products");
        return;
      }
    }

    const shared = {
      name: parsed.value.name,
      sku: parsed.value.sku,
      category: parsed.value.category,
      subcategory: parsed.value.subcategory,
      description: parsed.value.description,
      moq: parsed.value.moq,
      packSize: parsed.value.packSize,
      priceTiers: parsed.value.priceTiers,
      fabric: parsed.value.fabric,
      sizeRun: parsed.value.sizeRun,
      colors: parsed.value.colors,
      leadTimeDays: parsed.value.leadTimeDays,
    };

    if (isEdit && product) {
      updateWholesale(product.id, shared);
      toast.success(`${parsed.value.name} updated`);
    } else {
      addWholesale({
        ...shared,
        slug: parsed.value.name
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-|-$/g, ""),
        images: [placeholderImage(parsed.value.name.slice(0, 18), "#1d4ed8")],
        currency: "INR",
      });
      toast.success(`${parsed.value.name} created`);
    }
    router.push("/admin/products");
  }

  return (
    <div className="mx-auto max-w-2xl">
      <Link
        href="/admin/products"
        className="inline-flex items-center gap-1 text-sm text-neutral-500 hover:text-neutral-800"
      >
        <ArrowLeft className="h-4 w-4" /> Back to products
      </Link>

      <h1 className="mt-3 text-2xl font-bold text-neutral-900">
        {isEdit ? "Edit wholesale product" : "New wholesale product"}
      </h1>

      <form onSubmit={(e) => void onSubmit(e)} className="mt-6 space-y-4 rounded-lg border border-neutral-200 bg-white p-6">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="name">Product name</Label>
            <Input id="name" value={form.name} onChange={(e) => set("name", e.target.value)} />
          </div>
          <div>
            <Label htmlFor="sku">SKU</Label>
            <Input id="sku" value={form.sku} onChange={(e) => set("sku", e.target.value)} />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="category">Category</Label>
            <select
              id="category"
              value={form.category}
              onChange={(e) => {
                set("category", e.target.value as WholesaleCategory);
                set("subcategory", "");
              }}
              className="h-10 w-full rounded-md border border-neutral-300 px-3 text-sm focus:border-blue-600 focus:outline-none"
            >
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {WHOLESALE_CATEGORY_LABELS[c]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label htmlFor="subcategory">Subcategory</Label>
            <select
              id="subcategory"
              value={form.subcategory}
              onChange={(e) => set("subcategory", e.target.value)}
              className="h-10 w-full rounded-md border border-neutral-300 px-3 text-sm focus:border-blue-600 focus:outline-none"
            >
              <option value="">Select…</option>
              {subcategoryOptions.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <Label htmlFor="description">Description</Label>
          <textarea
            id="description"
            rows={3}
            value={form.description}
            onChange={(e) => set("description", e.target.value)}
            className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm focus:border-blue-600 focus:outline-none"
          />
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div>
            <Label htmlFor="moq">MOQ (units)</Label>
            <Input id="moq" type="number" min={1} value={form.moq} onChange={(e) => set("moq", e.target.value)} />
          </div>
          <div>
            <Label htmlFor="packSize">Pack size</Label>
            <Input
              id="packSize"
              type="number"
              min={1}
              value={form.packSize}
              onChange={(e) => set("packSize", e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="leadTimeDays">Lead time (days)</Label>
            <Input
              id="leadTimeDays"
              type="number"
              min={1}
              value={form.leadTimeDays}
              onChange={(e) => set("leadTimeDays", e.target.value)}
            />
          </div>
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between">
            <Label>Price tiers</Label>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setTiers((t) => [...t, { minQty: "", pricePerUnit: "" }])}
            >
              <Plus className="mr-1 h-3.5 w-3.5" /> Add tier
            </Button>
          </div>
          <div className="space-y-2">
            {tiers.map((tier, i) => (
              <div key={i} className="flex items-center gap-2">
                <Input
                  type="number"
                  min={1}
                  placeholder="Min qty"
                  aria-label={`Tier ${i + 1} minimum quantity`}
                  value={tier.minQty}
                  onChange={(e) => updateTier(i, "minQty", e.target.value)}
                />
                <Input
                  type="number"
                  min={0}
                  placeholder="₹ / unit"
                  aria-label={`Tier ${i + 1} price per unit`}
                  value={tier.pricePerUnit}
                  onChange={(e) => updateTier(i, "pricePerUnit", e.target.value)}
                />
                <button
                  type="button"
                  aria-label={`Remove tier ${i + 1}`}
                  onClick={() => setTiers((t) => t.filter((_, idx) => idx !== i))}
                  className="shrink-0 text-neutral-500 hover:text-red-600"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
          <p className="mt-1.5 text-xs text-neutral-500">
            Higher quantities must cost the same or less per unit.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="fabric">Fabric</Label>
            <Input id="fabric" value={form.fabric} onChange={(e) => set("fabric", e.target.value)} />
          </div>
          <div>
            <Label htmlFor="colors">Colours (comma separated)</Label>
            <Input id="colors" value={form.colors} onChange={(e) => set("colors", e.target.value)} />
          </div>
        </div>

        <div>
          <Label htmlFor="sizeRun">Size run</Label>
          <Input id="sizeRun" value={form.sizeRun} onChange={(e) => set("sizeRun", e.target.value)} />
        </div>

        <div className="flex gap-2 pt-2">
          <Button type="submit" variant="wholesale">
            {isEdit ? "Save changes" : "Create product"}
          </Button>
          <Button type="button" variant="outline" onClick={() => router.push("/admin/products")}>
            Cancel
          </Button>
        </div>
      </form>
    </div>
  );
}
