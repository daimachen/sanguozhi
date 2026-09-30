// 工事：开沟、陷坑、筑堤、决堤（水淹七军 / 引水灌城）、填沟
(function (SG) {
  const U = SG.U, R = SG.R, H = SG.Hex, G = SG.G, C = SG.C, T = SG.T, M = SG.Map;
  const W = SG.Works = {};
  const WS = () => G.S.works;
  const LAND = [T.PLAIN, T.WASTE, T.FOREST];

  W.def = id => R.WORKS.find(w => w.id === id);
  W.rainy = () => G.S.month >= 6 && G.S.month <= 9;
  W.trapVisible = i => { const t = WS().trap[i]; return t && G.friendly(t.f, G.S.player); };
  W.trapCount = fid => Object.values(WS().trap).filter(t => t.f === fid).length;

  // 可否执行（不含目标）
  W.check = (u, id) => {
    const d = W.def(id);
    if (u.acted) return '该部队本回合已行动';
    if (u.status) return '部队状态异常，无法施工';
    if (R.TYPES[u.type].noAttack) return '运输队无法施工';
    if (u.energy < d.en) return '气力不足';
    if (u.troops < d.minTroops) return `兵力不足（需 ${d.minTroops}）`;
    if (M.isWater(H.idx(u.c, u.r)) && id !== 'breach') return '水上无法施工';
    if (id === 'trap' && W.trapCount(u.faction) >= R.MAX_TRAPS) return `陷坑最多 ${R.MAX_TRAPS} 处`;
    return null;
  };

  // 可选目标格
  W.targets = (u, id) => {
    const out = new Set(), ws = WS();
    for (const [c, r] of H.neighbors(u.c, u.r)) {
      const i = H.idx(c, r), t = SG.map.t[i];
      if (id === 'breach') { if (ws.dam[i]) out.add(i); continue; }
      if (G.unitAt(c, r) || M.isPlace(i)) continue;
      if (id === 'ditch' && LAND.includes(t) && !ws.ditch[i] && !ws.flood[i]) out.add(i);
      else if (id === 'trap' && (LAND.includes(t) || t === T.HILL) && !ws.ditch[i] && !ws.trap[i] && !M.isWater(i)) out.add(i);
      else if (id === 'dam' && t === T.RIVER && !ws.dam[i] && !ws.flood[i]) out.add(i);
      else if (id === 'fill' && ws.ditch[i]) out.add(i);
    }
    return out;
  };

  // 壕沟与水面相连则灌满
  W.fillWater = () => {
    const ws = WS();
    let changed = true;
    while (changed) {
      changed = false;
      for (const k in ws.ditch) {
        const d = ws.ditch[k];
        if (d.water) continue;
        const [c, r] = H.cr(+k);
        if (H.neighbors(c, r).some(([nc, nr]) => M.isWater(H.idx(nc, nr)))) { d.water = true; changed = true; }
      }
    }
  };

  // 洪水范围：沿水系（河川、水渠、干沟）蔓延，再漫入低地
  W.floodArea = (damIdx, level) => {
    const ws = WS(), map = SG.map;
    const onBig = !!map.big[damIdx];
    const reach = (onBig ? 1 : 2) + Math.floor(level / 2), spread = 1 + Math.floor(level / 4);
    const maxLand = 16 + level * 4;
    const water = new Set([damIdx]), land = new Set(), places = new Set();
    let frontier = [damIdx];
    for (let step = 0; step < reach && frontier.length; step++) {
      const next = [];
      for (const i of frontier) {
        const [c, r] = H.cr(i);
        for (const [nc, nr] of H.neighbors(c, r)) {
          const j = H.idx(nc, nr);
          if (water.has(j) || map.t[j] === T.SEA || ws.dam[j]) continue;
          if (map.big[j] && !onBig) continue; // 大江大河吞没支流洪水
          if (M.isWater(j) || ws.ditch[j]) { water.add(j); next.push(j); }
        }
      }
      frontier = next;
    }
    const low = j => LAND.includes(map.t[j]) && !ws.dam[j];
    frontier = [...water];
    const seen = new Set(water);
    for (let step = 0; step < spread && frontier.length; step++) {
      const next = [];
      for (const i of frontier) {
        const [c, r] = H.cr(i);
        for (const [nc, nr] of H.neighbors(c, r)) {
          const j = H.idx(nc, nr);
          if (seen.has(j)) continue;
          seen.add(j);
          if (M.isPlace(j)) { places.add(map.city[j]); continue; }
          if (low(j) && land.size < maxLand) { land.add(j); next.push(j); }
        }
      }
      frontier = next;
    }
    water.delete(damIdx); land.add(damIdx);
    return { water, land, places };
  };

  const aptK = { S: 0.35, A: 0.55, B: 0.8, C: 1 };
  W.floodLoss = (u, level, onLand) => {
    const k = aptK[C.bestApt(C.offs(u), 5)] * (u.ship === 'dou' || u.ship === 'lou' ? 0.5 : 1);
    return Math.round(u.troops * (onLand ? 0.12 + 0.03 * level : 0.04 * level) * k);
  };
  // 预估：{敌方损失, 我方损失, 受灾部队数, 受灾城池}
  W.estimate = (fid, damIdx) => {
    const dam = WS().dam[damIdx];
    const a = W.floodArea(damIdx, dam.level);
    let foe = 0, own = 0, n = 0;
    for (const k in G.S.units) {
      const u = G.S.units[k], i = H.idx(u.c, u.r);
      const onLand = a.land.has(i);
      if (!onLand && !a.water.has(i)) continue;
      const loss = W.floodLoss(u, dam.level, onLand);
      n++;
      if (G.hostile(fid, u.faction)) foe += loss; else if (G.friendly(fid, u.faction)) own += loss;
    }
    for (const cid of a.places) {
      const city = G.city(cid), loss = Math.round(city.troops * 0.015 * dam.level);
      if (G.hostile(fid, city.faction)) foe += loss; else if (G.friendly(fid, city.faction)) own += loss;
    }
    return { foe, own, n, area: a, level: dam.level };
  };

  // 决堤
  W.flood = (damIdx, by) => {
    const ws = WS(), dam = ws.dam[damIdx];
    if (!dam) return { ok: false, msg: '此处没有堤坝' };
    const level = dam.level;
    const who = by ? by.name : '天灾';
    const a = W.floodArea(damIdx, level);
    delete ws.dam[damIdx];
    const [dc, dr] = H.cr(damIdx);
    if (level < 2) {
      G.log(`${who} 掘开堤坝，但水量不足，未成水患`, 'l-dim');
      return { ok: true, msg: '水量不足' };
    }
    const turns = 2 + Math.floor(level / 3);
    for (const i of a.land) {
      ws.flood[i] = Math.max(ws.flood[i] || 0, turns);
      delete ws.trap[i];
    }
    for (const i of a.water) if (ws.ditch[i]) ws.ditch[i].water = true;
    G.S.fires = G.S.fires.filter(f => !a.land.has(f.i) && !a.water.has(f.i));
    let hitUnits = 0, total = 0, involvesPlayer = by && G.isPlayer(by.faction);
    for (const k in G.S.units) {
      const u = G.S.units[k], i = H.idx(u.c, u.r);
      const onLand = a.land.has(i);
      if (!onLand && !a.water.has(i)) continue;
      const loss = W.floodLoss(u, level, onLand);
      if (!loss) continue;
      u.troops -= loss; total += loss; hitUnits++;
      if (onLand) { u.energy = Math.max(0, u.energy - 30); u.status = { kind: 'flood', turns: by && G.isPlayer(u.faction) && !G.isPlayer(by.faction) ? 2 : 1 }; }
      SG.fx(u.c, u.r, '水淹 -' + loss, '#4fc3f7');
      if (G.isPlayer(u.faction)) involvesPlayer = true;
      G.log(`${u.name} 遭洪水冲击，折损 ${loss}`, G.isPlayer(u.faction) ? 'l-bad' : by && G.isPlayer(by.faction) ? 'l-good' : 'l-dim');
    }
    for (const cid of a.places) {
      const city = G.city(cid);
      const dd = Math.round(city.maxDur * 0.04 * level), tl = Math.round(city.troops * 0.015 * level);
      city.dur = Math.max(0, city.dur - dd); city.troops = Math.max(0, city.troops - tl);
      city.food = Math.max(0, Math.round(city.food * (1 - 0.01 * level)));
      total += tl;
      SG.fx(city.c, city.r, `水灌 耐久-${dd}`, '#4fc3f7');
      if (G.isPlayer(city.faction)) involvesPlayer = true;
      G.log(`洪水灌入 ${city.name}，耐久 -${dd}，守军 -${tl}`, G.isPlayer(city.faction) ? 'l-bad' : 'l-war');
    }
    SG.fx(dc, dr, '决堤!', '#81d4fa');
    const epic = hitUnits >= 3;
    G.log(`${who} 决堤放水（水位 ${level}），淹没 ${a.land.size} 格${epic ? '——水淹七军！' : ''}`, involvesPlayer ? 'l-war' : 'l-dim');
    if (involvesPlayer && SG.UI) SG.UI.toast(epic ? '水淹七军！' : '决堤放水！');
    if (by && by.offs) G.merit(G.off(by.offs[0]), 20 + total / 100);
    C.cleanup(by && by.offs ? by : null);
    return { ok: true, msg: `洪水淹没 ${a.land.size} 格，敌我共折损 ${total}` };
  };

  // 执行工事
  W.run = (u, id, idx) => {
    const e = W.check(u, id);
    if (e) return { ok: false, msg: e };
    if (!W.targets(u, id).has(idx)) return { ok: false, msg: '目标不合适' };
    const d = W.def(id), ws = WS();
    u.energy -= d.en; u.acted = true; u.mp = 0;
    G.merit(G.off(u.offs[0]), 10);
    const [c, r] = H.cr(idx);
    const cls = G.isPlayer(u.faction) ? '' : 'l-dim';
    switch (id) {
      case 'ditch':
        ws.ditch[idx] = { f: u.faction, water: false };
        W.fillWater();
        SG.fx(c, r, ws.ditch[idx].water ? '水渠' : '壕沟', '#bcaaa4');
        G.log(`${u.name} 开掘${ws.ditch[idx].water ? '水渠，引水入沟' : '壕沟'}`, cls);
        break;
      case 'trap':
        ws.trap[idx] = { f: u.faction, t: G.S.turn };
        SG.fx(c, r, '陷坑', '#bcaaa4');
        if (G.isPlayer(u.faction)) G.log(`${u.name} 暗设陷坑`, cls);
        break;
      case 'dam':
        ws.dam[idx] = { f: u.faction, level: 0 };
        SG.fx(c, r, '筑堤', '#90caf9');
        G.log(`${u.name} 筑堤截流，开始蓄水`, G.isPlayer(u.faction) ? '' : 'l-war');
        break;
      case 'breach':
        return W.flood(idx, u);
      case 'fill':
        delete ws.ditch[idx];
        SG.fx(c, r, '填平', '#bcaaa4');
        G.log(`${u.name} 填平壕沟`, cls);
        break;
    }
    return { ok: true };
  };

  // 陷坑：返回路径上第一个会触发的陷坑位置
  W.trapOnPath = (u, path) => {
    const ws = WS();
    for (let k = 1; k < path.length; k++) {
      const t = ws.trap[path[k]];
      if (t && G.hostile(t.f, u.faction)) {
        const [c, r] = H.cr(path[k]);
        const o = G.unitAt(c, r);
        if (!o || o === u) return k;
      }
    }
    return -1;
  };
  W.spring = (u, idx) => {
    const t = WS().trap[idx];
    delete WS().trap[idx];
    const d = Math.round(300 + u.troops * 0.08);
    u.troops -= d; u.energy = Math.max(0, u.energy - 15); u.mp = 0;
    SG.fx(u.c, u.r, '中陷坑! -' + d, '#ff8a65');
    G.log(`${u.name} 踏入陷坑，折损 ${d}`, G.isPlayer(u.faction) ? 'l-bad' : t && G.isPlayer(t.f) ? 'l-good' : 'l-dim');
    C.cleanup(null);
  };

  // 每旬：蓄水、退水、雨季溃堤
  W.endRound = () => {
    const ws = WS();
    for (const k in ws.dam) {
      const d = ws.dam[k];
      d.level = Math.min(R.DAM_MAX, d.level + (W.rainy() ? 2 : 1));
      if (d.level >= R.DAM_MAX && W.rainy() && U.chance(0.12)) {
        G.log(`连日大雨，${G.facName(d.f)}所筑堤坝溃决！`, 'l-war');
        W.flood(+k, null);
      }
    }
    for (const k in ws.flood) { ws.flood[k]--; if (ws.flood[k] <= 0) delete ws.flood[k]; }
    for (const k in ws.trap) if (G.S.turn - (ws.trap[k].t || 0) > 60) delete ws.trap[k]; // 陷坑经年坍塌
    W.fillWater();
  };

  // ---------- AI ----------
  W.aiConsider = u => {
    if (u.acted || u.status || R.TYPES[u.type].noAttack) return false;
    const ws = WS();
    // 决堤：敌损远大于我损
    for (const [c, r] of H.neighbors(u.c, u.r)) {
      const i = H.idx(c, r);
      if (!ws.dam[i]) continue;
      const e = W.estimate(u.faction, i);
      if (e.level >= 3 && e.foe > 1500 && e.foe > e.own * 2) { W.run(u, 'breach', i); return true; }
      if (G.hostile(u.faction, ws.dam[i].f) && e.own === 0 && e.foe === 0) { W.run(u, 'breach', i); return true; }
    }
    return false;
  };
  // AI 防守部队布设陷坑
  W.aiTrap = u => {
    if (W.check(u, 'trap') || !U.chance(0.15)) return false;
    const foes = Object.values(G.S.units).filter(x => G.hostile(u.faction, x.faction));
    if (!foes.length) return false;
    const e = U.maxBy(foes, x => -H.dist(x.c, x.r, u.c, u.r));
    if (H.dist(e.c, e.r, u.c, u.r) > 6) return false;
    const opts = [...W.targets(u, 'trap')].sort((a, b) => H.dist(...H.cr(a), e.c, e.r) - H.dist(...H.cr(b), e.c, e.r));
    if (!opts.length) return false;
    W.run(u, 'trap', opts[0]);
    return true;
  };
})(window.SG);
