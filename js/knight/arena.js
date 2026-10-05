// Interactive 2D Canvas Duel Arena for Knight Golf.
import { drawShield, drawSigil, WEAPONS } from './heraldry.js';
import { Timeline } from '../core/fx.js';
import { sfx } from '../core/audio.js';
import { clamp, ease } from '../core/util.js';

export function createArenaScene(game, beats, isRaid = false) {
  let tl;
  let currentBeatIndex = 0;
  let activeBeat = beats[0] || null;

  return {
    title: isRaid ? 'Raid Boss Arena' : 'Knights Duel Arena',
    caption: beats[0]?.text || 'Knights prepare for combat...',
    holdMs: 1200,
    done: false,

    init(api) {
      tl = new Timeline();
      let timeOffset = 0.5;

      beats.forEach((beat, idx) => {
        tl.add(timeOffset, () => {
          currentBeatIndex = idx;
          activeBeat = beat;
          this.caption = beat.text;

          // Sound and FX based on beat kind
          if (beat.kind === 'clash') {
            api.fx.sparks(api.w / 2, api.h * 0.55, { n: 40, color: '#f4c55a', speed: 320 });
            api.fx.shake(14, 0.4);
            sfx.play('shieldClash');
          } else if (beat.kind === 'flame') {
            api.fx.sparks(api.w * 0.65, api.h * 0.5, { n: 50, color: ['#e74c3c', '#f39c12', '#f1c40f'], speed: 360, size: 4 });
            api.fx.flash('#ff5722', 0.4);
            api.fx.shake(16, 0.5);
            sfx.play('flame');
          } else if (beat.kind === 'lightning') {
            api.fx.flash('#ffffff', 0.8);
            api.fx.sparks(api.w * 0.65, api.h * 0.5, { n: 45, color: '#00d2d3', speed: 400 });
            api.fx.shake(18, 0.5);
            sfx.play('lightning');
          } else if (beat.kind === 'boss') {
            api.fx.sparks(api.w * 0.35, api.h * 0.55, { n: 50, color: '#e74c3c', speed: 350 });
            api.fx.shake(20, 0.6);
            sfx.play('dragonRoar');
          } else {
            api.fx.sparks(api.w * 0.65, api.h * 0.52, { n: 30, color: '#ffd25a', speed: 280 });
            api.fx.shake(10, 0.3);
            sfx.play('crit');
          }

          if (beat.dmg > 0) {
            api.fx.text(api.w * (beat.kind === 'boss' ? 0.35 : 0.65), api.h * 0.4, `-${beat.dmg}`, {
              color: beat.kind === 'flame' ? '#ff7675' : '#fffa65',
              size: 38,
            });
          }
        });
        timeOffset += 1.6;
      });

      tl.add(timeOffset + 0.5, () => {
        this.done = true;
      });
    },

    update(dt, api) {
      if (tl) tl.update(dt);
    },

    draw(ctx, w, h, api) {
      const t = api.t;
      // Medieval castle background
      drawCastleBackdrop(ctx, w, h, t);

      // Arena ground
      ctx.fillStyle = '#1c140c';
      ctx.fillRect(0, h * 0.68, w, h * 0.32);
      ctx.fillStyle = '#2c1e12';
      ctx.fillRect(0, h * 0.68, w, 6);

      if (isRaid) {
        // Draw Party on Left, Dragon Boss on Right
        drawParty(ctx, w, h, game.players, t);
        drawDragonBoss(ctx, w * 0.72, h * 0.5, t, game.modeState?.bossHp ?? 300);
      } else {
        // Draw 1v1 / Foursome Clash
        const p1 = activeBeat?.attacker || game.players[0];
        const p2 = activeBeat?.defender || game.players[1] || game.players[0];

        const lunge1 = activeBeat?.attacker?.id === p1.id ? Math.sin(t * 8) * 30 : 0;
        const lunge2 = activeBeat?.attacker?.id === p2.id ? -Math.sin(t * 8) * 30 : 0;

        drawKnight(ctx, w * 0.32 + lunge1, h * 0.68, p1, t, false, activeBeat?.kind);
        drawKnight(ctx, w * 0.68 + lunge2, h * 0.68, p2, t, true, activeBeat?.kind);
      }
    },
  };
}

