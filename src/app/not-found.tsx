import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 px-6 text-center">
      <p className="text-sm font-medium uppercase tracking-wide text-neutral-400">404</p>
      <h1 className="text-3xl font-bold text-neutral-900">This page took a wrong turn</h1>
      <p className="max-w-sm text-neutral-500">
        The page you&apos;re looking for doesn&apos;t exist or may have moved.
      </p>
      <div className="mt-4 flex flex-wrap justify-center gap-3">
        <Link href="/shop">
          <Button variant="retail">Shop Retail</Button>
        </Link>
        <Link href="/wholesale">
          <Button variant="wholesale">Wholesale Portal</Button>
        </Link>
      </div>
    </main>
  );
}
