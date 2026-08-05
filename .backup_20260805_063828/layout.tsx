import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Providers } from "./providers";

export const metadata: Metadata = {
  title: "LAST HOPE // STALKER RP — DayZ Interactive Map",
  description: "Interactive map for Last Hope — Stalker RP server on DayZ. Anomalies, artifacts, faction bases, radiation zones, and more.",
  icons: {
    icon: "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>☠️</text></svg>",
  },
};

// Браузеру запрещено зумить страницу: два пальца идут в карту.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ru" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=Oswald:wght@400;500;600;700&family=Share+Tech+Mono&family=Inter:wght@400;500&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="zone-app">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
