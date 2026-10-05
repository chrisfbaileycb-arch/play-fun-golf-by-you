// Turf Monopoly — fairway segments and greens are deeded properties. Land, buy, collect rent, go to jail.
// Logic is pure & DOM-free; panel()/overlay()/scene() render.
import { el, clear, mulberry32, hashStr, rrect, ease, seg, prefersReducedMotion, formatNum } from '../core/util.js';
import { synthesize, projectToPath, pointAtS, normalAtS } from '../core/fairway.js';
import { strokesFor, maxStrokes } from '../core/shots.js';
import { sfx } from '../core/audio.js';
import { zoneKind, nameOf, colorOf, tokenOf, tokenSVG, drawToken, drawLabel, drawCardboard, drawBill, alpha, shade, FONT_DISPLAY, PAL } from './board.js';

export const START_CASH = 1500;
export const GROUPS = [
  { name: 'Saltwater', color: '#8b5a2b' },
  { name: 'Carousel', color: '#7cc8f0' },
  { name: 'Taffy', color: '#e0479e' },
  { name: 'Ferris', color: '#f7941d' },
  { name: 'Lighthouse', color: '#e8262c' },
  { name: 'Arcade', color: '#f5d90a' },
  { name: 'Pier', color: '#1fa55a' },
  { name: 'Marina', color: '#1560bd' },
  { name: 'Promenade', color: '#7a3fa0' },
];
const SUFFIX = ['Lane', 'Avenue', 'Row'];
const TAX = { sand: 50, ob: 100 };
export const SALARY = { '-2': 400, '-1': 300, '0': 200, '1': 100 };

const round5 = (v) => Math.max(5, Math.round(v / 5) * 5);
const round10 = (v) => Math.max(10, Math.round(v / 10) * 10);

/** Deeds for one hole: fairway segments + the green. Values scale with yardage. */
export function holeDeeds(geo, holeIdx) {
  const grp = GROUPS[holeIdx % GROUPS.length];
  const n = geo.par === 3 ? 1 : geo.par === 4 ? 2 : 3;
  const base = 60 + geo.yards * 0.35;
  const s0 = geo.fairwayStart, s1 = geo.fairwayEnd + 6;
  const out = [];
  for (let k = 0; k < n; k++) {
    const price = round10(base * (0.75 + 0.15 * k));
    out.push({
      id: `h${holeIdx}-f${k}`, hole: holeIdx, kind: 'fairway', name: `${grp.name} ${SUFFIX[k]}`, color: grp.color,
      s0: s0 + ((s1 - s0) * k) / n, s1: s0 + ((s1 - s0) * (k + 1)) / n, price, rent: round5(price * 0.14), mortgage: price / 2,
    });
  }
  const gp = round10(base * 1.5);
  out.push({ id: `h${holeIdx}-g`, hole: holeIdx, kind: 'green', name: `${grp.name} Green`, color: grp.color, price: gp, rent: round5(gp * 0.18), mortgage: gp / 2 });
  return out;
}

const deedsFor = (game, idx) => holeDeeds(synthesize(game.course.holes[idx]), idx);

export function findDeed(game, deedId) {
  const m = /^h(\d+)-/.exec(deedId || '');
  if (!m) return null;
  const idx = parseInt(m[1], 10);
  if (idx < 0 || idx >= game.course.holes.length) return null;
  return deedsFor(game, idx).find((d) => d.id === deedId) || null;
}

/** Deed under a shot landing (null if none). */
export function deedForShot(geo, holeIdx, shot) {
  const k = zoneKind(shot);
  const deeds = holeDeeds(geo, holeIdx);
  if (k === 'green') return deeds.find((d) => d.kind === 'green');
  if (k === 'fairway') {
    const pr = projectToPath(geo.path, shot.to);
    return deeds.find((d) => d.kind === 'fairway' && pr.s >= d.s0 && pr.s <= d.s1) || null;
  }
  return null;
}

