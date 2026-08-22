"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { signInAdmin, type SignInState } from "@/lib/auth/actions";

const INITIAL: SignInState = { error: null };

function SubmitButton() {
  // useFormStatus reads the enclosing form's pending state, so this has to be
  // its own component — inside <form>, not the one that renders it.
  const { pending } = useFormStatus();
  return (
    <Button type="submit" className="w-full" disabled={pending}>
      {pending ? "Signing in…" : "Sign in"}
    </Button>
  );
}

export function AdminLoginForm() {
  const [state, formAction] = useActionState(signInAdmin, INITIAL);

  return (
    <form action={formAction} className="space-y-4">
      <div>
        <Label htmlFor="email">Staff email</Label>
        <Input id="email" name="email" type="email" autoComplete="username" required />
      </div>
      <div>
        <Label htmlFor="password">Password</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
        />
      </div>

      {state.error && (
        <p role="alert" className="text-sm text-red-600">
          {state.error}
        </p>
      )}

      <SubmitButton />
    </form>
  );
}
