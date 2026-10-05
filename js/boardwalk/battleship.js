// Fairway Fleet — every golf shot is an artillery strike on a 10×10 grid stretched over the hole.
// Logic (init/onShot/onHoleComplete/hud/standings/isOver + grid maths) is pure & DOM-free.
import { clamp, mulberry32, hashStr, el, clear, rrect, ease, seg, prefersReducedMotion } from '../core/util.js';
import { synthesize } from '../core/fairway.js';
import { strokesFor } from '../core/shots.js';
import { sfx } from '../core/audio.js';
import { zoneKind, nameOf, colorOf, tokenOf, tokenSVG, drawLabel, drawToken, alpha, FONT_DISPLAY, PAL, whenSized } from './board.js';
import { fitCanvas } from '../core/util.js';

export const GRID = 10;
export const COLS = 'ABCDEFGHIJ';
export const FLEET = [
  { id: 'carrier', name: 'Carrier', len: 5 },
  { id: 'flagship', name: 'Flagship', len: 4 },
  { id: 'frigate', name: 'Frigate', len: 3 },
  { id: 'scout', name: 'Scout', len: 2 },
];
export const HULL = FLEET.reduce((s, f) => s + f.len, 0);

export const cellLabel = (idx) => `${COLS[idx % GRID]}${Math.floor(idx / GRID) + 1}`;
export const idxOf = (c, r) => r * GRID + c;

/** Cells for a ship anchored at `start` (bow), or null if it would leave the grid. */
export function shipCells(start, len, horizontal) {
  const c0 = start % GRID, r0 = Math.floor(start / GRID);
  if (horizontal ? c0 + len > GRID : r0 + len > GRID) return null;
  const out = [];
  for (let i = 0; i < len; i++) out.push(horizontal ? idxOf(c0 + i, r0) : idxOf(c0, r0 + i));
  return out;
}

/** Clamp an anchor so a ship of `len` fits on the grid from that tap. */
export function fitAnchor(idx, len, horizontal) {
  const c = idx % GRID, r = Math.floor(idx / GRID);
  return horizontal ? idxOf(Math.min(c, GRID - len), r) : idxOf(c, Math.min(r, GRID - len));
}

export function validFleet(ships) {
  if (!Array.isArray(ships) || ships.length !== FLEET.length) return false;
  const seen = new Set();
  for (const f of FLEET) {
    const s = ships.find((x) => x.id === f.id || (f.id === 'flagship' && x.id === 'battleship') || (f.id === 'frigate' && x.id === 'destroyer') || (f.id === 'scout' && x.id === 'patrol'));
    if (!s || !Array.isArray(s.cells) || s.cells.length !== f.len) return false;
    for (const c of s.cells) {
      if (!Number.isInteger(c) || c < 0 || c >= GRID * GRID || seen.has(c)) return false;
      seen.add(c);
    }
    const cs = s.cells.slice().sort((a, b) => a - b);
    const horiz = cs.every((c) => Math.floor(c / GRID) === Math.floor(cs[0] / GRID));
    for (let i = 1; i < cs.length; i++) if (cs[i] - cs[i - 1] !== (horiz ? 1 : GRID)) return false;
  }
  return true;
}

/** Random legal fleet from a seeded rng. */
export function autoPlace(rng) {
  for (let attempt = 0; attempt < 200; attempt++) {
    const used = new Set();
    const ships = [];
    let ok = true;
    for (const f of FLEET) {
      let placed = false;
      for (let t = 0; t < 200 && !placed; t++) {
        const horiz = rng() < 0.5;
        const cells = shipCells(Math.floor(rng() * GRID * GRID), f.len, horiz);
        if (cells && cells.every((c) => !used.has(c))) {
          cells.forEach((c) => used.add(c));
          ships.push({ id: f.id, name: f.name, len: f.len, cells });
          placed = true;
        }
      }
      if (!placed) { ok = false; break; }
    }
    if (ok) return ships;
  }
  throw new Error('autoPlace failed');
}

/** Grid rectangle in hole space: the hole's bounds, row 1 at the green end (top of the radar). */
export function gridRect(geo) {
  const b = geo.bounds;
  return { minX: b.minX, maxX: b.maxX, minY: b.minY, maxY: b.maxY, cw: (b.maxX - b.minX) / GRID, ch: (b.maxY - b.minY) / GRID };
}

export function cellForPoint(geo, p) {
  const g = gridRect(geo);
  const c = clamp(Math.floor((p.x - g.minX) / g.cw), 0, GRID - 1);
  const r = clamp(Math.floor((g.maxY - p.y) / g.ch), 0, GRID - 1);
  return idxOf(c, r);
}

export function cellCenter(geo, idx) {
  const g = gridRect(geo);
  const c = idx % GRID, r = Math.floor(idx / GRID);
  return { x: g.minX + (c + 0.5) * g.cw, y: g.maxY - (r + 0.5) * g.ch };
}

function neighbours(idx, pattern) {
  const c = idx % GRID, r = Math.floor(idx / GRID);
  const offs = pattern === 'broadside' ? [[0, 0], [-1, 0], [1, 0]]
    : pattern === 'plus' ? [[0, 0], [-1, 0], [1, 0], [0, -1], [0, 1]]
    : pattern === 'bracket' ? [[0, 0], [-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, -1], [-1, 1], [1, 1]]
    : [[0, 0]];
  const out = [];
  for (const [dc, dr] of offs) {
    const cc = c + dc, rr = r + dr;
    if (cc >= 0 && cc < GRID && rr >= 0 && rr < GRID) out.push(idxOf(cc, rr));
  }
  return out;
}

