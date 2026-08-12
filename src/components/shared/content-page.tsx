import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function ContentPage({
  title,
  subtitle,
  children,
  accent = "text-neutral-900",
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  accent?: string;
}) {
  return (
    <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
      <h1 className={cn("text-3xl font-bold", accent)}>{title}</h1>
      {subtitle && <p className="mt-2 text-neutral-500">{subtitle}</p>}
      <div className="prose-content mt-8 space-y-5 text-sm leading-relaxed text-neutral-600 [&_h2]:mt-8 [&_h2]:mb-2 [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:text-neutral-900 [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:space-y-1">
        {children}
      </div>
    </div>
  );
}
