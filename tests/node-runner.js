import { run } from './harness.js';

await import('./core.test.js');
await import('./knight.test.js');
await import('./boardwalk.test.js');
await import('./boardwalk2.test.js');
await import('./celebration.test.js');

const res = await run();
if (res.fail > 0) {
  process.exit(1);
} else {
  process.exit(0);
}
