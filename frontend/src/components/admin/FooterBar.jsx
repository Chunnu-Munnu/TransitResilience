import { formatClock, useSimulation } from "../../hooks/useSimulation";

// Section 11's compact footer strip: Simulation Time | Passenger Impact | Conflicts | Services.
export default function FooterBar({ metrics, recommendations }) {
  const { clockMin, paused, toggle } = useSimulation();
  const pendingCount = recommendations.filter((r) => r.status === "pending").length;

  return (
    <>
      <button className="play-btn" onClick={toggle}>{paused ? "▶" : "⏸"}</button>
      <span className="mono">{formatClock(clockMin)}</span>
      <div className="foot-stat"><span className="n mono">{(metrics.passenger_minutes_saved ?? 0).toLocaleString()}</span><span className="l">Passenger-Min Saved</span></div>
      <div className="foot-stat"><span className="n mono">{metrics.conflicts_before ?? 0}</span><span className="l">Conflicts</span></div>
      <div className="foot-stat"><span className="n mono">{pendingCount}</span><span className="l">Services Affected</span></div>
    </>
  );
}
