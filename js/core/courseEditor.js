// Editable course/hole list with live mini fairway previews.
// renderCourseEditor(container, course, onChange, { presets?: string[], theme?: 'knight'|'boardwalk' })
import { el, clear, fitCanvas } from './util.js';
import { PRESETS, clampHole, sanitizeCourse, coursePar, courseYards, makeHole, defaultYards } from './course.js';
import { synthesize } from './fairway.js';
import { RADAR_THEMES } from './radar.js';
import { sfx } from './audio.js';

const PRESET_LABELS = {
  camelot: 'Camelot Greens Executive 9',
  boardwalk: 'Boardwalk Municipal 9',
  pitch: 'Seaside Pitch & Putt (Par-3)',
};

export function drawMiniHole(canvas, hole, themeName = 'knight') {
  const T = RADAR_THEMES[themeName] || RADAR_THEMES.knight;
  const { w, h, ctx } = fitCanvas(canvas);
  const g = synthesize(hole);
  const b = g.bounds;
  const k = Math.min((w - 6) / (b.maxX - b.minX), (h - 6) / (b.maxY - b.minY));
  const ox = w / 2 - ((b.minX + b.maxX) / 2) * k, oy = h / 2 + ((b.minY + b.maxY) / 2) * k;
  const S = (p) => ({ x: ox + p.x * k, y: oy - p.y * k });
  ctx.fillStyle = T.bg;
  ctx.fillRect(0, 0, w, h);
  const line = (width, color, from, to) => {
    ctx.beginPath();
    let first = true;
    for (const p of g.path) {
      if (p.s < from || p.s > to) continue;
      const s = S(p);
      if (first) { ctx.moveTo(s.x, s.y); first = false; } else ctx.lineTo(s.x, s.y);
    }
    ctx.lineWidth = Math.max(1, width * k);
    ctx.lineCap = 'round';
    ctx.strokeStyle = color;
    ctx.stroke();
  };
  line(g.fairwayWidth + g.roughWidth * 2, T.rough, 0, g.yards);
  line(g.fairwayWidth, T.fairway, g.fairwayStart, g.fairwayEnd);
  for (const wt of g.water) { const c = S(wt); ctx.fillStyle = T.water; ctx.beginPath(); ctx.ellipse(c.x, c.y, wt.rx * k, wt.ry * k, -wt.rot, 0, Math.PI * 2); ctx.fill(); }
  const gc = S(g.green);
  ctx.fillStyle = T.green; ctx.beginPath(); ctx.arc(gc.x, gc.y, g.green.r * k, 0, Math.PI * 2); ctx.fill();
  for (const bk of g.bunkers) { const c = S(bk); ctx.fillStyle = T.sand; ctx.beginPath(); ctx.ellipse(c.x, c.y, bk.rx * k, bk.ry * k, -bk.rot, 0, Math.PI * 2); ctx.fill(); }
  const pc = S(g.pin);
  ctx.fillStyle = T.ring[2]; ctx.beginPath(); ctx.arc(pc.x, pc.y, 2.5, 0, Math.PI * 2); ctx.fill();
  const tp = S(g.tee); ctx.fillStyle = T.tee; ctx.fillRect(tp.x - 3, tp.y - 2, 6, 4);
}

