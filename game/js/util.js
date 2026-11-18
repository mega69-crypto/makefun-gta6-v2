// Solara Bay — util.js
// Small shared helpers: math, seeded random, collision tests.
// Every other game file builds on these; nothing here touches the DOM.

const SBUtil = (() => {
  const TAU = Math.PI * 2;

  function clamp(v, lo, hi) {
    return v < lo ? lo : v > hi ? hi : v;
  }

  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  function dist(x1, y1, x2, y2) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    return Math.sqrt(dx * dx + dy * dy);
  }

  function dist2(x1, y1, x2, y2) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    return dx * dx + dy * dy;
  }

  // Shortest signed difference between two angles, in (-PI, PI].
  function angleDiff(a, b) {
    let d = (b - a) % TAU;
    if (d > Math.PI) d -= TAU;
    if (d <= -Math.PI) d += TAU;
    return d;
  }

  // Turn `from` toward `to` by at most `step` radians.
  function turnToward(from, to, step) {
    const d = angleDiff(from, to);
    if (Math.abs(d) <= step) return to;
    return from + Math.sign(d) * step;
  }

  // Deterministic RNG (mulberry32) so the city is identical on every load.
  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function pick(rng, arr) {
    return arr[Math.floor(rng() * arr.length)];
  }

  function randRange(rng, lo, hi) {
    return lo + rng() * (hi - lo);
  }

  function randInt(rng, lo, hi) {
    return Math.floor(randRange(rng, lo, hi + 1));
  }

  // Circle vs axis-aligned rectangle overlap test.
  function circleHitsRect(cx, cy, r, rx, ry, rw, rh) {
    const nx = clamp(cx, rx, rx + rw);
    const ny = clamp(cy, ry, ry + rh);
    const dx = cx - nx;
    const dy = cy - ny;
    return dx * dx + dy * dy < r * r;
  }

  // Push a circle out of a rectangle; returns true when a push happened.
  function resolveCircleRect(p, r, rx, ry, rw, rh) {
    const nx = clamp(p.x, rx, rx + rw);
    const ny = clamp(p.y, ry, ry + rh);
    let dx = p.x - nx;
    let dy = p.y - ny;
    const d2 = dx * dx + dy * dy;
    if (d2 >= r * r) return false;
    if (d2 > 0.0001) {
      const d = Math.sqrt(d2);
      const push = (r - d) / d;
      p.x += dx * push;
      p.y += dy * push;
    } else {
      // Centre is inside the rectangle: push out along the smallest axis.
      const left = p.x - rx;
      const right = rx + rw - p.x;
      const top = p.y - ry;
      const bottom = ry + rh - p.y;
      const m = Math.min(left, right, top, bottom);
      if (m === left) p.x = rx - r;
      else if (m === right) p.x = rx + rw + r;
      else if (m === top) p.y = ry - r;
      else p.y = ry + rh + r;
    }
    return true;
  }

  // Format a number of seconds as m:ss.
  function fmtTime(sec) {
    const s = Math.max(0, Math.ceil(sec));
    return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
  }

  return {
    TAU,
    clamp,
    lerp,
    dist,
    dist2,
    angleDiff,
    turnToward,
    mulberry32,
    pick,
    randRange,
    randInt,
    circleHitsRect,
    resolveCircleRect,
    fmtTime,
  };
})();
