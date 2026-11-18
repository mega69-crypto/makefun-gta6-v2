// Solara Bay — audio.js
// All sound is synthesized live with WebAudio: no audio files, no network.
// Engine hum, police siren, gunshots, punches, pickups and mission jingles.

const SBAudio = (() => {
  let ctx = null;
  let master = null;
  let engineOsc = null;
  let engineGain = null;
  let engineFilter = null;
  let sirenOsc = null;
  let sirenGain = null;
  let sirenTimer = null;
  let muted = false;
  let started = false;

  function ensure() {
    if (ctx) return true;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.5;
      master.connect(ctx.destination);
      return true;
    } catch (e) {
      return false;
    }
  }

  // Call from a user gesture (start button / key press).
  function init() {
    if (started) return;
    if (!ensure()) return;
    started = true;
    if (ctx.state === 'suspended') ctx.resume();
    startEngine();
  }

  function resume() {
    if (ctx && ctx.state === 'suspended') ctx.resume();
  }

  function toggleMute() {
    muted = !muted;
    if (master) master.gain.value = muted ? 0 : 0.5;
    return muted;
  }

  function isMuted() {
    return muted;
  }

  // Continuous engine loop: two detuned saws through a lowpass; pitch follows speed.
  function startEngine() {
    if (!ctx || engineOsc) return;
    engineOsc = ctx.createOscillator();
    engineOsc.type = 'sawtooth';
    engineOsc.frequency.value = 55;
    const sub = ctx.createOscillator();
    sub.type = 'square';
    sub.frequency.value = 28;
    engineFilter = ctx.createBiquadFilter();
    engineFilter.type = 'lowpass';
    engineFilter.frequency.value = 320;
    engineGain = ctx.createGain();
    engineGain.gain.value = 0.0;
    const subGain = ctx.createGain();
    subGain.gain.value = 0.4;
    engineOsc.connect(engineFilter);
    sub.connect(engineFilter);
    engineFilter.connect(engineGain);
    engineGain.connect(master);
    sub.connect(subGain);
    subGain.connect(engineGain);
    engineOsc.start();
    sub.start();
    engineOsc._sub = sub;
  }

  // speed01: 0..1, onFoot: engine is quiet on foot.
  function setEngine(speed01, driving) {
    if (!ctx || !engineOsc) return;
    const t = ctx.currentTime;
    const freq = 55 + speed01 * 130;
    engineOsc.frequency.setTargetAtTime(freq, t, 0.08);
    if (engineOsc._sub) engineOsc._sub.frequency.setTargetAtTime(freq / 2, t, 0.08);
    engineFilter.frequency.setTargetAtTime(280 + speed01 * 900, t, 0.1);
    engineGain.gain.setTargetAtTime(driving ? 0.05 + speed01 * 0.06 : 0.0, t, 0.1);
  }

  // Two-tone police siren while any cruiser is near.
  function setSiren(on) {
    if (!ctx) return;
    if (on && !sirenOsc) {
      sirenOsc = ctx.createOscillator();
      sirenOsc.type = 'triangle';
      sirenOsc.frequency.value = 720;
      sirenGain = ctx.createGain();
      sirenGain.gain.value = 0.0;
      sirenOsc.connect(sirenGain);
      sirenGain.connect(master);
      sirenOsc.start();
      sirenGain.gain.setTargetAtTime(0.035, ctx.currentTime, 0.2);
      let high = false;
      sirenTimer = window.setInterval(() => {
        if (!sirenOsc) return;
        high = !high;
        sirenOsc.frequency.setTargetAtTime(high ? 950 : 720, ctx.currentTime, 0.05);
      }, 420);
    } else if (!on && sirenOsc) {
      window.clearInterval(sirenTimer);
      sirenTimer = null;
      const osc = sirenOsc;
      const gain = sirenGain;
      sirenOsc = null;
      sirenGain = null;
      gain.gain.setTargetAtTime(0, ctx.currentTime, 0.1);
      window.setTimeout(() => {
        try {
          osc.stop();
        } catch (e) {}
      }, 400);
    }
  }

  function noiseBuffer(seconds) {
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    return buf;
  }

  function playNoise(seconds, filterFreq, gainVal, type) {
    if (!ctx || muted) return;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer(seconds);
    const filter = ctx.createBiquadFilter();
    filter.type = type || 'lowpass';
    filter.frequency.value = filterFreq;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(gainVal, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + seconds);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    src.start();
  }

  function playTone(freq, seconds, gainVal, type, slideTo) {
    if (!ctx || muted) return;
    const osc = ctx.createOscillator();
    osc.type = type || 'sine';
    osc.frequency.setValueAtTime(freq, ctx.currentTime);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, ctx.currentTime + seconds);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(gainVal, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + seconds);
    osc.connect(gain);
    gain.connect(master);
    osc.start();
    osc.stop(ctx.currentTime + seconds + 0.02);
  }

  function shot() {
    playNoise(0.14, 1800, 0.5, 'lowpass');
    playTone(160, 0.08, 0.25, 'square', 60);
  }

  function punch() {
    playNoise(0.09, 500, 0.4, 'lowpass');
  }

  function thud() {
    playNoise(0.18, 300, 0.5, 'lowpass');
    playTone(90, 0.15, 0.3, 'sine', 45);
  }

  function pickup() {
    playTone(660, 0.09, 0.2, 'sine');
    window.setTimeout(() => playTone(880, 0.12, 0.2, 'sine'), 90);
  }

  function cash() {
    playTone(523, 0.08, 0.2, 'triangle');
    window.setTimeout(() => playTone(659, 0.08, 0.2, 'triangle'), 80);
    window.setTimeout(() => playTone(784, 0.14, 0.22, 'triangle'), 160);
  }

  function missionDone() {
    const notes = [523, 659, 784, 1047];
    notes.forEach((n, i) => window.setTimeout(() => playTone(n, 0.16, 0.22, 'triangle'), i * 110));
  }

  function busted() {
    playTone(220, 0.5, 0.25, 'sawtooth', 110);
  }

  function click() {
    playTone(800, 0.05, 0.15, 'sine');
  }

  return {
    init,
    resume,
    toggleMute,
    isMuted,
    setEngine,
    setSiren,
    shot,
    punch,
    thud,
    pickup,
    cash,
    missionDone,
    busted,
    click,
  };
})();
