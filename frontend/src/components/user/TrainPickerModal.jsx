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

// The five simulated lines. central_main stays the default so the existing
// demo flow (pick origin/destination, no line question) isn't disrupted.
// Colors mirror data/synthetic/lines.json exactly -- bold, saturated, and
// never red (red is reserved for delays/issues, never a line's identity).
export const LINES = [
  { id: "central_main", name: "Central Main (CST ↔ Kalyan)", color: "#1E9E5A" },
  { id: "central_kasara", name: "Central – Kasara Branch", color: "#3B82F6" },
  { id: "central_karjat", name: "Central – Karjat Branch", color: "#A855F7" },
  { id: "harbour", name: "Harbour Line (CST ↔ Panvel)", color: "#FACC15" },
  { id: "western", name: "Western Line (Churchgate ↔ Virar)", color: "#EC4899" },
];

// Four steps: a quick-jump (favorites/recents/exact train ID) or the line
// question first (origin/destination codes only make sense once we know
// which line's station list to search), then origin/destination, then train.
export default function TrainPickerModal({
  trains, hazards, clockMin, onConfirm, onCancel,
  initialLineId, initialOrigin, initialDestination, initialStep = 1, title, subtitle,
}) {
  const [allStations, setAllStations] = useState([]);
  const [lineId, setLineId] = useState(initialLineId || "central_main");
  const [origin, setOrigin] = useState(initialOrigin || "");
  const [destination, setDestination] = useState(initialDestination || "");
  const [step, setStep] = useState(initialStep);
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

  useEffect(() => { loadStations().then(setAllStations); }, []);

  const stations = useMemo(
    () => allStations.filter((s) => s.line_id === lineId).sort((a, b) => a.order - b.order),
    [allStations, lineId]
  );

  // Default origin/destination to the line's endpoints whenever the line
  // changes (or on first load), unless the caller pinned specific stations.
  useEffect(() => {
    if (!stations.length) return;
    if (!initialOrigin || lineId !== initialLineId) setOrigin(stations[0]?.code || "");
    if (!initialDestination || lineId !== initialLineId) setDestination(stations[stations.length - 1]?.code || "");
  }, [stations]);

  const lineTrains = useMemo(() => trains.filter((t) => t.line_id === lineId), [trains, lineId]);
  const lineSegmentCount = useMemo(() => hazards.filter((h) => h.line_id === lineId).length, [hazards, lineId]);

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
        onConfirm(train.id, train.terminus_station, train.departure_station, train.line_id);
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
  const segmentCount = lineSegmentCount || Math.max(stations.length - 1, 1);
  const sameStation = origin === destination;
  const wrongDirection = originStation && destStation && destStation.order <= originStation.order;

  const options = useMemo(() => {
    if (!originStation || !destStation) return [];
    return lineTrains
      .map((t) => ({
        train: t,
        ...tripTiming(t, originStation.order, destStation.order, clockMin, segmentCount),
      }))
      .sort((a, b) => a.boardAt - b.boardAt)
      .slice(0, 12);
  }, [lineTrains, originStation, destStation, clockMin, segmentCount]);

  return (
    <div className="modal-overlay">
      <div className="modal-card picker-card">
        {step === 1 && (
          <>
            <h2 style={{ marginBottom: 4 }}>Find Your Journey</h2>
            <p className="muted" style={{ marginBottom: 18 }}>
              Enter an exact train ID, jump back into a saved trip, or pick your line below.
            </p>

            {/* Favorites & Recents Quick Select -- these skip straight to a
                specific train, so they carry their own saved lineId rather
                than going through the line/origin/destination steps at all. */}
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
                      onClick={() => onConfirm(f.trainId, f.destination, f.origin, f.lineId || "central_main")}
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
                      onClick={() => onConfirm(r.trainId, r.destination, r.origin, r.lineId || "central_main")}
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
              <span>or pick your line</span>
            </div>

            <p className="muted" style={{ marginBottom: 12 }}>
              We simulate all five lines live -- pick yours to see its trains and stations.
            </p>

            <div className="picker-options">
              {LINES.map((l) => (
                <button
                  key={l.id}
                  className={`picker-option ${lineId === l.id ? "selected" : ""}`}
                  onClick={() => setLineId(l.id)}
                >
                  <div className="picker-option-head">
                    <span className="picker-train">
                      <span className="line-swatch" style={{ background: l.color }} />
                      {l.name}
                    </span>
                  </div>
                </button>
              ))}
            </div>

            <button className="btn-primary full" style={{ marginTop: 10 }} onClick={() => setStep(2)}>
              Continue
            </button>
          </>
        )}

        {step === 2 && (
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
                This line runs {stations[0]?.name} → {stations[stations.length - 1]?.name}.
                Your destination needs to be further down the line than where you board.
              </p>
            )}

            <button className="btn-secondary full" style={{ marginTop: 6 }} onClick={() => setStep(1)}>
              Back
            </button>
            <button
              className="btn-primary full"
              style={{ marginTop: 8 }}
              disabled={sameStation || wrongDirection}
              onClick={() => setStep(3)}
            >
              Find trains for this route →
            </button>
          </>
        )}

        {step === 3 && (
          <>
            <h2 style={{ marginBottom: 4 }}>{title || "Which train are you taking?"}</h2>
            <p className="muted" style={{ marginBottom: 14 }}>
              {subtitle || `${originStation?.name} → ${destStation?.name}`}
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
                  onClick={() => onConfirm(train.id, destination, origin, lineId)}
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

            <button
              className="btn-secondary full"
              style={{ marginTop: 10 }}
              onClick={() => (initialOrigin && onCancel ? onCancel() : setStep(2))}
            >
              {initialOrigin && onCancel ? "Cancel" : "Back"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
