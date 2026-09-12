import React, { useState } from "react";

/**
 * Reusable Floating Label Input Component with Expanding Underline Animation.
 * Label animates up and shrinks on focus or when filled (~0.3s transition).
 * Accent color: var(--blue, #2F6FED)
 * Border token: var(--border)
 */
export default function Input({
  label,
  value,
  onChange,
  onKeyDown,
  placeholder,
  id,
  type = "text",
  required = false,
  autoComplete = "off",
  className = "",
  error = null,
  disabled = false,
}) {
  const [isFocused, setIsFocused] = useState(false);
  const isFilled = value !== undefined && value !== null && String(value).length > 0;

  return (
    <div className={`floating-input-group ${isFocused ? "focused" : ""} ${isFilled ? "filled" : ""} ${error ? "has-error" : ""} ${className}`}>
      <input
        id={id}
        type={type}
        value={value}
        onChange={onChange}
        onFocus={() => setIsFocused(true)}
        onBlur={() => setIsFocused(false)}
        onKeyDown={onKeyDown}
        required={required}
        autoComplete={autoComplete}
        disabled={disabled}
        className="floating-input-field"
        placeholder={isFocused ? placeholder : ""}
      />
      {label && (
        <label htmlFor={id} className="floating-input-label">
          {label}
        </label>
      )}
      <span className="floating-input-underline" />
      {error && <span className="floating-input-error">{error}</span>}
    </div>
  );
}
