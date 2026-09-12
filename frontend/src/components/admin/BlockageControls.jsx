import { useState } from "react";
import { api } from "../../services/api";
import { formatClock12 } from "../../utils/eta";

// Close a specific track or its parallel road. A blockage is just a very
// severe event on one segment -- it feeds the exact same pipeline as rainfall
// (ETA model -> propagation -> optimizer), so nothing downstream special-cases it.
export default function BlockageControls({ hazards }) {
  const [segmentId, setSegmentId] = useState("");
  const [kind, setKind] = useState("track_block");
  const [duration, setDuration] = useState(45);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState(null);

  const blocked = hazards.filter((h) => h.blocked);
  const target = segmentId || hazards[0]?.id || "";
  const targetSeg = hazards.find((h) => h.id === target);

  async function applyBlock() {
    if (!target) return;
    setBusy(true);
    setFlash(null);
    try {
      await api.blockSegment(target, kind, kind === "track_block" ? 0.95 : 0.6, note, duration);
      setFlash({ ok: true, text: `${targetSeg?.from} → ${targetSeg?.to} closed for ${duration} min. Watch for a plan on the right.` });
      setNote("");
    } catch (e) {
      setFlash({ ok: false, text: `Could not close segment: ${e.message}` });
    } finally {
      setBusy(false);
      setTimeout(() => setFlash(null), 6000);
    }
  }

  async function reopen(id) {
    try {
      await api.clearSegment(id);
      setFlash({ ok: true, text: `${id.replace("_", " → ")} reopened.` });
      setTimeout(() => setFlash(null), 4000);
    } catch (e) {
      setFlash({ ok: false, text: e.message });
    }
  }

  return (
    <div className="card">
      <h2>Close a Track or Road</h2>

      <label className="field-label">Segment</label>
      <select value={target} onChange={(e) => setSegmentId(e.target.value)}>
        {hazards.map((h) => (
          <option key={h.id} value={h.id}>{h.from} → {h.to}{h.blocked ? " (already closed)" : ""}</option>
        ))}
      </select>

      <label className="field-label">What's closed</label>
      <select value={kind} onChange={(e) => setKind(e.target.value)}>
        <option value="track_block">Rail track — trains cannot pass</option>
        <option value="road_block">Parallel road — bus diversions restricted</option>
      </select>

      <label className="field-label">Closed for (minutes)</label>
      <select value={duration} onChange={(e) => setDuration(Number(e.target.value))}>
        {[15, 30, 45, 90].map((d) => <option key={d} value={d}>{d} minutes</option>)}
      </select>

      <label className="field-label">Reason (optional)</label>
      <input type="text" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Signal failure, debris on track" />

      <button className="btn-reject full" disabled={busy || !target} onClick={applyBlock}>
        {busy ? "Closing…" : "Close This Segment"}
      </button>

      {flash && <div className={`flash ${flash.ok ? "ok" : "bad"}`}>{flash.text}</div>}

      <div className="blocked-list">
        <div className="field-label" style={{ marginTop: 12 }}>
          Currently closed {blocked.length === 0 && <span className="muted">— none</span>}
        </div>
        {blocked.map((h) => (
          <div className="blocked-row" key={h.id}>
            <span>
              <b>{h.from} → {h.to}</b>
              <span className="muted"> · {h.blocked.kind === "track_block" ? "track" : "road"}</span>
              {h.blocked.until_min != null && (
                <span className="muted"> · reopens {formatClock12(h.blocked.until_min)}</span>
              )}
              {h.blocked.note && <div className="muted">{h.blocked.note}</div>}
            </span>
            <button className="link-btn" onClick={() => reopen(h.id)}>Reopen now</button>
          </div>
        ))}
      </div>
    </div>
  );
}
