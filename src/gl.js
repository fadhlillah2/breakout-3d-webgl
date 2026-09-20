// Small WebGL2 renderer: one program, one cube mesh, fog + floor grid in the
// fragment shader. createRenderer never throws — failures are returned as data.
import { createCubeMesh } from './cube.js';
import { multiply, translation, scaling } from './math.js';

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
out vec4 outColor;
void main() {
  vec3 n = normalize(vNormal);
  float diffuse = max(dot(n, normalize(uLightDir)), 0.0);
  vec3 base = uColor * (0.45 + 0.55 * diffuse);
  vec2 g = abs(fract(vWorld.xz) - 0.5);
  float edge = smoothstep(0.455, 0.5, max(g.x, g.y));
  base = mix(base, uColor * 1.7, edge * uGrid * 0.5);
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
  };
  gl.enable(gl.DEPTH_TEST);
  gl.enable(gl.CULL_FACE);
  gl.useProgram(program);
  gl.uniform3f(u.lightDir, 0.4, 0.85, 0.35);

  let drawCount = 0;
  let bg = [0, 0, 0];
  let eye = [0, 0, 0];

  return {
    ok: true,
    gl,
    get drawCount() { return drawCount; },
    resize(cssWidth, cssHeight, dpr = 1) {
      const w = Math.max(1, Math.round(cssWidth * dpr));
      const h = Math.max(1, Math.round(cssHeight * dpr));
      if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
      gl.viewport(0, 0, w, h);
    },
    setCamera(viewProj, cameraEye, background) {
      eye = cameraEye;
      bg = background;
      gl.useProgram(program);
      gl.uniformMatrix4fv(u.viewProj, false, viewProj);
      gl.uniform3fv(u.camPos, eye);
      gl.uniform3fv(u.bg, bg);
    },
    clear() {
      gl.clearColor(bg[0], bg[1], bg[2], 1);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    },
    drawCubeModel(model, color, grid = 0) {
      gl.uniformMatrix4fv(u.model, false, model);
      gl.uniform3fv(u.color, color);
      gl.uniform1f(u.grid, grid);
      gl.bindVertexArray(mesh.vao);
      gl.drawElements(gl.TRIANGLES, mesh.count, gl.UNSIGNED_SHORT, 0);
      drawCount += 1;
    },
    drawCube(x, y, z, sx, sy, sz, color, grid = 0) {
      this.drawCubeModel(multiply(translation(x, y, z), scaling(sx, sy, sz)), color, grid);
    },
    getError() { return gl.getError(); },
  };
}
