import { CircleMarker, Tooltip } from "react-leaflet";

export default function StationLayer({ stations, dark }) {
  return stations.map((s) => (
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
