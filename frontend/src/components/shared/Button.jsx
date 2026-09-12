import React from "react";

/**
 * Reusable Button component matching the TransitResilience design system.
 * Interaction pattern:
 * - Solid fill background at rest, icon + text both in high-contrast color.
 * - On hover: background transitions to transparent, border remains, and text & icon fill transition to accent color.
 * - Inherits exact page font-family.
 */
export default function Button({
  children,
  type = "button",
  onClick,
  className = "",
  full = false,
  showIcon = true,
  disabled = false,
  ...props
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`btn-interactive ${full ? "full" : ""} ${className}`}
      {...props}
    >
      <span>{children}</span>
      {showIcon && (
        <svg
          className="btn-arrow-icon"
          viewBox="0 0 20 20"
          width="16"
          height="16"
          aria-hidden="true"
        >
          <path
            d="M10.293 3.293a1 1 0 011.414 0l6 6a1 1 0 010 1.414l-6 6a1 1 0 01-1.414-1.414L14.586 11H3a1 1 0 110-2h11.586l-4.293-4.293a1 1 0 010-1.414z"
            fill="currentColor"
          />
        </svg>
      )}
    </button>
  );
}
