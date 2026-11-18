// Solara Bay — hud.js
// The heads-up display: health, money, ammo, wanted stars, the mission
// objective, hints, toasts, and the live minimap in the corner.

const SBHud = (() => {
  const U = SBUtil;

  let els = {};
  let mapCanvas = null;
  let mapCtx = null;

  function init() {
    els = {
      healthFill: document.getElementById('health-fill'),
      healthText: document.getElementById('health-text'),
      money: document.getElementById('money'),
      ammo: document.getElementById('ammo'),
      stars: document.getElementById('stars'),
      objective: document.getElementById('objective'),
      hint: document.getElementById('hint'),
      toast: document.getElementById('toast'),
      speed: document.getElementById('speed'),
    };
    mapCanvas = document.getElementById('minimap');
    mapCtx = mapCanvas.getContext('2d');
  }

  function update(state) {
    const p = state.player;
    const pol = state.police;
    const ms = state.missions;
    if (els.healthFill) {
      els.healthFill.style.width = p.health + '%';
      els.healthFill.style.background = p.health > 50 ? '#4caf50' : p.health > 25 ? '#ff9800' : '#f44336';
    }
    if (els.healthText) els.healthText.textContent = Math.ceil(p.health);
    if (els.money) els.money.textContent = '$' + p.money;
    if (els.ammo) els.ammo.textContent = p.onFoot ? 'Ammo ' + p.ammo : 'Ammo ' + p.ammo + ' (drive-by: click)';
    if (els.stars) {
      let stars = '';
      for (let i = 0; i < 5; i++) stars += i < pol.stars ? '★' : '☆';
      els.stars.textContent = stars;
      els.stars.style.color = pol.stars > 0 ? '#ffd166' : 'rgba(255,255,255,0.35)';
    }
    if (els.objective) els.objective.textContent = SBMissions.objectiveText(ms);
    if (els.hint) {
      els.hint.textContent = state.hint || '';
      els.hint.style.opacity = state.hint ? '1' : '0';
    }
    if (els.toast) {
      els.toast.textContent = ms.toast || '';
      els.toast.style.opacity = ms.toastT > 0 ? '1' : '0';
    }
    if (els.speed) {
      if (!p.onFoot && p.car) {
        els.speed.textContent = Math.round(Math.abs(p.car.speed) * 0.24) + ' mph';
      } else {
        els.speed.textContent = '';
      }
    }
    drawMinimap(state);
  }

  function drawMinimap(state) {
    if (!mapCtx) return;
    const W = mapCanvas.width;
    const H = mapCanvas.height;
    const sx = W / SBCity.WORLD_W;
    const sy = H / SBCity.WORLD_H;
    const ctx = mapCtx;
    ctx.clearRect(0, 0, W, H);
    // Ground and water.
    ctx.fillStyle = '#3f6b35';
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#2f7fb8';
    ctx.fillRect(0, SBCity.WATER_Y * sy, W, H - SBCity.WATER_Y * sy);
    ctx.fillStyle = '#e0c98f';
    ctx.fillRect(0, SBCity.BEACH_Y * sy, W, (SBCity.WATER_Y - SBCity.BEACH_Y) * sy);
    // Roads.
    ctx.fillStyle = '#555';
    for (const vx of SBCity.V_ROADS) ctx.fillRect(vx * sx - 2, 0, 4, SBCity.BEACH_Y * sy);
    for (const hy of SBCity.H_ROADS) ctx.fillRect(0, hy * sy - 2, W, 4);
    // Park.
    ctx.fillStyle = '#2f6b2f';
    ctx.fillRect(SBCity.PARK.x * sx, SBCity.PARK.y * sy, SBCity.PARK.w * sx, SBCity.PARK.h * sy);
    // Mission target.
    const t = SBMissions.targetOf(state.missions);
    if (t) {
      ctx.fillStyle = '#ff5d8f';
      ctx.beginPath();
      ctx.arc(t.x * sx, t.y * sy, 5, 0, U.TAU);
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
    // Police.
    ctx.fillStyle = '#2d7dff';
    for (const c of state.police.cruisers) {
      ctx.beginPath();
      ctx.arc(c.x * sx, c.y * sy, 3, 0, U.TAU);
      ctx.fill();
    }
    // Player.
    const p = state.player;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(p.x * sx, p.y * sy, 4, 0, U.TAU);
    ctx.fill();
    ctx.strokeStyle = '#e8503a';
    ctx.lineWidth = 2;
    ctx.stroke();
    // Viewport rectangle.
    const cam = state.camera;
    ctx.strokeStyle = 'rgba(255,255,255,0.6)';
    ctx.lineWidth = 1;
    ctx.strokeRect(cam.x * sx, cam.y * sy, cam.w * sx, cam.h * sy);
  }

  return { init, update };
})();
