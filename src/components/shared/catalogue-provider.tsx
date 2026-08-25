"use client";

import { createContext, useContext } from "react";

import { RETAIL_PRODUCTS } from "@/lib/mock/retail-products";
import { WHOLESALE_PRODUCTS } from "@/lib/mock/wholesale-products";
import type { RetailProduct, WholesaleProduct } from "@/types/catalog";

// ---------------------------------------------------------------------------
// The catalogue, for the client components that need all of it.
//
// Most of the storefront reads the catalogue in a server component and renders
// the result. Three cannot: the search box autocompletes across every product
// as you type, and the recently-viewed rail resolves a list of ids the browser
// remembered. Both need the whole catalogue in the browser, and neither can
// await.
//
// Until now they imported src/lib/mock/retail-products.ts directly. Once the
// pages read the database, that becomes a disagreement on the same screen —
// autocomplete offering a product at last season's price, next to a listing
// showing this season's. So the layout reads the catalogue once, on the
// server, and hands it down.
//
// It costs nothing that was not already being paid: those 33 products were in
// the JavaScript bundle before, imported as a module. Now they are in the RSC
// payload instead, fetched once per render and shared by both consumers.
// ---------------------------------------------------------------------------

/**
 * Defaults to the module rather than to an empty array.
 *
 * A component rendered outside the provider — a test, a Storybook story, a
 * page in another route group — gets the same catalogue it had before rather
 * than an empty one. An empty default would turn a missing provider into a
 * search box that silently finds nothing, which is the kind of bug that gets
 * diagnosed as "search is broken" for a while first.
 */
const CatalogueContext = createContext<RetailProduct[]>(RETAIL_PRODUCTS);

export function CatalogueProvider({
  catalogue,
  children,
}: {
  catalogue: RetailProduct[];
  children: React.ReactNode;
}) {
  return <CatalogueContext value={catalogue}>{children}</CatalogueContext>;
}

/** Every retail product, as the server last read them. */
export function useCatalogue(): RetailProduct[] {
  return useContext(CatalogueContext);
}

// ---------------------------------------------------------------------------
// The same, for the wholesale portal.
//
// A separate context rather than one carrying both catalogues, so a retail
// page does not pay to ship 25 wholesale products it will never render, and a
// trade page does not ship 33 retail ones. The two sides of this app share
// almost nothing by design — separate catalogues, separate pricing, separate
// chrome — and this follows that.
// ---------------------------------------------------------------------------

const WholesaleCatalogueContext = createContext<WholesaleProduct[]>(WHOLESALE_PRODUCTS);

export function WholesaleCatalogueProvider({
  catalogue,
  children,
}: {
  catalogue: WholesaleProduct[];
  children: React.ReactNode;
}) {
  return (
    <WholesaleCatalogueContext value={catalogue}>{children}</WholesaleCatalogueContext>
  );
}

/** Every wholesale product, as the server last read them. */
export function useWholesaleCatalogue(): WholesaleProduct[] {
  return useContext(WholesaleCatalogueContext);
}
