import type { ReturnRequest } from "@/types/returns";

// One seeded return so the admin queue and the customer-side status view
// have something to show on a fresh browser. Mirrors an item from the
// delivered seed order GV84098771.

export const SEED_RETURNS: ReturnRequest[] = [
  {
    id: "RET100001",
    orderId: "GV84098771",
    resolution: "refund",
    customerName: "Karan Mehta",
    customerEmail: "karan.mehta@example.com",
    phone: "+91 90000 12345",
    items: [
      {
        productId: "classic-crew-neck-tee",
        name: "Classic Crew Neck T-Shirt",
        size: "M",
        color: "Navy",
        qty: 1,
        price: 49900,
      },
    ],
    reason: "Size or fit issue",
    comments: "Runs a size small — would like to return one of the two.",
    status: "requested",
    createdAt: "2026-08-12T10:15:00.000Z",
  },
];
