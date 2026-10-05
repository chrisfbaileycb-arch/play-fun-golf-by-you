// Career Stats module: tracks total 'Aces' recorded per player across rounds in local storage
// and provides a summary table and championship certificate export for post-game views.
import { el } from './util.js';
import { holeStrokes, isPlayerDone } from './game.js';
import { triggerScoreCelebration } from './fx.js';
import { download, downloadSVG, svgToPNG } from './store.js';
import { sfx, haptic } from './audio.js';
import { dialog } from './ui.js';

export const CAREER_STATS_KEY = 'arcade-links/career-stats/v1';

/**
 * Loads all player career stats from local storage.
 * @returns {Record<string, object>}
 */
export function getCareerStats() {
  try {
    const raw = localStorage.getItem(CAREER_STATS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return typeof parsed === 'object' && parsed !== null ? parsed : {};
  } catch {
    return {};
  }
}

/**
 * Saves career stats map to local storage.
 * @param {Record<string, object>} stats
 */
export function saveCareerStats(stats) {
  try {
    localStorage.setItem(CAREER_STATS_KEY, JSON.stringify(stats));
  } catch {
    /* quota / private mode */
  }
}

/**
 * Clears all career stats from local storage.
 */
export function resetCareerStats() {
  try {
    localStorage.removeItem(CAREER_STATS_KEY);
  } catch {
    /* ignore */
  }
}

/**
 * Generates a normalized lookup key for a player.
 */
export function playerKey(playerOrName) {
  if (!playerOrName) return 'unknown';
  if (typeof playerOrName === 'string') return playerOrName.trim().toLowerCase();
  return (playerOrName.name || playerOrName.id || 'unknown').trim().toLowerCase();
}

/**
 * Retrieves career stats for a specific player.
 * @param {object|string} playerOrName
 * @returns {object}
 */
export function getPlayerStats(playerOrName) {
  const all = getCareerStats();
  const key = playerKey(playerOrName);
  const name = typeof playerOrName === 'string' ? playerOrName : (playerOrName.name || playerOrName.id || 'Player');
  const color = typeof playerOrName === 'object' ? (playerOrName.color || '#ffd700') : '#ffd700';
  return all[key] || {
    name,
    color,
    aces: 0,
    rounds: 0,
    holesPlayed: 0,
    history: [],
  };
}

/**
 * Manually records an ace for a player in career stats.
 *
 * @param {object|string} playerOrName
 * @param {object} [details] - Optional metadata (courseName, holeIdx, roundId)
 * @returns {number} Updated total career aces for the player
 */
export function recordAce(playerOrName, details = {}) {
  const all = getCareerStats();
  const key = playerKey(playerOrName);
  const name = typeof playerOrName === 'string' ? playerOrName : (playerOrName.name || playerOrName.id || 'Player');
  const color = typeof playerOrName === 'object' ? (playerOrName.color || '#ffd700') : '#ffd700';

  const current = all[key] || {
    name,
    color,
    aces: 0,
    rounds: 0,
    holesPlayed: 0,
    history: [],
  };

  const roundId = details.roundId || null;
  const holeIdx = details.holeIdx ?? null;

  // Check deduplication if roundId and holeIdx are specified
  if (roundId && holeIdx !== null) {
    const alreadyRecorded = (current.history || []).some(
      (h) => h.roundId === roundId && h.holeIdx === holeIdx
    );
    if (alreadyRecorded) {
      return current.aces;
    }
  }

  current.aces = (current.aces || 0) + 1;
  current.history = current.history || [];
  current.history.push({
    roundId,
    holeIdx,
    courseName: details.courseName || null,
    date: Date.now(),
  });
  current.lastPlayed = Date.now();

  all[key] = current;
  saveCareerStats(all);
  return current.aces;
}

/**
 * Inspects a finished game round and records all aces into local storage.
 * Idempotent: will not count the same round/hole ace multiple times.
 *
 * @param {object} game - The finished game state
 * @returns {Record<string, object>} Updated career stats map
 */
export function recordRoundAces(game) {
  if (!game || !Array.isArray(game.players) || !Array.isArray(game.holes)) {
    return getCareerStats();
  }

  const all = getCareerStats();
  const roundId = game.id || `game_${Date.now()}`;

  for (const player of game.players) {
    const key = playerKey(player);
    const pRecord = all[key] || {
      name: player.name,
      color: player.color || '#ffd700',
      aces: 0,
      rounds: 0,
      holesPlayed: 0,
      history: [],
      recordedRounds: [],
    };

    pRecord.recordedRounds = pRecord.recordedRounds || [];
    pRecord.history = pRecord.history || [];

    // Track round count deduplicated by roundId
    if (!pRecord.recordedRounds.includes(roundId)) {
      pRecord.recordedRounds.push(roundId);
      pRecord.rounds = (pRecord.rounds || 0) + 1;
    }

    // Inspect each hole for score of 1 (Ace)
    for (let i = 0; i < game.holes.length; i++) {
      const hs = game.holes[i];
      if (!hs) continue;
      const strokes = holeStrokes(game, player.id, i);
      const shots = hs.shots?.[player.id] || [];
      const holed = shots.some((s) => s.holed);
      const done = isPlayerDone(game, player.id, i);
      const isAce = strokes === 1 && (done || holed || shots.length === 1);

      if (isAce) {
        const alreadyRecorded = pRecord.history.some(
          (h) => h.roundId === roundId && h.holeIdx === i
        );
        if (!alreadyRecorded) {
          pRecord.aces = (pRecord.aces || 0) + 1;
          pRecord.history.push({
            roundId,
            holeIdx: i,
            courseName: game.course?.name || 'Arcade Course',
            date: Date.now(),
          });
        }
      }
    }

    pRecord.holesPlayed = (pRecord.holesPlayed || 0) + game.holes.length;
    pRecord.lastPlayed = Date.now();
    pRecord.color = player.color || pRecord.color;
    pRecord.name = player.name || pRecord.name;
    all[key] = pRecord;
  }

  saveCareerStats(all);
  return all;
}

/**
 * Builds and mounts a summary table of Career Stats in the post-game view.
 *
 * @param {HTMLElement|string} [container] - Container to append summary to
 * @param {object} [game] - Optional current game to highlight active players
 * @param {object} [options] - Optional custom options
 * @returns {HTMLElement} The created career stats section element
 */
export function renderCareerStatsSummary(container, game = null, options = {}) {
  const all = getCareerStats();

  let playersList = [];
  if (game && Array.isArray(game.players)) {
    playersList = game.players.map((p) => {
      const key = playerKey(p);
      const stat = all[key] || {
        name: p.name,
        color: p.color,
        aces: 0,
        rounds: 1,
      };
      // Count aces scored in this specific round
      let roundAces = 0;
      for (let i = 0; i < game.holes.length; i++) {
        const strokes = holeStrokes(game, p.id, i);
        const shots = game.holes[i]?.shots?.[p.id] || [];
        const holed = shots.some((s) => s.holed);
        const done = isPlayerDone(game, p.id, i);
        if (strokes === 1 && (done || holed || shots.length === 1)) {
          roundAces++;
        }
      }
      return {
        id: p.id,
        name: p.name,
        color: p.color,
        cpu: p.cpu,
        roundAces,
        careerAces: stat.aces || 0,
        rounds: stat.rounds || 1,
      };
    });
  } else {
    playersList = Object.values(all).map((st) => ({
      id: playerKey(st.name),
      name: st.name,
      color: st.color || '#ffd700',
      cpu: false,
      roundAces: 0,
      careerAces: st.aces || 0,
      rounds: st.rounds || 1,
    }));
  }

  // Sort by career aces descending, then rounds
  playersList.sort((a, b) => b.careerAces - a.careerAces || b.roundAces - a.roundAces);

  const section = el('section', {
    class: 'career-stats-section',
    role: 'region',
    'aria-labelledby': 'career-stats-title',
  },
    el('div', { class: 'career-stats-header' },
      el('div', { class: 'career-stats-icon', 'aria-hidden': 'true' }, '🏆'),
      el('div', {},
        el('h3', { id: 'career-stats-title', class: 'career-stats-title' }, 'Career Stats · Ace Hall of Fame'),
        el('p', { class: 'career-stats-subtitle' }, 'Total Aces recorded per player across rounds in local storage')
      )
    ),
    el('div', { class: 'career-stats-table-wrap' },
      el('table', { class: 'career-stats-table', role: 'table', 'aria-label': 'Career Aces Standings' },
        el('thead', {},
          el('tr', {},
            el('th', { scope: 'col' }, 'Player'),
            el('th', { scope: 'col', style: { textAlign: 'center' } }, 'Round Aces'),
            el('th', { scope: 'col', style: { textAlign: 'right' } }, 'Total Career Aces'),
            el('th', { scope: 'col', style: { textAlign: 'right' } }, 'Rounds')
          )
        ),
        el('tbody', {},
          ...playersList.map((p) => {
            const hasAceThisRound = p.roundAces > 0;
            const hasCareerAces = p.careerAces > 0;
            return el('tr', { class: hasAceThisRound ? 'is-ace-round' : '' },
              el('td', {},
                el('div', { class: 'career-stats-player' },
                  el('i', { class: 'player-swatch', style: { background: p.color || 'var(--pc)' } }),
                  el('span', {}, p.name),
                  p.cpu ? el('small', { style: { color: 'var(--ink-dim)', marginLeft: '4px' } }, '(CPU)') : null
                )
              ),
              el('td', { style: { textAlign: 'center' } },
                hasAceThisRound
                  ? el('span', { class: 'career-ace-chip' }, `★ ${p.roundAces}`)
                  : el('span', { class: 'career-ace-chip zero' }, '–')
              ),
              el('td', { style: { textAlign: 'right' } },
                hasCareerAces
                  ? el('span', {
                      class: 'career-ace-chip career-stats-total',
                      title: 'Click to trigger confetti celebration',
                      style: { cursor: 'pointer' },
                      onclick: () => triggerScoreCelebration(1),
                    }, `🏆 ${p.careerAces} Ace${p.careerAces === 1 ? '' : 's'}`)
                  : el('span', { style: { color: 'var(--ink-dim)', fontWeight: '700' } }, '0')
              ),
              el('td', { style: { textAlign: 'right', color: 'var(--ink-dim)', fontWeight: '700' } }, String(p.rounds))
            );
          })
        )
      )
    )
  );

  if (container) {
    const hostNode = typeof container === 'string'
      ? (typeof document !== 'undefined' ? document.querySelector(container) : null)
      : container;
    if (hostNode) {
      const prev = hostNode.querySelector('.career-stats-section');
      if (prev) prev.remove();
      hostNode.appendChild(section);
    }
  }

  // Export Action Toolbar
  const actionsWrap = el('div', { class: 'career-stats-actions' },
    el('button', {
      type: 'button',
      class: 'btn-trophy-export',
      title: 'Download printable Championship Trophy Certificate of Achievement (PNG)',
      onclick: () => {
        exportCareerCertificatePNG(game);
      },
    }, '🏆 Download Championship Certificate (PNG)'),
    el('button', {
      type: 'button',
      class: 'btn btn-secondary',
      title: 'Download high-resolution vector certificate (SVG)',
      onclick: () => {
        exportCareerCertificateSVG(game);
      },
    }, '📜 Vector Certificate (SVG)'),
    el('button', {
      type: 'button',
      class: 'btn btn-ghost',
      title: 'Preview framed championship certificate in-app',
      onclick: () => {
        showCertificatePreview(game);
      },
    }, '👁️ Preview Award'),
    el('div', { class: 'career-export-subgroup' },
      el('button', {
        type: 'button',
        class: 'btn btn-ghost',
        title: 'Export raw career progress data as CSV for spreadsheets',
        onclick: () => {
          exportCareerStatsCSV(game);
        },
      }, '📊 CSV'),
      el('button', {
        type: 'button',
        class: 'btn btn-ghost',
        title: 'Export full career stats record as JSON',
        onclick: () => {
          exportCareerStatsJSON(game);
        },
      }, '💾 JSON')
    )
  );

  section.appendChild(actionsWrap);

  return section;
}

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/**
 * Builds an ornate Championship Trophy Certificate of Accomplishment & Achievement in vector SVG.
 * Designed to look like a framed championship statue award with double gold filigree,
 * glowing trophy centerpiece, laurel wreaths, official wax seal, signatures, and career stats.
 *
 * @param {object} [options]
 * @returns {string} SVG XML markup string
 */
export function buildCareerCertificateSVG({ players = [], game = null, date = new Date() } = {}) {
  const all = getCareerStats();
  let list = players.length ? players : [];
  if (!list.length && game && Array.isArray(game.players)) {
    list = game.players.map((p) => {
      const key = playerKey(p);
      const st = all[key] || { name: p.name, color: p.color, aces: 0, rounds: 1 };
      return { name: p.name, color: p.color, careerAces: st.aces || 0, rounds: st.rounds || 1 };
    });
  }
  if (!list.length) {
    list = Object.values(all).map((st) => ({
      name: st.name,
      color: st.color || '#ffd700',
      careerAces: st.aces || 0,
      rounds: st.rounds || 1,
    }));
  }
  if (!list.length) {
    list = [{ name: 'Arcade Golfer', color: '#ffd700', careerAces: 0, rounds: 1 }];
  }

  list.sort((a, b) => (b.careerAces || 0) - (a.careerAces || 0));
  const champion = list[0] || { name: 'Arcade Champion', careerAces: 0, rounds: 1 };
  const totalCohortAces = list.reduce((sum, p) => sum + (p.careerAces || 0), 0);
  const totalCohortRounds = list.reduce((sum, p) => sum + (p.rounds || 0), 0);
  const courseName = game?.course?.name || 'Grand Links Championship';
  const issueDateStr = date instanceof Date
    ? date.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
    : String(date);
  const recordId = `AL-ACE-${(game?.id || Date.now()).toString().slice(-8).toUpperCase()}`;

  const W = 1200;
  const H = 900;

  const parts = [];
  parts.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`);

  // Defs & Gradients
  parts.push(`
  <defs>
    <linearGradient id="certBg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#090d16" />
      <stop offset="50%" stop-color="#0f1624" />
      <stop offset="100%" stop-color="#070a12" />
    </linearGradient>
    <linearGradient id="goldGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#fff2a8" />
      <stop offset="25%" stop-color="#ffd700" />
      <stop offset="70%" stop-color="#cf941a" />
      <stop offset="100%" stop-color="#ffdf59" />
    </linearGradient>
    <radialGradient id="trophyGlow" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#ffd700" stop-opacity="0.32" />
      <stop offset="60%" stop-color="#ffd700" stop-opacity="0.08" />
      <stop offset="100%" stop-color="#ffd700" stop-opacity="0" />
    </radialGradient>
    <filter id="goldDrop" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="4" stdDeviation="6" flood-color="#ffd700" flood-opacity="0.4" />
    </filter>
    <filter id="plaqueShadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="6" stdDeviation="8" flood-color="#000000" flood-opacity="0.6" />
    </filter>
  </defs>
  `);

  // Background
  parts.push(`<rect width="100%" height="100%" fill="url(#certBg)" />`);

  // Certificate Borders
  parts.push(`<rect x="22" y="22" width="${W - 44}" height="${H - 44}" rx="16" fill="none" stroke="url(#goldGrad)" stroke-width="4" />`);
  parts.push(`<rect x="36" y="36" width="${W - 72}" height="${H - 72}" rx="10" fill="none" stroke="#d4af37" stroke-width="1.5" stroke-dasharray="10 5" opacity="0.85" />`);
  parts.push(`<rect x="44" y="44" width="${W - 88}" height="${H - 88}" fill="none" stroke="rgba(255,215,0,0.15)" stroke-width="1" />`);

  // Corner Ornaments
  const corners = [
    { x: 36, y: 36 },
    { x: W - 36, y: 36 },
    { x: 36, y: H - 36 },
    { x: W - 36, y: H - 36 }
  ];
  corners.forEach(c => {
    parts.push(`<circle cx="${c.x}" cy="${c.y}" r="6" fill="url(#goldGrad)" />`);
    parts.push(`<circle cx="${c.x}" cy="${c.y}" r="14" fill="none" stroke="url(#goldGrad)" stroke-width="1.5" />`);
  });

  // Top Ribbon & Header
  parts.push(`<text x="${W / 2}" y="76" text-anchor="middle" font-family="Georgia, 'Cinzel', serif, system-ui" font-size="16" font-weight="900" fill="#ffd700" letter-spacing="6">ARCADE LINKS · CHAMPIONSHIP HALL OF FAME</text>`);
  parts.push(`<line x1="280" x2="${W - 280}" y1="88" y2="88" stroke="url(#goldGrad)" stroke-width="1.5" opacity="0.6" />`);

  // Trophy Halo Glow
  parts.push(`<circle cx="${W / 2}" cy="180" r="120" fill="url(#trophyGlow)" />`);

  // Radiating Sunburst Rays behind Trophy
  for (let a = 0; a < 360; a += 22.5) {
    const rad = (a * Math.PI) / 180;
    const x1 = W / 2 + Math.cos(rad) * 45;
    const y1 = 180 + Math.sin(rad) * 45;
    const x2 = W / 2 + Math.cos(rad) * 115;
    const y2 = 180 + Math.sin(rad) * 115;
    parts.push(`<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="url(#goldGrad)" stroke-width="1" opacity="0.25" />`);
  }

  // Laurel Wreaths Flanking Trophy
  parts.push(`
  <g stroke="url(#goldGrad)" fill="url(#goldGrad)" opacity="0.85">
    <path d="M 525 240 C 490 200, 490 145, 525 105" fill="none" stroke-width="2.5" />
    <path d="M 520 120 C 500 115, 502 105, 525 105 C 518 115, 525 125, 520 120 Z" />
    <path d="M 505 150 C 485 145, 488 135, 510 135 C 503 145, 510 155, 505 150 Z" />
    <path d="M 500 185 C 480 180, 482 170, 505 170 C 498 180, 505 190, 500 185 Z" />
    <path d="M 508 220 C 490 215, 492 205, 515 205 C 508 215, 515 225, 508 220 Z" />
  </g>
  <g stroke="url(#goldGrad)" fill="url(#goldGrad)" opacity="0.85">
    <path d="M 675 240 C 710 200, 710 145, 675 105" fill="none" stroke-width="2.5" />
    <path d="M 680 120 C 700 115, 698 105, 675 105 C 682 115, 675 125, 680 120 Z" />
    <path d="M 695 150 C 715 145, 712 135, 690 135 C 697 145, 690 155, 695 150 Z" />
    <path d="M 700 185 C 720 180, 718 170, 695 170 C 702 180, 695 190, 700 185 Z" />
    <path d="M 692 220 C 710 215, 708 205, 685 205 C 692 215, 685 225, 692 220 Z" />
  </g>
  `);

  // Trophy Statue Vector Art
  parts.push(`
  <g filter="url(#goldDrop)">
    <ellipse cx="600" cy="115" rx="55" ry="12" fill="url(#goldGrad)" stroke="#ffffff" stroke-width="1.5" />
    <ellipse cx="600" cy="115" rx="46" ry="8" fill="#a47113" opacity="0.6" />
    <path d="M 545 115 C 545 180, 565 210, 592 220 L 592 238 L 575 248 L 625 248 L 608 238 L 608 220 C 635 210, 655 180, 655 115 Z" fill="url(#goldGrad)" stroke="#fff" stroke-width="1" />
    <path d="M 548 126 C 500 135, 498 185, 552 195 C 514 184, 516 148, 548 138 Z" fill="url(#goldGrad)" stroke="#d4af37" stroke-width="1" />
    <path d="M 652 126 C 700 135, 702 185, 648 195 C 686 184, 684 148, 652 138 Z" fill="url(#goldGrad)" stroke="#d4af37" stroke-width="1" />
    <polygon points="600,138 604,150 617,150 606,158 610,170 600,162 590,170 594,158 583,150 596,150" fill="#ffffff" />
    <rect x="565" y="248" width="70" height="12" rx="2" fill="#1e2736" stroke="url(#goldGrad)" stroke-width="2" />
    <rect x="546" y="260" width="108" height="26" rx="4" fill="#0d1420" stroke="url(#goldGrad)" stroke-width="2" />
    <text x="600" y="278" text-anchor="middle" font-family="system-ui, sans-serif" font-size="11" font-weight="900" fill="#ffd700" letter-spacing="2">ARCADE LINKS</text>
  </g>
  `);

  // Inscription
  parts.push(`<text x="${W / 2}" y="322" text-anchor="middle" font-family="Georgia, serif" font-size="15" font-weight="700" fill="#d4af37" letter-spacing="4">OFFICIAL DIPLOMA OF ACCOMPLISHMENT & VALOR</text>`);
  parts.push(`<text x="${W / 2}" y="360" text-anchor="middle" font-family="Georgia, 'Cinzel', serif" font-size="32" font-weight="900" fill="#ffffff" letter-spacing="2">CONFERRED UPON THE CHAMPION</text>`);

  // Champion Name
  parts.push(`<text x="${W / 2}" y="415" text-anchor="middle" font-family="Georgia, 'Cinzel', serif" font-size="44" font-weight="900" fill="url(#goldGrad)" filter="url(#goldDrop)" letter-spacing="2">${esc(champion.name.toUpperCase())}</text>`);
  parts.push(`<text x="${W / 2}" y="446" text-anchor="middle" font-family="system-ui, sans-serif" font-size="14" font-weight="600" fill="#94a3b8" letter-spacing="1">FOR EXTRAORDINARY GOLFING PRECISION AND CONQUERING THE FAIRWAYS AT ${esc(courseName.toUpperCase())}</text>`);

  // Trophy Plaque
  parts.push(`
  <g filter="url(#plaqueShadow)">
    <rect x="220" y="470" width="760" height="96" rx="12" fill="#131c2b" stroke="url(#goldGrad)" stroke-width="2" />
    <line x1="473" y1="485" x2="473" y2="551" stroke="rgba(255,215,0,0.3)" stroke-width="1" />
    <line x1="726" y1="485" x2="726" y2="551" stroke="rgba(255,215,0,0.3)" stroke-width="1" />

    <text x="346" y="515" text-anchor="middle" font-family="Georgia, serif" font-size="34" font-weight="900" fill="#ffd700">★ ${champion.careerAces} ★</text>
    <text x="346" y="542" text-anchor="middle" font-family="system-ui, sans-serif" font-size="12" font-weight="800" fill="#a0aec0" letter-spacing="1.5">CHAMPION ACES</text>

    <text x="600" y="515" text-anchor="middle" font-family="Georgia, serif" font-size="34" font-weight="900" fill="#ffffff">${totalCohortAces}</text>
    <text x="600" y="542" text-anchor="middle" font-family="system-ui, sans-serif" font-size="12" font-weight="800" fill="#a0aec0" letter-spacing="1.5">TOTAL COHORT ACES</text>

    <text x="853" y="515" text-anchor="middle" font-family="Georgia, serif" font-size="34" font-weight="900" fill="#ffd700">${champion.rounds}</text>
    <text x="853" y="542" text-anchor="middle" font-family="system-ui, sans-serif" font-size="12" font-weight="800" fill="#a0aec0" letter-spacing="1.5">ROUNDS RECORDED</text>
  </g>
  `);

  // Cohort Standings
  const tableTop = 590;
  parts.push(`<rect x="180" y="${tableTop}" width="840" height="145" rx="8" fill="#0d1422" stroke="rgba(255,215,0,0.35)" stroke-width="1" />`);
  parts.push(`<text x="210" y="${tableTop + 24}" font-family="system-ui, sans-serif" font-size="12" font-weight="900" fill="#d4af37" letter-spacing="2">OFFICIAL CAREER STANDINGS RECORD</text>`);
  parts.push(`<text x="710" y="${tableTop + 24}" text-anchor="middle" font-family="system-ui, sans-serif" font-size="12" font-weight="800" fill="#94a3b8" letter-spacing="1">CAREER ACES</text>`);
  parts.push(`<text x="860" y="${tableTop + 24}" text-anchor="middle" font-family="system-ui, sans-serif" font-size="12" font-weight="800" fill="#94a3b8" letter-spacing="1">ROUNDS</text>`);
  parts.push(`<text x="960" y="${tableTop + 24}" text-anchor="middle" font-family="system-ui, sans-serif" font-size="12" font-weight="800" fill="#94a3b8" letter-spacing="1">STATUS</text>`);
  parts.push(`<line x1="190" x2="1010" y1="${tableTop + 34}" y2="${tableTop + 34}" stroke="rgba(255,215,0,0.2)" stroke-width="1" />`);

  list.slice(0, 3).forEach((p, idx) => {
    const rowY = tableTop + 62 + idx * 30;
    const rankLabel = idx === 0 ? '👑 #1' : `#${idx + 1}`;
    parts.push(`<circle cx="210" cy="${rowY - 4}" r="5" fill="${p.color || '#ffd700'}" />`);
    parts.push(`<text x="226" y="${rowY}" font-family="Georgia, serif" font-size="15" font-weight="700" fill="#ffffff">${rankLabel} ${esc(p.name)}</text>`);
    parts.push(`<text x="710" y="${rowY}" text-anchor="middle" font-family="system-ui, sans-serif" font-size="15" font-weight="900" fill="#ffd700">${p.careerAces > 0 ? `★ ${p.careerAces}` : '0'}</text>`);
    parts.push(`<text x="860" y="${rowY}" text-anchor="middle" font-family="system-ui, sans-serif" font-size="14" font-weight="700" fill="#cbd5e1">${p.rounds || 1}</text>`);
    parts.push(`<text x="960" y="${rowY}" text-anchor="middle" font-family="system-ui, sans-serif" font-size="12" font-weight="800" fill="${p.careerAces > 0 ? '#38ef7d' : '#94a3b8'}">${p.careerAces > 0 ? 'MASTER' : 'GOLFER'}</text>`);
    if (idx < 2) {
      parts.push(`<line x1="200" x2="1000" y1="${rowY + 12}" y2="${rowY + 12}" stroke="rgba(255,255,255,0.06)" stroke-width="1" />`);
    }
  });

  // Seal
  const sealX = 145;
  const sealY = 785;
  parts.push(`
  <g>
    <path d="M ${sealX - 16} ${sealY + 10} L ${sealX - 32} ${sealY + 70} L ${sealX - 16} ${sealY + 60} L ${sealX} ${sealY + 70} Z" fill="#991b1b" stroke="#7f1d1d" stroke-width="1" />
    <path d="M ${sealX + 16} ${sealY + 10} L ${sealX + 32} ${sealY + 70} L ${sealX + 16} ${sealY + 60} L ${sealX} ${sealY + 70} Z" fill="#b91c1c" stroke="#991b1b" stroke-width="1" />
    <circle cx="${sealX}" cy="${sealY}" r="45" fill="url(#goldGrad)" stroke="#fff" stroke-width="2" filter="url(#goldDrop)" />
    <circle cx="${sealX}" cy="${sealY}" r="38" fill="none" stroke="#78350f" stroke-width="1.5" stroke-dasharray="3 3" />
    <circle cx="${sealX}" cy="${sealY}" r="32" fill="#181e2b" stroke="#d4af37" stroke-width="1" />
    <text x="${sealX}" y="${sealY - 10}" text-anchor="middle" font-family="system-ui, sans-serif" font-size="8" font-weight="900" fill="#ffd700" letter-spacing="1">OFFICIALLY</text>
    <text x="${sealX}" y="${sealY + 3}" text-anchor="middle" font-family="Georgia, serif" font-size="14" font-weight="900" fill="#ffffff">★ 🏆 ★</text>
    <text x="${sealX}" y="${sealY + 16}" text-anchor="middle" font-family="system-ui, sans-serif" font-size="8" font-weight="900" fill="#ffd700" letter-spacing="1">VERIFIED</text>
  </g>
  `);

  // Signatures
  parts.push(`
  <g font-family="Georgia, serif">
    <g transform="translate(420, 770)">
      <path d="M 0 0 C 20 -15, 30 -5, 50 -18 C 70 -5, 90 -22, 110 -10 C 130 5, 140 -15, 160 -8" fill="none" stroke="#ffd700" stroke-width="2" opacity="0.85" />
      <line x1="0" y1="10" x2="180" y2="10" stroke="#d4af37" stroke-width="1" opacity="0.6" />
      <text x="90" y="26" text-anchor="middle" font-size="13" font-weight="700" fill="#cbd5e1">Master of Tournaments</text>
      <text x="90" y="40" text-anchor="middle" font-family="system-ui, sans-serif" font-size="10" fill="#64748b">ARCADE LINKS BOARD</text>
    </g>

    <g transform="translate(680, 770)">
      <path d="M 0 -5 C 25 -22, 45 5, 75 -16 C 105 -5, 120 -20, 150 -12 C 165 -2, 175 -10, 185 -5" fill="none" stroke="#ffd700" stroke-width="2" opacity="0.85" />
      <line x1="0" y1="10" x2="190" y2="10" stroke="#d4af37" stroke-width="1" opacity="0.6" />
      <text x="95" y="26" text-anchor="middle" font-size="13" font-weight="700" fill="#cbd5e1">Chancellor of Fairways</text>
      <text x="95" y="40" text-anchor="middle" font-family="system-ui, sans-serif" font-size="10" fill="#64748b">OFFICIAL ACCREDITATION</text>
    </g>

    <g transform="translate(940, 782)" text-anchor="start" font-family="system-ui, sans-serif">
      <text x="0" y="0" font-size="11" font-weight="800" fill="#94a3b8">RECORD CODE:</text>
      <text x="0" y="15" font-size="12" font-weight="900" fill="#ffd700">${recordId}</text>
      <text x="0" y="32" font-size="11" font-weight="600" fill="#64748b">${esc(issueDateStr)}</text>
    </g>
  </g>
  `);

  parts.push('</svg>');
  return parts.join('\n');
}

