// Mode C: Fairway Sorry!
import { dist, clamp, el, clear } from '../core/util.js';
import { projectToPath, pointAtS } from '../core/fairway.js';
import { sfx } from '../core/audio.js';

export const sorry = {
  id: 'sorry',
  name: 'Fairway Sorry!',
  tagline: 'Pawn race down the fairway with slide zones and brutal bump-backs',
  icon: '💥',
  description: 'Pawns race toward the Home Cup! Landing within 15 yards of an opponent triggers a vicious SORRY! bumping their pawn all the way back to the tee box! Slide zones accelerate long drives.',
  minPlayers: 2,
  maxPlayers: 4,
  needsRival: true,

  init(game) {
    const pawns = {};
    for (const p of game.players) {
      pawns[p.id] = { pos: 0, home: false, bumps: 0, bumped: 0, score: 0 };
    }
    return { pawns, lastEvents: [] };
  },

  onShot(game, ctx) {
    const events = [];
    const state = game.modeState;
    const pId = ctx.player.id;
    const pState = state.pawns[pId];

    // Compute progress along fairway
    const pr = projectToPath(ctx.geo.path, ctx.shot.to);
    const prevYards = pState.pos;
    let newYards = pr.s;

    // Slide Zones: if landing in a landing zone, accelerate 40 yards forward!
    let slideBonus = 0;
    if (ctx.geo.landingZones) {
      for (const lz of ctx.geo.landingZones) {
        if (dist(ctx.shot.to, lz) <= lz.r) {
          slideBonus = 35;
          events.push({ t: 'sfx', name: 'slide' });
          events.push({ t: 'banner', text: 'SLIDE ZONE!', sub: '+35 Yards Slide Acceleration!', color: '#33d6ff' });
          break;
        }
      }
    }

    newYards = Math.min(ctx.geo.yards, newYards + slideBonus);
    pState.pos = newYards;

    // Check if holed
    if (ctx.shot.holed || newYards >= ctx.geo.yards - 2) {
      pState.home = true;
      pState.score += 100;
      events.push({ t: 'sfx', name: 'fanfare' });
      events.push({ t: 'banner', text: 'HOME CUP!', sub: `${ctx.player.name} safely reached Home!`, color: '#ffd84a' });
    }

    // Check proximity to other players for SORRY! bump
    for (const opp of game.players) {
      if (opp.id === pId) continue;
      const oppState = state.pawns[opp.id];
      if (oppState.home) continue;

      const oppDist = Math.abs(oppState.pos - newYards);
      if (oppDist <= 15) {
        // BUMP BACK!
        oppState.pos = 0; // Send back to Tee
        oppState.bumped++;
        pState.bumps++;
        pState.score += 50;

        events.push({ t: 'sfx', name: 'bump' });
        events.push({ t: 'sfx', name: 'sorry' });
        events.push({ t: 'banner', text: 'SORRY!', sub: `${ctx.player.name} bumped ${opp.name} back to the TEE!`, color: '#ff3b30' });
        events.push({ t: 'shake', mag: 15 });
        break;
      }
    }

    return events;
  },

  onHoleComplete(game, ctx) {
    const events = [];
    const state = game.modeState;
    // Award hole finish points based on closeness to Home
    for (const p of game.players) {
      const ps = state.pawns[p.id];
      if (ps.home) {
        ps.score += 50;
      } else {
        ps.score += Math.round((ps.pos / ctx.geo.yards) * 40);
      }
      // Reset position for next hole
      ps.pos = 0;
      ps.home = false;
    }
    return events;
  },

  hud(game) {
    const geo = game.holes[game.holeIdx] ? projectToPath : null;
    return game.players.map((p) => {
      const ps = game.modeState.pawns?.[p.id] || { pos: 0, score: 0, bumps: 0 };
      return {
        pid: p.id,
        value: `${ps.score} pts`,
        label: ps.home ? 'HOME!' : `${Math.round(ps.pos)} yds`,
        badge: ps.bumps > 0 ? `💥 ${ps.bumps}` : null,
      };
    });
  },

  standings(game) {
    const rows = game.players.map((p) => {
      const score = game.modeState.pawns?.[p.id]?.score ?? 0;
      const bumps = game.modeState.pawns?.[p.id]?.bumps ?? 0;
      return { pid: p.id, score, display: `${score} pts (${bumps} Bumps)` };
    });
    rows.sort((a, b) => b.score - a.score);
    return rows;
  },

  panel(container, game) {
    clear(container);
    const wrap = el('div', { class: 'kg-panel' });
    const holeYards = game.course.holes[game.holeIdx]?.yards || 350;
    for (const p of game.players) {
      const ps = game.modeState.pawns?.[p.id] || { pos: 0, bumps: 0 };
      const pct = Math.round((ps.pos / holeYards) * 100);
      wrap.appendChild(el('div', { class: 'kg-panel-cell', style: { borderLeft: `4px solid ${p.color}`, paddingLeft: '8px' } },
        el('span', { class: 'kg-panel-label' }, `${p.name} · ${ps.bumps} Bumps`),
        el('span', { class: 'kg-panel-val' }, `${Math.round(ps.pos)} / ${holeYards} yds (${pct}%)`),
        el('div', { style: { height: '6px', background: 'rgba(255,255,255,0.1)', borderRadius: '3px', marginTop: '4px', overflow: 'hidden' } },
          el('div', { style: { height: '100%', width: `${pct}%`, background: p.color } }))));
    }
    container.appendChild(wrap);
  },
};

export default sorry;
