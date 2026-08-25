import { requireStaff } from "@/lib/auth/dal";
import { AdminShell } from "@/components/admin/admin-shell";
import {
  CatalogueProvider,
  WholesaleCatalogueProvider,
} from "@/components/shared/catalogue-provider";
import { getRetailCatalogue } from "@/lib/catalogue/retail";
import { getWholesaleCatalogue } from "@/lib/catalogue/wholesale";

// ---------------------------------------------------------------------------
// The admin authorisation boundary.
//
// `(panel)` is a route group, so it does not appear in any URL — /admin and
// /admin/orders are unchanged. What it buys is a layout that wraps every
// staff page and nothing else: /admin/login sits outside it, which is why the
// gate below can be unconditional instead of special-casing its own login
// page and risking a redirect loop.
//
// This is a Server Component, and that is the whole point. The previous gate
// was a client component reading localStorage, so the browser was being asked
// whether it was allowed in — a question it will always answer yes to if you
// edit the answer. requireStaff() runs on the server and redirects before any
// of this subtree renders.
// ---------------------------------------------------------------------------

export default async function AdminPanelLayout({ children }: { children: React.ReactNode }) {
  const user = await requireStaff();

  // The panel edits the catalogue, so it has to be looking at the same one the
  // storefront renders. Read here for the same reason as the retail layout:
  // the pages that need it are client components and cannot await.
  const catalogue = await getRetailCatalogue();
  const wholesaleCatalogue = await getWholesaleCatalogue();

  return (
    <CatalogueProvider catalogue={catalogue}>
      <WholesaleCatalogueProvider catalogue={wholesaleCatalogue}>
        <AdminShell user={user}>{children}</AdminShell>
      </WholesaleCatalogueProvider>
    </CatalogueProvider>
  );
}