/** Strike pattern for a shot (documented in the rules text). */
export function strikePlan(shot) {
  const k = zoneKind(shot);
  if (shot.type === 'putt' && !shot.holed) return { kind: 'none' };
  if (k === 'cup') return shot.type === 'putt' ? { kind: 'none' } : { kind: 'bracket', label: 'Chip-in barrage' };
  if (shot.zone === 'bullseye' || shot.zone === 'inner') return { kind: 'bracket', label: 'Bracket salvo' };
  if (k === 'green') return { kind: 'plus', label: 'Green-circle salvo' };
  if (k === 'fairway') return { kind: 'broadside', label: 'Broadside' };
  if (k === 'rough') return { kind: 'single', label: 'Single shell' };
  if (k === 'sand') return { kind: 'dud', label: 'Dud in the sand' };
  if (k === 'water' || k === 'ob') return { kind: 'friendly', label: k === 'water' ? 'Torpedo misfire' : 'Stray shell' };
  return { kind: 'none' };
}

const emptyMarks = () => '.'.repeat(GRID * GRID);
const setMark = (marks, i, ch) => marks.slice(0, i) + ch + marks.slice(i + 1);

export function shipAt(board, idx) {
  return board.ships.find((s) => s.cells.includes(idx)) || null;
}
export const isSunk = (board, ship) => ship.cells.every((c) => board.marks[c] === 'x');
export const shipsAfloat = (board) => board.ships.filter((s) => !isSunk(board, s)).length;
export const hullLeft = (board) => board.ships.reduce((n, s) => n + s.cells.filter((c) => board.marks[c] !== 'x').length, 0);

function makeBoard(ships) {
  return { ships: ships.map((s) => ({ id: s.id, name: s.name, len: s.len, cells: s.cells.slice() })), marks: emptyMarks(), pinged: [], deployed: false };
}

/** Replace a player's fleet (setup step). Throws on illegal fleets. */
export function deployFleet(game, pid, ships) {
  if (!validFleet(ships)) throw new Error('Illegal fleet');
  const b = makeBoard(ships);
  b.deployed = true;
  game.modeState.boards[pid] = b;
}

/** Apply strikes on a defender board. Returns {hits:[idx], misses:[idx], sunk:[ship]} (new marks only). */
export function strikeBoard(board, cells) {
  const res = { hits: [], misses: [], sunk: [] };
  for (const c of cells) {
    if (board.marks[c] !== '.') continue;
    const ship = shipAt(board, c);
    const wasSunk = ship ? isSunk(board, ship) : false;
    board.marks = setMark(board.marks, c, ship ? 'x' : 'o');
    if (ship) {
      res.hits.push(c);
      if (!wasSunk && isSunk(board, ship)) res.sunk.push(ship);
    } else res.misses.push(c);
  }
  return res;
}

function pickHiddenCell(board, seedStr) {
  const cand = [];
  for (const s of board.ships) for (const c of s.cells) if (board.marks[c] === '.') cand.push(c);
  if (!cand.length) return null;
  cand.sort((a, b) => a - b);
  return cand[hashStr(seedStr) % cand.length];
}

const alive = (game, pid) => shipsAfloat(game.modeState.boards[pid]) > 0;

function emptyStats() { return { hits: 0, sunk: 0, salvos: 0, friendly: 0, pings: 0, missiles: 0 }; }

function recordStrike(game, entry) {
  const ms = game.modeState;
  ms.strikes.push(entry);
  if (ms.strikes.length > 400) ms.strikes.splice(0, ms.strikes.length - 400);
}

