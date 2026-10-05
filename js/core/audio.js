// Web Audio synthesizer — every sound is generated procedurally (no audio files).
// Usage: sfx.play('clank'). The AudioContext is created lazily on the first user gesture.

const MUTE_KEY = 'arcade-links/muted';

class Synth {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.noiseBuf = null;
    this.muted = (() => { try { return localStorage.getItem(MUTE_KEY) === '1'; } catch { return false; } })();
  }

  unlock() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.55;
    const comp = this.ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 4;
    this.master.connect(comp).connect(this.ctx.destination);
    const len = this.ctx.sampleRate * 1.5;
    this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  }

  setMuted(m) {
    this.muted = m;
    try { localStorage.setItem(MUTE_KEY, m ? '1' : '0'); } catch { /* storage unavailable */ }
    if (this.master) this.master.gain.setTargetAtTime(m ? 0 : 0.55, this.ctx.currentTime, 0.02);
  }

  get now() { return this.ctx ? this.ctx.currentTime : 0; }

  /** Oscillator voice with ADSR-ish envelope and optional pitch slide. */
  tone({ f = 440, to = null, dur = 0.2, type = 'sine', gain = 0.3, at = 0, attack = 0.005, curve = 'exp', detune = 0, dest = null }) {
    if (!this.ctx) return;
    const t = this.now + at;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f, t);
    o.detune.value = detune;
    if (to !== null) {
      if (curve === 'exp') o.frequency.exponentialRampToValueAtTime(Math.max(1, to), t + dur);
      else o.frequency.linearRampToValueAtTime(to, t + dur);
    }
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(dest || this.master);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  /** Filtered noise burst. */
  noise({ dur = 0.2, gain = 0.3, at = 0, type = 'bandpass', f = 1000, to = null, q = 1, attack = 0.003 }) {
    if (!this.ctx) return;
    const t = this.now + at;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const filt = this.ctx.createBiquadFilter();
    filt.type = type;
    filt.frequency.setValueAtTime(f, t);
    if (to !== null) filt.frequency.exponentialRampToValueAtTime(Math.max(20, to), t + dur);
    filt.Q.value = q;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(filt).connect(g).connect(this.master);
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.05);
  }

  /** Metallic inharmonic partials (bells, clanks). */
  metal({ f = 520, dur = 0.5, gain = 0.25, at = 0, ratios = [1, 2.76, 5.4, 8.93] }) {
    ratios.forEach((r, i) => this.tone({ f: f * r, dur: dur / (1 + i * 0.6), type: 'sine', gain: gain / (1 + i), at }));
  }

  play(name, opts = {}) {
    if (!this.ctx || this.muted) return;
    const fn = SOUNDS[name];
    if (fn) {
      try { fn(this, opts); } catch { /* never let audio break gameplay */ }
    }
  }
}

const notes = (base, semis) => semis.map((s) => base * Math.pow(2, s / 12));

