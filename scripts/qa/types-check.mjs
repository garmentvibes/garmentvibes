#!/usr/bin/env node
// Does src/types/database.ts still describe the schema the migrations build?
//
// ---------------------------------------------------------------------------
// Why this exists
// ---------------------------------------------------------------------------
//
// A generated types file is only worth having if something keeps it in step
// with the thing it was generated from. Otherwise it drifts, and a stale type
// is worse than no type: it is a confident, checkable, wrong statement, and
// TypeScript will defend it.
//
// That objection is why this file did not exist sooner. `supabase gen types`
// needs Docker even with --db-url, so it cannot run in CI here, which means CI
// cannot regenerate and diff. But it does not need to. It only needs to
// *compare*, and comparing needs nothing but Postgres, which CI already has
// for the migration suite.
//
// So: build the schema from supabase/migrations, read what it actually has,
// read what the TS file claims, and report every difference by name.
//
// ---------------------------------------------------------------------------
// What is compared, and what is not
// ---------------------------------------------------------------------------
//
// Compared: every table and view, every column on it, the TypeScript type each
// column maps to, whether it is nullable, and every enum with its values in
// order. That covers the mistakes a stale file actually makes — a column added
// to a migration and not to the types, a column that became nullable, an enum
// that gained a value the app has not been taught.
//
// Also compared, by name only: which functions exist. Not their signatures —
// mapping `Args` and `Returns` would mean reimplementing the generator, and a
// second generator with its own bugs is the thing being avoided. But the
// question "does this function exist in both places" needs none of that, and it
// is the one that actually went wrong: 0028 added three functions and the types
// file did not know about them. TypeScript caught that only because the new
// code happened to call them; a function added and not yet called from TS would
// have drifted in silence.
//
// The rule the generator follows is exact, which is what makes this checkable
// rather than approximate: every function in `public` whose return type is not
// `trigger`. Trigger functions are not callable over PostgREST and the
// generator leaves them out.
//
// Not compared: Relationships, Insert/Update variants, function signatures.
// Insert and Update are derived from Row plus defaults, so a Row that matches
// is strong evidence they do.

import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const DB = "garmentvibes_types_check";
const MIGRATIONS = "supabase/migrations";
const TESTS = "supabase/tests";
const TYPES = "src/types/database.ts";

let failures = 0;
const fail = (msg) => {
  failures += 1;
  console.log(`  ✗ ${msg}`);
};

// ---------------------------------------------------------------------------
// The database side
// ---------------------------------------------------------------------------

try {
  execFileSync("pg_isready", { stdio: "ignore" });
} catch {
  if (process.env.CI) {
    console.log("FAIL: no Postgres reachable, and CI is set — refusing to skip.");
    process.exit(1);
  }
  console.log("No Postgres reachable — skipping the types check.");
  console.log("Start one with: pg_ctlcluster 16 main start");
  process.exit(0);
}

function psql(args) {
  return execFileSync("psql", ["-v", "ON_ERROR_STOP=1", "-q", "-d", DB, ...args], {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
    env: { ...process.env, PGOPTIONS: "-c client_min_messages=warning" },
  });
}

console.log(`Building ${DB}…`);
execFileSync("psql", ["-q", "-d", "postgres", "-c", `drop database if exists ${DB}`], { stdio: "ignore" });
execFileSync("psql", ["-q", "-d", "postgres", "-c", `create database ${DB}`], { stdio: "ignore" });
psql(["-f", join(TESTS, "00_supabase_shim.sql")]);
for (const f of readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql")).sort()) {
  psql(["--single-transaction", "-f", join(MIGRATIONS, f)]);
}

const schema = JSON.parse(psql(["-tAc", `
select json_build_object(
  'tables', (
    select coalesce(json_object_agg(tbl, cols), '{}'::json) from (
      select c.relname as tbl,
             json_object_agg(a.attname, json_build_object(
               'type', format_type(a.atttypid, a.atttypmod),
               'nullable', not a.attnotnull
             )) as cols
        from pg_class c
        join pg_namespace n on n.oid = c.relnamespace
        join pg_attribute a on a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
       where n.nspname = 'public' and c.relkind in ('r','v')
       group by c.relname) t),
  'enums', (
    select coalesce(json_object_agg(typname, vals), '{}'::json) from (
      select t.typname, json_agg(e.enumlabel order by e.enumsortorder) as vals
        from pg_type t join pg_enum e on e.enumtypid = t.oid
        join pg_namespace n on n.oid = t.typnamespace
       where n.nspname = 'public'
       group by t.typname) e),
  'functions', (
    select coalesce(json_agg(proname order by proname), '[]'::json)
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       -- What the generator emits: everything callable over PostgREST, which
       -- is everything except the trigger functions.
       and pg_get_function_result(p.oid) <> 'trigger')
)`]).trim());

