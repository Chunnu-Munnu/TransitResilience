// One place for time + ETA maths, so the operator console and the passenger
// app can never disagree about when a train arrives.

// Segment-fraction covered per simulated minute (mirrors SPEED_FACTOR in backend/sim/world.py).
export const SPEED = { fast: 0.16, slow: 0.10 };

/**
 * Minutes until `train` reaches the station with the given order (1-based).
 * A train arrives at station N once it has completed segment index N-2, i.e.
 * once current_segment_index reaches N-1. progress_in_segment is included so
 * the number ticks down smoothly instead of jumping a whole segment at a time.
 */
export function minutesToStation(train, destinationOrder, segmentCount) {
  const targetSegmentIndex = Math.min(destinationOrder - 1, segmentCount);
  const covered = train.current_segment_index + (train.progress_in_segment || 0);
  const remainingSegments = Math.max(0, targetSegmentIndex - covered);
  const speed = SPEED[train.service_type] || SPEED.slow;
  return remainingSegments / speed;
}

/** Absolute arrival time, in minutes-of-day, including any accrued delay. */
export function arrivalMinuteOfDay(train, destinationOrder, clockMin, segmentCount) {
  if (clockMin == null) return null;
  return clockMin + minutesToStation(train, destinationOrder, segmentCount) + (train.delay_min || 0);
}

export function tripTiming(train, originOrder, destinationOrder, clockMin, segmentCount) {
  if (clockMin == null || !train) return { boardAt: null, arriveAt: null, nextLoop: false };
  const speed = SPEED[train.service_type] || SPEED.slow;
  const covered = train.current_segment_index + (train.progress_in_segment || 0);
  const originSegment = Math.max(0, originOrder - 1);
  const alreadyPassedOrigin = covered > originSegment + 0.05;
  const segmentsToBoard = alreadyPassedOrigin
    ? Math.max(0, segmentCount - covered) + originSegment
    : Math.max(0, originSegment - covered);
  const boardAt = clockMin + (segmentsToBoard / speed) + (train.delay_min || 0);
  const arriveAt = boardAt + (Math.max(0, destinationOrder - originOrder) / speed);
  return { boardAt, arriveAt, nextLoop: alreadyPassedOrigin };
}

/** 12-hour clock with AM/PM, e.g. 09:42 AM / 02:15 PM. */
export function formatClock12(clockMin) {
  if (clockMin == null) return "--:--";
  const total = Math.round(clockMin);
  const hours24 = Math.floor(total / 60) % 24;
  const minutes = total % 60;
  const suffix = hours24 >= 12 ? "PM" : "AM";
  const hours12 = hours24 % 12 === 0 ? 12 : hours24 % 12;
  return `${String(hours12).padStart(2, "0")}:${String(minutes).padStart(2, "0")} ${suffix}`;
}

export function formatClockIST(clockMin) {
  return `${formatClock12(clockMin)} IST`;
}

/** Per-stop itinerary from the train's current position to the chosen destination. */
export function buildItinerary(train, stations, destinationOrder, clockMin, segmentCount) {
  const covered = train.current_segment_index + (train.progress_in_segment || 0);
  return stations
    .filter((s) => s.order - 1 >= Math.floor(covered) && s.order <= destinationOrder)
    .map((s) => ({
      code: s.code,
      name: s.name,
      order: s.order,
      arrival: arrivalMinuteOfDay(train, s.order, clockMin, segmentCount),
      isDestination: s.order === destinationOrder,
      isNext: s.order - 1 === Math.ceil(covered),
    }));
}

export function buildTripItinerary(train, stations, originOrder, destinationOrder, clockMin, segmentCount) {
  const timing = tripTiming(train, originOrder, destinationOrder, clockMin, segmentCount);
  if (timing.nextLoop) {
    const speed = SPEED[train.service_type] || SPEED.slow;
    return stations
      .filter((s) => s.order >= originOrder && s.order <= destinationOrder)
      .map((s) => ({
        code: s.code,
        name: s.name,
        order: s.order,
        arrival: timing.boardAt + ((s.order - originOrder) / speed),
        isDestination: s.order === destinationOrder,
        isNext: s.order === originOrder,
        isBoarding: s.order === originOrder,
      }));
  }
  return buildItinerary(train, stations, destinationOrder, clockMin, segmentCount)
    .filter((s) => s.order >= originOrder);
}
