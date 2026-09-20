// Deterministic screenshot of ?shot=1 — used by the README and reused as the
// portfolio card asset. Verifies the PNG signature and exact dimensions.
import { copyFileSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertShotDom, findChrome, runChrome, startServer } from '../tools/harness.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'screenshots', 'breakout-3d.png');
const W = 1200, H = 675;

const chrome = findChrome();
if (!chrome) { console.error('FAIL no Chrome found (set CHROME or install google-chrome)'); process.exit(1); }

const { server, port } = await startServer(ROOT);
const temp = mkdtempSync(join(tmpdir(), 'breakout-shot-'));
try {
  const shot = join(temp, 'breakout-3d.png');
  const flags = [
    '--headless=new', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-first-run', '--disable-gpu',
    '--hide-scrollbars', '--force-device-scale-factor=1', `--window-size=${W},${H}`, '--virtual-time-budget=5000',
  ];
  const dom = await runChrome(chrome, [...flags, '--dump-dom', `http://127.0.0.1:${port}/?shot=1&ticks=350`]);
  assertShotDom(dom);
  await runChrome(chrome, [...flags, `--screenshot=${shot}`, `http://127.0.0.1:${port}/?shot=1&ticks=350`]);
  const bytes = readFileSync(shot);
  const signature = [137, 80, 78, 71, 13, 10, 26, 10];
  if (!signature.every((b, i) => bytes[i] === b)) throw new Error('not a PNG');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const width = view.getUint32(16), height = view.getUint32(20);
  if (width !== W || height !== H) throw new Error(`unexpected size ${width}x${height}`);
  copyFileSync(shot, OUT);
  console.log(`OK screenshots/breakout-3d.png ${width}x${height} (${bytes.length} bytes)`);
} finally {
  server.closeAllConnections?.();
  server.close();
  rmSync(temp, { recursive: true, force: true });
}
