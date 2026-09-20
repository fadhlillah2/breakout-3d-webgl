# Breakout 3D — hand-written WebGL2

A 3D brick breaker rendered by a small hand-written WebGL2 pipeline.
No engine, no framework, no runtime dependencies — plain ES modules and GLSL.

**Play:** https://fadhlillah2.github.io/breakout-3d-webgl/

## Controls

- Move the paddle: mouse / touch drag, or ← → (A/D)
- Serve: Space / Enter / click / tap
- Pause: Esc
- After a game over, the serve input restarts

## Rules

- 3 lives; losing the ball behind the paddle costs one.
- Clearing all bricks starts the next level 0.4 units/s faster (cap 8.0).
- 10 points per brick, 100 per cleared level; best score in localStorage.

## Run locally

    python3 -m http.server 8000
    # open http://localhost:8000

## Tests

    node --test test/*.test.mjs   # pure game/input/storage logic, no browser
    node tools/smoke.mjs          # Chrome headless + SwiftShader; needs google-chrome

`tools/smoke.mjs` drives the page in `?autotest=1` mode (paddle tracking the ball,
fixed 60 Hz ticks) and compares the DOM status against the same sequence computed in
Node; it also checks the miss and game-over scenarios, the WebGL2 fallback
(`?nogl=1`), and a 320×480 boot.

`node scripts/screenshot.mjs` regenerates `screenshots/breakout-3d.png` from the
live `?shot=1` scene (with an anti-fabrication DOM guard).

## How it works

- `src/game.js` — DOM-free arena: sub-stepped physics (≤0.02 s) with a swept
  brick-plane test so the ball cannot tunnel at max speed; paddle steering;
  score/lives/levels; deterministic (no randomness).
- `src/gl.js` + `src/cube.js` — one shader program, one cube mesh, flat shading,
  distance fog, and a floor grid in the fragment shader (shared with the
  tower-stack-webgl demo).
- `src/main.js` — DOM wiring, pointer/keyboard input, static camera, HUD, and the
  `?autotest=1`, `?shot=1`, `?nogl=1` modes used by the tooling.

## Limitations

- The paddle returns the ball anywhere along its x-range at any height ("x-shield"),
  a common simplification for 3D breakout clones; the floor reflects, so the only
  way to lose a ball is behind the paddle.
- Bricks are one hit each; no power-ups, audio, accounts, or leaderboard.
- Requires WebGL2; without it a fallback message is shown.
- The smoke test runs Chrome with SwiftShader: it verifies correctness, not GPU performance.

## License

No license file yet — the source is public for review.
