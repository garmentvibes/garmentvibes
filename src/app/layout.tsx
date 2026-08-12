import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Toaster } from "sonner";
import { StoreHydrator } from "@/components/shared/store-hydrator";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "GarmentVibes — Fashion Retail & Wholesale",
    template: "%s | GarmentVibes",
  },
  description:
    "GarmentVibes is a dual-mode clothing marketplace: shop retail fashion or source wholesale apparel in bulk, all in one platform.",
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
        <StoreHydrator />
        {children}
        <Toaster richColors position="top-center" />
      </body>
    </html>
  );
}
