// 内政：开发、征兵、训练、巡察、生产、搜索、登用、褒赏、移动、俘虏处置；回合收入
(function (SG) {
  const U = SG.U, R = SG.R, H = SG.Hex, G = SG.G, C = SG.C;
  const D = SG.Dom = {};

  const payAP = (fid, cost) => {
    const f = G.fac(fid);
    if (f.ap < cost) return false;
    f.ap -= cost; return true;
  };
  const check = (city, o, apCost) => {
    if (!city || city.kind !== 'city') return '只能在都市中执行';
    if (o && (o.status !== 'active' || o.faction !== city.faction || o.city !== city.id || o.unit != null)) return '武将不在该都市';
    if (o && o.acted) return `${o.name} 本回合已行动`;
    if (G.fac(city.faction).ap < apCost) return '行动力不足';
    return null;
  };
  const fail = msg => ({ ok: false, msg });
  const hasSk = (o, s) => o && o.skill === s;

  // ---------- 预估值 ----------
  D.buildTurns = (o, type) => {
    const per = (o.s[3] * 0.9 + 10) * (hasSk(o, '能吏') ? 1.5 : 1);
    return Math.max(1, Math.ceil(R.FACILITIES[type].work / per));
  };
  D.recruitAmount = (city, o) => {
    const n = G.facilityCount(city, 'barracks');
    return Math.round((700 + o.s[4] * 16) * (0.6 + 0.4 * n) * (hasSk(o, '名声') ? 1.5 : 1) / 10) * 10;
  };
  D.recruitCost = amt => Math.round(amt * 0.3);
  D.troopCap = city => R.CITY_DEFAULT[city.kind === 'gate' ? 'gate' : city.size].maxTroops;
  D.trainAmount = o => Math.round(6 + o.s[0] / 8);
  D.patrolAmount = o => Math.round((5 + o.s[4] / 10) * (hasSk(o, '仁政') ? 2 : 1));
  D.produceAmount = (city, o, wk) => {
    const W = R.WEAPONS[wk], n = G.facilityCount(city, W.fac);
    if (W.siege) return (hasSk(o, '发明') ? 2 : 1);
    let a = (900 + o.s[3] * 18) * (0.6 + 0.4 * n) * (hasSk(o, '能吏') ? 1.3 : 1);
    if (wk === 'horse' && hasSk(o, '繁殖')) a *= 2;
    return Math.round(a / 10) * 10;
  };
  D.produceCost = (wk, amt) => R.WEAPONS[wk].siege ? 600 * amt : Math.round(amt * 0.15);

  // ---------- 指令 ----------
  D.build = (city, o, type) => {
    const e = check(city, o, R.AP.build); if (e) return fail(e);
    const F = R.FACILITIES[type];
    if (city.gold < F.cost) return fail('金不足');
    const plots = SG.map.places[city.id].plots;
    const used = new Set(city.facs.map(f => f.plot));
    const plot = plots.find(p => !used.has(p));
    if (plot == null) return fail('没有空余地块');
    payAP(city.faction, R.AP.build);
    city.gold -= F.cost; o.acted = true;
    const turns = D.buildTurns(o, type);
    city.facs.push({ type, plot, done: false, left: turns });
    G.log(`${o.name} 于 ${city.name} 开始建设${F.name}（${turns}旬）`, G.isPlayer(city.faction) ? '' : 'l-dim');
    return { ok: true };
  };
  D.demolish = (city, plot) => {
    city.facs = city.facs.filter(f => f.plot !== plot);
    return { ok: true };
  };

  D.recruit = (city, o) => {
    const e = check(city, o, R.AP.recruit); if (e) return fail(e);
    if (!G.facilityCount(city, 'barracks')) return fail('需要兵营');
    const amt = D.recruitAmount(city, o), cost = D.recruitCost(amt);
    if (city.gold < cost) return fail('金不足');
    if (city.order < 20) return fail('治安过低，无法征兵');
    if (city.troops >= D.troopCap(city)) return fail('兵力已达上限');
    if (city.recruitTurn === G.S.turn && (city.recruitCount || 0) >= 2) return fail('本旬已征兵两次，民力不堪');
    payAP(city.faction, R.AP.recruit);
    city.gold -= cost; o.acted = true;
    city.energy = Math.round((city.energy * city.troops + 50 * amt) / Math.max(1, city.troops + amt));
    city.troops = Math.min(D.troopCap(city), city.troops + amt);
    city.recruitCount = city.recruitTurn === G.S.turn ? (city.recruitCount || 0) + 1 : 1;
    city.recruitTurn = G.S.turn;
    city.order = Math.max(0, city.order - Math.round(amt / 300));
    return { ok: true, msg: `${o.name} 征得士兵 ${amt} 名` };
  };

  D.train = (city, o) => {
    const e = check(city, o, R.AP.train); if (e) return fail(e);
    if (city.energy >= 100) return fail('气力已满');
    payAP(city.faction, R.AP.train);
    o.acted = true;
    const a = D.trainAmount(o);
    city.energy = Math.min(100, city.energy + a);
    return { ok: true, msg: `${o.name} 训练士兵，气力 +${a}` };
  };

  D.patrol = (city, o) => {
    const e = check(city, o, R.AP.patrol); if (e) return fail(e);
    if (city.order >= 100) return fail('治安已满');
    payAP(city.faction, R.AP.patrol);
    o.acted = true;
    const a = D.patrolAmount(o);
    city.order = Math.min(100, city.order + a);
    return { ok: true, msg: `${o.name} 巡察城内，治安 +${a}` };
  };

  D.produce = (city, o, wk) => {
    const e = check(city, o, R.AP.produce); if (e) return fail(e);
    const W = R.WEAPONS[wk];
    if (!G.facilityCount(city, W.fac)) return fail(`需要${R.FACILITIES[W.fac].name}`);
    const amt = D.produceAmount(city, o, wk), cost = D.produceCost(wk, amt);
    if (city.gold < cost) return fail('金不足');
    payAP(city.faction, R.AP.produce);
    city.gold -= cost; o.acted = true;
    city.w[wk] += amt;
    return { ok: true, msg: `${o.name} 生产${W.name} ${amt}` };
  };

  D.search = (city, o) => {
    const e = check(city, o, R.AP.search); if (e) return fail(e);
    payAP(city.faction, R.AP.search);
    o.acted = true;
    const hidden = G.freeIn(city.id).filter(x => x.hidden);
    if (hidden.length && U.chance(0.45 + o.s[2] / 250)) {
      const f = U.pick(hidden);
      f.hidden = false;
      return { ok: true, found: f, msg: `${o.name} 在 ${city.name} 发现了在野武将 ${f.name}！` };
    }
    const roll = Math.random();
    if (roll < 0.35) {
      const g = U.randInt(100, 400); city.gold += g;
      return { ok: true, msg: `${o.name} 发现了 ${g} 金` };
    }
    if (roll < 0.55) {
      const f = U.randInt(800, 2500); city.food += f;
      return { ok: true, msg: `${o.name} 发现了兵粮 ${f}` };
    }
    return { ok: true, msg: `${o.name} 四处搜索，一无所获` };
  };

  // 登用成功率
  D.employRate = (o, t) => {
    if (t.status === 'captive') {
      if (t.fixed || (t.faction >= 0 && G.isRuler(t))) return 0;
    }
    if (t.status === 'active' && (t.fixed || G.isRuler(t))) return 0;
    let p;
    if (t.status === 'free') p = 0.55 + (o.s[4] - 50) / 100;
    else if (t.status === 'captive') p = 0.2 + (o.s[4] - 50) / 150 + (100 - t.loyalty) / 80 - (t.faction >= 0 && G.fac(t.faction).alive ? 0.15 : 0);
    else p = (90 - t.loyalty) / 60 + (o.s[4] - 60) / 200;
    if (hasSk(o, '眼力')) p += 0.2;
    return U.clamp(p, 0, 0.95);
  };
  D.employ = (city, o, t) => {
    const e = check(city, o, R.AP.employ); if (e) return fail(e);
    payAP(city.faction, R.AP.employ);
    o.acted = true;
    const p = D.employRate(o, t);
    if (!U.chance(p)) {
      if (t.status === 'active') t.loyalty = Math.min(100, t.loyalty + 2);
      return { ok: true, success: false, msg: `${t.name} 拒绝了 ${o.name} 的招揽` };
    }
    const oldF = t.faction;
    t.status = 'active'; t.faction = city.faction; t.city = city.id; t.hidden = false; t.captor = -1;
    t.loyalty = U.clamp(70 + Math.round(G.ruler(city.faction).s[4] / 5), 60, 95); t.acted = true; t.unit = null;
    if (oldF >= 0 && oldF !== city.faction) C.checkFaction(oldF);
    G.log(`${t.name} 加入了 ${G.facName(city.faction)}`, G.isPlayer(city.faction) ? 'l-good' : G.isPlayer(oldF) ? 'l-bad' : 'l-dim');
    return { ok: true, success: true, msg: `${t.name} 应允出仕！` };
  };

  D.reward = (city, o) => {
    const e = check(city, null, R.AP.reward); if (e) return fail(e);
    if (o.loyalty >= 100) return fail('忠诚已满');
    if (city.gold < 100) return fail('金不足');
    payAP(city.faction, R.AP.reward);
    city.gold -= 100;
    const a = U.randInt(5, 10);
    o.loyalty = Math.min(100, o.loyalty + a);
    return { ok: true, msg: `褒赏 ${o.name}，忠诚 +${a}` };
  };

  // 召唤：把其他都市的武将移到本城
  D.move = (city, o) => {
    if (G.fac(city.faction).ap < R.AP.move) return fail('行动力不足');
    if (o.status !== 'active' || o.faction !== city.faction || o.unit != null) return fail('武将不可用');
    if (o.acted) return fail(`${o.name} 本回合已行动`);
    if (o.city === city.id) return fail('已在此城');
    payAP(city.faction, R.AP.move);
    o.city = city.id; o.acted = true;
    return { ok: true, msg: `${o.name} 移驻 ${city.name}` };
  };

  // 俘虏处置（action: employ / release / execute）
  D.captive = (city, t, action) => {
    if (t.status !== 'captive' || t.city !== city.id) return fail('无此俘虏');
    const fid = city.faction;
    if (action === 'employ') {
      const rec = U.maxBy(G.officersIn(city.id), G.cha) || G.ruler(fid);
      const p = D.employRate(rec, t);
      if (U.chance(p)) {
        const oldF = t.faction;
        t.status = 'active'; t.faction = fid; t.captor = -1; t.loyalty = U.randInt(65, 80); t.acted = true;
        G.log(`俘虏 ${t.name} 归降 ${G.facName(fid)}`, G.isPlayer(fid) ? 'l-good' : 'l-dim');
        if (oldF >= 0) C.checkFaction(oldF);
        return { ok: true, success: true, msg: `${t.name} 愿意归降！` };
      }
      return { ok: true, success: false, msg: `${t.name}：「忠臣不事二主！」` };
    }
    if (action === 'release') {
      t.captor = -1;
      const home = t.faction >= 0 && G.fac(t.faction).alive ? C.nearestCity(t.faction, city.c, city.r) : null;
      if (home) { t.status = 'active'; t.city = home.id; if (t.faction >= 0) G.addRel(fid, t.faction, 5); }
      else { t.status = 'free'; t.faction = -1; t.hidden = false; }
      return { ok: true, msg: `释放了 ${t.name}` };
    }
    if (action === 'execute') {
      t.status = 'dead';
      if (t.faction >= 0) G.addRel(fid, t.faction, -30);
      for (const o of G.officersOf(fid)) if (!o.fixed) o.loyalty = Math.max(0, o.loyalty - 2);
      G.log(`${G.facName(fid)} 处斩了 ${t.name}`, 'l-war');
      return { ok: true, msg: `处斩了 ${t.name}` };
    }
    return fail('未知指令');
  };

  // ---------- 回合结算 ----------
  D.goldIncome = city => {
    if (city.kind !== 'city') return 0;
    let g = 150 + G.facilityCount(city, 'market') * 150;
    g *= 0.5 + 0.5 * city.order / 100;
    if (G.officersIn(city.id).some(o => o.skill === '富豪')) g *= 1.3;
    return Math.round(g);
  };
  D.foodIncome = city => {
    if (city.kind !== 'city') return 0;
    let f = 1500 + G.facilityCount(city, 'farm') * 1300;
    f *= 0.5 + 0.5 * city.order / 100;
    if (G.officersIn(city.id).some(o => o.skill === '米道')) f *= 1.3;
    return Math.round(f);
  };
  D.upkeep = city => Math.ceil(city.troops / 60);

  D.endRound = () => {
    const S = G.S;
    for (const city of S.cities) {
      // 建设进度
      for (const f of city.facs) {
        if (f.done) continue;
        f.left--;
        if (f.left <= 0) {
          f.done = true;
          if (G.isPlayer(city.faction)) G.log(`${city.name} 的${R.FACILITIES[f.type].name}落成`, 'l-good');
        }
      }
      // 兵粮消耗
      city.food -= D.upkeep(city);
      if (city.food < 0) {
        city.food = 0;
        const loss = Math.round(city.troops * 0.05);
        city.troops -= loss; city.order = Math.max(0, city.order - 5);
        if (loss && G.isPlayer(city.faction)) G.log(`${city.name} 兵粮不足，${loss} 名士兵逃亡`, 'l-bad');
      }
      // 治安自然变化
      if (city.faction >= 0 && city.kind === 'city' && S.xun === 0) {
        city.order = U.clamp(city.order + (G.officersIn(city.id).length ? 0 : -2), 0, 100);
      }
      // 耐久回复
      if (city.dur < city.maxDur && !Object.values(S.units).some(u => G.hostile(u.faction, city.faction) && H.dist(u.c, u.r, city.c, city.r) <= 2)) {
        city.dur = Math.min(city.maxDur, city.dur + Math.round(city.maxDur * 0.03));
      }
    }
  };
  // 新月/新季度收入（在日期推进后调用）
  D.income = () => {
    const S = G.S;
    if (S.xun !== 0) return;
    for (const city of S.cities) {
      if (city.faction < 0) continue;
      city.gold += D.goldIncome(city);
      if (S.month % 3 === 1) city.food += D.foodIncome(city) * (S.month === 7 ? 2 : 1);
    }
    if (S.month % 3 === 1) G.log(S.month === 7 ? '秋收时节，各城兵粮大丰收' : '新季度，各城兵粮收入入库', 'l-dim');
  };
})(window.SG);
