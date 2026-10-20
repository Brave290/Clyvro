import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

/** Apple touch icon — brand mark rendered to PNG (Apple applies its own mask). */
export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "#2563eb",
        }}
      >
        <div style={{ position: "relative", display: "flex", width: 96, height: 96 }}>
          <div
            style={{
              width: 72,
              height: 72,
              borderRadius: "50%",
              border: "11px solid #ffffff",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <div style={{ width: 16, height: 16, borderRadius: "50%", backgroundColor: "#ffffff" }} />
          </div>
          <div
            style={{
              position: "absolute",
              right: 2,
              bottom: 8,
              width: 34,
              height: 11,
              borderRadius: 6,
              backgroundColor: "#ffffff",
              transform: "rotate(45deg)",
            }}
          />
        </div>
      </div>
    ),
    { ...size },
  );
}
