"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { reportError } from "@/lib/analytics";

// Route-level boundary. Errors thrown by the root layout itself escape this
// one — global-error.tsx catches those.
//
// Next.js 16.2 recommends `unstable_retry` over `reset`: it re-fetches the
// segment's data before re-rendering, whereas `reset` only re-renders.
export default function RouteError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    reportError(error, "route-error-boundary");
  }, [error]);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 px-6 text-center">
      <p className="text-sm font-medium uppercase tracking-wide text-neutral-400">Error</p>
      <h1 className="text-3xl font-bold text-neutral-900">Something went wrong</h1>
      <p className="max-w-sm text-neutral-500">
        An unexpected error occurred. You can try again, or head back to the homepage.
      </p>
      <div className="mt-4 flex flex-wrap justify-center gap-3">
        <Button variant="default" onClick={() => unstable_retry()}>
          Try Again
        </Button>
        <Button variant="outline" onClick={() => (window.location.href = "/")}>
          Go Home
        </Button>
      </div>
    </main>
  );
}
