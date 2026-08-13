// Client instrumentation — runs after the document loads but before React
// hydrates, which is early enough to catch errors thrown during hydration
// itself. See node_modules/next/dist/docs/01-app/03-api-reference/
// 03-file-conventions/instrumentation-client.md
//
// Kept deliberately small: Next.js warns if this file takes longer than 16ms.

import { reportError } from "@/lib/analytics";

if (typeof window !== "undefined") {
  window.addEventListener("error", (event) => {
    reportError(event.error ?? event.message, "window.error");
  });

  window.addEventListener("unhandledrejection", (event) => {
    reportError(event.reason, "unhandledrejection");
  });
}

export function onRouterTransitionStart(url: string, navigationType: string) {
  // Navigation breadcrumbs make a later error report far easier to read:
  // you can see which page the user came from.
  if (process.env.NODE_ENV === "development") {
    console.debug("[nav]", navigationType, url);
  }
}
