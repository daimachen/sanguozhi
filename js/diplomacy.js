// 外交：亲善、同盟、停战、劝降
(function (SG) {
  const U = SG.U, R = SG.R, G = SG.G, C = SG.C;
  const Dp = SG.Dip = {};

  Dp.power = fid => G.totalTroops(fid) + G.realCitiesOf(fid).length * 8000 + G.officersOf(fid).length * 1500;
  const bonus = o => (o.skill === '论客' ? 0.2 : 0) + (o.s[2] + o.s[3] - 120) / 400;
  const check = (fid, o, tgt) => {
    if (!G.fac(tgt) || !G.fac(tgt).alive || tgt === fid) return '目标势力无效';
    if (o.status !== 'active' || o.faction !== fid || o.unit != null) return '武将不可用';
    if (o.acted) return `${o.name} 本回合已行动`;
    if (G.fac(fid).ap < R.AP.diplomacy) return '行动力不足';
    return null;
  };
  const spend = (fid, o) => { G.fac(fid).ap -= R.AP.diplomacy; o.acted = true; };
  // 从都市中扣金
  const payGold = (fid, amt) => {
    const cs = G.realCitiesOf(fid).sort((a, b) => b.gold - a.gold);
    if (U.sum(cs, c => c.gold) < amt) return false;
    let left = amt;
    for (const c of cs) { const t = Math.min(c.gold, left); c.gold -= t; left -= t; if (!left) break; }
    return true;
  };
  Dp.totalGold = fid => U.sum(G.citiesOf(fid), c => c.gold);

  Dp.rates = (fid, o, tgt) => {
    const rel = G.rel(fid, tgt), pr = Dp.power(fid) / Math.max(1, Dp.power(tgt)), b = bonus(o);
    return {
      goodwill: 1,
      alliance: U.clamp((rel - 45) / 60 + b + (pr > 1 ? 0.1 : -0.1), 0, 0.95),
      truce: U.clamp((rel - 20) / 70 + b + (pr > 1.3 ? 0.2 : 0), 0, 0.95),
      surrender: pr < 3 ? 0 : U.clamp((pr - 3) / 12 + (rel - 50) / 150 + b, 0, 0.8),
    };
  };

  Dp.goodwill = (fid, o, tgt, gold) => {
    const e = check(fid, o, tgt); if (e) return { ok: false, msg: e };
    if (!payGold(fid, gold)) return { ok: false, msg: '金不足' };
    spend(fid, o);
    const inc = Math.round(gold / 100 * (1 + bonus(o)));
    G.addRel(fid, tgt, inc);
    return { ok: true, msg: `${o.name} 出使 ${G.facName(tgt)}，友好度 +${inc}（现为 ${G.rel(fid, tgt)}）` };
  };

  Dp.alliance = (fid, o, tgt) => {
    const e = check(fid, o, tgt); if (e) return { ok: false, msg: e };
    spend(fid, o);
    if (U.chance(Dp.rates(fid, o, tgt).alliance)) {
      G.S.ally[G.relKey(fid, tgt)] = G.S.turn + 36;
      G.addRel(fid, tgt, 10);
      G.log(`${G.facName(fid)} 与 ${G.facName(tgt)} 缔结同盟（一年）`, 'l-good');
      return { ok: true, msg: `${G.facName(tgt)} 同意结盟！` };
    }
    G.addRel(fid, tgt, -3);
    return { ok: true, msg: `${G.facName(tgt)} 拒绝了同盟` };
  };

  Dp.truce = (fid, o, tgt) => {
    const e = check(fid, o, tgt); if (e) return { ok: false, msg: e };
    spend(fid, o);
    if (U.chance(Dp.rates(fid, o, tgt).truce)) {
      G.S.truce[G.relKey(fid, tgt)] = G.S.turn + 18;
      G.log(`${G.facName(fid)} 与 ${G.facName(tgt)} 停战（半年）`, 'l-good');
      return { ok: true, msg: `${G.facName(tgt)} 同意停战！` };
    }
    return { ok: true, msg: `${G.facName(tgt)} 拒绝停战` };
  };

  Dp.surrender = (fid, o, tgt) => {
    const e = check(fid, o, tgt); if (e) return { ok: false, msg: e };
    if (G.isPlayer(tgt)) return { ok: false, msg: '无法劝降玩家' };
    spend(fid, o);
    if (U.chance(Dp.rates(fid, o, tgt).surrender)) {
      Dp.merge(tgt, fid);
      return { ok: true, msg: `${G.facName(tgt)} 举众归降！` };
    }
    G.addRel(fid, tgt, -10);
    return { ok: true, msg: `${G.facName(tgt)} 严词拒绝` };
  };

  // 势力合并
  Dp.merge = (from, to) => {
    const f = G.fac(from);
    G.log(`${f.name} 归顺 ${G.facName(to)}`, 'l-war');
    for (const c of G.citiesOf(from)) c.faction = to;
    for (const u of G.unitsOf(from)) u.faction = to;
    for (const o of G.S.officers) {
      if (o.faction === from && (o.status === 'active' || o.status === 'captive')) { o.faction = to; o.fixed = false; o.loyalty = U.randInt(70, 85); }
      if (o.status === 'captive' && o.captor === from) o.captor = to;
    }
    f.alive = false;
  };

  // 回合处理：同盟到期提醒、关系缓慢回归
  Dp.endRound = () => {
    const S = G.S;
    for (const k in S.ally) if (S.ally[k] === S.turn) {
      const [a, b] = k.split('_').map(Number);
      if (G.isPlayer(a) || G.isPlayer(b)) G.log(`与 ${G.facName(G.isPlayer(a) ? b : a)} 的同盟到期`, 'l-war');
    }
    for (const k in S.truce) if (S.truce[k] === S.turn) {
      const [a, b] = k.split('_').map(Number);
      if (G.isPlayer(a) || G.isPlayer(b)) G.log(`与 ${G.facName(G.isPlayer(a) ? b : a)} 的停战到期`, 'l-war');
    }
  };
})(window.SG);
