import { renderTemplate } from "@/lib/notifications/templates";
import type { NotificationMessage } from "@/types/notifications";

// Seed outbox entries so the admin view has history to show on a fresh
// browser, in the same spirit as SEED_RETAIL_ORDERS. Bodies are rendered
// through the real templates rather than hand-written, so this data can
// never drift from the copy the app would actually send.

interface SeedSpec {
  id: string;
  templateId: Parameters<typeof renderTemplate>[0];
  channel: Parameters<typeof renderTemplate>[1];
  recipient: string;
  recipientName: string;
  createdAt: string;
  status: NotificationMessage["status"];
  sentAt?: string;
  failureReason?: string;
  relatedTo?: string;
  vars: Parameters<typeof renderTemplate>[2];
}

const SEEDS: SeedSpec[] = [
  {
    id: "msg_seed_1",
    templateId: "order_placed",
    channel: "email",
    recipient: "priya.sharma@example.com",
    recipientName: "Priya Sharma",
    createdAt: "2026-08-12T09:14:00.000Z",
    sentAt: "2026-08-12T09:14:03.000Z",
    status: "sent",
    relatedTo: "GV84213567",
    vars: { name: "Priya Sharma", orderId: "GV84213567", amount: "₹2,497" },
  },
  {
    id: "msg_seed_2",
    templateId: "order_placed",
    channel: "sms",
    recipient: "+91 98765 43210",
    recipientName: "Priya Sharma",
    createdAt: "2026-08-12T09:14:00.000Z",
    sentAt: "2026-08-12T09:14:05.000Z",
    status: "sent",
    relatedTo: "GV84213567",
    vars: { name: "Priya Sharma", orderId: "GV84213567", amount: "₹2,497" },
  },
  {
    id: "msg_seed_3",
    templateId: "order_shipped",
    channel: "whatsapp",
    recipient: "+91 91234 56780",
    recipientName: "Rahul Verma",
    createdAt: "2026-08-12T11:02:00.000Z",
    status: "queued",
    relatedTo: "GV84213102",
    vars: { name: "Rahul Verma", orderId: "GV84213102" },
  },
  {
    id: "msg_seed_4",
    templateId: "wholesale_account_approved",
    channel: "email",
    recipient: "orders@urbanthreads.in",
    recipientName: "Meera Nair",
    createdAt: "2026-08-11T15:40:00.000Z",
    sentAt: "2026-08-11T15:40:02.000Z",
    status: "sent",
    relatedTo: "wa2",
    vars: { name: "Meera Nair", businessName: "Urban Threads Retail" },
  },
  {
    id: "msg_seed_5",
    templateId: "order_cancelled",
    channel: "sms",
    recipient: "+91 90000 11111",
    recipientName: "Arjun Patel",
    createdAt: "2026-08-10T08:20:00.000Z",
    status: "failed",
    failureReason: "Invalid recipient number (DLT rejection)",
    relatedTo: "GV84212004",
    vars: { name: "Arjun Patel", orderId: "GV84212004" },
  },
];

export const SEED_NOTIFICATIONS: NotificationMessage[] = SEEDS.map((seed) => {
  const { subject, body } = renderTemplate(seed.templateId, seed.channel, seed.vars);
  return {
    id: seed.id,
    templateId: seed.templateId,
    channel: seed.channel,
    recipient: seed.recipient,
    recipientName: seed.recipientName,
    subject,
    body,
    status: seed.status,
    createdAt: seed.createdAt,
    sentAt: seed.sentAt,
    failureReason: seed.failureReason,
    relatedTo: seed.relatedTo,
  };
});
