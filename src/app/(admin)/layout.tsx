import { AdminShell } from "@/components/admin/admin-shell";

export const metadata = {
  title: { default: "Admin", template: "%s | GarmentVibes Admin" },
  // Staff tooling should never be indexed.
  robots: { index: false, follow: false },
};

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <AdminShell>{children}</AdminShell>;
}
