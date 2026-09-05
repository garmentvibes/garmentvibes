"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { LifeBuoy, Package, MessageSquare } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useHasMounted } from "@/lib/hooks/use-has-mounted";
import { useSessionStore } from "@/lib/stores/session-store";
import { useSupportStore } from "@/lib/stores/support-store";
import {
  MAX_MESSAGE_LENGTH,
  ticketsFor,
  validateMessage,
  validateSubject,
} from "@/lib/support";
import {
  SUPPORT_CATEGORY_LABELS,
  type SupportCategory,
  type SupportStatus,
} from "@/types/support";

const STATUS_LABELS: Record<SupportStatus, string> = {
  open: "With our team",
  awaiting_customer: "Waiting on you",
  resolved: "Resolved",
};

function SupportInner() {
  const mounted = useHasMounted();
  const params = useSearchParams();
  const user = useSessionStore((s) => s.user);
  const tickets = useSupportStore((s) => s.tickets);
  const openTicket = useSupportStore((s) => s.open);
  const reply = useSupportStore((s) => s.reply);

  // Arriving from an order page carries the order with it, which is the whole
  // point: staff should never have to ask "which order?".
  const orderId = params.get("order") ?? undefined;

  const [subject, setSubject] = useState("");
  const [category, setCategory] = useState<SupportCategory>(orderId ? "order" : "other");
  const [body, setBody] = useState("");
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [replyBody, setReplyBody] = useState("");

  if (!mounted) return null;

  if (!user || user.role !== "retail") {
    return (
      <div className="mx-auto max-w-sm px-4 py-20 text-center sm:px-6">
        <h1 className="text-xl font-bold text-neutral-900">Sign in to get help</h1>
        <p className="mt-2 text-sm text-neutral-500">
          Support conversations are tied to your account so we can see your orders alongside them.
        </p>
        <Link href="/shop/login?redirect=/shop/support">
          <Button variant="retail" className="mt-6 w-full">
            Sign In
          </Button>
        </Link>
        <p className="mt-4 text-xs text-neutral-500">
          Not a customer yet? Reach us from the{" "}
          <Link href="/shop/contact" className="underline">
            contact page
          </Link>
          .
        </p>
      </div>
    );
  }

  const mine = ticketsFor(tickets, user.email);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;

    const subjectCheck = validateSubject(subject);
    if (!subjectCheck.ok) {
      toast.error(subjectCheck.error);
      return;
    }
    const bodyCheck = validateMessage(body);
    if (!bodyCheck.ok) {
      toast.error(bodyCheck.error);
      return;
    }

    const ticket = openTicket({
      customerName: user.name,
      customerEmail: user.email,
      subject,
      category,
      body,
      orderId,
    });

    toast.success(`Raised ${ticket.reference} — we'll reply within a day`);
    setSubject("");
    setBody("");
  }

  function sendReply(ticketId: string) {
    const check = validateMessage(replyBody);
    if (!check.ok) {
      toast.error(check.error);
      return;
    }
    reply(ticketId, "customer", replyBody);
    setReplyBody("");
    setReplyTo(null);
    toast.success("Sent — back with our team");
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <h1 className="flex items-center gap-2 text-2xl font-bold text-neutral-900">
        <LifeBuoy className="h-6 w-6 text-rose-600" /> Help &amp; Support
      </h1>

      <form onSubmit={submit} className="mt-6 space-y-3 rounded-lg border border-neutral-200 bg-white p-5">
        <h2 className="font-semibold text-neutral-900">Raise a request</h2>

        {orderId && (
          <p className="flex items-center gap-1.5 rounded-md bg-rose-50 px-3 py-2 text-xs text-rose-800">
            <Package className="h-3.5 w-3.5" /> About order{" "}
            <span className="font-mono font-semibold">{orderId}</span>
          </p>
        )}

        <div>
          <Label htmlFor="support-category">What is it about?</Label>
          <select
            id="support-category"
            value={category}
            onChange={(e) => setCategory(e.target.value as SupportCategory)}
            className="mt-1 w-full rounded-md border border-neutral-300 px-3 py-2 text-sm focus:border-rose-400 focus:outline-none"
          >
            {Object.entries(SUPPORT_CATEGORY_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <Label htmlFor="support-subject">Subject</Label>
          <Input
            id="support-subject"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="Sum it up in a few words"
            className="mt-1"
          />
        </div>

        <div>
          <Label htmlFor="support-body">Your message</Label>
          <textarea
            id="support-body"
            rows={4}
            maxLength={MAX_MESSAGE_LENGTH}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            className="mt-1 w-full rounded-md border border-neutral-300 px-3 py-2 text-sm focus:border-rose-400 focus:outline-none"
          />
        </div>

        <Button type="submit" variant="retail" size="sm">
          Send request
        </Button>
      </form>

      <h2 className="mt-8 font-semibold text-neutral-900">Your requests</h2>

      {mine.length === 0 ? (
        <p className="mt-2 text-sm text-neutral-500">Nothing open. That is usually a good sign.</p>
      ) : (
        <ul id="support-tickets" className="mt-3 space-y-3">
          {mine.map((ticket) => (
            <li key={ticket.id} className="rounded-lg border border-neutral-200 bg-white p-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-xs text-neutral-500">{ticket.reference}</span>
                <span className="text-sm font-medium text-neutral-900">{ticket.subject}</span>
                <Badge
                  variant={
                    ticket.status === "resolved"
                      ? "success"
                      : ticket.status === "open"
                        ? "outline"
                        : "warning"
                  }
                >
                  {STATUS_LABELS[ticket.status]}
                </Badge>
                {ticket.orderId && (
                  <Link
                    href={`/shop/orders/${ticket.orderId}`}
                    className="font-mono text-xs text-rose-700 underline"
                  >
                    {ticket.orderId}
                  </Link>
                )}
              </div>

              <ul className="mt-3 space-y-2">
                {ticket.messages.map((message) => (
                  <li
                    key={message.id}
                    className={cn(
                      "rounded-md p-2.5 text-sm",
                      message.from === "staff"
                        ? "border-l-2 border-rose-200 bg-rose-50/60 text-neutral-700"
                        : "bg-neutral-50 text-neutral-700"
                    )}
                  >
                    <p className="text-xs font-medium text-neutral-500">
                      {message.from === "staff" ? "GarmentVibes" : "You"} ·{" "}
                      {message.createdAt.slice(0, 10)}
                    </p>
                    <p className="mt-0.5 whitespace-pre-line">{message.body}</p>
                  </li>
                ))}
              </ul>

              {replyTo === ticket.id ? (
                <div className="mt-3 space-y-2">
                  <textarea
                    aria-label={`Reply to ${ticket.reference}`}
                    rows={3}
                    maxLength={MAX_MESSAGE_LENGTH}
                    value={replyBody}
                    onChange={(e) => setReplyBody(e.target.value)}
                    className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm focus:border-rose-400 focus:outline-none"
                  />
                  <div className="flex gap-2">
                    <Button size="sm" variant="retail" onClick={() => sendReply(ticket.id)}>
                      Send reply
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setReplyTo(null)}>
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <Button
                  size="sm"
                  variant="outline"
                  className="mt-3"
                  onClick={() => {
                    setReplyTo(ticket.id);
                    setReplyBody("");
                  }}
                >
                  <MessageSquare className="mr-1.5 h-3.5 w-3.5" />
                  {ticket.status === "resolved" ? "Reopen" : "Reply"}
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function SupportPage() {
  // useSearchParams needs a Suspense boundary. The fallback is null because
  // everything below it is client-only anyway — this page is a customer's own
  // correspondence and has nothing to prerender.
  return (
    <Suspense fallback={null}>
      <SupportInner />
    </Suspense>
  );
}
