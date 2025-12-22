import type { Metadata } from "next";
import Script from "next/script";
import { DM_Sans, Geist_Mono } from "next/font/google";

// PrimeReact + icons
import "primeicons/primeicons.css";
import "primereact/resources/primereact.min.css";

// Leaflet
import "leaflet/dist/leaflet.css";

// Your app CSS MUST be last
import "./globals.css";

import { ThemeProvider } from "@/context/ThemeContext";

const uiFont = DM_Sans({
  subsets: ["latin"],
  variable: "--font-ui",
  weight: ["100", "200", "300", "400", "500", "600", "700", "800", "900"],
});

const monoFont = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
});

export const metadata: Metadata = {
  title: "Admin Dashboard",
  description: "Geofence admin dashboard",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" data-theme="dark" suppressHydrationWarning>
      <head>
        {/* Prevent theme flash */}
        <Script
          id="theme-init"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{
            __html: `
(function () {
  try {
    var stored = localStorage.getItem("admin-theme");
    var theme = (stored === "light" || stored === "dark") ? stored : "dark";
    document.documentElement.setAttribute("data-theme", theme);
    document.documentElement.style.colorScheme = theme;
  } catch (e) {}
})();
            `,
          }}
        />
      </head>

      <body
        suppressHydrationWarning
        className={`${uiFont.variable} ${monoFont.variable} antialiased`}
      >
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
