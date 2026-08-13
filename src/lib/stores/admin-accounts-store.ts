import { create } from "zustand";
import { persist } from "zustand/middleware";
import { SEED_WHOLESALE_ACCOUNTS } from "@/lib/mock/admin-data";
import type { PaymentTerms } from "@/lib/stores/session-store";
import type { WholesaleAccount } from "@/types/admin";

type AccountStatus = WholesaleAccount["status"];

interface AccountOverride {
  status?: AccountStatus;
  paymentTerms?: PaymentTerms;
}

interface AdminAccountsState {
  overrides: Record<string, AccountOverride>;
  setStatus: (id: string, status: AccountStatus) => void;
  setPaymentTerms: (id: string, terms: PaymentTerms) => void;
}

export const useAdminAccountsStore = create<AdminAccountsState>()(
  persist(
    (set) => ({
      overrides: {},
      setStatus: (id, status) =>
        set((s) => ({ overrides: { ...s.overrides, [id]: { ...s.overrides[id], status } } })),
      setPaymentTerms: (id, paymentTerms) =>
        set((s) => ({ overrides: { ...s.overrides, [id]: { ...s.overrides[id], paymentTerms } } })),
    }),
    { name: "garmentvibes-admin-accounts", skipHydration: true }
  )
);

export function useWholesaleAccounts(): WholesaleAccount[] {
  const overrides = useAdminAccountsStore((s) => s.overrides);
  return SEED_WHOLESALE_ACCOUNTS.map((a) => ({ ...a, ...overrides[a.id] }));
}
