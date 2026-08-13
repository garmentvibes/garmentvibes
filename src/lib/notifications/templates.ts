// Transactional message templates.
//
// No provider is connected yet — nothing actually sends. What this module
// pins down is the part that outlives any provider choice: which events
// notify a customer, on which channels, and exactly what each message says.
// Swapping in SendGrid/Twilio/Gupshup later means writing a `send()` in
// outbox.ts; these templates do not change.
//
// Channel notes for India:
//   - SMS bodies must stay short and, on a DLT-registered sender, match an
//     approved template. Keep them terse and variable-light.
//   - WhatsApp business-initiated messages must use a template approved by
//     Meta. Same constraint: fixed wording, few variables.
// Email is the only channel where free-form copy is safe, so it carries the
// detail and the other two carry the headline plus a link.

import { BUSINESS_INFO } from "@/lib/business-info";
import type {
  NotificationChannel,
  NotificationTemplateId,
} from "@/types/notifications";

export interface TemplateVars {
  name: string;
  orderId?: string;
  amount?: string;
  trackingUrl?: string;
  businessName?: string;
  reason?: string;
  refundWindow?: string;
}

interface TemplateDefinition {
  label: string;
  /** Channels this event fires on. Order matters only for display. */
  channels: NotificationChannel[];
  subject: (v: TemplateVars) => string;
  /** Long-form copy, used for email. */
  email: (v: TemplateVars) => string;
  /** Short copy, used for SMS and WhatsApp. */
  short: (v: TemplateVars) => string;
}

const SIGNOFF = `— Team GarmentVibes\n${BUSINESS_INFO.supportEmail} · ${BUSINESS_INFO.supportPhone}`;