/**
 * Exports and downloads the Championship Trophy Certificate as a high-resolution PNG image.
 */
export function exportCareerCertificatePNG(game = null, filename = null) {
  const svgStr = buildCareerCertificateSVG({ game });
  const fname = filename || `arcade-links-championship-certificate-${new Date().toISOString().slice(0, 10)}.png`;
  sfx.play('fanfare');
  haptic([60, 40, 80]);
  svgToPNG(svgStr, fname);
}

/**
 * Exports and downloads the Championship Trophy Certificate as an SVG vector file.
 */
export function exportCareerCertificateSVG(game = null, filename = null) {
  const svgStr = buildCareerCertificateSVG({ game });
  const fname = filename || `arcade-links-championship-certificate-${new Date().toISOString().slice(0, 10)}.svg`;
  sfx.play('coin');
  downloadSVG(svgStr, fname);
}

/**
 * Exports the Career Stats summary as a CSV file.
 */
export function exportCareerStatsCSV(game = null, filename = null) {
  const all = getCareerStats();
  const rows = [
    ['Player Name', 'Total Career Aces', 'Rounds Played', 'Holes Played', 'Last Played Date']
  ];
  for (const stat of Object.values(all)) {
    rows.push([
      `"${String(stat.name || '').replace(/"/g, '""')}"`,
      stat.aces || 0,
      stat.rounds || 0,
      stat.holesPlayed || 0,
      stat.lastPlayed ? new Date(stat.lastPlayed).toISOString() : ''
    ]);
  }
  const csvContent = rows.map((r) => r.join(',')).join('\n');
  const fname = filename || `arcade-links-career-stats-${new Date().toISOString().slice(0, 10)}.csv`;
  sfx.play('click');
  download(fname, new Blob([csvContent], { type: 'text/csv;charset=utf-8;' }));
}

