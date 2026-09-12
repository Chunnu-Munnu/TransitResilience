import { useEffect, useState } from "react";
import { loadStations } from "../map/mapGeo";
import { buildTripItinerary, formatClock12 } from "../../utils/eta";

// The stop-by-stop plan, in its own column so it's always visible rather than
// buried under the trip card. If the passenger chose the bus, the change point
// is called out inline with the platform, and the steps after it are shown as
// the bus leg rather than pretending they're still on the train.
export default function ItineraryPanel({ train, originCode, destinationCode, hazards, clockMin, recommendation, chosenOption }) {
  const [stations, setStations] = useState([]);
  useEffect(() => { loadStations().then(setStations); }, []);

  if (!train || !stations.length) return null;

  const destStation = stations.find((s) => s.code === destinationCode);
  const originStation = stations.find((s) => s.code === originCode);
  const originOrder = originStation?.order ?? 1;
  const destinationOrder = destStation?.order ?? stations.length;
  const segmentCount = hazards.length || stations.length - 1;
  const itinerary = buildTripItinerary(train, stations, originOrder, destinationOrder, clockMin, segmentCount);

  const action = recommendation?.plan?.passenger_action;
  const busOption = action?.options?.find((o) => o.id === "switch_to_bus");
  const takingBus = chosenOption === "switch_to_bus" && busOption;
  const changeAt = takingBus ? busOption.alight_station_code : null;
  const rejoinAt = takingBus ? busOption.rejoin_station_code : null;

  const changeOrder = stations.find((s) => s.code === changeAt)?.order ?? -1;
  const rejoinOrder = stations.find((s) => s.code === rejoinAt)?.order ?? -1;

  function legFor(stop) {
    if (!takingBus) return "rail";
    if (stop.order > changeOrder && stop.order <= rejoinOrder) return "bus";
    return "rail";
  }

  return (
    <div className="card itinerary-card">
      <h2>Your itinerary</h2>
      <p className="muted" style={{ marginBottom: 12 }}>
        {originStation?.name || originCode} → {destStation?.name}
        {takingBus && <span className="leg-note"> · includes a bus leg</span>}
      </p>

      {itinerary.length <= 1 ? (
        <p className="empty">You've reached your destination.</p>
      ) : (
        <div className="itinerary">
          {itinerary.map((stop) => {
            const leg = legFor(stop);
            return (
              <div
                className={`itin-row leg-${leg} ${stop.isDestination ? "dest" : ""} ${stop.isNext ? "next" : ""} ${stop.code === changeAt ? "divert" : ""}`}
                key={stop.code}
              >
                <span className="itin-node" />
                <span className="itin-name">
                  {stop.name}
                  {stop.isNext && <span className="itin-tag">next stop</span>}
                  {stop.isBoarding && <span className="itin-tag">board here</span>}
                  {stop.code === changeAt && <span className="itin-tag divert-tag">change to bus · Pl. {busOption.platform}</span>}
                  {stop.code === rejoinAt && <span className="itin-tag">back on rail</span>}
                  {stop.isDestination && <span className="itin-tag dest-tag">you get off here</span>}
                </span>
                <span className="itin-time mono">{formatClock12(stop.arrival)}</span>
              </div>
            );
          })}
        </div>
      )}

      {takingBus && (
        <ol className="next-steps">
          <li>Stay on until <b>{busOption.alight_station_name}</b> (~{busOption.minutes_until_you_must_alight} min).</li>
          <li>Exit on <b>Platform {busOption.platform}</b>, follow signs to the bus bay ({busOption.walk_to_bus_m} m).</li>
          <li>Board any of the <b>{busOption.bus_count}</b> replacement buses — no extra ticket.</li>
          <li>Get off at <b>{busOption.rejoin_station_name}</b> and rejoin the line.</li>
        </ol>
      )}

      {chosenOption === "stay_on_train" && (
        <div className="stay-note">
          You chose to stay on your train. Nothing to do — we'll tell you if anything else changes.
        </div>
      )}
    </div>
  );
}
