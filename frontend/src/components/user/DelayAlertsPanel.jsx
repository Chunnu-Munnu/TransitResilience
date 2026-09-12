// Sits below the nav, above "My Trip" -- a running log of every disruption
// raised for this passenger's train, so the reason for a delay stays visible
// on the dashboard after the popup that first announced it is dismissed.
export default function DelayAlertsPanel({ alerts }) {
  if (!alerts.length) return null;

  return (
    <div className="card delay-alerts-card">
      <h2 style={{ marginBottom: 8 }}>Delay & disruption alerts</h2>
      <div className="delay-alerts-list">
        {alerts.map((a) => {
          const pillClass = a.status === "approved" ? "at_risk" : a.status === "rejected" ? "rejected" : "delayed";
          const pillText = a.status === "approved" ? "Confirmed" : a.status === "rejected" ? "Rejected" : "Under review";
          return (
            <div className={`delay-alert-row status-${a.status}`} key={a.id}>
              <div className="delay-alert-head">
                <span className={`status-pill status-${pillClass}`}>{pillText}</span>
                <span className="delay-alert-time mono">
                  {new Date(a.createdAt * 1000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </span>
              </div>
              <p className="delay-alert-reason">{a.reason}</p>
              {a.decidedBy && a.status !== "pending" && (
                <p className="muted delay-alert-decided">
                  {a.status === "rejected" ? "Rejected by" : "Confirmed by"} {a.decidedBy}
                </p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
