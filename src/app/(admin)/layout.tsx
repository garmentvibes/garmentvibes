export const metadata = {
  title: { default: "Admin", template: "%s | GarmentVibes Admin" },
  // Staff tooling should never be indexed.
  robots: { index: false, follow: false },
};

// Metadata only. The authenticated chrome moved down to admin/(panel)/layout,
// which wraps the staff pages but not the login page underneath it.
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
