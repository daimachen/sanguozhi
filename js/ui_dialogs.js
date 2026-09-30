// 对话框（一）：通用弹窗与都市指令
(function (SG) {
  const U = SG.U, R = SG.R, H = SG.Hex, G = SG.G, C = SG.C, D = SG.Dom, Un = SG.Units, RD = SG.Render, UI = SG.UI;
  const Dlg = SG.Dlg = {};
  const $ = id => document.getElementById(id);
  const esc = U.esc;

  Dlg.open = (html, bind) => {
    $('modal').innerHTML = html;
    $('modal-bg').classList.remove('hidden');
    $('modal').querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', Dlg.close));
    if (bind) bind($('modal'));
  };
  Dlg.close = () => { $('modal-bg').classList.add('hidden'); $('modal').innerHTML = ''; if (Dlg.onClose) { const f = Dlg.onClose; Dlg.onClose = null; f(); } };
  Dlg.msg = (title, text, then) => {
    Dlg.open(`<h2>${esc(title)}</h2><p>${text}</p><div class="foot"><button class="primary" id="ok">确定</button></div>`, m => {
      m.querySelector('#ok').addEventListener('click', () => { Dlg.close(); if (then) then(); });
    });
  };
  Dlg.confirm = (title, text, yes, no, yesText = '同意', noText = '拒绝') => {
    Dlg.open(`<h2>${esc(title)}</h2><p>${text}</p><div class="foot"><button id="no">${noText}</button><button class="primary" id="yes">${yesText}</button></div>`, m => {
      m.querySelector('#yes').addEventListener('click', () => { Dlg.close(); yes && yes(); });
      m.querySelector('#no').addEventListener('click', () => { Dlg.close(); no && no(); });
    });
  };
  const done = (res, city) => {
    if (!res.ok) { UI.toast(res.msg); return false; }
    if (res.msg) { UI.toast(res.msg); G.log(res.msg, ''); }
    UI.refresh();
    return true;
  };

  // 选将表格
  // opts: {title, list, multi, max, extraHead, extra(o), note, okText, onOk(ids), sortKey}
  Dlg.pickOfficers = opts => {
    const list = opts.list.slice();
    if (opts.sortKey != null) list.sort((a, b) => b.s[opts.sortKey] - a.s[opts.sortKey]);
    const chosen = [];
    const max = opts.multi ? (opts.max || 99) : 1;
    const rows = list.map(o => `<tr class="pick ${o.acted ? 'acted' : ''}" data-oid="${o.id}" title="${esc(UI.offTitle(o))}">
      <td>${esc(o.name)}</td><td>${o.s[0]}</td><td>${o.s[1]}</td><td>${o.s[2]}</td><td>${o.s[3]}</td><td>${o.s[4]}</td>
      <td>${o.skill ? `<span class="skill">${o.skill}</span>` : '-'}</td>${opts.extra ? opts.extra(o) : ''}</tr>`).join('');
    Dlg.open(`<h2>${esc(opts.title)}</h2>${opts.note ? `<p class="muted">${opts.note}</p>` : ''}
      <div class="scroll"><table class="olist">${UI.offHead(opts.extraHead || '')}${rows || '<tr><td colspan=9 class="muted">没有可选的武将</td></tr>'}</table></div>
      <div class="row muted" id="pk-sel">未选择</div>
      <div class="foot"><button data-close>取消</button><button class="primary" id="pk-ok" disabled>${opts.okText || '决定'}</button></div>`, m => {
      const upd = () => {
        m.querySelectorAll('tr.pick').forEach(tr => tr.classList.toggle('chosen', chosen.includes(+tr.dataset.oid)));
        m.querySelector('#pk-sel').textContent = chosen.length ? '已选：' + chosen.map(id => G.off(id).name).join('、') : '未选择';
        m.querySelector('#pk-ok').disabled = !chosen.length;
      };
      m.querySelectorAll('tr.pick').forEach(tr => tr.addEventListener('click', () => {
        const id = +tr.dataset.oid, k = chosen.indexOf(id);
        if (k >= 0) chosen.splice(k, 1);
        else { if (chosen.length >= max) chosen.shift(); chosen.push(id); }
        upd();
      }));
      m.querySelectorAll('tr.pick').forEach(tr => tr.addEventListener('dblclick', () => {
        if (!opts.multi) { Dlg.close(); opts.onOk([+tr.dataset.oid]); }
      }));
      m.querySelector('#pk-ok').addEventListener('click', () => { const ids = chosen.slice(); Dlg.close(); opts.onOk(ids); });
    });
  };
  const idle = city => G.idleIn(city.id);

  // ---------- 内政 ----------
  Dlg.build = city => {
    const free = SG.map.places[city.id].plots.length - city.facs.length;
    if (free <= 0) { UI.toast('没有空余地块'); return; }
    const opts = R.FAC_ORDER.map(k => {
      const F = R.FACILITIES[k], n = city.facs.filter(f => f.type === k).length;
      return `<button data-f="${k}" ${city.gold < F.cost || (F.water && !G.nearWater(city.id)) ? 'disabled' : ''} style="text-align:left;padding:6px 10px">
        <b>${F.name}</b>（${n}）　<span class="muted">金 ${F.cost}</span><br><small class="muted">${F.desc}</small></button>`;
    }).join('');
    Dlg.open(`<h2>开发 · ${esc(city.name)}</h2><p class="muted">空余地块 ${free}　城内金 ${city.gold}</p>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px">${opts}</div><div class="foot"><button data-close>取消</button></div>`, m => {
      m.querySelectorAll('[data-f]').forEach(b => b.addEventListener('click', () => {
        const type = b.dataset.f;
        Dlg.close();
        Dlg.pickOfficers({
          title: `建设${R.FACILITIES[type].name} · 选择负责武将`, list: idle(city), sortKey: 3,
          extraHead: '<th>工期</th>', extra: o => `<td>${D.buildTurns(o, type)}旬</td>`, note: '政治越高，工期越短',
          onOk: ([id]) => done(D.build(city, G.off(id), type), city) && UI.toast(`开始建设${R.FACILITIES[type].name}`),
        });
      }));
    });
  };
  Dlg.recruit = city => Dlg.pickOfficers({
    title: `征兵 · ${city.name}`, list: idle(city), sortKey: 4,
    extraHead: '<th>兵数</th><th>费用</th>', extra: o => { const a = D.recruitAmount(city, o); return `<td>${a}</td><td>${D.recruitCost(a)}</td>`; },
    note: `魅力越高征兵越多；兵营 ${G.facilityCount(city, 'barracks')} 座。征兵会降低治安与平均气力。上限 ${D.troopCap(city)}`,
    onOk: ([id]) => done(D.recruit(city, G.off(id)), city),
  });
  Dlg.train = city => Dlg.pickOfficers({
    title: `训练 · ${city.name}`, list: idle(city), sortKey: 0,
    extraHead: '<th>气力</th>', extra: o => `<td>+${D.trainAmount(o)}</td>`, note: `当前气力 ${city.energy}。统率越高效果越好`,
    onOk: ([id]) => done(D.train(city, G.off(id)), city),
  });
  Dlg.patrol = city => Dlg.pickOfficers({
    title: `巡察 · ${city.name}`, list: idle(city), sortKey: 4,
    extraHead: '<th>治安</th>', extra: o => `<td>+${D.patrolAmount(o)}</td>`, note: `当前治安 ${city.order}。治安影响收入`,
    onOk: ([id]) => done(D.patrol(city, G.off(id)), city),
  });
  Dlg.produce = city => {
    const opts = Object.keys(R.WEAPONS).map(k => {
      const W = R.WEAPONS[k], ok = G.facilityCount(city, W.fac) > 0;
      return `<button data-w="${k}" ${ok ? '' : 'disabled'} title="${ok ? '' : '需要' + R.FACILITIES[W.fac].name}">${W.name}<br><small class="muted">库存 ${U.fmt(city.w[k])}</small></button>`;
    }).join('');
    Dlg.open(`<h2>生产 · ${esc(city.name)}</h2><p class="muted">枪戟弩需锻冶所，马需厩舍，兵器需工房。</p>
      <div class="cmds">${opts}</div><div class="foot"><button data-close>取消</button></div>`, m => {
      m.querySelectorAll('[data-w]').forEach(b => b.addEventListener('click', () => {
        const wk = b.dataset.w; Dlg.close();
        Dlg.pickOfficers({
          title: `生产${R.WEAPONS[wk].name}`, list: idle(city), sortKey: 3,
          extraHead: '<th>产量</th><th>费用</th>', extra: o => { const a = D.produceAmount(city, o, wk); return `<td>${a}</td><td>${D.produceCost(wk, a)}</td>`; },
          onOk: ([id]) => done(D.produce(city, G.off(id), wk), city),
        });
      }));
    });
  };
  Dlg.search = city => Dlg.pickOfficers({
    title: `搜索 · ${city.name}`, list: idle(city), sortKey: 2, note: '智力越高越容易发现在野人才',
    onOk: ([id]) => {
      const o = G.off(id), res = D.search(city, o);
      if (!done(res, city)) return;
      if (res.found) {
        const f = res.found, p = D.employRate(o, f);
        Dlg.confirm('发现人才', `${esc(o.name)} 发现了在野武将 <b>${esc(f.name)}</b>（统${f.s[0]} 武${f.s[1]} 智${f.s[2]} 政${f.s[3]} 魅${f.s[4]}${f.skill ? ' 【' + f.skill + '】' : ''}）。<br>是否当场招揽？（成功率 ${U.pct(p)}）`, () => {
          if (U.chance(p)) {
            f.status = 'active'; f.faction = city.faction; f.city = city.id; f.hidden = false; f.acted = true; f.fixed = false;
            f.loyalty = U.randInt(75, 90);
            G.log(`${f.name} 加入了 ${G.facName(city.faction)}`, 'l-good');
            Dlg.msg('登用成功', `${esc(f.name)}：「愿效犬马之劳！」`);
          } else Dlg.msg('登用失败', `${esc(f.name)} 婉言谢绝。可日后再以「登用」招揽。`);
          UI.refresh();
        }, null, '招揽', '暂且作罢');
      }
    },
  });

  // ---------- 出征 / 运输 ----------
  Dlg.march = (city, transport) => {
    const offs = idle(city).sort((a, b) => (b.s[0] + b.s[1]) - (a.s[0] + a.s[1]));
    if (!offs.length) { UI.toast('没有可出征的武将'); return; }
    if (!Un.exitHexes(city).length) { UI.toast('城外没有可出阵的空地'); return; }
    const st = { chosen: [], type: transport ? 'transport' : null, ship: 'zou' };
    const types = R.TYPE_ORDER.filter(t => transport ? t === 'transport' : t !== 'transport');
    const avail = t => { const wk = R.TYPES[t].weapon; return !wk ? Infinity : R.WEAPONS[wk].siege ? (city.w[wk] > 0 ? Infinity : 0) : city.w[wk]; };
    const rows = offs.map(o => `<tr class="pick" data-oid="${o.id}" title="${esc(UI.offTitle(o))}"><td>${esc(o.name)}</td><td>${o.s[0]}</td><td>${o.s[1]}</td><td>${o.s[2]}</td><td>${o.s[3]}</td><td>${o.s[4]}</td><td>${o.skill ? `<span class="skill">${o.skill}</span>` : '-'}</td><td>${o.apt}</td><td>${U.fmt(Un.maxTroops(o))}</td></tr>`).join('');
    const sl = (id, label, max, val) => `<div class="row"><label>${label}</label><input type="range" id="${id}" min="0" max="${Math.max(0, Math.floor(max))}" step="100" value="${Math.max(0, Math.floor(Math.min(val, max)))}"><span id="${id}-v" style="min-width:60px;text-align:right"></span></div>`;
    Dlg.open(`<h2>${transport ? '运输' : '出征'} · ${esc(city.name)}</h2>
      <p class="muted">${transport ? '选择一名武将率领运输队，将物资送往其他己方都市（进入该城即交付）。' : '点选最多 3 名武将，第一位为主将（决定最大兵力）。部队能力取成员中的最高值，适性取最佳。'}</p>
      <div class="scroll" style="max-height:32vh"><table class="olist">${UI.offHead('<th>适性</th><th>统兵</th>')}${rows}</table></div>
      <div class="row muted" id="m-sel">未选择</div>
      ${transport ? '' : `<div class="row"><label>兵种</label><div class="opts" id="m-types">${types.map(t => `<button data-t="${t}" ${avail(t) < 100 ? 'disabled' : ''}>${R.TYPES[t].name}<br><small class="muted">${avail(t) === Infinity ? '—' : U.fmt(avail(t))}</small></button>`).join('')}</div></div>`}
      <div class="row"><label>舰船</label><div class="opts" id="m-ships">${Object.keys(R.SHIPS).map(k => `<button data-s="${k}" ${k !== 'zou' && !(city.w[k] > 0) ? 'disabled' : ''} title="水上攻${R.SHIPS[k].atk} 防${R.SHIPS[k].def}${R.SHIPS[k].sea < Infinity ? '，可航行近海' : ''}">${R.SHIPS[k].name}<br><small class="muted">${k === 'zou' ? '—' : city.w[k] || 0}</small></button>`).join('')}</div></div>
      ${sl('m-troops', transport ? '护送兵' : '兵力', city.troops, 0)}
      ${sl('m-food', '兵粮', city.food, 0)}
      ${transport ? sl('m-gold', '金', city.gold, 0) + ['spear', 'halberd', 'crossbow', 'horse'].map(k => sl('m-w-' + k, R.WEAPONS[k].name, city.w[k], 0)).join('') : ''}
      <div class="row muted" id="m-info"></div>
      <div class="foot"><button data-close>取消</button><button class="primary" id="m-ok" disabled>${transport ? '出发' : '出征'}</button></div>`, m => {
      const q = s => m.querySelector(s);
      const maxTroops = () => {
        if (!st.chosen.length) return 0;
        if (transport) return city.troops;
        let mx = Math.min(city.troops, Un.maxTroops(G.off(st.chosen[0])));
        if (st.type) mx = Math.min(mx, avail(st.type));
        return mx;
      };
      const upd = (resetTroops) => {
        m.querySelectorAll('tr.pick').forEach(tr => {
          const k = st.chosen.indexOf(+tr.dataset.oid);
          tr.classList.toggle('chosen', k >= 0);
          tr.children[0].textContent = G.off(+tr.dataset.oid).name + (k === 0 ? '（主将）' : k > 0 ? '（副将）' : '');
        });
        q('#m-sel').textContent = st.chosen.length ? '已选：' + st.chosen.map(id => G.off(id).name).join('、') : '未选择';
        if (!transport) m.querySelectorAll('#m-types button').forEach(b => b.classList.toggle('sel', b.dataset.t === st.type));
        m.querySelectorAll('#m-ships button').forEach(b => b.classList.toggle('sel', b.dataset.s === st.ship));
        const tr = q('#m-troops'), mx = maxTroops();
        tr.max = Math.floor(mx / 100) * 100;
        if (resetTroops) tr.value = tr.max;
        const troops = +tr.value;
        const fd = q('#m-food');
        if (resetTroops) fd.value = Math.min(city.food, Math.round(troops * (transport ? 0 : 1) / 100) * 100);
        m.querySelectorAll('input[type=range]').forEach(i => { q('#' + i.id + '-v').textContent = U.fmt(+i.value); });
        let info = '';
        if (!transport && st.chosen.length && st.type) {
          const offsO = st.chosen.map(G.off), ty = R.TYPES[st.type];
          const apt = ty.apt >= 0 ? C.bestApt(offsO, ty.apt) : '-';
          info = `适性 ${apt}　移动 ${ty.mp + (G.hasSkill(offsO, '强行') ? 4 : 0)}　兵粮可支撑约 ${troops ? Math.floor(+fd.value / Math.ceil(troops / 20)) : 0} 旬　初始气力 ${city.energy}`;
        }
        q('#m-info').textContent = info;
        q('#m-ok').disabled = !(st.chosen.length && (transport || st.type) && troops >= 100);
      };
      m.querySelectorAll('tr.pick').forEach(tr => tr.addEventListener('click', () => {
        const id = +tr.dataset.oid, k = st.chosen.indexOf(id);
        if (k >= 0) st.chosen.splice(k, 1);
        else if (st.chosen.length < (transport ? 1 : 3)) st.chosen.push(id);
        else if (transport) st.chosen = [id];
        if (!transport && st.chosen.length && !st.type) {
          const best = ['horse', 'spear', 'halberd', 'bow', 'sword'].filter(t => avail(t) >= 100)
            .sort((a, b) => R.APT_MULT[C.bestApt(st.chosen.map(G.off), R.TYPES[b].apt)] - R.APT_MULT[C.bestApt(st.chosen.map(G.off), R.TYPES[a].apt)])[0];
          st.type = best || 'sword';
        }
        upd(true);
      }));
      if (!transport) m.querySelectorAll('#m-types button').forEach(b => b.addEventListener('click', () => { st.type = b.dataset.t; upd(true); }));
      m.querySelectorAll('#m-ships button').forEach(b => b.addEventListener('click', () => { st.ship = b.dataset.s; upd(false); }));
      m.querySelectorAll('input[type=range]').forEach(i => i.addEventListener('input', () => upd(false)));
      q('#m-ok').addEventListener('click', () => {
        const cfg = { offs: st.chosen, type: st.type, troops: +q('#m-troops').value, food: +q('#m-food').value, ship: st.ship };
        if (transport) {
          cfg.cargo = { gold: +q('#m-gold').value, food: 0, w: {} };
          for (const k of ['spear', 'halberd', 'crossbow', 'horse']) cfg.cargo.w[k] = +q('#m-w-' + k).value;
        }
        if (G.fac(city.faction).ap < R.AP.march) { UI.toast('行动力不足'); return; }
        const res = Un.create(city, cfg);
        if (!res.ok) { UI.toast(res.msg); return; }
        G.fac(city.faction).ap -= R.AP.march;
        Dlg.close();
        G.log(`${res.unit.name}（${R.TYPES[res.unit.type].name} ${res.unit.troops}）自 ${city.name} 出发`, '');
        RD.centerOn(res.unit.c, res.unit.r);
        UI.select({ unit: res.unit.id });
      });
      upd(true);
    });
  };
  Dlg.transport = city => Dlg.march(city, true);

  // ---------- 人事 ----------
  Dlg.employ = city => {
    const pf = city.faction;
    const myCities = new Set(G.citiesOf(pf).map(c => c.id));
    const frees = G.S.officers.filter(o => o.status === 'free' && !o.hidden && myCities.has(o.city));
    const enemies = G.S.officers.filter(o => o.status === 'active' && o.faction >= 0 && o.faction !== pf && !o.fixed && !G.isRuler(o) && o.unit == null);
    const list = [...frees, ...enemies];
    Dlg.pickOfficers({
      title: '登用 · 选择招揽对象', list, sortKey: null,
      extraHead: '<th>所属</th><th>所在</th><th>忠诚</th>',
      extra: o => `<td>${o.status === 'free' ? '<span class="good">在野</span>' : esc(G.facName(o.faction))}</td><td>${esc(G.city(o.city).name)}</td><td>${o.status === 'free' ? '-' : o.loyalty}</td>`,
      note: '可招揽己方领内已发现的在野武将，或挖角他国武将（忠诚越低越容易）。在野武将需先通过「搜索」发现。',
      onOk: ([tid]) => {
        const t = G.off(tid);
        Dlg.pickOfficers({
          title: `登用 ${t.name} · 选择使者`, list: idle(city), sortKey: 4,
          extraHead: '<th>成功率</th>', extra: o => `<td>${U.pct(D.employRate(o, t))}</td>`,
          onOk: ([oid]) => {
            const res = D.employ(city, G.off(oid), t);
            if (!res.ok) { UI.toast(res.msg); return; }
            Dlg.msg(res.success ? '登用成功' : '登用失败', esc(res.msg));
            UI.refresh();
          },
        });
      },
    });
  };
  Dlg.reward = city => Dlg.pickOfficers({
    title: `褒赏 · ${city.name}（每次金 100）`, list: G.officersIn(city.id).filter(o => o.loyalty < 100), sortKey: null,
    extraHead: '<th>忠诚</th>', extra: o => `<td>${o.loyalty}</td>`, note: '忠诚过低的武将可能被他国挖角或出奔。',
    onOk: ([id]) => done(D.reward(city, G.off(id)), city),
  });
  Dlg.summon = city => Dlg.pickOfficers({
    title: `召唤武将至 ${city.name}`, multi: true, max: 20,
    list: G.officersOf(city.faction).filter(o => o.city !== city.id && o.unit == null && !o.acted),
    extraHead: '<th>所在</th>', extra: o => `<td>${esc(G.city(o.city).name)}</td>`,
    note: `每人消耗行动力 ${R.AP.move}。移动后本回合无法再行动。`,
    onOk: ids => {
      let n = 0;
      for (const id of ids) { const r = D.move(city, G.off(id)); if (r.ok) n++; else { UI.toast(r.msg); break; } }
      if (n) { G.log(`${n} 名武将移驻 ${city.name}`, ''); UI.refresh(); }
    },
  });
  Dlg.captives = city => {
    const caps = G.captivesIn(city.id);
    if (!caps.length) { Dlg.close(); UI.refresh(); return; }
    const rec = U.maxBy(G.officersIn(city.id), G.cha) || G.ruler(city.faction);
    Dlg.open(`<h2>处置俘虏 · ${esc(city.name)}</h2><p class="muted">登用成功率以城中魅力最高者（${esc(rec.name)}）计算</p>
      <table class="olist">${UI.offHead('<th>原属</th><th>成功率</th><th></th>')}
      ${caps.map(o => `<tr title="${esc(UI.offTitle(o))}"><td>${esc(o.name)}</td><td>${o.s[0]}</td><td>${o.s[1]}</td><td>${o.s[2]}</td><td>${o.s[3]}</td><td>${o.s[4]}</td><td>${o.skill || '-'}</td>
        <td>${esc(G.facName(o.faction))}</td><td>${U.pct(D.employRate(rec, o))}</td>
        <td style="white-space:nowrap"><button data-c="employ" data-o="${o.id}">登用</button><button data-c="release" data-o="${o.id}">释放</button><button data-c="execute" data-o="${o.id}">处斩</button></td></tr>`).join('')}
      </table><div class="foot"><button data-close>关闭</button></div>`, m => {
      m.querySelectorAll('[data-c]').forEach(b => b.addEventListener('click', () => {
        const res = D.captive(city, G.off(+b.dataset.o), b.dataset.c);
        if (res.msg) UI.toast(res.msg);
        Dlg.captives(city);
        UI.refresh();
      }));
    });
  };
})(window.SG);
