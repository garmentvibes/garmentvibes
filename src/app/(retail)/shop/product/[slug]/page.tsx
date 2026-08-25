import { notFound } from "next/navigation";
import { Star } from "lucide-react";
import type { Metadata } from "next";
import { Badge } from "@/components/ui/badge";
import { Breadcrumbs } from "@/components/retail/breadcrumbs";
import { ProductGallery } from "@/components/retail/product-gallery";
import { AddToCartPanel } from "@/components/retail/add-to-cart-panel";
import { ReviewSection } from "@/components/retail/review-section";
import { FitFeedback } from "@/components/retail/fit-feedback";
import { ProductQuestions } from "@/components/retail/product-questions";
import { ProductCard } from "@/components/retail/product-card";
import { RecentlyViewedTracker } from "@/components/retail/recently-viewed-tracker";
import { RecentlyViewedRail } from "@/components/retail/recently-viewed-rail";
import {
  getRetailCatalogue,
  getRetailProduct,
  getRelatedRetailProducts,
} from "@/lib/catalogue/retail";
import { getRetailReviews } from "@/lib/mock/retail-reviews";
import { JsonLd } from "@/components/shared/json-ld";
import { breadcrumbSchema, retailProductSchema } from "@/lib/seo";
import { formatPrice } from "@/lib/utils";

// `dynamicParams = false` used to be here, so that anything not produced by
// generateStaticParams was a 404 rather than a server-rendered miss. Its own
// comment said what would end this:
//
//     Correct while the catalogue is static. Once products come from the
//     database, adding one will need a revalidation (or this flipped back to
//     the default) before its page becomes reachable.
//
// Products now come from the database, so it is flipped back. A product added
// after the last build would otherwise 404 until someone redeployed — the
// catalogue would contain it, the listing pages would link to it, and the page
// itself would refuse to exist.
//
// Nothing is lost by removing it. It was guarding against a soft 404 — an
// unknown slug rendering the not-found page with HTTP 200 — and `notFound()`
// below returns a real 404 for exactly that case. The flag only ever changed
// whether the miss was decided at build time or at request time.

// Rebuild the page at most this often. A clothing catalogue changes seasonally,
// so an hour is generous rather than tight, and admin writes call
// revalidatePath() to publish an edit immediately instead of waiting it out.
export const revalidate = 3600;

export async function generateStaticParams() {
  const catalogue = await getRetailCatalogue();
  return catalogue.map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const product = await getRetailProduct(slug);
  if (!product) return {};
  return {
    title: product.name,
    description: product.description,
    alternates: { canonical: `/shop/product/${product.slug}` },
    openGraph: {
      type: "website",
      title: `${product.name} — ${product.brand}`,
      description: product.description,
      url: `/shop/product/${product.slug}`,
    },
  };
}

export default async function ProductPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const product = await getRetailProduct(slug);
  if (!product) notFound();

  const discount = Math.round(((product.mrp - product.price) / product.mrp) * 100);
  const reviews = getRetailReviews(product.id);
  const related = await getRelatedRetailProducts(product);

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <JsonLd
        data={[
          retailProductSchema(product),
          breadcrumbSchema([
            { name: "Home", path: "/shop" },
            { name: product.category, path: `/shop/${product.category}` },
            { name: product.name, path: `/shop/product/${product.slug}` },
          ]),
        ]}
      />
      <RecentlyViewedTracker
        productId={product.id}
        productName={product.name}
        price={product.price}
      />
      <Breadcrumbs
        items={[
          { label: product.category, href: `/shop/${product.category}` },
          { label: product.name },
        ]}
      />

      <div className="mt-3 grid grid-cols-1 gap-10 md:grid-cols-2">
        <ProductGallery images={product.images} productId={product.id} alt={product.name} />

        <div>
          <p className="text-sm font-semibold text-neutral-500">{product.brand}</p>
          <h1 className="mt-1 text-2xl font-bold text-neutral-900">{product.name}</h1>

          <div className="mt-2 flex items-center gap-2 text-sm">
            <span className="flex items-center gap-1 rounded bg-green-700 px-1.5 py-0.5 text-xs font-semibold text-white">
              {product.rating} <Star className="h-3 w-3 fill-white" />
            </span>
            <span className="text-neutral-500">{product.ratingCount} ratings</span>
            {product.tags?.map((tag) => (
              <Badge key={tag} variant="retail" className="capitalize">
                {tag}
              </Badge>
            ))}
          </div>

          <div className="mt-4 flex items-center gap-2">
            <span className="text-2xl font-bold text-neutral-900">{formatPrice(product.price)}</span>
            {discount > 0 && (
              <>
                <span className="text-neutral-400 line-through">{formatPrice(product.mrp)}</span>
                <span className="font-medium text-green-700">{discount}% off</span>
              </>
            )}
          </div>

          <p className="mt-4 text-sm leading-relaxed text-neutral-600">{product.description}</p>

          <div className="mt-6 border-t border-neutral-200 pt-6">
            <AddToCartPanel product={product} />
          </div>

          {/* Directly under the size picker, because that is the moment the
              question is being asked. Fit is the top return reason in Indian
              apparel, so this belongs beside the decision, not below the
              reviews where most people never scroll. */}
          <div className="mt-6">
            <FitFeedback productId={product.id} />
          </div>
        </div>
      </div>

      <ProductQuestions productId={product.id} productName={product.name} />

      <ReviewSection
        productId={product.id}
        productName={product.name}
        seededReviews={reviews}
      />

      {related.length > 0 && (
        <section className="mt-14">
          <h2 className="mb-4 text-xl font-bold text-neutral-900">You May Also Like</h2>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
            {related.map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>
        </section>
      )}

      <RecentlyViewedRail excludeId={product.id} />
    </div>
  );
}
