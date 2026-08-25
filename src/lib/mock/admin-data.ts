import type { RetailOrder, WholesaleAccount, WholesaleQuote } from "@/types/admin";

// Seed data for the admin panel. These stand in for database tables until the
// GarmentVibes Supabase project exists — the admin stores layer live edits on
// top of these, exactly like the product override store does for the catalogs.

// Delivery dates are relative to today on purpose. A fixed date would drift
// out of the 7-day return window and silently make the returns flow (and its
// QA checks) unreachable a week after it was written.
function daysAgo(n: number) {
  return new Date(Date.now() - n * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

export const SEED_RETAIL_ORDERS: RetailOrder[] = [
  {
    id: "GV84213567",
    placedAt: "2026-08-12",
    customerName: "Priya Sharma",
    customerEmail: "priya.sharma@example.com",
    phone: "+91 98765 43210",
    shippingAddress: "402, Sunrise Apartments, MG Road, Bengaluru, Karnataka - 560001",
    paymentMethod: "online",
    status: "confirmed",
    items: [
      { productId: "floral-anarkali-kurta", name: "Floral Printed Anarkali Kurta", size: "M", color: "Rose", qty: 1, price: 129900 },
      { productId: "satin-cami-top", name: "Satin Cami Top", size: "S", color: "Black", qty: 2, price: 59900 },
    ],
  },
  {
    id: "GV84213102",
    placedAt: "2026-08-11",
    customerName: "Rahul Verma",
    customerEmail: "rahul.v@example.com",
    phone: "+91 91234 56780",
    shippingAddress: "17 Nehru Nagar, Andheri East, Mumbai, Maharashtra - 400069",
    paymentMethod: "cod",
    status: "packed",
    items: [
      { productId: "graphic-print-oversized-tee", name: "Graphic Print Oversized T-Shirt", size: "L", color: "Black", qty: 3, price: 69900 },
    ],
  },
  {
    id: "GV84119042",
    placedAt: "2026-08-08",
    customerName: "Ananya Reddy",
    customerEmail: "ananya.r@example.com",
    phone: "+91 99887 66554",
    shippingAddress: "Plot 22, Jubilee Hills, Hyderabad, Telangana - 500033",
    paymentMethod: "online",
    status: "shipped",
    items: [
      { productId: "banarasi-silk-saree", name: "Banarasi Silk Blend Saree", size: "Free Size", color: "Maroon", qty: 1, price: 349900 },
    ],
  },
  {
    id: "GV84098771",
    placedAt: "2026-08-05",
    deliveredAt: daysAgo(2),
    customerName: "Karan Mehta",
    customerEmail: "karan.mehta@example.com",
    phone: "+91 90000 12345",
    shippingAddress: "9B Park Street, Kolkata, West Bengal - 700016",
    paymentMethod: "cod",
    status: "delivered",
    items: [
      { productId: "quilted-bomber-jacket", name: "Quilted Bomber Jacket", size: "M", color: "Olive", qty: 1, price: 219900 },
      { productId: "classic-crew-neck-tee", name: "Classic Crew Neck T-Shirt", size: "M", color: "Navy", qty: 2, price: 49900 },
    ],
  },
  {
    // Delivered with no return raised yet — the one that exercises the
    // customer-side return request flow.
    id: "GV84055120",
    placedAt: "2026-08-03",
    deliveredAt: daysAgo(3),
    customerName: "Divya Rao",
    customerEmail: "divya.rao@example.com",
    phone: "+91 99887 76655",
    shippingAddress: "44 Jubilee Hills Road No. 10, Hyderabad, Telangana - 500033",
    paymentMethod: "online",
    status: "delivered",
    items: [
      { productId: "graphic-print-oversized-tee", name: "Graphic Print Oversized T-Shirt", size: "M", color: "Black", qty: 2, price: 69900 },
    ],
  },
  {
    id: "GV83997211",
    placedAt: "2026-08-02",
    customerName: "Sneha Patil",
    customerEmail: "sneha.p@example.com",
    phone: "+91 98111 22333",
    shippingAddress: "12 Model Colony, Shivajinagar, Pune, Maharashtra - 411016",
    paymentMethod: "online",
    status: "pending",
    items: [
      { productId: "unicorn-print-frock", name: "Unicorn Print Party Frock", size: "4-5Y", color: "Pink", qty: 2, price: 89900 },
    ],
  },
];

export const SEED_WHOLESALE_QUOTES: WholesaleQuote[] = [
  {
    id: "GVQ84213567",
    kind: "quote",
    requestedAt: "2026-08-12",
    businessName: "Meera Fashion House",
    contactName: "Meera Nair",
    email: "meera@meerafashion.example",
    status: "requested",
    items: [
      { productId: "cotton-round-neck-tee-bulk", sku: "GV-WCT-001", name: "Cotton Round Neck T-Shirt (Bulk Pack)", qty: 300, pricePerUnit: 21900 },
      { productId: "denim-jeans-bulk", sku: "GV-WDN-003", name: "Stretch Denim Jeans (Bulk Pack)", qty: 96, pricePerUnit: 64900 },
    ],
  },
  {
    id: "GVQ84190233",
    kind: "order",
    requestedAt: "2026-08-10",
    businessName: "Kumar Retail Chain",
    contactName: "Suresh Kumar",
    email: "suresh@kumarretail.example",
    status: "confirmed",
    items: [
      { productId: "mens-pique-polo-bulk", sku: "GV-WPO-017", name: "Men's Pique Polo T-Shirt (Bulk Pack)", qty: 600, pricePerUnit: 24900 },
    ],
  },
  {
    id: "GVQ84119042",
    kind: "quote",
    requestedAt: "2026-08-07",
    businessName: "Style Bazaar",
    contactName: "Anita Desai",
    email: "anita@stylebazaar.example",
    status: "quoted",
    items: [
      { productId: "cotton-printed-kurti-bulk", sku: "GV-WKR-002", name: "Cotton Printed Kurti (Bulk Pack)", qty: 150, pricePerUnit: 34900 },
      { productId: "printed-saree-bulk", sku: "GV-WSS-014", name: "Printed Georgette Saree (Bulk Pack)", qty: 150, pricePerUnit: 52900 },
    ],
  },
  {
    id: "GVQ83997211",
    kind: "order",
    requestedAt: "2026-08-01",
    businessName: "Little Steps Kidswear",
    contactName: "Ravi Iyer",
    email: "ravi@littlesteps.example",
    status: "shipped",
    items: [
      { productId: "kids-cotton-coord-set-bulk", sku: "GV-WKD-004", name: "Kids Cotton Co-ord Set (Bulk Pack)", qty: 360, pricePerUnit: 13900 },
    ],
  },
];

export const SEED_WHOLESALE_ACCOUNTS: WholesaleAccount[] = [
  {
    id: "acc-1",
    businessName: "Meera Fashion House",
    contactName: "Meera Nair",
    email: "meera@meerafashion.example",
    phone: "+91 98450 11223",
    gstin: "29ABCDE1234F1Z5",
    registeredAt: "2026-08-12",
    status: "pending",
    paymentTerms: "prepay",
    creditTermsRequested: false,
  },
  {
    id: "acc-2",
    businessName: "Trendline Wholesale",
    contactName: "Vikram Singh",
    email: "vikram@trendline.example",
    phone: "+91 99100 44556",
    registeredAt: "2026-08-11",
    status: "pending",
    paymentTerms: "prepay",
    creditTermsRequested: false,
  },
  {
    id: "acc-3",
    businessName: "Kumar Retail Chain",
    contactName: "Suresh Kumar",
    email: "suresh@kumarretail.example",
    phone: "+91 98200 77889",
    gstin: "27FGHIJ5678K2Z9",
    registeredAt: "2026-07-28",
    status: "approved",
    paymentTerms: "net30",
    creditTermsRequested: true,
  },
  {
    id: "acc-4",
    businessName: "Style Bazaar",
    contactName: "Anita Desai",
    email: "anita@stylebazaar.example",
    phone: "+91 97600 33221",
    gstin: "24KLMNO9012P3Z1",
    registeredAt: "2026-07-20",
    status: "approved",
    paymentTerms: "prepay",
    creditTermsRequested: true,
  },
  {
    id: "acc-5",
    businessName: "Little Steps Kidswear",
    contactName: "Ravi Iyer",
    email: "ravi@littlesteps.example",
    registeredAt: "2026-07-15",
    status: "approved",
    paymentTerms: "prepay",
    creditTermsRequested: false,
  },
];
