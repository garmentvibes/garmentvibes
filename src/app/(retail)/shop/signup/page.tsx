import { Suspense } from "react";
import { SignupForm } from "./signup-form";

export const metadata = {
  title: "Create Account",
  description:
    "Create a GarmentVibes account to check out faster, track orders and save items to your wishlist.",
};

export default function RetailSignupPage() {
  return (
    <div className="mx-auto max-w-sm px-4 py-20 sm:px-6">
      {/* Heading and subtitle live here, outside the Suspense boundary, not
          inside the form. The form reads useSearchParams() for its redirect
          target, which suspends it out of the prerendered HTML — so anything
          static that sits inside it ships as an empty page and only appears
          once JavaScript runs. */}
      <h1 className="text-2xl font-bold text-neutral-900">Create account</h1>
      <p className="mt-1 text-sm text-neutral-500">Join GarmentVibes to start shopping.</p>

      <Suspense fallback={null}>
        <SignupForm />
      </Suspense>
    </div>
  );
}
