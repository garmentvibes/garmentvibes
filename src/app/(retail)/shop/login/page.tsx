import { Suspense } from "react";
import { LoginForm } from "./login-form";

export const metadata = { title: "Sign In" };

export default function RetailLoginPage() {
  return (
    <div className="mx-auto max-w-sm px-4 py-20 sm:px-6">
      {/* Heading and subtitle live here, outside the Suspense boundary, not
          inside the form. The form reads useSearchParams() for its redirect
          target, which suspends it out of the prerendered HTML — so anything
          static that sits inside it ships as an empty page and only appears
          once JavaScript runs. */}
      <h1 className="text-2xl font-bold text-neutral-900">Sign in</h1>
      <p className="mt-1 text-sm text-neutral-500">Welcome back to GarmentVibes.</p>

      <Suspense fallback={null}>
        <LoginForm />
      </Suspense>
    </div>
  );
}