const battleship = {
  id: 'battleship',
  name: 'Fairway Fleet',
  tagline: 'Naval artillery grid on the fairway: sink the rival fleet!',
  icon: '⚓',
  description:
    'Before hole 1 each admiral secretly deploys a Carrier (5), Flagship (4), Frigate (3) and Scout (2) on a 10×10 grid ' +
    '(columns A–J left→right, rows 1–10 green→tee) that is stretched over every hole. Each non-putt shot fires where it lands, against every ' +
    'opponent\'s fleet at once: Rough = 1 shell · Fairway = broadside (3 across) · Green circle = plus salvo (5) · Inner ring/bullseye or chip-in = 3×3 bracket. ' +
    'Sand = dud. Water/OB = misfire on YOUR OWN fleet at that cell. Holing out under par fires a guided missile at each rival (guaranteed hit); ' +
    'holing at par sends a sonar ping that reveals a hidden enemy hull cell. Last fleet afloat wins early; otherwise most ships sunk, then hits.',
  minPlayers: 2,
  maxPlayers: 4,
  needsRival: true,

  init(game) {
    const boards = {};
    const stats = {};
    for (const p of game.players) {
      boards[p.id] = makeBoard(autoPlace(mulberry32(hashStr(`${game.id}:fleet:${p.id}`))));
      if (p.cpu) boards[p.id].deployed = true;
      stats[p.id] = emptyStats();
    }
    return { boards, stats, strikes: [], eliminated: [], last: null };
  },

  setup(container, game, done) {
    renderSetup(container, game, done);
  },

  onShot(game, ctx) {
    const ms = game.modeState;
    const { player, shot, geo, holeIdx } = ctx;
    const ev = [];
    const pid = player.id;
    if (!alive(game, pid)) {
      ev.push({ t: 'toast', text: `${player.name}'s fleet is sunk — firing for the scorecard only.` });
      return ev;
    }
    const st = ms.stats[pid];
    const plan = strikePlan(shot);
    const foes = game.players.filter((p) => p.id !== pid && alive(game, p.id));
    const center = cellForPoint(geo, shot.to);

    const fire = (cells, label) => {
      st.salvos++;
      let hits = 0;
      const sunk = [];
      const hitCells = new Set();
      for (const f of foes) {
        const r = strikeBoard(ms.boards[f.id], cells);
        hits += r.hits.length;
        r.hits.forEach((c) => hitCells.add(c));
        for (const s of r.sunk) sunk.push({ pid: f.id, ship: s.name });
      }
      st.hits += hits;
      st.sunk += sunk.length;
      recordStrike(game, { hole: holeIdx, by: pid, cells, hits: [...hitCells], kind: label, friendly: false });
      ms.last = { by: pid, cells, hits: [...hitCells], hole: holeIdx, label };
      const where = cells.length > 1 ? `${cellLabel(cells[0])} +${cells.length - 1}` : cellLabel(cells[0]);
      ev.push({ t: 'sfx', name: 'sonar' });
      if (sunk.length) {
        ev.push({ t: 'sfx', name: 'sunk' }, { t: 'sfx', name: 'siren' }, { t: 'shake', mag: 16 }, { t: 'haptic', pattern: [60, 40, 120] });
        for (const s of sunk) ev.push({ t: 'banner', text: 'SUNK!', sub: `${player.name} sank ${nameOf(game, s.pid)}'s ${s.ship}`, color: '#ff4f4f' });
      } else if (hits) {
        ev.push({ t: 'sfx', name: 'explosion' }, { t: 'shake', mag: 10 }, { t: 'haptic', pattern: [40, 30, 40] },
          { t: 'banner', text: 'HIT!', sub: `${label} · ${where} · ${hits} hull ${hits === 1 ? 'cell' : 'cells'}`, color: '#ff6a3d' });
      } else {
        ev.push({ t: 'sfx', name: 'missPlop' }, { t: 'banner', text: 'MISS!', sub: `${label} · ${where}`, color: '#ffffff' });
      }
      ev.push({ t: 'log', text: `${player.name}: ${label} at ${where} — ${hits ? `${hits} hit${hits > 1 ? 's' : ''}` : 'splash'}${sunk.length ? `, sank ${sunk.map((s) => s.ship).join(', ')}` : ''}` });
    };

    if (plan.kind === 'single' || plan.kind === 'broadside' || plan.kind === 'plus' || plan.kind === 'bracket') {
      fire(neighbours(center, plan.kind), plan.label);
    } else if (plan.kind === 'dud') {
      ev.push({ t: 'sfx', name: 'sandThud' }, { t: 'toast', text: `Dud! ${player.name}'s shell buried itself in the sand at ${cellLabel(center)}.` },
        { t: 'log', text: `${player.name}: dud in the sand (${cellLabel(center)})` });
      ms.last = { by: pid, cells: [center], hits: [], hole: holeIdx, label: 'Dud' };
    } else if (plan.kind === 'friendly') {
      const own = ms.boards[pid];
      const r = strikeBoard(own, [center]);
      st.friendly++;
      recordStrike(game, { hole: holeIdx, by: pid, cells: [center], hits: r.hits, kind: plan.label, friendly: true });
      ms.last = { by: pid, cells: [center], hits: r.hits, hole: holeIdx, label: plan.label, friendly: true };
      ev.push({ t: 'sfx', name: 'siren' });
      if (r.hits.length) {
        ev.push({ t: 'sfx', name: r.sunk.length ? 'sunk' : 'explosion' }, { t: 'shake', mag: 12 },
          { t: 'banner', text: r.sunk.length ? 'OWN SHIP SUNK!' : 'FRIENDLY FIRE!', sub: `${plan.label} hit ${player.name}'s own fleet at ${cellLabel(center)}`, color: '#ffb01f' });
      } else {
        ev.push({ t: 'sfx', name: 'splash' }, { t: 'toast', text: `${plan.label} at ${cellLabel(center)} — ${player.name}'s fleet dodged it.` });
      }
      ev.push({ t: 'log', text: `${player.name}: ${plan.label} on own fleet at ${cellLabel(center)}${r.hits.length ? ' — HIT' : ' — missed'}` });
    }

    // Hole-out bonuses (judged on the final stroke count).
    if (shot.holed) {
      const list = game.holes[holeIdx].shots[pid] || [];
      const strokes = strokesFor(list);
      const par = geo.par;
      if (strokes < par) {
        let hits = 0;
        const sunk = [];
        for (const f of game.players.filter((p) => p.id !== pid && alive(game, p.id))) {
          const b = ms.boards[f.id];
          const c = pickHiddenCell(b, `${game.id}:missile:${holeIdx}:${pid}:${f.id}`);
          if (c === null) continue;
          const r = strikeBoard(b, [c]);
          hits += r.hits.length;
          r.sunk.forEach((s) => sunk.push(`${nameOf(game, f.id)}'s ${s.name}`));
          recordStrike(game, { hole: holeIdx, by: pid, cells: [c], hits: r.hits, kind: 'Guided missile', friendly: false });
        }
        st.hits += hits;
        st.sunk += sunk.length;
        st.missiles++;
        ev.push({ t: 'sfx', name: 'levelUp' }, { t: 'sfx', name: sunk.length ? 'sunk' : 'explosion' }, { t: 'shake', mag: 12 },
          { t: 'banner', text: sunk.length ? 'MISSILE SUNK!' : 'GUIDED MISSILE!', sub: sunk.length ? `${player.name} sank ${sunk.join(', ')}` : `Under par — ${hits} guaranteed hit${hits === 1 ? '' : 's'}`, color: '#33d6ff' },
          { t: 'log', text: `${player.name}: under-par guided missile — ${hits} hit${hits === 1 ? '' : 's'}` });
      } else if (strokes === par) {
        let pings = 0;
        for (const f of game.players.filter((p) => p.id !== pid && alive(game, p.id))) {
          const b = ms.boards[f.id];
          const hidden = b.ships.flatMap((s) => s.cells).filter((c) => b.marks[c] === '.' && !b.pinged.includes(c)).sort((a, z) => a - z);
          if (!hidden.length) continue;
          b.pinged.push(hidden[hashStr(`${game.id}:ping:${holeIdx}:${pid}:${f.id}`) % hidden.length]);
          pings++;
        }
        st.pings += pings;
        if (pings) ev.push({ t: 'sfx', name: 'sonar' }, { t: 'toast', text: `Sonar ping! Par for ${player.name} reveals ${pings} hidden hull ${pings === 1 ? 'cell' : 'cells'} on the radar.` },
          { t: 'log', text: `${player.name}: par sonar ping (${pings})` });
      }
    }

    // Elimination check.
    for (const p of game.players) {
      if (!ms.eliminated.includes(p.id) && !alive(game, p.id)) {
        ms.eliminated.push(p.id);
        ev.push({ t: 'banner', text: 'FLEET DESTROYED', sub: `${p.name} is out of the war`, color: '#ff4f4f' }, { t: 'sfx', name: 'defeat' });
      }
    }
    return ev;
  },

  onHoleComplete(game, ctx) {
    const ms = game.modeState;
    const holeStrikes = ms.strikes.filter((s) => s.hole === ctx.holeIdx && !s.friendly);
    const hits = holeStrikes.reduce((n, s) => n + s.hits.length, 0);
    const best = game.players.map((p) => ({ p, n: holeStrikes.filter((s) => s.by === p.id).reduce((a, s) => a + s.hits.length, 0) })).sort((a, b) => b.n - a.n)[0];
    const ev = [{ t: 'sfx', name: 'sonar' }];
    if (best && best.n > 0) ev.push({ t: 'toast', text: `Hole ${ctx.holeIdx + 1} after-action: ${hits} hits. Top gun: ${best.p.name} (${best.n}).` });
    else ev.push({ t: 'toast', text: `Hole ${ctx.holeIdx + 1}: the fleets survived another volley.` });
    return ev;
  },

  hud(game) {
    const ms = game.modeState;
    return game.players.map((p) => {
      const b = ms.boards[p.id];
      const afloat = shipsAfloat(b);
      return {
        pid: p.id, value: `${afloat}/${FLEET.length}`, label: `afloat · ${ms.stats[p.id].hits} hits`,
        badge: afloat === 0 ? 'SUNK' : ms.stats[p.id].sunk ? `☠${ms.stats[p.id].sunk}` : null,
        bar: { value: hullLeft(b), max: HULL, color: afloat ? '#33d6ff' : '#ff4f4f' },
      };
    });
  },

  standings(game) {
    const ms = game.modeState;
    return game.players.map((p) => {
      const st = ms.stats[p.id];
      const b = ms.boards[p.id];
      const out = ms.eliminated.indexOf(p.id);
      const score = (out === -1 ? 1e6 : out * 1e5) + st.sunk * 1000 + st.hits * 10 + hullLeft(b);
      return { pid: p.id, score, display: `${st.sunk} sunk · ${st.hits} hits${out === -1 ? '' : ' · fleet lost'}` };
    }).sort((a, b) => b.score - a.score);
  },

  isOver(game) {
    if (game.players.length < 2) return false;
    return game.players.filter((p) => alive(game, p.id)).length <= 1;
  },

  overlay(ctx, view, game, t) {
    drawOverlay(ctx, view, game, t);
  },

  panel(container, game, api) {
    renderPanel(container, game, api);
  },

  scene(game, ctx) {
    return fleetScene(game, ctx);
  },
};

