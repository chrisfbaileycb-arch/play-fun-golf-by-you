// Boardwalk Links — shared board-game rendering helpers (tokens, pawns, tiles, cardboard, money).
// Pure helpers (zoneKind, names) are DOM-free so mode logic can import this file in tests.
import { mulberry32, hashStr, svg, rrect, clamp } from '../core/util.js';

export const FONT_DISPLAY = "'Rockwell', 'Rockwell Extra Bold', 'Arial Black', 'Helvetica Neue', serif";
export const FONT_BODY = "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";

/** Tabletop palette (canvas + CSS agree). */
export const PAL = {
  board: '#f3e3c3', boardDark: '#e2c99a', ink: '#2a1d10', inkSoft: '#5a4630', felt: '#0f5d4a', feltDark: '#0a3f33',
  red: '#d7263d', gold: '#ffd84a', cyan: '#33d6ff', pink: '#ff4fd8', lime: '#9be15d', navy: '#14213d', cream: '#fff7e3',
  wood: '#8a5a2b', woodDark: '#5c3a1a', woodLight: '#b9834a', money: '#cfe8c4', moneyInk: '#24563a',
};

// ---------------------------------------------------------------- tokens
const TOKEN_PATHS = {
  visor: {
    parts: [
      { d: 'M2 16.5C4 13 8 10 12 10s8 3 10 6.5c-2.5 2.5-6 4-10 4s-7.5-1.5-10-4z', tone: 'metal' },
      { d: 'M5 15.5c2-1.5 4.5-2.2 7-2.2s5 .7 7 2.2v1.8c-2.2.8-4.5 1.2-7 1.2s-4.8-.4-7-1.2z', tone: 'dark' },
      { d: 'M4 14.5c2.2-2 5-3 8-3s5.8 1 8 3', tone: 'metal' },
    ],
  },
  cart: {
    parts: [
      { d: 'M4 7h14v2H4zM5 9v4M17 9v4M3 13h16l2 3v3H2v-3z', tone: 'metal' },
      { d: 'M5 18a2 2 0 1 0 4 0a2 2 0 1 0-4 0zM13 18a2 2 0 1 0 4 0a2 2 0 1 0-4 0z', tone: 'dark' },
      { d: 'M1 12l2 4h2l-2-4zM10 12l2-2h2', tone: 'dark' },
    ],
  },
  gopher: {
    parts: [
      { d: 'M7 8a2 2 0 1 1 2-2M13 6a2 2 0 1 1 2 2M6 10c0-2.8 2.5-5 5.5-5s5.5 2.2 5.5 5c0 1.6-.8 3-2 3.8 1.2 1.2 2 2.8 2 5.2H5c0-2.4.8-4 2-5.2C5.8 13 6 11.6 6 10z', tone: 'metal' },
      { d: 'M9.5 13a2 2 0 1 0 4 0a2 2 0 1 0-4 0z', tone: 'dark' },
      { d: 'M10.5 9h2v1.5h-2z', tone: 'dark' },
    ],
  },
  beercan: {
    parts: [
      { d: 'M6 6.5c0-1.2 2.7-2 6-2s6 .8 6 2v11c0 1.2-2.7 2-6 2s-6-.8-6-2z', tone: 'metal' },
      { d: 'M6 6.5c0 1.2 2.7 2 6 2s6-.8 6-2M7 11h10v4H7z', tone: 'dark' },
      { d: 'M10.5 4.8h3v1.8h-3z', tone: 'dark' },
    ],
  },
  mashie: {
    parts: [
      { d: 'M15 3l-4 13-1.5-.4 4-13z', tone: 'dark' },
      { d: 'M10.5 15.5l-6.5 1.8c-.8.2-1.2.9-1 1.6l.4 1c.2.6.8.9 1.5.7l8.5-2.4c.7-.2 1.1-.9.9-1.6l-.4-1c-.2-.6-.8-.9-1.5-.7l-1.9.6z', tone: 'metal' },
      { d: 'M4.5 18.5l4.5-1.2M5 19.5l4.5-1.2', tone: 'dark' },
    ],
  },
  divot: {
    parts: [
      { d: 'M8 4c0-.6 1.8-1 4-1s4 .4 4 1v7c0 1-1.8 2-4 2s-4-1-4-2z', tone: 'metal' },
      { d: 'M10 7a2 2 0 1 0 4 0a2 2 0 1 0-4 0z', tone: 'dark' },
      { d: 'M9 13v7l1.5-1.2v-5.8M13.5 13v5.8l1.5 1.2v-7', tone: 'metal' },
    ],
  },
};

