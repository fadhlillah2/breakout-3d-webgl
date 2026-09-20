// Deterministic screenshot of ?shot=1 — used by the README and reused as the
// portfolio card asset. One Chrome run yields both the DOM the guard inspects
// and the PNG it vouches for, and the whole capture runs twice: "the shot mode
// is frozen" is the claim the committed asset rests on, so it is a gate here
// rather than a sentence in the README.
import { copyFileSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createHash } from 'node:crypto';
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
  const flags = [
    '--headless=new', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-first-run', '--disable-gpu',
    '--hide-scrollbars', '--force-device-scale-factor=1', `--window-size=${W},${H}`, '--virtual-time-budget=5000',
  ];
  // Chrome re-layouts the page at the window size when it captures, after the
  // DOM dump, so the page measured one size for the DOM the guard reads and
  // another for the pixels: ?w/?h hand it that size up front, and the checks
  // below pin both the rendered frame and the box it is displayed in.
  const url = `http://127.0.0.1:${port}/?shot=1&ticks=350&w=${W}&h=${H}`;
  const capture = async (name) => {
    const file = join(temp, name);
    const dom = await runChrome(chrome, [...flags, '--dump-dom', `--screenshot=${file}`, url]);
    assertShotDom(dom);
    const frame = /data-frame="([^"]*)"/.exec(dom)?.[1];
    if (frame !== `${W}x${H}`) {
      throw new Error(`the frame was rendered at ${frame ?? 'an unreported size'}, not ${W}x${H}: the guard would be vouching for a frame the PNG does not hold`);
    }
    // The rendered size is only half of it: a canvas laid out smaller than the
    // window leaves background in the PNG, at no cost to the size checks.
    const box = /data-box="([^"]*)"/.exec(dom)?.[1];
    if (box !== `0,0,${W},${H}`) {
      throw new Error(`the canvas covers ${box ?? 'an unreported box'}, not all of the ${W}x${H} frame`);
    }
    const bytes = readFileSync(file);
    const signature = [137, 80, 78, 71, 13, 10, 26, 10];
    if (!signature.every((b, i) => bytes[i] === b)) throw new Error('not a PNG');
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const width = view.getUint32(16), height = view.getUint32(20);
    if (width !== W || height !== H) throw new Error(`unexpected size ${width}x${height}`);
    return { file, bytes, hash: createHash('sha256').update(bytes).digest('hex') };
  };

  const first = await capture('capture-1.png');
  const second = await capture('capture-2.png');
  if (first.hash !== second.hash) {
    throw new Error(`?shot=1 is not deterministic: ${first.hash} !== ${second.hash}`);
  }
  copyFileSync(first.file, OUT);
  console.log(`OK screenshots/breakout-3d.png ${W}x${H} (${first.bytes.length} bytes)`);
  console.log(`OK two captures agree byte for byte (sha256 ${first.hash})`);
} finally {
  server.closeAllConnections?.();
  server.close();
  rmSync(temp, { recursive: true, force: true });
}
