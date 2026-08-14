import { Suspense } from "react";
import { LoginForm } from "./login-form";

export const metadata = { title: "Sign In" };

export default function RetailLoginPage() {
  return (
    <div className="mx-auto max-w-sm px-4 py-20 sm:px-6">
      <Suspense fallback={null}>
        <LoginForm />
      </Suspense>
    </div>
  );
}