export { battleship };
export default battleship;

// ====================================================================== rendering

function drawOverlay(ctx, view, game, t) {
  const ms = game.modeState;
  if (!ms || !ms.boards) return;
  const geo = synthesize(game.course.holes[game.holeIdx]);
  const g = gridRect(geo);
  const tl = view.toScreen({ x: g.minX, y: g.maxY });
  const br = view.toScreen({ x: g.maxX, y: g.minY });
  const cw = (br.x - tl.x) / GRID, ch = (br.y - tl.y) / GRID;
  ctx.save();
  ctx.strokeStyle = 'rgba(51,214,255,0.32)';
  ctx.lineWidth = 1;
  for (let i = 0; i <= GRID; i++) {
    ctx.beginPath(); ctx.moveTo(tl.x + i * cw, tl.y); ctx.lineTo(tl.x + i * cw, br.y); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(tl.x, tl.y + i * ch); ctx.lineTo(br.x, tl.y + i * ch); ctx.stroke();
  }
  const fs = Math.max(9, Math.min(13, cw * 0.45));
  ctx.font = `900 ${fs}px ${FONT_DISPLAY}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  for (let c = 0; c < GRID; c++) {
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(tl.x + c * cw + cw / 2 - fs * 0.6, tl.y + 2, fs * 1.2, fs + 3);
    ctx.fillStyle = '#9ff0ff';
    ctx.fillText(COLS[c], tl.x + c * cw + cw / 2, tl.y + 3);
  }
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  for (let r = 0; r < GRID; r++) {
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(tl.x + 1, tl.y + r * ch + ch / 2 - fs * 0.6, fs * 1.5, fs * 1.2);
    ctx.fillStyle = '#9ff0ff';
    ctx.fillText(String(r + 1), tl.x + 3, tl.y + r * ch + ch / 2);
  }
  // Combined fog-of-war marks across enemy boards.
  const marks = new Array(GRID * GRID).fill(0); // 0 none, 1 miss, 2 hit
  const pinged = new Set();
  for (const p of game.players) {
    const b = ms.boards[p.id];
    for (let i = 0; i < GRID * GRID; i++) {
      if (b.marks[i] === 'x') marks[i] = 2;
      else if (b.marks[i] === 'o' && marks[i] === 0) marks[i] = 1;
    }
    b.pinged.forEach((c) => { if (b.marks[c] === '.') pinged.add(c); });
  }
  const rm = prefersReducedMotion();
  for (let i = 0; i < GRID * GRID; i++) {
    const cx = tl.x + (i % GRID + 0.5) * cw, cy = tl.y + (Math.floor(i / GRID) + 0.5) * ch;
    const rad = Math.max(3, Math.min(cw, ch) * 0.26);
    if (marks[i] === 2) drawFlame(ctx, cx, cy, rad * 1.5, rm ? 0 : t + i);
    else if (marks[i] === 1) {
      ctx.fillStyle = '#ffffff';
      ctx.strokeStyle = '#1b2a3a';
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(cx, cy, rad * 0.7, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    }
    if (pinged.has(i)) {
      const ph = rm ? 0.5 : (t * 0.8 + i * 0.1) % 1;
      ctx.strokeStyle = `rgba(51,214,255,${1 - ph})`;
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(cx, cy, rad * (0.8 + ph * 2), 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = '#33d6ff';
      ctx.beginPath(); ctx.arc(cx, cy, 2.5, 0, Math.PI * 2); ctx.fill();
    }
  }
  if (ms.last && ms.last.hole === game.holeIdx) {
    const pulse = rm ? 1 : 0.6 + 0.4 * Math.sin(t * 6);
    ctx.strokeStyle = ms.last.friendly ? `rgba(255,176,31,${pulse})` : `rgba(255,79,216,${pulse})`;
    ctx.lineWidth = 3;
    for (const c of ms.last.cells) ctx.strokeRect(tl.x + (c % GRID) * cw + 2, tl.y + Math.floor(c / GRID) * ch + 2, cw - 4, ch - 4);
  }
  ctx.restore();
}

function drawFlame(ctx, x, y, r, t) {
  const f = 1 + 0.12 * Math.sin(t * 9);
  ctx.save();
  ctx.fillStyle = 'rgba(255,60,30,0.35)';
  ctx.beginPath(); ctx.arc(x, y, r * 1.1, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#ff3b1f';
  ctx.beginPath();
  ctx.moveTo(x - r * 0.6, y + r * 0.5);
  ctx.quadraticCurveTo(x - r * 0.7, y - r * 0.2 * f, x - r * 0.1, y - r * f);
  ctx.quadraticCurveTo(x + r * 0.05, y - r * 0.4, x + r * 0.3, y - r * 0.75 * f);
  ctx.quadraticCurveTo(x + r * 0.75, y - r * 0.1, x + r * 0.6, y + r * 0.5);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#ffd84a';
  ctx.beginPath();
  ctx.ellipse(x, y + r * 0.2, r * 0.3, r * 0.45 * f, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/** Small DOM grid view of combined strike marks (and optionally one player's ships). */
function gridView(game, { ownerPid = null, caption = '' } = {}) {
  const ms = game.modeState;
  const cells = [];
  const ownBoard = ownerPid ? ms.boards[ownerPid] : null;
  for (let i = 0; i < GRID * GRID; i++) {
    let state = '';
    let hit = false, miss = false;
    if (ownBoard) {
      if (ownBoard.marks[i] === 'x') hit = true;
      else if (ownBoard.marks[i] === 'o') miss = true;
    } else {
      for (const p of game.players) {
        if (ms.boards[p.id].marks[i] === 'x') hit = true;
        else if (ms.boards[p.id].marks[i] === 'o') miss = true;
      }
    }
    const ship = ownBoard ? shipAt(ownBoard, i) : null;
    if (hit) state = 'hit'; else if (miss) state = 'miss';
    cells.push(el('span', { class: `bs-cell ${state ? `is-${state}` : ''} ${ship ? 'is-ship' : ''}`, 'aria-hidden': 'true' }));
  }
  const hits = cells.filter((c) => c.classList.contains('is-hit')).length;
  return el('div', { class: 'bs-mini', role: 'img', 'aria-label': `${caption || 'Strike map'}: ${hits} hit cells marked` },
    el('div', { class: 'bs-mini-grid' }, cells));
}

function renderPanel(container, game, api) {
  const ms = game.modeState;
  clear(container);
  const peekPid = api && api.selectedPid && !(game.players.find((p) => p.id === api.selectedPid) || {}).cpu ? api.selectedPid : null;
  let peeking = false;
  const mapHost = el('div', { class: 'bs-map-host' }, gridView(game, { caption: 'Combined strike map' }));
  const peekBtn = peekPid ? el('button', {
    class: 'btn btn-ghost bw-peek', type: 'button', 'aria-pressed': 'false',
    onclick: () => {
      peeking = !peeking;
      peekBtn.setAttribute('aria-pressed', String(peeking));
      peekBtn.textContent = peeking ? 'Hide fleet' : `Peek ${nameOf(game, peekPid)}'s fleet`;
      clear(mapHost).appendChild(gridView(game, peeking ? { ownerPid: peekPid, caption: `${nameOf(game, peekPid)}'s fleet` } : { caption: 'Combined strike map' }));
      sfx.play(peeking ? 'sonar' : 'click');
    },
  }, `Peek ${nameOf(game, peekPid)}'s fleet`) : null;

  const fleets = el('div', { class: 'bs-fleets' }, game.players.map((p, i) => {
    const b = ms.boards[p.id];
    return el('div', { class: `bs-fleet ${shipsAfloat(b) ? '' : 'is-out'}`, style: { '--pc': p.color } },
      el('div', { class: 'bs-fleet-name' }, tokenSVG(tokenOf(p, i), p.color, 22), p.name),
      el('ul', { class: 'bs-ships' }, b.ships.map((s) => {
        const sunk = isSunk(b, s);
        return el('li', { class: sunk ? 'is-sunk' : '' },
          el('span', { class: 'bs-hull', 'aria-hidden': 'true' }, s.cells.map((c) => el('i', { class: b.marks[c] === 'x' ? 'is-hit' : '' }))),
          el('span', { class: 'bs-ship-name' }, sunk ? `${s.name} — sunk` : s.name));
      })));
  }));
  const last = ms.last;
  const ticker = el('p', { class: 'bw-ticker', 'aria-live': 'polite' },
    last ? `Last: ${nameOf(game, last.by)} · ${last.label} · ${last.cells.map(cellLabel).slice(0, 3).join(' ')}${last.cells.length > 3 ? '…' : ''} — ${last.hits.length ? `${last.hits.length} hit${last.hits.length > 1 ? 's' : ''}` : 'no hits'}` : 'Radar armed. Your first shot opens fire.');
  container.append(el('section', { class: 'bw-panel bw-panel--battleship', 'aria-label': 'Fairway Fleet status' },
    el('div', { class: 'bw-panel-head' }, el('h2', {}, 'War Room'), peekBtn),
    el('div', { class: 'bs-layout' }, mapHost, fleets), ticker));
}

