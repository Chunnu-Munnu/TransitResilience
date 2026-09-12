import { useState } from "react";

// Pops up the moment the passenger's own train is affected.
// It offers a CHOICE, with staying on the train first -- that's what they paid
// for. Picking the bus is a second, explicit confirmation with the real
// platform/walking instructions, so nobody gets off a train by accident.
export default function PassengerAlertModal({ recommendation, train, onClose, onChooseBus }) {
  const [confirmingBus, setConfirmingBus] = useState(false);
  const pending = recommendation.status === "pending";
  const rejected = recommendation.status === "rejected";
  const action = recommendation.plan?.passenger_action;
  const options = action?.options || [];
  const stay = options.find((o) => o.id === "stay_on_train");
  const bus = options.find((o) => o.id === "switch_to_bus");

  if (confirmingBus && bus) {
    return (
      <div className="modal-overlay">
        <div className="modal-card alert-modal">
          <div className="alert-modal-title">Switch to the replacement bus?</div>
          <p className="apology">You'll need to leave the train at {bus.alight_station_name}. Here's exactly what to do:</p>

          <div className="action-box">
            <div className="action-grid">
              <div><span className="l">Get off at</span><span className="v">{bus.alight_station_name}</span></div>
              <div><span className="l">Platform</span><span className="v">{bus.platform}</span></div>
              <div><span className="l">Walk to bus bay</span><span className="v">{bus.walk_to_bus_m} m (~{bus.walk_minutes} min)</span></div>
              <div><span className="l">Rejoin the line at</span><span className="v">{bus.rejoin_station_name}</span></div>
            </div>
            <div className="action-timing">
              About <b>{bus.minutes_until_you_must_alight} minutes</b> until your stop ·
              {" "}{bus.bus_count} bus{bus.bus_count === 1 ? "" : "es"} waiting · no extra ticket needed.
            </div>
          </div>

          <div className="modal-actions">
            <button className="btn-secondary" onClick={() => setConfirmingBus(false)}>Back</button>
            <button className="btn-primary" onClick={() => { onChooseBus("switch_to_bus"); onClose(); }}>
              Yes, I'll take the bus
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="modal-overlay">
      <div className="modal-card alert-modal">
        <div className="alert-modal-head">
          <span className="alert-icon high">!</span>
          <div>
            <div className="alert-modal-title">Delay expected on your route</div>
            <div className="muted">{train.id} · decide within ~{action?.minutes_to_decide ?? "a few"} min</div>
          </div>
        </div>

        <p className="apology">Sorry for the inconvenience. Here's what's happening and what your options are.</p>

        <div className="alert-reason">
          <div className="alert-reason-title">Why</div>
          <p style={{ margin: 0 }}>{recommendation.rider_explanation}</p>
        </div>

        <div className="option-choices">
          {stay && (
            <div className="choice-card primary">
              <div className="choice-head">
                <span className="choice-title">{stay.title}</span>
                <span className="choice-badge">YOUR TICKET</span>
              </div>
              <div className="choice-delay">+{stay.delay_min} min</div>
              <p className="choice-detail">{stay.detail}</p>
              <button className="btn-primary full" onClick={() => { onChooseBus("stay_on_train"); onClose(); }}>
                Stay on my train
              </button>
            </div>
          )}

          {bus && (
            <div className="choice-card">
              <div className="choice-head">
                <span className="choice-title">{bus.title}</span>
                <span className="choice-badge alt">ALTERNATIVE</span>
              </div>
              <div className="choice-delay good">+{bus.delay_min} min</div>
              <p className="choice-detail">{bus.detail}</p>
              <button className="btn-secondary full" onClick={() => setConfirmingBus(true)}>
                See bus details
              </button>
            </div>
          )}
        </div>

        <div className={`approval-state ${pending ? "pending" : rejected ? "rejected" : "approved"}`}>
          {pending
            ? "A control-room operator is still reviewing this plan. We'll update you the moment it's confirmed."
            : rejected
            ? "The control room rejected this specific plan -- if the delay is still developing, a new one may follow shortly."
            : `Confirmed by the control room${recommendation.decided_by ? ` (${recommendation.decided_by})` : ""}.`}
        </div>

        <button className="link-btn center-link" onClick={onClose}>Decide later</button>
      </div>
    </div>
  );
}
