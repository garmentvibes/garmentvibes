import { ImageResponse } from "next/og";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "GarmentVibes — Fashion Retail & Wholesale";

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
          background: "linear-gradient(135deg, #1e293b 0%, #0f172a 55%, #4c0519 100%)",
          color: "white",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", fontSize: 76, fontWeight: 700, letterSpacing: -2 }}>
          GarmentVibes
        </div>
        <div style={{ display: "flex", marginTop: 18, fontSize: 40, color: "#fda4af" }}>
          One platform. Two ways to shop.
        </div>
        <div style={{ display: "flex", gap: 16, marginTop: 46 }}>
          <div
            style={{
              display: "flex",
              padding: "12px 28px",
              borderRadius: 999,
              background: "#e11d48",
              fontSize: 27,
            }}
          >
            Retail
          </div>
          <div
            style={{
              display: "flex",
              padding: "12px 28px",
              borderRadius: 999,
              border: "2px solid #64748b",
              color: "#cbd5e1",
              fontSize: 27,
            }}
          >
            Wholesale
          </div>
        </div>
      </div>
    ),
    size
  );
}
