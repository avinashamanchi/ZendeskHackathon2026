import type { Metadata } from "next";
import { Atkinson_Hyperlegible_Next } from "next/font/google";
import { headers } from "next/headers";
import { AxeDev } from "@/components/AxeDev";
import "./globals.css";

const atkinson = Atkinson_Hyperlegible_Next({
  variable: "--font-atkinson",
  subsets: ["latin", "latin-ext"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host =
    requestHeaders.get("x-forwarded-host") ??
    requestHeaders.get("host") ??
    "localhost:3000";
  const protocol =
    requestHeaders.get("x-forwarded-proto") ??
    (host.startsWith("localhost") ? "http" : "https");
  const metadataBase = new URL(`${protocol}://${host}`);
  const title = "Wordless — Point instead of explaining";
  const description =
    "Account-aware support for people who understand the question but cannot find the words to answer it.";
  const image = {
    url: "/og.png",
    width: 1672,
    height: 941,
    alt: "Wordless turns a fragmented support request into three clear choices backed by account evidence.",
  };

  return {
    metadataBase,
    title: { default: title, template: "%s · Wordless" },
    description,
    applicationName: "Wordless",
    keywords: ["accessible support", "aphasia", "customer support"],
    openGraph: {
      type: "website",
      url: "/",
      siteName: "Wordless",
      title,
      description,
      images: [image],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [image.url],
    },
  };
}

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className={atkinson.variable}>
        <AxeDev />
        {children}
      </body>
    </html>
  );
}
