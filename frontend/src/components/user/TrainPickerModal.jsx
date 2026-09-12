import { useEffect, useMemo, useState } from "react";
import { loadStations } from "../map/mapGeo";
import { formatClock12, tripTiming } from "../../utils/eta";

// Two steps, because "which train are you on" is the wrong first question --
// a passenger knows where they're boarding and where they're going, and the
// system should work out which services actually serve that trip.
export default function TrainPickerModal({ trains, hazards, clockMin, onConfirm }) {
  const [stations, setStations] = useState([]);
  const [origin, setOrigin] = useState("");
  const [destination, setDestination] = useState("");
  const [step, setStep] = useState(1);

  useEffect(() => {
    loadStations().then((s) => {
      setStations(s);
      setOrigin(s[0]?.code || "");
      setDestination(s[s.length - 1]?.code || "");
    });
  }, []);

  const originStation = stations.find((s) => s.code === origin);
  const destStation = stations.find((s) => s.code === destination);
  const segmentCount = hazards.length || Math.max(stations.length - 1, 1);
  const sameStation = origin === destination;
  const wrongDirection = originStation && destStation && destStation.order <= originStation.order;

  // Show the next usable run for every service. If a train has already passed
  // the boarding station, quote its next loop instead of hiding the service.
  const options = useMemo(() => {
    if (!originStation || !destStation) return [];
    return trains
      .map((t) => ({
        train: t,
        ...tripTiming(t, originStation.order, destStation.order, clockMin, segmentCount),
      }))
      .sort((a, b) => a.boardAt - b.boardAt)
      .slice(0, 12);
  }, [trains, originStation, destStation, clockMin, segmentCount]);

  return (
    <div className="modal-overlay">
      <div className="modal-card picker-card">
        {step === 1 && (
          <>
            <h2 style={{ marginBottom: 4 }}>Where are you travelling?</h2>
            <p className="muted" style={{ marginBottom: 16 }}>
              We'll track only this journey and alert you if anything changes on it.
            </p>

            <label className="field-label">Boarding at</label>
            <select value={origin} onChange={(e) => setOrigin(e.target.value)}>
              {stations.map((s) => <option key={s.code} value={s.code}>{s.name}</option>)}
            </select>

            <label className="field-label">Going to</label>
            <select value={destination} onChange={(e) => setDestination(e.target.value)}>
              {stations.map((s) => <option key={s.code} value={s.code}>{s.name}</option>)}
            </select>

            {sameStation && <p className="picker-warn">Pick two different stations.</p>}
            {!sameStation && wrongDirection && (
              <p className="picker-warn">
                This corridor runs {stations[0]?.name} → {stations[stations.length - 1]?.name}.
                Your destination needs to be further down the line than where you board.
              </p>
            )}

            <button
              className="btn-primary full"
              disabled={sameStation || wrongDirection}
              onClick={() => setStep(2)}
            >
              Find my train
            </button>
          </>
        )}

        {step === 2 && (
          <>
            <h2 style={{ marginBottom: 4 }}>Which train are you taking?</h2>
            <p className="muted" style={{ marginBottom: 14 }}>
              {originStation?.name} → {destStation?.name}
            </p>

            {options.length === 0 && (
              <p className="empty">
                Services are loading. Your itinerary will appear here as soon as the live feed connects.
              </p>
            )}

            <div className="picker-options">
              {options.map(({ train, boardAt, arriveAt, nextLoop }) => (
                <button
                  key={train.id}
                  className="picker-option"
                  onClick={() => onConfirm(train.id, destination, origin)}
                >
                  <div className="picker-option-head">
                    <span className="picker-train">{train.id}</span>
                    <span className={`status-pill status-${train.delay_min > 0 ? "at_risk" : "on_time"}`}>
                      {train.delay_min > 0 ? `+${train.delay_min}m` : "On Time"}
                    </span>
                  </div>
                  <div className="picker-times">
                    <span>Boards <b>{formatClock12(boardAt)}</b></span>
                    <span>Arrives <b>{formatClock12(arriveAt)}</b></span>
                  </div>
                  <div className="picker-service">{train.route_name || (train.service_type === "fast" ? "Fast service" : "Slow service")} · {train.route_code}</div>
                  {nextLoop && <div className="picker-service">Next run from this station</div>}
                </button>
              ))}
            </div>

            <button className="btn-secondary full" style={{ marginTop: 10 }} onClick={() => setStep(1)}>
              Back
            </button>
          </>
        )}
      </div>
    </div>
  );
}
