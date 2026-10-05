// Arcade Links — bootstrap + flow controller (launcher → lobby → course → setup → holes → scenes → summary).
import knight from './js/knight/index.js';
import boardwalk from './js/boardwalk/index.js';
import { el, $, clear, sleep, fitCanvas, uid } from './js/core/util.js';
import { sfx, haptic } from './js/core/audio.js';
import { runScene } from './js/core/fx.js';
import { Radar } from './js/core/radar.js';
import { gps } from './js/core/gps.js';
import { showView, playEvents, toast, dialog, segmented, announce } from './js/core/ui.js';
import { saveGame, loadGame, clearGame, saveProfiles, loadProfiles, exportJSON, readJSONFile } from './js/core/store.js';
import { sanitizeCourse } from './js/core/course.js';
import { renderCourseEditor } from './js/core/courseEditor.js';
import { classifyPoint, landingFromCarry, carryOffline, distToPin } from './js/core/fairway.js';
import { SHOT_TYPES, suggestShotType, suggestCarry, landingForZone, strokesFor } from './js/core/shots.js';
import {
  createGame, currentHole, currentGeo, ballPos, currentLie, nextToPlay, addShot, isHoleDone, isPlayerDone,
  shotsOf, holeStrokes, validateGame, playerById, simulateFor, PLAYER_COLORS,
} from './js/core/game.js';
import { holeResults, allRoundStats } from './js/core/stats.js';

const SUITES = { knight, boardwalk };
const ZONE_NAMES = { cup: 'Holed', bullseye: 'Bullseye', inner: 'Inner ring', green: 'Green', fairway: 'Fairway', roughL: 'Left rough', roughR: 'Right rough', sand: 'Sand', water: 'Water', ob: 'Out of bounds' };

const S = {
  suite: null,
  players: [],
  modeId: null,
  course: null,
  game: null,
  radar: null,
  sel: { pid: null, type: 'drive', zone: null, point: null, carry: 150 },
  busy: false,
  undo: [],
  cpuTimer: 0,
};

const suiteOf = (g = S.game) => SUITES[g.suite];
const modeOf = (g = S.game) => suiteOf(g).modes.find((m) => m.id === g.modeId) || suiteOf(g).modes[0];

function avatarFor(player, size) {
  const suite = S.game ? suiteOf() : S.suite;
  if (!suite || typeof suite.avatar !== 'function') return null;
  try {
    const node = suite.avatar(player, size);
    if (node && node.classList) node.classList.add('hc-avatar');
    return node || null;
  } catch { return null; }
}

// ---------------------------------------------------------------- boot
function boot() {
  const mute = $('#btn-mute');
  mute.setAttribute('aria-pressed', String(sfx.muted));
  mute.addEventListener('click', () => {
    sfx.unlock();
    sfx.setMuted(!sfx.muted);
    mute.setAttribute('aria-pressed', String(sfx.muted));
    mute.setAttribute('aria-label', sfx.muted ? 'Unmute sound' : 'Mute sound');
  });
  const unlock = () => sfx.unlock();
  window.addEventListener('pointerdown', unlock, { passive: true });
  window.addEventListener('keydown', unlock);

  $('#btn-home').addEventListener('click', onHomeMenu);
  $('#btn-resume').addEventListener('click', () => { const g = loadGame(); if (g) resumeGame(g); });
  $('#import-file').addEventListener('change', onImport);
  wireLobby();
  wireCourse();
  wireHole();

  renderLauncher();
  showView('view-launch');

  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('sw.js').catch(() => { /* offline support optional */ });
  }
}

function setTheme(suite) {
  document.body.dataset.theme = suite ? suite.theme : 'launch';
  $('#brand').textContent = suite ? suite.name : 'Arcade Links';
  $('#btn-home').hidden = !suite;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', getComputedStyle(document.body).getPropertyValue('--bg').trim() || '#14110d');
}

// ---------------------------------------------------------------- launcher
function renderLauncher() {
  setTheme(null);
  const host = clear($('#suite-cards'));
  for (const suite of Object.values(SUITES)) {
    const cvs = el('canvas', { 'aria-hidden': 'true' });
    const card = el('button', { type: 'button', class: `suite-card suite-card--${suite.theme}`, onclick: () => openLobby(suite) },
      cvs,
      el('div', { class: 'sc-body' },
        el('h2', {}, suite.name),
        el('p', {}, suite.tagline),
        el('div', { class: 'sc-modes' }, ...suite.modes.map((m) => el('span', {}, m.name)))));
    host.appendChild(card);
    requestAnimationFrame(() => drawSuiteArt(cvs, suite));
  }
  const saved = loadGame();
  $('#btn-resume').hidden = !saved;
  if (saved) $('#btn-resume').textContent = `Resume ${SUITES[saved.suite]?.name || ''} — hole ${saved.holeIdx + 1}`;
}

