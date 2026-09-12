import React from "react";

/**
 * Switch component for Night / Dark mode toggle.
 * Uses exact sliding sun-to-moon CSS mechanism.
 */
export default function ThemeToggle({ isDark, onToggle }) {
  return (
    <label className="switch" title={`Switch to ${isDark ? "light" : "dark"} mode`}>
      <input
        type="checkbox"
        checked={isDark}
        onChange={(e) => onToggle(e.target.checked)}
        aria-label="Toggle light/dark mode"
      />
      <span className="slider" />
    </label>
  );
}
