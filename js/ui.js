// 界面：顶栏、侧栏、日志、地图交互
(function (SG) {
  const U = SG.U, R = SG.R, H = SG.Hex, G = SG.G, C = SG.C, D = SG.Dom, Un = SG.Units, RD = SG.Render;
  const UI = SG.UI = {};
  const $ = id => document.getElementById(id);
  const esc = U.esc;
  UI.mode = 'idle'; UI.sel = null; UI.pending = null; UI.reach = null; UI.busy = false;

  // ---------- 通用 ----------
  UI.toast = msg => {
    const d = document.createElement('div');
    d.className = 'toast'; d.textContent = msg;
    $('toast-area').appendChild(d);
    setTimeout(() => d.remove(), 2900);
  };
  UI.onLog = () => { UI.logDirty = true; };
  UI.renderLog = () => {
    const el = $('log'), S = G.S;
    el.innerHTML = S.log.slice(-80).map(l => `<div class="${l.cls}"><span class="l-dim">${esc(l.d)}</span> ${esc(l.msg)}</div>`).join('');
    el.scrollTop = el.scrollHeight;
    UI.logDirty = false;
  };
  UI.facChip = fid => `<span class="chip" style="background:${G.facColor(fid)};color:${fid >= 0 && ['#e8e8e8', '#c9a227', '#7fa7c9', '#d48fb0'].includes(G.facColor(fid)) ? '#222' : '#fff'}">${esc(G.facName(fid))}</span>`;
  UI.bar = (v, max, col) => `<div class="bar"><i style="width:${U.clamp(v / max * 100, 0, 100)}%;background:${col || 'var(--green)'}"></i></div>`;

  UI.renderTop = () => {
    const S = G.S, pf = S.player, f = G.fac(pf);
    $('tb-date').textContent = G.dateStr();
    const fe = $('tb-faction');
    fe.textContent = `${f.name} · ${G.titleName(pf)}${f.emperor ? '（奉天子）' : ''}`; fe.style.background = f.color; fe.style.color = ['#e8e8e8', '#c9a227'].includes(f.color) ? '#222' : '#fff';
    const cs = G.citiesOf(pf);
    $('tb-stats').innerHTML = [
      ['都市', G.realCitiesOf(pf).length], ['武将', G.officersOf(pf).length], ['兵力', U.fmt(G.totalTroops(pf))],
      ['金', U.fmt(U.sum(cs, c => c.gold))], ['兵粮', U.fmt(U.sum(cs, c => c.food))],
      ['行动力', `<span style="color:var(--gold)">${f.ap}</span>/${R.AP_MAX}`],
      ['托管', `<span style="color:${S.auto && S.auto !== 'manual' ? 'var(--green)' : 'var(--dim)'}">${R.AUTO_MODES[S.auto || 'manual'].name}</span>`],
    ].map(([k, v]) => `<span>${k} <b>${v}</b></span>`).join('');
  };

  UI.refresh = () => {
    if (!G.S) return;
    UI.renderTop();
    UI.renderPanel();
    if (!$('log').classList.contains('hidden')) UI.renderLog();
  };

  // ---------- 武将表格（信息卡与指令菜单见 ui_layout.js） ----------
  UI.offRow = (o, extra = '') => `<tr class="${o.acted ? 'acted' : ''}" title="${esc(UI.offTitle(o))}"><td>${SG.Portraits.thumb(o.name)}${esc(o.name)}${G.isRuler(o) ? '<span class="skill">★</span>' : G.rank(o) ? `<small class="rank">${G.rank(o).name}</small>` : ''}</td>
    <td>${o.s[0]}</td><td>${o.s[1]}</td><td>${o.s[2]}</td><td>${o.s[3]}</td><td>${o.s[4]}</td><td>${o.skill ? `<span class="skill">${o.skill}</span>` : '-'}</td>${extra}</tr>`;
  UI.offTitle = o => `${o.name} 统${o.s[0]} 武${o.s[1]} 智${o.s[2]} 政${o.s[3]} 魅${o.s[4]}\n适性 ` +
    R.APT_NAMES.map((n, k) => n + o.apt[k]).join(' ') + (o.skill ? `\n特技【${o.skill}】${R.SKILLS[o.skill] || ''}` : '') + (o.faction >= 0 && o.status === 'active' ? `\n忠诚 ${o.loyalty}　功绩 ${o.merit || 0}　官职 ${G.rank(o) ? G.rank(o).name : G.isRuler(o) ? '君主' : '无'}` : '');
  UI.offHead = (extra = '') => `<tr><th>武将</th><th>统</th><th>武</th><th>智</th><th>政</th><th>魅</th><th>特技</th>${extra}</tr>`;

  // ---------- 选择 / 指令 ----------
  UI.clearHL = () => { RD.hl.move = null; RD.hl.attack = null; RD.hl.path = null; RD.hl.flood = null; UI.reach = null; };
  UI.select = s => {
    UI.sel = s; UI.mode = 'idle'; UI.pending = null; UI.clearHL(); UI.umSub = null;
    RD.hl.sel = s;
    UI.refresh();
  };
  UI.startMove = u => {
    UI.reach = Un.reachable(u);
    RD.hl.move = new Set(UI.reach.keys());
    UI.mode = 'unit';
  };
  UI.beginTarget = (u, pending) => {
    UI.clearHL();
    UI.pending = pending; UI.mode = 'target';
    const set = new Set();
    if (pending.kind === 'attack' || pending.kind === 'tactic') {
      for (const t of C.targets(u, C.tacticRange(u, pending.tactic))) {
        if (pending.tactic && pending.tactic.cityOnly && !t.city) continue;
        if (u.type === 'ram' && t.unit && !C.inWater(u)) continue;
        set.add(H.idx(t.c, t.r));
      }
    } else if (pending.kind === 'work') {
      for (const i of SG.Works.targets(u, pending.work.id)) set.add(i);
    } else if (pending.kind === 'fort') {
      for (const i of SG.Forts.targets(u)) set.add(i);
    } else {
      const sch = pending.scheme;
      for (const [c, r] of H.within(u.c, u.r, sch.range)) {
        const tu = G.unitAt(c, r), tc = G.cityAt(c, r);
        if (sch.id === 'calm') { if (tu && G.friendly(u.faction, tu.faction) && tu.status) set.add(H.idx(c, r)); }
        else if (sch.id === 'fire') { if ((tu && G.hostile(u.faction, tu.faction)) || (tc && C.canHitCity(u, tc) && tc.faction >= 0)) set.add(H.idx(c, r)); }
        else if (tu && G.hostile(u.faction, tu.faction)) set.add(H.idx(c, r));
      }
    }
    if (!set.size) { UI.toast('射程内没有可选目标'); UI.mode = 'unit'; UI.pending = null; UI.refresh(); return; }
    RD.hl.attack = set;
    UI.refresh();
  };

  UI.action = (act, ds) => {
    const S = G.S, s = UI.sel;
    const u = s && s.unit != null ? S.units[s.unit] : null;
    const city = ds.id != null && !isNaN(+ds.id) && !act.startsWith('u') ? G.city(+ds.id) : null;
    switch (act) {
      case 'goCity': { const c = G.city(+ds.id); RD.centerOn(c.c, c.r); UI.select({ city: c.id }); break; }
      case 'cityOfficers': UI.showCityOfficers(city); break;
      case 'cityFacs': UI.showCityFacs(city); break;
      case 'nextUnitBtn': UI.nextUnit(); break;
      case 'goUnit': { const x = S.units[+ds.id]; if (x) { RD.centerOn(x.c, x.r); UI.select({ unit: x.id }); } break; }
      case 'uMove': if (u) { UI.clearHL(); UI.startMove(u); UI.refresh(); } break;
      case 'uAttack': if (u) UI.beginTarget(u, { kind: 'attack' }); break;
      case 'uTactic': if (u) UI.beginTarget(u, { kind: 'tactic', tactic: C.tacticsOf(u).find(t => t.id === ds.id) }); break;
      case 'uWork': if (u) UI.beginTarget(u, { kind: 'work', work: SG.Works.def(ds.id) }); break;
      case 'uFort': if (u) UI.beginTarget(u, { kind: 'fort', fort: ds.id }); break;
      case 'uScheme': if (u) UI.beginTarget(u, { kind: 'scheme', scheme: R.SCHEMES.find(t => t.id === ds.id) }); break;
      case 'uMarch': if (u) { UI.clearHL(); UI.mode = 'dest'; UI.refresh(); } break;
      case 'uMarchCancel': if (u) { u.dest = null; UI.refresh(); } break;
      case 'uWait': if (u) { u.acted = true; u.mp = 0; UI.clearHL(); UI.mode = 'idle'; UI.refresh(); } break;
      case 'delegate': city.delegate = !city.delegate; UI.toast(city.delegate ? `${city.name} 已委任：回合结束时自动执行内政` : `已取消 ${city.name} 的委任`); UI.refresh(); break;
      default: if (SG.Dlg[act]) SG.Dlg[act](city);
    }
  };

  // ---------- 地图输入 ----------
  UI.onMapClick = hex => {
    if (UI.busy || !hex) return;
    $('tooltip').classList.add('hidden');
    const [c, r] = hex, i = H.idx(c, r), S = G.S;
    const s = UI.sel, u = s && s.unit != null ? S.units[s.unit] : null;
    if (UI.mode === 'target' && u) {
      if (RD.hl.attack && RD.hl.attack.has(i)) {
        const p = UI.pending;
        let res;
        if (p.kind === 'scheme') res = C.scheme(u, c, r, p.scheme);
        else if (p.kind === 'work') res = SG.Works.run(u, p.work.id, i);
        else if (p.kind === 'fort') { res = SG.Forts.build(u, p.fort, i); if (res.ok) UI.toast(res.msg); }
        else {
          const tu = G.unitAt(c, r), tc = G.cityAt(c, r);
          res = C.attack(u, tu ? { unit: tu, c, r } : tc ? { city: tc, c, r } : { fort: SG.Forts.at(i), idx: i, c, r }, p.tactic || null);
        }
        if (!res.ok) UI.toast(res.msg);
        UI.clearHL(); UI.mode = 'idle'; UI.pending = null;
        SG.Turn.checkGameOver(); UI.checkOver();
        if (!S.units[u.id]) UI.sel = null;
        UI.refresh();
        SG.Duel.flush();
        return;
      }
      UI.clearHL(); UI.mode = 'idle'; UI.pending = null; UI.refresh();
      return;
    }
    if (UI.mode === 'dest' && u) {
      u.dest = i; UI.mode = 'idle';
      UI.toast('已设定行军目标' + (G.cityAt(c, r) ? '：' + G.cityAt(c, r).name : ''));
      SG.Turn.autoMarch(u);
      if (!S.units[u.id]) { UI.select(G.cityAt(c, r) ? { city: G.cityAt(c, r).id } : null); return; }
      UI.refresh();
      return;
    }
    if (UI.mode === 'unit' && u && UI.reach && UI.reach.has(i) && i !== H.idx(u.c, u.r)) {
      const res = Un.moveTo(u, i, UI.reach);
      UI.clearHL(); UI.mode = 'idle';
      if (res.entered) { UI.select(G.cityAt(c, r) ? { city: G.cityAt(c, r).id } : null); SG.Turn.checkGameOver(); UI.checkOver(); return; }
      UI.refresh();
      return;
    }
    const tu = G.unitAt(c, r), tc = G.cityAt(c, r);
    if (tu) UI.select({ unit: tu.id });
    else if (tc) UI.select({ city: tc.id });
    else UI.select({ hex: [c, r] });
  };

  UI.onHover = (hex, sx, sy) => {
    const tip = $('tooltip');
    RD.hl.hover = hex;
    if (!hex || !G.S) { tip.classList.add('hidden'); return; }
    const [c, r] = hex, i = H.idx(c, r);
    const s = UI.sel, u = s && s.unit != null ? G.S.units[s.unit] : null;
    let text = '';
    if (UI.mode === 'unit' && UI.reach && UI.reach.has(i)) {
      const path = [];
      for (let k = i; k !== -1 && k != null; k = UI.reach.prevs.get(k)) path.push(k);
      RD.hl.path = path;
    } else RD.hl.path = null;
    RD.hl.flood = null;
    const ws = G.S.works;
    if (UI.mode === 'target' && u && RD.hl.attack && RD.hl.attack.has(i)) {
      const p = UI.pending, tu = G.unitAt(c, r), tc = G.cityAt(c, r);
      if (p.kind === 'fort') {
        const d = SG.Forts.DEFS[p.fort];
        text = `建设${d.name}：${d.desc}（金 ${d.gold}）`;
      } else if (p.kind === 'work') {
        if (p.work.id === 'breach') {
          const e = SG.Works.estimate(u.faction, i);
          RD.hl.flood = e.area.land;
          text = `决堤：水位 ${e.level}，淹没 ${e.area.land.size} 格　预计敌损 ${e.foe} / 我损 ${e.own}`;
        } else text = `${p.work.name}：${p.work.desc}`;
      } else if (p.kind === 'scheme') {
        const rate = C.schemeRate(C.stats(u), tu ? C.stats(tu) : tc ? C.cityStats(tc) : null, p.scheme);
        text = `${p.scheme.name}　成功率 ${U.pct(rate)}`;
      } else {
        const fo = !tu && !tc ? SG.Forts.at(i) : null;
        const pv = C.preview(u, tu ? { unit: tu } : tc ? { city: tc } : { fort: fo }, p.tactic || null);
        text = `${p.tactic ? p.tactic.name + '　成功率 ' + U.pct(pv.rate) + '　' : '攻击　'}预计伤害 ≈${pv.dmg}${pv.dur != null ? '　耐久 -' + pv.dur : ''}`;
      }
    } else {
      const tu = G.unitAt(c, r), tc = G.cityAt(c, r);
      if (tu) text = `${tu.name}［${G.facName(tu.faction)}］${R.TYPES[tu.type].name} ${U.fmt(tu.troops)}　气力 ${tu.energy}`;
      else if (tc) text = `${tc.name}［${G.facName(tc.faction)}］兵力 ${U.fmt(tc.troops)}　耐久 ${tc.dur}`;
      else {
        const t = SG.map.t[i];
        text = SG.T_NAMES[t] + (SG.map.road[i] ? '·道路' : '');
        if (ws.flood[i]) text += `·洪水（${ws.flood[i]}旬）`;
        if (ws.ditch[i]) text += ws.ditch[i].water ? '·水渠' : '·壕沟';
        if (ws.dam[i]) {
          text = `堤坝［${G.facName(ws.dam[i].f)}］水位 ${ws.dam[i].level}/${R.DAM_MAX}`;
          RD.hl.flood = SG.Works.floodArea(i, ws.dam[i].level).land;
        }
        if (SG.Works.trapVisible(i)) text += '·陷坑';
        const fo = SG.Forts.at(i);
        if (fo) text = `${SG.Forts.DEFS[fo.type].name}［${G.facName(fo.f)}］耐久 ${Math.max(0, fo.hp)}/${fo.maxHp}　${SG.Forts.DEFS[fo.type].desc}`;
        const pl = SG.map.plot[i];
        const fac = pl >= 0 && G.city(pl).facs.find(f => f.plot === i);
        if (fac) text += `　${G.city(pl).name}·${R.FACILITIES[fac.type].name}`;
      }
    }
    tip.textContent = text;
    tip.style.left = (sx + 16) + 'px'; tip.style.top = (sy + 14) + 'px';
    tip.classList.remove('hidden');
  };

  UI.cancel = () => {
    if (UI.mode === 'dest' || UI.mode === 'unit') { UI.clearHL(); UI.mode = 'idle'; UI.refresh(); return; }
    if (UI.mode === 'target') { UI.clearHL(); UI.mode = 'idle'; UI.pending = null; UI.refresh(); return; }
    UI.select(null);
  };

  UI.bindInput = () => {
    const cv = $('map');
    let down = null, dragged = false;
    cv.addEventListener('mousedown', e => { if (e.button === 0) { down = { x: e.clientX, y: e.clientY, cx: RD.cam.x, cy: RD.cam.y }; dragged = false; } });
    window.addEventListener('mousemove', e => {
      if (down) {
        const dx = e.clientX - down.x, dy = e.clientY - down.y;
        if (Math.abs(dx) + Math.abs(dy) > 5) { dragged = true; cv.classList.add('dragging'); }
        if (dragged) { RD.cam.x = down.cx - dx / RD.cam.zoom; RD.cam.y = down.cy - dy / RD.cam.zoom; RD.clampCam(); }
      }
      const rect = cv.getBoundingClientRect();
      if (e.target === cv) UI.onHover(RD.screenToHex(e.clientX - rect.left, e.clientY - rect.top), e.clientX - rect.left, e.clientY - rect.top);
      else { $('tooltip').classList.add('hidden'); RD.hl.hover = null; }
    });
    window.addEventListener('mouseup', e => {
      if (down && !dragged && e.target === cv) {
        const rect = cv.getBoundingClientRect();
        UI.onMapClick(RD.screenToHex(e.clientX - rect.left, e.clientY - rect.top));
      }
      down = null; cv.classList.remove('dragging');
    });
    cv.addEventListener('contextmenu', e => { e.preventDefault(); UI.cancel(); });
    cv.addEventListener('wheel', e => {
      e.preventDefault();
      const rect = cv.getBoundingClientRect();
      RD.zoomAt(e.clientX - rect.left, e.clientY - rect.top, e.deltaY < 0 ? 1.12 : 1 / 1.12);
    }, { passive: false });
    // 触屏
    let touch = null;
    cv.addEventListener('touchstart', e => {
      if (e.touches.length === 1) touch = { x: e.touches[0].clientX, y: e.touches[0].clientY, cx: RD.cam.x, cy: RD.cam.y, moved: false };
      else if (e.touches.length === 2) touch = { pinch: Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY), z: RD.cam.zoom };
    }, { passive: true });
    cv.addEventListener('touchmove', e => {
      if (!touch) return;
      e.preventDefault();
      if (touch.pinch && e.touches.length === 2) {
        const d = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
        const rect = cv.getBoundingClientRect();
        RD.zoomAt(rect.width / 2, rect.height / 2, (touch.z * d / touch.pinch) / RD.cam.zoom);
      } else if (!touch.pinch) {
        const dx = e.touches[0].clientX - touch.x, dy = e.touches[0].clientY - touch.y;
        if (Math.abs(dx) + Math.abs(dy) > 8) touch.moved = true;
        RD.cam.x = touch.cx - dx / RD.cam.zoom; RD.cam.y = touch.cy - dy / RD.cam.zoom; RD.clampCam();
      }
    }, { passive: false });
    cv.addEventListener('touchend', e => {
      if (touch && !touch.pinch && !touch.moved && e.changedTouches.length) {
        const rect = cv.getBoundingClientRect(), t = e.changedTouches[0];
        UI.onMapClick(RD.screenToHex(t.clientX - rect.left, t.clientY - rect.top));
      }
      touch = null;
    });
    // 小地图
    const mm = $('minimap');
    const miniJump = e => {
      const rect = mm.getBoundingClientRect(), w = RD.miniToWorld(e.clientX - rect.left, e.clientY - rect.top);
      RD.cam.x = w.x - RD.viewW() / 2; RD.cam.y = w.y - RD.viewH() / 2; RD.clampCam();
    };
    let mmDown = false;
    mm.addEventListener('mousedown', e => { mmDown = true; miniJump(e); });
    window.addEventListener('mouseup', () => { mmDown = false; });
    mm.addEventListener('mousemove', e => { if (mmDown) miniJump(e); });
    // 键盘
    window.addEventListener('keydown', e => {
      if (!G.S || e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
      if (!$('modal-bg').classList.contains('hidden')) { if (e.key === 'Escape') SG.Dlg.close(); return; }
      const step = 60 / RD.cam.zoom;
      if (e.key === 'Escape') UI.cancel();
      else if (e.key === 'e' || e.key === 'E') UI.endTurn();
      else if (e.key === 'ArrowLeft' || e.key === 'a') RD.cam.x -= step;
      else if (e.key === 'ArrowRight' || e.key === 'd') RD.cam.x += step;
      else if (e.key === 'ArrowUp' || e.key === 'w') RD.cam.y -= step;
      else if (e.key === 'ArrowDown' || e.key === 's') RD.cam.y += step;
      else if (e.key === 'n' || e.key === 'N') UI.nextUnit();
      RD.clampCam();
    });
    UI.buildCmdBar();
    setInterval(() => { if (UI.logDirty && G.S) { UI.ticker(); if (!$('log').classList.contains('hidden')) UI.renderLog(); UI.logDirty = false; } }, 300);
  };

  // 下一支待命部队
  UI.nextUnit = () => {
    const us = G.unitsOf(G.S.player).filter(u => !u.acted && !u.status);
    if (!us.length) { UI.toast('没有待命的部队'); return; }
    const cur = UI.sel && UI.sel.unit != null ? us.findIndex(u => u.id === UI.sel.unit) : -1;
    const u = us[(cur + 1) % us.length];
    RD.centerOn(u.c, u.r); UI.select({ unit: u.id });
  };

  UI.endTurn = () => {
    if (UI.busy || !G.S || G.S.over) return;
    UI.busy = true;
    $('btn-endturn').disabled = true; $('btn-endturn').querySelector('.cb-nm').textContent = '行动中…';
    UI.select(null);
    setTimeout(() => {
      try { SG.Turn.endPlayerTurn(); } catch (e) { console.error(e); UI.toast('回合处理出错：' + e.message); }
      UI.busy = false;
      $('btn-endturn').disabled = false; $('btn-endturn').querySelector('.cb-nm').textContent = '结束';
      UI.refresh();
      UI.checkOver();
      SG.Advisor.turnStart();
      SG.Duel.flush(() => SG.Dlg.proposals());
    }, 30);
  };

  UI.checkOver = () => {
    const o = G.S && G.S.over;
    if (o && !UI.overShown) { UI.overShown = true; SG.Dlg.gameOver(o); }
  };
  UI.showDuel = res => SG.Dlg.duel(res);
})(window.SG);
