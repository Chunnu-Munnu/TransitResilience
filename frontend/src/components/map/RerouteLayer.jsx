import { Polyline } from "react-leaflet";
import { resolveRouteCoords } from "./mapGeo";

// Section 9: proposed reroute is dashed/ghost before approval, solid/active after.
export default function RerouteLayer({ recommendation, stations, hazards }) {
  if (!recommendation || !recommendation.plan) return null;
  const { approved_route, buses_assigned } = recommendation.plan;
  if (!approved_route || !buses_assigned?.length) return null; // schedule-hold-only plans have no geometry change

  const segmentsById = Object.fromEntries(hazards.map((s) => [s.id, s]));
  const coords = resolveRouteCoords(approved_route, stations, segmentsById);
  if (coords.length < 2) return null;

  const approved = recommendation.status === "approved";
  return (
    <Polyline
      positions={coords}
      pathOptions={{
        color: approved ? "#2F6FED" : "#2F6FED",
        weight: approved ? 4 : 3,
        opacity: approved ? 0.95 : 0.7,
        dashArray: approved ? null : "8 6",
      }}
    />
  );
}