// ---------------------------------------------------------------------------
// The TypeScript side
// ---------------------------------------------------------------------------
//
// Parsed by structure rather than by running the compiler: the file's shape is
// fixed by the generator, and pulling in a TS parser to read a file this
// regular would be more machinery than the job needs.

// The generator wraps a declaration across lines once it is long enough:
//
//   settled_resolution:
//     | Database["public"]["Enums"]["claim_resolution"]
//     | null
//
// and it writes every enum of more than two values that way too. Reading the
// file line by line therefore sees a column with no type and an enum with one
// value — which is exactly what the first version of this check reported, as
// nine differences that were all its own. Continuation lines are folded back
// onto their declaration before anything is parsed.
const source = readFileSync(TYPES, "utf8")
  .split("\n")
  .reduce((lines, line) => {
    if (/^\s*\|/.test(line) && lines.length) lines[lines.length - 1] += ` ${line.trim()}`;
    else lines.push(line);
    return lines;
  }, [])
  .join("\n");

/** The body of a `name: {` … `}` block, balanced on braces. */
function block(text, header, from = 0) {
  const start = text.indexOf(header, from);
  if (start === -1) return null;
  let i = text.indexOf("{", start);
  if (i === -1) return null;
  let depth = 0;
  for (let j = i; j < text.length; j++) {
    if (text[j] === "{") depth += 1;
    else if (text[j] === "}") {
      depth -= 1;
      if (depth === 0) return { body: text.slice(i + 1, j), end: j };
    }
  }
  return null;
}

const publicBlock = block(source, "\n  public: ");
if (!publicBlock) {
  console.log("FAIL: could not find the `public` schema block in the types file.");
  process.exit(1);
}

const tablesBlock = block(publicBlock.body, "Tables:");
const viewsBlock = block(publicBlock.body, "Views:");
const enumsBlock = block(publicBlock.body, "Enums:");
const functionsBlock = block(publicBlock.body, "Functions:");

