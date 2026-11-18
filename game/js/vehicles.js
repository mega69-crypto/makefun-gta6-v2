// Solara Bay — vehicles.js
// Cars: the player's ride, parked cars to steal, and traffic driving the
// road grid. Driving is simple arcade physics: accelerate, brake, steer
// by speed, with collisions against buildings, other cars and the player.

const SBVehicles = (() => {
  const U = SBUtil;

  const CAR_COLORS = ['#d94f3d', '#3d7dd9', '#e8b13c', '#7ac74f', '#c9c9c9', '#8e44ad', '#2ecc71', '#e67e22', '#34495e', '#f1c40f'];
  const CAR_W = 46;
  const CAR_H = 24;

  function makeCar(x, y, angle, color, kind) {
    return {
      x,
      y,
      angle,
      speed: 0,
      color,
      kind: kind || 'traffic', // 'traffic' | 'parked' | 'player' | 'police'
      steer: 0,
      // Traffic AI state.
      axis: 'v',
      line: 0,
      dir: 1,
      cruise: 90 + Math.random() * 60,
      stuck: 0,
      honk: 0,
    };
  }

  function spawnTraffic(count) {
    const cars = [];
    for (let i = 0; i < count; i++) {
      const vertical = Math.random() < 0.5;
      if (vertical) {
        const line = U.pick(Math.random, SBCity.V_ROADS);
        const y = 120 + Math.random() * (SBCity.BEACH_Y - 240);
        const dir = Math.random() < 0.5 ? 1 : -1;
        const c = makeCar(line + (dir > 0 ? 22 : -22), y, dir > 0 ? Math.PI / 2 : -Math.PI / 2, U.pick(Math.random, CAR_COLORS), 'traffic');
        c.axis = 'v';
        c.line = line;
        c.dir = dir;
        cars.push(c);
      } else {
        const line = U.pick(Math.random, SBCity.H_ROADS);
        const x = 120 + Math.random() * (SBCity.WORLD_W - 240);
        const dir = Math.random() < 0.5 ? 1 : -1;
        const c = makeCar(x, line + (dir > 0 ? 22 : -22), dir > 0 ? 0 : Math.PI, U.pick(Math.random, CAR_COLORS), 'traffic');
        c.axis = 'h';
        c.line = line;
        c.dir = dir;
        cars.push(c);
      }
    }
    return cars;
  }

  function spawnParked(count) {
    const cars = [];
    let guard = 0;
    while (cars.length < count && guard++ < 400) {
      const vertical = Math.random() < 0.5;
      let x;
      let y;
      let angle;
      if (vertical) {
        const line = U.pick(Math.random, SBCity.V_ROADS);
        x = line + (Math.random() < 0.5 ? 34 : -34);
        y = 120 + Math.random() * (SBCity.BEACH_Y - 240);
        angle = Math.random() < 0.5 ? Math.PI / 2 : -Math.PI / 2;
      } else {
        const line = U.pick(Math.random, SBCity.H_ROADS);
        x = 120 + Math.random() * (SBCity.WORLD_W - 240);
        y = line + (Math.random() < 0.5 ? 34 : -34);
        angle = Math.random() < 0.5 ? 0 : Math.PI;
      }
      if (SBCity.hitsSolid(x, y, 26)) continue;
      let clash = false;
      for (const c of cars) {
        if (U.dist2(x, y, c.x, c.y) < 70 * 70) {
          clash = true;
          break;
        }
      }
      if (clash) continue;
      cars.push(makeCar(x, y, angle, U.pick(Math.random, CAR_COLORS), 'parked'));
    }
    return cars;
  }

  // Steer a traffic car along its road; at intersections it may turn.
  // `player` is passed so traffic brakes for a person on foot ahead.
  function updateTraffic(c, dt, allCars, player) {
    // Slow down for the car ahead on the same road.
    let target = c.cruise;
    for (const o of allCars) {
      if (o === c || o.kind === 'parked') continue;
      const d = U.dist(c.x, c.y, o.x, o.y);
      if (d < 70) {
        const ahead = c.axis === 'v' ? (c.dir > 0 ? o.y > c.y : o.y < c.y) : c.dir > 0 ? o.x > c.x : o.x < c.x;
        if (ahead && Math.abs(c.axis === 'v' ? o.x - c.x : o.y - c.y) < 30) target = 0;
      }
    }
    // Brake for the player crossing on foot ahead.
    if (player && player.onFoot) {
      const dx = player.x - c.x;
      const dy = player.y - c.y;
      const along = c.axis === 'v' ? dy * c.dir : dx * c.dir;
      const side = c.axis === 'v' ? Math.abs(dx) : Math.abs(dy);
      if (along > 0 && along < 78 && side < 30) target = 0;
    }
    c.speed = U.lerp(c.speed, target, dt * 1.4);
    const step = c.speed * dt;
    let nx = c.x;
    let ny = c.y;
    if (c.axis === 'v') ny += c.dir * step;
    else nx += c.dir * step;
    // Reached an intersection: maybe turn.
    const cross = c.axis === 'v' ? SBCity.H_ROADS : SBCity.V_ROADS;
    for (const line of cross) {
      const along = c.axis === 'v' ? ny : nx;
      const before = c.axis === 'v' ? c.y : c.x;
      if ((before - line) * (along - line) <= 0 && Math.abs(along - line) < step + 2) {
        if (Math.random() < 0.35) {
          // Turn onto the crossing road.
          const ndir = Math.random() < 0.5 ? 1 : -1;
          if (c.axis === 'v') {
            c.axis = 'h';
            c.line = line;
            c.dir = ndir;
            c.y = line + (ndir > 0 ? 22 : -22);
            c.x = Math.round(c.x / 10) * 10;
            c.angle = ndir > 0 ? 0 : Math.PI;
          } else {
            c.axis = 'v';
            c.line = line;
            c.dir = ndir;
            c.x = line + (ndir > 0 ? 22 : -22);
            c.y = Math.round(c.y / 10) * 10;
            c.angle = ndir > 0 ? Math.PI / 2 : -Math.PI / 2;
          }
          return;
        }
        break;
      }
    }
    c.x = nx;
    c.y = ny;
    // Keep the car glued to its lane.
    if (c.axis === 'v') c.x = U.lerp(c.x, c.line + (c.dir > 0 ? 22 : -22), dt * 3);
    else c.y = U.lerp(c.y, c.line + (c.dir > 0 ? 22 : -22), dt * 3);
    c.angle = c.axis === 'v' ? (c.dir > 0 ? Math.PI / 2 : -Math.PI / 2) : c.dir > 0 ? 0 : Math.PI;
    // Bounce off the world edges by turning around.
    if (c.axis === 'v' && (c.y < 90 || c.y > SBCity.BEACH_Y - 60)) {
      c.dir *= -1;
      c.y = U.clamp(c.y, 90, SBCity.BEACH_Y - 60);
    }
    if (c.axis === 'h' && (c.x < 90 || c.x > SBCity.WORLD_W - 90)) {
      c.dir *= -1;
      c.x = U.clamp(c.x, 90, SBCity.WORLD_W - 90);
    }
    if (SBCity.hitsSolid(c.x, c.y, 20)) {
      // Ran into a building (should not happen on roads); nudge back.
      c.speed = 0;
      c.stuck += dt;
      if (c.stuck > 1) {
        c.dir *= -1;
        c.stuck = 0;
      }
    } else {
      c.stuck = 0;
    }
  }

  // Arcade driving for the player's car.
  function updatePlayerCar(c, input, dt) {
    const accel = 340;
    const brake = 520;
    const maxFwd = 460;
    const maxRev = 150;
    if (input.up) c.speed += accel * dt;
    if (input.down) c.speed -= (c.speed > 0 ? brake : accel * 0.55) * dt;
    if (!input.up && !input.down) c.speed = U.lerp(c.speed, 0, dt * 1.6);
    if (input.handbrake) c.speed = U.lerp(c.speed, 0, dt * 6);
    c.speed = U.clamp(c.speed, -maxRev, maxFwd);
    const steerInput = (input.left ? -1 : 0) + (input.right ? 1 : 0);
    const spd = Math.abs(c.speed);
    const steerRate = 2.6 * U.clamp(spd / 120, 0, 1) * (c.speed < 0 ? -1 : 1);
    c.angle += steerInput * steerRate * dt;
    const nx = c.x + Math.cos(c.angle) * c.speed * dt;
    const ny = c.y + Math.sin(c.angle) * c.speed * dt;
    const probe = { x: nx, y: ny };
    if (!SBCity.hitsSolid(probe.x, probe.y, 20)) {
      c.x = nx;
      c.y = ny;
    } else {
      // Hit a wall: kill speed and bounce a little.
      if (Math.abs(c.speed) > 120) SBAudio.thud();
      c.speed *= -0.25;
    }
    SBCity.resolveSolids(c, 20);
  }

  // Simple circle-based car-car separation. A car marked `fixed` (a
  // roadblock) never moves: the other car takes the whole push instead.
  function separateCars(cars) {
    for (let i = 0; i < cars.length; i++) {
      for (let j = i + 1; j < cars.length; j++) {
        const a = cars[i];
        const b = cars[j];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const d2 = dx * dx + dy * dy;
        const min = 44;
        if (d2 < min * min && d2 > 0.01) {
          const d = Math.sqrt(d2);
          const push = (min - d) / 2;
          const ux = dx / d;
          const uy = dy / d;
          if (a.fixed && !b.fixed) {
            b.x += ux * push * 2;
            b.y += uy * push * 2;
          } else if (b.fixed && !a.fixed) {
            a.x -= ux * push * 2;
            a.y -= uy * push * 2;
          } else if (!a.fixed && !b.fixed) {
            a.x -= ux * push;
            a.y -= uy * push;
            b.x += ux * push;
            b.y += uy * push;
          }
          if (a.kind === 'player' || b.kind === 'player') {
            a.speed *= 0.6;
            b.speed *= 0.6;
          }
        }
      }
    }
  }

  function drawCar(ctx, c) {
    ctx.save();
    ctx.translate(c.x, c.y);
    ctx.rotate(c.angle);
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.fillRect(-CAR_W / 2 + 3, -CAR_H / 2 + 4, CAR_W, CAR_H);
    ctx.fillStyle = c.color;
    ctx.beginPath();
    ctx.roundRect(-CAR_W / 2, -CAR_H / 2, CAR_W, CAR_H, 7);
    ctx.fill();
    // Cabin and windshield.
    ctx.fillStyle = '#1d2733';
    ctx.beginPath();
    ctx.roundRect(-6, -CAR_H / 2 + 4, 16, CAR_H - 8, 4);
    ctx.fill();
    ctx.fillStyle = 'rgba(180,220,255,0.9)';
    ctx.fillRect(8, -CAR_H / 2 + 5, 5, CAR_H - 10);
    // Headlights.
    ctx.fillStyle = '#fff8c0';
    ctx.fillRect(CAR_W / 2 - 3, -CAR_H / 2 + 2, 3, 5);
    ctx.fillRect(CAR_W / 2 - 3, CAR_H / 2 - 7, 3, 5);
    // Taillights.
    ctx.fillStyle = '#c0392b';
    ctx.fillRect(-CAR_W / 2, -CAR_H / 2 + 2, 3, 5);
    ctx.fillRect(-CAR_W / 2, CAR_H / 2 - 7, 3, 5);
    ctx.restore();
    if (c.kind === 'police') {
      // Light bar, flashing.
      const flash = Math.floor(performance.now() / 180) % 2 === 0;
      ctx.save();
      ctx.translate(c.x, c.y);
      ctx.rotate(c.angle);
      ctx.fillStyle = flash ? '#ff2d2d' : '#2d7dff';
      ctx.fillRect(-4, -CAR_H / 2 - 1, 8, 5);
      ctx.fillStyle = flash ? '#2d7dff' : '#ff2d2d';
      ctx.fillRect(-4, CAR_H / 2 - 4, 8, 5);
      ctx.restore();
    }
  }

  return {
    CAR_W,
    CAR_H,
    CAR_COLORS,
    makeCar,
    spawnTraffic,
    spawnParked,
    updateTraffic,
    updatePlayerCar,
    separateCars,
    drawCar,
  };
})();
