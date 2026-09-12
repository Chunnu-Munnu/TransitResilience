import React from "react";

/**
 * Compact Concentric Partial-Ring SVG Signal Loader.
 * Designed specifically for inline header and banner connection status ("reconnecting" state).
 * Scaled footprint (20-28px) with staggered 3-ring spin animations.
 * Uses established amber/warning token (--amber: #F59E0B / #F0B94C) and theme border track token.
 */
export default function Loader({ size = 22, showText = false, text = "Reconnecting…" }) {
  return (
    <span className="compact-loader" style={{ "--loader-size": `${size}px` }}>
      <svg className="loader-svg" viewBox="0 0 24 24" aria-hidden="true">
        {/* Outer Ring */}
        <circle className="loader-track" cx="12" cy="12" r="10" />
        <circle className="loader-ring loader-ring-outer" cx="12" cy="12" r="10" />

        {/* Middle Ring */}
        <circle className="loader-track" cx="12" cy="12" r="6.5" />
        <circle className="loader-ring loader-ring-mid" cx="12" cy="12" r="6.5" />

        {/* Inner Ring */}
        <circle className="loader-track" cx="12" cy="12" r="3" />
        <circle className="loader-ring loader-ring-inner" cx="12" cy="12" r="3" />
      </svg>
      {showText && <span className="loader-text">{text}</span>}
    </span>
  );
}
