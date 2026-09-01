// A canonical fingerprint of a Postgres schema, and the pure comparison over two
// of them.
//
// ---------------------------------------------------------------------------
// Why this exists
// ---------------------------------------------------------------------------
//
// Twice in two days the repo and the live project said different things, and
// neither time did anything fail:
//
//   · migrations 0016–0022 sat unapplied while every test passed, because the
//     tests build their own database and never look at the real one;
//   · `revoke all on function ... from public` shut the door locally and left
//     it open on the hosted project, because Supabase grants EXECUTE to anon
//     and authenticated *explicitly* through default privileges and the test
//     shim does not. Green tests, open production.
//
// The second is the dangerous shape: not "somebody forgot to deploy" but "the
// model we test against is not the thing we ship to". No amount of care inside
// the local suite finds that. Only comparing the two does.
//
// ---------------------------------------------------------------------------
// Capture and compare are separate on purpose
// ---------------------------------------------------------------------------
//
// Capturing needs credentials for whichever database is being read. Comparing
// needs nothing. Splitting them means the comparison is an ordinary pure
// function with ordinary unit tests, and that a fingerprint can be captured by
// any route that can run one query — psql, the Supabase SQL editor, an MCP
// call — and compared later, from anywhere.
//
// `node scripts/qa/fingerprint.mjs` prints the query for exactly that reason.

// ---------------------------------------------------------------------------
// The query
// ---------------------------------------------------------------------------
//
// One statement, one json column. Everything that decides who may read or
// write what, plus the shape it applies to.
//
// Expressions are whitespace-collapsed before comparison because the two sides
// are not always the same Postgres version — 16 locally, 17 on the hosted
// project — and the deparser's line breaking is not stable across them. What
// the expression *says* is stable, and that is what is compared.
export const FINGERPRINT_SQL = String.raw`
with
squash as (select 1),
tables as (
  select jsonb_object_agg(t.tbl, t.cols) as v from (
    select c.relname as tbl,
           jsonb_agg(jsonb_build_object(
             'name', a.attname,
             'type', format_type(a.atttypid, a.atttypmod),
             'notnull', a.attnotnull,
             'default', regexp_replace(coalesce(pg_get_expr(d.adbin, d.adrelid), ''), '\s+', ' ', 'g')
           ) order by a.attname) as cols
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      join pg_attribute a on a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
      left join pg_attrdef d on d.adrelid = c.oid and d.adnum = a.attnum
     where n.nspname = 'public' and c.relkind in ('r','v','m','p')
     group by c.relname) t
),
rls as (
  select jsonb_object_agg(c.relname, jsonb_build_object(
           'enabled', c.relrowsecurity, 'forced', c.relforcerowsecurity)) as v
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind in ('r','p')
),
policies as (
  select jsonb_object_agg(c.relname || ' :: ' || pol.polname, jsonb_build_object(
           'cmd', pol.polcmd::text,
           'permissive', pol.polpermissive,
           'roles', (select coalesce(jsonb_agg(r.rolname order by r.rolname), '[]'::jsonb)
                       from unnest(pol.polroles) ro join pg_roles r on r.oid = ro),
           'using', regexp_replace(coalesce(pg_get_expr(pol.polqual, pol.polrelid), ''), '\s+', ' ', 'g'),
           'check', regexp_replace(coalesce(pg_get_expr(pol.polwithcheck, pol.polrelid), ''), '\s+', ' ', 'g')
         )) as v
    from pg_policy pol join pg_class c on c.oid = pol.polrelid
    join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public'
),
-- Grants are the half that went wrong, so they are recorded per role by name
-- rather than as a raw aclitem string: an ACL that reads differently but grants
-- the same thing is not drift, and one that reads the same while granting
-- differently does not exist.
functions as (
  select jsonb_object_agg(p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')',
           jsonb_build_object(
             'returns', pg_get_function_result(p.oid),
             'kind', p.prokind::text,
             'security_definer', p.prosecdef,
             'volatility', p.provolatile::text,
             'config', coalesce(to_jsonb(p.proconfig), 'null'::jsonb),
             'execute', (select coalesce(jsonb_agg(g order by g), '[]'::jsonb)
                           from unnest(array['anon','authenticated','service_role','public']) g
                          where has_function_privilege(
                                  case when g = 'public' then 'public' else g end, p.oid, 'execute')
                            and exists (select 1 from pg_roles where rolname = g or g = 'public')),
             -- Two readings of the same source, because they answer different
             -- questions and only one of them is a fault.
             --
             -- body has the comments stripped: it is what the function
             -- actually does, and a difference here means the project is
             -- running code the migrations do not describe.
             --
             -- source is the text as stored, comments and all. On this project
             -- it differs for every function whose body carries a comment,
             -- because Supabase's migration pipeline strips them on the way in
             -- — guard_profile_privileges was applied from this repo and
             -- arrived with its comments gone, while is_staff, which has
             -- none, matches exactly. So a difference here is nearly always
             -- that, and never a behaviour change; it is reported and does not
             -- fail. Where it earns its place is the other direction: if body
             -- and source BOTH differ, the code differs too.
             -- Hashed, not stored. A function body runs to thousands of
             -- characters and the report never prints one — "the body differs"
             -- is the actionable fact, and the reader goes and looks. It also
             -- keeps a whole fingerprint small enough to travel through a tool
             -- with an output limit, which is how one usually gets here.
             'body', md5(regexp_replace(regexp_replace(coalesce(p.prosrc, ''), '--[^' || chr(10) || ']*', '', 'g'), '\s+', ' ', 'g')),
             'source', md5(regexp_replace(coalesce(p.prosrc, ''), '\s+', ' ', 'g'))
           )) as v
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
),
triggers as (
  select jsonb_object_agg(c.relname || ' :: ' || t.tgname,
           regexp_replace(pg_get_triggerdef(t.oid), '\s+', ' ', 'g')) as v
    from pg_trigger t join pg_class c on c.oid = t.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and not t.tgisinternal
),
indexes as (
  select jsonb_object_agg(ci.relname, regexp_replace(pg_get_indexdef(i.indexrelid), '\s+', ' ', 'g')) as v
    from pg_index i join pg_class ci on ci.oid = i.indexrelid
    join pg_class ct on ct.oid = i.indrelid
    join pg_namespace n on n.oid = ct.relnamespace where n.nspname = 'public'
),
constraints as (
  select jsonb_object_agg(c.relname || ' :: ' || con.conname,
           regexp_replace(pg_get_constraintdef(con.oid), '\s+', ' ', 'g')) as v
    from pg_constraint con join pg_class c on c.oid = con.conrelid
    join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public'
),
enums as (
  select jsonb_object_agg(t.typname, vals) as v from (
    select t.typname, jsonb_agg(e.enumlabel order by e.enumsortorder) as vals
      from pg_type t join pg_enum e on e.enumtypid = t.oid
      join pg_namespace n on n.oid = t.typnamespace where n.nspname = 'public'
     group by t.typname) t
),
-- security_invoker decides whether a view runs as its owner and quietly walks
-- past every policy underneath it, so it is recorded explicitly.
views as (
  select jsonb_object_agg(c.relname, jsonb_build_object(
           'security_invoker', coalesce((select option_value from pg_options_to_table(c.reloptions)
                                          where option_name = 'security_invoker'), 'false'))) as v
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind in ('v','m')
)
-- Compact rather than pretty: this is read by the comparison, and a fingerprint
-- often has to travel through a tool with an output limit to get here.
select (jsonb_build_object(
  'tables',      coalesce((select v from tables), '{}'::jsonb),
  'rls',         coalesce((select v from rls), '{}'::jsonb),
  'policies',    coalesce((select v from policies), '{}'::jsonb),
  'functions',   coalesce((select v from functions), '{}'::jsonb),
  'triggers',    coalesce((select v from triggers), '{}'::jsonb),
  'indexes',     coalesce((select v from indexes), '{}'::jsonb),
  'constraints', coalesce((select v from constraints), '{}'::jsonb),
  'enums',       coalesce((select v from enums), '{}'::jsonb),
  'views',       coalesce((select v from views), '{}'::jsonb)
))::text
`;

