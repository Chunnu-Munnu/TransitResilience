// Section 38: connection error states.
export default function Notification({ connectionStatus, lastUpdateClock }) {
  if (connectionStatus === "open") return null;

  if (connectionStatus === "connecting") {
    return <div className="notif notif-info">Unable to connect to operations server. Retrying…</div>;
  }

  return (
    <div className="notif notif-warn">
      <b>LIVE CONNECTION LOST</b>
      <div>Last update: {lastUpdateClock || "—"}</div>
    </div>
  );
}
