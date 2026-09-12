import { useState } from "react";
import { api } from "../../services/api";
import AdjustPlan from "./AdjustPlan";
import ValidationResult from "./ValidationResult";

// Section 17: the most important control on the console. The frontend never
// pretends approval succeeded before the backend confirms it (Section 10) --
// every button below awaits a real REST response.
export default function RecommendationPanel({ recommendation }) {
  const [mode, setMode] = useState("view"); // view | adjust | validated | reject
  const [validation, setValidation] = useState(null);
  const [pendingOverrides, setPendingOverrides] = useState(null);
  const [rejectReason, setRejectReason] = useState("");
  const [busy, setBusy] = useState(false);

  if (!recommendation) {
    return (
      <div className="reco-card">
        <div className="reco-head"><h2>Operator Decision</h2></div>
        <div className="reco-body">
          <p className="empty">Nothing awaiting your decision. When a predicted delay crosses threshold, the optimizer's proposal appears here for you to approve, adjust or reject.</p>
        </div>
      </div>
    );
  }

  const plan = recommendation.plan;
  const decided = recommendation.status !== "pending";

  async function handleApprove() {
    setBusy(true);
    try { await api.approvePlan(plan.plan_id); } finally { setBusy(false); }
  }

  async function handleValidate(overrides) {
    setBusy(true);
    try {
      const result = await api.validatePlan(plan.plan_id, overrides);
      setValidation(result);
      setPendingOverrides(overrides);
      setMode("validated");
    } finally { setBusy(false); }
  }

  async function handleApproveAdjusted() {
    setBusy(true);
    try {
      await api.modifyPlan(plan.plan_id, pendingOverrides);
      await api.approvePlan(plan.plan_id);
      setMode("view");
    } finally { setBusy(false); }
  }

  async function handleReject() {
    setBusy(true);
    try {
      await api.rejectPlan(plan.plan_id, "operator", rejectReason);
      setMode("view");
    } finally { setBusy(false); }
  }

  const busNote = plan.buses_assigned?.length
    ? `Reroute ${recommendation.train_id} via bus diversion (${plan.buses_assigned.length} vehicle${plan.buses_assigned.length > 1 ? "s" : ""})`
    : `Hold-only re-plan for ${recommendation.train_id}`;

  return (
    <div className={`reco-card ${!decided ? "awaiting" : ""}`}>
      <div className="reco-head">
        <h2>Operator Decision {decided ? "" : "Required"}</h2>
        {!decided && <span className="awaiting-pill">AWAITING YOU</span>}
      </div>
      <div className="reco-body">
        {mode === "view" && (
          <>
            <div className="reco-title">{busNote}</div>
            <div className="reco-tier">{recommendation.tier.toUpperCase()} TIER · severity {(recommendation.severity * 100).toFixed(0)}% {decided && `· ${recommendation.status.toUpperCase()}`}</div>

            <div className="why-box">
              <div className="why-title">WHY?</div>
              <pre>{recommendation.admin_explanation}</pre>
            </div>

            <div className="reco-metrics">
              <div className="reco-metric"><div className="n">{Object.keys(plan.hold_adjustments).length}</div><div className="l">Conflicts avoided</div></div>
              <div className="reco-metric"><div className="n">{plan.co2_avoided_kg} kg</div><div className="l">CO₂ avoided</div></div>
            </div>

            {!decided && (
              <div className="reco-actions">
                <button className="btn-approve" disabled={busy} onClick={handleApprove}>Approve</button>
                <button className="btn-adjust" disabled={busy} onClick={() => setMode("adjust")}>Adjust Plan</button>
                <button className="btn-reject" disabled={busy} onClick={() => setMode("reject")}>Reject</button>
              </div>
            )}
          </>
        )}

        {mode === "adjust" && (
          <AdjustPlan plan={plan} onValidate={handleValidate} onCancel={() => setMode("view")} />
        )}

        {mode === "validated" && validation && (
          <ValidationResult result={validation} onApprove={handleApproveAdjusted} onBack={() => setMode("adjust")} />
        )}

        {mode === "reject" && (
          <div className="adjust-box">
            <div>
              <div className="validation-title">REJECT RECOMMENDATION</div>
              <p className="muted">
                Add an operator note so the decision log explains why this plan was not accepted.
              </p>
            </div>
            <div className="reason-chips">
              {["Insufficient buses", "Track inspection pending", "Prefer hold-only plan"].map((reason) => (
                <button key={reason} type="button" onClick={() => setRejectReason(reason)}>{reason}</button>
              ))}
            </div>
            <label className="adjust-field reject-note">
              <span>Operator note</span>
              <textarea
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="e.g. Road access near the diversion point has not been confirmed."
                rows={4}
              />
            </label>
            <div className="reco-actions">
              <button className="btn-secondary" onClick={() => setMode("view")}>Cancel</button>
              <button className="btn-reject" disabled={busy} onClick={handleReject}>Confirm Rejection</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
