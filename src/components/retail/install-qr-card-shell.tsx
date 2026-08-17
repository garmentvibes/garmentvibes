"use client";

import { useEffect, useState } from "react";
import { X, Smartphone } from "lucide-react";

const DISMISSED_KEY = "garmentvibes-qr-card-dismissed";

/**
 * Client shell around the server-rendered QR.
 *
 * Only handles when the card is allowed to appear; the QR markup itself
 * arrives as a prop and never re-renders.
 */
export function InstallQrCardShell({
  displayUrl,
  svg,
}: {
  displayUrl: string;
  svg: string;
}) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (localStorage.getItem(DISMISSED_KEY) === "true") return;

    // Pointless on the device you'd be scanning with: you cannot photograph
    // your own screen. Coarse pointer is a better test than screen width,
    // since it catches tablets and large phones that a media query on width
    // would wrongly treat as desktops.
    const isTouchDevice = window.matchMedia("(pointer: coarse)").matches;
    if (isTouchDevice) return;

    // Already installed and launched as an app — nothing to offer.
    if (window.matchMedia("(display-mode: standalone)").matches) return;

    // Held back briefly so it doesn't compete with the page for attention
    // the moment someone lands.
    const timer = setTimeout(() => setVisible(true), 2500);
    return () => clearTimeout(timer);
  }, []);

  function dismiss() {
    setVisible(false);
    localStorage.setItem(DISMISSED_KEY, "true");
  }

  if (!visible) return null;

  return (
    <aside
      aria-label="Continue shopping on your phone"
      className="fixed bottom-4 left-4 z-40 hidden w-60 overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-xl lg:block"
    >
      <div className="flex items-center justify-between bg-rose-600 px-3 py-2">
        <p className="flex items-center gap-1.5 text-sm font-semibold text-white">
          <Smartphone className="h-4 w-4" />
          Shop on your phone
        </p>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Dismiss"
          className="text-white/80 transition-colors hover:text-white"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="px-3 pb-3 pt-2.5">
        <p className="text-center text-xs text-neutral-500">
          Scan to pick up where you left off
        </p>

        <div
          // id so QA can target the code itself rather than the card's
          // other (icon) SVGs.
          id="install-qr"
          className="mx-auto mt-2 w-full rounded-lg border border-neutral-200 p-2 [&_svg]:block [&_svg]:h-auto [&_svg]:w-full"
          // Server-generated from our own site URL — no user input reaches it.
          dangerouslySetInnerHTML={{ __html: svg }}
        />

        <p className="mt-2 truncate text-center font-mono text-[11px] text-neutral-400">
          {displayUrl}
        </p>
        <p className="mt-1.5 text-center text-[11px] text-neutral-500">
          Add to your home screen for an app-like experience
        </p>
      </div>
    </aside>
  );
}
