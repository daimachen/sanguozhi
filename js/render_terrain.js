// 水墨风大地图：地形色彩融合、纸纹、山峦、河道、松林、海岸（一次性绘制到缓存画布）
(function (SG) {
  const U = SG.U, H = SG.Hex, T = SG.T, RD = SG.Render;

  const hex2rgb = h => { const n = parseInt(h.slice(1), 16); return [n >> 16, (n >> 8) & 255, n & 255]; };
  const mix = (a, b, t) => a.map((v, k) => v + (b[k] - v) * t);
  const rgb = (c, a = 1) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;

  // 地形底色（北方偏黄、南方偏绿）
  const PAL = {
    plainN: hex2rgb('#b8ae76'), plainS: hex2rgb('#8fa862'),
    waste: hex2rgb('#c7a970'), forest: hex2rgb('#6f8d50'), hill: hex2rgb('#a09066'),
    peak: hex2rgb('#8f7f66'), river: hex2rgb('#5f93b3'), seaNear: hex2rgb('#7aa8bf'), seaFar: hex2rgb('#2c587e'),
  };

  function cellColor(map, i, c, r, n) {
    const t = map.t[i];
    const lat = U.clamp(r / H.H, 0, 1);
    const plain = mix(PAL.plainN, PAL.plainS, U.clamp((lat - 0.25) * 1.6, 0, 1));
    let col;
    switch (t) {
      case T.SEA: col = mix(PAL.seaNear, PAL.seaFar, U.clamp((map.seaDist[i] - 1) / 5, 0, 1)); break;
      case T.RIVER: col = mix(plain, PAL.river, map.big[i] ? 0.45 : 0.25); break;
      case T.WASTE: col = mix(PAL.waste, plain, 0.2); break;
      case T.FOREST: col = mix(PAL.forest, plain, 0.25); break;
      case T.HILL: col = mix(PAL.hill, plain, 0.35); break;
      case T.PEAK: col = PAL.peak; break;
      default: col = plain;
    }
    // 自然起伏
    const k = 0.92 + n * 0.16;
    return col.map(v => U.clamp(v * k, 0, 255));
  }

  // 距陆地的格数（海色深浅）
  function seaDistance(map) {
    const N = H.W * H.H, d = new Uint8Array(N).fill(255), q = [];
    for (let i = 0; i < N; i++) if (map.t[i] !== T.SEA) { d[i] = 0; q.push(i); }
    for (let h = 0; h < q.length; h++) {
      const i = q[h], [c, r] = H.cr(i);
      for (const [nc, nr] of H.neighbors(c, r)) {
        const j = H.idx(nc, nr);
        if (d[j] > d[i] + 1) { d[j] = d[i] + 1; q.push(j); }
      }
    }
    return d;
  }

  // Catmull-Rom 平滑曲线
  function smoothPath(ctx, pts) {
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let k = 0; k < pts.length - 1; k++) {
      const p0 = pts[k - 1] || pts[k], p1 = pts[k], p2 = pts[k + 1], p3 = pts[k + 2] || p2;
      ctx.bezierCurveTo(p1.x + (p2.x - p0.x) / 6, p1.y + (p2.y - p0.y) / 6, p2.x - (p3.x - p1.x) / 6, p2.y - (p3.y - p1.y) / 6, p2.x, p2.y);
    }
  }

  function mountain(ctx, x, y, s, rng, tone) {
    const ax = x + (rng() - 0.5) * s * 0.3, ay = y - s * (0.85 + rng() * 0.25);
    const lx = x - s, rx = x + s, by = y + s * 0.42, mx = x + (rng() - 0.3) * s * 0.3;
    const lit = tone.lit, dark = tone.dark;
    ctx.fillStyle = lit;
    ctx.beginPath(); ctx.moveTo(lx, by); ctx.quadraticCurveTo(lx + s * 0.45, ay + s * 0.4, ax, ay);
    ctx.quadraticCurveTo(rx - s * 0.4, ay + s * 0.45, rx, by); ctx.closePath(); ctx.fill();
    ctx.fillStyle = dark;
    ctx.beginPath(); ctx.moveTo(ax, ay); ctx.quadraticCurveTo(rx - s * 0.4, ay + s * 0.45, rx, by);
    ctx.lineTo(mx, by); ctx.quadraticCurveTo(ax + s * 0.15, y - s * 0.2, ax, ay); ctx.fill();
    // 皴法
    ctx.strokeStyle = 'rgba(40,30,20,0.35)'; ctx.lineWidth = 0.9;
    for (let k = 0; k < 3; k++) {
      const t = 0.3 + k * 0.2;
      ctx.beginPath(); ctx.moveTo(ax + (rx - ax) * t * 0.6, ay + (by - ay) * t);
      ctx.lineTo(ax + (rx - ax) * t * 0.6 - s * 0.18, ay + (by - ay) * (t + 0.18)); ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(45,32,20,0.85)'; ctx.lineWidth = 1.3;
    ctx.beginPath(); ctx.moveTo(lx, by); ctx.quadraticCurveTo(lx + s * 0.45, ay + s * 0.4, ax, ay);
    ctx.quadraticCurveTo(rx - s * 0.4, ay + s * 0.45, rx, by); ctx.stroke();
    if (tone.snow) {
      ctx.fillStyle = 'rgba(245,245,240,0.9)';
      ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(ax - s * 0.22, ay + s * 0.32); ctx.lineTo(ax - s * 0.05, ay + s * 0.24);
      ctx.lineTo(ax + s * 0.08, ay + s * 0.34); ctx.lineTo(ax + s * 0.2, ay + s * 0.28); ctx.closePath(); ctx.fill();
    }
  }
  function hill(ctx, x, y, s, rng) {
    for (let k = 0; k < 2; k++) {
      const hx = x + (k ? s * 0.45 : -s * 0.3) + (rng() - 0.5) * 4, hy = y + (k ? 3 : 0), w = s * (k ? 0.75 : 0.9), h = s * (k ? 0.5 : 0.62);
      const g = ctx.createLinearGradient(hx - w, hy, hx + w, hy);
      g.addColorStop(0, 'rgba(176,160,110,0.95)'); g.addColorStop(0.6, 'rgba(128,112,74,0.95)'); g.addColorStop(1, 'rgba(96,82,55,0.95)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.moveTo(hx - w, hy + h * 0.35); ctx.quadraticCurveTo(hx - w * 0.2, hy - h, hx + w, hy + h * 0.35); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = 'rgba(60,45,28,0.6)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(hx - w, hy + h * 0.35); ctx.quadraticCurveTo(hx - w * 0.2, hy - h, hx + w, hy + h * 0.35); ctx.stroke();
    }
  }
  function tree(ctx, x, y, s, rng) {
    ctx.fillStyle = 'rgba(70,50,30,0.9)'; ctx.fillRect(x - 0.8, y, 1.6, s * 0.35);
    const dark = `rgb(${46 + rng() * 14 | 0},${78 + rng() * 18 | 0},${40 + rng() * 10 | 0})`;
    ctx.fillStyle = dark;
    ctx.beginPath(); ctx.moveTo(x, y - s * 1.1); ctx.lineTo(x - s * 0.55, y + s * 0.05); ctx.lineTo(x + s * 0.55, y + s * 0.05); ctx.closePath(); ctx.fill();
    ctx.fillStyle = 'rgba(140,170,90,0.45)';
    ctx.beginPath(); ctx.moveTo(x, y - s * 1.1); ctx.lineTo(x - s * 0.55, y + s * 0.05); ctx.lineTo(x - s * 0.1, y + s * 0.05); ctx.closePath(); ctx.fill();
  }

  RD.buildTerrain = () => {
    const map = SG.map, rng = U.seeded(11);
    const Wp = Math.ceil(RD.worldW()), Hp = Math.ceil(RD.worldH());
    const cv = document.createElement('canvas'); cv.width = Wp; cv.height = Hp;
    const ctx = cv.getContext('2d');
    map.seaDist = map.seaDist || seaDistance(map);
    // 1. 低分辨率色场 → 平滑放大，形成晕染过渡
    const sw = H.W * 2 + 1, small = document.createElement('canvas');
    small.width = sw; small.height = H.H;
    const sctx = small.getContext('2d'), img = sctx.createImageData(sw, H.H);
    const nrng = U.seeded(3), grid = [];
    for (let k = 0; k < (H.W / 6 + 3) * (H.H / 6 + 3); k++) grid.push(nrng());
    const gw = Math.ceil(H.W / 6) + 3;
    const noise = (c, r) => {
      const x = c / 6, y = r / 6, x0 = x | 0, y0 = y | 0, fx = x - x0, fy = y - y0;
      const g = (a, b) => grid[b * gw + a];
      return (g(x0, y0) * (1 - fx) + g(x0 + 1, y0) * fx) * (1 - fy) + (g(x0, y0 + 1) * (1 - fx) + g(x0 + 1, y0 + 1) * fx) * fy;
    };
    for (let r = 0; r < H.H; r++) for (let c = 0; c < H.W; c++) {
      const i = H.idx(c, r), col = cellColor(map, i, c, r, noise(c, r) * 0.7 + nrng() * 0.3);
      for (const px of [2 * c + (r & 1), 2 * c + (r & 1) + 1]) {
        const o = (r * sw + px) * 4;
        img.data[o] = col[0]; img.data[o + 1] = col[1]; img.data[o + 2] = col[2]; img.data[o + 3] = 255;
      }
      if ((r & 1) === 0 && c === H.W - 1) { const o = (r * sw + sw - 1) * 4; img.data.set(img.data.slice(o - 4, o), o); }
      if ((r & 1) === 1 && c === 0) { const o = (r * sw) * 4; img.data.set(img.data.slice(o + 4, o + 8), o); }
    }
    sctx.putImageData(img, 0, 0);
    ctx.fillStyle = rgb(PAL.seaFar); ctx.fillRect(0, 0, Wp, Hp);
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(small, 0, 0, sw, H.H, 0, H.R - 0.5 * H.RH, sw * H.CW / 2, H.H * H.RH);
    // 2. 墨晕与纸纹
    for (let k = 0; k < 90; k++) {
      const x = rng() * Wp, y = rng() * Hp, rad = 40 + rng() * 160;
      const g = ctx.createRadialGradient(x, y, 0, x, y, rad);
      const dark = rng() < 0.6;
      g.addColorStop(0, dark ? 'rgba(50,40,20,0.07)' : 'rgba(255,250,225,0.07)'); g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g; ctx.fillRect(x - rad, y - rad, rad * 2, rad * 2);
    }
    const tex = document.createElement('canvas'); tex.width = tex.height = 256;
    const tctx = tex.getContext('2d'), tim = tctx.createImageData(256, 256);
    for (let k = 0; k < tim.data.length; k += 4) {
      const v = 128 + (rng() - 0.5) * 70;
      tim.data[k] = tim.data[k + 1] = tim.data[k + 2] = v; tim.data[k + 3] = 30;
    }
    tctx.putImageData(tim, 0, 0);
    ctx.save(); ctx.globalCompositeOperation = 'overlay';
    ctx.fillStyle = ctx.createPattern(tex, 'repeat'); ctx.fillRect(0, 0, Wp, Hp);
    ctx.restore();
    // 3. 海岸浪花与海浪
    for (let r = 0; r < H.H; r++) for (let c = 0; c < H.W; c++) {
      const i = H.idx(c, r);
      if (map.t[i] !== T.SEA) continue;
      const { x, y } = H.center(c, r);
      if (map.seaDist[i] === 1) {
        ctx.strokeStyle = 'rgba(245,245,230,0.35)'; ctx.lineWidth = 1.6;
        ctx.beginPath(); ctx.arc(x, y, H.R * 0.9, rng() * 6, rng() * 6 + 1.2); ctx.stroke();
      } else if (rng() < 0.18) {
        ctx.strokeStyle = 'rgba(220,235,245,0.22)'; ctx.lineWidth = 1.1;
        const wx = x + (rng() - 0.5) * 10, wy = y + (rng() - 0.5) * 10;
        ctx.beginPath(); ctx.moveTo(wx - 8, wy); ctx.quadraticCurveTo(wx - 4, wy - 4, wx, wy); ctx.quadraticCurveTo(wx + 4, wy + 4, wx + 8, wy); ctx.stroke();
      }
    }
    // 4. 河道（平滑曲线）
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    for (const rv of SG.DATA.rivers) {
      const pts = rv.pts.map(([c, r]) => H.center(c, r));
      const w = rv.big ? 13 : 7;
      ctx.beginPath(); smoothPath(ctx, pts);
      ctx.strokeStyle = 'rgba(90,110,80,0.45)'; ctx.lineWidth = w + 6; ctx.stroke();
      ctx.strokeStyle = '#4f86ab'; ctx.lineWidth = w; ctx.stroke();
      ctx.strokeStyle = 'rgba(190,225,240,0.45)'; ctx.lineWidth = Math.max(1.2, w * 0.22); ctx.stroke();
    }
    // 5. 荒地、平原点缀
    for (let r = 0; r < H.H; r++) for (let c = 0; c < H.W; c++) {
      const i = H.idx(c, r), t = map.t[i], { x, y } = H.center(c, r);
      if (t === T.WASTE) {
        ctx.strokeStyle = 'rgba(110,80,45,0.35)'; ctx.lineWidth = 1;
        for (let k = 0; k < 3; k++) {
          const px = x + (rng() - 0.5) * 22, py = y + (rng() - 0.5) * 18;
          ctx.beginPath(); ctx.moveTo(px - 3, py); ctx.lineTo(px, py - 3); ctx.lineTo(px + 3, py); ctx.stroke();
        }
      } else if (t === T.PLAIN && rng() < 0.3) {
        ctx.fillStyle = 'rgba(70,90,40,0.18)';
        for (let k = 0; k < 4; k++) ctx.fillRect(x + (rng() - 0.5) * 24, y + (rng() - 0.5) * 20, 1.5, 3);
      }
    }
    // 6. 道路：土路
    const drawn = new Set();
    const segs = [];
    for (let r = 0; r < H.H; r++) for (let c = 0; c < H.W; c++) {
      const i = H.idx(c, r);
      if (!map.road[i]) continue;
      for (const [nc, nr] of H.neighbors(c, r)) {
        const j = H.idx(nc, nr);
        if (!map.road[j]) continue;
        const key = Math.min(i, j) + '-' + Math.max(i, j);
        if (drawn.has(key)) continue;
        drawn.add(key); segs.push([H.center(c, r), H.center(nc, nr)]);
      }
    }
    for (const [w, col] of [[5, 'rgba(95,72,40,0.55)'], [2.6, 'rgba(214,190,140,0.95)']]) {
      ctx.strokeStyle = col; ctx.lineWidth = w;
      ctx.beginPath();
      for (const [a, b] of segs) { ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); }
      ctx.stroke();
    }
    // 7. 山、丘、林（自上而下绘制以正确遮挡）
    const glyphs = [];
    for (let r = 0; r < H.H; r++) for (let c = 0; c < H.W; c++) {
      const i = H.idx(c, r), t = map.t[i], { x, y } = H.center(c, r);
      if (t === T.PEAK) glyphs.push({ y: y + 6, f: () => mountain(ctx, x + (rng() - 0.5) * 5, y + 4, H.R * (1.15 + rng() * 0.25), rng, {
        lit: c < 8 || r < 5 ? '#a89a86' : '#9c8e68', dark: c < 8 || r < 5 ? '#5d5446' : '#5c5236', snow: c < 8 && r > 14 } ) });
      else if (t === T.HILL && map.plot[i] < 0) glyphs.push({ y: y + 2, f: () => hill(ctx, x, y + 3, H.R * 0.72, rng) });
      else if (t === T.FOREST) {
        for (let k = 0; k < 5; k++) {
          const tx = x + (rng() - 0.5) * H.R * 1.4, ty = y + (rng() - 0.5) * H.R * 1.1;
          glyphs.push({ y: ty, f: () => tree(ctx, tx, ty, 6 + rng() * 3, rng) });
        }
      }
    }
    glyphs.sort((a, b) => a.y - b.y).forEach(g => g.f());
    // 8. 暗角
    const vg = ctx.createRadialGradient(Wp / 2, Hp / 2, Math.min(Wp, Hp) * 0.45, Wp / 2, Hp / 2, Math.max(Wp, Hp) * 0.75);
    vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(30,20,10,0.35)');
    ctx.fillStyle = vg; ctx.fillRect(0, 0, Wp, Hp);
    RD.terrain = cv;
    RD.buildGrid();
  };

  // 六角网格（移动部队时或开启「显示网格」时绘制）
  RD.buildGrid = () => {
    const cv = document.createElement('canvas');
    cv.width = Math.ceil(RD.worldW()); cv.height = Math.ceil(RD.worldH());
    const ctx = cv.getContext('2d');
    ctx.strokeStyle = 'rgba(30,25,15,0.22)'; ctx.lineWidth = 1;
    ctx.beginPath();
    for (let r = 0; r < H.H; r++) for (let c = 0; c < H.W; c++) {
      if (SG.map.t[H.idx(c, r)] === T.SEA) continue;
      const { x, y } = H.center(c, r);
      for (let k = 0; k < 6; k++) {
        const a = Math.PI / 180 * (60 * k - 30);
        const px = x + H.R * Math.cos(a), py = y + H.R * Math.sin(a);
        if (k === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.closePath();
    }
    ctx.stroke();
    RD.grid = cv;
  };
})(window.SG);
