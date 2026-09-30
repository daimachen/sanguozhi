// 历史事件与随机事件
(function (SG) {
  const U = SG.U, R = SG.R, H = SG.Hex, G = SG.G, C = SG.C;
  const EV = SG.Events = {};

  const off = name => G.S.officers.find(o => o.name === name);
  const alive = o => o && (o.status === 'active' || o.status === 'captive' || o.status === 'free');
  // 某人为君主时返回其势力
  const rulerFac = name => { const o = off(name); return o && o.status === 'active' && G.isRuler(o) ? o.faction : -1; };
  const capital = fid => G.city(G.fac(fid).capital) || G.citiesOf(fid)[0];
  const strip = s => s.replace(/<[^>]+>/g, '');

  EV.announce = (title, text, cls = 'l-war') => {
    G.log(`【${title}】${strip(text)}`, cls);
    G.S.eventQueue.push({ title, text });
  };

  // 从部队中移除武将（部队无人统领则并入最近都市）
  const leaveUnit = o => {
    if (o.unit == null) return;
    const u = G.S.units[o.unit];
    o.unit = null;
    if (!u) return;
    u.offs = u.offs.filter(x => x !== o.id);
    if (u.offs.length) { u.name = G.off(u.offs[0]).name + '队'; return; }
    const home = C.nearestCity(u.faction, u.c, u.r);
    if (home) C.unitIntoCity(u, home, false); else delete G.S.units[u.id];
  };
  // 武将归附某势力
  const join = (o, fid) => {
    leaveUnit(o);
    const cap = capital(fid);
    const old = o.faction;
    o.status = 'active'; o.faction = fid; o.city = cap.id; o.captor = -1; o.hidden = false; o.rank = null; o.acted = true;
    if (old >= 0 && old !== fid) C.checkFaction(old);
  };
  // 武将亡故（可指定继承人）
  const die = (o, heirName) => {
    const fid = o.faction, wasRuler = G.isRuler(o);
    leaveUnit(o);
    o.status = 'dead'; o.rank = null;
    if (!wasRuler) return;
    const h = off(heirName);
    if (h && h.status === 'active' && h.faction === fid) {
      const f = G.fac(fid);
      f.ruler = h.id; f.name = h.name + '军'; h.loyalty = 100; h.fixed = true; h.rank = null;
    } else C.rulerLost(fid);
  };

  EV.list = [
    {
      id: 'tianzi', year: 196, month: 8,
      cond: () => true,
      run: () => {
        const own = n => G.S.cities.find(c => c.name === n).faction;
        const cao = rulerFac('曹操');
        let fid = cao >= 0 && ['许昌', '洛阳', '陈留'].some(n => own(n) === cao) ? cao : -1;
        if (fid < 0) fid = [own('洛阳'), own('许昌'), own('长安')].find(f => f >= 0) ?? -1;
        if (fid < 0) return;
        const f = G.fac(fid), ruler = G.ruler(fid);
        f.emperor = true;
        capital(fid).gold += 3000;
        for (const o of G.officersOf(fid)) o.loyalty = Math.min(100, o.loyalty + 5);
        EV.announce('迎奉天子', `汉献帝东归，${ruler.name} 率军迎驾，奉天子以令不臣。<br>${f.name}：每旬行动力 +15，金 +3000，全体武将忠诚 +5。`);
      },
    },
    {
      id: 'yuanshu_emperor', year: 197, month: 1,
      cond: () => rulerFac('袁术') >= 0,
      run: () => {
        const fid = rulerFac('袁术');
        G.fac(fid).pretender = true;
        for (const f of G.S.factions) if (f.alive && f.id !== fid) G.addRel(fid, f.id, -30);
        for (const o of G.officersOf(fid)) if (!o.fixed) o.loyalty = Math.max(0, o.loyalty - 10);
        EV.announce('袁术称帝', '袁术自以为「代汉者当涂高」，于寿春僭号称帝，建号仲氏。天下诸侯共愤之！<br>各势力对袁术友好度 -30，其部下忠诚 -10。');
      },
    },
    {
      id: 'guanyu_return', year: 195, month: 1, retry: true, until: 230,
      cond: () => {
        const lf = rulerFac('刘备'), g = off('关羽');
        return lf >= 0 && g && ((g.status === 'active' && g.faction !== lf) || g.status === 'captive');
      },
      run: () => {
        const lf = rulerFac('刘备'), g = off('关羽');
        join(g, lf); g.loyalty = 100; g.fixed = true;
        EV.announce('千里走单骑', '关羽得知兄长刘备下落，挂印封金，护送二嫂过五关、斩六将，千里走单骑，终归刘备麾下。');
      },
    },
    {
      id: 'zhangfei_return', year: 195, month: 1, retry: true, until: 230,
      cond: () => {
        const lf = rulerFac('刘备'), z = off('张飞');
        return lf >= 0 && z && ((z.status === 'active' && z.faction !== lf) || z.status === 'captive');
      },
      run: () => {
        const lf = rulerFac('刘备'), z = off('张飞');
        join(z, lf); z.loyalty = 100; z.fixed = true;
        EV.announce('古城相会', '张飞据古城，闻兄长消息，引兵来投。桃园兄弟再度聚首！');
      },
    },
    {
      id: 'sunce_death', year: 200, month: 4,
      cond: () => rulerFac('孙策') >= 0,
      run: () => {
        const s = off('孙策');
        die(s, '孙权');
        const fid = s.faction;
        EV.announce('孙策遇刺', `孙策于丹徒狩猎，遭许贡门客伏击，伤重而亡，年仅二十六。临终谓：「举贤任能，以保江东，我不如卿。」<br>${G.facName(fid)} 由 ${G.ruler(fid) ? G.ruler(fid).name : '他人'} 继承。`);
      },
    },
    {
      id: 'yuanshao_death', year: 202, month: 5,
      cond: () => rulerFac('袁绍') >= 0,
      run: () => {
        const y = off('袁绍'), fid = y.faction;
        die(y, off('袁尚') && off('袁尚').faction === fid ? '袁尚' : '袁谭');
        for (const o of G.officersOf(fid)) if (!o.fixed) o.loyalty = Math.max(0, o.loyalty - 8);
        EV.announce('袁绍病逝', `袁绍忧愤成疾，呕血而亡。诸子争位，河北人心浮动（部下忠诚 -8）。<br>${G.facName(fid)} 由 ${G.ruler(fid) ? G.ruler(fid).name : '他人'} 继承。`);
      },
    },
    {
      id: 'sangu', year: 206, month: 1, retry: true, until: 220,
      cond: () => rulerFac('刘备') >= 0 && off('诸葛亮') && off('诸葛亮').status === 'free' && U.chance(0.4),
      run: () => {
        const fid = rulerFac('刘备'), z = off('诸葛亮');
        join(z, fid); z.loyalty = 100; z.fixed = true;
        EV.announce('三顾茅庐', '刘备三顾隆中，诸葛亮纵论天下三分之势（隆中对），感其诚意，出山辅佐。');
      },
    },
    {
      id: 'liubiao_death', year: 208, month: 8,
      cond: () => rulerFac('刘表') >= 0,
      run: () => {
        const l = off('刘表'), fid = l.faction;
        die(l, off('刘琮') && off('刘琮').faction === fid ? '刘琮' : '刘琦');
        EV.announce('刘表病逝', `荆州牧刘表病逝，蔡氏拥立幼子。<br>${G.facName(fid)} 由 ${G.ruler(fid) ? G.ruler(fid).name : '他人'} 继承。`);
      },
    },
    {
      id: 'east_wind', year: 208, month: 11,
      cond: () => true,
      run: () => {
        G.S.eastWind = G.S.turn + 9;
        EV.announce('东南风起', '隆冬时节，江上忽起东南大风。三个月内水上火攻伤害加倍，火势更易在战船间蔓延——火烧连营，正当其时！');
      },
    },
    {
      id: 'zhangsong', year: 211, month: 1, retry: true, until: 216,
      cond: () => rulerFac('刘璋') >= 0 && rulerFac('刘备') >= 0 && off('张松').status === 'active' && off('张松').faction === rulerFac('刘璋'),
      run: () => {
        const lb = rulerFac('刘备'), lz = rulerFac('刘璋');
        const who = ['张松', '法正', '孟达'].map(off).filter(o => o.status === 'active' && o.faction === lz);
        who.forEach(o => join(o, lb));
        EV.announce('张松献图', `张松暗携西川地图投奔刘备，${who.map(o => o.name).join('、')} 归附刘备。`);
      },
    },
  ];

  // ---------- 随机事件 ----------
  const pickCity = f => { const cs = G.S.cities.filter(c => c.kind === 'city' && c.faction >= 0 && (!f || f(c))); return cs.length ? U.pick(cs) : null; };
  const note = (city, msg, bad) => {
    const pl = G.isPlayer(city.faction);
    G.log(msg, pl ? (bad ? 'l-bad' : 'l-good') : 'l-dim');
    if (pl && SG.UI) SG.UI.toast(msg);
  };
  EV.random = () => {
    const m = G.S.month;
    if (m >= 5 && m <= 9 && U.chance(0.05)) {
      const c = pickCity();
      if (c) {
        const hit = [c, ...[...SG.map.adj[c.id]].map(G.city).filter(x => x.kind === 'city' && x.faction >= 0)];
        hit.forEach(x => { x.food = Math.round(x.food * 0.7); x.order = Math.max(0, x.order - 5); });
        hit.forEach(x => note(x, `蝗灾肆虐 ${x.name}，兵粮减少三成`, true));
      }
    }
    if ((m <= 3 || m >= 11) && U.chance(0.03)) {
      const c = pickCity(x => x.troops > 5000);
      if (c) { const l = Math.round(c.troops * 0.08); c.troops -= l; note(c, `${c.name} 疫病流行，士兵病倒 ${l} 人`, true); }
    }
    if (m === 7 && U.chance(0.35)) {
      const c = pickCity();
      if (c) { const g = SG.Dom.foodIncome(c); c.food += g; note(c, `${c.name} 风调雨顺，额外丰收兵粮 ${g}`); }
    }
    if (U.chance(0.05)) {
      const c = pickCity(x => x.order < 60);
      if (c) {
        c.gold = Math.round(c.gold * 0.85); c.order = Math.max(0, c.order - 5); c.troops = Math.round(c.troops * 0.97);
        note(c, `${c.name} 山贼作乱，劫掠府库`, true);
      }
    }
    if (U.chance(0.05)) {
      const c = pickCity(x => G.facilityCount(x, 'market') > 0);
      if (c) { c.gold += 400; note(c, `西域商队途经 ${c.name}，献金 400`); }
    }
    if (m >= 6 && m <= 8 && U.chance(0.03)) {
      const c = pickCity(x => G.nearWater(x.id));
      if (c) {
        c.dur = Math.round(c.dur * 0.9); c.food = Math.round(c.food * 0.9);
        note(c, `${c.name} 江河泛滥，城墙与粮仓受损`, true);
      }
    }
    if (U.chance(0.04)) {
      const hid = G.S.officers.filter(o => o.status === 'free' && o.hidden && G.city(o.city).faction >= 0);
      if (hid.length) {
        const o = U.pick(hid), c = G.city(o.city);
        o.hidden = false;
        if (G.isPlayer(c.faction)) note(c, `听闻名士 ${o.name} 客居 ${c.name}，可前往登用`);
      }
    }
  };

  // 每月初检查
  EV.check = () => {
    const S = G.S;
    if (S.xun !== 0) return;
    for (const e of EV.list) {
      if (S.eventsDone[e.id]) continue;
      if (S.year < e.year || (S.year === e.year && S.month < e.month)) continue;
      if (e.until && S.year > e.until) { S.eventsDone[e.id] = 'skip'; continue; }
      let ok = false;
      try { ok = e.cond(); } catch (err) { ok = false; }
      if (!ok) { if (!e.retry) S.eventsDone[e.id] = 'skip'; continue; }
      S.eventsDone[e.id] = true;
      try { e.run(); } catch (err) { console.error('event', e.id, err); }
    }
    EV.random();
  };
})(window.SG);
