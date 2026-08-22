import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Currency } from "@/types/catalog";

export interface CartLine {
  key: string; // productId + size + color, unique per line
  productId: string;
  slug: string;
  name: string;
  image: string;
  price: number; // minor units
  currency: Currency;
  size: string;
  color: string;
  qty: number;
}

interface CartState {
  lines: CartLine[];
  /**
   * When the cart last changed, epoch ms. Drives abandoned-cart recovery —
   * see src/lib/abandoned-cart.ts.
   *
   * Optional because carts persisted before this existed do not carry it.
   * The recovery rules treat a missing value as "no age to judge" rather
   * than as ancient, so shipping this does not prompt every returning
   * customer at once.
   */
  updatedAt?: number;
  /** Reminders already sent for the current cart contents. */
  remindersSent: number;
  lastReminderAt?: number;
  /** Set when the recovery prompt has been shown and dismissed. */
  promptDismissedAt?: number;

  addLine: (line: Omit<CartLine, "key">) => void;
  removeLine: (key: string) => void;
  setQty: (key: string, qty: number) => void;
  clear: () => void;
  recordReminder: (at?: number) => void;
  dismissPrompt: (at?: number) => void;
}

/**
 * Stamped on every mutation. A change to the cart restarts the abandonment
 * clock and cancels any reminders already sent, because the customer has
 * demonstrably come back — continuing the old sequence would message someone
 * about a bag they are actively editing.
 */
function touched(at: number = Date.now()) {
  return { updatedAt: at, remindersSent: 0, lastReminderAt: undefined, promptDismissedAt: undefined };
}

export const useCartStore = create<CartState>()(
  persist(
    (set, get) => ({
      lines: [],
      remindersSent: 0,
      addLine: (line) => {
        const key = `${line.productId}:${line.size}:${line.color}`;
        const existing = get().lines.find((l) => l.key === key);
        if (existing) {
          set({
            lines: get().lines.map((l) =>
              l.key === key ? { ...l, qty: l.qty + line.qty } : l
            ),
            ...touched(),
          });
        } else {
          set({ lines: [...get().lines, { ...line, key }], ...touched() });
        }
      },
      removeLine: (key) =>
        set({ lines: get().lines.filter((l) => l.key !== key), ...touched() }),
      setQty: (key, qty) =>
        set({
          lines: get().lines.map((l) => (l.key === key ? { ...l, qty: Math.max(1, qty) } : l)),
          ...touched(),
        }),
      // An emptied cart has nothing to recover, so the bookkeeping goes with
      // it rather than lingering to be applied to whatever is added next.
      clear: () => set({ lines: [], ...touched(), updatedAt: undefined }),

      recordReminder: (at = Date.now()) =>
        set({ remindersSent: get().remindersSent + 1, lastReminderAt: at }),

      dismissPrompt: (at = Date.now()) => set({ promptDismissedAt: at }),
    }),
    { name: "garmentvibes-retail-cart", skipHydration: true }
  )
);

export function cartTotals(lines: CartLine[]) {
  const totalItems = lines.reduce((sum, l) => sum + l.qty, 0);
  const totalPrice = lines.reduce((sum, l) => sum + l.qty * l.price, 0);
  return { totalItems, totalPrice };
}
