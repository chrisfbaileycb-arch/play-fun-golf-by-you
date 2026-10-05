// 3 Game Modes for Knight Golf: Castle Conquest, Dueling Knighthood, and Raid Boss.
import { scoreShot } from './scoring.js';
import { resolveDuel, resolveRaidBoss } from './combat.js';
import { createArenaScene } from './arena.js';
import { el, clear } from '../core/util.js';

/** Mode 1: Castle Conquest (Arcade target points & zone battle) */
export const castleConquest = {
  id: 'castle',
  name: 'Castle Conquest',
  tagline: 'Arcade Target Play zone battle with knight duels',
  icon: '🏰',
  description: 'Target zones yield positive points, multipliers, and attack power. After every hole, the best accuracy triggers a Critical Strike in the duel arena!',
  minPlayers: 1,
  maxPlayers: 4,
  needsRival: false,

  init(game) {
    const players = {};
    for (const p of game.players) {
      players[p.id] = { points: 0, combo: 1.0, xp: 0, hp: 100, crackedArmor: false, staminaDepleted: false };
    }
    return { players, lastBeats: [] };
  },

  onShot(game, ctx) {
    const pState = game.modeState.players[ctx.player.id];
    const { events } = scoreShot(ctx.shot, ctx.geo, pState);
    return events;
  },

  onHoleComplete(game, ctx) {
    const { beats, events } = resolveDuel(game, ctx.results, 'castle');
    game.modeState.lastBeats = beats;
    return events;
  },

  scene(game, ctx) {
    const beats = game.modeState.lastBeats || [];
    return beats.length ? createArenaScene(game, beats, false) : null;
  },

  hud(game) {
    return game.players.map((p) => {
      const ps = game.modeState.players?.[p.id] || { points: 0, combo: 1.0, hp: 100 };
      return {
        pid: p.id,
        value: `${ps.points} pts`,
        label: 'Arcade Points',
        badge: ps.combo > 1.0 ? `×${ps.combo.toFixed(1)}` : null,
        bar: { value: ps.hp, max: 100, color: p.color },
      };
    });
  },

  standings(game) {
    const rows = game.players.map((p) => {
      const pts = game.modeState.players?.[p.id]?.points ?? 0;
      return { pid: p.id, score: pts, display: `${pts} pts` };
    });
    rows.sort((a, b) => b.score - a.score);
    return rows;
  },

  panel(container, game) {
    clear(container);
    const wrap = el('div', { class: 'kg-panel' });
    for (const p of game.players) {
      const ps = game.modeState.players?.[p.id] || { combo: 1.0, points: 0 };
      wrap.appendChild(el('div', { class: 'kg-panel-cell', style: { borderLeft: `4px solid ${p.color}`, paddingLeft: '8px' } },
        el('span', { class: 'kg-panel-label' }, p.name),
        el('span', { class: 'kg-panel-val' }, `${ps.points} pts (×${ps.combo.toFixed(1)})`)));
    }
    container.appendChild(wrap);
  },
};

/** Mode 2: Dueling Knighthood (Stroke differential converted into direct HP damage) */
export const duelingKnighthood = {
  id: 'duel',
  name: 'Dueling Knighthood',
  tagline: 'Stroke differential converts to direct HP damage',
  icon: '⚔️',
  description: 'Stroke differential delivers crushing blows to opponent knight health! Last knight standing or most HP wins the round.',
  minPlayers: 2,
  maxPlayers: 4,
  needsRival: true,

  init(game) {
    const players = {};
    for (const p of game.players) {
      players[p.id] = { hp: 100, points: 0, combo: 1.0, unhorsed: false };
    }
    return { players, lastBeats: [] };
  },

  onShot(game, ctx) {
    const pState = game.modeState.players[ctx.player.id];
    const { events } = scoreShot(ctx.shot, ctx.geo, pState);
    return events;
  },

  onHoleComplete(game, ctx) {
    const { beats, events } = resolveDuel(game, ctx.results, 'duel');
    game.modeState.lastBeats = beats;
    return events;
  },

  scene(game, ctx) {
    const beats = game.modeState.lastBeats || [];
    return beats.length ? createArenaScene(game, beats, false) : null;
  },

  hud(game) {
    return game.players.map((p) => {
      const ps = game.modeState.players?.[p.id] || { hp: 100, combo: 1.0 };
      return {
        pid: p.id,
        value: `${ps.hp} HP`,
        label: ps.hp <= 0 ? 'Unhorsed' : 'Knight Health',
        badge: ps.hp <= 0 ? '💀 DOWN' : ps.combo > 1 ? `×${ps.combo.toFixed(1)}` : null,
        bar: { value: ps.hp, max: 100, color: ps.hp <= 25 ? '#e74c3c' : p.color },
      };
    });
  },

  standings(game) {
    const rows = game.players.map((p) => {
      const hp = game.modeState.players?.[p.id]?.hp ?? 0;
      return { pid: p.id, score: hp, display: hp <= 0 ? 'Unhorsed (0 HP)' : `${hp} HP Remaining` };
    });
    rows.sort((a, b) => b.score - a.score);
    return rows;
  },

  isOver(game) {
    const alive = game.players.filter((p) => (game.modeState.players?.[p.id]?.hp ?? 100) > 0);
    return alive.length <= 1 && game.holeIdx > 0;
  },

  panel(container, game) {
    clear(container);
    const wrap = el('div', { class: 'kg-panel' });
    for (const p of game.players) {
      const ps = game.modeState.players?.[p.id] || { hp: 100 };
      wrap.appendChild(el('div', { class: 'kg-panel-cell', style: { borderLeft: `4px solid ${p.color}`, paddingLeft: '8px' } },
        el('span', { class: 'kg-panel-label' }, p.name),
        el('span', { class: 'kg-panel-val', style: { color: ps.hp <= 25 ? '#e74c3c' : 'inherit' } }, `${ps.hp} / 100 HP`)));
    }
    container.appendChild(wrap);
  },
};

