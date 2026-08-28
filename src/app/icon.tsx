import { ImageResponse } from "next/og";

export const size = { width: 64, height: 64 };
export const contentType = "image/png";

/** Browser-tab icon. No media assets in this app, so it's drawn, not shipped. */
export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#141110",
          borderRadius: 14,
        }}
      >
        <div
          style={{
            fontSize: 40,
            fontWeight: 900,
            color: "#F3C13A",
            fontFamily: "sans-serif",
          }}
        >
          A
        </div>
      </div>
    ),
    { ...size },
  );
}
