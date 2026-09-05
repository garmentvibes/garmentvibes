// Every page the app can render, once each.
//
// Built from the App Router tree rather than written down, so a page added
// without a test is a page the sweeps visit anyway. Dynamic segments are
// filled from the mock catalogues — real slugs and categories, so the
// templates render with data rather than with a not-found.
//
// Shared by route-sweep.mjs and a11y.mjs. It lived inside the route sweep
// while that was the only thing walking the tree; it moved here when the
// accessibility pass needed the same list, because two copies of "what pages
// exist" is how one sweep quietly stops covering a section the other does.
//
// The 404 probe is NOT here. That is the route sweep's own business — it is
// testing that a bad URL answers 404, which is a status-code assertion about
// a route the app does not have, not a page anybody renders.

import { readdirSync, statSync, readFileSync } from "fs";
import { join, relative } from "path";

const APP_DIR = join(process.cwd(), "src/app");

function walk(dir, cb) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, cb);
    else cb(full);
  }
}

function extractSlugs(file, limit = 2) {
  const content = readFileSync(file, "utf8");
  const matches = [...content.matchAll(/slug:\s*"([^"]+)"/g)].map((m) => m[1]);
  return matches.slice(0, limit);
}

/** Every route, sorted, with dynamic segments filled from the catalogues. */
export function buildRoutes() {
  const retailSlugs = extractSlugs(join(process.cwd(), "src/lib/mock/retail-products.ts"));
  const wholesaleSlugs = extractSlugs(join(process.cwd(), "src/lib/mock/wholesale-products.ts"));
  const retailCategories = ["women", "men", "kids"];
  const wholesaleCategories = ["women", "men", "kids", "unisex", "fabric"];

  const routes = new Set();

  walk(APP_DIR, (file) => {
    if (!/\/page\.tsx$/.test(file)) return;
    const dir = relative(APP_DIR, file.replace(/\/page\.tsx$/, ""));
    // Route groups — `(retail)`, `(admin)` — organise the tree without
    // appearing in the URL, so they are dropped rather than walked into.
    const segments = (dir === "" ? [] : dir.split("/")).filter((s) => !/^\(.*\)$/.test(s));

    if (segments.includes("[slug]")) {
      const isWholesale = segments[0] === "wholesale";
      for (const slug of isWholesale ? wholesaleSlugs : retailSlugs) {
        routes.add("/" + segments.map((s) => (s === "[slug]" ? slug : s)).join("/"));
      }
      return;
    }
    if (segments.includes("[category]")) {
      const isWholesale = segments[0] === "wholesale";
      const samples = isWholesale ? wholesaleCategories.slice(0, 2) : retailCategories.slice(0, 2);
      for (const cat of samples) {
        routes.add("/" + segments.map((s) => (s === "[category]" ? cat : s)).join("/"));
      }
      return;
    }
    routes.add("/" + segments.join("/"));
  });

  return [...routes].sort();
}