// ---------------------------------------------------------------- setup (fleet deployment)

function renderSetup(container, game, done) {
  const humans = game.players.filter((p) => !p.cpu);
  let i = 0;
  const next = () => {
    if (i >= humans.length) {
      for (const p of game.players) game.modeState.boards[p.id].deployed = true;
      clear(container);
      container.append(el('div', { class: 'bw-privacy bw-ready' },
        el('p', { class: 'bw-eyebrow' }, 'All fleets at sea'),
        el('h2', { class: 'bw-privacy-title' }, 'Battle stations!'),
        el('p', {}, 'Hand the phone to the first golfer on the tee. Every shot fires where it lands.'),
        el('button', { class: 'btn btn-primary btn-xl', type: 'button', onclick: () => { sfx.play('siren'); done(); } }, 'Open fire →')));
      return;
    }
    const p = humans[i++];
    privacy(container, game, p, humans.length > 1, () => deployUI(container, game, p, next));
  };
  next();
}

function privacy(container, game, p, multi, go) {
  clear(container);
  const pi = game.players.indexOf(p);
  if (!multi) { go(); return; }
  container.append(el('div', { class: 'bw-privacy', style: { '--pc': p.color } },
    el('div', { class: 'bw-privacy-token' }, tokenSVG(tokenOf(p, pi), p.color, 96)),
    el('p', { class: 'bw-eyebrow' }, 'Top secret · eyes only'),
    el('h2', { class: 'bw-privacy-title' }, `Hand the phone to ${p.name}`),
    el('p', {}, 'Everyone else look away while this admiral hides their fleet.'),
    el('button', { class: 'btn btn-primary btn-xl', type: 'button', onclick: () => { sfx.play('confirm'); go(); } }, `I'm ${p.name} — show my grid`)));
}

