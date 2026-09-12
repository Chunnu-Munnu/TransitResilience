import StatusBadge from "../shared/StatusBadge";
import { arrivalMinuteOfDay, formatClock12 } from "../../utils/eta";

export default function TrainDetails({ train, hazards, clockMin, recommendation }) {
  if (!train) {
    return (
      <div className="card">
        <h2>Selected Train</h2>
        <p className="empty">Select a train on the map or list.</p>
      </div>
    );
  }

  const seg = hazards[Math.min(train.current_segment_index, hazards.length - 1)];
  const terminusOrder = hazards.length + 1; // N segments => N+1 stations
  // "Current" = the schedule if nothing had gone wrong; "predicted" = with accrued delay.
  const scheduleOnly = { ...train, delay_min: 0 };
  const currentEta = arrivalMinuteOfDay(scheduleOnly, terminusOrder, clockMin, hazards.length);
  const predictedEta = arrivalMinuteOfDay(train, terminusOrder, clockMin, hazards.length);

  return (
    <div className="card">
      <h2>Selected Train</h2>
      <div className="train-detail-head">
        <b>{train.id}</b>
        <StatusBadge status={train.status} delayMin={train.delay_min} />
      </div>
      <div className="muted">{train.route_name || train.service_type} · {train.departure_station} → {train.terminus_station}</div>

      <div className="kv-row"><span>Current location</span><span>{seg ? seg.from : train.terminus_station}</span></div>
      <div className="kv-row"><span>Scheduled ETA</span><span className="mono">{formatClock12(currentEta)}</span></div>
      <div className="kv-row"><span>Predicted ETA</span><span className="mono">{formatClock12(predictedEta)}</span></div>
      <div className="kv-row"><span>Additional delay</span><span className={train.delay_min > 0 ? "warn-text" : ""}>+{train.delay_min || 0} min</span></div>
      {train.hazard_segment_ahead ? (
        <>
          <div className="kv-row"><span>Hazard ahead</span><span>{train.hazard_segment_ahead.replace("_", " → ")}</span></div>
          <div className="kv-row"><span>Risk on that segment</span><span className="warn-text">{((train.risk_ahead ?? 0) * 100).toFixed(0)}%</span></div>
          <div className="kv-row"><span>Reaches it in</span><span className="mono">{train.minutes_to_hazard} min</span></div>
        </>
      ) : (
        <div className="kv-row"><span>Hazard ahead</span><span className="ok-text">None within look-ahead</span></div>
      )}

      {recommendation && (
        <div className="route-compare">
          <div className="route-label">Current Route</div>
          <div className="route-chain">{recommendation.plan.previous_route.join(" → ")}</div>
          <div className="route-label">Proposed Route</div>
          <div className="route-chain proposed">{recommendation.plan.approved_route.join(" → ")}</div>
        </div>
      )}
    </div>
  );
}
