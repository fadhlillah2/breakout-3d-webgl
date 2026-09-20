// Small WebGL2 renderer: one program, one cube mesh, fog + floor grid in the
// fragment shader. createRenderer never throws — failures are returned as data.
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
// x = damage 0..1, yz = the brick's centre in world space.
uniform vec3 uDamage;
out vec4 outColor;
void main() {
  vec3 n = normalize(vNormal);
  float diffuse = max(dot(n, normalize(uLightDir)), 0.0);
  vec3 base = uColor * (0.45 + 0.55 * diffuse);
  vec2 g = abs(fract(vWorld.xz) - 0.5);
  float edge = smoothstep(0.455, 0.5, max(g.x, g.y));
  base = mix(base, uColor * 1.7, edge * uGrid * 0.5);
  if (uDamage.x > 0.0) {
    // Twelve procedural cracks radiating from the brick centre; no texture.
    vec2 p = vWorld.xy - uDamage.yz;
    // atan(0,0) is undefined in GLSL ES, and the brick centre is exactly that
    // fragment; 0.0 puts it in the hub where all twelve spokes meet.
    float spoke = dot(p, p) > 0.0 ? abs(fract(atan(p.y, p.x) * 1.9099 + 0.37) - 0.5) : 0.0;
    float crack = smoothstep(0.055, 0.0, spoke) * smoothstep(0.32, 0.05, length(p));
    base = mix(base, base * 0.22, crack * uDamage.x);
  }
  float fog = 1.0 - exp(-length(vWorld - uCamPos) * 0.055);
  outColor = vec4(mix(base, uBg, clamp(fog, 0.0, 0.85)), 1.0);
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
    damage: gl.getUniformLocation(program, 'uDamage'),
  };
  gl.enable(gl.DEPTH_TEST);
  gl.enable(gl.CULL_FACE);
  // One program, one mesh: bound for the lifetime of the renderer.
  gl.useProgram(program);
  gl.bindVertexArray(mesh.vao);
  gl.uniform3f(u.lightDir, 0.4, 0.85, 0.35);

  let drawCount = 0;
  let bg = null;
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
    resize(cssWidth, cssHeight, dpr = 1) {
      const w = Math.max(1, Math.round(cssWidth * dpr));
      const h = Math.max(1, Math.round(cssHeight * dpr));
      if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
      gl.viewport(0, 0, w, h);
    },
    setCamera(viewProj, cameraEye, background) {
      gl.uniformMatrix4fv(u.viewProj, false, viewProj);
      gl.uniform3fv(u.camPos, cameraEye);
      // Compared by identity: pass a new array to change the background, never
      // mutate this one in place. clear() relies on the clearColor set here.
      if (background !== bg) {
        bg = background;
        gl.uniform3fv(u.bg, bg);
        gl.clearColor(bg[0], bg[1], bg[2], 1);
      }
    },
    clear() {
      drawCount = 0;
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    },
    drawCube(x, y, z, sx, sy, sz, color, grid = 0, damage = 0) {
      model[0] = sx; model[5] = sy; model[10] = sz;
      model[12] = x; model[13] = y; model[14] = z;
      gl.uniformMatrix4fv(u.model, false, model);
      gl.uniform3fv(u.color, color);
      gl.uniform1f(u.grid, grid);
      gl.uniform3f(u.damage, damage, x, y);
      gl.drawElements(gl.TRIANGLES, mesh.count, gl.UNSIGNED_SHORT, 0);
      drawCount += 1;
    },
    getError() { return gl.getError(); },
  };
}
