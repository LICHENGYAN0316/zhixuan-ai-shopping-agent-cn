export type SpecKey =
  | 'efficacy'
  | 'sensitivity'
  | 'ingredientTransparency'
  | 'value'
  | 'popularity'
  | 'reviewSignal';

export type EvidenceSource = {
  source_kind: string;
  url: string;
  checked_at: string;
  supports: string[];
};

export type BrandClaim = {
  claim: string;
  claim_owner: 'brand';
  evidence_method: string;
  source_url: string;
  checked_at: string;
};

export type Product = Record<SpecKey, number> & {
  product_id: string;
  name: string;
  source_title: string;
  category: string;
  product_type: string;
  brand: string;
  shop_name: string;
  price: number;
  price_label: '样本价';
  sales_count: number | null;
  review_count: number | null;
  size_value: number | null;
  size_unit: string | null;
  merchant_claim_tags: string[];
  title_ingredient_mentions: string[];
  historical_data: true;
  evidence_level: 'official_current_reference' | 'historical_title_only';
  match_status: 'exact_name_size_current_cross_market' | 'canonical_series_only' | 'legacy_unmatched';
  formula_market: string | null;
  formula_version_label: string | null;
  formula_checked_at: string | null;
  ingredient_list_completeness: 'full' | 'full_current_reference' | 'key_only' | 'none';
  ingredients: string[];
  normalized_ingredients: string[];
  official_formulated_without: string[];
  normalized_formulated_without: string[];
  official_skin_types: string[];
  official_concerns: string[];
  brand_claims: BrandClaim[];
  recommendation_eligibility: {
    basic_retrieval: boolean;
    efficacy: boolean;
    sensitive_skin: boolean;
    ingredient_avoidance: boolean;
  };
  evidence_sources: EvidenceSource[];
  description: string;
  highlights: string;
  limitations: string;
};

export type Intent = {
  category: string;
  productTypes: string[];
  budgetMin: number | null;
  budget: number | null;
  skinType: string;
  sensitiveSkin: boolean | null;
  concerns: string[];
  desiredEffects: string[];
  avoidIngredients: string[];
  preferredIngredients: string[];
  avoidFragrance: boolean | null;
  preferredBrands: string[];
  excludedBrands: string[];
  preferredBrand: string | null;
  keywords: string[];
  useCase: string;
  primaryPreference: SpecKey;
  preferences: Record<SpecKey, number>;
  requiresVerifiedEvidence: boolean;
  needsClarification: boolean;
  clarificationField: string | null;
  confidence: number;
  provider?: 'doubao' | 'local-fallback';
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
  efficacy: '功效证据',
  sensitivity: '敏感适配',
  ingredientTransparency: '成分透明',
  value: '预算适配',
  popularity: '历史热度',
  reviewSignal: '历史反馈',
};

const SPEC_KEYS = Object.keys(SPEC_LABELS) as SpecKey[];
const KNOWN_BRANDS = ['雅漾', '倩碧', '悦诗风吟', 'SK-II', 'SKII', '兰芝', '薇姿', '资生堂', '雅诗兰黛', '欧莱雅', '玉兰油'];

const EFFECT_WORDS: Record<string, string[]> = {
  '保湿': ['保湿', '补水', '干燥', '缺水', '水润', 'dehydration', 'dry skin'],
  '舒缓': ['舒缓', '舒敏', '镇静', '泛红', 'soothing', 'comfort'],
  '修护': ['修护', '修复', '屏障', 'skin barrier'],
  '控油': ['控油', '油皮', '出油', '油光', 'sebum', 'shine control', 'oily'],
  '清洁': ['清洁', '洁面', '毛孔'],
  '祛痘': ['祛痘', '去痘', '痘肌', '抗痘'],
  '抗老': ['抗老', '抗皱', '淡纹', '紧致', 'fine lines'],
  '提亮': ['提亮', '亮肤', '美白', '暗沉', 'dullness', 'age spots'],
  '防晒': ['防晒', '防护', 'spf'],
  '定妆': ['定妆', '持妆', '散粉', '蜜粉'],
  '卸妆': ['卸妆'],
  '去屑': ['去屑', '头屑'],
};

