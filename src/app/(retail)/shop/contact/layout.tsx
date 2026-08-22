// Metadata lives in a layout because the page itself is a client
// component, and "use client" modules cannot export metadata. Without
// this the page inherits the root title and description, which is how
// four indexable pages ended up sharing one search snippet.
export const metadata = {
  title: "Contact Us",
  description:
    "Get in touch with GarmentVibes about an order, a return, or a question — with our support hours and response times.",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