/** Every `name: { Row: { … } }` in a Tables or Views block. */
function readRows(text) {
  const out = {};
  if (!text) return out;
  const re = /^ {6}(\w+): \{$/gm;
  let m;
  while ((m = re.exec(text)) !== null) {
    const row = block(text, "Row:", m.index);
    if (!row) continue;
    const cols = {};
    for (const line of row.body.split("\n")) {
      const c = line.match(/^\s*(\w+):\s*(.+?)$/);
      if (!c) continue;
      const declared = c[2].trim().replace(/,$/, "");
      // A declaration is a union: `A`, `A | null`, or, once folded from a
      // wrapped one, `| A | null`. Compared as a set of members rather than as
      // a string, so the leading pipe and the member order do not matter.
      const members = declared.split("|").map((s) => s.trim()).filter(Boolean);
      cols[c[1]] = {
        ts: declared,
        members: members.filter((s) => s !== "null"),
        nullable: members.includes("null"),
      };
    }
    out[m[1]] = cols;
  }
  return out;
}

const declared = { ...readRows(tablesBlock?.body), ...readRows(viewsBlock?.body) };

// Every top-level `name: {` in the Functions block, and only top-level: an
// entry's own `Args:` and `Returns:` sit two spaces deeper, and a setof return
// nests deeper still. Anchoring on exactly six spaces is what separates the
// function names from the shape of any one function.
const declaredFunctions = functionsBlock
  ? [...functionsBlock.body.matchAll(/^ {6}(\w+): \{/gm)].map((m) => m[1])
  : [];

// One line each, now that continuations are folded: `name: "a" | "b"`.
const declaredEnums = {};
if (enumsBlock) {
  for (const line of enumsBlock.body.split("\n")) {
    const m = line.match(/^\s*(\w+):\s*(.+)$/);
    if (!m) continue;
    const values = [...m[2].matchAll(/"([^"]+)"/g)].map((x) => x[1]);
    if (values.length) declaredEnums[m[1]] = values;
  }
}

// ---------------------------------------------------------------------------
// Postgres type -> what the generator writes
// ---------------------------------------------------------------------------

const SCALARS = {
  uuid: "string", text: "string", "character varying": "string", citext: "string",
  integer: "number", bigint: "number", smallint: "number", numeric: "number",
  "double precision": "number", real: "number",
  boolean: "boolean",
  "timestamp with time zone": "string", "timestamp without time zone": "string",
  date: "string", time: "string", interval: "string",
  json: "Json", jsonb: "Json",
};

/** The TS type the generator writes for a column, or null when unknown. */
function expected(pgType) {
  const bare = pgType.replace(/\[\]$/, "");
  const isArray = pgType.endsWith("[]");
  let base;
  if (SCALARS[bare]) base = SCALARS[bare];
  else if (bare.startsWith("character varying")) base = "string";
  else if (schema.enums[bare]) base = `Database["public"]["Enums"]["${bare}"]`;
  else return null;
  return isArray ? `${base}[]` : base;
}

// ---------------------------------------------------------------------------
// Compare
// ---------------------------------------------------------------------------

console.log(`\ntables and views (${Object.keys(schema.tables).length} in the schema)`);

for (const [tbl, cols] of Object.entries(schema.tables).sort()) {
  const d = declared[tbl];
  if (!d) {
    fail(`${tbl} — in the migrations, missing from the types file`);
    continue;
  }
  for (const [col, info] of Object.entries(cols).sort()) {
    const dc = d[col];
    if (!dc) {
      fail(`${tbl}.${col} — in the migrations, missing from the types file`);
      continue;
    }
    if (dc.nullable !== info.nullable) {
      fail(`${tbl}.${col} — ${info.nullable ? "nullable" : "not null"} in the migrations, ` +
           `declared ${dc.nullable ? "nullable" : "not null"}`);
    }
    const want = expected(info.type);
    if (want && !dc.members.includes(want)) {
      fail(`${tbl}.${col} — ${info.type} should be ${want}, declared ${dc.members.join(" | ") || "nothing"}`);
    }
  }
  for (const col of Object.keys(d)) {
    if (!cols[col]) fail(`${tbl}.${col} — in the types file, not in the migrations`);
  }
}

for (const tbl of Object.keys(declared)) {
  if (!schema.tables[tbl]) fail(`${tbl} — in the types file, not in the migrations`);
}

console.log(`\nenums (${Object.keys(schema.enums).length} in the schema)`);

for (const [name, values] of Object.entries(schema.enums).sort()) {
  const d = declaredEnums[name];
  if (!d) {
    fail(`${name} — in the migrations, missing from the types file`);
    continue;
  }
  // Order matters: the generator writes them in enumsortorder, and a value
  // inserted in the middle by a later migration must show up here.
  if (JSON.stringify(d) !== JSON.stringify(values)) {
    fail(`${name} — migrations say [${values.join(", ")}], types say [${d.join(", ")}]`);
  }
}

for (const name of Object.keys(declaredEnums)) {
  if (!schema.enums[name]) fail(`${name} — in the types file, not in the migrations`);
}

console.log(`\nfunctions (${schema.functions.length} in the schema, by name only)`);

for (const name of schema.functions) {
  if (!declaredFunctions.includes(name)) {
    fail(`${name}() — in the migrations, missing from the types file`);
  }
}

for (const name of declaredFunctions) {
  if (!schema.functions.includes(name)) {
    fail(`${name}() — in the types file, not in the migrations`);
  }
}

if (failures === 0) {
  const cols = Object.values(schema.tables).reduce((n, c) => n + Object.keys(c).length, 0);
  console.log(`\nPASS: ${cols} columns across ${Object.keys(schema.tables).length} relations, ` +
              `${Object.keys(schema.enums).length} enums, and ${schema.functions.length} functions, ` +
              `match the types file.`);
  process.exit(0);
}

console.log(`\nFAIL: ${failures} difference(s) between the migrations and ${TYPES}.`);
console.log("Regenerate with `supabase gen types typescript --project-id <id>`,");
console.log("or edit the lines named above — they are the whole of the difference.");
console.log("A function reported missing needs its Args and Returns written by hand;");
console.log("this check knows the name should be there, not what its signature is.");
process.exit(1);
