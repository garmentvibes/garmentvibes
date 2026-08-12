import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface ShipToAddress {
  id: string;
  label: string; // "Main Warehouse", "Retail Store - Andheri", ...
  contactName: string;
  phone: string;
  addressLine1: string;
  city: string;
  state: string;
  pincode: string;
  isDefault: boolean;
}

interface ShipToState {
  addresses: ShipToAddress[];
  addAddress: (address: Omit<ShipToAddress, "id" | "isDefault">) => void;
  removeAddress: (id: string) => void;
  setDefault: (id: string) => void;
}

export const useShipToStore = create<ShipToState>()(
  persist(
    (set, get) => ({
      addresses: [],
      addAddress: (address) => {
        const { addresses } = get();
        set({
          addresses: [
            ...addresses,
            { ...address, id: crypto.randomUUID(), isDefault: addresses.length === 0 },
          ],
        });
      },
      removeAddress: (id) => set({ addresses: get().addresses.filter((a) => a.id !== id) }),
      setDefault: (id) =>
        set({ addresses: get().addresses.map((a) => ({ ...a, isDefault: a.id === id })) }),
    }),
    { name: "garmentvibes-wholesale-ship-to", skipHydration: true }
  )
);
