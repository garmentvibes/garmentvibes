"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Mail, Phone, Building2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { BUSINESS_INFO } from "@/lib/business-info";

export default function WholesaleContactPage() {
  const [submitted, setSubmitted] = useState(false);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitted(true);
    toast.success("Request sent — our wholesale team will reach out within 1 business day");
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
      <h1 className="text-3xl font-bold text-blue-800">Talk to Our Wholesale Team</h1>
      <p className="mt-2 text-neutral-500">
        Have a custom sourcing need, large-volume request, or account question? Reach out directly.
      </p>

      <div className="mt-8 grid grid-cols-1 gap-8 sm:grid-cols-2">
        <div className="space-y-4 text-sm text-slate-600">
          <div className="flex items-center gap-3">
            <Mail className="h-5 w-5 text-blue-700" />
            {BUSINESS_INFO.wholesaleEmail}
          </div>
          <div className="flex items-center gap-3">
            <Phone className="h-5 w-5 text-blue-700" />
            {BUSINESS_INFO.supportPhone}
          </div>
          <div className="flex items-start gap-3">
            <Building2 className="mt-0.5 h-5 w-5 shrink-0 text-blue-700" />
            {BUSINESS_INFO.address}
          </div>
          <p className="text-xs text-slate-400">Business hours: {BUSINESS_INFO.supportHours}</p>
        </div>

        {submitted ? (
          <div className="rounded-lg border border-green-200 bg-green-50 p-5 text-sm text-green-800">
            Thanks — your request has been received. Our wholesale team will follow up by email.
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label htmlFor="business">Business name</Label>
              <Input id="business" required />
            </div>
            <div>
              <Label htmlFor="email">Business email</Label>
              <Input id="email" type="email" required />
            </div>
            <div>
              <Label htmlFor="message">What are you looking to source?</Label>
              <textarea
                id="message"
                required
                rows={4}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-blue-600 focus:outline-none"
              />
            </div>
            <Button type="submit" variant="wholesale">
              Send Request
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}
