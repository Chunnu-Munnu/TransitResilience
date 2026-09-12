// Deliberately NOT real authentication (Section 49 excludes auth from the MVP) --
// this is a hardcoded, client-side-only role gate so the passenger vs. operator
// screens can be demoed as two distinct logins, as requested. Credentials are
// intentionally simple and public: user/user, admin/admin.
import { createContext, useContext, useState } from "react";

const CREDENTIALS = {
  user: { password: "user", role: "passenger" },
  admin: { password: "admin", role: "operator" },
};

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [role, setRole] = useState(() => sessionStorage.getItem("tr_role"));
  const [email, setEmail] = useState(() => sessionStorage.getItem("tr_email"));

  function login(username, email, password) {
    const entry = CREDENTIALS[username];
    if (!entry || entry.password !== password) return { ok: false, error: "Invalid username or password." };
    if (!email || !email.includes("@")) return { ok: false, error: "Enter a valid email address." };
    sessionStorage.setItem("tr_role", entry.role);
    sessionStorage.setItem("tr_email", email);
    setRole(entry.role);
    setEmail(email);
    return { ok: true, role: entry.role };
  }

  function logout() {
    sessionStorage.removeItem("tr_role");
    sessionStorage.removeItem("tr_email");
    setRole(null);
    setEmail(null);
  }

  return <AuthContext.Provider value={{ role, email, login, logout }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
