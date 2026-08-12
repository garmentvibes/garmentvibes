import { Suspense } from "react";
import { SearchResults } from "./search-results";

export const metadata = { title: "Search Results" };

export default function SearchPage() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <Suspense fallback={null}>
        <SearchResults />
      </Suspense>
    </div>
  );
}
