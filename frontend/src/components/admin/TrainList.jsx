import StatusBadge from "../shared/StatusBadge";

export default function TrainList({ trains, selectedTrainId, onSelect }) {
  return (
    <div className="card train-list-card" style={{ flex: 1, minHeight: "240px", display: "flex", flexDirection: "column" }}>
      <h2 style={{ flexShrink: 0, marginBottom: "10px" }}>Trains ({trains.length})</h2>
      <div style={{ flex: 1, overflowY: "auto", minHeight: "160px", paddingRight: "4px" }}>
        {trains.map((t) => (
          <div
            key={t.id}
            className={`train-row ${t.id === selectedTrainId ? "selected" : ""}`}
            onClick={() => onSelect && onSelect(t.id)}
          >
            <span className={`train-dot ${t.status}`} />
            <div className="train-meta">
              <div className="id">{t.id} · {t.route_code}</div>
              <div className="route">{t.route_name || t.service_type} · {t.departure_station} → {t.terminus_station}</div>
            </div>
            <StatusBadge status={t.status} delayMin={t.delay_min} />
          </div>
        ))}
      </div>
    </div>
  );
}
