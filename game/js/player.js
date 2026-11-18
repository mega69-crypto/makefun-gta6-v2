// Solara Bay — player.js
// The player character: on-foot movement, running, punching, shooting,
// entering and leaving cars, health, money and ammo.

const SBPlayer = (() => {
  const U = SBUtil;

  const WALK_SPEED = 175;
  const RUN_SPEED = 285;
  const RADIUS = 14;

  function create(x, y) {
    return {
      x,
      y,
      angle: -Math.PI / 2,
      speed: 0,
      onFoot: true,
      car: null,
      health: 100,
      money: 150,
      ammo: 24,
      punchCooldown: 0,
      punchAnim: 0,
      shootCooldown: 0,
      hurtFlash: 0,
      moving: false,
    };
  }

  // Move on foot. `input` carries the held keys; returns nothing.
  function updateFoot(p, input, dt) {
    let mx = 0;
    let my = 0;
    if (input.up) my -= 1;
    if (input.down) my += 1;
    if (input.left) mx -= 1;
    if (input.right) mx += 1;
    p.moving = mx !== 0 || my !== 0;
    const run = input.run && p.moving;
    const speed = run ? RUN_SPEED : WALK_SPEED;
    if (p.moving) {
      const len = Math.hypot(mx, my);
      mx /= len;
      my /= len;
      p.angle = Math.atan2(my, mx);
      const nx = p.x + mx * speed * dt;
      const ny = p.y + my * speed * dt;
      // Axis-separated movement so the player slides along walls.
      const probeX = { x: nx, y: p.y };
      if (!SBCity.hitsSolid(probeX.x, probeX.y, RADIUS)) p.x = nx;
      const probeY = { x: p.x, y: ny };
      if (!SBCity.hitsSolid(probeY.x, probeY.y, RADIUS)) p.y = ny;
      p.speed = speed;
    } else {
      p.speed = 0;
    }
    SBCity.resolveSolids(p, RADIUS);
    if (p.punchCooldown > 0) p.punchCooldown -= dt;
    if (p.punchAnim > 0) p.punchAnim -= dt;
    if (p.shootCooldown > 0) p.shootCooldown -= dt;
    if (p.hurtFlash > 0) p.hurtFlash -= dt;
  }

  function punch(p) {
    if (p.punchCooldown > 0 || !p.onFoot) return false;
    p.punchCooldown = 0.45;
    p.punchAnim = 0.25;
    SBAudio.punch();
    return true;
  }

  function shoot(p, tx, ty) {
    if (p.shootCooldown > 0 || p.ammo <= 0) return false;
    p.shootCooldown = 0.22;
    p.ammo -= 1;
    p.angle = Math.atan2(ty - p.y, tx - p.x);
    SBAudio.shot();
    return true;
  }

  function damage(p, amount) {
    if (p.health <= 0) return;
    p.health = Math.max(0, p.health - amount);
    p.hurtFlash = 0.35;
    if (p.health <= 0) SBAudio.busted();
  }

  function heal(p, amount) {
    p.health = U.clamp(p.health + amount, 0, 100);
  }

  function draw(ctx, p) {
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.angle);
    // Shadow.
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath();
    ctx.ellipse(2, 4, 15, 10, 0, 0, U.TAU);
    ctx.fill();
    // Body: teal jacket, dark jeans.
    ctx.fillStyle = '#e8503a';
    ctx.fillRect(-8, -9, 16, 18); // jacket
    ctx.fillStyle = '#22252c';
    ctx.fillRect(-14, -7, 7, 14); // legs
    ctx.fillStyle = '#e8b98a';
    ctx.beginPath();
    ctx.arc(10, 0, 7, 0, U.TAU);
    ctx.fill(); // head
    ctx.fillStyle = '#1c1c22';
    ctx.beginPath();
    ctx.arc(11, 0, 7, Math.PI * 0.7, Math.PI * 1.3);
    ctx.fill(); // hair
    // Punching arm.
    if (p.punchAnim > 0) {
      ctx.fillStyle = '#e8503a';
      ctx.fillRect(10, -4, 16, 8);
    }
    // Pistol in hand while aiming.
    if (p.ammo > 0 && p.shootCooldown > 0.12) {
      ctx.fillStyle = '#333';
      ctx.fillRect(12, 3, 10, 4);
    }
    ctx.restore();
    if (p.hurtFlash > 0) {
      ctx.save();
      ctx.globalAlpha = Math.min(0.5, p.hurtFlash);
      ctx.fillStyle = '#ff0000';
      ctx.beginPath();
      ctx.arc(p.x, p.y, 20, 0, U.TAU);
      ctx.fill();
      ctx.restore();
    }
  }

  return { WALK_SPEED, RUN_SPEED, RADIUS, create, updateFoot, punch, shoot, damage, heal, draw };
})();