export const CHANCE = [
  { id: 'c1', text: 'Advance to the clubhouse. Collect $200.', fx: 'collect', n: 200 },
  { id: 'c2', text: 'Hole-in-one insurance pays out. Collect $150.', fx: 'collect', n: 150 },
  { id: 'c3', text: 'Speeding golf-cart ticket. Pay $50 to Free Parking.', fx: 'pay', n: 50 },
  { id: 'c4', text: 'Elected Club Captain. Pay each player $50.', fx: 'payEach', n: 50 },
  { id: 'c5', text: 'Sponsorship deal! Collect $50 from every player.', fx: 'collectEach', n: 50 },
  { id: 'c6', text: 'Get Out of Jail Free. Keep this card until needed.', fx: 'goojf' },
  { id: 'c7', text: 'Groundskeeper repairs: pay $25 per deed you own.', fx: 'perDeed', n: -25 },
  { id: 'c8', text: 'Free deed! Take the cheapest unowned deed on this hole.', fx: 'freeDeed' },
  { id: 'c9', text: 'Go directly to Jail. Your next shot earns nothing.', fx: 'jail' },
  { id: 'c10', text: 'Your ball dents the snack shack. Pay $15.', fx: 'pay', n: 15 },
];
export const CHEST = [
  { id: 'k1', text: 'Bank error in your favour. Collect $200.', fx: 'collect', n: 200 },
  { id: 'k2', text: 'Your caddie tips YOU. Collect $25.', fx: 'collect', n: 25 },
  { id: 'k3', text: 'Club dues are due. Pay $50.', fx: 'pay', n: 50 },
  { id: 'k4', text: 'Lost-ball fund matures. Collect $100.', fx: 'collect', n: 100 },
  { id: 'k5', text: 'Ball-retriever rental. Pay $20.', fx: 'pay', n: 20 },
  { id: 'k6', text: 'It\'s your birthday on the course! Collect $10 from every player.', fx: 'collectEach', n: 10 },
  { id: 'k7', text: 'Get Out of Jail Free. Keep this card until needed.', fx: 'goojf' },
  { id: 'k8', text: 'Member-guest winnings. Collect $75.', fx: 'collect', n: 75 },
  { id: 'k9', text: 'Pro-shop impulse buy. Pay $40.', fx: 'pay', n: 40 },
  { id: 'k10', text: 'Charity scramble. Pay $15 to Free Parking.', fx: 'pay', n: 15 },
  { id: 'k11', text: 'Rain-delay refund. Collect $50.', fx: 'collect', n: 50 },
  { id: 'k12', text: 'Greenkeeper bonus: collect $20 per deed you own.', fx: 'perDeed', n: 20 },
];

