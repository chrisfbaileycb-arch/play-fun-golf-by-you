// Minimal in-browser test harness (no dependencies). Results land in window.__TEST_RESULTS__.
const tests = [];
let currentFile = '';

export function setFile(name) { currentFile = name; }
export function test(name, fn) { tests.push({ file: currentFile, name, fn }); }

export const assert = {
  ok(v, msg = 'expected truthy') { if (!v) throw new Error(msg); },
  equal(a, b, msg) { if (a !== b) throw new Error(msg || `expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`); },
  deepEqual(a, b, msg) { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(msg || `expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`); },
  near(a, b, eps = 1e-6, msg) { if (Math.abs(a - b) > eps) throw new Error(msg || `expected ≈${b}, got ${a}`); },
  throws(fn, msg = 'expected throw') { let t = false; try { fn(); } catch { t = true; } if (!t) throw new Error(msg); },
  gt(a, b, msg) { if (!(a > b)) throw new Error(msg || `expected ${a} > ${b}`); },
  lt(a, b, msg) { if (!(a < b)) throw new Error(msg || `expected ${a} < ${b}`); },
};

export async function run(root) {
  const results = [];
  for (const t of tests) {
    try { await t.fn(); results.push({ ...t, ok: true }); } catch (e) { results.push({ ...t, ok: false, err: e && e.stack ? e.stack : String(e) }); }
  }
  const pass = results.filter((r) => r.ok).length;
  window.__TEST_RESULTS__ = { pass, fail: results.length - pass, total: results.length, failures: results.filter((r) => !r.ok).map((r) => ({ file: r.file, name: r.name, err: r.err })) };
  const h = document.createElement('h1');
  h.textContent = `${pass}/${results.length} passed`;
  h.style.color = pass === results.length ? '#3c3' : '#e33';
  root.appendChild(h);
  let file = null;
  for (const r of results) {
    if (r.file !== file) { file = r.file; const h2 = document.createElement('h2'); h2.textContent = file; root.appendChild(h2); }
    const p = document.createElement('div');
    p.textContent = `${r.ok ? '✔' : '✘'} ${r.name}${r.ok ? '' : ' — ' + r.err}`;
    p.style.color = r.ok ? '#9c9' : '#f88';
    p.style.whiteSpace = 'pre-wrap';
    root.appendChild(p);
  }
  return window.__TEST_RESULTS__;
}
