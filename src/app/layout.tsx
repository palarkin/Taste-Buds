import type { Metadata, Viewport } from "next";
import { DM_Sans, Fraunces } from "next/font/google";
import "./globals.css";

const body = DM_Sans({ variable: "--font-body", subsets: ["latin"] });
const display = Fraunces({ variable: "--font-display-face", subsets: ["latin"], axes: ["SOFT", "WONK"] });

export const metadata: Metadata = {
  title: { default: "Taste Buds", template: "%s · Taste Buds" },
  description: "Where root beer connoisseurs track what they've tried and find what they haven't.",
  appleWebApp: { capable: true, title: "Taste Buds", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  themeColor: "#6b3a1f",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${body.variable} ${display.variable} h-full antialiased`}>
      <body className="min-h-full font-sans">{children}</body>
    </html>
  );
}
