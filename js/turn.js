// 回合流程：玩家回合 → 电脑势力 → 回合结算
(function (SG) {
  const U = SG.U, R = SG.R, H = SG.Hex, G = SG.G, C = SG.C, D = SG.Dom;
  const TN = SG.Turn = {};

  // 火焰、都市反击、部队补给
  TN.combatUpkeep = () => {
    const S = G.S;
    for (const f of S.fires) {
      const [c, r] = H.cr(f.i);
      const u = G.unitAt(c, r);
      if (u) {
        const d = Math.round(U.randInt(300, 650) * f.k * (SG.map.t[f.i] === SG.T.FOREST ? 1.3 : 1));
        u.troops -= d; u.energy = Math.max(0, u.energy - 10);
        SG.fx(c, r, '火 -' + d, '#ff7043');
        if (G.isPlayer(u.faction)) G.log(`${u.name} 遭火焰焚烧，损失 ${d}`, 'l-bad');
      }
      const city = G.cityAt(c, r);
      if (city) {
        city.dur = Math.max(0, city.dur - 200 * f.k); city.troops = Math.max(0, city.troops - 300 * f.k);
      }
      // 森林蔓延
      if (U.chance(0.25)) {
        const nb = U.pick(H.neighbors(c, r));
        if (SG.map.t[H.idx(nb[0], nb[1])] === SG.T.FOREST) C.setFire(H.idx(nb[0], nb[1]), 1, f.k);
      }
      f.turns--;
    }
    S.fires = S.fires.filter(f => f.turns > 0);
    // 都市、关隘射击相邻敌军
    for (const city of S.cities) {
      if (city.faction < 0 || city.troops <= 0) continue;
      const cs = C.cityStats(city);
      for (const [nc, nr] of H.neighbors(city.c, city.r)) {
        const u = G.unitAt(nc, nr);
        if (!u || !G.hostile(city.faction, u.faction)) continue;
        const us = C.stats(u);
        const d = Math.round(Math.min(900, Math.sqrt(city.troops) * 2.6 * cs.atk / Math.max(1, us.def)) * (0.9 + Math.random() * 0.2));
        u.troops -= d;
        SG.fx(nc, nr, '-' + d, '#ff8a65');
      }
    }
    C.cleanup(null);
    for (const k in S.units) SG.Units.upkeep(S.units[k]);
    C.cleanup(null);
  };

  TN.advanceDate = () => {
    const S = G.S;
    S.xun++;
    if (S.xun > 2) { S.xun = 0; S.month++; }
    if (S.month > 12) { S.month = 1; S.year++; G.log(`${S.year}年 正月`, 'l-good'); }
    S.turn++;
  };

  TN.officersUpkeep = () => {
    const S = G.S;
    for (const o of S.officers) {
      o.acted = false;
      if (o.status === 'unborn' && o.appear <= S.year) { o.status = 'free'; o.hidden = true; }
      if (o.status === 'captive' && U.chance(0.03)) {
        const home = o.faction >= 0 && G.fac(o.faction).alive ? C.nearestCity(o.faction, G.city(o.city).c, G.city(o.city).r) : null;
        if (home) {
          G.log(`${o.name} 从 ${G.city(o.city).name} 脱逃`, G.isPlayer(o.captor) ? 'l-bad' : 'l-dim');
          o.status = 'active'; o.city = home.id; o.captor = -1;
        }
      }
      // 忠诚低者可能出奔
      if (o.status === 'active' && o.faction >= 0 && !o.fixed && o.loyalty < 50 && o.unit == null && S.xun === 0 && U.chance(0.1)) {
        const oldF = o.faction;
        G.log(`${o.name} 对 ${G.facName(oldF)} 心怀不满，出奔下野`, G.isPlayer(oldF) ? 'l-bad' : 'l-dim');
        o.status = 'free'; o.faction = -1; o.hidden = false;
      }
    }
  };

  TN.endRound = () => {
    const S = G.S;
    TN.combatUpkeep();
    D.endRound();
    SG.Dip.endRound();
    TN.advanceDate();
    D.income();
    TN.officersUpkeep();
    for (const f of S.factions) {
      if (!f.alive) continue;
      f.ap = Math.min(R.AP_MAX, f.ap + R.apGain(G.realCitiesOf(f.id).length));
    }
    for (const f of S.factions) if (f.alive) C.checkFaction(f.id);
  };

  TN.checkGameOver = () => {
    const S = G.S;
    if (S.over) return S.over;
    if (!G.fac(S.player).alive) S.over = 'lose';
    else if (S.cities.filter(c => c.kind === 'city').every(c => c.faction === S.player)) S.over = 'win';
    else if (S.factions.every(f => f.id === S.player || !f.alive)) S.over = 'win';
    return S.over;
  };

  // 自动行军：朝目标格前进（目标为己方都市则入城，敌城则停在城下）
  TN.autoMarch = u => {
    if (u.dest == null || u.acted || u.moved || u.status || !G.S.units[u.id]) return;
    const [dc, dr] = H.cr(u.dest), cid = SG.map.city[u.dest];
    const own = cid >= 0 && G.city(cid).faction === u.faction;
    const keep = cid >= 0 && !own ? (R.TYPES[u.type].ranged ? 2 : 1) : 0;
    if (H.dist(u.c, u.r, dc, dr) <= keep) { u.dest = null; return; }
    const step = SG.Units.stepToward(u, u.dest, keep);
    if (!step) return;
    SG.Units.moveTo(u, step.idx, step.reach);
    if (G.S.units[u.id] && H.dist(u.c, u.r, dc, dr) <= keep) {
      u.dest = null;
      G.log(`${u.name} 已抵达目的地`, '');
    }
  };

  // 玩家结束回合
  TN.endPlayerTurn = () => {
    const S = G.S;
    S.proposals = S.proposals || [];
    const pf = S.player;
    for (const city of G.realCitiesOf(pf)) if (city.delegate) SG.AI.domestic(city, 20);
    for (const u of G.unitsOf(pf)) TN.autoMarch(u);
    const order = U.shuffle(S.factions.filter(f => f.alive && f.id !== pf).map(f => f.id));
    for (const fid of order) {
      try { SG.AI.runFaction(fid); } catch (e) { console.error('AI error', G.facName(fid), e); }
      if (!G.fac(pf).alive) break;
    }
    TN.endRound();
    TN.checkGameOver();
    try { G.save('auto'); } catch (e) { /* ignore */ }
  };
})(window.SG);
