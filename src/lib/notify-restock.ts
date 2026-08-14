import { useStockAlertsStore } from "@/lib/stores/stock-alerts-store";
import { notify } from "@/lib/stores/notification-store";

/**
 * Fires back-in-stock messages for everyone waiting on a variant.
 *
 * Called from wherever stock goes up — an admin edit or a restockable return
 * completing — rather than by polling, so the notification is a consequence
 * of the stock movement itself and cannot drift out of step with it.
 *
 * Registrations are claimed (removed) as they fire, so a second restock of
 * the same variant doesn't message the same person again.
 */
export function notifyRestocked(productId: string, size: string, productName: string) {
  const waiting = useStockAlertsStore.getState().claimForVariant(productId, size);

  for (const alert of waiting) {
    notify({
      templateId: "back_in_stock",
      recipientName: alert.name,
      email: alert.email,
      relatedTo: productId,
      vars: { name: alert.name, productName, replacementSize: size },
    });
  }

  return waiting.length;
}
