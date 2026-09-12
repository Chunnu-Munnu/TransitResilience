import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../state/authStore.jsx";
import { useTheme } from "../state/themeStore.jsx";
import Button from "../components/shared/Button";
import ThemeToggle from "../components/shared/ThemeToggle";

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const { isDark, setIsDark } = useTheme();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(null);

  function submit(e) {
    e.preventDefault();
    const result = login(username.trim().toLowerCase(), password);
    if (!result.ok) { setError(result.error); return; }
    navigate(result.role === "operator" ? "/admin" : "/", { replace: true });
  }

  function quickFill(u) {
    setUsername(u); setPassword(u); setError(null);
  }

  return (
    <div className={`login-page ${isDark ? "dark" : "light"}`}>
      {/* Page-level top-right theme toggle switch */}
      <div className="login-top-right-header">
        <ThemeToggle isDark={isDark} onToggle={setIsDark} />
      </div>

      {/* Left: the pitch */}
      <section className="login-pitch">
        <div className="login-brand">
          <div className="logo" />
          <span>TransitResilience</span>
        </div>

        <h1>We don't report delays.<br />We predict them.</h1>
        <p className="login-sub">
          Hazard-aware operations for the Mumbai Central Line predicting disruption before it happens,
          tracing it across the network, and proposing a plan a human signs off on.
        </p>

        <div className="login-stats">
          <div><span className="n">14</span><span className="l">Real stations</span></div>
          <div><span className="n">12</span><span className="l">Live services</span></div>
          <div><span className="n">10 yr</span><span className="l">Rainfall data</span></div>
        </div>

        <div className="login-loop">
          {["Predict", "Propagate", "Optimize", "Approve", "Notify"].map((step, i) => (
            <span key={step}>
              <span className="loop-step">{step}</span>
              {i < 4 && <span className="loop-arrow">→</span>}
            </span>
          ))}
        </div>
      </section>

      {/* Right: the form */}
      <section className="login-form-side">
        <form className="login-form" onSubmit={submit}>
          <h2>Sign in</h2>
          <p className="login-form-sub">Choose the view you want to open.</p>

          <label className="field-label" htmlFor="login-user">Username</label>
          <input id="login-user" type="text" value={username} onChange={(e) => setUsername(e.target.value)} autoFocus autoComplete="username" />

          <label className="field-label" htmlFor="login-pass">Password</label>
          <input id="login-pass" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />

          {error && <p className="login-error">{error}</p>}

          <Button full type="submit" className="login-submit-btn">Sign In</Button>

          <div className="login-divider"><span>or open a demo account</span></div>

          <div className="login-roles">
            <button type="button" className="role-card" onClick={() => quickFill("user")}>
              <span className="role-name">Passenger</span>
              <span className="role-desc"></span>
              <span className="role-cred mono">user</span>
            </button>
            <button type="button" className="role-card" onClick={() => quickFill("admin")}>
              <span className="role-name">Operator</span>
              <span className="role-desc"></span>
              <span className="role-cred mono">admin</span>
            </button>
          </div>

          <p className="login-note">
            
          </p>
        </form>
      </section>
    </div>
  );
}
