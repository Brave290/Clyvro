import { ImageResponse } from "next/og";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "Clyvro — Find the friction. Fix the conversion.";

/** Social share card — uses the real Clyvro icon (blue rounded square) */
export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "72px 84px",
          backgroundColor: "#0b1020",
          color: "#f1f5f9",
          fontFamily: "ui-sans-serif, system-ui, sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          <img
            src="https://clyvro.vercel.app/clyvro-icon.png"
            width={64}
            height={64}
            style={{ width: 64, height: 64, borderRadius: 16, objectFit: "contain" }}
            alt="Clyvro"
          />
          <div style={{ fontSize: 44, fontWeight: 700, letterSpacing: -1 }}>Clyvro</div>
        </div>
        <div style={{ marginTop: 48, fontSize: 68, fontWeight: 800, lineHeight: 1.08, letterSpacing: -1.5 }}>
          Find the friction.
        </div>
        <div style={{ fontSize: 68, fontWeight: 800, lineHeight: 1.08, letterSpacing: -1.5, color: "#3b82f6" }}>
          Fix the conversion.
        </div>
        <div style={{ marginTop: 36, fontSize: 27, color: "#a8b3c7", lineHeight: 1.4, maxWidth: 860 }}>
          Evidence-first website audits. Real bounded scans, verifiable findings, prioritised fixes.
        </div>
      </div>
    ),
    { ...size },
  );
}
