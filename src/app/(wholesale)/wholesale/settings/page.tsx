"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { MapPin, Star, Trash2, Plus, ShieldCheck, Clock, CreditCard } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useSessionStore } from "@/lib/stores/session-store";
import { useShipToStore } from "@/lib/stores/ship-to-store";

export default function WholesaleSettingsPage() {
  const router = useRouter();
  const user = useSessionStore((s) => s.user);
  const updateProfile = useSessionStore((s) => s.updateProfile);
  const addresses = useShipToStore((s) => s.addresses);
  const addAddress = useShipToStore((s) => s.addAddress);
  const removeAddress = useShipToStore((s) => s.removeAddress);
  const setDefault = useShipToStore((s) => s.setDefault);

  const [businessName, setBusinessName] = useState(user?.businessName ?? "");
  const [contactName, setContactName] = useState(user?.name ?? "");
  const [email, setEmail] = useState(user?.email ?? "");
  const [gstin, setGstin] = useState(user?.gstin ?? "");

  const [showAddressForm, setShowAddressForm] = useState(false);
  const [form, setForm] = useState({
    label: "",
    contactName: "",
    phone: "",
    addressLine1: "",
    city: "",
    state: "",
    pincode: "",
  });

  if (!user || user.role !== "wholesale") {
    return (
      <div className="mx-auto max-w-md px-4 py-20 text-center sm:px-6">
        <p className="text-slate-500">You&apos;re not signed in.</p>
        <Button variant="wholesale" className="mt-4" onClick={() => router.push("/wholesale/login")}>
          Sign in
        </Button>
      </div>
    );
  }

  function saveProfile() {
    updateProfile({ businessName, name: contactName, email, gstin });
    toast.success("Business profile updated");
  }

  function requestCreditTerms() {
    updateProfile({ creditTermsRequested: true });
    toast.success("Request sent — our team will review and follow up");
  }

  function submitAddress(e: React.FormEvent) {
    e.preventDefault();
    if (!form.label || !form.contactName || !form.phone || !form.addressLine1 || !form.city || !form.state || !form.pincode) {
      toast.error("Fill in all fields");
      return;
    }
    addAddress(form);
    toast.success("Ship-to address added");
    setForm({ label: "", contactName: "", phone: "", addressLine1: "", city: "", state: "", pincode: "" });
    setShowAddressForm(false);
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
      <h1 className="text-2xl font-bold text-slate-900">Business Settings</h1>

      <div className="mt-6 rounded-lg border border-slate-200 bg-white p-5">
        <h2 className="mb-4 font-semibold text-slate-900">Company Profile</h2>
        <div className="space-y-3">
          <div>
            <Label htmlFor="businessName">Business name</Label>
            <Input id="businessName" value={businessName} onChange={(e) => setBusinessName(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="contactName">Contact person</Label>
            <Input id="contactName" value={contactName} onChange={(e) => setContactName(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="email">Business email</Label>
            <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="gstin">Tax ID / GSTIN</Label>
            <Input id="gstin" value={gstin} onChange={(e) => setGstin(e.target.value)} />
            <p className="mt-1 text-xs text-slate-500">
              Stored for your records only — tax calculation isn&apos;t wired up yet.
            </p>
          </div>
          <Button variant="wholesale" size="sm" onClick={saveProfile}>
            Save Changes
          </Button>
        </div>
      </div>

      <div className="mt-6 rounded-lg border border-slate-200 bg-white p-5">
        <h2 className="mb-4 font-semibold text-slate-900">Account Status &amp; Payment Terms</h2>
        <div className="flex flex-wrap items-center gap-3">
          {user.approvalStatus === "approved" ? (
            <Badge variant="success">
              <ShieldCheck className="mr-1 h-3 w-3" /> Approved
            </Badge>
          ) : (
            <Badge variant="warning">
              <Clock className="mr-1 h-3 w-3" /> Pending Verification
            </Badge>
          )}
          <Badge variant="outline">
            <CreditCard className="mr-1 h-3 w-3" />
            {user.paymentTerms === "net30" ? "Net 30 Terms" : "Prepay"}
          </Badge>
        </div>

        {user.paymentTerms !== "net30" && (
          <div className="mt-4">
            {user.creditTermsRequested ? (
              <p className="text-sm text-slate-500">
                Net-30 credit terms requested — our team will review and follow up.
              </p>
            ) : (
              <Button
                variant="outline"
                size="sm"
                disabled={user.approvalStatus !== "approved"}
                onClick={requestCreditTerms}
              >
                Request Net-30 Credit Terms
              </Button>
            )}
            {user.approvalStatus !== "approved" && !user.creditTermsRequested && (
              <p className="mt-1 text-xs text-slate-500">
                Available once your account is approved.
              </p>
            )}
          </div>
        )}
      </div>

      <div className="mt-6 rounded-lg border border-slate-200 bg-white p-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-semibold text-slate-900">Ship-To Addresses</h2>
          {!showAddressForm && (
            <Button variant="outline" size="sm" onClick={() => setShowAddressForm(true)}>
              <Plus className="mr-1 h-4 w-4" /> Add Address
            </Button>
          )}
        </div>

        {showAddressForm && (
          <form onSubmit={submitAddress} className="mb-5 space-y-3 rounded-md border border-slate-200 p-4">
            <div>
              <Label htmlFor="label">Label (e.g. Main Warehouse)</Label>
              <Input id="label" value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} />
            </div>
            <div>
              <Label htmlFor="contact">Contact person</Label>
              <Input
                id="contact"
                value={form.contactName}
                onChange={(e) => setForm({ ...form, contactName: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="phone">Phone</Label>
              <Input id="phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </div>
            <div>
              <Label htmlFor="address">Address</Label>
              <Input
                id="address"
                value={form.addressLine1}
                onChange={(e) => setForm({ ...form, addressLine1: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label htmlFor="city">City</Label>
                <Input id="city" value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
              </div>
              <div>
                <Label htmlFor="state">State</Label>
                <Input id="state" value={form.state} onChange={(e) => setForm({ ...form, state: e.target.value })} />
              </div>
              <div>
                <Label htmlFor="pincode">PIN code</Label>
                <Input
                  id="pincode"
                  value={form.pincode}
                  onChange={(e) => setForm({ ...form, pincode: e.target.value })}
                />
              </div>
            </div>
            <div className="flex gap-2">
              <Button type="submit" variant="wholesale" size="sm">
                Save Address
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={() => setShowAddressForm(false)}>
                Cancel
              </Button>
            </div>
          </form>
        )}

        {addresses.length === 0 && !showAddressForm ? (
          <p className="text-sm text-slate-500">No ship-to addresses saved yet.</p>
        ) : (
          <div className="space-y-3">
            {addresses.map((addr) => (
              <div key={addr.id} className="rounded-md border border-slate-200 p-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <MapPin className="h-4 w-4 text-slate-400" />
                    <p className="font-medium text-slate-900">{addr.label}</p>
                    {addr.isDefault && (
                      <span className="flex items-center gap-1 rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-800">
                        <Star className="h-3 w-3 fill-blue-800" /> Default
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 text-sm">
                    {!addr.isDefault && (
                      <button
                        type="button"
                        onClick={() => setDefault(addr.id)}
                        className="text-slate-500 hover:text-blue-700"
                      >
                        Set default
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => removeAddress(addr.id)}
                      className="text-slate-500 hover:text-red-600"
                      aria-label="Delete address"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
                <p className="mt-2 text-sm text-slate-600">
                  {addr.contactName} &middot; {addr.phone}
                </p>
                <p className="text-sm text-slate-600">
                  {addr.addressLine1}, {addr.city}, {addr.state} - {addr.pincode}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
