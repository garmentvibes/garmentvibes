"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Mail, Phone, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function ContactPage() {
  const [submitted, setSubmitted] = useState(false);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitted(true);
    toast.success("Message sent — we'll get back to you within 24 hours");
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
      <h1 className="text-3xl font-bold text-rose-700">Contact Us</h1>
      <p className="mt-2 text-neutral-500">
        Questions about an order, a product, or anything else — we&apos;re here.
      </p>

      <div className="mt-8 grid grid-cols-1 gap-8 sm:grid-cols-2">
        <div className="space-y-4 text-sm text-neutral-600">
          <div className="flex items-center gap-3">
            <Mail className="h-5 w-5 text-rose-500" />
            support@garmentvibes.com
          </div>
          <div className="flex items-center gap-3">
            <Phone className="h-5 w-5 text-rose-500" />
            +91 98765 43210
          </div>
          <div className="flex items-center gap-3">
            <MapPin className="h-5 w-5 text-rose-500" />
            Bengaluru, Karnataka, India
          </div>
          <p className="text-xs text-neutral-400">Support hours: Mon–Sat, 9am–7pm IST</p>
        </div>

        {submitted ? (
          <div className="rounded-lg border border-green-200 bg-green-50 p-5 text-sm text-green-800">
            Thanks for reaching out — our team will respond by email shortly.
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label htmlFor="name">Name</Label>
              <Input id="name" required />
            </div>
            <div>
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" required />
            </div>
            <div>
              <Label htmlFor="message">Message</Label>
              <textarea
                id="message"
                required
                rows={4}
                className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm focus:border-rose-400 focus:outline-none"
              />
            </div>
            <Button type="submit" variant="retail">
              Send Message
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}
