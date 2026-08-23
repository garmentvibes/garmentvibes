"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { phoneField, pincodeField } from "@/lib/validation/address";
import { toast } from "sonner";
import { MapPin, Star, Trash2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAddressStore } from "@/lib/stores/address-store";

const addressSchema = z.object({
  label: z.string().min(2, "Give this address a label"),
  fullName: z.string().min(2, "Enter a full name"),
  phone: phoneField,
  addressLine1: z.string().min(5, "Enter the address"),
  city: z.string().min(2, "Enter a city"),
  state: z.string().min(2, "Enter a state"),
  pincode: pincodeField,
});

type AddressForm = z.infer<typeof addressSchema>;

export default function AddressesPage() {
  const [showForm, setShowForm] = useState(false);
  const addresses = useAddressStore((s) => s.addresses);
  const addAddress = useAddressStore((s) => s.addAddress);
  const removeAddress = useAddressStore((s) => s.removeAddress);
  const setDefault = useAddressStore((s) => s.setDefault);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<AddressForm>({ resolver: zodResolver(addressSchema) });

  function onSubmit(data: AddressForm) {
    addAddress({ ...data, isDefault: addresses.length === 0 });
    toast.success("Address saved");
    reset();
    setShowForm(false);
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-neutral-900">My Addresses</h1>
        {!showForm && (
          <Button variant="retail" size="sm" onClick={() => setShowForm(true)}>
            <Plus className="mr-1 h-4 w-4" /> Add Address
          </Button>
        )}
      </div>

      {showForm && (
        <form onSubmit={handleSubmit(onSubmit)} className="mt-6 space-y-4 rounded-lg border border-neutral-200 p-5">
          <div>
            <Label htmlFor="label">Label (e.g. Home, Office)</Label>
            <Input id="label" {...register("label")} />
            {errors.label && <p className="mt-1 text-xs text-red-600">{errors.label.message}</p>}
          </div>
          <div>
            <Label htmlFor="fullName">Full name</Label>
            <Input id="fullName" {...register("fullName")} />
            {errors.fullName && <p className="mt-1 text-xs text-red-600">{errors.fullName.message}</p>}
          </div>
          <div>
            <Label htmlFor="phone">Phone</Label>
            <Input id="phone" type="tel" {...register("phone")} />
            {errors.phone && <p className="mt-1 text-xs text-red-600">{errors.phone.message}</p>}
          </div>
          <div>
            <Label htmlFor="addressLine1">Address</Label>
            <Input id="addressLine1" {...register("addressLine1")} />
            {errors.addressLine1 && (
              <p className="mt-1 text-xs text-red-600">{errors.addressLine1.message}</p>
            )}
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label htmlFor="city">City</Label>
              <Input id="city" {...register("city")} />
              {errors.city && <p className="mt-1 text-xs text-red-600">{errors.city.message}</p>}
            </div>
            <div>
              <Label htmlFor="state">State</Label>
              <Input id="state" {...register("state")} />
              {errors.state && <p className="mt-1 text-xs text-red-600">{errors.state.message}</p>}
            </div>
            <div>
              <Label htmlFor="pincode">PIN code</Label>
              <Input id="pincode" {...register("pincode")} />
              {errors.pincode && <p className="mt-1 text-xs text-red-600">{errors.pincode.message}</p>}
            </div>
          </div>
          <div className="flex gap-2">
            <Button type="submit" variant="retail" disabled={isSubmitting}>
              Save Address
            </Button>
            <Button type="button" variant="outline" onClick={() => setShowForm(false)}>
              Cancel
            </Button>
          </div>
        </form>
      )}

      {addresses.length === 0 && !showForm ? (
        <div className="mt-10 text-center text-neutral-500">
          <MapPin className="mx-auto h-8 w-8 text-neutral-300" />
          <p className="mt-2">No saved addresses yet.</p>
        </div>
      ) : (
        <div className="mt-6 space-y-3">
          {addresses.map((addr) => (
            <div key={addr.id} className="rounded-lg border border-neutral-200 p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <p className="font-medium text-neutral-900">{addr.label}</p>
                  {addr.isDefault && (
                    <span className="flex items-center gap-1 rounded-full bg-rose-100 px-2 py-0.5 text-xs font-medium text-rose-700">
                      <Star className="h-3 w-3 fill-rose-700" /> Default
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-3 text-sm">
                  {!addr.isDefault && (
                    <button
                      type="button"
                      onClick={() => setDefault(addr.id)}
                      className="text-neutral-500 hover:text-rose-600"
                    >
                      Set default
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => removeAddress(addr.id)}
                    className="text-neutral-500 hover:text-red-600"
                    aria-label="Delete address"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
              <p className="mt-2 text-sm text-neutral-600">
                {addr.fullName} &middot; {addr.phone}
              </p>
              <p className="text-sm text-neutral-600">
                {addr.addressLine1}, {addr.city}, {addr.state} - {addr.pincode}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
