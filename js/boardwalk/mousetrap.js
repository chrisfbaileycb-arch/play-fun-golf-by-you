// Mode E: The Rube Goldberg Mouse Trap
import { el, clear } from '../core/util.js';
import { sfx } from '../core/audio.js';

export const STAGES = [
  { id: 1, name: 'Crank & Gears', desc: 'Fairway Drive', icon: '⚙️', sfx: 'crank' },
  { id: 2, name: 'Plastic Boot', desc: 'Solid Approach', icon: '🥾', sfx: 'bootKick' },
  { id: 3, name: 'Marble Stairs', desc: 'Sand Escape', icon: '⚪', sfx: 'marble' },
  { id: 4, name: 'Wash Tub Pole', desc: 'Putt on Target', icon: '🛁', sfx: 'tub' },
  { id: 5, name: 'Snap Cage', desc: 'Drained Cup', icon: '🪤', sfx: 'cage' },
];

export const mousetrap = {
  id: 'mousetrap',
  name: 'Mouse Trap Contraption',
  tagline: 'Build the 5-stage kinetic contraption to snap the cage on opponents!',
  icon: '🪤',
  description: 'Golf milestones trigger mechanical chain reactions: Crank & Gears → Plastic Boot → Marble Stairs → Wash Tub → SNAP CAGE over opponent pawns!',
  minPlayers: 1,
  maxPlayers: 4,
  needsRival: false,

  init(game) {
    const players = {};
    for (const p of game.players) {
      players[p.id] = { stage: 0, trapsTriggered: 0, score: 0 };
    }
    return { players };
  },

  onShot(game, ctx) {
    const events = [];
    const state = game.modeState;
    const ps = state.players[ctx.player.id];
    const prevStage = ps.stage;

    // Trigger stages sequentially or through milestones
    if (ps.stage === 0 && (ctx.shot.zone === 'fairway' || ctx.geo.par === 3)) {
      ps.stage = 1;
      events.push({ t: 'sfx', name: 'crank' });
      events.push({ t: 'banner', text: 'CRANK & GEARS!', sub: 'Part 1 Assembled: Gears Spinning!', color: '#ff4fd8' });
    } else if (ps.stage === 1 && (['green', 'inner', 'bullseye'].includes(ctx.shot.zone) || ctx.shot.carry > 80)) {
      ps.stage = 2;
      events.push({ t: 'sfx', name: 'bootKick' });
      events.push({ t: 'banner', text: 'PLASTIC BOOT!', sub: 'Part 2 Assembled: Ready to Kick!', color: '#ffd84a' });
    } else if (ps.stage === 2 && (ctx.shot.zone === 'sand' || ['green', 'inner'].includes(ctx.shot.zone))) {
      ps.stage = 3;
      events.push({ t: 'sfx', name: 'marble' });
      events.push({ t: 'banner', text: 'MARBLE STAIRS!', sub: 'Part 3 Assembled: Marble Rattling!', color: '#33d6ff' });
    } else if (ps.stage === 3 && (ctx.shot.type === 'putt' || ctx.shot.distToPin < 10)) {
      ps.stage = 4;
      events.push({ t: 'sfx', name: 'tub' });
      events.push({ t: 'banner', text: 'WASH TUB POLE!', sub: 'Part 4 Assembled: Tub Tipping!', color: '#2ecc71' });
    } else if (ps.stage === 4 && ctx.shot.holed) {
      ps.stage = 5;
      ps.trapsTriggered++;
      ps.score += 200;
      events.push({ t: 'sfx', name: 'cage' });
      events.push({ t: 'sfx', name: 'squeak' });
      events.push({ t: 'banner', text: 'CAGE DROPPED!', sub: 'THE TRAP SNAPPED SHUT!', color: '#ff3b30' });
      events.push({ t: 'shake', mag: 18 });
    }

    if (ps.stage > prevStage) {
      ps.score += 50;
    }

    return events;
  },

  onHoleComplete(game, ctx) {
    const events = [];
    // Reset contraption per hole or let it persist
    for (const p of game.players) {
      const ps = game.modeState.players[p.id];
      if (ps.stage >= 5) {
        ps.stage = 0; // ready to rebuild
      }
    }
    return events;
  },

  shotScene(game, ctx) {
    const ps = game.modeState.players[ctx.player.id];
    if (!ps || ps.stage === 0) return null;
    return createContraptionScene(ps.stage, ctx.player);
  },

  hud(game) {
    return game.players.map((p) => {
      const ps = game.modeState.players?.[p.id] || { stage: 0, score: 0 };
      const curStage = STAGES[ps.stage - 1]?.name || 'Not Started';
      return {
        pid: p.id,
        value: `${ps.score} pts`,
        label: `Stage ${ps.stage}/5: ${curStage}`,
        badge: ps.trapsTriggered > 0 ? `🪤×${ps.trapsTriggered}` : null,
        bar: { value: ps.stage, max: 5, color: p.color },
      };
    });
  },

  standings(game) {
    const rows = game.players.map((p) => {
      const score = game.modeState.players?.[p.id]?.score ?? 0;
      const traps = game.modeState.players?.[p.id]?.trapsTriggered ?? 0;
      return { pid: p.id, score, display: `${score} pts (${traps} Traps Snapped)` };
    });
    rows.sort((a, b) => b.score - a.score);
    return rows;
  },

  panel(container, game) {
    clear(container);
    const wrap = el('div', { class: 'kg-panel' });
    for (const p of game.players) {
      const ps = game.modeState.players?.[p.id] || { stage: 0 };
      wrap.appendChild(el('div', { class: 'kg-panel-cell', style: { borderLeft: `4px solid ${p.color}`, paddingLeft: '8px' } },
        el('span', { class: 'kg-panel-label' }, p.name),
        el('span', { class: 'kg-panel-val' }, `Contraption: ${ps.stage} / 5 Parts`),
        el('div', { style: { display: 'flex', gap: '4px', marginTop: '4px' } },
          ...STAGES.map((s, idx) => el('span', {
            style: {
              fontSize: '14px',
              opacity: idx < ps.stage ? 1 : 0.25,
            },
          }, s.icon)))));
    }
    container.appendChild(wrap);
  },
};

