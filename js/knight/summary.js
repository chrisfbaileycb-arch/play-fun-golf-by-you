// Medieval parchment scroll post-round summary for Knight Golf.
import { el, clear } from '../core/util.js';
import { sfx } from '../core/audio.js';
import { buildSVGReport, downloadSVG, svgToPNG } from '../core/store.js';
import { leaderBy } from '../core/stats.js';

export function renderKnightSummary(container, game, mode, api) {
  clear(container);
  sfx.play('scroll');
  setTimeout(() => sfx.play('fanfare'), 400);

  const standings = api.standings || [];
  const stats = api.stats || [];

  // Compute Bestowed Titles
  const titles = [];
  const greenFletcher = leaderBy(stats, 'closest', { min: true, requirePositive: true });
  if (greenFletcher) {
    const p = game.players.find((x) => x.id === greenFletcher.pid);
    titles.push({ title: 'The Green Fletcher', name: p?.name || 'Knight', desc: `Closest to the pin (${greenFletcher.v} yds)` });
  }

  const ironVanguard = leaderBy(stats, 'fairways');
  if (ironVanguard && ironVanguard.v > 0) {
    const p = game.players.find((x) => x.id === ironVanguard.pid);
    titles.push({ title: 'Iron Vanguard', name: p?.name || 'Knight', desc: `Most Fairways Secured (${ironVanguard.v})` });
  }

  const berserker = leaderBy(stats, 'longestCarry');
  if (berserker && berserker.v > 0) {
    const p = game.players.find((x) => x.id === berserker.pid);
    titles.push({ title: 'The Berserker', name: p?.name || 'Knight', desc: `Longest Drive (${berserker.v} yds)` });
  }

  const courtJester = leaderBy(stats, 'sand');
  if (courtJester && courtJester.v > 0) {
    const p = game.players.find((x) => x.id === courtJester.pid);
    titles.push({ title: 'Court Jester', name: p?.name || 'Knight', desc: `Most Sand Traps Visited (${courtJester.v})` });
  }

  // Build the Medieval Scroll
  const scrollWrap = el('div', { class: 'parchment-scroll-wrap' });
  const scroll = el('div', { class: 'parchment-scroll', role: 'region', 'aria-label': 'Royal Tournament Scroll' });

  // Header
  const header = el('div', { class: 'scroll-header' },
    el('div', { class: 'scroll-seal', 'aria-hidden': 'true' }, '🛡️'),
    el('h2', { class: 'scroll-title' }, 'Royal Tournament Scroll'),
    el('p', { class: 'scroll-subtitle' }, `Decreed at Camelot Greens · ${mode.name}`));

  // Standings table
  const table = el('table', { class: 'scroll-standings' },
    el('thead', {},
      el('tr', {},
        el('th', {}, 'Rank'),
        el('th', {}, 'Knight'),
        el('th', { style: { textAlign: 'right' } }, 'Score / Standing'))),
    el('tbody', {},
      ...standings.map((s, idx) => {
        const p = game.players.find((x) => x.id === s.pid);
        return el('tr', {},
          el('td', {}, `#${idx + 1}`),
          el('td', {},
            el('span', { style: { color: p?.color || '#000', marginRight: '6px' } }, '⚔'),
            p?.name || 'Knight'),
          el('td', { style: { textAlign: 'right', color: '#8c2d19' } }, s.display));
      })));

  // Titles section
  const titlesSection = el('div', { class: 'scroll-titles-grid' },
    ...titles.map((t) => el('div', { class: 'scroll-title-card' },
      el('div', { class: 'scroll-title-name' }, `👑 ${t.title}`),
      el('div', { class: 'scroll-title-recipient' }, t.name),
      el('div', { class: 'scroll-title-desc' }, t.desc))));

  // Action Buttons
  const actions = el('div', { class: 'scroll-actions' },
    el('button', {
      type: 'button', class: 'btn btn-primary',
      onclick: () => exportScrollSVG(game, standings, titles, false),
    }, '📜 Download SVG Scroll'),
    el('button', {
      type: 'button', class: 'btn btn-ghost',
      onclick: () => exportScrollSVG(game, standings, titles, true),
    }, '🖼️ Download PNG Image'),
    el('button', {
      type: 'button', class: 'btn btn-ghost',
      onclick: api.exportJSON,
    }, '💾 Export JSON'),
    el('button', {
      type: 'button', class: 'btn btn-ghost',
      onclick: api.restart,
    }, '⚔️ Play Again'),
    el('button', {
      type: 'button', class: 'btn btn-ghost',
      onclick: api.home,
    }, '🏰 Royal Court (Home)'));

  scroll.append(header, table, titlesSection, actions);
  scrollWrap.appendChild(scroll);
  container.appendChild(scrollWrap);
}

function exportScrollSVG(game, standings, titles, asPNG) {
  const holes = game.course.holes.map((h) => `#${h.n}`);
  const rows = standings.map((s) => {
    const p = game.players.find((x) => x.id === s.pid);
    const cells = game.holes.map((h, i) => {
      const shots = h.shots[s.pid] || [];
      return shots.length ? `${shots.length}` : '–';
    });
    return {
      name: p?.name || 'Knight',
      color: p?.color || '#e74c3c',
      cells,
      total: s.display,
    };
  });

  const svgStr = buildSVGReport({
    title: 'KNIGHT GOLF — TOURNAMENT SCROLL',
    subtitle: `Course: ${game.course.name}`,
    holes,
    rows,
    titles,
    theme: {
      bg: '#f4e8c1',
      ink: '#2c1d0b',
      accent: '#8c2d19',
      font: 'Georgia, serif',
    },
  });

  const filename = `knight-golf-${new Date().toISOString().slice(0, 10)}`;
  if (asPNG) {
    svgToPNG(svgStr, `${filename}.png`);
  } else {
    downloadSVG(svgStr, `${filename}.svg`);
  }
}
