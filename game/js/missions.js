// Solara Bay — missions.js
// Vic's story: four missions that chain together, each with on-screen
// objectives, a map marker, and a cash reward. Finishing all four ends
// the story and saves the game.

const SBMissions = (() => {
  const U = SBUtil;
  const P = SBCity.POI;

  // Mission definitions. `stages` are checked in order; each stage has a
  // target point, a hint, and what completes it.
  const DEFS = [
    {
      id: 1,
      name: 'First Wheels',
      giver: 'Vic',
      brief: "Vic needs wheels. Steal any car and bring it to his garage.",
      reward: 200,
      stages: [
        { key: 'steal', text: 'Steal a car (walk up to one and press E)', target: null, kind: 'steal' },
        { key: 'deliver', text: "Drive the car to Vic's Garage", target: () => ({ x: P.vic.x, y: P.vic.y, r: 70 }), kind: 'reach', inCar: true },
      ],
    },
    {
      id: 2,
      name: 'Bay Run',
      giver: 'Vic',
      brief: 'A package is waiting at the pickup point. Grab it and drop it at the Docks. Keep it quiet.',
      reward: 400,
      stages: [
        { key: 'pickup', text: 'Pick up the package', target: () => ({ x: P.pickup.x, y: P.pickup.y, r: 55 }), kind: 'reach' },
        { key: 'dropoff', text: 'Deliver the package to the Docks', target: () => ({ x: P.docks.x, y: P.docks.y, r: 60 }), kind: 'reach' },
      ],
    },
    {
      id: 3,
      name: 'Hot and Bothered',
      giver: 'Vic',
      brief: 'The cops are sniffing around. Get a 3-star wanted level, then lose the heat at Pay N Spray.',
      reward: 500,
      stages: [
        { key: 'heat', text: 'Raise your wanted level to 3 stars', target: null, kind: 'wanted', stars: 3 },
        { key: 'cool', text: 'Lose the heat at Pay N Spray ($150)', target: () => ({ x: P.paynspray.x, y: P.paynspray.y, r: 60 }), kind: 'paynspray' },
      ],
    },
    {
      id: 4,
      name: 'The Big Score',
      giver: 'Vic',
      brief: 'Hit Solara Bank, grab the cash, and get back to the Hideout. The whole city will be after you.',
      reward: 1000,
      stages: [
        { key: 'bank', text: 'Get to Solara Bank', target: () => ({ x: P.bank.x, y: P.bank.y, r: 60 }), kind: 'reach' },
        { key: 'grab', text: 'Hold position and grab the cash', target: () => ({ x: P.bank.x, y: P.bank.y, r: 60 }), kind: 'hold', holdSeconds: 3 },
        { key: 'escape', text: 'Escape to the Hideout', target: () => ({ x: P.hideout.x, y: P.hideout.y, r: 65 }), kind: 'reach' },
      ],
    },
  ];

  function create() {
    return {
      index: 0, // which mission is active (0-based)
      stage: 0, // which stage of it
      holdT: 0,
      done: false,
      started: false,
      toast: '',
      toastT: 0,
    };
  }

  function current(ms) {
    if (ms.done || ms.index >= DEFS.length) return null;
    return DEFS[ms.index];
  }

  function currentStage(ms) {
    const m = current(ms);
    if (!m) return null;
    return m.stages[ms.stage];
  }

  function objectiveText(ms) {
    const m = current(ms);
    if (!m) return 'Story complete. Solara Bay is yours, Vic.';
    const s = m.stages[ms.stage];
    return m.id + '. ' + m.name + ' — ' + s.text;
  }

  function targetOf(ms) {
    const s = currentStage(ms);
    if (!s || !s.target) return null;
    return s.target();
  }

  function start(ms) {
    ms.started = true;
    showToast(ms, 'New mission: ' + DEFS[0].name + ' — ' + DEFS[0].brief);
  }

  function showToast(ms, text) {
    ms.toast = text;
    ms.toastT = 5;
  }

  // Advance the active stage; returns 'stage' | 'mission' | 'story' | null.
  function advance(ms, player) {
    const m = current(ms);
    if (!m) return null;
    ms.stage += 1;
    ms.holdT = 0;
    if (ms.stage >= m.stages.length) {
      player.money += m.reward;
      SBAudio.missionDone();
      ms.index += 1;
      ms.stage = 0;
      if (ms.index >= DEFS.length) {
        ms.done = true;
        showToast(ms, 'Story complete! Solara Bay is yours. +$' + m.reward);
        return 'story';
      }
      const next = DEFS[ms.index];
      showToast(ms, 'Mission complete! +$' + m.reward + ' — New mission: ' + next.name + ' — ' + next.brief);
      return 'mission';
    }
    showToast(ms, 'Objective updated: ' + m.stages[ms.stage].text);
    return 'stage';
  }

  // Called every frame with the live game state; handles stage completion.
  // `events` is the frame's event bag (stoleCar, usedPaynspray, ...).
  function update(ms, dt, player, pol, events) {
    if (ms.toastT > 0) ms.toastT -= dt;
    const m = current(ms);
    if (!m) return null;
    const s = m.stages[ms.stage];
    if (!s) return null;
    const pos = player.onFoot ? player : player.car || player;
    if (s.kind === 'steal') {
      if (events.stoleCar) return advance(ms, player);
    } else if (s.kind === 'reach') {
      const t = s.target();
      const inCarOk = !s.inCar || !player.onFoot;
      if (inCarOk && U.dist(pos.x, pos.y, t.x, t.y) < t.r) return advance(ms, player);
    } else if (s.kind === 'hold') {
      const t = s.target();
      if (U.dist(pos.x, pos.y, t.x, t.y) < t.r) {
        ms.holdT += dt;
        if (ms.holdT >= (s.holdSeconds || 3)) {
          if (m.id === 4) SBPolice.addWanted(pol, 3); // the alarm trips
          return advance(ms, player);
        }
      } else {
        ms.holdT = 0;
      }
    } else if (s.kind === 'wanted') {
      if (pol.stars >= (s.stars || 3)) return advance(ms, player);
    } else if (s.kind === 'paynspray') {
      if (events.usedPaynspray) return advance(ms, player);
    }
    return null;
  }

  function drawMarker(ctx, ms, time) {
    const t = targetOf(ms);
    if (!t) return;
    const pulse = 1 + Math.sin(time * 0.005) * 0.15;
    ctx.save();
    ctx.translate(t.x, t.y);
    ctx.strokeStyle = '#ff5d8f';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.arc(0, 0, (t.r || 50) * pulse, 0, U.TAU);
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,93,143,0.12)';
    ctx.beginPath();
    ctx.arc(0, 0, (t.r || 50) * pulse, 0, U.TAU);
    ctx.fill();
    // Bouncing arrow above the marker.
    const bob = Math.sin(time * 0.006) * 6;
    ctx.fillStyle = '#ff5d8f';
    ctx.beginPath();
    ctx.moveTo(0, -t.r - 26 + bob);
    ctx.lineTo(-11, -t.r - 44 + bob);
    ctx.lineTo(11, -t.r - 44 + bob);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  return {
    DEFS,
    create,
    current,
    currentStage,
    objectiveText,
    targetOf,
    start,
    showToast,
    advance,
    update,
    drawMarker,
  };
})();
