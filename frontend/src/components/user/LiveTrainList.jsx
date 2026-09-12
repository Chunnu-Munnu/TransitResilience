import StatusBadge from "../shared/StatusBadge";

// Section 25 -- passengers see status/route/ETA only, never model internals.
export default function LiveTrainList({ trains }) {
  return (
    <div className="card" style={{ flex: 1 }}>
      <h2>Live Trains</h2>
      {trains.slice(0, 8).map((t) => (
        <div className="train-row" key={t.id}>
          <div className="train-icon">{t.id.replace("T", "")}</div>
          <div className="train-meta">
            <div className="id">{t.id}</div>
            <div className="route">{t.departure_station} → {t.terminus_station}</div>
          </div>
          <StatusBadge status={t.status} delayMin={t.delay_min} />
        </div>
      ))}
    </div>
  );
}
