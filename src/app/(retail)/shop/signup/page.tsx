import { Suspense } from "react";
import { SignupForm } from "./signup-form";

export const metadata = { title: "Create Account" };

export default function RetailSignupPage() {
  return (
    <div className="mx-auto max-w-sm px-4 py-20 sm:px-6">
      <Suspense fallback={null}>
        <SignupForm />
      </Suspense>
    </div>
  );
}
