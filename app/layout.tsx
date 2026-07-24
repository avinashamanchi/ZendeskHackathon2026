import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";

// Atkinson Hyperlegible Next, self-hosted so offline mode cannot break the
// typography. Designed by the Braille Institute to keep letterforms
// distinguishable — a substantive choice for this product, not decoration.
const atkinson = localFont({
  src: [
    { path: "./fonts/atkinson-next-latin.woff2", weight: "400 700", style: "normal" },
  ],
  variable: "--font-atkinson",
  display: "swap",
  fallback: ["system-ui", "sans-serif"],
});

export const metadata: Metadata = {
  title: "Wordless — support that reads the account, not the sentence",
  description:
    "For people with expressive aphasia: Wordless reads the merchant's own records and offers what's likely wrong as large, tappable cards. Point instead of explaining.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${atkinson.variable} font-sans antialiased`}>{children}</body>
    </html>
  );
}
