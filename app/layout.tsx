import type { Metadata, Viewport } from "next";
import { Anek_Devanagari, Anek_Kannada, Anek_Latin, Baloo_2, Baloo_Tamma_2 } from "next/font/google";
import { AppProvider } from "@/components/app-state";
import "./globals.css";

const body = Anek_Latin({ subsets: ["latin"], variable: "--font-body-latin" });
const bodyHi = Anek_Devanagari({ subsets: ["devanagari"], variable: "--font-body-hi" });
const bodyKn = Anek_Kannada({ subsets: ["kannada"], variable: "--font-body-kn" });
const display = Baloo_2({ subsets: ["latin", "devanagari"], weight: ["600", "700", "800"], variable: "--font-display" });
const displayKn = Baloo_Tamma_2({ subsets: ["kannada"], weight: ["600", "700", "800"], variable: "--font-display-kn" });

export const metadata: Metadata = {
  title: "Daari",
  description: "A job counsellor you can talk to in Kannada, Hindi or English, for job seekers in Bangalore.",
};

export const viewport: Viewport = {
  themeColor: "#1B3BB3",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${body.variable} ${bodyHi.variable} ${bodyKn.variable} ${display.variable} ${displayKn.variable}`}>
      <body>
        <AppProvider>{children}</AppProvider>
      </body>
    </html>
  );
}
