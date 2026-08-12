"use client";

import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useSessionStore } from "@/lib/stores/session-store";

export default function RetailAccountPage() {
  const router = useRouter();
  const user = useSessionStore((s) => s.user);
  const logout = useSessionStore((s) => s.logout);

  if (!user || user.role !== "retail") {
    return (
      <div className="mx-auto max-w-md px-4 py-20 text-center sm:px-6">
        <p className="text-neutral-500">You&apos;re not signed in.</p>
        <Button variant="retail" className="mt-4" onClick={() => router.push("/shop/login")}>
          Sign in
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md px-4 py-20 sm:px-6">
      <h1 className="text-2xl font-bold text-neutral-900">My Account</h1>
      <div className="mt-4 rounded-lg border border-neutral-200 bg-white p-5">
        <p className="font-medium text-neutral-900">{user.name}</p>
        <p className="text-sm text-neutral-500">{user.email}</p>
      </div>
      <Button
        variant="outline"
        className="mt-4"
        onClick={() => {
          logout();
          toast.success("Signed out");
          router.push("/shop");
        }}
      >
        Sign out
      </Button>
    </div>
  );
}
