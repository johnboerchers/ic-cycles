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

// Whether (x, y) is inside a closed polygon of [x, y] pairs (even–odd rule).
export function insidePolygon(points, x, y) {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const [xi, yi] = points[i], [xj, yj] = points[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

// Where a w × h label fits best inside a closed polygon (the shaded loop): the grid point
// inside it farthest from its edges, with distances measured in label boxes so a wide label
// is kept away from the sides more than from the top and bottom. Returns { x, y } or null
// when no spot leaves the label clear of the edges.
export function labelSpot(points, w, h, n = 32) {
  if (points.length < 3) return null;
  const a = w / h; // squash x so the label becomes an h × h square
  const scaled = points.map(([x, y]) => [x / a, y]);
  const xs = points.map((p) => p[0]), ys = points.map((p) => p[1]);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  let best = null;
  for (let i = 1; i < n; i++) {
    for (let j = 1; j < n; j++) {
      const x = x0 + ((x1 - x0) * i) / n, y = y0 + ((y1 - y0) * j) / n;
      if (!insidePolygon(points, x, y)) continue;
      const d = distanceToPolyline([...scaled, scaled[0]], x / a, y);
      if (!best || d > best.d) best = { x, y, d };
    }
  }
  return best && best.d >= h / 2 + 2 ? { x: best.x, y: best.y } : null;
}