const INGREDIENT_ALIASES: Record<string, string> = {
  fragrance: 'fragrance', parfum: 'fragrance', '香精': 'fragrance', '香料': 'fragrance',
  alcohol: 'alcohol', '酒精': 'alcohol', '乙醇': 'alcohol',
  'drying alcohol': 'drying alcohol', '变性乙醇': 'drying alcohol',
  paraben: 'paraben', parabens: 'paraben', '对羟基苯甲酸酯': 'paraben',
  'mineral oil': 'mineral oil', '矿物油': 'mineral oil',
  sls: 'sls', 'sodium lauryl sulfate': 'sls', '月桂醇硫酸酯钠': 'sls',
  sles: 'sles', 'sodium laureth sulfate': 'sles', '月桂醇聚醚硫酸酯钠': 'sles',
  talc: 'talc', '滑石粉': 'talc',
  phthalates: 'phthalates', '邻苯二甲酸酯': 'phthalates',
  'salicylic acid': 'salicylic acid', '水杨酸': 'salicylic acid',
  retinol: 'retinol', '视黄醇': 'retinol', 'a醇': 'retinol',
};

function unique(values: string[], limit = 20): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))].slice(0, limit);
}

function clampNumber(value: unknown, minimum: number, maximum: number): number | null {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  return Math.max(minimum, Math.min(maximum, number));
}

function normalizeIngredient(value: string): string {
  const key = value.toLowerCase().trim();
  return INGREDIENT_ALIASES[key] ?? key;
}

function normalizeCategory(category: string): string {
  if (/护肤|面部|喷雾|乳液|面霜|精华|面膜/.test(category)) return '面部护理';
  if (/底妆|散粉|蜜粉|粉底|定妆/.test(category)) return '底妆';
  if (/唇|口红/.test(category)) return '唇部彩妆';
  if (/眼|睫毛|眉/.test(category)) return '眼部彩妆';
  if (/清洁|卸妆|洁面/.test(category)) return '清洁卸妆';
  if (/防晒/.test(category)) return '防晒';
  if (/洗护发|洗发|护发|头皮/.test(category)) return '洗护发';
  if (/身体|手足|沐浴/.test(category)) return '身体护理';
  if (/香水|香氛/.test(category)) return '香氛';
  if (/套装|礼盒/.test(category)) return '套装';
  if (/日化|全部|不限|其他|未确定/.test(category)) return '全部日化';
  return category || '全部日化';
}

function inferCategory(query: string): string {
  if (/散粉|蜜粉|粉底|定妆|气垫|遮瑕/.test(query)) return '底妆';
  if (/口红|唇膏|唇釉/.test(query)) return '唇部彩妆';
  if (/眼影|眼线|睫毛|眉笔/.test(query)) return '眼部彩妆';
  if (/卸妆|洁面|洗面奶/.test(query)) return '清洁卸妆';
  if (/防晒/.test(query)) return '防晒';
  if (/洗发|护发|发膜|头皮|去屑/.test(query)) return '洗护发';
  if (/身体乳|沐浴|护手|身体护理/.test(query)) return '身体护理';
  if (/香水|香氛/.test(query)) return '香氛';
  if (/套装|礼盒/.test(query)) return '套装';
  if (/日化|都可以|不限品类/.test(query)) return '全部日化';
  return '面部护理';
}

function inferProductTypes(query: string): string[] {
  const rules: Array<[string, RegExp]> = [
    ['散粉', /散粉|蜜粉|定妆粉/], ['喷雾', /喷雾/], ['乳液', /乳液|润肤乳|保湿乳/],
    ['面霜', /面霜|保湿霜|晚霜|日霜/], ['面膜', /面膜|睡眠膜/], ['精华', /精华|肌底液|原液/],
    ['化妆水', /化妆水|爽肤水|精华水/], ['洁面', /洁面|洗面奶|洗颜/], ['卸妆', /卸妆/],
    ['防晒', /防晒/], ['粉底', /粉底|气垫|bb霜|cc霜/i], ['口红', /口红|唇膏|唇釉/],
    ['眼部彩妆', /眼影|眼线|睫毛|眉笔/], ['洗发护发', /洗发|护发|发膜/], ['香水', /香水|古龙水/],
  ];
  return rules.filter(([, pattern]) => pattern.test(query)).map(([name]) => name);
}

