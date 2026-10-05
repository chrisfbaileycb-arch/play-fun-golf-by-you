// DOM UI primitives: view switching, banners, toasts, dialogs, ARIA announcements.
import { el, $, clear, prefersReducedMotion } from './util.js';
import { sfx, haptic } from './audio.js';
import { shakeElement } from './fx.js';

export function showView(id) {
  for (const v of document.querySelectorAll('.view')) {
    const on = v.id === id;
    v.hidden = !on;
    v.classList.toggle('is-active', on);
  }
  const target = document.getElementById(id);
  const h = target && target.querySelector('h1, h2');
  if (h) { h.setAttribute('tabindex', '-1'); h.focus({ preventScroll: true }); }
  window.scrollTo(0, 0);
}

export function announce(text) {
  const live = $('#live');
  if (!live) return;
  live.textContent = '';
  requestAnimationFrame(() => { live.textContent = text; });
}

let bannerQueue = Promise.resolve();
/** Big arcade banner ("HIT!", "SORRY!", "CRITICAL STRIKE"). Queued so they never overlap. */
export function banner(text, { sub = '', color = '', ms = 1400 } = {}) {
  bannerQueue = bannerQueue.then(() => new Promise((resolve) => {
    const host = $('#banner-host');
    if (!host) return resolve();
    const node = el('div', { class: 'banner', role: 'status' },
      el('div', { class: 'banner-text', style: color ? { color } : null }, text),
      sub ? el('div', { class: 'banner-sub' }, sub) : null);
    host.appendChild(node);
    announce(sub ? `${text}. ${sub}` : text);
    const dur = prefersReducedMotion() ? ms * 0.6 : ms;
    setTimeout(() => { node.classList.add('out'); setTimeout(() => { node.remove(); resolve(); }, 260); }, dur);
  }));
  return bannerQueue;
}

export function toast(text, { ms = 2200 } = {}) {
  const host = $('#toast-host');
  if (!host) return;
  const node = el('div', { class: 'toast', role: 'status' }, text);
  host.appendChild(node);
  setTimeout(() => { node.classList.add('out'); setTimeout(() => node.remove(), 300); }, ms);
}

/** Modal dialog built on <dialog>. buttons: [{label, value, primary}]. Resolves with value. */
export function dialog({ title, body, buttons = [{ label: 'OK', value: true, primary: true }], className = '' }) {
  return new Promise((resolve) => {
    const d = el('dialog', { class: `modal ${className}`, 'aria-labelledby': 'modal-title' });
    const content = typeof body === 'string' ? el('p', {}, body) : body;
    const actions = el('div', { class: 'modal-actions' });
    for (const b of buttons) {
      actions.appendChild(el('button', {
        class: `btn ${b.primary ? 'btn-primary' : 'btn-ghost'}`, type: 'button',
        onclick: () => { sfx.play('click'); d.close(); d.remove(); resolve(b.value); },
      }, b.label));
    }
    d.append(el('h2', { id: 'modal-title' }, title), content, actions);
    d.addEventListener('cancel', (e) => { e.preventDefault(); });
    document.body.appendChild(d);
    d.showModal();
  });
}

/** Process mode events emitted from pure game logic. Returns a promise that resolves after banners. */
export async function playEvents(events = [], { shakeTarget = null, log = null } = {}) {
  const waits = [];
  for (const ev of events) {
    switch (ev.t) {
      case 'sfx': sfx.play(ev.name, ev); break;
      case 'banner': waits.push(banner(ev.text, ev)); break;
      case 'toast': toast(ev.text); break;
      case 'shake': shakeElement(shakeTarget || $('#app'), ev.mag || 8); break;
      case 'haptic': haptic(ev.pattern || 30); break;
      case 'log': if (log) log(ev.text); break;
      default: break;
    }
  }
  await Promise.all(waits);
}

export function segmented(options, value, onChange, { name = 'seg', className = '' } = {}) {
  const wrap = el('div', { class: `segmented ${className}`, role: 'radiogroup' });
  const render = (val) => {
    clear(wrap);
    for (const o of options) {
      wrap.appendChild(el('button', {
        type: 'button', role: 'radio', 'aria-checked': String(o.value === val), class: `seg ${o.value === val ? 'is-on' : ''}`,
        name, title: o.title || null,
        onclick: () => { sfx.play('select'); render(o.value); onChange(o.value); },
      }, o.icon ? el('span', { class: 'seg-icon', 'aria-hidden': 'true' }, o.icon) : null, el('span', { class: 'seg-label' }, o.label), o.sub ? el('small', {}, o.sub) : null));
    }
  };
  render(value);
  return wrap;
}

export function confirmDialog(title, body, okLabel = 'Confirm') {
  return dialog({ title, body, buttons: [{ label: 'Cancel', value: false }, { label: okLabel, value: true, primary: true }] });
}
