// 仿三国志11的界面布局：底部指令栏、左下信息卡、部队旁指令菜单、顶部消息条
(function (SG) {
  const U = SG.U, R = SG.R, H = SG.Hex, G = SG.G, C = SG.C, D = SG.Dom, Un = SG.Units, RD = SG.Render, UI = SG.UI;
  const $ = id => document.getElementById(id);
  const esc = U.esc;
  const P = () => SG.Portraits;

  // ---------- 指令栏 ----------
  // 项目：[指令, 名称, 行动力键, 仅限都市]
  UI.CMDS = [
    { id: 'city', ch: '都', name: '都市', items: [['build', '开发', 'build', 1], ['recruit', '征兵', 'recruit', 1], ['train', '训练', 'train', 1], ['patrol', '巡察', 'patrol', 1], ['produce', '生产', 'produce', 1], ['delegate', '委任 / 取消委任', '', 1]] },
    { id: 'mil', ch: '军', name: '军事', items: [['march', '出征', 'march'], ['transport', '运输', 'march'], ['nextUnit', '下一支部队（N）', ''], ['autoMode', '托管设置', '']] },
    { id: 'hr', ch: '人', name: '人事', items: [['search', '搜索', 'search', 1], ['employ', '登用', 'employ', 1], ['reward', '褒赏', 'reward'], ['summon', '召唤', 'move'], ['captives', '处置俘虏', ''], ['ranks', '官职任命', '']] },
    { id: 'dip', ch: '外', name: '外交', run: () => SG.Dlg.diplomacy() },
    { id: 'tech', ch: '技', name: '技巧', run: () => SG.Dlg.tech && SG.Dlg.tech() },
    { id: 'info', ch: '情', name: '情报', items: [['officerList', '武将一览', ''], ['cityList', '都市一览', ''], ['factionList', '势力一览', ''], ['logPanel', '战报记录', '']] },
    { id: 'adv', ch: '谋', name: '军师', run: () => SG.Advisor.toggle() },
    { id: 'sys', ch: '系', name: '系统', run: () => SG.Dlg.system() },
    { id: 'end', ch: '终', name: '结束', run: () => UI.endTurn(), primary: true },
  ];
  const GLOBAL = { nextUnit: () => UI.nextUnit(), autoMode: () => SG.Dlg.autoMode(), ranks: () => SG.Dlg.ranks(), officerList: () => SG.Dlg.officerList(),
    cityList: () => SG.Dlg.cityList(), factionList: () => SG.Dlg.factionList(), logPanel: () => UI.toggleLog() };

  UI.buildCmdBar = () => {
    $('cmdbar').innerHTML = UI.CMDS.map(c => `<button class="cb ${c.primary ? 'primary' : ''}" data-c="${c.id}" ${c.id === 'end' ? 'id="btn-endturn"' : ''} title="${c.name}">
      <span class="cb-ch">${c.ch}</span><span class="cb-nm">${c.name}</span></button>`).join('');
    $('cmdbar').querySelectorAll('.cb').forEach(b => b.addEventListener('click', e => {
      e.stopPropagation();
      const c = UI.CMDS.find(x => x.id === b.dataset.c);
      if (c.run) { UI.closeSub(); c.run(); return; }
      UI.openSub(c, b);
    }));
    document.addEventListener('click', e => { if (!e.target.closest('#submenu') && !e.target.closest('#cmdbar')) UI.closeSub(); });
  };
  UI.closeSub = () => { $('submenu').classList.add('hidden'); UI.subOpen = null; };
  UI.openSub = (c, btn) => {
    if (UI.subOpen === c.id) { UI.closeSub(); return; }
    UI.subOpen = c.id;
    const S = G.S, f = G.fac(S.player), city = UI.selOwnCity();
    const el = $('submenu');
    el.innerHTML = `<div class="sm-head">${c.name}${city && c.id !== 'info' && c.id !== 'mil' ? ' · ' + esc(city.name) : ''}</div>` + c.items.map(([act, name, apk, cityOnly]) => {
      const ap = apk ? R.AP[apk] : 0;
      const dis = (ap && f.ap < ap) || (act === 'captives' && city && !G.captivesIn(city.id).length);
      return `<button data-a="${act}" ${dis ? 'disabled' : ''}>${name}${ap ? `<small>行动力 ${ap}</small>` : ''}</button>`;
    }).join('');
    el.classList.remove('hidden');
    const r = btn.getBoundingClientRect(), wrap = $('mapwrap').getBoundingClientRect();
    el.style.left = Math.max(4, Math.min(r.left - wrap.left, wrap.width - el.offsetWidth - 4)) + 'px';
    el.style.bottom = (wrap.bottom - r.top + 6) + 'px';
    el.querySelectorAll('[data-a]').forEach(b => b.addEventListener('click', () => {
      const act = b.dataset.a, item = c.items.find(x => x[0] === act);
      UI.closeSub();
      if (GLOBAL[act]) { GLOBAL[act](); return; }
      UI.cityCmd(act, !!item[3]);
    }));
  };
  UI.selOwnCity = () => {
    const s = UI.sel;
    if (s && s.city != null && G.isPlayer(G.city(s.city).faction)) return G.city(s.city);
    return null;
  };
  // 都市指令：已选己方都市则直接执行，否则先选城
  UI.cityCmd = (act, cityOnly) => {
    const city = UI.selOwnCity();
    if (city && (!cityOnly || city.kind === 'city')) { UI.action(act, { id: city.id }); return; }
    UI.pickCity(cityOnly, c => { UI.select({ city: c.id }); RD.centerOn(c.c, c.r); UI.action(act, { id: c.id }); });
  };
  UI.pickCity = (cityOnly, then) => {
    const pf = G.S.player;
    const list = G.citiesOf(pf).filter(c => !cityOnly || c.kind === 'city');
    SG.Dlg.open(`<h2>选择都市</h2><div class="scroll"><table class="olist"><tr><th>都市</th><th>兵力</th><th>金</th><th>兵粮</th><th>待命武将</th></tr>
      ${list.map(c => `<tr class="pick" data-c="${c.id}"><td>${esc(c.name)}${c.kind !== 'city' ? '<small class="muted">（' + (c.kind === 'port' ? '港' : '关') + '）</small>' : ''}</td><td>${U.fmt(c.troops)}</td><td>${U.fmt(c.gold)}</td><td>${U.fmt(c.food)}</td><td>${G.idleIn(c.id).length}</td></tr>`).join('')}
      </table></div><div class="foot"><button data-close>取消</button></div>`, m => {
      m.querySelectorAll('[data-c]').forEach(tr => tr.addEventListener('click', () => { SG.Dlg.close(); then(G.city(+tr.dataset.c)); }));
    });
  };

  // ---------- 信息卡 ----------
  const stat = (k, v) => `<span>${k}</span><b>${v}</b>`;
  UI.renderPanel = () => {
    const el = $('infocard'), s = UI.sel, S = G.S;
    let h;
    if (s && s.unit != null && S.units[s.unit]) h = UI.unitCard(S.units[s.unit]);
    else if (s && s.city != null) h = UI.cityCard(G.city(s.city));
    else if (s && s.hex) h = UI.hexCard(s.hex);
    else h = UI.factionCard();
    el.innerHTML = h;
    el.querySelectorAll('[data-act]').forEach(b => b.addEventListener('click', () => UI.action(b.dataset.act, b.dataset)));
    UI.renderUnitMenu();
  };
  UI.factionCard = () => {
    const pf = G.S.player, f = G.fac(pf), ruler = G.ruler(pf), cs = G.citiesOf(pf);
    const idle = G.unitsOf(pf).filter(u => !u.acted && !u.status).length;
    return `<img class="ic-pt" src="${P().src(ruler.name)}" alt="">
      <div class="ic-body"><div class="ic-title">${esc(f.name)} <span class="muted">${G.titleName(pf)}</span></div>
      <div class="ic-grid">${stat('都市', G.realCitiesOf(pf).length)}${stat('武将', G.officersOf(pf).length)}${stat('兵力', U.fmt(G.totalTroops(pf)))}
      ${stat('金', U.fmt(U.sum(cs, c => c.gold)))}${stat('兵粮', U.fmt(U.sum(cs, c => c.food)))}${stat('行动力', f.ap)}</div>
      <div class="ic-hint">${idle ? `<button data-act="nextUnitBtn">待命部队 ${idle} 支 ▶</button>` : ''} 点击地图上的都市或部队查看；下方指令栏下达指令。</div></div>`;
  };
  UI.hexCard = ([c, r]) => {
    const i = H.idx(c, r), t = SG.map.t[i], reg = SG.map.region[i], ws = G.S.works;
    const cost = SG.Map.moveCost(i, 'spear');
    return `<div class="ic-body"><div class="ic-title">${SG.T_NAMES[t]}${SG.map.road[i] ? '·道路' : ''}${ws.flood[i] ? '·洪水' : ''}${ws.ditch[i] ? (ws.ditch[i].water ? '·水渠' : '·壕沟') : ''}</div>
      <div class="muted">${reg >= 0 ? esc(G.city(reg).name) + ' 势力范围（' + esc(G.facName(G.city(reg).faction)) + '）' : ''}</div>
      <div class="muted">移动消耗：${isFinite(cost) ? cost : '不可通行'}${SG.Map.isWater(i) ? '（水上：依水军适性作战）' : ''}</div></div>`;
  };
  UI.cityCard = city => {
    const own = G.isPlayer(city.faction), isCity = city.kind === 'city', w = city.w;
    const gov = G.governor(city), offs = G.officersIn(city.id), caps = G.captivesIn(city.id), frees = G.freeIn(city.id).filter(o => !o.hidden);
    const show = own || city.faction < 0 || G.allied(city.faction, G.S.player);
    const kind = isCity ? ['', '小都市', '中都市', '大都市'][city.size] : city.kind === 'port' ? '港口' : '关隘';
    let h = `<img class="ic-pt" src="${gov ? P().src(gov.name) : P().placeholder(city.name)}" alt="">
      <div class="ic-body"><div class="ic-title">${esc(city.name)} ${UI.facChip(city.faction)} <span class="muted">${kind}</span></div>
      <div class="muted">太守：${gov ? esc(gov.name) : '无'}　武将 ${offs.length}（待命 ${G.idleIn(city.id).length}）${city.delegate ? '　<span class="good">委任中</span>' : ''}</div>
      <div class="ic-grid">${stat('兵力', U.fmt(city.troops))}${stat('气力', city.energy)}${stat('耐久', `${U.fmt(city.dur)}/${U.fmt(city.maxDur)}`)}
      ${show ? stat('金', U.fmt(city.gold)) + stat('兵粮', U.fmt(city.food)) + stat('治安', city.order) : ''}</div>`;
    if (show) h += `<div class="ic-line">枪${U.fmt(w.spear)} 戟${U.fmt(w.halberd)} 弩${U.fmt(w.crossbow)} 马${U.fmt(w.horse)}${w.ram || w.tower || w.catapult ? `　冲${w.ram} 井${w.tower} 投${w.catapult}` : ''}${w.dou || w.lou ? `　斗舰${w.dou || 0} 楼船${w.lou || 0}` : ''}</div>`;
    if (isCity && own) h += `<div class="ic-line muted">月入金 +${D.goldIncome(city)}　季收粮 +${D.foodIncome(city)}　旬耗粮 ${D.upkeep(city)}　设施 ${city.facs.length}/${SG.map.places[city.id].plots.length}</div>`;
    if (frees.length) h += `<div class="ic-line">在野：${frees.map(o => esc(o.name)).join('、')}</div>`;
    if (caps.length) h += `<div class="ic-line warn">俘虏：${caps.map(o => esc(o.name)).join('、')}</div>`;
    h += `<div class="ic-hint"><button data-act="cityOfficers" data-id="${city.id}">武将名单</button>${isCity ? `<button data-act="cityFacs" data-id="${city.id}">设施</button>` : ''}${own ? ' 用下方「都市 / 军事 / 人事」指令' : ''}</div></div>`;
    return h;
  };
  UI.unitCard = u => {
    const st = C.stats(u), ty = R.TYPES[u.type], offs = C.offs(u), own = G.isPlayer(u.faction);
    const stName = u.status ? { confuse: '混乱', false: '伪报', flood: '水困' }[u.status.kind] || '异常' : u.acted ? '已行动' : u.moved ? '已移动' : '待命';
    return `<img class="ic-pt" src="${P().src(offs[0].name)}" alt="">
      <div class="ic-body"><div class="ic-title">${esc(u.name)} ${UI.facChip(u.faction)}</div>
      <div class="ic-deps">${offs.slice(1).map(o => `${P().thumb(o.name)}${esc(o.name)}`).join('　') || '<span class="muted">无副将</span>'}</div>
      <div class="ic-grid">${stat('兵种', ty.name + (st.naval ? '(水)' : '') + ' ' + st.apt)}${stat('兵力', U.fmt(u.troops))}${stat('气力', u.energy)}
      ${stat('攻/防', Math.round(st.atk) + '/' + Math.round(st.def))}${stat('兵粮', U.fmt(u.food))}${stat('状态', stName)}</div>
      ${UI.bar(u.troops, u.maxT)}${UI.bar(u.energy, 100, '#64b5f6')}
      <div class="ic-hint muted">${R.SHIPS[u.ship || 'zou'].name} · 移动 ${Un.mpOf(u)} · 射程 ${C.rangeOf(u).join('-')}${u.dest != null ? ' · 行军中' : ''}${own ? '　在部队旁的菜单中下令' : ''}</div></div>`;
  };

  // ---------- 部队旁指令菜单 ----------
  UI.renderUnitMenu = () => {
    const el = $('unitmenu'), s = UI.sel, S = G.S;
    const u = s && s.unit != null ? S.units[s.unit] : null;
    if (!u || !G.isPlayer(u.faction) || UI.busy) { el.classList.add('hidden'); return; }
    const can = !u.acted && !u.status, ty = R.TYPES[u.type];
    el.classList.toggle('hint', UI.mode !== 'idle');
    if (UI.mode !== 'idle') {
      const tip = UI.mode === 'dest' ? '点击行军目的地（都市或任意地点）' : UI.mode === 'unit' ? '点击蓝色格移动' : '点击红色高亮的目标';
      el.innerHTML = `<div class="um-tip"><b>${esc(u.name)}</b>　${tip}　<small>右键 / Esc 返回</small></div><button data-um="cancel">返回</button>`;
    } else {
      const tacs = C.tacticsOf(u), sub = UI.umSub;
      const item = (a, name, ok, extra = '') => `<button data-um="${a}" ${ok ? '' : 'disabled'} class="${sub === a ? 'open' : ''}">${name}${extra}</button>`;
      let h = `<div class="um-head">${esc(u.name)}<small>${U.fmt(u.troops)} · 气${u.energy}</small></div>`;
      h += item('uMove', '移动', can && !u.moved) + item('uAttack', '攻击', can && !ty.noAttack);
      if (tacs.length) h += item('tac', '战法', can, ' ▸');
      if (!ty.noAttack) h += item('sch', '计略', can, ' ▸') + item('wrk', '工事', can, ' ▸');
      if (SG.Forts && !ty.noAttack) h += item('bld', '建设', can, ' ▸');
      h += item('uWait', '待命', can) + item('uMarch', u.dest != null ? '行军（改）' : '行军', !u.status);
      if (u.dest != null) h += item('uMarchCancel', '取消行军', true);
      let side = '';
      if (sub === 'tac') side = tacs.map(t => `<button data-um="uTactic" data-id="${t.id}" ${can && u.energy >= t.en ? '' : 'disabled'} title="威力 ×${t.mult}">${t.name}<small>气${t.en}</small></button>`).join('');
      if (sub === 'sch') side = R.SCHEMES.map(x => `<button data-um="uScheme" data-id="${x.id}" ${can && u.energy >= x.en ? '' : 'disabled'} title="${esc(x.desc)}">${x.name}<small>气${x.en}</small></button>`).join('');
      if (sub === 'wrk') side = R.WORKS.map(w => {
        const e = SG.Works.check(u, w.id), n = e ? 0 : SG.Works.targets(u, w.id).size;
        return `<button data-um="uWork" data-id="${w.id}" ${e || !n ? 'disabled' : ''} title="${esc(w.desc)}${e ? '（' + esc(e) + '）' : !n ? '（附近无合适地点）' : ''}">${w.name}<small>气${w.en}</small></button>`;
      }).join('');
      if (sub === 'bld' && SG.Forts) side = SG.Forts.menu(u);
      el.innerHTML = `<div class="um-main">${h}</div>${side ? `<div class="um-side">${side}</div>` : ''}`;
    }
    el.classList.remove('hidden');
    el.querySelectorAll('[data-um]').forEach(b => b.addEventListener('click', e => {
      e.stopPropagation();
      const a = b.dataset.um;
      if (a === 'cancel') { UI.cancel(); return; }
      if (a === 'tac' || a === 'sch' || a === 'wrk' || a === 'bld') { UI.umSub = UI.umSub === a ? null : a; UI.renderUnitMenu(); return; }
      UI.umSub = null;
      UI.action(a, b.dataset);
    }));
    UI.positionUnitMenu();
  };
  UI.positionUnitMenu = () => {
    const el = $('unitmenu');
    if (el.classList.contains('hidden')) return;
    const u = UI.sel && UI.sel.unit != null ? G.S.units[UI.sel.unit] : null;
    if (!u) { el.classList.add('hidden'); return; }
    if (el.classList.contains('hint')) { el.style.left = '50%'; el.style.top = '8px'; return; }
    const p = RD.unitPos(u), cam = RD.cam, wrap = $('mapwrap');
    let x = (p.x - cam.x) * cam.zoom + 34 * cam.zoom, y = (p.y - cam.y) * cam.zoom - 60;
    x = Math.min(x, wrap.clientWidth - el.offsetWidth - 6);
    y = U.clamp(y, 6, wrap.clientHeight - el.offsetHeight - 70);
    el.style.left = x + 'px'; el.style.top = y + 'px';
  };

  // ---------- 顶部消息条与战报 ----------
  let lastSeen = 0;
  UI.ticker = () => {
    const S = G.S, box = $('ticker');
    if (!box || !S) return;
    if (lastSeen > S.log.length) lastSeen = 0;
    const fresh = S.log.slice(lastSeen).filter(l => l.cls && l.cls !== 'l-dim').slice(-3);
    lastSeen = S.log.length;
    for (const l of fresh) {
      const d = document.createElement('div');
      d.className = 'tk ' + l.cls; d.textContent = l.msg;
      box.appendChild(d);
      setTimeout(() => d.classList.add('out'), 5200);
      setTimeout(() => d.remove(), 6000);
    }
    while (box.children.length > 4) box.firstChild.remove();
  };
  UI.toggleLog = () => { $('log').classList.toggle('hidden'); UI.renderLog(); };

  // 城中武将名单、设施
  UI.showCityOfficers = city => {
    const offs = G.officersIn(city.id), own = G.isPlayer(city.faction);
    SG.Dlg.open(`<h2>${esc(city.name)} · 武将（${offs.length}）</h2><div class="scroll"><table class="olist">${UI.offHead(own ? '<th>忠</th><th>状态</th>' : '')}
      ${offs.map(o => UI.offRow(o, own ? `<td>${o.loyalty}</td><td>${o.acted ? '已行动' : '<span class="good">待命</span>'}</td>` : '')).join('') || '<tr><td colspan=9 class="muted">无</td></tr>'}</table></div>
      <div class="foot"><button data-close>关闭</button></div>`);
  };
  UI.showCityFacs = city => {
    const slots = SG.map.places[city.id].plots.length;
    SG.Dlg.open(`<h2>${esc(city.name)} · 设施（${city.facs.length}/${slots}）</h2>
      <div class="facs">${city.facs.map(f => `<span class="fac ${f.done ? '' : 'building'}">${R.FACILITIES[f.type].name}${f.done ? '' : '·余' + f.left + '旬'}</span>`).join('') || '<span class="muted">尚无设施</span>'}</div>
      <p class="muted">${R.FAC_ORDER.map(k => R.FACILITIES[k].name + '：' + R.FACILITIES[k].desc).join('<br>')}</p>
      <div class="foot"><button data-close>关闭</button></div>`);
  };
})(window.SG);
