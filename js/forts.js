// 野战建筑：阵、砦、箭楼、石兵八阵（部队在相邻格建设，占据该格，可被攻击摧毁）
(function (SG) {
  const U = SG.U, H = SG.Hex, G = SG.G, C = SG.C, T = SG.T, M = SG.Map;
  const FT = SG.Forts = {};

  FT.DEFS = {
    camp: { name: '阵', gold: 300, en: 15, hp: 1000, def: 1.15, heal: 0.01, energy: 5, desc: '相邻友军防御 +15%，每旬回复气力与少量兵力' },
    fort: { name: '砦', gold: 800, en: 20, hp: 2500, def: 1.25, heal: 0.02, energy: 8, shoot: 220, tech: 'ar2', desc: '相邻友军防御 +25%，回复更多；并射击相邻敌军（需技巧「阵地构筑」）' },
    tower: { name: '箭楼', gold: 500, en: 15, hp: 1200, shoot: 420, range: 2, desc: '每旬自动射击两格内的敌军' },
    maze: { name: '石兵八阵', gold: 1000, en: 25, hp: 2000, confuse: 0.5, range: 2, tech: 'ar3', desc: '每旬使两格内的敌军陷入混乱（需技巧「八阵图」）' },
  };
  FT.ORDER = ['camp', 'fort', 'tower', 'maze'];
  FT.MAX = 15;
  const FS = () => G.S.forts || (G.S.forts = {});
  FT.at = i => FS()[i] || null;
  FT.count = fid => Object.values(FS()).filter(f => f.f === fid).length;
  FT.payCity = u => C.nearestCity(u.faction, u.c, u.r);

  FT.check = (u, type) => {
    const d = FT.DEFS[type];
    if (u.acted) return '该部队本回合已行动';
    if (u.status) return '部队状态异常';
    if (d.tech && !(SG.Tech && SG.Tech.has(u.faction, d.tech))) return '尚未研究所需技巧';
    if (u.energy < d.en) return '气力不足';
    if (M.isWater(H.idx(u.c, u.r))) return '水上无法建设';
    if (FT.count(u.faction) >= FT.MAX) return `野战建筑最多 ${FT.MAX} 座`;
    const city = FT.payCity(u);
    if (!city || city.gold < d.gold) return `附近己方都市金不足（需 ${d.gold}）`;
    return null;
  };
  FT.targets = u => {
    const out = new Set(), ws = G.S.works;
    for (const [c, r] of H.neighbors(u.c, u.r)) {
      const i = H.idx(c, r), t = SG.map.t[i];
      if (G.unitAt(c, r) || M.isPlace(i) || FT.at(i) || M.isWater(i) || t === T.PEAK || t === T.SEA) continue;
      if (ws.ditch[i] || ws.dam[i] || ws.trap[i]) continue;
      out.add(i);
    }
    return out;
  };
  FT.build = (u, type, idx) => {
    const e = FT.check(u, type);
    if (e) return { ok: false, msg: e };
    if (!FT.targets(u).has(idx)) return { ok: false, msg: '此处无法建设' };
    const d = FT.DEFS[type], city = FT.payCity(u);
    city.gold -= d.gold;
    u.energy -= d.en; u.acted = true; u.mp = 0;
    const hp = Math.round(d.hp * (SG.Tech && SG.Tech.has(u.faction, 'ar2') ? 1.5 : 1));
    FS()[idx] = { type, f: u.faction, hp, maxHp: hp };
    G.merit(G.off(u.offs[0]), 20);
    const [c, r] = H.cr(idx);
    SG.fx(c, r, '建设' + d.name, '#ffe082');
    G.log(`${u.name} 建设了${d.name}`, G.isPlayer(u.faction) ? '' : 'l-dim');
    return { ok: true, msg: `建设${d.name}（耗金 ${d.gold}，自 ${city.name}）` };
  };
  FT.menu = u => FT.ORDER.map(type => {
    const d = FT.DEFS[type], e = FT.check(u, type), n = e ? 0 : FT.targets(u).size;
    return `<button data-um="uFort" data-id="${type}" ${e || !n ? 'disabled' : ''} title="${U.esc(d.desc)}${e ? '（' + U.esc(e) + '）' : !n ? '（附近无空地）' : ''}">${d.name}<small>金${d.gold}</small></button>`;
  }).join('');

  // 敌方可攻击的建筑
  FT.hostileTargets = (u, rng) => {
    const out = [];
    for (const k in FS()) {
      const f = FS()[k], [c, r] = H.cr(+k);
      if (G.hostile(u.faction, f.f) && C.inRange(u, c, r, rng)) out.push({ fort: f, idx: +k, c, r });
    }
    return out;
  };
  FT.damageOf = (u, st, mult) => Math.round(C.durDamage(u, st, mult) * 1.6 + Math.sqrt(Math.max(u.troops, 1)) * 3 * mult);
  FT.hit = (u, st, tgt, mult) => {
    const d = Math.max(1, Math.round(FT.damageOf(u, st, mult) * (0.9 + Math.random() * 0.2)));
    tgt.fort.hp -= d;
    SG.fx(tgt.c, tgt.r, '耐久 -' + d, '#ffb74d');
    if (tgt.fort.hp <= 0) FT.destroy(tgt.idx, u);
    return d;
  };
  FT.destroy = (idx, by) => {
    const f = FS()[idx];
    if (!f) return;
    delete FS()[idx];
    const [c, r] = H.cr(idx);
    SG.fx(c, r, FT.DEFS[f.type].name + '被摧毁', '#ff8a65');
    G.log(`${G.facName(f.f)}的${FT.DEFS[f.type].name}被${by ? by.name : ''}摧毁`, G.isPlayer(f.f) ? 'l-bad' : by && G.isPlayer(by.faction) ? 'l-good' : 'l-dim');
    if (by) C.addMerit(by, 60);
  };

  // 防御加成：相邻友方阵/砦
  FT.defBonus = unit => {
    let k = 1;
    for (const [c, r] of H.neighbors(unit.c, unit.r)) {
      const f = FT.at(H.idx(c, r));
      if (f && FT.DEFS[f.type].def && G.friendly(unit.faction, f.f)) k = Math.max(k, FT.DEFS[f.type].def);
    }
    return k;
  };

  // 每旬：回复、射击、八阵
  FT.endRound = () => {
    const fs = FS();
    for (const k in fs) {
      const f = fs[k], d = FT.DEFS[f.type], [c, r] = H.cr(+k);
      if (!G.fac(f.f) || !G.fac(f.f).alive) { delete fs[k]; continue; }
      if (G.S.works.flood[+k]) { f.hp -= Math.round(f.maxHp * 0.3); if (f.hp <= 0) { FT.destroy(+k, null); continue; } }
      if (G.S.fires.some(x => x.i === +k)) { f.hp -= 150; if (f.hp <= 0) { FT.destroy(+k, null); continue; } }
      const near = H.within(c, r, d.range || 1).map(([nc, nr]) => G.unitAt(nc, nr)).filter(Boolean);
      for (const u of near) {
        if (G.friendly(u.faction, f.f)) {
          if (d.heal && H.dist(c, r, u.c, u.r) === 1) {
            u.energy = Math.min(100, u.energy + d.energy);
            u.troops = Math.min(u.maxT, Math.round(u.troops * (1 + d.heal)));
          }
        } else if (G.hostile(u.faction, f.f)) {
          if (d.shoot) {
            const dmg = Math.round(d.shoot * (0.85 + Math.random() * 0.3));
            u.troops -= dmg;
            SG.fx(u.c, u.r, `${d.name} -${dmg}`, '#ff8a65');
          }
          if (d.confuse && !u.status && U.chance(d.confuse)) {
            const st = C.stats(u);
            if (!G.hasSkill(st.offs, '洞察') && !G.hasSkill(st.offs, '深谋')) {
              u.status = { kind: 'confuse', turns: 1 + (G.isPlayer(u.faction) ? 1 : 0) };
              SG.fx(u.c, u.r, '八阵迷乱', '#ce93d8');
            }
          }
        }
      }
    }
    C.cleanup(null);
  };

  // ---------- AI：防守部队修建箭楼 / 阵 ----------
  FT.aiConsider = u => {
    if (!U.chance(0.2)) return false;
    const foes = Object.values(G.S.units).filter(x => G.hostile(u.faction, x.faction));
    if (!foes.length) return false;
    const e = U.maxBy(foes, x => -H.dist(x.c, x.r, u.c, u.r));
    if (H.dist(e.c, e.r, u.c, u.r) > 6) return false;
    const type = !FT.check(u, 'tower') ? 'tower' : !FT.check(u, 'camp') ? 'camp' : null;
    if (!type) return false;
    const opts = [...FT.targets(u)].sort((a, b) => H.dist(...H.cr(a), e.c, e.r) - H.dist(...H.cr(b), e.c, e.r));
    if (!opts.length) return false;
    FT.build(u, type, opts[0]);
    return true;
  };
})(window.SG);
