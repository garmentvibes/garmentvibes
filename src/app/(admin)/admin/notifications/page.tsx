"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Mail, MessageSquare, Send, AlertCircle, Clock, CheckCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useNotificationStore } from "@/lib/stores/notification-store";
import { useHasMounted } from "@/lib/hooks/use-has-mounted";
import { NOTIFICATION_TEMPLATES } from "@/lib/notifications/templates";
import {
  CHANNEL_LABELS,
  NOTIFICATION_CHANNELS,
  type NotificationChannel,
  type NotificationMessage,
  type NotificationStatus,
} from "@/types/notifications";

const CHANNEL_ICONS: Record<NotificationChannel, typeof Mail> = {
  email: Mail,
  sms: MessageSquare,
  whatsapp: Send,
};

const STATUS_VARIANT: Record<NotificationStatus, "warning" | "success" | "destructive"> = {
  queued: "warning",
  sent: "success",
  failed: "destructive",
};

const STATUS_ICONS: Record<NotificationStatus, typeof Clock> = {
  queued: Clock,
  sent: CheckCheck,
  failed: AlertCircle,
};

type StatusFilter = NotificationStatus | "all";
type ChannelFilter = NotificationChannel | "all";

function formatTimestamp(iso: string) {
  return new Date(iso).toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function AdminNotificationsPage() {
  const mounted = useHasMounted();
  const messages = useNotificationStore((s) => s.messages);
  const markSent = useNotificationStore((s) => s.markSent);
  const markFailed = useNotificationStore((s) => s.markFailed);

  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [channelFilter, setChannelFilter] = useState<ChannelFilter>("all");
  const [preview, setPreview] = useState<NotificationMessage | null>(null);

  // The outbox is persisted, so render the empty shell until rehydration to
  // keep the first client paint matching the server HTML.
  if (!mounted) return null;

  const visible = messages.filter(
    (m) =>
      (statusFilter === "all" || m.status === statusFilter) &&
      (channelFilter === "all" || m.channel === channelFilter)
  );

  const queuedCount = messages.filter((m) => m.status === "queued").length;
  const failedCount = messages.filter((m) => m.status === "failed").length;

  function simulateSend(message: NotificationMessage) {
    markSent(message.id);
    toast.success(`Marked as sent to ${message.recipient}`);
  }

  function simulateFailure(message: NotificationMessage) {
    markFailed(message.id, "Manually marked failed by staff");
    toast.error(`Marked as failed for ${message.recipient}`);
  }

  return (
    <div className="mx-auto max-w-5xl">
      <h1 className="text-xl font-bold text-neutral-900">Notifications</h1>
      <p className="mt-1 text-sm text-neutral-500">
        Every transactional message the platform has queued. No email, SMS or WhatsApp provider
        is connected yet, so nothing actually leaves the system — this is the outbox that shows
        exactly what each customer would receive.
      </p>

      <div className="mt-4 grid grid-cols-3 gap-3">
        {[
          { label: "Total", value: messages.length },
          { label: "Queued", value: queuedCount },
          { label: "Failed", value: failedCount },
        ].map((stat) => (
          <div key={stat.label} className="rounded-lg border border-neutral-200 bg-white p-4">
            <p className="text-xs uppercase tracking-wide text-neutral-400">{stat.label}</p>
            <p className="mt-1 text-2xl font-bold text-neutral-900">{stat.value}</p>
          </div>
        ))}
      </div>

      <div className="mt-5 flex flex-wrap gap-4">
        <div className="flex flex-wrap gap-2">
          {(["all", "queued", "sent", "failed"] as StatusFilter[]).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setStatusFilter(f)}
              className={cn(
                "rounded-full border px-3 py-1 text-sm capitalize",
                statusFilter === f
                  ? "border-neutral-900 bg-neutral-900 text-white"
                  : "border-neutral-300 text-neutral-600 hover:border-neutral-400"
              )}
            >
              {f}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap gap-2">
          {(["all", ...NOTIFICATION_CHANNELS] as ChannelFilter[]).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setChannelFilter(f)}
              className={cn(
                "rounded-full border px-3 py-1 text-sm",
                channelFilter === f
                  ? "border-emerald-600 bg-emerald-50 text-emerald-700"
                  : "border-neutral-300 text-neutral-600 hover:border-neutral-400"
              )}
            >
              {f === "all" ? "All channels" : CHANNEL_LABELS[f]}
            </button>
          ))}
        </div>
      </div>

      {visible.length === 0 ? (
        <p className="py-16 text-center text-neutral-500">No messages match these filters.</p>
      ) : (
        <ul className="mt-5 space-y-2">
          {visible.map((message) => {
            const ChannelIcon = CHANNEL_ICONS[message.channel];
            const StatusIcon = STATUS_ICONS[message.status];
            return (
              <li
                key={message.id}
                className="rounded-lg border border-neutral-200 bg-white p-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <ChannelIcon className="h-4 w-4 shrink-0 text-neutral-400" />
                      <span className="text-sm font-semibold text-neutral-900">
                        {NOTIFICATION_TEMPLATES[message.templateId].label}
                      </span>
                      <Badge variant={STATUS_VARIANT[message.status]}>
                        <StatusIcon className="mr-1 h-3 w-3" />
                        {message.status}
                      </Badge>
                      <span className="text-xs text-neutral-400">
                        {CHANNEL_LABELS[message.channel]}
                      </span>
                    </div>

                    <p className="mt-1 truncate text-sm text-neutral-600">
                      {message.recipientName} &middot; {message.recipient}
                    </p>
                    <p className="mt-0.5 text-xs text-neutral-400">
                      {formatTimestamp(message.createdAt)}
                      {message.relatedTo ? ` · ${message.relatedTo}` : ""}
                    </p>
                    {message.failureReason && (
                      <p className="mt-1 text-xs text-red-600">{message.failureReason}</p>
                    )}
                  </div>

                  <div className="flex shrink-0 flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setPreview(preview?.id === message.id ? null : message)}
                    >
                      {preview?.id === message.id ? "Hide" : "Preview"}
                    </Button>
                    {message.status !== "sent" && (
                      <Button size="sm" onClick={() => simulateSend(message)}>
                        Mark sent
                      </Button>
                    )}
                    {message.status === "queued" && (
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => simulateFailure(message)}
                      >
                        Mark failed
                      </Button>
                    )}
                  </div>
                </div>

                {preview?.id === message.id && (
                  <div className="mt-3 rounded-md border border-neutral-200 bg-neutral-50 p-3">
                    {message.subject && (
                      <p className="text-sm font-semibold text-neutral-900">
                        Subject: {message.subject}
                      </p>
                    )}
                    <pre className="mt-2 whitespace-pre-wrap font-sans text-sm text-neutral-700">
                      {message.body}
                    </pre>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
