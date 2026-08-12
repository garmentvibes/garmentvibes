import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { AddToOrderPanel } from "@/components/wholesale/add-to-order-panel";
import { WHOLESALE_PRODUCTS, getWholesaleProductBySlug } from "@/lib/mock/wholesale-products";

export function generateStaticParams() {
  return WHOLESALE_PRODUCTS.map((p) => ({ slug: p.slug }));
}

export default async function WholesaleProductPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const product = getWholesaleProductBySlug(slug);
  if (!product) notFound();

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <div className="grid grid-cols-1 gap-10 md:grid-cols-2">
        <div className="aspect-[3/4] overflow-hidden rounded-lg bg-slate-100">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={product.images[0]} alt={product.name} className="h-full w-full object-cover" />
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
    </div>
  );
}