export const NOTIFICATION_TEMPLATES: Record<NotificationTemplateId, TemplateDefinition> = {
  order_placed: {
    label: "Order placed",
    channels: ["email", "sms", "whatsapp"],
    subject: (v) => `Order ${v.orderId} confirmed`,
    email: (v) =>
      `Hi ${v.name},\n\nThanks for shopping with GarmentVibes. We've received your order ${v.orderId} for ${v.amount}.\n\nWe'll email you again as soon as it ships. You can track it any time under My Orders.\n\n${SIGNOFF}`,
    short: (v) => `GarmentVibes: Order ${v.orderId} confirmed (${v.amount}). Track it under My Orders.`,
  },

  order_shipped: {
    label: "Order shipped",
    channels: ["email", "sms", "whatsapp"],
    subject: (v) => `Order ${v.orderId} is on its way`,
    email: (v) =>
      `Hi ${v.name},\n\nYour order ${v.orderId} has shipped and is on its way.\n\nTrack it here: ${v.trackingUrl ?? "My Orders in your account"}\n\n${SIGNOFF}`,
    short: (v) => `GarmentVibes: Order ${v.orderId} has shipped. Track it under My Orders.`,
  },

  order_delivered: {
    label: "Order delivered",
    channels: ["email", "whatsapp"],
    subject: (v) => `Order ${v.orderId} delivered`,
    email: (v) =>
      `Hi ${v.name},\n\nYour order ${v.orderId} has been delivered. We hope you love it.\n\nIf something isn't right, you can raise a return within 7 days of delivery from My Orders.\n\n${SIGNOFF}`,
    short: (v) => `GarmentVibes: Order ${v.orderId} delivered. Returns are open for 7 days.`,
  },

  order_cancelled: {
    label: "Order cancelled",
    channels: ["email", "sms"],
    subject: (v) => `Order ${v.orderId} cancelled`,
    email: (v) =>
      `Hi ${v.name},\n\nYour order ${v.orderId} has been cancelled${v.reason ? ` (${v.reason})` : ""}.\n\nIf you paid online, the refund is being processed and will reach your original payment method within ${v.refundWindow ?? "5-7 business days"}. Cash on Delivery orders have nothing to refund.\n\n${SIGNOFF}`,
    short: (v) => `GarmentVibes: Order ${v.orderId} cancelled. Any online payment will be refunded.`,
  },

  return_requested: {
    label: "Return requested",
    channels: ["email", "sms"],
    subject: (v) => `Return request received for order ${v.orderId}`,
    email: (v) =>
      `Hi ${v.name},\n\nWe've received your return request for order ${v.orderId}${v.reason ? ` (${v.reason})` : ""}.\n\nOur team will review it within 2 business days. If it's approved we'll arrange a pickup at no cost to you, and the refund follows once the item reaches us.\n\n${SIGNOFF}`,
    short: (v) => `GarmentVibes: Return request received for order ${v.orderId}. We'll review it within 2 business days.`,
  },

  return_approved: {
    label: "Return approved",
    channels: ["email", "sms", "whatsapp"],
    subject: (v) => `Return approved for order ${v.orderId}`,
    email: (v) =>
      `Hi ${v.name},\n\nYour return for order ${v.orderId} has been approved. We'll arrange a pickup from your delivery address — please keep the item unused, with its original tags and packaging.\n\nOnce it reaches us and passes a quick check, we'll refund ${v.amount ?? "the item value"} to your original payment method within ${v.refundWindow ?? "5-7 business days"}.\n\n${SIGNOFF}`,
    short: (v) => `GarmentVibes: Return approved for order ${v.orderId}. We'll arrange a pickup shortly.`,
  },

  return_rejected: {
    label: "Return rejected",
    channels: ["email"],
    subject: (v) => `About your return request for order ${v.orderId}`,
    email: (v) =>
      `Hi ${v.name},\n\nWe've reviewed your return request for order ${v.orderId} and aren't able to approve it${v.reason ? ` — ${v.reason}` : ""}.\n\nIf you think this is a mistake, reply to this email and we'll take another look. You can also raise the matter with our Grievance Officer, whose details are on the website.\n\n${SIGNOFF}`,
    short: (v) => `GarmentVibes: We couldn't approve the return for order ${v.orderId}. Check your email for details.`,
  },

  refund_initiated: {
    label: "Refund initiated",
    channels: ["email", "sms"],
    subject: (v) => `Refund initiated for order ${v.orderId}`,
    email: (v) =>
      `Hi ${v.name},\n\nWe've initiated a refund of ${v.amount} for order ${v.orderId}.\n\nIt should reach your original payment method within ${v.refundWindow ?? "5-7 business days"}. Timing after that point is with your bank.\n\n${SIGNOFF}`,
    short: (v) => `GarmentVibes: Refund of ${v.amount} initiated for order ${v.orderId}.`,
  },

  wholesale_account_approved: {
    label: "Wholesale account approved",
    channels: ["email", "whatsapp"],
    subject: () => `Your GarmentVibes wholesale account is approved`,
    email: (v) =>
      `Hi ${v.name},\n\nGood news — the wholesale account for ${v.businessName ?? "your business"} has been verified and approved.\n\nYou can now place bulk orders directly at tier pricing, without waiting for a quote. Sign in to get started.\n\nFor sourcing questions, reach us at ${BUSINESS_INFO.wholesaleEmail}.\n\n${SIGNOFF}`,
    short: () => `GarmentVibes: Your wholesale account is approved. You can now order directly at tier pricing.`,
  },

  wholesale_account_rejected: {
    label: "Wholesale account rejected",
    channels: ["email"],
    subject: () => `About your GarmentVibes wholesale application`,
    email: (v) =>
      `Hi ${v.name},\n\nThanks for applying for a wholesale account for ${v.businessName ?? "your business"}. We aren't able to approve it at this time${v.reason ? ` — ${v.reason}` : ""}.\n\nIf you think this is a mistake or you can share additional business documents, reply to this email and we'll take another look.\n\n${SIGNOFF}`,
    short: () => `GarmentVibes: We couldn't approve your wholesale application. Check your email for details.`,
  },

  quote_ready: {
    label: "Quote ready",
    channels: ["email", "whatsapp"],
    subject: (v) => `Your quote ${v.orderId} is ready`,
    email: (v) =>
      `Hi ${v.name},\n\nYour quote ${v.orderId} is ready, totalling ${v.amount}.\n\nSign in to review the per-unit pricing and confirm the order. Quotes are held for 14 days.\n\n${SIGNOFF}`,
    short: (v) => `GarmentVibes: Quote ${v.orderId} is ready (${v.amount}). Valid for 14 days.`,
  },

  credit_terms_approved: {
    label: "Credit terms approved",
    channels: ["email"],
    subject: () => `Net-30 credit terms approved`,
    email: (v) =>
      `Hi ${v.name},\n\nNet-30 credit terms have been approved for ${v.businessName ?? "your business"}.\n\nFuture bulk orders can be placed on credit, with payment due 30 days from invoice date.\n\n${SIGNOFF}`,
    short: () => `GarmentVibes: Net-30 credit terms approved for your account.`,
  },
};

/** Renders one channel's copy. Subject is email-only and blank elsewhere. */
export function renderTemplate(
  templateId: NotificationTemplateId,
  channel: NotificationChannel,
  vars: TemplateVars
) {
  const template = NOTIFICATION_TEMPLATES[templateId];
  return {
    subject: channel === "email" ? template.subject(vars) : "",
    body: channel === "email" ? template.email(vars) : template.short(vars),
  };
}
