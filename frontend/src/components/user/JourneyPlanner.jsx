import { useEffect, useState } from "react";
import { api } from "../../services/api";
import { loadStations } from "../map/mapGeo";

// Section 24: simple journey search, not a production route-planning engine.
export default function JourneyPlanner({ onResult }) {
  const [stations, setStations] = useState([]);
  const [origin, setOrigin] = useState("CSTM");
  const [destination, setDestination] = useState("KYN");
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => { loadStations().then(setStations); }, []);

  async function search() {
    setError(null);
    try {
      const res = await api.planTrip(origin, destination);
      if (!res.ok) { setError(res.error); return; }
      setResult(res);
      onResult && onResult(res);
    } catch (e) {
      setError(e.message);
    }
  }

  return (
    <div className="card">
      <h2>Plan Your Journey</h2>
      <label className="field-label">From</label>
      <select value={origin} onChange={(e) => setOrigin(e.target.value)}>
        {stations.map((s) => <option key={s.code} value={s.code}>{s.name}</option>)}
      </select>
      <label className="field-label">To</label>
      <select value={destination} onChange={(e) => setDestination(e.target.value)}>
        {stations.map((s) => <option key={s.code} value={s.code}>{s.name}</option>)}
      </select>
      <button className="btn-primary full" onClick={search}>Search Trains</button>
      {error && <p className="warn-text" style={{ marginTop: 8 }}>{error}</p>}
      {result && (
        <div className="journey-result">
          <div className="id">{result.train_id}</div>
          <div className="muted">{result.origin} → {result.destination}</div>
          <div className="kv-row"><span>Status</span><span>{result.status === "at_risk" ? "Rerouted" : result.status.replace("_", " ")}</span></div>
          <div className="kv-row"><span>Current delay</span><span>{result.current_delay_min > 0 ? `+${result.current_delay_min} min` : "on time"}</span></div>
        </div>
      )}
    </div>
  );
}
