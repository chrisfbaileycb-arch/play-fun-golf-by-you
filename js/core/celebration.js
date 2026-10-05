// Festive celebration scenes & confetti animations for Hole-in-One and Under-Par achievements.
import { prefersReducedMotion, clamp, ease, rrect, seg } from './util.js';
import { sfx, haptic } from './audio.js';
import { holeStrokes, isPlayerDone } from './game.js';
import { holeResults } from './stats.js';

export const CONFETTI_PALETTE = ['#f4b62b', '#e8443a', '#2f7de1', '#33b36b', '#9b59b6', '#ffffff', '#ff7675', '#ffd700'];

export function isHoleInOne(shot) {
  return Boolean(shot && shot.holed && shot.stroke === 1);
}

export function scoreTerm(strokes, par) {
  if (strokes === 1) return 'Hole in One';
  const diff = strokes - par;
  if (diff <= -3) return 'Albatross';
  if (diff === -2) return 'Eagle';
  if (diff === -1) return 'Birdie';
  if (diff === 0) return 'Par';
  if (diff === 1) return 'Bogey';
  if (diff === 2) return 'Double Bogey';
  return `+${diff}`;
}

/**
 * Procedural ribbon particles with 3D tumble physics.
 */
class ConfettiCannon {
  constructor(w, h) {
    this.particles = [];
    this.w = w;
    this.h = h;
  }

  blast(x, y, { n = 45, dir = -Math.PI / 2, spread = 1.4, power = 480, colors = CONFETTI_PALETTE } = {}) {
    const count = prefersReducedMotion() ? Math.ceil(n / 3) : n;
    for (let i = 0; i < count; i++) {
      const a = dir + (Math.random() - 0.5) * spread;
      const spd = power * (0.4 + Math.random() * 0.8);
      this.particles.push({
        x,
        y,
        vx: Math.cos(a) * spd,
        vy: Math.sin(a) * spd,
        size: 7 + Math.random() * 7,
        aspect: 0.25 + Math.random() * 0.35,
        color: colors[i % colors.length],
        rotX: Math.random() * Math.PI * 2,
        rotY: Math.random() * Math.PI * 2,
        rotZ: Math.random() * Math.PI * 2,
        vrX: (Math.random() - 0.5) * 12,
        vrY: (Math.random() - 0.5) * 16,
        vrZ: (Math.random() - 0.5) * 8,
        gravity: 420 + Math.random() * 80,
        drag: 0.985,
        life: 2.8 + Math.random() * 0.8,
        maxLife: 3.5,
        flutter: Math.random() * 10,
      });
    }
  }

  update(dt) {
    for (const p of this.particles) {
      p.life -= dt;
      p.vy += p.gravity * dt;
      p.vx *= p.drag;
      p.x += (p.vx + Math.sin(p.flutter += dt * 4) * 22) * dt;
      p.y += p.vy * dt;
      p.rotX += p.vrX * dt;
      p.rotY += p.vrY * dt;
      p.rotZ += p.vrZ * dt;
    }
    this.particles = this.particles.filter((p) => p.life > 0 && p.y < this.h + 60);
  }

  draw(ctx) {
    for (const p of this.particles) {
      const a = clamp(p.life / 0.5, 0, 1);
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rotZ);
      ctx.scale(Math.cos(p.rotX), Math.cos(p.rotY));
      ctx.globalAlpha = a;
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.size / 2, (-p.size * p.aspect) / 2, p.size, p.size * p.aspect);
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }
}

/**
 * Creates a dedicated festive celebration canvas scene for Hole-in-One or Under-Par score.
 */
