import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface Address {
  id: string;
  label: string; // "Home", "Office", ...
  fullName: string;
  phone: string;
  addressLine1: string;
  city: string;
  state: string;
  pincode: string;
  isDefault: boolean;
}

interface AddressState {
  addresses: Address[];
  addAddress: (address: Omit<Address, "id">) => void;
  removeAddress: (id: string) => void;
  setDefault: (id: string) => void;
}

export const useAddressStore = create<AddressState>()(
  persist(
    (set, get) => ({
      addresses: [],
      addAddress: (address) => {
        const { addresses } = get();
        const id = crypto.randomUUID();
        const isFirst = addresses.length === 0;
        set({
          addresses: [...addresses, { ...address, id, isDefault: isFirst || address.isDefault }],
        });
      },
      removeAddress: (id) => set({ addresses: get().addresses.filter((a) => a.id !== id) }),
      setDefault: (id) =>
        set({
          addresses: get().addresses.map((a) => ({ ...a, isDefault: a.id === id })),
        }),
    }),
    { name: "garmentvibes-retail-addresses", skipHydration: true }
  )
);
