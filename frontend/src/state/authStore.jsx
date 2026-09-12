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

  function login(username, password) {
    const entry = CREDENTIALS[username];
    if (!entry || entry.password !== password) return { ok: false, error: "Invalid username or password." };
    sessionStorage.setItem("tr_role", entry.role);
    setRole(entry.role);
    return { ok: true, role: entry.role };
  }

  function logout() {
    sessionStorage.removeItem("tr_role");
    setRole(null);
  }

  return <AuthContext.Provider value={{ role, login, logout }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