function drawCastleBackdrop(ctx, w, h, t) {
  // Dark night sky with torches
  const grad = ctx.createLinearGradient(0, 0, 0, h * 0.68);
  grad.addColorStop(0, '#0a0705');
  grad.addColorStop(1, '#24170d');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h * 0.68);

  // Distant battlements
  ctx.fillStyle = '#181009';
  const stoneW = 40;
  for (let x = 0; x < w; x += stoneW) {
    const bh = 50 + ((x * 13) % 25);
    ctx.fillRect(x, h * 0.55 - bh, stoneW - 4, bh);
  }

  // Torches on walls
  for (const tx of [w * 0.2, w * 0.8]) {
    const ty = h * 0.45;
    ctx.fillStyle = '#4a2f18';
    ctx.fillRect(tx - 3, ty, 6, 26);
    // Torch flame
    const flicker = Math.sin(t * 18 + tx) * 4;
    ctx.fillStyle = '#f39c12';
    ctx.beginPath();
    ctx.arc(tx, ty - 6, 12 + flicker, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#f1c40f';
    ctx.beginPath();
    ctx.arc(tx, ty - 8, 7 + flicker * 0.6, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawKnight(ctx, x, y, player, t, flip = false, beatKind = null) {
  ctx.save();
  ctx.translate(x, y);
  if (flip) ctx.scale(-1, 1);

  const bob = Math.sin(t * 4) * 3;
  const col = player.color || '#e74c3c';
  const sigil = player.sigil || 'lion';
  const weapon = player.weapon || 'broadsword';

  // Shadow
  ctx.fillStyle = 'rgba(0,0,0,0.5)';
  ctx.beginPath();
  ctx.ellipse(0, 0, 36, 12, 0, 0, Math.PI * 2);
  ctx.fill();

  // Armored legs
  ctx.fillStyle = '#7f8c8d';
  ctx.fillRect(-16, -35, 12, 35);
  ctx.fillRect(4, -35, 12, 35);

  // Tabard / Body
  ctx.fillStyle = col;
  ctx.fillRect(-22, -85 + bob, 44, 52);
  // Gold belt
  ctx.fillStyle = '#f1c40f';
  ctx.fillRect(-22, -45 + bob, 44, 8);

  // Shield
  drawShield(ctx, -24, -60 + bob, 48, col, sigil);

  // Armored Helmet & Visor
  ctx.fillStyle = '#95a5a6';
  ctx.beginPath();
  ctx.arc(0, -100 + bob, 18, 0, Math.PI * 2);
  ctx.fill();
  // Visor slit
  ctx.fillStyle = '#1e272e';
  ctx.fillRect(-10, -102 + bob, 20, 5);

  // Plume on helm
  ctx.fillStyle = col;
  ctx.beginPath();
  ctx.moveTo(0, -118 + bob);
  ctx.quadraticCurveTo(-14, -135 + bob, -22, -120 + bob);
  ctx.lineTo(-6, -112 + bob);
  ctx.closePath();
  ctx.fill();

  // Weapon
  ctx.save();
  ctx.translate(22, -60 + bob);
  const swing = Math.sin(t * 10) * 0.4;
  ctx.rotate(swing);

  if (weapon === 'battleaxe') {
    ctx.fillStyle = '#795548';
    ctx.fillRect(-3, -40, 6, 50);
    ctx.fillStyle = '#bdc3c7';
    ctx.beginPath();
    ctx.arc(6, -30, 16, -Math.PI / 2, Math.PI / 2);
    ctx.closePath();
    ctx.fill();
  } else if (weapon === 'flail') {
    ctx.fillStyle = '#795548';
    ctx.fillRect(-3, -25, 6, 35);
    ctx.strokeStyle = '#bdc3c7';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(0, -25);
    ctx.lineTo(15, -45 + Math.sin(t * 12) * 8);
    ctx.stroke();
    // Spiked ball
    ctx.fillStyle = '#2c3e50';
    ctx.beginPath();
    ctx.arc(15, -45 + Math.sin(t * 12) * 8, 8, 0, Math.PI * 2);
    ctx.fill();
  } else if (weapon === 'longbow') {
    ctx.strokeStyle = '#8d6e63';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(0, -10, 32, -Math.PI / 2, Math.PI / 2);
    ctx.stroke();
  } else {
    // Broadsword
    ctx.fillStyle = '#bdc3c7';
    ctx.fillRect(-3, -55, 6, 55);
    // Gold hilt
    ctx.fillStyle = '#f1c40f';
    ctx.fillRect(-14, -12, 28, 6);
  }
  ctx.restore();

  ctx.restore();
}

function drawParty(ctx, w, h, players, t) {
  players.forEach((p, idx) => {
    const x = w * (0.15 + idx * 0.12);
    const y = h * (0.68 + (idx % 2) * 0.04);
    drawKnight(ctx, x, y, p, t, false);
  });
}

function drawDragonBoss(ctx, cx, cy, t, hp) {
  ctx.save();
  ctx.translate(cx, cy);

  const flap = Math.sin(t * 5) * 20;

  // Wings
  ctx.fillStyle = '#8b0000';
  ctx.beginPath();
  ctx.moveTo(0, -40);
  ctx.lineTo(80, -120 + flap);
  ctx.lineTo(30, -30);
  ctx.closePath();
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(-20, -40);
  ctx.lineTo(-100, -120 + flap);
  ctx.lineTo(-40, -30);
  ctx.closePath();
  ctx.fill();

  // Scaled Dragon Body
  ctx.fillStyle = '#c0392b';
  ctx.beginPath();
  ctx.ellipse(0, 0, 65, 45, 0, 0, Math.PI * 2);
  ctx.fill();

  // Horned Head
  ctx.fillStyle = '#96281b';
  ctx.beginPath();
  ctx.moveTo(-20, -20);
  ctx.lineTo(-65, -55);
  ctx.lineTo(-45, -15);
  ctx.closePath();
  ctx.fill();

  // Glowing Eye
  ctx.fillStyle = '#f1c40f';
  ctx.beginPath();
  ctx.arc(-42, -32, 6, 0, Math.PI * 2);
  ctx.fill();

  // Boss HP Bar
  ctx.restore();
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.fillRect(cx - 80, cy - 110, 160, 14);
  ctx.fillStyle = '#e74c3c';
  const pct = clamp(hp / 500, 0, 1);
  ctx.fillRect(cx - 78, cy - 108, 156 * pct, 10);
  ctx.fillStyle = '#fff';
  ctx.font = '900 11px system-ui';
  ctx.textAlign = 'center';
  ctx.fillText(`GOLIATH DRAGON: ${hp} HP`, cx, cy - 118);
}
