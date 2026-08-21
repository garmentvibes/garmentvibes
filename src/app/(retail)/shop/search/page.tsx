import { Suspense } from "react";
import { SearchResults } from "./search-results";

export const metadata = { title: "Search Results" };

export default function SearchPage() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <Suspense
        fallback={
          // The real heading names the query, which is only known client-side.
          // This keeps a heading in the prerendered shell so the page is never
          // served without one — the boundary otherwise ships an empty document.
          <h1 className="text-xl font-bold text-neutral-900">Search</h1>
        }
      >
        <SearchResults />
      </Suspense>
    </div>
  );
}
