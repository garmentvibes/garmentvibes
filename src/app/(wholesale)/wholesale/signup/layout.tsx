// Metadata lives in a layout because the page itself is a client
// component, and "use client" modules cannot export metadata. Without
// this the page inherits the root title and description, which is how
// four indexable pages ended up sharing one search snippet.
export const metadata = {
  title: "Apply for a Wholesale Account",
  description:
    "Apply for a GarmentVibes trade account. Approved buyers see wholesale pricing and can request credit terms.",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