function inferBudget(query: string): number | null {
  const candidates: Array<{ index: number; value: number }> = [];
  const patterns: Array<[RegExp, number]> = [
    [/(?:预算|上限|不超过|控制在|低于|少于|大约|约|改成|调整为|降到|提高到)\s*[:：]?\s*(\d{1,5})(?:\s*元)?/g, 1],
    [/(\d{1,5})\s*元(?:内|以内|以下|左右|上下)?/g, 1],
    [/(?:预算|上限|不超过|控制在|低于|少于|大约|约)\s*[:：]?\s*(\d+(?:\.\d+)?)\s*[kK千](?:\s*元)?/g, 1000],
  ];
  patterns.forEach(([pattern, multiplier]) => {
    for (const match of query.matchAll(pattern)) {
      const value = Math.round(Number(match[1]) * multiplier);
      if (value >= 10 && value <= 50000) candidates.push({ index: match.index ?? 0, value });
    }
  });
  candidates.sort((a, b) => a.index - b.index);
  return candidates.at(-1)?.value ?? null;
}

function inferSkinType(query: string): string {
  if (/混合|混油|混干/.test(query)) return '混合性';
  if (/油皮|油性|出油/.test(query)) return '油性';
  if (/干皮|干性|干燥/.test(query)) return '干性';
  if (/中性/.test(query)) return '中性';
  return '未知';
}

function inferEffects(query: string): string[] {
  return Object.entries(EFFECT_WORDS)
    .filter(([, words]) => words.some((word) => query.toLowerCase().includes(word.toLowerCase())))
    .map(([effect]) => effect);
}

function inferAvoidIngredients(query: string): string[] {
  const candidates: string[] = [];
  const rules: Array<[string, RegExp]> = [
    ['fragrance', /香精|香料|fragrance|parfum/i], ['alcohol', /酒精|乙醇|alcohol/i],
    ['drying alcohol', /变性乙醇|alcohol denat/i], ['paraben', /paraben|对羟基苯甲酸酯/i],
    ['mineral oil', /矿物油|mineral oil/i], ['SLS', /\bsls\b|月桂醇硫酸酯钠/i],
    ['SLES', /\bsles\b|月桂醇聚醚硫酸酯钠/i], ['talc', /滑石粉|talc/i],
    ['phthalates', /邻苯二甲酸酯|phthalate/i], ['salicylic acid', /水杨酸|salicylic acid/i],
    ['retinol', /视黄醇|a醇|retinol/i],
  ];
  if (!/避开|避雷|不要|不含|无添加|过敏|不能用|不耐受|排除/.test(query)) return [];
  rules.forEach(([name, pattern]) => { if (pattern.test(query)) candidates.push(normalizeIngredient(name)); });
  return unique(candidates);
}

function describeUseCase(intent: Pick<Intent, 'sensitiveSkin' | 'avoidIngredients' | 'desiredEffects' | 'skinType'>): string {
  if (intent.sensitiveSkin) return '敏感肌谨慎选品';
  if (intent.avoidIngredients.length) return '成分避雷';
  if (intent.desiredEffects.length) return intent.desiredEffects.slice(0, 2).join(' + ');
  if (intent.skinType !== '未知') return intent.skinType + '日常护理';
  return '日常日化选品';
}

function preferenceFor(intent: Pick<Intent, 'sensitiveSkin' | 'avoidIngredients' | 'desiredEffects'>): SpecKey {
  if (intent.sensitiveSkin) return 'sensitivity';
  if (intent.avoidIngredients.length) return 'ingredientTransparency';
  if (intent.desiredEffects.length) return 'efficacy';
  return 'value';
}

function buildPreferences(primary: SpecKey): Record<SpecKey, number> {
  const raw: Record<SpecKey, number> = {
    efficacy: 0.18,
    sensitivity: 0.12,
    ingredientTransparency: 0.12,
    value: 0.2,
    popularity: 0.2,
    reviewSignal: 0.18,
  };
  raw[primary] += 0.42;
  const total = SPEC_KEYS.reduce((sum, key) => sum + raw[key], 0);
  return Object.fromEntries(SPEC_KEYS.map((key) => [key, raw[key] / total])) as Record<SpecKey, number>;
}

