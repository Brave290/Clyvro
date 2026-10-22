import { ImageResponse } from "next/og";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "Clyvro — Is your website losing you customers? Let's find out.";

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
        <div style={{ marginTop: 48, fontSize: 66, fontWeight: 800, lineHeight: 1.08, letterSpacing: -1.5 }}>
          Is your website losing
        </div>
        <div style={{ fontSize: 66, fontWeight: 800, lineHeight: 1.08, letterSpacing: -1.5, color: "#3b82f6" }}>
          you customers?
        </div>
        <div style={{ marginTop: 36, fontSize: 26, color: "#a8b3c7", lineHeight: 1.4, maxWidth: 880 }}>
          Paste your link. We click everything, test every form, and tell you in plain English what's broken.
        </div>
      </div>
    ),
    { ...size },
  );
}
