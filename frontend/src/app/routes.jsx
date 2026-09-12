import { Routes, Route, Navigate } from "react-router-dom";
import AdminDashboard from "../pages/AdminDashboard";
import UserDashboard from "../pages/UserDashboard";
import ScenarioControlPage from "../pages/ScenarioControlPage";
import DecisionLogPage from "../pages/DecisionLogPage";
import ReviewQueuePage from "../pages/ReviewQueuePage";
import LoginPage from "../pages/LoginPage";
import RequireRole from "./RequireRole";

export default function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/" element={<RequireRole role="passenger"><UserDashboard /></RequireRole>} />
      <Route path="/admin" element={<RequireRole role="operator"><AdminDashboard /></RequireRole>} />
      <Route path="/admin/review" element={<RequireRole role="operator"><ReviewQueuePage /></RequireRole>} />
      <Route path="/admin/scenario" element={<RequireRole role="operator"><ScenarioControlPage /></RequireRole>} />
      <Route path="/admin/decisions" element={<RequireRole role="operator"><DecisionLogPage /></RequireRole>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
