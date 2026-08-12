"use client";

import { Clock } from "lucide-react";
import { useSessionStore } from "@/lib/stores/session-store";
import { useHasMounted } from "@/lib/hooks/use-has-mounted";

export function PendingApprovalBanner() {
  const mounted = useHasMounted();
  const user = useSessionStore((s) => s.user);

  if (!mounted || user?.role !== "wholesale" || user.approvalStatus !== "pending") return null;

  return (
    <div className="bg-amber-50 px-4 py-2.5 text-center text-sm text-amber-800 sm:px-6">
      <span className="inline-flex items-center gap-1.5">
        <Clock className="h-4 w-4" />
        Your business account is pending verification. You can browse, get quotes, and build an
        order, but placing orders directly is enabled once approved (usually within 1 business day).
      </span>
    </div>
  );
}
