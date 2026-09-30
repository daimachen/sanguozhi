// 战斗：部队能力、攻击、战法、计略、攻城、溃灭、俘虏、单挑
(function (SG) {
  const U = SG.U, R = SG.R, H = SG.Hex, G = SG.G;
  const C = SG.C = {};
  SG.FX = [];
  SG.fx = (c, r, text, color = '#fff') => {
    const now = performance.now();
    const n = SG.FX.filter(f => f.c === c && f.r === r && now - f.t < 900).length;
    SG.FX.push({ c, r, text, color, t: now, off: n * 16 });
  };

  C.offs = u => u.offs.map(G.off);
  C.bestApt = (offs, k) => {
    let best = 'C';
    for (const o of offs) { const a = o.apt[k]; if ('SABC'.indexOf(a) < 'SABC'.indexOf(best)) best = a; }
    return best;
  };
  C.inWater = u => SG.Map.isWater(H.idx(u.c, u.r));

  // 部队能力
  C.stats = u => {
    const offs = C.offs(u), ty = R.TYPES[u.type];
    const lea = Math.max(...offs.map(o => G.st(o, 0))), war = Math.max(...offs.map(o => G.st(o, 1))), int = Math.max(...offs.map(o => G.st(o, 2)));
    let apt = ty.apt >= 0 ? C.bestApt(offs, ty.apt) : 'B';
    let atk, def, mult = R.APT_MULT[apt];
    const naval = C.inWater(u) && u.type !== 'transport';
    if (naval) {
      const sh = R.SHIPS[u.ship || 'zou'];
      apt = C.bestApt(offs, 5);
      mult = R.APT_MULT[apt] * (G.hasSkill(offs, '水将') ? 1.3 : 1);
      atk = sh.atk; def = sh.def;
    } else { atk = ty.atk; def = ty.def; }
    return {
      offs, lea, war, int, apt, naval,
      atk: atk * mult * (0.5 + war / 200),
      def: def * mult * (0.5 + lea / 200),
    };
  };
  C.cityStats = city => {
    const gov = G.governor(city), lea = gov ? G.st(gov, 0) : 30, war = gov ? G.st(gov, 1) : 30, int = gov ? G.st(gov, 2) : 30;
    const gateK = city.kind === 'gate' ? 1.35 : city.kind === 'port' ? 1.1 : 1;
    return {
      offs: G.officersIn(city.id), lea, war, int,
      atk: 60 * (0.5 + war / 200) * gateK,
      def: 70 * (0.5 + lea / 200) * (0.6 + 0.6 * city.dur / city.maxDur) * gateK,
    };
  };
  const energyK = e => 0.6 + 0.4 * U.clamp(e, 0, 100) / 100;
  const terrainK = (c, r) => {
    const t = SG.map.t[H.idx(c, r)];
    return t === SG.T.FOREST ? 0.9 : t === SG.T.HILL ? 0.85 : 1;
  };

  // 可攻击判定
  C.canHitCity = (u, city) => city.faction !== u.faction && (city.faction < 0 || G.hostile(u.faction, city.faction));
  C.inRange = (u, c, r, rng) => {
    const d = H.dist(u.c, u.r, c, r);
    return d >= rng[0] && d <= rng[1];
  };
  // 列出可攻击目标
  // 射程与可用战法（水上改用水军）
  C.rangeOf = u => {
    const ty = R.TYPES[u.type];
    if (ty.noAttack) return [0, 0];
    if (C.inWater(u)) return u.type === 'bow' || u.ship === 'lou' ? [1, 2] : [1, 1];
    return ty.range;
  };
  C.tacticsOf = u => (R.TYPES[u.type].noAttack ? [] : C.inWater(u) ? R.TACTICS.navy : R.TACTICS[u.type]);
  C.tacticRange = (u, tac) => (tac && tac.range ? tac.range : C.rangeOf(u));
  C.targets = (u, rng) => {
    rng = rng || C.rangeOf(u);
    const out = [];
    if (R.TYPES[u.type].noAttack) return out;
    for (const k in G.S.units) {
      const t = G.S.units[k];
      if (G.hostile(u.faction, t.faction) && C.inRange(u, t.c, t.r, rng)) out.push({ unit: t, c: t.c, r: t.r });
    }
    for (const city of G.S.cities) {
      if (C.canHitCity(u, city) && C.inRange(u, city.c, city.r, rng)) out.push({ city, c: city.c, r: city.r });
    }
    return out;
  };

  // 伤害计算
  C.damage = (att, attStats, def, defStats, mult, vsCity) => {
    let d = Math.sqrt(Math.max(att.troops, 1)) * 7 * (attStats.atk / Math.max(defStats.def, 1)) * mult * energyK(att.energy);
    if (!vsCity) {
      d *= terrainK(def.c, def.r);
      const cm = (R.COUNTER[att.type] || {})[def.type];
      if (cm) d *= cm;
      if (G.hasSkill(defStats.offs, '铁壁')) d *= 0.8;
    } else {
      d *= 1.6;
      if (def.dur <= 0) d *= 2;
      if (G.hasSkill(attStats.offs, '攻城')) d *= 1.5;
    }
    if (G.hasSkill(attStats.offs, '神将')) d *= 1.15;
    if (att.type === 'horse' && G.hasSkill(attStats.offs, '骑神')) d *= 1.15;
    return d;
  };

  // 战法成功率 / 暴击率
  C.tacticRate = (st, tgtWar) => {
    let p = R.APT_RATE[st.apt] + (st.war - tgtWar) / 250;
    if (G.hasSkill(st.offs, '神将')) p += 0.15;
    if (G.hasSkill(st.offs, '奸雄')) p += 0.1;
    return U.clamp(p, 0.15, 0.98);
  };
  C.critRate = (u, st) => {
    const has = s => G.hasSkill(st.offs, s);
    if (has('飞将')) return 1;
    if ((u.type === 'spear' || u.type === 'halberd') && has('斗神')) return 1;
    if ((u.type === 'spear' && has('枪将')) || (u.type === 'halberd' && has('戟将')) || (u.type === 'bow' && has('弓将')) ||
      (u.type === 'horse' && (has('骑将') || has('骑神')))) return 1;
    let p = 0.08 + st.war / 1000;
    if (has('霸王')) p += 0.5;
    if (has('勇将')) p += 0.25;
    return U.clamp(p, 0, 1);
  };
  C.schemeRate = (st, tgtSt, sch) => {
    const has = s => G.hasSkill(st.offs, s);
    if (tgtSt && (G.hasSkill(tgtSt.offs, '洞察') || G.hasSkill(tgtSt.offs, '深谋'))) return sch.id === 'calm' ? 1 : 0;
    if (sch.id === 'calm') return 1;
    if (has('神算')) return 1;
    if (sch.id === 'fire' && has('火神')) return 1;
    let p = 0.45 + (st.int - (tgtSt ? tgtSt.int : 50)) / 90;
    if (has('深谋')) p += 0.2;
    if (has('鬼谋')) p += 0.15;
    if (has('奸雄')) p += 0.1;
    return U.clamp(p, 0.05, 0.95);
  };

  // 预估（UI、AI 用）
  C.preview = (u, tgt, tactic) => {
    const st = C.stats(u);
    if (tgt.unit) {
      const ts = C.stats(tgt.unit);
      const rate = tactic ? C.tacticRate(st, ts.war) : 1;
      const dmg = C.damage(u, st, tgt.unit, ts, tactic ? tactic.mult * (tactic.hits || 1) : 1, false);
      return { rate, dmg: Math.round(dmg) };
    }
    const cs = C.cityStats(tgt.city);
    const rate = tactic ? C.tacticRate(st, cs.war) : 1;
    const m = tactic ? 1 + (tactic.mult - 1) * 0.5 : 1;
    const dmg = C.damage(u, st, tgt.city, cs, m, true);
    return { rate, dmg: Math.round(dmg), dur: Math.round(C.durDamage(u, st, m)) };
  };
  C.durDamage = (u, st, mult) => {
    let d = Math.sqrt(Math.max(u.troops, 1)) * R.TYPES[u.type].siege * 1.5 * (0.6 + st.war / 250) * mult;
    if (G.hasSkill(st.offs, '攻城')) d *= 1.5;
    return d;
  };

  // 对单个目标施加伤害
  function hitUnit(u, st, t, mult, label) {
    const ts = C.stats(t);
    const d = Math.max(1, Math.round(C.damage(u, st, t, ts, mult, false) * (0.9 + Math.random() * 0.2)));
    t.troops -= d;
    SG.fx(t.c, t.r, '-' + d, '#ff6b6b');
    if (G.hasSkill(st.offs, '威风')) t.energy = Math.max(0, t.energy - 8);
    return d;
  }
  function hitCity(u, st, city, mult) {
    mult = 1 + (mult - 1) * 0.5; // 战法对城池效果减半
    const cs = C.cityStats(city);
    const d = Math.max(1, Math.round(C.damage(u, st, city, cs, mult, true) * (0.9 + Math.random() * 0.2)));
    const dd = Math.round(C.durDamage(u, st, mult) * (0.9 + Math.random() * 0.2));
    city.troops = Math.max(0, city.troops - d);
    city.dur = Math.max(0, city.dur - dd);
    SG.fx(city.c, city.r, `-${d} / 耐久-${dd}`, '#ffb74d');
    return d;
  }

  // 攻击（tactic 为空则为普通攻击）；返回 {ok,msg}
  C.attack = (u, tgt, tactic) => {
    const ty = R.TYPES[u.type];
    const rng = C.tacticRange(u, tactic);
    if (u.acted) return { ok: false, msg: '该部队本回合已行动' };
    if (!C.inRange(u, tgt.c, tgt.r, rng)) return { ok: false, msg: '目标不在射程内' };
    if (tactic && u.energy < tactic.en) return { ok: false, msg: '气力不足' };
    if (tactic && tactic.cityOnly && !tgt.city) return { ok: false, msg: '该战法只能对都市使用' };
    if (u.type === 'ram' && tgt.unit && !C.inWater(u)) return { ok: false, msg: '冲车无法攻击部队' };
    const st = C.stats(u), name = u.name;
    const tName = tgt.unit ? tgt.unit.name : tgt.city.name;
    u.acted = true; u.mp = 0;
    let msg = '';
    const pl = G.isPlayer(u.faction) || (tgt.unit ? G.isPlayer(tgt.unit.faction) : G.isPlayer(tgt.city.faction));
    const cls = pl ? 'l-war' : 'l-dim';
    if (tactic) {
      u.energy -= tactic.en;
      const tWar = tgt.unit ? C.stats(tgt.unit).war : C.cityStats(tgt.city).war;
      if (!U.chance(C.tacticRate(st, tWar))) {
        SG.fx(u.c, u.r, tactic.name + ' 失败', '#bbb');
        G.log(`${name} 对 ${tName} 发动「${tactic.name}」失败`, cls);
        return { ok: true, msg: '战法失败' };
      }
    }
    let mult = tactic ? tactic.mult : 1, crit = false;
    if (tactic && U.chance(C.critRate(u, st))) { crit = true; mult *= 1.5; }
    if (tactic) SG.fx(u.c, u.r, tactic.name + (crit ? '·暴击!' : ''), crit ? '#ffd54f' : '#fff');

    if (tgt.city) {
      const d = hitCity(u, st, tgt.city, mult);
      msg = `${name} ${tactic ? '以「' + tactic.name + '」' : ''}攻打 ${tgt.city.name}，歼敌 ${d}${crit ? '（暴击）' : ''}`;
      G.log(msg, cls);
      C.addMerit(u, d / 60);
      if (tgt.city.troops <= 0) { C.addMerit(u, 300); C.captureCity(tgt.city, u); }
      return { ok: true, msg };
    }
    const t = tgt.unit;
    let total = 0;
    const hits = tactic && tactic.hits ? tactic.hits : 1;
    for (let k = 0; k < hits && t.troops > 0; k++) total += hitUnit(u, st, t, mult);
    // 连带目标
    const extra = [];
    if (tactic && tactic.sweep) {
      for (const k in G.S.units) {
        const o = G.S.units[k];
        if (o === t || !G.hostile(u.faction, o.faction)) continue;
        const adjA = H.dist(u.c, u.r, o.c, o.r) === 1;
        if (tactic.sweep === 'all' ? adjA : adjA && H.dist(t.c, t.r, o.c, o.r) === 1) extra.push([o, 0.8]);
      }
    }
    if (tactic && tactic.splash) {
      for (const k in G.S.units) {
        const o = G.S.units[k];
        if (o !== t && o !== u && G.hostile(u.faction, o.faction) && H.dist(t.c, t.r, o.c, o.r) === 1) extra.push([o, tactic.splash]);
      }
    }
    if (tactic && tactic.pierce) {
      const [bc, br] = H.beyond(u.c, u.r, t.c, t.r, 1);
      const o = H.inside(bc, br) && G.unitAt(bc, br);
      if (o && G.hostile(u.faction, o.faction)) extra.push([o, 0.8]);
    }
    for (const [o, k] of extra) hitUnit(u, st, o, mult * k);
    if (tactic && tactic.fire) C.setFire(H.idx(t.c, t.r), 2, 1);
    // 击退
    const oldC = t.c, oldR = t.r;
    if (tactic && tactic.push && t.troops > 0) {
      const [pc, pr] = H.beyond(u.c, u.r, t.c, t.r, tactic.push);
      if (C.canStand(pc, pr)) { t.c = pc; t.r = pr; if (tactic.follow) { u.c = oldC; u.r = oldR; } }
      else hitUnit(u, st, t, 0.15);
    }
    msg = `${name} ${tactic ? '以「' + tactic.name + '」' : ''}攻击 ${tName}，歼敌 ${total}${crit ? '（暴击）' : ''}`;
    G.log(msg, cls);
    C.addMerit(u, total / 60 + (t.troops <= 0 ? 100 : 0));
    // 单挑
    if (crit && t.troops > 0) {
      const ts = C.stats(t);
      if (st.war >= 70 && ts.war >= 70 && U.chance(0.22)) C.startDuel(u, t);
    }
    // 反击
    if (!tactic && C.rangeOf(u)[1] === 1 && t.troops > 0 && !R.TYPES[t.type].noAttack && t.type !== 'ram' &&
      H.dist(u.c, u.r, t.c, t.r) === 1) {
      const ts = C.stats(t);
      const d = Math.max(1, Math.round(C.damage(t, ts, u, st, 0.5, false) * (0.9 + Math.random() * 0.2)));
      u.troops -= d; SG.fx(u.c, u.r, '-' + d, '#ff6b6b');
    }
    C.cleanup(u);
    return { ok: true, msg };
  };

  // 功绩：主将全额，副将一半
  C.addMerit = (u, v) => { u.offs.forEach((id, k) => G.merit(G.off(id), k ? v / 2 : v)); };

  // 处理溃灭
  C.cleanup = killer => {
    for (const k in G.S.units) {
      const o = G.S.units[k];
      if (o.troops <= 0) C.defeatUnit(o, o === killer ? null : killer);
    }
  };

  C.canStand = (c, r) => {
    if (!H.inside(c, r)) return false;
    const i = H.idx(c, r), t = SG.map.t[i];
    if (t === SG.T.SEA || t === SG.T.PEAK || t === SG.T.CITY || t === SG.T.GATE) return false;
    return !G.unitAt(c, r);
  };

  C.setFire = (i, turns, k) => {
    const t = SG.map.t[i], water = SG.Map.isWater(i);
    if (water && !G.unitAt(...H.cr(i))) return; // 水上只有战船可烧
    const ex = G.S.fires.find(f => f.i === i);
    const tt = water ? 1 : turns + (t === SG.T.FOREST ? 1 : 0);
    if (ex) { ex.turns = Math.max(ex.turns, tt); ex.k = Math.max(ex.k, k); } else G.S.fires.push({ i, turns: tt, k });
  };

  // 计略
  C.scheme = (u, c, r, sch) => {
    if (u.acted) return { ok: false, msg: '该部队本回合已行动' };
    if (u.energy < sch.en) return { ok: false, msg: '气力不足' };
    const d = H.dist(u.c, u.r, c, r);
    if (d > sch.range) return { ok: false, msg: '目标超出范围' };
    const st = C.stats(u), tu = G.unitAt(c, r), tc = G.cityAt(c, r);
    if (sch.id === 'calm') {
      if (!tu || !G.friendly(u.faction, tu.faction)) return { ok: false, msg: '需以自军部队为目标' };
      u.energy -= sch.en; u.acted = true; u.mp = 0;
      tu.status = null; SG.fx(c, r, '镇静', '#90caf9');
      G.log(`${u.name} 使 ${tu.name} 恢复镇静`, 'l-dim');
      return { ok: true };
    }
    if (sch.id !== 'fire' && (!tu || !G.hostile(u.faction, tu.faction))) return { ok: false, msg: '需以敌部队为目标' };
    if (sch.id === 'fire') {
      if (tu && !G.hostile(u.faction, tu.faction)) return { ok: false, msg: '不能对友军放火' };
      if (tc && !C.canHitCity(u, tc)) return { ok: false, msg: '不能对己方都市放火' };
      if (SG.Map.isWater(H.idx(c, r)) && !tu) return { ok: false, msg: '水上无船可烧' };
    }
    const tSt = tu ? C.stats(tu) : tc ? C.cityStats(tc) : null;
    const p = C.schemeRate(st, tSt, sch);
    u.energy -= sch.en; u.acted = true; u.mp = 0;
    const pl = G.isPlayer(u.faction) || (tu && G.isPlayer(tu.faction)) || (tc && G.isPlayer(tc.faction));
    const cls = pl ? 'l-war' : 'l-dim';
    const tName = tu ? tu.name : tc ? tc.name : `(${c},${r})`;
    if (!U.chance(p)) {
      SG.fx(u.c, u.r, sch.name + ' 失败', '#bbb');
      G.log(`${u.name} 对 ${tName} 施展「${sch.name}」被识破`, cls);
      return { ok: true, msg: '失败' };
    }
    if (sch.id === 'fire') {
      C.setFire(H.idx(c, r), 2, G.hasSkill(st.offs, '火神') ? 2 : 1);
      SG.fx(c, r, '火计!', '#ff7043');
    } else {
      tu.status = { kind: sch.id, turns: (sch.id === 'confuse' ? U.randInt(1, 2) : 1) + (G.isPlayer(tu.faction) && !G.isPlayer(u.faction) ? 1 : 0) };
      C.addMerit(u, 30);
      if (sch.id === 'false') tu.energy = Math.max(0, tu.energy - 20);
      SG.fx(c, r, sch.id === 'confuse' ? '混乱' : '伪报', '#ce93d8');
    }
    G.log(`${u.name} 对 ${tName} 施展「${sch.name}」成功`, cls);
    return { ok: true, msg: '成功' };
  };

  // 找最近的己方都市
  C.nearestCity = (fid, c, r, kindCity) => {
    let best = null, bd = Infinity;
    for (const city of G.S.cities) {
      if (city.faction !== fid || (kindCity && city.kind !== 'city')) continue;
      const d = H.dist(c, r, city.c, city.r);
      if (d < bd) { bd = d; best = city; }
    }
    return best;
  };

  // 俘虏或逃回
  C.captureOrFlee = (o, captorF, c, r, pCapture) => {
    const hold = captorF >= 0 ? C.nearestCity(captorF, c, r) : null;
    if (hold && o.skill !== '遁走' && U.chance(pCapture)) {
      o.status = 'captive'; o.captor = captorF; o.city = hold.id; o.unit = null; o.rank = null;
      G.log(`${o.name} 被 ${G.facName(captorF)} 俘虏！`, G.isPlayer(o.faction) ? 'l-bad' : G.isPlayer(captorF) ? 'l-good' : 'l-dim');
      if (G.isRuler(o)) C.rulerLost(o.faction);
      return true;
    }
    const home = C.nearestCity(o.faction, c, r);
    o.unit = null;
    if (home) { o.city = home.id; o.acted = true; }
    else { o.status = 'free'; o.faction = -1; o.hidden = false; }
    return false;
  };

  C.defeatUnit = (u, killer) => {
    G.log(`${u.name} 部队溃灭！`, G.isPlayer(u.faction) ? 'l-bad' : killer && G.isPlayer(killer.faction) ? 'l-good' : 'l-dim');
    SG.fx(u.c, u.r, '溃灭', '#ff5252');
    delete G.S.units[u.id];
    for (const o of C.offs(u)) {
      if (o.status !== 'active') continue;
      C.captureOrFlee(o, killer ? killer.faction : -1, u.c, u.r, killer && H.dist(killer.c, killer.r, u.c, u.r) <= 1 ? 0.35 : 0.15);
    }
    C.checkFaction(u.faction);
  };

  // 攻陷都市
  C.captureCity = (city, u) => {
    const old = city.faction, nf = u.faction;
    G.log(`${u.name} 攻陷 ${city.name}！${old >= 0 ? '（原属 ' + G.facName(old) + '）' : ''}`,
      G.isPlayer(nf) ? 'l-good' : G.isPlayer(old) ? 'l-bad' : 'l-dim');
    if (G.isPlayer(nf) || G.isPlayer(old)) SG.UI && SG.UI.toast(`${G.facName(nf)} 攻陷 ${city.name}`);
    // 守城武将：逃亡或被俘
    for (const o of G.officersIn(city.id)) {
      const others = G.citiesOf(old).filter(x => x.id !== city.id);
      if (others.length && U.chance(0.55)) { o.city = U.pick(others).id; o.acted = true; }
      else C.captureOrFlee(o, nf, city.c, city.r, 1);
    }
    // 城中俘虏获释
    for (const o of G.captivesIn(city.id)) {
      if (o.captor !== old) continue;
      const home = o.faction >= 0 && G.fac(o.faction).alive ? C.nearestCity(o.faction, city.c, city.r) : null;
      if (o.faction === nf || home) { o.status = 'active'; o.city = (o.faction === nf ? city : home).id; o.captor = -1; }
      else { o.status = 'free'; o.faction = -1; o.captor = -1; o.hidden = false; }
    }
    // 在野武将留在原地
    city.faction = nf;
    city.gold = Math.round(city.gold * 0.5);
    city.food = Math.round(city.food * 0.5) + u.food;
    city.troops = u.troops;
    city.energy = u.energy;
    city.order = Math.min(city.order, 50);
    city.dur = Math.max(city.dur, Math.round(city.maxDur * 0.2));
    city.delegate = false;
    C.unitIntoCity(u, city, true);
    if (old >= 0) {
      const f = G.fac(old);
      if (f.capital === city.id) {
        const nc = G.realCitiesOf(old)[0] || G.citiesOf(old)[0];
        if (nc) f.capital = nc.id;
      }
      C.checkFaction(old);
    }
  };

  // 部队入城
  C.unitIntoCity = (u, city, troopsCounted) => {
    if (!troopsCounted) {
      const tot = city.troops + u.troops;
      city.energy = tot > 0 ? Math.round((city.energy * city.troops + u.energy * u.troops) / tot) : city.energy;
      city.troops += u.troops;
      city.food += u.food;
    }
    if (u.ship && u.ship !== 'zou') city.w[u.ship] = (city.w[u.ship] || 0) + 1;
    const wk = R.TYPES[u.type].weapon;
    if (wk) city.w[wk] += R.WEAPONS[wk].siege ? 1 : Math.max(0, u.troops);
    if (u.cargo) {
      city.gold += u.cargo.gold || 0; city.food += u.cargo.food || 0;
      for (const k in (u.cargo.w || {})) city.w[k] += u.cargo.w[k];
    }
    for (const o of C.offs(u)) { if (o.status === 'active') { o.unit = null; o.city = city.id; } }
    delete G.S.units[u.id];
  };

  // 君主被俘/身亡：继承
  C.rulerLost = fid => {
    const f = G.fac(fid);
    const cands = G.officersOf(fid).filter(o => o.id !== f.ruler);
    if (!cands.length) { C.destroyFaction(fid); return; }
    const nr = U.maxBy(cands, o => o.s[4] * 2 + o.s[0] + (o.fixed ? 60 : 0));
    const oldName = G.off(f.ruler).name;
    f.ruler = nr.id; nr.loyalty = 100; nr.fixed = true;
    f.name = nr.name + '军';
    G.log(`${oldName} 失陷，${nr.name} 继任为 ${f.name} 之主`, G.isPlayer(fid) ? 'l-bad' : 'l-war');
  };

  C.checkFaction = fid => {
    if (fid < 0) return;
    const f = G.fac(fid);
    if (!f.alive) return;
    if (G.citiesOf(fid).length === 0) C.destroyFaction(fid);
  };

  C.destroyFaction = fid => {
    const f = G.fac(fid);
    if (!f.alive) return;
    f.alive = false;
    G.log(`${f.name} 灭亡！`, G.isPlayer(fid) ? 'l-bad' : 'l-war');
    SG.UI && SG.UI.toast(`${f.name} 灭亡`);
    for (const u of G.unitsOf(fid)) {
      for (const o of C.offs(u)) { o.unit = null; }
      delete G.S.units[u.id];
    }
    for (const c of G.citiesOf(fid)) { c.faction = -1; c.troops = Math.round(c.troops * 0.3); }
    for (const o of G.S.officers) {
      if (o.faction === fid && (o.status === 'active' || o.status === 'captive')) {
        if (o.status === 'active') { o.status = 'free'; o.hidden = false; }
        o.faction = -1; o.loyalty = 100; o.fixed = false; o.rank = null;
      }
      if (o.status === 'captive' && o.captor === fid) { o.status = o.faction >= 0 ? 'active' : 'free'; o.captor = -1; }
    }
  };

  // ---------- 单挑 ----------
  C.duelSim = (a, b) => {
    let ha = 100, hb = 100;
    const lines = [`${a.name}（武${a.s[1]}） VS ${b.name}（武${b.s[1]}）`];
    for (let round = 1; round <= 10 && ha > 0 && hb > 0; round++) {
      const da = Math.round(U.randInt(4, 14) * Math.pow(a.s[1] / b.s[1], 2.2));
      const db = Math.round(U.randInt(4, 14) * Math.pow(b.s[1] / a.s[1], 2.2));
      hb -= da; ha -= db;
      lines.push(`第${round}合：${a.name} 造成 ${da}，${b.name} 造成 ${db}　[${Math.max(0, ha)} : ${Math.max(0, hb)}]`);
    }
    let winner = null, loser = null;
    if (ha > hb + 10) { winner = a; loser = b; } else if (hb > ha + 10) { winner = b; loser = a; }
    lines.push(winner ? `${winner.name} 胜！` : '不分胜负，各自退回本阵。');
    return { winner, loser, knockout: winner && Math.min(ha, hb) <= 0, lines };
  };
  C.startDuel = (u, t) => {
    const a = U.maxBy(C.offs(u), G.war), b = U.maxBy(C.offs(t), G.war);
    const res = C.duelSim(a, b);
    G.log(`单挑！${a.name} VS ${b.name}：${res.winner ? res.winner.name + ' 获胜' : '平手'}`, 'l-war');
    if (res.winner) {
      const lu = res.loser === a ? u : t, wu = lu === u ? t : u;
      lu.troops = Math.round(lu.troops * 0.85); lu.energy = Math.max(0, lu.energy - 25);
      wu.energy = Math.min(100, wu.energy + 10);
      if (res.knockout && U.chance(0.35) && !G.isRuler(res.loser) && res.loser.skill !== '遁走' && lu.offs.length > 1) {
        lu.offs = lu.offs.filter(id => id !== res.loser.id);
        C.captureOrFlee(res.loser, wu.faction, lu.c, lu.r, 1);
      }
    }
    if (SG.UI && (G.isPlayer(u.faction) || G.isPlayer(t.faction))) SG.UI.showDuel(res);
  };
})(window.SG);
