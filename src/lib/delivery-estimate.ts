// Pincode-based delivery estimation.
//
// Uses the first two digits of an Indian PIN code, which map to a postal
// circle/region. This is a reasonable approximation for showing an estimate;
// swap in the courier partner's real serviceability API before launch, since
// actual coverage varies by locality, not just region.

export interface DeliveryEstimate {
  serviceable: boolean;
  minDays: number;
  maxDays: number;
  region: string;
  codAvailable: boolean;
}

// Metro and well-connected hubs — fastest lanes.
const METRO_PREFIXES: Record<string, string> = {
  "11": "Delhi NCR",
  "40": "Mumbai",
  "56": "Bengaluru",
  "60": "Chennai",
  "70": "Kolkata",
  "50": "Hyderabad",
  "41": "Pune",
  "38": "Ahmedabad",
};

// Regions with longer transit times (hill states, islands, north-east).
const REMOTE_PREFIXES = new Set([
  "19", // Jammu & Kashmir / Ladakh
  "17", // Himachal Pradesh
  "79", // Assam / north-east
  "78", // Assam
  "73", // Sikkim / north Bengal
  "74", // Andaman & Nicobar
]);

export function estimateDelivery(pincode: string): DeliveryEstimate | null {
  const clean = pincode.trim();
  if (!/^\d{6}$/.test(clean)) return null;

  const prefix = clean.slice(0, 2);

  if (METRO_PREFIXES[prefix]) {
    return {
      serviceable: true,
      minDays: 2,
      maxDays: 4,
      region: METRO_PREFIXES[prefix],
      codAvailable: true,
    };
  }

  if (REMOTE_PREFIXES.has(prefix)) {
    return {
      serviceable: true,
      minDays: 7,
      maxDays: 10,
      region: "Remote area",
      codAvailable: false, // COD isn't offered on the longest lanes
    };
  }

  return {
    serviceable: true,
    minDays: 4,
    maxDays: 7,
    region: "Standard delivery area",
    codAvailable: true,
  };
}

/** Human-readable date range, e.g. "Tue, 18 Aug – Thu, 20 Aug". */
export function formatDeliveryWindow(estimate: DeliveryEstimate, from: Date) {
  const fmt = (d: Date) =>
    d.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" });

  const min = new Date(from);
  min.setDate(min.getDate() + estimate.minDays);
  const max = new Date(from);
  max.setDate(max.getDate() + estimate.maxDays);

  return `${fmt(min)} – ${fmt(max)}`;
}
