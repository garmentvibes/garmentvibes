import { create } from "zustand";
import { persist } from "zustand/middleware";
import { renderTemplate, type TemplateVars } from "@/lib/notifications/templates";
import { NOTIFICATION_TEMPLATES } from "@/lib/notifications/templates";
import { SEED_NOTIFICATIONS } from "@/lib/mock/notification-data";
import type {
  NotificationChannel,
  NotificationMessage,
  NotificationTemplateId,
} from "@/types/notifications";

// The outbox: every transactional message the platform decided to send.
//
// Nothing is delivered yet — no provider is connected. Messages are queued
// here and staff can read exactly what a customer would have received, which
// is what makes the copy reviewable before we ever pay for a send. When a
// provider is wired up, `markSent`/`markFailed` become the webhook handlers
// and the rest of the app is untouched.

const MAX_MESSAGES = 200;

export interface EnqueueInput {
  templateId: NotificationTemplateId;
  recipientName: string;
  /** Email address — required, since email is the fallback channel. */
  email: string;
  /** E.164 phone. Omit and SMS/WhatsApp copies are skipped. */
  phone?: string;
  vars: TemplateVars;
  relatedTo?: string;
  /** Restrict to a subset of the template's channels. */
  channels?: NotificationChannel[];
}

interface NotificationState {
  messages: NotificationMessage[];
  /** Expands one event into one message per channel. Returns them. */
  enqueue: (input: EnqueueInput) => NotificationMessage[];
  markSent: (id: string) => void;
  markFailed: (id: string, reason: string) => void;
  clear: () => void;
}

let counter = 0;
function nextId() {
  counter += 1;
  return `msg_${Date.now().toString(36)}_${counter}`;
}

export const useNotificationStore = create<NotificationState>()(
  persist(
    (set) => ({
      messages: SEED_NOTIFICATIONS,

      enqueue: (input) => {
        const template = NOTIFICATION_TEMPLATES[input.templateId];
        const channels = (input.channels ?? template.channels).filter(
          // A phone-only channel with no phone number on file would queue a
          // message that can never be delivered.
          (c) => c === "email" || Boolean(input.phone)
        );

        const created = channels.map<NotificationMessage>((channel) => {
          const { subject, body } = renderTemplate(input.templateId, channel, input.vars);
          return {
            id: nextId(),
            templateId: input.templateId,
            channel,
            recipient: channel === "email" ? input.email : (input.phone as string),
            recipientName: input.recipientName,
            subject,
            body,
            status: "queued",
            createdAt: new Date().toISOString(),
            relatedTo: input.relatedTo,
          };
        });

        set((s) => ({ messages: [...created, ...s.messages].slice(0, MAX_MESSAGES) }));
        return created;
      },

      markSent: (id) =>
        set((s) => ({
          messages: s.messages.map((m) =>
            m.id === id
              ? { ...m, status: "sent", sentAt: new Date().toISOString(), failureReason: undefined }
              : m
          ),
        })),

      markFailed: (id, reason) =>
        set((s) => ({
          messages: s.messages.map((m) =>
            m.id === id ? { ...m, status: "failed", failureReason: reason } : m
          ),
        })),

      clear: () => set({ messages: [] }),
    }),
    { name: "garmentvibes-notifications", skipHydration: true }
  )
);

/**
 * Queue a notification from outside React (event handlers, stores).
 *
 * Calling the store imperatively rather than through a hook keeps call sites
 * — checkout submit, admin status change — free of extra subscriptions.
 */
export function notify(input: EnqueueInput) {
  return useNotificationStore.getState().enqueue(input);
}
