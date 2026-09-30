// 地图生成：地形、河流、山脉、道路、都市地块与势力范围
(function (SG) {
  const H = SG.Hex, U = SG.U;
  const T = SG.T = { SEA: 0, PLAIN: 1, WASTE: 2, FOREST: 3, HILL: 4, PEAK: 5, RIVER: 6, CITY: 7, GATE: 8, PORT: 9 };
  SG.T_NAMES = ['海', '平原', '荒地', '森林', '山地', '峻岭', '河川', '都市', '关隘', '港口'];
  const M = SG.Map = {};

  function pointInPoly(x, y, poly) {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const [xi, yi] = poly[i], [xj, yj] = poly[j];
      if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  }

  function makeNoise(rng, step) {
    const gw = Math.ceil(H.W / step) + 2, gh = Math.ceil(H.H / step) + 2;
    const g = new Float32Array(gw * gh).map(() => rng());
    return (c, r) => {
      const x = c / step, y = r / step, x0 = Math.floor(x), y0 = Math.floor(y);
      const fx = x - x0, fy = y - y0, sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
      const v = (i, j) => g[j * gw + i];
      const a = v(x0, y0) * (1 - sx) + v(x0 + 1, y0) * sx;
      const b = v(x0, y0 + 1) * (1 - sx) + v(x0 + 1, y0 + 1) * sx;
      return a * (1 - sy) + b * sy;
    };
  }

  function polyCells(pts) {
    const out = [];
    for (let i = 0; i + 1 < pts.length; i++) out.push(...H.line(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1]));
    return out;
  }

  // 通用 A*（不考虑部队）
  M.astar = (start, goal, costFn) => {
    const N = H.W * H.H, dist = new Float32Array(N).fill(Infinity), prev = new Int32Array(N).fill(-1);
    const [gc, gr] = H.cr(goal), heap = new U.Heap();
    dist[start] = 0; heap.push(0, start);
    while (heap.size) {
      const cur = heap.pop();
      if (cur === goal) break;
      const [c, r] = H.cr(cur);
      for (const [nc, nr] of H.neighbors(c, r)) {
        const ni = H.idx(nc, nr), k = costFn(ni, cur);
        if (!isFinite(k)) continue;
        const nd = dist[cur] + k;
        if (nd < dist[ni]) { dist[ni] = nd; prev[ni] = cur; heap.push(nd + H.dist(nc, nr, gc, gr) * 0.5, ni); }
      }
    }
    if (!isFinite(dist[goal])) return null;
    const path = [];
    for (let i = goal; i !== -1; i = prev[i]) path.push(i);
    return path.reverse();
  };

  M.build = () => {
    const D = SG.DATA, N = H.W * H.H;
    const rng = U.seeded(194);
    const map = {
      t: new Uint8Array(N).fill(T.PLAIN), road: new Uint8Array(N), big: new Uint8Array(N), coast: new Uint8Array(N),
      city: new Int16Array(N).fill(-1), plot: new Int16Array(N).fill(-1), region: new Int16Array(N).fill(-1),
      adj: [], places: [],
    };
    const n1 = makeNoise(rng, 5), n2 = makeNoise(rng, 4), n3 = makeNoise(rng, 7);
    // 1. 基础地形
    for (let r = 0; r < H.H; r++) for (let c = 0; c < H.W; c++) {
      const i = H.idx(c, r), a = n1(c, r), b = n2(c, r), w = n3(c, r);
      let t = T.PLAIN;
      if (b > (r > 34 ? 0.5 : 0.66)) t = T.FOREST;
      if ((c < 30 && r < 26 && w > 0.42) || (r < 12 && w > 0.62)) t = T.WASTE;
      if (a > 0.74) t = T.HILL;
      if (c < 6 && r < 18) t = w > 0.5 ? T.HILL : T.WASTE;
      map.t[i] = t;
    }
    // 2. 山脉
    for (const rg of D.ranges) {
      const cells = polyCells(rg.pts);
      for (const [c, r] of cells) {
        for (const [nc, nr] of H.neighbors(c, r)) {
          const ni = H.idx(nc, nr);
          if (map.t[ni] !== T.PEAK && rng() < 0.55) map.t[ni] = T.HILL;
        }
      }
      for (const [c, r] of cells) map.t[H.idx(c, r)] = rg.peak ? T.PEAK : T.HILL;
    }
    // 西部高原
    for (let r = 18; r < 52; r++) for (let c = 0; c < 3; c++) map.t[H.idx(c, r)] = T.PEAK;
    // 3. 河流
    for (const rv of D.rivers) {
      for (const [c, r] of polyCells(rv.pts)) {
        const i = H.idx(c, r);
        map.t[i] = T.RIVER; if (rv.big) map.big[i] = 1;
      }
    }
    // 4. 海
    for (let r = 0; r < H.H; r++) for (let c = 0; c < H.W; c++) {
      if (pointInPoly(c + 0.5 * (r & 1) + 0.5, r + 0.5, D.sea)) map.t[H.idx(c, r)] = T.SEA;
    }
    // 近海（离岸两格内的海域，斗舰、楼船可航行）
    for (let r = 0; r < H.H; r++) for (let c = 0; c < H.W; c++) {
      const i = H.idx(c, r);
      if (map.t[i] === T.SEA && H.within(c, r, 2).some(([nc, nr]) => map.t[H.idx(nc, nr)] !== T.SEA)) map.coast[i] = 1;
    }
    // 5. 都市与关隘
    D.cities.forEach((d, id) => map.places.push({ id, name: d.name, c: d.c, r: d.r, kind: 'city', size: d.size }));
    D.gates.forEach(d => map.places.push({ id: map.places.length, name: d.name, c: d.c, r: d.r, kind: 'gate', size: 0 }));
    const byName = {};
    for (const p of map.places) {
      byName[p.name] = p;
      const i = H.idx(p.c, p.r);
      map.t[i] = p.kind === 'city' ? T.CITY : T.GATE; map.big[i] = 0; map.city[i] = p.id;
      map.adj[p.id] = new Set();
      if (p.kind === 'city') {
        for (const [nc, nr] of H.neighbors(p.c, p.r)) {
          const ni = H.idx(nc, nr);
          if (map.t[ni] === T.PEAK) map.t[ni] = T.HILL;
        }
      }
    }
    // 5b. 港口：吸附到临水的陆地格
    const landT = [T.PLAIN, T.WASTE, T.FOREST, T.HILL];
    for (const d of D.ports || []) {
      let best = null, bd = Infinity;
      for (const [c, r] of H.within(d.c, d.r, 4)) {
        const i = H.idx(c, r);
        if (!landT.includes(map.t[i]) || map.city[i] >= 0) continue;
        if (map.places.some(p => H.dist(p.c, p.r, c, r) < 2)) continue;
        if (!H.neighbors(c, r).some(([nc, nr]) => { const tt = map.t[H.idx(nc, nr)]; return tt === T.RIVER || tt === T.SEA; })) continue;
        const dd = H.dist(d.c, d.r, c, r) + (map.road[i] ? 0 : 0.1);
        if (dd < bd) { bd = dd; best = [c, r]; }
      }
      if (!best) { console.warn('港口无法放置', d.name); continue; }
      const p = { id: map.places.length, name: d.name, c: best[0], r: best[1], kind: 'port', size: 0, parent: byName[d.city].id };
      map.places.push(p); byName[p.name] = p;
      const i = H.idx(p.c, p.r);
      map.t[i] = T.PORT; map.city[i] = p.id; map.adj[p.id] = new Set();
    }
    map.byName = byName;
    // 6. 道路
    const roadCost = (endIds) => (ni) => {
      const t = map.t[ni];
      if (t === T.SEA) return Infinity;
      if (map.city[ni] >= 0 && !endIds.includes(map.city[ni])) return Infinity;
      if (t === T.PEAK) return Infinity;
      if (map.road[ni]) return 0.6;
      return [Infinity, 1, 1.3, 2, 3, Infinity, map.big[ni] ? 5 : 3, 1, 1, 1][t];
    };
    const layRoad = (a, b) => {
      const path = M.astar(H.idx(a.c, a.r), H.idx(b.c, b.r), roadCost([a.id, b.id]));
      if (!path) { console.warn('道路不通', a.name, b.name); return; }
      for (const i of path) map.road[i] = 1;
      map.adj[a.id].add(b.id); map.adj[b.id].add(a.id);
    };
    for (const [a, b, via] of D.roads) {
      if (via) { layRoad(byName[a], byName[via]); layRoad(byName[via], byName[b]); }
      else layRoad(byName[a], byName[b]);
    }
    for (const p of map.places) if (p.kind === 'port') layRoad(map.places[p.parent], p);
    // 7. 地块
    for (const p of map.places) {
      if (p.kind !== 'city') continue;
      const slots = SG.R.CITY_DEFAULT[p.size].slots;
      const cand = H.within(p.c, p.r, 2).filter(([c, r]) => {
        const i = H.idx(c, r), t = map.t[i];
        return (t === T.PLAIN || t === T.WASTE || t === T.FOREST || t === T.HILL) && !map.road[i] && map.city[i] < 0 && map.plot[i] < 0;
      }).map(([c, r]) => ({ c, r, d: H.dist(p.c, p.r, c, r) + rng() * 0.5 }));
      cand.sort((x, y) => x.d - y.d);
      p.plots = cand.slice(0, slots).map(x => H.idx(x.c, x.r));
      for (const i of p.plots) { map.plot[i] = p.id; map.t[i] = T.PLAIN; }
    }
    // 8. 势力范围（多源 Dijkstra）
    const dist = new Float32Array(N).fill(Infinity), heap = new U.Heap();
    for (const p of map.places) { const i = H.idx(p.c, p.r); dist[i] = 0; map.region[i] = p.id; heap.push(0, i); }
    while (heap.size) {
      const cur = heap.pop(), [c, r] = H.cr(cur);
      for (const [nc, nr] of H.neighbors(c, r)) {
        const ni = H.idx(nc, nr), t = map.t[ni];
        if (t === T.SEA) continue;
        const k = [0, 1, 1.2, 1.6, 2.2, 5, 2, 1, 1, 1][t] * (map.places[map.region[cur]].kind !== 'city' ? 2.2 : 1);
        if (dist[cur] + k < dist[ni]) { dist[ni] = dist[cur] + k; map.region[ni] = map.region[cur]; heap.push(dist[ni], ni); }
      }
    }
    SG.map = map;
    return map;
  };

  // 工事状态（壕沟、陷坑、堤坝、洪水）
  M.works = () => (SG.G && SG.G.S && SG.G.S.works) || null;
  M.isPlace = i => { const t = SG.map.t[i]; return t === T.CITY || t === T.GATE || t === T.PORT; };
  // 是否为水面（河川、海、水渠、洪水；堤坝除外）
  M.isWater = i => {
    const W = M.works(), t = SG.map.t[i];
    if (W && W.dam[i]) return false;
    if (t === T.RIVER || t === T.SEA) return true;
    if (M.isPlace(i)) return false;
    return !!(W && ((W.ditch[i] && W.ditch[i].water) || W.flood[i]));
  };
  // 部队移动消耗（ship：走舸 zou / 斗舰 dou / 楼船 lou）
  M.moveCost = (i, type, ship) => {
    const map = SG.map, t = map.t[i], W = M.works(), R = SG.R;
    if (t === T.PEAK) return Infinity;
    if (W && W.dam[i]) return 3;
    const ty = R.TYPES[type], sh = R.SHIPS[ship || 'zou'];
    if (t === T.SEA) return map.coast[i] ? sh.sea : Infinity;
    if (M.isWater(i)) {
      if (map.road[i] && t === T.RIVER && !(W && W.flood[i])) {
        if (!map.big[i]) return 2; // 桥
        return Math.min(4, sh.cost + 1); // 渡口
      }
      let k = sh.cost + (map.big[i] && (!ship || ship === 'zou') ? 1 : 0);
      if (ty && ty.siegeUnit) k += 1;
      return k;
    }
    if (W && W.ditch[i]) return ty && ty.siegeUnit ? Infinity : type === 'horse' ? 9 : 7;
    let k = map.road[i] ? 2 : [Infinity, 3, 4, 5, 6, Infinity, 5, 3, 3, 3][t];
    if (ty && ty.siegeUnit && !map.road[i] && (t === T.FOREST || t === T.HILL)) k += 3;
    if (type === 'horse' && !map.road[i] && t === T.FOREST) k += 1;
    return k;
  };
})(window.SG);
