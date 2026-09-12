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
import DelayAlertsPanel from "../components/user/DelayAlertsPanel";

export default function UserDashboard() {
  useOperationsSocket();
  const { state } = useOperations();
  const { logout } = useAuth();
  const [myTrip, setMyTrip] = useState(() => {
    const saved = sessionStorage.getItem("tr_my_trip");
    if (!saved) return null;
    const trip = JSON.parse(saved);
    return trip.lineId ? trip : { ...trip, lineId: "central_main" }; // back-compat with pre-multi-line sessions
  });
  const [dismissedAlerts, setDismissedAlerts] = useState([]);
  const [chosenOption, setChosenOption] = useState(() => sessionStorage.getItem("tr_my_choice") || null);
  const [switchingTrain, setSwitchingTrain] = useState(false);

  function chooseOption(optionId) {
    sessionStorage.setItem("tr_my_choice", optionId);
    setChosenOption(optionId);
  }

  function confirmTrip(trainId, destination, origin, lineId) {
    const trip = { trainId, destination, origin, lineId };
    sessionStorage.setItem("tr_my_trip", JSON.stringify(trip));
    setMyTrip(trip);
  }

  function switchTrain(trainId) {
    const trip = { ...myTrip, trainId };
    sessionStorage.setItem("tr_my_trip", JSON.stringify(trip));
    sessionStorage.removeItem("tr_my_choice");
    setChosenOption(null);
    setMyTrip(trip);
    setSwitchingTrain(false);
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
  const myAlerts = state.recommendations
    .filter((r) => r.train_id === myTrip.trainId)
    .map((r) => ({ id: r.id, reason: r.rider_explanation, status: r.status, decidedBy: r.decided_by, createdAt: r.created_at }))
    .sort((a, b) => b.createdAt - a.createdAt);
  // MOST RECENT recommendation for this train, not the first ever seen --
  // `state.recommendations` accumulates every candidate for the whole session,
  // so picking the first match would get stuck on a long-since-dismissed one
  // and never surface a brand-new hazard on the same train again.
  const myRecommendation = state.recommendations
    .filter((r) => r.train_id === myTrip.trainId)
    .sort((a, b) => b.created_at - a.created_at)[0] || null;

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
        <>
          <DelayAlertsPanel alerts={myAlerts} />
          <MyTripPanel
            train={myTrain}
            lineId={myTrip.lineId}
            destinationCode={myTrip.destination}
            originCode={myTrip.origin}
            hazards={state.hazards}
            clockMin={state.simulationTime}
            recommendation={myRecommendation}
            chosenOption={chosenOption}
            onSwitchTrain={() => setSwitchingTrain(true)}
            onChangeTrip={() => {
              sessionStorage.removeItem("tr_my_trip");
              sessionStorage.removeItem("tr_my_choice");
              setChosenOption(null);
              setMyTrip(null);
            }}
          />
          {switchingTrain && (
            <TrainPickerModal
              trains={state.trains}
              hazards={state.hazards}
              clockMin={state.simulationTime}
              initialLineId={myTrip.lineId}
              initialOrigin={myTrip.origin}
              initialDestination={myTrip.destination}
              initialStep={3}
              title="Switch to a different train"
              subtitle={`Same trip: still going to your destination`}
              onConfirm={switchTrain}
              onCancel={() => setSwitchingTrain(false)}
            />
          )}
        </>
      }
      map={
        <div className="map-wrap">
          {/* Section 22: passengers see the network for context, but only THEIR
              train is rendered as a marker -- everyone else's position isn't their business. */}
          <NetworkMap trains={mapTrain ? [mapTrain] : []} hazards={state.hazards} theme="light" myLineId={myTrip.lineId} />
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
          lineId={myTrip.lineId}
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
