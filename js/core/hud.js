// HUD components for in-hole player status cards and badges.
import { el, clear } from './util.js';
import { holeStrokes, isPlayerDone, holeState } from './game.js';
import { triggerScoreCelebration } from './fx.js';

/**
 * Checks if a player's score on the current hole is 1.
 *
 * @param {object} game - The current game state
 * @param {string} pid - Player ID
 * @param {number} [holeIdx] - Hole index (defaults to game.holeIdx)
 * @returns {boolean} True if player's score on the hole is 1
 */
export function isAceScore(game, pid, holeIdx = game?.holeIdx) {
  if (!game || !pid) return false;
  const idx = holeIdx ?? game.holeIdx;
  try {
    const strokes = holeStrokes(game, pid, idx);
    if (strokes === 1) return true;
  } catch {
    // fallback if game is simple object
  }
  const hs = holeState(game, idx);
  if (hs?.shots?.[pid]?.length === 1 && (hs.done?.[pid] || hs.shots[pid][0]?.holed)) {
    return true;
  }
  return false;
}

/**
 * Creates the gold 'ACE' badge element for a player's HUD card.
 *
 * @param {object} player - Player object
 * @param {object} [options] - Additional options
 * @returns {HTMLElement} The gold 'ACE' badge element
 */
export function createAceBadge(player, options = {}) {
  const badge = el('button', {
    type: 'button',
    class: 'hc-badge hc-ace-badge is-ace',
    title: `${player?.name || 'Player'} scored an ACE! Click for celebratory confetti`,
    'aria-label': `${player?.name || 'Player'} scored an ACE on this hole`,
    onclick: (e) => {
      e.stopPropagation();
      // Utilize existing confetti animation trigger
      triggerScoreCelebration(1);
    },
  }, '★ ACE');
  return badge;
}

/**
 * Creates a single player HUD card element.
 *
 * @param {object} player - Player object ({ id, name, color, cpu })
 * @param {object} [row] - Mode row data ({ value, label, badge, bar })
 * @param {boolean} [isTurn] - Whether it is currently this player's turn
 * @param {object} [options] - Configuration and game context
 * @returns {HTMLElement} The constructed .hud-card element
 */
export function createHUDCard(player, row = {}, isTurn = false, options = {}) {
  const isAce = options.isAce ?? (options.game ? isAceScore(options.game, player.id) : false);
  const avatar = options.avatarFor ? options.avatarFor(player, 22) : (player.cpu ? '🤖 ' : '');

  // Automatically trigger celebratory confetti when an Ace score is detected for the player
  if (isAce && options.triggerCelebration !== false && options.game) {
    const holeIdx = options.game.holeIdx ?? 0;
    const celebratedKey = `_ace_hud_celebrated_${player.id}_${holeIdx}`;
    if (!options.game[celebratedKey]) {
      options.game[celebratedKey] = true;
      triggerScoreCelebration(1);
    }
  }

  // Display gold 'ACE' badge above player's card when score is 1, otherwise regular badge
  const badgeElem = isAce
    ? createAceBadge(player, options)
    : (row.badge ? el('span', { class: 'hc-badge' }, row.badge) : null);

  const card = el('div', { class: `hud-card ${isTurn ? 'is-turn' : ''} ${isAce ? 'has-ace' : ''}` },
    badgeElem,
    el('div', { class: 'hc-name' }, avatar || (player.cpu ? '🤖 ' : ''), el('span', {}, player.name)),
    el('div', { class: 'hc-val' }, row.value ?? '0'),
    el('div', { class: 'hc-label' }, row.label || ''),
    row.bar ? el('div', {
      class: 'hc-bar',
      role: 'progressbar',
      'aria-valuemin': 0,
      'aria-valuemax': row.bar.max,
      'aria-valuenow': Math.round(row.bar.value),
      'aria-label': `${player.name} ${row.label || ''}`,
    }, el('i', {
      style: {
        transform: `scaleX(${Math.max(0, Math.min(1, row.bar.value / (row.bar.max || 1)))})`,
        background: row.bar.color || player.color,
      },
    })) : null
  );

  card.style.setProperty('--pc', player.color);
  return card;
}

/**
 * Updates the HUD components to render player status cards and automatically
 * display a gold 'ACE' badge above a player's card when their current hole score is 1.
 *
 * @param {HTMLElement|string} host - Host container or selector
 * @param {object} game - The current game state
 * @param {object} mode - Active game mode plugin
 * @param {object} [options] - Options (selectedPid, avatarFor, sumStrokes, triggerCelebration)
 * @returns {HTMLElement} The populated container
 */
export function renderHUD(host, game, mode, options = {}) {
  const container = typeof host === 'string'
    ? (typeof document !== 'undefined' ? document.querySelector(host) : null)
    : (host || (typeof document !== 'undefined' ? document.getElementById('hud') : null));

  if (!container) return null;
  clear(container);

  let rows = [];
  try {
    rows = mode?.hud ? mode.hud(game) || [] : [];
  } catch (err) {
    console.error('mode.hud error', err);
  }

  const selPid = options.selectedPid;
  for (const p of game.players) {
    const r = rows.find((x) => x.pid === p.id) || {
      value: String(options.sumStrokes ? options.sumStrokes(p.id) : (holeStrokes(game, p.id, game.holeIdx) ?? '0')),
      label: 'strokes',
    };
    const isTurn = selPid === p.id;
    const isAce = isAceScore(game, p.id, game.holeIdx);
    const card = createHUDCard(p, r, isTurn, {
      game,
      isAce,
      avatarFor: options.avatarFor,
      triggerCelebration: options.triggerCelebration !== false,
    });
    container.appendChild(card);
  }

  return container;
}

export default {
  renderHUD,
  createHUDCard,
  createAceBadge,
  isAceScore,
};
