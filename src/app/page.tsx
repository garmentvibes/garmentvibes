import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function HomePage() {
  return (
    <main className="flex min-h-screen flex-col">
      <header className="flex items-center justify-between px-6 py-5 sm:px-10">
        <span className="text-lg font-bold tracking-tight">GarmentVibes</span>
        <span className="text-xs text-neutral-500">One platform. Two ways to shop.</span>
      </header>

      <div className="relative flex flex-1 flex-col sm:flex-row">
        <Link
          href="/shop"
          className="group relative flex flex-1 flex-col items-center justify-center gap-4 overflow-hidden bg-gradient-to-br from-rose-600 to-rose-800 px-6 py-20 text-white transition-transform"
        >
          <span className="rounded-full bg-white/15 px-4 py-1 text-xs font-medium uppercase tracking-wide">
            Individuals
          </span>
          <h2 className="text-4xl font-bold sm:text-5xl">Shop Retail</h2>
          <p className="max-w-sm text-center text-rose-50/90">
            Discover the latest fashion trends, curated collections, and fast delivery — just like your favourite fashion app.
          </p>
          <Button
            variant="outline"
            size="lg"
            className="mt-2 border-white bg-transparent text-white hover:bg-white hover:text-rose-700"
          >
            Start Shopping
          </Button>
        </Link>

        <Link
          href="/wholesale"
          className="group relative flex flex-1 flex-col items-center justify-center gap-4 overflow-hidden bg-gradient-to-br from-blue-700 to-blue-950 px-6 py-20 text-white transition-transform"
        >
          <span className="rounded-full bg-white/15 px-4 py-1 text-xs font-medium uppercase tracking-wide">
            Businesses
          </span>
          <h2 className="text-4xl font-bold sm:text-5xl">Wholesale Portal</h2>
          <p className="max-w-sm text-center text-blue-50/90">
            Source apparel in bulk with tiered pricing, MOQ-based ordering, and dedicated account support for retailers.
          </p>
          <Button
            size="lg"
            className="mt-2 border border-white bg-transparent text-white hover:bg-white hover:text-blue-800"
          >
            Enter Wholesale
          </Button>
        </Link>
      </div>

      <footer className="px-6 py-4 text-center text-xs text-neutral-400">
        &copy; {new Date().getFullYear()} GarmentVibes. All rights reserved.
      </footer>
    </main>
  );
}
