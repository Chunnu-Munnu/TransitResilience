import { useState } from "react";

// Section 18: ONE unified Adjust Plan flow -- no separate manual-override workflow.
export default function AdjustPlan({ plan, onValidate, onCancel }) {
  const [overrides, setOverrides] = useState({ ...plan.hold_adjustments });

  return (
    <div className="adjust-box">
      <div className="validation-title">ADJUST PLAN</div>
      <div className="check-row">Train: {plan.plan_id}</div>
      <div className="check-row">Route: {plan.approved_route.join(" → ")}</div>
      {Object.keys(overrides).length === 0 && <p className="empty">No downstream holds to adjust for this plan.</p>}
      {Object.entries(overrides).map(([trainId, val]) => (
        <label key={trainId} className="adjust-field">
          <span>{trainId} hold (min)</span>
          <input
            type="number" min={0} max={60} value={val}
            onChange={(e) => setOverrides({ ...overrides, [trainId]: parseFloat(e.target.value) || 0 })}
          />
        </label>
      ))}
      <div className="reco-actions">
        <button className="btn-secondary" onClick={onCancel}>Cancel</button>
        <button className="btn-adjust" onClick={() => onValidate(overrides)}>Validate Plan</button>
      </div>
    </div>
  );
}
