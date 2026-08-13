"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useSessionStore } from "@/lib/stores/session-store";

export default function AdminLoginPage() {
  const router = useRouter();
  const login = useSessionStore((s) => s.login);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email || password.length < 6) {
      toast.error("Enter an email and a password of at least 6 characters");
      return;
    }
    login({ name: email.split("@")[0], email, role: "admin" });
    toast.success("Signed in to admin");
    router.push("/admin");
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-neutral-900 px-4">
      <div className="w-full max-w-sm rounded-lg bg-white p-6 shadow-xl">
        <div className="mb-5 flex items-center gap-2">
          <ShieldCheck className="h-6 w-6 text-emerald-600" />
          <h1 className="text-lg font-bold text-neutral-900">
            GarmentVibes <span className="text-emerald-600">Admin</span>
          </h1>
        </div>

        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <Label htmlFor="email">Staff email</Label>
            <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <Button type="submit" className="w-full">
            Sign in
          </Button>
        </form>

        <div className="mt-5 rounded-md border border-dashed border-amber-300 bg-amber-50 p-3 text-xs text-amber-800">
          <strong>Not a real login.</strong> Authentication is mocked until Supabase Auth is wired
          up — any email works, and access is enforced in the browser only. Do not put real data
          behind this or deploy it publicly as-is.
        </div>
      </div>
    </div>
  );
}
