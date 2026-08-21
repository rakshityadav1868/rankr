import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt = "rankr.lol — pay more, rank higher";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const ACCENT = "#2f5cf6";
const INK = "#0b1220";
const MUTED = "#6b7280";

export default function OGImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "#fbfcfd",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: 84,
              height: 84,
              borderRadius: 20,
              background: ACCENT,
              color: "#fff",
              fontSize: 48,
              fontWeight: 800,
            }}
          >
            $
          </div>
          <div style={{ display: "flex", fontSize: 76, fontWeight: 800, color: INK }}>
            rankr<span style={{ color: ACCENT }}>.lol</span>
          </div>
        </div>

        <div
          style={{
            display: "flex",
            marginTop: 44,
            fontSize: 32,
            color: MUTED,
            textAlign: "center",
            maxWidth: 880,
          }}
        >
          No judges, no votes, no secret sauce. Bid a dollar more than the site above you and
          take its place.
        </div>

        <div style={{ display: "flex", marginTop: 28, fontSize: 40, fontWeight: 700, color: ACCENT }}>
          Will you take #1 today?
        </div>

        <div
          style={{
            display: "flex",
            marginTop: 56,
            padding: "12px 28px",
            borderRadius: 999,
            background: INK,
            color: "#fff",
            fontSize: 26,
            fontWeight: 600,
          }}
        >
          rankr.lol
        </div>
      </div>
    ),
    { ...size }
  );
}
