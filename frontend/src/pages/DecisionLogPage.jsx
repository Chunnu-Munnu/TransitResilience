import { useEffect, useState } from "react";
import { useOperationsSocket } from "../hooks/useOperationsSocket";
import { useOperations } from "../state/operationsStore.jsx";
import { api } from "../services/api";
import AdminLayout from "../components/layout/AdminLayout";
import FooterBar from "../components/admin/FooterBar";

// Section 10's accountability requirement: every approve/reject/timeout,
// who did it and when -- straight from backend/approval/workflow.py's audit_log.
export default function DecisionLogPage() {
  useOperationsSocket();
  const { state } = useOperations();
  const [audit, setAudit] = useState([]);
  const [clearing, setClearing] = useState(false);

  useEffect(() => {
    let cancelled = false;
    function poll() {
      api.getAudit().then((rows) => !cancelled && setAudit(rows.slice().reverse()));
    }
    poll();
    const id = setInterval(poll, 3000);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  async function clearLog() {
    setClearing(true);
    try {
      await api.clearAudit();
      setAudit([]);
    } finally {
      setClearing(false);
    }
  }

  return (
    <AdminLayout
      connectionStatus={state.connectionStatus}
      activeTab="decisions"
      left={
        <div className="card">
          <h2>Decision Log</h2>
          <p className="muted">Every approval, rejection, and auto-timeout, in order.</p>
          <button className="btn-secondary full" style={{ marginTop: 14 }} disabled={clearing || !audit.length} onClick={clearLog}>
            {clearing ? "Clearing…" : "Clear Decision Log"}
          </button>
        </div>
      }
      map={
        <div className="card" style={{ height: "100%", overflowY: "auto" }}>
          <h2>Audit Trail</h2>
          {!audit.length && <p className="empty">No decisions recorded yet this session.</p>}
          <table className="impact-table">
            <thead><tr><th>Time</th><th>Train</th><th>Action</th><th>Tier</th><th>Actor</th><th>Note</th></tr></thead>
            <tbody>
              {audit.map((row, i) => (
                <tr key={i}>
                  <td className="mono">{new Date(row.timestamp * 1000).toLocaleTimeString()}</td>
                  <td>{row.train_id}</td>
                  <td className={row.action === "approved" ? "ok-text" : row.action === "rejected" ? "warn-text" : ""}>{row.action}</td>
                  <td>{row.tier}</td>
                  <td>{row.actor}</td>
                  <td>{row.reason || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      }
      right={
        <div className="card">
          <h2>About this log</h2>
          <p className="muted">
            Backed by <span className="mono">GET /api/audit</span>. Every candidate the optimizer proposes is logged the
            moment it's submitted, and again the moment it's approved, rejected, or auto-approved on an SLA timeout —
            this is the accountability trail described in the master spec's human-in-the-loop section.
          </p>
        </div>
      }
      footer={<FooterBar metrics={state.metrics} recommendations={state.recommendations} />}
    />
  );
}
