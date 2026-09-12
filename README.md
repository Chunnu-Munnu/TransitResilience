# TransitResilience 🚆🌧️

### Minimum intervention. Maximum resilience.

TransitResilience is a hazard-aware railway decision-support system that helps operators choose **small operational interventions that remain effective even when the exact timing of a disruption is uncertain**.

Instead of asking:

> "What is the optimal action if the flood arrives exactly when predicted?"

TransitResilience asks:

> **"What is the cheapest intervention that keeps the railway corridor within its operational resilience budget across plausible futures?"**

The system evaluates actions such as **holding a train, speed restriction, rerouting, or continuing operation** against multiple possible hazard timings, propagates their effects through the railway network, and recommends the smallest intervention that prevents a larger cascade.

---

## 🎯 The Problem

Railway disruptions rarely happen exactly as forecast.

Consider a train approaching a flood-prone section of track.

A forecast may indicate:

```text
Expected flood impact: 10:40 AM
Uncertainty: ±10 minutes
