import { CircleMarker, Tooltip } from "react-leaflet";

export default function StationLayer({ stations, dark }) {
  // Junction stations (KYN, CSTM, CLA) appear once per line they serve;
  // de-dupe by code so the map shows one marker per physical station.
  const seen = new Set();
  const unique = stations.filter((s) => (seen.has(s.code) ? false : (seen.add(s.code), true)));
  return unique.map((s) => (
    <CircleMarker
      key={s.code}
      center={[s.lat, s.lon]}
      radius={4}
      pathOptions={{ color: dark ? "#5E7093" : "#95A2B8", fillColor: dark ? "#E7ECF7" : "#fff", fillOpacity: 1, weight: 2 }}
    >
      <Tooltip>{s.name}</Tooltip>
    </CircleMarker>
  ));
}
