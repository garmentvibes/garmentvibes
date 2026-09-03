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
import { signInCustomer } from "@/lib/auth/customer-actions";

const loginSchema = z.object({
  email: z.string().email("Enter a valid email"),
  password: z.string().min(6, "Password must be at least 6 characters"),
});

type LoginForm = z.infer<typeof loginSchema>;

export function LoginForm() {
  const router = useRouter();
  const redirect = useSearchParams().get("redirect") || "/shop";
  const login = useSessionStore((s) => s.login);
  const rememberCustomer = useReferralStore((s) => s.rememberCustomer);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginForm>({ resolver: zodResolver(loginSchema) });

  async function onSubmit(data: LoginForm) {
    const form = new FormData();
    form.set("email", data.email);
    form.set("password", data.password);

    const result = await signInCustomer(null, form);

    // A deployment with no Supabase project has no accounts to sign into, so
    // the local-only session stands in — the state this repository is in, and
    // what the QA suite drives. Branching on the flag rather than the message
    // so a reworded error cannot silently turn a real failure into a
    // successful fake sign-in.
    if (result.error && !result.notConfigured) {
      toast.error(result.error);
      return;
    }

    // Set locally either way. When Supabase did sign them in, the cookie is
    // already set and this only makes the header correct immediately instead
    // of one round trip later; SessionSync overwrites it with the server's
    // answer on the next mount.
    login({ name: data.email.split("@")[0], email: data.email, role: "retail" });

    // A referral code is a hash of an email and cannot be reversed, so a
    // code is resolved by checking it against the customers we know about.
    // Becomes a lookup on `profiles` once accounts are in the database.
    rememberCustomer(data.email);
    toast.success("Signed in");
    router.push(redirect);
  }

  return (
    <>
            <form onSubmit={handleSubmit(onSubmit)} className="mt-6 space-y-4">
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
          Sign in
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-neutral-500">
        New to GarmentVibes?{" "}
        <Link
          href={`/shop/signup${redirect !== "/shop" ? `?redirect=${encodeURIComponent(redirect)}` : ""}`}
          className="font-medium text-rose-700 hover:underline"
        >
          Create an account
        </Link>
      </p>
    </>
  );
}
