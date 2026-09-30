// 画面渲染：地形缓存、势力范围、都市、设施、部队、特效、小地图
(function (SG) {
  const U = SG.U, R = SG.R, H = SG.Hex, G = SG.G, T = SG.T;
  const RD = SG.Render = {};
  RD.cam = { x: 0, y: 0, zoom: 0.8 };
  RD.hl = { move: null, attack: null, path: null, sel: null, hover: null };
  RD.worldW = () => H.CW * (H.W + 0.5);
  RD.worldH = () => H.RH * (H.H - 1) + 2 * H.R;

  const TCOL = ['#2d5f8a', '#a3c46c', '#cdb67e', '#6f9a4a', '#a58d62', '#7d6a55', '#4b8cc8', '#a3c46c', '#a3c46c'];
  const FAC_COL = { market: '#e0b44c', farm: '#9ccc65', barracks: '#e57373', smithy: '#90a4ae', stable: '#a1887f', workshop: '#ba68c8' };

  function shade(hex, k) {
    const n = parseInt(hex.slice(1), 16);
    const f = v => U.clamp(Math.round(v * k), 0, 255);
    return `rgb(${f(n >> 16)},${f((n >> 8) & 255)},${f(n & 255)})`;
  }
  const corners = (cx, cy, rad) => {
    const out = [];
    for (let i = 0; i < 6; i++) {
      const a = Math.PI / 180 * (60 * i - 30);
      out.push([cx + rad * Math.cos(a), cy + rad * Math.sin(a)]);
    }
    return out;
  };

  // ---------- 地形缓存 ----------
  RD.buildTerrain = () => {
    const cv = document.createElement('canvas');
    cv.width = Math.ceil(RD.worldW()); cv.height = Math.ceil(RD.worldH());
    const ctx = cv.getContext('2d'), map = SG.map, rng = U.seeded(7);
    for (let r = 0; r < H.H; r++) for (let c = 0; c < H.W; c++) {
      const i = H.idx(c, r), t = map.t[i], { x, y } = H.center(c, r);
      const base = map.big[i] ? '#3f7dbd' : TCOL[t];
      ctx.fillStyle = shade(base, 0.94 + rng() * 0.12);
      H.polygon(ctx, x, y, H.R + 0.6); ctx.fill();
      if (t !== T.SEA && t !== T.RIVER) { ctx.strokeStyle = 'rgba(0,0,0,0.07)'; ctx.lineWidth = 1; H.polygon(ctx, x, y, H.R); ctx.stroke(); }
      if (t === T.FOREST) {
        for (let k = 0; k < 3; k++) {
          const tx = x + (k - 1) * 6 + (rng() - 0.5) * 3, ty = y + (k === 1 ? -4 : 3) + (rng() - 0.5) * 3;
          ctx.fillStyle = '#3f6b2a'; ctx.beginPath(); ctx.moveTo(tx, ty - 7); ctx.lineTo(tx - 5, ty + 3); ctx.lineTo(tx + 5, ty + 3); ctx.fill();
          ctx.fillStyle = '#5a3a1e'; ctx.fillRect(tx - 1, ty + 3, 2, 3);
        }
      } else if (t === T.HILL) {
        ctx.strokeStyle = '#6e5a3a'; ctx.lineWidth = 1.6; ctx.beginPath();
        ctx.moveTo(x - 10, y + 5); ctx.quadraticCurveTo(x - 4, y - 7, x + 2, y + 5);
        ctx.moveTo(x - 1, y + 3); ctx.quadraticCurveTo(x + 5, y - 5, x + 11, y + 4); ctx.stroke();
      } else if (t === T.PEAK) {
        ctx.fillStyle = '#5b4a3a'; ctx.beginPath(); ctx.moveTo(x, y - 12); ctx.lineTo(x - 12, y + 8); ctx.lineTo(x + 12, y + 8); ctx.fill();
        ctx.fillStyle = '#eee'; ctx.beginPath(); ctx.moveTo(x, y - 12); ctx.lineTo(x - 4, y - 5); ctx.lineTo(x + 4, y - 5); ctx.fill();
      } else if (t === T.SEA && rng() < 0.25) {
        ctx.strokeStyle = 'rgba(255,255,255,0.18)'; ctx.lineWidth = 1; ctx.beginPath();
        ctx.moveTo(x - 6, y); ctx.quadraticCurveTo(x - 3, y - 3, x, y); ctx.quadraticCurveTo(x + 3, y + 3, x + 6, y); ctx.stroke();
      } else if (t === T.WASTE && rng() < 0.5) {
        ctx.fillStyle = 'rgba(120,90,50,0.35)';
        for (let k = 0; k < 3; k++) ctx.fillRect(x + (rng() - 0.5) * 20, y + (rng() - 0.5) * 16, 2, 2);
      }
    }
    // 道路
    const drawn = new Set();
    ctx.lineCap = 'round';
    for (const pass of [0, 1]) {
      ctx.strokeStyle = pass ? '#e6d3a0' : '#7a6440'; ctx.lineWidth = pass ? 3 : 5.5;
      for (let r = 0; r < H.H; r++) for (let c = 0; c < H.W; c++) {
        const i = H.idx(c, r);
        if (!map.road[i]) continue;
        const a = H.center(c, r);
        for (const [nc, nr] of H.neighbors(c, r)) {
          const j = H.idx(nc, nr);
          if (!map.road[j]) continue;
          const key = pass + ':' + Math.min(i, j) + '-' + Math.max(i, j);
          if (drawn.has(key)) continue;
          drawn.add(key);
          const b = H.center(nc, nr);
          ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
        }
      }
    }
    RD.terrain = cv;
    RD.terrainDirty = true;
  };

  // ---------- 势力范围覆盖层 ----------
  RD.buildTerritory = () => {
    const cv = RD.territory || document.createElement('canvas');
    cv.width = Math.ceil(RD.worldW()); cv.height = Math.ceil(RD.worldH());
    const ctx = cv.getContext('2d'), map = SG.map;
    ctx.clearRect(0, 0, cv.width, cv.height);
    const owner = i => { const reg = map.region[i]; return reg >= 0 ? G.S.cities[reg].faction : -2; };
    for (let r = 0; r < H.H; r++) for (let c = 0; c < H.W; c++) {
      const i = H.idx(c, r), f = owner(i);
      if (f < 0 || map.t[i] === T.SEA) continue;
      const { x, y } = H.center(c, r);
      ctx.fillStyle = G.facColor(f); ctx.globalAlpha = 0.2;
      H.polygon(ctx, x, y, H.R + 0.6); ctx.fill();
      ctx.globalAlpha = 0.9; ctx.strokeStyle = G.facColor(f); ctx.lineWidth = 2.5;
      for (const [nc, nr] of H.neighbors(c, r)) {
        const j = H.idx(nc, nr);
        if (owner(j) === f || map.t[j] === T.SEA) continue;
        const nb = H.center(nc, nr);
        const cs = corners(x, y, H.R).sort((p, q) => Math.hypot(p[0] - nb.x, p[1] - nb.y) - Math.hypot(q[0] - nb.x, q[1] - nb.y));
        ctx.beginPath(); ctx.moveTo(cs[0][0], cs[0][1]); ctx.lineTo(cs[1][0], cs[1][1]); ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
    RD.territory = cv;
    RD.ownerSig = G.S.cities.map(c => c.faction).join(',');
  };

  // ---------- 主绘制 ----------
  RD.init = (canvas, mini) => {
    RD.canvas = canvas; RD.ctx = canvas.getContext('2d');
    RD.mini = mini; RD.mctx = mini.getContext('2d');
    RD.buildTerrain();
    RD.resize();
    window.addEventListener('resize', RD.resize);
    const loop = () => { RD.draw(); requestAnimationFrame(loop); };
    requestAnimationFrame(loop);
  };
  RD.resize = () => {
    const cv = RD.canvas, dpr = window.devicePixelRatio || 1;
    cv.width = Math.round(cv.clientWidth * dpr); cv.height = Math.round(cv.clientHeight * dpr);
    RD.dpr = dpr; RD.clampCam();
  };
  RD.viewW = () => RD.canvas.clientWidth / RD.cam.zoom;
  RD.viewH = () => RD.canvas.clientHeight / RD.cam.zoom;
  RD.clampCam = () => {
    const c = RD.cam;
    c.x = U.clamp(c.x, -100, Math.max(-100, RD.worldW() - RD.viewW() + 100));
    c.y = U.clamp(c.y, -100, Math.max(-100, RD.worldH() - RD.viewH() + 100));
  };
  RD.centerOn = (c, r) => {
    const p = H.center(c, r);
    RD.cam.x = p.x - RD.viewW() / 2; RD.cam.y = p.y - RD.viewH() / 2; RD.clampCam();
  };
  RD.screenToHex = (sx, sy) => {
    const wx = sx / RD.cam.zoom + RD.cam.x, wy = sy / RD.cam.zoom + RD.cam.y;
    const [c, r] = H.fromPixel(wx, wy);
    return H.inside(c, r) ? [c, r] : null;
  };
  RD.zoomAt = (sx, sy, k) => {
    const c = RD.cam, wx = sx / c.zoom + c.x, wy = sy / c.zoom + c.y;
    c.zoom = U.clamp(c.zoom * k, 0.35, 1.8);
    c.x = wx - sx / c.zoom; c.y = wy - sy / c.zoom; RD.clampCam();
  };

  function label(ctx, text, x, y, size, color = '#fff', weight = 'bold') {
    ctx.font = `${weight} ${size}px "Noto Serif SC","Songti SC","Microsoft YaHei",serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,0.85)'; ctx.strokeText(text, x, y);
    ctx.fillStyle = color; ctx.fillText(text, x, y);
  }

  RD.unitPos = u => {
    if (u.anim) {
      const k = (performance.now() - u.anim.t) / 70, p = u.anim.path;
      if (k < p.length - 1) {
        const a = H.center(...H.cr(p[Math.floor(k)])), b = H.center(...H.cr(p[Math.floor(k) + 1])), f = k - Math.floor(k);
        return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f };
      }
      u.anim = null;
    }
    return H.center(u.c, u.r);
  };

  RD.draw = () => {
    if (!G.S || !RD.terrain) return;
    const ctx = RD.ctx, cam = RD.cam, dpr = RD.dpr, z = cam.zoom;
    const sig = G.S.cities.map(c => c.faction).join(',');
    if (!RD.territory || sig !== RD.ownerSig) RD.buildTerritory();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#1d3a57'; ctx.fillRect(0, 0, RD.canvas.width, RD.canvas.height);
    ctx.setTransform(dpr * z, 0, 0, dpr * z, -cam.x * dpr * z, -cam.y * dpr * z);
    ctx.drawImage(RD.terrain, 0, 0);
    ctx.drawImage(RD.territory, 0, 0);
    const x0 = cam.x - 40, y0 = cam.y - 40, x1 = cam.x + RD.viewW() + 40, y1 = cam.y + RD.viewH() + 40;
    const vis = (x, y) => x >= x0 && x <= x1 && y >= y0 && y <= y1;
    const now = performance.now();
    // 高亮：移动范围 / 攻击目标
    if (RD.hl.move) {
      ctx.fillStyle = 'rgba(80,160,255,0.28)'; ctx.strokeStyle = 'rgba(120,190,255,0.7)'; ctx.lineWidth = 1;
      for (const i of RD.hl.move) { const p = H.center(...H.cr(i)); if (vis(p.x, p.y)) { H.polygon(ctx, p.x, p.y, H.R - 1.5); ctx.fill(); ctx.stroke(); } }
    }
    if (RD.hl.attack) {
      ctx.fillStyle = 'rgba(255,70,50,0.3)'; ctx.strokeStyle = 'rgba(255,90,70,0.95)'; ctx.lineWidth = 2;
      for (const i of RD.hl.attack) { const p = H.center(...H.cr(i)); H.polygon(ctx, p.x, p.y, H.R - 1.5); ctx.fill(); ctx.stroke(); }
    }
    if (RD.hl.path) {
      ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineWidth = 3; ctx.setLineDash([6, 5]); ctx.beginPath();
      RD.hl.path.forEach((i, k) => { const p = H.center(...H.cr(i)); if (k) ctx.lineTo(p.x, p.y); else ctx.moveTo(p.x, p.y); });
      ctx.stroke(); ctx.setLineDash([]);
    }
    // 设施
    if (z >= 0.55) {
      for (const city of G.S.cities) {
        for (const f of city.facs) {
          const p = H.center(...H.cr(f.plot));
          if (!vis(p.x, p.y)) continue;
          ctx.globalAlpha = f.done ? 0.95 : 0.5;
          ctx.fillStyle = FAC_COL[f.type]; ctx.strokeStyle = '#2b2116'; ctx.lineWidth = 1.5;
          ctx.beginPath(); ctx.rect(p.x - 9, p.y - 9, 18, 18); ctx.fill(); ctx.stroke();
          ctx.fillStyle = '#1b140c'; ctx.font = 'bold 12px serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.fillText(R.FACILITIES[f.type].ch, p.x, p.y + 1);
          ctx.globalAlpha = 1;
        }
      }
    }
    // 火焰
    for (const f of G.S.fires) {
      const p = H.center(...H.cr(f.i)), fl = Math.sin(now / 90 + f.i) * 2;
      ctx.fillStyle = 'rgba(255,120,30,0.55)'; H.polygon(ctx, p.x, p.y, H.R - 2); ctx.fill();
      ctx.fillStyle = '#ffcc33'; ctx.beginPath(); ctx.moveTo(p.x, p.y - 12 - fl); ctx.quadraticCurveTo(p.x + 9, p.y, p.x, p.y + 8);
      ctx.quadraticCurveTo(p.x - 9, p.y, p.x, p.y - 12 - fl); ctx.fill();
    }
    // 都市与关隘
    for (const city of G.S.cities) {
      const p = H.center(city.c, city.r);
      if (!vis(p.x, p.y)) continue;
      const col = G.facColor(city.faction);
      if (city.kind === 'city') {
        const s = 11 + city.size * 3;
        ctx.fillStyle = shade(col.length === 7 ? col : '#9a9a9a', 0.55); ctx.fillRect(p.x - s - 2, p.y - s - 2, s * 2 + 4, s * 2 + 4);
        ctx.fillStyle = col; ctx.fillRect(p.x - s, p.y - s, s * 2, s * 2);
        ctx.fillStyle = 'rgba(0,0,0,0.25)';
        for (let k = -s; k < s; k += 6) { ctx.fillRect(p.x + k, p.y - s - 4, 3, 3); }
        ctx.fillStyle = '#3a2a1a'; ctx.fillRect(p.x - 4, p.y + s - 9, 8, 9);
      } else {
        ctx.fillStyle = shade(col.length === 7 ? col : '#9a9a9a', 0.55); ctx.fillRect(p.x - 13, p.y - 9, 26, 18);
        ctx.fillStyle = col; ctx.fillRect(p.x - 11, p.y - 7, 22, 14);
        ctx.fillStyle = '#3a2a1a'; ctx.beginPath(); ctx.arc(p.x, p.y + 7, 5, Math.PI, 0); ctx.fill();
      }
      if (RD.hl.sel && RD.hl.sel.city === city.id) {
        ctx.strokeStyle = '#ffd54f'; ctx.lineWidth = 3; H.polygon(ctx, p.x, p.y, H.R + 8); ctx.stroke();
      }
      if (city.dur < city.maxDur * 0.999 && z > 0.45) {
        ctx.fillStyle = '#222'; ctx.fillRect(p.x - 16, p.y - 26, 32, 4);
        ctx.fillStyle = '#ffb74d'; ctx.fillRect(p.x - 16, p.y - 26, 32 * city.dur / city.maxDur, 4);
      }
      label(ctx, city.name, p.x, p.y + (city.kind === 'city' ? 27 : 19), city.kind === 'city' ? 14 : 12);
      if (z >= 0.7) label(ctx, U.fmt(city.troops), p.x, p.y - (city.kind === 'city' ? 1 : 0), 10, '#fff', 'normal');
    }
    // 部队
    for (const k in G.S.units) {
      const u = G.S.units[k], p = RD.unitPos(u);
      if (!vis(p.x, p.y)) continue;
      const col = G.facColor(u.faction), dim = G.isPlayer(u.faction) && (u.acted || u.status);
      ctx.globalAlpha = dim ? 0.6 : 1;
      ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.beginPath(); ctx.ellipse(p.x, p.y + 12, 13, 4, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = col; ctx.strokeStyle = '#1b140c'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(p.x, p.y - 1, 13, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(p.x, p.y - 1, 10.5, 0, Math.PI * 2); ctx.stroke();
      label(ctx, R.TYPES[u.type].ch, p.x, p.y - 1, 13);
      ctx.fillStyle = '#111'; ctx.fillRect(p.x - 14, p.y + 13, 28, 4);
      ctx.fillStyle = u.troops > u.maxT * 0.5 ? '#66bb6a' : u.troops > u.maxT * 0.25 ? '#ffca28' : '#ef5350';
      ctx.fillRect(p.x - 14, p.y + 13, 28 * U.clamp(u.troops / 15000, 0.03, 1), 4);
      if (z >= 0.6) label(ctx, G.off(u.offs[0]).name, p.x, p.y + 23, 10, '#fff', 'normal');
      if (u.status) label(ctx, u.status.kind === 'confuse' ? '乱' : '伪', p.x + 12, p.y - 13, 11, '#e1bee7');
      ctx.globalAlpha = 1;
      if (RD.hl.sel && RD.hl.sel.unit === u.id) {
        ctx.strokeStyle = '#ffd54f'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(p.x, p.y - 1, 17 + Math.sin(now / 200) * 1.5, 0, Math.PI * 2); ctx.stroke();
      }
    }
    // 悬停
    if (RD.hl.hover) {
      const p = H.center(...RD.hl.hover);
      ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = 2; H.polygon(ctx, p.x, p.y, H.R - 1); ctx.stroke();
    }
    // 飘字
    SG.FX = SG.FX.filter(f => now - f.t < 1500);
    for (const f of SG.FX) {
      const p = H.center(f.c, f.r), k = (now - f.t) / 1500;
      ctx.globalAlpha = 1 - k * k;
      label(ctx, f.text, p.x, p.y - 22 - (f.off || 0) - k * 30, 14, f.color);
    }
    ctx.globalAlpha = 1;
    RD.drawMini();
  };

  // ---------- 小地图 ----------
  RD.drawMini = () => {
    const m = RD.mini, ctx = RD.mctx;
    if (!m || m.offsetParent === null) return;
    const sx = m.width / RD.worldW(), sy = m.height / RD.worldH();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(RD.terrain, 0, 0, m.width, m.height);
    ctx.drawImage(RD.territory, 0, 0, m.width, m.height);
    for (const city of G.S.cities) {
      const p = H.center(city.c, city.r);
      ctx.fillStyle = G.facColor(city.faction); ctx.strokeStyle = '#000'; ctx.lineWidth = 1;
      const s = city.kind === 'city' ? 3 + city.size : 3;
      ctx.fillRect(p.x * sx - s, p.y * sy - s, s * 2, s * 2); ctx.strokeRect(p.x * sx - s, p.y * sy - s, s * 2, s * 2);
    }
    for (const k in G.S.units) {
      const u = G.S.units[k], p = H.center(u.c, u.r);
      ctx.fillStyle = G.facColor(u.faction); ctx.beginPath(); ctx.arc(p.x * sx, p.y * sy, 2, 0, Math.PI * 2); ctx.fill();
    }
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5;
    ctx.strokeRect(RD.cam.x * sx, RD.cam.y * sy, RD.viewW() * sx, RD.viewH() * sy);
  };
  RD.miniToWorld = (mx, my) => {
    const m = RD.mini;
    return { x: mx / m.clientWidth * RD.worldW(), y: my / m.clientHeight * RD.worldH() };
  };
})(window.SG);
