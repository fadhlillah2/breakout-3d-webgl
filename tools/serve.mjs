// `npm start`: the static server the smoke test already uses, so playing
// locally needs Node and nothing else — no Python, no dependency.
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { startServer } from './harness.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const { port } = await startServer(ROOT, Number(process.env.PORT) || 8000);
console.log(`Breakout 3D: http://127.0.0.1:${port}/  (Ctrl+C to stop)`);
