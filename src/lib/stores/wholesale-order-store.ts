import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Currency } from "@/types/catalog";

export interface WholesaleOrderLine {
  productId: string;
  sku: string;
  slug: string;
  name: string;
  image: string;
  pricePerUnit: number; // minor units, at the current qty's tier
  currency: Currency;
  qty: number;
  packSize: number;
  moq: number;
}

interface WholesaleOrderState {
  lines: WholesaleOrderLine[];
  upsertLine: (line: WholesaleOrderLine) => void;
  removeLine: (productId: string) => void;
  clear: () => void;
}

export const useWholesaleOrderStore = create<WholesaleOrderState>()(
  persist(
    (set, get) => ({
      lines: [],
      upsertLine: (line) => {
        const existing = get().lines.find((l) => l.productId === line.productId);
        if (existing) {
          set({
            lines: get().lines.map((l) => (l.productId === line.productId ? line : l)),
          });
        } else {
          set({ lines: [...get().lines, line] });
        }
      },
      removeLine: (productId) =>
        set({ lines: get().lines.filter((l) => l.productId !== productId) }),
      clear: () => set({ lines: [] }),
    }),
    { name: "garmentvibes-wholesale-order" }
  )
);

export function wholesaleOrderTotals(lines: WholesaleOrderLine[]) {
  const totalUnits = lines.reduce((sum, l) => sum + l.qty, 0);
  const totalPrice = lines.reduce((sum, l) => sum + l.qty * l.pricePerUnit, 0);
  return { totalUnits, totalPrice };
}
