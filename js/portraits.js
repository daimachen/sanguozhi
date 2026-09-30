// 武将头像：存于浏览器 IndexedDB，编辑页与游戏共用；无头像时生成默认肖像
window.SG = window.SG || {};
(function (SG) {
  const P = SG.Portraits = {};
  const DB = 'sgz11_portraits', STORE = 'p';
  P.W = 240; P.H = 320;            // 保存尺寸（3:4）
  P.cache = new Map();             // 姓名 -> dataURL
  P.imgs = new Map();              // 姓名 -> 已解码 Image（地图绘制用）
  P.urls = new Map();              // 姓名 -> blob URL（界面 <img> 用，避免超长 dataURL）
  const listeners = [];
  P.onChange = fn => listeners.push(fn);
  const emit = () => listeners.forEach(fn => { try { fn(); } catch (e) { console.error(e); } });

  let dbp = null;
  const open = () => dbp || (dbp = new Promise((res, rej) => {
    if (!window.indexedDB) { rej(new Error('浏览器不支持 IndexedDB')); return; }
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE);
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  }));
  const run = (mode, fn) => open().then(db => new Promise((res, rej) => {
    const t = db.transaction(STORE, mode), req = fn(t.objectStore(STORE));
    t.oncomplete = () => res(req ? req.result : undefined);
    t.onerror = () => rej(t.error);
    t.onabort = () => rej(t.error || new Error('写入失败（存储空间可能已满）'));
  }));

  const toBlob = url => {
    const [head, b64] = url.split(','), bin = atob(b64), arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    return new Blob([arr], { type: head.slice(5, head.indexOf(';')) });
  };
  const drop = name => {
    const u = P.urls.get(name);
    if (u) URL.revokeObjectURL(u);
    P.urls.delete(name); P.imgs.delete(name);
  };
  const decode = (name, url) => {
    drop(name);
    const bu = URL.createObjectURL(toBlob(url));
    P.urls.set(name, bu);
    const img = new Image();
    img.onload = () => { if (P.urls.get(name) === bu) P.imgs.set(name, img); };
    img.src = bu;
  };
  P.valid = url => typeof url === 'string' && /^data:image\/(png|jpeg|webp|gif);base64,/.test(url) && url.length < 3e6;

  P.loadAll = async () => {
    try {
      const [keys, vals] = await Promise.all([run('readonly', s => s.getAllKeys()), run('readonly', s => s.getAll())]);
      for (const n of [...P.urls.keys()]) drop(n);
      P.cache.clear();
      keys.forEach((k, i) => { if (P.valid(vals[i])) { P.cache.set(k, vals[i]); decode(k, vals[i]); } });
    } catch (e) { console.warn('头像读取失败', e); }
    emit();
    return P.cache.size;
  };
  P.set = async (name, url) => {
    if (!P.valid(url)) throw new Error('图片格式不正确');
    await run('readwrite', s => s.put(url, name));
    P.cache.set(name, url); decode(name, url);
    P.broadcast(); emit();
  };
  P.remove = async name => {
    await run('readwrite', s => s.delete(name));
    P.cache.delete(name); drop(name);
    P.broadcast(); emit();
  };
  P.clear = async () => {
    await run('readwrite', s => s.clear());
    for (const n of [...P.urls.keys()]) drop(n);
    P.cache.clear();
    P.broadcast(); emit();
  };
  P.has = name => P.cache.has(name);
  P.img = name => P.imgs.get(name) || null;
  P.url = name => P.urls.get(name) || null;
  P.src = name => P.urls.get(name) || P.placeholder(name);
  P.hue = name => { let h = 0; for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return h % 360; };
  const escName = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  // 表格用小头像：有图用 <img>，无图用纯 CSS 色块，避免大量图片数据
  P.thumb = (name, cls = 'av') => {
    const u = P.urls.get(name);
    return u ? `<img class="${cls}" src="${u}" alt="">` : `<span class="${cls} ph" style="--h:${P.hue(name)}">${escName(name[0])}</span>`;
  };

  // 跨页面同步（编辑页保存后，已打开的游戏页自动刷新）
  let bc = null;
  try { bc = new BroadcastChannel('sgz11_portraits'); bc.onmessage = () => P.loadAll(); } catch (e) { /* 不支持则忽略 */ }
  P.broadcast = () => { try { bc && bc.postMessage('changed'); } catch (e) { /* ignore */ } };

  // 默认肖像：按姓名取色，绘制剪影与姓氏
  const ph = new Map();
  P.placeholder = name => {
    if (ph.has(name)) return ph.get(name);
    const hue = P.hue(name);
    const cv = document.createElement('canvas');
    cv.width = 120; cv.height = 160;
    const g = cv.getContext('2d');
    const bg = g.createLinearGradient(0, 0, 0, 160);
    bg.addColorStop(0, `hsl(${hue},35%,38%)`); bg.addColorStop(1, `hsl(${hue},40%,16%)`);
    g.fillStyle = bg; g.fillRect(0, 0, 120, 160);
    g.fillStyle = `hsla(${hue},30%,8%,0.75)`;
    g.beginPath(); g.arc(60, 64, 26, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.moveTo(14, 160); g.quadraticCurveTo(20, 100, 60, 96); g.quadraticCurveTo(100, 100, 106, 160); g.fill();
    g.fillStyle = 'rgba(255,255,255,0.9)';
    g.font = 'bold 34px "Noto Serif SC","Songti SC","Microsoft YaHei",serif';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(name[0], 60, 66);
    g.strokeStyle = 'rgba(224,180,76,0.8)'; g.lineWidth = 3; g.strokeRect(1.5, 1.5, 117, 157);
    const url = cv.toDataURL('image/png');
    ph.set(name, url);
    return url;
  };

  // 把图片按裁切框缩放为 240×320 JPEG
  P.render = (img, crop) => {
    const cv = document.createElement('canvas');
    cv.width = P.W; cv.height = P.H;
    const g = cv.getContext('2d');
    g.fillStyle = '#000'; g.fillRect(0, 0, P.W, P.H);
    g.imageSmoothingQuality = 'high';
    g.drawImage(img, crop.x, crop.y, crop.w, crop.h, 0, 0, P.W, P.H);
    return cv.toDataURL('image/jpeg', 0.86);
  };
  // 居中裁切（批量导入用）
  P.coverCrop = img => {
    const ar = P.W / P.H, iw = img.naturalWidth, ih = img.naturalHeight;
    if (iw / ih > ar) { const w = ih * ar; return { x: (iw - w) / 2, y: 0, w, h: ih }; }
    const h = iw / ar;
    return { x: 0, y: Math.max(0, (ih - h) * 0.3), w: iw, h };
  };
  P.fileToImage = file => new Promise((res, rej) => {
    if (!/^image\//.test(file.type)) { rej(new Error('不是图片文件')); return; }
    const url = URL.createObjectURL(file), img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); res(img); };
    img.onerror = () => { URL.revokeObjectURL(url); rej(new Error('图片无法解码')); };
    img.src = url;
  });
})(window.SG);
