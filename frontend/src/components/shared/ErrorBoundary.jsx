import React from "react";

/**
 * React Error Boundary component to prevent blank white screens on uncaught errors.
 * Catches any rendering exceptions and displays a helpful fallback UI.
 */
export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error("[ErrorBoundary caught error]:", error, errorInfo);
    this.setState({ errorInfo });
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="app-shell light" style={{ display: "flex", alignItems: "center", justify: "center", minHeight: "100vh", padding: "40px" }}>
          <div style={{ textAlign: "center", maxWidth: "480px", background: "var(--surface, #ffffff)", padding: "32px", borderRadius: "14px", border: "1px solid var(--border, #E2E7F0)", boxShadow: "0 8px 32px rgba(0,0,0,0.12)" }}>
            <div style={{ width: "48px", height: "48px", borderRadius: "50%", background: "var(--red-soft, #FBE9E9)", color: "var(--red, #D64545)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1.4rem", fontWeight: "800", margin: "0 auto 16px" }}>
              !
            </div>
            <h2 style={{ fontSize: "1.3rem", fontWeight: "700", color: "var(--ink, #152238)", margin: "0 0 8px" }}>
              Something went wrong loading this page
            </h2>
            <p style={{ fontSize: "0.85rem", color: "var(--ink-soft, #5B6B85)", lineHeight: "1.5", margin: "0 0 20px" }}>
              An unexpected error occurred while rendering the interface. Please refresh the page to retry.
            </p>
            <div style={{ display: "flex", gap: "10px", justifyContent: "center" }}>
              <button
                className="btn-interactive"
                style={{ padding: "10px 20px", fontSize: "0.85rem" }}
                onClick={() => window.location.reload()}
              >
                Refresh Page
              </button>
              <button
                className="btn-interactive"
                style={{ padding: "10px 20px", fontSize: "0.85rem", background: "transparent", color: "var(--blue, #2F6FED)" }}
                onClick={() => {
                  sessionStorage.clear();
                  window.location.href = "/";
                }}
              >
                Reset Session
              </button>
            </div>
            {this.state.error && (
              <details style={{ marginTop: "20px", textAlign: "left", fontSize: "0.75rem", color: "var(--ink-dim, #95A2B8)" }}>
                <summary style={{ cursor: "pointer", fontWeight: "600" }}>Technical Details</summary>
                <pre style={{ whiteSpace: "pre-wrap", marginTop: "8px", background: "var(--surface2, #F7F9FC)", padding: "10px", borderRadius: "6px", overflowX: "auto" }}>
                  {this.state.error.toString()}
                </pre>
              </details>
            )}
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
