// 官职与爵位：任命、罢免、自动任命、君主晋位
(function (SG) {
  const U = SG.U, R = SG.R, G = SG.G;
  const RK = SG.Ranks = {};

  RK.holders = (fid, rid) => G.officersOf(fid).filter(o => o.rank === rid && !G.isRuler(o));
  RK.free = (fid, rid) => R.RANK[rid].slots - RK.holders(fid, rid).length;

  // 返回不可任命的原因，可任命则返回 null
  RK.eligible = (fid, o, rid) => {
    const r = R.RANK[rid], t = G.title(fid);
    if (G.isRuler(o) || o.faction !== fid || o.status !== 'active') return '无法任命';
    if (r.grade < t.maxGrade) return `君主爵位为${t.name}，最高只能授予${R.GRADE_NAME[t.maxGrade]}官职`;
    if ((o.merit || 0) < R.GRADE_MERIT[r.grade]) return `功绩不足（需 ${R.GRADE_MERIT[r.grade]}）`;
    if (o.rank !== rid && RK.free(fid, rid) <= 0) return '该职位已有人担任';
    return null;
  };
  RK.appoint = (fid, o, rid) => {
    const e = RK.eligible(fid, o, rid);
    if (e) return { ok: false, msg: e };
    const old = G.grade(o);
    o.rank = rid;
    if (!old || R.RANK[rid].grade < old) o.loyalty = Math.min(100, o.loyalty + 8);
    return { ok: true, msg: `任命 ${o.name} 为${R.RANK[rid].name}` };
  };
  RK.dismiss = o => {
    if (!o.rank) return { ok: false, msg: '该武将没有官职' };
    const n = R.RANK[o.rank].name;
    o.rank = null;
    if (!o.fixed) o.loyalty = Math.max(0, o.loyalty - 10);
    return { ok: true, msg: `罢免了 ${o.name} 的${n}之职` };
  };

  // 自动任命：由高到低填补空缺，功绩高者优先晋升
  RK.autoAssign = (fid, silent) => {
    const maxG = G.title(fid).maxGrade;
    const offs = G.officersOf(fid).filter(o => !G.isRuler(o));
    const log = [];
    const pick = (r, score) => {
      if (r.grade < maxG) return;
      while (RK.free(fid, r.id) > 0) {
        const cand = offs.filter(o => (o.merit || 0) >= R.GRADE_MERIT[r.grade] && o.rank !== r.id &&
          (!G.rank(o) || G.grade(o) > r.grade) && !(G.rank(o) && G.rank(o).civ !== !!r.civ && G.grade(o) <= r.grade + 1));
        if (!cand.length) return;
        const o = U.maxBy(cand, score);
        o.rank = r.id; o.loyalty = Math.min(100, o.loyalty + 8);
        log.push(`${o.name}→${r.name}`);
      }
    };
    for (let g = maxG; g <= 7; g++) {
      for (const r of R.RANKS.filter(x => x.grade === g && x.civ)) {
        pick(r, r.id === 'js' ? o => o.s[2] * 3 + o.s[3] - o.s[1] : o => o.s[3] * 3 + o.s[2] - o.s[1]);
      }
      for (const r of R.RANKS.filter(x => x.grade === g && !x.civ)) {
        pick(r, o => o.merit / 50 + o.s[0] * 2 + o.s[1] - (G.rank(o) && G.rank(o).civ ? 500 : 0));
      }
    }
    if (!silent && log.length && G.isPlayer(fid)) G.log(`官职任命：${log.join('、')}`, 'l-good');
    return log;
  };

  // 君主晋位（按都市数，只升不降）
  RK.checkTitles = () => {
    for (const f of G.S.factions) {
      if (!f.alive) continue;
      const n = G.realCitiesOf(f.id).length;
      let k = f.title || 0;
      R.TITLES.forEach((t, i) => { if (n >= t.need && i > k) k = i; });
      if (k > (f.title || 0)) {
        f.title = k;
        const ruler = G.off(f.ruler), t = R.TITLES[k];
        const text = t.name === '皇帝' ? `${ruler.name} 登基称帝！` : `${ruler.name} 晋位为${t.name}`;
        G.log(text + `（可授予${R.GRADE_NAME[t.maxGrade]}官职）`, G.isPlayer(f.id) ? 'l-good' : 'l-war');
        if (G.isPlayer(f.id)) G.S.eventQueue.push({ title: '晋位', text: `${text}。<br>今后可任命至${R.GRADE_NAME[t.maxGrade]}官职，每旬行动力 +${t.ap}。` });
      }
    }
  };

  RK.apBonus = fid => {
    const f = G.fac(fid);
    let ap = G.title(fid).ap;
    if (RK.holders(fid, 'js').length) ap += 10;
    if (f.emperor) ap += 15;
    return ap;
  };
})(window.SG);
