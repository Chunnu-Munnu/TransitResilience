import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../state/authStore.jsx";

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(null);

  function submit(e) {
    e.preventDefault();
    const result = login(username.trim().toLowerCase(), email.trim(), password);
    if (!result.ok) { setError(result.error); return; }
    navigate(result.role === "operator" ? "/admin" : "/", { replace: true });
  }

  function quickFill(u) {
    setUsername(u); setEmail(`${u}@transitresilience.demo`); setPassword(u); setError(null);
  }

  return (
    <div className="login-page">
      {/* Left: the pitch. Right: the form. */}
      <section className="login-pitch">
        <div className="login-brand">
          <div className="logo" />
          <span>TransitResilience</span>
        </div>

        <h1>We don't report delays.<br />We predict them.</h1>
        <p className="login-sub">
          Hazard-aware operations for the Mumbai Central Line — predicting disruption before it happens,
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

      <section className="login-form-side">
        <form className="login-form" onSubmit={submit}>
          <h2>Sign in</h2>
          <p className="login-form-sub">Choose the view you want to open.</p>

          <label className="field-label" htmlFor="login-user">Username</label>
          <input id="login-user" type="text" value={username} onChange={(e) => setUsername(e.target.value)} autoFocus autoComplete="username" />

          <label className="field-label" htmlFor="login-email">Email</label>
          <input id="login-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" placeholder="you@example.com" />

          <label className="field-label" htmlFor="login-pass">Password</label>
          <input id="login-pass" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />

          {error && <p className="login-error">{error}</p>}

          <button className="btn-primary full" type="submit">Sign In</button>

          <div className="login-divider"><span>or open a demo account</span></div>

          <div className="login-roles">
            <button type="button" className="role-card" onClick={() => quickFill("user")}>
              <span className="role-name">Passenger</span>
              <span className="role-desc">Track one journey, get live reroute alerts</span>
              <span className="role-cred mono">user / user</span>
            </button>
            <button type="button" className="role-card" onClick={() => quickFill("admin")}>
              <span className="role-name">Operator</span>
              <span className="role-desc">Full control room — approve or reject AI plans</span>
              <span className="role-cred mono">admin / admin</span>
            </button>
          </div>

          <p className="login-note">
            Demo credentials only — this is role selection for a prototype, not real authentication.
          </p>
        </form>
      </section>
    </div>
  );
}
