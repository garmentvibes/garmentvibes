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
  addLine: (line: Omit<CartLine, "key">) => void;
  removeLine: (key: string) => void;
  setQty: (key: string, qty: number) => void;
  clear: () => void;
}

export const useCartStore = create<CartState>()(
  persist(
    (set, get) => ({
      lines: [],
      addLine: (line) => {
        const key = `${line.productId}:${line.size}:${line.color}`;
        const existing = get().lines.find((l) => l.key === key);
        if (existing) {
          set({
            lines: get().lines.map((l) =>
              l.key === key ? { ...l, qty: l.qty + line.qty } : l
            ),
          });
        } else {
          set({ lines: [...get().lines, { ...line, key }] });
        }
      },
      removeLine: (key) => set({ lines: get().lines.filter((l) => l.key !== key) }),
      setQty: (key, qty) =>
        set({
          lines: get().lines.map((l) => (l.key === key ? { ...l, qty: Math.max(1, qty) } : l)),
        }),
      clear: () => set({ lines: [] }),
    }),
    { name: "garmentvibes-retail-cart", skipHydration: true }
  )
);

export function cartTotals(lines: CartLine[]) {
  const totalItems = lines.reduce((sum, l) => sum + l.qty, 0);
  const totalPrice = lines.reduce((sum, l) => sum + l.qty * l.price, 0);
  return { totalItems, totalPrice };
}
