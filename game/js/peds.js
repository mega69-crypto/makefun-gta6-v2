// Solara Bay — peds.js
// Pedestrians: they stroll the sidewalks, cross at intersections, and run
// away screaming (well, fleeing) when a car barrels at them or a shot rings
// out. Hitting one is a crime, so the wanted level notices.

const SBPeds = (() => {
  const U = SBUtil;

  const SHIRTS = ['#e74c3c', '#3498db', '#f39c12', '#9b59b6', '#1abc9c', '#e67e22', '#ecf0f1', '#2ecc71'];
  const PANTS = ['#2c3e50', '#34495e', '#7f8c8d', '#1a1a1a', '#5d4037'];

  function makePed(x, y) {
    return {
      x,
      y,
      angle: Math.random() * U.TAU,
      speed: 42 + Math.random() * 30,
      tx: x,
      ty: y,
      shirt: U.pick(Math.random, SHIRTS),
      pants: U.pick(Math.random, PANTS),
      flee: 0,
      dead: false,
      down: 0,
      bob: Math.random() * U.TAU,
    };
  }

  function spawn(count) {
    const peds = [];
    let guard = 0;
    while (peds.length < count && guard++ < 600) {
      // Prefer sidewalks: just off a road.
      const vertical = Math.random() < 0.5;
      let x;
      let y;
      if (vertical) {
        const line = U.pick(Math.random, SBCity.V_ROADS);
        x = line + (Math.random() < 0.5 ? 62 : -62);
        y = 120 + Math.random() * (SBCity.BEACH_Y - 240);
      } else {
        const line = U.pick(Math.random, SBCity.H_ROADS);
        x = 120 + Math.random() * (SBCity.WORLD_W - 240);
        y = line + (Math.random() < 0.5 ? 62 : -62);
      }
      if (SBCity.hitsSolid(x, y, 10)) continue;
      peds.push(makePed(x, y));
    }
    return peds;
  }

  function pickTarget(p) {
    // A new nearby sidewalk point to stroll to.
    const road = SBCity.nearestRoad(p.x, p.y);
    if (!road) return;
    const along = U.randRange(Math.random, -260, 260);
    if (road.axis === 'v') {
      p.tx = road.line + (Math.random() < 0.5 ? 62 : -62);
      p.ty = U.clamp(p.y + along, 90, SBCity.BEACH_Y - 60);
    } else {
      p.tx = U.clamp(p.x + along, 90, SBCity.WORLD_W - 90);
      p.ty = road.line + (Math.random() < 0.5 ? 62 : -62);
    }
  }

  function update(peds, dt, danger) {
    for (const p of peds) {
      if (p.dead) continue;
      if (p.down > 0) {
        p.down -= dt;
        continue;
      }
      // Flee from danger (a fast player car, gunfire, a police chase).
      if (danger) {
        const d = U.dist(p.x, p.y, danger.x, danger.y);
        if (d < 190) p.flee = 1.6;
      }
      if (p.flee > 0) {
        if (!danger) {
          // The danger is gone: stop fleeing instead of crashing on a null.
          p.flee = 0;
        } else {
          p.flee -= dt;
          const away = Math.atan2(p.y - danger.y, p.x - danger.x);
          p.angle = away;
          p.x += Math.cos(away) * 150 * dt;
          p.y += Math.sin(away) * 150 * dt;
          SBCity.resolveSolids(p, 10);
          continue;
        }
      }
      const d = U.dist(p.x, p.y, p.tx, p.ty);
      if (d < 14) {
        pickTarget(p);
      } else {
        const targetAngle = Math.atan2(p.ty - p.y, p.tx - p.x);
        p.angle = U.turnToward(p.angle, targetAngle, dt * 6);
        p.x += Math.cos(p.angle) * p.speed * dt;
        p.y += Math.sin(p.angle) * p.speed * dt;
        SBCity.resolveSolids(p, 10);
      }
      p.bob += dt * 9;
    }
  }

  // A ped hit by a car or a bullet: knocked down, not killed outright.
  function knockDown(p) {
    if (p.dead || p.down > 0) return false;
    p.down = 2.5;
    p.flee = 0;
    return true;
  }

  function draw(ctx, peds) {
    for (const p of peds) {
      if (p.dead) continue;
      ctx.save();
      ctx.translate(p.x, p.y);
      if (p.down > 0) {
        // Lying flat, dazed.
        ctx.rotate(0.6);
        ctx.fillStyle = p.shirt;
        ctx.fillRect(-11, -5, 22, 10);
        ctx.fillStyle = '#e8b98a';
        ctx.beginPath();
        ctx.arc(13, 0, 6, 0, U.TAU);
        ctx.fill();
        ctx.restore();
        continue;
      }
      ctx.rotate(p.angle);
      const bob = Math.sin(p.bob) * 1.5;
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.beginPath();
      ctx.ellipse(0, 3, 9, 6, 0, 0, U.TAU);
      ctx.fill();
      ctx.fillStyle = p.pants;
      ctx.fillRect(-8, -5 + bob, 7, 10);
      ctx.fillStyle = p.shirt;
      ctx.fillRect(-2, -6, 9, 12);
      ctx.fillStyle = '#e8b98a';
      ctx.beginPath();
      ctx.arc(9, 0, 5.5, 0, U.TAU);
      ctx.fill();
      ctx.restore();
    }
  }

  return { makePed, spawn, update, knockDown, draw };
})();
