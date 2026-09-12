export default function MetricCard({ value, label, tone }) {
  return (
    <div className={`stat-tile ${tone || ""}`}>
      <div className="n">{value}</div>
      <div className="l">{label}</div>
    </div>
  );
}
