"use client";

import { FaMoon, FaSun, FaDesktop } from "react-icons/fa";
import { useTheme } from "@/context/ThemeContext";

export default function ThemeToggle() {
  const { mode, resolvedTheme, cycleMode } = useTheme();

  const Icon =
    mode === "system" ? FaDesktop : resolvedTheme === "dark" ? FaMoon : FaSun;

  const label =
    mode === "system"
      ? `System (${resolvedTheme === "dark" ? "Dark" : "Light"})`
      : resolvedTheme === "dark"
      ? "Dark mode"
      : "Light mode";

  return (
    <button
      type="button"
      onClick={cycleMode}
      aria-label="Toggle theme"
      className="btn-base btn-ghost rounded-full text-xs sm:text-sm inline-flex items-center gap-2"
    >
      <Icon className="text-sm" aria-hidden="true" />
      <span className="text-xs font-medium">{label}</span>
    </button>
  );
}
