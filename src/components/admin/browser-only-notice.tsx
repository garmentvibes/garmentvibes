// ---------------------------------------------------------------------------
// The "saved in this browser only" notice, shown on the admin page it is true
// for.
//
// This used to be one amber banner in the admin shell, on every page, with no
// condition on it. On a deployment with a database that was false for orders,
// quotes, promos, credit, claims, returns and the catalogue — all of which
// write to it — and true only for the areas that still keep their data in
// localStorage. So each page now decides: the database-backed ones show this
// when their hook reports `live: false` (or, for the catalogue, when no
// Supabase project is configured), and the browser-only ones always do.
//
// `data-browser-only-notice` is what the QA sweep counts.
// ---------------------------------------------------------------------------

export function BrowserOnlyNotice({ children }: { children: React.ReactNode }) {
  return (
    <p
      data-browser-only-notice
      className="mt-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800"
    >
      {children}
    </p>
  );
}
