import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Toaster } from "sonner";
import { StoreHydrator } from "@/components/shared/store-hydrator";
import { SessionSync } from "@/components/shared/session-sync";
import { ServiceWorkerRegistrar } from "@/components/shared/service-worker-registrar";
import { InstallPrompt } from "@/components/shared/install-prompt";
import { JsonLd } from "@/components/shared/json-ld";
import { organizationSchema, siteUrl, websiteSchema } from "@/lib/seo";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const SITE_DESCRIPTION =
  "GarmentVibes is a dual-mode clothing marketplace: shop retail fashion or source wholesale apparel in bulk, all in one platform.";

export const metadata: Metadata = {
  // Required so relative OG/Twitter image paths resolve to absolute URLs —
  // social crawlers reject relative ones.
  metadataBase: new URL(siteUrl()),
  title: {
    default: "GarmentVibes — Fashion Retail & Wholesale",
    template: "%s | GarmentVibes",
  },
  description: SITE_DESCRIPTION,
  openGraph: {
    type: "website",
    siteName: "GarmentVibes",
    locale: "en_IN",
    title: "GarmentVibes — Fashion Retail & Wholesale",
    description: SITE_DESCRIPTION,
  },
  twitter: {
    card: "summary_large_image",
    title: "GarmentVibes — Fashion Retail & Wholesale",
    description: SITE_DESCRIPTION,
  },
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "GarmentVibes",
  },
  icons: {
    icon: "/icons/icon-192.png",
    apple: "/icons/icon-192.png",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0a0a0a",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <JsonLd data={[organizationSchema(), websiteSchema()]} />
        <StoreHydrator />
        <SessionSync />
        <ServiceWorkerRegistrar />
        {children}
        <InstallPrompt />
        <Toaster richColors position="top-center" />
      </body>
    </html>
  );
}
