"use client";

import { useState } from "react";
import { MapPin, Truck, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  estimateDelivery,
  formatDeliveryWindow,
  type DeliveryEstimate,
} from "@/lib/delivery-estimate";

export function DeliveryEstimator() {
  const [pincode, setPincode] = useState("");
  const [result, setResult] = useState<DeliveryEstimate | null>(null);
  const [error, setError] = useState("");
  // Captured on check rather than at render so the component stays pure and
  // server/client markup can't disagree on "today".
  const [checkedAt, setCheckedAt] = useState<Date | null>(null);

  function check(e: React.FormEvent) {
    e.preventDefault();
    const estimate = estimateDelivery(pincode);
    if (!estimate) {
      setError("Enter a valid 6-digit PIN code");
      setResult(null);
      setCheckedAt(null);
      return;
    }
    setError("");
    setResult(estimate);
    setCheckedAt(new Date());
  }

  return (
    <div className="rounded-md border border-neutral-200 p-4">
      <p className="flex items-center gap-2 text-sm font-medium text-neutral-700">
        <MapPin className="h-4 w-4 text-neutral-400" /> Check delivery
      </p>

      <form onSubmit={check} className="mt-2 flex gap-2">
        <Input
          value={pincode}
          onChange={(e) => setPincode(e.target.value.replace(/\D/g, "").slice(0, 6))}
          placeholder="Enter PIN code"
          inputMode="numeric"
          aria-label="Delivery PIN code"
          className="h-9 max-w-40"
        />
        <Button type="submit" variant="outline" size="sm">
          Check
        </Button>
      </form>

      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}

      {result && checkedAt && (
        <div className="mt-3 space-y-1 text-sm">
          <p className="flex items-center gap-2 text-green-700">
            <Truck className="h-4 w-4" />
            Delivery by <strong>{formatDeliveryWindow(result, checkedAt)}</strong>
          </p>
          <p className="text-xs text-neutral-500">
            {result.region} &middot; {result.minDays}&ndash;{result.maxDays} business days &middot;{" "}
            Free delivery
          </p>
          {!result.codAvailable && (
            <p className="flex items-center gap-1.5 text-xs text-amber-700">
              <XCircle className="h-3.5 w-3.5" />
              Cash on Delivery isn&apos;t available for this PIN code
            </p>
          )}
        </div>
      )}
    </div>
  );
}
