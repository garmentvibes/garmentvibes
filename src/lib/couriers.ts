// Courier partners and tracking-URL construction.
//
// Every Indian courier exposes tracking at a slightly different URL shape, so
// the mapping lives here rather than being pasted at each call site. Adding a
// partner means one entry — nothing else changes.

export interface Courier {
  id: string;
  name: string;
  /** Builds the public tracking page for an AWB. */
  trackingUrl: (awb: string) => string;
}

export const COURIERS: Courier[] = [
  {
    id: "delhivery",
    name: "Delhivery",
    trackingUrl: (awb) => `https://www.delhivery.com/track/package/${encodeURIComponent(awb)}`,
  },
  {
    id: "bluedart",
    name: "Blue Dart",
    trackingUrl: (awb) =>
      `https://www.bluedart.com/web/guest/trackdartresult?trackFor=0&trackNo=${encodeURIComponent(awb)}`,
  },
  {
    id: "dtdc",
    name: "DTDC",
    trackingUrl: (awb) => `https://www.dtdc.in/tracking.asp?strCnno=${encodeURIComponent(awb)}`,
  },
  {
    id: "ekart",
    name: "Ekart",
    trackingUrl: (awb) => `https://ekartlogistics.com/shipmenttrack/${encodeURIComponent(awb)}`,
  },
  {
    id: "indiapost",
    name: "India Post",
    trackingUrl: () => "https://www.indiapost.gov.in/_layouts/15/DOP.Portal.Tracking/TrackConsignment.aspx",
  },
];

export function courierById(id: string | undefined) {
  return COURIERS.find((c) => c.id === id);
}

/**
 * Public tracking link for a shipment, or null when we can't build one.
 *
 * India Post has no per-AWB deep link, so it returns its search page — which
 * is why callers must treat a link as "somewhere to go", not "the exact
 * parcel".
 */
export function trackingUrlFor(courierId: string | undefined, awb: string | undefined) {
  const courier = courierById(courierId);
  if (!courier || !awb) return null;
  return courier.trackingUrl(awb);
}
