import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { extname, join, normalize, resolve } from 'node:path';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.json': 'application/json; charset=utf-8',
};

export function startServer(root, port = 0) {
  const server = createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    let path = decodeURIComponent(url.pathname);
    if (path.endsWith('/')) path += 'index.html';
    const file = resolve(root, '.' + normalize(path));
    if (!file.startsWith(resolve(root))) { res.writeHead(403); res.end(); return; }
    try {
      const body = await readFile(file);
      res.writeHead(200, { 'content-type': MIME[extname(file)] || 'application/octet-stream' });
      res.end(body);
    } catch {
      res.writeHead(404); res.end('not found');
    }
  });
  return new Promise((ok) => {
    server.listen(port, '127.0.0.1', () => ok({ server, port: server.address().port }));
  });
}

export function findChrome() {
  const candidates = [process.env.CHROME, 'google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser'].filter(Boolean);
  for (const name of candidates) {
    if (spawnSync('which', [name], { encoding: 'utf8' }).status === 0) return name;
  }
  return null;
}

// The screenshot tool must never save a fallback page as if it were the game
// (anti-fabrication rule): verify the dumped DOM before writing the PNG.
export function assertShotDom(dom) {
  const gl = /data-gl="([^"]*)"/.exec(dom)?.[1];
  if (gl !== 'ok') throw new Error(`shot page is not rendering the game (data-gl=${gl ?? 'missing'})`);
  if (/data-error="/.test(dom)) throw new Error('shot page reported a runtime error');
  if (!/class="[^"]*shot/.test(dom)) throw new Error('shot mode class missing');
  return true;
}

// Async on purpose: a synchronous spawn would block this process's event loop,
// and the in-process HTTP server could never answer Chrome (deadlock).
// Fresh --user-data-dir per run: an inherited profile can hang headless Chrome
// and caches scripts between runs (lesson carried over from the Bio repo).
export function runChrome(chrome, args) {
  const profile = mkdtempSync(join(tmpdir(), 'breakout-chrome-'));
  return new Promise((resolve, reject) => {
    const child = spawn(chrome, [`--user-data-dir=${profile}`, ...args], { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    let settled = false;
    const finish = (fn, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try {
        rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
      } catch {
        /* a leftover temp profile must never mask the test result */
      }
      fn(value);
    };
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      finish(reject, new Error('Chrome timed out after 60s'));
    }, 60_000);
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('error', (error) => finish(reject, error));
    child.on('close', (code) => {
      if (code !== 0) finish(reject, new Error(`Chrome exited ${code}: ${stderr.slice(0, 400)}`));
      else finish(resolve, stdout);
    });
  });
}
