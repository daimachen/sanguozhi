// 技巧研究：技巧点（作战、内政积累）→ 研究各兵科与内政技巧
(function (SG) {
  const U = SG.U, R = SG.R, G = SG.G;
  const TC = SG.Tech = {};

  // 分支 × 三阶。eff 为效果标识，由各系统查询
  TC.BRANCHES = [
    { id: 'spear', name: '枪兵', list: [
      { id: 'sp1', name: '精锐枪兵', desc: '枪兵攻击、防御 +10%' },
      { id: 'sp2', name: '枪阵', desc: '枪兵战法成功率 +10%' },
      { id: 'sp3', name: '熟练枪兵', desc: '枪兵战法暴击率 +15%' }] },
    { id: 'halberd', name: '戟兵', list: [
      { id: 'hb1', name: '精锐戟兵', desc: '戟兵攻击、防御 +10%' },
      { id: 'hb2', name: '坚阵', desc: '戟兵受到伤害 -10%' },
      { id: 'hb3', name: '熟练戟兵', desc: '戟兵战法暴击率 +15%' }] },
    { id: 'bow', name: '弩兵', list: [
      { id: 'bw1', name: '精锐弩兵', desc: '弩兵攻击、防御 +10%' },
      { id: 'bw2', name: '强弩', desc: '弩兵陆上射程 1-3' },
      { id: 'bw3', name: '火矢改良', desc: '火矢、火计的火焰伤害 +50%' }] },
    { id: 'horse', name: '骑兵', list: [
      { id: 'hs1', name: '精锐骑兵', desc: '骑兵攻击、防御 +10%' },
      { id: 'hs2', name: '良马产出', desc: '军马生产量 +50%' },
      { id: 'hs3', name: '骑兵机动', desc: '骑兵移动力 +3' }] },
    { id: 'siege', name: '兵器', list: [
      { id: 'sg1', name: '霹雳车', desc: '投石、井阑伤害 +25%' },
      { id: 'sg2', name: '木兽强化', desc: '冲车攻城伤害 +30%' },
      { id: 'sg3', name: '兵器量产', desc: '冲车、井阑、投石产量加倍' }] },
    { id: 'navy', name: '水军', list: [
      { id: 'nv1', name: '精锐水军', desc: '水上攻击、防御 +15%' },
      { id: 'nv2', name: '斗舰量产', desc: '斗舰、楼船每次多造 1 艘' },
      { id: 'nv3', name: '火船', desc: '对水上部队的火攻伤害 +50%' }] },
    { id: 'dom', name: '内政', list: [
      { id: 'dm1', name: '屯田制', desc: '兵粮收入 +15%；募兵量 +20%' },
      { id: 'dm2', name: '商业振兴', desc: '金收入 +15%' },
      { id: 'dm3', name: '城墙强化', desc: '己方城池、关隘耐久上限 +30%' }] },
    { id: 'army', name: '军制', list: [
      { id: 'ar1', name: '强行军', desc: '全部队移动力 +2；兵粮消耗 -25%' },
      { id: 'ar2', name: '阵地构筑', desc: '部队可建设「砦」；野战建筑耐久 +50%' },
      { id: 'ar3', name: '八阵图', desc: '部队可建设「石兵八阵」' }] },
  ];
  TC.TIER = [
    { tp: 300, gold: 1000, turns: 4 },
    { tp: 700, gold: 2000, turns: 6 },
    { tp: 1200, gold: 3500, turns: 9 },
  ];
  TC.AP = 30;
  TC.all = {};
  TC.BRANCHES.forEach(b => b.list.forEach((t, k) => { t.tier = k; t.branch = b.id; TC.all[t.id] = t; }));

  const fac = fid => G.fac(fid);
  TC.has = (fid, id) => fid >= 0 && !!(fac(fid).techs && fac(fid).techs[id]);
  TC.addTP = (fid, v) => { if (fid >= 0) { const f = fac(fid); f.tp = Math.min(9999, (f.tp || 0) + v); } };

  TC.reason = (fid, id) => {
    const t = TC.all[id], f = fac(fid), c = TC.TIER[t.tier];
    if (TC.has(fid, id)) return '已研究';
    if (f.research) return '正在研究其他技巧';
    if (t.tier > 0 && !TC.has(fid, TC.BRANCHES.find(b => b.id === t.branch).list[t.tier - 1].id)) return '需先研究上一阶';
    if ((f.tp || 0) < c.tp) return `技巧点不足（需 ${c.tp}）`;
    if (SG.Dip.totalGold(fid) < c.gold) return `金不足（需 ${c.gold}）`;
    if (f.ap < TC.AP) return '行动力不足';
    return null;
  };
  TC.start = (fid, id) => {
    const e = TC.reason(fid, id);
    if (e) return { ok: false, msg: e };
    const f = fac(fid), t = TC.all[id], c = TC.TIER[t.tier];
    let left = c.gold;
    for (const city of G.citiesOf(fid).sort((a, b) => b.gold - a.gold)) { const k = Math.min(city.gold, left); city.gold -= k; left -= k; if (!left) break; }
    f.tp -= c.tp; f.ap -= TC.AP;
    f.research = { id, left: c.turns };
    return { ok: true, msg: `开始研究「${t.name}」，需 ${c.turns} 旬` };
  };
  TC.complete = (fid, id) => {
    const f = fac(fid), t = TC.all[id];
    f.techs = f.techs || {}; f.techs[id] = true;
    if (id === 'dm3') for (const c of G.citiesOf(fid)) TC.wall(c);
    G.log(`${f.name} 研究完成「${t.name}」：${t.desc}`, G.isPlayer(fid) ? 'l-good' : 'l-dim');
    if (G.isPlayer(fid)) G.S.eventQueue.push({ title: '技巧研究完成', text: `「${t.name}」研究完成！<br>${t.desc}`, people: [] });
  };
  TC.wall = city => {
    if (city.walls || city.kind === 'port') return;
    city.walls = true;
    city.maxDur = Math.round(city.maxDur * 1.3); city.dur = Math.round(city.dur * 1.3);
  };

  TC.endRound = () => {
    const S = G.S;
    for (const f of S.factions) {
      if (!f.alive) continue;
      if (S.xun === 0) TC.addTP(f.id, 3 * G.realCitiesOf(f.id).length);
      if (f.research && --f.research.left <= 0) { const id = f.research.id; f.research = null; TC.complete(f.id, id); }
    }
  };

  // 电脑势力：按主力兵种优先研究
  TC.ai = fid => {
    const f = fac(fid);
    if (f.research || (f.tp || 0) < 300 || !U.chance(0.35)) return;
    const pref = ['army', 'dom', 'spear', 'horse', 'halberd', 'bow', 'siege', 'navy'];
    for (const b of pref) {
      const t = TC.BRANCHES.find(x => x.id === b).list.find(x => !TC.has(fid, x.id));
      if (t && !TC.reason(fid, t.id) && SG.Dip.totalGold(fid) > TC.TIER[t.tier].gold + 2000) { TC.start(fid, t.id); return; }
    }
  };

  // ---------- 效果查询 ----------
  TC.unitMult = u => {
    const f = u.faction, has = id => TC.has(f, id);
    let atk = 1, def = 1;
    if (SG.C.inWater(u)) { if (has('nv1')) { atk *= 1.15; def *= 1.15; } return { atk, def }; }
    const elite = { spear: 'sp1', halberd: 'hb1', bow: 'bw1', horse: 'hs1' }[u.type];
    if (elite && has(elite)) { atk *= 1.1; def *= 1.1; }
    if (u.type === 'halberd' && has('hb2')) def /= 0.9;
    if ((u.type === 'catapult' || u.type === 'tower') && has('sg1')) atk *= 1.25;
    return { atk, def };
  };
  TC.rateBonus = (fid, type) => (type === 'spear' && TC.has(fid, 'sp2') ? 0.1 : 0);
  TC.critBonus = (fid, type) => ((type === 'spear' && TC.has(fid, 'sp3')) || (type === 'halberd' && TC.has(fid, 'hb3')) ? 0.15 : 0);
  TC.fireK = (fid, onWater) => (TC.has(fid, 'bw3') ? 1.5 : 1) * (onWater && TC.has(fid, 'nv3') ? 1.5 : 1);
  TC.mpBonus = u => (TC.has(u.faction, 'ar1') ? 2 : 0) + (u.type === 'horse' && TC.has(u.faction, 'hs3') ? 3 : 0);
})(window.SG);
