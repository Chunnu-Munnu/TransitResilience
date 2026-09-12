import { useState } from "react";
import { api } from "../../services/api";

// The human-in-the-loop gate, made unmissable. A proposed plan interrupts the
// operator rather than waiting quietly in a side panel -- because a plan that
// nobody notices is functionally the same as no human in the loop at all.
export default function ApprovalModal({ recommendation, onDismiss }) {
  const [busy, setBusy] = useState(false);
  const plan = recommendation.plan || {};
  const decision = plan.robust_decision;
  const conflicts = Object.keys(plan.hold_adjustments || {}).length;

  async function decide(approve) {
    setBusy(true);
    try {
      if (approve) await api.approvePlan(plan.plan_id);
      else await api.rejectPlan(plan.plan_id, "operator");
      onDismiss();
    } finally { setBusy(false); }
  }

  return (
    <div className="modal-overlay">
      <div className="modal-card approval-modal">
        <div className="approval-head">
          <span className={`tier-badge ${recommendation.tier}`}>{recommendation.tier.toUpperCase()} TIER</span>
          <span className="muted">severity {(recommendation.severity * 100).toFixed(0)}%</span>
        </div>

        <h2 className="approval-title">
          {plan.buses_assigned?.length
            ? `Reroute ${recommendation.train_id} via bus diversion`
            : `Hold plan for ${recommendation.train_id}`}
        </h2>
        <p className="muted" style={{ marginBottom: 14 }}>
          Your decision is required before anything changes on the network.
        </p>

        <div className="approval-metrics">
          <div><span className="n">{conflicts}</span><span className="l">Conflicts resolved</span></div>
          <div><span className="n">{decision ? Math.round(decision.scenarios.find((s) => s.action === decision.chosen_action)?.avg_delay_min ?? 0) : "—"}m</span><span className="l">Delay left</span></div>
          <div><span className="n">{plan.co2_avoided_kg ?? 0}kg</span><span className="l">CO₂ avoided</span></div>
        </div>

        <div className="why-box">
          <div className="why-title">WHY THIS PLAN</div>
          <pre>{recommendation.admin_explanation}</pre>
        </div>

        <div className="modal-actions three">
          <button className="btn-reject" disabled={busy} onClick={() => decide(false)}>Reject</button>
          <button className="btn-secondary" disabled={busy} onClick={onDismiss}>Review later</button>
          <button className="btn-approve" disabled={busy} onClick={() => decide(true)}>Approve</button>
        </div>
      </div>
    </div>
  );
}
