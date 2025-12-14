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
      className="btn-base btn-ghost"
    >
      <Icon className="text-sm" />
      <span className="text-xs font-medium">{label}</span>
    </button>
  );
}
