import { redirect } from "next/navigation";
import { ShieldCheck } from "lucide-react";

import { getStaffUser } from "@/lib/auth/dal";
import { demoAdminEnabled, supabaseConfigured } from "@/lib/auth/demo";
import { AdminLoginForm } from "@/components/admin/admin-login-form";

export const metadata = { title: "Sign in" };

export default async function AdminLoginPage() {
  // Already staff? Don't make them sign in again.
  if (await getStaffUser()) redirect("/admin");

  const configured = supabaseConfigured();
  const demo = demoAdminEnabled();

  return (
    <div className="flex min-h-screen items-center justify-center bg-neutral-900 px-4">
      <div className="w-full max-w-sm rounded-lg bg-white p-6 shadow-xl">
        <div className="mb-5 flex items-center gap-2">
          <ShieldCheck className="h-6 w-6 text-emerald-600" />
          <h1 className="text-lg font-bold text-neutral-900">
            GarmentVibes <span className="text-emerald-700">Admin</span>
          </h1>
        </div>

        {configured || demo ? (
          <AdminLoginForm />
        ) : (
          <p className="rounded-md border border-dashed border-neutral-300 bg-neutral-50 p-3 text-sm text-neutral-600">
            Admin sign-in is unavailable. This deployment has no Supabase project configured, so
            there is nothing to authenticate against.
          </p>
        )}

        {demo && (
          <div className="mt-5 rounded-md border border-dashed border-red-300 bg-red-50 p-3 text-xs text-red-800">
            <strong>Demo sign-in is on.</strong> No Supabase project is configured and{" "}
            <code className="rounded bg-red-100 px-1">ALLOW_DEMO_ADMIN=1</code> is set, so any
            email and password will be accepted. This exists so the QA suite can drive the panel
            without a database. It is ignored the moment a Supabase project is configured — but do
            not serve this configuration publicly.
          </div>
        )}
      </div>
    </div>
  );
}
