import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "Railway S&T Field Logbook",
  description: "Daily work logs, deficiency tasks, and planned works for Railway Signal & Telecommunication staff.",
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#1e3a8a",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-slate-200 text-slate-900 antialiased">{children}</body>
    </html>
  );
}
