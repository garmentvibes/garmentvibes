#!/usr/bin/env node
// Writes public/placeholders/*.svg from whatever the catalogue asks for.
//
//   node scripts/placeholders/generate.mjs           # write the files
//   node scripts/placeholders/generate.mjs --check   # fail if they are stale
//
// The set of files is derived from the placeholder registry rather than
// guessed, so a product added with a new colourway gets art and a product
// removed stops leaving an orphan behind. --check runs in CI, because a
// missing placeholder is a broken image on a product page and nothing else
// would notice.

import { writeFileSync, readFileSync, existsSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createServer } from "vite";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const OUT_DIR = join(root, "public", "placeholders");
const checkOnly = process.argv.includes("--check");

// Vite, for the same reason as the seed generator: these are TypeScript
// modules that resolve `@/` through the tsconfig path alias.
const server = await createServer({
  root,
  configFile: false,
  logLevel: "error",
  server: { middlewareMode: true },
  resolve: { alias: { "@": join(root, "src") } },
});

// Importing the catalogues is what populates the registry — every
// placeholderImage() call along the way records what it asked for.
await server.ssrLoadModule("/src/lib/mock/retail-products.ts");
await server.ssrLoadModule("/src/lib/mock/wholesale-products.ts");

const { placeholderRegistry, placeholderSvg } = await server.ssrLoadModule(
  "/src/lib/mock/placeholder-image.ts"
);

await server.close();

const registry = placeholderRegistry();

// An empty registry means the imports above stopped reaching
// placeholderImage() — a refactor away from it, say. Writing zero files would
// then look like a clean run and quietly delete every placeholder.
if (registry.size === 0) {
  console.log("✗ No placeholders registered — did the catalogue stop calling placeholderImage()?");
  process.exit(1);
}

const wanted = new Map();
for (const [path, spec] of registry) {
  const filename = path.replace("/placeholders/", "");
  const svg = placeholderSvg(spec);

  // Two different labels can slugify to the same filename. Silently letting
  // one win would show the wrong art on a product page, so it is an error.
  const existing = wanted.get(filename);
  if (existing !== undefined && existing !== svg) {
    console.log(`✗ Two different placeholders both want ${filename} — rename one.`);
    process.exit(1);
  }
  wanted.set(filename, svg);
}

const onDisk = existsSync(OUT_DIR)
  ? readdirSync(OUT_DIR).filter((f) => f.endsWith(".svg"))
  : [];

if (checkOnly) {
  const problems = [];

  for (const [filename, svg] of wanted) {
    const file = join(OUT_DIR, filename);
    if (!existsSync(file)) problems.push(`missing ${filename}`);
    else if (readFileSync(file, "utf8") !== svg) problems.push(`stale ${filename}`);
  }
  for (const filename of onDisk) {
    if (!wanted.has(filename)) problems.push(`orphaned ${filename}`);
  }

  if (problems.length > 0) {
    console.log(`✗ public/placeholders is out of date — run: npm run placeholders:generate`);
    for (const problem of problems.slice(0, 10)) console.log(`    ${problem}`);
    if (problems.length > 10) console.log(`    …and ${problems.length - 10} more`);
    process.exit(1);
  }

  console.log(`✓ public/placeholders matches the catalogue (${wanted.size} files)`);
  process.exit(0);
}

mkdirSync(OUT_DIR, { recursive: true });

for (const [filename, svg] of wanted) {
  writeFileSync(join(OUT_DIR, filename), svg);
}

// Remove art for products that no longer exist, so the directory is a
// statement about the current catalogue rather than an accumulation.
let removed = 0;
for (const filename of onDisk) {
  if (!wanted.has(filename)) {
    rmSync(join(OUT_DIR, filename));
    removed += 1;
  }
}

console.log(
  `Wrote ${wanted.size} placeholder${wanted.size === 1 ? "" : "s"} to public/placeholders` +
    (removed > 0 ? ` (${removed} orphaned file${removed === 1 ? "" : "s"} removed)` : "")
);
