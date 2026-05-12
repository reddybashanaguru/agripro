import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Navigation } from "@/components/Navigation";

export const metadata: Metadata = {
  title: {
    template: "%s | Finagra Unity",
    default: "Investor Command Center | Finagra Unity",
  },
  description:
    "Real-time AgTech investment dashboard — ledger audit, NDVI sentinel, payout tracking for Finagra Unity platform.",
  keywords: ["AgTech", "agriculture", "investment", "ledger", "NDVI", "India"],
  robots: { index: false, follow: false }, // internal tool — no public indexing
};

export const viewport: Viewport = {
  themeColor: "#16a34a",
  colorScheme: "light",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="h-full">
      <body className="h-full min-h-screen flex flex-col">
        <Navigation />
        <main
          id="main-content"
          className="flex-1 mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-8"
          tabIndex={-1}
        >
          {children}
        </main>
        <footer className="border-t border-gray-200 bg-white py-4">
          <p className="text-center text-xs text-gray-600">
            Finagra Unity © {new Date().getFullYear()} — Investor Command Center
          </p>
        </footer>
      </body>
    </html>
  );
}
