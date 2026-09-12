"""
Robust decision layer: instead of trusting one point forecast for when the
hazard fully develops, we test a handful of candidate actions against many
randomly-perturbed versions of that forecast, and pick whichever action
survives the widest range of outcomes -- not just whichever looks best for
the single forecast we happen to have.

This is deliberately small and readable, not a general robust-optimization
library: margin, budget, four candidate actions, N Monte Carlo trials each.
"""
import random
from dataclasses import dataclass, field

BUFFER_MIN = 5              # safety margin we want before a hazard's predicted onset
BASE_CORRIDOR_BUDGET_MIN = 40   # cumulative delay a corridor can absorb before it's "over budget"
BUDGET_DECAY_PER_HOP = 0.85     # each downstream hop tolerates a little less
AVG_PASSENGERS_PER_TRAIN = 120
ONSET_PERTURBATION_MIN = 10     # Monte Carlo perturbs onset by +/- this many minutes
N_SCENARIOS = 10

CANDIDATE_ACTIONS = [
    {"name": "hold_5min", "type": "hold", "minutes": 5, "cost_per_min": 2},
    {"name": "hold_15min", "type": "hold", "minutes": 15, "cost_per_min": 2},
    {"name": "speed_restrict", "type": "speed_restrict", "minutes": 8, "cost_per_min": 1.5},
    {"name": "reroute_via_bus", "type": "reroute", "minutes": 0, "cost_per_min": 0, "fixed_cost": 40},
]


@dataclass
class ScenarioSummary:
    action: str
    type: str
    within_budget_rate: float      # fraction of the N trials that stayed inside the corridor budget
    avg_cost: float                # average blended cost score across trials (see cost_breakdown)
    worst_cost: float              # worst-case blended cost -- what we actually rank on
    avg_passenger_minutes: float   # the plain-English number: passengers x minutes lost
    avg_delay_min: float           # average residual delay after this action
    operational_cost: float        # crew/vehicle cost of the action itself, in the same blended units


@dataclass
class RobustDecision:
    chosen: ScenarioSummary
    all_results: list = field(default_factory=list)
    onset_minutes: float = 0.0
    corridor_budget_min: float = 0.0


def compute_margin(current_delay_min: float, onset_minutes: float) -> float:
    """How much slack exists before this train collides with the hazard's onset."""
    return onset_minutes - current_delay_min - BUFFER_MIN


def corridor_budget(hops_from_source: int = 0) -> float:
    """The delay budget decays the further downstream you look -- a hop close
    to the hazard has less room to absorb error than one further away."""
    return BASE_CORRIDOR_BUDGET_MIN * (BUDGET_DECAY_PER_HOP ** hops_from_source)


def _mitigated_delay(action: dict, base_delay_min: float) -> float:
    """How much of the predicted delay survives after applying this action.
    Deliberately simple, linear relationships -- the point is the Monte Carlo
    evaluation around them, not a sophisticated mitigation model."""
    if action["type"] == "hold":
        return max(0.0, base_delay_min - action["minutes"] * 0.6)
    if action["type"] == "speed_restrict":
        return max(action["minutes"], base_delay_min - action["minutes"] * 0.3)
    if action["type"] == "reroute":
        return base_delay_min * 0.15  # most of the delay is avoided by leaving the corridor
    return base_delay_min


def _action_cost(action: dict, effective_delay_min: float) -> float:
    resource_cost = action.get("fixed_cost", 0) + action.get("minutes", 0) * action.get("cost_per_min", 0)
    passenger_cost = effective_delay_min * AVG_PASSENGERS_PER_TRAIN
    return passenger_cost + resource_cost * 10  # weight resource cost onto the same scale


def choose_robust_action(
    base_delay_min: float,
    onset_minutes: float,
    hops_from_source: int = 0,
    n_scenarios: int = N_SCENARIOS,
    seed: int | None = None,
) -> RobustDecision:
    rng = random.Random(seed)
    budget = corridor_budget(hops_from_source)
    results = []

    for action in CANDIDATE_ACTIONS:
        trials_within_budget = 0
        costs = []
        delays = []
        for _ in range(n_scenarios):
            perturbed_onset = onset_minutes + rng.uniform(-ONSET_PERTURBATION_MIN, ONSET_PERTURBATION_MIN)
            # a later onset gives the action more time to work -- an earlier one, less
            onset_factor = max(0.4, min(1.6, onset_minutes / max(perturbed_onset, 1)))
            effective_delay = _mitigated_delay(action, base_delay_min) * onset_factor
            costs.append(_action_cost(action, effective_delay))
            delays.append(effective_delay)
            if effective_delay <= budget:
                trials_within_budget += 1

        avg_delay = sum(delays) / len(delays)
        operational = (action.get("fixed_cost", 0) + action.get("minutes", 0) * action.get("cost_per_min", 0)) * 10

        results.append(ScenarioSummary(
            action=action["name"], type=action["type"],
            within_budget_rate=round(trials_within_budget / n_scenarios, 2),
            avg_cost=round(sum(costs) / len(costs)),
            worst_cost=round(max(costs)),
            avg_passenger_minutes=round(avg_delay * AVG_PASSENGERS_PER_TRAIN),
            avg_delay_min=round(avg_delay, 1),
            operational_cost=round(operational),
        ))

    # Prefer whatever stays within budget most often; break ties on worst-case cost,
    # not average -- that's the "robust" part: we're picking against the bad scenarios,
    # not the typical one.
    results.sort(key=lambda r: (-r.within_budget_rate, r.worst_cost))
    return RobustDecision(
        chosen=results[0], all_results=results,
        onset_minutes=round(onset_minutes, 1), corridor_budget_min=round(budget, 1),
    )


ACTION_LABELS = {
    "hold_5min": "Hold the train 5 minutes",
    "hold_15min": "Hold the train 15 minutes",
    "speed_restrict": "Run at reduced speed",
    "reroute_via_bus": "Reroute passengers via bus",
}


def explain_robust_decision(decision: RobustDecision) -> str:
    """Plain-English. No score jargon -- the numbers a person actually cares
    about are 'how late does this leave us' and 'does it still work if the
    flood arrives early'."""
    chosen = decision.chosen
    runner_up = next((r for r in decision.all_results if r.action != chosen.action), None)

    lines = [
        f"We don't know exactly when the water will hit - the forecast says {decision.onset_minutes:.0f} minutes, "
        f"but it could be up to {ONSET_PERTURBATION_MIN} minutes earlier or later. So each option was replayed "
        f"against {N_SCENARIOS} different arrival times.",
        "",
        f"CHOSEN: {ACTION_LABELS.get(chosen.action, chosen.action)}",
        f"  Leaves about {chosen.avg_delay_min:.0f} min of delay ({chosen.avg_passenger_minutes:,} passenger-minutes lost).",
        f"  Kept delay under the {decision.corridor_budget_min:.0f}-min limit in "
        f"{int(chosen.within_budget_rate * N_SCENARIOS)} of {N_SCENARIOS} timings.",
    ]

    if runner_up:
        gap = runner_up.avg_delay_min - chosen.avg_delay_min
        lines += [
            "",
            f"Next best was {ACTION_LABELS.get(runner_up.action, runner_up.action).lower()}, which leaves "
            f"about {runner_up.avg_delay_min:.0f} min - roughly {gap:.0f} min worse - and only held up in "
            f"{int(runner_up.within_budget_rate * N_SCENARIOS)} of {N_SCENARIOS} timings.",
        ]

    lines += [
        "",
        "We judge options by their WORST timing, not their average, so the plan still works if the water "
        "arrives earlier than forecast.",
    ]
    return "\n".join(lines)
