// 通用工具与六角格数学（尖顶六角格，odd-r 偏移坐标）
window.SG = window.SG || {};
(function (SG) {
  const U = SG.U = {};
  U.clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  U.randInt = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
  U.chance = p => Math.random() < p;
  U.pick = arr => arr[Math.floor(Math.random() * arr.length)];
  U.shuffle = arr => {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  };
  U.sum = (arr, f) => arr.reduce((s, x) => s + (f ? f(x) : x), 0);
  U.maxBy = (arr, f) => {
    let best = null, bv = -Infinity;
    for (const x of arr) { const v = f(x); if (v > bv) { bv = v; best = x; } }
    return best;
  };
  U.fmt = n => Math.round(n).toString();
  U.pct = p => Math.round(p * 100) + '%';
  // 可复现随机数（地图生成用）
  U.seeded = seed => {
    let a = seed >>> 0;
    return () => {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };
  U.esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  // 简易二叉堆
  class Heap {
    constructor() { this.a = []; }
    get size() { return this.a.length; }
    push(pri, val) {
      const a = this.a; a.push([pri, val]);
      let i = a.length - 1;
      while (i > 0) {
        const p = (i - 1) >> 1;
        if (a[p][0] <= a[i][0]) break;
        [a[p], a[i]] = [a[i], a[p]]; i = p;
      }
    }
    pop() {
      const a = this.a, top = a[0], last = a.pop();
      if (a.length) {
        a[0] = last; let i = 0;
        for (;;) {
          const l = i * 2 + 1, r = l + 1; let m = i;
          if (l < a.length && a[l][0] < a[m][0]) m = l;
          if (r < a.length && a[r][0] < a[m][0]) m = r;
          if (m === i) break;
          [a[m], a[i]] = [a[i], a[m]]; i = m;
        }
      }
      return top[1];
    }
  }
  U.Heap = Heap;

  // ---------- 六角格 ----------
  const H = SG.Hex = {};
  H.W = 80; H.H = 60;         // 地图格数（在 map.js 中确认）
  H.R = 20;                   // 绘制半径（像素）
  H.CW = Math.sqrt(3) * H.R;  // 格宽
  H.RH = 1.5 * H.R;           // 行高
  H.idx = (c, r) => r * H.W + c;
  H.cr = i => [i % H.W, (i / H.W) | 0];
  H.inside = (c, r) => c >= 0 && r >= 0 && c < H.W && r < H.H;
  H.toCube = (c, r) => { const x = c - (r - (r & 1)) / 2; return [x, -x - r, r]; };
  H.fromCube = (x, y, z) => [x + (z - (z & 1)) / 2, z];
  H.dist = (c1, r1, c2, r2) => {
    const a = H.toCube(c1, r1), b = H.toCube(c2, r2);
    return Math.max(Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1]), Math.abs(a[2] - b[2]));
  };
  H.DIRS = [[1, -1, 0], [1, 0, -1], [0, 1, -1], [-1, 1, 0], [-1, 0, 1], [0, -1, 1]];
  H.neighbors = (c, r) => {
    const cu = H.toCube(c, r), out = [];
    for (const d of H.DIRS) {
      const [nc, nr] = H.fromCube(cu[0] + d[0], cu[1] + d[1], cu[2] + d[2]);
      if (H.inside(nc, nr)) out.push([nc, nr]);
    }
    return out;
  };
  H.ring = (c, r, rad) => {
    const out = [];
    for (let dr = -rad; dr <= rad; dr++)
      for (let dc = -rad - 1; dc <= rad + 1; dc++) {
        const nc = c + dc, nr = r + dr;
        if (H.inside(nc, nr) && H.dist(c, r, nc, nr) === rad) out.push([nc, nr]);
      }
    return out;
  };
  H.within = (c, r, rad) => {
    const out = [];
    for (let k = 0; k <= rad; k++) out.push(...H.ring(c, r, k));
    return out;
  };
  // 像素中心
  H.center = (c, r) => ({ x: H.CW * (c + 0.5 * (r & 1)) + H.CW / 2, y: H.RH * r + H.R });
  H.cubeRound = (x, y, z) => {
    let rx = Math.round(x), ry = Math.round(y), rz = Math.round(z);
    const dx = Math.abs(rx - x), dy = Math.abs(ry - y), dz = Math.abs(rz - z);
    if (dx > dy && dx > dz) rx = -ry - rz; else if (dy > dz) ry = -rx - rz; else rz = -rx - ry;
    return [rx, ry, rz];
  };
  H.fromPixel = (px, py) => {
    const x = px - H.CW / 2, y = py - H.R;
    const q = (Math.sqrt(3) / 3 * x - y / 3) / H.R, r = (2 / 3 * y) / H.R;
    const [cx, cy, cz] = H.cubeRound(q, -q - r, r);
    return H.fromCube(cx, cy, cz);
  };
  // 两格间直线经过的格子
  H.line = (c1, r1, c2, r2) => {
    const a = H.toCube(c1, r1), b = H.toCube(c2, r2);
    const n = H.dist(c1, r1, c2, r2), out = [];
    for (let i = 0; i <= n; i++) {
      const t = n === 0 ? 0 : i / n;
      const p = H.cubeRound(a[0] + (b[0] - a[0]) * t + 1e-6, a[1] + (b[1] - a[1]) * t + 2e-6, a[2] + (b[2] - a[2]) * t - 3e-6);
      out.push(H.fromCube(p[0], p[1], p[2]));
    }
    return out;
  };
  // 沿 a→b 方向，从 b 再前进 steps 格（击退用）
  H.beyond = (ac, ar, bc, br, steps = 1) => {
    const a = H.toCube(ac, ar), b = H.toCube(bc, br);
    const n = Math.max(1, H.dist(ac, ar, bc, br));
    const d = H.cubeRound((b[0] - a[0]) / n, (b[1] - a[1]) / n, (b[2] - a[2]) / n);
    return H.fromCube(b[0] + d[0] * steps, b[1] + d[1] * steps, b[2] + d[2] * steps);
  };
  H.polygon = (ctx, cx, cy, rad) => {
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const ang = Math.PI / 180 * (60 * i - 30);
      const x = cx + rad * Math.cos(ang), y = cy + rad * Math.sin(ang);
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.closePath();
  };
})(window.SG);
