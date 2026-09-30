// 对话框（二）：标题、势力选择、一览、外交、系统、单挑、结局
(function (SG) {
  const U = SG.U, R = SG.R, G = SG.G, D = SG.Dom, RD = SG.Render, UI = SG.UI, Dlg = SG.Dlg, Dp = SG.Dip;
  const esc = U.esc;

  // ---------- 标题 ----------
  Dlg.title = () => {
    const auto = G.saveMeta('auto');
    Dlg.open(`<div class="title-screen">
      <h1>三国志</h1><div class="muted" style="letter-spacing:4px">— 群雄割据 · 一九四年 —</div>
      <p style="max-width:520px;margin:14px auto;line-height:1.8">${esc(SG.DATA.scenario.intro)}</p>
      <div style="display:flex;flex-direction:column;gap:8px;align-items:center;margin-top:12px">
        <button class="primary" id="t-new" style="width:220px;padding:8px">新的征程</button>
        <button id="t-cont" style="width:220px;padding:8px" ${auto ? '' : 'disabled'}>继续游戏${auto ? `<br><small class="muted">${esc(auto.fac)} ${esc(auto.date)}</small>` : ''}</button>
        <button id="t-load" style="width:220px;padding:8px">读取存档</button>
        <button id="t-help" style="width:220px;padding:8px">游戏说明</button>
        <a class="btn" href="editor.html" style="width:220px;padding:8px;box-sizing:border-box">武将头像编辑</a>
      </div></div>`, m => {
      m.querySelector('#t-new').addEventListener('click', Dlg.factionSelect);
      m.querySelector('#t-cont').addEventListener('click', () => { if (G.load('auto')) { Dlg.close(); SG.Main.start(); } });
      m.querySelector('#t-load').addEventListener('click', () => Dlg.system(true));
      m.querySelector('#t-help').addEventListener('click', () => Dlg.help(Dlg.title));
    });
  };

  Dlg.factionSelect = () => {
    const sc = SG.DATA.scenario, raw = G.parseOfficers();
    const cards = sc.factions.map(f => {
      const offs = raw.filter(o => o.rulerName === f.ruler);
      const r = offs.find(o => o.name === f.ruler);
      const cities = f.cities.filter(n => SG.DATA.cities.some(c => c.name === n)).length;
      const diff = cities >= 4 ? '易' : cities >= 2 ? '中' : '难';
      return `<div class="faction-card" data-r="${esc(f.ruler)}" style="border-left:6px solid ${f.color}">
        <div class="fn">${esc(f.ruler)}</div>
        <div class="muted">都市 ${cities}　武将 ${offs.length}　难度 <b>${diff}</b></div>
        <div class="muted">统${r.s[0]} 武${r.s[1]} 智${r.s[2]} 政${r.s[3]} 魅${r.s[4]}</div>
        <div class="muted" style="font-size:11px">${esc(f.cities.join('·'))}</div></div>`;
    }).join('');
    Dlg.open(`<h2>选择君主</h2><div class="faction-grid">${cards}</div><div class="foot"><button id="fs-back">返回</button></div>`, m => {
      m.querySelector('#fs-back').addEventListener('click', Dlg.title);
      m.querySelectorAll('.faction-card').forEach(c => c.addEventListener('click', () => {
        G.newGame(c.dataset.r);
        Dlg.close();
        SG.Main.start();
        Dlg.msg(`${c.dataset.r} 之志`, `${esc(SG.DATA.scenario.intro)}<br><br>目标：<b>统一全部 42 座都市</b>。<br>
          提示：点击己方都市执行内政与出征；选中部队后点击蓝色格移动，再选择攻击 / 战法 / 计略。每旬结束后，各势力依次行动。`);
      }));
    });
  };

  Dlg.help = back => {
    Dlg.open(`<h2>游戏说明</h2><div style="line-height:1.8;max-width:680px">
      <b>基本</b>：每回合为一旬（上/中/下旬），每月初收金，每季首月收兵粮（七月秋收加倍）。内政、出征等都市指令需消耗<b>行动力</b>，每旬按都市数回复。<br>
      <b>都市</b>：在周围地块上建设设施——市场（金）、农田（粮）、兵营（征兵）、锻冶所（枪戟弩）、厩舍（马）、工房（冲车/井阑/投石）。<br>
      <b>武将</b>：统率（防御、统兵上限）、武力（攻击、单挑）、智力（计略）、政治（建设、生产）、魅力（征兵、登用）。每位武将对各兵种有 S/A/B/C 适性，并可能身怀特技。<br>
      <b>出征</b>：最多 3 名武将组成一队，需消耗对应兵装。部队在大地图上直接行军作战：移动后可普通攻击、发动战法（消耗气力）或施展计略。<br>
      <b>兵种相克</b>：枪克骑、骑克戟弩、戟克枪。弩兵、井阑、投石可远程攻击。冲车专攻城池。进入河川时部队变为舟船，依赖水军适性。<br>
      <b>战法</b>：暴击时伤害提升，并可能触发武将单挑。螺旋突/突击可击退敌军，横扫/旋风波及多队，乱射/投石溅射，火矢纵火。<br>
      <b>计略</b>：火计（烧伤）、扰乱（混乱）、伪报（行动不能并损气力）、镇静（解除异常）。成功率取决于智力差，洞察/深谋者免疫。<br>
      <b>攻城</b>：兵力降至 0 即攻陷，城中武将或逃或被俘。耐久归零后守军损伤加倍。都市会在每旬结束时射击相邻敌军。<br>
      <b>港口与水军</b>：沿江、沿海设有港口，可驻军、可攻占。建「造船厂」生产斗舰、楼船，出征时配备舰船；部队进入河川、水渠、洪水区即以舰船作战（依水军适性），并改用冲突/乱射/火船等水军战法。斗舰、楼船可航行近海。水上火攻会在相邻战船间蔓延，东南风起时威力倍增。<br>
      <b>工事（特色）</b>：部队可在相邻格「开沟」——壕沟阻滞敌军、兵器无法通行，连通河流即灌满成为水渠，可把水引向敌城；「陷坑」隐蔽设伏，敌军踏入即受损停步；「筑堤」截流蓄水，水位逐旬上涨、雨季加倍（满水时有溃堤之险）；「决堤」放水，洪水沿河道与水渠泛滥，淹没低地部队、冲毁城墙——水淹七军、引水灌城；「填沟」可拆除壕沟。悬停堤坝可预览淹没范围。<br>
      <b>官职与爵位</b>：君主按都市数晋位（太守→刺史→州牧→公→王→皇帝），决定可授予的最高官职并增加行动力。武将官职决定统兵上限与能力加成，需积累功绩。<br>
      <b>历史事件</b>：迎奉天子、袁术称帝、千里走单骑、孙策遇刺、袁绍病逝、三顾茅庐、刘表病逝、东南风起、张松献图等按史实触发；另有蝗灾、疫病、丰收、山贼、商队、名士来访等随机事件。<br>
      <b>托管</b>：「内政托管」由部下打理种田、征兵、生产、人事，主公专心出征；「全托管」连军事也交给 AI。单城亦可「委任」。<br>
      <b>界面</b>：拖动/方向键平移，滚轮缩放，E 结束回合，N 切换待命部队，Esc/右键 取消。</div>
      <div class="foot"><button class="primary" id="h-ok">明白</button></div>`, m => {
      m.querySelector('#h-ok').addEventListener('click', () => { if (back) back(); else Dlg.close(); });
    });
  };

  // ---------- 一览 ----------
  Dlg.officerList = () => {
    const pf = G.S.player;
    const list = G.S.officers.filter(o => o.faction === pf && (o.status === 'active' || o.status === 'captive'));
    let key = 0;
    const render = () => {
      const sorted = list.slice().sort((a, b) => key < 5 ? b.s[key] - a.s[key] : key === 5 ? a.loyalty - b.loyalty : a.city - b.city);
      return `<h2>武将一览（${list.length}）</h2>
        <div class="opts">${['统率', '武力', '智力', '政治', '魅力', '忠诚', '所在'].map((n, k) => `<button data-k="${k}" class="${k === key ? 'sel' : ''}">${n}</button>`).join('')}</div>
        <div class="scroll" style="margin-top:6px"><table class="olist">${UI.offHead('<th>适性</th><th>官职</th><th>功绩</th><th>忠诚</th><th>所在</th><th>状态</th>')}
        ${sorted.map(o => UI.offRow(o, `<td>${o.apt}</td><td>${G.rank(o) ? G.rank(o).name : G.isRuler(o) ? '君主' : '-'}</td><td>${o.merit || 0}</td><td>${o.loyalty}</td><td>${esc(G.city(o.city).name)}</td><td>${o.status === 'captive' ? '<span class="warn">被俘</span>' : o.unit != null ? '出征' : o.acted ? '已行动' : '待命'}</td>`)).join('')}
        </table></div><div class="foot"><button data-close>关闭</button></div>`;
    };
    const bind = m => m.querySelectorAll('[data-k]').forEach(b => b.addEventListener('click', () => { key = +b.dataset.k; Dlg.open(render(), bind); }));
    Dlg.open(render(), bind);
  };

  Dlg.cityList = () => {
    const rows = G.S.cities.filter(c => c.kind === 'city' || c.faction >= 0).map(c => `<tr class="pick" data-c="${c.id}">
      <td>${esc(c.name)}</td><td style="text-align:left">${UI.facChip(c.faction)}</td><td>${U.fmt(c.troops)}</td><td>${G.isPlayer(c.faction) ? U.fmt(c.gold) : '?'}</td>
      <td>${G.isPlayer(c.faction) ? U.fmt(c.food) : '?'}</td><td>${G.officersIn(c.id).length}</td><td>${c.dur}</td></tr>`).join('');
    Dlg.open(`<h2>都市一览</h2><div class="scroll"><table class="olist"><tr><th>都市</th><th>势力</th><th>兵力</th><th>金</th><th>兵粮</th><th>武将</th><th>耐久</th></tr>${rows}</table></div>
      <div class="foot"><button data-close>关闭</button></div>`, m => {
      m.querySelectorAll('[data-c]').forEach(tr => tr.addEventListener('click', () => {
        const c = G.city(+tr.dataset.c); Dlg.close(); RD.centerOn(c.c, c.r); UI.select({ city: c.id });
      }));
    });
  };

  Dlg.factionList = () => {
    const pf = G.S.player;
    const rows = G.S.factions.filter(f => f.alive).map(f => `<tr>
      <td style="text-align:left">${UI.facChip(f.id)}</td><td>${esc(G.off(f.ruler).name)}</td><td>${G.realCitiesOf(f.id).length}</td>
      <td>${G.officersOf(f.id).length}</td><td>${U.fmt(G.totalTroops(f.id))}</td>
      <td>${f.id === pf ? '-' : G.rel(pf, f.id)}</td><td>${f.id === pf ? '' : G.allied(pf, f.id) ? '<span class="good">同盟</span>' : G.truce(pf, f.id) ? '停战' : ''}</td></tr>`).join('');
    Dlg.open(`<h2>势力一览</h2><div class="scroll"><table class="olist"><tr><th>势力</th><th>君主</th><th>都市</th><th>武将</th><th>兵力</th><th>友好</th><th>关系</th></tr>${rows}</table></div>
      <div class="foot"><button data-close>关闭</button></div>`);
  };

  // ---------- 外交 ----------
  Dlg.diplomacy = () => {
    const pf = G.S.player, f = G.fac(pf);
    const others = G.S.factions.filter(x => x.alive && x.id !== pf);
    Dlg.open(`<h2>外交</h2><p class="muted">行动力 ${f.ap}（每次 ${R.AP.diplomacy}）　总金 ${U.fmt(Dp.totalGold(pf))}</p>
      <div class="scroll"><table class="olist"><tr><th>势力</th><th>都市</th><th>兵力</th><th>友好</th><th>关系</th><th></th></tr>
      ${others.map(x => `<tr><td style="text-align:left">${UI.facChip(x.id)}</td><td>${G.realCitiesOf(x.id).length}</td><td>${U.fmt(G.totalTroops(x.id))}</td><td>${G.rel(pf, x.id)}</td>
        <td>${G.allied(pf, x.id) ? '<span class="good">同盟</span>' : G.truce(pf, x.id) ? '停战' : '-'}</td><td><button data-f="${x.id}">交涉</button></td></tr>`).join('')}
      </table></div><div class="foot"><button data-close>关闭</button></div>`, m => {
      m.querySelectorAll('[data-f]').forEach(b => b.addEventListener('click', () => Dlg.dipAction(+b.dataset.f)));
    });
  };
  Dlg.dipAction = tgt => {
    const pf = G.S.player;
    const envoys = G.officersOf(pf).filter(o => !o.acted && o.unit == null);
    const acts = [
      ['goodwill', '亲善', '赠金以提升友好度'], ['alliance', '同盟', '结为一年同盟，互不攻击'],
      ['truce', '停战', '半年内互不攻击'], ['surrender', '劝降', '国力远胜对方时可尝试'],
    ];
    Dlg.open(`<h2>对 ${esc(G.facName(tgt))} 交涉</h2><p class="muted">友好度 ${G.rel(pf, tgt)}。成功率取决于友好度、国力对比与使者的智力、政治（论客特技有加成）。</p>
      <div class="cmds">${acts.map(([k, n, d]) => `<button data-a="${k}" title="${d}" ${(k === 'alliance' && G.allied(pf, tgt)) || (k === 'truce' && G.truce(pf, tgt)) ? 'disabled' : ''}>${n}</button>`).join('')}</div>
      <div class="row"><label>赠金</label><select id="d-gold"><option>500</option><option selected>1000</option><option>2000</option><option>3000</option></select></div>
      <div class="foot"><button id="d-back">返回</button></div>`, m => {
      m.querySelector('#d-back').addEventListener('click', Dlg.diplomacy);
      m.querySelectorAll('[data-a]').forEach(b => b.addEventListener('click', () => {
        const a = b.dataset.a, gold = +m.querySelector('#d-gold').value;
        Dlg.pickOfficers({
          title: `派遣使者（${b.textContent}）`, list: envoys, sortKey: 2,
          extraHead: '<th>所在</th><th>成功率</th>',
          extra: o => `<td>${esc(G.city(o.city).name)}</td><td>${a === 'goodwill' ? '-' : U.pct(Dp.rates(pf, o, tgt)[a])}</td>`,
          onOk: ([id]) => {
            const o = G.off(id);
            const res = a === 'goodwill' ? Dp.goodwill(pf, o, tgt, gold) : Dp[a](pf, o, tgt);
            if (!res.ok) { UI.toast(res.msg); return; }
            G.log(res.msg, 'l-war');
            Dlg.msg('外交结果', esc(res.msg));
            UI.refresh();
          },
        });
      }));
    });
  };
  Dlg.proposals = () => {
    const S = G.S;
    S.proposals = S.proposals || [];
    const p = S.proposals.shift();
    if (!p) return Dlg.events();
    if (!G.fac(p.from).alive) return Dlg.proposals();
    const name = G.facName(p.from);
    Dlg.confirm('使者来访', `${esc(name)} 遣使前来，请求与我方${p.kind === 'alliance' ? '<b>缔结同盟</b>（一年）' : '<b>停战</b>（半年）'}。是否应允？`, () => {
      const k = G.relKey(S.player, p.from);
      if (p.kind === 'alliance') S.ally[k] = S.turn + 36; else S.truce[k] = S.turn + 18;
      G.addRel(S.player, p.from, 10);
      G.log(`与 ${name} ${p.kind === 'alliance' ? '结盟' : '停战'}`, 'l-good');
      UI.refresh(); Dlg.proposals();
    }, () => { G.addRel(S.player, p.from, -5); Dlg.proposals(); });
  };

  // ---------- 历史事件 ----------
  Dlg.events = () => {
    const q = G.S.eventQueue || (G.S.eventQueue = []);
    const e = q.shift();
    if (!e) return;
    const ppl = (e.people || []).filter(Boolean).slice(0, 3);
    Dlg.open(`<h2>【${esc(e.title)}】</h2>${ppl.length ? `<div class="evt-pts">${ppl.map(n => `<figure><img src="${SG.Portraits.src(n)}" alt=""><figcaption>${esc(n)}</figcaption></figure>`).join('')}</div>` : ''}<div class="evt">${e.text}</div>
      <div class="foot"><button class="primary" id="ev-ok">知道了</button></div>`, m => {
      m.querySelector('#ev-ok').addEventListener('click', () => { Dlg.close(); Dlg.events(); });
    });
  };

  // ---------- 托管 ----------
  Dlg.autoMode = () => {
    const cur = G.S.auto || 'manual';
    Dlg.open(`<h2>托管设置</h2><p class="muted">托管在每旬结束时执行，会为出征保留约 30 行动力。无论何种模式，主公仍可随时亲自下达任何指令。</p>
      <div style="display:flex;flex-direction:column;gap:6px;max-width:560px">
      ${Object.entries(R.AUTO_MODES).map(([k, m]) => `<div class="faction-card ${k === cur ? 'cur' : ''}" data-m="${k}" style="border-left:6px solid ${k === cur ? 'var(--gold)' : 'var(--line)'}">
        <div class="fn">${m.name}${k === cur ? '　<small class="good">（当前）</small>' : ''}</div><div class="muted">${m.desc}</div></div>`).join('')}
      </div><p class="muted">单个都市也可在都市面板中「委任」，效果与内政托管相同但仅限该城。</p>
      <div class="foot"><button data-close>关闭</button></div>`, m => {
      m.querySelectorAll('[data-m]').forEach(c => c.addEventListener('click', () => {
        G.S.auto = c.dataset.m;
        Dlg.close();
        UI.toast('已切换为「' + R.AUTO_MODES[G.S.auto].name + '」');
        G.log('托管模式：' + R.AUTO_MODES[G.S.auto].name, 'l-dim');
        UI.refresh();
      }));
    });
  };

  // ---------- 官职 ----------
  Dlg.ranks = () => {
    const pf = G.S.player, f = G.fac(pf), t = G.title(pf), RK = SG.Ranks;
    const next = R.TITLES[(f.title || 0) + 1];
    const n = G.realCitiesOf(pf).length;
    const rows = R.RANKS.map(r => {
      const hs = RK.holders(pf, r.id), locked = r.grade < t.maxGrade;
      const bonus = r.bonus.map((v, k) => v ? '统武智政魅'[k] + '+' + v : '').filter(Boolean).join(' ');
      return `<tr style="${locked ? 'opacity:.45' : ''}"><td>${r.name}${r.civ ? '<small class="muted">（文）</small>' : ''}</td><td>${R.GRADE_NAME[r.grade]}</td>
        <td>${U.fmt(R.GRADE_CAP[r.grade])}</td><td>${bonus}${r.desc ? '<br><small class="muted">' + r.desc + '</small>' : ''}</td><td>${R.GRADE_MERIT[r.grade]}</td>
        <td style="text-align:left">${hs.map(o => `${esc(o.name)}<button data-dis="${o.id}" title="罢免（忠诚 -10）" style="padding:0 4px;margin-left:2px">✕</button>`).join(' ') || '<span class="muted">空缺</span>'}${r.slots > 1 ? `<small class="muted">（${hs.length}/${r.slots}）</small>` : ''}</td>
        <td>${!locked && hs.length < r.slots ? `<button data-app="${r.id}">任命</button>` : ''}</td></tr>`;
    }).join('');
    Dlg.open(`<h2>官职 · 爵位</h2>
      <p>${esc(G.ruler(pf).name)}　爵位：<b class="skill">${t.name}</b>　可授予 <b>${R.GRADE_NAME[t.maxGrade]}</b> 及以下官职　每旬行动力 +${RK.apBonus(pf)}<br>
      <span class="muted">${next ? `下一爵位「${next.name}」：需都市 ${next.need} 座（现有 ${n} 座）` : '已登峰造极'}。官职决定统兵上限与能力加成，需积累功绩（内政、作战、工事皆可获得）。任命可提升忠诚。</span></p>
      <div class="scroll"><table class="olist"><tr><th>官职</th><th>品级</th><th>统兵</th><th>加成</th><th>需功绩</th><th>在任</th><th></th></tr>${rows}</table></div>
      <div class="foot"><button id="rk-auto">自动任命</button><button data-close>关闭</button></div>`, m => {
      m.querySelector('#rk-auto').addEventListener('click', () => {
        const log = RK.autoAssign(pf, true);
        UI.toast(log.length ? `任命 ${log.length} 人` : '没有可调整的官职');
        if (log.length) G.log('官职任命：' + log.join('、'), 'l-good');
        Dlg.ranks(); UI.refresh();
      });
      m.querySelectorAll('[data-dis]').forEach(b => b.addEventListener('click', () => {
        const r = RK.dismiss(G.off(+b.dataset.dis)); UI.toast(r.msg); Dlg.ranks(); UI.refresh();
      }));
      m.querySelectorAll('[data-app]').forEach(b => b.addEventListener('click', () => {
        const rid = b.dataset.app, r = R.RANK[rid];
        const list = G.officersOf(pf).filter(o => !G.isRuler(o) && o.rank !== rid);
        Dlg.pickOfficers({
          title: `任命${r.name}（${R.GRADE_NAME[r.grade]}）`, list, sortKey: null,
          extraHead: '<th>功绩</th><th>现职</th><th>可否</th>',
          extra: o => { const e = RK.eligible(pf, o, rid); return `<td>${o.merit || 0}</td><td>${G.rank(o) ? G.rank(o).name : '-'}</td><td>${e ? `<span class="warn" title="${esc(e)}">×</span>` : '<span class="good">○</span>'}</td>`; },
          note: `需功绩 ${R.GRADE_MERIT[r.grade]}。${r.civ ? '文官按智力、政治加成。' : '武官提高统兵上限及统率、武力。'}`,
          onOk: ([id]) => { const res = RK.appoint(pf, G.off(id), rid); UI.toast(res.msg); if (res.ok) G.log(res.msg, 'l-good'); Dlg.ranks(); UI.refresh(); },
        });
      }));
    });
  };

  // ---------- 系统 ----------
  Dlg.system = fromTitle => {
    const slot = k => {
      const m = G.saveMeta(k);
      return `<tr><td>${k === 'auto' ? '自动' : '存档 ' + k}</td><td style="text-align:left">${m ? esc(m.fac) + ' ' + esc(m.date) + '<br><small class="muted">' + esc(m.at) + '</small>' : '<span class="muted">空</span>'}</td>
        <td>${!fromTitle && k !== 'auto' ? `<button data-save="${k}">保存</button>` : ''}${m ? `<button data-load="${k}">读取</button>` : ''}</td></tr>`;
    };
    const pf = SG.Cutin.prefs;
    const prefs = fromTitle ? '' : `<h3>显示设置</h3>
      <div class="row"><label>武将立绘</label><select id="p-cutin">
        <option value="all" ${pf.cutin === 'all' ? 'selected' : ''}>战法、计略时都显示</option>
        <option value="crit" ${pf.cutin === 'crit' ? 'selected' : ''}>仅会心一击与决堤</option>
        <option value="off" ${pf.cutin === 'off' ? 'selected' : ''}>关闭</option></select></div>
      <div class="row"><label>军师建言</label><label style="min-width:0;color:var(--text)"><input type="checkbox" id="p-adv" ${pf.advisor ? 'checked' : ''}> 每回合开始自动献策</label></div>`;
    Dlg.open(`<h2>${fromTitle ? '读取存档' : '系统'}</h2><table class="olist">${['auto', 1, 2, 3].map(slot).join('')}</table>${prefs}
      <div class="foot">${fromTitle ? '<button id="s-back">返回</button>' : '<a class="btn" href="editor.html" target="_blank" title="在新标签页打开，保存后游戏内自动更新">头像编辑</a><button id="s-help">说明</button><button id="s-title">返回标题</button><button data-close>关闭</button>'}</div>`, m => {
      m.querySelectorAll('[data-save]').forEach(b => b.addEventListener('click', () => {
        UI.toast(G.save(b.dataset.save) ? '已保存' : '保存失败'); Dlg.system(fromTitle);
      }));
      m.querySelectorAll('[data-load]').forEach(b => b.addEventListener('click', () => {
        if (G.load(b.dataset.load)) { Dlg.close(); SG.Main.start(); UI.toast('读取完成'); } else UI.toast('读取失败');
      }));
      const bk = m.querySelector('#s-back'); if (bk) bk.addEventListener('click', Dlg.title);
      const pc = m.querySelector('#p-cutin'); if (pc) pc.addEventListener('change', e => { SG.Cutin.prefs.cutin = e.target.value; SG.Cutin.savePrefs(); });
      const pa = m.querySelector('#p-adv'); if (pa) pa.addEventListener('change', e => { SG.Cutin.prefs.advisor = e.target.checked; SG.Cutin.savePrefs(); });
      const hp = m.querySelector('#s-help'); if (hp) hp.addEventListener('click', () => Dlg.help());
      const tt = m.querySelector('#s-title'); if (tt) tt.addEventListener('click', () => Dlg.confirm('返回标题', '未保存的进度将会丢失（自动存档保留至上一回合）。', Dlg.title, Dlg.system, '确定', '取消'));
    });
  };

  // ---------- 单挑 / 结局 ----------
  Dlg.duel = res => {
    const P = SG.Portraits;
    const pic = n => `<figure><img src="${P.src(n)}" alt=""><figcaption>${esc(n)}</figcaption></figure>`;
    const show = () => Dlg.open(`<h2>⚔ 单挑</h2>${res.a ? `<div class="duel-pts">${pic(res.a)}<b style="font-size:22px;color:var(--gold)">VS</b>${pic(res.b)}</div>` : ''}<div class="duel" id="duel-box"></div><div class="foot"><button class="primary" data-close>确定</button></div>`, m => {
      const box = m.querySelector('#duel-box');
      res.lines.forEach((l, k) => setTimeout(() => { box.textContent += l + '\n'; box.scrollTop = box.scrollHeight; }, k * 220));
    });
    if (document.getElementById('modal-bg').classList.contains('hidden')) show();
    else Dlg.onClose = show;
  };
  Dlg.gameOver = o => {
    const pf = G.S.player;
    Dlg.open(`<div class="title-screen"><h1>${o === 'win' ? '天下一统' : '功败垂成'}</h1>
      <p>${o === 'win' ? `${esc(G.facName(pf))} 于 ${esc(G.dateStr())} 平定天下，开创新的时代！` : '我军势力已然覆灭……大业未竟，留待后人。'}</p>
      <div class="foot" style="justify-content:center"><button class="primary" id="go-new">重新开始</button><button data-close>继续观看</button></div></div>`, m => {
      m.querySelector('#go-new').addEventListener('click', () => { UI.overShown = false; Dlg.factionSelect(); });
    });
  };
})(window.SG);