function deployUI(container, game, p, next) {
  const pi = game.players.indexOf(p);
  clear(container);
  let ships = [];
  let sel = FLEET[0].id;
  let horiz = true;
  const geo = synthesize(game.course.holes[0]);
  const bg = el('canvas', { class: 'bs-setup-bg', 'aria-hidden': 'true' });
  const gridEl = el('div', { class: 'bs-setup-grid', role: 'grid', 'aria-label': 'Your fleet grid, columns A to J, rows 1 to 10' });
  const dock = el('div', { class: 'bs-dock', role: 'radiogroup', 'aria-label': 'Ship to place' });
  const rotBtn = el('button', { class: 'btn btn-ghost', type: 'button', onclick: () => { horiz = !horiz; sfx.play('click'); render(); } });
  const lockBtn = el('button', { class: 'btn btn-primary btn-xl', type: 'button', onclick: lock }, 'Lock fleet');
  const status = el('p', { class: 'bs-status', 'aria-live': 'polite' });
  const cells = [];
  for (let r = -1; r < GRID; r++) {
    for (let c = -1; c < GRID; c++) {
      if (r === -1 || c === -1) {
        gridEl.appendChild(el('span', { class: 'bs-head', 'aria-hidden': 'true' }, r === -1 && c === -1 ? '' : r === -1 ? COLS[c] : String(r + 1)));
        continue;
      }
      const idx = idxOf(c, r);
      const b = el('button', { type: 'button', class: 'bs-cell-btn', 'aria-label': cellLabel(idx), onclick: () => tap(idx) });
      cells[idx] = b;
      gridEl.appendChild(b);
    }
  }

  function tap(idx) {
    const existing = ships.find((s) => s.cells.includes(idx));
    if (existing) {
      ships = ships.filter((s) => s !== existing);
      sel = existing.id;
      horiz = existing.cells.length < 2 || existing.cells[1] - existing.cells[0] === 1;
      sfx.play('undo');
      render();
      return;
    }
    const f = FLEET.find((x) => x.id === sel);
    if (!f) return;
    const cellsFor = shipCells(fitAnchor(idx, f.len, horiz), f.len, horiz);
    const used = new Set(ships.flatMap((s) => s.cells));
    if (!cellsFor || cellsFor.some((c) => used.has(c))) {
      sfx.play('error');
      status.textContent = `The ${f.name} doesn't fit there — try another spot or rotate.`;
      gridEl.animate?.([{ transform: 'translateX(-6px)' }, { transform: 'translateX(6px)' }, { transform: 'none' }], { duration: 220 });
      return;
    }
    ships.push({ id: f.id, name: f.name, len: f.len, cells: cellsFor });
    sfx.play('thud');
    const nextShip = FLEET.find((x) => !ships.some((s) => s.id === x.id));
    sel = nextShip ? nextShip.id : null;
    render();
  }

  function lock() {
    if (!validFleet(ships)) return;
    deployFleet(game, p.id, ships);
    sfx.play('confirm');
    next();
  }

  function render() {
    const used = new Map();
    ships.forEach((s) => s.cells.forEach((c, k) => used.set(c, { s, k })));
    for (let idx = 0; idx < GRID * GRID; idx++) {
      const u = used.get(idx);
      const b = cells[idx];
      b.className = `bs-cell-btn ${u ? `is-ship ship-${u.s.id}` : ''} ${u && u.k === 0 ? 'is-bow' : ''}`;
      b.setAttribute('aria-label', `${cellLabel(idx)}${u ? ` — ${u.s.name}` : ''}`);
    }
    clear(dock);
    for (const f of FLEET) {
      const placed = ships.some((s) => s.id === f.id);
      dock.appendChild(el('button', {
        type: 'button', role: 'radio', 'aria-checked': String(sel === f.id), class: `bs-dock-ship ${placed ? 'is-placed' : ''} ${sel === f.id ? 'is-on' : ''}`,
        onclick: () => { if (placed) ships = ships.filter((s) => s.id !== f.id); sel = f.id; sfx.play('select'); render(); },
      }, el('span', { class: 'bs-hull', 'aria-hidden': 'true' }, Array.from({ length: f.len }, () => el('i'))), el('span', {}, f.name), el('small', {}, placed ? 'placed · tap to move' : `${f.len} cells`)));
    }
    rotBtn.textContent = horiz ? '↻ Rotate · Horizontal' : '↻ Rotate · Vertical';
    lockBtn.disabled = !validFleet(ships);
    const f = FLEET.find((x) => x.id === sel);
    status.textContent = f ? `Tap the grid to place your ${f.name} (${f.len}).` : 'Fleet ready. Lock it in, or tap a ship to move it.';
  }

  container.append(el('div', { class: 'bs-setup', style: { '--pc': p.color } },
    el('div', { class: 'bs-setup-head' }, tokenSVG(tokenOf(p, pi), p.color, 44),
      el('div', {}, el('p', { class: 'bw-eyebrow' }, 'Admiral'), el('h2', {}, `${p.name}, deploy your fleet`))),
    el('p', { class: 'bs-hint' }, 'The grid stretches over every hole (hole 1 shown). Centre columns see the most fire — but splash salvos and sonar hunt the edges.'),
    el('div', { class: 'bs-setup-board' }, bg, gridEl),
    status,
    dock,
    el('div', { class: 'bs-setup-actions' },
      rotBtn,
      el('button', { class: 'btn btn-ghost', type: 'button', onclick: () => { ships = autoPlace(mulberry32(hashStr(`${Date.now()}:${p.id}`))); sel = null; sfx.play('dice'); render(); } }, '🎲 Auto-place'),
      el('button', { class: 'btn btn-ghost', type: 'button', onclick: () => { ships = []; sel = FLEET[0].id; sfx.play('undo'); render(); } }, 'Clear'),
      lockBtn)));
  render();
  whenSized(bg, () => drawSetupBg(bg, geo));
}

