// Solara Bay — main.js
// The game itself: state, the main loop, input, the camera, combat
// resolution, world interactions (Pay N Spray, Hideout, hospital, ammo),
// screens (start / pause / busted / wasted), saving, and the ?scene=
// setups used to take the entry screenshots.

const SBGame = (() => {
  const U = SBUtil;

  const SAVE_KEY = 'solara-bay-save-v1';
  const AMMO_SPOTS = [
    { x: 1100, y: 300 },
    { x: 300, y: 1100 },
    { x: 1900, y: 1100 },
  ];

  let canvas = null;
  let ctx = null;
  let state = 'menu'; // 'menu' | 'playing' | 'paused' | 'busted' | 'wasted'
  let player = null;
  let police = null;
  let missions = null;
  let traffic = [];
  let parked = [];
  let peds = [];
  let camera = { x: 0, y: 0, w: 1280, h: 720 };
  let tracers = [];
  let ammoCrates = [];
  let input = { up: false, down: false, left: false, right: false, run: false, handbrake: false };
  let mouse = { x: 0, y: 0, wx: 0, wy: 0, down: false };
  let lastTime = 0;
  let time = 0;
  let ramCooldown = 0;
  let hint = '';
  let lastSaveAt = 0;

  function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    camera.w = canvas.width;
    camera.h = canvas.height;
  }

  function newWorld() {
    SBCity.build();
    player = SBPlayer.create(1100, 660);
    police = SBPolice.create();
    missions = SBMissions.create();
    traffic = SBVehicles.spawnTraffic(14);
    parked = SBVehicles.spawnParked(10);
    peds = SBPeds.spawn(26);
    ammoCrates = AMMO_SPOTS.map((s) => ({ x: s.x, y: s.y, active: true, timer: 0 }));
    tracers = [];
    camera = { x: 0, y: 0, w: window.innerWidth, h: window.innerHeight };
  }

  function allCars() {
    const list = [];
    for (const c of traffic) list.push(c);
    for (const c of parked) list.push(c);
    for (const c of police.cruisers) list.push(c);
    for (const c of police.roadblocks) list.push(c);
    if (player.car) list.push(player.car);
    return list;
  }

  // --- interactions -------------------------------------------------------

  function nearestCar(maxD) {
    let best = null;
    let bestD = maxD;
    for (const c of allCars()) {
      if (c === player.car) continue;
      const d = U.dist(player.x, player.y, c.x, c.y);
      if (d < bestD) {
        bestD = d;
        best = c;
      }
    }
    return best;
  }

  function enterCar(car) {
    // Remove it from its old list.
    traffic = traffic.filter((c) => c !== car);
    parked = parked.filter((c) => c !== car);
    police.cruisers = police.cruisers.filter((c) => c !== car);
    car.kind = 'player';
    car.speed = 0;
    player.car = car;
    player.onFoot = false;
    player.x = car.x;
    player.y = car.y;
    SBPolice.addWanted(police, 1); // stealing is a crime
    return true;
  }

  function exitCar() {
    const car = player.car;
    if (!car) return;
    car.kind = 'parked';
    car.speed = 0;
    parked.push(car);
    player.car = null;
    player.onFoot = true;
    // Step out to the side of the car.
    const sx = car.x - Math.sin(car.angle) * 34;
    const sy = car.y + Math.cos(car.angle) * 34;
    player.x = sx;
    player.y = sy;
    SBCity.resolveSolids(player, SBPlayer.RADIUS);
  }

  function tryInteract() {
    if (!player.onFoot) {
      exitCar();
      return;
    }
    const car = nearestCar(78);
    if (car) {
      enterCar(car);
      return 'stole';
    }
    const h = SBCity.POI.hideout;
    if (U.dist(player.x, player.y, h.x, h.y) < h.r) {
      saveGame();
      SBMissions.showToast(missions, 'Game saved at the Hideout.');
      return 'saved';
    }
    return null;
  }

  function paynsprayCheck() {
    const p = SBCity.POI.paynspray;
    if (player.onFoot || !player.car) return false;
    if (police.stars <= 0) return false;
    if (U.dist(player.car.x, player.car.y, p.x, p.y) > p.r) return false;
    if (player.money < p.cost) return false;
    player.money -= p.cost;
    SBPolice.clearWanted(police);
    player.car.color = SBVehicles.CAR_COLORS[Math.floor(Math.random() * SBVehicles.CAR_COLORS.length)];
    SBAudio.cash();
    SBMissions.showToast(missions, 'Repaint done. The heat is off. -$' + p.cost);
    return true;
  }

  // --- combat -------------------------------------------------------------

  function shootAt(wx, wy) {
    const ox = player.x;
    const oy = player.y;
    const aim = Math.atan2(wy - oy, wx - ox);
    const range = 560;
    const ex = ox + Math.cos(aim) * range;
    const ey = oy + Math.sin(aim) * range;
    let hitD = range;
    let hitKind = null;
    let hitObj = null;
    function consider(x, y, r, kind, obj) {
      const dx = x - ox;
      const dy = y - oy;
      const along = dx * Math.cos(aim) + dy * Math.sin(aim);
      if (along < 0 || along > hitD) return;
      const perp = Math.abs(-dx * Math.sin(aim) + dy * Math.cos(aim));
      if (perp < r + 8) {
        hitD = along;
        hitKind = kind;
        hitObj = obj;
      }
    }
    for (const p of peds) if (p.down <= 0) consider(p.x, p.y, 12, 'ped', p);
    for (const c of allCars()) {
      if (c === player.car) continue;
      consider(c.x, c.y, 24, 'car', c);
    }
    const hx = ox + Math.cos(aim) * hitD;
    const hy = oy + Math.sin(aim) * hitD;
    tracers.push({ x1: ox, y1: oy, x2: hx, y2: hy, life: 0.09 });
    if (hitKind === 'ped') {
      SBPeds.knockDown(hitObj);
      SBPolice.addWanted(police, 1);
      SBAudio.thud();
    } else if (hitKind === 'car') {
      if (hitObj.kind === 'police') SBPolice.addWanted(police, 2);
      else SBPolice.addWanted(police, 1);
      SBAudio.thud();
    }
    return hitKind;
  }

  function punchHit() {
    const reach = 52;
    const fx = player.x + Math.cos(player.angle) * reach;
    const fy = player.y + Math.sin(player.angle) * reach;
    let hit = false;
    for (const p of peds) {
      if (p.down > 0) continue;
      if (U.dist(fx, fy, p.x, p.y) < 26) {
        SBPeds.knockDown(p);
        SBPolice.addWanted(police, 1);
        hit = true;
      }
    }
    return hit;
  }

  // --- save / load ----------------------------------------------------------

  function saveGame() {
    try {
      const data = {
        money: player.money,
        health: player.health,
        ammo: player.ammo,
        missionIndex: missions.index,
        missionStage: missions.stage,
        missionDone: missions.done,
        x: Math.round(player.x),
        y: Math.round(player.y),
      };
      window.localStorage.setItem(SAVE_KEY, JSON.stringify(data));
      lastSaveAt = time;
    } catch (e) {}
  }

  function loadSave() {
    try {
      const raw = window.localStorage.getItem(SAVE_KEY);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (e) {
      return null;
    }
  }

  function applySave(data) {
    player.money = data.money;
    player.health = data.health;
    player.ammo = data.ammo;
    player.x = data.x;
    player.y = data.y;
    missions.index = data.missionIndex || 0;
    missions.stage = data.missionStage || 0;
    missions.done = !!data.missionDone;
    missions.started = true;
  }

  // --- screens --------------------------------------------------------------

  function show(id) {
    for (const s of ['screen-start', 'screen-pause', 'screen-busted', 'screen-wasted']) {
      const el = document.getElementById(s);
      if (el) el.classList.toggle('hidden', s !== id);
    }
  }

  function startGame(fromSave) {
    SBAudio.init();
    SBAudio.resume();
    newWorld();
    if (fromSave) {
      const data = loadSave();
      if (data) applySave(data);
    }
    if (!missions.started) SBMissions.start(missions);
    state = 'playing';
    show(null);
    lastTime = performance.now();
    requestAnimationFrame(loop);
  }

  function pauseGame() {
    if (state !== 'playing') return;
    state = 'paused';
    show('screen-pause');
    SBAudio.setSiren(false);
  }

  function resumeGame() {
    if (state !== 'paused') return;
    state = 'playing';
    show(null);
    SBAudio.resume();
    lastTime = performance.now();
    requestAnimationFrame(loop);
  }

  function endGame(kind) {
    state = kind; // 'busted' | 'wasted'
    SBAudio.setSiren(false);
    SBAudio.setEngine(0, false);
    const loss = kind === 'busted' ? 150 : 100;
    player.money = Math.max(0, player.money - loss);
    show(kind === 'busted' ? 'screen-busted' : 'screen-wasted');
  }

  function respawn() {
    player.health = 100;
    player.money = Math.max(0, player.money);
    SBPolice.clearWanted(police);
    police.cruisers = [];
    police.roadblocks = [];
    if (player.car) {
      player.car.kind = 'parked';
      parked.push(player.car);
      player.car = null;
    }
    player.onFoot = true;
    player.x = SBCity.POI.hospital.x;
    player.y = SBCity.POI.hospital.y + 80;
    state = 'playing';
    show(null);
    lastTime = performance.now();
    requestAnimationFrame(loop);
  }

  // --- screenshot scenes ------------------------------------------------------

  function setupScene(scene) {
    // Called right after startGame() when ?scene= is present: put the game
    // in a real gameplay state for the screenshot, then keep playing.
    missions.toast = '';
    missions.toastT = 0;
    if (scene === 'drive') {
      const car = SBVehicles.makeCar(700, 700, 0, '#d94f3d', 'player');
      player.car = car;
      player.onFoot = false;
      player.x = car.x;
      player.y = car.y;
      car.speed = 300;
    } else if (scene === 'chase') {
      // Eastbound on the y=1100 road so the roadblock (spawned north on
      // x=1100) stays out of the driving line and the cruisers trail behind.
      const car = SBVehicles.makeCar(1100, 1100, 0, '#3d7dd9', 'player');
      player.car = car;
      player.onFoot = false;
      player.x = car.x;
      player.y = car.y;
      car.speed = 340;
      SBPolice.addWanted(police, 3);
      for (let i = 0; i < 3; i++) {
        const c = SBVehicles.makeCar(1100 + (i - 1) * 90, 1100 + 190, -Math.PI / 2, '#20242c', 'police');
        police.cruisers.push(c);
      }
    } else if (scene === 'mission') {
      missions.index = 1;
      missions.stage = 0;
      missions.started = true;
      const car = SBVehicles.makeCar(700, 1400, Math.PI / 2, '#e8b13c', 'player');
      player.car = car;
      player.onFoot = false;
      player.x = car.x;
      player.y = car.y;
      car.speed = 0;
    } else {
      // 'foot': on foot downtown, traffic and peds around.
      player.x = 1100;
      player.y = 700;
      player.angle = 0;
    }
  }

  // --- main loop --------------------------------------------------------------

  function loop(now) {
    if (state !== 'playing') return;
    const dt = Math.min(0.05, (now - lastTime) / 1000 || 0.016);
    lastTime = now;
    time = now / 1000;
    const events = { stoleCar: false, usedPaynspray: false };
    const interact = tryInteract._pending;
    tryInteract._pending = null;
    if (interact === 'stole') events.stoleCar = true;

    // Player movement.
    if (player.onFoot) {
      SBPlayer.updateFoot(player, input, dt);
    } else if (player.car) {
      SBVehicles.updatePlayerCar(player.car, input, dt);
      player.x = player.car.x;
      player.y = player.car.y;
      player.angle = player.car.angle;
      if (player.punchCooldown > 0) player.punchCooldown -= dt;
      if (player.shootCooldown > 0) player.shootCooldown -= dt;
    }

    // Traffic, peds, police.
    for (const c of traffic) SBVehicles.updateTraffic(c, dt, allCars(), player);
    const danger = !player.onFoot && player.car && Math.abs(player.car.speed) > 200 ? player.car : null;
    SBPeds.update(peds, dt, danger);
    const busted = SBPolice.update(police, dt, player, allCars(), time);
    if (busted) {
      endGame('busted');
      return;
    }
    SBVehicles.separateCars(allCars());

    // Player car running over peds.
    if (!player.onFoot && player.car && Math.abs(player.car.speed) > 60) {
      for (const p of peds) {
        if (p.down > 0) continue;
        if (U.dist(player.car.x, player.car.y, p.x, p.y) < 30) {
          SBPeds.knockDown(p);
          SBPolice.addWanted(police, 1);
          SBAudio.thud();
          player.car.speed *= 0.85;
        }
      }
    }
    // Traffic cars hitting the player on foot.
    if (player.onFoot && ramCooldown <= 0) {
      for (const c of allCars()) {
        if (c === player.car) continue;
        if (U.dist(c.x, c.y, player.x, player.y) < 30 && Math.abs(c.speed) > 40) {
          SBPlayer.damage(player, c.kind === 'police' ? 12 : 8);
          ramCooldown = 1;
          player.x += (player.x - c.x) * 0.6;
          player.y += (player.y - c.y) * 0.6;
          SBAudio.thud();
          break;
        }
      }
    }
    // Police ramming the player's car.
    if (!player.onFoot && player.car && ramCooldown <= 0) {
      for (const c of police.cruisers) {
        if (U.dist(c.x, c.y, player.car.x, player.car.y) < 48 && Math.abs(c.speed) > 150) {
          SBPlayer.damage(player, 6);
          ramCooldown = 1;
          SBAudio.thud();
          break;
        }
      }
    }
    if (ramCooldown > 0) ramCooldown -= dt;

    // World interactions.
    if (paynsprayCheck()) events.usedPaynspray = true;
    const hosp = SBCity.POI.hospital;
    if (player.onFoot && U.dist(player.x, player.y, hosp.x, hosp.y) < hosp.r) {
      SBPlayer.heal(player, 18 * dt);
    }
    for (const crate of ammoCrates) {
      if (!crate.active) {
        crate.timer -= dt;
        if (crate.timer <= 0) crate.active = true;
        continue;
      }
      if (player.onFoot && U.dist(player.x, player.y, crate.x, crate.y) < 30) {
        player.ammo += 24;
        crate.active = false;
        crate.timer = 60;
        SBAudio.pickup();
        SBMissions.showToast(missions, 'Ammo +24');
      }
    }

    // Missions.
    SBMissions.update(missions, dt, player, police, events);
    if (missions.done && time - lastSaveAt > 5) saveGame();

    // Mouse aim + shooting.
    mouse.wx = camera.x + mouse.x;
    mouse.wy = camera.y + mouse.y;
    if (mouse.down) {
      mouse.down = false;
      if (player.onFoot) {
        if (SBPlayer.shoot(player, mouse.wx, mouse.wy)) shootAt(mouse.wx, mouse.wy);
      } else if (player.car) {
        if (SBPlayer.shoot(player, mouse.wx, mouse.wy)) shootAt(mouse.wx, mouse.wy);
      }
    }

    // Health.
    if (player.health <= 0) {
      endGame('wasted');
      return;
    }

    // Camera follows the player.
    camera.x = U.clamp(player.x - camera.w / 2, 0, Math.max(0, SBCity.WORLD_W - camera.w));
    camera.y = U.clamp(player.y - camera.h / 2, 0, Math.max(0, SBCity.WORLD_H - camera.h));

    // Hint line.
    hint = '';
    if (player.onFoot) {
      const car = nearestCar(78);
      if (car) hint = 'Press E to steal the car';
      else if (U.dist(player.x, player.y, SBCity.POI.hideout.x, SBCity.POI.hideout.y) < SBCity.POI.hideout.r) hint = 'Press E to save at the Hideout';
      else if (U.dist(player.x, player.y, hosp.x, hosp.y) < hosp.r) hint = 'Hospital: healing...';
    } else {
      const p = SBCity.POI.paynspray;
      if (police.stars > 0 && U.dist(player.car.x, player.car.y, p.x, p.y) < p.r + 40) {
        hint = player.money >= p.cost ? 'Pay N Spray: repaint to lose the cops ($' + p.cost + ')' : 'Pay N Spray needs $' + p.cost;
      } else {
        hint = 'E: exit car  •  Click: drive-by  •  Space: handbrake';
      }
    }

    // Engine sound follows speed.
    const spd01 = player.car ? Math.abs(player.car.speed) / 460 : 0;
    SBAudio.setEngine(spd01, !player.onFoot);

    render();
    SBHud.update({ player, police, missions, camera, hint });
    requestAnimationFrame(loop);
  }

  function render() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    ctx.translate(-camera.x, -camera.y);
    SBCity.draw(ctx, camera, performance.now());
    // Ammo crates.
    for (const crate of ammoCrates) {
      if (!crate.active) continue;
      ctx.fillStyle = '#2e7d32';
      ctx.fillRect(crate.x - 14, crate.y - 14, 28, 28);
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 10px Inter, Arial, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('AMMO', crate.x, crate.y);
    }
    SBMissions.drawMarker(ctx, missions, performance.now());
    // Draw order: parked, traffic, police, roadblocks, player car, peds, player.
    for (const c of parked) SBVehicles.drawCar(ctx, c);
    for (const c of traffic) SBVehicles.drawCar(ctx, c);
    for (const c of police.cruisers) SBVehicles.drawCar(ctx, c);
    SBPolice.drawRoadblocks(ctx, police);
    if (player.car) SBVehicles.drawCar(ctx, player.car);
    SBPeds.draw(ctx, peds);
    if (player.onFoot) SBPlayer.draw(ctx, player);
    // Bullet tracers.
    for (const t of tracers) {
      ctx.strokeStyle = 'rgba(255,220,80,0.9)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(t.x1, t.y1);
      ctx.lineTo(t.x2, t.y2);
      ctx.stroke();
    }
    tracers = tracers.filter((t) => (t.life -= 0.016) > 0);
    ctx.restore();
    // Damage vignette.
    if (player.hurtFlash > 0) {
      ctx.fillStyle = 'rgba(255,0,0,' + Math.min(0.12, player.hurtFlash * 0.25) + ')';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
  }

  // --- input ------------------------------------------------------------------

  function keyFor(e) {
    return e.key.length === 1 ? e.key.toLowerCase() : e.key;
  }

  function bindInput() {
    window.addEventListener('keydown', (e) => {
      const k = keyFor(e);
      if (k === 'ArrowUp' || k === 'ArrowDown' || k === 'ArrowLeft' || k === 'ArrowRight' || k === ' ') e.preventDefault();
      if (state !== 'playing') {
        if ((k === 'Escape' || k === 'p' || k === 'P') && state === 'paused') resumeGame();
        return;
      }
      if (k === 'w' || k === 'W' || k === 'ArrowUp') input.up = true;
      if (k === 's' || k === 'S' || k === 'ArrowDown') input.down = true;
      if (k === 'a' || k === 'A' || k === 'ArrowLeft') input.left = true;
      if (k === 'd' || k === 'D' || k === 'ArrowRight') input.right = true;
      if (k === 'Shift') input.run = true;
      if (k === ' ') {
        if (player.onFoot) {
          if (SBPlayer.punch(player)) punchHit();
        } else {
          input.handbrake = true;
        }
      }
      if (k === 'e' || k === 'E') {
        const r = tryInteract();
        if (r === 'stole') {
          // handled next frame via the pending flag
        }
        tryInteract._pending = r;
      }
      if (k === 'm' || k === 'M') SBAudio.toggleMute();
      if (k === 'Escape' || k === 'p' || k === 'P') pauseGame();
    });
    window.addEventListener('keyup', (e) => {
      const k = keyFor(e);
      if (k === 'w' || k === 'W' || k === 'ArrowUp') input.up = false;
      if (k === 's' || k === 'S' || k === 'ArrowDown') input.down = false;
      if (k === 'a' || k === 'A' || k === 'ArrowLeft') input.left = false;
      if (k === 'd' || k === 'D' || k === 'ArrowRight') input.right = false;
      if (k === 'Shift') input.run = false;
      if (k === ' ') input.handbrake = false;
    });
    canvas.addEventListener('mousemove', (e) => {
      mouse.x = e.clientX;
      mouse.y = e.clientY;
    });
    canvas.addEventListener('mousedown', (e) => {
      if (state !== 'playing') return;
      mouse.x = e.clientX;
      mouse.y = e.clientY;
      mouse.down = true;
      SBAudio.resume();
    });
    window.addEventListener('blur', () => {
      if (state === 'playing') pauseGame();
    });
  }

  function bindScreens() {
    const startBtn = document.getElementById('btn-start');
    if (startBtn) startBtn.addEventListener('click', () => startGame(false));
    const continueBtn = document.getElementById('btn-continue');
    if (continueBtn) {
      if (!loadSave()) continueBtn.style.display = 'none';
      continueBtn.addEventListener('click', () => startGame(true));
    }
    const resumeBtn = document.getElementById('btn-resume');
    if (resumeBtn) resumeBtn.addEventListener('click', resumeGame);
    const restartBtn = document.getElementById('btn-restart');
    if (restartBtn) restartBtn.addEventListener('click', () => window.location.reload());
    const respawnBusted = document.getElementById('btn-respawn-busted');
    if (respawnBusted) respawnBusted.addEventListener('click', respawn);
    const respawnWasted = document.getElementById('btn-respawn-wasted');
    if (respawnWasted) respawnWasted.addEventListener('click', respawn);
  }

  function init() {
    canvas = document.getElementById('game');
    ctx = canvas.getContext('2d');
    resize();
    window.addEventListener('resize', resize);
    newWorld();
    SBHud.init();
    bindInput();
    bindScreens();
    const params = new URLSearchParams(window.location.search);
    const scene = params.get('scene');
    if (scene) {
      // Screenshot mode: jump straight into a live gameplay state.
      startGame(false);
      setupScene(scene);
    } else {
      show('screen-start');
      render();
    }
    // Expose a tiny debug handle for automated play-testing.
    window.__solara = {
      get state() {
        return state;
      },
      get player() {
        return player;
      },
      get police() {
        return police;
      },
      get missions() {
        return missions;
      },
      get cars() {
        return allCars();
      },
      get peds() {
        return peds;
      },
      start: startGame,
    };
  }

  return { init };
})();

document.addEventListener('DOMContentLoaded', () => SBGame.init());
