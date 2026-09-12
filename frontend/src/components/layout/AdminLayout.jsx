import { Link } from "react-router-dom";
import Header from "../shared/Header";
import Notification from "../shared/Notification";
import { formatClock, useSimulation } from "../../hooks/useSimulation";
import { useAuth } from "../../state/authStore.jsx";

export default function AdminLayout({ left, map, right, footer, connectionStatus, activeTab = "operations" }) {
  const { clockMin } = useSimulation();
  const { logout } = useAuth();

  return (
    <div className="app-shell dark">
      <Header
        variant="dark"
        tagline="Operations Console"
        nav={
          <>
            <Link className={activeTab === "operations" ? "active" : ""} to="/admin">Operations</Link>
            <Link className={activeTab === "review" ? "active" : ""} to="/admin/review">Review Queue</Link>
            <Link className={activeTab === "scenario" ? "active" : ""} to="/admin/scenario">Scenario Control</Link>
            <Link className={activeTab === "decisions" ? "active" : ""} to="/admin/decisions">Decision Log</Link>
          </>
        }
        right={
          <>
            <span className="sim-status"><span className={`dot ${connectionStatus !== "open" ? "paused" : ""}`} /> Simulation: {connectionStatus === "open" ? "LIVE" : "RECONNECTING"}</span>
            <span className="clock mono">{formatClock(clockMin)}</span>
            <button className="operator-tag" style={{ cursor: "pointer" }} onClick={logout}>Operator · Log out</button>
          </>
        }
      />
      <Notification connectionStatus={connectionStatus} lastUpdateClock={formatClock(clockMin)} />
      <div className="admin-layout">
        <div className="col left">{left}</div>
        <div className="col center">{map}</div>
        <div className="col right">{right}</div>
      </div>
      <footer className="admin-footer">{footer}</footer>
    </div>
  );
}
