// Solara Bay — police.js
// The wanted system: crimes raise stars, police cruisers spawn at the map
// edges and chase the player, roadblocks appear at 3 stars and up, and the
// heat cools off when the player hides or repaints at Pay N Spray.

const SBPolice = (() => {
  const U = SBUtil;

  const MAX_STARS = 5;
  const DECAY_HIDDEN_SECONDS = 22;

  function create() {
    return {
      stars: 0,
      cruisers: [],
      roadblocks: [],
      lastCrimeAt: -999,
      hiddenTime: 0,
      bustTimer: 0,
      sirenOn: false,
    };
  }

  function addWanted(pol, amount) {
    pol.stars = U.clamp(pol.stars + amount, 0, MAX_STARS);
    pol.lastCrimeAt = performance.now() / 1000;
    pol.hiddenTime = 0;
  }

  function clearWanted(pol) {
    pol.stars = 0;
    pol.hiddenTime = 0;
    pol.bustTimer = 0;
  }

  function wantedCruiserCount(stars) {
    if (stars <= 0) return 0;
    if (stars === 1) return 2;
    if (stars === 2) return 3;
    if (stars === 3) return 3;
    if (stars === 4) return 4;
    return 5;
  }

  function spawnCruiser(pol, px, py) {
    // Spawn at a road near the map edge, away from the player.
    const edge = Math.floor(Math.random() * 4);
    let x;
    let y;
    if (edge === 0) {
      x = U.pick(Math.random, SBCity.V_ROADS);
      y = 140;
    } else if (edge === 1) {
      x = U.pick(Math.random, SBCity.V_ROADS);
      y = SBCity.BEACH_Y - 140;
    } else if (edge === 2) {
      x = 140;
      y = U.pick(Math.random, SBCity.H_ROADS);
    } else {
      x = SBCity.WORLD_W - 140;
      y = U.pick(Math.random, SBCity.H_ROADS);
    }
    if (U.dist(x, y, px, py) < 500) {
      x = SBCity.WORLD_W - x;
      y = SBCity.BEACH_Y - y;
    }
    const c = SBVehicles.makeCar(x, y, 0, '#20242c', 'police');
    c.cruise = 300;
    pol.cruisers.push(c);
    return c;
  }

  function update(pol, dt, player, cars, time) {
    // Keep the right number of cruisers on the road.
    const want = wantedCruiserCount(pol.stars);
    while (pol.cruisers.length < want) spawnCruiser(pol, player.x, player.y);
    while (pol.cruisers.length > want) pol.cruisers.pop();

    // Heat decay: no crime recently and no cruiser close by.
    const now = time;
    let nearest = Infinity;
    for (const c of pol.cruisers) nearest = Math.min(nearest, U.dist(c.x, c.y, player.x, player.y));
    if (pol.stars > 0 && now - pol.lastCrimeAt > 8 && nearest > 520) {
      pol.hiddenTime += dt;
      if (pol.hiddenTime >= DECAY_HIDDEN_SECONDS) {
        pol.stars -= 1;
        pol.hiddenTime = 0;
        pol.lastCrimeAt = now;
      }
    } else {
      pol.hiddenTime = 0;
    }

    // Roadblocks at 3+ stars: two parked cruisers across the road ahead.
    if (pol.stars >= 3 && pol.roadblocks.length === 0) {
      const road = SBCity.nearestRoad(player.x, player.y);
      const ahead = road.axis === 'v' ? { x: road.line, y: U.clamp(player.y + (player.y < SBCity.WORLD_H / 2 ? 420 : -420), 150, SBCity.BEACH_Y - 150) } : { x: U.clamp(player.x + (player.x < SBCity.WORLD_W / 2 ? 420 : -420), 150, SBCity.WORLD_W - 150), y: road.line };
      const b1 = SBVehicles.makeCar(ahead.x - 26, ahead.y, road.axis === 'v' ? 0 : Math.PI / 2, '#20242c', 'police');
      const b2 = SBVehicles.makeCar(ahead.x + 26, ahead.y, road.axis === 'v' ? 0 : Math.PI / 2, '#20242c', 'police');
      b1.speed = 0;
      b2.speed = 0;
      // A roadblock is parked across the road: chasing cruisers must not
      // shove it out of place when they pile into it.
      b1.fixed = true;
      b2.fixed = true;
      pol.roadblocks = [b1, b2];
    }
    if (pol.stars < 3) pol.roadblocks = [];

    // Chase AI: steer toward the player, ram on contact.
    for (const c of pol.cruisers) {
      const targetAngle = Math.atan2(player.y - c.y, player.x - c.x);
      const d = U.dist(c.x, c.y, player.x, player.y);
      const desired = d < 60 ? 0 : 330;
      c.speed = U.lerp(c.speed, desired, dt * 1.2);
      const turnRate = 3.2 * U.clamp(Math.abs(c.speed) / 120, 0.3, 1);
      c.angle = U.turnToward(c.angle, targetAngle, turnRate * dt);
      const nx = c.x + Math.cos(c.angle) * c.speed * dt;
      const ny = c.y + Math.sin(c.angle) * c.speed * dt;
      if (!SBCity.hitsSolid(nx, ny, 20)) {
        c.x = nx;
        c.y = ny;
      } else {
        c.speed *= 0.4;
        c.angle += dt * 2.2;
      }
      SBCity.resolveSolids(c, 20);
    }

    // Busted: a cruiser sits next to the player on foot.
    if (!player.onFoot) {
      pol.bustTimer = 0;
    } else if (pol.stars > 0 && nearest < 52) {
      pol.bustTimer += dt;
    } else {
      pol.bustTimer = Math.max(0, pol.bustTimer - dt * 2);
    }

    const siren = pol.stars > 0 && nearest < 700;
    if (siren !== pol.sirenOn) {
      pol.sirenOn = siren;
      SBAudio.setSiren(siren);
    }
    return pol.bustTimer > 1.4;
  }

  function drawRoadblocks(ctx, pol) {
    for (const b of pol.roadblocks) {
      SBVehicles.drawCar(ctx, b);
    }
    if (pol.roadblocks.length > 0) {
      // One shared label above the pair, centred between the two cars.
      const mx = (pol.roadblocks[0].x + pol.roadblocks[pol.roadblocks.length - 1].x) / 2;
      const my = Math.min(...pol.roadblocks.map((b) => b.y)) - 34;
      ctx.save();
      ctx.translate(mx, my);
      ctx.fillStyle = '#ffd166';
      ctx.font = 'bold 12px Inter, Arial, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('ROADBLOCK', 0, 0);
      ctx.restore();
    }
  }

  return {
    MAX_STARS,
    create,
    addWanted,
    clearWanted,
    wantedCruiserCount,
    update,
    drawRoadblocks,
  };
})();