function createContraptionScene(stage, player) {
  return {
    title: 'Kinetic Contraption Activated!',
    caption: `Stage ${stage}: ${STAGES[stage - 1]?.name}`,
    holdMs: 800,
    done: false,

    init(api) {
      setTimeout(() => { this.done = true; }, 1400);
      if (stage === 5) {
        api.fx.sparks(api.w / 2, api.h / 2, { n: 40, color: ['#ff4fd8', '#ffd84a', '#33d6ff'], speed: 280 });
        api.fx.shake(16, 0.4);
      }
    },

    update(dt, api) {},

    draw(ctx, w, h, api) {
      const t = api.t;
      ctx.fillStyle = '#1c2630';
      ctx.fillRect(0, 0, w, h);

      // Cardboard surface board
      ctx.fillStyle = '#f3e3c3';
      ctx.fillRect(40, 40, w - 80, h - 80);
      ctx.strokeStyle = '#2a1d10';
      ctx.lineWidth = 4;
      ctx.strokeRect(40, 40, w - 80, h - 80);

      // Draw active kinetic contraption part
      ctx.save();
      ctx.translate(w / 2, h / 2);

      if (stage === 1) {
        // Spinning Gears
        ctx.rotate(t * 4);
        drawGear(ctx, 0, 0, 48, '#ff4fd8');
      } else if (stage === 2) {
        // Swinging Boot
        const swing = Math.sin(t * 8) * 0.6;
        ctx.rotate(swing);
        ctx.fillStyle = '#ffd84a';
        ctx.fillRect(-10, -50, 20, 50);
        ctx.fillRect(-10, 0, 45, 25);
      } else if (stage === 3) {
        // Marble on zigzag stairs
        ctx.fillStyle = '#33d6ff';
        for (let s = -3; s <= 3; s++) {
          ctx.fillRect(s * 20, s * 16, 22, 10);
        }
        const mx = Math.sin(t * 6) * 40;
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.arc(mx, mx * 0.8, 12, 0, Math.PI * 2);
        ctx.fill();
      } else if (stage === 4) {
        // Tipping Wash Tub
        const tip = Math.sin(t * 6) * 0.4;
        ctx.rotate(tip);
        ctx.fillStyle = '#2ecc71';
        ctx.beginPath();
        ctx.arc(0, 0, 40, 0, Math.PI);
        ctx.fill();
      } else {
        // Snap Cage
        const drop = Math.min(60, t * 180);
        ctx.strokeStyle = '#ff3b30';
        ctx.lineWidth = 4;
        ctx.strokeRect(-50, -80 + drop, 100, 70);
        for (let bar = -40; bar <= 40; bar += 16) {
          ctx.beginPath();
          ctx.moveTo(bar, -80 + drop);
          ctx.lineTo(bar, -10 + drop);
          ctx.stroke();
        }
      }
      ctx.restore();
    },
  };
}

function drawGear(ctx, x, y, r, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  for (let a = 0; a < Math.PI * 2; a += Math.PI / 6) {
    ctx.fillRect(x + Math.cos(a) * r - 6, y + Math.sin(a) * r - 6, 12, 12);
  }
  ctx.fillStyle = '#1c2630';
  ctx.beginPath();
  ctx.arc(x, y, r * 0.4, 0, Math.PI * 2);
  ctx.fill();
}

export default mousetrap;
