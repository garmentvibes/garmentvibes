import { WifiOff } from "lucide-react";

export const metadata = { title: "You're Offline" };

export default function OfflinePage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 px-6 text-center">
      <WifiOff className="h-12 w-12 text-neutral-300" />
      <h1 className="text-2xl font-bold text-neutral-900">You&apos;re offline</h1>
      <p className="max-w-sm text-neutral-500">
        We couldn&apos;t reach GarmentVibes. Check your connection — your bag and wishlist are saved
        on this device and will still be here once you&apos;re back online.
      </p>
      {/* Intentionally a plain <a>, not next/link: this page is served from
          the service worker cache when the network is down, so "Try Again"
          must trigger a real document navigation. A client-side <Link/>
          navigation would just re-attempt an RSC fetch and fail again. */}
      {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
      <a
        href="/"
        className="mt-2 rounded-md bg-neutral-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-neutral-800"
      >
        Try Again
      </a>
    </main>
  );
}
