"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useSessionStore } from "@/lib/stores/session-store";

const loginSchema = z.object({
  email: z.string().email("Enter a valid email"),
  password: z.string().min(6, "Password must be at least 6 characters"),
});

type LoginForm = z.infer<typeof loginSchema>;

export default function WholesaleLoginPage() {
  const router = useRouter();
  const login = useSessionStore((s) => s.login);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginForm>({ resolver: zodResolver(loginSchema) });

  function onSubmit(data: LoginForm) {
    // Returning sign-in is treated as an already-approved account — new
    // accounts only go through /wholesale/signup, which starts "pending".
    login({
      name: data.email.split("@")[0],
      email: data.email,
      role: "wholesale",
      approvalStatus: "approved",
      paymentTerms: "prepay",
    });
    toast.success("Signed in");
    router.push("/wholesale/dashboard");
  }

  return (
    <div className="mx-auto max-w-sm px-4 py-20 sm:px-6">
      <h1 className="text-2xl font-bold text-slate-900">Business sign in</h1>
      <p className="mt-1 text-sm text-slate-500">Access your wholesale account.</p>

      <form onSubmit={handleSubmit(onSubmit)} className="mt-6 space-y-4">
        <div>
          <Label htmlFor="email">Business email</Label>
          <Input id="email" type="email" {...register("email")} />
          {errors.email && <p className="mt-1 text-xs text-red-600">{errors.email.message}</p>}
        </div>
        <div>
          <Label htmlFor="password">Password</Label>
          <Input id="password" type="password" {...register("password")} />
          {errors.password && <p className="mt-1 text-xs text-red-600">{errors.password.message}</p>}
        </div>
        <Button type="submit" variant="wholesale" className="w-full" disabled={isSubmitting}>
          Sign in
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-slate-500">
        New business partner?{" "}
        <Link href="/wholesale/signup" className="font-medium text-blue-700 hover:underline">
          Register your business
        </Link>
      </p>
    </div>
  );
}
