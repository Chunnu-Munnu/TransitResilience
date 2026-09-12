"""
Delay propagation graph (master spec Section 5 / deep-dive Section 7).
Single-track corridor: trains run in departure order. If train i's predicted
arrival at a station leaves less than MIN_HEADWAY_MIN minutes before train
i+1's scheduled arrival at the same station, that's a real platform/headway
conflict -- found by walking the "follows" graph forward from the delayed train.
"""
import networkx as nx

MIN_HEADWAY_MIN = 5


def build_follow_graph(trains: list[dict]) -> nx.DiGraph:
    g = nx.DiGraph()
    ordered = sorted(trains, key=lambda t: t["scheduled_departure_min"])
    for t in ordered:
        g.add_node(t["id"], **t)
    for a, b in zip(ordered, ordered[1:]):
        g.add_edge(a["id"], b["id"], relation="follows")
    return g


def find_downstream_conflicts(trains: list[dict], delayed_train_id: str, new_delay_min: float) -> list[dict]:
    """
    Walks forward from delayed_train_id along the 'follows' chain and reports
    every downstream train whose effective headway would be violated.
    Returns a list of {train_id, inherited_delay_min, reason}.
    """
    g = build_follow_graph(trains)
    if delayed_train_id not in g:
        return []

    conflicts = []
    carried_delay = new_delay_min
    current = delayed_train_id
    for _ in range(len(trains)):
        successors = list(g.successors(current))
        if not successors:
            break
        nxt = successors[0]
        next_train = g.nodes[nxt]
        gap = next_train["scheduled_departure_min"] - g.nodes[current]["scheduled_departure_min"]
        effective_gap = gap - carried_delay
        if effective_gap < MIN_HEADWAY_MIN:
            inherited = round(MIN_HEADWAY_MIN - effective_gap, 1)
            conflicts.append({
                "train_id": nxt,
                "inherited_delay_min": inherited,
                "reason": (
                    f"{nxt} follows {current} with a scheduled gap of {gap} min; "
                    f"{current}'s new delay shrinks that to {effective_gap:.1f} min, "
                    f"below the {MIN_HEADWAY_MIN}-min minimum headway."
                ),
            })
            carried_delay = inherited
            current = nxt
        else:
            break  # gap absorbed the delay; chain stops here
    return conflicts
