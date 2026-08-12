import Link from "next/link";

export function RetailSiteFooter() {
  return (
    <footer className="mt-16 border-t border-neutral-200 bg-white">
      <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-10 text-sm text-neutral-500 sm:px-6">
        <div className="flex flex-wrap gap-6">
          <Link href="/wholesale" className="hover:text-rose-600">
            Sell wholesale on GarmentVibes &rarr;
          </Link>
        </div>
        <p>&copy; {new Date().getFullYear()} GarmentVibes. All rights reserved.</p>
      </div>
    </footer>
  );
}
