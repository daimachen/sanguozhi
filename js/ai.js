// 电脑势力 AI：内政、军事、部队指挥
(function (SG) {
  const U = SG.U, R = SG.R, H = SG.Hex, G = SG.G, C = SG.C, D = SG.Dom, Un = SG.Units;
  const AI = SG.AI = {};

  AI.enemiesNear = (city, rad) => Object.values(G.S.units).filter(u => G.hostile(city.faction, u.faction) && H.dist(u.c, u.r, city.c, city.r) <= rad);
  // 与本城相邻、可攻击的目标城
  AI.frontTargets = city => [...SG.map.adj[city.id]].map(G.city).filter(t => t.faction !== city.faction && (t.faction < 0 || G.hostile(city.faction, t.faction)));
  AI.isFront = city => AI.frontTargets(city).some(t => t.faction >= 0) || AI.enemiesNear(city, 8).length > 0;

  // ---------- 内政 ----------
  AI.chooseBuild = city => {
    const cnt = t => city.facs.filter(f => f.type === t).length;
    if (city.food < D.upkeep(city) * 30 && cnt('farm') < 5) return 'farm';
    if (!cnt('barracks')) return 'barracks';
    if (!cnt('smithy') && city.size >= 2) return 'smithy';
    if (!cnt('stable') && city.size >= 3) return 'stable';
    if (!cnt('workshop') && city.size >= 2 && AI.isFront(city) && cnt('market') >= 2) return 'workshop';
    if (cnt('market') <= cnt('farm')) return 'market';
    return 'farm';
  };
  AI.domestic = (city, reserve = 25) => {
    if (city.kind !== 'city') return;
    const f = G.fac(city.faction);
    const by = k => G.idleIn(city.id).sort((a, b) => b.s[k] - a.s[k])[0];
    const threat = AI.enemiesNear(city, 7).length > 0;
    const hungry = city.food < D.upkeep(city) * 24;
    const front = AI.isFront(city);
    const cap = D.troopCap(city);
    const target = Math.round(cap * (front ? 0.6 : 0.3) * (city.gold > 5000 ? 1.3 : 1));
    for (let guard = 0; guard < 8; guard++) {
      if (f.ap < reserve || !G.idleIn(city.id).length) break;
      let done = false;
      const tryDo = (fn) => { const r = fn(); if (r && r.ok) done = true; return done; };
      const building = city.facs.some(x => !x.done);
      const freeSlot = SG.map.places[city.id].plots.length > city.facs.length;
      const wsum = city.w.spear + city.w.halberd + city.w.crossbow + city.w.horse;
      if (threat && city.troops < target && city.gold > 300) tryDo(() => D.recruit(city, by(4)));
      if (!done && city.order < 70) tryDo(() => D.patrol(city, by(4)));
      if (!done && !threat && freeSlot && !building && city.gold >= R.FACILITIES[AI.chooseBuild(city)].cost + 300)
        tryDo(() => D.build(city, by(3), AI.chooseBuild(city)));
      if (!done && !hungry && city.troops < target && city.gold > 500) tryDo(() => D.recruit(city, by(4)));
      if (!done && city.energy < 85) tryDo(() => D.train(city, by(0)));
      if (!done && wsum < city.troops * 1.3 && city.gold > 900) {
        const opts = ['spear', 'halberd', 'crossbow'].filter(() => G.facilityCount(city, 'smithy'));
        if (G.facilityCount(city, 'stable')) opts.push('horse');
        if (opts.length) { const wk = opts.sort((a, b) => city.w[a] - city.w[b])[0]; tryDo(() => D.produce(city, by(3), wk)); }
      }
      if (!done && G.facilityCount(city, 'workshop') && front && city.w.ram < 1 && city.gold > 1500) tryDo(() => D.produce(city, by(3), 'ram'));
      if (!done) {
        const cand = G.S.officers.filter(o => o.status === 'free' && !o.hidden && G.city(o.city).faction === city.faction);
        if (cand.length) tryDo(() => D.employ(city, by(4), cand[0]));
      }
      if (!done && U.chance(0.5)) tryDo(() => D.search(city, by(2)));
      if (!done) break;
    }
  };

  // ---------- 军事 ----------
  AI.pickType = (city, offs, troops) => {
    let best = 'sword', bs = 40 * 0.85;
    for (const t of ['spear', 'halberd', 'bow', 'horse']) {
      const ty = R.TYPES[t];
      if (city.w[ty.weapon] < troops) continue;
      const s = (ty.atk + ty.def) / 2 * R.APT_MULT[C.bestApt(offs, ty.apt)] * (t === 'horse' ? 1.1 : 1);
      if (s > bs) { bs = s; best = t; }
    }
    return best;
  };
  AI.launch = (city, target, n) => {
    const fid = city.faction;
    let pool = G.idleIn(city.id).filter(o => o.s[0] + o.s[1] >= 100).sort((a, b) => (b.s[0] + b.s[1]) - (a.s[0] + a.s[1]));
    if (pool.filter(o => !G.isRuler(o)).length >= 2) pool = pool.filter(o => !G.isRuler(o));
    const keep = Math.max(3000, Math.round(city.troops * 0.25));
    let avail = city.troops - keep, made = 0;
    while (made < n && pool.length && avail >= 3000 && G.fac(fid).ap >= R.AP.march) {
      const lead = pool.shift();
      const deps = pool.filter(o => o.s[2] >= 60 || o.s[1] >= 70).slice(0, lead.s[2] < 70 ? 2 : 1);
      pool = pool.filter(o => !deps.includes(o));
      const troops = Math.min(Un.maxTroops(lead), avail);
      const offs = [lead, ...deps];
      let type = AI.pickType(city, offs, troops);
      if (made === 0 && target.faction >= 0 && city.w.ram > 0 && target.dur > 1500 && U.chance(0.4)) type = 'ram';
      const food = Math.min(city.food - 3000, Math.round(troops * 1.1));
      if (food < troops * 0.4) break;
      const r = Un.create(city, { offs: offs.map(o => o.id), type, troops, food, target: target.id });
      if (!r.ok) break;
      G.fac(fid).ap -= R.AP.march;
      avail -= troops; made++;
    }
    if (made) G.log(`${G.facName(fid)} 自 ${city.name} 出兵 ${made} 队，目标 ${target.name}`, G.isPlayer(target.faction) ? 'l-bad' : 'l-dim');
    return made;
  };
  AI.military = fid => {
    const S = G.S, units = G.unitsOf(fid).filter(u => u.type !== 'transport');
    const cities = G.citiesOf(fid);
    // 防御出击
    for (const city of cities) {
      const near = AI.enemiesNear(city, 4).filter(u => u.type !== 'transport');
      if (!near.length || city.troops < 8000 || G.fac(fid).ap < R.AP.march) continue;
      const t = near.sort((a, b) => a.troops - b.troops)[0];
      if (city.troops > t.troops * 1.2 && G.idleIn(city.id).length) {
        const lead = U.maxBy(G.idleIn(city.id), o => o.s[0] + o.s[1]);
        const troops = Math.min(Un.maxTroops(lead), city.troops - 4000);
        const r = Un.create(city, { offs: [lead.id], type: AI.pickType(city, [lead], troops), troops, food: Math.min(city.food, troops / 2), target: city.id });
        if (r.ok) { G.fac(fid).ap -= R.AP.march; r.unit.guard = true; }
      }
    }
    // 进攻
    if (units.length >= 10 || S.turn < 4) return;
    const cand = [];
    for (const city of cities) {
      if (city.troops < 9000 || G.idleIn(city.id).length < 1) continue;
      for (const t of AI.frontTargets(city)) {
        if (t.faction >= 0 && G.isPlayer(t.faction) && S.turn < 10) continue;
        const inField = units.filter(u => u.target === t.id).length;
        if (inField) continue;
        const defense = t.troops + U.sum(G.unitsOf(t.faction).filter(u => H.dist(u.c, u.r, t.c, t.r) < 8), u => u.troops);
        const rich = city.gold > 8000 && city.troops > D.troopCap(city) * 0.8;
        const ratio = (city.troops * 0.75) / Math.max(1500, defense);
        const need = t.faction < 0 ? 0.5 : rich ? 0.75 : 0.95;
        if (ratio >= need) cand.push({ city, t, score: ratio + (t.faction < 0 ? 3 : 0) + (t.kind === 'city' ? 0.5 : 0) });
      }
    }
    cand.sort((a, b) => b.score - a.score);
    let launched = 0;
    for (const c of cand) {
      if (launched >= 2) break;
      if (c.t.faction >= 0 && !U.chance(0.5)) continue;
      const n = c.t.faction < 0 ? 1 : U.clamp(Math.ceil(c.t.troops * 1.2 / 10000), 2, 5);
      if (AI.launch(c.city, c.t, n)) launched++;
    }
  };

  // 后方都市向前线输送兵力
  AI.logistics = fid => {
    const cities = G.citiesOf(fid);
    const fronts = cities.filter(AI.isFront);
    if (!fronts.length) return;
    for (const city of cities) {
      if (AI.isFront(city) || city.troops < 18000 || G.fac(fid).ap < R.AP.march || !G.idleIn(city.id).length) continue;
      const dest = fronts.sort((a, b) => H.dist(a.c, a.r, city.c, city.r) - H.dist(b.c, b.r, city.c, city.r))[0];
      if (H.dist(dest.c, dest.r, city.c, city.r) > 30) continue;
      const lead = U.maxBy(G.idleIn(city.id), o => -o.s[1]);
      const troops = city.troops - 10000;
      const w = {};
      for (const k of ['spear', 'halberd', 'crossbow', 'horse']) w[k] = Math.round(city.w[k] * 0.4);
      const r = Un.create(city, { offs: [lead.id], type: 'transport', troops, food: 0, cargo: { gold: Math.round(city.gold * 0.3), food: Math.round(city.food * 0.3), w }, target: dest.id });
      if (r.ok) G.fac(fid).ap -= R.AP.march;
    }
  };

  // ---------- 部队指挥 ----------
  AI.bestAction = u => {
    let best = null;
    const st = C.stats(u);
    for (const t of C.targets(u)) {
      const tacs = [null, ...R.TACTICS[u.type].filter(x => x.en <= u.energy && (!x.cityOnly || t.city))];
      for (const tac of tacs) {
        if (u.type === 'ram' && t.unit) continue;
        const p = C.preview(u, t, tac);
        let s = p.rate * p.dmg;
        if (t.city) s *= (t.city.id === u.target ? 1.5 : 1.1) + (p.dur ? p.dur / 800 : 0);
        if (t.unit && p.dmg >= t.unit.troops) s *= 1.6;
        if (tac) s -= tac.en * 6;
        if (!best || s > best.s) best = { kind: 'attack', t, tac, s };
      }
    }
    if (st.int >= 70) {
      for (const sch of R.SCHEMES) {
        if (sch.id === 'calm' || u.energy < sch.en + 5) continue;
        for (const k in G.S.units) {
          const t = G.S.units[k];
          if (!G.hostile(u.faction, t.faction) || H.dist(u.c, u.r, t.c, t.r) > sch.range || t.status) continue;
          const p = C.schemeRate(st, C.stats(t), sch);
          const s = p * (sch.id === 'fire' ? 450 : 350) * Math.sqrt(t.troops / 5000);
          if (!best || s > best.s) best = { kind: 'scheme', sch, t, s };
        }
      }
    }
    return best;
  };
  AI.doAction = (u, a) => {
    if (!a) return;
    if (a.kind === 'attack') C.attack(u, a.t, a.tac);
    else C.scheme(u, a.t.c, a.t.r, a.sch);
  };

  AI.unitTurn = u => {
    if (!G.S.units[u.id] || u.status) return;
    const fid = u.faction;
    let tgt = u.target != null ? G.city(u.target) : null;
    // 运输队
    if (u.type === 'transport') {
      if (!tgt || tgt.faction !== fid) tgt = C.nearestCity(fid, u.c, u.r);
      if (!tgt) return;
      const step = Un.stepToward(u, H.idx(tgt.c, tgt.r), 0);
      if (step) Un.moveTo(u, step.idx, step.reach);
      return;
    }
    // 撤退判断
    const lowFood = u.food < Math.ceil(u.troops / 20) * 3;
    if (u.troops < u.maxT * 0.25 || lowFood || u.retreat) {
      u.retreat = true;
      const home = C.nearestCity(fid, u.c, u.r);
      if (home) {
        const step = Un.stepToward(u, H.idx(home.c, home.r), 0);
        if (step) Un.moveTo(u, step.idx, step.reach);
        if (G.S.units[u.id] && !u.acted) AI.doAction(u, AI.bestAction(u));
      }
      return;
    }
    // 目标失效则换目标
    if (!tgt || tgt.faction === fid || (tgt.faction >= 0 && !G.hostile(fid, tgt.faction))) {
      if (u.guard) {
        const e = Object.values(G.S.units).filter(x => G.hostile(fid, x.faction)).sort((a, b) => H.dist(a.c, a.r, u.c, u.r) - H.dist(b.c, b.r, u.c, u.r))[0];
        if (!e || H.dist(e.c, e.r, u.c, u.r) > 8) { u.retreat = true; return AI.unitTurn(u); }
      } else {
        const home = G.city(u.home);
        const next = (home && home.faction === fid ? AI.frontTargets(home) : []).filter(t => t.faction >= 0)[0];
        if (next) u.target = next.id; else { u.retreat = true; return AI.unitTurn(u); }
        tgt = G.city(u.target);
      }
    }
    // 先看当前位置能否攻击
    let act = AI.bestAction(u);
    const inRangeOfTarget = tgt && C.inRange(u, tgt.c, tgt.r, R.TYPES[u.type].range);
    if (!act || (!inRangeOfTarget && !(act.t && act.t.unit && H.dist(act.t.c, act.t.r, u.c, u.r) <= 1))) {
      // 移动
      let goal = null;
      if (u.guard) {
        const e = Object.values(G.S.units).filter(x => G.hostile(fid, x.faction)).sort((a, b) => H.dist(a.c, a.r, u.c, u.r) - H.dist(b.c, b.r, u.c, u.r))[0];
        if (e) goal = H.idx(e.c, e.r);
      } else if (tgt) goal = H.idx(tgt.c, tgt.r);
      if (goal != null) {
        const step = Un.stepToward(u, goal, R.TYPES[u.type].ranged ? 2 : 1);
        if (step) Un.moveTo(u, step.idx, step.reach);
      }
      if (!G.S.units[u.id]) return;
      act = AI.bestAction(u);
    }
    AI.doAction(u, act);
  };

  // ---------- 俘虏、挖角、外交 ----------
  AI.handleCaptives = fid => {
    for (const city of G.citiesOf(fid)) {
      for (const t of G.captivesIn(city.id)) {
        const r = D.captive(city, t, 'employ');
        if (r.ok && !r.success) D.captive(city, t, U.chance(0.85) ? 'release' : 'execute');
      }
    }
  };
  AI.poach = fid => {
    if (!U.chance(0.15)) return;
    const f = G.fac(fid);
    if (f.ap < 40) return;
    for (const city of G.realCitiesOf(fid)) {
      const rec = U.maxBy(G.idleIn(city.id), G.cha);
      if (!rec || rec.s[4] < 70) continue;
      const tg = G.S.officers.filter(o => o.status === 'active' && o.faction >= 0 && o.faction !== fid && !o.fixed && o.loyalty < 80 && o.unit == null);
      if (!tg.length) return;
      const t = U.maxBy(tg, o => o.s[0] + o.s[1] + o.s[2] - o.loyalty);
      const r = D.employ(city, rec, t);
      if (r.ok && r.success) G.log(`${G.facName(fid)} 挖走了 ${t.name}！`, 'l-war');
      return;
    }
  };
  AI.diplomacy = fid => {
    const S = G.S, p = S.player;
    if (!G.fac(p).alive || !U.chance(0.04)) return;
    const rel = G.rel(fid, p);
    if (G.allied(fid, p) || G.truce(fid, p)) return;
    const theirPow = SG.Dip.power(fid), myPow = SG.Dip.power(p);
    if (rel >= 55 && U.chance(0.5)) S.proposals.push({ from: fid, kind: 'alliance' });
    else if (theirPow < myPow * 0.6 && rel >= 25) S.proposals.push({ from: fid, kind: 'truce' });
  };

  // ---------- 势力回合 ----------
  AI.runFaction = fid => {
    const f = G.fac(fid);
    if (!f.alive) return;
    AI.handleCaptives(fid);
    const cities = U.shuffle(G.realCitiesOf(fid));
    // 前线优先
    cities.sort((a, b) => (AI.isFront(b) ? 1 : 0) - (AI.isFront(a) ? 1 : 0));
    for (const c of cities) AI.domestic(c, 30);
    AI.military(fid);
    AI.logistics(fid);
    for (const c of cities) AI.domestic(c, 10);
    AI.poach(fid);
    AI.diplomacy(fid);
    for (const u of G.unitsOf(fid)) {
      try { AI.unitTurn(u); } catch (e) { console.error('AI unit error', e); }
    }
  };
})(window.SG);