const SOUNDS = {
  // UI
  click: (s) => s.tone({ f: 900, to: 600, dur: 0.05, type: 'square', gain: 0.08 }),
  select: (s) => { s.tone({ f: 660, dur: 0.07, type: 'triangle', gain: 0.15 }); s.tone({ f: 990, dur: 0.09, type: 'triangle', gain: 0.12, at: 0.05 }); },
  confirm: (s) => notes(523, [0, 4, 7]).forEach((f, i) => s.tone({ f, dur: 0.12, type: 'triangle', gain: 0.16, at: i * 0.06 })),
  error: (s) => { s.tone({ f: 220, dur: 0.15, type: 'sawtooth', gain: 0.12 }); s.tone({ f: 180, dur: 0.2, type: 'sawtooth', gain: 0.12, at: 0.12 }); },
  undo: (s) => s.tone({ f: 700, to: 350, dur: 0.15, type: 'triangle', gain: 0.12 }),

  // Golf
  swing: (s) => s.noise({ dur: 0.35, gain: 0.35, type: 'bandpass', f: 400, to: 2600, q: 2 }),
  woosh: (s) => s.noise({ dur: 0.28, gain: 0.3, type: 'bandpass', f: 2400, to: 300, q: 1.5 }),
  strike: (s) => { s.tone({ f: 1800, to: 900, dur: 0.06, type: 'square', gain: 0.18 }); s.noise({ dur: 0.05, gain: 0.25, f: 3000, q: 0.8 }); },
  cupDrop: (s) => { [0, 0.09, 0.15, 0.19].forEach((at, i) => s.tone({ f: 1200 - i * 150, dur: 0.06, type: 'triangle', gain: 0.2 - i * 0.03, at })); s.tone({ f: 260, dur: 0.25, type: 'sine', gain: 0.25, at: 0.22 }); },
  splash: (s) => { s.noise({ dur: 0.6, gain: 0.35, type: 'lowpass', f: 2500, to: 300, q: 0.7 }); s.tone({ f: 180, to: 60, dur: 0.3, gain: 0.2 }); },
  sandThud: (s) => s.noise({ dur: 0.3, gain: 0.35, type: 'lowpass', f: 900, to: 150, q: 0.5 }),
  crowd: (s) => { for (let i = 0; i < 6; i++) s.noise({ dur: 0.9, gain: 0.07, type: 'bandpass', f: 600 + i * 220, q: 3, at: i * 0.04 }); },
  wind: (s, o = {}) => {
    const dur = o.dur || 1.8;
    const gain = o.gain || 0.28;
    s.noise({ dur, gain, type: 'bandpass', f: 280, to: 750, q: 1.8, attack: 0.35 });
    s.noise({ dur: dur * 0.85, gain: gain * 0.6, type: 'lowpass', f: 450, to: 180, q: 1.2, at: 0.15, attack: 0.25 });
  },
  crowdCheer: (s, o = {}) => {
    const dur = o.dur || 2.4;
    for (let i = 0; i < 8; i++) {
      s.noise({ dur: dur * (0.65 + (i % 3) * 0.15), gain: 0.08, type: 'bandpass', f: 480 + i * 170, q: 2.4, at: i * 0.035, attack: 0.12 });
    }
    [0.35, 0.75, 1.25].forEach((at, idx) => {
      s.tone({ f: 1650 + idx * 260, to: 2250 + idx * 180, dur: 0.32, type: 'sine', gain: 0.035, at, attack: 0.03 });
    });
  },

  // Medieval
  clank: (s) => { s.metal({ f: 430 + Math.random() * 80, dur: 0.45, gain: 0.25 }); s.noise({ dur: 0.08, gain: 0.3, f: 4000, q: 0.7 }); },
  slash: (s) => { s.noise({ dur: 0.22, gain: 0.35, type: 'highpass', f: 1800, to: 6000, q: 0.7 }); s.tone({ f: 1400, to: 500, dur: 0.18, type: 'sawtooth', gain: 0.05 }); },
  shieldClash: (s) => { s.metal({ f: 300, dur: 0.8, gain: 0.3, ratios: [1, 1.48, 2.83, 4.1] }); s.noise({ dur: 0.15, gain: 0.35, f: 2500, q: 0.6 }); },
  thud: (s) => { s.tone({ f: 120, to: 40, dur: 0.3, type: 'sine', gain: 0.45 }); s.noise({ dur: 0.12, gain: 0.25, type: 'lowpass', f: 600 }); },
  crit: (s) => { s.tone({ f: 1600, to: 200, dur: 0.35, type: 'sawtooth', gain: 0.12 }); s.metal({ f: 700, dur: 0.6, gain: 0.25 }); s.noise({ dur: 0.25, gain: 0.3, f: 5000, q: 0.5 }); },
  flame: (s) => { s.noise({ dur: 1.0, gain: 0.35, type: 'lowpass', f: 400, to: 2400, q: 1.2 }); s.tone({ f: 90, to: 55, dur: 0.9, type: 'sawtooth', gain: 0.12 }); },
  lightning: (s) => { s.noise({ dur: 0.08, gain: 0.5, type: 'highpass', f: 3000 }); s.noise({ dur: 1.2, gain: 0.4, type: 'lowpass', f: 300, to: 60, at: 0.05, q: 0.6 }); s.tone({ f: 60, to: 30, dur: 1, gain: 0.3, at: 0.05 }); },
  horn: (s) => notes(233, [0, 7, 12]).forEach((f, i) => { s.tone({ f, dur: 0.38, type: 'sawtooth', gain: 0.1, at: i * 0.2, attack: 0.04 }); s.tone({ f: f * 1.005, dur: 0.38, type: 'square', gain: 0.04, at: i * 0.2, attack: 0.04 }); }),
  fanfare: (s) => {
    const seq = [[0, 0.12], [0, 0.12], [0, 0.12], [5, 0.36], [9, 0.18], [5, 0.12], [12, 0.6]];
    let at = 0;
    seq.forEach(([n, d]) => { const f = 349 * Math.pow(2, n / 12); s.tone({ f, dur: d + 0.05, type: 'sawtooth', gain: 0.1, at, attack: 0.02 }); s.tone({ f: f * 2, dur: d, type: 'triangle', gain: 0.06, at }); at += d; });
  },
  defeat: (s) => notes(330, [0, -1, -2, -5]).forEach((f, i) => s.tone({ f, dur: 0.35, type: 'triangle', gain: 0.14, at: i * 0.28 })),
  levelUp: (s) => notes(440, [0, 4, 7, 12, 16]).forEach((f, i) => s.tone({ f, dur: 0.14, type: 'square', gain: 0.07, at: i * 0.07 })),
  combo: (s, o) => { const k = Math.min(o.level || 1, 6); notes(520, [0, 3, 7].map((x) => x + k * 2)).forEach((f, i) => s.tone({ f, dur: 0.1, type: 'square', gain: 0.07, at: i * 0.05 })); },
  dragonRoar: (s) => { s.tone({ f: 110, to: 70, dur: 1.4, type: 'sawtooth', gain: 0.2, attack: 0.1 }); s.tone({ f: 113, to: 66, dur: 1.4, type: 'sawtooth', gain: 0.15, attack: 0.1 }); s.noise({ dur: 1.4, gain: 0.25, type: 'bandpass', f: 500, to: 250, q: 1.5, attack: 0.1 }); },
  scroll: (s) => s.noise({ dur: 0.8, gain: 0.18, type: 'bandpass', f: 1200, to: 3000, q: 4 }),

  // Battleship
  sonar: (s) => { s.tone({ f: 1150, dur: 1.2, type: 'sine', gain: 0.25, attack: 0.01 }); s.tone({ f: 1150, dur: 0.9, type: 'sine', gain: 0.08, at: 0.45 }); },
  explosion: (s) => { s.noise({ dur: 1.4, gain: 0.55, type: 'lowpass', f: 1500, to: 80, q: 0.7 }); s.tone({ f: 80, to: 25, dur: 1.2, type: 'sine', gain: 0.5 }); },
  siren: (s) => { s.tone({ f: 500, to: 900, dur: 0.6, type: 'sawtooth', gain: 0.08, curve: 'lin' }); s.tone({ f: 900, to: 500, dur: 0.6, type: 'sawtooth', gain: 0.08, at: 0.6, curve: 'lin' }); },
  missPlop: (s) => { s.tone({ f: 600, to: 150, dur: 0.25, gain: 0.2 }); s.noise({ dur: 0.35, gain: 0.15, type: 'lowpass', f: 1200, to: 200, at: 0.1 }); },
  sunk: (s) => { SOUNDS.explosion(s); notes(196, [0, -2, -4, -7]).forEach((f, i) => s.tone({ f, dur: 0.3, type: 'square', gain: 0.06, at: 0.4 + i * 0.22 })); },

  // Monopoly
  register: (s) => { s.tone({ f: 2100, dur: 0.08, type: 'square', gain: 0.06 }); s.metal({ f: 1320, dur: 1.1, gain: 0.25, at: 0.08, ratios: [1, 2.0, 3.01, 4.2] }); },
  coin: (s) => { s.tone({ f: 988, dur: 0.08, type: 'square', gain: 0.09 }); s.tone({ f: 1319, dur: 0.3, type: 'square', gain: 0.09, at: 0.08 }); },
  jail: (s) => { s.metal({ f: 160, dur: 0.9, gain: 0.35, ratios: [1, 1.6, 2.4, 3.9] }); s.noise({ dur: 0.2, gain: 0.35, type: 'lowpass', f: 900 }); s.tone({ f: 70, to: 45, dur: 0.5, gain: 0.35 }); },
  dice: (s) => { for (let i = 0; i < 7; i++) s.noise({ dur: 0.04, gain: 0.2, f: 2500 + Math.random() * 1500, q: 3, at: i * 0.05 + Math.random() * 0.02 }); },
  chance: (s) => notes(659, [0, 7, 12, 7, 12, 16]).forEach((f, i) => s.tone({ f, dur: 0.08, type: 'triangle', gain: 0.12, at: i * 0.06 })),

  // Sorry / Chutes & Ladders
  bump: (s) => { s.tone({ f: 200, to: 90, dur: 0.18, type: 'square', gain: 0.18 }); s.tone({ f: 900, to: 300, dur: 0.3, type: 'triangle', gain: 0.12, at: 0.12 }); },
  sorry: (s) => notes(784, [0, -3, -7, -12]).forEach((f, i) => s.tone({ f, dur: 0.16, type: 'square', gain: 0.08, at: i * 0.1 })),
  ladder: (s) => notes(392, [0, 2, 4, 5, 7, 9, 11, 12, 14, 16]).forEach((f, i) => s.tone({ f, dur: 0.09, type: 'triangle', gain: 0.12, at: i * 0.05 })),
  chute: (s) => s.tone({ f: 1400, to: 160, dur: 0.9, type: 'sine', gain: 0.18 }),
  hop: (s) => s.tone({ f: 500, to: 800, dur: 0.07, type: 'square', gain: 0.07 }),
  slide: (s) => s.noise({ dur: 0.6, gain: 0.2, type: 'bandpass', f: 800, to: 3000, q: 6 }),

  // Mouse Trap
  crank: (s) => { for (let i = 0; i < 8; i++) s.tone({ f: 2200 + (i % 2) * 300, dur: 0.025, type: 'square', gain: 0.07, at: i * 0.07 }); },
  gear: (s) => { for (let i = 0; i < 5; i++) s.noise({ dur: 0.03, gain: 0.18, f: 3500, q: 8, at: i * 0.09 }); },
  bootKick: (s) => { s.tone({ f: 160, to: 70, dur: 0.15, gain: 0.35 }); s.noise({ dur: 0.08, gain: 0.25, type: 'lowpass', f: 800 }); },
  marble: (s) => { for (let i = 0; i < 14; i++) s.tone({ f: 1800 + Math.random() * 1200, dur: 0.03, type: 'triangle', gain: 0.07, at: i * 0.06 + Math.random() * 0.02 }); },
  tub: (s) => { s.metal({ f: 240, dur: 0.6, gain: 0.25, ratios: [1, 2.1, 3.3] }); s.noise({ dur: 0.3, gain: 0.15, type: 'lowpass', f: 1200, at: 0.1 }); },
  spring: (s) => { s.tone({ f: 180, to: 1100, dur: 0.25, type: 'sawtooth', gain: 0.1 }); for (let i = 0; i < 6; i++) s.tone({ f: 700 - i * 60, to: 400 - i * 30, dur: 0.06, type: 'triangle', gain: 0.1 - i * 0.012, at: 0.22 + i * 0.07 }); },
  cage: (s) => { s.tone({ f: 900, to: 200, dur: 0.4, type: 'sine', gain: 0.12 }); s.metal({ f: 210, dur: 0.9, gain: 0.35, at: 0.38, ratios: [1, 1.7, 2.9, 4.4] }); },
  squeak: (s) => s.tone({ f: 2400, to: 3200, dur: 0.12, type: 'sine', gain: 0.1 }),

  // Rock 'Em Sock 'Em
  ratchet: (s) => { for (let i = 0; i < 10; i++) s.tone({ f: 3200, dur: 0.012, type: 'square', gain: 0.07, at: i * 0.035 }); },
  punch: (s) => { s.tone({ f: 140, to: 50, dur: 0.18, gain: 0.45 }); s.noise({ dur: 0.07, gain: 0.35, type: 'lowpass', f: 1500 }); s.tone({ f: 900, dur: 0.03, type: 'square', gain: 0.08 }); },
  bigPunch: (s) => { s.tone({ f: 110, to: 35, dur: 0.35, gain: 0.55 }); s.noise({ dur: 0.18, gain: 0.45, type: 'lowpass', f: 1200, to: 200 }); s.metal({ f: 380, dur: 0.3, gain: 0.12 }); },
  block: (s) => { s.tone({ f: 600, dur: 0.06, type: 'square', gain: 0.12 }); s.noise({ dur: 0.05, gain: 0.2, f: 2000 }); },
  headPop: (s) => { s.tone({ f: 200, to: 1600, dur: 0.18, type: 'square', gain: 0.12 }); for (let i = 0; i < 12; i++) s.tone({ f: 900 + ((i % 2) ? 220 : -120) - i * 25, dur: 0.05, type: 'triangle', gain: 0.12 - i * 0.008, at: 0.15 + i * 0.05 }); },
  bell: (s) => { for (let i = 0; i < 3; i++) s.metal({ f: 880, dur: 0.6, gain: 0.25, at: i * 0.22, ratios: [1, 2.4, 4.5] }); },
};