// Aliases for backwards compatibility with any saved games
TOKEN_PATHS.tophat = TOKEN_PATHS.visor;
TOKEN_PATHS.roadster = TOKEN_PATHS.cart;
TOKEN_PATHS.scottie = TOKEN_PATHS.gopher;
TOKEN_PATHS.thimble = TOKEN_PATHS.beercan;

const OLD_TOKEN_MAP = {
  tophat: 'visor',
  roadster: 'cart',
  scottie: 'gopher',
  thimble: 'beercan',
};

export const TOKENS = [
  { value: 'visor', label: 'The Visor', icon: '🧢' },
  { value: 'cart', label: 'The Golf Cart', icon: '🛺' },
  { value: 'gopher', label: 'The Gopher', icon: '🐹' },
  { value: 'beercan', label: 'The Beer Can', icon: '🍺' },
  { value: 'mashie', label: 'The Vintage Mashie', icon: '🏌️' },
  { value: 'divot', label: 'The Divot Tool', icon: '🍴' },
];
export const TOKEN_KINDS = TOKENS.map((t) => t.value);
export const tokenLabel = (kind) => (TOKENS.find((t) => t.value === kind) || TOKENS[0]).label;
export const tokenOf = (player, i = 0) => {
  const t = player?.token;
  if (TOKEN_KINDS.includes(t)) return t;
  if (OLD_TOKEN_MAP[t]) return OLD_TOKEN_MAP[t];
  return TOKEN_KINDS[i % TOKEN_KINDS.length];
};

/** Fresh SVG node for a token (DOM). `color` paints the base disc. */
export function tokenSVG(kind, color = PAL.red, size = 28, { label = null } = {}) {
  const def = TOKEN_PATHS[kind] || TOKEN_PATHS.tophat;
  const gid = `tk-${kind}-${Math.random().toString(36).slice(2, 7)}`;
  const node = svg('svg', { viewBox: '0 0 24 24', width: size, height: size, class: 'bw-token', role: label ? 'img' : null, 'aria-hidden': label ? null : 'true', 'aria-label': label },
    svg('defs', {},
      svg('linearGradient', { id: gid, x1: '0', y1: '0', x2: '1', y2: '1' },
        svg('stop', { offset: '0', 'stop-color': '#ffffff' }),
        svg('stop', { offset: '0.45', 'stop-color': '#b9bec5' }),
        svg('stop', { offset: '1', 'stop-color': '#5e646c' }))),
    svg('ellipse', { cx: 12, cy: 21.4, rx: 10.5, ry: 2.4, fill: color, stroke: '#1d140a', 'stroke-width': 0.8 }),
    def.parts.map((p) => svg('path', {
      d: p.d, fill: p.tone === 'metal' ? `url(#${gid})` : '#3b4046', stroke: '#22262a', 'stroke-width': p.tone === 'metal' ? 0.9 : 0.4, 'stroke-linejoin': 'round',
    })));
  return node;
}

const pathCache = new Map();
function path2d(d) {
  if (!pathCache.has(d)) pathCache.set(d, new Path2D(d));
  return pathCache.get(d);
}