function drawSuiteArt(canvas, suite) {
  const { w, h, ctx } = fitCanvas(canvas);
  if (suite.theme === 'knight') {
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#2b1c0e'); g.addColorStop(1, '#0f0a05');
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    // castle silhouette
    ctx.fillStyle = '#1a120a';
    const base = h * 0.82;
    ctx.fillRect(0, base, w, h - base);
    for (let x = 0; x < w; x += 46) {
      const tw = 30, th = 40 + ((x * 7) % 30);
      ctx.fillRect(x, base - th, tw, th);
      for (let c = 0; c < 3; c++) ctx.fillRect(x + c * 11, base - th - 8, 7, 8);
    }
    // glowing target rings
    const cx = w * 0.72, cy = h * 0.42;
    [[46, '#ff5e57'], [28, '#ff9f43'], [11, '#ffd76a']].forEach(([r, c]) => {
      ctx.save(); ctx.shadowColor = c; ctx.shadowBlur = 16; ctx.strokeStyle = c; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.ellipse(cx, cy, r * 1.4, r * 0.55, 0, 0, Math.PI * 2); ctx.stroke(); ctx.restore();
    });
    // crossed swords
    ctx.save(); ctx.translate(w * 0.24, h * 0.45); ctx.strokeStyle = '#e9dcc0'; ctx.lineWidth = 5; ctx.lineCap = 'round';
    for (const a of [-0.7, 0.7]) {
      ctx.save(); ctx.rotate(a); ctx.beginPath(); ctx.moveTo(0, -42); ctx.lineTo(0, 30); ctx.stroke();
      ctx.strokeStyle = '#f4c55a'; ctx.beginPath(); ctx.moveTo(-12, 22); ctx.lineTo(12, 22); ctx.stroke(); ctx.strokeStyle = '#e9dcc0'; ctx.restore();
    }
    ctx.restore();
  } else {
    ctx.fillStyle = '#f3e3c3'; ctx.fillRect(0, 0, w, h);
    const cols = ['#c4123b', '#2f7de1', '#f4b62b', '#33b36b', '#ff4fd8', '#7a3fd1'];
    const tile = 28;
    for (let i = 0; i * tile < w + tile; i++) {
      ctx.fillStyle = cols[i % cols.length]; ctx.fillRect(i * tile, 0, tile - 2, 14);
      ctx.fillStyle = '#fff8e8'; ctx.fillRect(i * tile, 14, tile - 2, 26);
      ctx.strokeStyle = '#2a1d10'; ctx.lineWidth = 2; ctx.strokeRect(i * tile, 0, tile - 2, 40);
    }
    // fairway with pawns
    ctx.fillStyle = '#62b34f'; ctx.beginPath(); ctx.moveTo(0, h); ctx.quadraticCurveTo(w * 0.5, h * 0.3, w, h * 0.55); ctx.lineTo(w, h); ctx.fill();
    ctx.fillStyle = '#8be36f'; ctx.beginPath(); ctx.ellipse(w * 0.82, h * 0.72, 34, 16, 0, 0, Math.PI * 2); ctx.fill();
    [[0.2, '#e8443a'], [0.38, '#2f7de1'], [0.55, '#f4b62b']].forEach(([fx, c], i) => {
      const x = w * fx, y = h * (0.86 - i * 0.07);
      ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.beginPath(); ctx.ellipse(x, y + 12, 11, 4, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = c; ctx.strokeStyle = '#2a1d10'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(x - 9, y + 11); ctx.quadraticCurveTo(x, y - 6, x + 9, y + 11); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.arc(x, y - 6, 6, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    });
    ctx.fillStyle = '#ff4fd8'; ctx.font = '900 18px Rockwell, Arial Black, serif'; ctx.fillText('GO \u2192', w * 0.05, h * 0.5);
  }
}

async function onImport(e) {
  const file = e.target.files && e.target.files[0];
  e.target.value = '';
  if (!file) return;
  try {
    const data = await readJSONFile(file);
    const g = data && data.game ? data.game : data;
    if (validateGame(g) && SUITES[g.suite]) {
      const course = sanitizeCourse(g.course);
      if (!course || course.holes.length !== g.holes.length) throw new Error('Course mismatch');
      g.course = course;
      resumeGame(g);
      toast('Round imported');
    } else {
      throw new Error('Not an Arcade Links round');
    }
  } catch (err) {
    sfx.play('error');
    toast(`Import failed: ${err.message}`);
  }
}

async function onHomeMenu() {
  sfx.play('click');
  if (S.game && !S.game.finishedAt) {
    const choice = await dialog({
      title: 'Leave the round?',
      body: 'Your round is saved automatically. You can resume it from the home screen.',
      buttons: [{ label: 'Keep playing', value: 'stay' }, { label: 'Abandon round', value: 'abandon' }, { label: 'Home (save)', value: 'home', primary: true }],
    });
    if (choice === 'stay') return;
    if (choice === 'abandon') clearGame();
  }
  goHome();
}

function goHome() {
  stopRadar();
  clearTimeout(S.cpuTimer);
  gps.stop();
  S.game = null;
  renderLauncher();
  showView('view-launch');
}

// ---------------------------------------------------------------- lobby
function openLobby(suite, keep = false) {
  sfx.play('confirm');
  S.suite = suite;
  setTheme(suite);
  if (!keep || !S.players.length) {
    const saved = loadProfiles(suite.id);
    S.players = saved.length ? saved.map((p, i) => ({ ...defaultPlayer(suite, i), ...p, id: uid(), cpu: false })) : [defaultPlayer(suite, 0)];
    S.modeId = suite.modes[0].id;
  }
  renderLobby();
  showView('view-lobby');
}

function defaultPlayer(suite, i, cpu = false) {
  const p = { id: uid(), name: cpu ? (suite.cpuNames?.[i % suite.cpuNames.length] || `CPU ${i + 1}`) : `Player ${i + 1}`, cpu, skill: cpu ? 0.65 : undefined };
  for (const f of suite.playerFields) p[f.key] = (cpu && suite.cpuDefaults?.[f.key]) || f.options[i % f.options.length].value;
  return p;
}

function wireLobby() {
  $('#btn-add-player').addEventListener('click', () => {
    if (S.players.length >= 4) return;
    S.players.push(defaultPlayer(S.suite, S.players.length));
    sfx.play('select');
    renderLobby();
  });
  $('#btn-add-cpu').addEventListener('click', () => {
    if (S.players.length >= 4) return;
    S.players.push(defaultPlayer(S.suite, S.players.filter((p) => p.cpu).length, true));
    sfx.play('select');
    renderLobby();
  });
  $('#btn-lobby-back').addEventListener('click', () => { sfx.play('click'); renderLauncher(); showView('view-launch'); });
  $('#btn-lobby-next').addEventListener('click', onLobbyNext);
}

function renderLobby() {
  const suite = S.suite;
  $('#lobby-title').textContent = `${suite.name} — Lobby`;
  const list = clear($('#player-list'));
  S.players.forEach((p, i) => {
    const color = PLAYER_COLORS[i % 4];
    const name = el('input', { type: 'text', value: p.name, maxlength: 18, 'aria-label': `Player ${i + 1} name`, autocomplete: 'off', oninput: () => { p.name = name.value; } });
    const card = el('div', { class: 'player-card', style: { '--pc': color } },
      el('div', { class: 'pc-top' },
        p.cpu ? el('span', { class: 'cpu-tag' }, 'CPU') : null,
        name,
        S.players.length > 1 ? el('button', { type: 'button', class: 'pc-remove', 'aria-label': `Remove ${p.name}`, onclick: () => { S.players.splice(i, 1); sfx.play('undo'); renderLobby(); } }, '×') : null),
      ...suite.playerFields.map((f) => el('div', { class: 'pc-field' },
        el('label', {}, f.label),
        segmented(f.options.map((o) => ({ value: o.value, label: o.label, icon: o.icon })), p[f.key], (v) => { p[f.key] = v; }, { name: `${f.key}-${i}` }))),
      p.cpu ? el('div', { class: 'skill-row' }, el('span', {}, 'Skill'),
        el('input', { type: 'range', min: 30, max: 100, value: Math.round((p.skill || 0.65) * 100), 'aria-label': 'CPU skill', oninput: (e) => { p.skill = e.target.value / 100; } })) : null);
    card.style.setProperty('--pc', color);
    list.appendChild(card);
  });
  $('#player-count').textContent = `(${S.players.length}/4)`;
  $('#btn-add-player').disabled = S.players.length >= 4;
  $('#btn-add-cpu').disabled = S.players.length >= 4;

  const grid = clear($('#mode-grid'));
  grid.setAttribute('role', 'radiogroup');
  grid.setAttribute('aria-label', 'Match format');
  for (const m of suite.modes) {
    grid.appendChild(el('button', {
      type: 'button', role: 'radio', class: 'mode-card', 'aria-checked': String(m.id === S.modeId),
      onclick: () => { S.modeId = m.id; sfx.play('select'); renderLobby(); },
    },
    el('span', { class: 'mc-icon', 'aria-hidden': 'true' }, m.icon || '★'),
    el('h3', {}, m.name),
    el('p', {}, m.tagline || ''),
    el('div', { class: 'mc-rules' }, m.description || '')));
  }
}

function onLobbyNext() {
  const suite = S.suite;
  const mode = suite.modes.find((m) => m.id === S.modeId);
  S.players.forEach((p, i) => { p.name = (p.name || '').trim().slice(0, 18) || (p.cpu ? `CPU ${i + 1}` : `Player ${i + 1}`); });
  if (mode.needsRival && S.players.length < 2) {
    S.players.push(defaultPlayer(suite, 0, true));
    toast(`${mode.name} needs a rival — ${S.players[S.players.length - 1].name} joins as CPU.`);
    renderLobby();
  }
  if (S.players.length < (mode.minPlayers || 1)) { sfx.play('error'); toast(`${mode.name} needs at least ${mode.minPlayers} players.`); return; }
  if (S.players.length > (mode.maxPlayers || 4)) { sfx.play('error'); toast(`${mode.name} supports up to ${mode.maxPlayers} players.`); return; }
  saveProfiles(suite.id, S.players);
  sfx.play('confirm');
  openCourse();
}

// ---------------------------------------------------------------- course
function wireCourse() {
  $('#btn-course-back').addEventListener('click', () => { sfx.play('click'); renderLobby(); showView('view-lobby'); });
  $('#btn-course-start').addEventListener('click', startGame);
}

function openCourse() {
  const suite = S.suite;
  if (!S.course || !suite.coursePresets.includes(S.course.id) && S.course.id !== 'custom') S.course = suite.defaultCourse();
  const host = clear($('#course-step'));
  $('#course-title').textContent = suite.renderCourseStep ? 'Scorecard & Course' : 'Course Setup';
  const setCourse = (c) => { const s = sanitizeCourse(c); if (s) S.course = s; };
  if (suite.renderCourseStep) suite.renderCourseStep(host, { course: S.course, setCourse });
  else renderCourseEditor(host, S.course, setCourse, { presets: suite.coursePresets, theme: suite.theme });
  showView('view-course');
}

async function startGame() {
  const suite = S.suite;
  const course = sanitizeCourse(S.course) || suite.defaultCourse();
  const game = createGame({ suite: suite.id, modeId: S.modeId, players: S.players.map((p) => ({ ...p })), course });
  const mode = modeOf(game);
  game.modeState = mode.init(game) || {};
  S.game = game;
  S.undo = [];
  sfx.play('horn');
  if (mode.setup) {
    game.phase = 'setup';
    saveGame(game);
    $('#setup-title').textContent = `${mode.name} — Setup`;
    const host = clear($('#setup-step'));
    showView('view-setup');
    mode.setup(host, game, () => { game.phase = 'hole'; saveGame(game); enterHole(); });
  } else {
    game.phase = 'hole';
    saveGame(game);
    enterHole();
  }
}

function resumeGame(g) {
  const suite = SUITES[g.suite];
  if (!suite) return;
  S.suite = suite;
  S.game = g;
  S.players = g.players.map((p) => ({ ...p }));
  S.modeId = g.modeId;
  S.course = g.course;
  S.undo = [];
  setTheme(suite);
  sfx.play('confirm');
  const mode = modeOf(g);
  if (g.phase === 'summary' || g.finishedAt) return showSummary();
  if (g.phase === 'setup' && mode.setup) {
    const host = clear($('#setup-step'));
    $('#setup-title').textContent = `${mode.name} — Setup`;
    showView('view-setup');
    mode.setup(host, g, () => { g.phase = 'hole'; saveGame(g); enterHole(); });
    return;
  }
  if (isHoleDone(g)) {
    if (g.holes[g.holeIdx].resolved) return advanceHole();
    return finishHole();
  }
  enterHole();
}

// ---------------------------------------------------------------- hole screen
function wireHole() {
  const carry = $('#carry');
  carry.addEventListener('input', () => {
    S.sel.carry = parseInt(carry.value, 10);
    $('#carry-out').textContent = String(S.sel.carry);
    const geo = currentGeo(S.game);
    const from = ballPos(S.game, S.sel.pid);
    if (S.sel.zone && S.sel.zone !== 'cup') {
      S.sel.point = landingForZone(geo, S.sel.zone, from, S.sel.carry, Math.random);
    } else if (!S.sel.zone || S.sel.zone !== 'cup') {
      S.sel.point = landingFromCarry(geo, from, S.sel.carry, 0);
      S.sel.zone = classifyPoint(geo, S.sel.point);
    }
    refreshSelection();
  });
  $('#btn-record').addEventListener('click', () => recordSelected('manual'));
  $('#btn-sim').addEventListener('click', simulateCurrent);
  $('#btn-undo').addEventListener('click', undoLast);
  $('#btn-gps').addEventListener('click', toggleGPS);
  $('#btn-mark').addEventListener('click', markGPS);
  $('#btn-lm-apply').addEventListener('click', () => {
    const c = parseFloat($('#lm-carry').value);
    const o = parseFloat($('#lm-offline').value) || 0;
    if (!Number.isFinite(c) || c <= 0) { toast('Enter a carry distance'); return; }
    const geo = currentGeo(S.game);
    S.sel.point = landingFromCarry(geo, ballPos(S.game, S.sel.pid), Math.min(400, c), Math.max(-80, Math.min(80, o)));
    S.sel.zone = classifyPoint(geo, S.sel.point);
    S.sel.carry = Math.round(c);
    sfx.play('select');
    refreshSelection();
  });
  window.addEventListener('beforeunload', () => { if (S.game) saveGame(S.game); });
  document.addEventListener('visibilitychange', () => { if (document.hidden && S.game) saveGame(S.game); });
  $('#mode-panel').addEventListener('modechange', () => {
    if (!S.game) return;
    saveGame(S.game);
    renderHUD();
    updateBalls();
  });
}

function ensureRadar() {
  const suite = suiteOf();
  if (!S.radar) {
    S.radar = new Radar($('#radar'), { theme: suite.theme, onTap: onRadarTap });
  }
  S.radar.setTheme(suite.theme);
  S.radar.setOverlay((ctx, view, t) => { const m = modeOf(); if (m.overlay) m.overlay(ctx, view, S.game, t); });
  S.radar.start();
}

function stopRadar() { if (S.radar) S.radar.stop(); }

function enterHole() {
  const g = S.game;
  g.phase = 'hole';
  showView('view-hole');
  ensureRadar();
  const geo = currentGeo(g);
  S.radar.setHole(geo);
  const hole = currentHole(g);
  $('#hole-title').textContent = `Hole ${hole.n}${hole.name ? ` · ${hole.name}` : ''}`;
  $('#hole-meta').textContent = `Par ${hole.par} · ${hole.yards} yds · ${modeOf().name}`;
  renderZoneButtons();
  selectPlayer(nextToPlay(g));
  renderAll();
  announce(`Hole ${hole.n}, par ${hole.par}, ${hole.yards} yards.`);
  scheduleCPU();
}

function renderZoneButtons() {
  const grid = clear($('#zone-grid'));
  for (const z of suiteOf().zoneButtons) {
    grid.appendChild(el('button', {
      type: 'button', class: `zone-btn zone-${z.tone || 'fair'}`, 'aria-pressed': 'false', dataset: { zone: z.zone },
      onclick: () => onZoneTap(z.zone),
    }, z.label, z.sub ? el('small', {}, z.sub) : null));
  }
}

function selectPlayer(pid) {
  const g = S.game;
  if (!pid) return;
  const geo = currentGeo(g);
  const from = ballPos(g, pid);
  const lie = currentLie(g, pid);
  const type = suggestShotType(geo, from, lie);
  S.sel = { pid, type, zone: null, point: null, carry: suggestCarry(geo, from, type) };
  const carry = $('#carry');
  carry.max = String(Math.max(60, Math.ceil(distToPin(geo, from) + 40)));
  carry.value = String(S.sel.carry);
  $('#carry-out').textContent = String(S.sel.carry);
  $('#lm-carry').value = '';
  $('#lm-offline').value = '';
}

function onRadarTap(p) {
  if (S.busy || !S.sel.pid || isPlayerDone(S.game, S.sel.pid)) return;
  const geo = currentGeo(S.game);
  S.sel.point = p;
  S.sel.zone = classifyPoint(geo, p);
  const from = ballPos(S.game, S.sel.pid);
  const co = carryOffline(geo, from, p);
  S.sel.carry = Math.max(0, Math.round(S.sel.type === 'putt' ? Math.hypot(p.x - from.x, p.y - from.y) : co.carry));
  if (['bullseye', 'inner', 'green'].includes(S.sel.zone) && S.sel.type !== 'putt' && distToPin(geo, from) < 1) S.sel.type = 'putt';
  sfx.play('click');
  refreshSelection();
}

function onZoneTap(zone) {
  if (S.busy || !S.sel.pid || isPlayerDone(S.game, S.sel.pid)) return;
  const geo = currentGeo(S.game);
  const from = ballPos(S.game, S.sel.pid);
  S.sel.zone = zone;
  S.sel.point = landingForZone(geo, zone, from, S.sel.type === 'putt' ? null : S.sel.carry, Math.random);
  if (zone !== 'cup') S.sel.carry = Math.round(Math.hypot(S.sel.point.x - from.x, S.sel.point.y - from.y));
  sfx.play('select');
  refreshSelection();
}

function refreshSelection() {
  const g = S.game;
  for (const b of document.querySelectorAll('.zone-btn')) {
    const z = b.dataset.zone;
    const on = S.sel.zone === z || (S.sel.zone && z === 'green' && ['inner', 'bullseye'].includes(S.sel.zone) && !document.querySelector(`.zone-btn[data-zone="${S.sel.zone}"]`))
      || (z === 'roughL' && S.sel.zone === 'roughR' && !document.querySelector('.zone-btn[data-zone="roughR"]'));
    b.setAttribute('aria-pressed', String(!!on));
  }
  $('#carry').value = String(S.sel.carry);
  $('#carry-out').textContent = String(S.sel.carry);
  S.radar.setAim(S.sel.zone === 'cup' ? currentGeo(g).pin : S.sel.point);
  const rec = $('#btn-record');
  const done = !S.sel.pid || isPlayerDone(g, S.sel.pid);
  rec.disabled = S.busy || done || !S.sel.zone;
  const p = playerById(g, S.sel.pid);
  rec.textContent = done ? 'Hole complete' : S.sel.zone ? `Record: ${ZONE_NAMES[S.sel.zone]}` : `Pick a landing zone${p ? ` for ${p.name}` : ''}`;
  renderShotTypes();
}

function renderShotTypes() {
  const host = clear($('#shot-types'));
  host.appendChild(segmented(SHOT_TYPES.map((t) => ({ value: t.id, label: t.label })), S.sel.type, (v) => {
    S.sel.type = v;
    const geo = currentGeo(S.game);
    if (!S.sel.zone) { S.sel.carry = suggestCarry(geo, ballPos(S.game, S.sel.pid), v); $('#carry').value = String(S.sel.carry); $('#carry-out').textContent = String(S.sel.carry); }
  }, { name: 'shot-type' }));
}

function renderAll() {
  const g = S.game;
  renderHUD();
  renderTurnRow();
  refreshSelection();
  renderLog();
  renderPanel();
  updateBalls();
  const geo = currentGeo(g);
  if (S.sel.pid) {
    const d = Math.round(distToPin(geo, ballPos(g, S.sel.pid)));
    const lie = currentLie(g, S.sel.pid);
    const dist = clear($('#hole-dist'));
    dist.append(String(d), el('small', {}, 'yds to pin'));
    $('#lie-chip').textContent = `Lie: ${lie === 'tee' ? 'Tee box' : ZONE_NAMES[lie]}`;
  }
  $('#btn-undo').disabled = !S.undo.length || S.busy;
  $('#btn-sim').disabled = S.busy || !S.sel.pid || isPlayerDone(g, S.sel.pid);
}

function renderHUD() {
  const g = S.game;
  const mode = modeOf();
  const host = clear($('#hud'));
  let rows = [];
  try { rows = mode.hud(g) || []; } catch (err) { console.error(err); }
  for (const p of g.players) {
    const r = rows.find((x) => x.pid === p.id) || { value: String(sumStrokes(p.id)), label: 'strokes' };
    const card = el('div', { class: `hud-card ${S.sel.pid === p.id ? 'is-turn' : ''}` },
      r.badge ? el('span', { class: 'hc-badge' }, r.badge) : null,
      el('div', { class: 'hc-name' }, avatarFor(p, 22) || (p.cpu ? '🤖 ' : ''), el('span', {}, p.name)),
      el('div', { class: 'hc-val' }, r.value),
      el('div', { class: 'hc-label' }, r.label || ''),
      r.bar ? el('div', { class: 'hc-bar', role: 'progressbar', 'aria-valuemin': 0, 'aria-valuemax': r.bar.max, 'aria-valuenow': Math.round(r.bar.value), 'aria-label': `${p.name} ${r.label || ''}` },
        el('i', { style: { transform: `scaleX(${Math.max(0, Math.min(1, r.bar.value / (r.bar.max || 1)))})`, background: r.bar.color || p.color } })) : null);
    card.style.setProperty('--pc', p.color);
    host.appendChild(card);
  }
}

function sumStrokes(pid) {
  let s = 0;
  for (let i = 0; i < S.game.holes.length; i++) if (isPlayerDone(S.game, pid, i)) s += holeStrokes(S.game, pid, i);
  return s;
}

function renderTurnRow() {
  const g = S.game;
  const host = clear($('#turn-row'));
  for (const p of g.players) {
    const shots = shotsOf(g, p.id);
    const done = isPlayerDone(g, p.id);
    const strokes = strokesFor(shots);
    const btn = el('button', {
      type: 'button', role: 'tab', class: `turn-btn ${done ? 'is-done' : ''}`, 'aria-selected': String(S.sel.pid === p.id),
      onclick: () => { if (S.busy) return; selectPlayer(p.id); sfx.play('click'); renderAll(); },
    }, p.cpu ? '🤖' : '', p.name, el('span', { class: 'tb-sub' }, done ? `✓ ${holeStrokes(g, p.id)}` : `${strokes} so far`));
    btn.style.setProperty('--pc', p.color);
    host.appendChild(btn);
  }
}

function renderLog() {
  const g = S.game;
  const host = clear($('#shot-log'));
  const all = [];
  for (const p of g.players) for (const s of shotsOf(g, p.id)) all.push({ p, s });
  all.slice(-8).reverse().forEach(({ p, s }) => {
    const li = el('li', {}, el('i', { style: { background: p.color } }),
      `${p.name} · #${s.stroke} ${s.type} ${s.carry}y → ${ZONE_NAMES[s.zone]}${s.holed ? '' : ` (${Math.round(s.distToPin)} to pin)`}${s.penalty ? ' +1 penalty' : ''}`);
    host.appendChild(li);
  });
}

function renderPanel() {
  const mode = modeOf();
  const host = clear($('#mode-panel'));
  if (mode.panel) {
    try { mode.panel(host, S.game, panelApi()); } catch (err) { console.error('panel error', err); }
  }
}

function panelApi() {
  return {
    refresh: () => { saveGame(S.game); renderAll(); },
    save: () => saveGame(S.game),
    playEvents: (events) => playEvents(events, { shakeTarget: $('#app') }),
    selectedPid: S.sel.pid,
  };
}

function updateBalls() {
  const g = S.game;
  S.radar.setBalls(g.players.filter((p) => !isPlayerDone(g, p.id)).map((p) => ({ pid: p.id, color: p.color, pos: ballPos(g, p.id), label: p.name.slice(0, 10), active: p.id === S.sel.pid })));
  S.radar.setTrails(g.players.map((p) => ({ color: p.color, shots: shotsOf(g, p.id) })));
}

function pushUndo() {
  S.undo.push(JSON.stringify(S.game));
  if (S.undo.length > 12) S.undo.shift();
}

function undoLast() {
  if (S.busy || !S.undo.length) return;
  const prev = JSON.parse(S.undo.pop());
  S.game = prev;
  clearTimeout(S.cpuTimer);
  saveGame(S.game);
  sfx.play('undo');
  selectPlayer(nextToPlay(S.game) || S.game.players[0].id);
  renderAll();
  toast('Last shot undone');
}

async function recordSelected(source) {
  const g = S.game;
  if (S.busy || !S.sel.pid || !S.sel.zone || isPlayerDone(g, S.sel.pid)) return;
  await recordShot(S.sel.pid, { type: S.sel.type, zone: S.sel.zone, to: S.sel.point, source });
}

function simulateCurrent() {
  const g = S.game;
  if (S.busy || !S.sel.pid || isPlayerDone(g, S.sel.pid)) return;
  const p = playerById(g, S.sel.pid);
  const sim = simulateForPlayer(p);
  recordShot(p.id, { ...sim, source: 'sim' });
}

function simulateForPlayer(p) {
  return simulateFor(S.game, p.id, p.cpu ? (p.skill || 0.65) : 0.72);
}

async function recordShot(pid, inputOrPromise) {
  const input = await inputOrPromise;
  const g = S.game;
  if (S.busy) return;
  S.busy = true;
  clearTimeout(S.cpuTimer);
  pushUndo();
  const geo = currentGeo(g);
  const player = playerById(g, pid);
  let shot;
  try {
    shot = addShot(g, pid, input);
  } catch (err) {
    S.undo.pop();
    S.busy = false;
    toast(err.message);
    return;
  }
  renderAll();
  sfx.play(shot.type === 'putt' ? 'strike' : 'swing');
  haptic(15);
  S.radar.setAim(null);
  S.radar.flight(shot.from, shot.to, player.color, shot.type === 'putt' ? 0.7 : 1.0);
  await sleep(shot.type === 'putt' ? 700 : 1000);
  sfx.play(shot.zone === 'water' ? 'splash' : shot.zone === 'sand' ? 'sandThud' : shot.holed ? 'cupDrop' : 'strike');
  if (shot.holed) sfx.play('crowd');
  saveGame(g);

  const mode = modeOf();
  let events = [];
  const ctx = { player, shot, geo, hole: currentHole(g), holeIdx: g.holeIdx };
  try { events = mode.onShot(g, ctx) || []; } catch (err) { console.error('onShot error', err); }
  saveGame(g);
  renderAll();
  await playEvents(events, { shakeTarget: $('.radar-wrap') });

  if (mode.shotScene) {
    let scene = null;
    try { scene = mode.shotScene(g, ctx); } catch (err) { console.error(err); }
    if (scene) await playScene(scene, mode, true);
  }

  S.busy = false;
  if (isHoleDone(g)) {
    await finishHole();
    return;
  }
  selectPlayer(nextToPlay(g));
  renderAll();
  scheduleCPU();
}

function scheduleCPU() {
  clearTimeout(S.cpuTimer);
  const g = S.game;
  if (!g || g.phase !== 'hole') return;
  const pid = nextToPlay(g);
  const p = pid && playerById(g, pid);
  if (!p || !p.cpu) return;
  if (S.sel.pid !== pid) { selectPlayer(pid); renderAll(); }
  S.cpuTimer = setTimeout(async () => {
    if (S.busy || S.game !== g || nextToPlay(g) !== pid) return;
    recordShot(pid, simulateForPlayer(p));
  }, 1100);
}

// ---------------------------------------------------------------- GPS
async function toggleGPS() {
  const btn = $('#btn-gps');
  if (!gps.supported) { toast('GPS not available on this device — tap the radar instead.'); return; }
  if (gps.status().active) {
    gps.stop();
    btn.setAttribute('aria-pressed', 'false');
    btn.textContent = 'GPS off';
    $('#btn-mark').hidden = true;
    return;
  }
  await gps.start();
  btn.setAttribute('aria-pressed', 'true');
  btn.textContent = 'GPS: locating…';
  if (!gps._bound) {
    gps._bound = true;
    gps.on((st) => {
      if (!st.active) return;
      if (st.error) btn.textContent = 'GPS error';
      else if (st.fix) btn.textContent = `GPS ±${Math.round(st.fix.acc * 1.094)}y${st.calibrated ? '' : ' · calibrate'}`;
    });
  }
  $('#btn-mark').hidden = false;
  const choice = await dialog({
    title: 'Calibrate GPS',
    body: el('div', {}, el('p', {}, 'Stand on the tee box and face the flag, then tap Calibrate. We anchor the tee and use your compass heading to align the hole.'),
      el('p', {}, 'No compass? We assume the hole runs straight away from where you face. You can always tap the radar instead.')),
    buttons: [{ label: 'Later', value: false }, { label: 'Calibrate now', value: true, primary: true }],
  });
  if (choice) calibrateWhenReady();
}

function calibrateWhenReady(tries = 0) {
  if (gps.calibrate()) { toast(`Tee anchored${gps.heading !== null ? ` · heading ${Math.round(gps.bearing)}°` : ''}`); sfx.play('confirm'); return; }
  if (tries > 20) { toast('Still waiting for a GPS fix — try again in the open.'); return; }
  setTimeout(() => calibrateWhenReady(tries + 1), 750);
}

function markGPS() {
  const p = gps.holePosition();
  if (!p) { toast(gps.status().calibrated ? 'Waiting for GPS fix…' : 'Calibrate on the tee first.'); if (!gps.status().calibrated) calibrateWhenReady(); return; }
  onRadarTap(p);
  toast('Ball marked at your GPS position');
}

// ---------------------------------------------------------------- hole completion, scenes, summary
async function finishHole() {
  const g = S.game;
  const mode = modeOf();
  clearTimeout(S.cpuTimer);
  const ctx = { holeIdx: g.holeIdx, hole: currentHole(g), geo: currentGeo(g), results: holeResults(g) };
  let events = [];
  if (!g.holes[g.holeIdx].resolved) {
    try { events = mode.onHoleComplete(g, ctx) || []; } catch (err) { console.error('onHoleComplete error', err); }
    g.holes[g.holeIdx].resolved = true;
    g.phase = 'scene';
    saveGame(g);
  }
  S.undo = [];
  renderAll();
  await sleep(500);
  await playEvents(events, { shakeTarget: $('#app') });
  let scene = null;
  try { scene = mode.scene ? mode.scene(g, ctx) : null; } catch (err) { console.error('scene error', err); }
  if (scene) await playScene(scene, mode, false);
  advanceHole();
}

function playScene(scene, mode, quick) {
  stopRadar();
  $('#scene-title').textContent = scene.title || mode.name;
  $('#scene-caption').textContent = scene.caption || '';
  const skip = $('#btn-scene-skip');
  skip.textContent = quick ? 'Skip' : 'Skip to next hole';
  showView('view-scene');
  const captionTimer = setInterval(() => { if (scene.caption) $('#scene-caption').textContent = scene.caption; }, 150);
  return runScene($('#scene-canvas'), scene, { skipButton: skip }).then((res) => {
    clearInterval(captionTimer);
    if (quick && S.game && S.game.phase === 'hole') { showView('view-hole'); ensureRadar(); }
    return res;
  });
}

function advanceHole() {
  const g = S.game;
  const mode = modeOf();
  let over = false;
  try { over = mode.isOver ? mode.isOver(g) : false; } catch (err) { console.error(err); }
  if (over || g.holeIdx >= g.holes.length - 1) {
    g.finishedAt = Date.now();
    g.phase = 'summary';
    saveGame(g);
    showSummary();
    return;
  }
  g.holeIdx++;
  g.phase = 'hole';
  saveGame(g);
  sfx.play('horn');
  enterHole();
}

function showSummary() {
  const g = S.game;
  stopRadar();
  gps.stop();
  setTheme(suiteOf());
  const mode = modeOf();
  const host = clear($('#summary'));
  showView('view-summary');
  let standings = [];
  try { standings = mode.standings(g); } catch (err) { console.error(err); }
  const api = {
    exportJSON: () => exportJSON(g, { standings }),
    restart: () => {
      const players = g.players.map((p) => ({ ...p }));
      S.players = players;
      S.modeId = g.modeId;
      S.course = g.course;
      S.suite = suiteOf(g);
      clearGame();
      startGame();
    },
    home: () => { clearGame(); goHome(); },
    standings,
    stats: allRoundStats(g),
  };
  try {
    suiteOf().renderSummary(host, g, mode, api);
  } catch (err) {
    console.error('summary error', err);
    host.append(el('h2', {}, 'Final standings'), el('ol', {}, ...standings.map((s) => el('li', {}, `${playerById(g, s.pid)?.name}: ${s.display}`))),
      el('div', { class: 'row gap' }, el('button', { class: 'btn btn-primary', type: 'button', onclick: api.restart }, 'Play again'), el('button', { class: 'btn btn-ghost', type: 'button', onclick: api.home }, 'Home')));
  }
}

// Expose a tiny debug/QA hook (read-only snapshot + sim helpers) for automated browser QA.
window.__ARCADE__ = {
  get state() { return S.game ? JSON.parse(JSON.stringify(S.game)) : null; },
  simHole: async () => {
    while (S.game && S.game.phase === 'hole' && !isHoleDone(S.game)) {
      if (S.busy) { await sleep(200); continue; }
      const pid = nextToPlay(S.game);
      const p = playerById(S.game, pid);
      if (p.cpu) { await sleep(300); continue; }
      selectPlayer(pid);
      await recordShot(pid, simulateForPlayer(p));
    }
  },
};

boot();
