// src/context/ThemeContext.tsx
"use client";

/* eslint-disable react-hooks/set-state-in-effect */

import {
  createContext,
  useContext,
  useEffect,
  useState,
  ReactNode,
} from "react";

type ThemeMode = "light" | "dark" | "system";
type ResolvedTheme = "light" | "dark";

interface ThemeContextValue {
  mode: ThemeMode; // stored preference: light / dark / system
  resolvedTheme: ResolvedTheme; // actual active theme
  setMode: (mode: ThemeMode) => void;
  cycleMode: () => void; // system → light → dark → system
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

const STORAGE_KEY = "admin-theme";

function getPreferredSystemTheme(): ResolvedTheme {
  if (typeof window === "undefined" || !window.matchMedia) {
    return "dark";
  }
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  // IMPORTANT: same initial values on server and client → no hydration mismatch
  const [mode, setModeState] = useState<ThemeMode>("system");
  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>("dark");
  const [mounted, setMounted] = useState(false);

  // Initial sync (runs only on client)
  useEffect(() => {
    let initialMode: ThemeMode = "system";

    if (typeof window !== "undefined") {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (stored === "light" || stored === "dark" || stored === "system") {
        initialMode = stored;
      }
    }

    const systemTheme = getPreferredSystemTheme();
    const effective =
      initialMode === "system" ? systemTheme : (initialMode as ResolvedTheme);

    setModeState(initialMode);
    setResolvedTheme(effective);

    if (typeof document !== "undefined") {
      document.documentElement.setAttribute("data-theme", effective);
    }
    if (typeof window !== "undefined") {
      window.localStorage.setItem(STORAGE_KEY, initialMode);
    }

    setMounted(true);
  }, []);

  // When mode changes after mount → recompute and apply
  useEffect(() => {
    if (!mounted) return;

    const systemTheme = getPreferredSystemTheme();
    const effective = mode === "system" ? systemTheme : (mode as ResolvedTheme);

    setResolvedTheme(effective);

    if (typeof document !== "undefined") {
      document.documentElement.setAttribute("data-theme", effective);
    }
    if (typeof window !== "undefined") {
      window.localStorage.setItem(STORAGE_KEY, mode);
    }
  }, [mode, mounted]);

  const setMode = (next: ThemeMode) => {
    setModeState(next);
  };

  const cycleMode = () => {
    setModeState((prev) => {
      if (prev === "system") return "light";
      if (prev === "light") return "dark";
      return "system";
    });
  };

  const value: ThemeContextValue = {
    mode,
    resolvedTheme,
    setMode,
    cycleMode,
  };

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error("useTheme must be used within ThemeProvider");
  }
  return ctx;
}
