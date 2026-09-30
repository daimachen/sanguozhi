// 地图生成：地形、河流、山脉、道路、都市地块与势力范围
(function (SG) {
  const H = SG.Hex, U = SG.U;
  const T = SG.T = { SEA: 0, PLAIN: 1, WASTE: 2, FOREST: 3, HILL: 4, PEAK: 5, RIVER: 6, CITY: 7, GATE: 8 };
  SG.T_NAMES = ['海', '平原', '荒地', '森林', '山地', '峻岭', '河川', '都市', '关隘'];
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
      t: new Uint8Array(N).fill(T.PLAIN), road: new Uint8Array(N), big: new Uint8Array(N),
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
    map.byName = byName;
    // 6. 道路
    const roadCost = (endIds) => (ni) => {
      const t = map.t[ni];
      if (t === T.SEA) return Infinity;
      if (map.city[ni] >= 0 && !endIds.includes(map.city[ni])) return Infinity;
      if (t === T.PEAK) return Infinity;
      if (map.road[ni]) return 0.6;
      return [Infinity, 1, 1.3, 2, 3, Infinity, map.big[ni] ? 5 : 3, 1, 1][t];
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
        const k = [0, 1, 1.2, 1.6, 2.2, 5, 2, 1, 1][t] * (map.places[map.region[cur]].kind === 'gate' ? 2.2 : 1);
        if (dist[cur] + k < dist[ni]) { dist[ni] = dist[cur] + k; map.region[ni] = map.region[cur]; heap.push(dist[ni], ni); }
      }
    }
    SG.map = map;
    return map;
  };

  // 部队移动消耗
  M.moveCost = (i, type) => {
    const map = SG.map, t = map.t[i];
    if (t === T.SEA || t === T.PEAK) return Infinity;
    let k;
    if (map.road[i]) k = (t === T.RIVER && map.big[i]) ? 4 : 2;
    else k = [Infinity, 3, 4, 5, 6, Infinity, map.big[i] ? 6 : 5, 3, 3][t];
    const ty = SG.R.TYPES[type];
    if (ty && ty.siegeUnit && !map.road[i] && (t === T.FOREST || t === T.HILL)) k += 3;
    if (type === 'horse' && !map.road[i] && t === T.FOREST) k += 1;
    return k;
  };
  M.isWater = i => SG.map.t[i] === T.RIVER;
})(window.SG);
