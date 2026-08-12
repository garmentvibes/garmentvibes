"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 px-6 text-center">
      <p className="text-sm font-medium uppercase tracking-wide text-neutral-400">Error</p>
      <h1 className="text-3xl font-bold text-neutral-900">Something went wrong</h1>
      <p className="max-w-sm text-neutral-500">
        An unexpected error occurred. You can try again, or head back to the homepage.
      </p>
      <div className="mt-4 flex flex-wrap justify-center gap-3">
        <Button variant="default" onClick={() => reset()}>
          Try Again
        </Button>
        <Button variant="outline" onClick={() => (window.location.href = "/")}>
          Go Home
        </Button>
      </div>
    </main>
  );
}
