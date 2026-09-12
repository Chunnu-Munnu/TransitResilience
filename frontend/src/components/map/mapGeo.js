import network from "../../data/map/railway_network.geojson?url";

let _cache = null;

export async function loadStations() {
  if (_cache) return _cache;
  const res = await fetch(network);
  const geojson = await res.json();
  _cache = geojson.features
    .map((f) => ({
      code: f.properties.code, name: f.properties.name, order: f.properties.order,
      line_id: f.properties.line_id, lon: f.geometry.coordinates[0], lat: f.geometry.coordinates[1],
    }))
    .sort((a, b) => a.order - b.order);
  return _cache;
}

// Stations are keyed by (code, line_id) since a junction (e.g. KYN, CSTM) has one
// entry per line it serves. Pass lineId when the list may span multiple lines.
export function stationByCode(stations, code, lineId) {
  if (lineId) return stations.find((s) => s.code === code && s.line_id === lineId);
  return stations.find((s) => s.code === code);
}

export function stationsForLine(stations, lineId) {
  return stations.filter((s) => s.line_id === lineId).sort((a, b) => a.order - b.order);
}

// Section 7: train status -> marker color
export const STATUS_COLOR = {
  on_time: "#1E9E5A",
  delayed: "#C97A0B",
  at_risk: "#D64545",
  critical: "#D64545",
  rerouting: "#2F6FED",
};

// Section 8: hazard severity -> overlay color
export function hazardColor(risk) {
  if (risk >= 0.7) return "#B91C1C"; // critical / pulsing
  if (risk >= 0.5) return "#D64545"; // high
  if (risk >= 0.2) return "#C97A0B"; // moderate
  return "#E9C97A"; // low, subtle
}

// Interpolates a train's lat/lon along its current segment. `current_segment_index`
// is only meaningful within the train's OWN line's segment list, so segments must
// be filtered down to that line before indexing into them.
export function trainPosition(train, stations, segments) {
  const lineSegs = segments.filter((s) => s.line_id === train.line_id);
  if (!lineSegs.length) return null;
  const seg = lineSegs[Math.min(train.current_segment_index, lineSegs.length - 1)];
  if (!seg) return null;
  const a = stationByCode(stations, seg.from, train.line_id);
  const b = stationByCode(stations, seg.to, train.line_id);
  if (!a || !b) return null;
  const p = train.progress_in_segment ?? 0;
  return { lat: a.lat + (b.lat - a.lat) * p, lon: a.lon + (b.lon - a.lon) * p };
}

// A route array can contain real station codes AND synthetic "VIA_ROAD_<segmentId>"
// waypoints (see backend/sim/world.py route_stations()) representing a bus
// diversion off the rail corridor. This resolves each entry to a coordinate,
// offsetting the virtual waypoint perpendicular to its segment so the detour
// is visually distinguishable from the straight rail line.
export function resolveRouteCoords(routeCodes, stations, segmentsById, lineId) {
  return routeCodes
    .map((code) => {
      if (code.startsWith("VIA_ROAD_")) {
        const segId = code.replace("VIA_ROAD_", "");
        const seg = segmentsById[segId];
        if (!seg) return null;
        const a = stationByCode(stations, seg.from, lineId);
        const b = stationByCode(stations, seg.to, lineId);
        if (!a || !b) return null;
        const mx = (a.lat + b.lat) / 2, my = (a.lon + b.lon) / 2;
        const dx = b.lat - a.lat, dy = b.lon - a.lon;
        const offset = 0.006;
        return [mx + dy * offset, my - dx * offset]; // perpendicular offset
      }
      const s = stationByCode(stations, code, lineId);
      return s ? [s.lat, s.lon] : null;
    })
    .filter(Boolean);
}