export function understandIntent(query: string): Intent {
  const sensitiveSkin = /敏感肌|敏感皮|容易泛红|易泛红|敏皮/.test(query) ? true : null;
  const avoidIngredients = inferAvoidIngredients(query);
  const desiredEffects = inferEffects(query);
  const skinType = inferSkinType(query);
  const primaryPreference = preferenceFor({ sensitiveSkin, avoidIngredients, desiredEffects });
  const preferredBrands = KNOWN_BRANDS.filter((brand) => query.toLowerCase().includes(brand.toLowerCase()));
  const requiresVerifiedEvidence = Boolean(sensitiveSkin || avoidIngredients.length || /成分|功效|配方|过敏/.test(query));
  const budget = inferBudget(query);
  const intent: Intent = {
    category: inferCategory(query),
    productTypes: inferProductTypes(query),
    budgetMin: null,
    budget,
    skinType,
    sensitiveSkin,
    concerns: desiredEffects,
    desiredEffects,
    avoidIngredients,
    preferredIngredients: [],
    avoidFragrance: avoidIngredients.includes('fragrance') ? true : null,
    preferredBrands,
    excludedBrands: [],
    preferredBrand: preferredBrands[0] ?? null,
    keywords: unique([...desiredEffects, ...inferProductTypes(query), ...preferredBrands]),
    useCase: '',
    primaryPreference,
    preferences: buildPreferences(primaryPreference),
    requiresVerifiedEvidence,
    needsClarification: budget === null,
    clarificationField: budget === null ? 'budget' : null,
    confidence: 0.72,
    provider: 'local-fallback',
  };
  intent.useCase = describeUseCase(intent);
  return intent;
}

type RemoteIntent = Partial<Intent> & { budgetMax?: number | null };

export function normalizeIntent(value: RemoteIntent, fallbackQuery = ''): Intent {
  const fallback = understandIntent(fallbackQuery);
  const avoidIngredients = unique([
    ...(Array.isArray(value.avoidIngredients) ? value.avoidIngredients.map(normalizeIngredient) : fallback.avoidIngredients),
    ...(value.avoidFragrance === true ? ['fragrance'] : []),
  ]);
  const desiredEffects = unique(
    Array.isArray(value.desiredEffects) && value.desiredEffects.length
      ? value.desiredEffects
      : Array.isArray(value.concerns) ? value.concerns : fallback.desiredEffects,
  );
  const sensitiveSkin = typeof value.sensitiveSkin === 'boolean' ? value.sensitiveSkin : fallback.sensitiveSkin;
  const budget = clampNumber(value.budget ?? value.budgetMax ?? fallback.budget, 10, 50000);
  const seed = { sensitiveSkin, avoidIngredients, desiredEffects };
  const primaryPreference = SPEC_KEYS.includes(value.primaryPreference as SpecKey)
    ? value.primaryPreference as SpecKey
    : preferenceFor(seed);
  const preferredBrands = unique(Array.isArray(value.preferredBrands) ? value.preferredBrands : fallback.preferredBrands, 8);
  const intent: Intent = {
    category: normalizeCategory(value.category ?? fallback.category),
    productTypes: unique(Array.isArray(value.productTypes) ? value.productTypes : fallback.productTypes, 8),
    budgetMin: clampNumber(value.budgetMin, 0, 50000),
    budget,
    skinType: typeof value.skinType === 'string' && value.skinType ? value.skinType : fallback.skinType,
    sensitiveSkin,
    concerns: unique(Array.isArray(value.concerns) ? value.concerns : desiredEffects),
    desiredEffects,
    avoidIngredients,
    preferredIngredients: unique(Array.isArray(value.preferredIngredients) ? value.preferredIngredients : [], 12),
    avoidFragrance: value.avoidFragrance === true || avoidIngredients.includes('fragrance') ? true : value.avoidFragrance ?? fallback.avoidFragrance,
    preferredBrands,
    excludedBrands: unique(Array.isArray(value.excludedBrands) ? value.excludedBrands : [], 8),
    preferredBrand: preferredBrands[0] ?? null,
    keywords: unique(Array.isArray(value.keywords) ? value.keywords : [...desiredEffects, ...preferredBrands], 16),
    useCase: '',
    primaryPreference,
    preferences: buildPreferences(primaryPreference),
    requiresVerifiedEvidence: Boolean(sensitiveSkin || avoidIngredients.length || desiredEffects.length || fallback.requiresVerifiedEvidence),
    needsClarification: Boolean(value.needsClarification ?? budget === null),
    clarificationField: typeof value.clarificationField === 'string' ? value.clarificationField : budget === null ? 'budget' : null,
    confidence: clampNumber(value.confidence ?? fallback.confidence, 0, 1) ?? fallback.confidence,
    provider: value.provider === 'doubao' ? 'doubao' : 'local-fallback',
  };
  intent.useCase = describeUseCase(intent);
  return intent;
}

