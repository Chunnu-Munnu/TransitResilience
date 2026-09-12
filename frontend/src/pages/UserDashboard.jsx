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
import ServiceAlerts from "../components/user/ServiceAlerts";
import LiveTrainList from "../components/user/LiveTrainList";
import LiveJourneyView from "../components/user/LiveJourneyView";
import { SkeletonCard, SkeletonList, SkeletonBox } from "../components/shared/Skeleton";

export default function UserDashboard() {
  useOperationsSocket();
  const { state } = useOperations();
  const { logout } = useAuth();
  const [activeTab, setActiveTab] = useState("my_trip");
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

    try {
      const savedRecents = localStorage.getItem("tr_recent_trips");
      const recents = savedRecents ? JSON.parse(savedRecents) : [];
      const updated = [
        trip,
        ...recents.filter((r) => !(r.trainId === trainId && r.origin === origin && r.destination === destination)),
      ].slice(0, 5);
      localStorage.setItem("tr_recent_trips", JSON.stringify(updated));
    } catch {
      // ignore storage errors
    }
  }

  function handleHeaderSearchTrain(train) {
    if (train && train.id) {
      confirmTrip(train.id, train.terminus_station || "KYN", train.departure_station || "CSTM");
      setActiveTab("my_trip");
    }
  }

  const trains = state?.trains ?? [];
  const hazards = state?.hazards ?? [];
  const recommendations = state?.recommendations ?? [];
  const connectionStatus = state?.connectionStatus || "connecting";

  if (!trains.length) {
    return (
      <UserLayout
        connectionStatus={connectionStatus}
        onLogout={logout}
        activeTab={activeTab}
        onTabChange={setActiveTab}
        left={<SkeletonCard />}
        map={
          <div className="card" style={{ height: "100%", minHeight: "420px", padding: "16px", display: "flex", flexDirection: "column", gap: "12px" }}>
            <SkeletonBox width="30%" height="20px" />
            <SkeletonBox width="100%" height="100%" style={{ flex: 1, borderRadius: "10px" }} />
          </div>
        }
        right={<SkeletonList count={6} />}
      />
    );
  }

  const myTrain = myTrip?.trainId ? (trains.find((t) => t.id === myTrip.trainId) || null) : null;
  const myRecommendation = myTrip?.trainId ? (recommendations.find((r) => r.train_id === myTrip.trainId) || null) : null;

  // Pop the alert the first time this recommendation shows up, and again when it
  // flips pending -> approved (that's a genuinely new thing for the passenger to know).
  const alertKey = myRecommendation ? `${myRecommendation.id}-${myRecommendation.status}` : null;
  const showAlert = alertKey && !dismissedAlerts.includes(alertKey);

  // For a passenger the map is binary: your train is either fine (green) or
  // affected (red). Operators get the finer-grained amber/at-risk distinction.
  const mapTrain = myTrain ? { ...myTrain, status: myTrain.delay_min > 0 ? "at_risk" : "on_time" } : null;

  const activeAlertsCount = recommendations.length;

  return (
    <UserLayout
      connectionStatus={connectionStatus}
      onLogout={logout}
      activeTab={activeTab}
      onTabChange={setActiveTab}
      onSearchTrain={handleHeaderSearchTrain}
      left={
        activeTab === "service_alerts" ? (
          <ServiceAlerts recommendations={recommendations} clockMin={state?.simulationTime ?? 0} />
        ) : activeTab === "live_journey" ? (
          <LiveJourneyView train={myTrain || trains[0]} hazards={hazards} clockMin={state?.simulationTime ?? 0} />
        ) : (
          <>
            {activeAlertsCount > 0 && (
              <div
                className="card alert-summary-banner"
                style={{
                  marginBottom: "12px",
                  background: "var(--blue-soft, #E9F0FF)",
                  border: "1px solid var(--blue, #2F6FED)",
                  padding: "12px 14px",
                  borderRadius: "10px",
                  display: "flex",
                  alignItems: "center",
                  justify: "space-between",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                  <span style={{ color: "var(--blue, #2F6FED)", fontWeight: "800", fontSize: "1.1rem" }}>ℹ</span>
                  <div>
                    <div style={{ fontWeight: "700", fontSize: "0.85rem", color: "var(--ink, #152238)" }}>
                      {activeAlertsCount} Active Network Alert{activeAlertsCount === 1 ? "" : "s"}
                    </div>
                    <div style={{ fontSize: "0.75rem", color: "var(--ink-soft, #5B6B85)" }}>
                      Corridor weather or reroute updates available.
                    </div>
                  </div>
                </div>
                <button
                  className="link-btn"
                  style={{ fontSize: "0.78rem", color: "var(--blue, #2F6FED)", fontWeight: "600", border: "none", background: "transparent", cursor: "pointer" }}
                  onClick={() => setActiveTab("service_alerts")}
                >
                  View Alerts →
                </button>
              </div>
            )}
            <MyTripPanel
              train={myTrain}
              destinationCode={myTrip?.destination || null}
              originCode={myTrip?.origin || null}
              hazards={hazards}
              clockMin={state?.simulationTime ?? 0}
              recommendation={myRecommendation}
              chosenOption={chosenOption}
              onChangeTrip={() => {
                sessionStorage.removeItem("tr_my_trip");
                sessionStorage.removeItem("tr_my_choice");
                setChosenOption(null);
                setMyTrip(null);
              }}
            />
          </>
        )
      }
      map={
        <div className="map-wrap">
          {/* Passengers see the network for context */}
          <NetworkMap
            trains={activeTab === "service_alerts" ? trains : activeTab === "live_journey" ? (myTrain ? [myTrain] : trains) : (mapTrain ? [mapTrain] : [])}
            hazards={hazards}
            theme="light"
          />
          <MapLegend />
          {!myTrip && activeTab === "my_trip" && (
            <TrainPickerModal
              trains={trains}
              hazards={hazards}
              clockMin={state?.simulationTime ?? 0}
              onConfirm={confirmTrip}
            />
          )}
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
        activeTab === "service_alerts" ? (
          <LiveTrainList trains={trains} />
        ) : (
          <ItineraryPanel
            train={myTrain || trains[0]}
            originCode={myTrip?.origin || null}
            destinationCode={myTrip?.destination || null}
            hazards={hazards}
            clockMin={state?.simulationTime ?? 0}
            recommendation={myRecommendation}
            chosenOption={chosenOption}
          />
        )
      }
    />
  );
}
