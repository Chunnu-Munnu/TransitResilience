import { useState } from "react";
import { useOperationsSocket } from "../hooks/useOperationsSocket";
import { useOperations } from "../state/operationsStore.jsx";
import { api } from "../services/api";
import AdminLayout from "../components/layout/AdminLayout";
import FooterBar from "../components/admin/FooterBar";

const CAUSE_LABELS = {
  tree_fall: "Fallen tree on the track",
  road_blockage: "Road blockage near the line",
  accident: "Vehicle/accident on the track",
  other: "Reported issue",
};

// A photo report from a rider is a claim, not a confirmed closure -- it sits
// here for an operator to look at and decide whether (and who) to notify.
// Notifying reuses the exact same authority-routing table block_segment uses
// (backend/sim/world.py AUTHORITY_BY_CAUSE), so a rider's "fallen tree" and an
// operator's "fallen tree" always resolve to the same real-world authority.
export default function UserComplaintsPage() {
  useOperationsSocket();
  const { state } = useOperations();
  const [notifyingId, setNotifyingId] = useState(null);
  const [flash, setFlash] = useState(null);

  const complaints = [...state.complaints].sort((a, b) => b.submitted_at - a.submitted_at);
  const newCount = complaints.filter((c) => c.status === "new").length;

  async function notify(id) {
    setNotifyingId(id);
    setFlash(null);
    try {
      await api.notifyComplaint(id);
    } catch (e) {
      setFlash({ ok: false, text: `Could not notify: ${e.message}` });
    } finally {
      setNotifyingId(null);
    }
  }

  return (
    <AdminLayout
      connectionStatus={state.connectionStatus}
      activeTab="complaints"
      left={
        <div className="card">
          <h2>User Complaints</h2>
          <p className="muted">Photo reports riders submit from the passenger app's Report Issue tab.</p>
          <div className="stat-grid" style={{ marginTop: 14 }}>
            <div className="stat-tile"><div className="n">{complaints.length}</div><div className="l">Total reports</div></div>
            <div className="stat-tile warn"><div className="n">{newCount}</div><div className="l">Awaiting review</div></div>
          </div>
          {flash && <div className={`flash ${flash.ok ? "ok" : "bad"}`} style={{ marginTop: 12 }}>{flash.text}</div>}
        </div>
      }
      map={
        <div className="card" style={{ height: "100%", overflowY: "auto" }}>
          <h2>Reports</h2>
          {!complaints.length && <p className="empty">No rider reports yet this session.</p>}
          <div className="complaint-list">
            {complaints.map((c) => (
              <div className="complaint-card" key={c.id}>
                <img src={c.image_data_url} alt={CAUSE_LABELS[c.cause] || c.cause} className="complaint-thumb" />
                <div className="complaint-body">
                  <div className="complaint-head">
                    <span className="complaint-cause">{CAUSE_LABELS[c.cause] || c.cause}</span>
                    <span className={`status-pill status-${c.status === "notified" ? "on_time" : "delayed"}`}>
                      {c.status === "notified" ? "Notified" : "New"}
                    </span>
                  </div>
                  <div className="muted">
                    {c.location}{c.train_id ? ` · reported from ${c.train_id}` : ""} ·{" "}
                    {new Date(c.submitted_at * 1000).toLocaleTimeString()}
                  </div>
                  {c.description && <p className="complaint-desc">{c.description}</p>}
                  {c.status === "notified" ? (
                    <p className="ok-text" style={{ fontSize: "0.78rem", margin: "8px 0 0" }}>
                      ✓ {c.authority} notified {c.notified_at ? `at ${new Date(c.notified_at * 1000).toLocaleTimeString()}` : ""}
                    </p>
                  ) : (
                    <button
                      className="btn-approve"
                      style={{ marginTop: 10 }}
                      disabled={notifyingId === c.id}
                      onClick={() => notify(c.id)}
                    >
                      {notifyingId === c.id ? "Notifying…" : `Notify ${c.authority}`}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      }
      right={
        <div className="card">
          <h2>Who gets notified</h2>
          <p className="muted">
            The authority is picked automatically from the reported cause -- the same table an admin-triggered
            track/road closure uses, so a rider's report and an operator's own action never disagree.
          </p>
          <div className="blocked-list" style={{ marginTop: 10 }}>
            <div className="blocked-row"><span>Fallen tree</span><span className="muted">Municipal Disaster Management Cell</span></div>
            <div className="blocked-row"><span>Vehicle/accident on track</span><span className="muted">Railway Protection Force</span></div>
            <div className="blocked-row"><span>Road blockage</span><span className="muted">Traffic Police &amp; Municipal Roads Dept.</span></div>
            <div className="blocked-row"><span>Anything else</span><span className="muted">Railway Control Room</span></div>
          </div>
        </div>
      }
      footer={<FooterBar metrics={state.metrics} recommendations={state.recommendations} />}
    />
  );
}
