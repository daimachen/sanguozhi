// 画面渲染：地形缓存、势力范围、都市、设施、部队、特效、小地图
(function (SG) {
  const U = SG.U, R = SG.R, H = SG.Hex, G = SG.G, T = SG.T;
  const RD = SG.Render = {};
  RD.cam = { x: 0, y: 0, zoom: 0.8 };
  RD.hl = { move: null, attack: null, path: null, sel: null, hover: null, flood: null };
  RD.worldW = () => H.CW * (H.W + 0.5);
  RD.worldH = () => H.RH * (H.H - 1) + 2 * H.R;


  const corners = (cx, cy, rad) => {
    const out = [];
    for (let i = 0; i < 6; i++) {
      const a = Math.PI / 180 * (60 * i - 30);
      out.push([cx + rad * Math.cos(a), cy + rad * Math.sin(a)]);
    }
    return out;
  };

  // 地形缓存见 render_terrain.js（RD.buildTerrain）

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
      ctx.fillStyle = G.facColor(f); ctx.globalAlpha = 0.13;
      H.polygon(ctx, x, y, H.R + 0.6); ctx.fill();
      ctx.globalAlpha = 0.85; ctx.strokeStyle = G.facColor(f); ctx.lineWidth = 3;
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

  RD.label = label;

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
    if (RD.grid && (RD.hl.move || RD.hl.attack || (SG.Cutin && SG.Cutin.prefs.grid))) ctx.drawImage(RD.grid, 0, 0);
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
    // 设施建筑
    if (z >= 0.5) {
      for (const city of G.S.cities) {
        for (const f of city.facs) {
          const p = H.center(...H.cr(f.plot));
          if (vis(p.x, p.y)) RD.sprite.facility(ctx, f.type, p.x, p.y, f.done, z);
        }
      }
    }
    // 工事：洪水、壕沟/水渠、堤坝、陷坑
    const ws = G.S.works;
    if (ws) {
      for (const k in ws.flood) {
        const p = H.center(...H.cr(+k));
        if (!vis(p.x, p.y)) continue;
        ctx.fillStyle = 'rgba(70,150,220,0.62)'; H.polygon(ctx, p.x, p.y, H.R + 0.5); ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.45)'; ctx.lineWidth = 1.2; ctx.beginPath();
        const ph = Math.sin(now / 400 + +k) * 3;
        ctx.moveTo(p.x - 9, p.y + ph); ctx.quadraticCurveTo(p.x - 4, p.y - 4 + ph, p.x, p.y + ph); ctx.quadraticCurveTo(p.x + 4, p.y + 4 + ph, p.x + 9, p.y + ph); ctx.stroke();
      }
      for (const k in ws.ditch) {
        const d = ws.ditch[k], p = H.center(...H.cr(+k));
        if (!vis(p.x, p.y)) continue;
        ctx.fillStyle = d.water ? 'rgba(60,130,200,0.85)' : 'rgba(90,60,35,0.85)';
        H.polygon(ctx, p.x, p.y, H.R - 5); ctx.fill();
        ctx.strokeStyle = d.water ? 'rgba(200,230,255,0.7)' : 'rgba(40,25,10,0.9)'; ctx.lineWidth = 1.5;
        for (let s = -6; s <= 6; s += 6) { ctx.beginPath(); ctx.moveTo(p.x - 8, p.y + s); ctx.lineTo(p.x + 8, p.y + s); ctx.stroke(); }
      }
      for (const k in ws.dam) {
        const d = ws.dam[k], p = H.center(...H.cr(+k));
        if (!vis(p.x, p.y)) continue;
        ctx.fillStyle = '#8d6e4a'; ctx.strokeStyle = '#3e2a17'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.rect(p.x - 14, p.y - 5, 28, 10); ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#111'; ctx.fillRect(p.x - 14, p.y - 13, 28, 5);
        ctx.fillStyle = d.level >= 7 ? '#e57373' : '#4fc3f7'; ctx.fillRect(p.x - 14, p.y - 13, 28 * d.level / R.DAM_MAX, 5);
        label(ctx, '堤' + d.level, p.x, p.y + 12, 10, '#b3e5fc');
      }
      for (const k in ws.trap) {
        if (!SG.Works.trapVisible(+k)) continue;
        const p = H.center(...H.cr(+k));
        if (!vis(p.x, p.y)) continue;
        ctx.strokeStyle = 'rgba(60,30,10,0.95)'; ctx.fillStyle = 'rgba(40,20,5,0.55)'; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.ellipse(p.x, p.y + 2, 10, 6, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        ctx.strokeStyle = '#d7ccc8';
        for (let s = -6; s <= 6; s += 4) { ctx.beginPath(); ctx.moveTo(p.x + s, p.y + 4); ctx.lineTo(p.x + s + 1, p.y - 4); ctx.stroke(); }
      }
    }
    for (const k in G.S.forts || {}) {
      const f = G.S.forts[k], p = H.center(...H.cr(+k));
      if (!vis(p.x, p.y)) continue;
      RD.sprite.fort(ctx, f.type, p.x, p.y, G.facColor(f.f), true);
      if (f.hp < f.maxHp) {
        ctx.fillStyle = '#222'; ctx.fillRect(p.x - 14, p.y + 12, 28, 3);
        ctx.fillStyle = '#ffb74d'; ctx.fillRect(p.x - 14, p.y + 12, 28 * Math.max(0, f.hp) / f.maxHp, 3);
      }
    }
    if (RD.hl.flood) {
      ctx.fillStyle = 'rgba(30,120,255,0.35)'; ctx.strokeStyle = 'rgba(120,200,255,0.9)'; ctx.lineWidth = 1.5;
      for (const i of RD.hl.flood) { const p = H.center(...H.cr(i)); H.polygon(ctx, p.x, p.y, H.R - 2); ctx.fill(); ctx.stroke(); }
    }
    // 火焰
    for (const f of G.S.fires) {
      const p = H.center(...H.cr(f.i)), fl = Math.sin(now / 90 + f.i) * 2;
      ctx.fillStyle = 'rgba(255,120,30,0.55)'; H.polygon(ctx, p.x, p.y, H.R - 2); ctx.fill();
      ctx.fillStyle = '#ffcc33'; ctx.beginPath(); ctx.moveTo(p.x, p.y - 12 - fl); ctx.quadraticCurveTo(p.x + 9, p.y, p.x, p.y + 8);
      ctx.quadraticCurveTo(p.x - 9, p.y, p.x, p.y - 12 - fl); ctx.fill();
    }
    // 都市、关隘、港口
    for (const city of G.S.cities) {
      const p = H.center(city.c, city.r);
      if (!vis(p.x, p.y)) continue;
      if (RD.hl.sel && RD.hl.sel.city === city.id) {
        ctx.strokeStyle = '#ffd54f'; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.ellipse(p.x, p.y + 4, 34 + Math.sin(now / 250) * 2, 20, 0, 0, Math.PI * 2); ctx.stroke();
      }
      if (city.kind === 'city') RD.sprite.city(ctx, city, p.x, p.y, z);
      else if (city.kind === 'port') RD.sprite.port(ctx, city, p.x, p.y, z);
      else RD.sprite.gate(ctx, city, p.x, p.y, z);
    }
    // 部队（按纵坐标排序，下方的盖住上方的）
    const ulist = Object.values(G.S.units).map(u => ({ u, p: RD.unitPos(u) })).sort((m, n) => m.p.y - n.p.y);
    for (const { u, p } of ulist) {
      if (!vis(p.x, p.y)) continue;
      ctx.globalAlpha = G.isPlayer(u.faction) && (u.acted || u.status) ? 0.62 : 1;
      RD.sprite.unit(ctx, u, p, z, now, RD.hl.sel && RD.hl.sel.unit === u.id);
      ctx.globalAlpha = 1;
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
    if (SG.UI && SG.UI.positionUnitMenu) SG.UI.positionUnitMenu();
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
      const s = city.kind === 'city' ? 3 + city.size : city.kind === 'port' ? 2 : 3;
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
