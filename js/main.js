// 入口
(function (SG) {
  const G = SG.G, RD = SG.Render, UI = SG.UI;
  const M = SG.Main = {};
  let inited = false;

  M.start = (preview) => {
    document.body.classList.toggle('pregame', !!preview);
    if (!inited) {
      RD.init(document.getElementById('map'), document.getElementById('minimap'));
      UI.bindInput();
      inited = true;
    }
    RD.territory = null;
    UI.sel = null; UI.mode = 'idle'; UI.overShown = !!G.S.over; UI.clearHL();
    const f = G.fac(G.S.player), cap = G.city(f.capital) || G.citiesOf(G.S.player)[0];
    RD.cam.zoom = 0.9;
    if (cap) RD.centerOn(cap.c, cap.r);
    UI.refresh();
  };

  window.addEventListener('load', () => {
    SG.Portraits.loadAll();
    SG.Portraits.onChange(() => { if (G.S) UI.refresh(); });
    SG.Map.build();
    // 标题画面背后先展示一局预览
    G.newGame('曹操');
    G.S.log = [];
    M.start(true);
    RD.cam.zoom = 0.55; RD.centerOn(40, 30);
    SG.Dlg.title();
  });
})(window.SG);
