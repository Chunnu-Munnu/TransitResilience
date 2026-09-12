import { formatClock } from "../../hooks/useSimulation";

// Section 26/47: passengers get actionable consequences, never internal
// model details -- no severity scores, no tiers, no constraint traces.
export default function ServiceAlerts({ recommendations, clockMin }) {
  const approved = recommendations.filter((r) => r.status === "approved");
  const pending = recommendations.filter((r) => r.status === "pending");

  if (!approved.length && !pending.length) {
    return (
      <div className="card">
        <h2>Service Alerts</h2>
        <p className="empty">No active alerts. All services running normally.</p>
      </div>
    );
  }

  return (
    <div className="card">
      <h2>Service Alerts</h2>
      {approved.map((r) => (
        <div className="service-update" key={r.id}>
          <div className="service-update-title">SERVICE UPDATE</div>
          <p>{r.train_id} has been rerouted due to flooding near {r.affected_segment_id.replace("_", "–")}.</p>
          <div className="route-chain proposed">{r.plan.approved_route.join(" → ")}</div>
          <div className="kv-row"><span>Updated ETA</span><span className="mono">{formatClock(clockMin + 2)}</span></div>
        </div>
      ))}
      {pending.map((r) => (
        <div className="alert-row" key={r.id}>
          <div className="alert-icon mid">⚠</div>
          <div>
            <div className="alert-title">Heavy rainfall affecting {r.affected_segment_id.replace("_", "–")} services.</div>
            <div className="alert-sub">Some trains are being rerouted. Please check your updated ETA.</div>
          </div>
        </div>
      ))}
    </div>
  );
}
