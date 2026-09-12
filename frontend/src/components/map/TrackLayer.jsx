import { Fragment } from "react";
import { Polyline, Tooltip } from "react-leaflet";
import { stationByCode, hazardColor } from "./mapGeo";
import { LINES } from "../user/TrainPickerModal";

const LINE_COLOR_BY_ID = Object.fromEntries(LINES.map((l) => [l.id, l.color]));
const FALLBACK_LINE_COLOR = "#2F6FED";

// Section 9 "Current route": solid line, colored by that segment's hazard risk.
// Every line's segments render, but only `myLineId` (the rider's own line, or
// null for the operator's full-network view) uses the risk gradient -- every
// other line keeps its OWN distinct identity color (from LINES) UNLESS it has
// a real problem (high risk/blocked), in which case that specific segment
// turns red so issues elsewhere aren't hidden.
export default function TrackLayer({ stations, hazards, myLineId, onSelectSegment, selectedSegmentId }) {
  return hazards.map((seg) => {
    const a = stationByCode(stations, seg.from, seg.line_id);
    const b = stationByCode(stations, seg.to, seg.line_id);
    if (!a || !b) return null;
    const risk = seg.flood_risk ?? 0;
    const blocked = Boolean(seg.blocked);
    const isMine = !myLineId || seg.line_id === myLineId;
    const hasProblem = blocked || risk >= 0.2;

    // Every line renders bold and fully opaque -- this is a real rail network,
    // not faint map decoration -- whether it's the rider's own line or not.
    let color, weight, dashArray;
    if (isMine) {
      color = blocked ? "#7F1D1D" : risk >= 0.2 ? hazardColor(risk) : "#1E9E5A";
      weight = blocked ? 8 : 6;
      dashArray = blocked ? "2 8" : null;
    } else if (hasProblem) {
      color = blocked ? "#7F1D1D" : hazardColor(risk);
      weight = blocked ? 7 : 6;
      dashArray = blocked ? "2 8" : null;
    } else {
      color = LINE_COLOR_BY_ID[seg.line_id] || FALLBACK_LINE_COLOR;
      weight = 6;
      dashArray = null;
    }

    const selected = seg.id === selectedSegmentId;
    const positions = [[a.lat, a.lon], [b.lat, b.lon]];

    return (
      <Fragment key={seg.id}>
        {selected && (
          <Polyline
            positions={positions}
            pathOptions={{ color: "#ffffff", weight: weight + 6, opacity: 0.55 }}
            interactive={false}
          />
        )}
        <Polyline
          positions={positions}
          pathOptions={{ color, weight, opacity: 1, dashArray }}
          eventHandlers={onSelectSegment ? { click: () => onSelectSegment(seg.id) } : undefined}
        >
          <Tooltip sticky>
            {seg.from}–{seg.to}: risk {(risk * 100).toFixed(0)}%
            {blocked && ` · CLOSED (${seg.blocked.kind.replace("_", " ")})`}
            {onSelectSegment && " · click to select for a blockage"}
          </Tooltip>
        </Polyline>
      </Fragment>
    );
  });
}
