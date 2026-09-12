function timeLabel(ts) {
  if (!ts) return "";
  return new Date(ts * 1000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export default function ActiveEvents({ recommendations, manualEvents, onSelect }) {
  const pending = recommendations.filter((r) => r.status === "pending");

  if (!pending.length && !manualEvents.length) {
    return (
      <div className="card">
        <h2>Active Events</h2>
        <p className="empty">No active events.</p>
      </div>
    );
  }

  return (
    <div className="card">
      <h2>Active Events</h2>
      <div className="event-list">
        {pending.map((c) => (
          <div className="event-row" key={c.id} onClick={() => onSelect && onSelect(c.train_id)}>
            <div className={`event-icon ${c.tier === "senior" ? "high" : "mid"}`}>!</div>
            <div>
              <div className="event-title">Flood Risk — {c.affected_segment_id.replace("_", " → ")}</div>
              <div className="event-sub">{(c.severity * 100).toFixed(0)}% risk · affecting {c.train_id}</div>
            </div>
            <div className="event-time">{timeLabel(c.created_at)}</div>
          </div>
        ))}
        {manualEvents.map((e, i) => (
          <div className="event-row" key={`m-${i}`}>
            <div className={`event-icon ${e.type === "authority_alert" ? "high" : "mid"}`}>{e.type === "authority_alert" ? "⚠" : "!"}</div>
            <div>
              <div className="event-title">
                {e.type === "authority_alert" ? `Authority Notified — ${e.authority}` :
                 e.type === "driver_alert" ? "Driver Attention Alert" : "Track Maintenance"}
              </div>
              <div className="event-sub">
                {e.type === "authority_alert" ? e.text : `${e.vehicle_id || e.train_id || ""} ${e.severity || ""} ${e.text || ""}`}
              </div>
            </div>
            <div className="event-time">{timeLabel(e.timestamp)}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