export function renderCourseEditor(container, course, onChange, { presets = ['camelot', 'boardwalk', 'pitch'], theme = 'knight' } = {}) {
  let state = sanitizeCourse(course) || PRESETS[presets[0]]();
  clear(container);

  const summary = el('div', { class: 'course-summary', 'aria-live': 'polite' });
  const list = el('div', { class: 'hole-editor' });
  const presetSel = el('select', { id: 'course-preset', 'aria-label': 'Course preset' },
    ...presets.map((p) => el('option', { value: p, selected: state.id === p }, PRESET_LABELS[p] || p)),
    el('option', { value: 'custom', selected: !presets.includes(state.id) }, 'Custom course'));
  const nameInput = el('input', { type: 'text', id: 'course-name', value: state.name, maxlength: 60, 'aria-label': 'Course name' });
  const countSel = el('select', { id: 'course-holes', 'aria-label': 'Number of holes' },
    ...[3, 6, 9, 18].map((n) => el('option', { value: n, selected: state.holes.length === n }, `${n} holes`)));

  presetSel.addEventListener('change', () => {
    if (presetSel.value === 'custom') return;
    state = PRESETS[presetSel.value]();
    nameInput.value = state.name;
    countSel.value = String(state.holes.length);
    sfx.play('select');
    renderAll();
    emit();
  });
  nameInput.addEventListener('input', () => {
    state = { ...state, name: nameInput.value.slice(0, 60) || 'Custom Course', id: presetSel.value === 'custom' ? 'custom' : state.id };
    emit();
  });
  countSel.addEventListener('change', () => {
    const n = parseInt(countSel.value, 10);
    const holes = [];
    for (let i = 0; i < n; i++) {
      const src = state.holes[i % state.holes.length];
      holes.push(i < state.holes.length ? state.holes[i] : makeHole(i + 1, src.par, src.yards, -src.dogleg, src.hazards));
    }
    state = { ...state, id: 'custom', holes: holes.map((h, i) => clampHole(h, i + 1)) };
    presetSel.value = 'custom';
    renderAll();
    emit();
  });

  container.append(
    el('div', { class: 'course-toolbar' },
      el('label', {}, 'Preset', presetSel),
      el('label', {}, 'Course name', nameInput),
      el('label', { style: { flex: '0 1 140px' } }, 'Holes', countSel)),
    summary, list);

  function emit() {
    updateSummary();
    onChange(state);
  }

  function updateSummary() {
    clear(summary);
    summary.append(
      el('span', {}, el('b', {}, String(state.holes.length)), ' holes'),
      el('span', {}, 'Par ', el('b', {}, String(coursePar(state)))),
      el('span', {}, el('b', {}, courseYards(state).toLocaleString()), ' yds'));
  }

  function holeRow(h, i) {
    const cvs = el('canvas', { width: 64, height: 96, 'aria-hidden': 'true' });
    const update = (patch) => {
      const merged = { ...state.holes[i], ...patch, hazards: { ...state.holes[i].hazards, ...(patch.hazards || {}) } };
      if (patch.par && !patch.yards) {
        const y = parseInt(yards.value, 10);
        const p = parseInt(patch.par, 10);
        if ((p === 3 && y > 260) || (p === 5 && y < 400) || (p === 4 && (y < 220 || y > 500))) { merged.yards = defaultYards(p); yards.value = String(merged.yards); }
      }
      const nh = clampHole(merged, i + 1);
      state = { ...state, id: 'custom', holes: state.holes.map((x, j) => (j === i ? nh : x)) };
      presetSel.value = 'custom';
      title.lastChild.textContent = `Par ${nh.par} · ${nh.yards} yds`;
      requestAnimationFrame(() => drawMiniHole(cvs, nh, theme));
      emit();
    };
    const par = el('select', { 'aria-label': `Hole ${i + 1} par`, onchange: () => update({ par: par.value }) },
      ...[3, 4, 5].map((p) => el('option', { value: p, selected: h.par === p }, `Par ${p}`)));
    const yards = el('input', { type: 'number', min: 60, max: 700, value: h.yards, inputmode: 'numeric', 'aria-label': `Hole ${i + 1} yards`, onchange: () => update({ yards: yards.value }) });
    const dog = el('input', { type: 'range', min: -100, max: 100, step: 5, value: Math.round(h.dogleg * 100), 'aria-label': `Hole ${i + 1} dogleg (left to right)`, oninput: () => update({ dogleg: dog.value / 100 }) });
    const bunk = el('input', { type: 'number', min: 0, max: 6, value: h.hazards.bunkers, inputmode: 'numeric', 'aria-label': `Hole ${i + 1} bunkers`, onchange: () => update({ hazards: { bunkers: bunk.value } }) });
    const water = el('input', { type: 'checkbox', checked: h.hazards.water, onchange: () => update({ hazards: { water: water.checked } }) });
    const name = el('input', { type: 'text', value: h.name || '', maxlength: 40, placeholder: 'Hole name', 'aria-label': `Hole ${i + 1} name`, onchange: () => update({ name: name.value }) });
    const title = el('div', { class: 'he-title' }, el('span', {}, `Hole ${i + 1}`), el('span', {}, `Par ${h.par} · ${h.yards} yds`));
    const row = el('div', { class: 'he-row' }, cvs,
      el('div', { class: 'he-fields' }, title,
        el('label', {}, 'Par', par),
        el('label', {}, 'Yards', yards),
        el('label', {}, 'Dogleg L ↔ R', dog),
        el('label', {}, 'Bunkers', bunk),
        el('label', { class: 'chk' }, water, 'Water hazard'),
        el('label', {}, 'Name', name)));
    requestAnimationFrame(() => drawMiniHole(cvs, h, theme));
    return row;
  }

  function renderAll() {
    clear(list);
    state.holes.forEach((h, i) => list.appendChild(holeRow(h, i)));
    updateSummary();
  }

  renderAll();
  onChange(state);
  return {
    get course() { return state; },
    setCourse(c) { const s = sanitizeCourse(c); if (!s) return; state = s; nameInput.value = s.name; countSel.value = String(s.holes.length); presetSel.value = presets.includes(s.id) ? s.id : 'custom'; renderAll(); emit(); },
  };
}
