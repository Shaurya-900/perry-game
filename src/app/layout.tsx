import type { Metadata, Viewport } from "next";
import { Analytics } from "@vercel/analytics/next";
import "./globals.css";

export const metadata: Metadata = {
  title: "E-Cell Agent Run",
  description:
    "Dodge the -inators, grab the fedoras, land on the E-Cell leaderboard. One thumb, one run.",
  openGraph: {
    title: "E-Cell Agent Run",
    description:
      "Dodge the -inators, grab the fedoras, land on the E-Cell leaderboard. Scan and run.",
  },
  robots: { index: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: "#141110",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <head>
        {/* Comic lettering. Loaded async with a solid Impact fallback, so a
            slow campus connection never delays the first frame. */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=Bangers&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <div id="app">{children}</div>
        <Analytics />
      </body>
    </html>
  );
}
