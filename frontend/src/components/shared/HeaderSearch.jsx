import { useState } from "react";
import { api } from "../../services/api";

export default function HeaderSearch({ onSelectTrain }) {
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  async function handleSearch(e) {
    e.preventDefault();
    const val = query.trim().toUpperCase();
    if (!val) return;

    setLoading(true);
    setError(null);

    try {
      const train = await api.getTrain(val);
      if (train && train.id) {
        onSelectTrain(train);
        setQuery("");
      } else {
        setError(`Train '${val}' not found`);
        setTimeout(() => setError(null), 3500);
      }
    } catch {
      setError(`Train '${val}' not found`);
      setTimeout(() => setError(null), 3500);
    } finally {
      setLoading(false);
    }
  }

  return (
    <form className="header-search-form" onSubmit={handleSearch} style={{ position: "relative", display: "flex", alignItems: "center" }}>
      <div className="header-search-wrapper" style={{ position: "relative", display: "flex", alignItems: "center" }}>
        <span className="search-icon" style={{ position: "absolute", left: "10px", fontSize: "0.8rem", color: "var(--ink-soft, #95A2B8)", pointerEvents: "none" }}>
          🔍
        </span>
        <input
          type="text"
          className="header-search-input"
          placeholder=" (e.g. T108)"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            if (error) setError(null);
          }}
          disabled={loading}
          style={{
            padding: "6px 12px 6px 30px",
            fontSize: "0.8rem",
            borderRadius: "20px",
            border: "1px solid var(--border, #E2E7F0)",
            background: "var(--surface2, #F7F9FC)",
            color: "var(--ink, #152238)",
            outline: "none",
            width: "190px",
            transition: "all 200ms ease",
          }}
        />
        {loading && <span style={{ position: "absolute", right: "10px", fontSize: "0.72rem", color: "var(--blue)" }}>...</span>}
      </div>
      {error && (
        <span style={{ position: "absolute", top: "34px", left: "0", fontSize: "0.72rem", color: "var(--red, #D64545)", background: "var(--surface)", padding: "4px 8px", borderRadius: "6px", border: "1px solid var(--border)", boxShadow: "0 4px 12px rgba(0,0,0,0.15)", zIndex: 100, whiteSpace: "nowrap" }}>
          {error}
        </span>
      )}
    </form>
  );
}
