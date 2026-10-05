// Mode D: Chutes & Ladders
import { el, clear, clamp } from '../core/util.js';
import { sfx } from '../core/audio.js';

export const chutes = {
  id: 'chutes',
  name: 'Chutes & Ladders',
  tagline: '100-tile fairway climb with towering ladders and greasy chutes',
  icon: '🪜',
  description: 'Fairway strikes activate towering ladders skipping 20-30 tiles ahead! Sand traps, slices out of bounds, and 3-putts trigger greasy chutes dropping pawns back.',
  minPlayers: 1,
  maxPlayers: 4,
  needsRival: false,

  init(game) {
    const players = {};
    for (const p of game.players) {
      players[p.id] = { tile: 1, ladders: 0, chutes: 0, wins: 0 };
    }
    return { players };
  },

  onShot(game, ctx) {
    const events = [];
    const state = game.modeState;
    const pState = state.players[ctx.player.id];

    // Distance-based tile movement: ~1 tile per 15-20 yards or zone based
    const carry = ctx.shot.carry || 50;
    const baseAdvance = Math.max(3, Math.round(carry / 18));
    let nextTile = pState.tile + baseAdvance;

    events.push({ t: 'sfx', name: 'hop' });

    // Ladder check: sweet-spot fairway or green landings
    if (['bullseye', 'inner', 'cup'].includes(ctx.shot.zone) || (ctx.shot.zone === 'fairway' && carry > 180)) {
      const climb = Math.floor(Math.random() * 11) + 20; // 20-30 tiles
      nextTile += climb;
      pState.ladders++;
      events.push({ t: 'sfx', name: 'ladder' });
      events.push({ t: 'banner', text: 'LADDER CLIMBED!', sub: `Towering ascent! +${climb} Tiles!`, color: '#34c759' });
    }
    // Chute check: sand, water, ob
    else if (['sand', 'water', 'ob'].includes(ctx.shot.zone)) {
      const drop = Math.floor(Math.random() * 11) + 15; // 15-25 tiles
      nextTile = Math.max(1, nextTile - drop);
      pState.chutes++;
      events.push({ t: 'sfx', name: 'chute' });
      events.push({ t: 'banner', text: 'GREASY CHUTE!', sub: `Hazard drop! -${drop} Tiles!`, color: '#ff3b30' });
      events.push({ t: 'shake', mag: 12 });
    }

    if (ctx.shot.holed) {
      nextTile = 100;
    }

    pState.tile = clamp(nextTile, 1, 100);

    if (pState.tile >= 100) {
      pState.wins++;
      events.push({ t: 'sfx', name: 'fanfare' });
      events.push({ t: 'banner', text: 'TILE 100 REACHED!', sub: `${ctx.player.name} won the board!`, color: '#ffd84a' });
    }

    return events;
  },

  onHoleComplete(game, ctx) {
    return [];
  },

  hud(game) {
    return game.players.map((p) => {
      const ps = game.modeState.players?.[p.id] || { tile: 1, ladders: 0, chutes: 0 };
      return {
        pid: p.id,
        value: `Tile ${ps.tile}/100`,
        label: ps.tile >= 100 ? 'VICTOR!' : 'Board Progress',
        badge: ps.ladders > 0 ? `🪜×${ps.ladders}` : null,
        bar: { value: ps.tile, max: 100, color: p.color },
      };
    });
  },

  standings(game) {
    const rows = game.players.map((p) => {
      const tile = game.modeState.players?.[p.id]?.tile ?? 1;
      const ladders = game.modeState.players?.[p.id]?.ladders ?? 0;
      return { pid: p.id, score: tile, display: `Tile ${tile} (${ladders} Ladders)` };
    });
    rows.sort((a, b) => b.score - a.score);
    return rows;
  },

  isOver(game) {
    return game.players.some((p) => (game.modeState.players?.[p.id]?.tile ?? 1) >= 100);
  },

  panel(container, game) {
    clear(container);
    const wrap = el('div', { class: 'kg-panel' });
    for (const p of game.players) {
      const ps = game.modeState.players?.[p.id] || { tile: 1, ladders: 0, chutes: 0 };
      wrap.appendChild(el('div', { class: 'kg-panel-cell', style: { borderLeft: `4px solid ${p.color}`, paddingLeft: '8px' } },
        el('span', { class: 'kg-panel-label' }, `${p.name} · 🪜 ${ps.ladders} | 🛝 ${ps.chutes}`),
        el('span', { class: 'kg-panel-val' }, `Tile ${ps.tile} / 100`),
        el('div', { style: { height: '8px', background: 'rgba(255,255,255,0.1)', borderRadius: '4px', marginTop: '4px', overflow: 'hidden' } },
          el('div', { style: { height: '100%', width: `${ps.tile}%`, background: p.color } }))));
    }
    container.appendChild(wrap);
  },
};

export default chutes;
