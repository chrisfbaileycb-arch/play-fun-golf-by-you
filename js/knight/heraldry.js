// Heraldry for Knight Golf: sigil emblems as SVG path data (100×100 box, even-odd fill) so the very same
// artwork renders in canvas (Path2D) and in DOM/SVG avatars. Pure data + tiny drawing helpers.

export const SIGILS = {
  lion: { label: 'Lion', icon: '🦁', motto: 'Courage Unbowed' },
  dragon: { label: 'Dragon', icon: '🐉', motto: 'Fire Before Fear' },
  raven: { label: 'Raven', icon: '🐦‍⬛', motto: 'The Storm Remembers' },
  boar: { label: 'Boar', icon: '🐗', motto: 'Charge Without End' },
};

export const WEAPONS = {
  broadsword: { label: 'Broadsword', icon: '🗡️', verb: 'slashes' },
  battleaxe: { label: 'Battleaxe', icon: '🪓', verb: 'cleaves' },
  flail: { label: 'Flail', icon: '⛓️', verb: 'smashes' },
  longbow: { label: 'Longbow', icon: '🏹', verb: 'looses an arrow at' },
};

/** Elemental ultimate for a knight: sigil picks the element, weapon picks the technique name. */
export function ultimateFor(player) {
  const element = player && (player.sigil === 'dragon' || player.sigil === 'lion') ? 'flame' : 'lightning';
  const names = {
    flame: { broadsword: 'Flame Blade', battleaxe: 'Inferno Cleave', flail: 'Meteor Flail', longbow: 'Fire Arrow Volley' },
    lightning: { broadsword: 'Lightning Smite', battleaxe: 'Thunder Cleave', flail: 'Storm Flail', longbow: 'Thunderbolt Shot' },
  };
  const weapon = WEAPONS[player?.weapon] ? player.weapon : 'broadsword';
  return { kind: element, name: names[element][weapon] };
}

function star(cx, cy, points, rOut, rIn) {
  let d = '';
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 === 0 ? rOut : rIn;
    const a = -Math.PI / 2 + (i * Math.PI) / points;
    d += `${i === 0 ? 'M' : 'L'}${(cx + Math.cos(a) * r).toFixed(1)} ${(cy + Math.sin(a) * r).toFixed(1)} `;
  }
  return `${d}Z`;
}

const circle = (cx, cy, r) => `M${cx - r} ${cy} a${r} ${r} 0 1 0 ${r * 2} 0 a${r} ${r} 0 1 0 ${-r * 2} 0 Z`;

/** Sigil emblem paths (100×100, fill-rule evenodd). */
export const SIGIL_PATHS = {
  lion: [
    star(50, 52, 16, 47, 36),
    circle(50, 55, 27),
    'M33 45 L45 43 L42 50 Z', 'M67 45 L55 43 L58 50 Z',
    'M42 58 L58 58 L50 67 Z',
    'M38 71 Q44 77 50 71 Q56 77 62 71 L62 74 Q56 81 50 75 Q44 81 38 74 Z',
    'M30 36 L37 31 L40 39 Z', 'M70 36 L63 31 L60 39 Z',
  ].join(' '),
  dragon: [
    'M20 96 C20 86 21 80 23 74 L13 71 L25 66 C27 61 29 57 32 53 L22 50 L35 47 C37 45 39 43 41 41 L34 21 L47 35 L49 12 L57 32 C65 29 75 30 84 35 L96 39 L86 45 L95 50 L80 52 C72 54 65 56 59 61 C53 69 49 81 48 96 Z',
    'M60 37 L69 36 L64 42 Z',
    'M86 39 L90 40 L87 42 Z',
    'M62 50 L78 48 L70 51 Z',
  ].join(' '),
  raven: [
    'M8 63 L25 56 C29 46 40 40 52 40 C56 32 64 27 72 28 C78 29 82 32 84 35 L97 40 L84 43 C84 51 80 59 72 65 C66 71 58 75 50 77 L56 91 L52 93 L46 79 L42 93 L38 93 L40 79 C30 77 19 71 8 63 Z',
    'M28 60 C42 51 58 52 70 58 C58 60 46 62 32 66 Z',
    circle(73, 34, 2.6),
  ].join(' '),
  boar: [
    'M5 57 L13 50 C17 42 25 36 35 33 L37 25 L44 31 C50 27 58 25 64 26 L66 18 L70 26 L75 20 L77 29 C85 32 93 40 95 50 C96 58 93 64 88 67 L88 82 L81 82 L79 69 L54 71 L52 82 L45 82 L43 69 C35 67 28 64 22 63 L15 65 L7 65 Z',
    'M17 57 C19 50 24 47 29 47 C24 50 22 54 21 59 Z',
    'M30 42 L36 41 L33 46 Z',
  ].join(' '),
};