/** Mode 3: Raid Boss (Co-op vs escalating Dragon) */
export const raidBoss = {
  id: 'raid',
  name: 'Raid Boss: Goliath Dragon',
  tagline: 'Co-op foursome battle against an escalating HP dragon',
  icon: '🐉',
  description: 'Unite your foursome! Every fairway hit and target ring drives massive damage into the dragon boss. Watch out for fire breath on bad holes!',
  minPlayers: 1,
  maxPlayers: 4,
  needsRival: false,

  init(game) {
    const bossMaxHp = Math.max(300, game.players.length * 150 + game.course.holes.length * 40);
    const players = {};
    for (const p of game.players) {
      players[p.id] = { points: 0, combo: 1.0, hp: 100 };
    }
    return {
      bossName: 'Goliath Dragon',
      bossHp: bossMaxHp,
      bossMaxHp,
      players,
      lastBeats: [],
    };
  },

  onShot(game, ctx) {
    const pState = game.modeState.players[ctx.player.id];
    const { events } = scoreShot(ctx.shot, ctx.geo, pState);
    return events;
  },

  onHoleComplete(game, ctx) {
    const { beats, events } = resolveRaidBoss(game, ctx.results);
    game.modeState.lastBeats = beats;
    return events;
  },

  scene(game, ctx) {
    const beats = game.modeState.lastBeats || [];
    return beats.length ? createArenaScene(game, beats, true) : null;
  },

  hud(game) {
    const bHp = game.modeState.bossHp ?? 0;
    const bMax = game.modeState.bossMaxHp ?? 500;
    const list = game.players.map((p) => {
      const ps = game.modeState.players?.[p.id] || { points: 0, hp: 100 };
      return {
        pid: p.id,
        value: `${ps.points} pts`,
        label: 'Damage Power',
        bar: { value: ps.hp, max: 100, color: p.color },
      };
    });
    // Add boss status to the leader
    if (list[0]) {
      list[0].badge = `🐉 ${bHp}/${bMax} HP`;
    }
    return list;
  },

  standings(game) {
    const bHp = game.modeState.bossHp ?? 0;
    const slain = bHp <= 0;
    const rows = game.players.map((p) => {
      const pts = game.modeState.players?.[p.id]?.points ?? 0;
      return { pid: p.id, score: pts, display: slain ? `Victor (${pts} pts)` : `Fought (${pts} pts)` };
    });
    rows.sort((a, b) => b.score - a.score);
    return rows;
  },

  isOver(game) {
    return (game.modeState.bossHp ?? 500) <= 0;
  },

  panel(container, game) {
    clear(container);
    const bHp = game.modeState.bossHp ?? 0;
    const bMax = game.modeState.bossMaxHp ?? 500;
    const wrap = el('div', { class: 'kg-panel' },
      el('div', { class: 'kg-panel-cell', style: { gridColumn: '1 / -1' } },
        el('span', { class: 'kg-panel-label' }, `🐉 BOSS: ${game.modeState.bossName}`),
        el('span', { class: 'kg-panel-val', style: { color: '#e74c3c' } }, `${bHp} / ${bMax} HP`),
        el('div', { style: { height: '8px', background: 'rgba(255,255,255,0.1)', borderRadius: '4px', overflow: 'hidden', marginTop: '4px' } },
          el('div', { style: { height: '100%', width: `${Math.max(0, Math.min(100, (bHp / bMax) * 100))}%`, background: '#e74c3c', transition: 'width 0.4s' } }))));
    container.appendChild(wrap);
  },
};
