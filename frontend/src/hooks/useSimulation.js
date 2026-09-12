import { useOperations } from "../state/operationsStore.jsx";
import { api } from "../services/api";

export function useSimulation() {
  const { state } = useOperations();
  return {
    clockMin: state.simulationTime,
    paused: state.paused,
    speedMultiplier: state.speedMultiplier,
    connectionStatus: state.connectionStatus,
    toggle: () => api.toggleSim(),
    setSpeed: (multiplier) => api.setSpeed(multiplier),
    runWhatIf: (rainfallMm, lineId) => api.whatIf(rainfallMm, lineId),
  };
}

// Single source of truth for clock formatting -- Mumbai/India simulation time.
export { formatClockIST as formatClock } from "../utils/eta";
