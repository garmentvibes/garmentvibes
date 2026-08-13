import type { WholesaleCategory } from "@/types/catalog";

export interface WholesaleTaxonomyDepartment {
  label: string;
  subcategories: string[];
}

// Department -> subcategory tree per top-level category, mirrors
// category-taxonomy.ts on the retail side. Subcategory strings must match
// WholesaleProduct.subcategory exactly.
export const WHOLESALE_TAXONOMY: Record<WholesaleCategory, WholesaleTaxonomyDepartment[]> = {
  women: [
    { label: "Ethnic", subcategories: ["Kurtis", "Sarees & Suit Sets"] },
    { label: "Western", subcategories: ["Western Wear"] },
  ],
  men: [
    { label: "Topwear", subcategories: ["T-Shirts & Polos", "Shirts"] },
    { label: "Bottomwear", subcategories: ["Denim & Trousers"] },
    { label: "Ethnic", subcategories: ["Ethnic Wear"] },
  ],
  kids: [
    { label: "Everyday", subcategories: ["Co-ord Sets", "T-Shirts & Dresses"] },
  ],
  unisex: [
    { label: "Activewear & Basics", subcategories: ["Activewear", "Basics"] },
  ],
  fabric: [
    { label: "Fabric Rolls", subcategories: ["Cotton Fabric", "Embroidered & Silk Blend"] },
  ],
};

export const WHOLESALE_CATEGORY_LABELS: Record<WholesaleCategory, string> = {
  women: "Women",
  men: "Men",
  kids: "Kids",
  unisex: "Unisex",
  fabric: "Fabric",
};
