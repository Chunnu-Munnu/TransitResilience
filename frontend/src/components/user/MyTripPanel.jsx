import { useEffect, useState } from "react";
import StatusBadge from "../shared/StatusBadge";
import { loadStations, stationsForLine } from "../map/mapGeo";
import { formatClock12, tripTiming } from "../../utils/eta";

// The passenger's own trip at a glance: status, a real ETA to the station they
// actually picked, and -- when something goes wrong -- their choice of options.
// The stop-by-stop plan lives in ItineraryPanel so both stay fully visible.
export default function MyTripPanel({ train, lineId, destinationCode, originCode, hazards, clockMin, recommendation, chosenOption, onChangeTrip, onSwitchTrain }) {
  const [allStations, setAllStations] = useState([]);
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
  // If they chose the bus, quote the bus leg's delay instead of the train's.
  const effectiveDelay = takingBus ? busOption.delay_min : (train.delay_min || 0);
  const arrival = takingBus ? railArrival - (train.delay_min || 0) + busOption.delay_min : railArrival;

  return (
    <div className="card trip-card">
      <div className="card-head-row">
        <h2 style={{ margin: 0 }}>My Trip</h2>
        <div className="trip-actions">
          {onSwitchTrain && <button className="link-btn" onClick={onSwitchTrain}>Switch train</button>}
          <button className="link-btn" onClick={onChangeTrip}>Change trip</button>
        </div>
      </div>

      <div className="train-detail-head">
        <b>{train.id}</b>
        <StatusBadge status={effectiveDelay > 0 ? "at_risk" : "on_time"} delayMin={effectiveDelay} />
      </div>
      <div className="muted">{train.route_name || train.service_type} · {originStation?.name || originCode} → {destStation?.name || destinationCode}</div>
      {timing.nextLoop && <div className="service-update-title" style={{ marginTop: 8 }}>NEXT RUN FROM YOUR BOARDING STATION</div>}

      <div className="eta-hero">
        <div className="eta-label">Estimated arrival</div>
        <div className="eta-value">{formatClock12(arrival)}</div>
        {effectiveDelay > 0 && <div className="eta-delay">+{effectiveDelay} min vs. schedule</div>}
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
