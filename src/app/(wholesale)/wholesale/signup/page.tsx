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

const signupSchema = z.object({
  businessName: z.string().min(2, "Enter your business name"),
  contactName: z.string().min(2, "Enter a contact person"),
  email: z.string().email("Enter a valid email"),
  gstin: z.string().optional(),
  password: z.string().min(6, "Password must be at least 6 characters"),
});

type SignupForm = z.infer<typeof signupSchema>;

export default function WholesaleSignupPage() {
  const router = useRouter();
  const login = useSessionStore((s) => s.login);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<SignupForm>({ resolver: zodResolver(signupSchema) });

  function onSubmit(data: SignupForm) {
    login({
      name: data.contactName,
      email: data.email,
      role: "wholesale",
      businessName: data.businessName,
    });
    toast.success("Business account created — pending verification");
    router.push("/wholesale/dashboard");
  }

  return (
    <div className="mx-auto max-w-sm px-4 py-16 sm:px-6">
      <h1 className="text-2xl font-bold text-slate-900">Register your business</h1>
      <p className="mt-1 text-sm text-slate-500">Get access to wholesale pricing and bulk ordering.</p>

      <form onSubmit={handleSubmit(onSubmit)} className="mt-6 space-y-4">
        <div>
          <Label htmlFor="businessName">Business name</Label>
          <Input id="businessName" {...register("businessName")} />
          {errors.businessName && (
            <p className="mt-1 text-xs text-red-600">{errors.businessName.message}</p>
          )}
        </div>
        <div>
          <Label htmlFor="contactName">Contact person</Label>
          <Input id="contactName" {...register("contactName")} />
          {errors.contactName && (
            <p className="mt-1 text-xs text-red-600">{errors.contactName.message}</p>
          )}
        </div>
        <div>
          <Label htmlFor="email">Business email</Label>
          <Input id="email" type="email" {...register("email")} />
          {errors.email && <p className="mt-1 text-xs text-red-600">{errors.email.message}</p>}
        </div>
        <div>
          <Label htmlFor="gstin">GSTIN (optional)</Label>
          <Input id="gstin" {...register("gstin")} />
        </div>
        <div>
          <Label htmlFor="password">Password</Label>
          <Input id="password" type="password" {...register("password")} />
          {errors.password && <p className="mt-1 text-xs text-red-600">{errors.password.message}</p>}
        </div>
        <Button type="submit" variant="wholesale" className="w-full" disabled={isSubmitting}>
          Create business account
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-slate-500">
        Already registered?{" "}
        <Link href="/wholesale/login" className="font-medium text-blue-700 hover:underline">
          Sign in
        </Link>
      </p>
    </div>
  );
}
