// Test entry: each suite owns its own test file (core / knight / boardwalk-a / boardwalk-b).
import { run } from './harness.js';

const files = ['./core.test.js', './knight.test.js', './boardwalk.test.js', './boardwalk2.test.js', './celebration.test.js'];
const out = document.getElementById('out');
for (const f of files) {
  try {
    await import(`${f}?t=${Date.now()}`);
  } catch (e) {
    const p = document.createElement('pre');
    p.style.color = '#f88';
    p.textContent = `Failed to load ${f}: ${e && e.stack ? e.stack : e}`;
    out.appendChild(p);
    window.__LOAD_ERRORS__ = (window.__LOAD_ERRORS__ || []).concat(`${f}: ${e}`);
  }
}
await run(out);
