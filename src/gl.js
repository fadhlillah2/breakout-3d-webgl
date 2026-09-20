// Small WebGL2 renderer: one program, one cube mesh. A hemisphere ambient over
// a directional light, a rim term, per-draw fog, an analytic floor grid and the
// paddle's contact shadow — all in the one fragment shader, no second pass and
// no extra draw call. createRenderer never throws — failures are data, not throws.
import { createCubeMesh } from './cube.js';

const VS = `#version 300 es
precision highp float;
layout(location = 0) in vec3 aPos;
layout(location = 1) in vec3 aNormal;
uniform mat4 uViewProj;
uniform mat4 uModel;
out vec3 vNormal;
out vec3 vWorld;
void main() {
  vec4 world = uModel * vec4(aPos, 1.0);
  vWorld = world.xyz;
  // Every model matrix here is a positive, axis-aligned scale plus a
  // translation, and every mesh normal is an axis. diag(sx,sy,sz) * axis is
  // that axis scaled, so it normalises back to itself: the inverse-transpose
  // would give the same unit vector. Stops being true the moment a rotated or
  // mirrored model matrix is drawn.
  vNormal = mat3(uModel) * aNormal;
  gl_Position = uViewProj * world;
}`;

const FS = `#version 300 es
precision highp float;
in vec3 vNormal;
in vec3 vWorld;
uniform vec3 uColor;
uniform vec3 uLightDir;
uniform vec3 uCamPos;
uniform vec3 uBg;
uniform float uGrid;
// x = fog density multiplier, y = the most of the colour the fog may take. Set
// per group of draws: the floor wants to dissolve past the frustum while the
// brick wall wants to keep its colour, and one global density cannot do both.
uniform vec2 uFog;
// xyz = the ball in world space, w = how brightly it lights the scene.
uniform vec4 uBall;
// 0 = lit normally, 1 = glowing with its own colour (the ball, a paddle catch).
uniform float uEmissive;
// x = damage 0..1, yz = the brick's centre in world space.
uniform vec3 uDamage;
// The paddle's contact shadow, with no shadow pass and no draw of its own:
// xy = its centre as (x, z), z = its height above the floor, w = its half
// width. w = 0 turns it off.
uniform vec4 uPadShadow;
out vec4 outColor;

// Sky above, floor bounce below: the cheapest light that tells the six faces of
// a cube apart, which is the whole reason the bricks used to read as squares.
const vec3 SKY = vec3(0.32, 0.38, 0.50);
const vec3 GROUND = vec3(0.20, 0.20, 0.22);
const vec3 SUN = vec3(1.0, 0.96, 0.88);

void main() {
  vec3 n = normalize(vNormal);
  vec3 v = normalize(uCamPos - vWorld);
  vec3 l = normalize(uLightDir);
  float ndl = max(dot(n, l), 0.0);
  vec3 ambient = mix(GROUND, SKY, n.y * 0.5 + 0.5);
  vec3 base = uColor * (ambient + SUN * ndl);
  // The face separation comes from the hemisphere above, not from a specular
  // lobe: every surface in the scene is an axis-aligned cube face, so
  // dot(n, halfway) is all but constant over a face and Blinn-Phong collapses
  // into a per-face offset with no highlight in it. Measured at exponent 42 it
  // moved nothing (<1/255); opened right up to 14 it was still 5/255 on a brick
  // and 0 on the walls and the paddle, while washing the colour out.
  //
  // Rim: uCamPos and vWorld are already here, so the edge light is three ops.
  // It scales the surface's own colour rather than adding white — the arena
  // walls are seen almost edge-on over most of the frame, and an additive rim
  // washed both of them to the same grey and undid the hemisphere entirely.
  float rim = pow(1.0 - max(dot(n, v), 0.0), 3.0) * 0.45;
  base += uColor * rim;
  // Analytic grid: fwidth keeps the line about a pixel and a half wide at every
  // distance, which is what lets the floor run far past the frustum without the
  // lines turning into moire. Where the spacing itself drops under a pixel the
  // grid fades out instead of going solid.
  vec2 gw = fwidth(vWorld.xz) * 1.5;
  vec2 gd = abs(fract(vWorld.xz + 0.5) - 0.5) / max(gw, vec2(1e-5));
  float line = (1.0 - min(min(gd.x, gd.y), 1.0)) * (1.0 - smoothstep(0.2, 0.7, max(gw.x, gw.y)));
  base = mix(base, uColor * 3.0 + 0.05, line * uGrid * 0.85);
  if (uDamage.x > 0.0) {
    // Twelve procedural cracks radiating from the brick centre; no texture.
    vec2 p = vWorld.xy - uDamage.yz;
    // atan(0,0) is undefined in GLSL ES, and the brick centre is exactly that
    // fragment; 0.0 puts it in the hub where all twelve spokes meet.
    float spoke = dot(p, p) > 0.0 ? abs(fract(atan(p.y, p.x) * 1.9099 + 0.37) - 0.5) : 0.0;
    float crack = smoothstep(0.055, 0.0, spoke) * smoothstep(0.32, 0.05, length(p));
    base = mix(base, base * 0.22, crack * uDamage.x);
  }
  // The ball is a moving point light: the cheapest line in the renderer that
  // makes the scene feel lit rather than painted.
  vec3 toBall = uBall.xyz - vWorld;
  float ballDist = length(toBall);
  float ballLit = max(dot(n, toBall / max(ballDist, 1e-4)), 0.0) / (1.0 + ballDist * ballDist * 0.45);
  // Half albedo, half white: the glow reads as light on the brick, not as more
  // brick colour.
  base += (uColor * 0.5 + 0.5) * ballLit * uBall.w;
  // Contact shadow, applied last because the paddle occludes the ball's light
  // as well as the ambient: multiplying before that addition left a 1/255
  // darkening under a paddle the ball was lighting. Only an up-facing surface
  // standing on the floor takes it.
  float onFloor = max(n.y, 0.0) * (1.0 - smoothstep(0.0, 0.25, abs(vWorld.y)));
  if (onFloor > 0.0 && uPadShadow.w > 0.0) {
    // A pool around the paddle's base, not a projection: the camera looks down
    // only a few degrees, so the floor directly under a body is hidden by the
    // body, and a correctly projected patch would never be seen at all. The
    // ball deliberately gets none — it is a light source, and the bright pool
    // it already throws on the floor is what grounds it.
    vec2 pd = vWorld.xz - uPadShadow.xy;
    float soft = 0.25 + uPadShadow.z * 1.2;
    float pool = (1.0 - smoothstep(0.0, soft, max(abs(pd.x) - uPadShadow.w, 0.0)))
      * (1.0 - smoothstep(0.0, soft, abs(pd.y)));
    base *= 1.0 - 0.6 * pool * onFloor / (1.0 + uPadShadow.z * 2.0);
  }
  base = mix(base, uColor * 1.9 + 0.12, uEmissive);
  float fog = 1.0 - exp(-length(vWorld - uCamPos) * 0.055 * uFog.x);
  outColor = vec4(mix(base, uBg, clamp(fog, 0.0, uFog.y)), 1.0);
}`;

