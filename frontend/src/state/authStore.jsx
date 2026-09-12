// Deliberately NOT real authentication (Section 49 excludes auth from the MVP) --
// this is a client-side-only role gate. Two hardcoded demo accounts exist
// (user/user -> passenger, admin/admin -> operator) so the passenger vs.
// operator screens can be demoed as two distinct logins. Anyone can also
// create a new passenger account via sign-up (username + email + password) --
// those accounts are persisted in localStorage (there's no backend user
// store), so they survive a refresh but only on that browser.
import { createContext, useContext, useState } from "react";

const DEMO_CREDENTIALS = {
  user: { password: "user", role: "passenger", email: null },
  admin: { password: "admin", role: "operator", email: null },
};

const REGISTERED_USERS_KEY = "tr_registered_users";

function loadRegisteredUsers() {
  try {
    const raw = localStorage.getItem(REGISTERED_USERS_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveRegisteredUsers(users) {
  try {
    localStorage.setItem(REGISTERED_USERS_KEY, JSON.stringify(users));
  } catch {
    // ignore storage errors
  }
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [role, setRole] = useState(() => sessionStorage.getItem("tr_role"));
  const [email, setEmail] = useState(() => sessionStorage.getItem("tr_email") || null);

  // Sign in is just username + password -- signed-up accounts don't need to
  // re-type their email every time, only prove they know the password.
  function login(username, password) {
    const uname = username.trim().toLowerCase();
    const registered = loadRegisteredUsers();
    const entry = DEMO_CREDENTIALS[uname] || registered[uname];
    if (!entry || entry.password !== password) return { ok: false, error: "Invalid username or password." };
    sessionStorage.setItem("tr_role", entry.role);
    if (entry.email) sessionStorage.setItem("tr_email", entry.email);
    else sessionStorage.removeItem("tr_email");
    setRole(entry.role);
    setEmail(entry.email || null);
    return { ok: true, role: entry.role };
  }

  // Sign up requires an email (that's the whole point of the separate flow) --
  // new accounts are always passengers, matching every other rider signup.
  function signup(username, email, password) {
    const uname = username.trim().toLowerCase();
    if (!uname) return { ok: false, error: "Choose a username." };
    if (!EMAIL_RE.test(email.trim())) return { ok: false, error: "Enter a valid email address." };
    if (!password || password.length < 4) return { ok: false, error: "Password must be at least 4 characters." };
    if (DEMO_CREDENTIALS[uname]) return { ok: false, error: "That username is reserved. Choose another." };
    const registered = loadRegisteredUsers();
    if (registered[uname]) return { ok: false, error: "That username is already taken." };
    registered[uname] = { password, role: "passenger", email: email.trim() };
    saveRegisteredUsers(registered);
    return { ok: true };
  }

  function logout() {
    sessionStorage.removeItem("tr_role");
    sessionStorage.removeItem("tr_email");
    setRole(null);
    setEmail(null);
  }

  return <AuthContext.Provider value={{ role, email, login, signup, logout }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
