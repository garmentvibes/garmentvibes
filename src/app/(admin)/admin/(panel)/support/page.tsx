"use client";

import { useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { LifeBuoy, Clock, Package } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useHasMounted } from "@/lib/hooks/use-has-mounted";
import { useNow } from "@/lib/hooks/use-now";
import { useSupportStore } from "@/lib/stores/support-store";
import { notify } from "@/lib/stores/notification-store";
import {
  MAX_MESSAGE_LENGTH,
  RESPONSE_TARGET_HOURS,
  hoursWaiting,
  isOverdue,
  supportQueue,
  validateMessage,
} from "@/lib/support";
import { SUPPORT_CATEGORY_LABELS } from "@/types/support";

export default function AdminSupportPage() {
  const mounted = useHasMounted();
  const now = useNow();
  const tickets = useSupportStore((s) => s.tickets);
  const reply = useSupportStore((s) => s.reply);
  const resolve = useSupportStore((s) => s.resolve);

  const [drafts, setDrafts] = useState<Record<string, string>>({});

  if (!mounted || now === null) return null;

  const queue = supportQueue(tickets);
  const waiting = tickets.filter((t) => t.status === "awaiting_customer");
  const overdue = queue.filter((t) => isOverdue(t, now));

  function send(ticketId: string) {
    const draft = drafts[ticketId] ?? "";
    const check = validateMessage(draft);
    if (!check.ok) {
      toast.error(check.error);
      return;
    }

    const ticket = tickets.find((t) => t.id === ticketId);
    reply(ticketId, "staff", draft);
    setDrafts((current) => ({ ...current, [ticketId]: "" }));

    if (ticket) {
      notify({
        templateId: "support_reply",
        recipientName: ticket.customerName,
        email: ticket.customerEmail,
        relatedTo: ticket.orderId ?? ticket.reference,
        vars: {
          name: ticket.customerName,
          reference: ticket.reference,
          subject: ticket.subject,
          answer: draft.trim(),
        },
      });
    }

    toast.success("Replied — the customer has been emailed");
  }

  return (
    <div className="max-w-3xl">
      <h1 className="flex items-center gap-2 text-xl font-bold text-neutral-900">
        <LifeBuoy className="h-5 w-5" /> Customer Support
      </h1>
      <p className="mt-1 text-sm text-neutral-500">
        Threads waiting on us, longest first. Target is a reply within{" "}
        {RESPONSE_TARGET_HOURS} hours — past that, an ordinary question starts turning into a
        grievance.
      </p>

      <div className="mt-4 flex gap-6 text-sm">
        <div>
          <p className="text-xs text-neutral-500">Waiting on us</p>
          <p className="font-semibold text-neutral-900">{queue.length}</p>
        </div>
        <div>
          <p className="text-xs text-neutral-500">Overdue</p>
          <p className={cn("font-semibold", overdue.length > 0 ? "text-red-600" : "text-neutral-900")}>
            {overdue.length}
          </p>
        </div>
        <div>
          <p className="text-xs text-neutral-500">Waiting on customer</p>
          <p className="font-semibold text-neutral-900">{waiting.length}</p>
        </div>
      </div>

      {queue.length === 0 ? (
        <p className="mt-6 text-sm text-neutral-500">Nothing waiting on us.</p>
      ) : (
        <ul id="support-queue" className="mt-5 space-y-3">
          {queue.map((ticket) => {
            const hours = hoursWaiting(ticket, now);
            const late = isOverdue(ticket, now);
            return (
              <li
                key={ticket.id}
                className={cn(
                  "rounded-lg border bg-white p-4",
                  late ? "border-red-200" : "border-neutral-200"
                )}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-xs text-neutral-500">{ticket.reference}</span>
                  <span className="text-sm font-medium text-neutral-900">{ticket.subject}</span>
                  <Badge variant="outline">{SUPPORT_CATEGORY_LABELS[ticket.category]}</Badge>
                  {late && (
                    <Badge variant="destructive">
                      <Clock className="mr-1 h-3 w-3" /> {hours}h
                    </Badge>
                  )}
                </div>

                <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-neutral-500">
                  {ticket.customerName} · {ticket.customerEmail}
                  {ticket.orderId && (
                    <Link
                      href={`/admin/orders/${ticket.orderId}`}
                      className="inline-flex items-center gap-1 font-mono text-rose-600 underline"
                    >
                      <Package className="h-3 w-3" /> {ticket.orderId}
                    </Link>
                  )}
                </p>

                <ul className="mt-3 space-y-2">
                  {ticket.messages.map((message) => (
                    <li
                      key={message.id}
                      className={cn(
                        "rounded-md p-2.5 text-sm",
                        message.from === "staff"
                          ? "border-l-2 border-emerald-200 bg-emerald-50/60"
                          : "bg-neutral-50"
                      )}
                    >
                      <p className="text-xs font-medium text-neutral-500">
                        {message.from === "staff" ? "Us" : ticket.customerName} ·{" "}
                        {message.createdAt.slice(0, 10)}
                      </p>
                      <p className="mt-0.5 whitespace-pre-line text-neutral-700">{message.body}</p>
                    </li>
                  ))}
                </ul>

                <textarea
                  aria-label={`Reply to ${ticket.reference}`}
                  rows={3}
                  maxLength={MAX_MESSAGE_LENGTH}
                  value={drafts[ticket.id] ?? ""}
                  onChange={(e) =>
                    setDrafts((current) => ({ ...current, [ticket.id]: e.target.value }))
                  }
                  placeholder="Answer the question that was actually asked, and say what happens next."
                  className="mt-3 w-full rounded-md border border-neutral-300 px-3 py-2 text-sm focus:border-neutral-500 focus:outline-none"
                />

                <div className="mt-2 flex gap-2">
                  <Button size="sm" onClick={() => send(ticket.id)}>
                    Reply
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      resolve(ticket.id);
                      toast.success("Marked resolved — a customer reply reopens it");
                    }}
                  >
                    Mark resolved
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