/**
 * Exports the Career Stats summary as a JSON file.
 */
export function exportCareerStatsJSON(game = null, filename = null) {
  const all = getCareerStats();
  const data = {
    app: 'arcade-links',
    type: 'career-stats-export',
    exportedAt: new Date().toISOString(),
    stats: all,
  };
  const fname = filename || `arcade-links-career-stats-${new Date().toISOString().slice(0, 10)}.json`;
  sfx.play('click');
  download(fname, new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
}

/**
 * Displays an interactive in-app modal preview of the Championship Trophy Certificate.
 */
export function showCertificatePreview(game = null) {
  const svgStr = buildCareerCertificateSVG({ game });
  const wrap = el('div', { class: 'certificate-preview-wrap' });

  // Embedded SVG image container
  const img = el('img', {
    src: `data:image/svg+xml;utf8,${encodeURIComponent(svgStr)}`,
    alt: 'Championship Trophy Certificate of Accomplishment',
    class: 'certificate-preview-img',
  });
  wrap.appendChild(img);

  dialog({
    title: '🏆 Championship Trophy Certificate',
    body: wrap,
    buttons: [
      {
        label: '🖼️ Save PNG (For Framing)',
        value: 'png',
        primary: true,
      },
      {
        label: '📜 Save SVG',
        value: 'svg',
      },
      {
        label: 'Close',
        value: 'close',
      }
    ],
    className: 'modal-certificate',
  }).then((action) => {
    if (action === 'png') exportCareerCertificatePNG(game);
    else if (action === 'svg') exportCareerCertificateSVG(game);
  });
}

export default {
  getCareerStats,
  saveCareerStats,
  resetCareerStats,
  recordAce,
  recordRoundAces,
  getPlayerStats,
  renderCareerStatsSummary,
  buildCareerCertificateSVG,
  exportCareerCertificatePNG,
  exportCareerCertificateSVG,
  exportCareerStatsCSV,
  exportCareerStatsJSON,
  showCertificatePreview,
};