export function createRenderer(canvas) {
  const gl = canvas.getContext('webgl2', {
    alpha: false, antialias: true, depth: true, powerPreference: 'low-power',
  });
  if (!gl) return { ok: false, error: 'no-webgl2' };

  const compile = (type, source) => {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      throw new Error(gl.getShaderInfoLog(shader) || 'shader compile failed');
    }
    return shader;
  };

  let program;
  try {
    program = gl.createProgram();
    gl.attachShader(program, compile(gl.VERTEX_SHADER, VS));
    gl.attachShader(program, compile(gl.FRAGMENT_SHADER, FS));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      throw new Error(gl.getProgramInfoLog(program) || 'link failed');
    }
  } catch (error) {
    return { ok: false, error: String(error && error.message ? error.message : error) };
  }

  const mesh = createCubeMesh(gl);
  const u = {
    viewProj: gl.getUniformLocation(program, 'uViewProj'),
    model: gl.getUniformLocation(program, 'uModel'),
    color: gl.getUniformLocation(program, 'uColor'),
    lightDir: gl.getUniformLocation(program, 'uLightDir'),
    camPos: gl.getUniformLocation(program, 'uCamPos'),
    bg: gl.getUniformLocation(program, 'uBg'),
    grid: gl.getUniformLocation(program, 'uGrid'),
    fog: gl.getUniformLocation(program, 'uFog'),
    damage: gl.getUniformLocation(program, 'uDamage'),
    ball: gl.getUniformLocation(program, 'uBall'),
    emissive: gl.getUniformLocation(program, 'uEmissive'),
    padShadow: gl.getUniformLocation(program, 'uPadShadow'),
  };
  gl.enable(gl.DEPTH_TEST);
  gl.enable(gl.CULL_FACE);
  // One program, one mesh: bound for the lifetime of the renderer.
  gl.useProgram(program);
  gl.bindVertexArray(mesh.vao);
  gl.uniform3f(u.lightDir, 0.4, 0.85, 0.35);

  let drawCount = 0;
  let gridCount = 0;
  let crackCount = 0;
  const bg = new Float32Array(3);
  let bgSet = false;
  // Fog is a property of the group being drawn, not of each cube: uploading it
  // once per group is four calls a frame instead of one per draw.
  let fogScale = 0;
  let fogMax = 0;
  // Reused translate*scale matrix: the cube is axis-aligned, so the product is
  // closed-form and no per-draw allocation is needed.
  const model = new Float32Array(16);
  model[15] = 1;

  return {
    ok: true,
    gl,
    // Draws in the frame currently on screen: clear() starts the count over, so
    // the harnesses can compare it against a count derived from game state.
    get drawCount() { return drawCount; },
    // Steel and a cracked brick draw the same cube as any other brick, so the
    // cube count alone cannot tell whether they still take their own branch.
    get gridCount() { return gridCount; },
    get crackCount() { return crackCount; },
    resize(cssWidth, cssHeight, dpr = 1) {
      const w = Math.max(1, Math.round(cssWidth * dpr));
      const h = Math.max(1, Math.round(cssHeight * dpr));
      if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
      gl.viewport(0, 0, w, h);
    },
    setCamera(viewProj, cameraEye, background) {
      gl.uniformMatrix4fv(u.viewProj, false, viewProj);
      gl.uniform3fv(u.camPos, cameraEye);
      // Compared by value, not by identity: the life-lost tint mutates one
      // scratch array per frame, and an identity check would leave both uBg and
      // the clear colour on the old background with nothing to notice it.
      if (!bgSet || bg[0] !== background[0] || bg[1] !== background[1] || bg[2] !== background[2]) {
        bg.set(background);
        bgSet = true;
        gl.uniform3fv(u.bg, bg);
        gl.clearColor(bg[0], bg[1], bg[2], 1);
      }
    },
    setBall(x, y, z, strength) {
      gl.uniform4f(u.ball, x, y, z, strength);
    },
    // The paddle's footprint on the floor: (x, z), its height above the floor,
    // and the half width that shapes the pool. A zero half width is off.
    setPaddleShadow(x, z, height, half) {
      gl.uniform4f(u.padShadow, x, z, height, half);
    },
    // Uploaded only when it changes, for the same reason the background is.
    setFog(scale, max) {
      if (scale === fogScale && max === fogMax) return;
      fogScale = scale;
      fogMax = max;
      gl.uniform2f(u.fog, scale, max);
    },
    clear() {
      drawCount = 0;
      gridCount = 0;
      crackCount = 0;
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    },
    drawCube(x, y, z, sx, sy, sz, color, grid = 0, damage = 0, emissive = 0) {
      model[0] = sx; model[5] = sy; model[10] = sz;
      model[12] = x; model[13] = y; model[14] = z;
      gl.uniformMatrix4fv(u.model, false, model);
      gl.uniform3fv(u.color, color);
      gl.uniform1f(u.grid, grid);
      gl.uniform3f(u.damage, damage, x, y);
      gl.uniform1f(u.emissive, emissive);
      gl.drawElements(gl.TRIANGLES, mesh.count, gl.UNSIGNED_SHORT, 0);
      drawCount += 1;
      if (grid > 0) gridCount += 1;
      if (damage > 0) crackCount += 1;
    },
    getError() { return gl.getError(); },
  };
}
