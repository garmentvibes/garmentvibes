import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatPrice(amountInMinorUnits: number, currency: "INR" | "USD" = "INR") {
  const amount = amountInMinorUnits / 100;
  return new Intl.NumberFormat(currency === "INR" ? "en-IN" : "en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(amount);
}

// Mock reference number generator for stubbed checkout/quote flows (Phase 5
// wires real order IDs from the database). Kept out of components so the
// impure Date.now() call isn't reachable from render analysis.
export function generateReferenceId(prefix: string) {
  return `${prefix}${Date.now().toString().slice(-8)}`;
}
