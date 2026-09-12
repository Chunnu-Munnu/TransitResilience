import { useEffect } from "react";
import { connectOperationsSocket } from "../services/websocket";
import { useOperations } from "../state/operationsStore.jsx";
import { api } from "../services/api";

// Opens the shared /ws/operations channel once, loads initial REST state,
// and dispatches every event into the central store (Section 45's flow:
// REST initial load -> WebSocket events -> store -> UI).
export function useOperationsSocket() {
  const { dispatch } = useOperations();

  useEffect(() => {
    let cancelled = false;

    api.getPending().then((pending) => !cancelled && dispatch({ type: "SET_PENDING", pending }));

    const conn = connectOperationsSocket({
      onOpen: () => dispatch({ type: "CONNECTION_STATUS", status: "open" }),
      onClose: () => dispatch({ type: "CONNECTION_STATUS", status: "closed" }),
      onEvent: (message) => dispatch({ type: "WS_EVENT", message }),
    });

    return () => {
      cancelled = true;
      conn.close();
    };
  }, [dispatch]);
}
