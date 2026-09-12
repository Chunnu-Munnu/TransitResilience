import Loader from "./Loader";

// Section 38: connection error states.
export default function Notification({ connectionStatus, lastUpdateClock }) {
  if (connectionStatus === "open") return null;

  if (connectionStatus === "connecting" || connectionStatus === "reconnecting") {
    return (
      <div className="notif notif-info" style={{ display: "flex", alignItems: "center", gap: "10px" }}>
        <Loader size={20} />
        <span>Unable to connect to operations server. Retrying…</span>
      </div>
    );
  }

  return (
    <div className="notif notif-warn">
      <b>LIVE CONNECTION LOST</b>
      <div>Last update: {lastUpdateClock || "—"}</div>
    </div>
  );
}
