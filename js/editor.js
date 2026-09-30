// 武将头像编辑页
(function (SG) {
  const P = SG.Portraits, R = SG.R, U = SG.U, esc = U.esc;
  const $ = id => document.getElementById(id);
  const offs = SG.G.parseOfficers();
  const byName = new Map(offs.map(o => [o.name, o]));
  const st = { q: '', fac: 'all', has: 'all', sel: offs[0] ? offs[0].name : null, crop: null };

  const toast = msg => {
    const d = document.createElement('div');
    d.className = 'toast'; d.textContent = msg;
    $('toast-area').appendChild(d);
    setTimeout(() => d.remove(), 2900);
  };
  const facLabel = o => o.rulerName === '-' ? `在野${o.appear > SG.DATA.scenario.year ? '·' + o.appear + '年登场' : ''}` : o.rulerName + '军';

  // ---------- 列表 ----------
  const initFilters = () => {
    const rulers = SG.DATA.scenario.factions.map(f => f.ruler);
    $('fac').innerHTML = `<option value="all">全部势力</option>${rulers.map(r => `<option value="${esc(r)}">${esc(r)}军</option>`).join('')}<option value="-">在野</option>`;
    $('q').addEventListener('input', e => { st.q = e.target.value.trim(); renderGrid(); });
    $('fac').addEventListener('change', e => { st.fac = e.target.value; renderGrid(); });
    $('has').addEventListener('change', e => { st.has = e.target.value; renderGrid(); });
  };
  const visible = () => offs.filter(o =>
    (!st.q || o.name.includes(st.q)) &&
    (st.fac === 'all' || o.rulerName === st.fac) &&
    (st.has === 'all' || (st.has === 'yes') === P.has(o.name)));

  const renderGrid = () => {
    const list = visible();
    $('grid').innerHTML = list.map(o => `<div class="ed-card ${o.name === st.sel ? 'sel' : ''}" data-n="${esc(o.name)}" title="点击选中；也可把图片直接拖到卡片上">
      ${P.thumb(o.name, 'pic')}${P.has(o.name) ? '<span class="ok">✓</span>' : ''}
      <div class="nm">${esc(o.name)}</div><div class="fc">${esc(facLabel(o))}</div></div>`).join('') || '<p class="muted">没有符合条件的武将</p>';
    $('ed-count').textContent = `已设置头像 ${P.cache.size} / ${offs.length}`;
    $('grid').querySelectorAll('.ed-card').forEach(card => {
      const name = card.dataset.n;
      card.addEventListener('click', () => select(name));
      card.addEventListener('dragover', e => { e.preventDefault(); card.classList.add('drag'); });
      card.addEventListener('dragleave', () => card.classList.remove('drag'));
      card.addEventListener('drop', e => {
        e.preventDefault(); card.classList.remove('drag');
        const f = e.dataTransfer.files && e.dataTransfer.files[0];
        if (f) { select(name); startCrop(f); }
      });
    });
  };
  const select = name => { st.sel = name; st.crop = null; renderGrid(); renderDetail(); };

  // ---------- 详情 ----------
  const renderDetail = () => {
    const o = byName.get(st.sel), el = $('detail');
    if (!o) { el.innerHTML = '<p class="muted">请选择武将</p>'; return; }
    const names = ['统率', '武力', '智力', '政治', '魅力'];
    let h = `<h2>${esc(o.name)} <span class="muted" style="font-size:13px">${esc(facLabel(o))}</span></h2>`;
    if (st.crop) {
      h += `<canvas id="crop" class="ed-crop" width="${P.W}" height="${P.H}"></canvas>
        <div class="row"><label>缩放</label><input type="range" id="zoom" min="1" max="4" step="0.01" value="${st.crop.z}"></div>
        <p class="muted" style="text-align:center">拖动图片调整位置，滚轮或滑条缩放</p>
        <div class="ed-row"><button id="c-cancel">取消</button><button class="primary" id="c-save">保存头像</button></div>`;
    } else {
      h += `<img class="ed-big" src="${P.src(o.name)}" alt="">
        <div class="ed-drop" id="drop">点击选择图片，或把图片拖到这里<br><small>也可以直接 Ctrl+V 粘贴图片</small></div>
        <input type="file" id="f-one" accept="image/*" hidden>
        <div class="ed-row">${P.has(o.name) ? '<button id="b-remove">移除头像（恢复默认）</button>' : '<span class="muted">当前为默认肖像</span>'}</div>`;
    }
    h += `<div class="ed-stats">${o.s.map((v, k) => `<span class="muted">${names[k]}</span><div class="bar"><i style="width:${v}%"></i></div><span>${v}</span>`).join('')}</div>
      <div class="muted">适性　${R.APT_NAMES.map((n, k) => n + o.apt[k]).join('　')}</div>
      ${o.skill ? `<div style="margin-top:4px">特技 <span class="skill">【${esc(o.skill)}】</span><span class="muted">${esc(R.SKILLS[o.skill] || '')}</span></div>` : ''}
      <p class="muted" style="margin-top:12px">头像保存在本机浏览器中，游戏页面会自动使用。建议使用竖向图片，保存时统一裁成 3:4（240×320）。</p>`;
    el.innerHTML = h;
    if (st.crop) bindCrop();
    else {
      const f = $('f-one'), drop = $('drop');
      drop.addEventListener('click', () => f.click());
      f.addEventListener('change', () => { if (f.files[0]) startCrop(f.files[0]); f.value = ''; });
      drop.addEventListener('dragover', e => { e.preventDefault(); drop.classList.add('drag'); });
      drop.addEventListener('dragleave', () => drop.classList.remove('drag'));
      drop.addEventListener('drop', e => { e.preventDefault(); drop.classList.remove('drag'); if (e.dataTransfer.files[0]) startCrop(e.dataTransfer.files[0]); });
      const rm = $('b-remove');
      if (rm) rm.addEventListener('click', async () => {
        await P.remove(o.name); toast(`已移除 ${o.name} 的头像`); renderGrid(); renderDetail();
      });
    }
  };

  // ---------- 裁切 ----------
  const startCrop = async file => {
    try {
      const img = await P.fileToImage(file);
      const base = Math.max(P.W / img.naturalWidth, P.H / img.naturalHeight);
      st.crop = { img, base, z: 1, ox: (P.W - img.naturalWidth * base) / 2, oy: Math.min(0, (P.H - img.naturalHeight * base) * 0.3) };
      renderDetail();
    } catch (e) { toast(e.message); }
  };
  const clampCrop = () => {
    const c = st.crop, s = c.base * c.z, w = c.img.naturalWidth * s, h = c.img.naturalHeight * s;
    c.ox = U.clamp(c.ox, P.W - w, 0); c.oy = U.clamp(c.oy, P.H - h, 0);
  };
  const drawCrop = () => {
    const c = st.crop, cv = $('crop');
    if (!c || !cv) return;
    const g = cv.getContext('2d'), s = c.base * c.z;
    g.fillStyle = '#000'; g.fillRect(0, 0, P.W, P.H);
    g.drawImage(c.img, c.ox, c.oy, c.img.naturalWidth * s, c.img.naturalHeight * s);
  };
  const zoomTo = (z, cx = P.W / 2, cy = P.H / 2) => {
    const c = st.crop, s0 = c.base * c.z;
    c.z = U.clamp(z, 1, 4);
    const s1 = c.base * c.z;
    c.ox = cx - (cx - c.ox) * s1 / s0; c.oy = cy - (cy - c.oy) * s1 / s0;
    clampCrop(); drawCrop();
    const zs = $('zoom'); if (zs) zs.value = c.z;
  };
  const bindCrop = () => {
    const cv = $('crop'), c = st.crop;
    clampCrop(); drawCrop();
    let drag = null;
    const scale = () => P.W / cv.getBoundingClientRect().width;
    cv.addEventListener('pointerdown', e => { drag = { x: e.clientX, y: e.clientY, ox: c.ox, oy: c.oy }; cv.setPointerCapture(e.pointerId); });
    cv.addEventListener('pointermove', e => {
      if (!drag) return;
      const k = scale();
      c.ox = drag.ox + (e.clientX - drag.x) * k; c.oy = drag.oy + (e.clientY - drag.y) * k;
      clampCrop(); drawCrop();
    });
    cv.addEventListener('pointerup', () => { drag = null; });
    cv.addEventListener('wheel', e => {
      e.preventDefault();
      const r = cv.getBoundingClientRect(), k = scale();
      zoomTo(c.z * (e.deltaY < 0 ? 1.08 : 1 / 1.08), (e.clientX - r.left) * k, (e.clientY - r.top) * k);
    }, { passive: false });
    $('zoom').addEventListener('input', e => zoomTo(+e.target.value));
    $('c-cancel').addEventListener('click', () => { st.crop = null; renderDetail(); });
    $('c-save').addEventListener('click', async () => {
      const s = c.base * c.z;
      const url = P.render(c.img, { x: -c.ox / s, y: -c.oy / s, w: P.W / s, h: P.H / s });
      try {
        await P.set(st.sel, url);
        toast(`已保存 ${st.sel} 的头像`);
        st.crop = null; renderGrid(); renderDetail();
      } catch (e) { toast('保存失败：' + e.message); }
    });
  };

  // ---------- 批量 / 导入导出 ----------
  const batch = async files => {
    let ok = 0;
    const miss = [], bad = [];
    for (const f of files) {
      const name = f.name.replace(/\.[^.]+$/, '').trim();
      if (!byName.has(name)) { miss.push(f.name); continue; }
      try {
        const img = await P.fileToImage(f);
        await P.set(name, P.render(img, P.coverCrop(img)));
        ok++;
      } catch (e) { bad.push(f.name); }
    }
    renderGrid(); renderDetail();
    toast(`已导入 ${ok} 张${miss.length ? `，${miss.length} 张文件名不是武将姓名` : ''}${bad.length ? `，${bad.length} 张无法读取` : ''}`);
    if (miss.length || bad.length) console.info('未导入：', miss, bad);
  };
  const exportPack = () => {
    if (!P.cache.size) { toast('还没有任何自定义头像'); return; }
    const data = { format: 'sgz11-portraits', v: 1, portraits: Object.fromEntries(P.cache) };
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify(data)], { type: 'application/json' }));
    a.download = '武将头像包.json';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };
  const importPack = async file => {
    try {
      const data = JSON.parse(await file.text());
      if (!data || data.format !== 'sgz11-portraits' || typeof data.portraits !== 'object') throw new Error('不是有效的头像包');
      let n = 0;
      for (const [name, url] of Object.entries(data.portraits)) {
        if (byName.has(name) && P.valid(url)) { await P.set(name, url); n++; }
      }
      renderGrid(); renderDetail();
      toast(`已导入 ${n} 个头像`);
    } catch (e) { toast('导入失败：' + e.message); }
  };

  const bindTop = () => {
    $('btn-batch').addEventListener('click', () => $('f-batch').click());
    $('f-batch').addEventListener('change', e => { batch([...e.target.files]); e.target.value = ''; });
    $('btn-export').addEventListener('click', exportPack);
    $('btn-import').addEventListener('click', () => $('f-pack').click());
    $('f-pack').addEventListener('change', e => { if (e.target.files[0]) importPack(e.target.files[0]); e.target.value = ''; });
    $('btn-clear').addEventListener('click', async () => {
      if (!P.cache.size || !confirm('确定清空全部自定义头像吗？此操作不可撤销（可先导出备份）。')) return;
      await P.clear(); toast('已清空'); renderGrid(); renderDetail();
    });
    // 粘贴图片
    window.addEventListener('paste', e => {
      const item = [...(e.clipboardData || {}).items || []].find(i => i.type.startsWith('image/'));
      if (item && st.sel) startCrop(item.getAsFile());
    });
  };

  window.addEventListener('load', async () => {
    initFilters(); bindTop();
    await P.loadAll();
    const want = decodeURIComponent((location.hash || '').slice(1));
    if (byName.has(want)) st.sel = want;
    renderGrid(); renderDetail();
    P.onChange(() => { renderGrid(); if (!st.crop) renderDetail(); });
  });
})(window.SG);
