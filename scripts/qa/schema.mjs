#!/usr/bin/env node
// Applies every migration to a throwaway Postgres database and asserts the
// result, including how the RLS policies actually behave.
//
// The point is not "does the SQL parse" — it's that a policy which silently
// lets one customer read another's orders looks exactly like a correct one
// until someone tries it. So this creates real users, switches identity via
// the same GUC Supabase uses, and checks what each one can see.
//
// Needs a local Postgres 16 on the default socket. Skips (does not fail) when
// there isn't one, so `npm run qa` stays usable on a machine without it.

import { execFileSync, spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { join } from "node:path";

const DB = "garmentvibes_schema_check";
const MIGRATIONS_DIR = "supabase/migrations";
const TESTS_DIR = "supabase/tests";

let failures = 0;

function check(name, ok, detail = "") {
  if (ok) {
    console.log(`  ✓ ${name}`);
  } else {
    failures += 1;
    console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

function psql(args, { db = DB, input } = {}) {
  return execFileSync("psql", ["-v", "ON_ERROR_STOP=1", "-q", "-d", db, ...args], {
    input,
    encoding: "utf8",
    stdio: input === undefined ? ["ignore", "pipe", "pipe"] : ["pipe", "pipe", "pipe"],
  });
}

/** Single scalar value, whitespace-trimmed. */
function scalar(sql) {
  return psql(["-tAc", sql]).trim();
}

function serverAvailable() {
  try {
    execFileSync("pg_isready", { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

if (!serverAvailable()) {
  // Skipping is a convenience for a laptop without Postgres, and a trap in CI:
  // a service container that failed to start would make this job pass without
  // checking anything, which looks identical to a green run.
  if (process.env.CI) {
    console.log("FAIL: no Postgres reachable, and CI is set — refusing to skip.");
    process.exit(1);
  }
  console.log("No Postgres reachable — skipping schema checks.");
  console.log("Start one locally with: pg_ctlcluster 16 main start");
  process.exit(0);
}

// ---------------------------------------------------------------------------
// Apply
// ---------------------------------------------------------------------------

console.log(`Rebuilding ${DB}…`);
execFileSync("psql", ["-q", "-d", "postgres", "-c", `drop database if exists ${DB}`], {
  stdio: "ignore",
});
execFileSync("psql", ["-q", "-d", "postgres", "-c", `create database ${DB}`], {
  stdio: "ignore",
});

const migrations = readdirSync(MIGRATIONS_DIR)
  .filter((f) => f.endsWith(".sql"))
  .sort();

// `0x_` files are harness setup applied once and left in place; `10_` upwards
// are the tests themselves.
const setupFiles = readdirSync(TESTS_DIR)
  .filter((f) => /^0\d_.*\.sql$/.test(f))
  .sort();

console.log(`\napply (${migrations.length} migrations)`);
for (const file of setupFiles) psql(["-f", join(TESTS_DIR, file)]);

for (const file of migrations) {
  try {
    // Each migration runs in its own transaction, exactly as Supabase applies
    // them — which is what makes `alter type ... add value` in one file and
    // its first use in a later file the correct split.
    psql(["--single-transaction", "-f", join(MIGRATIONS_DIR, file)]);
    check(file, true);
  } catch (error) {
    const stderr = (error.stderr ?? "").toString().trim().split("\n").slice(0, 4).join(" | ");
    check(file, false, stderr);
    console.log("\nMigration failed — later checks would be meaningless. Stopping.");
    process.exit(1);
  }
}

// Re-applying must be a no-op rather than an error: Supabase records applied
// migrations, but a hand-run file or a reset mid-deploy shouldn't wedge the
// database. Every statement is therefore guarded (if not exists / do-block).
console.log("\nidempotency");
let reapplyOk = true;
let reapplyDetail = "";
for (const file of migrations) {
  try {
    psql(["--single-transaction", "-f", join(MIGRATIONS_DIR, file)]);
  } catch (error) {
    reapplyOk = false;
    reapplyDetail = `${file}: ${(error.stderr ?? "").toString().trim().split("\n")[0]}`;
    break;
  }
}
check("migrations can be applied twice without error", reapplyOk, reapplyDetail);

// ---------------------------------------------------------------------------
// Structural invariants
// ---------------------------------------------------------------------------

console.log("\nstructure");

const publicTables = scalar(`
  select coalesce(string_agg(tablename, ',' order by tablename), '')
  from pg_tables where schemaname = 'public'
`)
  .split(",")
  .filter(Boolean);

check("public schema has tables", publicTables.length > 0);

// A table with RLS off is readable by every logged-in customer. In a schema
// where most tables hold other people's orders, that is the single most
// expensive mistake available, so it is asserted for all of them at once.
const rlsOff = scalar(`
  select coalesce(string_agg(c.relname, ', ' order by c.relname), '')
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity = false
`);
check("row level security is enabled on every table", rlsOff === "", rlsOff);

// RLS with no policies denies everything, which fails closed but silently —
// the feature just appears broken. Both directions are bugs.
const noPolicy = scalar(`
  select coalesce(string_agg(c.relname, ', ' order by c.relname), '')
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r'
    and not exists (select 1 from pg_policy p where p.polrelid = c.oid)
`);
check("every table carries at least one policy", noPolicy === "", noPolicy);

// Money is in paise. A numeric/float column here would reintroduce exactly
// the rounding bug the minor-unit convention exists to prevent.
const nonIntMoney = scalar(`
  select coalesce(string_agg(table_name || '.' || column_name, ', '), '')
  from information_schema.columns
  where table_schema = 'public'
    and (column_name in ('price', 'mrp', 'amount', 'total', 'price_per_unit', 'subtotal',
                         'tax_total', 'grand_total', 'discount')
         or column_name like '%_amount' or column_name like '%_paise')
    and data_type not in ('integer', 'bigint')
`);
check("every money column is an integer type", nonIntMoney === "", nonIntMoney);

// A foreign key to a user or order that isn't indexed turns "my orders" into
// a sequential scan of every order in the system.
const unindexedFks = scalar(`
  select coalesce(string_agg(rel.relname || '.' || att.attname, ', '), '')
  from pg_constraint con
  join pg_class rel on rel.oid = con.conrelid
  join pg_namespace nsp on nsp.oid = rel.relnamespace
  join pg_attribute att on att.attrelid = con.conrelid and att.attnum = con.conkey[1]
  where con.contype = 'f' and nsp.nspname = 'public' and array_length(con.conkey, 1) = 1
    and not exists (
      select 1 from pg_index i
      where i.indrelid = con.conrelid and i.indkey[0] = con.conkey[1]
    )
`);
check("every single-column foreign key is indexed", unindexedFks === "", unindexedFks);

// ---------------------------------------------------------------------------
// Behaviour
// ---------------------------------------------------------------------------

console.log("\nbehaviour");

const testFiles = readdirSync(TESTS_DIR)
  .filter((f) => /^[1-9]\d_.*\.sql$/.test(f))
  .sort();

for (const file of testFiles) {
  // spawnSync, not the psql() helper: each passing assertion raises a NOTICE,
  // and psql writes notices to stderr even on success — so stderr has to be
  // readable on the happy path, not only when the process fails.
  //
  // No --single-transaction: each test file opens its own transaction and rolls
  // it back, so one file's fixture cannot leak into the next and skew its
  // counts. Committing would make the suite order-dependent.
  const run = spawnSync(
    "psql",
    ["-v", "ON_ERROR_STOP=1", "-q", "-d", DB, "-f", join(TESTS_DIR, file)],
    { encoding: "utf8" }
  );
  const stderr = run.stderr ?? "";

  if (run.status === 0) {
    const passed = [...stderr.matchAll(/NOTICE:\s+ok:\s+(.*)/g)];
    // A test file that raises nothing has asserted nothing. Silence here would
    // otherwise read as a clean pass.
    if (passed.length === 0) {
      check(`${file} raised at least one assertion`, false);
    }
    for (const [, name] of passed) check(name.trim(), true);
  } else {
    const message = stderr.match(/ERROR:\s+(.*)/)?.[1] ?? stderr.trim().split("\n")[0];
    check(file, false, message ?? "unknown error");
  }
}

console.log(
  failures === 0
    ? "\nPASS: schema applies and behaves as asserted"
    : `\nFAIL: ${failures} check failure(s)`
);
process.exit(failures === 0 ? 0 : 1);
