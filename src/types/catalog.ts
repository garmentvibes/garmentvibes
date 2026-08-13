// Shared money type: prices are stored in minor units (paise for INR, cents for USD)
// to avoid floating point issues, formatted with formatPrice() from lib/utils.

export type Currency = "INR" | "USD";

// ---------------------------------------------------------------------------
// Retail catalog — individual shoppers, single-unit purchases (Myntra-style)
// ---------------------------------------------------------------------------

export type RetailCategory = "women" | "men" | "kids";

export interface RetailSize {
  label: string; // e.g. "S", "M", "L", "XL", "32", "34"
  inStock: boolean;
}

export interface RetailProduct {
  id: string;
  slug: string;
  name: string;
  brand: string;
  category: RetailCategory;
  subcategory: string; // e.g. "Kurtas", "T-Shirts", "Sarees"
  description: string;
  images: string[]; // color-coded placeholder swatches for now
  price: number; // minor units, current selling price
  mrp: number; // minor units, original price (for strike-through)
  currency: Currency;
  sizes: RetailSize[];
  colors: string[];
  rating: number; // 0-5
  ratingCount: number;
  tags?: Array<"new" | "bestseller" | "sale">;
}

// ---------------------------------------------------------------------------
// Wholesale catalog — B2B buyers, bulk purchases with MOQ + tiered pricing
// ---------------------------------------------------------------------------

export type WholesaleCategory = "women" | "men" | "kids" | "unisex" | "fabric";

export interface WholesalePriceTier {
  minQty: number; // minimum units to unlock this price
  pricePerUnit: number; // minor units, per single garment unit
}

export interface WholesaleProduct {
  id: string;
  sku: string;
  slug: string;
  name: string;
  category: WholesaleCategory;
  subcategory: string; // e.g. "T-Shirts & Polos", "Denim & Trousers"
  description: string;
  images: string[];
  currency: Currency;
  moq: number; // minimum order quantity, in units
  packSize: number; // units per pack/carton (orders are placed in multiples of this)
  priceTiers: WholesalePriceTier[]; // sorted ascending by minQty
  sizeRun: string; // e.g. "S-M-L-XL (2:4:4:2 ratio per pack)"
  fabric: string;
  colors: string[];
  leadTimeDays: number;
  tags?: Array<"new" | "bestseller" | "closeout">;
}

export function wholesalePriceForQty(product: WholesaleProduct, qty: number): number {
  let price = product.priceTiers[0]?.pricePerUnit ?? 0;
  for (const tier of product.priceTiers) {
    if (qty >= tier.minQty) price = tier.pricePerUnit;
  }
  return price;
}
