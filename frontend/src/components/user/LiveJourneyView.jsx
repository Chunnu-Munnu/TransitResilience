import { useEffect, useState } from "react";
import StatusBadge from "../shared/StatusBadge";
import { loadStations } from "../map/mapGeo";
import { formatClock12 } from "../../utils/eta";

export default function LiveJourneyView({ train, hazards, clockMin }) {
  const [stations, setStations] = useState([]);

  useEffect(() => {
    loadStations().then(setStations);
  }, []);

  if (!train) {
    return (
      <div className="card trip-card">
        <h2>Live Journey Tracker</h2>
        <p className="empty" style={{ margin: "16px 0" }}>
          No active train selected. Search for any train (e.g. <b>T108</b>, <b>T102</b>) in the top navbar or pick a journey to track its live backend position.
        </p>
      </div>
    );
  }

  const currentSegmentIdx = train.current_segment_index ?? 0;
  const progressPct = Math.round((train.progress_in_segment ?? 0) * 100);

  const startStation = stations.find((s) => s.code === train.departure_station);
  const endStation = stations.find((s) => s.code === train.terminus_station);

  // Derive current segment stations from station orders
  const currentSegStart = stations[currentSegmentIdx] || stations[0];
  const currentSegEnd = stations[currentSegmentIdx + 1] || stations[stations.length - 1];

  return (
    <div className="card trip-card" style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
      <div className="card-head-row">
        <h2 style={{ margin: 0 }}>Live Journey Tracker</h2>
        <span className="mono" style={{ fontSize: "0.72rem", color: "var(--blue)" }}>
          BACKEND SIMULATION FEED
        </span>
      </div>

      <div className="train-detail-head">
        <div style={{ display: "flex", alignItems: "baseline", gap: "8px" }}>
          <b style={{ fontSize: "1.2rem" }}>{train.id}</b>
          <span className="muted" style={{ fontSize: "0.82rem" }}>
            {train.route_name || train.service_type} ({train.route_code || "CR-SERIES"})
          </span>
        </div>
        <StatusBadge status={train.status} delayMin={train.delay_min} />
      </div>

      <div className="muted" style={{ fontSize: "0.85rem", marginTop: "-8px" }}>
        <b>{startStation?.name || train.departure_station}</b> → <b>{endStation?.name || train.terminus_station}</b>
      </div>

      {/* Live Segment Progress Card */}
      <div
        style={{
          background: "var(--surface2, #F7F9FC)",
          border: "1px solid var(--border, #E2E7F0)",
          borderRadius: "10px",
          padding: "14px",
        }}
      >
        <div style={{ fontSize: "0.72rem", fontWeight: "700", textTransform: "uppercase", letterSpacing: ".06em", color: "var(--ink-soft)", marginBottom: "8px" }}>
          Current Segment Position (Backend Live)
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.88rem", fontWeight: "600", marginBottom: "8px" }}>
          <span>{currentSegStart?.name || "Departure"}</span>
          <span style={{ color: "var(--blue)" }}>{progressPct}% along segment</span>
          <span>{currentSegEnd?.name || "Next Stop"}</span>
        </div>

        {/* Progress Bar */}
        <div
          style={{
            height: "8px",
            width: "100%",
            background: "var(--border, #E2E7F0)",
            borderRadius: "4px",
            overflow: "hidden",
            position: "relative",
          }}
        >
          <div
            style={{
              height: "100%",
              width: `${progressPct}%`,
              background: "linear-gradient(90deg, #2F6FED, #7AA6FF)",
              borderRadius: "4px",
              transition: "width 300ms ease",
            }}
          />
        </div>
      </div>

      {/* Backend Metrics Grid */}
      <div className="stat-grid" style={{ gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
        <div className="stat-tile" style={{ padding: "10px" }}>
          <div className="n" style={{ fontSize: "1.1rem" }}>{train.service_type === "fast" ? "Fast" : "Slow"}</div>
          <div className="l">Service Speed</div>
        </div>
        <div className="stat-tile" style={{ padding: "10px" }}>
          <div className="n" style={{ fontSize: "1.1rem" }}>Segment #{currentSegmentIdx + 1}</div>
          <div className="l">Corridor Index</div>
        </div>
        <div className="stat-tile" style={{ padding: "10px" }}>
          <div className="n" style={{ fontSize: "1.1rem" }}>{train.delay_min > 0 ? `+${train.delay_min}m` : "On Time"}</div>
          <div className="l">Current Delay</div>
        </div>
        <div className="stat-tile" style={{ padding: "10px" }}>
          <div className="n" style={{ fontSize: "1.1rem" }}>{currentSegEnd?.name || "En route"}</div>
          <div className="l">Next Station Stop</div>
        </div>
      </div>
    </div>
  );
}
