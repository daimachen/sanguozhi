// 部队：出征、移动范围、移动、寻路
(function (SG) {
  const U = SG.U, R = SG.R, H = SG.Hex, G = SG.G, C = SG.C, T = SG.T;
  const Un = SG.Units = {};

  // 统兵上限由官职决定，君主 15000
  Un.maxTroops = o => {
    if (G.isRuler(o)) return 15000;
    return R.GRADE_CAP[G.grade(o)] + (o.s[0] >= 85 ? 1000 : 0);
  };
  Un.mpOf = u => R.TYPES[u.type].mp + (G.hasSkill(C.offs(u), '强行') ? 4 : 0) + (SG.Tech ? SG.Tech.mpBonus(u) : 0);

  // 城外可出阵的格子
  Un.exitHexes = city => H.neighbors(city.c, city.r).filter(([c, r]) => C.canStand(c, r));

  // 出征：cfg = {offs:[id...], type, troops, food, cargo:{gold,food,w:{}}}
  Un.create = (city, cfg) => {
    const ty = R.TYPES[cfg.type];
    const offs = cfg.offs.map(G.off);
    if (!offs.length) return { ok: false, msg: '请选择主将' };
    if (offs.some(o => o.city !== city.id || o.status !== 'active' || o.unit != null || o.acted)) return { ok: false, msg: '武将不可用' };
    const troops = Math.floor(cfg.troops);
    if (troops < 100) return { ok: false, msg: '兵力过少' };
    if (troops > city.troops) return { ok: false, msg: '兵力不足' };
    if (cfg.type !== 'transport' && troops > Un.maxTroops(offs[0])) return { ok: false, msg: '超过主将可统领兵力' };
    const wk = ty.weapon;
    if (wk) {
      const need = R.WEAPONS[wk].siege ? 1 : troops;
      if (city.w[wk] < need) return { ok: false, msg: `${R.WEAPONS[wk].name}不足` };
    }
    const cargo = cfg.cargo || null;
    const ship = cfg.ship && cfg.ship !== 'zou' ? cfg.ship : 'zou';
    if (ship !== 'zou' && !(city.w[ship] > 0)) return { ok: false, msg: `${R.SHIPS[ship].name}不足` };
    const food = Math.floor(cfg.food || 0);
    const needFood = food + (cargo ? cargo.food || 0 : 0);
    if (needFood > city.food) return { ok: false, msg: '兵粮不足' };
    if (cargo && (cargo.gold || 0) > city.gold) return { ok: false, msg: '金不足' };
    if (cargo && cargo.w) for (const k in cargo.w) if (cargo.w[k] > city.w[k]) return { ok: false, msg: '兵装不足' };
    const exits = Un.exitHexes(city);
    if (!exits.length) return { ok: false, msg: '城外没有可出阵的空地' };
    const [c, r] = exits.sort((a, b) => SG.Map.moveCost(H.idx(...a), cfg.type, ship) - SG.Map.moveCost(H.idx(...b), cfg.type, ship))[0];
    // 扣除
    city.troops -= troops; city.food -= needFood;
    if (wk) city.w[wk] -= R.WEAPONS[wk].siege ? 1 : troops;
    if (ship !== 'zou') city.w[ship] -= 1;
    if (cargo) { city.gold -= cargo.gold || 0; if (cargo.w) for (const k in cargo.w) city.w[k] -= cargo.w[k]; }
    const id = G.S.nextUnit++;
    const u = {
      id, name: offs[0].name + '队', faction: city.faction, c, r, type: cfg.type, troops, maxT: Math.max(troops, 1),
      food, energy: city.energy, offs: offs.map(o => o.id), mp: 0, acted: false, moved: false, status: null,
      cargo, ship, target: cfg.target ?? null, home: city.id,
    };
    u.mp = Un.mpOf(u);
    G.S.units[id] = u;
    for (const o of offs) { o.unit = id; o.acted = true; }
    return { ok: true, unit: u };
  };

  // 移动范围：返回 Map(idx -> {cost, prev, stop})
  Un.reachable = u => {
    const res = new Map();
    if (u.acted || u.moved || u.status) return res;
    const occ = new Map();
    for (const k in G.S.units) { const o = G.S.units[k]; if (o !== u) occ.set(H.idx(o.c, o.r), o); }
    const zoc = new Set();
    for (const o of occ.values()) {
      if (!G.hostile(u.faction, o.faction)) continue;
      for (const [nc, nr] of H.neighbors(o.c, o.r)) zoc.add(H.idx(nc, nr));
    }
    const start = H.idx(u.c, u.r), heap = new U.Heap();
    const best = new Map([[start, 0]]);
    res.set(start, { cost: 0, prev: -1, stop: true });
    heap.push(0, start);
    while (heap.size) {
      const cur = heap.pop(), cc = best.get(cur);
      if (cur !== start && zoc.has(cur)) continue; // 进入敌军接触范围即停止
      const curCity = SG.map.city[cur];
      if (cur !== start && curCity >= 0 && G.city(curCity).faction !== u.faction && !G.friendly(u.faction, G.city(curCity).faction)) continue;
      const [c, r] = H.cr(cur);
      for (const [nc, nr] of H.neighbors(c, r)) {
        const ni = H.idx(nc, nr);
        let k = SG.Map.moveCost(ni, u.type, u.ship);
        if (!isFinite(k)) continue;
        const nd = cc + k;
        if (nd > u.mp) continue;
        const o = occ.get(ni);
        if (o && !G.friendly(u.faction, o.faction)) continue;
        if (SG.Forts && SG.Forts.at(ni)) continue;
        const cid = SG.map.city[ni];
        let stop = !o;
        if (cid >= 0) {
          const city = G.city(cid);
          if (city.faction === u.faction) stop = true;
          else if (city.faction < 0 && city.troops <= 0 && u.type !== 'transport') stop = true;
          else if (G.friendly(u.faction, city.faction)) stop = false;
          else continue;
        }
        if (best.has(ni) && best.get(ni) <= nd) continue;
        best.set(ni, nd);
        res.set(ni, { cost: nd, prev: cur, stop });
        heap.push(nd, ni);
      }
    }
    res.prevs = new Map();
    for (const [i, v] of res) { res.prevs.set(i, v.prev); if (!v.stop) res.delete(i); }
    return res;
  };

  // 执行移动
  Un.moveTo = (u, idx, reach) => {
    reach = reach || Un.reachable(u);
    if (!reach.has(idx)) return { ok: false, msg: '无法移动到该处' };
    let path = [];
    for (let i = idx; i !== -1 && i != null; i = reach.prevs.get(i)) path.push(i);
    path.reverse();
    // 陷坑：踏入即停
    const tk = SG.Works ? SG.Works.trapOnPath(u, path) : -1;
    if (tk > 0) { path = path.slice(0, tk + 1); idx = path[tk]; }
    const [c, r] = H.cr(idx);
    u.anim = { path, t: performance.now() };
    u.c = c; u.r = r; u.moved = true; u.mp = 0;
    if (tk > 0) { SG.Works.spring(u, idx); return { ok: true, trapped: true }; }
    const cid = SG.map.city[idx];
    if (cid >= 0) {
      const city = G.city(cid);
      if (city.faction === u.faction) {
        G.log(`${u.name} 进入 ${city.name}`, G.isPlayer(u.faction) ? '' : 'l-dim');
        C.unitIntoCity(u, city, false);
        return { ok: true, entered: true };
      }
      if (city.faction < 0) {
        C.captureCity(city, u);
        return { ok: true, entered: true };
      }
    }
    return { ok: true };
  };

  // AI 寻路：朝向目标格前进；返回可到达的最佳落脚点
  Un.pathTo = (u, goal) => {
    const [gc, gr] = H.cr(goal);
    const costFn = (ni) => {
      const k = SG.Map.moveCost(ni, u.type, u.ship);
      if (SG.Forts && SG.Forts.at(ni) && ni !== goal) return Infinity;
      const cid = SG.map.city[ni];
      if (cid >= 0 && ni !== goal) {
        const city = G.city(cid);
        if (city.faction !== u.faction && !G.friendly(u.faction, city.faction)) return Infinity;
      }
      return k;
    };
    return SG.Map.astar(H.idx(u.c, u.r), goal, costFn);
  };
  Un.stepToward = (u, goal, keepDist = 1) => {
    const path = Un.pathTo(u, goal);
    if (!path) return null;
    const reach = Un.reachable(u);
    const [gc, gr] = H.cr(goal);
    let bestI = null;
    for (let k = path.length - 1; k >= 0; k--) {
      const i = path[k];
      if (!reach.has(i)) continue;
      const [c, r] = H.cr(i);
      if (i === goal && SG.map.city[goal] >= 0 && G.city(SG.map.city[goal]).faction === u.faction) { bestI = i; break; }
      if (i !== goal && SG.map.city[i] >= 0) continue;
      if (H.dist(c, r, gc, gr) < keepDist) continue;
      bestI = i; break;
    }
    if (bestI == null || bestI === H.idx(u.c, u.r)) return null;
    return { idx: bestI, reach };
  };

  // 回合结束时部队结算
  Un.upkeep = u => {
    const offs = C.offs(u);
    const need = Math.ceil(u.troops / 20 * (G.hasSkill(offs, '屯田') ? 0.5 : 1) * (SG.Tech && SG.Tech.has(u.faction, 'ar1') ? 0.75 : 1));
    u.food -= need;
    if (u.food < 0) {
      u.food = 0;
      const loss = Math.max(100, Math.round(u.troops * 0.12));
      u.troops -= loss; u.energy = Math.max(0, u.energy - 10);
      if (G.isPlayer(u.faction)) G.log(`${u.name} 兵粮耗尽，${loss} 名士兵逃亡`, 'l-bad');
    }
    let de = 2;
    if (G.hasSkill(offs, '鼓舞')) de += 8;
    const reg = SG.map.region[H.idx(u.c, u.r)];
    if (reg >= 0 && G.city(reg).faction === u.faction) de += 2;
    u.energy = U.clamp(u.energy + de, 0, 100);
    if (G.hasSkill(offs, '医者')) u.troops = Math.min(u.maxT, Math.round(u.troops * 1.03));
    if (u.status) { u.status.turns--; if (u.status.turns <= 0) u.status = null; }
    u.acted = false; u.moved = false; u.mp = Un.mpOf(u);
  };
})(window.SG);
