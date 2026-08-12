import type { WholesaleProduct } from "@/types/catalog";
import { placeholderImage } from "./placeholder-image";

export const WHOLESALE_PRODUCTS: WholesaleProduct[] = [
  {
    id: "w1",
    sku: "GV-WCT-001",
    slug: "cotton-round-neck-tee-bulk",
    name: "Cotton Round Neck T-Shirt (Bulk Pack)",
    category: "unisex",
    description:
      "180 GSM combed cotton round neck tee, solid colours, sold in size-run packs ready for retail floor.",
    images: [placeholderImage("Bulk Tee Pack", "#1d4ed8")],
    currency: "INR",
    moq: 120,
    packSize: 12,
    priceTiers: [
      { minQty: 120, pricePerUnit: 24900 },
      { minQty: 300, pricePerUnit: 21900 },
      { minQty: 600, pricePerUnit: 18900 },
    ],
    sizeRun: "S-M-L-XL (2:4:4:2 ratio per pack of 12)",
    fabric: "180 GSM Combed Cotton",
    colors: ["White", "Black", "Navy", "Grey Melange"],
    leadTimeDays: 7,
    tags: ["bestseller"],
  },
  {
    id: "w2",
    sku: "GV-WKR-002",
    slug: "cotton-printed-kurti-bulk",
    name: "Cotton Printed Kurti (Bulk Pack)",
    category: "women",
    description:
      "Rayon-cotton printed kurtis in fast-selling prints, curated seasonally for retail resale.",
    images: [placeholderImage("Kurti Bulk Pack", "#be185d")],
    currency: "INR",
    moq: 60,
    packSize: 6,
    priceTiers: [
      { minQty: 60, pricePerUnit: 39900 },
      { minQty: 150, pricePerUnit: 34900 },
      { minQty: 300, pricePerUnit: 29900 },
    ],
    sizeRun: "S-M-L-XL (1:2:2:1 ratio per pack of 6)",
    fabric: "Rayon Cotton",
    colors: ["Assorted seasonal prints"],
    leadTimeDays: 10,
    tags: ["new"],
  },
  {
    id: "w3",
    sku: "GV-WDN-003",
    slug: "denim-jeans-bulk",
    name: "Stretch Denim Jeans (Bulk Pack)",
    category: "men",
    description: "5-pocket stretch denim jeans in wash-finished indigo and black, factory-packed.",
    images: [placeholderImage("Denim Bulk Pack", "#1e40af")],
    currency: "INR",
    moq: 96,
    packSize: 8,
    priceTiers: [
      { minQty: 96, pricePerUnit: 64900 },
      { minQty: 240, pricePerUnit: 57900 },
      { minQty: 480, pricePerUnit: 49900 },
    ],
    sizeRun: "30-32-34-36 (2:3:2:1 ratio per pack of 8)",
    fabric: "98% Cotton / 2% Spandex",
    colors: ["Indigo Wash", "Black Wash"],
    leadTimeDays: 14,
  },
  {
    id: "w4",
    sku: "GV-WKD-004",
    slug: "kids-cotton-coord-set-bulk",
    name: "Kids Cotton Co-ord Set (Bulk Pack)",
    category: "kids",
    description: "Everyday cotton tee-and-shorts co-ord sets for kids, mixed prints per carton.",
    images: [placeholderImage("Kids Co-ord Bulk", "#16a34a")],
    currency: "INR",
    moq: 72,
    packSize: 12,
    priceTiers: [
      { minQty: 72, pricePerUnit: 18900 },
      { minQty: 180, pricePerUnit: 16400 },
      { minQty: 360, pricePerUnit: 13900 },
    ],
    sizeRun: "2-3Y to 8-9Y (mixed ratio per pack of 12)",
    fabric: "Cotton Blend",
    colors: ["Assorted"],
    leadTimeDays: 10,
    tags: ["bestseller"],
  },
  {
    id: "w5",
    sku: "GV-WSR-005",
    slug: "chikankari-kurti-fabric-bulk",
    name: "Chikankari Embroidered Fabric (Bulk Roll)",
    category: "fabric",
    description: "Lucknowi chikankari hand-embroidered cotton fabric, sold by the roll for manufacturing.",
    images: [placeholderImage("Chikankari Fabric", "#0e7490")],
    currency: "INR",
    moq: 200,
    packSize: 50,
    priceTiers: [
      { minQty: 200, pricePerUnit: 8900 },
      { minQty: 500, pricePerUnit: 7900 },
      { minQty: 1000, pricePerUnit: 6900 },
    ],
    sizeRun: "N/A — sold by the metre",
    fabric: "100% Cotton, hand embroidery",
    colors: ["White base", "Pastel base"],
    leadTimeDays: 18,
  },
  {
    id: "w6",
    sku: "GV-WFR-006",
    slug: "formal-shirt-bulk",
    name: "Formal Cotton Shirt (Bulk Pack)",
    category: "men",
    description: "Non-iron finish formal shirts in classic office colourways, retail-ready tagging included.",
    images: [placeholderImage("Formal Shirt Bulk", "#334155")],
    currency: "INR",
    moq: 96,
    packSize: 8,
    priceTiers: [
      { minQty: 96, pricePerUnit: 44900 },
      { minQty: 240, pricePerUnit: 39900 },
      { minQty: 480, pricePerUnit: 34900 },
    ],
    sizeRun: "S-M-L-XL (2:3:2:1 ratio per pack of 8)",
    fabric: "Cotton Poly Blend, Non-Iron Finish",
    colors: ["White", "Sky Blue", "Charcoal"],
    leadTimeDays: 12,
  },
  {
    id: "w7",
    sku: "GV-WET-007",
    slug: "festive-ethnic-set-bulk",
    name: "Festive Ethnic Kurta Set (Bulk Pack)",
    category: "unisex",
    description: "Season-ready festive kurta sets, popular for Diwali and wedding-season retail stocking.",
    images: [placeholderImage("Festive Ethnic Bulk", "#7c2d12")],
    currency: "INR",
    moq: 48,
    packSize: 6,
    priceTiers: [
      { minQty: 48, pricePerUnit: 79900 },
      { minQty: 120, pricePerUnit: 69900 },
      { minQty: 240, pricePerUnit: 59900 },
    ],
    sizeRun: "S-M-L-XL (1:2:2:1 ratio per pack of 6)",
    fabric: "Silk Blend",
    colors: ["Maroon", "Gold", "Emerald"],
    leadTimeDays: 21,
    tags: ["new"],
  },
  {
    id: "w8",
    sku: "GV-WAT-008",
    slug: "activewear-joggers-bulk",
    name: "Activewear Joggers (Bulk Pack)",
    category: "unisex",
    description: "4-way stretch jogger pants for activewear resale, moisture-wicking fabric.",
    images: [placeholderImage("Joggers Bulk", "#0f172a")],
    currency: "INR",
    moq: 120,
    packSize: 12,
    priceTiers: [
      { minQty: 120, pricePerUnit: 34900 },
      { minQty: 300, pricePerUnit: 29900 },
      { minQty: 600, pricePerUnit: 25900 },
    ],
    sizeRun: "S-M-L-XL (2:4:4:2 ratio per pack of 12)",
    fabric: "4-Way Stretch Polyester Blend",
    colors: ["Black", "Grey", "Navy"],
    leadTimeDays: 9,
    tags: ["closeout"],
  },
];

export function getWholesaleProductBySlug(slug: string) {
  return WHOLESALE_PRODUCTS.find((p) => p.slug === slug);
}

export function getWholesaleProductsByCategory(category: string) {
  return WHOLESALE_PRODUCTS.filter((p) => p.category === category);
}

export function getWholesaleProductBySku(sku: string) {
  return WHOLESALE_PRODUCTS.find((p) => p.sku.toLowerCase() === sku.trim().toLowerCase());
}

export function searchWholesaleProducts(query: string) {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return WHOLESALE_PRODUCTS.filter((p) =>
    [p.name, p.sku, p.category, p.fabric].some((field) => field.toLowerCase().includes(q))
  );
}
