// Central client-side operations state (Section 44/45). Backend stays the
// source of truth -- this store only ever reflects REST/WebSocket data, it
// never invents state (no client-side re-implementation of optimizer rules).
import { createContext, useContext, useReducer } from "react";

const initialState = {
  trains: [],
  hazards: [],
  activeEvents: [],
  recommendations: [],
  selectedTrainId: null,
  selectedPlanId: null,
  simulationTime: null,
  paused: false,
  speedMultiplier: 1,
  timezoneLabel: "IST",
  metrics: {},
  lastEvent: null,
  connectionStatus: "connecting",
  manualEvents: [],
  complaints: [],
};

function upsertByKey(list, item, key) {
  const idx = list.findIndex((x) => x[key] === item[key]);
  if (idx === -1) return [...list, item];
  const copy = [...list];
  copy[idx] = { ...copy[idx], ...item };
  return copy;
}

function reducer(state, action) {
  switch (action.type) {
    case "CONNECTION_STATUS":
      return { ...state, connectionStatus: action.status };

    case "WS_EVENT": {
      const { event, payload } = action.message;
      const next = { ...state, lastEvent: { event, payload, at: Date.now() } };

      switch (event) {
        case "SIMULATION_UPDATED":
          return {
            ...next,
            trains: payload.trains ?? state.trains,
            hazards: payload.segments ?? state.hazards,
            manualEvents: payload.manual_events ?? state.manualEvents,
            complaints: payload.complaints ?? state.complaints,
            recommendations: payload.recommendations ?? state.recommendations,
            metrics: payload.metrics ?? state.metrics,
            simulationTime: payload.clock_min ?? state.simulationTime,
            paused: payload.paused ?? state.paused,
            speedMultiplier: payload.speed_multiplier ?? state.speedMultiplier,
            timezoneLabel: payload.timezone_label ?? state.timezoneLabel,
          };

        case "HAZARD_UPDATED":
          return { ...next, hazards: upsertByKey(state.hazards, { id: payload.segment_id, ...payload }, "id") };

        case "PLAN_GENERATED":
          return { ...next, recommendations: upsertByKey(state.recommendations, payload.candidate, "id") };

        case "PLAN_APPROVED":
        case "PLAN_REJECTED": {
          const recs = state.recommendations.map((r) =>
            r.plan?.plan_id === payload.plan_id
              ? { ...r, status: event === "PLAN_APPROVED" ? "approved" : "rejected" }
              : r
          );
          return { ...next, recommendations: recs };
        }

        case "IMPACT_UPDATED":
          return { ...next, metrics: payload };

        case "SERVICE_UPDATED":
        case "ETA_UPDATED":
        case "TRAIN_UPDATED":
          return next; // informational -- SIMULATION_UPDATED already carries authoritative train state

        default:
          return next;
      }
    }

    case "SET_PENDING":
      return { ...state, recommendations: action.pending };

    case "SELECT_TRAIN":
      return { ...state, selectedTrainId: action.trainId };

    case "SELECT_PLAN":
      return { ...state, selectedPlanId: action.planId };

    default:
      return state;
  }
}

const OperationsContext = createContext(null);

export function OperationsProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, initialState);
  return <OperationsContext.Provider value={{ state, dispatch }}>{children}</OperationsContext.Provider>;
}

export function useOperations() {
  const ctx = useContext(OperationsContext);
  if (!ctx) throw new Error("useOperations must be used within OperationsProvider");
  return ctx;
}
