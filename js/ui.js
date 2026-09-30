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
    UI.renderLog();
  };

  // ---------- 侧栏 ----------
  UI.renderPanel = () => {
    const el = $('panel-body'), s = UI.sel;
    if (s && s.unit != null && G.S.units[s.unit]) el.innerHTML = UI.unitPanel(G.S.units[s.unit]);
    else if (s && s.city != null) el.innerHTML = UI.cityPanel(G.city(s.city));
    else if (s && s.hex) el.innerHTML = UI.hexPanel(s.hex);
    else el.innerHTML = UI.overviewPanel();
    el.querySelectorAll('[data-act]').forEach(b => b.addEventListener('click', () => UI.action(b.dataset.act, b.dataset)));
  };

  UI.overviewPanel = () => {
    const pf = G.S.player;
    const cities = G.citiesOf(pf);
    const units = G.unitsOf(pf);
    return `<h2>${UI.facChip(pf)} 军情</h2>
      <p class="muted">点击地图上的都市或部队进行操作。拖动地图平移，滚轮缩放。快捷键：E 结束回合，Esc 取消。</p>
      <h3>都市（${cities.length}）</h3>
      <table class="olist"><tr><th>都市</th><th>兵力</th><th>金</th><th>兵粮</th><th>闲</th></tr>
      ${cities.map(c => `<tr class="pick" data-act="goCity" data-id="${c.id}"><td>${esc(c.name)}${c.delegate ? '<span class="muted">(委)</span>' : ''}</td><td>${U.fmt(c.troops)}</td><td>${U.fmt(c.gold)}</td><td>${U.fmt(c.food)}</td><td>${G.idleIn(c.id).length}</td></tr>`).join('')}
      </table>
      <h3>部队（${units.length}）</h3>
      <table class="olist"><tr><th>部队</th><th>兵种</th><th>兵力</th><th>气力</th><th>状态</th></tr>
      ${units.map(u => `<tr class="pick" data-act="goUnit" data-id="${u.id}"><td>${esc(u.name)}</td><td>${R.TYPES[u.type].name}</td><td>${U.fmt(u.troops)}</td><td>${u.energy}</td><td>${u.acted ? '已行动' : u.moved ? '已移动' : '<span class="good">待命</span>'}</td></tr>`).join('') || '<tr><td colspan=5 class="muted">无</td></tr>'}
      </table>`;
  };

  UI.hexPanel = ([c, r]) => {
    const i = H.idx(c, r), t = SG.map.t[i];
    const reg = SG.map.region[i];
    return `<h2>${SG.T_NAMES[t]}${SG.map.road[i] ? '（道路）' : ''}</h2>
      <p class="muted">坐标 (${c}, ${r})${reg >= 0 ? '，属 ' + esc(G.city(reg).name) + ' 势力范围（' + esc(G.facName(G.city(reg).faction)) + '）' : ''}</p>
      <p class="muted">移动消耗：${isFinite(SG.Map.moveCost(i, 'spear')) ? SG.Map.moveCost(i, 'spear') : '不可通行'}${t === SG.T.RIVER ? '；部队在河川上将变为舟船，战力依赖水军适性' : ''}</p>`;
  };

  UI.offRow = (o, extra = '') => `<tr class="${o.acted ? 'acted' : ''}" title="${esc(UI.offTitle(o))}"><td>${SG.Portraits.thumb(o.name)}${esc(o.name)}${G.isRuler(o) ? '<span class="skill">★</span>' : G.rank(o) ? `<small class="rank">${G.rank(o).name}</small>` : ''}</td>
    <td>${o.s[0]}</td><td>${o.s[1]}</td><td>${o.s[2]}</td><td>${o.s[3]}</td><td>${o.s[4]}</td><td>${o.skill ? `<span class="skill">${o.skill}</span>` : '-'}</td>${extra}</tr>`;
  UI.offTitle = o => `${o.name} 统${o.s[0]} 武${o.s[1]} 智${o.s[2]} 政${o.s[3]} 魅${o.s[4]}\n适性 ` +
    R.APT_NAMES.map((n, k) => n + o.apt[k]).join(' ') + (o.skill ? `\n特技【${o.skill}】${R.SKILLS[o.skill] || ''}` : '') + (o.faction >= 0 && o.status === 'active' ? `\n忠诚 ${o.loyalty}　功绩 ${o.merit || 0}　官职 ${G.rank(o) ? G.rank(o).name : G.isRuler(o) ? '君主' : '无'}` : '');
  UI.offHead = (extra = '') => `<tr><th>武将</th><th>统</th><th>武</th><th>智</th><th>政</th><th>魅</th><th>特技</th>${extra}</tr>`;

  UI.cityPanel = city => {
    const own = G.isPlayer(city.faction), isCity = city.kind === 'city';
    const offs = G.officersIn(city.id), caps = G.captivesIn(city.id), frees = G.freeIn(city.id).filter(o => !o.hidden);
    const gov = G.governor(city);
    const w = city.w;
    let h = `<h2>${esc(city.name)} ${UI.facChip(city.faction)}</h2>`;
    h += `<div class="muted">${isCity ? ['', '小都市', '中都市', '大都市'][city.size] : city.kind === 'port' ? '港口（' + esc(G.city(SG.map.places[city.id].parent).name) + '）' : '关隘'}　太守：${gov ? esc(gov.name) : '无'}</div>`;
    h += `<div class="kv" style="margin-top:6px">
      <span>兵力</span><span>${U.fmt(city.troops)}</span><span>金</span><span>${U.fmt(city.gold)}</span>
      <span>兵粮</span><span>${U.fmt(city.food)}</span><span>气力</span><span>${city.energy}</span>
      <span>治安</span><span>${city.order}</span><span>耐久</span><span>${U.fmt(city.dur)}/${U.fmt(city.maxDur)}</span>
      </div>${UI.bar(city.dur, city.maxDur, '#ffb74d')}`;
    if (own || city.faction < 0 || G.allied(city.faction, G.S.player)) {
      h += `<div class="kv"><span>枪</span><span>${U.fmt(w.spear)}</span><span>戟</span><span>${U.fmt(w.halberd)}</span>
        <span>弩</span><span>${U.fmt(w.crossbow)}</span><span>马</span><span>${U.fmt(w.horse)}</span>
        <span>冲车</span><span>${w.ram}</span><span>井阑</span><span>${w.tower}</span><span>投石</span><span>${w.catapult}</span>
        <span>斗舰</span><span>${w.dou || 0}</span><span>楼船</span><span>${w.lou || 0}</span></div>`;
    }
    if (isCity && own) {
      h += `<div class="muted">每月金收入 +${D.goldIncome(city)}　每季兵粮 +${D.foodIncome(city)}　每旬消耗 ${D.upkeep(city)}</div>`;
    }
    if (own) {
      const f = G.fac(city.faction), ap = f.ap, dis = k => ap < R.AP[k] ? 'disabled' : '';
      const idle = G.idleIn(city.id).length > 0;
      const b = (act, label, apk, need = true) => `<button data-act="${act}" data-id="${city.id}" ${!need || (apk && dis(apk)) ? 'disabled' : ''} title="${apk ? '行动力 ' + R.AP[apk] : ''}">${label}</button>`;
      if (isCity) {
        h += `<div class="cmd-group">内政</div><div class="cmds">
          ${b('build', '开发', 'build', idle)}${b('recruit', '征兵', 'recruit', idle)}${b('train', '训练', 'train', idle)}
          ${b('patrol', '巡察', 'patrol', idle)}${b('produce', '生产', 'produce', idle)}${b('search', '搜索', 'search', idle)}</div>`;
      }
      h += `<div class="cmd-group">军事</div><div class="cmds">
        ${b('march', '出征', 'march', idle)}${b('transport', '运输', 'march', idle)}${isCity ? b('delegate', city.delegate ? '取消委任' : '委任', null) : ''}</div>
        <div class="cmd-group">人事</div><div class="cmds">
        ${isCity ? b('employ', '登用', 'employ', idle) : ''}${b('reward', '褒赏', 'reward', offs.length > 0)}${b('summon', '召唤', 'move')}
        ${b('captives', `俘虏(${caps.length})`, null, caps.length > 0)}</div>`;
    }
    h += `<h3>武将（${offs.length}）</h3>`;
    if (offs.length) h += `<div style="max-height:220px;overflow-y:auto"><table class="olist">${UI.offHead(own ? '<th>忠</th>' : '')}${offs.map(o => UI.offRow(o, own ? `<td>${o.loyalty}</td>` : '')).join('')}</table></div>`;
    else h += '<div class="muted">无</div>';
    if (frees.length) h += `<h3>在野武将</h3><div class="muted">${frees.map(o => esc(o.name)).join('、')}</div>`;
    if (caps.length) h += `<h3>俘虏</h3><div class="muted">${caps.map(o => esc(o.name) + '（' + esc(G.facName(o.faction)) + '）').join('、')}</div>`;
    if (isCity) {
      const slots = SG.map.places[city.id].plots.length;
      h += `<h3>设施（${city.facs.length}/${slots}）</h3><div class="facs">${city.facs.map(f => `<span class="fac ${f.done ? '' : 'building'}">${R.FACILITIES[f.type].name}${f.done ? '' : '·余' + f.left + '旬'}</span>`).join('')}</div>`;
    }
    return h;
  };

  UI.unitPanel = u => {
    const own = G.isPlayer(u.faction), st = C.stats(u), ty = R.TYPES[u.type];
    let h = `<h2>${esc(u.name)} ${UI.facChip(u.faction)}</h2>`;
    h += `<div class="kv">
      <span>兵种</span><span>${ty.name}${C.inWater(u) ? '(水上)' : ''}</span><span>适性</span><span>${st.apt}</span>
      <span>舰船</span><span>${R.SHIPS[u.ship || 'zou'].name}</span><span>射程</span><span>${C.rangeOf(u).join('-')}</span>
      <span>兵力</span><span>${U.fmt(u.troops)}</span><span>气力</span><span>${u.energy}</span>
      <span>攻击</span><span>${Math.round(st.atk)}</span><span>防御</span><span>${Math.round(st.def)}</span>
      <span>兵粮</span><span>${U.fmt(u.food)}</span><span>移动</span><span>${Un.mpOf(u)}</span>
      </div>${UI.bar(u.troops, u.maxT)}${UI.bar(u.energy, 100, '#64b5f6')}`;
    if (u.status) h += `<div class="warn">状态：${{ confuse: '混乱', false: '伪报', flood: '水困' }[u.status.kind] || '异常'}（${u.status.turns}旬）</div>`;
    if (u.cargo) h += `<div class="muted">运载：金 ${u.cargo.gold || 0}，兵粮 ${u.cargo.food || 0}</div>`;
    h += `<h3>武将</h3><div class="pts">${C.offs(u).map((o, k) => `<figure><img src="${SG.Portraits.src(o.name)}" alt=""><figcaption>${k ? '副将' : '主将'} ${esc(o.name)}</figcaption></figure>`).join('')}</div>
      <table class="olist">${UI.offHead()}${C.offs(u).map(o => UI.offRow(o)).join('')}</table>`;
    if (own) {
      const can = !u.acted && !u.status;
      h += `<div class="cmd-group">指令　${u.acted ? '<span class="muted">（本回合已行动）</span>' : u.moved ? '<span class="muted">（已移动）</span>' : ''}</div><div class="cmds">
        <button data-act="uMove" ${!can || u.moved ? 'disabled' : ''}>移动</button>
        <button data-act="uAttack" ${!can || ty.noAttack ? 'disabled' : ''}>攻击</button>
        <button data-act="uWait" ${!can ? 'disabled' : ''}>待机</button>
        <button data-act="uMarch" ${u.status ? 'disabled' : ''} title="设定目的地，之后每回合自动前进">行军</button>
        ${u.dest != null ? '<button data-act="uMarchCancel">取消行军</button>' : ''}</div>
        ${u.dest != null ? `<div class="muted">行军目标：${SG.map.city[u.dest] >= 0 ? esc(G.city(SG.map.city[u.dest]).name) : '(' + H.cr(u.dest).join(',') + ')'}</div>` : ''}`;
      const tacs = C.tacticsOf(u);
      if (tacs.length) {
        h += `<div class="cmd-group">${st.naval ? '水军战法' : '战法'}（适性 ${st.apt}）</div><div class="cmds">` + tacs.map(t =>
          `<button data-act="uTactic" data-id="${t.id}" ${!can || u.energy < t.en ? 'disabled' : ''} title="气力 ${t.en}，威力 ×${t.mult}">${t.name}<br><small>气${t.en}</small></button>`).join('') + '</div>';
      }
      if (!ty.noAttack) {
        h += `<div class="cmd-group">计略（智 ${st.int}）</div><div class="cmds">` + R.SCHEMES.map(s =>
          `<button data-act="uScheme" data-id="${s.id}" ${!can || u.energy < s.en ? 'disabled' : ''} title="${s.desc}，气力 ${s.en}">${s.name}<br><small>气${s.en}</small></button>`).join('') + '</div>';
      }
      if (!ty.noAttack) {
        h += `<div class="cmd-group">工事（开沟挖坑 · 引水）</div><div class="cmds">` + R.WORKS.map(w => {
          const e = SG.Works.check(u, w.id), n = e ? 0 : SG.Works.targets(u, w.id).size;
          return `<button data-act="uWork" data-id="${w.id}" ${e || !n ? 'disabled' : ''} title="${esc(w.desc)}${e ? '\n（' + esc(e) + '）' : !n ? '\n（相邻没有合适的地点）' : ''}\n气力 ${w.en}">${w.name}<br><small>气${w.en}</small></button>`;
        }).join('') + '</div>';
      }
      if (UI.mode === 'target') h += `<p class="good">请在地图上选择红色高亮的目标（右键 / Esc 取消）</p>`;
      if (UI.mode === 'dest') h += `<p class="good">请在地图上点击行军目的地（都市或任意地点）</p>`;
    }
    return h;
  };

  // ---------- 选择 / 指令 ----------
  UI.clearHL = () => { RD.hl.move = null; RD.hl.attack = null; RD.hl.path = null; RD.hl.flood = null; UI.reach = null; };
  UI.select = s => {
    UI.sel = s; UI.mode = 'idle'; UI.pending = null; UI.clearHL();
    RD.hl.sel = s;
    if (s && s.unit != null) {
      const u = G.S.units[s.unit];
      if (u && G.isPlayer(u.faction) && !u.acted && !u.moved && !u.status) UI.startMove(u);
    }
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
      case 'goUnit': { const x = S.units[+ds.id]; if (x) { RD.centerOn(x.c, x.r); UI.select({ unit: x.id }); } break; }
      case 'uMove': if (u) { UI.clearHL(); UI.startMove(u); UI.refresh(); } break;
      case 'uAttack': if (u) UI.beginTarget(u, { kind: 'attack' }); break;
      case 'uTactic': if (u) UI.beginTarget(u, { kind: 'tactic', tactic: C.tacticsOf(u).find(t => t.id === ds.id) }); break;
      case 'uWork': if (u) UI.beginTarget(u, { kind: 'work', work: SG.Works.def(ds.id) }); break;
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
        else {
          const tu = G.unitAt(c, r), tc = G.cityAt(c, r);
          res = C.attack(u, tu ? { unit: tu, c, r } : { city: tc, c, r }, p.tactic || null);
        }
        if (!res.ok) UI.toast(res.msg);
        UI.clearHL(); UI.mode = 'idle'; UI.pending = null;
        SG.Turn.checkGameOver(); UI.checkOver();
        if (!S.units[u.id]) UI.sel = null;
        UI.refresh();
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
      if (p.kind === 'work') {
        if (p.work.id === 'breach') {
          const e = SG.Works.estimate(u.faction, i);
          RD.hl.flood = e.area.land;
          text = `决堤：水位 ${e.level}，淹没 ${e.area.land.size} 格　预计敌损 ${e.foe} / 我损 ${e.own}`;
        } else text = `${p.work.name}：${p.work.desc}`;
      } else if (p.kind === 'scheme') {
        const rate = C.schemeRate(C.stats(u), tu ? C.stats(tu) : tc ? C.cityStats(tc) : null, p.scheme);
        text = `${p.scheme.name}　成功率 ${U.pct(rate)}`;
      } else {
        const pv = C.preview(u, tu ? { unit: tu } : { city: tc }, p.tactic || null);
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
    if (UI.mode === 'dest') { UI.mode = 'idle'; UI.refresh(); return; }
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
    $('btn-endturn').addEventListener('click', () => UI.endTurn());
    $('btn-officers').addEventListener('click', () => SG.Dlg.officerList());
    $('btn-cities').addEventListener('click', () => SG.Dlg.cityList());
    $('btn-factions').addEventListener('click', () => SG.Dlg.factionList());
    $('btn-diplomacy').addEventListener('click', () => SG.Dlg.diplomacy());
    $('btn-ranks').addEventListener('click', () => SG.Dlg.ranks());
    $('btn-auto').addEventListener('click', () => SG.Dlg.autoMode());
    $('btn-system').addEventListener('click', () => SG.Dlg.system());
    setInterval(() => { if (UI.logDirty && G.S) UI.renderLog(); }, 300);
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
    $('btn-endturn').disabled = true; $('btn-endturn').textContent = '群雄行动中…';
    UI.select(null);
    setTimeout(() => {
      try { SG.Turn.endPlayerTurn(); } catch (e) { console.error(e); UI.toast('回合处理出错：' + e.message); }
      UI.busy = false;
      $('btn-endturn').disabled = false; $('btn-endturn').textContent = '结束回合';
      UI.refresh();
      UI.checkOver();
      SG.Dlg.proposals();
    }, 30);
  };

  UI.checkOver = () => {
    const o = G.S && G.S.over;
    if (o && !UI.overShown) { UI.overShown = true; SG.Dlg.gameOver(o); }
  };
  UI.showDuel = res => SG.Dlg.duel(res);
})(window.SG);
