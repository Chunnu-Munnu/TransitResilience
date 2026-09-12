import { Polyline, Tooltip } from "react-leaflet";
import { stationByCode, hazardColor } from "./mapGeo";

// Section 9 "Current route": solid line, colored by that segment's hazard risk.
export default function TrackLayer({ stations, hazards }) {
  return hazards.map((seg) => {
    const a = stationByCode(stations, seg.from);
    const b = stationByCode(stations, seg.to);
    if (!a || !b) return null;
    const risk = seg.flood_risk ?? 0;
    const blocked = Boolean(seg.blocked);
    return (
      <Polyline
        key={seg.id}
        positions={[[a.lat, a.lon], [b.lat, b.lon]]}
        pathOptions={{
          color: blocked ? "#7F1D1D" : risk >= 0.2 ? hazardColor(risk) : "#1E9E5A",
          weight: blocked ? 7 : 5,
          opacity: 0.9,
          dashArray: blocked ? "2 8" : null,   // a closed segment reads as a broken line
        }}
      >
        <Tooltip sticky>
          {seg.from}–{seg.to}: risk {(risk * 100).toFixed(0)}%
          {blocked && ` · CLOSED (${seg.blocked.kind.replace("_", " ")})`}
        </Tooltip>
      </Polyline>
    );
  });
}
