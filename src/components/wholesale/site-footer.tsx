import Link from "next/link";

export function WholesaleSiteFooter() {
  return (
    <footer className="mt-16 border-t border-slate-200 bg-white">
      <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-10 text-sm text-neutral-500 sm:px-6">
        <div className="flex flex-wrap gap-6">
          <Link href="/shop" className="hover:text-blue-700">
            Looking to shop retail instead? &rarr;
          </Link>
        </div>
        <p>&copy; {new Date().getFullYear()} GarmentVibes B2B. All rights reserved.</p>
      </div>
    </footer>
  );
}
