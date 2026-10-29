/**
 * The ASCII view's two passes, in GLSL.
 *
 * Pass A runs once per text cell: it samples the scene at six points under
 * the cell, composes the layers, lights them, picks the winning material
 * and its glyph, and writes the glyph, its colour and the background into
 * two small textures. Pass B runs per screen pixel and only looks the glyph
 * up in the atlas. Pass A is world/compose.ts and world/ascii.ts written
 * again: change one, change the other.
 */

export const VERTEX = `#version 300 es
in vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }
`;

export const MAX_LIGHTS = 16;

export const CELLS = `#version 300 es
precision highp float;
precision highp int;

uniform sampler2D uBase, uBaseAux, uFol, uFolAux, uDyn, uBack, uBackTop, uFore, uMat, uRuns, uOverlay;
uniform ivec2 uWorld0, uWorldSize, uBackSize, uForeSize, uCells;
uniform vec2 uGrid0, uStep;
uniform vec4 uView;
uniform float uTime, uAmbient, uBoardR;
uniform int uTick, uLightN, uSlash;
uniform vec4 uLightA[${MAX_LIGHTS}];
uniform vec3 uLightC[${MAX_LIGHTS}];

layout(location = 0) out vec4 oFg;
layout(location = 1) out vec4 oBg;

const vec3 HAZE = vec3(58.0, 70.0, 108.0);
const vec3 NIGHT = vec3(6.0, 8.0, 20.0);

float hash3(int x, int y, int s) {
  uint n = uint(x) * 374761393u + uint(y) * 668265263u + uint(s) * 1274126177u;
  n = (n ^ (n >> 13u)) * 1274126177u;
  n = n ^ (n >> 16u);
  return float(n) / 4294967296.0;
}

vec4 world(sampler2D s, int ax, int ay) {
  ivec2 p = ivec2(ax, ay) - uWorld0;
  if (p.x < 0 || p.y < 0 || p.x >= uWorldSize.x || p.y >= uWorldSize.y) return vec4(0.0);
  return texelFetch(s, p, 0) * 255.0;
}

vec4 matInfo(int m) { return texelFetch(uMat, ivec2(m, 0), 0) * 255.0; }
bool isEmissive(int m) { return (int(matInfo(m).a + 0.5) & 8) != 0; }
bool isFloor(int m) { return (int(matInfo(m).a + 0.5) & 4) != 0; }

float windAt(float x, float y, float t) {
  float a = sin(x * 0.045 - t * 1.6 + sin(y * 0.07 + t * 0.4) * 1.5);
  float b = sin(x * 0.021 - t * 0.9 + y * 0.013);
  return 0.5 + 0.32 * a + 0.18 * b;
}

int swayOf(float ax, float ay, float h, float t) {
  float w = windAt(ax, ay, t);
  float k = min(1.0, h / 40.0);
  return int(floor((sin(t * 1.3 + ax * 0.05) * 0.6 + (w - 0.5) * 2.4) * k * 2.2 + 0.5));
}

float wallFoot(float ax) {
  return min(uView.y + 46.0, -(uBoardR + 1.0) * 6.0 + abs(ax) / 2.0 - 30.0);
}

bool onBoard(float ax, float ay, float margin) {
  return abs(ax) / 12.0 + abs(ay) / 6.0 <= uBoardR + 1.0 + margin;
}

float hazeAt(float y) {
  float back = (-48.0 - y) / 150.0;
  return back <= 0.0 ? 0.0 : min(3.0, floor(back * 4.0)) * 0.14;
}

vec3 shade(int m, vec3 c, float ax, float ay, bool hazed) {
  if (isEmissive(m)) return c;
  float amb = (m >= 40 && m <= 54) ? max(uAmbient, 0.95)
    : (!hazed && onBoard(ax, ay, 0.0)) ? min(1.0, uAmbient * 1.22) : uAmbient;
  vec3 o = c * amb + NIGHT * 0.5;
  float level = 0.0;
  vec3 col = vec3(0.0);
  for (int i = 0; i < ${MAX_LIGHTS}; i++) {
    if (i >= uLightN) break;
    vec4 l = uLightA[i];
    float d = length(vec2(ax - l.x, (ay - l.y) * 1.15));
    float v = l.w * (1.0 - d / l.z);
    if (v > level) { level = v; col = uLightC[i]; }
  }
  level = clamp(floor(level * 4.0) / 4.0, 0.0, 1.0);
  if (level > 0.0) o = o * (1.0 + 0.6 * level) + col * 0.35 * level;
  if (hazed) { float h = hazeAt(ay); if (h > 0.0) o = mix(o, HAZE, h); }
  return o;
}

void sampleAt(float fx, float fy, out int mat, out vec3 c, out vec3 under) {
  int ax = int(floor(fx)), ay = int(floor(fy));
  float x = float(ax), y = float(ay);
  float foot = wallFoot(x);
  vec4 b = world(uBase, ax, ay);
  int bm = int(b.a + 0.5);
  int um; vec3 uc;
  bool behindWall = false;
  if (y < foot || bm == 0) {
    behindWall = true;
    int v = int(floor(foot)) - ay;
    int u = ax - uWorld0.x;
    vec4 w = (v >= 0 && v < uBackSize.y && u >= 0 && u < uBackSize.x) ? texelFetch(uBack, ivec2(u, v), 0) * 255.0 : vec4(0.0);
    if (w.a > 0.5) { um = int(w.a + 0.5); uc = w.rgb; }
    else {
      float top = (u >= 0 && u < uBackSize.x) ? texelFetch(uBackTop, ivec2(u, 0), 0).r * 255.0 : 0.0;
      float vv = max(0.0, float(v));
      float k = min(3.0, floor(max(0.0, vv - top) / 18.0)) / 3.0;
      float s = hash3(ax, int(vv), 77);
      if (s > 0.986) { float tw = 0.6 + 0.4 * sin(uTime * 2.0 + s * 400.0); um = 17; uc = vec3(200.0, 210.0, 255.0) * tw; }
      else { um = 16; uc = mix(HAZE * 0.5, NIGHT, k); }
    }
  } else {
    um = bm; uc = b.rgb;
    float d = world(uBaseAux, ax, ay).r;
    if (d > 0.5) {
      int ripple = int(floor(sin(uTime * 2.2 + y * 0.9) * 1.2 + 0.5));
      vec4 r = world(uFol, ax + ripple, ay - 2 * int(d + 0.5) + 2);
      int rm = int(r.a + 0.5);
      if (rm != 0 && rm != 40) { um = 18; uc = uc * 0.55 + r.rgb * 0.4; }
    }
  }
  int tm = um; vec3 tc = uc;

  int guess = swayOf(x, y, 40.0, uTime);
  float h = world(uFolAux, ax - guess, ay).r;
  int sway = h > 0.5 ? swayOf(x, y, h, uTime) : 0;
  vec4 f = world(uFol, ax - sway, ay);
  if (f.a > 0.5) {
    float fyFoot = world(uFolAux, ax - sway, ay).b * 2.0 + float(uWorld0.y);
    if (!behindWall || fyFoot >= foot) { tm = int(f.a + 0.5); tc = f.rgb; }
  }

  vec4 dn = world(uDyn, ax, ay);
  int dm = int(dn.a + 0.5);
  if (dm == 63) {
    bool same = tm == um;
    uc = uc * vec3(0.5, 0.5, 0.6);
    if (same) tc = uc;
  } else if (dm != 0) { tm = dm; tc = dn.rgb; }

  int fu = ax - int(floor(uView.x));
  int fv = int(floor(uView.w)) - ay;
  if (fv >= 0 && fv < uForeSize.y && fu >= 0 && fu < uForeSize.x) {
    vec4 g = texelFetch(uFore, ivec2(fu, fv), 0) * 255.0;
    if (g.a > 0.5 && !onBoard(x, y, 0.5)) { mat = int(g.a + 0.5); c = g.rgb; under = g.rgb * 0.6; return; }
  }

  bool hazed = behindWall || !onBoard(x, y, 0.0);
  mat = tm;
  c = shade(tm, tc, x, y, hazed);
  under = shade(um, uc, x, y, hazed);
}

float gainOf(int m, bool gust) {
  if (m == 2) return gust ? 1.75 : 1.3;
  if (m == 13) return gust ? 1.3 : 1.0;
  if (m == 6) return 1.5;
  if (m == 18) return 1.25;
  if (m == 22 || m == 20 || m == 21 || m == 23 || m == 24) return 1.25;
  return isFloor(m) ? 1.2 : 1.0;
}

int glyphFor(int m, float lum, int sx, int sy, bool gust) {
  if (gust && (m == 2 || m == 13)) return uSlash;
  vec4 info = matInfo(m);
  int start = int(info.g + 0.5), count = int(info.b + 0.5), pick = int(info.a + 0.5) & 3;
  if (count == 0) return 0;
  int k;
  if (pick == 0) k = min(count - 1, int(floor(min(0.999, lum * 1.6) * float(count))));
  else if (pick == 2) k = int(floor(hash3(sx, sy, m + uTick * 131) * float(count)));
  else k = int(floor(hash3(sx, sy, m) * float(count)));
  return int(texelFetch(uRuns, ivec2(start + k, 0), 0).r * 255.0 + 0.5);
}

vec3 lift(vec3 c, float gain, vec3 floor_) { return min(vec3(255.0), c * gain + floor_); }

float vignette(vec2 uv) {
  float e = max(abs(uv.x - 0.5), abs(uv.y - 0.5) * 1.15) * 2.0;
  return e < 0.72 ? 1.0 : e < 0.86 ? 0.84 : e < 0.96 ? 0.7 : 0.58;
}

void main() {
  ivec2 cell = ivec2(gl_FragCoord.xy);
  float left = uGrid0.x + float(cell.x) * uStep.x;
  float top = uGrid0.y + float(cell.y) * uStep.y;

  int mats[6]; vec3 cols[6]; vec3 unders[6];
  for (int i = 0; i < 6; i++) {
    float fx = left + (float(i % 2) * 0.5 + 0.25) * uStep.x;
    float fy = top + (float(i / 2) / 3.0 + 1.0 / 6.0) * uStep.y;
    sampleAt(fx, fy, mats[i], cols[i], unders[i]);
  }
  // Thin materials (outline 40, mortar 21) win only a cell they half fill: see isThin.
  int best = -1, win = 0;
  for (int i = 0; i < 6; i++) {
    int p = int(matInfo(mats[i]).r + 0.5);
    if (p <= best) continue;
    if (mats[i] == 40 || mats[i] == 21) {
      int same = 0;
      for (int j = 0; j < 6; j++) if (mats[j] == mats[i]) same++;
      if (same * 2 < 6) continue;
    }
    best = p; win = mats[i];
  }
  vec3 fg = vec3(0.0), bg = vec3(0.0);
  float n = 0.0;
  for (int i = 0; i < 6; i++) {
    bg += unders[i];
    if (mats[i] == win) { fg += cols[i]; n += 1.0; }
  }
  fg /= max(n, 1.0);
  bg = bg / 6.0 * 0.45;

  float cx = left + uStep.x * 0.5, cy = top + uStep.y * 0.5;
  bool gust = windAt(cx, cy, uTime) > 0.75;
  int sx = int(floor(cx)), sy = int(floor(cy));
  float lum = dot(fg, vec3(0.299, 0.587, 0.114)) / 255.0;
  int glyph = glyphFor(win, lum, sx, sy, gust);
  bool quiet = (int(matInfo(win).a + 0.5) & 16) != 0;
  vec3 shown = quiet ? bg * 2.1 : fg * gainOf(win, gust);
  vec3 fgOut = lift(shown, 1.35, vec3(10.0, 10.0, 12.0));
  vec3 bgOut = lift(bg, 1.7, vec3(4.0, 5.0, 8.0));

  vec4 o = texelFetch(uOverlay, cell, 0) * 255.0;
  if (o.a > 0.5 && best < 9) { glyph = int(o.a + 0.5) - 1; fgOut = lift(o.rgb, 1.35, vec3(10.0)); }

  float vg = vignette((vec2(cell) + 0.5) / vec2(uCells));
  oFg = vec4(fgOut * vg / 255.0, float(glyph) / 255.0);
  oBg = vec4(bgOut * vg / 255.0, 1.0);
}
`;

export const GLYPHS = `#version 300 es
precision highp float;
precision highp int;
uniform sampler2D uFg, uBg, uAtlas;
uniform ivec2 uGlyph, uCanvas;
uniform int uAtlasCols;
out vec4 oColor;
void main() {
  ivec2 p = ivec2(gl_FragCoord.xy);
  p.y = uCanvas.y - 1 - p.y;
  ivec2 cell = p / uGlyph;
  ivec2 local = p - cell * uGlyph;
  vec4 fg = texelFetch(uFg, cell, 0);
  vec4 bg = texelFetch(uBg, cell, 0);
  int g = int(fg.a * 255.0 + 0.5);
  ivec2 ap = ivec2((g % uAtlasCols) * uGlyph.x + local.x, (g / uAtlasCols) * uGlyph.y + local.y);
  float a = texelFetch(uAtlas, ap, 0).a;
  oColor = vec4(mix(bg.rgb, fg.rgb, a), 1.0);
}
`;