/** Heater-shield outline (100×100). */
export const SHIELD_PATH = 'M8 6 H92 V42 C92 70 74 87 50 97 C26 87 8 70 8 42 Z';

const pathCache = new Map();
function path2d(d) {
  if (!pathCache.has(d)) pathCache.set(d, new Path2D(d));
  return pathCache.get(d);
}

/** Draw a sigil centred at (x,y) with the given size (px) and fill. `flip` mirrors horizontally. */
export function drawSigil(ctx, sigil, x, y, size, fill, { flip = false, stroke = null } = {}) {
  const d = SIGIL_PATHS[sigil] || SIGIL_PATHS.lion;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale((flip ? -1 : 1) * size / 100, size / 100);
  ctx.translate(-50, -52);
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 6; ctx.lineJoin = 'round'; ctx.stroke(path2d(d)); }
  ctx.fillStyle = fill;
  ctx.fill(path2d(d), 'evenodd');
  ctx.restore();
}

/** Draw a heraldic heater shield (player field colour, gold border, parchment sigil). */
export function drawShield(ctx, x, y, size, color, sigil, { flip = false, border = '#e9b949', charge = '#f8ecd0', shade = true } = {}) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(size / 100, size / 100);
  ctx.translate(-50, -50);
  const p = path2d(SHIELD_PATH);
  ctx.fillStyle = color;
  ctx.fill(p);
  if (shade) {
    const g = ctx.createLinearGradient(8, 0, 92, 100);
    g.addColorStop(0, 'rgba(255,255,255,0.32)');
    g.addColorStop(0.45, 'rgba(255,255,255,0)');
    g.addColorStop(1, 'rgba(0,0,0,0.42)');
    ctx.fillStyle = g;
    ctx.fill(p);
  }
  ctx.lineWidth = 7;
  ctx.strokeStyle = border;
  ctx.lineJoin = 'round';
  ctx.stroke(p);
  ctx.lineWidth = 2;
  ctx.strokeStyle = 'rgba(0,0,0,0.55)';
  ctx.stroke(p);
  ctx.restore();
  drawSigil(ctx, sigil, x, y + size * 0.02, size * 0.62, charge, { flip });
}

/** SVG markup-free crest avatar (DOM node) built with the namespaced svg() helper. */
export function crestSVG(svgFn, player, size = 28) {
  const color = player?.color || '#c0392b';
  const sigil = SIGIL_PATHS[player?.sigil] ? player.sigil : 'lion';
  const node = svgFn('svg', { viewBox: '0 0 100 100', width: size, height: size, 'aria-hidden': 'true', class: 'kg-crest', focusable: 'false' },
    svgFn('path', { d: SHIELD_PATH, fill: color, stroke: '#e9b949', 'stroke-width': 8, 'stroke-linejoin': 'round' }),
    svgFn('path', { d: 'M8 6 H92 V42 C92 50 90 57 87 63 L13 22 Z', fill: '#ffffff', opacity: 0.16 }),
    svgFn('g', { transform: 'translate(50 51) scale(0.6) translate(-50 -52)' },
      svgFn('path', { d: SIGIL_PATHS[sigil], fill: '#f8ecd0', 'fill-rule': 'evenodd' })));
  return node;
}
