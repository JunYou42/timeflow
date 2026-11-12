import type { Metadata, Viewport } from "next";

import { AppProviders } from "@/components/providers";

import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "TimeFlow — Personal Time Management",
    template: "%s · TimeFlow",
  },
  description:
    "Plan tasks, schedule time, track how it is actually spent, and see where the hours go.",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "TimeFlow",
    statusBarStyle: "default",
  },
  icons: {
    icon: "/icon.svg",
    apple: "/icon.svg",
  },
};

export const viewport: Viewport = {
  themeColor: "#ffffff",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-screen bg-background font-sans antialiased">
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
