import { useState } from "react";
import { useOperationsSocket } from "../hooks/useOperationsSocket";
import { useOperations } from "../state/operationsStore.jsx";
import { useAuth } from "../state/authStore.jsx";
import UserLayout from "../components/layout/UserLayout";
import NetworkMap from "../components/map/NetworkMap";
import MapLegend from "../components/map/MapLegend";
import TrainPickerModal from "../components/user/TrainPickerModal";
import MyTripPanel from "../components/user/MyTripPanel";
import ItineraryPanel from "../components/user/ItineraryPanel";
import PassengerAlertModal from "../components/user/PassengerAlertModal";

export default function UserDashboard() {
  useOperationsSocket();
  const { state } = useOperations();
  const { logout } = useAuth();
  const [myTrip, setMyTrip] = useState(() => {
    const saved = sessionStorage.getItem("tr_my_trip");
    return saved ? JSON.parse(saved) : null;
  });
  const [dismissedAlerts, setDismissedAlerts] = useState([]);
  const [chosenOption, setChosenOption] = useState(() => sessionStorage.getItem("tr_my_choice") || null);

  function chooseOption(optionId) {
    sessionStorage.setItem("tr_my_choice", optionId);
    setChosenOption(optionId);
  }

  function confirmTrip(trainId, destination, origin) {
    const trip = { trainId, destination, origin };
    sessionStorage.setItem("tr_my_trip", JSON.stringify(trip));
    setMyTrip(trip);
  }

  if (!state.trains.length) return null; // wait for first SIMULATION_UPDATED before offering the picker

  if (!myTrip) {
    return (
      <div className="app-shell light">
        <TrainPickerModal
          trains={state.trains}
          hazards={state.hazards}
          clockMin={state.simulationTime}
          onConfirm={confirmTrip}
        />
      </div>
    );
  }

  const myTrain = state.trains.find((t) => t.id === myTrip.trainId) || null;
  const myRecommendation = state.recommendations.find((r) => r.train_id === myTrip.trainId) || null;

  // Pop the alert the first time this recommendation shows up, and again when it
  // flips pending -> approved (that's a genuinely new thing for the passenger to know).
  const alertKey = myRecommendation ? `${myRecommendation.id}-${myRecommendation.status}` : null;
  const showAlert = alertKey && !dismissedAlerts.includes(alertKey);

  // For a passenger the map is binary: your train is either fine (green) or
  // affected (red). Operators get the finer-grained amber/at-risk distinction.
  const mapTrain = myTrain ? { ...myTrain, status: myTrain.delay_min > 0 ? "at_risk" : "on_time" } : null;

  return (
    <UserLayout
      connectionStatus={state.connectionStatus}
      onLogout={logout}
      left={
        <MyTripPanel
          train={myTrain}
          destinationCode={myTrip.destination}
          originCode={myTrip.origin}
          hazards={state.hazards}
          clockMin={state.simulationTime}
          recommendation={myRecommendation}
          chosenOption={chosenOption}
          onChangeTrip={() => {
            sessionStorage.removeItem("tr_my_trip");
            sessionStorage.removeItem("tr_my_choice");
            setChosenOption(null);
            setMyTrip(null);
          }}
        />
      }
      map={
        <div className="map-wrap">
          {/* Section 22: passengers see the network for context, but only THEIR
              train is rendered as a marker -- everyone else's position isn't their business. */}
          <NetworkMap trains={mapTrain ? [mapTrain] : []} hazards={state.hazards} theme="light" />
          <MapLegend />
          {showAlert && myTrain && (
            <PassengerAlertModal
              recommendation={myRecommendation}
              train={myTrain}
              onChooseBus={chooseOption}
              onClose={() => setDismissedAlerts((prev) => [...prev, alertKey])}
            />
          )}
        </div>
      }
      right={
        <ItineraryPanel
          train={myTrain}
          originCode={myTrip.origin}
          destinationCode={myTrip.destination}
          hazards={state.hazards}
          clockMin={state.simulationTime}
          recommendation={myRecommendation}
          chosenOption={chosenOption}
        />
      }
    />
  );
}
