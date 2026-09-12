// The cascade, as an actual chart: one bar per affected train, scaled to the
// largest delay, so "how bad and who" is readable in one glance. Every number
// comes from backend/propagation/graph.py -- nothing is computed here.
export default function PropagationGraph({ recommendation }) {
  if (!recommendation) {
    return (
      <div className="card">
        <h2>Delay Propagation</h2>
        <p className="empty">No active disruption to trace.</p>
      </div>
    );
  }

  const conflicts = recommendation.plan?.downstream_conflicts || [];
  const sourceDelay = Math.max(
    ...conflicts.map((c) => c.inherited_delay_min),
    recommendation.plan?.robust_decision?.scenarios?.[0]?.avg_delay_min || 0,
    1
  );

  const rows = [
    { id: recommendation.train_id, delay: sourceDelay, isSource: true,
      reason: `Hazard on ${recommendation.affected_segment_id.replace("_", " → ")}` },
    ...conflicts.map((c) => ({ id: c.train_id, delay: c.inherited_delay_min, isSource: false, reason: c.reason })),
  ];
  const maxDelay = Math.max(...rows.map((r) => r.delay), 1);
  const totalPassengerMinutes = Math.round(rows.reduce((sum, r) => sum + r.delay, 0) * 120);

  return (
    <div className="card">
      <h2>Delay Propagation — {conflicts.length} train{conflicts.length === 1 ? "" : "s"} affected downstream</h2>

      <div className="delay-chart">
        {rows.map((r, i) => (
          <div className="delay-row" key={r.id}>
            <span className="delay-train">{r.id}</span>
            <div className="delay-track">
              <div
                className={`delay-bar ${r.isSource ? "source" : ""}`}
                style={{ width: `${Math.max(4, (r.delay / maxDelay) * 100)}%` }}
              />
            </div>
            <span className="delay-value mono">+{Math.round(r.delay)}m</span>
            {r.isSource && <span className="delay-tag">source</span>}
            {i > 0 && <span className="delay-tag inherit">inherited</span>}
          </div>
        ))}
      </div>

      <div className="delay-total">
        Total exposure: <b>{totalPassengerMinutes.toLocaleString()} passenger-minutes</b> across {rows.length} services
        (~120 passengers per train).
      </div>

      <details className="cascade-details">
        <summary>Why each train is affected</summary>
        {conflicts.map((c) => (
          <div className="cascade-reason" key={c.train_id}>
            <b>{c.train_id}</b> — {c.reason}
          </div>
        ))}
        {conflicts.length === 0 && (
          <div className="cascade-reason">The timetable gaps absorbed this delay — no downstream train is affected.</div>
        )}
      </details>

      <p className="muted" style={{ marginTop: 10 }}>
        Each hop is a headway violation: the gap to the next train shrinks below the 5-minute minimum, so that train
        must also be held — then the same test runs on the train behind it, until a gap is big enough to absorb the rest.
      </p>
    </div>
  );
}
