"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAdminCatalogStore } from "@/lib/stores/admin-catalog-store";
import { placeholderImage } from "@/lib/mock/placeholder-image";
import { RETAIL_TAXONOMY, CATEGORY_LABELS } from "@/lib/mock/category-taxonomy";
import type { RetailCategory, RetailProduct } from "@/types/catalog";

const CATEGORIES: RetailCategory[] = ["women", "men", "kids"];

// Prices are stored in minor units (paise); the form works in rupees so staff
// aren't typing 129900 for ₹1,299.
const toRupees = (minor: number) => String(Math.round(minor / 100));
const toMinor = (rupees: string) => Math.round(Number(rupees) * 100) || 0;

export function RetailProductForm({ product }: { product?: RetailProduct }) {
  const router = useRouter();
  const updateRetail = useAdminCatalogStore((s) => s.updateRetail);
  const addRetail = useAdminCatalogStore((s) => s.addRetail);
  const isEdit = Boolean(product);

  const [form, setForm] = useState({
    name: product?.name ?? "",
    brand: product?.brand ?? "",
    category: product?.category ?? ("women" as RetailCategory),
    subcategory: product?.subcategory ?? "",
    description: product?.description ?? "",
    price: product ? toRupees(product.price) : "",
    mrp: product ? toRupees(product.mrp) : "",
    colors: product?.colors.join(", ") ?? "",
    sizes: product?.sizes.map((s) => s.label).join(", ") ?? "S, M, L, XL",
  });

  const subcategoryOptions = RETAIL_TAXONOMY[form.category].flatMap((d) => d.subcategories);

  function set<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name || !form.brand || !form.subcategory || !form.price) {
      toast.error("Name, brand, category and price are required");
      return;
    }
    const price = toMinor(form.price);
    const mrp = toMinor(form.mrp) || price;
    if (mrp < price) {
      toast.error("MRP can't be lower than the selling price");
      return;
    }

    const shared = {
      name: form.name,
      brand: form.brand,
      category: form.category,
      subcategory: form.subcategory,
      description: form.description,
      price,
      mrp,
      colors: form.colors.split(",").map((c) => c.trim()).filter(Boolean),
      sizes: form.sizes
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
        .map((label) => ({ label, inStock: true })),
    };

    if (isEdit && product) {
      updateRetail(product.id, shared);
      toast.success(`${form.name} updated`);
    } else {
      addRetail({
        ...shared,
        slug: form.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""),
        images: [placeholderImage(form.name.slice(0, 18), "#e11d48")],
        currency: "INR",
        rating: 0,
        ratingCount: 0,
      });
      toast.success(`${form.name} created`);
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
        {isEdit ? "Edit retail product" : "New retail product"}
      </h1>

      <form onSubmit={onSubmit} className="mt-6 space-y-4 rounded-lg border border-neutral-200 bg-white p-6">
        <div>
          <Label htmlFor="name">Product name</Label>
          <Input id="name" value={form.name} onChange={(e) => set("name", e.target.value)} />
        </div>

        <div>
          <Label htmlFor="brand">Brand</Label>
          <Input id="brand" value={form.brand} onChange={(e) => set("brand", e.target.value)} />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="category">Category</Label>
            <select
              id="category"
              value={form.category}
              onChange={(e) => {
                set("category", e.target.value as RetailCategory);
                set("subcategory", "");
              }}
              className="h-10 w-full rounded-md border border-neutral-300 px-3 text-sm focus:border-rose-400 focus:outline-none"
            >
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {CATEGORY_LABELS[c]}
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
              className="h-10 w-full rounded-md border border-neutral-300 px-3 text-sm focus:border-rose-400 focus:outline-none"
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
            className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm focus:border-rose-400 focus:outline-none"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="price">Selling price (₹)</Label>
            <Input
              id="price"
              type="number"
              min={0}
              value={form.price}
              onChange={(e) => set("price", e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="mrp">MRP (₹)</Label>
            <Input
              id="mrp"
              type="number"
              min={0}
              value={form.mrp}
              onChange={(e) => set("mrp", e.target.value)}
            />
          </div>
        </div>

        <div>
          <Label htmlFor="colors">Colours (comma separated)</Label>
          <Input id="colors" value={form.colors} onChange={(e) => set("colors", e.target.value)} />
        </div>

        <div>
          <Label htmlFor="sizes">Sizes (comma separated)</Label>
          <Input id="sizes" value={form.sizes} onChange={(e) => set("sizes", e.target.value)} />
        </div>

        <div className="flex gap-2 pt-2">
          <Button type="submit" variant="retail">
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
