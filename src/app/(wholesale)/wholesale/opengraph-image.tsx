import { ImageResponse } from "next/og";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "GarmentVibes Wholesale — bulk apparel sourcing";

export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "0 90px",
          background: "linear-gradient(135deg, #0f172a 0%, #1e3a8a 100%)",
          color: "white",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", fontSize: 28, color: "#93c5fd", letterSpacing: 5 }}>
          GARMENTVIBES WHOLESALE
        </div>
        <div
          style={{
            display: "flex",
            marginTop: 22,
            fontSize: 68,
            fontWeight: 700,
            letterSpacing: -2,
            lineHeight: 1.15,
          }}
        >
          Bulk apparel sourcing, tier-priced.
        </div>
        <div style={{ display: "flex", gap: 44, marginTop: 50, fontSize: 30, color: "#cbd5e1" }}>
          <div style={{ display: "flex" }}>Tiered pricing</div>
          <div style={{ display: "flex" }}>Low MOQs</div>
          <div style={{ display: "flex" }}>Credit terms</div>
        </div>
      </div>
    ),
    size
  );
}
