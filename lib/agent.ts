export type SpecKey =
  | 'performance'
  | 'battery'
  | 'portability'
  | 'display'
  | 'camera'
  | 'audio'
  | 'gaming'
  | 'office'
  | 'connectivity'
  | 'quality'
  | 'sustainability';

export type Product = Record<SpecKey, number> & {
  product_id: string;
  category: string;
  brand: string;
  name: string;
  price: number;
  original_price: number;
  rating: number;
  review_count: number;
  sales_count: number;
  stock: number;
  release_days: number;
  description: string;
  highlights: string;
  limitations: string;
};

export type Ranker = {
  features: string[];
  mean: number[];
  scale: number[];
  coefficients: number[];
  intercept: number;
};

export type Intent = {
  category: string;
  budget: number | null;
  useCase: string;
  primaryPreference: SpecKey;
  preferences: Record<SpecKey, number>;
  preferredBrand: string | null;
  keywords: string[];
};

export type Recommendation = {
  product: Product;
  score: number;
  retrievalScore: number;
  reasons: string[];
};

export type AgentResponse =
  | { kind: 'clarification'; question: string; intent: Intent }
  | { kind: 'recommendation'; intent: Intent; retrievedCount: number; results: Recommendation[]; summary: string };

export const SPEC_LABELS: Record<SpecKey, string> = {
  performance: '性能',
  battery: '续航',
  portability: '便携',
  display: '屏幕',
  camera: '影像',
  audio: '音质',
  gaming: '游戏',
  office: '办公',
  connectivity: '连接',
  quality: '品质',
  sustainability: '可持续',
};

const SPEC_KEYS = Object.keys(SPEC_LABELS) as SpecKey[];
const BRANDS = ['星云', '岚川', '极昼', '澄光', '矩阵', '森屿', '云驰', '玄甲'];

const useCaseFeature: Record<string, SpecKey> = {
  学习办公: 'office',
  编程开发: 'performance',
  影音娱乐: 'audio',
  轻度游戏: 'gaming',
  内容创作: 'display',
  差旅通勤: 'portability',
};

const useCaseWeights: Record<string, Partial<Record<SpecKey, number>>> = {
  学习办公: { office: 1, battery: 0.8, portability: 0.7, display: 0.5 },
  编程开发: { performance: 1, office: 0.9, display: 0.6, battery: 0.5 },
  影音娱乐: { display: 1, audio: 0.9, battery: 0.6, performance: 0.4 },
  轻度游戏: { gaming: 1, performance: 0.9, display: 0.7, quality: 0.4 },
  内容创作: { performance: 1, display: 0.9, camera: 0.6, quality: 0.5 },
  差旅通勤: { portability: 1, battery: 0.95, connectivity: 0.6, quality: 0.4 },
};

const keywordRules: Array<[SpecKey, string[]]> = [
  ['battery', ['续航', '电池', '一天']],
  ['portability', ['轻薄', '便携', '出差', '通勤', '重量']],
  ['performance', ['性能', '流畅', '编程', '开发', '算力']],
  ['display', ['屏幕', '护眼', '显示', '色彩']],
  ['camera', ['拍照', '影像', '视频', '相机']],
  ['audio', ['音质', '降噪', '听歌', '影音']],
  ['gaming', ['游戏', '电竞', '帧率']],
  ['office', ['办公', '学习', '文档']],
  ['connectivity', ['连接', '蓝牙', '接口', '信号']],
  ['quality', ['耐用', '品质', '做工', '稳定']],
];

function inferCategory(query: string): string {
  if (/耳机|降噪|听歌/.test(query)) return '头戴耳机';
  if (/显示器|外接屏|电竞屏/.test(query)) return '显示器';
  if (/键盘|鼠标|键鼠/.test(query)) return '键鼠套装';
  if (/平板|tablet|Pad/i.test(query)) return '平板电脑';
  if (/手机|拍照|安卓|iPhone/i.test(query)) return '智能手机';
  return '笔记本电脑';
}

function inferUseCase(query: string): string {
  if (/编程|开发|代码/.test(query)) return '编程开发';
  if (/游戏|电竞/.test(query)) return '轻度游戏';
  if (/剪辑|设计|创作|绘图/.test(query)) return '内容创作';
  if (/出差|通勤|旅行|便携/.test(query)) return '差旅通勤';
  if (/影音|追剧|电影|听歌/.test(query)) return '影音娱乐';
  return '学习办公';
}

function inferBudget(query: string): number | null {
  const kMatch = query.match(/(\d+(?:\.\d+)?)\s*[kK千]/);
  if (kMatch) return Math.round(Number(kMatch[1]) * 1000);
  const matches = [...query.matchAll(/(?:预算|不超过|以内|大约|左右)?\s*(\d{3,5})\s*元?/g)]
    .map((match) => Number(match[1]))
    .filter((value) => value >= 100 && value <= 50000);
  return matches.length ? Math.max(...matches) : null;
}