export function createCelebrationScene({
  player,
  hole,
  holeIdx = 0,
  strokes = 1,
  par = 3,
  isAce = false,
  suiteTheme = 'launch',
  extraPlayers = [],
}) {
  const holeNum = holeIdx + 1;
  const toPar = strokes - par;
  const term = isAce ? 'Hole-In-One' : scoreTerm(strokes, par);
  const headline = isAce ? 'HOLE IN ONE!' : `${term.toUpperCase()}!`;
  const subText = isAce
    ? `ACE · 1 STROKE ON PAR ${par}`
    : `${strokes} STROKES · ${Math.abs(toPar)} UNDER PAR`;

  let cannon = null;
  let burstTimeline = [0.08, 0.45, 0.95, 1.5, 2.0];
  let firedIdx = 0;

  return {
    score: strokes,
    strokes: strokes,
    isAce: Boolean(isAce || strokes === 1),
    title: `🎉 ${headline}`,
    caption: isAce
      ? `⛳ ACE! ${player.name} drains a Hole-in-One on Hole ${holeNum}!`
      : `🎯 ${term}! ${player.name} completes Hole ${holeNum} at ${toPar} under par!`,
    holdMs: 1200,
    done: false,

    init(api) {
      cannon = new ConfettiCannon(api.w, api.h);

      // Sound fanfare & crowd
      sfx.play('crowd');
      sfx.play('fanfare');
      haptic([40, 60, 40, 60, 80]);

      // Screen flash & camera shake
      api.fx.flash('#ffd700', isAce ? 0.65 : 0.45);
      api.fx.shake(isAce ? 14 : 9, 0.45);

      // Initial double cannon blast from lower corners
      cannon.blast(api.w * 0.12, api.h * 0.88, { dir: -Math.PI / 3, power: 540, n: 60 });
      cannon.blast(api.w * 0.88, api.h * 0.88, { dir: (-Math.PI * 2) / 3, power: 540, n: 60 });
      api.fx.confetti(api.w * 0.5, api.h * 0.35, { n: 40 });
    },

    update(dt, api) {
      if (cannon) {
        cannon.w = api.w;
        cannon.h = api.h;
        cannon.update(dt);
      }

      // Staged confetti and firework bursts
      while (firedIdx < burstTimeline.length && api.t >= burstTimeline[firedIdx]) {
        const side = firedIdx % 2 === 0;
        const bx = side ? api.w * 0.15 : api.w * 0.85;
        const bdir = side ? -Math.PI / 3 : (-Math.PI * 2) / 3;
        cannon?.blast(bx, api.h * 0.85, { dir: bdir, power: 500, n: 45 });

        // Firework sparks in upper hemisphere
        const fxX = api.w * (0.25 + Math.random() * 0.5);
        const fxY = api.h * (0.2 + Math.random() * 0.35);
        api.fx.sparks(fxX, fxY, {
          n: 35,
          color: ['#ffd700', '#ff5722', '#2ecc71', '#00d2d3', '#fff'],
          speed: 300,
          size: 3,
        });

        if (firedIdx === 1) sfx.play('bell');
        if (firedIdx === 3) sfx.play('levelUp');
        firedIdx++;
      }

      if (api.t >= 2.8) {
        this.done = true;
      }
    },

    draw(ctx, w, h, api) {
      const t = api.t;
      const cx = w / 2;
      const cy = h * 0.42;

      // 1. Festive Backdrop
      const grad = ctx.createRadialGradient(cx, cy, 30, cx, cy, Math.max(w, h) * 0.8);
      grad.addColorStop(0, '#193826');
      grad.addColorStop(0.65, '#0b1c13');
      grad.addColorStop(1, '#050c08');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);

      // 2. Rotating Golden Sunburst Rays
      ctx.save();
      ctx.translate(cx, cy);
      const rot = prefersReducedMotion() ? 0 : t * 0.22;
      ctx.rotate(rot);
      const numRays = 18;
      const rayAngle = (Math.PI * 2) / numRays;
      for (let i = 0; i < numRays; i += 2) {
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.arc(0, 0, Math.max(w, h), i * rayAngle, (i + 1) * rayAngle);
        ctx.closePath();
        ctx.fillStyle = 'rgba(255, 215, 0, 0.045)';
        ctx.fill();
      }
      ctx.restore();

      // 3. Central Trophy Emblem & Wreath
      const emblemPulse = prefersReducedMotion() ? 1 : 1 + Math.sin(t * 3.5) * 0.03;
      const emblemR = Math.min(w * 0.22, 100) * emblemPulse;

      // Outer glowing halo
      ctx.save();
      ctx.shadowColor = '#ffd700';
      ctx.shadowBlur = 24;
      ctx.strokeStyle = 'rgba(244, 182, 43, 0.75)';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(cx, cy, emblemR + 8, 0, Math.PI * 2);
      ctx.stroke();

      // Emblem disc
      const discGrad = ctx.createRadialGradient(cx, cy - emblemR * 0.3, 10, cx, cy, emblemR);
      discGrad.addColorStop(0, '#2b533a');
      discGrad.addColorStop(0.8, '#10271b');
      discGrad.addColorStop(1, '#081710');
      ctx.fillStyle = discGrad;
      ctx.beginPath();
      ctx.arc(cx, cy, emblemR, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      // 4. Stylized Flagstick, Cup, and Golf Ball
      ctx.save();
      ctx.translate(cx, cy);

      // Cup rim on green
      ctx.fillStyle = '#06130b';
      ctx.beginPath();
      ctx.ellipse(0, emblemR * 0.42, 28, 9, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#f4b62b';
      ctx.lineWidth = 2;
      ctx.stroke();

      // Ripple rings around cup
      const ripple = prefersReducedMotion() ? 0.6 : (t * 1.5) % 1;
      ctx.strokeStyle = `rgba(244, 182, 43, ${clamp(1 - ripple, 0, 0.7)})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(0, emblemR * 0.42, 28 + ripple * 26, 9 + ripple * 8, 0, 0, Math.PI * 2);
      ctx.stroke();

      // Flag pole
      ctx.strokeStyle = '#eaeaea';
      ctx.lineWidth = 3.5;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(0, emblemR * 0.42);
      ctx.lineTo(0, -emblemR * 0.62);
      ctx.stroke();

      // Gold finial on top of flag
      ctx.fillStyle = '#ffd700';
      ctx.beginPath();
      ctx.arc(0, -emblemR * 0.64, 5, 0, Math.PI * 2);
      ctx.fill();

      // Pennant / Flag waving
      const wave = prefersReducedMotion() ? 0 : Math.sin(t * 6) * 4;
      ctx.fillStyle = isAce ? '#e74c3c' : '#2ecc71';
      ctx.beginPath();
      ctx.moveTo(0, -emblemR * 0.6);
      ctx.lineTo(38 + wave, -emblemR * 0.46 + wave * 0.4);
      ctx.lineTo(0, -emblemR * 0.32);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // Text on flag ("#1" or "★")
      ctx.fillStyle = '#fff';
      ctx.font = '900 13px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(isAce ? '#1' : '★', 14 + wave * 0.4, -emblemR * 0.46 + wave * 0.2);

      // Golf ball in cup with golden sparkle
      const ballBounce = ease.outBack(clamp(t / 0.5, 0, 1));
      const ballY = -emblemR * 0.2 + (emblemR * 0.58) * ballBounce;
      ctx.fillStyle = '#ffffff';
      ctx.shadowColor = '#ffd700';
      ctx.shadowBlur = 10;
      ctx.beginPath();
      ctx.arc(0, ballY, 8.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
      // Dimple shade
      ctx.fillStyle = 'rgba(0,0,0,0.15)';
      ctx.beginPath();
      ctx.arc(2, ballY + 2, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      // 5. Festive Typography & Banner
      const bannerY = cy + emblemR + 24;
      const popScale = ease.outBack(clamp(t / 0.45, 0, 1));

      ctx.save();
      ctx.translate(cx, bannerY);
      ctx.scale(popScale, popScale);

      // Headline Text (e.g. HOLE IN ONE!)
      ctx.font = `900 clamp(28px, 8vw, 44px) 'Arial Black', system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      // Text drop shadow & border
      ctx.lineWidth = 7;
      ctx.strokeStyle = '#051108';
      ctx.lineJoin = 'round';
      ctx.strokeText(headline, 0, 0);

      // Gradient text fill
      const textGrad = ctx.createLinearGradient(0, -20, 0, 20);
      textGrad.addColorStop(0, '#fff4cc');
      textGrad.addColorStop(0.5, '#f4b62b');
      textGrad.addColorStop(1, '#ff9800');
      ctx.fillStyle = textGrad;
      ctx.fillText(headline, 0, 0);

      // Sub-headline (Stroke count & under par info)
      ctx.font = `800 15px system-ui, -apple-system, sans-serif`;
      ctx.fillStyle = '#cfc4ab';
      ctx.strokeStyle = '#051108';
      ctx.lineWidth = 4;
      ctx.strokeText(subText, 0, 28);
      ctx.fillText(subText, 0, 28);

      // Player Pill Card
      const cardW = Math.min(w * 0.84, 340);
      const cardH = 48;
      const cardY = 52;
      ctx.fillStyle = 'rgba(20, 17, 13, 0.88)';
      rrect(ctx, -cardW / 2, cardY, cardW, cardH, 10);
      ctx.fill();
      ctx.strokeStyle = player.color || '#f4b62b';
      ctx.lineWidth = 2.5;
      ctx.stroke();

      // Player indicator color bar on left
      ctx.fillStyle = player.color || '#f4b62b';
      ctx.fillRect(-cardW / 2 + 3, cardY + 3, 6, cardH - 6);

      // Player Name
      ctx.textAlign = 'left';
      ctx.font = `900 16px system-ui, sans-serif`;
      ctx.fillStyle = '#ffffff';
      ctx.fillText(player.name, -cardW / 2 + 20, cardY + 20);

      // Suite / Achievement badge text on right
      ctx.textAlign = 'right';
      ctx.font = `800 12px system-ui, sans-serif`;
      ctx.fillStyle = '#f4b62b';
      ctx.fillText(isAce ? '★ ACE OF THE ROUND ★' : '★ BIRDIE CLUB ★', cardW / 2 - 14, cardY + 20);

      ctx.font = `600 11px system-ui, sans-serif`;
      ctx.fillStyle = '#cfc4ab';
      ctx.fillText(`Hole ${holeNum} (${hole.yards || 0} yds)`, cardW / 2 - 14, cardY + 36);

      ctx.restore();

      // 6. Draw 3D Falling Confetti Ribbons
      cannon?.draw(ctx);
    },
  };
}

/**
 * Wraps an existing mode between-hole scene (e.g. Knight duel arena or Monopoly bank)
 * with celebratory confetti cannons, audio fanfare, and a festive under-par banner.
 */
export function augmentSceneWithFestiveFX(baseScene, { underParPlayers, isAce, hole, holeIdx }) {
  if (!baseScene) return null;
  const term = isAce ? 'HOLE IN ONE' : underParPlayers.some((p) => p.toPar <= -2) ? 'EAGLE' : 'BIRDIE';
  const names = underParPlayers.map((p) => `${p.name} (${p.toPar > 0 ? '+' : ''}${p.toPar})`).join(', ');

  let cannon = null;
  let burstDone = false;

  return {
    ...baseScene,
    score: isAce ? 1 : (baseScene.score ?? 0),
    strokes: isAce ? 1 : (baseScene.strokes ?? 0),
    isAce: Boolean(isAce || baseScene.isAce),
    title: `🎉 ${term}! ${baseScene.title || ''}`.trim(),
    caption: `🎉 ${term}: ${names}! ${baseScene.caption || ''}`.trim(),

    init(api) {
      if (baseScene.init) baseScene.init(api);
      cannon = new ConfettiCannon(api.w, api.h);

      // Celebratory audio & effects
      sfx.play('crowd');
      sfx.play('fanfare');
      haptic([40, 60, 40, 60, 80]);
      api.fx.flash('#ffd700', 0.5);
      api.fx.shake(isAce ? 14 : 8, 0.4);

      // Launch initial dual confetti blasts
      cannon.blast(api.w * 0.1, api.h * 0.9, { dir: -Math.PI / 3, power: 520, n: 50 });
      cannon.blast(api.w * 0.9, api.h * 0.9, { dir: (-Math.PI * 2) / 3, power: 520, n: 50 });
    },

    update(dt, api) {
      if (baseScene.update) baseScene.update(dt, api);
      if (cannon) {
        cannon.w = api.w;
        cannon.h = api.h;
        cannon.update(dt);
      }

      if (!burstDone && api.t >= 1.1) {
        burstDone = true;
        cannon?.blast(api.w * 0.5, api.h * 0.4, { dir: -Math.PI / 2, power: 460, n: 40 });
        api.fx.sparks(api.w * 0.5, api.h * 0.25, {
          n: 35,
          color: ['#ffd700', '#2ecc71', '#ff5722', '#fff'],
          speed: 280,
        });
      }

      this.done = baseScene.done;
      if (baseScene.caption) this.caption = baseScene.caption;
    },

    draw(ctx, w, h, api) {
      if (baseScene.draw) baseScene.draw(ctx, w, h, api);

      // Overlay Festive Top Banner
      const t = api.t;
      const bannerH = 34;
      const bannerY = 12;
      const bannerW = Math.min(w - 24, 460);
      const bx = (w - bannerW) / 2;

      ctx.save();
      ctx.fillStyle = 'rgba(12, 28, 18, 0.92)';
      rrect(ctx, bx, bannerY, bannerW, bannerH, 8);
      ctx.fill();
      ctx.strokeStyle = '#ffd700';
      ctx.lineWidth = 2;
      ctx.stroke();

      // Gold badge icon
      ctx.fillStyle = '#ffd700';
      ctx.font = '900 13px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(isAce ? '🏆 HOLE-IN-ONE!' : `✨ UNDER PAR: ${names}`, w / 2, bannerY + bannerH / 2);
      ctx.restore();

      // Overlay Falling Confetti
      cannon?.draw(ctx);
    },
  };
}
