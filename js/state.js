// 游戏状态：新游戏、查询、日志、存读档
(function (SG) {
  const U = SG.U, R = SG.R, H = SG.Hex;
  const G = SG.G = {};
  G.S = null;

  G.city = id => G.S.cities[id];
  G.fac = id => G.S.factions[id];
  G.off = id => G.S.officers[id];
  G.unit = id => G.S.units[id];
  G.facName = fid => fid >= 0 ? G.S.factions[fid].name : '空白';
  G.facColor = fid => fid >= 0 ? G.S.factions[fid].color : '#9a9a9a';
  G.citiesOf = fid => G.S.cities.filter(c => c.faction === fid);
  G.realCitiesOf = fid => G.S.cities.filter(c => c.faction === fid && c.kind === 'city');
  G.unitsOf = fid => Object.values(G.S.units).filter(u => u.faction === fid);
  G.officersOf = fid => G.S.officers.filter(o => o.status === 'active' && o.faction === fid);
  G.officersIn = cid => G.S.officers.filter(o => o.status === 'active' && o.city === cid && o.unit == null);
  G.idleIn = cid => G.officersIn(cid).filter(o => !o.acted);
  G.freeIn = cid => G.S.officers.filter(o => o.status === 'free' && o.city === cid);
  G.captivesIn = cid => G.S.officers.filter(o => o.status === 'captive' && o.city === cid);
  G.unitAt = (c, r) => {
    for (const k in G.S.units) { const u = G.S.units[k]; if (u.c === c && u.r === r) return u; }
    return null;
  };
  G.cityAt = (c, r) => {
    const id = SG.map.city[H.idx(c, r)];
    return id >= 0 ? G.S.cities[id] : null;
  };
  G.lea = o => o.s[0]; G.war = o => o.s[1]; G.int = o => o.s[2]; G.pol = o => o.s[3]; G.cha = o => o.s[4];
  G.hasSkill = (offs, sk) => offs.some(o => o.skill === sk);
  // 官职（仅对在任的现役武将有效）
  G.rank = o => (o.rank && o.status === 'active' && o.faction >= 0 && !G.isRuler(o) ? R.RANK[o.rank] : null);
  G.grade = o => { const r = G.rank(o); return r ? r.grade : 0; };
  // 含官职加成的能力值（k: 0统 1武 2智 3政 4魅）
  G.st = (o, k) => { const r = G.rank(o); return o.s[k] + (r ? r.bonus[k] : 0); };
  G.merit = (o, v) => {
    if (!o || o.status !== 'active' || o.faction < 0) return;
    o.merit = (o.merit || 0) + Math.round(v);
    if (SG.Tech) SG.Tech.addTP(o.faction, v * 0.05);
  };
  G.title = fid => R.TITLES[G.S.factions[fid].title || 0];
  G.titleName = fid => G.title(fid).name;
  G.nearWater = cid => {
    const p = SG.map.places[cid];
    if (p.water == null) p.water = H.within(p.c, p.r, 3).some(([c, r]) => { const t = SG.map.t[H.idx(c, r)]; return t === SG.T.RIVER || t === SG.T.SEA; });
    return p.water;
  };
  G.ruler = fid => G.S.officers[G.S.factions[fid].ruler];
  G.isRuler = o => o.faction >= 0 && G.S.factions[o.faction].ruler === o.id;
  G.dateStr = () => R.dateStr(G.S);

  // 外交关系
  G.relKey = (a, b) => a < b ? a + '_' + b : b + '_' + a;
  G.rel = (a, b) => G.S.rel[G.relKey(a, b)] ?? 30;
  G.addRel = (a, b, v) => { G.S.rel[G.relKey(a, b)] = U.clamp(G.rel(a, b) + v, 0, 100); };
  G.allied = (a, b) => (G.S.ally[G.relKey(a, b)] || 0) > G.S.turn;
  G.truce = (a, b) => (G.S.truce[G.relKey(a, b)] || 0) > G.S.turn;
  // 是否敌对（可交战）
  G.hostile = (a, b) => a !== b && a >= 0 && b >= 0 && !G.allied(a, b) && !G.truce(a, b);
  G.friendly = (a, b) => a === b || (a >= 0 && b >= 0 && G.allied(a, b));

  G.governor = city => U.maxBy(G.officersIn(city.id), o => o.s[0] + o.s[4] + (G.isRuler(o) ? 500 : 0));
  G.facilityCount = (city, type) => city.facs.filter(f => f.type === type && f.done).length;
  G.totalTroops = fid => U.sum(G.citiesOf(fid), c => c.troops) + U.sum(G.unitsOf(fid), u => u.troops);

  // 日志
  G.log = (msg, cls = '') => {
    G.S.log.push({ d: G.dateStr(), msg, cls });
    if (G.S.log.length > 300) G.S.log.shift();
    if (SG.UI && SG.UI.onLog) SG.UI.onLog();
  };
  G.isPlayer = fid => fid === G.S.player;

  // ---------- 新游戏 ----------
  G.parseOfficers = () => {
    const out = [];
    for (const line of SG.DATA.officerText.split('\n')) {
      const p = line.trim().split(/\s+/);
      if (p.length < 10) continue;
      const o = {
        id: out.length, name: p[0], s: p.slice(1, 6).map(Number), apt: p[6], skill: p[7] === '-' ? '' : p[7],
        rulerName: p[8], cityName: p[9], fixed: false, appear: 0,
      };
      for (const x of p.slice(10)) { if (x === 'L') o.fixed = true; else if (/^\d+$/.test(x)) o.appear = +x; }
      out.push(o);
    }
    return out;
  };

  G.newGame = playerRuler => {
    const sc = SG.DATA.scenario, map = SG.map || SG.Map.build();
    const S = G.S = {
      ver: 2, scenario: sc.name, year: sc.year, month: sc.month, xun: 0, turn: 1,
      player: -1, factions: [], cities: [], officers: [], units: {}, nextUnit: 1,
      fires: [], log: [], rel: {}, ally: {}, truce: {}, proposals: [], over: false,
      works: { ditch: {}, trap: {}, dam: {}, flood: {} }, forts: {}, eventsDone: {}, eventQueue: [], auto: 'manual', eastWind: 0,
    };
    const raw = G.parseOfficers(), offByName = {};
    raw.forEach(o => { offByName[o.name] = o; });
    // 势力
    sc.factions.forEach((f, id) => {
      S.factions.push({
        id, name: f.ruler + '军', color: f.color, ruler: offByName[f.ruler].id, capital: map.byName[f.capital].id,
        alive: true, ap: 120,
      });
    });
    const facByRuler = {};
    S.factions.forEach(f => { facByRuler[raw[f.ruler].name] = f.id; });
    // 都市
    for (const p of map.places) {
      const def = R.CITY_DEFAULT[p.kind === 'city' ? p.size : p.kind];
      const owner = sc.factions.findIndex(f => f.cities.includes(p.kind === 'port' ? map.places[p.parent].name : p.name));
      const ov = sc.cityInit[p.name] || {};
      const c = {
        id: p.id, name: p.name, kind: p.kind, size: p.size, c: p.c, r: p.r, faction: owner,
        gold: ov.gold ?? (owner >= 0 ? def.gold : Math.round(def.gold / 3)),
        food: ov.food ?? (owner >= 0 ? def.food : Math.round(def.food / 3)),
        troops: ov.troops ?? (owner >= 0 ? def.troops : 0),
        energy: 80, order: owner >= 0 ? 80 : 60, dur: def.dur, maxDur: def.dur,
        w: { spear: ov.spear ?? def.spear, halberd: ov.halberd ?? def.halberd, crossbow: ov.crossbow ?? def.crossbow,
          horse: ov.horse ?? def.horse, ram: 0, tower: 0, catapult: 0, dou: def.dou || 0, lou: def.lou || 0 },
        facs: [], delegate: false,
      };
      if (p.kind === 'city' && p.size >= 2 && G.nearWater(p.id)) c.w.dou = 1;
      if (owner < 0) { for (const k in c.w) c.w[k] = Math.floor(c.w[k] / 4); }
      if (p.kind === 'city') {
        def.facs.forEach((type, k) => { if (p.plots[k] != null) c.facs.push({ type, plot: p.plots[k], done: true, prog: 0, work: 0 }); });
      }
      S.cities.push(c);
    }
    // 武将
    for (const o of raw) {
      const city = map.byName[o.cityName];
      const fid = o.rulerName === '-' ? -1 : facByRuler[o.rulerName];
      const off = {
        id: o.id, name: o.name, s: o.s, apt: o.apt, skill: o.skill, fixed: o.fixed,
        faction: fid ?? -1, city: city ? city.id : 0, loyalty: 100, status: 'active', hidden: false,
        appear: o.appear, acted: false, unit: null, captor: -1, rank: null,
        merit: Math.max(0, Math.round(((o.s[0] + o.s[1] + o.s[2] + o.s[3]) / 4 + Math.max(o.s[0], o.s[1], o.s[2]) * 0.8 - 100) * 70)),
      };
      if (off.faction < 0) {
        off.status = o.appear > S.year ? 'unborn' : 'free';
        off.hidden = true;
      } else {
        off.loyalty = o.fixed ? 100 : U.clamp(78 + Math.round((raw[S.factions[off.faction].ruler].s[4] - 60) / 3) + U.randInt(0, 8), 60, 99);
      }
      S.officers.push(off);
    }
    for (const f of S.factions) { S.officers[f.ruler].loyalty = 100; S.officers[f.ruler].fixed = true; }
    // 爵位与官职
    for (const f of S.factions) {
      const n = S.cities.filter(c => c.faction === f.id && c.kind === 'city').length;
      f.title = 0;
      R.TITLES.forEach((t, k) => { if (n >= t.need) f.title = k; });
      SG.Ranks.autoAssign(f.id, true);
    }
    // 初始关系：同盟雏形
    for (let a = 0; a < S.factions.length; a++) for (let b = a + 1; b < S.factions.length; b++) S.rel[G.relKey(a, b)] = 30;
    S.player = facByRuler[playerRuler] ?? 0;
    G.log(`${sc.year}年 剧本「${sc.name}」开始。主公：${S.officers[S.factions[S.player].ruler].name}`, 'l-good');
    return S;
  };

  // ---------- 存档 ----------
  G.SAVE_KEY = 'sgz11_save_';
  G.save = slot => {
    try {
      localStorage.setItem(G.SAVE_KEY + slot, JSON.stringify(G.S));
      localStorage.setItem(G.SAVE_KEY + slot + '_meta', JSON.stringify({
        date: G.dateStr(), fac: G.S.factions[G.S.player].name, at: new Date().toLocaleString(), ver: G.S.ver,
      }));
      return true;
    } catch (e) { console.error(e); return false; }
  };
  G.saveMeta = slot => {
    try { const m = JSON.parse(localStorage.getItem(G.SAVE_KEY + slot + '_meta') || 'null'); return m && m.ver === 2 ? m : null; } catch (e) { return null; }
  };
  G.load = slot => {
    try {
      const txt = localStorage.getItem(G.SAVE_KEY + slot);
      if (!txt) return false;
      if (!SG.map) SG.Map.build();
      const st = JSON.parse(txt);
      if (st.ver !== 2) return false;
      G.S = st;
      return true;
    } catch (e) { console.error(e); return false; }
  };
})(window.SG);
