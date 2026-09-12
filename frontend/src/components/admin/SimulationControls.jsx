import { useState } from "react";
import { formatClock, useSimulation } from "../../hooks/useSimulation";
import { api } from "../../services/api";
import { LINES } from "../user/TrainPickerModal";

// Section 32. "The simulation clock and train positions come from backend
// simulation state. The browser must not independently invent train positions" --
// every control here calls the backend and waits for the next SIMULATION_UPDATED
// broadcast to reflect the change; nothing is applied optimistically.
export default function SimulationControls() {
  const { clockMin, paused, speedMultiplier, toggle, setSpeed, runWhatIf } = useSimulation();
  const [rainfall, setRainfall] = useState(5);
  const [lineId, setLineId] = useState("central_main");
  const [resetting, setResetting] = useState(false);
  const [flash, setFlash] = useState(null);
  const selectedLine = LINES.find((l) => l.id === lineId) || LINES[0];

  async function resetAll() {
    setResetting(true);
    setFlash(null);
    try {
      await api.resetOperations();
      setRainfall(5);
      setFlash({ ok: true, text: "Operations reset: all trains are on time, disruptions cleared, and the clock is back on IST." });
    } catch (e) {
      setFlash({ ok: false, text: e.message });
    } finally {
      setResetting(false);
      setTimeout(() => setFlash(null), 5000);
    }
  }

  return (
    <div className="card">
      <h2>Simulation Time</h2>
      <div className="sim-clock-row">
        <button className="play-btn" onClick={toggle}>{paused ? "▶" : "⏸"}</button>
        <span className="mono">{formatClock(clockMin)}</span>
        <div className="speed-group">
          {[1, 2, 5].map((s) => (
            <button key={s} className={`speed-btn ${speedMultiplier === s ? "active" : ""}`} onClick={() => setSpeed(s)}>{s}x</button>
          ))}
        </div>
      </div>
      <p className="threshold-hint">
        This is the simulated Mumbai operations clock. The backend initializes and resets it from Asia/Kolkata time.
      </p>

      <h2 style={{ marginTop: 16 }}>Inject Rainfall Anomaly</h2>
      <label className="field-label">Which line is this rain hitting?</label>
      <select value={lineId} onChange={(e) => setLineId(e.target.value)}>
        {LINES.map((l) => (
          <option key={l.id} value={l.id}>{l.name}</option>
        ))}
      </select>
      <label className="slider-row" style={{ marginTop: 8 }}>
        <span>Rainfall intensity</span>
        <span className="mono">{rainfall} mm</span>
      </label>
      <input type="range" min={0} max={150} value={rainfall} onChange={(e) => setRainfall(parseFloat(e.target.value))} />
      <div className="threshold-hint">
        Disruption threshold is <b>64.5 mm</b> — IMD's official "heavy rainfall" band. Rain is local to the line
        you pick above; it won't put other lines at risk.
      </div>
      <button className="btn-primary full" onClick={() => runWhatIf(rainfall, lineId)}>
        Inject Rainfall on {selectedLine.name}
      </button>

      <button className="btn-secondary full" style={{ marginTop: 8 }} disabled={resetting} onClick={resetAll}>
        {resetting ? "Resetting…" : "Clear Scenario and Reset Trains"}
      </button>
      {flash && <div className={`flash ${flash.ok ? "ok" : "bad"}`}>{flash.text}</div>}
    </div>
  );
}
