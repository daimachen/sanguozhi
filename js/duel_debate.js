// 可操作的单挑与舌战
(function (SG) {
  const U = SG.U, G = SG.G, C = SG.C;
  const esc = U.esc;

  // ======================= 单挑 =======================
  const DU = SG.Duel = {};
  DU.queue = [];
  DU.ACTS = {
    atk: { name: '攻击', desc: '稳妥进攻' },
    power: { name: '全力一击', desc: '伤害 ×1.8，但有四成落空并遭反击' },
    guard: { name: '防御', desc: '受伤减半，积蓄气势' },
    special: { name: '必杀', desc: '气势满时可用，伤害 ×2.6 且必中' },
    flee: { name: '撤退', desc: '退出单挑（判负，但损失较小）' },
  };
  const hitBase = (a, b) => (6 + a.s[1] * 0.12) * Math.pow(a.s[1] / Math.max(1, b.s[1]), 1.2) * (0.85 + Math.random() * 0.3);

  // 从战斗中触发：玩家参与则排队等待操作，否则自动结算
  DU.request = (u, t, a, b) => {
    const mine = G.isPlayer(u.faction) ? 'a' : G.isPlayer(t.faction) ? 'b' : null;
    if (!mine || !SG.UI || typeof document === 'undefined') return false;
    DU.queue.push({ uid: u.id, tid: t.id, a: a.id, b: b.id, mine });
    return true;
  };
  DU.flush = done => {
    const e = DU.queue.shift();
    if (!e) { if (done) done(); return; }
    DU.play(e, () => DU.flush(done));
  };

  DU.aiPick = st => {
    if (st.spB >= 100) return 'special';
    const r = Math.random();
    if (st.hpB < 25 && r < 0.15) return 'flee';
    return r < 0.5 ? 'atk' : r < 0.78 ? 'power' : 'guard';
  };
  DU.round = (st, actA, actB) => {
    const A = G.off(st.a), B = G.off(st.b), lines = [];
    const dmg = (x, y, act, targetAct) => {
      if (act === 'guard' || act === 'flee') return 0;
      let d = hitBase(x, y);
      if (act === 'power') { if (Math.random() < 0.4) return -1; d *= 1.8; }
      if (act === 'special') d *= 2.6;
      if (targetAct === 'guard') d *= 0.5;
      return Math.round(d);
    };
    let dA = dmg(A, B, actA, actB), dB = dmg(B, A, actB, actA);
    if (dA === -1) { lines.push(`${A.name} 全力一击落空！`); dA = 0; dB = dB + Math.round(hitBase(B, A) * 0.6); }
    if (dB === -1) { lines.push(`${B.name} 全力一击落空！`); dB = 0; dA = dA + Math.round(hitBase(A, B) * 0.6); }
    st.hpB -= dA; st.hpA -= dB;
    if (actA === 'special') st.spA = 0; if (actB === 'special') st.spB = 0;
    st.spA = Math.min(100, st.spA + dB * 1.6 + (actA === 'guard' ? 25 : 8));
    st.spB = Math.min(100, st.spB + dA * 1.6 + (actB === 'guard' ? 25 : 8));
    lines.push(`第${st.round}合　${A.name}【${DU.ACTS[actA].name}】${dA ? ' → ' + dA : ''}　／　${B.name}【${DU.ACTS[actB].name}】${dB ? ' → ' + dB : ''}`);
    st.round++;
    return lines;
  };

  // 结算：loser = 'a' | 'b' | null
  DU.apply = (e, loser, knockout) => {
    const u = G.S.units[e.uid], t = G.S.units[e.tid];
    if (!loser) { G.log(`单挑 ${G.off(e.a).name} VS ${G.off(e.b).name}：不分胜负`, 'l-war'); return; }
    const lu = loser === 'a' ? u : t, wu = loser === 'a' ? t : u, lo = G.off(loser === 'a' ? e.a : e.b), wo = G.off(loser === 'a' ? e.b : e.a);
    G.log(`单挑！${wo.name} 击败 ${lo.name}`, 'l-war');
    if (lu) { lu.troops = Math.round(lu.troops * (knockout ? 0.8 : 0.9)); lu.energy = Math.max(0, lu.energy - (knockout ? 30 : 15)); }
    if (wu) wu.energy = Math.min(100, wu.energy + 12);
    G.merit(wo, 150);
    if (knockout && lu && wu && U.chance(0.4) && !G.isRuler(lo) && lo.skill !== '遁走' && lu.offs.length > 1) {
      lu.offs = lu.offs.filter(id => id !== lo.id);
      lu.name = G.off(lu.offs[0]).name + '队';
      C.captureOrFlee(lo, wu.faction, lu.c, lu.r, 1);
    }
    C.cleanup(null);
  };

  DU.play = (e, done) => {
    const A = G.off(e.a), B = G.off(e.b), P = SG.Portraits;
    const st = { a: e.a, b: e.b, hpA: 100, hpB: 100, spA: 0, spB: 0, round: 1, log: [] };
    // 玩家总是操作 a 侧：如果玩家是 b，交换
    if (e.mine === 'b') { [st.a, st.b] = [st.b, st.a]; }
    const me = G.off(st.a), foe = G.off(st.b);
    const render = () => {
      const bar = (v, col) => `<div class="bar" style="height:9px"><i style="width:${U.clamp(v, 0, 100)}%;background:${col}"></i></div>`;
      const side = (o, hp, sp) => `<figure class="du-side"><img src="${P.src(o.name)}" alt=""><figcaption><b>${esc(o.name)}</b> 武${o.s[1]}</figcaption>
        <div class="muted">体力</div>${bar(hp, '#ef5350')}<div class="muted">气势</div>${bar(sp, '#ffca28')}</figure>`;
      const over = st.over;
      SG.Dlg.open(`<h2>⚔ 单挑</h2><div class="du-top">${side(me, st.hpA, st.spA)}<div class="du-vs">VS</div>${side(foe, st.hpB, st.spB)}</div>
        <div class="duel" id="du-log">${st.log.map(esc).join('\n')}</div>
        ${over ? `<div class="du-res">${esc(over)}</div><div class="foot"><button class="primary" id="du-ok">确定</button></div>`
          : `<div class="du-acts">${Object.entries(DU.ACTS).map(([k, a]) => `<button data-a="${k}" ${k === 'special' && st.spA < 100 ? 'disabled' : ''} title="${a.desc}">${a.name}</button>`).join('')}</div>`}`, m => {
        const lg = m.querySelector('#du-log'); lg.scrollTop = lg.scrollHeight;
        m.querySelectorAll('[data-a]').forEach(b => b.addEventListener('click', () => step(b.dataset.a)));
        const ok = m.querySelector('#du-ok');
        if (ok) ok.addEventListener('click', () => { SG.Dlg.close(); if (SG.UI) SG.UI.refresh(); done(); });
      });
    };
    const finish = (loserSide, knockout, text) => {
      st.over = text;
      // 还原成原始 a/b
      const realLoser = !loserSide ? null : (e.mine === 'b' ? (loserSide === 'a' ? 'b' : 'a') : loserSide);
      DU.apply(e, realLoser, knockout);
      render();
    };
    const step = act => {
      if (act === 'flee') { st.log.push(`${me.name} 拨马而走……`); finish('a', false, `${me.name} 退出单挑，${foe.name} 获胜`); return; }
      const ai = DU.aiPick(st);
      if (ai === 'flee') { st.log.push(`${foe.name} 拨马而走……`); finish('b', false, `${foe.name} 败走，${me.name} 获胜！`); return; }
      st.log.push(...DU.round(st, act, ai));
      if (st.hpA <= 0 || st.hpB <= 0) {
        const aLost = st.hpA <= st.hpB;
        finish(aLost ? 'a' : 'b', true, aLost ? `${me.name} 落马！${foe.name} 获胜` : `${foe.name} 落马！${me.name} 获胜！`);
      } else if (st.round > 12) {
        const diff = st.hpA - st.hpB;
        if (Math.abs(diff) < 10) finish(null, false, '战至力竭，不分胜负');
        else finish(diff < 0 ? 'a' : 'b', false, diff < 0 ? `${foe.name} 略胜一筹` : `${me.name} 略胜一筹！`);
      } else render();
    };
    st.log.push(`${me.name}：「${SG.Cutin ? SG.Cutin.line(me.name, 'crit') : '来吧！'}」`);
    render();
  };

  // ======================= 舌战 =======================
  const DB = SG.Debate = {};
  DB.TYPES = { li: { name: '道理', beats: 'yi' }, yi: { name: '利害', beats: 'qing' }, qing: { name: '感情', beats: 'li' } };
  const draw = o => {
    const types = Object.keys(DB.TYPES);
    const v = Math.max(1, Math.min(5, Math.round(1 + Math.random() * 3 + (o.s[2] - 60) / 25)));
    return { t: U.pick(types), v };
  };
  // 开始舌战：me 为我方论者，foe 为对方；then(win: bool)
  DB.start = (me, foe, topic, then) => {
    const P = SG.Portraits;
    const st = { hpA: 40 + Math.round(me.s[2] / 2), hpB: 40 + Math.round(foe.s[2] / 2), handA: [], handB: [], round: 1, log: [] };
    st.maxA = st.hpA; st.maxB = st.hpB;
    for (let k = 0; k < 5; k++) { st.handA.push(draw(me)); st.handB.push(draw(foe)); }
    const card = (c, k, dis) => `<button class="db-card db-${c.t}" data-k="${k}" ${dis ? 'disabled' : ''}><b>${DB.TYPES[c.t].name}</b><span>${'●'.repeat(c.v)}</span></button>`;
    const render = () => {
      const bar = (v, m) => `<div class="bar" style="height:9px"><i style="width:${U.clamp(v / m * 100, 0, 100)}%;background:#64b5f6"></i></div>`;
      const side = (o, hp, m) => `<figure class="du-side"><img src="${P.src(o.name)}" alt=""><figcaption><b>${esc(o.name)}</b> 智${o.s[2]}</figcaption><div class="muted">气势 ${Math.max(0, hp)}</div>${bar(hp, m)}</figure>`;
      SG.Dlg.open(`<h2>舌战 · ${esc(topic)}</h2><div class="du-top">${side(me, st.hpA, st.maxA)}<div class="du-vs">辩</div>${side(foe, st.hpB, st.maxB)}</div>
        <p class="muted" style="text-align:center">道理 克 利害，利害 克 感情，感情 克 道理；同类比点数。气势先尽者败。</p>
        <div class="duel" id="db-log">${st.log.map(esc).join('\n')}</div>
        ${st.over ? `<div class="du-res">${esc(st.over)}</div><div class="foot"><button class="primary" id="db-ok">确定</button></div>`
          : `<div class="db-hand">${st.handA.map((c, k) => card(c, k)).join('')}</div>`}`, m => {
        const lg = m.querySelector('#db-log'); lg.scrollTop = lg.scrollHeight;
        m.querySelectorAll('[data-k]').forEach(b => b.addEventListener('click', () => play(+b.dataset.k)));
        const ok = m.querySelector('#db-ok');
        if (ok) ok.addEventListener('click', () => { SG.Dlg.close(); then(st.win); });
      });
    };
    const play = k => {
      const a = st.handA.splice(k, 1)[0];
      const bi = st.handB.reduce((best, c, i) => (c.v + Math.random() * 2 > st.handB[best].v + Math.random() * 2 ? i : best), 0);
      const b = st.handB.splice(bi, 1)[0];
      let dA = 0, dB = 0, note;
      if (DB.TYPES[a.t].beats === b.t) { dB = a.v * 6 + 4; note = `${me.name} 以${DB.TYPES[a.t].name}压制！`; }
      else if (DB.TYPES[b.t].beats === a.t) { dA = b.v * 6 + 4; note = `${foe.name} 以${DB.TYPES[b.t].name}反驳！`; }
      else if (a.v > b.v) { dB = (a.v - b.v) * 6 + 2; note = `${me.name} 言辞更胜一筹`; }
      else if (b.v > a.v) { dA = (b.v - a.v) * 6 + 2; note = `${foe.name} 言辞更胜一筹`; }
      else note = '双方针锋相对，不相上下';
      st.hpA -= dA; st.hpB -= dB;
      st.log.push(`第${st.round}回　${DB.TYPES[a.t].name}${a.v} 对 ${DB.TYPES[b.t].name}${b.v}：${note}`);
      st.round++;
      st.handA.push(draw(me)); st.handB.push(draw(foe));
      if (st.hpA <= 0 || st.hpB <= 0 || st.round > 10) {
        st.win = st.hpB <= 0 || (st.hpA > 0 && st.hpA / st.maxA > st.hpB / st.maxB);
        st.over = st.win ? `${foe.name} 理屈词穷——舌战获胜！` : `${me.name} 被驳得哑口无言——舌战失败`;
        G.log(`舌战（${topic}）：${me.name} VS ${foe.name}，${st.win ? '胜' : '负'}`, st.win ? 'l-good' : 'l-bad');
      }
      render();
    };
    render();
  };
})(window.SG);
