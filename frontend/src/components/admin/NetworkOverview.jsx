import MetricCard from "../shared/MetricCard";

export default function NetworkOverview({ trains, recommendations }) {
  const atRisk = trains.filter((t) => t.status === "at_risk").length;
  const delayed = trains.filter((t) => t.status === "delayed").length;
  const rerouting = recommendations.filter((r) => r.status === "approved" && r.plan?.buses_assigned?.length).length;
  const conflicts = recommendations
    .filter((r) => r.status === "pending")
    .reduce((sum, r) => sum + Object.keys(r.plan?.hold_adjustments || {}).length, 0);

  return (
    <div className="card">
      <h2>Network Overview</h2>
      <div className="stat-grid">
        <MetricCard value={trains.length} label="Trains Active" />
        <MetricCard value={atRisk} label="At Risk" tone="risk" />
        <MetricCard value={delayed} label="Delayed" tone="warn" />
        <MetricCard value={rerouting} label="Rerouting" />
        <MetricCard value={conflicts} label="Platform Conflicts" tone="risk" />
      </div>
      <p className="threshold-hint">
        At Risk = a delay is predicted ahead but hasn't happened yet · Delayed = currently running late.
        A train is only ever one or the other.
      </p>
    </div>
  );
}
