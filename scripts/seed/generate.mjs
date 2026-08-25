#!/usr/bin/env node
// Generates supabase/seed.sql from the mock catalogue.
//
// The TypeScript in src/lib/mock/ stays the single source of truth. Writing the
// SQL by hand would mean maintaining the catalogue twice and discovering the
// drift only when the storefront and the database disagreed about a price.
//
//   node scripts/seed/generate.mjs           # write supabase/seed.sql
//   node scripts/seed/generate.mjs --check   # fail if the committed file is stale
//
// The --check mode runs in `qa:static`, so a catalogue edit that forgets to
// regenerate fails CI rather than shipping a seed that describes last week's
// prices.

import { writeFileSync, readFileSync, existsSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createServer } from "vite";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const OUT = join(root, "supabase", "seed.sql");
const checkOnly = process.argv.includes("--check");

// ---------------------------------------------------------------------------
// SQL literals
// ---------------------------------------------------------------------------

/** A quoted SQL string, or NULL. Doubles embedded quotes, per the standard. */
function lit(value) {
  if (value === undefined || value === null) return "NULL";
  return `'${String(value).replace(/'/g, "''")}'`;
}

function num(value) {
  if (value === undefined || value === null) return "NULL";
  if (!Number.isFinite(value)) throw new Error(`Not a finite number: ${value}`);
  return String(value);
}

/**
 * A Postgres array literal, cast to its element type.
 *
 * Built as `array[...]` rather than a '{...}' string so each element goes
 * through the same quoting as any other literal — the product descriptions and
 * data-URI images contain characters that a hand-built brace literal would
 * need separate rules for.
 */
function arr(values, type) {
  if (!values || values.length === 0) return `'{}'::${type}[]`;
  return `array[${values.map(lit).join(", ")}]::${type}[]`;
}

// ---------------------------------------------------------------------------
// Load the catalogue
// ---------------------------------------------------------------------------

// Vite rather than a bare `import`: the mock modules are TypeScript and resolve
// `@/` through the tsconfig path alias, neither of which Node does on its own.
const server = await createServer({
  root,
  configFile: false,
  logLevel: "error",
  server: { middlewareMode: true },
  resolve: { alias: { "@": join(root, "src") } },
});

const { RETAIL_PRODUCTS } = await server.ssrLoadModule("/src/lib/mock/retail-products.ts");
const { WHOLESALE_PRODUCTS } = await server.ssrLoadModule("/src/lib/mock/wholesale-products.ts");
const { getStock } = await server.ssrLoadModule("/src/lib/stores/stock-store.ts");
const { PROMO_CODES } = await server.ssrLoadModule("/src/lib/pricing.ts");

await server.close();

// ---------------------------------------------------------------------------
// Emit
// ---------------------------------------------------------------------------

const out = [];
const w = (line = "") => out.push(line);

w("-- GENERATED FILE — do not edit by hand.");
w("--");
w("-- Regenerate with:  npm run seed:generate");
w("-- Source of truth:  src/lib/mock/retail-products.ts, wholesale-products.ts");
w("--");
w("-- Loads the placeholder catalogue so a fresh database matches what the app");
w("-- renders today. Every statement upserts on the natural key (slug, or");
w("-- product + label), so re-running updates rather than duplicating and the");
w("-- file is safe to apply to a database that already has data.");
w("--");
w("-- The images are data-URI SVG placeholders, carried over verbatim so the");
w("-- storefront looks identical after the switch. They belong in Supabase");
w("-- Storage once real photography exists — a bucket URL in the same column,");
w("-- no schema change needed.");
w();

// --- Promo codes ---------------------------------------------------------

w("-- ---------------------------------------------------------------------------");
w("-- Promo codes");
w("--");
w("-- The built-ins from src/lib/pricing.ts. They are flagged built_in so the");
w("-- admin panel can deactivate but not delete them, keeping the UI and the");
w("-- server's fallback list in agreement.");
w("-- ---------------------------------------------------------------------------");
w();
w("insert into promo_codes (code, percent, active, built_in) values");
w(
  Object.entries(PROMO_CODES)
    .map(([code, percent]) => `  (${lit(code)}, ${num(percent)}, true, true)`)
    .join(",\n") + "\non conflict (code) do update set"
);
w("  percent = excluded.percent,");
w("  built_in = excluded.built_in;");
w();

// --- Retail catalogue ----------------------------------------------------

w("-- ---------------------------------------------------------------------------");
w(`-- Retail catalogue (${RETAIL_PRODUCTS.length} products)`);
w("-- ---------------------------------------------------------------------------");
w();
w(
  "insert into retail_products (slug, name, brand, category, subcategory, description,\n" +
    "                            images, price, mrp, currency, colors, rating, rating_count, tags) values"
);

