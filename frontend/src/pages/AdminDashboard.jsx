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

  const activeRecommendation =
    state.recommendations.find((r) => r.train_id === selectedTrainId && r.status === "pending") ||
    state.recommendations.find((r) => r.status === "pending") ||
    null;

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
          <RecommendationPanel recommendation={activeRecommendation} />
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
