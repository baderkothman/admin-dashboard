// src/components/ThemeToggle.tsx
"use client";

import { useTheme } from "@/context/ThemeContext";
import { FaSun, FaMoon, FaDesktop } from "react-icons/fa";

export default function ThemeToggle() {
  const { mode, resolvedTheme, cycleMode } = useTheme();

  const label =
    mode === "system"
      ? `System (${resolvedTheme === "dark" ? "Dark" : "Light"})`
      : mode === "dark"
      ? "Dark mode"
      : "Light mode";

  const Icon =
    mode === "system" ? FaDesktop : resolvedTheme === "dark" ? FaMoon : FaSun;

  return (
    <button
      type="button"
      onClick={cycleMode}
      aria-label="Toggle theme"
      className="inline-flex items-center gap-2 rounded-full border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs font-medium hover:bg-slate-800 transition-colors"
    >
      <Icon className="text-slate-200" />
      <span>{label}</span>
    </button>
  );
}
