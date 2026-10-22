import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "TMU Facilitator Certification",
  description: "Q4 2026 facilitator re-certification: modules, grading and outcomes.",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <head>
        {/* Self-hosted Hanken Grotesk (see globals.css); preload avoids a fallback-font flash. */}
        <link rel="preload" href="/fonts/HankenGrotesk-latin-normal.woff2" as="font" type="font/woff2" crossOrigin="anonymous" />
      </head>
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