function shuffled(n, seed) {
  const rng = mulberry32(seed);
  const a = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

export const isBankrupt = (game, pid) => game.modeState.bankrupt.includes(pid);
export const ownedBy = (game, pid) => Object.entries(game.modeState.owners).filter(([, o]) => o.pid === pid).map(([id]) => id);

export function netWorth(game, pid) {
  const ms = game.modeState;
  let v = ms.cash[pid];
  for (const id of ownedBy(game, pid)) {
    const d = findDeed(game, id);
    if (d) v += ms.owners[id].mortgaged ? d.price / 2 : d.price;
  }
  return Math.round(v);
}

export function hasMonopoly(game, pid, holeIdx) {
  return deedsFor(game, holeIdx).every((d) => game.modeState.owners[d.id] && game.modeState.owners[d.id].pid === pid);
}

export function rentFor(game, deed) {
  const o = game.modeState.owners[deed.id];
  if (!o || o.mortgaged) return 0;
  return deed.rent * (hasMonopoly(game, o.pid, deed.hole) ? 2 : 1);
}

/**
 * Move money. `to` = pid | 'pot' | 'bank'. Liquidates (mortgages cheapest deeds) when short; bankrupts if still short.
 * Returns {paid, bankrupt, mortgaged:[names]}.
 */
export function pay(game, from, to, amount) {
  const ms = game.modeState;
  const res = { paid: 0, bankrupt: false, mortgaged: [] };
  if (amount <= 0 || isBankrupt(game, from)) return res;
  if (ms.cash[from] < amount) {
    const mine = ownedBy(game, from).filter((id) => !ms.owners[id].mortgaged).map((id) => findDeed(game, id)).filter(Boolean).sort((a, b) => a.price - b.price);
    for (const d of mine) {
      if (ms.cash[from] >= amount) break;
      ms.owners[d.id].mortgaged = true;
      ms.cash[from] += d.mortgage;
      res.mortgaged.push(d.name);
    }
  }
  const paid = Math.min(amount, ms.cash[from]);
  ms.cash[from] -= paid;
  res.paid = paid;
  if (to === 'pot') ms.pot += paid;
  else if (to !== 'bank' && ms.cash[to] !== undefined) ms.cash[to] += paid;
  if (paid < amount) {
    res.bankrupt = true;
    ms.bankrupt.push(from);
    for (const id of ownedBy(game, from)) delete ms.owners[id];
    delete ms.pending[from];
  }
  return res;
}

/** Purchase a deed (human Buy button / CPU). Returns true on success. */
export function buyDeed(game, pid, deedId) {
  const ms = game.modeState;
  const d = findDeed(game, deedId);
  if (!d || ms.owners[deedId] || isBankrupt(game, pid) || ms.cash[pid] < d.price) return false;
  ms.cash[pid] -= d.price;
  ms.owners[deedId] = { pid, mortgaged: false };
  ms.ledger[pid].bought++;
  if (ms.pending[pid] && ms.pending[pid].deedId === deedId) delete ms.pending[pid];
  ms.last = `${nameOf(game, pid)} bought ${d.name} for $${d.price}`;
  return true;
}

export function passDeed(game, pid) {
  const ms = game.modeState;
  const p = ms.pending[pid];
  if (!p) return false;
  delete ms.pending[pid];
  const d = findDeed(game, p.deedId);
  ms.last = `${nameOf(game, pid)} passed on ${d ? d.name : 'a deed'}`;
  return true;
}

function goToJail(game, pid, ev, why) {
  const ms = game.modeState;
  if (ms.goojf[pid] > 0) {
    ms.goojf[pid]--;
    ev.push({ t: 'sfx', name: 'chance' }, { t: 'toast', text: `${nameOf(game, pid)} plays a Get Out of Jail Free card! (${why})` });
    return;
  }
  ms.jail[pid] = true;
  ms.ledger[pid].jailed++;
  ev.push({ t: 'sfx', name: 'jail' }, { t: 'shake', mag: 8 }, { t: 'banner', text: 'GO TO JAIL!', sub: `${why} — ${nameOf(game, pid)}'s next shot earns nothing`, color: '#ffb01f' });
}

function drawCard(game, deck) {
  const ms = game.modeState;
  const cards = deck === 'chance' ? CHANCE : CHEST;
  const order = ms.deck[deck];
  const key = deck === 'chance' ? 'ci' : 'ki';
  const card = cards[order[ms.deck[key] % order.length]];
  ms.deck[key]++;
  return card;
}

function applyCard(game, pid, card, deck, holeIdx, ev) {
  const ms = game.modeState;
  const name = nameOf(game, pid);
  const others = game.players.filter((p) => p.id !== pid && !isBankrupt(game, p.id));
  ms.ledger[pid].cards++;
  ev.push({ t: 'sfx', name: 'chance' }, { t: 'banner', text: deck === 'chance' ? 'CHANCE' : 'COMMUNITY CHEST', sub: card.text, color: deck === 'chance' ? '#ff9a1f' : '#33d6ff' });
  ms.lastCard = { deck, text: card.text, pid };
  switch (card.fx) {
    case 'collect': ms.cash[pid] += card.n; ev.push({ t: 'sfx', name: 'coin' }); break;
    case 'pay': { const r = pay(game, pid, 'pot', card.n); noteBust(game, pid, r, ev); break; }
    case 'payEach': for (const o of others) { const r = pay(game, pid, o.id, card.n); noteBust(game, pid, r, ev); if (r.bankrupt) break; } break;
    case 'collectEach': for (const o of others) { const r = pay(game, o.id, pid, card.n); noteBust(game, o.id, r, ev); } ev.push({ t: 'sfx', name: 'register' }); break;
    case 'goojf': ms.goojf[pid]++; break;
    case 'perDeed': {
      const n = ownedBy(game, pid).length;
      if (card.n > 0) ms.cash[pid] += card.n * n;
      else { const r = pay(game, pid, 'pot', -card.n * n); noteBust(game, pid, r, ev); }
      break;
    }
    case 'freeDeed': {
      const free = deedsFor(game, holeIdx).filter((d) => !ms.owners[d.id]).sort((a, b) => a.price - b.price)[0];
      if (free) { ms.owners[free.id] = { pid, mortgaged: false }; ms.ledger[pid].bought++; ev.push({ t: 'toast', text: `${name} takes ${free.name} for free!` }); }
      else { ms.cash[pid] += 100; ev.push({ t: 'toast', text: 'Every deed here is owned — collect $100 instead.' }); }
      break;
    }
    case 'jail': goToJail(game, pid, ev, 'Chance card'); break;
    default: break;
  }
  ev.push({ t: 'log', text: `${name} drew ${deck === 'chance' ? 'Chance' : 'Community Chest'}: ${card.text}` });
}

function noteBust(game, pid, r, ev) {
  if (r.mortgaged.length) ev.push({ t: 'toast', text: `${nameOf(game, pid)} mortgaged ${r.mortgaged.join(', ')} to pay.` });
  if (r.bankrupt) ev.push({ t: 'sfx', name: 'defeat' }, { t: 'banner', text: 'BANKRUPT!', sub: `${nameOf(game, pid)} is out of the game`, color: '#ff4f4f' }, { t: 'log', text: `${nameOf(game, pid)} went bankrupt` });
}

const monopoly = {
  id: 'monopoly',
  name: 'Turf Monopoly',
  tagline: 'Buy the fairway. Charge rent on the green.',
  icon: '🎩',
  description:
    'Everyone starts with $1,500. Each hole is a colour group: its fairway is split into deeds (Lane / Avenue / Row) plus the Green, priced by yardage. ' +
    'Land a non-putt shot on an unowned deed to buy it (Buy/Pass appears under the radar — decide before your next shot). Land on a rival\'s deed and pay rent ' +
    'immediately (double if they own the whole hole). Rough = just visiting. Sand = $50 tax, OB = $100 Luxury Tax (both into the Free Parking jackpot). ' +
    'Water = Go to Jail: your next shot earns nothing and unpaid bail halves your salary. Bullseye or chip-in = Chance card + the jackpot; holing a putt = Community Chest. ' +
    'Finishing a hole pays salary: $400 eagle · $300 birdie · $200 par · $100 bogey. Short of cash? Deeds auto-mortgage; still short = bankrupt. Highest net worth wins.',
  minPlayers: 1,
  maxPlayers: 4,
  needsRival: true,

  init(game) {
    const cash = {}, jail = {}, goojf = {}, ledger = {};
    for (const p of game.players) {
      cash[p.id] = START_CASH; jail[p.id] = false; goojf[p.id] = 0;
      ledger[p.id] = { rentPaid: 0, rentEarned: 0, bought: 0, cards: 0, jailed: 0, taxes: 0, salary: 0 };
    }
    return {
      cash, jail, goojf, ledger, owners: {}, bankrupt: [], pot: 0, pending: {}, last: null, lastCard: null,
      deck: { chance: shuffled(CHANCE.length, hashStr(`${game.id}:chance`)), chest: shuffled(CHEST.length, hashStr(`${game.id}:chest`)), ci: 0, ki: 0 },
      history: [],
    };
  },

  onShot(game, ctx) {
    const ms = game.modeState;
    const { player, shot, geo, holeIdx } = ctx;
    const pid = player.id;
    const ev = [];
    if (isBankrupt(game, pid)) return ev;
    if (ms.pending[pid]) {
      const d = findDeed(game, ms.pending[pid].deedId);
      delete ms.pending[pid];
      ev.push({ t: 'toast', text: `${player.name} let ${d ? d.name : 'the deed'} go back to the bank.` });
    }
    const k = zoneKind(shot);
    const isPutt = shot.type === 'putt';
    if (isPutt && !shot.holed) return ev;
    const jailed = !!ms.jail[pid];
    if (jailed) {
      ms.jail[pid] = false;
      ev.push({ t: 'sfx', name: 'jail' }, { t: 'toast', text: `${player.name} serves their sentence — this shot earns nothing.` });
    }

    // Property
    const deed = !isPutt ? deedForShot(geo, holeIdx, shot) : null;
    if (deed) {
      const o = ms.owners[deed.id];
      if (!o) {
        if (jailed) ev.push({ t: 'toast', text: `${deed.name} is for sale, but you can't buy from jail.` });
        else if (player.cpu) {
          if (ms.cash[pid] >= deed.price + 120) {
            buyDeed(game, pid, deed.id);
            ev.push({ t: 'sfx', name: 'register' }, { t: 'banner', text: 'SOLD!', sub: `${player.name} buys ${deed.name} for $${deed.price}`, color: deed.color });
          } else ev.push({ t: 'toast', text: `${player.name} passes on ${deed.name}.` });
        } else if (ms.cash[pid] >= deed.price) {
          ms.pending[pid] = { deedId: deed.id, hole: holeIdx };
          ev.push({ t: 'sfx', name: 'dice' }, { t: 'toast', text: `${deed.name} is for sale — $${deed.price}. Buy or pass below.` });
        } else ev.push({ t: 'toast', text: `${deed.name} costs $${deed.price} — not enough cash.` });
      } else if (o.pid === pid) {
        ev.push({ t: 'toast', text: `Home turf: ${deed.name}.` });
      } else if (o.mortgaged) {
        ev.push({ t: 'toast', text: `${deed.name} is mortgaged — no rent due.` });
      } else {
        const rent = rentFor(game, deed);
        const r = pay(game, pid, o.pid, rent);
        ms.ledger[pid].rentPaid += r.paid;
        ms.ledger[o.pid].rentEarned += r.paid;
        ms.last = `${player.name} paid $${r.paid} rent to ${nameOf(game, o.pid)} on ${deed.name}`;
        ev.push({ t: 'sfx', name: 'register' }, { t: 'haptic', pattern: [30, 30, 30] },
          { t: 'banner', text: `RENT $${r.paid}`, sub: `${player.name} → ${nameOf(game, o.pid)} · ${deed.name}${hasMonopoly(game, o.pid, deed.hole) ? ' (monopoly ×2)' : ''}`, color: deed.color },
          { t: 'log', text: ms.last });
        noteBust(game, pid, r, ev);
      }
    } else if (k === 'rough') {
      ev.push({ t: 'toast', text: `${player.name} is just visiting the rough.` });
    } else if (k === 'sand' || k === 'ob') {
      const amt = TAX[k];
      const r = pay(game, pid, 'pot', amt);
      ms.ledger[pid].taxes += r.paid;
      ms.last = `${player.name} paid $${r.paid} ${k === 'ob' ? 'Luxury Tax' : 'Sand Trap Tax'}`;
      ev.push({ t: 'sfx', name: 'coin' }, { t: 'banner', text: k === 'ob' ? 'LUXURY TAX' : 'SAND TRAP TAX', sub: `${player.name} pays $${r.paid} into Free Parking`, color: '#ffd84a' }, { t: 'log', text: ms.last });
      noteBust(game, pid, r, ev);
    } else if (k === 'water') {
      goToJail(game, pid, ev, 'Splash! Water hazard');
      ev.push({ t: 'log', text: `${player.name} went to jail (water)` });
    }

    // Wild cards
    if (!isBankrupt(game, pid)) {
      const chip = shot.holed && !isPutt;
      if (shot.zone === 'bullseye' || chip) {
        if (jailed) ev.push({ t: 'toast', text: 'Bullseye from jail — no card this time.' });
        else {
          if (ms.pot > 0) {
            ev.push({ t: 'sfx', name: 'register' }, { t: 'banner', text: 'FREE PARKING!', sub: `${player.name} scoops the $${ms.pot} jackpot`, color: '#9be15d' });
            ms.cash[pid] += ms.pot;
            ms.pot = 0;
          }
          applyCard(game, pid, drawCard(game, 'chance'), 'chance', holeIdx, ev);
        }
      } else if (shot.holed) {
        if (jailed) ev.push({ t: 'toast', text: 'Holed from jail — no Community Chest.' });
        else applyCard(game, pid, drawCard(game, 'chest'), 'chest', holeIdx, ev);
      }
    }
    return ev;
  },

  onHoleComplete(game, ctx) {
    const ms = game.modeState;
    const ev = [];
    const parts = [];
    for (const p of game.players) {
      if (isBankrupt(game, p.id)) continue;
      const r = ctx.results ? ctx.results[p.id] : null;
      const hs = game.holes[ctx.holeIdx];
      const strokes = r ? r.strokes : strokesFor(hs.shots[p.id] || []);
      const par = game.course.holes[ctx.holeIdx].par;
      const picked = r ? r.pickup : !!hs.pickup[p.id];
      const diff = Math.max(-2, strokes - par);
      let sal = picked || strokes >= maxStrokes(par) ? 0 : SALARY[String(diff)] || 0;
      if (ms.jail[p.id]) {
        sal = Math.floor(sal / 2);
        ms.jail[p.id] = false;
        ev.push({ t: 'toast', text: `${p.name} pays bail out of salary (half pay).` });
      }
      ms.cash[p.id] += sal;
      ms.ledger[p.id].salary += sal;
      if (sal) parts.push(`${p.name} +$${sal}`);
    }
    ms.history.push({ hole: ctx.holeIdx, cash: { ...ms.cash }, worth: Object.fromEntries(game.players.map((p) => [p.id, netWorth(game, p.id)])) });
    ev.push({ t: 'sfx', name: 'register' }, { t: 'toast', text: parts.length ? `Salary day: ${parts.join(' · ')}` : 'No salaries this hole.' });
    return ev;
  },

  hud(game) {
    const ms = game.modeState;
    return game.players.map((p) => {
      const bust = isBankrupt(game, p.id);
      const deeds = ownedBy(game, p.id).length;
      return {
        pid: p.id, value: bust ? 'BUST' : `$${formatNum(ms.cash[p.id])}`, label: bust ? 'bankrupt' : `net $${formatNum(netWorth(game, p.id))}`,
        badge: bust ? null : ms.jail[p.id] ? 'JAIL' : ms.pending[p.id] ? 'BUY?' : deeds ? `${deeds} deed${deeds > 1 ? 's' : ''}` : null,
      };
    });
  },

  standings(game) {
    const ms = game.modeState;
    return game.players.map((p) => {
      const bust = ms.bankrupt.indexOf(p.id);
      const w = netWorth(game, p.id);
      return { pid: p.id, score: bust === -1 ? w : -100000 + bust, display: bust === -1 ? `$${formatNum(w)} net · ${ownedBy(game, p.id).length} deeds` : 'Bankrupt' };
    }).sort((a, b) => b.score - a.score);
  },

  isOver(game) {
    if (game.players.length < 2) return false;
    return game.players.filter((p) => !isBankrupt(game, p.id)).length <= 1;
  },

  overlay(ctx, view, game, t) { drawOverlay(ctx, view, game, t); },
  panel(container, game, api) { renderPanel(container, game, api); },
  scene(game, ctx) { return bankScene(game, ctx); },
};

export { monopoly };
export default monopoly;

// ====================================================================== rendering

function drawOverlay(ctx, view, game, t) {
  const ms = game.modeState;
  if (!ms || !ms.owners) return;
  const idx = game.holeIdx;
  const geo = synthesize(game.course.holes[idx]);
  const deeds = holeDeeds(geo, idx);
  const k = view.k;
  ctx.save();
  for (const d of deeds) {
    const o = ms.owners[d.id];
    const col = o ? colorOf(game, o.pid) : d.color;
    if (d.kind === 'fairway') {
      ctx.beginPath();
      let first = true;
      for (let s = d.s0; s <= d.s1 + 0.1; s += 4) {
        const p = view.toScreen(pointAtS(geo.path, s));
        if (first) { ctx.moveTo(p.x, p.y); first = false; } else ctx.lineTo(p.x, p.y);
      }
      ctx.lineCap = 'butt';
      ctx.lineWidth = geo.fairwayWidth * k;
      ctx.strokeStyle = alpha(col, o ? 0.32 : 0.14);
      ctx.stroke();
      // deed boundary ticks
      for (const s of [d.s0, d.s1]) {
        const p = pointAtS(geo.path, s), n = normalAtS(geo.path, s);
        const a = view.toScreen({ x: p.x - n.x * geo.fairwayWidth / 2, y: p.y - n.y * geo.fairwayWidth / 2 });
        const b = view.toScreen({ x: p.x + n.x * geo.fairwayWidth / 2, y: p.y + n.y * geo.fairwayWidth / 2 });
        ctx.setLineDash([4, 3]);
        ctx.lineWidth = 2;
        ctx.strokeStyle = 'rgba(255,255,255,0.7)';
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
        ctx.setLineDash([]);
      }
      const mid = pointAtS(geo.path, (d.s0 + d.s1) / 2), n = normalAtS(geo.path, (d.s0 + d.s1) / 2);
      const tag = view.toScreen({ x: mid.x + n.x * (geo.fairwayWidth / 2 + 6), y: mid.y + n.y * (geo.fairwayWidth / 2 + 6) });
      deedTag(ctx, tag.x, tag.y, d, o ? game.players.find((p) => p.id === o.pid) : null, game, o && o.mortgaged);
    } else {
      const c = view.toScreen(geo.green);
      ctx.lineWidth = o ? 4 : 2;
      ctx.setLineDash(o ? [] : [6, 4]);
      ctx.strokeStyle = o ? col : alpha(d.color, 0.9);
      ctx.beginPath(); ctx.arc(c.x, c.y, geo.green.r * k + 3, 0, Math.PI * 2); ctx.stroke();
      ctx.setLineDash([]);
      deedTag(ctx, c.x + geo.green.r * k + 8, c.y - geo.green.r * k, d, o ? game.players.find((p) => p.id === o.pid) : null, game, o && o.mortgaged);
    }
  }
  if (ms.pot > 0) {
    const pc = view.toScreen(geo.pin);
    const pulse = prefersReducedMotion() ? 0 : Math.sin(t * 4) * 2;
    drawLabel(ctx, `$${ms.pot}`, pc.x, pc.y - 18 - pulse, { size: 13, color: '#9be15d', stroke: '#0d2410' });
  }
  ctx.restore();
}

function deedTag(ctx, x, y, d, owner, game, mortgaged) {
  const w = 74, h = 30;
  const bx = Math.min(Math.max(4, x - w / 2), (ctx.canvas.width / (window.devicePixelRatio || 1)) - w - 4);
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  rrect(ctx, bx + 2, y - h / 2 + 3, w, h, 4); ctx.fill();
  ctx.fillStyle = '#fff7e3';
  rrect(ctx, bx, y - h / 2, w, h, 4); ctx.fill();
  ctx.fillStyle = d.color;
  ctx.fillRect(bx + 2, y - h / 2 + 2, w - 4, 9);
  ctx.fillStyle = '#2a1d10';
  ctx.font = `900 8.5px ${FONT_DISPLAY}`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(d.name.toUpperCase(), bx + 4, y + 4, w - (owner ? 22 : 8));
  ctx.font = `800 8px system-ui`;
  ctx.fillText(owner ? (mortgaged ? 'MORTGAGED' : `RENT $${rentFor(game, d)}`) : `$${d.price}`, bx + 4, y + 11.5, w - 22);
  if (owner) drawToken(ctx, tokenOf(owner, game.players.indexOf(owner)), bx + w - 10, y + 6, 16, owner.color, { shadow: false });
  ctx.restore();
}

function deedCard(game, d, { big = false } = {}) {
  const ms = game.modeState;
  const o = ms.owners[d.id];
  const owner = o ? game.players.find((p) => p.id === o.pid) : null;
  const mono = owner && hasMonopoly(game, owner.id, d.hole);
  return el('article', { class: `bw-deed ${big ? 'is-big' : ''} ${o && o.mortgaged ? 'is-mortgaged' : ''}`, style: { '--deed': d.color }, 'aria-label': `${d.name}, price $${d.price}, rent $${d.rent}${owner ? `, owned by ${owner.name}` : ', for sale'}` },
    el('header', { class: 'bw-deed-band' }, el('small', {}, 'Title deed'), el('strong', {}, d.name)),
    el('dl', { class: 'bw-deed-body' },
      el('div', {}, el('dt', {}, 'Rent'), el('dd', {}, `$${d.rent}`)),
      el('div', {}, el('dt', {}, 'Whole hole'), el('dd', {}, `$${d.rent * 2}`)),
      el('div', {}, el('dt', {}, 'Mortgage'), el('dd', {}, `$${d.mortgage}`))),
    el('footer', { class: 'bw-deed-foot' },
      owner ? el('span', { class: 'bw-deed-owner' }, tokenSVG(tokenOf(owner, game.players.indexOf(owner)), owner.color, 20), owner.name, mono ? el('b', { class: 'bw-star', title: 'Owns the whole hole' }, '★') : null)
        : el('span', { class: 'bw-deed-price' }, `For sale · $${d.price}`)));
}

function renderPanel(container, game, api) {
  const ms = game.modeState;
  clear(container);
  const idx = game.holeIdx;
  const deeds = deedsFor(game, idx);
  const refresh = () => {
    container.dispatchEvent(new CustomEvent('modechange', { bubbles: true }));
    if (api && typeof api.refresh === 'function') api.refresh();
    else renderPanel(container, game, api);
  };
  const prompts = Object.entries(ms.pending).map(([pid, pd]) => {
    const d = findDeed(game, pd.deedId);
    if (!d) return null;
    const p = game.players.find((x) => x.id === pid);
    return el('div', { class: 'bw-buy', role: 'group', 'aria-label': `${p.name} may buy ${d.name}`, style: { '--pc': p.color } },
      deedCard(game, d, { big: true }),
      el('div', { class: 'bw-buy-side' },
        el('p', { class: 'bw-eyebrow' }, `${p.name} landed on`),
        el('h3', {}, d.name),
        el('p', { class: 'bw-buy-cash' }, `Cash $${formatNum(ms.cash[pid])} → $${formatNum(ms.cash[pid] - d.price)}`),
        el('div', { class: 'bw-buy-actions' },
          el('button', { class: 'btn btn-primary', type: 'button', onclick: () => { if (buyDeed(game, pid, d.id)) { sfx.play('register'); refresh(); } else sfx.play('error'); } }, `Buy · $${d.price}`),
          el('button', { class: 'btn btn-ghost', type: 'button', onclick: () => { passDeed(game, pid); sfx.play('undo'); refresh(); } }, 'Pass'))));
  }).filter(Boolean);

  const status = el('div', { class: 'mp-status' },
    el('div', { class: 'mp-pot', 'aria-label': `Free Parking jackpot $${ms.pot}` }, el('small', {}, 'Free Parking'), el('strong', {}, `$${formatNum(ms.pot)}`)),
    game.players.map((p, i) => el('div', { class: `mp-wallet ${isBankrupt(game, p.id) ? 'is-out' : ''}`, style: { '--pc': p.color } },
      tokenSVG(tokenOf(p, i), p.color, 26),
      el('span', { class: 'mp-wallet-name' }, p.name),
      el('strong', {}, isBankrupt(game, p.id) ? 'BUST' : `$${formatNum(ms.cash[p.id])}`),
      ms.jail[p.id] ? el('span', { class: 'mp-flag is-jail' }, 'Jail') : null,
      ms.goojf[p.id] ? el('span', { class: 'mp-flag' }, `Free ×${ms.goojf[p.id]}`) : null)));

  container.append(el('section', { class: 'bw-panel bw-panel--monopoly', 'aria-label': 'Turf Monopoly status' },
    el('div', { class: 'bw-panel-head' }, el('h2', {}, `Hole ${idx + 1} · ${GROUPS[idx % GROUPS.length].name} group`)),
    prompts.length ? el('div', { class: 'bw-buy-list' }, prompts) : null,
    status,
    el('div', { class: 'bw-deeds', role: 'list' }, deeds.map((d) => el('div', { role: 'listitem' }, deedCard(game, d)))),
    el('p', { class: 'bw-ticker', 'aria-live': 'polite' }, ms.lastCard ? `${nameOf(game, ms.lastCard.pid)} drew: “${ms.lastCard.text}”` : ms.last || 'The bank is open. Land on a deed to buy it.')));
}

// ---------------------------------------------------------------- between-hole scene

function bankScene(game, ctx) {
  const ms = game.modeState;
  const holeIdx = ctx ? ctx.holeIdx : game.holeIdx;
  const hist = ms.history;
  const cur = hist.length ? hist[hist.length - 1] : { cash: ms.cash };
  const prev = hist.length > 1 ? hist[hist.length - 2].cash : Object.fromEntries(game.players.map((p) => [p.id, START_CASH]));
  const dur = prefersReducedMotion() ? 2 : 4.8;
  const players = game.players;
  const ranked = monopoly.standings(game);
  return {
    title: `Bank statement · hole ${holeIdx + 1}`,
    caption: 'Counting the till…',
    done: false,
    holdMs: 1300,
    t: 0,
    rang: false,
    update(dt) {
      this.t += dt;
      if (!this.rang && this.t > 0.2) { this.rang = true; sfx.play('register'); }
      if (this.t > dur * 0.55 && !this.cap) {
        this.cap = true;
        const lead = ranked[0];
        this.caption = `${nameOf(game, lead.pid)} leads with ${lead.display}.`;
      }
      if (this.t >= dur) this.done = true;
    },
    draw(c, w, h, api) {
      drawCardboard(c, w, h, { base: '#1c6b55', seed: 31 });
      // felt table + logo stripe
      c.fillStyle = 'rgba(0,0,0,0.18)';
      c.fillRect(0, h * 0.08, w, 30);
      drawLabel(c, 'TURF MONOPOLY · BANK STATEMENT', w / 2, h * 0.08 + 15, { size: 15, color: '#ffd84a', stroke: '#2a1d10' });
      const n = players.length;
      const colW = (w - 24) / n;
      players.forEach((p, i) => {
        const x = 12 + i * colW + colW / 2;
        const from = prev[p.id] ?? START_CASH, to = cur.cash[p.id] ?? ms.cash[p.id];
        const k = ease.outCubic(seg(this.t, 0.4, dur * 0.7));
        const shown = Math.round(from + (to - from) * k);
        const delta = to - from;
        const baseY = h * 0.78;
        // bill stack height ~ cash
        const bills = Math.min(26, Math.round(Math.max(0, shown) / 120));
        for (let b = 0; b < bills; b++) {
          const drop = ease.outBounce(seg(this.t, 0.3 + b * 0.05, 0.6 + b * 0.05));
          const y = baseY - b * 5 - (1 - drop) * 120;
          drawBill(c, x + Math.sin(b * 2.3) * 3, y, Math.min(84, colW * 0.7), b === bills - 1 ? 100 : 50, { rot: Math.sin(b * 1.7) * 0.06 });
        }
        const tok = tokenOf(p, i);
        drawToken(c, tok, x, h * 0.26, Math.min(56, colW * 0.42), p.color, { lift: prefersReducedMotion() ? 0 : Math.abs(Math.sin(this.t * 3 + i)) * 0.3 });
        drawLabel(c, p.name, x, h * 0.37, { size: 15, color: '#fff7e3', stroke: '#0b2b22', maxWidth: colW - 8 });
        drawLabel(c, isBankrupt(game, p.id) ? 'BANKRUPT' : `$${formatNum(shown)}`, x, h * 0.45, { size: Math.min(30, colW * 0.2), color: '#ffd84a', stroke: '#2a1d10' });
        if (delta) drawLabel(c, `${delta > 0 ? '+' : '−'}$${formatNum(Math.abs(delta))}`, x, h * 0.52, { size: 14, color: delta > 0 ? '#9be15d' : '#ff6a5a', stroke: '#0b2b22' });
        // deeds owned (colour chips)
        const mine = ownedBy(game, p.id).map((id) => findDeed(game, id)).filter(Boolean);
        mine.slice(0, 12).forEach((d, j) => {
          const cx = x - Math.min(5, mine.length - 1) * 7 + (j % 6) * 14, cy = h * 0.86 + Math.floor(j / 6) * 14;
          c.fillStyle = '#fff7e3';
          c.fillRect(cx - 6, cy - 5, 12, 12);
          c.fillStyle = d.color;
          c.fillRect(cx - 5, cy - 4, 10, 4);
        });
        if (i === 0) void api;
      });
    },
  };
}
