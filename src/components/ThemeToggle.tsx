"use client";

import { FaMoon, FaSun } from "react-icons/fa";
import { useTheme } from "@/context/ThemeContext";

export default function ThemeToggle() {
  const { mode, toggleMode } = useTheme();

  const Icon = mode === "dark" ? FaMoon : FaSun;
  const label = mode === "dark" ? "Dark mode" : "Light mode";

  return (
    <button
      type="button"
      onClick={toggleMode}
      aria-label="Toggle theme"
      className="btn-base btn-ghost rounded-full text-xs sm:text-sm inline-flex items-center gap-2"
    >
      <Icon className="text-sm" aria-hidden="true" />
      <span className="text-xs font-medium">{label}</span>
    </button>
  );
}
