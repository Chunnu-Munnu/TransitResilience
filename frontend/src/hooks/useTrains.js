import { useOperations } from "../state/operationsStore.jsx";

export function useTrains() {
  const { state, dispatch } = useOperations();
  const selectedTrain = state.trains.find((t) => t.id === state.selectedTrainId) || null;
  return {
    trains: state.trains,
    selectedTrain,
    selectedTrainId: state.selectedTrainId,
    selectTrain: (trainId) => dispatch({ type: "SELECT_TRAIN", trainId }),
  };
}