/** Stable stringify, so key order never reads as a difference. */
function canonical(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  return `{${Object.keys(value)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${canonical(value[k])}`)
    .join(",")}}`;
}

/**
 * Every way two fingerprints disagree.
 *
 * `repo` is what the migrations build; `live` is what the project actually has.
 * The verdicts are named from the live side because that is the side somebody
 * has to go and change: `missing-in-live` is a migration nobody applied,
 * `extra-in-live` is something changed by hand.
 */
export function diffFingerprints(repo, live) {
  const findings = [];
  const sections = [...new Set([...Object.keys(repo ?? {}), ...Object.keys(live ?? {})])].sort();

  for (const section of sections) {
    const a = repo?.[section] ?? {};
    const b = live?.[section] ?? {};
    const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])].sort();

    for (const key of keys) {
      const inRepo = Object.hasOwn(a, key);
      const inLive = Object.hasOwn(b, key);

      if (inRepo && !inLive) findings.push({ section, key, verdict: "missing-in-live", repo: a[key] });
      else if (!inRepo && inLive) findings.push({ section, key, verdict: "extra-in-live", live: b[key] });
      else if (canonical(a[key]) !== canonical(b[key]))
        findings.push({ section, key, verdict: "different", repo: a[key], live: b[key] });
    }
  }

  return findings;
}

/**
 * Fields whose only story is "the migration text was edited after it was
 * applied". Real, worth saying, and not a reason to fail: the function's
 * behaviour is identical, and re-applying the migration would change nothing.
 *
 * Kept to an explicit list rather than a heuristic, so that adding a field to
 * the fingerprint never quietly downgrades a fault to a note.
 */
const COSMETIC_FIELDS = new Set(["source"]);

/** True when a finding says nothing about how the database behaves. */
export function isCosmetic(finding) {
  if (finding.verdict !== "different") return false;
  const fields = changedFields(finding.repo, finding.live).map((f) => f.field);
  return fields.length > 0 && fields.every((f) => COSMETIC_FIELDS.has(f));
}

/** The fields that differ within one changed entry, for a readable report. */
export function changedFields(repo, live) {
  if (repo === null || live === null || typeof repo !== "object" || typeof live !== "object") {
    return [{ field: "", repo, live }];
  }
  const keys = [...new Set([...Object.keys(repo), ...Object.keys(live)])].sort();
  return keys
    .filter((k) => canonical(repo[k]) !== canonical(live[k]))
    .map((k) => ({ field: k, repo: repo[k], live: live[k] }));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  // Printed rather than run: capturing needs credentials this script does not
  // ask for, and any client that can run one query can produce a fingerprint.
  process.stdout.write(FINGERPRINT_SQL.trim() + "\n");
}
