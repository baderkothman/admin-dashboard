// src/app/layout.tsx

/**
 * RootLayout
 * ----------
 * Global shell for the entire Next.js App Router tree.
 *
 * Responsibilities:
 * - Registers Geist Sans & Geist Mono as CSS variables for consistent typography.
 * - Loads global styles (globals.css) and Leaflet styles (for all map views).
 * - Applies the base dark theme colors via Tailwind tokens:
 *     - bg-background    → uses CSS variable `--background` from globals.css
 *     - text-foreground  → uses CSS variable `--foreground` from globals.css
 *
 * Notes:
 * - `suppressHydrationWarning` on <html> is kept to avoid noisy hydration warnings
 *   if the client-side markup slightly differs from the server (for example due to
 *   browser extensions, dev tools, or minor client-only attributes).
 */

import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import "leaflet/dist/leaflet.css";

/**
 * Geist Sans
 * ----------
 * Main UI font.
 * The `variable` option exposes the font as a CSS custom property:
 *   --font-geist-sans
 * which is then consumed inside globals.css (and Tailwind) for consistent typography.
 */
const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

/**
 * Geist Mono
 * ----------
 * Monospaced font used for code-like text, small metrics, or technical labels.
 * Exposed as:
 *   --font-geist-mono
 */
const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

/**
 * Default <head> metadata for the entire app.
 * You can override this per route using `export const metadata` in a page.
 */
export const metadata: Metadata = {
  title: "Admin Dashboard",
  description: "Geofence admin dashboard",
};

/**
 * RootLayout component
 * --------------------
 * Wraps every route in the application.
 *
 * - <html lang="en">:
 *     Sets the language to English, which helps screen readers and SEO.
 *
 * - `suppressHydrationWarning`:
 *     Prevents React from spamming the console with hydration mismatch warnings
 *     when small, non-critical differences exist between server and client HTML.
 *
 * - <body className="... bg-background text-foreground">:
 *     Attaches the Geist font variables and applies the global dark theme colors.
 *     The actual colors are defined in `globals.css` using CSS variables and
 *     Tailwind’s `bg-background` / `text-foreground` design tokens.
 */
export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        {children}
      </body>
    </html>
  );
}
