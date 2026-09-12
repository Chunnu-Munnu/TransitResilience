import { useOperationsSocket } from "../hooks/useOperationsSocket";
import { useOperations } from "../state/operationsStore.jsx";
import { useTrains } from "../hooks/useTrains";
import AdminLayout from "../components/layout/AdminLayout";
import NetworkMap from "../components/map/NetworkMap";
import MapLegend from "../components/map/MapLegend";
import NetworkOverview from "../components/admin/NetworkOverview";
import ActiveEvents from "../components/admin/ActiveEvents";
import TrainList from "../components/admin/TrainList";
import TrainDetails from "../components/admin/TrainDetails";
import RecommendationPanel from "../components/admin/RecommendationPanel";
import PropagationGraph from "../components/admin/PropagationGraph";
import ImpactPanel from "../components/admin/ImpactPanel";
import SimulationControls from "../components/admin/SimulationControls";
import FooterBar from "../components/admin/FooterBar";

export default function AdminDashboard() {
  useOperationsSocket();
  const { state } = useOperations();
  const { trains, selectedTrain, selectedTrainId, selectTrain } = useTrains();

  // Review queue is ordered by confidence (severity) so the operator always
  // works through the most-certain, highest-impact call first -- not
  // whichever candidate happened to arrive most recently.
  const pendingBySeverity = [...state.recommendations]
    .filter((r) => r.status === "pending")
    .sort((a, b) => b.severity - a.severity);
  const activeRecommendation =
    (selectedTrainId && pendingBySeverity.find((r) => r.train_id === selectedTrainId)) ||
    pendingBySeverity[0] ||
    null;
  const nextUp = pendingBySeverity.find((r) => r.id !== activeRecommendation?.id) || null;

  return (
    <AdminLayout
      connectionStatus={state.connectionStatus}
      left={
        <>
          <NetworkOverview trains={trains} recommendations={state.recommendations} />
          <ActiveEvents recommendations={state.recommendations} manualEvents={state.manualEvents} onSelect={selectTrain} />
          <TrainList trains={trains} selectedTrainId={selectedTrainId} onSelect={selectTrain} />
        </>
      }
      map={
        <div className="map-wrap">
          <NetworkMap
            trains={trains}
            hazards={state.hazards}
            theme="dark"
            selectedTrainId={selectedTrainId}
            onSelectTrain={selectTrain}
            activePlan={activeRecommendation}
          />
          <MapLegend />
        </div>
      }
      right={
        <>
          <RecommendationPanel recommendation={activeRecommendation} queueTotal={pendingBySeverity.length} nextUp={nextUp} />
          <TrainDetails train={selectedTrain} hazards={state.hazards} clockMin={state.simulationTime} recommendation={activeRecommendation} />
          <PropagationGraph recommendation={activeRecommendation} />
          <ImpactPanel metrics={state.metrics} />
          <SimulationControls />
        </>
      }
      footer={<FooterBar metrics={state.metrics} recommendations={state.recommendations} />}
    />
  );
}
