"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useSessionStore } from "@/lib/stores/session-store";
import { useReferralStore } from "@/lib/stores/referral-store";

const signupSchema = z.object({
  name: z.string().min(2, "Enter your name"),
  email: z.string().email("Enter a valid email"),
  password: z.string().min(6, "Password must be at least 6 characters"),
});

type SignupForm = z.infer<typeof signupSchema>;

export function SignupForm() {
  const router = useRouter();
  const redirect = useSearchParams().get("redirect") || "/shop";
  const login = useSessionStore((s) => s.login);
  const rememberCustomer = useReferralStore((s) => s.rememberCustomer);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<SignupForm>({ resolver: zodResolver(signupSchema) });

  function onSubmit(data: SignupForm) {
    login({ name: data.name, email: data.email, role: "retail" });
    // A referral code is a hash of an email and cannot be reversed, so a
    // code is resolved by checking it against the customers we know about.
    // Becomes a lookup on `profiles` once accounts are in the database.
    rememberCustomer(data.email);
    toast.success("Account created");
    router.push(redirect);
  }

  return (
    <>
            <form onSubmit={handleSubmit(onSubmit)} className="mt-6 space-y-4">
        <div>
          <Label htmlFor="name">Full name</Label>
          <Input id="name" {...register("name")} />
          {errors.name && <p className="mt-1 text-xs text-red-600">{errors.name.message}</p>}
        </div>
        <div>
          <Label htmlFor="email">Email</Label>
          <Input id="email" type="email" {...register("email")} />
          {errors.email && <p className="mt-1 text-xs text-red-600">{errors.email.message}</p>}
        </div>
        <div>
          <Label htmlFor="password">Password</Label>
          <Input id="password" type="password" {...register("password")} />
          {errors.password && <p className="mt-1 text-xs text-red-600">{errors.password.message}</p>}
        </div>
        <Button type="submit" variant="retail" className="w-full" disabled={isSubmitting}>
          Create account
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-neutral-500">
        Already have an account?{" "}
        <Link
          href={`/shop/login${redirect !== "/shop" ? `?redirect=${encodeURIComponent(redirect)}` : ""}`}
          className="font-medium text-rose-600 hover:underline"
        >
          Sign in
        </Link>
      </p>
    </>
  );
}
