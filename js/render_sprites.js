// 地图造型：城池、关隘、港口、设施建筑、野战建筑、部队（军旗+士兵 / 战船）
(function (SG) {
  const U = SG.U, R = SG.R, H = SG.Hex, G = SG.G, RD = SG.Render;
  const SP = RD.sprite = {};

  const darken = (hex, k) => {
    if (!/^#[0-9a-f]{6}$/i.test(hex)) return hex;
    const n = parseInt(hex.slice(1), 16), f = v => U.clamp(Math.round(v * k), 0, 255);
    return `rgb(${f(n >> 16)},${f((n >> 8) & 255)},${f(n & 255)})`;
  };
  const ellipse = (ctx, x, y, rx, ry, fill) => { ctx.fillStyle = fill; ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); ctx.fill(); };

  // 中式屋顶（y 为檐口）
  const roof = (ctx, x, y, w, h, col) => {
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.moveTo(x - w / 2 - 3, y + 1);
    ctx.quadraticCurveTo(x - w / 2 + 1, y - 1, x - w / 2 + 3, y - h * 0.4);
    ctx.lineTo(x - w * 0.22, y - h); ctx.lineTo(x + w * 0.22, y - h);
    ctx.lineTo(x + w / 2 - 3, y - h * 0.4);
    ctx.quadraticCurveTo(x + w / 2 - 1, y - 1, x + w / 2 + 3, y + 1);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.55)'; ctx.lineWidth = 0.8; ctx.stroke();
  };
  const house = (ctx, x, y, w, h, wall, rf) => {
    ctx.fillStyle = wall; ctx.fillRect(x - w / 2 + 2, y - h, w - 4, h);
    ctx.fillStyle = 'rgba(40,25,15,0.7)'; ctx.fillRect(x - 1.5, y - h * 0.55, 3, h * 0.55);
    roof(ctx, x, y - h, w, h * 0.85, rf);
  };
  const flag = (ctx, x, y, h, col, ch) => {
    ctx.strokeStyle = '#3b2a1a'; ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y - h); ctx.stroke();
    const w = ch ? 13 : 10, fh = ch ? 15 : 8;
    ctx.fillStyle = col; ctx.strokeStyle = 'rgba(20,12,5,0.9)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x, y - h); ctx.lineTo(x + w, y - h + 1); ctx.lineTo(x + w - 2, y - h + fh / 2); ctx.lineTo(x + w, y - h + fh); ctx.lineTo(x, y - h + fh); ctx.closePath();
    ctx.fill(); ctx.stroke();
    if (ch) RD.label(ctx, ch, x + w / 2 - 0.5, y - h + fh / 2 + 0.5, 10);
  };
  const plate = (ctx, x, y, text, col, size) => {
    ctx.font = `bold ${size}px "Noto Serif SC","Songti SC","Microsoft YaHei",serif`;
    const w = ctx.measureText(text).width + 12, h = size + 6;
    ctx.fillStyle = 'rgba(28,20,12,0.82)'; ctx.fillRect(x - w / 2, y - h / 2, w, h);
    ctx.fillStyle = col; ctx.fillRect(x - w / 2, y - h / 2, 3, h);
    ctx.strokeStyle = 'rgba(224,180,76,0.6)'; ctx.lineWidth = 1; ctx.strokeRect(x - w / 2 + 0.5, y - h / 2 + 0.5, w - 1, h - 1);
    ctx.fillStyle = '#f3e6c8'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(text, x + 1, y + 0.5);
  };

  // ---------- 城池 ----------
  SP.city = (ctx, city, x, y, z) => {
    const col = G.facColor(city.faction);
    const w = 26 + city.size * 7, d = w * 0.52, wh = 5 + city.size;
    const L = x - w / 2, Rr = x + w / 2, Tp = y - d / 2 - 4, Bt = y + d / 2 - 4;
    ellipse(ctx, x + 3, Bt + wh, w * 0.62, d * 0.32, 'rgba(20,12,5,0.35)');
    ctx.fillStyle = '#bca77f'; ctx.fillRect(L, Tp, w, d);
    // 城内建筑
    const rng = U.seeded(city.id * 97 + 5);
    const cols = city.size + 1;
    for (let k = 0; k < cols; k++) {
      const hx = L + (k + 0.5) * w / cols;
      house(ctx, hx + (rng() - 0.5) * 3, Tp + d * 0.45, w / cols - 3, 5 + rng() * 2, '#d8c7a3', '#4b4f5c');
    }
    house(ctx, x, Tp + d * 0.9, w * 0.34 + city.size * 2, 7 + city.size, '#e3d2ac', '#7a2e22');
    // 城墙
    ctx.strokeStyle = '#a79d89'; ctx.lineWidth = 3;
    ctx.strokeRect(L, Tp, w, d);
    ctx.fillStyle = '#6e6658'; ctx.fillRect(L - 1.5, Bt, w + 3, wh);
    ctx.fillStyle = '#8f8676'; ctx.fillRect(L - 1.5, Bt - 1.5, w + 3, 2.5);
    ctx.fillStyle = '#a79d89';
    for (let k = L; k < Rr - 2; k += 5) ctx.fillRect(k, Bt - 4, 3, 2.5);
    // 城门
    ctx.fillStyle = '#2a1c10'; ctx.beginPath(); ctx.moveTo(x - 4, Bt + wh); ctx.lineTo(x - 4, Bt + 2); ctx.quadraticCurveTo(x, Bt - 1, x + 4, Bt + 2); ctx.lineTo(x + 4, Bt + wh); ctx.fill();
    roof(ctx, x, Bt - 3, 16, 6, '#3f3a36');
    // 角楼
    for (const [tx, ty] of [[L, Tp], [Rr, Tp], [L, Bt], [Rr, Bt]]) {
      ctx.fillStyle = '#7d7466'; ctx.fillRect(tx - 3.5, ty - 3, 7, 6);
      roof(ctx, tx, ty - 3, 10, 5, '#3f3a36');
    }
    flag(ctx, L + 2, Tp - 6, 22, col, null);
    flag(ctx, Rr - 2, Tp - 6, 22, col, null);
    if (city.dur < city.maxDur * 0.999 && z > 0.45) {
      ctx.fillStyle = '#222'; ctx.fillRect(x - 18, Tp - 12, 36, 4);
      ctx.fillStyle = city.dur < city.maxDur * 0.3 ? '#ef5350' : '#ffb74d'; ctx.fillRect(x - 18, Tp - 12, 36 * city.dur / city.maxDur, 4);
    }
    plate(ctx, x, Bt + wh + 10, city.name, col, 13);
    if (z >= 0.7) RD.label(ctx, '兵 ' + U.fmt(city.troops), x, Bt + wh + 24, 10, '#f3e6c8', 'normal');
  };

  // ---------- 关隘 ----------
  SP.gate = (ctx, city, x, y, z) => {
    const col = G.facColor(city.faction);
    ellipse(ctx, x + 2, y + 9, 26, 6, 'rgba(20,12,5,0.35)');
    ctx.fillStyle = '#6e6658'; ctx.fillRect(x - 24, y - 3, 48, 11);
    ctx.fillStyle = '#958c7b'; ctx.fillRect(x - 24, y - 5, 48, 3);
    ctx.fillStyle = '#a79d89';
    for (let k = x - 24; k < x + 22; k += 5) ctx.fillRect(k, y - 8, 3, 3);
    ctx.fillStyle = '#2a1c10'; ctx.beginPath(); ctx.moveTo(x - 5, y + 8); ctx.lineTo(x - 5, y + 1); ctx.quadraticCurveTo(x, y - 3, x + 5, y + 1); ctx.lineTo(x + 5, y + 8); ctx.fill();
    ctx.fillStyle = '#8a7058'; ctx.fillRect(x - 9, y - 14, 18, 9);
    roof(ctx, x, y - 14, 24, 8, '#3f3a36');
    flag(ctx, x - 20, y - 5, 20, col, null);
    flag(ctx, x + 20, y - 5, 20, col, null);
    if (city.dur < city.maxDur * 0.999 && z > 0.45) {
      ctx.fillStyle = '#222'; ctx.fillRect(x - 18, y - 30, 36, 4);
      ctx.fillStyle = '#ffb74d'; ctx.fillRect(x - 18, y - 30, 36 * city.dur / city.maxDur, 4);
    }
    plate(ctx, x, y + 19, city.name, col, 11);
    if (z >= 0.7) RD.label(ctx, '兵 ' + U.fmt(city.troops), x, y + 32, 10, '#f3e6c8', 'normal');
  };

  // ---------- 港口 ----------
  SP.port = (ctx, city, x, y, z) => {
    const col = G.facColor(city.faction);
    ctx.fillStyle = '#7a5a3a'; ctx.fillRect(x - 16, y + 2, 32, 5);
    ctx.strokeStyle = 'rgba(40,25,10,0.7)'; ctx.lineWidth = 0.8;
    for (let k = x - 14; k < x + 16; k += 4) { ctx.beginPath(); ctx.moveTo(k, y + 2); ctx.lineTo(k, y + 7); ctx.stroke(); }
    ctx.fillStyle = '#4a3322'; for (const k of [-15, -5, 5, 15]) ctx.fillRect(x + k, y + 7, 1.6, 4);
    house(ctx, x - 7, y + 2, 12, 7, '#d8c7a3', '#4b4f5c');
    // 泊船
    ctx.fillStyle = '#6d4c33'; ctx.beginPath(); ctx.moveTo(x + 1, y - 3); ctx.lineTo(x + 19, y - 3); ctx.lineTo(x + 15, y + 1); ctx.lineTo(x + 5, y + 1); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#3b2a1a'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x + 10, y - 3); ctx.lineTo(x + 10, y - 17); ctx.stroke();
    ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(x + 10.5, y - 16); ctx.lineTo(x + 18, y - 6); ctx.lineTo(x + 10.5, y - 5); ctx.closePath(); ctx.fill();
    plate(ctx, x, y + 17, city.name, col, 10);
    if (z >= 0.8) RD.label(ctx, '兵 ' + U.fmt(city.troops), x, y + 29, 9, '#f3e6c8', 'normal');
  };

  // ---------- 设施建筑 ----------
  SP.facility = (ctx, type, x, y, done, z) => {
    ctx.globalAlpha = done ? 1 : 0.55;
    switch (type) {
      case 'market':
        for (const [dx, c1] of [[-6, '#c0392b'], [6, '#d68910']]) {
          ctx.fillStyle = '#d8c7a3'; ctx.fillRect(x + dx - 5, y - 2, 10, 7);
          ctx.fillStyle = c1; ctx.beginPath(); ctx.moveTo(x + dx - 7, y - 1); ctx.lineTo(x + dx, y - 7); ctx.lineTo(x + dx + 7, y - 1); ctx.closePath(); ctx.fill();
          ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.fillRect(x + dx - 4, y - 3, 2, 2); ctx.fillRect(x + dx + 2, y - 3, 2, 2);
        }
        break;
      case 'farm':
        for (let k = 0; k < 4; k++) {
          ctx.fillStyle = k % 2 ? '#c9b25a' : '#7fa045';
          ctx.beginPath(); ctx.moveTo(x - 12 + k * 6, y + 7); ctx.lineTo(x - 7 + k * 6, y - 6); ctx.lineTo(x - 2 + k * 6, y - 6); ctx.lineTo(x - 7 + k * 6, y + 7); ctx.closePath(); ctx.fill();
        }
        ctx.strokeStyle = 'rgba(90,70,40,0.6)'; ctx.lineWidth = 0.8; ctx.strokeRect(x - 12, y - 6, 24, 13);
        break;
      case 'barracks':
        for (const [dx, dy] of [[-7, 2], [5, 4], [0, -3]]) {
          ctx.fillStyle = '#e8dcc0'; ctx.beginPath(); ctx.moveTo(x + dx - 6, y + dy + 4); ctx.lineTo(x + dx, y + dy - 6); ctx.lineTo(x + dx + 6, y + dy + 4); ctx.closePath(); ctx.fill();
          ctx.strokeStyle = 'rgba(80,60,40,0.8)'; ctx.lineWidth = 0.8; ctx.stroke();
          ctx.fillStyle = 'rgba(80,60,40,0.8)'; ctx.fillRect(x + dx - 1, y + dy, 2, 4);
        }
        ctx.strokeStyle = '#3b2a1a'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x + 10, y + 6); ctx.lineTo(x + 10, y - 10); ctx.stroke();
        ctx.fillStyle = '#c0392b'; ctx.fillRect(x + 10, y - 10, 6, 4);
        break;
      case 'smithy':
        house(ctx, x - 2, y + 6, 16, 8, '#bfae8e', '#4b4f5c');
        ctx.fillStyle = '#6e6658'; ctx.fillRect(x + 5, y - 10, 3, 9);
        ctx.fillStyle = 'rgba(120,120,120,0.45)'; ctx.beginPath(); ctx.arc(x + 7, y - 13, 3, 0, 7); ctx.arc(x + 9, y - 17, 2.5, 0, 7); ctx.fill();
        break;
      case 'stable':
        house(ctx, x + 3, y + 5, 14, 7, '#c9a878', '#6d4c33');
        ctx.strokeStyle = '#6d4c33'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(x - 13, y + 1); ctx.lineTo(x - 3, y + 1); ctx.moveTo(x - 13, y + 5); ctx.lineTo(x - 3, y + 5);
        ctx.stroke();
        for (let k = -13; k <= -3; k += 5) { ctx.beginPath(); ctx.moveTo(x + k, y - 1); ctx.lineTo(x + k, y + 7); ctx.stroke(); }
        break;
      case 'workshop':
        house(ctx, x - 3, y + 6, 15, 8, '#bfae8e', '#5a4a3a');
        ctx.fillStyle = '#8a6a44'; for (let k = 0; k < 3; k++) ctx.fillRect(x + 5, y + 3 - k * 3, 9, 2.2);
        ctx.strokeStyle = '#4a3322'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(x + 9, y - 6, 3.5, 0, 7); ctx.stroke();
        break;
      case 'dockyard':
        ctx.fillStyle = '#7a5a3a'; ctx.fillRect(x - 12, y + 4, 24, 3);
        ctx.strokeStyle = '#6d4c33'; ctx.lineWidth = 1.2;
        for (let k = -9; k <= 9; k += 4.5) { ctx.beginPath(); ctx.moveTo(x + k, y + 4); ctx.quadraticCurveTo(x + k * 0.7, y - 6, x + k * 0.2, y - 8); ctx.stroke(); }
        ctx.beginPath(); ctx.moveTo(x - 11, y + 1); ctx.quadraticCurveTo(x, y + 4, x + 11, y + 1); ctx.stroke();
        break;
    }
    if (!done) {
      ctx.strokeStyle = 'rgba(80,55,30,0.9)'; ctx.lineWidth = 0.8; ctx.setLineDash([2, 2]);
      ctx.strokeRect(x - 12, y - 10, 24, 18); ctx.setLineDash([]);
    }
    ctx.globalAlpha = 1;
    if (z >= 1.1) RD.label(ctx, R.FACILITIES[type].ch, x + 11, y + 9, 9, '#f3e6c8', 'normal');
  };

  // ---------- 野战建筑（阵、砦、箭楼、石兵八阵） ----------
  SP.fort = (ctx, type, x, y, col, done) => {
    ctx.globalAlpha = done ? 1 : 0.55;
    ellipse(ctx, x + 1, y + 8, 16, 5, 'rgba(20,12,5,0.3)');
    if (type === 'camp' || type === 'fort') {
      const big = type === 'fort';
      ctx.strokeStyle = '#6d4c33'; ctx.lineWidth = big ? 2.4 : 1.6;
      ctx.beginPath(); ctx.ellipse(x, y + 2, big ? 15 : 12, big ? 8 : 6, 0, 0, Math.PI * 2); ctx.stroke();
      for (let a = 0; a < Math.PI * 2; a += Math.PI / 7) {
        const px = x + Math.cos(a) * (big ? 15 : 12), py = y + 2 + Math.sin(a) * (big ? 8 : 6);
        ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px, py - (big ? 5 : 4)); ctx.stroke();
      }
      if (big) house(ctx, x, y + 3, 12, 6, '#bfae8e', '#3f3a36');
      else { ctx.fillStyle = '#e8dcc0'; ctx.beginPath(); ctx.moveTo(x - 5, y + 4); ctx.lineTo(x, y - 4); ctx.lineTo(x + 5, y + 4); ctx.closePath(); ctx.fill(); }
      flag(ctx, x + 9, y + 2, 16, col, null);
    } else if (type === 'tower') {
      ctx.strokeStyle = '#5a3f28'; ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.moveTo(x - 6, y + 8); ctx.lineTo(x - 3, y - 12); ctx.moveTo(x + 6, y + 8); ctx.lineTo(x + 3, y - 12);
      ctx.moveTo(x - 5, y + 2); ctx.lineTo(x + 5, y - 6); ctx.moveTo(x + 5, y + 2); ctx.lineTo(x - 5, y - 6); ctx.stroke();
      ctx.fillStyle = '#8a6a44'; ctx.fillRect(x - 6, y - 15, 12, 4);
      roof(ctx, x, y - 15, 14, 5, '#3f3a36');
      flag(ctx, x + 6, y - 15, 9, col, null);
    } else if (type === 'maze') {
      ctx.fillStyle = '#8f877a';
      for (let k = 0; k < 8; k++) {
        const a = k * Math.PI / 4, px = x + Math.cos(a) * 11, py = y + 2 + Math.sin(a) * 6;
        ctx.beginPath(); ctx.moveTo(px - 2.5, py + 3); ctx.lineTo(px - 1.5, py - 4); ctx.lineTo(px + 1.5, py - 5); ctx.lineTo(px + 2.5, py + 3); ctx.closePath(); ctx.fill();
      }
      ctx.strokeStyle = col; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.ellipse(x, y + 2, 5, 3, 0, 0, 7); ctx.stroke();
    }
    ctx.globalAlpha = 1;
  };

  // ---------- 部队 ----------
  const soldier = (ctx, x, y, kind, trim) => {
    ctx.fillStyle = '#3a2e24'; ctx.beginPath(); ctx.moveTo(x - 2.4, y + 4); ctx.lineTo(x - 1.6, y - 3); ctx.lineTo(x + 1.6, y - 3); ctx.lineTo(x + 2.4, y + 4); ctx.closePath(); ctx.fill();
    ctx.fillStyle = trim; ctx.fillRect(x - 1.8, y - 1, 3.6, 1.6);
    ctx.fillStyle = '#e2c49c'; ctx.beginPath(); ctx.arc(x, y - 4.6, 1.9, 0, 7); ctx.fill();
    ctx.fillStyle = '#2b2b2b'; ctx.fillRect(x - 2, y - 7, 4, 1.4);
    ctx.strokeStyle = '#2a1c10'; ctx.lineWidth = 1;
    ctx.beginPath();
    if (kind === 'spear') { ctx.moveTo(x + 3, y + 5); ctx.lineTo(x + 3, y - 12); ctx.moveTo(x + 2, y - 10); ctx.lineTo(x + 3, y - 13); ctx.lineTo(x + 4, y - 10); }
    else if (kind === 'halberd') { ctx.moveTo(x + 3, y + 5); ctx.lineTo(x + 3, y - 11); ctx.moveTo(x + 3, y - 9); ctx.quadraticCurveTo(x + 7, y - 9, x + 6, y - 5); }
    else if (kind === 'bow') { ctx.moveTo(x + 3, y - 6); ctx.quadraticCurveTo(x + 7, y - 1, x + 3, y + 4); ctx.moveTo(x + 3, y - 6); ctx.lineTo(x + 3, y + 4); }
    else { ctx.moveTo(x + 2.5, y + 1); ctx.lineTo(x + 5, y - 5); }
    ctx.stroke();
  };
  const rider = (ctx, x, y, trim) => {
    ctx.fillStyle = '#6b4a2e';
    ctx.beginPath(); ctx.ellipse(x, y + 1, 6, 2.8, 0, 0, 7); ctx.fill();
    ctx.beginPath(); ctx.moveTo(x + 4, y); ctx.lineTo(x + 8, y - 4); ctx.lineTo(x + 9, y - 2); ctx.lineTo(x + 6, y + 1); ctx.fill();
    ctx.strokeStyle = '#4a3220'; ctx.lineWidth = 1.1;
    ctx.beginPath(); for (const k of [-4, -2, 2, 4]) { ctx.moveTo(x + k, y + 3); ctx.lineTo(x + k + (k > 0 ? 0.6 : -0.6), y + 7); } ctx.stroke();
    soldier(ctx, x - 0.5, y - 3.5, 'spear', trim);
  };
  const machine = (ctx, x, y, type) => {
    ctx.fillStyle = '#8a6a44'; ctx.strokeStyle = '#4a3322'; ctx.lineWidth = 1;
    if (type === 'ram') { ctx.fillRect(x - 10, y - 4, 20, 6); ctx.fillStyle = '#5d4430'; ctx.fillRect(x - 13, y - 3, 26, 2.5); roof(ctx, x, y - 4, 22, 5, '#5d4430'); }
    else if (type === 'tower') { ctx.strokeStyle = '#6d4c33'; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(x - 6, y + 2); ctx.lineTo(x - 4, y - 18); ctx.moveTo(x + 6, y + 2); ctx.lineTo(x + 4, y - 18); ctx.moveTo(x - 5, y - 4); ctx.lineTo(x + 5, y - 10); ctx.stroke(); ctx.fillStyle = '#8a6a44'; ctx.fillRect(x - 6, y - 21, 12, 4); }
    else if (type === 'catapult') { ctx.fillRect(x - 9, y - 3, 18, 4); ctx.strokeStyle = '#5d4430'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x - 6, y - 3); ctx.lineTo(x + 7, y - 15); ctx.stroke(); ctx.fillStyle = '#777'; ctx.beginPath(); ctx.arc(x + 7, y - 16, 2.4, 0, 7); ctx.fill(); }
    else if (type === 'transport') { ctx.fillRect(x - 9, y - 4, 16, 6); ctx.fillStyle = '#d8c7a3'; for (const k of [-6, -1, 4]) { ctx.beginPath(); ctx.arc(x + k, y - 5, 2.8, 0, 7); ctx.fill(); } }
    ctx.fillStyle = '#3b2a1a'; for (const k of [-6, 6]) { ctx.beginPath(); ctx.arc(x + k, y + 3, 2.6, 0, 7); ctx.fill(); }
  };
  const ship = (ctx, x, y, kind, col) => {
    const k = kind === 'lou' ? 1.3 : kind === 'dou' ? 1.12 : 0.9;
    ctx.fillStyle = kind === 'zou' ? '#8d6e52' : '#5b3f2b'; ctx.strokeStyle = '#2b1b10'; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(x - 18 * k, y + 1); ctx.quadraticCurveTo(x - 16 * k, y + 9, x - 8 * k, y + 10); ctx.lineTo(x + 10 * k, y + 10); ctx.quadraticCurveTo(x + 17 * k, y + 8, x + 19 * k, y); ctx.closePath(); ctx.fill(); ctx.stroke();
    if (kind === 'lou') { ctx.fillStyle = '#7d5a3e'; ctx.fillRect(x - 8, y - 6, 16, 7); roof(ctx, x, y - 6, 20, 5, '#3f3a36'); }
    const masts = kind === 'lou' ? [-10, 12] : [3];
    for (const m of masts) {
      ctx.strokeStyle = '#3b2a1a'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(x + m, y + 1); ctx.lineTo(x + m, y - 22 * k); ctx.stroke();
      ctx.fillStyle = col; ctx.globalAlpha *= 0.95;
      ctx.beginPath(); ctx.moveTo(x + m + 0.5, y - 21 * k); ctx.quadraticCurveTo(x + m + 9 * k, y - 13 * k, x + m + 0.5, y - 5); ctx.closePath(); ctx.fill();
    }
  };

  SP.unit = (ctx, u, p, z, now, sel) => {
    ctx.save();
    ctx.translate(p.x, p.y); ctx.scale(1.3, 1.3); ctx.translate(-p.x, -p.y);
    SP._unit(ctx, u, p, z, now, sel);
    ctx.restore();
  };
  SP._unit = (ctx, u, p, z, now, sel) => {
    const { x, y } = p, col = G.facColor(u.faction), trim = darken(col, 1);
    const water = SG.Map.isWater(H.idx(u.c, u.r));
    const lead = G.off(u.offs[0]);
    if (sel) {
      ctx.strokeStyle = '#ffd54f'; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.ellipse(x, y + 9, 19 + Math.sin(now / 200) * 1.5, 7, 0, 0, Math.PI * 2); ctx.stroke();
    }
    if (water) {
      ship(ctx, x, y + 1, u.ship || 'zou', col);
      soldier(ctx, x - 6, y - 1, u.type === 'bow' ? 'bow' : 'spear', trim);
      soldier(ctx, x + 7, y - 1, 'spear', trim);
    } else {
      ellipse(ctx, x, y + 9, 16, 4.5, 'rgba(20,12,5,0.35)');
      const ty = u.type;
      if (ty === 'horse') { rider(ctx, x - 7, y + 3, trim); rider(ctx, x + 6, y + 5, trim); }
      else if (ty === 'ram' || ty === 'tower' || ty === 'catapult' || ty === 'transport') { machine(ctx, x - 1, y + 4, ty); soldier(ctx, x + 11, y + 3, 'sword', trim); }
      else {
        const kind = ty === 'sword' ? 'sword' : ty;
        soldier(ctx, x - 8, y + 3, kind, trim); soldier(ctx, x + 7, y + 3, kind, trim); soldier(ctx, x - 0.5, y + 6, kind, trim);
      }
    }
    // 军旗：主将姓氏
    flag(ctx, x + 12, y + 6, 30, col, lead.name[0]);
    const face = z >= 0.8 && SG.Portraits.img(lead.name);
    if (face) {
      ctx.save(); ctx.beginPath(); ctx.arc(x - 13, y - 16, 7.5, 0, Math.PI * 2); ctx.clip();
      const fw = face.naturalWidth;
      ctx.drawImage(face, 0, fw * 0.06, fw, fw, x - 20.5, y - 23.5, 15, 15);
      ctx.restore();
      ctx.strokeStyle = col; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(x - 13, y - 16, 7.5, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.fillStyle = 'rgba(0,0,0,0.75)'; ctx.fillRect(x - 15, y + 13, 30, 4);
    ctx.fillStyle = u.troops > u.maxT * 0.5 ? '#66bb6a' : u.troops > u.maxT * 0.25 ? '#ffca28' : '#ef5350';
    ctx.fillRect(x - 15, y + 13, 30 * U.clamp(u.troops / 15000, 0.03, 1), 4);
    if (z >= 0.6) RD.label(ctx, lead.name + (z >= 0.9 ? ' ' + R.TYPES[u.type].ch : ''), x, y + 23, 10, '#fff', 'normal');
    if (u.status) RD.label(ctx, { confuse: '乱', false: '伪', flood: '淹' }[u.status.kind] || '异', x - 14, y - 4, 11, '#e1bee7');
  };
})(window.SG);
