import { useEffect, useRef, useState } from "react";
import { api } from "../../services/api";
import AdjustPlan from "./AdjustPlan";
import ValidationResult from "./ValidationResult";

// Section 17: the most important control on the console. The frontend never
// pretends approval succeeded before the backend confirms it (Section 10) --
// every button below awaits a real REST response.
export default function RecommendationPanel({ recommendation, queueTotal = 0, nextUp = null }) {
  const [mode, setMode] = useState("view"); // view | adjust | validated | reject
  const [validation, setValidation] = useState(null);
  const [pendingOverrides, setPendingOverrides] = useState(null);
  const [rejectReason, setRejectReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState(null);
  const cardRef = useRef(null);

  // A fresh candidate (queue advanced, or the operator clicked a different
  // train) should never inherit a stale error/mode from the last one -- and
  // the card is scrolled into view so a live-reflowing column can never leave
  // the decision buttons hidden above or below the fold.
  useEffect(() => {
    setMode("view");
    setFlash(null);
    setValidation(null);
    setPendingOverrides(null);
    setRejectReason("");
    cardRef.current?.scrollIntoView({ block: "nearest" });
  }, [recommendation?.id]);

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

  // Every action here surfaces failure visibly (a flash message) instead of
  // silently doing nothing -- a click that appears to have no effect (e.g. a
  // dropped request, or a plan someone else already decided) is otherwise
  // indistinguishable from a missing button.
  async function handleApprove() {
    setBusy(true);
    setFlash(null);
    try {
      await api.approvePlan(plan.plan_id);
    } catch (e) {
      setFlash({ ok: false, text: `Could not approve: ${e.message}` });
    } finally { setBusy(false); }
  }

  async function handleValidate(overrides) {
    setBusy(true);
    setFlash(null);
    try {
      const result = await api.validatePlan(plan.plan_id, overrides);
      setValidation(result);
      setPendingOverrides(overrides);
      setMode("validated");
    } catch (e) {
      setFlash({ ok: false, text: `Could not validate: ${e.message}` });
    } finally { setBusy(false); }
  }

  async function handleApproveAdjusted() {
    setBusy(true);
    setFlash(null);
    try {
      await api.modifyPlan(plan.plan_id, pendingOverrides);
      await api.approvePlan(plan.plan_id);
      setMode("view");
    } catch (e) {
      setFlash({ ok: false, text: `Could not approve adjusted plan: ${e.message}` });
    } finally { setBusy(false); }
  }

  async function handleReject() {
    setBusy(true);
    setFlash(null);
    try {
      await api.rejectPlan(plan.plan_id, "operator", rejectReason);
      setMode("view");
    } catch (e) {
      setFlash({ ok: false, text: `Could not reject: ${e.message}` });
    } finally { setBusy(false); }
  }

  const busNote = plan.buses_assigned?.length
    ? `Reroute ${recommendation.train_id} via bus diversion (${plan.buses_assigned.length} vehicle${plan.buses_assigned.length > 1 ? "s" : ""})`
    : `Hold-only re-plan for ${recommendation.train_id}`;

  return (
    <div ref={cardRef} className={`reco-card ${!decided ? "awaiting" : ""}`}>
      <div className="reco-head">
        <h2>Operator Decision {decided ? "" : "Required"}</h2>
        {!decided && <span className="awaiting-pill">AWAITING YOU</span>}
      </div>
      {!decided && queueTotal > 0 && (
        <div className="reco-queue-note">
          Reviewing 1 of {queueTotal} pending · ordered by confidence (severity)
          {nextUp && ` · next: ${nextUp.train_id} at ${(nextUp.severity * 100).toFixed(0)}%`}
        </div>
      )}
      <div className="reco-body">
        {mode === "view" && (
          <>
            <div className="reco-title">{busNote}</div>
            <div className="reco-tier">{recommendation.tier.toUpperCase()} TIER · confidence {(recommendation.severity * 100).toFixed(0)}% {decided && `· ${recommendation.status.toUpperCase()}`}</div>

            <div className="why-box">
              <div className="why-title">WHY?</div>
              <pre>{recommendation.admin_explanation}</pre>
            </div>

            <div className="reco-metrics">
              <div className="reco-metric"><div className="n">{Object.keys(plan.hold_adjustments).length}</div><div className="l">Conflicts avoided</div></div>
              <div className="reco-metric"><div className="n">{plan.co2_avoided_kg} kg</div><div className="l">CO₂ avoided</div></div>
            </div>

            {!decided && (
              <div className="decision-box">
                <div className="decision-label">YOUR DECISION</div>
                <div className="reco-actions">
                  <button className="btn-approve" disabled={busy} onClick={handleApprove}>{busy ? "Approving…" : "Approve"}</button>
                  <button className="btn-adjust" disabled={busy} onClick={() => setMode("adjust")}>Adjust Plan</button>
                  <button className="btn-reject" disabled={busy} onClick={() => setMode("reject")}>Reject</button>
                </div>
                {flash && <div className={`flash ${flash.ok ? "ok" : "bad"}`}>{flash.text}</div>}
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
            {flash && <div className={`flash ${flash.ok ? "ok" : "bad"}`}>{flash.text}</div>}
          </div>
        )}
      </div>
    </div>
  );
}
