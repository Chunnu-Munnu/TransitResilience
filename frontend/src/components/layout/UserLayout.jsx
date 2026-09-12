import Header from "../shared/Header";
import Notification from "../shared/Notification";
import { formatClock, useSimulation } from "../../hooks/useSimulation";

export default function UserLayout({ left, map, right, connectionStatus, onLogout }) {
  const { clockMin } = useSimulation();
  return (
    <div className="app-shell light">
      <Header
        variant="light"
        tagline="Safer Journeys. Stronger Tomorrow."
        nav={<span className="nav-context">Live journey tracking · Mumbai Central Line</span>}
        right={
          <>
            <span className="clock mono">{formatClock(clockMin)}</span>
            {onLogout && <button className="operator-tag light" onClick={onLogout}>Log out</button>}
          </>
        }
      />
      <Notification connectionStatus={connectionStatus} lastUpdateClock={formatClock(clockMin)} />
      <div className={`user-layout ${!right ? "no-right" : ""}`}>
        <div className="col left">{left}</div>
        <div className="col center">{map}</div>
        {right && <div className="col right">{right}</div>}
      </div>
    </div>
  );
}