export function understandIntent(query: string): Intent {
  const category = inferCategory(query);
  const useCase = inferUseCase(query);
  const raw = Object.fromEntries(SPEC_KEYS.map((key) => [key, 0.08])) as Record<SpecKey, number>;
  Object.entries(useCaseWeights[useCase]).forEach(([key, value]) => {
    raw[key as SpecKey] += value ?? 0;
  });
  const matched = keywordRules.filter(([, words]) => words.some((word) => query.includes(word)));
  matched.forEach(([key]) => { raw[key] += 1.15; });
  const primaryPreference = matched[0]?.[0] ?? useCaseFeature[useCase];
  raw[primaryPreference] += 0.5;
  const total = SPEC_KEYS.reduce((sum, key) => sum + raw[key], 0);
  const preferences = Object.fromEntries(SPEC_KEYS.map((key) => [key, raw[key] / total])) as Record<SpecKey, number>;
  return {
    category,
    budget: inferBudget(query),
    useCase,
    primaryPreference,
    preferences,
    preferredBrand: BRANDS.find((brand) => query.includes(brand)) ?? null,
    keywords: matched.flatMap(([, words]) => words.filter((word) => query.includes(word))),
  };
}

function budgetFit(price: number, budget: number): number {
  const ratio = price / Math.max(budget, 1);
  return Math.exp(-2.5 * Math.max(0, ratio - 1)) * Math.exp(-0.35 * Math.max(0, 0.48 - ratio));
}

function featureValue(feature: string, product: Product, intent: Intent): number {
  if (feature === 'log_price') return Math.log1p(product.price);
  if (feature === 'rating') return product.rating;
  if (feature === 'log_sales') return Math.log1p(product.sales_count);
  if (feature === 'release_recency') return Math.exp(-product.release_days / 720);
  if (feature === 'budget_fit') return budgetFit(product.price, intent.budget ?? product.price);
  if (feature === 'brand_match') return intent.preferredBrand === product.brand ? 1 : 0;
  if (feature === 'use_case_fit') return product[useCaseFeature[intent.useCase]];
  if (feature === 'primary_preference_fit') return product[intent.primaryPreference];
  if (feature === 'preference_fit') return SPEC_KEYS.reduce((sum, key) => sum + intent.preferences[key] * product[key], 0);
  return product[feature as SpecKey] ?? 0;
}

function modelScore(product: Product, intent: Intent, ranker: Ranker): number {
  const logit = ranker.features.reduce((sum, feature, index) => {
    const standardized = (featureValue(feature, product, intent) - ranker.mean[index]) / ranker.scale[index];
    return sum + standardized * ranker.coefficients[index];
  }, ranker.intercept);
  return logit >= 0 ? 1 / (1 + Math.exp(-logit)) : Math.exp(logit) / (1 + Math.exp(logit));
}

function reasonsFor(product: Product, intent: Intent): string[] {
  const budget = intent.budget ?? product.price;
  const reasons = [
    `价格比预算上限低 ¥${Math.max(0, budget - product.price).toLocaleString('zh-CN')}`,
    `${SPEC_LABELS[intent.primaryPreference]}能力 ${Math.round(product[intent.primaryPreference] * 100)} 分`,
    `${product.rating.toFixed(1)} 分，来自 ${product.review_count.toLocaleString('zh-CN')} 条合成评价`,
  ];
  if (product.price > budget) reasons[0] = `超预算 ¥${(product.price - budget).toLocaleString('zh-CN')}，但综合匹配度较高`;
  return reasons;
}

export function runAgent(query: string, products: Product[], ranker: Ranker): AgentResponse {
  const intent = understandIntent(query);
  if (!intent.budget) {
    return { kind: 'clarification', question: `为了缩小${intent.category}候选范围，你的预算上限大约是多少元？`, intent };
  }
  const categoryProducts = products.filter((product) => product.category === intent.category);
  const retrieved = categoryProducts
    .map((product) => {
      const text = `${product.name}${product.description}${product.highlights}`;
      const keywordMatches = intent.keywords.filter((word) => text.includes(word)).length;
      const retrievalScore = budgetFit(product.price, intent.budget!) * 0.7 + keywordMatches * 0.1 + product.rating / 25;
      return { product, retrievalScore };
    })
    .filter(({ product }) => product.price <= intent.budget! * 1.18)
    .sort((a, b) => b.retrievalScore - a.retrievalScore)
    .slice(0, 24);
  const results = retrieved
    .map(({ product, retrievalScore }) => ({ product, retrievalScore, score: modelScore(product, intent, ranker), reasons: reasonsFor(product, intent) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);
  const top = results[0]?.product;
  const summary = top
    ? `在 ${retrieved.length} 个召回候选中，${top.name} 对“${intent.useCase} + ${SPEC_LABELS[intent.primaryPreference]}优先”的综合匹配最高。建议重点比较前三名的预算余量与能力取舍。`
    : '当前合成商品库没有满足约束的候选，建议适当提高预算或放宽品类要求。';
  return { kind: 'recommendation', intent, retrievedCount: retrieved.length, results, summary };
}
