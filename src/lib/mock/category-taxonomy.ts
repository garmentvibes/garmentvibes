import type { RetailCategory } from "@/types/catalog";

export interface TaxonomyDepartment {
  label: string;
  subcategories: string[];
}

// Department -> subcategory tree per top-level category, used by the mega
// menu and to deep-link into a pre-filtered category page
// (/shop/women?subcategory=Sarees). Subcategory strings must match
// RetailProduct.subcategory exactly.
export const RETAIL_TAXONOMY: Record<RetailCategory, TaxonomyDepartment[]> = {
  women: [
    { label: "Ethnic Wear", subcategories: ["Kurtas", "Sarees", "Suit Sets"] },
    { label: "Western Wear", subcategories: ["Dresses", "Tops", "Jeans"] },
    { label: "Winter Wear", subcategories: ["Jackets"] },
  ],
  men: [
    { label: "Topwear", subcategories: ["T-Shirts", "Shirts"] },
    { label: "Bottomwear", subcategories: ["Jeans", "Trousers"] },
    { label: "Ethnic Wear", subcategories: ["Ethnic Wear"] },
    { label: "Winterwear", subcategories: ["Jackets"] },
  ],
  kids: [
    { label: "Girls", subcategories: ["Dresses", "Ethnic Wear"] },
    { label: "Boys", subcategories: ["T-Shirts", "Co-ord Sets"] },
    { label: "Everyday", subcategories: ["Co-ord Sets"] },
  ],
};

export const CATEGORY_LABELS: Record<RetailCategory, string> = {
  women: "Women",
  men: "Men",
  kids: "Kids",
};
