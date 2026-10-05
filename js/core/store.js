// Persistence (localStorage) and report export (JSON / SVG / PNG). All imports are validated.
import { validateGame } from './game.js';
import { sanitizeCourse } from './course.js';
import { el } from './util.js';

const KEY = 'arcade-links/game/v1';
const PROFILE_KEY = 'arcade-links/profiles/v1';

export function saveGame(game) {
  try { localStorage.setItem(KEY, JSON.stringify(game)); } catch { /* quota / private mode */ }
}

export function loadGame() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw || raw.length > 2_000_000) return null;
    const g = JSON.parse(raw);
    if (!validateGame(g)) return null;
    const course = sanitizeCourse(g.course);
    if (!course || course.holes.length !== g.holes.length) return null;
    g.course = course;
    return g;
  } catch { return null; }
}

export function clearGame() {
  try { localStorage.removeItem(KEY); } catch { /* ignore */ }
}

export function saveProfiles(suite, players) {
  try {
    const all = JSON.parse(localStorage.getItem(PROFILE_KEY) || '{}');
    all[suite] = players.filter((p) => !p.cpu).map((p) => {
      const { id, ...rest } = p;
      return rest;
    });
    localStorage.setItem(PROFILE_KEY, JSON.stringify(all));
  } catch { /* ignore */ }
}

export function loadProfiles(suite) {
  try {
    const all = JSON.parse(localStorage.getItem(PROFILE_KEY) || '{}');
    const list = Array.isArray(all[suite]) ? all[suite] : [];
    return list.slice(0, 4).map((p) => ({ ...p, name: String(p.name || '').slice(0, 18) }));
  } catch { return []; }
}

export function download(filename, blob) {
  const url = URL.createObjectURL(blob);
  const a = el('a', { href: url, download: filename });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function exportJSON(game, extra = {}) {
  const data = { app: 'arcade-links', exportedAt: new Date().toISOString(), ...extra, game };
  download(`${game.suite}-${game.modeId}-${new Date().toISOString().slice(0, 10)}.json`,
    new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
}

export function exportCanvasPNG(canvas, filename) {
  canvas.toBlob((b) => b && download(filename, b), 'image/png');
}

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/**
 * Generic SVG scorecard report. rows: [{name, color, cells:[...per hole], total, extra}]
 * theme: {bg, ink, accent, font, title}
 */
export function buildSVGReport({ title, subtitle, holes, rows, titles = [], theme }) {
  const W = 900, rowH = 44, top = 150;
  const H = top + (rows.length + 1) * rowH + 60 + titles.length * 34 + 40;
  const colW = (W - 300) / (holes.length + 1);
  const parts = [];
  parts.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`);
  parts.push(`<rect width="100%" height="100%" fill="${theme.bg}"/>`);
  parts.push(`<rect x="14" y="14" width="${W - 28}" height="${H - 28}" fill="none" stroke="${theme.accent}" stroke-width="4" rx="12"/>`);
  parts.push(`<text x="${W / 2}" y="70" text-anchor="middle" font-family="${theme.font}" font-size="40" font-weight="900" fill="${theme.ink}">${esc(title)}</text>`);
  parts.push(`<text x="${W / 2}" y="106" text-anchor="middle" font-family="${theme.font}" font-size="18" fill="${theme.accent}">${esc(subtitle)}</text>`);
  parts.push(`<text x="40" y="${top}" font-family="${theme.font}" font-size="16" font-weight="700" fill="${theme.ink}">HOLE</text>`);
  holes.forEach((h, i) => parts.push(`<text x="${280 + colW * (i + 0.5)}" y="${top}" text-anchor="middle" font-family="${theme.font}" font-size="15" font-weight="700" fill="${theme.ink}">${esc(h)}</text>`));
  parts.push(`<text x="${280 + colW * (holes.length + 0.5)}" y="${top}" text-anchor="middle" font-family="${theme.font}" font-size="15" font-weight="900" fill="${theme.accent}">TOT</text>`);
  rows.forEach((r, ri) => {
    const y = top + (ri + 1) * rowH;
    parts.push(`<line x1="30" x2="${W - 30}" y1="${y - 28}" y2="${y - 28}" stroke="${theme.accent}" stroke-opacity="0.35"/>`);
    parts.push(`<circle cx="44" cy="${y - 6}" r="8" fill="${r.color}"/>`);
    parts.push(`<text x="60" y="${y}" font-family="${theme.font}" font-size="18" font-weight="700" fill="${theme.ink}">${esc(r.name)}</text>`);
    r.cells.forEach((c, i) => parts.push(`<text x="${280 + colW * (i + 0.5)}" y="${y}" text-anchor="middle" font-family="${theme.font}" font-size="16" fill="${theme.ink}">${esc(c ?? '–')}</text>`));
    parts.push(`<text x="${280 + colW * (holes.length + 0.5)}" y="${y}" text-anchor="middle" font-family="${theme.font}" font-size="18" font-weight="900" fill="${theme.accent}">${esc(r.total)}</text>`);
  });
  let y = top + (rows.length + 1) * rowH + 40;
  titles.forEach((t) => {
    parts.push(`<text x="40" y="${y}" font-family="${theme.font}" font-size="18" font-weight="900" fill="${theme.accent}">${esc(t.title)}</text>`);
    parts.push(`<text x="330" y="${y}" font-family="${theme.font}" font-size="17" fill="${theme.ink}">${esc(t.name)} — ${esc(t.desc)}</text>`);
    y += 34;
  });
  parts.push('</svg>');
  return parts.join('');
}

export function downloadSVG(svgString, filename) {
  download(filename, new Blob([svgString], { type: 'image/svg+xml' }));
}

/** Rasterise an SVG string to PNG and download. */
export function svgToPNG(svgString, filename) {
  const img = new Image();
  const url = URL.createObjectURL(new Blob([svgString], { type: 'image/svg+xml' }));
  img.onload = () => {
    const c = document.createElement('canvas');
    c.width = img.width * 2;
    c.height = img.height * 2;
    const ctx = c.getContext('2d');
    ctx.scale(2, 2);
    ctx.drawImage(img, 0, 0);
    URL.revokeObjectURL(url);
    exportCanvasPNG(c, filename);
  };
  img.src = url;
}

/** Parse an imported JSON file (game export or bare course) safely. */
export async function readJSONFile(file) {
  if (!file || file.size > 2_000_000) throw new Error('File too large');
  const text = await file.text();
  return JSON.parse(text);
}
