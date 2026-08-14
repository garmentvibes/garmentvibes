"use client";

import { useEffect } from "react";

// Registers the service worker in public/sw.js. Kept out of production-only
// gating so the offline fallback can be exercised in QA, but registration is
// skipped where the API is unavailable (older browsers, non-secure contexts).
export function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
    // Registering after load avoids competing with the initial page's
    // requests for bandwidth on a first visit.
    const onLoad = () => {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        // Registration failing is non-fatal — the app works fine without it.
      });
    };
    if (document.readyState === "complete") onLoad();
    else window.addEventListener("load", onLoad, { once: true });
    return () => window.removeEventListener("load", onLoad);
  }, []);

  return null;
}
