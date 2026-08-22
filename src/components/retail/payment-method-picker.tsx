"use client";

import { Banknote, CreditCard, Landmark, Smartphone, Truck, Wallet } from "lucide-react";

import { cn, formatPrice } from "@/lib/utils";
import type { PaymentMethodId, PaymentMethodOption } from "@/lib/payment-methods";

const ICONS: Record<PaymentMethodId, typeof Smartphone> = {
  upi: Smartphone,
  card: CreditCard,
  netbanking: Landmark,
  wallet: Wallet,
  emi: Banknote,
  cod: Truck,
};

export function PaymentMethodPicker({
  options,
  selected,
  onSelect,
}: {
  options: PaymentMethodOption[];
  selected: PaymentMethodId;
  onSelect: (id: PaymentMethodId) => void;
}) {
  return (
    // radiogroup rather than a list of buttons: this is one choice among
    // several, and a screen reader should hear it as such — including how
    // many options there are and which are unavailable.
    <div role="radiogroup" aria-label="Payment method" className="space-y-2">
      {options.map((option) => {
        const Icon = ICONS[option.id];
        const active = option.id === selected;

        return (
          <button
            key={option.id}
            type="button"
            role="radio"
            aria-checked={active}
            aria-describedby={option.unavailableReason ? `${option.id}-reason` : undefined}
            disabled={!option.available}
            onClick={() => onSelect(option.id)}
            className={cn(
              "flex w-full items-center gap-3 rounded-md border p-3 text-left text-sm transition-colors",
              active && option.available
                ? "border-rose-600 bg-rose-50"
                : "border-neutral-300 hover:border-neutral-400",
              !option.available && "cursor-not-allowed opacity-55 hover:border-neutral-300"
            )}
          >
            <Icon
              className={cn("h-5 w-5 shrink-0", option.available ? "text-rose-600" : "text-neutral-400")}
            />
            <div className="min-w-0 flex-1">
              <p className="font-medium text-neutral-900">{option.label}</p>
              <p className="text-xs text-neutral-500">
                {option.available ? (
                  option.description
                ) : (
                  <span id={`${option.id}-reason`}>{option.unavailableReason}</span>
                )}
              </p>
            </div>
            {option.available && option.fee > 0 && (
              <span className="shrink-0 rounded-full bg-neutral-100 px-2 py-0.5 text-xs font-medium text-neutral-600">
                +{formatPrice(option.fee)}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
