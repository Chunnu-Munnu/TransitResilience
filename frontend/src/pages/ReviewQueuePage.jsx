import { useMemo, useState } from "react";
import { useOperationsSocket } from "../hooks/useOperationsSocket";
import { useOperations } from "../state/operationsStore.jsx";
import AdminLayout from "../components/layout/AdminLayout";
import NetworkMap from "../components/map/NetworkMap";
import MapLegend from "../components/map/MapLegend";
import RecommendationPanel from "../components/admin/RecommendationPanel";
import PropagationGraph from "../components/admin/PropagationGraph";
import ImpactPanel from "../components/admin/ImpactPanel";
import FooterBar from "../components/admin/FooterBar";

export default function ReviewQueuePage() {
  useOperationsSocket();
  const { state } = useOperations();
  const pending = useMemo(
    () => state.recommendations.filter((r) => r.status === "pending"),
    [state.recommendations]
  );
  const [selectedId, setSelectedId] = useState(null);
  const selected = pending.find((r) => r.id === selectedId) || pending[0] || null;
  const involvedIds = selected
    ? [selected.train_id, ...(selected.plan?.downstream_conflicts || []).map((c) => c.train_id)]
    : [];
  const reviewTrains = selected
    ? state.trains.filter((t) => involvedIds.includes(t.id))
    : state.trains;

  return (
    <AdminLayout
      connectionStatus={state.connectionStatus}
      activeTab="review"
      left={
        <div className="card review-queue-card">
          <h2>Review Queue</h2>
          {!pending.length && <p className="empty">No plans are awaiting operator review.</p>}
          <div className="review-list">
            {pending.map((r) => (
              <button
                key={r.id}
                className={`review-row ${selected?.id === r.id ? "selected" : ""}`}
                onClick={() => setSelectedId(r.id)}
              >
                <span>
                  <b>{r.train_id}</b>
                  <span className="muted"> · {r.affected_segment_id.replace("_", " → ")}</span>
                </span>
                <span className={`tier-badge ${r.tier === "senior" ? "senior" : ""}`}>{r.tier}</span>
              </button>
            ))}
          </div>
        </div>
      }
      map={
        <div className="map-wrap">
          <NetworkMap trains={reviewTrains} hazards={state.hazards} theme="dark" activePlan={selected} />
          <MapLegend />
          {selected && (
            <div className="map-focus-note">
              Reviewing {selected.train_id} · {reviewTrains.length} involved train{reviewTrains.length === 1 ? "" : "s"} shown
            </div>
          )}
        </div>
      }
      right={
        <>
          <RecommendationPanel recommendation={selected} />
          <PropagationGraph recommendation={selected} />
          <ImpactPanel metrics={state.metrics} />
        </>
      }
      footer={<FooterBar metrics={state.metrics} recommendations={state.recommendations} />}
    />
  );
}
