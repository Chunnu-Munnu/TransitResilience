import { useEffect, useMemo, useState } from "react";
import { loadStations } from "../map/mapGeo";
import { formatClock12, tripTiming } from "../../utils/eta";
import { api } from "../../services/api";
import Input from "../shared/Input";

/*
 * TEMPORARY: exact train-ID lookup only, using GET /api/trains/{id}.
 * Replace with GET /api/trains/search?q= once available.
 * This does not support partial/fuzzy matching or origin/destination text search.
 */

export default function TrainPickerModal({ trains, hazards, clockMin, onConfirm }) {
  const [stations, setStations] = useState([]);
  const [origin, setOrigin] = useState("");
  const [destination, setDestination] = useState("");
  const [step, setStep] = useState(1);
  const [trainIdQuery, setTrainIdQuery] = useState("");
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState(null);

  const [recents, setRecents] = useState(() => {
    try {
      const saved = localStorage.getItem("tr_recent_trips");
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const [favorites, setFavorites] = useState(() => {
    try {
      const saved = localStorage.getItem("tr_favorite_trips");
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    loadStations().then((s) => {
      setStations(s);
      setOrigin(s[0]?.code || "");
      setDestination(s[s.length - 1]?.code || "");
    });
  }, []);

  /*
   * TEMPORARY: exact train-ID lookup only, using GET /api/trains/{id}.
   * Replace with GET /api/trains/search?q= once available - see interim search requirement.
   * This does not support partial/fuzzy matching or origin/destination text search.
   */
  async function handleExactTrainIdSearch(e) {
    if (e) e.preventDefault();
    const query = trainIdQuery.trim().toUpperCase();
    if (!query) return;

    setSearchLoading(true);
    setSearchError(null);

    try {
      const train = await api.getTrain(query);
      if (train && train.id) {
        onConfirm(train.id, train.terminus_station || "KYN", train.departure_station || "CSTM");
      } else {
        setSearchError(`No train found with ID '${query}'. Try searching by station below.`);
      }
    } catch {
      setSearchError(`No train found with ID '${query}'. Try searching by station below.`);
    } finally {
      setSearchLoading(false);
    }
  }

  const originStation = stations.find((s) => s.code === origin);
  const destStation = stations.find((s) => s.code === destination);
  const segmentCount = hazards.length || Math.max(stations.length - 1, 1);
  const sameStation = origin === destination;
  const wrongDirection = originStation && destStation && destStation.order <= originStation.order;

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
            <h2 style={{ marginBottom: 4 }}>Find Your Journey</h2>
            <p className="muted" style={{ marginBottom: 18 }}>
              Enter an exact train ID or select your origin and destination.
            </p>

            {/* Favorites & Recents Quick Select */}
            {(favorites.length > 0 || recents.length > 0) && (
              <div style={{ marginBottom: "16px" }}>
                <div className="field-label" style={{ marginBottom: "6px" }}>Past & Favorite Journeys</div>
                <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                  {favorites.map((f, i) => (
                    <button
                      key={`fav-${i}`}
                      type="button"
                      className="picker-option"
                      style={{ padding: "6px 10px", borderRadius: "16px", fontSize: "0.78rem", display: "inline-flex", alignItems: "center", gap: "4px" }}
                      onClick={() => onConfirm(f.trainId, f.destination, f.origin)}
                    >
                      <span style={{ color: "#EAB308" }}>★</span>
                      <b>{f.trainId}</b> ({f.origin} → {f.destination})
                    </button>
                  ))}
                  {recents.map((r, i) => (
                    <button
                      key={`rec-${i}`}
                      type="button"
                      className="picker-option"
                      style={{ padding: "6px 10px", borderRadius: "16px", fontSize: "0.78rem", display: "inline-flex", alignItems: "center", gap: "4px" }}
                      onClick={() => onConfirm(r.trainId, r.destination, r.origin)}
                    >
                      <span>🕒</span>
                      <b>{r.trainId}</b> ({r.origin} → {r.destination})
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Exact Train ID Search Form */}
            <form onSubmit={handleExactTrainIdSearch} style={{ display: "flex", flexDirection: "column", gap: "10px", marginBottom: "18px" }}>
              <Input
                id="exact-train-id-search"
                label="Enter exact train number"
                placeholder="e.g. T101"
                value={trainIdQuery}
                onChange={(e) => {
                  setTrainIdQuery(e.target.value);
                  if (searchError) setSearchError(null);
                }}
                disabled={searchLoading}
              />
              <button
                type="submit"
                className="btn-primary full"
                disabled={searchLoading || !trainIdQuery.trim()}
              >
                {searchLoading ? "Finding Train…" : "Find Train"}
              </button>
              {searchError && (
                <div className="picker-warn" style={{ color: "var(--red, #D64545)", margin: "4px 0 0 0", fontSize: "0.78rem" }}>
                  {searchError}
                </div>
              )}
            </form>

            <div className="login-divider" style={{ margin: "18px 0" }}>
              <span>or search by station</span>
            </div>

            {/* Station-based Journey Picker Section */}
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
              className="btn-secondary full"
              style={{ marginTop: 10 }}
              disabled={sameStation || wrongDirection}
              onClick={() => setStep(2)}
            >
              Find trains for this route →
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
