"use client";

import { PrimeReactProvider } from "primereact/api";
import { ThemeProvider } from "@/context/ThemeContext";

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <PrimeReactProvider>
      <ThemeProvider>{children}</ThemeProvider>
    </PrimeReactProvider>
  );
}
