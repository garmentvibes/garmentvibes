import { notFound } from "next/navigation";
import Image from "next/image";
import type { Metadata } from "next";
import { Badge } from "@/components/ui/badge";
import { WholesaleBreadcrumbs } from "@/components/wholesale/breadcrumbs";
import { AddToOrderPanel } from "@/components/wholesale/add-to-order-panel";
import { WholesaleProductCard } from "@/components/wholesale/product-card";
import {
  getWholesaleCatalogue,
  getWholesaleProduct,
  getRelatedWholesaleProducts,
} from "@/lib/catalogue/wholesale";
import { WHOLESALE_CATEGORY_LABELS } from "@/lib/mock/wholesale-taxonomy";
import { JsonLd } from "@/components/shared/json-ld";
import { breadcrumbSchema, wholesaleProductSchema } from "@/lib/seo";

// `dynamicParams = false` used to be here, guarding against a soft 404 — an
// unknown slug rendering the not-found page with HTTP 200. Its own comment
// named what would end it:
//
//     Correct while the catalogue is static. Once products come from the
//     database, adding one will need a revalidation (or this flipped back to
//     the default) before its page becomes reachable.
//
// Products come from the database now, so it is flipped back, exactly as on
// the retail route. A product added after the last build would otherwise 404
// while the catalogue contained it and the listings linked to it — and
// `notFound()` below returns a real 404 for a genuinely unknown slug, which
// is all the flag was buying.

// Rebuilt at most this often; admin writes call revalidatePath to publish an
// edit immediately rather than waiting out the interval.
export const revalidate = 3600;

export async function generateStaticParams() {
  const catalogue = await getWholesaleCatalogue();
  return catalogue.map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const product = await getWholesaleProduct(slug);
  if (!product) return {};
  return {
    title: product.name,
    description: product.description,
    alternates: { canonical: `/wholesale/product/${product.slug}` },
    openGraph: {
      type: "website",
      title: `${product.name} — Wholesale`,
      description: product.description,
      url: `/wholesale/product/${product.slug}`,
    },
  };
}

export default async function WholesaleProductPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const product = await getWholesaleProduct(slug);
  if (!product) notFound();

  const related = await getRelatedWholesaleProducts(product);

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <JsonLd
        data={[
          wholesaleProductSchema(product),
          breadcrumbSchema([
            { name: "Catalog", path: "/wholesale/catalog" },
            {
              name: WHOLESALE_CATEGORY_LABELS[product.category],
              path: `/wholesale/catalog/${product.category}`,
            },
            { name: product.name, path: `/wholesale/product/${product.slug}` },
          ]),
        ]}
      />
      <WholesaleBreadcrumbs
        items={[
          { label: "Catalog", href: "/wholesale/catalog" },
          {
            label: WHOLESALE_CATEGORY_LABELS[product.category],
            href: `/wholesale/catalog/${product.category}`,
          },
          { label: product.name },
        ]}
      />

      <div className="mt-3 grid grid-cols-1 gap-10 md:grid-cols-2">
        <div className="relative aspect-[3/4] overflow-hidden rounded-lg bg-slate-100">
          <Image
            src={product.images[0]}
            alt={product.name}
            fill
            sizes="(max-width: 768px) 100vw, 50vw"
            // LCP element on a trade product page, same as the retail gallery.
            priority
            className="object-cover"
          />
        </div>

        <div>
          <p className="font-mono text-xs text-slate-400">{product.sku}</p>
          <h1 className="mt-1 text-2xl font-bold text-slate-900">{product.name}</h1>

          <div className="mt-2 flex flex-wrap items-center gap-2">
            {product.tags?.map((tag) => (
              <Badge key={tag} variant="wholesale" className="capitalize">
                {tag}
              </Badge>
            ))}
            <Badge variant="outline">{product.subcategory}</Badge>
            <Badge variant="outline">Lead time: {product.leadTimeDays} days</Badge>
          </div>

          <p className="mt-4 text-sm leading-relaxed text-slate-600">{product.description}</p>

          <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
            <div>
              <dt className="text-slate-400">Fabric</dt>
              <dd className="text-slate-800">{product.fabric}</dd>
            </div>
            <div>
              <dt className="text-slate-400">Size run</dt>
              <dd className="text-slate-800">{product.sizeRun}</dd>
            </div>
            <div>
              <dt className="text-slate-400">Colors</dt>
              <dd className="text-slate-800">{product.colors.join(", ")}</dd>
            </div>
            <div>
              <dt className="text-slate-400">Pack size</dt>
              <dd className="text-slate-800">{product.packSize} units/pack</dd>
            </div>
          </dl>

          <div className="mt-6 border-t border-slate-200 pt-6">
            <AddToOrderPanel product={product} />
          </div>
        </div>
      </div>

      {related.length > 0 && (
        <section className="mt-14">
          <h2 className="mb-4 text-xl font-bold text-slate-900">Related Products</h2>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
            {related.map((p) => (
              <WholesaleProductCard key={p.id} product={p} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