function budgetFit(price: number, budget: number | null): number {
  if (!budget) return 0.6;
  if (price > budget) return 0;
  const ratio = price / Math.max(budget, 1);
  return 0.72 + 0.28 * Math.min(1, ratio / 0.75);
}

function textFor(product: Product): string {
  return [
    product.name, product.source_title, product.category, product.product_type, product.brand,
    ...product.merchant_claim_tags, ...product.official_concerns, ...product.official_skin_types,
    ...product.ingredients, ...product.official_formulated_without,
  ].join(' ').toLowerCase();
}

function effectMatches(product: Product, effect: string, verifiedOnly: boolean): boolean {
  const terms = EFFECT_WORDS[effect] ?? [effect];
  const verifiedText = [...product.official_concerns, ...product.brand_claims.map((claim) => claim.claim)].join(' ').toLowerCase();
  const searchable = verifiedOnly ? verifiedText : textFor(product);
  return terms.some((term) => searchable.includes(term.toLowerCase()));
}

function ingredientAvoidancePasses(product: Product, avoided: string[]): boolean {
  if (!avoided.length) return true;
  if (!product.recommendation_eligibility.ingredient_avoidance) return false;
  const ingredients = new Set(product.normalized_ingredients.map(normalizeIngredient));
  const without = new Set(product.normalized_formulated_without.map(normalizeIngredient));
  return avoided.every((raw) => {
    const term = normalizeIngredient(raw);
    if (ingredients.has(term)) return false;
    if (without.has(term)) return true;
    if (term === 'alcohol' && without.has('drying alcohol')) return true;
    return product.ingredient_list_completeness === 'full' && !ingredients.has(term);
  });
}

function eligible(product: Product, intent: Intent): boolean {
  if (intent.category !== '全部日化' && product.category !== intent.category) return false;
  if (intent.productTypes.length && !intent.productTypes.includes(product.product_type)) return false;
  if (intent.budgetMin !== null && product.price < intent.budgetMin) return false;
  if (intent.budget !== null && product.price > intent.budget) return false;
  if (intent.excludedBrands.some((brand) => product.brand.includes(brand))) return false;
  if (intent.sensitiveSkin && !product.recommendation_eligibility.sensitive_skin) return false;
  if (intent.desiredEffects.length && intent.requiresVerifiedEvidence && !product.recommendation_eligibility.efficacy) return false;
  if (!ingredientAvoidancePasses(product, intent.avoidIngredients)) return false;
  return true;
}

function retrievalScore(product: Product, intent: Intent): number {
  const searchable = textFor(product);
  const keywordMatches = intent.keywords.filter((keyword) => searchable.includes(keyword.toLowerCase())).length;
  const effectMatchCount = intent.desiredEffects.filter((effect) => effectMatches(product, effect, intent.requiresVerifiedEvidence)).length;
  const brandMatch = intent.preferredBrands.some((brand) => product.brand.toLowerCase().includes(brand.toLowerCase())) ? 1 : 0;
  const evidence = product.evidence_level === 'official_current_reference' ? 1 : 0;
  return budgetFit(product.price, intent.budget) * 0.25
    + Math.min(keywordMatches, 4) * 0.07
    + Math.min(effectMatchCount, 3) * 0.14
    + brandMatch * 0.18
    + evidence * (intent.requiresVerifiedEvidence ? 0.24 : 0.05)
    + product.popularity * 0.08;
}

