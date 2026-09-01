#!/usr/bin/env node
// Does the live project actually match the migrations?
//
// Builds the repo's schema into a throwaway database, fingerprints it, and
// compares that against a fingerprint of the real project. Every difference is
// reported by section and key, with the fields that differ.
//
// ---------------------------------------------------------------------------
// Running it
// ---------------------------------------------------------------------------
//
//   npm run qa:drift                        -- reads SUPABASE_DB_URL
//   npm run qa:drift -- --live live.json    -- compares a captured fingerprint
//
// The second form exists because the machine that can reach the project is
// often not the machine with the checkout. Capture with any client that can
// run one query:
//
//   node scripts/qa/fingerprint.mjs > fp.sql
//   psql -tAq "$SUPABASE_DB_URL" -f fp.sql > live.json
//
// ---------------------------------------------------------------------------
// Not part of `npm run qa`
// ---------------------------------------------------------------------------
//
// CI has no credentials for the project and should not have any, so this
// cannot be a CI check without becoming a check that always skips — which is
// the failure mode this whole file exists to fight. It is an ops command: run
// it after applying migrations, and before believing the project is current.

import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { FINGERPRINT_SQL, changedFields, diffFingerprints, isCosmetic } from "./fingerprint.mjs";

const DB = "garmentvibes_drift_check";
const MIGRATIONS_DIR = "supabase/migrations";
const TESTS_DIR = "supabase/tests";

const args = process.argv.slice(2);
const liveFile = args.includes("--live") ? args[args.indexOf("--live") + 1] : null;
const dbUrl = process.env.SUPABASE_DB_URL;

if (!liveFile && !dbUrl) {
  console.log("Nothing to compare against.\n");
  console.log("  SUPABASE_DB_URL=postgres://… npm run qa:drift");
  console.log("  npm run qa:drift -- --live live.json\n");
  console.log("Capture a fingerprint elsewhere with:");
  console.log("  node scripts/qa/fingerprint.mjs > fp.sql");
  console.log("  psql -tAq \"$SUPABASE_DB_URL\" -f fp.sql > live.json");
  process.exit(2);
}

function psql(args, { db = DB, url = null } = {}) {
  const target = url ? [url] : ["-d", db];
  return execFileSync("psql", ["-v", "ON_ERROR_STOP=1", "-q", ...target, ...args], {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
    // The migrations are full of `drop … if exists`, each of which announces
    // itself. Forty NOTICE lines before the report is how a report gets
    // skimmed instead of read.
    env: { ...process.env, PGOPTIONS: "-c client_min_messages=warning" },
  });
}

// ---------------------------------------------------------------------------
// The repo side
// ---------------------------------------------------------------------------

try {
  execFileSync("pg_isready", { stdio: "ignore" });
} catch {
  console.log("FAIL: no Postgres reachable — the repo side has to be built somewhere.");
  process.exit(1);
}

console.log(`Building ${DB} from ${MIGRATIONS_DIR}…`);
execFileSync("psql", ["-q", "-d", "postgres", "-c", `drop database if exists ${DB}`], { stdio: "ignore" });
execFileSync("psql", ["-q", "-d", "postgres", "-c", `create database ${DB}`], { stdio: "ignore" });

// The shim only — it stands in for what Supabase provides: the auth schema,
// the three request roles, and their default privileges. Anything it gets
// wrong shows up here as drift, which is the point: this is also the check on
// the shim.
//
// Deliberately NOT 01_helpers.sql. Those are assertion helpers, they live in
// `public` because that is where the tests can reach them, and counting them
// would report eleven functions the project is "missing" on every run. A
// report with standing false entries is a report nobody reads.
psql(["-f", join(TESTS_DIR, "00_supabase_shim.sql")]);
for (const f of readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith(".sql")).sort()) {
  psql(["--single-transaction", "-f", join(MIGRATIONS_DIR, f)]);
}

const repo = JSON.parse(psql(["-tAc", FINGERPRINT_SQL]).trim());

// ---------------------------------------------------------------------------
// The live side
// ---------------------------------------------------------------------------

const live = JSON.parse(
  liveFile ? readFileSync(liveFile, "utf8") : psql(["-tAc", FINGERPRINT_SQL], { url: dbUrl })
);

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

const all = diffFingerprints(repo, live);
const notes = all.filter(isCosmetic);
const faults = all.filter((f) => !isCosmetic(f));

const counts = Object.entries(repo).map(([k, v]) => `${Object.keys(v ?? {}).length} ${k}`);
console.log(`\nrepo: ${counts.join(", ")}\n`);

// Values are printed at a length that stays readable. A function body runs to
// thousands of characters and the whole of one tells you nothing the first
// difference does not.
const preview = (v) => {
  const s = typeof v === "string" ? v : JSON.stringify(v);
  return s.length > 160 ? `${s.slice(0, 160)}…` : s;
};

const bySection = new Map();
for (const f of faults) {
  if (!bySection.has(f.section)) bySection.set(f.section, []);
  bySection.get(f.section).push(f);
}

for (const [section, items] of bySection) {
  console.log(`${section} (${items.length})`);
  for (const f of items) {
    if (f.verdict === "missing-in-live") {
      console.log(`  ✗ ${f.key}\n      in the migrations, not in the project — unapplied?`);
    } else if (f.verdict === "extra-in-live") {
      console.log(`  ✗ ${f.key}\n      in the project, not in the migrations — changed by hand?`);
    } else {
      console.log(`  ✗ ${f.key}`);
      for (const { field, repo: r, live: l } of changedFields(f.repo, f.live)) {
        console.log(`      ${field}\n        repo: ${preview(r)}\n        live: ${preview(l)}`);
      }
    }
  }
  console.log("");
}

if (notes.length > 0) {
  console.log(`note: ${notes.length} function(s) whose stored text differs only in comments.`);
  console.log("      Supabase strips comments from function bodies as it applies a");
  console.log("      migration, so this is expected for every body that has any, and");
  console.log("      says nothing about behaviour.");
  console.log(`      ${notes.map((n) => n.key.replace(/\(.*/, "()")).join(", ")}\n`);
}

if (faults.length === 0) {
  console.log("PASS: the project behaves as the migrations describe.");
  process.exit(0);
}

console.log(`FAIL: ${faults.length} difference(s) between the migrations and the project.`);
process.exit(1);
