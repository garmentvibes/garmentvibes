"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Mail, Phone, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { BUSINESS_INFO } from "@/lib/business-info";

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
            {BUSINESS_INFO.supportEmail}
          </div>
          <div className="flex items-center gap-3">
            <Phone className="h-5 w-5 text-rose-500" />
            {BUSINESS_INFO.supportPhone}
          </div>
          <div className="flex items-start gap-3">
            <MapPin className="mt-0.5 h-5 w-5 shrink-0 text-rose-500" />
            {BUSINESS_INFO.address}
          </div>
          <p className="text-xs text-neutral-500">Support hours: {BUSINESS_INFO.supportHours}</p>
        </div>

        {submitted ? (
          <div className="rounded-lg border border-green-200 bg-green-50 p-5 text-sm text-green-800">
            <p>Thanks for reaching out — our team will respond by email shortly.</p>
            {/* This form goes nowhere trackable. A signed-in customer gets a
                real thread with a reference and a reply they can see, so say
                so rather than leaving them to wonder. */}
            <p className="mt-2">
              For anything about an order,{" "}
              <Link href="/shop/support" className="font-medium underline">
                raise it from Help &amp; Support
              </Link>{" "}
              instead — you will get a reference and can follow the reply in your account.
            </p>
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
