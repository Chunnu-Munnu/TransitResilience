import { Navigate } from "react-router-dom";
import { useAuth } from "../state/authStore.jsx";

export default function RequireRole({ role, children }) {
  const { role: currentRole } = useAuth();
  if (!currentRole) return <Navigate to="/login" replace />;
  if (role && currentRole !== role) return <Navigate to={currentRole === "operator" ? "/admin" : "/"} replace />;
  return children;
}
