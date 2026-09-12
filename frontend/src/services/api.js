// Section 30 REST contract. Every function is a thin wrapper -- no business
// logic here (Section 31: "frontend does not implement optimizer rules").
// Derive the backend host from whatever host the page itself was opened on.
// This is what makes the two-device demo work: open the app on a phone at
// http://192.168.x.x:5173 and it talks to the backend at 192.168.x.x:8000,
// instead of the phone's own (empty) localhost. Set VITE_API_BASE_URL to
// override for a real deployment.
export const API_BASE =
  import.meta.env.VITE_API_BASE_URL || `${window.location.protocol}//${window.location.hostname}:8000`;

const BASE = API_BASE;

async function request(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.detail || `${res.status} ${res.statusText}`);
  }
  return data;
}

export const api = {
  getTrains: () => request("/api/trains"),
  getTrain: (id) => request(`/api/trains/${id}`),
  getHazards: () => request("/api/hazards"),
  getHazard: (segmentId) => request(`/api/hazards/${segmentId}`),

  getPending: () => request("/api/operator/pending"),
  runOptimization: () => request("/api/optimization/run", { method: "POST" }),

  approvePlan: (planId, approver = "operator") =>
    request(`/api/operator/decision/${planId}/approve`, {
      method: "POST",
      body: JSON.stringify({ approver }),
    }),
  rejectPlan: (planId, approver = "operator", reason = "") =>
    request(`/api/operator/decision/${planId}/reject`, {
      method: "POST",
      body: JSON.stringify({ approver, reason }),
    }),
  modifyPlan: (planId, holdOverrides) =>
    request(`/api/operator/decision/${planId}/modify`, {
      method: "POST",
      body: JSON.stringify({ hold_overrides: holdOverrides }),
    }),
  validatePlan: (planId, holdOverrides) =>
    request("/api/operator/validate", {
      method: "POST",
      body: JSON.stringify({ plan_id: planId, hold_overrides: holdOverrides }),
    }),

  blockSegment: (segmentId, kind, severity, note, durationMin = 45) =>
    request("/api/hazards/block", {
      method: "POST",
      body: JSON.stringify({ segment_id: segmentId, kind, severity, note, duration_min: durationMin }),
    }),
  clearSegment: (segmentId) => request(`/api/hazards/clear/${segmentId}`, { method: "POST" }),

  whatIf: (rainfallMm) =>
    request("/api/simulation/what-if", {
      method: "POST",
      body: JSON.stringify({ rainfall_mm: rainfallMm }),
    }),
  setSpeed: (multiplier) =>
    request("/api/simulation/speed", {
      method: "POST",
      body: JSON.stringify({ multiplier }),
    }),
  toggleSim: () => request("/api/sim/toggle", { method: "POST" }),
  resetOperations: () => request("/api/operations/reset", { method: "POST" }),

  planTrip: (origin, destination) =>
    request("/api/trip/plan", {
      method: "POST",
      body: JSON.stringify({ origin, destination }),
    }),

  uploadMaintenance: (text) =>
    request("/api/maintenance/upload", { method: "POST", body: JSON.stringify({ text }) }),
  reportDriverEvent: (vehicleId, eventType, severity) =>
    request("/api/events/driver", {
      method: "POST",
      body: JSON.stringify({ vehicle_id: vehicleId, event_type: eventType, severity }),
    }),

  getAudit: () => request("/api/audit"),
  clearAudit: () => request("/api/audit/clear", { method: "POST" }),
};
