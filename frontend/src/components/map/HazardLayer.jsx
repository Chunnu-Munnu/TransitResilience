import { Circle, Tooltip } from "react-leaflet";
import { stationByCode, hazardColor } from "./mapGeo";

// Section 8: hazards shown spatially, not just numerically. Critical hazards
// pulse (see .hazard-pulse in styles/globals.css) rather than animating everything.
export default function HazardLayer({ stations, hazards }) {
  return hazards
    .filter((seg) => (seg.flood_risk ?? 0) >= 0.2)
    .map((seg) => {
      const a = stationByCode(stations, seg.from);
      const b = stationByCode(stations, seg.to);
      if (!a || !b) return null;
      const risk = seg.flood_risk;
      const mid = [(a.lat + b.lat) / 2, (a.lon + b.lon) / 2];
      return (
        <Circle
          key={`hz-${seg.id}`}
          center={mid}
          radius={300 + risk * 900}
          pathOptions={{
            color: hazardColor(risk),
            fillColor: hazardColor(risk),
            fillOpacity: 0.18,
            weight: 1.5,
            className: risk >= 0.7 ? "hazard-pulse" : "",
          }}
        >
          <Tooltip>
            FLOOD RISK — {seg.from}/{seg.to}
            <br />Risk: {(risk * 100).toFixed(0)}%
          </Tooltip>
        </Circle>
      );
    });
}
