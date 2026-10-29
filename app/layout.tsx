import type { Metadata } from "next";
import { themeBootstrap } from "@/lib/preferences";
import "./globals.css";
import "./quick-feedback.css";

export const metadata: Metadata = {
  title: "Gary · Quick feedback",
  description: "Share feedback about your Gary representative or request help with housing, jobs, and paperwork. A short form designed to take a minute or two.",
  manifest: "/site.webmanifest",
  icons: {
    icon: [
      { url: "/favicon.svg", type: "image/svg+xml" },
      { url: "/favicon.ico", sizes: "any" },
      { url: "/icons/favicon-32.png", type: "image/png", sizes: "32x32" },
    ],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
    shortcut: "/favicon.ico",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head><script dangerouslySetInnerHTML={{ __html: themeBootstrap }} /><meta name="theme-color" content="#daf387" /></head>
      <body className="antialiased">{children}</body>
    </html>
  );
}
