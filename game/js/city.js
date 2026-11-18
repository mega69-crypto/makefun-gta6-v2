// Solara Bay — city.js
// The city itself: a 2400x1800 grid of roads, blocks, buildings, a park,
// a beach and water along the south edge, plus every fixed point of interest.
// The layout is generated once from a seeded RNG, so it is identical on
// every load. Also owns collision tests and the city rendering.

const SBCity = (() => {
  const U = SBUtil;
  const WORLD_W = 2400;
  const WORLD_H = 1800;
  const ROAD_W = 96;

  // Road centre lines.
  const V_ROADS = [300, 700, 1100, 1500, 1900, 2250];
  const H_ROADS = [300, 700, 1100, 1500];

  // Beach and water along the south edge.
  const BEACH_Y = 1620;
  const WATER_Y = 1700;

  // One block is a park.
  const PARK = { x: 748, y: 748, w: 304, h: 304 };

  // Fixed points of interest.
  const POI = {
    paynspray: { x: 1560, y: 330, r: 52, label: 'Pay N Spray', cost: 150 },
    hideout: { x: 360, y: 1450, r: 56, label: 'Hideout' },
    vic: { x: 1860, y: 340, r: 56, label: "Vic's Garage" },
    hospital: { x: 340, y: 340, r: 60, label: 'Hospital' },
    bank: { x: 1140, y: 1140, r: 56, label: 'Solara Bank' },
    pickup: { x: 700, y: 1500, r: 48, label: 'Pickup' },
    dropoff: { x: 2250, y: 700, r: 48, label: 'Drop-off' },
    docks: { x: 2250, y: 1500, r: 48, label: 'Docks' },
  };

  const BUILDING_COLORS = ['#8d7d6b', '#7a6f87', '#6b7d8d', '#96705a', '#5f7a68', '#8a7f5c', '#74655e'];
  const ROOF_COLORS = ['#5a4f45', '#4d4a55', '#44525c', '#5e4638', '#42544a', '#57503c'];

  let buildings = [];
  let trees = [];
  let lamps = [];

  function build() {
    const rng = U.mulberry32(20261117);
    buildings = [];
    trees = [];
    lamps = [];
    // Every block between roads gets buildings, except the park block.
    for (let ix = 0; ix < V_ROADS.length - 1; ix++) {
      for (let iy = 0; iy < H_ROADS.length - 1; iy++) {
        const bx0 = V_ROADS[ix] + ROAD_W / 2 + 14;
        const bx1 = V_ROADS[ix + 1] - ROAD_W / 2 - 14;
        const by0 = H_ROADS[iy] + ROAD_W / 2 + 14;
        const by1 = H_ROADS[iy + 1] - ROAD_W / 2 - 14;
        if (by0 >= BEACH_Y) continue;
        const cx = (bx0 + bx1) / 2;
        const cy = (by0 + by1) / 2;
        if (cx > PARK.x - 20 && cx < PARK.x + PARK.w + 20 && cy > PARK.y - 20 && cy < PARK.y + PARK.h + 20) {
          continue; // park block stays open
        }
        const n = U.randInt(rng, 2, 4);
        for (let b = 0; b < n; b++) {
          const w = U.randRange(rng, 70, 130);
          const h = U.randRange(rng, 70, 130);
          const x = U.randRange(rng, bx0, bx1 - w);
          const y = U.randRange(rng, by0, by1 - h);
          const ci = U.randInt(rng, 0, BUILDING_COLORS.length - 1);
          buildings.push({ x, y, w, h, color: BUILDING_COLORS[ci], roof: ROOF_COLORS[ci], hgt: U.randInt(rng, 1, 3) });
        }
      }
    }
    // Trees in the park.
    for (let i = 0; i < 26; i++) {
      trees.push({
        x: U.randRange(rng, PARK.x + 16, PARK.x + PARK.w - 16),
        y: U.randRange(rng, PARK.y + 16, PARK.y + PARK.h - 16),
        r: U.randRange(rng, 10, 18),
      });
    }
    // A few palm trees along the beach.
    for (let i = 0; i < 14; i++) {
      trees.push({ x: 90 + i * 165 + U.randRange(rng, -30, 30), y: BEACH_Y + 34, r: U.randRange(rng, 11, 16), palm: true });
    }
    // Street lamps along the roads.
    for (const vx of V_ROADS) {
      for (const hy of H_ROADS) {
        lamps.push({ x: vx + ROAD_W / 2 + 6, y: hy - ROAD_W / 2 - 6 });
        lamps.push({ x: vx - ROAD_W / 2 - 6, y: hy + ROAD_W / 2 + 6 });
      }
    }
  }

  function isWater(x, y) {
    return y >= WATER_Y;
  }

  function isBeach(x, y) {
    return y >= BEACH_Y && y < WATER_Y;
  }

  function inPark(x, y) {
    return x >= PARK.x && x <= PARK.x + PARK.w && y >= PARK.y && y <= PARK.y + PARK.h;
  }

  // Is point (x,y) on a road (within the road surface)?
  function onRoad(x, y) {
    for (const vx of V_ROADS) if (Math.abs(x - vx) <= ROAD_W / 2) return true;
    for (const hy of H_ROADS) if (Math.abs(y - hy) <= ROAD_W / 2) return true;
    return false;
  }

  // Nearest road centre line and axis for a point (used by traffic AI).
  function nearestRoad(x, y) {
    let best = null;
    let bestD = Infinity;
    for (const vx of V_ROADS) {
      const d = Math.abs(x - vx);
      if (d < bestD) {
        bestD = d;
        best = { axis: 'v', line: vx };
      }
    }
    for (const hy of H_ROADS) {
      const d = Math.abs(y - hy);
      if (d < bestD) {
        bestD = d;
        best = { axis: 'h', line: hy };
      }
    }
    return best;
  }

  // True when a circle at (x,y,r) touches a solid: buildings, water, bounds.
  function hitsSolid(x, y, r) {
    if (x - r < 0 || x + r > WORLD_W || y - r < 0 || y + r > WORLD_H) return true;
    if (y + r > WATER_Y) return true;
    for (const b of buildings) {
      if (U.circleHitsRect(x, y, r, b.x, b.y, b.w, b.h)) return true;
    }
    return false;
  }

  // Push a circle out of every solid it overlaps.
  function resolveSolids(p, r) {
    p.x = U.clamp(p.x, r, WORLD_W - r);
    p.y = U.clamp(p.y, r, WORLD_H - r);
    if (p.y + r > WATER_Y) p.y = WATER_Y - r;
    for (const b of buildings) {
      U.resolveCircleRect(p, r, b.x, b.y, b.w, b.h);
    }
  }

  function drawGround(ctx, cam) {
    // Grass base.
    ctx.fillStyle = '#5d8a4a';
    ctx.fillRect(cam.x, cam.y, cam.w, cam.h);
    // Beach sand.
    ctx.fillStyle = '#e0c98f';
    ctx.fillRect(cam.x, Math.max(cam.y, BEACH_Y), cam.w, Math.max(0, Math.min(cam.y + cam.h, WATER_Y) - Math.max(cam.y, BEACH_Y)));
    // Water.
    ctx.fillStyle = '#2f7fb8';
    ctx.fillRect(cam.x, Math.max(cam.y, WATER_Y), cam.w, Math.max(0, cam.y + cam.h - Math.max(cam.y, WATER_Y)));
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 2;
    for (let wx = 0; wx < WORLD_W; wx += 130) {
      const wy = WATER_Y + 26 + ((wx / 130) % 3) * 22;
      if (wy < cam.y || wy > cam.y + cam.h) continue;
      ctx.beginPath();
      ctx.moveTo(wx, wy);
      ctx.quadraticCurveTo(wx + 32, wy - 7, wx + 64, wy);
      ctx.stroke();
    }
    // Park.
    ctx.fillStyle = '#4c7a3d';
    ctx.fillRect(PARK.x, PARK.y, PARK.w, PARK.h);
    ctx.strokeStyle = '#d9c48a';
    ctx.lineWidth = 4;
    ctx.strokeRect(PARK.x + 8, PARK.y + 8, PARK.w - 16, PARK.h - 16);
    ctx.beginPath();
    ctx.moveTo(PARK.x + PARK.w / 2, PARK.y);
    ctx.lineTo(PARK.x + PARK.w / 2, PARK.y + PARK.h);
    ctx.moveTo(PARK.x, PARK.y + PARK.h / 2);
    ctx.lineTo(PARK.x + PARK.w, PARK.y + PARK.h / 2);
    ctx.stroke();
  }

  function drawRoads(ctx) {
    ctx.fillStyle = '#3d3d42';
    for (const vx of V_ROADS) ctx.fillRect(vx - ROAD_W / 2, 0, ROAD_W, BEACH_Y);
    for (const hy of H_ROADS) ctx.fillRect(0, hy - ROAD_W / 2, WORLD_W, ROAD_W);
    // Sidewalk edges.
    ctx.strokeStyle = '#9a9a92';
    ctx.lineWidth = 5;
    for (const vx of V_ROADS) {
      ctx.beginPath();
      ctx.moveTo(vx - ROAD_W / 2, 0);
      ctx.lineTo(vx - ROAD_W / 2, BEACH_Y);
      ctx.moveTo(vx + ROAD_W / 2, 0);
      ctx.lineTo(vx + ROAD_W / 2, BEACH_Y);
      ctx.stroke();
    }
    for (const hy of H_ROADS) {
      ctx.beginPath();
      ctx.moveTo(0, hy - ROAD_W / 2);
      ctx.lineTo(WORLD_W, hy - ROAD_W / 2);
      ctx.moveTo(0, hy + ROAD_W / 2);
      ctx.lineTo(WORLD_W, hy + ROAD_W / 2);
      ctx.stroke();
    }
    // Dashed centre lines.
    ctx.strokeStyle = '#e8d44f';
    ctx.lineWidth = 3;
    ctx.setLineDash([22, 26]);
    for (const vx of V_ROADS) {
      ctx.beginPath();
      ctx.moveTo(vx, 0);
      ctx.lineTo(vx, BEACH_Y);
      ctx.stroke();
    }
    for (const hy of H_ROADS) {
      ctx.beginPath();
      ctx.moveTo(0, hy);
      ctx.lineTo(WORLD_W, hy);
      ctx.stroke();
    }
    ctx.setLineDash([]);
    // Crosswalks at intersections.
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    for (const vx of V_ROADS) {
      for (const hy of H_ROADS) {
        for (let i = -2; i <= 2; i++) {
          ctx.fillRect(vx - ROAD_W / 2 + 8 + (i + 2) * 17, hy - ROAD_W / 2 + 4, 9, 14);
          ctx.fillRect(vx - ROAD_W / 2 + 8 + (i + 2) * 17, hy + ROAD_W / 2 - 18, 9, 14);
        }
      }
    }
  }

  function drawBuildings(ctx) {
    for (const b of buildings) {
      // Drop shadow for a little depth.
      ctx.fillStyle = 'rgba(0,0,0,0.28)';
      ctx.fillRect(b.x + 6, b.y + 8, b.w, b.h);
      ctx.fillStyle = b.color;
      ctx.fillRect(b.x, b.y, b.w, b.h);
      ctx.fillStyle = b.roof;
      ctx.fillRect(b.x + 6, b.y + 6, b.w - 12, b.h - 12);
      // Windows.
      ctx.fillStyle = 'rgba(220,235,255,0.85)';
      const cols = Math.max(1, Math.floor(b.w / 26));
      const rows = Math.max(1, Math.floor(b.h / 26));
      for (let i = 0; i < cols; i++) {
        for (let j = 0; j < rows; j++) {
          ctx.fillRect(b.x + 10 + i * 26, b.y + 10 + j * 26, 12, 9);
        }
      }
    }
    for (const t of trees) {
      ctx.fillStyle = '#2f6b2f';
      ctx.beginPath();
      ctx.arc(t.x, t.y, t.r, 0, U.TAU);
      ctx.fill();
      ctx.fillStyle = '#3f8a3f';
      ctx.beginPath();
      ctx.arc(t.x - 3, t.y - 3, t.r * 0.55, 0, U.TAU);
      ctx.fill();
    }
  }

  function drawPOI(ctx, time) {
    const pulse = 1 + Math.sin(time * 0.004) * 0.12;
    for (const key of Object.keys(POI)) {
      const p = POI[key];
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.strokeStyle = key === 'paynspray' ? '#ff9f1c' : key === 'hideout' ? '#4cc9f0' : '#ffd166';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(0, 0, p.r * pulse, 0, U.TAU);
      ctx.stroke();
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.beginPath();
      ctx.arc(0, 0, p.r * 0.82, 0, U.TAU);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 15px Inter, Arial, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(p.label, 0, 0);
      ctx.restore();
    }
  }

  function draw(ctx, cam, time) {
    // The caller has already translated into world coordinates.
    drawGround(ctx, cam);
    drawRoads(ctx);
    drawBuildings(ctx);
    drawPOI(ctx, time);
  }

  return {
    WORLD_W,
    WORLD_H,
    ROAD_W,
    V_ROADS,
    H_ROADS,
    BEACH_Y,
    WATER_Y,
    PARK,
    POI,
    build,
    isWater,
    isBeach,
    inPark,
    onRoad,
    nearestRoad,
    hitsSolid,
    resolveSolids,
    draw,
    get buildings() {
      return buildings;
    },
  };
})();
