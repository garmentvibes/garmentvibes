import { create } from "zustand";
import { persist } from "zustand/middleware";

// "Tell me when this is back" registrations.
//
// Keyed by product + size, because stock is per-variant: someone waiting on
// a Medium should not be pinged when a Small is restocked. Registrations are
// consumed when fired, so a customer is told once rather than on every
// subsequent stock movement.

export interface StockAlert {
  productId: string;
  size: string;
  email: string;
  name: string;
  createdAt: string;
}

function alertKey(productId: string, size: string, email: string) {
  return `${productId}:${size}:${email.toLowerCase()}`;
}

interface StockAlertsState {
  alerts: StockAlert[];
  subscribe: (alert: Omit<StockAlert, "createdAt">) => boolean;
  /** Removes and returns everyone waiting on a variant. */
  claimForVariant: (productId: string, size: string) => StockAlert[];
  isSubscribed: (productId: string, size: string, email: string) => boolean;
}

export const useStockAlertsStore = create<StockAlertsState>()(
  persist(
    (set, get) => ({
      alerts: [],

      subscribe: (alert) => {
        const key = alertKey(alert.productId, alert.size, alert.email);
        const exists = get().alerts.some(
          (a) => alertKey(a.productId, a.size, a.email) === key
        );
        // Signing up twice must not queue two emails later.
        if (exists) return false;
        set((s) => ({
          alerts: [...s.alerts, { ...alert, createdAt: new Date().toISOString() }],
        }));
        return true;
      },

      claimForVariant: (productId, size) => {
        const matching = get().alerts.filter(
          (a) => a.productId === productId && a.size === size
        );
        if (matching.length > 0) {
          set((s) => ({
            alerts: s.alerts.filter((a) => !(a.productId === productId && a.size === size)),
          }));
        }
        return matching;
      },

      isSubscribed: (productId, size, email) =>
        get().alerts.some(
          (a) => alertKey(a.productId, a.size, a.email) === alertKey(productId, size, email)
        ),
    }),
    { name: "garmentvibes-stock-alerts", skipHydration: true }
  )
);
