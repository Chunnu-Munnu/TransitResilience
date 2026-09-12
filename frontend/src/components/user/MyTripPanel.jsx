import { useEffect, useState } from "react";
import StatusBadge from "../shared/StatusBadge";
import { loadStations, stationsForLine } from "../map/mapGeo";
import { formatClock12, tripTiming } from "../../utils/eta";

function formatCountdown(diffMin) {
  if (diffMin <= 0) return "Arriving now";
  const hours = Math.floor(diffMin / 60);
  const mins = Math.floor(diffMin % 60);
  if (hours > 0) {
    return `Arriving in ${hours}h ${mins}m`;
  }
  return `Arriving in ${mins}m`;
}

// The passenger's own trip at a glance: status, a real ETA countdown to the station they
// actually picked, journey progress bar, favorite toggle, and -- when something goes
// wrong -- their choice of options. The stop-by-stop plan lives in ItineraryPanel so
// both stay fully visible.
export default function MyTripPanel({ train, lineId, destinationCode, originCode, hazards, clockMin, recommendation, chosenOption, onChangeTrip, onSwitchTrain }) {
  const [allStations, setAllStations] = useState([]);
  const [favorites, setFavorites] = useState(() => {
    try {
      const saved = localStorage.getItem("tr_favorite_trips");
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  useEffect(() => { loadStations().then(setAllStations); }, []);

  const stations = stationsForLine(allStations, lineId);
  if (!train || !stations.length) return null;

  const destStation = stations.find((s) => s.code === destinationCode);
  const originStation = stations.find((s) => s.code === originCode);
  const destinationOrder = destStation?.order ?? stations.length;
  const originOrder = originStation?.order ?? 1;
  const segmentCount = hazards.filter((h) => h.line_id === lineId).length || stations.length - 1;

  const action = recommendation?.plan?.passenger_action;
  const busOption = action?.options?.find((o) => o.id === "switch_to_bus");
  const takingBus = chosenOption === "switch_to_bus" && busOption;

  const timing = tripTiming(train, originOrder, destinationOrder, clockMin, segmentCount);
  const railArrival = timing.arriveAt;
  const effectiveDelay = takingBus ? busOption.delay_min : (train.delay_min || 0);
  const arrival = takingBus ? railArrival - (train.delay_min || 0) + busOption.delay_min : railArrival;

  const diffMin = arrival - clockMin;

  // Journey Progress Calculation
  const totalSegments = Math.max(1, destinationOrder - originOrder);
  const currentPos = (train.current_segment_index ?? 0) + (train.progress_in_segment ?? 0);
  const originPos = originOrder - 1;
  const elapsed = Math.max(0, Math.min(totalSegments, currentPos - originPos));
  const progressPct = Math.round(Math.max(0, Math.min(100, (elapsed / totalSegments) * 100)));

  // Favorites logic
  const isFav = favorites.some((f) => f.trainId === train.id && f.origin === originCode && f.destination === destinationCode);

  function toggleFavorite() {
    let updated;
    if (isFav) {
      updated = favorites.filter((f) => !(f.trainId === train.id && f.origin === originCode && f.destination === destinationCode));
    } else {
      const newFav = { trainId: train.id, origin: originCode, destination: destinationCode, lineId, routeName: train.route_name || train.service_type };
      updated = [newFav, ...favorites.filter((f) => f.trainId !== train.id)].slice(0, 5);
    }
    setFavorites(updated);
    localStorage.setItem("tr_favorite_trips", JSON.stringify(updated));
  }

  return (
    <div className="card trip-card">
      <div className="card-head-row" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <h2 style={{ margin: 0 }}>My Trip</h2>
          <button
            type="button"
            onClick={toggleFavorite}
            title={isFav ? "Remove from Favorites" : "Add to Favorites"}
            style={{
              background: "transparent",
              border: "none",
              cursor: "pointer",
              fontSize: "1.1rem",
              color: isFav ? "#EAB308" : "var(--ink-dim, #95A2B8)",
              padding: 0,
              lineHeight: 1,
            }}
          >
            {isFav ? "★" : "☆"}
          </button>
        </div>
        <div className="trip-actions">
          {onSwitchTrain && <button className="link-btn" onClick={onSwitchTrain}>Switch train</button>}
          <button className="link-btn" onClick={onChangeTrip}>Change trip</button>
        </div>
      </div>

      <div className="train-detail-head" style={{ marginTop: "8px" }}>
        <b>{train.id}</b>
        <StatusBadge status={effectiveDelay > 0 ? "at_risk" : "on_time"} delayMin={effectiveDelay} />
      </div>
      <div className="muted">{train.route_name || train.service_type} · {originStation?.name || originCode} → {destStation?.name || destinationCode}</div>
      {timing.nextLoop && <div className="service-update-title" style={{ marginTop: 8 }}>NEXT RUN FROM YOUR BOARDING STATION</div>}

      {/* Live ETA Countdown */}
      <div className="eta-hero" style={{ marginTop: "14px" }}>
        <div className="eta-label">Estimated arrival</div>
        <div className="eta-value" style={{ fontSize: "1.6rem", fontWeight: "800" }}>
          {formatCountdown(diffMin)}
        </div>
        <div className="muted" style={{ fontSize: "0.78rem", marginTop: "4px" }}>
          Clock time: <span className="mono" style={{ fontWeight: "600" }}>{formatClock12(arrival)}</span>
          {effectiveDelay > 0 && <span className="eta-delay" style={{ marginLeft: "8px" }}>+{effectiveDelay}m vs schedule</span>}
        </div>
      </div>

      {/* Journey Progress Bar */}
      <div className="journey-progress-container" style={{ margin: "14px 0" }}>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.72rem", color: "var(--ink-soft)", marginBottom: "6px" }}>
          <span>{originStation?.name || originCode}</span>
          <span className="mono" style={{ color: "var(--blue, #2F6FED)", fontWeight: "600" }}>{progressPct}% completed</span>
          <span>{destStation?.name || destinationCode}</span>
        </div>
        <div style={{ height: "6px", background: "var(--surface2, #E2E7F0)", borderRadius: "3px", overflow: "hidden", position: "relative" }}>
          <div style={{ height: "100%", width: `${progressPct}%`, background: "var(--blue, #2F6FED)", borderRadius: "3px", transition: "width 300ms ease" }} />
        </div>
      </div>

      {takingBus && (
        <div className="chosen-route">
          <div className="chosen-route-title">YOU CHOSE: REPLACEMENT BUS</div>
          <div>Change at <b>{busOption.alight_station_name}</b>, Platform <b>{busOption.platform}</b> · {busOption.walk_to_bus_m} m walk</div>
        </div>
      )}

      {recommendation ? (
        <div className="service-update">
          <div className="service-update-title">
            {recommendation.status === "approved" ? "SERVICE UPDATE"
              : recommendation.status === "rejected" ? "PLAN REJECTED BY OPERATOR"
              : "AWAITING OPERATOR APPROVAL"}
          </div>
          <p style={{ margin: 0 }}>{recommendation.rider_explanation}</p>
        </div>
      ) : (
        <p className="empty" style={{ marginTop: 10 }}>No disruptions on your route right now.</p>
      )}
    </div>
  );
}
