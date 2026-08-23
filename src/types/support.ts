export type SupportStatus = "open" | "awaiting_customer" | "resolved";

export type SupportCategory =
  | "order"
  | "delivery"
  | "return"
  | "payment"
  | "product"
  | "other";

export const SUPPORT_CATEGORY_LABELS: Record<SupportCategory, string> = {
  order: "Something about my order",
  delivery: "Delivery or tracking",
  return: "Return, exchange or refund",
  payment: "Payment or invoice",
  product: "Product question",
  other: "Something else",
};

export interface SupportMessage {
  id: string;
  /** Who wrote it. Staff replies are badged; customer messages are not. */
  from: "customer" | "staff";
  body: string;
  createdAt: string; // ISO
}

export interface SupportTicket {
  id: string;
  /** The SUP… code the customer quotes at us. */
  reference: string;
  customerName: string;
  customerEmail: string;
  subject: string;
  category: SupportCategory;
  /**
   * The order this is about, when there is one.
   *
   * This is the whole point of the feature: a ticket that arrives already
   * attached to an order saves the round trip where staff ask "which order?"
   * and wait a day for the answer.
   */
  orderId?: string;
  status: SupportStatus;
  messages: SupportMessage[];
  createdAt: string; // ISO
  updatedAt: string; // ISO
}
