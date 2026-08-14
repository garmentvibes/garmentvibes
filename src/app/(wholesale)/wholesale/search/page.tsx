import { Suspense } from "react";
import { WholesaleSearchResults } from "./search-results";

export const metadata = { title: "Search Results" };

export default function WholesaleSearchPage() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <Suspense fallback={null}>
        <WholesaleSearchResults />
      </Suspense>
    </div>
  );
}
