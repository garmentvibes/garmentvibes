"use client";

// Last-resort boundary: catches errors thrown by the root layout itself,
// which error.tsx sits inside and therefore cannot catch. It replaces the
// root layout when active, so it must render its own <html>/<body> and
// cannot rely on any provider, font or global style from the layout.
//
// Styles are inline for that reason — globals.css is loaded by the layout
// this file is replacing.

import { useEffect } from "react";
import { reportError } from "@/lib/analytics";

export default function GlobalError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    reportError(error, "global-error-boundary");
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: "0.75rem",
          padding: "1.5rem",
          textAlign: "center",
          fontFamily: "system-ui, sans-serif",
          color: "#171717",
          background: "#fafafa",
        }}
      >
        <title>Something went wrong | GarmentVibes</title>
        <p style={{ fontSize: "0.8rem", letterSpacing: "0.08em", color: "#a3a3a3", margin: 0 }}>
          GARMENTVIBES
        </p>
        <h1 style={{ fontSize: "1.75rem", margin: 0 }}>Something went wrong</h1>
        <p style={{ maxWidth: "26rem", color: "#737373", margin: 0 }}>
          The page failed to load. Try again, or head back to the homepage.
        </p>
        {error.digest && (
          <p style={{ fontSize: "0.75rem", color: "#a3a3a3", margin: 0 }}>
            Reference: {error.digest}
          </p>
        )}
        <div style={{ display: "flex", gap: "0.75rem", marginTop: "0.75rem" }}>
          <button
            type="button"
            onClick={() => retry()}
            style={{
              cursor: "pointer",
              borderRadius: "0.375rem",
              border: "none",
              background: "#e11d48",
              color: "white",
              padding: "0.5rem 1.25rem",
              fontSize: "0.875rem",
            }}
          >
            Try Again
          </button>
          {/*
            Deliberately a plain anchor rather than next/link. This boundary
            only renders when the ROOT LAYOUT threw, so a client-side
            navigation would re-render that same broken layout and fail
            again. A full document load re-fetches from the server, which is
            the only thing that actually recovers from a transient failure.
          */}
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
          <a
            href="/"
            style={{
              display: "inline-block",
              textDecoration: "none",
              borderRadius: "0.375rem",
              border: "1px solid #d4d4d4",
              background: "white",
              color: "#171717",
              padding: "0.5rem 1.25rem",
              fontSize: "0.875rem",
            }}
          >
            Go Home
          </a>
        </div>
      </body>
    </html>
  );
}
