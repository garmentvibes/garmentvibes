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
import { useStockStore, getStock } from "@/lib/stores/stock-store";
import { notifyRestocked } from "@/lib/notify-restock";
import { placeholderImage } from "@/lib/mock/placeholder-image";
import { RETAIL_TAXONOMY, CATEGORY_LABELS } from "@/lib/mock/category-taxonomy";
import type { RetailCategory, RetailProduct } from "@/types/catalog";
import { saveRetailProduct, setRetailStock } from "@/lib/admin/products/actions";
import { parseRetailProductForm } from "@/lib/admin/products/form";

const CATEGORIES: RetailCategory[] = ["women", "men", "kids"];

// Prices are stored in minor units (paise); the form works in rupees so staff
// aren't typing 129900 for ₹1,299.
const toRupees = (minor: number) => String(Math.round(minor / 100));

/**
 * Whether this deployment has a database to save products to.
 *
 * From the inlined public env for the same reason as the other admin hooks:
 * the answer is fixed at build time and asking costs a round trip on a page
 * that is going to fall back regardless.
 */
const CONFIGURED = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

export function RetailProductForm({ product }: { product?: RetailProduct }) {
  const router = useRouter();
  const updateRetail = useAdminCatalogStore((s) => s.updateRetail);
  const addRetail = useAdminCatalogStore((s) => s.addRetail);
  const stockOverrides = useStockStore((s) => s.overrides);
  const setStock = useStockStore((s) => s.setStock);
  const isEdit = Boolean(product);

  // What the admin has typed into a stock field, per size label.
  //
  // Needed because the stock this page displays now comes from the catalogue
  // row when there is a database, and `product` is a prop from a server
  // component — so a write plus revalidatePath does not change it until the
  // route is re-rendered, and the field would sit at the old number while
  // somebody typed into it. This holds the typed value until then.
  //
  // Cleared back to the stored value if the write fails, rather than left
  // showing a number the shelf does not have.
  const [stockEdits, setStockEdits] = useState<Record<string, number>>({});

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

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();

    // Parsed here as well as in the action, so an admin sees the problem
    // without a round trip. The action's copy is the one that binds.
    const parsed = parseRetailProductForm(form);
    if (!parsed.ok) {
      toast.error(parsed.error);
      return;
    }

    if (CONFIGURED) {
      const result = await saveRetailProduct(product?.slug ?? null, form);

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

    // No database on this deployment: the local store is the catalogue, which
    // is what every QA environment here runs against.
    const shared = {
      name: parsed.value.name,
      brand: parsed.value.brand,
      category: parsed.value.category,
      subcategory: parsed.value.subcategory,
      description: parsed.value.description,
      price: parsed.value.price,
      mrp: parsed.value.mrp,
      colors: parsed.value.colors,
      sizes: parsed.value.sizes.map((label) => ({ label, inStock: true })),
    };

    if (isEdit && product) {
      updateRetail(product.id, shared);
      toast.success(`${parsed.value.name} updated`);
    } else {
      addRetail({
        ...shared,
        slug: parsed.value.name
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-|-$/g, ""),
        images: [placeholderImage(parsed.value.name.slice(0, 18), "#e11d48")],
        currency: "INR",
        rating: 0,
        ratingCount: 0,
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
        {isEdit ? "Edit retail product" : "New retail product"}
      </h1>

      <form onSubmit={(e) => void onSubmit(e)} className="mt-6 space-y-4 rounded-lg border border-neutral-200 bg-white p-6">
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

        {product && (
          <div>
            <Label>Stock by size</Label>
            <div className="mt-1 flex flex-wrap gap-3">
              {product.sizes.map((s) => {
                const stored = getStock(stockOverrides, product, s.label);
                const stock = stockEdits[s.label] ?? stored;
                return (
                  <div key={s.label} className="flex items-center gap-1.5">
                    <span className="w-12 text-sm text-neutral-600">{s.label}</span>
                    <Input
                      type="number"
                      min={0}
                      value={stock}
                      aria-label={`Stock for size ${s.label}`}
                      onChange={(e) => {
                        const next = Number(e.target.value) || 0;

                        // The field shows what was typed straight away, and the
                        // shelf catches up underneath.
                        setStockEdits((edits) => ({ ...edits, [s.label]: next }));

                        // Still written to the store, because on a deployment
                        // with no database that store IS the shelf — every QA
                        // suite here runs that way. Where there is a database
                        // it is the row that counts, and getStock() prefers it.
                        setStock(product.id, s.label, next);

                        if (CONFIGURED) {
                          void setRetailStock(product.slug, s.label, next).then((result) => {
                            if (result.error) {
                              toast.error(result.error);
                              // Put the field back to the number the shelf
                              // actually has. Leaving the typed one there would
                              // show stock nobody can buy.
                              setStockEdits((edits) => {
                                const { [s.label]: _rejected, ...rest } = edits;
                                return rest;
                              });
                              setStock(product.id, s.label, stored);
                            }
                          });
                        }

                        // Restocking from zero is what people asked to hear
                        // about, so the alert fires from the edit itself.
                        if (stock === 0 && next > 0) {
                          const sent = notifyRestocked(product.id, s.label, product.name);
                          if (sent > 0) {
                            toast.success(
                              `${sent} back-in-stock ${sent === 1 ? "alert" : "alerts"} queued for size ${s.label}`
                            );
                          }
                        }
                      }}
                      className="h-9 w-20"
                    />
                  </div>
                );
              })}
            </div>
            <p className="mt-1.5 text-xs text-neutral-400">
              Stock saves immediately. A size at 0 shows as sold out and can&apos;t be added to a bag.
            </p>
          </div>
        )}

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
