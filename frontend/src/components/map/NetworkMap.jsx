import { useEffect, useState } from "react";
import { MapContainer, TileLayer } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import StationLayer from "./StationLayer";
import TrackLayer from "./TrackLayer";
import TrainLayer from "./TrainLayer";
import HazardLayer from "./HazardLayer";
import RerouteLayer from "./RerouteLayer";
import { loadStations } from "./mapGeo";

// Standard, full-color OpenStreetMap tiles (Section 5 of the frontend spec is
// explicit about this) -- no Mapbox/Google key needed, no monochrome basemap.
const OSM_TILE_URL = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
const SATELLITE_TILE_URL = "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";

// Layer architecture (Section 6): Leaflet/OSM base -> our GeoJSON network ->
// live TransitResilience state (trains/hazards/routes) on top.
export default function NetworkMap({ trains, hazards, theme = "dark", selectedTrainId, onSelectTrain, activePlan, myLineId, onSelectSegment, selectedSegmentId }) {
  const [stations, setStations] = useState([]);
  const [baseLayer, setBaseLayer] = useState("street");

  useEffect(() => {
    loadStations().then(setStations);
  }, []);

  if (!stations.length) return <div style={{ height: "100%" }} />;

  return (
    <MapContainer center={[19.08, 72.93]} zoom={11} style={{ height: "100%", width: "100%" }} attributionControl={true}>
      {baseLayer === "satellite" ? (
        <TileLayer url={SATELLITE_TILE_URL} attribution="Tiles &copy; Esri" maxZoom={19} />
      ) : (
        <TileLayer url={OSM_TILE_URL} attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' maxZoom={19} />
      )}
      <div className="map-layer-toggle">
        <button className={baseLayer === "street" ? "active" : ""} onClick={() => setBaseLayer("street")}>Street</button>
        <button className={baseLayer === "satellite" ? "active" : ""} onClick={() => setBaseLayer("satellite")}>Satellite</button>
      </div>
      <StationLayer stations={stations} dark={theme === "dark"} />
      <TrackLayer stations={stations} hazards={hazards} myLineId={myLineId} onSelectSegment={onSelectSegment} selectedSegmentId={selectedSegmentId} />
      <HazardLayer stations={stations} hazards={hazards} />
      <RerouteLayer recommendation={activePlan} stations={stations} hazards={hazards} lineId={myLineId} />
      <TrainLayer trains={trains} stations={stations} hazards={hazards} onSelect={onSelectTrain} selectedTrainId={selectedTrainId} />
    </MapContainer>
  );
}