function drawSetupBg(canvas, geo) {
  const { w, h, ctx } = fitCanvas(canvas);
  const g = gridRect(geo);
  const S = (p) => ({ x: ((p.x - g.minX) / (g.maxX - g.minX)) * w, y: ((g.maxY - p.y) / (g.maxY - g.minY)) * h });
  ctx.fillStyle = '#123049';
  ctx.fillRect(0, 0, w, h);
  const kx = w / (g.maxX - g.minX);
  const line = (width, color, from, to) => {
    ctx.beginPath();
    let first = true;
    for (const p of geo.path) {
      if (p.s < from || p.s > to) continue;
      const s = S(p);
      if (first) { ctx.moveTo(s.x, s.y); first = false; } else ctx.lineTo(s.x, s.y);
    }
    ctx.lineWidth = width * kx;
    ctx.lineCap = 'round';
    ctx.strokeStyle = color;
    ctx.stroke();
  };
  line(geo.fairwayWidth + geo.roughWidth * 2, 'rgba(61,125,71,0.55)', 0, geo.yards);
  line(geo.fairwayWidth, 'rgba(98,179,79,0.6)', geo.fairwayStart, geo.fairwayEnd);
  const gc = S(geo.green);
  ctx.fillStyle = 'rgba(139,227,111,0.7)';
  ctx.beginPath(); ctx.ellipse(gc.x, gc.y, geo.green.r * kx, geo.green.r * (h / (g.maxY - g.minY)), 0, 0, Math.PI * 2); ctx.fill();
  for (const wt of geo.water) {
    const c = S(wt);
    ctx.fillStyle = 'rgba(47,164,231,0.7)';
    ctx.beginPath(); ctx.ellipse(c.x, c.y, wt.rx * kx, wt.ry * (h / (g.maxY - g.minY)), 0, 0, Math.PI * 2); ctx.fill();
  }
}

// ---------------------------------------------------------------- between-hole scene

function fleetScene(game, ctx) {
  const ms = game.modeState;
  const holeIdx = ctx ? ctx.holeIdx : game.holeIdx;
  const fresh = new Set();
  ms.strikes.filter((s) => s.hole === holeIdx).forEach((s) => s.cells.forEach((c) => fresh.add(c)));
  const players = game.players;
  const dur = prefersReducedMotion() ? 2.2 : 5.2;
  const scene = {
    title: `War Room · after hole ${holeIdx + 1}`,
    caption: 'Radar sweep: plotting this hole\'s salvos…',
    done: false,
    holdMs: 1200,
    t: 0,
    boomed: new Set(),
    update(dt, api) {
      this.t += dt;
      const p = this.t / dur;
      if (p > 0.35 && !this.cap2) {
        this.cap2 = true;
        const lines = players.map((pl) => `${pl.name}: ${shipsAfloat(ms.boards[pl.id])}/${FLEET.length} afloat`);
        this.caption = lines.join(' · ');
      }
      if (this.t >= dur) this.done = true;
      this._api = api;
    },
    draw(c, w, h, api) {
      // Night-sea tabletop
      const bg = c.createLinearGradient(0, 0, 0, h);
      bg.addColorStop(0, '#071a2b');
      bg.addColorStop(1, '#0c2f4a');
      c.fillStyle = bg;
      c.fillRect(0, 0, w, h);
      c.strokeStyle = 'rgba(51,214,255,0.06)';
      for (let y = 0; y < h; y += 18) {
        c.beginPath();
        for (let x = 0; x <= w; x += 12) c.lineTo(x, y + Math.sin(x * 0.04 + this.t * 1.5 + y) * 2);
        c.stroke();
      }
      const n = players.length;
      const cols = n <= 2 ? n : 2;
      const rows = Math.ceil(n / cols);
      const pad = 14;
      const cellW = (w - pad * (cols + 1)) / cols;
      const cellH = (h - pad * (rows + 1)) / rows;
      players.forEach((pl, i) => {
        const bx = pad + (i % cols) * (cellW + pad);
        const by = pad + Math.floor(i / cols) * (cellH + pad);
        drawFleetCase(c, bx, by, cellW, cellH, game, pl, i, fresh, this.t / dur, api, this);
      });
    },
  };
  return scene;
}

