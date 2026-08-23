"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Heart, LifeBuoy, MapPin, Package, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useSessionStore } from "@/lib/stores/session-store";
import { ReferralCard } from "@/components/retail/referral-card";

export default function RetailAccountPage() {
  const router = useRouter();
  const user = useSessionStore((s) => s.user);
  const logout = useSessionStore((s) => s.logout);
  const updateProfile = useSessionStore((s) => s.updateProfile);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(user?.name ?? "");
  const [phone, setPhone] = useState(user?.phone ?? "");

  if (!user || user.role !== "retail") {
    return (
      <div className="mx-auto max-w-md px-4 py-20 text-center sm:px-6">
        <p className="text-neutral-500">You&apos;re not signed in.</p>
        <Button variant="retail" className="mt-4" onClick={() => router.push("/shop/login")}>
          Sign in
        </Button>
      </div>
    );
  }

  function handleSave() {
    updateProfile({ name, phone });
    toast.success("Profile updated");
    setEditing(false);
  }

  return (
    <div className="mx-auto max-w-md px-4 py-20 sm:px-6">
      <h1 className="text-2xl font-bold text-neutral-900">My Account</h1>

      <div className="mt-4 rounded-lg border border-neutral-200 bg-white p-5">
        {editing ? (
          <div className="space-y-3">
            <div>
              <Label htmlFor="name">Full name</Label>
              <Input id="name" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="phone">Phone</Label>
              <Input id="phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
            </div>
            <div className="flex gap-2">
              <Button variant="retail" size="sm" onClick={handleSave}>
                Save
              </Button>
              <Button variant="outline" size="sm" onClick={() => setEditing(false)}>
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex items-start justify-between">
            <div>
              <p className="font-medium text-neutral-900">{user.name}</p>
              <p className="text-sm text-neutral-500">{user.email}</p>
              {user.phone && <p className="text-sm text-neutral-500">{user.phone}</p>}
            </div>
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="text-neutral-400 hover:text-rose-600"
              aria-label="Edit profile"
            >
              <Pencil className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>

      <div className="mt-4">
        <ReferralCard email={user.email} />
      </div>

      <div className="mt-4 space-y-2">
        <Link
          href="/shop/orders"
          className="flex items-center gap-3 rounded-lg border border-neutral-200 bg-white p-4 text-sm font-medium text-neutral-800 hover:border-rose-200"
        >
          <Package className="h-5 w-5 text-neutral-400" /> My Orders
        </Link>
        <Link
          href="/shop/addresses"
          className="flex items-center gap-3 rounded-lg border border-neutral-200 bg-white p-4 text-sm font-medium text-neutral-800 hover:border-rose-200"
        >
          <MapPin className="h-5 w-5 text-neutral-400" /> My Addresses
        </Link>
        <Link
          href="/shop/support"
          className="flex items-center gap-3 rounded-lg border border-neutral-200 bg-white p-4 text-sm font-medium text-neutral-800 hover:border-rose-200"
        >
          <LifeBuoy className="h-5 w-5 text-neutral-400" /> Help &amp; Support
        </Link>
        <Link
          href="/shop/wishlist"
          className="flex items-center gap-3 rounded-lg border border-neutral-200 bg-white p-4 text-sm font-medium text-neutral-800 hover:border-rose-200"
        >
          <Heart className="h-5 w-5 text-neutral-400" /> My Wishlist
        </Link>
      </div>

      <Button
        variant="outline"
        className="mt-4 w-full"
        onClick={() => {
          logout();
          toast.success("Signed out");
          router.push("/shop");
        }}
      >
        Sign out
      </Button>
    </div>
  );
}
