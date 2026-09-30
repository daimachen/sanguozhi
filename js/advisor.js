// 军师建言：每旬开始由军师（或智力最高者）分析局势并献策
(function (SG) {
  const U = SG.U, R = SG.R, H = SG.Hex, G = SG.G, D = SG.Dom;
  const AD = SG.Advisor = {};
  const esc = U.esc;

  // 谁来献策：军师 > 智力最高的非君主 > 君主
  AD.who = fid => {
    const js = SG.Ranks.holders(fid, 'js')[0];
    if (js) return { o: js, title: '军师' };
    const offs = G.officersOf(fid).filter(o => !G.isRuler(o));
    const o = offs.length ? U.maxBy(offs, x => x.s[2]) : G.ruler(fid);
    return { o, title: '谋士' };
  };

  // 分析：返回 [{pri, text, go, kind}]，kind: war / dom / hr
  AD.analyze = fid => {
    const S = G.S, out = [];
    const add = (pri, kind, text, go) => out.push({ pri, kind, text, go });
    const cities = G.citiesOf(fid), real = G.realCitiesOf(fid);
    const foes = Object.values(S.units).filter(u => G.hostile(fid, u.faction) && u.type !== 'transport');
    for (const c of cities) {
      const near = foes.filter(u => H.dist(u.c, u.r, c.c, c.r) <= 6);
      if (near.length) {
        const t = U.sum(near, u => u.troops);
        add(95 + near.length, 'war', `敌军 ${near.length} 队（约 ${U.fmt(t)} 兵）逼近${c.name}，守军 ${U.fmt(c.troops)}，宜早做防备！`, { city: c.id });
      }
    }
    for (const c of real) {
      const up = D.upkeep(c);
      const turns = up > 0 ? Math.floor(c.food / up) : 99;
      if (turns < 12) add(88, 'dom', `${c.name}兵粮仅够 ${turns} 旬，宜建农田或从他城输送兵粮。`, { city: c.id });
      if (c.order < 50) add(60, 'dom', `${c.name}治安低落（${c.order}），宜派人巡察。`, { city: c.id });
      const free = SG.map.places[c.id].plots.length - c.facs.length;
      if (c.gold >= 1500 && free > 0 && !c.facs.some(f => !f.done)) add(40, 'dom', `${c.name}府库有金 ${U.fmt(c.gold)}，尚有 ${free} 块空地，可开发设施。`, { city: c.id });
      if (SG.AI.isFront(c) && c.troops < D.troopCap(c) * 0.3) add(70, 'dom', `${c.name}地处前线，兵力仅 ${U.fmt(c.troops)}，宜征兵充实。`, { city: c.id });
      if (c.energy < 60 && c.troops > 5000) add(30, 'dom', `${c.name}士气不振（气力 ${c.energy}），宜加紧训练。`, { city: c.id });
      const frees = G.freeIn(c.id).filter(o => !o.hidden);
      if (frees.length) add(55, 'hr', `有贤才 ${frees.map(o => o.name).join('、')} 客居${c.name}，可前往登用。`, { city: c.id });
    }
    for (const c of cities) {
      const caps = G.captivesIn(c.id);
      if (caps.length) add(65, 'hr', `${c.name}关押着俘虏 ${caps.map(o => o.name).join('、')}，待主公处置。`, { city: c.id });
      for (const t of SG.AI.frontTargets(c)) {
        if (t.faction < 0) add(76, 'war', `${t.name}乃是空城，自${c.name}出兵即可占领。`, { city: t.id });
        else if (t.troops < c.troops * 0.4 && c.troops > 8000) add(62, 'war', `${t.name}（${G.facName(t.faction)}）守军仅 ${U.fmt(t.troops)}，可自${c.name}乘虚而入。`, { city: t.id });
      }
    }
    for (const o of G.officersOf(fid)) {
      if (!o.fixed && o.loyalty < 60) add(72, 'hr', `${o.name}忠诚仅 ${o.loyalty}，恐生异心，宜加褒赏。`, { city: o.city });
    }
    const f = G.fac(fid);
    if (f.ap >= R.AP_MAX - 25) add(50, 'dom', `行动力将满（${f.ap}），勿使其白白浪费。`, null);
    for (const k in S.works.dam) {
      const d = S.works.dam[k];
      if (d.f === fid && d.level >= 7) add(45, 'war', `我军所筑堤坝水位已达 ${d.level}，可伺机决堤水淹敌军。`, { hex: H.cr(+k) });
    }
    const maxG = G.title(fid).maxGrade;
    const openRanks = R.RANKS.filter(r => r.grade >= maxG && SG.Ranks.free(fid, r.id) > 0);
    const vac = G.officersOf(fid).some(o => !G.isRuler(o) && !G.rank(o) && openRanks.some(r => (o.merit || 0) >= R.GRADE_MERIT[r.grade]));
    if (vac) add(35, 'hr', '有武将功绩已足却未任官职，可在「官职」中任命以激励士气。', null);
    // 同类只留最要紧的几条
    out.sort((a, b) => b.pri - a.pri);
    const seen = new Set();
    return out.filter(a => { const k = a.text.slice(0, 8); if (seen.has(k)) return false; seen.add(k); return true; });
  };

  // ---------- 面板 ----------
  AD.show = (force) => {
    const el = document.getElementById('advisor');
    if (!el || !G.S || G.S.over) return;
    const fid = G.S.player;
    let list = AD.analyze(fid);
    // 内政已托管时，只提军事与人事
    if ((G.S.auto || 'manual') !== 'manual') list = list.filter(a => a.kind !== 'dom');
    list = list.slice(0, 4);
    if (!force && !list.length) { el.classList.add('hidden'); return; }
    const { o, title } = AD.who(fid);
    if (!o) return;
    const body = list.length ? list.map((a, k) => `<li data-k="${k}" class="${a.go ? 'go' : ''} ${a.pri >= 85 ? 'urgent' : ''}">${esc(a.text)}</li>`).join('')
      : '<li>眼下诸事顺遂，主公可安心用兵。</li>';
    el.innerHTML = `<img src="${SG.Portraits.src(o.name)}" alt="">
      <div class="ad-body"><div class="ad-head"><b>${title} ${esc(o.name)}</b><span class="muted">主公，臣有一言：</span>
      <button class="ad-x" title="关闭">✕</button></div><ul>${body}</ul>
      <label class="muted ad-auto"><input type="checkbox" ${SG.Cutin.prefs.advisor ? 'checked' : ''}> 每回合自动献策</label></div>`;
    el.classList.remove('hidden');
    el.querySelector('.ad-x').addEventListener('click', () => el.classList.add('hidden'));
    el.querySelector('.ad-auto input').addEventListener('change', e => { SG.Cutin.prefs.advisor = e.target.checked; SG.Cutin.savePrefs(); });
    el.querySelectorAll('li[data-k]').forEach(li => li.addEventListener('click', () => {
      const a = list[+li.dataset.k];
      if (!a.go) return;
      if (a.go.city != null) { const c = G.city(a.go.city); SG.Render.centerOn(c.c, c.r); SG.UI.select({ city: c.id }); }
      else if (a.go.hex) { SG.Render.centerOn(...a.go.hex); SG.UI.select({ hex: a.go.hex }); }
    }));
  };
  AD.toggle = () => {
    const el = document.getElementById('advisor');
    if (el.classList.contains('hidden')) AD.show(true); else el.classList.add('hidden');
  };
  AD.turnStart = () => { if (SG.Cutin.prefs.advisor) AD.show(false); };
})(window.SG);
