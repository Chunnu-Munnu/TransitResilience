export default function ValidationResult({ result, onApprove, onBack }) {
  if (result.valid) {
    return (
      <div className="validation-box valid">
        <div className="validation-title">PLAN VALIDATION</div>
        {result.checks.map((c, i) => (
          <div key={i} className={`check-row ${c.ok ? "ok" : "bad"}`}>
            {c.ok ? "✓" : "✕"} {c.label}
          </div>
        ))}
        {result.additional_delay_min > 0 && (
          <div className="check-warn">⚠ Additional delay: +{result.additional_delay_min} min</div>
        )}
        <div className="check-row">Passenger impact: +{result.passenger_impact_minutes.toLocaleString()} passenger-minutes</div>
        <button className="btn-approve full" onClick={onApprove}>Approve Adjusted Plan</button>
      </div>
    );
  }

  return (
    <div className="validation-box invalid">
      <div className="validation-title">✕ PLAN INVALID</div>
      {result.checks.filter((c) => !c.ok).map((c, i) => (
        <div key={i} className="check-row bad">{c.detail || c.label}</div>
      ))}
      {result.suggested_alternatives?.length > 0 && (
        <>
          <div className="validation-subtitle">Suggested alternatives</div>
          {result.suggested_alternatives.map((s, i) => <div key={i} className="check-row">{s}</div>)}
        </>
      )}
      <button className="btn-secondary full" onClick={onBack}>Back</button>
    </div>
  );
}
