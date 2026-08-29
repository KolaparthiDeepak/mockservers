import type { ReactNode } from "react";
import { Chivo, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";

const chivo = Chivo({
  subsets: ["latin"],
  weight: ["400", "700", "900"],
  variable: "--font-chivo",
  display: "swap",
});

const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-plex-mono",
  display: "swap",
});

export const metadata = {
  title: "mockservers",
  description: "Hosted, file-defined mock API server",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${chivo.variable} ${plexMono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
