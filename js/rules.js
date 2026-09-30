// 游戏规则常量：兵种、战法、计略、设施、特技、行动力
(function (SG) {
  const R = SG.R = {};

  // 适性顺序：枪 戟 弩 骑 兵器 水
  R.APT_NAMES = ['枪', '戟', '弩', '骑', '兵器', '水'];
  R.APT_MULT = { S: 1.2, A: 1.0, B: 0.85, C: 0.7 };
  R.APT_RATE = { S: 0.95, A: 0.85, B: 0.7, C: 0.55 };

  // 兵种
  R.TYPES = {
    sword: { name: '剑兵', ch: '剑', apt: -1, atk: 45, def: 45, mp: 15, range: [1, 1], siege: 1.0, weapon: null },
    spear: { name: '枪兵', ch: '枪', apt: 0, atk: 62, def: 56, mp: 15, range: [1, 1], siege: 1.0, weapon: 'spear' },
    halberd: { name: '戟兵', ch: '戟', apt: 1, atk: 56, def: 66, mp: 15, range: [1, 1], siege: 1.0, weapon: 'halberd' },
    bow: { name: '弩兵', ch: '弩', apt: 2, atk: 52, def: 48, mp: 15, range: [1, 2], siege: 0.8, weapon: 'crossbow', ranged: true },
    horse: { name: '骑兵', ch: '骑', apt: 3, atk: 76, def: 52, mp: 20, range: [1, 1], siege: 0.7, weapon: 'horse' },
    ram: { name: '冲车', ch: '冲', apt: 4, atk: 20, def: 45, mp: 12, range: [1, 1], siege: 6.0, weapon: 'ram', siegeUnit: true },
    tower: { name: '井阑', ch: '井', apt: 4, atk: 58, def: 50, mp: 12, range: [1, 3], siege: 1.6, weapon: 'tower', ranged: true, siegeUnit: true },
    catapult: { name: '投石', ch: '投', apt: 4, atk: 82, def: 30, mp: 12, range: [2, 4], siege: 3.0, weapon: 'catapult', ranged: true, siegeUnit: true },
    transport: { name: '运输队', ch: '运', apt: -1, atk: 0, def: 30, mp: 16, range: [0, 0], siege: 0, weapon: null, noAttack: true },
  };
  R.TYPE_ORDER = ['sword', 'spear', 'halberd', 'bow', 'horse', 'ram', 'tower', 'catapult', 'transport'];
  // 兵种相克：攻方 → 守方 → 倍率
  R.COUNTER = { spear: { horse: 1.25 }, halberd: { spear: 1.2 }, horse: { halberd: 1.2, bow: 1.25, sword: 1.15 } };
  // 水上（河流格）视为舟船
  R.BOAT = { atk: 42, def: 42 };

  // 兵装
  R.WEAPONS = {
    spear: { name: '枪', fac: 'smithy', siege: false },
    halberd: { name: '戟', fac: 'smithy', siege: false },
    crossbow: { name: '弩', fac: 'smithy', siege: false },
    horse: { name: '马', fac: 'stable', siege: false },
    ram: { name: '冲车', fac: 'workshop', siege: true },
    tower: { name: '井阑', fac: 'workshop', siege: true },
    catapult: { name: '投石', fac: 'workshop', siege: true },
  };

  // 战法
  R.TACTICS = {
    spear: [
      { id: 'tuci', name: '突刺', en: 10, mult: 1.3 },
      { id: 'luoxuan', name: '螺旋突', en: 15, mult: 1.45, push: 1 },
      { id: 'erduan', name: '二段突', en: 20, mult: 1.15, hits: 2 },
    ],
    halberd: [
      { id: 'hengsao', name: '横扫', en: 12, mult: 1.25, sweep: 'arc' },
      { id: 'xuanfeng', name: '旋风', en: 20, mult: 1.15, sweep: 'all' },
    ],
    bow: [
      { id: 'luanshe', name: '乱射', en: 12, mult: 1.15, splash: 0.6 },
      { id: 'guanshe', name: '贯射', en: 15, mult: 1.4, pierce: true },
      { id: 'huoshi', name: '火矢', en: 10, mult: 0.9, fire: true },
    ],
    horse: [
      { id: 'tuji', name: '突击', en: 10, mult: 1.3, push: 1 },
      { id: 'tupo', name: '突破', en: 15, mult: 1.45, push: 1, follow: true },
      { id: 'tujin', name: '突进', en: 20, mult: 1.8 },
    ],
    ram: [{ id: 'gongcheng', name: '攻城', en: 10, mult: 1.6, cityOnly: true }],
    tower: [{ id: 'fangshe', name: '放射', en: 12, mult: 1.35 }],
    catapult: [{ id: 'toushi', name: '投石', en: 15, mult: 1.4, splash: 0.5 }],
    sword: [],
    transport: [],
  };

  // 计略（射程 2）
  R.SCHEMES = [
    { id: 'fire', name: '火计', en: 15, range: 2, desc: '在目标处放火，持续烧伤部队或都市' },
    { id: 'confuse', name: '扰乱', en: 20, range: 2, desc: '使目标部队混乱，无法行动' },
    { id: 'false', name: '伪报', en: 20, range: 2, desc: '使目标部队中计，无法行动并损失气力' },
    { id: 'calm', name: '镇静', en: 10, range: 1, ally: true, desc: '解除自身或相邻友军的异常状态' },
  ];

  // 设施
  R.FACILITIES = {
    market: { name: '市场', ch: '市', cost: 300, work: 150, desc: '每月金收入 +150' },
    farm: { name: '农田', ch: '农', cost: 300, work: 150, desc: '每季兵粮收入 +1300（七月加倍）' },
    barracks: { name: '兵营', ch: '兵', cost: 500, work: 200, desc: '可征兵，征兵量提高' },
    smithy: { name: '锻冶所', ch: '锻', cost: 600, work: 220, desc: '可生产枪、戟、弩' },
    stable: { name: '厩舍', ch: '厩', cost: 600, work: 220, desc: '可生产军马' },
    workshop: { name: '工房', ch: '工', cost: 800, work: 260, desc: '可生产冲车、井阑、投石' },
  };
  R.FAC_ORDER = ['market', 'farm', 'barracks', 'smithy', 'stable', 'workshop'];

  // 特技
  R.SKILLS = {
    '飞将': '所有战法必定暴击',
    '霸王': '战法暴击率 +50%',
    '神将': '伤害 +15%，战法成功率 +15%',
    '斗神': '枪兵、戟兵战法必定暴击',
    '枪将': '枪兵战法必定暴击',
    '戟将': '戟兵战法必定暴击',
    '弓将': '弩兵战法必定暴击',
    '骑将': '骑兵战法必定暴击',
    '骑神': '骑兵战法必定暴击，骑兵伤害 +15%',
    '勇将': '战法暴击率 +25%',
    '威风': '攻击后令敌部队气力 -8',
    '铁壁': '部队受到伤害 -20%',
    '攻城': '对都市、关隘伤害 +50%',
    '强行': '部队移动力 +4',
    '遁走': '部队溃灭时不会被俘',
    '鼓舞': '每回合部队气力 +8',
    '医者': '每回合部队兵力回复 3%',
    '屯田': '部队兵粮消耗减半',
    '水将': '水上攻防 +30%',
    '神算': '计略必定成功（对洞察者除外）',
    '火神': '火计必定成功，火焰伤害加倍',
    '深谋': '计略成功率 +20%，不会中计',
    '鬼谋': '计略成功率 +15%',
    '洞察': '不会中计',
    '奸雄': '战法、计略成功率 +10%',
    '名声': '征兵量 +50%',
    '能吏': '建设速度 +50%，生产量 +30%',
    '富豪': '所在都市金收入 +30%',
    '米道': '所在都市兵粮收入 +30%',
    '仁政': '巡察效果加倍',
    '繁殖': '军马生产量加倍',
    '发明': '兵器生产量加倍',
    '眼力': '登用成功率 +20%',
    '论客': '外交成功率 +20%',
  };

  // 行动力消耗
  R.AP = {
    build: 20, recruit: 20, train: 15, patrol: 15, produce: 20, march: 10,
    search: 10, employ: 10, reward: 10, move: 5, diplomacy: 20, captive: 0,
  };
  R.AP_MAX = 255;
  R.apGain = nCities => 60 + nCities * 10;

  // 规模默认值
  R.CITY_DEFAULT = {
    3: { maxTroops: 80000, gold: 3000, food: 40000, troops: 20000, dur: 4000, slots: 12, spear: 8000, halberd: 6000, crossbow: 6000, horse: 4000,
      facs: ['market', 'market', 'farm', 'farm', 'barracks', 'smithy', 'stable'] },
    2: { maxTroops: 60000, gold: 2000, food: 25000, troops: 12000, dur: 3000, slots: 10, spear: 5000, halberd: 4000, crossbow: 3000, horse: 2000,
      facs: ['market', 'farm', 'farm', 'barracks', 'smithy'] },
    1: { maxTroops: 40000, gold: 1000, food: 15000, troops: 6000, dur: 2200, slots: 8, spear: 3000, halberd: 2000, crossbow: 2000, horse: 1000,
      facs: ['market', 'farm', 'barracks'] },
    gate: { maxTroops: 30000, gold: 0, food: 12000, troops: 6000, dur: 5000, slots: 0, spear: 3000, halberd: 3000, crossbow: 3000, horse: 0, facs: [] },
  };

  R.XUN = ['上旬', '中旬', '下旬'];
  R.dateStr = s => `${s.year}年${s.month}月${R.XUN[s.xun]}`;
})(window.SG);
