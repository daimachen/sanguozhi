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
    ram: { name: '冲车', fac: 'workshop', siege: true, cost: 600 },
    tower: { name: '井阑', fac: 'workshop', siege: true, cost: 700 },
    catapult: { name: '投石', fac: 'workshop', siege: true, cost: 800 },
    dou: { name: '斗舰', fac: 'dockyard', siege: true, cost: 500, ship: true },
    lou: { name: '楼船', fac: 'dockyard', siege: true, cost: 900, ship: true },
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
    dockyard: { name: '造船厂', ch: '船', cost: 700, work: 240, desc: '可生产斗舰、楼船（须临近水域）', water: true },
  };
  R.FAC_ORDER = ['market', 'farm', 'barracks', 'smithy', 'stable', 'workshop', 'dockyard'];

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
    port: { maxTroops: 20000, gold: 0, food: 8000, troops: 3000, dur: 2000, slots: 0, spear: 2000, halberd: 1000, crossbow: 2000, horse: 0, dou: 2, lou: 0, facs: [] },
    gate: { maxTroops: 30000, gold: 0, food: 12000, troops: 6000, dur: 5000, slots: 0, spear: 3000, halberd: 3000, crossbow: 3000, horse: 0, facs: [] },
  };

  // ---------- 舰船与水军 ----------
  R.SHIPS = {
    zou: { name: '走舸', atk: 42, def: 40, cost: 5, sea: Infinity },
    dou: { name: '斗舰', atk: 66, def: 62, cost: 3, sea: 4 },
    lou: { name: '楼船', atk: 78, def: 86, cost: 4, sea: 4, range: [1, 2] },
  };
  R.TACTICS.navy = [
    { id: 'chongtu', name: '冲突', en: 12, mult: 1.35, push: 1 },
    { id: 'shuiluan', name: '乱射', en: 12, mult: 1.15, splash: 0.6, range: [1, 2] },
    { id: 'huochuan', name: '火船', en: 15, mult: 0.9, fire: true, range: [1, 2] },
  ];

  // ---------- 官职 ----------
  // 品级 0=无官；统兵上限、所需功绩、军职加成（统、武）
  R.GRADE_NAME = ['无官', '一品', '二品', '三品', '四品', '五品', '六品', '七品'];
  R.GRADE_CAP = [7000, 14000, 13000, 12000, 11000, 10000, 9000, 8000];
  R.GRADE_MERIT = [0, 16000, 11000, 7000, 4000, 2000, 1000, 300];
  R.GRADE_BONUS = [[0, 0], [5, 3], [4, 2], [3, 2], [2, 1], [1, 1], [1, 0], [0, 0]];
  R.RANKS = [
    { id: 'djj', name: '大将军', grade: 1 },
    { id: 'pq', name: '骠骑将军', grade: 2 }, { id: 'cq', name: '车骑将军', grade: 2 },
    { id: 'qj', name: '前将军', grade: 3 }, { id: 'hj', name: '后将军', grade: 3 }, { id: 'zj', name: '左将军', grade: 3 }, { id: 'yj', name: '右将军', grade: 3 },
    { id: 'zdj', name: '征东将军', grade: 4 }, { id: 'zxj', name: '征西将军', grade: 4 }, { id: 'znj', name: '征南将军', grade: 4 }, { id: 'zbj', name: '征北将军', grade: 4 },
    { id: 'hdj', name: '镇东将军', grade: 5 }, { id: 'hxj', name: '镇西将军', grade: 5 }, { id: 'hnj', name: '镇南将军', grade: 5 }, { id: 'hbj', name: '镇北将军', grade: 5 },
    { id: 'adj', name: '安东将军', grade: 6 }, { id: 'axj', name: '安西将军', grade: 6 }, { id: 'anj', name: '安南将军', grade: 6 }, { id: 'abj', name: '安北将军', grade: 6 },
    { id: 'pjj', name: '偏将军', grade: 7, slots: 8 }, { id: 'bjj', name: '裨将军', grade: 7, slots: 8 },
    { id: 'js', name: '军师', grade: 3, civ: true, bonus: [0, 0, 5, 0, 0], desc: '势力行动力每旬 +10' },
    { id: 'sls', name: '尚书令', grade: 3, civ: true, bonus: [0, 0, 0, 5, 0] },
    { id: 'sz', name: '侍中', grade: 4, civ: true, bonus: [0, 0, 3, 3, 0] },
    { id: 'zsl', name: '中书令', grade: 5, civ: true, bonus: [0, 0, 2, 2, 2] },
  ];
  R.RANK = {};
  for (const r of R.RANKS) {
    R.RANK[r.id] = r;
    if (!r.bonus) { const b = R.GRADE_BONUS[r.grade]; r.bonus = [b[0], b[1], 0, 0, 0]; }
    r.slots = r.slots || 1;
  }
  // 君主爵位：所需都市数、可授予的最高品级、每旬额外行动力
  R.TITLES = [
    { name: '太守', need: 0, maxGrade: 6, ap: 0 },
    { name: '刺史', need: 3, maxGrade: 5, ap: 5 },
    { name: '州牧', need: 6, maxGrade: 4, ap: 10 },
    { name: '公', need: 10, maxGrade: 3, ap: 20 },
    { name: '王', need: 16, maxGrade: 2, ap: 30 },
    { name: '皇帝', need: 24, maxGrade: 1, ap: 40 },
  ];

  // ---------- 工事（开沟、挖坑、引水） ----------
  R.WORKS = [
    { id: 'ditch', name: '开沟', en: 10, minTroops: 1000, desc: '在相邻平地挖掘壕沟：敌军难以通过、兵器无法通行；与河流相连会灌满成为水渠，可引水' },
    { id: 'trap', name: '陷坑', en: 10, minTroops: 1000, desc: '在相邻空地设置隐蔽陷坑，敌军踏入即受损、气力大减并停止移动' },
    { id: 'dam', name: '筑堤', en: 20, minTroops: 3000, desc: '在相邻河道筑堤蓄水，水位逐旬上涨（六至九月雨季加倍）' },
    { id: 'breach', name: '决堤', en: 10, minTroops: 0, desc: '掘开相邻堤坝，洪水沿河道与水渠泛滥，水淹低地部队与城池' },
    { id: 'fill', name: '填沟', en: 10, minTroops: 1000, desc: '填平相邻的壕沟或水渠' },
  ];
  R.DAM_MAX = 10;
  R.MAX_TRAPS = 12;

  R.AUTO_MODES = {
    manual: { name: '手动', desc: '所有内政、军事均由主公亲自下令（仍可对单城「委任」）' },
    domestic: { name: '内政托管', desc: '开发、征兵、训练、巡察、生产、搜索、登用、俘虏、褒赏、官职任命交由部下自动处理；主公专注出征与指挥部队' },
    full: { name: '全托管', desc: '内政与军事全部交由电脑按照 AI 方针执行（可随时切回）' },
  };

  R.XUN = ['上旬', '中旬', '下旬'];
  R.dateStr = s => `${s.year}年${s.month}月${R.XUN[s.xun]}`;
})(window.SG);
