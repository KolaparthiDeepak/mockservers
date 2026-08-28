import type { ReactNode } from "react";

export const metadata = {
  title: "mockservers",
  description: "Hosted, file-defined mock API server",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
