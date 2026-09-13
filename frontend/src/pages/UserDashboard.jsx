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
import ServiceAlerts from "../components/user/ServiceAlerts";
import LiveTrainList from "../components/user/LiveTrainList";
import LiveJourneyView from "../components/user/LiveJourneyView";
import ReportIssuePanel from "../components/user/ReportIssuePanel";
import { SkeletonCard, SkeletonList, SkeletonBox } from "../components/shared/Skeleton";

export default function UserDashboard() {
  useOperationsSocket();
  const { state } = useOperations();
  const { logout } = useAuth();
  const [activeTab, setActiveTab] = useState("my_trip");
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
    const trip = { trainId, destination, origin, lineId: lineId || "central_main" };
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

  function switchTrain(trainId) {
    const trip = { ...myTrip, trainId };
    sessionStorage.setItem("tr_my_trip", JSON.stringify(trip));
    sessionStorage.removeItem("tr_my_choice");
    setChosenOption(null);
    setMyTrip(trip);
    setSwitchingTrain(false);
  }

  function handleHeaderSearchTrain(train) {
    if (train && train.id) {
      confirmTrip(train.id, train.terminus_station, train.departure_station, train.line_id);
      setActiveTab("my_trip");
    }
  }

  const trains = state?.trains ?? [];
  const hazards = state?.hazards ?? [];
  const recommendations = state?.recommendations ?? [];
  const connectionStatus = state?.connectionStatus || "connecting";
  const clockMin = state?.simulationTime ?? 0;

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
  const myAlerts = myTrip?.trainId
    ? recommendations
        .filter((r) => r.train_id === myTrip.trainId)
        .map((r) => ({ id: r.id, reason: r.rider_explanation, status: r.status, decidedBy: r.decided_by, createdAt: r.created_at }))
        .sort((a, b) => b.createdAt - a.createdAt)
    : [];
  // MOST RECENT recommendation for this train, not the first ever seen --
  // `recommendations` accumulates every candidate for the whole session, so
  // picking the first match would get stuck on a long-since-dismissed one and
  // never surface a brand-new hazard on the same train again.
  const myRecommendation = myTrip?.trainId
    ? recommendations.filter((r) => r.train_id === myTrip.trainId).sort((a, b) => b.created_at - a.created_at)[0] || null
    : null;

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
          <ServiceAlerts recommendations={recommendations} clockMin={clockMin} />
        ) : activeTab === "live_journey" ? (
          <LiveJourneyView train={myTrain || trains[0]} hazards={hazards} clockMin={clockMin} />
        ) : activeTab === "report_issue" ? (
          <ReportIssuePanel trainId={myTrip?.trainId} />
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
            <DelayAlertsPanel alerts={myAlerts} />
            <MyTripPanel
              train={myTrain}
              lineId={myTrip?.lineId}
              destinationCode={myTrip?.destination || null}
              originCode={myTrip?.origin || null}
              hazards={hazards}
              clockMin={clockMin}
              recommendation={myRecommendation}
              chosenOption={chosenOption}
              onSwitchTrain={myTrip ? () => setSwitchingTrain(true) : undefined}
              onChangeTrip={() => {
                sessionStorage.removeItem("tr_my_trip");
                sessionStorage.removeItem("tr_my_choice");
                setChosenOption(null);
                setMyTrip(null);
              }}
            />
            {switchingTrain && myTrip && (
              <TrainPickerModal
                trains={trains}
                hazards={hazards}
                clockMin={clockMin}
                initialLineId={myTrip.lineId}
                initialOrigin={myTrip.origin}
                initialDestination={myTrip.destination}
                initialStep={3}
                title="Switch to a different train"
                subtitle="Same trip: still going to your destination"
                onConfirm={switchTrain}
                onCancel={() => setSwitchingTrain(false)}
              />
            )}
          </>
        )
      }
      map={
        <div className="map-wrap">
          {/* Section 22: passengers see the network for context, but only THEIR
              train is rendered as a marker on the my_trip tab -- everyone else's
              position isn't their business. Other tabs show the full fleet. */}
          <NetworkMap
            trains={activeTab === "service_alerts" ? trains : activeTab === "live_journey" ? (myTrain ? [myTrain] : trains) : (mapTrain ? [mapTrain] : [])}
            hazards={hazards}
            theme="light"
            myLineId={myTrip?.lineId}
          />
          <MapLegend />
          {!myTrip && activeTab === "my_trip" && (
            <TrainPickerModal
              trains={trains}
              hazards={hazards}
              clockMin={clockMin}
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
            lineId={myTrip?.lineId}
            originCode={myTrip?.origin || null}
            destinationCode={myTrip?.destination || null}
            hazards={hazards}
            clockMin={clockMin}
            recommendation={myRecommendation}
            chosenOption={chosenOption}
          />
        )
      }
    />
  );
}
