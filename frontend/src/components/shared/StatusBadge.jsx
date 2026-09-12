const LABELS = { on_time: "On Time", delayed: "Delayed", at_risk: "At Risk", rerouting: "Rerouting" };

export default function StatusBadge({ status, delayMin }) {
  const label = status === "delayed" && delayMin ? `+${delayMin}m` : LABELS[status] || status;
  return <span className={`status-pill status-${status}`}>{label}</span>;
}
