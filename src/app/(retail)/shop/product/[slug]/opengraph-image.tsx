import { ImageResponse } from "next/og";
import { RETAIL_PRODUCTS, getRetailProductBySlug } from "@/lib/mock/retail-products";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "GarmentVibes product";

export function generateStaticParams() {
  return RETAIL_PRODUCTS.map((p) => ({ slug: p.slug }));
}

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const product = getRetailProductBySlug(slug);

  const name = product?.name ?? "GarmentVibes";
  const brand = product?.brand ?? "Fashion Retail & Wholesale";
  const price = product ? `₹${Math.round(product.price / 100).toLocaleString("en-IN")}` : "";
  const mrp =
    product && product.mrp > product.price
      ? `₹${Math.round(product.mrp / 100).toLocaleString("en-IN")}`
      : "";
  const discount =
    product && product.mrp > product.price
      ? `${Math.round(((product.mrp - product.price) / product.mrp) * 100)}% off`
      : "";

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: 80,
          background: "#fff1f2",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", fontSize: 30, color: "#9f1239", letterSpacing: 4 }}>
            {brand.toUpperCase()}
          </div>
          <div
            style={{
              display: "flex",
              marginTop: 22,
              fontSize: 66,
              fontWeight: 700,
              color: "#1c1917",
              lineHeight: 1.15,
            }}
          >
            {name.length > 62 ? `${name.slice(0, 62)}…` : name}
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 22 }}>
            <div style={{ display: "flex", fontSize: 62, fontWeight: 700, color: "#1c1917" }}>
              {price}
            </div>
            {mrp ? (
              <div
                style={{
                  display: "flex",
                  fontSize: 34,
                  color: "#a8a29e",
                  textDecoration: "line-through",
                }}
              >
                {mrp}
              </div>
            ) : null}
            {discount ? (
              <div style={{ display: "flex", fontSize: 34, color: "#15803d" }}>{discount}</div>
            ) : null}
          </div>

          <div style={{ display: "flex", fontSize: 34, fontWeight: 700, color: "#e11d48" }}>
            GarmentVibes
          </div>
        </div>
      </div>
    ),
    size
  );
}
