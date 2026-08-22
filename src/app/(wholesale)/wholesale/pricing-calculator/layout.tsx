// Metadata lives in a layout because the page itself is a client
// component, and "use client" modules cannot export metadata. Without
// this the page inherits the root title and description, which is how
// four indexable pages ended up sharing one search snippet.
export const metadata = {
  title: "Pricing Calculator",
  description:
    "Work out your per-unit price and order total across GarmentVibes quantity breaks before requesting a quote.",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
