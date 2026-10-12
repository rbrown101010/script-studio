// @ts-nocheck
/* eslint-disable */
// Riley's "drawing board" style engine (sketch-kit.js from the Drawing Board Style artifact,
// https://claude.ai/artifact/5X7A8YuaeKiLrk74taN6vx), unchanged apart from being wrapped as a module.
// Browser only: import it lazily from client code.
const holder: any = {};
/* =====================================================================
   SKETCH KIT — the "drawing board" look from Riley's LLM Funnel short
   (video #18, v1 + v2). Extracted from the real render engine:
     ~/Downloads/video-production-2/llm-funnel-whiteboard/engine.js
     ~/Downloads/video-production-2/llm-funnel-whiteboard/player.js
     ~/Downloads/video-production-2/llm-funnel-whiteboard/theme.js
   Plain browser JS, no dependencies, Canvas 2D. Exposes one global: Sketch.

   Core ideas (see STYLE.md for the full spec):
   - Lines are hand-inked: resampled every 5px, nudged along their normal by two
     slow sine waves (the "jitter"), overshoot their endpoints by 1-6px, round caps.
   - Every stroke and fill is painted with a GRAIN PATTERN (solid with tiny gaps and
     drag streaks), so it reads like a soft pencil / colored pencil, never a vector.
   - Each line gets a paper-colored halo underneath so it cleanly cuts across fills.
   - Fills are colored-pencil MARKER hatching: back-and-forth strokes at -0.62 rad
     (about -35deg), clipped to the shape, with a darker rim and erased streaks.
   - Big numbers/words: outline letters drawn first in ink, then marker fill inside.
   - Everything animates as a pure function of progress p in [0,1] (seek-safe).
   - A big hexagonal pencil rides the drawing point and takes the color it draws.
   ===================================================================== */
