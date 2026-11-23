import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Lakeshore Holiday Spirit Survivor 2026",
  description: "Live standings, fair daily draws, and gift-card tracking for the Lakeshore staff holiday game.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