function recommendationScore(product: Product, intent: Intent, retrieval: number): number {
  const preference = SPEC_KEYS.reduce((sum, key) => sum + product[key] * intent.preferences[key], 0);
  return Math.max(0, Math.min(1, preference * 0.68 + Math.min(1, retrieval) * 0.32));
}

function reasonsFor(product: Product, intent: Intent): string[] {
  const reasons: string[] = [];
  if (intent.budget) reasons.push(`样本价 ¥${product.price.toLocaleString('zh-CN')}，在 ¥${intent.budget.toLocaleString('zh-CN')} 预算内`);
  if (intent.sensitiveSkin && product.recommendation_eligibility.sensitive_skin) reasons.push('当前品牌官方页包含敏感肌相关声明，已作为跨市场参考核实');
  if (intent.avoidIngredients.length) {
    const explicit = intent.avoidIngredients.filter((item) => product.normalized_formulated_without.map(normalizeIngredient).includes(normalizeIngredient(item)));
    if (explicit.length) reasons.push(`品牌官方明确列为不含：${explicit.join('、')}`);
    else reasons.push('当前官方完整成分参考未命中已指定的避开项');
  }
  const matchedEffects = intent.desiredEffects.filter((effect) => effectMatches(product, effect, true));
  if (matchedEffects.length) reasons.push(`品牌官方产品页可对应：${matchedEffects.join('、')}（品牌声明）`);
  if (!intent.requiresVerifiedEvidence) {
    if (product.sales_count !== null) reasons.push(`历史热度记录 ${product.sales_count.toLocaleString('zh-CN')}，仅作离线排序信号`);
    else reasons.push('历史热度字段缺失，排序时未按零值处理');
  }
  if (product.evidence_level !== 'official_current_reference') reasons.push('只有历史标题字段，成分与功效尚未核实');
  if (reasons.length < 2) reasons.push(`${SPEC_LABELS[intent.primaryPreference]}指数 ${Math.round(product[intent.primaryPreference] * 100)} 分`);
  return unique(reasons, 4);
}

export function runAgentFromIntent(intentValue: Intent, products: Product[]): AgentResponse {
  const intent = normalizeIntent(intentValue);
  if (!intent.budget || intent.needsClarification && intent.clarificationField === 'budget') {
    const label = intent.category === '全部日化' ? '日化商品' : intent.category;
    return { kind: 'clarification', question: `为了缩小${label}候选范围，你的预算上限大约是多少元？`, intent };
  }
  const retrieved = products
    .filter((product) => eligible(product, intent))
    .map((product) => ({ product, retrievalScore: retrievalScore(product, intent) }))
    .sort((a, b) => b.retrievalScore - a.retrievalScore || a.product.price - b.product.price)
    .slice(0, 36);
  const results = retrieved
    .map(({ product, retrievalScore: retrieval }) => ({
      product,
      retrievalScore: retrieval,
      score: recommendationScore(product, intent, retrieval),
      reasons: reasonsFor(product, intent),
    }))
    .sort((a, b) => b.score - a.score || b.retrievalScore - a.retrievalScore)
    .slice(0, 3);
  const top = results[0]?.product;
  const summary = top
    ? intent.requiresVerifiedEvidence
      ? `在 ${retrieved.length} 个通过约束的候选中，${top.name} 的当前官方参考与需求匹配度最高。配方与声明按当前跨市场官方页面核实，不反推历史版本。`
      : `在 ${retrieved.length} 个离线候选中，${top.name} 的预算、品类与历史信号综合匹配更高；历史标题中的功效词不作为已验证事实。`
    : intent.requiresVerifiedEvidence
      ? '当前核实属性表中没有同时满足品类、预算和证据约束的候选；不会用未核实标题补齐敏感肌、成分或功效结论。'
      : '当前离线日化商品库没有满足约束的候选，建议调整预算或放宽品类要求。';
  return { kind: 'recommendation', intent, retrievedCount: retrieved.length, results, summary };
}

export function runAgent(query: string, products: Product[]): AgentResponse {
  return runAgentFromIntent(understandIntent(query), products);
}
