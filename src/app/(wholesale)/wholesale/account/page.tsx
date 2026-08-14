"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ClipboardList, Settings, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSessionStore } from "@/lib/stores/session-store";

export default function WholesaleAccountPage() {
  const router = useRouter();
  const user = useSessionStore((s) => s.user);
  const logout = useSessionStore((s) => s.logout);

  if (!user || user.role !== "wholesale") {
    return (
      <div className="mx-auto max-w-md px-4 py-20 text-center sm:px-6">
        <p className="text-slate-500">You&apos;re not signed in.</p>
        <Button variant="wholesale" className="mt-4" onClick={() => router.push("/wholesale/login")}>
          Sign in
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md px-4 py-20 sm:px-6">
      <h1 className="text-2xl font-bold text-slate-900">My Business Account</h1>
      <div className="mt-4 rounded-lg border border-slate-200 bg-white p-5">
        <p className="font-medium text-slate-900">{user.businessName}</p>
        <p className="text-sm text-slate-500">{user.name}</p>
        <p className="text-sm text-slate-500">{user.email}</p>
      </div>

      <div className="mt-4 space-y-2">
        <Link
          href="/wholesale/dashboard"
          className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white p-4 text-sm font-medium text-slate-800 hover:border-blue-200"
        >
          <ClipboardList className="h-5 w-5 text-slate-400" /> Order &amp; Quote History
        </Link>
        <Link
          href="/wholesale/settings"
          className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white p-4 text-sm font-medium text-slate-800 hover:border-blue-200"
        >
          <Settings className="h-5 w-5 text-slate-400" /> Business Settings
        </Link>
        <Link
          href="/wholesale/team"
          className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white p-4 text-sm font-medium text-slate-800 hover:border-blue-200"
        >
          <Users className="h-5 w-5 text-slate-400" /> Team Members
        </Link>
      </div>

      <Button
        variant="outline"
        className="mt-4 w-full"
        onClick={() => {
          logout();
          toast.success("Signed out");
          router.push("/wholesale");
        }}
      >
        Sign out
      </Button>
    </div>
  );
}
