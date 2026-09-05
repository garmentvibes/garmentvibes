"use client";

import { useEffect, useState } from "react";
import { Download, X } from "lucide-react";
import { Button } from "@/components/ui/button";

// Chromium fires `beforeinstallprompt` with this shape; it isn't in the
// standard DOM lib types yet.
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const DISMISSED_KEY = "garmentvibes-install-prompt-dismissed";

export function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (localStorage.getItem(DISMISSED_KEY) === "true") return;

    const onBeforeInstallPrompt = (e: Event) => {
      // Prevent Chrome's default mini-infobar so we can show our own UI at a
      // moment that makes sense for the app.
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setVisible(true);
    };

    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    return () => window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
  }, []);

  function dismiss() {
    setVisible(false);
    localStorage.setItem(DISMISSED_KEY, "true");
  }

  async function install() {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    // A prompt can only be used once — drop it either way.
    setDeferredPrompt(null);
    setVisible(false);
    localStorage.setItem(DISMISSED_KEY, "true");
  }

  if (!visible) return null;

  return (
    <div className="fixed inset-x-4 bottom-4 z-50 mx-auto flex max-w-md items-center gap-3 rounded-lg border border-neutral-200 bg-white p-4 shadow-lg sm:inset-x-auto sm:right-4">
      <Download className="h-5 w-5 shrink-0 text-neutral-500" />
      <div className="flex-1 text-sm">
        <p className="font-medium text-neutral-900">Install GarmentVibes</p>
        <p className="text-neutral-500">Add it to your home screen for faster access.</p>
      </div>
      <Button size="sm" onClick={install}>
        Install
      </Button>
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss install prompt"
        className="text-neutral-500 hover:text-neutral-600"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