w(
  RETAIL_PRODUCTS.map(
    (p) =>
      `  (${lit(p.slug)}, ${lit(p.name)}, ${lit(p.brand)}, ${lit(p.category)}::retail_category,\n` +
      `   ${lit(p.subcategory)}, ${lit(p.description)},\n` +
      `   ${arr(p.images, "text")},\n` +
      `   ${num(p.price)}, ${num(p.mrp)}, ${lit(p.currency)}, ${arr(p.colors, "text")},\n` +
      `   ${num(p.rating)}, ${num(p.ratingCount)}, ${arr(p.tags, "retail_tag")})`
  ).join(",\n") + "\non conflict (slug) do update set"
);
for (const col of [
  "name",
  "brand",
  "category",
  "subcategory",
  "description",
  "images",
  "price",
  "mrp",
  "colors",
  "rating",
  "rating_count",
  "tags",
]) {
  w(`  ${col} = excluded.${col},`);
}
w("  is_active = true;");
w();

// Sizes carry the stock level, resolved through the same helper the storefront
// uses, so a fresh database shows the quantities customers see today rather
// than a flat guess.
w("-- Sizes and their stock levels. Quantities come from getStock() in");
w("-- src/lib/stores/stock-store.ts, so the database starts out agreeing with");
w("-- what the storefront currently displays.");
w();
w("insert into retail_product_sizes (product_id, label, stock_qty, sort_order) values");

// `sort_order` is the array index, because the array's order IS the display
// order the storefront has always used — S, M, L, XL for tops, 28 upward for
// waists. Reading the catalogue from the database loses that unless it is
// written down: rows come back in whatever order Postgres finds them, and a
// size picker whose order moves between page loads is one customers mis-tap.
// See 0019.
const sizeRows = [];
for (const p of RETAIL_PRODUCTS) {
  p.sizes.forEach((size, index) => {
    const qty = getStock({}, p, size.label);
    sizeRows.push(
      `  ((select id from retail_products where slug = ${lit(p.slug)}), ${lit(size.label)}, ${num(qty)}, ${num(index)})`
    );
  });
}
w(sizeRows.join(",\n"));
w("on conflict (product_id, label) do update set");
w("  stock_qty = excluded.stock_qty,");
w("  sort_order = excluded.sort_order;");
w();

// --- Wholesale catalogue -------------------------------------------------

w("-- ---------------------------------------------------------------------------");
w(`-- Wholesale catalogue (${WHOLESALE_PRODUCTS.length} products)`);
w("-- ---------------------------------------------------------------------------");
w();
w(
  "insert into wholesale_products (sku, slug, name, category, subcategory, description, images,\n" +
    "                               currency, moq, pack_size, size_run, fabric, colors,\n" +
    "                               lead_time_days, tags) values"
);
w(
  WHOLESALE_PRODUCTS.map(
    (p) =>
      `  (${lit(p.sku)}, ${lit(p.slug)}, ${lit(p.name)}, ${lit(p.category)}::wholesale_category,\n` +
      `   ${lit(p.subcategory)}, ${lit(p.description)},\n` +
      `   ${arr(p.images, "text")},\n` +
      `   ${lit(p.currency)}, ${num(p.moq)}, ${num(p.packSize)}, ${lit(p.sizeRun)}, ${lit(p.fabric)},\n` +
      `   ${arr(p.colors, "text")}, ${num(p.leadTimeDays)}, ${arr(p.tags, "wholesale_tag")})`
  ).join(",\n") + "\non conflict (slug) do update set"
);
for (const col of [
  "sku",
  "name",
  "category",
  "subcategory",
  "description",
  "images",
  "moq",
  "pack_size",
  "size_run",
  "fabric",
  "colors",
  "lead_time_days",
  "tags",
]) {
  w(`  ${col} = excluded.${col},`);
}
w("  is_active = true;");
w();

w("-- Quantity-break pricing.");
w();
w("insert into wholesale_price_tiers (product_id, min_qty, price_per_unit) values");
const tierRows = [];
for (const p of WHOLESALE_PRODUCTS) {
  for (const tier of p.priceTiers) {
    tierRows.push(
      `  ((select id from wholesale_products where slug = ${lit(p.slug)}), ` +
        `${num(tier.minQty)}, ${num(tier.pricePerUnit)})`
    );
  }
}
w(tierRows.join(",\n"));
w("on conflict (product_id, min_qty) do update set price_per_unit = excluded.price_per_unit;");
w();

const sql = out.join("\n");

// ---------------------------------------------------------------------------
// Write or check
// ---------------------------------------------------------------------------

if (checkOnly) {
  if (!existsSync(OUT)) {
    console.log("✗ supabase/seed.sql is missing — run: npm run seed:generate");
    process.exit(1);
  }
  if (readFileSync(OUT, "utf8") !== sql) {
    console.log("✗ supabase/seed.sql is stale — run: npm run seed:generate");
    process.exit(1);
  }
  console.log(
    `✓ supabase/seed.sql matches the catalogue ` +
      `(${RETAIL_PRODUCTS.length} retail, ${WHOLESALE_PRODUCTS.length} wholesale)`
  );
  process.exit(0);
}

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, sql);
console.log(
  `Wrote supabase/seed.sql — ${RETAIL_PRODUCTS.length} retail products (${sizeRows.length} sizes), ` +
    `${WHOLESALE_PRODUCTS.length} wholesale products (${tierRows.length} price tiers)`
);
