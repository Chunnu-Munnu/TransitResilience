import StatusBadge from "../shared/StatusBadge";

// Section 22: simpler than the admin TrainDetails -- no hazard percentages,
// no constraint internals, no operator controls.
export default function PassengerTrainDetails({ train, recommendation }) {
  if (!train) return null;
  return (
    <div className="card trip-card">
      <h2>My Trip</h2>
      <div className="train-detail-head"><b>{train.id}</b><StatusBadge status={train.status} delayMin={train.delay_min} /></div>
      <div className="muted">{train.departure_station} → {train.terminus_station}</div>
      {recommendation?.status === "approved" && (
        <div className="route-chain proposed" style={{ marginTop: 10 }}>
          {recommendation.plan.approved_route.join(" → ")}
        </div>
      )}
    </div>
  );
}