/** Draw a pewter Monopoly-style token centred at (x,y), `s` = height in px. */
export function drawToken(ctx, kind, x, y, s, color = PAL.red, { lift = 0, shadow = true } = {}) {
  const def = TOKEN_PATHS[kind] || TOKEN_PATHS.tophat;
  const k = s / 24;
  ctx.save();
  if (shadow) {
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    ctx.beginPath();
    ctx.ellipse(x, y + s * 0.42, s * 0.42 * (1 - lift * 0.3), s * 0.1, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.translate(x - 12 * k, y - 12 * k - lift * s * 0.5);
  ctx.scale(k, k);
  ctx.fillStyle = color;
  ctx.strokeStyle = '#1d140a';
  ctx.lineWidth = 0.9;
  ctx.beginPath();
  ctx.ellipse(12, 21.4, 10.5, 2.4, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  const g = ctx.createLinearGradient(2, 3, 22, 22);
  g.addColorStop(0, '#ffffff');
  g.addColorStop(0.45, '#b9bec5');
  g.addColorStop(1, '#5e646c');
  for (const p of def.parts) {
    const pp = path2d(p.d);
    ctx.fillStyle = p.tone === 'metal' ? g : '#3b4046';
    ctx.fill(pp);
    ctx.lineWidth = p.tone === 'metal' ? 0.9 : 0.4;
    ctx.strokeStyle = '#22262a';
    ctx.stroke(pp);
  }
  ctx.restore();
}

/** Glossy plastic Sorry!-style pawn. (x,y) = base centre, s = total height. */
export function drawPawn(ctx, x, y, s, color, { squash = 0, shadow = true, ring = null } = {}) {
  const w = s * 0.5;
  ctx.save();
  if (shadow) {
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath();
    ctx.ellipse(x, y, w * 0.62, w * 0.2, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  if (ring) {
    ctx.strokeStyle = ring;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.ellipse(x, y, w * 0.85, w * 0.3, 0, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.translate(x, y);
  ctx.scale(1 + squash * 0.25, 1 - squash * 0.25);
  const body = ctx.createLinearGradient(-w / 2, 0, w / 2, 0);
  body.addColorStop(0, shade(color, -0.35));
  body.addColorStop(0.35, shade(color, 0.25));
  body.addColorStop(1, shade(color, -0.45));
  ctx.fillStyle = body;
  ctx.strokeStyle = 'rgba(0,0,0,0.55)';
  ctx.lineWidth = 1.2;
  // base
  ctx.beginPath();
  ctx.ellipse(0, -s * 0.06, w * 0.5, w * 0.17, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  // cone body
  ctx.beginPath();
  ctx.moveTo(-w * 0.46, -s * 0.08);
  ctx.quadraticCurveTo(-w * 0.12, -s * 0.36, -w * 0.16, -s * 0.62);
  ctx.lineTo(w * 0.16, -s * 0.62);
  ctx.quadraticCurveTo(w * 0.12, -s * 0.36, w * 0.46, -s * 0.08);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  // collar
  ctx.beginPath();
  ctx.ellipse(0, -s * 0.63, w * 0.3, w * 0.09, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  // head
  const hg = ctx.createRadialGradient(-w * 0.1, -s * 0.84, 1, 0, -s * 0.8, w * 0.34);
  hg.addColorStop(0, shade(color, 0.6));
  hg.addColorStop(0.5, color);
  hg.addColorStop(1, shade(color, -0.4));
  ctx.fillStyle = hg;
  ctx.beginPath();
  ctx.arc(0, -s * 0.8, w * 0.3, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  // specular
  ctx.fillStyle = 'rgba(255,255,255,0.65)';
  ctx.beginPath();
  ctx.ellipse(-w * 0.1, -s * 0.86, w * 0.08, w * 0.05, -0.6, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/** Lighten (amt>0) or darken (amt<0) a #rrggbb colour. */
export function shade(hex, amt) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  const f = (c) => Math.round(amt >= 0 ? c + (255 - c) * amt : c * (1 + amt));
  r = f(r); g = f(g); b = f(b);
  return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`;
}

export const alpha = (hex, a) => {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
};

// ---------------------------------------------------------------- surfaces
const texCache = new Map();
/** Vintage cardboard fill with fibres, speckle and vignette (cached per size/colour). */
export function drawCardboard(ctx, w, h, { base = PAL.board, seed = 7, vignette = true } = {}) {
  const key = `${Math.round(w)}x${Math.round(h)}:${base}:${seed}:${vignette}`;
  let tex = texCache.get(key);
  if (!tex) {
    tex = document.createElement('canvas');
    tex.width = Math.max(1, Math.round(w));
    tex.height = Math.max(1, Math.round(h));
    const c = tex.getContext('2d');
    c.fillStyle = base;
    c.fillRect(0, 0, w, h);
    const rng = mulberry32(seed);
    const n = Math.round((w * h) / 90);
    for (let i = 0; i < n; i++) {
      const x = rng() * w, y = rng() * h;
      const dark = rng() < 0.55;
      c.fillStyle = dark ? `rgba(90,60,25,${0.03 + rng() * 0.07})` : `rgba(255,250,235,${0.04 + rng() * 0.08})`;
      if (rng() < 0.25) {
        c.save();
        c.translate(x, y);
        c.rotate(rng() * Math.PI);
        c.fillRect(0, 0, 3 + rng() * 9, 0.8);
        c.restore();
      } else c.fillRect(x, y, 1.2, 1.2);
    }
    // corrugation hint
    c.globalAlpha = 0.05;
    c.fillStyle = '#6b4a22';
    for (let y = 0; y < h; y += 7) c.fillRect(0, y, w, 2);
    c.globalAlpha = 1;
    if (vignette) {
      const g = c.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.25, w / 2, h / 2, Math.max(w, h) * 0.75);
      g.addColorStop(0, 'rgba(0,0,0,0)');
      g.addColorStop(1, 'rgba(60,35,10,0.38)');
      c.fillStyle = g;
      c.fillRect(0, 0, w, h);
    }
    if (texCache.size > 24) texCache.clear();
    texCache.set(key, tex);
  }
  ctx.drawImage(tex, 0, 0, w, h);
}

/** Wood-grain frame around a rect (outer rect given). */
export function drawWoodFrame(ctx, x, y, w, h, t = 14) {
  ctx.save();
  const g = ctx.createLinearGradient(x, y, x, y + h);
  g.addColorStop(0, PAL.woodLight);
  g.addColorStop(0.5, PAL.wood);
  g.addColorStop(1, PAL.woodDark);
  ctx.fillStyle = g;
  rrect(ctx, x, y, w, h, t);
  ctx.fill();
  ctx.globalCompositeOperation = 'source-atop';
  ctx.strokeStyle = 'rgba(40,20,5,0.25)';
  ctx.lineWidth = 1;
  const rng = mulberry32(hashStr(`${Math.round(w)}${Math.round(h)}`));
  for (let i = 0; i < 26; i++) {
    const yy = y + rng() * h;
    ctx.beginPath();
    ctx.moveTo(x, yy);
    ctx.bezierCurveTo(x + w * 0.3, yy + (rng() - 0.5) * 10, x + w * 0.7, yy + (rng() - 0.5) * 10, x + w, yy + (rng() - 0.5) * 6);
    ctx.stroke();
  }
  ctx.restore();
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  rrect(ctx, x + t - 2, y + t - 2, w - 2 * t + 4, h - 2 * t + 4, 6);
  ctx.fill();
}

/** Chunky outlined display text. */
export function drawLabel(ctx, text, x, y, { size = 20, color = PAL.cream, stroke = PAL.ink, align = 'center', baseline = 'middle', weight = 900, font = FONT_DISPLAY, lw = null, maxWidth } = {}) {
  ctx.save();
  ctx.font = `${weight} ${size}px ${font}`;
  ctx.textAlign = align;
  ctx.textBaseline = baseline;
  if (stroke) {
    ctx.lineJoin = 'round';
    ctx.lineWidth = lw ?? Math.max(2, size / 6);
    ctx.strokeStyle = stroke;
    ctx.strokeText(text, x, y, maxWidth);
  }
  ctx.fillStyle = color;
  ctx.fillText(text, x, y, maxWidth);
  ctx.restore();
}

/** Square board tile with bevel. */
export function drawTile(ctx, x, y, w, h, { fill = PAL.cream, edge = PAL.ink, r = 4, bevel = true } = {}) {
  ctx.save();
  ctx.fillStyle = edge;
  rrect(ctx, x, y, w, h, r);
  ctx.fill();
  ctx.fillStyle = fill;
  rrect(ctx, x + 1.5, y + 1.5, w - 3, h - 3, Math.max(1, r - 1));
  ctx.fill();
  if (bevel) {
    ctx.fillStyle = 'rgba(255,255,255,0.28)';
    ctx.fillRect(x + 2, y + 2, w - 4, Math.max(1, h * 0.12));
    ctx.fillStyle = 'rgba(0,0,0,0.12)';
    ctx.fillRect(x + 2, y + h - 2 - h * 0.1, w - 4, h * 0.1);
  }
  ctx.restore();
}

/** Paper banknote. */
export function drawBill(ctx, x, y, w, amount, { rot = 0, color = PAL.money } = {}) {
  const h = w * 0.48;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.fillStyle = color;
  ctx.strokeStyle = PAL.moneyInk;
  ctx.lineWidth = 1.2;
  ctx.fillRect(-w / 2, -h / 2, w, h);
  ctx.strokeRect(-w / 2, -h / 2, w, h);
  ctx.strokeRect(-w / 2 + 3, -h / 2 + 3, w - 6, h - 6);
  ctx.fillStyle = PAL.moneyInk;
  ctx.font = `900 ${Math.round(h * 0.45)}px ${FONT_DISPLAY}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(`$${amount}`, 0, 1);
  ctx.restore();
}

/** Classic pip die face. */
export function drawDie(ctx, x, y, s, n, rot = 0) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.fillStyle = '#fffdf6';
  ctx.strokeStyle = PAL.ink;
  ctx.lineWidth = 2;
  rrect(ctx, -s / 2, -s / 2, s, s, s * 0.18);
  ctx.fill();
  ctx.stroke();
  const pips = { 1: [[0, 0]], 2: [[-1, -1], [1, 1]], 3: [[-1, -1], [0, 0], [1, 1]], 4: [[-1, -1], [1, -1], [-1, 1], [1, 1]], 5: [[-1, -1], [1, -1], [0, 0], [-1, 1], [1, 1]], 6: [[-1, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [1, 1]] }[clamp(n | 0, 1, 6)];
  ctx.fillStyle = PAL.red;
  for (const [a, b] of pips) {
    ctx.beginPath();
    ctx.arc(a * s * 0.26, b * s * 0.26, s * 0.085, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/** Neon-tube glow stroke helper. */
export function neon(ctx, color, width, drawPath) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.shadowColor = color;
  ctx.shadowBlur = width * 3;
  ctx.lineWidth = width;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  drawPath();
  ctx.stroke();
  ctx.shadowBlur = 0;
  ctx.strokeStyle = 'rgba(255,255,255,0.75)';
  ctx.lineWidth = Math.max(1, width * 0.35);
  ctx.stroke();
  ctx.restore();
}

// ---------------------------------------------------------------- pure helpers
/** Collapse unified zones for board-game rules. Holed shots → 'cup'; bullseye/inner/green → 'green'. */
export function zoneKind(shot) {
  if (!shot) return 'none';
  if (shot.holed || shot.zone === 'cup') return 'cup';
  switch (shot.zone) {
    case 'bullseye': case 'inner': case 'green': return 'green';
    case 'roughL': case 'roughR': return 'rough';
    default: return shot.zone;
  }
}

export const nameOf = (game, pid) => (game.players.find((p) => p.id === pid) || { name: '?' }).name;
export const colorOf = (game, pid) => (game.players.find((p) => p.id === pid) || { color: '#888888' }).color;
export const playerIdx = (game, pid) => Math.max(0, game.players.findIndex((p) => p.id === pid));

/** Defer a canvas draw until the element is laid out (panels are rendered before insertion). */
export function whenSized(canvas, fn) {
  let tries = 0;
  const go = () => {
    if (!canvas.isConnected || canvas.getBoundingClientRect().width < 2) {
      if (tries++ < 30) requestAnimationFrame(go);
      return;
    }
    fn();
  };
  requestAnimationFrame(go);
}