export const sfx = new Synth();

export function haptic(pattern = 20) {
  try { if (navigator.vibrate) navigator.vibrate(pattern); } catch { /* unsupported */ }
}

/**
 * Audio Manager integration providing high-level event-driven sound triggers
 * and coordination for celebratory gameplay events (e.g. Hole-In-One, Ace celebrations).
 */
export class AudioManager {
  constructor(synth = sfx) {
    this.synth = synth;
    this.listeners = new Set();
    this._lastHoleInOne = 0;
  }

  unlock() {
    this.synth.unlock();
  }

  play(name, opts = {}) {
    return this.synth.play(name, opts);
  }

  setMuted(m) {
    this.synth.setMuted(m);
  }

  get muted() {
    return this.synth.muted;
  }

  /**
   * Triggers specific celebratory sound effects (wind whoosh, ball rattle, crowd cheers, fanfare)
   * specifically when a hole-in-one is recorded.
   *
   * @param {object} [opts] - Event metadata (player, hole, w, h)
   */
  onHoleInOne(opts = {}) {
    const now = Date.now();
    // Debounce rapid multiple triggers within 1.2s to preserve acoustic clarity
    if (now - this._lastHoleInOne < 1200) return;
    this._lastHoleInOne = now;

    this.unlock();

    // 1. Aerodynamic wind whoosh across the green / ball flight breeze
    this.synth.play('wind', { dur: 1.8, gain: 0.28 });

    // 2. Ball rattling into the bottom of the cup
    this.synth.play('cupDrop');

    // 3. Staggered, roaring stadium crowd cheer
    setTimeout(() => {
      this.synth.play('crowdCheer', { dur: 2.6 });
      this.synth.play('crowd');
    }, 180);

    // 4. Celebratory victory fanfare
    setTimeout(() => {
      this.synth.play('fanfare');
    }, 450);

    // 5. Haptic celebration pulse
    haptic([60, 40, 60, 40, 120]);

    for (const listener of this.listeners) {
      try { listener('hole-in-one', opts); } catch { /* ignore listener errors */ }
    }
  }

  triggerHoleInOne(opts = {}) {
    return this.onHoleInOne(opts);
  }

  on(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
}

export const audioManager = new AudioManager(sfx);
sfx.audioManager = audioManager;
sfx.onHoleInOne = (opts) => audioManager.onHoleInOne(opts);

export const SOUND_NAMES = Object.keys(SOUNDS);
