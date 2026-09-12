import { useEffect, useMemo, useState } from "react";
import { api } from "../../services/api";
import { formatClock12 } from "../../utils/eta";
import { LINES } from "../user/TrainPickerModal";

const LINE_NAME_BY_ID = Object.fromEntries(LINES.map((l) => [l.id, l.name]));

const CAUSES = [
  { id: "unspecified", label: "Not specified (internal only)" },
  { id: "signal_failure", label: "Signal failure (internal only)" },
  { id: "tree_fall", label: "Tree fall — notifies Municipal Disaster Mgmt Cell" },
  { id: "accident", label: "Accident — notifies Railway Protection Force" },
  { id: "flooding", label: "Flooding — notifies State Disaster Mgmt Authority" },
  { id: "landslide", label: "Landslide — notifies State Disaster Mgmt Authority" },
];

// Close a specific track or its parallel road. A blockage is just a very
// severe event on one segment -- it feeds the exact same pipeline as rainfall
// (ETA model -> propagation -> optimizer), so nothing downstream special-cases it.
// `selectedSegmentId` lets the map (click a track to pick it) drive this form.
export default function BlockageControls({ hazards, selectedSegmentId }) {
  const [segmentId, setSegmentId] = useState("");
  const [kind, setKind] = useState("track_block");
  const [cause, setCause] = useState("unspecified");
  const [duration, setDuration] = useState(45);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState(null);

  useEffect(() => {
    if (selectedSegmentId) setSegmentId(selectedSegmentId);
  }, [selectedSegmentId]);

  const blocked = hazards.filter((h) => h.blocked);
  const target = segmentId || hazards[0]?.id || "";
  const targetSeg = hazards.find((h) => h.id === target);

  // Grouped by line -- with all 5 lines' segments (~55 total) mixed into one
  // flat list, an operator had no way to tell which line "CLA → CHM" even
  // belongs to, let alone find a specific segment on a specific branch.
  const hazardsByLine = useMemo(() => {
    const groups = {};
    for (const h of hazards) {
      (groups[h.line_id] ||= []).push(h);
    }
    return groups;
  }, [hazards]);

  async function applyBlock() {
    if (!target) return;
    setBusy(true);
    setFlash(null);
    try {
      await api.blockSegment(target, kind, kind === "track_block" ? 0.95 : 0.6, note, duration, cause);
      const authorityNote = cause !== "unspecified" && cause !== "signal_failure"
        ? " The responsible authority has been notified."
        : "";
      setFlash({ ok: true, text: `${targetSeg?.from} → ${targetSeg?.to} closed for ${duration} min. Everything downstream will update in real time.${authorityNote}` });
      setNote("");
    } catch (e) {
      setFlash({ ok: false, text: `Could not close segment: ${e.message}` });
    } finally {
      setBusy(false);
      setTimeout(() => setFlash(null), 6000);
    }
  }

  async function reopen(id) {
    // Segment ids are now line-prefixed (e.g. "western_DDR_BA"), so naively
    // splitting on "_" produced garbled text like "western → DDR_BA". Use the
    // segment's real from/to station codes instead.
    const seg = hazards.find((h) => h.id === id);
    const label = seg ? `${seg.from} → ${seg.to}` : id;
    try {
      await api.clearSegment(id);
      setFlash({ ok: true, text: `${label} reopened.` });
      setTimeout(() => setFlash(null), 4000);
    } catch (e) {
      setFlash({ ok: false, text: e.message });
    }
  }

  return (
    <div className="card">
      <h2>Close a Track or Road</h2>
      <p className="threshold-hint">Click a track on the map to select it, or pick one below.</p>

      <label className="field-label">Segment</label>
      <select value={target} onChange={(e) => setSegmentId(e.target.value)}>
        {Object.entries(hazardsByLine).map(([lineId, segs]) => (
          <optgroup key={lineId} label={LINE_NAME_BY_ID[lineId] || lineId}>
            {segs.map((h) => (
              <option key={h.id} value={h.id}>{h.from} → {h.to}{h.blocked ? " (already closed)" : ""}</option>
            ))}
          </optgroup>
        ))}
      </select>

      <label className="field-label">What's closed</label>
      <select value={kind} onChange={(e) => setKind(e.target.value)}>
        <option value="track_block">Rail track — trains cannot pass</option>
        <option value="road_block">Parallel road — bus diversions restricted</option>
      </select>

      <label className="field-label">Cause</label>
      <select value={cause} onChange={(e) => setCause(e.target.value)}>
        {CAUSES.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
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
              <span className="muted"> · {LINE_NAME_BY_ID[h.line_id] || h.line_id} · {h.blocked.kind === "track_block" ? "track" : "road"}</span>
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
