// Single shared operations channel (Section 28). Reconnects automatically;
// the reconnect UI itself lives in useOperationsSocket / Notification.
// Same host-derivation trick as api.js, so a phone on the LAN connects back to
// the laptop running the backend rather than to itself. wss:// when the page
// is served over https.
const WS_URL =
  import.meta.env.VITE_WS_URL ||
  `${window.location.protocol === "https:" ? "wss" : "ws"}://${window.location.hostname}:8000/ws/operations`;

export function connectOperationsSocket({ onEvent, onOpen, onClose }) {
  let socket = null;
  let closedByUser = false;
  let retryDelay = 1000;

  function open() {
    socket = new WebSocket(WS_URL);
    socket.onopen = () => {
      retryDelay = 1000;
      onOpen && onOpen();
    };
    socket.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data);
        onEvent && onEvent(msg);
      } catch {
        // ignore malformed frames
      }
    };
    socket.onclose = () => {
      onClose && onClose();
      if (!closedByUser) {
        setTimeout(open, retryDelay);
        retryDelay = Math.min(retryDelay * 1.5, 10000);
      }
    };
    socket.onerror = () => socket.close();
  }

  open();

  return {
    close: () => {
      closedByUser = true;
      socket && socket.close();
    },
  };
}
