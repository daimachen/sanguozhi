// 武将立绘演出：战法 / 计略切入、内政汇报、台词；以及显示偏好
(function (SG) {
  const U = SG.U, G = SG.G;
  const CI = SG.Cutin = {};
  const esc = U.esc;

  // ---------- 偏好（本机） ----------
  CI.prefs = { cutin: 'all', advisor: true, grid: false };
  try { Object.assign(CI.prefs, JSON.parse(localStorage.getItem('sgz11_prefs') || '{}')); } catch (e) { /* 忽略 */ }
  CI.savePrefs = () => { try { localStorage.setItem('sgz11_prefs', JSON.stringify(CI.prefs)); } catch (e) { /* 忽略 */ } };

  // ---------- 台词 ----------
  const LINES = {
    '关羽': ['关云长在此，鼠辈受死！', '看我青龙偃月刀！'],
    '张飞': ['燕人张翼德在此！', '谁敢与我决一死战！'],
    '赵云': ['常山赵子龙来也！', '吾乃常山赵子龙！'],
    '吕布': ['人中吕布，马中赤兔！', '尔等皆是土鸡瓦狗！'],
    '曹操': ['宁教我负天下人！', '吾之霸道，无人可挡！'],
    '刘备': ['兴复汉室，在此一举！', '仁义之师，所向披靡！'],
    '孙策': ['江东小霸王在此！'],
    '孙权': ['江东基业，岂容尔等染指！'],
    '周瑜': ['火攻之计，正合吾意！', '樯橹灰飞烟灭！'],
    '诸葛亮': ['一切皆在亮的算计之中。', '天时地利，尽在我手。'],
    '司马懿': ['兵者，诡道也。'],
    '郭嘉': ['此计一出，敌必自乱。'],
    '马超': ['西凉锦马超在此！'],
    '黄忠': ['老夫尚能开硬弓！'],
    '典韦': ['恶来典韦在此，休想近主公一步！'],
    '许褚': ['虎痴许褚来也！'],
    '张辽': ['辽来辽来！张文远在此！'],
    '夏侯惇': ['父精母血，不可弃也！'],
    '甘宁': ['锦帆甘兴霸在此！'],
    '太史慈': ['大丈夫当带三尺剑，立不世之功！'],
    '魏延': ['谁敢杀我！'],
    '庞德': ['抬榇决战，有死无生！'],
    '陆逊': ['火烧连营，就在今日！'],
    '姜维': ['继丞相遗志，北伐中原！'],
    '袁绍': ['四世三公，岂惧尔等！'],
    '孟获': ['南中大王在此！'],
  };
  const GENERIC = {
    tactic: ['看我的厉害！', '冲啊，随我杀敌！', '此战必胜！', '休走！', '全军突击！'],
    crit: ['就是现在！', '破绽百出！', '一击必杀！'],
    scheme: ['中计了吧！', '一切尽在掌握。', '敌军已入彀中。'],
    fire: ['烧尽敌军！', '火攻之计，成矣！'],
    flood: ['水淹七军，就在今日！', '开堤放水！'],
    dom: ['交给在下吧。', '遵命！', '幸不辱命。', '此事易耳。'],
  };
  CI.line = (name, kind) => (LINES[name] && kind !== 'dom' && Math.random() < 0.7 ? U.pick(LINES[name]) : U.pick(GENERIC[kind] || GENERIC.tactic));

  // ---------- 切入演出（排队播放，最多积压 3 个） ----------
  const queue = [];
  let playing = false;
  const area = () => document.getElementById('cutin-area');
  CI.show = opt => {
    if (!area() || CI.prefs.cutin === 'off') return;
    if (CI.prefs.cutin === 'crit' && !opt.big) return;
    if (queue.length >= 3) return;
    queue.push(opt);
    if (!playing) next();
  };
  const next = () => {
    const opt = queue.shift();
    if (!opt) { playing = false; return; }
    playing = true;
    const d = document.createElement('div');
    d.className = 'cutin' + (opt.big ? ' big' : '') + (opt.foe ? ' foe' : '');
    d.style.setProperty('--c', opt.color || '#e0b44c');
    d.innerHTML = `<img src="${SG.Portraits.src(opt.name)}" alt="">
      <div class="ci-band"><div class="ci-title">${esc(opt.title)}</div>
      <div class="ci-name">${esc(opt.name)}</div><div class="ci-line">「${esc(opt.line)}」</div></div>`;
    area().appendChild(d);
    const dur = opt.big ? 1700 : 1150;
    setTimeout(() => { d.classList.add('out'); }, dur - 280);
    setTimeout(() => { d.remove(); next(); }, dur);
  };

  // 我方参与才演出；敌方只在对我方暴击时演出
  const leader = u => G.off(u.offs[0]);
  CI.tactic = (u, tactic, crit, tgt) => {
    const mine = G.isPlayer(u.faction);
    const vsMe = tgt && ((tgt.unit && G.isPlayer(tgt.unit.faction)) || (tgt.city && G.isPlayer(tgt.city.faction)));
    if (!mine && !(vsMe && crit)) return;
    const o = leader(u);
    CI.show({
      name: o.name, big: crit, foe: !mine, color: G.facColor(u.faction),
      title: tactic.name + (crit ? '·会心一击！' : ''), line: CI.line(o.name, crit ? 'crit' : 'tactic'),
    });
  };
  CI.scheme = (u, sch, tu) => {
    const mine = G.isPlayer(u.faction);
    if (!mine && !(tu && G.isPlayer(tu.faction))) return;
    const o = U.maxBy(u.offs.map(G.off), x => x.s[2]);
    CI.show({ name: o.name, foe: !mine, color: G.facColor(u.faction), title: sch.name + '·成功', line: CI.line(o.name, sch.id === 'fire' ? 'fire' : 'scheme') });
  };
  CI.flood = (u, epic) => {
    if (!u) return;
    const o = leader(u);
    CI.show({ name: o.name, big: true, foe: !G.isPlayer(u.faction), color: '#4fc3f7', title: epic ? '决堤·水淹七军！' : '决堤放水', line: CI.line(o.name, 'flood') });
  };

  // ---------- 内政汇报：带头像的提示 ----------
  CI.report = (name, msg) => {
    const box = document.getElementById('toast-area');
    if (!box) return;
    const d = document.createElement('div');
    d.className = 'toast rep';
    d.innerHTML = `<img src="${SG.Portraits.src(name)}" alt=""><div><b>${esc(name)}</b>「${esc(CI.line(name, 'dom'))}」<br>${esc(msg)}</div>`;
    box.appendChild(d);
    setTimeout(() => d.remove(), 2900);
  };
})(window.SG);
