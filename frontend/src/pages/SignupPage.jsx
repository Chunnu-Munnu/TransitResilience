import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "../state/authStore.jsx";
import { useTheme } from "../state/themeStore.jsx";
import Button from "../components/shared/Button";
import ThemeToggle from "../components/shared/ThemeToggle";

// New passenger accounts only -- operator access stays the two fixed demo
// logins on the sign-in page. Sign up is username + email + password;
// sign in afterwards is just username + password, same as any other account.
export default function SignupPage() {
  const { signup, login } = useAuth();
  const navigate = useNavigate();
  const { isDark, setIsDark } = useTheme();
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState(null);

  function submit(e) {
    e.preventDefault();
    setError(null);
    if (password !== confirmPassword) { setError("Passwords don't match."); return; }
    const result = signup(username, email, password);
    if (!result.ok) { setError(result.error); return; }
    // Sign the new account straight in rather than bouncing them back to a
    // second form -- they just proved they know the password.
    const loginResult = login(username.trim().toLowerCase(), password);
    navigate(loginResult.ok && loginResult.role === "operator" ? "/admin" : "/", { replace: true });
  }

  return (
    <div className={`login-page ${isDark ? "dark" : "light"}`}>
      <div className="login-top-right-header">
        <ThemeToggle isDark={isDark} onToggle={setIsDark} />
      </div>

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

      <section className="login-form-side">
        <form className="login-form" onSubmit={submit}>
          <h2>Create your account</h2>
          <p className="login-form-sub">Passenger accounts only -- operators use the two demo logins on Sign In.</p>

          <label className="field-label" htmlFor="signup-user">Username</label>
          <input id="signup-user" type="text" value={username} onChange={(e) => setUsername(e.target.value)} autoFocus autoComplete="username" />

          <label className="field-label" htmlFor="signup-email">Email</label>
          <input id="signup-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" placeholder="you@example.com" />

          <label className="field-label" htmlFor="signup-pass">Password</label>
          <input id="signup-pass" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" />

          <label className="field-label" htmlFor="signup-pass-confirm">Confirm password</label>
          <input id="signup-pass-confirm" type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} autoComplete="new-password" />

          {error && <p className="login-error">{error}</p>}

          <Button full type="submit" className="login-submit-btn">Create account</Button>

          <p className="login-note">
            Already have an account? <Link to="/login">Sign in</Link>
          </p>
        </form>
      </section>
    </div>
  );
}
