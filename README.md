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
- Each level draws its wall from an ASCII pattern: bricks take one to three
  hits (the colour is the toughness, and cracks are drawn in the fragment
  shader), and steel bricks never break.
- Breaking a brick can drop a capsule — a wider paddle for 8 s, or a ball
  slowed to 75 % for 6 s. Which brick drops what is a hash of the level and the
  brick's slot, so a replay never diverges.
- A level ends when two breakable bricks are left, so it never turns into a hunt
  for stragglers; the survivors are paid for at the full brick price. The next
  level runs 0.4 units/s faster (cap 7.0; the paddle moves at 9.0 so it can
  always chase the ball), with a slightly narrower paddle (floor 0.5) and a
  different serve angle and palette.
- 5 points per non-fatal hit, 10 per brick broken, 100 per cleared level; best
  score in localStorage.

## Run locally

    python3 -m http.server 8000
    # open http://localhost:8000

## Tests

    node --test test/*.test.mjs   # pure game/input/storage logic, no browser
    node tools/smoke.mjs          # Chrome headless + SwiftShader; needs google-chrome

`tools/smoke.mjs` drives the page in `?autotest=1` mode (paddle tracking the ball,
fixed 60 Hz ticks) and compares the DOM status against the same sequence computed in
Node; it also checks the miss and game-over scenarios, a deeper run whose frame
draws a steel brick, a cracked brick and a falling capsule at once, the WebGL2
fallback (`?nogl=1`), that a pointer over the canvas is not swallowed by the
ready overlay, and that the stage fits short viewports. Headless Chrome clamps its window to
500 CSS px wide, so the narrow boot really runs at 500×393, not at phone width.

`node scripts/screenshot.mjs` regenerates `screenshots/breakout-3d.png` from the
live `?shot=1` scene (with an anti-fabrication DOM guard).

## How it works

- `src/game.js` — DOM-free arena on a classic breakout play plane at a fixed
  depth: adaptive sub-stepping (never more than half a ball radius per step),
  exact circle-vs-rect brick contact reflected about the contact normal, and a
  minimum horizontal component after every bounce so the ball can never lock
  into a vertical loop. Level layouts, capsule drops and serve angles all come
  from a small integer hash of the game state, so there is no RNG anywhere and
  the same ticks always replay the same game.
- `src/gl.js` + `src/cube.js` — one shader program, one cube mesh, flat shading,
  distance fog, and a floor grid in the fragment shader (shared with the
  tower-stack-webgl demo).
- `src/main.js` — DOM wiring, pointer/keyboard input, HUD, and the
  `?autotest=1`, `?shot=1`, `?nogl=1` modes used by the tooling.

## Limitations

- Gameplay is a classic 2D breakout plane rendered in 3D: ball, paddle and brick
  wall all travel in x/y at one fixed depth — the depth of each body is
  render-only — and the paddle only returns balls that reach its own height.
  There is no depth travel: an earlier fully-3D ball model produced phantom
  mid-air returns and vertical locks.
- Two capsule types only; no audio, accounts, or leaderboard.
- Requires WebGL2; without it a fallback message is shown.
- The smoke test runs Chrome with SwiftShader: it verifies correctness, not GPU performance.

## License

No license file yet — the source is public for review.
