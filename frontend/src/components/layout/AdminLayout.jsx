import Header from "../shared/Header";
import Notification from "../shared/Notification";
import Loader from "../shared/Loader";
import AdminNav from "../admin/AdminNav";
import { formatClock, useSimulation } from "../../hooks/useSimulation";
import { useAuth } from "../../state/authStore.jsx";

export default function AdminLayout({ left, map, right, footer, connectionStatus, activeTab = "operations" }) {
  const { clockMin } = useSimulation();
  const { logout } = useAuth();

  const isReconnecting = connectionStatus !== "open";

  return (
    <div className="app-shell dark">
      <Header
        variant="dark"
        tagline="Operations Console"
        nav={<AdminNav activeTab={activeTab} />}
        right={
          <>
            <span className="sim-status">
              {isReconnecting ? (
                <Loader size={20} />
              ) : (
                <span className="dot" />
              )}
              Simulation: {connectionStatus === "open" ? "LIVE" : "RECONNECTING"}
            </span>
            <span className="clock mono">{formatClock(clockMin)}</span>
            <button className="operator-tag" style={{ cursor: "pointer" }} onClick={logout}>Operator · Log out</button>
          </>
        }
      />
      <Notification connectionStatus={connectionStatus} lastUpdateClock={formatClock(clockMin)} />
      <div key={activeTab} className="admin-layout-fade">
        <div className="admin-layout">
          <div className="col left">{left}</div>
          <div className="col center">{map}</div>
          <div className="col right">{right}</div>
        </div>
      </div>
      <footer className="admin-footer">{footer}</footer>
    </div>
  );
}
