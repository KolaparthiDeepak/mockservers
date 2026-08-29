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

// Applied before first paint so there's no flash of the wrong theme.
const themeScript = `try{var t=localStorage.getItem('mockservers-theme');if(t==='light'||t==='dark'){document.documentElement.dataset.theme=t}else if(window.matchMedia&&matchMedia('(prefers-color-scheme: light)').matches){document.documentElement.dataset.theme='light'}}catch(e){}`;

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${chivo.variable} ${plexMono.variable}`} suppressHydrationWarning>
      <body>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
        {children}
      </body>
    </html>
  );
}