function drawFleetCase(c, x, y, w, h, game, pl, pi, fresh, prog, api, scene) {
  const b = game.modeState.boards[pl.id];
  // grey plastic case
  c.save();
  c.fillStyle = '#5d6b78';
  rrect(c, x, y, w, h, 14);
  c.fill();
  c.fillStyle = '#738391';
  rrect(c, x + 4, y + 4, w - 8, h - 8, 11);
  c.fill();
  c.restore();
  const head = 34;
  drawToken(c, tokenOf(pl, pi), x + 24, y + head / 2 + 4, 26, pl.color, { shadow: false });
  drawLabel(c, pl.name, x + 44, y + head / 2 + 4, { size: 16, align: 'left', color: '#fff', stroke: '#1d2731', maxWidth: w - 140 });
  const afloat = shipsAfloat(b);
  drawLabel(c, afloat ? `${afloat}/${FLEET.length} AFLOAT` : 'FLEET LOST', x + w - 12, y + head / 2 + 4, { size: 12, align: 'right', color: afloat ? '#9ff0ff' : '#ff6a5a', stroke: '#1d2731' });
  const gs = Math.min(w - 24, h - head - 18);
  const gx = x + (w - gs) / 2, gy = y + head + 6;
  const cs = gs / GRID;
  c.fillStyle = '#0d3550';
  c.fillRect(gx, gy, gs, gs);
  // radar sweep
  const ang = prog * Math.PI * 4;
  const cx = gx + gs / 2, cy = gy + gs / 2;
  const sw = c.createConicGradient ? c.createConicGradient(ang, cx, cy) : null;
  if (sw) {
    sw.addColorStop(0, 'rgba(51,214,255,0.35)');
    sw.addColorStop(0.12, 'rgba(51,214,255,0)');
    sw.addColorStop(1, 'rgba(51,214,255,0)');
    c.fillStyle = sw;
    c.fillRect(gx, gy, gs, gs);
  }
  c.strokeStyle = 'rgba(159,240,255,0.18)';
  c.lineWidth = 1;
  for (let i = 0; i <= GRID; i++) {
    c.beginPath(); c.moveTo(gx + i * cs, gy); c.lineTo(gx + i * cs, gy + gs); c.stroke();
    c.beginPath(); c.moveTo(gx, gy + i * cs); c.lineTo(gx + gs, gy + i * cs); c.stroke();
  }
  // sunk ships revealed as silhouettes
  for (const s of b.ships) {
    if (!isSunk(b, s)) continue;
    const cs0 = s.cells.slice().sort((a, z) => a - z);
    const c0 = cs0[0] % GRID, r0 = Math.floor(cs0[0] / GRID);
    const horiz = cs0.length > 1 && cs0[1] - cs0[0] === 1;
    const sx = gx + c0 * cs + 2, sy = gy + r0 * cs + 2;
    const sw2 = horiz ? cs * s.len - 4 : cs - 4, sh = horiz ? cs - 4 : cs * s.len - 4;
    c.fillStyle = 'rgba(40,46,52,0.9)';
    rrect(c, sx, sy, sw2, sh, cs * 0.45);
    c.fill();
  }
  // pegs (fresh ones drop in with the sweep)
  for (let i = 0; i < GRID * GRID; i++) {
    const m = b.marks[i];
    if (m === '.') continue;
    const px = gx + (i % GRID + 0.5) * cs, py = gy + (Math.floor(i / GRID) + 0.5) * cs;
    let k = 1;
    if (fresh.has(i)) {
      const at = 0.15 + ((i * 37) % 100) / 100 * 0.5;
      k = ease.outBack(seg(prog, at, at + 0.12));
      if (k > 0 && !scene.boomed.has(`${pl.id}:${i}`) && m === 'x') {
        scene.boomed.add(`${pl.id}:${i}`);
        api.fx.sparks(px, py, { n: 18, color: ['#ff6a3d', '#ffd84a'], speed: 160 });
        if (scene.boomed.size < 6) sfx.play('explosion');
      }
    }
    if (k <= 0) continue;
    const r = cs * 0.3 * k;
    c.fillStyle = m === 'x' ? '#e8262c' : '#f4f7fa';
    c.strokeStyle = 'rgba(0,0,0,0.6)';
    c.lineWidth = 1;
    c.beginPath(); c.arc(px, py, r, 0, Math.PI * 2); c.fill(); c.stroke();
    c.fillStyle = 'rgba(255,255,255,0.55)';
    c.beginPath(); c.arc(px - r * 0.3, py - r * 0.3, r * 0.3, 0, Math.PI * 2); c.fill();
  }
  if (!afloat) {
    c.save();
    c.translate(x + w / 2, y + h / 2 + 10);
    c.rotate(-0.18);
    drawLabel(c, 'SUNK', 0, 0, { size: Math.min(64, w / 4), color: alpha('#ff4f4f', 0.9), stroke: '#2a0d0d' });
    c.restore();
  }
  void PAL;
}
