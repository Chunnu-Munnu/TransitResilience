"""
Human-in-the-loop approval workflow (master spec Section 7).
The optimizer only ever produces a CANDIDATE. Tiered authority + SLA timeout
+ audit trail, exactly as specified. No plan touches world state until it's
either explicitly approved or auto-approved on a low-severity timeout.
"""
import itertools
import time
from dataclasses import dataclass, field, asdict

_id_counter = itertools.count(1)

# Human-in-the-loop is the headline claim of this system, so the bar for
# skipping the human is deliberately very low: only near-zero-severity
# re-timings auto-apply. Anything a passenger would notice waits for a person.
AUTO_THRESHOLD = 0.10        # below this: auto-apply immediately (effectively: almost never)
SENIOR_THRESHOLD = 0.7       # at/above this: no SLA timeout, must be explicit
SUPERVISOR_SLA_SECONDS = 600  # long enough that a demo never auto-approves behind your back
MAX_AUDIT_LOG_ENTRIES = 100   # decision log keeps only the most recent 100 entries


@dataclass
class Candidate:
    id: int
    train_id: str
    affected_segment_id: str
    severity: float
    tier: str
    admin_explanation: str
    rider_explanation: str
    plan: dict
    status: str = "pending"        # pending | approved | rejected
    decided_by: str | None = None
    created_at: float = field(default_factory=time.time)
    decided_at: float | None = None
    sla_deadline: float | None = None


class ApprovalWorkflow:
    def __init__(self):
        self.candidates: dict[int, Candidate] = {}
        self.audit_log: list[dict] = []

    def submit(self, train_id, affected_segment_id, severity, admin_explanation, rider_explanation, plan) -> Candidate:
        tier = (
            "auto" if severity < AUTO_THRESHOLD else
            "senior" if severity >= SENIOR_THRESHOLD else
            "supervisor"
        )
        cand = Candidate(
            id=next(_id_counter),
            train_id=train_id,
            affected_segment_id=affected_segment_id,
            severity=round(severity, 3),
            tier=tier,
            admin_explanation=admin_explanation,
            rider_explanation=rider_explanation,
            plan=plan,
            sla_deadline=(time.time() + SUPERVISOR_SLA_SECONDS) if tier == "supervisor" else None,
        )
        self.candidates[cand.id] = cand
        self._log(cand, "submitted", "system")

        if tier == "auto":
            self.decide(cand.id, approve=True, approver="system(auto-tier)")
        return cand

    def decide(self, candidate_id: int, approve: bool, approver: str) -> Candidate | None:
        cand = self.candidates.get(candidate_id)
        if not cand or cand.status != "pending":
            return None
        cand.status = "approved" if approve else "rejected"
        cand.decided_by = approver
        cand.decided_at = time.time()
        self._log(cand, cand.status, approver)
        return cand

    def check_sla_timeouts(self) -> list[Candidate]:
        now = time.time()
        newly_approved = []
        for cand in self.candidates.values():
            if cand.status == "pending" and cand.sla_deadline and now >= cand.sla_deadline:
                self.decide(cand.id, approve=True, approver="system(SLA timeout)")
                newly_approved.append(cand)
        return newly_approved

    def pending(self) -> list[Candidate]:
        return [c for c in self.candidates.values() if c.status == "pending"]

    def _log(self, cand: Candidate, action: str, actor: str):
        self.audit_log.append({
            "candidate_id": cand.id,
            "train_id": cand.train_id,
            "action": action,
            "actor": actor,
            "tier": cand.tier,
            "timestamp": time.time(),
        })
        if len(self.audit_log) > MAX_AUDIT_LOG_ENTRIES:
            self.audit_log = self.audit_log[-MAX_AUDIT_LOG_ENTRIES:]

    def as_dict(self, cand: Candidate) -> dict:
        return asdict(cand)
