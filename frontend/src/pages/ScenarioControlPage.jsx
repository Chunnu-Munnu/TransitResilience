import { useOperationsSocket } from "../hooks/useOperationsSocket";
import { useOperations } from "../state/operationsStore.jsx";
import AdminLayout from "../components/layout/AdminLayout";
import NetworkMap from "../components/map/NetworkMap";
import MapLegend from "../components/map/MapLegend";
import SimulationControls from "../components/admin/SimulationControls";
import BlockageControls from "../components/admin/BlockageControls";
import RecommendationPanel from "../components/admin/RecommendationPanel";
import PropagationGraph from "../components/admin/PropagationGraph";
import FooterBar from "../components/admin/FooterBar";

const ACTION_LABELS = {
  hold_5min: "Hold the train 5 minutes",
  hold_15min: "Hold the train 15 minutes",
  speed_restrict: "Run at reduced speed",
  reroute_via_bus: "Reroute passengers via bus",
};

// The robust decision (backend/optimizer/robust.py), shown as "how late does
// each option leave us, and does it still work if the timing is off" -- not as
// a table of opaque scores.
function RobustScenarioTable({ recommendation }) {
  const decision = recommendation?.plan?.robust_decision;
  if (!decision) {
    return (
      <div className="card">
        <h2>Robust Decision — Monte Carlo Scenarios</h2>
        <p className="empty">No active hazard. Raise rainfall past 65mm or close a segment to trigger one.</p>
      </div>
    );
  }

  const best = decision.scenarios.find((s) => s.action === decision.chosen_action);
  const maxDelay = Math.max(...decision.scenarios.map((s) => s.avg_delay_min || 0), 1);

  return (
    <div className="card">
      <h2>What if the flood arrives early or late?</h2>
      <p className="muted" style={{ marginBottom: 14 }}>
        Forecast says the water hits in <b>{decision.onset_minutes} min</b>, but that could be off by ±10 min.
        Each option below was replayed against <b>10 different arrival times</b>.
      </p>

      {decision.scenarios.map((s) => {
        const chosen = s.action === decision.chosen_action;
        const safeCount = Math.round((s.within_budget_rate ?? 0) * 10);
        return (
          <div className={`option-row ${chosen ? "chosen" : ""}`} key={s.action}>
            <div className="option-head">
              <span className="option-name">{ACTION_LABELS[s.action] || s.action.replace(/_/g, " ")}</span>
              {chosen && <span className="option-pick">CHOSEN</span>}
            </div>
            <div className="option-bar-wrap">
              <div
                className={`option-bar ${chosen ? "good" : safeCount >= 7 ? "ok" : "bad"}`}
                style={{ width: `${Math.max(6, (s.avg_delay_min / maxDelay) * 100)}%` }}
              />
              <span className="option-delay">{Math.round(s.avg_delay_min)} min delay</span>
            </div>
            <div className="option-sub">
              Safe in <b>{safeCount} of 10</b> timings · {(s.avg_passenger_minutes ?? 0).toLocaleString()} passenger-minutes lost
            </div>
          </div>
        );
      })}

      <div className="option-verdict">
        <b>{ACTION_LABELS[decision.chosen_action] || decision.chosen_action}</b> wins: it leaves the least delay
        ({Math.round(best?.avg_delay_min ?? 0)} min) <i>and</i> stays under the {decision.corridor_budget_min}-min
        corridor limit in {Math.round((best?.within_budget_rate ?? 0) * 10)} of 10 timings. We judge by the
        <b> worst</b> timing, not the average — so the plan still holds if the water arrives early.
      </div>
    </div>
  );
}

export default function ScenarioControlPage() {
  useOperationsSocket();
  const { state } = useOperations();
  const activeRecommendation = state.recommendations.find((r) => r.status === "pending")
    || state.recommendations[state.recommendations.length - 1]
    || null;

  // Only the source train plus the ones it cascades into.
  const involvedIds = activeRecommendation
    ? [activeRecommendation.train_id,
       ...(activeRecommendation.plan?.downstream_conflicts || []).map((c) => c.train_id)]
    : [];
  const scenarioTrains = activeRecommendation
    ? state.trains.filter((t) => involvedIds.includes(t.id))
    : state.trains;

  return (
    <AdminLayout
      connectionStatus={state.connectionStatus}
      activeTab="scenario"
      left={
        <>
          <SimulationControls />
          <BlockageControls hazards={state.hazards} clockMin={state.simulationTime} />
        </>
      }
      map={
        <div className="map-wrap">
          {/* Scenario view is about ONE disruption, so only the train under
              consideration (and the trains it cascades into) are drawn. The full
              fleet lives on the Operations page. */}
          <NetworkMap trains={scenarioTrains} hazards={state.hazards} theme="dark" activePlan={activeRecommendation} />
          <MapLegend />
          {activeRecommendation && (
            <div className="map-focus-note">
              Showing {scenarioTrains.length} train{scenarioTrains.length === 1 ? "" : "s"} involved in this scenario ·
              full fleet on Operations
            </div>
          )}
        </div>
      }
      right={
        <>
          <RobustScenarioTable recommendation={activeRecommendation} />
          {/* The operator's decision power belongs here too, not only on Operations --
              you should be able to act on the scenario you're looking at. */}
          <RecommendationPanel recommendation={activeRecommendation} />
          <PropagationGraph recommendation={activeRecommendation} />
        </>
      }
      footer={<FooterBar metrics={state.metrics} recommendations={state.recommendations} />}
    />
  );
}
