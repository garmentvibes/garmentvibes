export type NotificationChannel = "email" | "sms" | "whatsapp";

export const NOTIFICATION_CHANNELS: NotificationChannel[] = ["email", "sms", "whatsapp"];

export const CHANNEL_LABELS: Record<NotificationChannel, string> = {
  email: "Email",
  sms: "SMS",
  whatsapp: "WhatsApp",
};

/**
 * Every transactional message the platform can send.
 *
 * Adding a value here forces a matching entry in NOTIFICATION_TEMPLATES —
 * TypeScript will not compile a template registry with a missing key, so a
 * new event can never silently send nothing.
 */
export type NotificationTemplateId =
  | "order_placed"
  | "order_shipped"
  | "order_delivered"
  | "order_cancelled"
  | "return_requested"
  | "return_approved"
  | "return_rejected"
  | "refund_initiated"
  | "wholesale_account_approved"
  | "wholesale_account_rejected"
  | "quote_ready"
  | "credit_terms_approved";

export type NotificationStatus = "queued" | "sent" | "failed";

export interface NotificationMessage {
  id: string;
  templateId: NotificationTemplateId;
  channel: NotificationChannel;
  /** Email address or E.164 phone number, depending on channel. */
  recipient: string;
  recipientName: string;
  subject: string; // email only; empty for SMS/WhatsApp
  body: string;
  status: NotificationStatus;
  createdAt: string; // ISO
  sentAt?: string; // ISO
  failureReason?: string;
  /** Order/quote/account id this message refers to, for cross-linking. */
  relatedTo?: string;
}
