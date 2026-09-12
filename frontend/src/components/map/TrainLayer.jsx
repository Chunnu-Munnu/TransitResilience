import { CircleMarker, Tooltip } from "react-leaflet";
import { trainPosition, STATUS_COLOR } from "./mapGeo";

// Section 7: every train renders; clicking selects it (opens details elsewhere).
export default function TrainLayer({ trains, stations, hazards, onSelect, selectedTrainId }) {
  return trains.map((t) => {
    const pos = trainPosition(t, stations, hazards);
    if (!pos) return null;
    const selected = t.id === selectedTrainId;
    return (
      <CircleMarker
        key={t.id}
        center={[pos.lat, pos.lon]}
        radius={selected ? 9 : 7}
        pathOptions={{
          color: selected ? "#fff" : "#0A121F",
          weight: selected ? 2.5 : 1.5,
          fillColor: STATUS_COLOR[t.status] || STATUS_COLOR.on_time,
          fillOpacity: 1,
        }}
        eventHandlers={{ click: () => onSelect && onSelect(t.id) }}
      >
        <Tooltip>{t.id} · {t.status.replace("_", " ")} {t.delay_min ? `· +${t.delay_min}m` : ""}</Tooltip>
      </CircleMarker>
    );
  });
}
