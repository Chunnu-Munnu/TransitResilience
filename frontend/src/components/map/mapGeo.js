import network from "../../data/map/railway_network.geojson?url";

let _cache = null;

export async function loadStations() {
  if (_cache) return _cache;
  const res = await fetch(network);
  const geojson = await res.json();
  _cache = geojson.features
    .map((f) => ({ code: f.properties.code, name: f.properties.name, order: f.properties.order, lon: f.geometry.coordinates[0], lat: f.geometry.coordinates[1] }))
    .sort((a, b) => a.order - b.order);
  return _cache;
}

export function stationByCode(stations, code) {
  return stations.find((s) => s.code === code);
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

// Interpolates a train's lat/lon along its current segment.
export function trainPosition(train, stations, segments) {
  const seg = segments[Math.min(train.current_segment_index, segments.length - 1)];
  if (!seg) return null;
  const a = stationByCode(stations, seg.from);
  const b = stationByCode(stations, seg.to);
  if (!a || !b) return null;
  const p = train.progress_in_segment ?? 0;
  return { lat: a.lat + (b.lat - a.lat) * p, lon: a.lon + (b.lon - a.lon) * p };
}

// A route array can contain real station codes AND synthetic "VIA_ROAD_<segmentId>"
// waypoints (see backend/sim/world.py route_stations()) representing a bus
// diversion off the rail corridor. This resolves each entry to a coordinate,
// offsetting the virtual waypoint perpendicular to its segment so the detour
// is visually distinguishable from the straight rail line.
export function resolveRouteCoords(routeCodes, stations, segmentsById) {
  return routeCodes
    .map((code) => {
      if (code.startsWith("VIA_ROAD_")) {
        const segId = code.replace("VIA_ROAD_", "");
        const seg = segmentsById[segId];
        if (!seg) return null;
        const a = stationByCode(stations, seg.from);
        const b = stationByCode(stations, seg.to);
        if (!a || !b) return null;
        const mx = (a.lat + b.lat) / 2, my = (a.lon + b.lon) / 2;
        const dx = b.lat - a.lat, dy = b.lon - a.lon;
        const offset = 0.006;
        return [mx + dy * offset, my - dx * offset]; // perpendicular offset
      }
      const s = stationByCode(stations, code);
      return s ? [s.lat, s.lon] : null;
    })
    .filter(Boolean);
}