(function (root) {
  const TAU = Math.PI * 2;

  /* ---------------- theme tokens (theme.js of the LLM Funnel build) ---------------- */
  const THEME = {
    paper: '#FBFAF7',      // the sheet
    desk: '#D8D2C5',       // shown around the sheet when zoomed out
    ink: '#2B2B2C',        // all outlines and lettering
    graphite: '#6B6A66',   // secondary ink, avatars, muted marks
    cons: '#5B8FC7',       // blue "construction" lines + mono labels
    primary: '#E2774F',    // coral
    secondary: '#4F8DD6',  // blue
    accent: '#C96FA6',     // pink-violet
    tertiary: '#C28F55',   // tan / wood
    positive: '#7FA752',   // green ticks
    negative: '#E24B3F',   // red crosses
    neutral: '#8E8B84',    // grey tier
    light: '#6F98C2',
    violet: '#9B6FC9',     // 4th funnel tier
    highlight: '#F6D36B',  // caption highlighter (yellow)
    highlightNum: '#F4AE92', // caption highlighter for numbers (peach)
    lineK: 1.75,           // global line-thickness multiplier
    fonts: {
      display: '"Archivo", system-ui, sans-serif',            // 800-900: headings, big numbers, captions
      hand: '"Architects Daughter", "Comic Sans MS", cursive', // 400: handwritten notes
      mono: '"JetBrains Mono", ui-monospace, monospace',       // 500-700: labels, uppercase, +1px tracking
      ui: '"Inter", system-ui, sans-serif',                    // 500-600: fake app UI text
    },
  };
  const GOOGLE_FONTS = 'https://fonts.googleapis.com/css2?family=Archivo:wght@500..900&family=Architects+Daughter&family=Inter:wght@400..700&family=JetBrains+Mono:wght@400..700&display=block';

  /* ---------------- utils ---------------- */
  const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
  const lerp = (a, b, t) => a + (b - a) * t;
  const prog = (t, t0, d) => d <= 0 ? (t >= t0 ? 1 : 0) : clamp((t - t0) / d);
  const smooth5 = t => { t = clamp(t); return t * t * t * (t * (t * 6 - 15) + 10); };
  const E = {
    inOut: t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2,
    out: t => 1 - Math.pow(1 - t, 3),
    sine: t => -(Math.cos(Math.PI * t) - 1) / 2,   // default draw-on ease for ink
    back: t => { const c = 1.6; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); },
    smooth5,
  };
  function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  function makeRng(seed) {
    const r = mulberry32(seed * 9973 + 17);
    const f = (a = 0, b = 1) => a + (b - a) * r();
    f.g = () => { let u = 0, v = 0; while (!u) u = r(); while (!v) v = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(TAU * v); };
    return f;
  }
  const hash = n => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
  function hexRgb(h) { h = h.replace('#', ''); return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]; }
  function rgba(h, a = 1) { const [r, g, b] = hexRgb(h); return `rgba(${r},${g},${b},${a})`; }
  function mixHex(h1, h2, t) { const a = hexRgb(h1), b = hexRgb(h2); return '#' + a.map((v, i) => Math.round(lerp(v, b[i], t)).toString(16).padStart(2, '0')).join(''); }
  function mkCanvas(w, h) { const c = document.createElement('canvas'); c.width = Math.max(1, Math.ceil(w)); c.height = Math.max(1, Math.ceil(h)); return c; }
  function bboxOf(pts, pad = 0) { let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9; for (const p of pts) { if (p[0] < x0) x0 = p[0]; if (p[1] < y0) y0 = p[1]; if (p[0] > x1) x1 = p[0]; if (p[1] > y1) y1 = p[1]; } return { x: x0 - pad, y: y0 - pad, w: x1 - x0 + 2 * pad, h: y1 - y0 + 2 * pad }; }
  function pathPoly(c, pts, close = true) { c.beginPath(); c.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) c.lineTo(pts[i][0], pts[i][1]); if (close) c.closePath(); }

  /* ---------------- pencil grain ---------------- */
  // 256px tileable alpha mask: ~95% solid (alpha 0.9-1), ~5-12% clumpy gaps (alpha 0.5-0.7),
  // plus 260 short drag streaks angled about -20deg. grain(color) = repeating pattern of that color.
  const GN = 256; let MASK = null; const GRAIN_CACHE = {};
  function grainMask() {
    if (MASK) return MASK;
    const rng = makeRng(777), N = GN, m = new Float32Array(N * N);
    const lo = new Float32Array(32 * 32).map(() => rng());
    const lowAt = (x, y) => { const gx = x / N * 32, gy = y / N * 32, x0 = Math.floor(gx), y0 = Math.floor(gy), fx = gx - x0, fy = gy - y0;
      const v = (i, j) => lo[((j % 32 + 32) % 32) * 32 + ((i % 32 + 32) % 32)];
      return (v(x0, y0) * (1 - fx) + v(x0 + 1, y0) * fx) * (1 - fy) + (v(x0, y0 + 1) * (1 - fx) + v(x0 + 1, y0 + 1) * fx) * fy; };
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) { const r = rng(), clump = lowAt(x, y); m[y * N + x] = clamp(r < 0.05 + clump * 0.07 ? 0.5 + r * 2 : 0.9 + rng() * 0.1); }
    for (let k = 0; k < 260; k++) {
      let x = rng() * N, y = rng() * N; const L = rng(4, 18), ang = -0.35 + rng(-0.25, 0.25), d = rng(0.1, 0.3);
      for (let i = 0; i < L; i++) { const X = ((Math.round(x + Math.cos(ang) * i) % N) + N) % N, Y = ((Math.round(y + Math.sin(ang) * i) % N) + N) % N; m[Y * N + X] *= 1 - d; }
    }
    return (MASK = m);
  }
  function grain(col) {
    if (typeof col !== 'string' || col[0] !== '#') return col;
    if (GRAIN_CACHE[col]) return GRAIN_CACHE[col];
    const m = grainMask(), c = mkCanvas(GN, GN), x = c.getContext('2d'), img = x.createImageData(GN, GN), [r, g, b] = hexRgb(col);
    for (let i = 0; i < GN * GN; i++) { img.data[i * 4] = r; img.data[i * 4 + 1] = g; img.data[i * 4 + 2] = b; img.data[i * 4 + 3] = Math.round(m[i] * 255); }
    x.putImageData(img, 0, 0);
    return (GRAIN_CACHE[col] = x.createPattern(c, 'repeat'));
  }

  /* ---------------- geometry ---------------- */
  const G = {
    rect: (x, y, w, h) => [[x, y], [x + w, y], [x + w, y + h], [x, y + h]],
    circle: (cx, cy, r, n = 64, a0 = 0, a1 = TAU) => { const o = []; for (let i = 0; i <= n; i++) { const a = a0 + (a1 - a0) * i / n; o.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]); } if (a1 - a0 >= TAU - 1e-6) o.pop(); return o; },
    ellipse: (cx, cy, rx, ry, n = 64, a0 = 0, a1 = TAU) => { const o = []; for (let i = 0; i <= n; i++) { const a = a0 + (a1 - a0) * i / n; o.push([cx + Math.cos(a) * rx, cy + Math.sin(a) * ry]); } if (a1 - a0 >= TAU - 1e-6) o.pop(); return o; },
    bez: (p0, p1, p2, p3, n = 40) => { const o = []; for (let i = 0; i <= n; i++) { const t = i / n, u = 1 - t; o.push([u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0], u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1]]); } return o; },
    rrect: (x, y, w, h, r, n = 6) => { const pts = [], c = [[x + w - r, y + r, -Math.PI / 2], [x + w - r, y + h - r, 0], [x + r, y + h - r, Math.PI / 2], [x + r, y + r, Math.PI]]; for (const [cx, cy, a0] of c) for (let i = 0; i <= n; i++) { const a = a0 + (Math.PI / 2) * i / n; pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]); } return pts; },
  };
  function resample(pts, step, closed = false) {
    const src = closed ? [...pts, pts[0]] : pts, out = [src[0]]; let carry = 0;
    for (let i = 1; i < src.length; i++) { const [ax, ay] = src[i - 1], [bx, by] = src[i], L = Math.hypot(bx - ax, by - ay); let d = step - carry; while (d <= L) { const t = d / L; out.push([ax + (bx - ax) * t, ay + (by - ay) * t]); d += step; } carry = L - (d - step); }
    const last = src[src.length - 1], pl = out[out.length - 1]; if (Math.hypot(last[0] - pl[0], last[1] - pl[1]) > step * 0.25) out.push(last);
    return out;
  }
  function pointAtLen(pts, cum, d) {
    if (d <= 0) return [pts[0][0], pts[0][1], 1];
    let lo = 0, hi = cum.length - 1; while (lo < hi) { const m = (lo + hi) >> 1; if (cum[m] < d) lo = m + 1; else hi = m; }
    const i = Math.max(1, lo), t = clamp((d - cum[i - 1]) / (cum[i] - cum[i - 1] || 1));
    return [lerp(pts[i - 1][0], pts[i][0], t), lerp(pts[i - 1][1], pts[i][1], t), i];
  }

  /* ---------------- hand-inked strokes ---------------- */
  let AR = makeRng(4242); // authoring rng; reseed with Sketch.seed(n) for a different hand
  // THE JITTER: resample every 5px, offset along the normal by
  //   amp * (0.7*sin(s*f1+ph1) + 0.3*sin(s*f2+ph2)),  f1 in [0.010,0.022], f2 in [0.045,0.080]
  // so a 1px amplitude gives a slow hand waver, never a zig-zag.
  function wobble(pts, amp = 1.0, closed = false, step = 5) {
    const r = resample(pts, step, closed), ph1 = AR(0, TAU), ph2 = AR(0, TAU), f1 = AR(0.01, 0.022), f2 = AR(0.045, 0.08);
    const out = []; let s = 0;
    for (let i = 0; i < r.length; i++) {
      const a = r[Math.max(0, i - 1)], b = r[Math.min(r.length - 1, i + 1)];
      let nx = -(b[1] - a[1]), ny = b[0] - a[0]; const nl = Math.hypot(nx, ny) || 1; nx /= nl; ny /= nl;
      if (i) s += Math.hypot(r[i][0] - r[i - 1][0], r[i][1] - r[i - 1][1]);
      const off = amp * (Math.sin(s * f1 + ph1) * 0.7 + Math.sin(s * f2 + ph2) * 0.3);
      out.push([r[i][0] + nx * off, r[i][1] + ny * off]);
    }
    return out;
  }
  // stroke = {pts, w, col, a}. Default width 2.6 * lineK(1.75) = 4.55px, painted at w*1.15.
  const K = {};
  K.st = (pts, o = {}) => ({ pts, w: (o.w ?? 2.6) * THEME.lineK * (o.arrow ? 1.25 : 1), col: o.col ?? THEME.ink, a: o.a ?? 0.92 });
  // straight line: overshoots both ends by 1-5 / 1-6px like a real hand
  K.line = (a, b, o = {}) => { const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1, e0 = o.over ?? AR(1, 5), e1 = o.over ?? AR(1, 6);
    return [K.st(wobble([[a[0] - dx / L * e0, a[1] - dy / L * e0], [b[0] + dx / L * e1, b[1] + dy / L * e1]], o.amp ?? 0.9), o)]; };
  // polyline / polygon. sketch:true = each side is its own overshooting line (corners cross slightly)
  K.poly = (pts, closed = false, o = {}) => {
    if (o.sketch) { const out = [], P = closed ? [...pts, pts[0]] : pts; for (let i = 1; i < P.length; i++) out.push(...K.line(P[i - 1], P[i], o)); return out; }
    return [K.st(wobble(pts, o.amp ?? 0.9, closed), o)].map(s => { if (closed) s.pts.push(s.pts[0]); return s; });
  };
  K.rect = (x, y, w, h, o = {}) => K.poly(G.rect(x, y, w, h), true, { sketch: true, ...o });
  // circle starts at a random angle and runs 1.04 turns, so the ends overlap like a real loop
  K.circle = (cx, cy, r, o = {}) => { const a0 = o.a0 ?? AR(0, TAU); return [K.st(wobble(G.circle(cx, cy, r, Math.max(24, Math.round(r / 3)), a0, a0 + TAU * (o.turn ?? 1.04)), o.amp ?? 0.8), o)]; };
  K.ellipse = (cx, cy, rx, ry, o = {}) => [K.st(wobble(G.ellipse(cx, cy, rx, ry, Math.max(24, Math.round(Math.max(rx, ry) / 3)), o.a0 ?? 0, o.a1 ?? TAU * 1.02), o.amp ?? 0.8), o)];
  K.curve = (pts, o = {}) => [K.st(wobble(pts, o.amp ?? 0.8), o)];
  // arrow = cubic bezier shaft + open "V" head (two 0.45rad barbs, length 22*1.45 = 32px), 1.25x weight
  K.arrow = (p0, p1, p2, p3, o = {}) => {
    const c = G.bez(p0, p1, p2, p3, 48), n = c.length, e = c[n - 1], q = c[n - 4];
    const ang = Math.atan2(e[1] - q[1], e[0] - q[0]), hl = (o.head ?? 22) * 1.45; o = { ...o, arrow: true };
    return [K.st(wobble(c, o.amp ?? 0.8), o), K.st(wobble([[e[0] - Math.cos(ang - 0.45) * hl, e[1] - Math.sin(ang - 0.45) * hl], e, [e[0] - Math.cos(ang + 0.45) * hl, e[1] - Math.sin(ang + 0.45) * hl]], 0.5), o)];
  };
  K.dashed = (pts, dash = 22, gap = 16, o = {}) => {
    const r = resample(pts, 3), out = []; let cur = [], s = 0, on = true;
    for (let i = 0; i < r.length; i++) { if (i) s += Math.hypot(r[i][0] - r[i - 1][0], r[i][1] - r[i - 1][1]); if (on) cur.push(r[i]);
      if (on && s >= dash) { if (cur.length > 1) out.push(K.st(cur, o)); cur = []; on = false; s = 0; } else if (!on && s >= gap) { on = true; s = 0; cur = [r[i]]; } }
    if (cur.length > 1) out.push(K.st(cur, o)); return out;
  };
  // checkmark in the positive green
  K.tick = (x, y, s = 1, o = {}) => K.poly([[x - 16 * s, y], [x - 4 * s, y + 13 * s], [x + 20 * s, y - 14 * s]], false, { w: 5, col: THEME.positive, ...o });

  // Ink element: strokes are revealed in order by arc length (one continuous pen path).
  function ink(strokes, o = {}) {
    strokes = strokes.flat(Infinity);
    const lens = strokes.map(s => { const c = [0]; for (let i = 1; i < s.pts.length; i++) c.push(c[i - 1] + Math.hypot(s.pts[i][0] - s.pts[i - 1][0], s.pts[i][1] - s.pts[i - 1][1])); return c; });
    const total = lens.reduce((a, c) => a + c[c.length - 1], 0) || 1, ease = o.ease || E.sine;
    const color = (strokes[0] && strokes[0].col) || THEME.ink;
    return {
      kind: 'ink', color, ...o,
      draw(c, p) {
        const L = ease(clamp(p)) * total; let acc = 0; c.save(); c.lineCap = 'round'; c.lineJoin = 'round';
        for (let k = 0; k < strokes.length; k++) {
          const s = strokes[k], cum = lens[k], sl = cum[cum.length - 1]; if (acc >= L) break;
          const take = Math.min(sl, L - acc);
          c.beginPath(); c.moveTo(s.pts[0][0], s.pts[0][1]);
          if (take >= sl) for (let i = 1; i < s.pts.length; i++) c.lineTo(s.pts[i][0], s.pts[i][1]);
          else { const pt = pointAtLen(s.pts, cum, take); for (let i = 1; i < pt[2]; i++) c.lineTo(s.pts[i][0], s.pts[i][1]); c.lineTo(pt[0], pt[1]); }
          const ga = c.globalAlpha;
          // 1) paper halo so the line cleanly crosses fills and other lines
          c.strokeStyle = rgba(THEME.paper, 0.75); c.globalAlpha = ga * s.a; c.lineWidth = s.w * 1.15 + 5; c.stroke();
          // 2) the grainy pencil line itself
          c.strokeStyle = grain(s.col); c.lineWidth = s.w * 1.15; c.stroke(); c.globalAlpha = ga;
          acc += sl;
        }
        c.restore();
      },
      head(p) { let L = ease(clamp(p)) * total, acc = 0;
        for (let k = 0; k < strokes.length; k++) { const s = strokes[k], cum = lens[k], sl = cum[cum.length - 1]; if (acc + sl >= L) return pointAtLen(s.pts, cum, L - acc); acc += sl; }
        const s = strokes[strokes.length - 1]; return s.pts[s.pts.length - 1]; },
    };
  }

  /* ---------------- colored-pencil marker fills ---------------- */
  // Back-and-forth parallel strokes covering the shape. Angle -0.62rad, stroke width
  // mw = clamp(min(w,h)/2.6, 9, 34), spacing = 0.52*mw (so strokes overlap ~half).
  function markerPlan(polys, o = {}) {
    const b = bboxOf(polys.flat()), ang = o.angle ?? -0.62, w = o.mw ?? clamp(Math.min(b.w, b.h) / 2.6, 9, 34), gap = w * (o.overlap ?? 0.52);
    const ca = Math.cos(ang), sa = Math.sin(ang), cx = b.x + b.w / 2, cy = b.y + b.h / 2, R = Math.hypot(b.w, b.h) / 2 + w, strokes = []; let k = 0;
    for (let d = -R; d <= R; d += gap) {
      const ox = cx - sa * d, oy = cy + ca * d, A = [ox - ca * R, oy - sa * R], B = [ox + ca * R, oy + sa * R]; let tmin = 1e9, tmax = -1e9;
      for (const poly of polys) for (let i = 0; i < poly.length; i++) { const p = poly[i], q = poly[(i + 1) % poly.length], den = (B[0] - A[0]) * (q[1] - p[1]) - (B[1] - A[1]) * (q[0] - p[0]); if (Math.abs(den) < 1e-9) continue;
        const t = ((p[0] - A[0]) * (q[1] - p[1]) - (p[1] - A[1]) * (q[0] - p[0])) / den, u = ((p[0] - A[0]) * (B[1] - A[1]) - (p[1] - A[1]) * (B[0] - A[0])) / den; if (u >= 0 && u <= 1) { tmin = Math.min(tmin, t); tmax = Math.max(tmax, t); } }
      if (tmax <= tmin) continue;
      const e = (w * 0.45) / (2 * R), P0 = [A[0] + (B[0] - A[0]) * (tmin - e), A[1] + (B[1] - A[1]) * (tmin - e)], P1 = [A[0] + (B[0] - A[0]) * (tmax + e), A[1] + (B[1] - A[1]) * (tmax + e)];
      strokes.push(k++ % 2 ? [P1, P0] : [P0, P1]);
    }
    return { strokes, w, b };
  }
  // alpha: 0.5 = solid colored-pencil fill (painted at 0.5*1.75 ≈ 0.875); 0.07 with mw 70 = the
  // light diagonal "tint" used inside the funnel bands.
  function paintMarker(x, rng, polys, plan, color, o = {}) {
    x.save();
    x.beginPath(); for (const poly of polys) { x.moveTo(poly[0][0], poly[0][1]); for (const q of poly) x.lineTo(q[0], q[1]); x.closePath(); } x.clip();
    x.lineCap = 'round'; x.lineJoin = 'round';
    const pat = grain(color), base = o.alpha ?? 0.5;
    for (const st of plan.strokes) { // each stroke slightly bowed (±1.5px) with ±10% alpha variation
      x.strokeStyle = pat; x.globalAlpha = clamp(base * rng(0.86, 1.08) * 1.75); x.lineWidth = plan.w * rng(0.94, 1.04);
      const [a0, a1] = st, dx = a1[0] - a0[0], dy = a1[1] - a0[1], L = Math.hypot(dx, dy) || 1, nx = -dy / L, ny = dx / L, bow = rng(-1.5, 1.5);
      x.beginPath(); x.moveTo(a0[0], a0[1]); x.quadraticCurveTo((a0[0] + a1[0]) / 2 + nx * bow, (a0[1] + a1[1]) / 2 + ny * bow, a1[0], a1[1]); x.stroke();
    }
    // the edge is traced first by a real marker, which leaves a slightly darker rim
    x.strokeStyle = pat; x.globalAlpha = o.rim ?? 0.4; x.lineWidth = Math.min(plan.w * 0.55, 12); for (const poly of polys) { pathPoly(x, poly); x.stroke(); }
    // thin streaks erased along the stroke direction (paper showing through)
    x.globalAlpha = 1; x.globalCompositeOperation = 'destination-out';
    const ang = Math.atan2(plan.strokes[0][1][1] - plan.strokes[0][0][1], plan.strokes[0][1][0] - plan.strokes[0][0][0]), bb = plan.b, n = Math.min(160, bb.w * bb.h / 2200);
    for (let i = 0; i < n; i++) { const px = bb.x + rng() * bb.w, py = bb.y + rng() * bb.h, L = rng(10, 60); x.strokeStyle = `rgba(0,0,0,${rng(0.05, 0.18)})`; x.lineWidth = rng(0.6, 1.6); x.beginPath(); x.moveTo(px, py); x.lineTo(px + Math.cos(ang) * L, py + Math.sin(ang) * L); x.stroke(); }
    x.restore();
  }

  // Fill reveal masks (how the color "lands" while animating). Modes picked per shape in the video:
  //   tall shapes -> 'flood' (rises from the bottom with a wavy top), wide shapes -> 'sweep' or 'bristle',
  //   small shapes (<9000px²) -> 'spray', logos -> 'bloom', everything else cycles bloom/spray/splat/sweep/bristle.
  function revealMask(mode, m, w, h, p, t, seed) {
    const cx = w / 2, cy = h / 2, R = Math.hypot(w, h) * 0.58, r = makeRng(31 + seed * 7);
    m.fillStyle = '#fff'; m.strokeStyle = '#fff';
    if (mode === 'bloom') { const a1 = r(0, TAU), a2 = r(0, TAU), ox = cx + r(-0.5, 0.5) * w * 0.25, oy = cy + r(-0.5, 0.5) * h * 0.25;
      for (const [k, al] of [[1.07, 0.35], [1, 1]]) { m.globalAlpha = al; m.beginPath(); for (let j = 0; j <= 72; j++) { const th = j / 72 * TAU, rad = smooth5(p) * R * 1.25 * k * (1 + 0.11 * Math.sin(3 * th + a1 + t * 1.6) + 0.06 * Math.sin(7 * th + a2 - t * 2.3)); m.lineTo(ox + Math.cos(th) * rad, oy + Math.sin(th) * rad); } m.fill(); }
      m.globalAlpha = 1; return [ox, oy]; }
    if (mode === 'flood') { const lvl = h + 30 - smooth5(p) * (h + 70), amp = Math.min(10, w * 0.04) * (1 - p * 0.7);
      m.beginPath(); m.moveTo(0, h + 10); for (let x = 0; x <= w; x += 8) m.lineTo(x, lvl + Math.sin(x * 0.03 + t * 4) * amp + Math.sin(x * 0.011 - t * 2.4) * amp * 0.6); m.lineTo(w, h + 10); m.closePath(); m.fill(); return [cx, clamp(lvl, 0, h)]; }
    if (mode === 'sweep') { const f = -80 + smooth5(p) * (w + 200); m.save(); m.translate(cx, cy); m.rotate(-0.18); m.translate(-cx, -cy);
      const g = m.createLinearGradient(f - 90, 0, f, 0); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(1, 'rgba(255,255,255,0)'); m.fillStyle = g; m.fillRect(-200, -200, f + 200, h + 400); m.restore(); return [clamp(f - 30, 0, w), cy]; }
    if (mode === 'spray') { const n = Math.min(1600, Math.floor(w * h / 260));
      for (let j = 0; j < n; j++) { const x = r() * w, y = r() * h, u = r() * 0.85, rad = 6 + r() * 12, g = clamp((p * 1.1 - u) * 6); if (g <= 0) continue; m.globalAlpha = 0.85; m.beginPath(); m.arc(x, y, rad * g, 0, TAU); m.fill(); }
      m.globalAlpha = clamp((p - 0.75) * 4); m.fillRect(0, 0, w, h); m.globalAlpha = 1; return [cx + Math.sin(t * 2.2) * w * 0.22, cy + Math.cos(t * 1.7) * h * 0.18]; }
    if (mode === 'bristle') { const ang = 0.5, ca = Math.cos(ang), sa = Math.sin(ang), diag = Math.hypot(w, h), d = -60 + smooth5(p) * (diag + 160); m.lineCap = 'round';
      for (let s2 = -diag; s2 <= diag; s2 += 6) { const off = (r() - 0.5) * 50 + Math.sin(s2 * 0.05) * 14, L = Math.max(0, d + off), x0 = cx - ca * diag * 0.7 - sa * s2, y0 = cy - sa * diag * 0.7 + ca * s2; m.lineWidth = 7 + r() * 3; m.beginPath(); m.moveTo(x0, y0); m.lineTo(x0 + ca * L, y0 + sa * L); m.stroke(); }
      return [clamp(cx - ca * diag * 0.7 + ca * d, 0, w), clamp(cy - sa * diag * 0.7 + sa * d, 0, h)]; }
    // splat
    const eBack = t => { t = clamp(t); const c = 1.5; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); }; let last = [cx, cy];
    for (let k = 0; k < 6; k++) { const sx = w * (0.15 + 0.7 * r()), sy = h * (0.15 + 0.7 * r()), st = k / 6 * 0.6, R0 = Math.max(w, h) * (0.16 + 0.08 * r()), g = eBack(clamp((p - st) / 0.22)) * (1 + 1.6 * smooth5((p - 0.6) / 0.4)), b1 = r() * TAU;
      if (g <= 0) { for (let d = 0; d < 10; d++) r(); continue; } if (p >= st) last = [sx, sy];
      m.beginPath(); for (let j = 0; j <= 40; j++) { const th = j / 40 * TAU, rad = R0 * g * (1 + 0.16 * Math.sin(5 * th + b1) + 0.08 * Math.sin(11 * th)); m.lineTo(sx + Math.cos(th) * rad, sy + Math.sin(th) * rad); } m.fill();
      for (let d = 0; d < 5; d++) { const a = r() * TAU, dist = R0 * g * (1.25 + r() * 0.5); m.beginPath(); m.arc(sx + Math.cos(a) * dist, sy + Math.sin(a) * dist, (3 + r() * 6) * Math.min(1, g), 0, TAU); m.fill(); } }
    return last;
  }
  function pickReveal(b, i = 0) { const ar = b.h / Math.max(1, b.w); if (ar > 1.25) return 'flood'; if (b.w > 2.2 * b.h) return i % 2 ? 'sweep' : 'bristle'; if (b.w * b.h < 9000) return 'spray'; return ['bloom', 'spray', 'splat', 'sweep', 'bristle'][i % 5]; }

  let FILL_ID = 0; const RS = 2; // fills are pre-rendered at 2x
  // Marker fill element. o: {alpha, mw, angle, rim, reveal, clipText:{text,x,y,font}}
  function fill(polys, color, o = {}) {
    const id = FILL_ID++, pad = o.pad ?? 14, bb = o.bbox || bboxOf(polys.flat(), pad), plan = markerPlan(polys, o);
    const cv = mkCanvas(bb.w * RS, bb.h * RS), x = cv.getContext('2d'); x.scale(RS, RS); x.translate(-bb.x, -bb.y);
    paintMarker(x, makeRng(o.seed ?? id * 31 + 7), polys, plan, color, o);
    if (o.clipText) { // keep only the paint inside the glyphs (painted lettering)
      const m = mkCanvas(cv.width, cv.height), mx = m.getContext('2d'); mx.setTransform(x.getTransform()); mx.font = o.clipText.font; mx.textBaseline = 'alphabetic'; mx.textAlign = o.clipText.align || 'center'; mx.fillStyle = '#000'; mx.fillText(o.clipText.text, o.clipText.x, o.clipText.y);
      x.save(); x.setTransform(1, 0, 0, 1, 0, 0); x.globalCompositeOperation = 'destination-in'; x.drawImage(m, 0, 0); x.restore();
    }
    const fb = bboxOf(polys.flat(), 0), mode = o.reveal || pickReveal(fb, id);
    const mk = mkCanvas(cv.width, cv.height), mkx = mk.getContext('2d'), sc = mkCanvas(cv.width, cv.height), scx = sc.getContext('2d');
    return {
      kind: 'fill', color, mode, ...o,
      draw(c, p, t = 0) {
        p = clamp(p); if (p <= 0) return;
        if (p >= 1) { c.drawImage(cv, bb.x, bb.y, bb.w, bb.h); return; }
        mkx.setTransform(1, 0, 0, 1, 0, 0); mkx.clearRect(0, 0, mk.width, mk.height); mkx.setTransform(RS, 0, 0, RS, (fb.x - bb.x) * RS, (fb.y - bb.y) * RS);
        revealMask(mode, mkx, fb.w, fb.h, p, t, id);
        scx.globalCompositeOperation = 'copy'; scx.drawImage(cv, 0, 0); scx.globalCompositeOperation = 'destination-in'; scx.drawImage(mk, 0, 0); scx.globalCompositeOperation = 'source-over';
        c.drawImage(sc, bb.x, bb.y, bb.w, bb.h);
      },
      head(p, t = 0) { const f = revealMask(mode, NOOP, fb.w, fb.h, clamp(p), t, id); return [fb.x + f[0], fb.y + f[1]]; },
    };
  }
  const NOOP = new Proxy({}, { get: (o, k) => (k === 'createLinearGradient' || k === 'createRadialGradient') ? () => ({ addColorStop() {} }) : () => {}, set: () => true });

  /* ---------------- lettering ---------------- */
  const measure = mkCanvas(8, 8).getContext('2d');
  const fontStr = o => `${o.weight || 600} ${o.size}px ${o.family}`;
  function layout(text, o) { measure.font = fontStr(o); const sp = o.spacing || 0, xs = []; let x = 0; for (const ch of text) { xs.push(x); x += measure.measureText(ch).width + sp; } const full = measure.measureText(text).width + sp * (text.length - 1), k = full / Math.max(1, x - sp); return { xs: xs.map(v => v * k), w: full }; }
  // Written text: letters appear left to right, each fading in over 3 letter-slots and settling
  // up 8% of the font size. o.outline = stroke the glyphs instead of filling (used for big numbers).
  function text(str, x, y, o = {}) {
    o = { family: THEME.fonts.hand, weight: 400, size: 36, color: THEME.ink, alpha: 0.95, align: 'center', ...o };
    const lay = layout(str, o), x0 = o.align === 'center' ? -lay.w / 2 : o.align === 'right' ? -lay.w : 0, n = str.length;
    return {
      kind: 'text', color: o.color, ...o,
      draw(c, p) { const k = clamp(p) * (n + 3); c.save(); c.translate(x, y); c.rotate(o.rot || 0); c.font = fontStr(o); c.textBaseline = 'alphabetic';
        for (let i = 0; i < n; i++) { const a = E.out(clamp((k - i) / 3)); if (a <= 0) break; c.globalAlpha = o.alpha * a;
          if (o.outline) { c.strokeStyle = grain(o.color); c.lineWidth = o.outline; c.lineJoin = 'round'; c.strokeText(str[i], x0 + lay.xs[i], 0); }
          else { c.fillStyle = grain(o.color); c.fillText(str[i], x0 + lay.xs[i], (1 - a) * o.size * 0.08); } }
        c.restore(); },
      head(p) { const i = clamp(Math.floor(clamp(p) * n), 0, n - 1); return [x + x0 + lay.xs[i], y - o.size * 0.15]; },
    };
  }
  // Painted big lettering (the "6B / 1–2B / 20M" numbers): Archivo 900, ink outline traced first
  // (first 42% of dur, outline width max(2.4, size/52)*1.6), then a colored marker fill clipped to
  // the glyphs (from 38% to 100%). Returns one element with draw(c,p)/head(p).
  function bigText(str, x, y, o = {}) {
    o = { family: THEME.fonts.display, weight: 900, size: 200, color: THEME.primary, align: 'center', ...o };
    const lay = layout(str, o), x0 = o.align === 'center' ? x - lay.w / 2 : o.align === 'right' ? x - lay.w : x;
    const outline = text(str, x, y, { ...o, color: THEME.ink, alpha: 1, outline: o.outline ?? Math.max(2.4, o.size / 52) * 1.6 });
    const box = { x: x0 - 10, y: y - o.size * 0.82, w: lay.w + 20, h: o.size * 0.92 };
    const paint = fill([G.rect(box.x, box.y, box.w, box.h)], o.color, { bbox: { x: box.x - 16, y: box.y - 16, w: box.w + 32, h: box.h + 32 }, mw: o.mw ?? clamp(o.size / 5, 10, 40), angle: -0.62, reveal: o.reveal || 'sweep', clipText: { text: str, x, y, font: fontStr(o), align: o.align } });
    return { kind: 'bigText', color: o.color,
      draw(c, p, t) { paint.draw(c, (p - 0.38) / 0.62, t); outline.draw(c, p / 0.42); },
      head(p, t) { return p < 0.42 ? outline.head(p / 0.42) : paint.head((p - 0.38) / 0.62, t); } };
  }
  const note = (s, x, y, o = {}) => text(s, x, y, { family: THEME.fonts.hand, weight: 400, size: 36, ...o });
  const mono = (s, x, y, o = {}) => text(s, x, y, { family: THEME.fonts.mono, weight: 500, size: 24, spacing: 1, color: THEME.cons, ...o });
  const head = (s, x, y, o = {}) => text(s, x, y, { family: THEME.fonts.display, weight: 800, size: 46, spacing: 2, ...o });

  /* ---------------- the pencil ---------------- */
  // Big hexagonal pencil, 190px long, 24px thick, at -0.98rad (lead bottom-left, ~56deg up to the right).
  // Body + lead take the color being drawn (ink -> dark graphite pencil). Lifts 12-46px between strokes.
  function drawPencil(c, x, y, o = {}) {
    const z = 1 / (o.scale ?? 1), ang = o.angle ?? -0.98, lift = (o.lift ?? 0) * (1 / z);
    const col = o.color || THEME.ink, isInk = col.toLowerCase() === THEME.ink.toLowerCase();
    const body = isInk ? '#3A3A3C' : col, lead = isInk ? '#2B2B2C' : mixHex(col, '#000000', 0.15), hi = mixHex(body, '#FFFFFF', 0.35), lo = mixHex(body, '#000000', 0.3);
    const L = 190 / z, R = 12 / z, a1 = L * 0.075, a2 = L * 0.24, ox = x, oy = y - lift;
    c.save();
    c.save(); c.translate(ox + 14 / z + lift * 0.7, oy + 18 / z + lift * 0.9); c.rotate(ang); // soft paper shadow
    c.fillStyle = 'rgba(40,30,15,0.16)'; c.filter = `blur(${Math.max(1.5, 6 / z)}px)`; c.beginPath(); c.moveTo(0, 0); c.lineTo(a2, -R); c.lineTo(L, -R); c.lineTo(L, R); c.lineTo(a2, R); c.closePath(); c.fill(); c.filter = 'none'; c.restore();
    c.translate(ox, oy); c.rotate(ang); c.lineJoin = 'round';
    const facet = (y0, y1, cc) => { c.fillStyle = cc; c.fillRect(a2 - 1 / z, y0, L - a2, y1 - y0); }; facet(-R, -R / 3, hi); facet(-R / 3, R / 3, body); facet(R / 3, R, lo);
    const wood = c.createLinearGradient(0, -R, 0, R); wood.addColorStop(0, '#F3DDBA'); wood.addColorStop(0.5, '#E6C394'); wood.addColorStop(1, '#C99F6E');
    c.fillStyle = wood; c.beginPath(); c.moveTo(a1, -R * 0.3); c.lineTo(a2, -R); for (let k = 0; k <= 6; k++) c.lineTo(a2 + (k % 2 ? 4 / z : 0), -R + (2 * R) * k / 6); c.lineTo(a1, R * 0.3); c.closePath(); c.fill();
    c.fillStyle = lead; c.beginPath(); c.moveTo(-1 / z, 0); c.lineTo(a1, -R * 0.3); c.lineTo(a1, R * 0.3); c.closePath(); c.fill();
    c.fillStyle = mixHex(body, '#FFFFFF', 0.15); c.beginPath(); c.ellipse(L, 0, R * 0.3, R, 0, 0, TAU); c.fill();
    c.strokeStyle = 'rgba(0,0,0,0.25)'; c.lineWidth = 1 / z; c.beginPath(); c.moveTo(a2, -R); c.lineTo(L, -R); c.moveTo(a2, R); c.lineTo(L, R); c.stroke();
    c.restore();
  }

  /* ---------------- paper ---------------- */
  let PAPER = null;
  function paperPattern(c) { if (!PAPER) { const s = 256, t = mkCanvas(s, s), x = t.getContext('2d'); x.fillStyle = THEME.paper; x.fillRect(0, 0, s, s); const rng = makeRng(31), img = x.getImageData(0, 0, s, s), d = img.data; for (let i = 0; i < d.length; i += 4) { const v = (rng() - 0.5) * 5; d[i] += v; d[i + 1] += v; d[i + 2] += v - 0.6; } x.putImageData(img, 0, 0); PAPER = t; } return c.createPattern(PAPER, 'repeat'); }
  let GRAIN_TILE = null;
  // Paper sheet: warm off-white with ±2.5 noise, warm vignette (rgba 70,55,30 → 0.07 at edges),
  // and film grain composited soft-light at 6%.
  function drawPaper(c, w, h, o = {}) {
    c.save(); c.fillStyle = paperPattern(c); c.fillRect(0, 0, w, h);
    if (o.vignette !== false) { const g = c.createRadialGradient(w / 2, h * 0.45, Math.max(w, h) * 0.3 * (h / Math.max(w, h)), w / 2, h * 0.48, Math.max(w, h) * 0.78); g.addColorStop(0, 'rgba(70,55,30,0)'); g.addColorStop(1, 'rgba(70,55,30,0.07)'); c.fillStyle = g; c.fillRect(0, 0, w, h); }
    c.restore();
  }
  function drawGrain(c, w, h) {
    if (!GRAIN_TILE) { const s = 256, t = mkCanvas(s, s), x = t.getContext('2d'), img = x.createImageData(s, s), rng = makeRng(99); for (let i = 0; i < img.data.length; i += 4) { const v = 128 + (rng() - 0.5) * 70; img.data[i] = img.data[i + 1] = img.data[i + 2] = v; img.data[i + 3] = 255; } x.putImageData(img, 0, 0); GRAIN_TILE = t; }
    c.save(); c.globalCompositeOperation = 'soft-light'; c.globalAlpha = 0.06; c.fillStyle = c.createPattern(GRAIN_TILE, 'repeat'); c.fillRect(0, 0, w, h); c.restore();
  }

  /* ---------------- highlighter caption ---------------- */
  // Archivo 900 uppercase, 74px at 1080 wide, centered. Spoken word gets a slightly skewed
  // highlighter quad (yellow, or peach for numbers) that wipes across in 0.12s; words not yet
  // spoken sit at 38% opacity; other words get a white keyline (size*0.2).
  function drawCaption(c, words, active, cx, cy, o = {}) {
    let size = o.size ?? 74; const F = s => `900 ${s}px ${THEME.fonts.display}`, maxW = o.maxW ?? 940, wipe = o.wipe ?? 1;
    c.save(); c.font = F(size); const up = words.map(w => w.toUpperCase()); let ws = up.map(w => c.measureText(w).width), sp = size * 0.26, tw = ws.reduce((a, b) => a + b, 0) + sp * (ws.length - 1);
    if (tw > maxW) { size *= maxW / tw; c.font = F(size); sp = size * 0.26; ws = up.map(w => c.measureText(w).width); tw = ws.reduce((a, b) => a + b, 0) + sp * (ws.length - 1); }
    c.translate(cx, cy); c.textBaseline = 'middle'; c.lineJoin = 'round'; let x = -tw / 2;
    up.forEach((w, i) => {
      if (i === active) { const num = /\d/.test(w); c.fillStyle = rgba(num ? THEME.highlightNum : THEME.highlight, 0.95); const y0 = -size * 0.5, y1 = size * 0.46, x0 = x - 10, x1 = x0 + (ws[i] + 20) * E.out(clamp(wipe));
        c.beginPath(); c.moveTo(x0 + 3, y0 + 2); c.lineTo(x1, y0); c.lineTo(x1 - 3, y1); c.lineTo(x0, y1 + 2); c.closePath(); c.fill(); }
      else { c.strokeStyle = 'rgba(255,255,255,0.96)'; c.lineWidth = size * 0.2; c.strokeText(w, x, 3); }
      c.fillStyle = THEME.ink; c.globalAlpha = i <= active ? 1 : 0.38; c.fillText(w, x, 3); c.globalAlpha = 1; x += ws[i] + sp;
    });
    c.restore();
  }

  /* ---------------- pop-in (squash & stretch) ---------------- */
  // Stickers/icons pop in stretched, land with a squash, wobble to rest. Returns [sx, sy] or null.
  function popScale(t, t0, d = 0.5) {
    const u = (t - t0) / d; if (u <= 0) return null; if (u >= 1.8) return [1, 1];
    const s = u < 0.6 ? E.out(u / 0.6) * 1.05 : 1 + 0.05 * Math.cos((u - 0.6) * Math.PI * 2.4) * Math.exp(-(u - 0.6) * 3);
    const k = u < 0.6 ? 1 - 0.2 * Math.sin(u / 0.6 * Math.PI) : 1 + 0.16 * Math.sin((u - 0.6) * Math.PI * 2.2) * Math.exp(-(u - 0.6) * 3.2);
    return [s * k, s / k];
  }

  /* ---------------- timeline + pencil motion ---------------- */
  // Sequence elements: tl.add(el, t0, dur). tl.render(ctx, t) draws everything at time t and the
  // pencil riding the newest active element. The pencil is a critically-damped follower (w=11,
  // max 2600px/s): it snaps to the head on ink, glides with inertia on fills, arcs between items.
  function timeline(o = {}) {
    const items = []; let TIP = null, T0 = 0; const DT = 1 / 120;
    const api = {
      items,
      add(el, t0, dur, extra = {}) { items.push({ el, t0, dur, ...extra }); TIP = null; return el; },
      get end() { return items.reduce((m, i) => Math.max(m, i.t0 + i.dur), 0); },
      target(t) {
        let best = null; for (const it of items) if (it.tool !== false && t >= it.t0 && t <= it.t0 + it.dur && (!best || it.t0 >= best.t0)) best = it;
        if (best) return { p: best.el.head(prog(t, best.t0, best.dur), t), it: best, active: true };
        const after = items.filter(i => i.tool !== false && i.t0 > t).sort((a, b) => a.t0 - b.t0)[0], before = items.filter(i => i.tool !== false && i.t0 + i.dur < t).sort((a, b) => b.t0 + b.dur - a.t0 - a.dur)[0];
        if (after && (!before || after.t0 - t < 0.8)) return { p: after.el.head(0, after.t0), it: after, active: false };
        return before ? { p: before.el.head(1, before.t0 + before.dur), it: before, active: false } : null;
      },
      build() {
        const tool = items.filter(i => i.tool !== false); if (!tool.length) return; T0 = Math.min(...tool.map(i => i.t0)) - 1; const end = api.end + 1.5, n = Math.ceil((end - T0) / DT);
        TIP = new Float32Array(n * 3); let tg = api.target(T0 + 1), x = tg.p[0], y = tg.p[1], vx = 0, vy = 0, on = 0; const w = 11, vmax = 2600;
        for (let k = 0; k < n; k++) { const t = T0 + k * DT, q = api.target(t), line = q && q.active && q.it.el.kind !== 'fill' && q.it.el.kind !== 'bigText';
          on += ((q && q.active ? 1 : 0) - on) * 0.08;
          if (line) { const nx = lerp(x, q.p[0], 0.55), ny = lerp(y, q.p[1], 0.55); vx = (nx - x) / DT; vy = (ny - y) / DT; x = nx; y = ny; }
          else if (q) { vx += (w * w * (q.p[0] - x) - 2 * w * vx) * DT; vy += (w * w * (q.p[1] - y) - 2 * w * vy) * DT; }
          const sp = Math.hypot(vx, vy); if (sp > vmax) { vx *= vmax / sp; vy *= vmax / sp; } if (!line) { x += vx * DT; y += vy * DT; }
          TIP[k * 3] = x; TIP[k * 3 + 1] = y; TIP[k * 3 + 2] = on; }
      },
      tip(t) { if (!TIP) api.build(); if (!TIP) return null; const f = clamp((t - T0) / DT, 0, TIP.length / 3 - 1.001), k = Math.floor(f), u = f - k; return [lerp(TIP[k * 3], TIP[k * 3 + 3], u), lerp(TIP[k * 3 + 1], TIP[k * 3 + 4], u), lerp(TIP[k * 3 + 2], TIP[k * 3 + 5], u)]; },
      render(c, t, ro = {}) {
        const order = [...items].sort((a, b) => (a.layer ?? (a.el.kind === 'fill' ? 0 : a.el.kind === 'bigText' ? 1 : 2)) - (b.layer ?? (b.el.kind === 'fill' ? 0 : b.el.kind === 'bigText' ? 1 : 2)));
        for (const it of order) { const p = prog(t, it.t0, it.dur); if (p > 0) it.el.draw(c, p, t); }
        if (ro.pencil !== false) {
          const tp = api.tip(t); if (!tp) return; const prev = api.tip(t - 0.05), lag = api.tip(t - 0.14), lag2 = api.tip(t - 0.19), q = api.target(t);
          const vxs = (tp[0] - prev[0]) / 0.05, vxl = (lag[0] - lag2[0]) / 0.05, sp = Math.hypot(tp[0] - prev[0], tp[1] - prev[1]) / 0.05;
          const ang = -0.98 + clamp(vxl / 2400, -0.26, 0.26) + clamp(vxs / 5000, -0.08, 0.08) + Math.sin(t * 1.5) * 0.025 - tp[2] * 0.08;
          const vis = clamp(prog(t, T0 + 0.6, 0.4)) * (1 - prog(t, api.end + 0.3, 0.5));
          if (vis > 0) { c.save(); c.globalAlpha = vis; drawPencil(c, tp[0], tp[1], { angle: ang, color: q ? q.it.el.color : THEME.ink, lift: (1 - tp[2]) * (12 + Math.min(34, sp / 45)), scale: ro.pencilScale ?? 1 }); c.restore(); }
        }
      },
    };
    return api;
  }

  root.Sketch = {
    THEME, GOOGLE_FONTS, E, G, K, clamp, lerp, prog, rgba, mixHex, makeRng, hash,
    seed: n => { AR = makeRng(n); }, wobble, grain, markerPlan, paintMarker, revealMask,
    ink, fill, text, bigText, note, mono, head, drawPencil, drawPaper, drawGrain, drawCaption, popScale, timeline,
  };
})(holder);

export const Sketch = holder.Sketch;
