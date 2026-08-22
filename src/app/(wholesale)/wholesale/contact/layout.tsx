// Metadata lives in a layout because the page itself is a client
// component, and "use client" modules cannot export metadata. Without
// this the page inherits the root title and description, which is how
// four indexable pages ended up sharing one search snippet.
export const metadata = {
  title: "Contact Wholesale",
  description:
    "Talk to the GarmentVibes trade team about bulk pricing, samples, lead times or opening a wholesale account.",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
