// Section 33: makes intervention impact obvious. Values come straight from
// the backend's IMPACT_UPDATED event -- never computed client-side.
export default function ImpactPanel({ metrics }) {
  if (!metrics || !metrics.without_intervention) {
    return (
      <div className="card">
        <h2>Impact</h2>
        <p className="empty">No approved plan yet this session.</p>
      </div>
    );
  }

  const trainIds = Object.keys(metrics.without_intervention);

  return (
    <div className="card">
      <h2>Impact — Without vs. After Approval</h2>
      <table className="impact-table">
        <thead><tr><th></th><th>Without</th><th>After</th></tr></thead>
        <tbody>
          {trainIds.map((id) => (
            <tr key={id}>
              <td>{id}</td>
              <td className="warn-text">+{metrics.without_intervention[id]} min</td>
              <td className="ok-text">+{metrics.after_approval[id]} min</td>
            </tr>
          ))}
          <tr className="divider"><td>Conflicts</td><td>{metrics.conflicts_before}</td><td>{metrics.conflicts_after}</td></tr>
          <tr><td>Passenger-min</td><td>{metrics.passenger_minutes_before.toLocaleString()}</td><td>{metrics.passenger_minutes_after.toLocaleString()}</td></tr>
        </tbody>
      </table>
      <div className="saved-banner">Saved: {metrics.passenger_minutes_saved.toLocaleString()} passenger-minutes</div>
    </div>
  );
}
