// Finding what is under the pointer on a diagram, in screen space (SPEC section 6, "Dragging"
// and "Hover"). Pure geometry: the views pass screen coordinates.

// Nearest point to (x, y) on the segment from a to b: { t in [0, 1], dist }.
function onSegment(ax, ay, bx, by, x, y) {
  const dx = bx - ax, dy = by - ay;
  const len2 = dx * dx + dy * dy;
  const t = len2 > 0 ? Math.min(1, Math.max(0, ((x - ax) * dx + (y - ay) * dy) / len2)) : 0;
  return { t, dist: Math.hypot(ax + t * dx - x, ay + t * dy - y) };
}

// Distance from (x, y) to a polyline of [x, y] pairs.
export function distanceToPolyline(points, x, y) {
  if (points.length === 1) return Math.hypot(points[0][0] - x, points[0][1] - y);
  let best = Infinity;
  for (let i = 1; i < points.length; i++) {
    const [ax, ay] = points[i - 1], [bx, by] = points[i];
    best = Math.min(best, onSegment(ax, ay, bx, by, x, y).dist);
  }
  return best;
}

// The phase of the cycle nearest to (x, y). `samples` are [{ u, x, y }] in increasing u over
// [0, 1); the path closes from the last sample back to the first (u = 1, which is u = 0).
// The nearest sample is found first, then the answer is refined on the two segments next to
// it, with u interpolated along the segment. Returns { u, dist }.
export function nearestPhase(samples, x, y) {
  const n = samples.length;
  let i = 0;
  let best = Infinity;
  for (let j = 0; j < n; j++) {
    const d = Math.hypot(samples[j].x - x, samples[j].y - y);
    if (d < best) { best = d; i = j; }
  }
  let result = { u: samples[i].u, dist: best };
  for (const [a, b] of [[(i - 1 + n) % n, i], [i, (i + 1) % n]]) {
    const A = samples[a], B = samples[b];
    const uB = b === 0 ? 1 : B.u; // the closing segment ends at u = 1
    const { t, dist } = onSegment(A.x, A.y, B.x, B.y, x, y);
    if (dist < result.dist - 1e-12) result = { u: A.u + t * (uB - A.u), dist };
  }
  if (result.u >= 1) result.u = 0;
  return result;
}
