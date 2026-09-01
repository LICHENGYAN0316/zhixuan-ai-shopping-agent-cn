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
  price_label: '样本价' | '联网参考价';
  sales_count: number | null;
  review_count: number | null;
  size_value: number | null;
  size_unit: string | null;
  merchant_claim_tags: string[];
  title_ingredient_mentions: string[];
  historical_data: boolean;
  evidence_level: 'official_current_reference' | 'historical_title_only' | 'web_public_reference';
  match_status: 'exact_name_size_current_cross_market' | 'canonical_series_only' | 'legacy_unmatched' | 'web_source_only';
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
  excludedProductTypes: string[];
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
  requiresVerifiedEfficacy: boolean;
  needsClarification: boolean;
  clarificationField: string | null;
  confidence: number;
  provider?: 'doubao' | 'local-fallback';
};

export type WebEvidence = {
  productId: string;
  title: string;
  url: string;
  siteName: string;
  summary: string;
  retrievedAt: string;
  sourceAuthority: 'official' | 'public';
  matchedEffects: string[];
  matchedSkinTypes: string[];
  formulatedWithout: string[];
  sensitiveSkinClaim: boolean;
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
const KNOWN_BRANDS = [
  '悦诗风吟', '佰草集', '欧莱雅', '雅诗兰黛', '倩碧', '美加净', '欧珀莱', '自然堂',
  '兰蔻', '相宜本草', '兰芝', '妮维雅', '娇兰', '玉兰油', '资生堂', '美宝莲', '薇姿',
  '植村秀', '雅漾', '雪花秀', '蜜丝佛陀', 'SK-II', 'SKII',
];

export const CANONICAL_CATEGORIES = [
  '护肤', '彩妆', '面部护理', '清洁卸妆', '底妆', '唇部彩妆', '眼部彩妆', '防晒', '洗护发',
  '身体护理', '手足护理', '口腔护理', '家居清洁', '香氛', '套装', '其他日化', '全部日化',
] as const;

export const CANONICAL_PRODUCT_TYPES = [
  '散粉', '喷雾', '乳液', '面霜', '面膜', '精华', '化妆水', '精华水', '洁面', '卸妆',
  '防晒', '粉底', '口红', '眼部彩妆', '洗发护发', '身体护理', '手足护理', '口腔护理',
  '家居清洁', '香水', '套装', '其他',
] as const;

type ProductTypeRule = {
  canonical: typeof CANONICAL_PRODUCT_TYPES[number];
  pattern: RegExp;
  category?: typeof CANONICAL_CATEGORIES[number];
};

const PRODUCT_TYPE_RULES: ProductTypeRule[] = [
  { canonical: '散粉', pattern: /散粉|蜜粉|定妆粉/, category: '底妆' },
  { canonical: '喷雾', pattern: /喷雾|喷泉水/, category: '面部护理' },
  { canonical: '乳液', pattern: /乳液|润肤乳|保湿乳|面乳/, category: '面部护理' },
  { canonical: '面霜', pattern: /面霜|保湿霜|乳霜|晚霜|日霜/, category: '面部护理' },
  { canonical: '面膜', pattern: /面膜|睡眠膜|泥膜/, category: '面部护理' },
  { canonical: '精华水', pattern: /精华水|神仙水/, category: '面部护理' },
  { canonical: '精华', pattern: /精华|肌底液|原液/, category: '面部护理' },
  { canonical: '化妆水', pattern: /化妆水|爽肤水|柔肤水/, category: '面部护理' },
  { canonical: '洁面', pattern: /洗面奶|洁面乳|洁面膏|洁面慕斯|洁面泡沫|洗颜|洁面/, category: '清洁卸妆' },
  { canonical: '卸妆', pattern: /卸妆油|卸妆水|卸妆乳|卸妆膏|卸妆/, category: '清洁卸妆' },
  { canonical: '防晒', pattern: /防晒霜|防晒乳|防晒喷雾|隔离防晒|防晒/, category: '防晒' },
  { canonical: '粉底', pattern: /粉底液|粉底霜|气垫|BB霜|CC霜|遮瑕|粉底/i, category: '底妆' },
  { canonical: '口红', pattern: /口红|唇膏|唇釉|唇泥/, category: '唇部彩妆' },
  { canonical: '眼部彩妆', pattern: /眼影|眼线|睫毛|眉笔|眉粉/, category: '眼部彩妆' },
  { canonical: '洗发护发', pattern: /洗发水|洗发露|洗发|护发素|护发|发膜|头皮精华/, category: '洗护发' },
  { canonical: '手足护理', pattern: /护手霜|手膜|足膜|足霜/, category: '手足护理' },
  { canonical: '身体护理', pattern: /身体乳|润体乳|沐浴露|沐浴乳|身体护理/, category: '身体护理' },
  { canonical: '口腔护理', pattern: /牙膏|牙刷|漱口水|口腔喷雾|口腔护理/, category: '口腔护理' },
  { canonical: '家居清洁', pattern: /洗衣液|洗衣粉|洗洁精|清洁剂|消毒液|家居清洁/, category: '家居清洁' },
  { canonical: '香水', pattern: /香水|古龙水|淡香精|淡香水/, category: '香氛' },
  { canonical: '套装', pattern: /套装|礼盒|组合装/, category: '套装' },
];

const EFFECT_WORDS: Record<string, string[]> = {
  '保湿': ['保湿', '补水', '缺水', '水润', 'dehydration'],
  '舒缓': ['舒缓', '舒敏', '镇静', '泛红', 'soothing', 'comfort'],
  '修护': ['修护', '修复', '屏障', 'skin barrier'],
  '控油': ['控油', '出油', '油光', 'sebum', 'shine control'],
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

const NEGATIVE_DIRECTIVES = new Set(['不要添加', '不添加', '不要含', '不想含', '不要', '不需要', '不想要', '不想', '不喜欢', '不是', '并非', '非', '排除', '避开', '别推荐', '别选', '别买', '别要', '不考虑', '去掉', '不含', '无']);
const PRODUCT_NEGATIVE_DIRECTIVES = new Set(['不要', '不需要', '不想要', '不想', '不喜欢', '不是', '并非', '非', '排除', '避开', '别推荐', '别选', '别买', '别要', '不考虑', '去掉']);
const BRAND_NEGATIVE_DIRECTIVES = PRODUCT_NEGATIVE_DIRECTIVES;
const DIRECTIVE_PATTERN = /不要添加|不添加|不要含|不想含|不需要|不想要|不喜欢|不考虑|别推荐|不要|不想|不是|并非|排除|避开|别选|别买|别要|去掉|不含|只要|换成|改成|而是|但要|我要|想要|想买|需要|推荐|优先|喜欢|含有|添加|无|非|含|要/g;

type DirectiveMatch = { directive: string; index: number; end: number };

function lastDirectiveMatchBefore(text: string, index: number): DirectiveMatch | null {
  let result: DirectiveMatch | null = null;
  for (const match of text.slice(0, index).matchAll(DIRECTIVE_PATTERN)) {
    result = { directive: match[0], index: match.index ?? 0, end: (match.index ?? 0) + match[0].length };
  }
  return result;
}

function lastDirectiveBefore(text: string, index: number): string | null {
  return lastDirectiveMatchBefore(text, index)?.directive ?? null;
}

function isNegativeMention(text: string, index: number): boolean {
  const directive = lastDirectiveBefore(text, index);
  return directive !== null && NEGATIVE_DIRECTIVES.has(directive);
}

function containsIngredient(value: string): boolean {
  return /香精|香料|fragrance|parfum|酒精|乙醇|alcohol|paraben|对羟基苯甲酸酯|矿物油|sls|sles|滑石粉|talc|邻苯二甲酸酯|水杨酸|视黄醇|a醇|retinol/i.test(value);
}

function containsBrandIngredientOrEffect(value: string): boolean {
  const lower = value.toLowerCase();
  return KNOWN_BRANDS.some((brand) => lower.includes(brand.toLowerCase()))
    || containsIngredient(value)
    || Object.values(EFFECT_WORDS).flat().some((effect) => lower.includes(effect.toLowerCase()));
}

function isNegativeProductMention(text: string, index: number): boolean {
  const match = lastDirectiveMatchBefore(text, index);
  if (!match || !PRODUCT_NEGATIVE_DIRECTIVES.has(match.directive)) return false;
  return !containsBrandIngredientOrEffect(text.slice(match.end, index));
}

function isNegativeBrandMention(text: string, index: number): boolean {
  const match = lastDirectiveMatchBefore(text, index);
  if (!match || !BRAND_NEGATIVE_DIRECTIVES.has(match.directive)) return false;
  return !containsIngredient(text.slice(match.end, index));
}

function productTypeMentions(query: string): Array<{ type: string; excluded: boolean; index: number }> {
  const mentions: Array<{ type: string; excluded: boolean; index: number }> = [];
  for (const segmentMatch of query.matchAll(/[^，。；;]+/g)) {
    const segment = segmentMatch[0];
    const offset = segmentMatch.index ?? 0;
    const candidates: Array<{ type: string; index: number; length: number }> = [];
    PRODUCT_TYPE_RULES.forEach((rule) => {
      const flags = rule.pattern.flags.includes('i') ? 'gi' : 'g';
      const matcher = new RegExp(rule.pattern.source, flags);
      for (const match of segment.matchAll(matcher)) {
        const index = match.index ?? 0;
        candidates.push({ type: rule.canonical, index, length: match[0].length });
      }
    });
    const accepted: Array<{ type: string; index: number; length: number }> = [];
    candidates
      .sort((a, b) => a.index - b.index || b.length - a.length)
      .forEach((candidate) => {
        const overlaps = accepted.some((item) => candidate.index < item.index + item.length && item.index < candidate.index + candidate.length);
        if (!overlaps) accepted.push(candidate);
      });
    accepted.forEach((item) => mentions.push({
      type: item.type,
      excluded: isNegativeProductMention(segment, item.index),
      index: offset + item.index,
    }));
  }
  return mentions.sort((a, b) => a.index - b.index);
}

function canonicalizeProductType(value: string): string {
  const normalized = value.trim();
  if ((CANONICAL_PRODUCT_TYPES as readonly string[]).includes(normalized)) return normalized;
  return PRODUCT_TYPE_RULES.find((rule) => rule.pattern.test(normalized))?.canonical ?? normalized;
}

export function normalizeProductTypes(values: string[], query = ''): string[] {
  const fromValue = values.map(canonicalizeProductType);
  const finalMentions = [...productTypeMentions(query).reduce((map, item) => map.set(item.type, item), new Map<string, { type: string; excluded: boolean; index: number }>()).values()];
  const excluded = new Set(finalMentions.filter((item) => item.excluded).map((item) => item.type));
  const positive = finalMentions.filter((item) => !item.excluded).map((item) => item.type);
  return unique([...positive, ...fromValue].filter((item) => !excluded.has(item)), 8);
}

function inferExcludedProductTypes(query: string): string[] {
  const finalMentions = [...productTypeMentions(query).reduce((map, item) => map.set(item.type, item), new Map<string, { type: string; excluded: boolean; index: number }>()).values()];
  return unique(finalMentions.filter((item) => item.excluded).map((item) => item.type), 8);
}

function categoryForProductTypes(productTypes: string[]): string | null {
  const categories = unique(productTypes.flatMap((type) => {
    const category = PRODUCT_TYPE_RULES.find((rule) => rule.canonical === type)?.category;
    return category ? [category] : [];
  }));
  if (categories.length > 1) return '全部日化';
  return categories[0] ?? null;
}

export function normalizeCategory(category: string, productTypes: string[] = [], query = ''): string {
  if (query && /手足|护手|足膜|身体|沐浴|口腔|牙膏|牙刷|漱口|家居|洗衣|洗洁精|清洁剂/.test(query)) {
    return inferCategory(query, productTypes);
  }
  const typeCategory = categoryForProductTypes(productTypes);
  if (typeCategory) return typeCategory;
  const value = category.trim();
  if ((CANONICAL_CATEGORIES as readonly string[]).includes(value)) return value;
  if (/清洁卸妆|卸妆|洁面|洗面/.test(value)) return '清洁卸妆';
  if (/底妆|散粉|蜜粉|粉底|定妆|彩妆/.test(value) && !/唇|眼|眉|睫毛/.test(value)) return '底妆';
  if (/唇|口红/.test(value)) return '唇部彩妆';
  if (/眼|睫毛|眉/.test(value)) return '眼部彩妆';
  if (/防晒/.test(value)) return '防晒';
  if (/洗护发|洗发|护发|头皮/.test(value)) return '洗护发';
  if (/手足|护手|足部/.test(value)) return '手足护理';
  if (/身体|沐浴/.test(value)) return '身体护理';
  if (/口腔|牙膏|牙刷|漱口/.test(value)) return '口腔护理';
  if (/家居|洗衣|清洁剂|洗洁精/.test(value)) return '家居清洁';
  if (/香水|香氛/.test(value)) return '香氛';
  if (/套装|礼盒/.test(value)) return '套装';
  if (/其他/.test(value)) return '其他日化';
  if (/日化|全部|不限|未确定/.test(value)) return '全部日化';
  if (/护肤|面部|喷雾|乳液|面霜|精华|面膜/.test(value)) return '面部护理';
  if (query) return inferCategory(query, productTypes);
  return value || '全部日化';
}

function inferCategory(query: string, productTypes: string[] = normalizeProductTypes([], query)): string {
  if (hasPositiveContext(query, /手足|护手|足膜/g)) return '手足护理';
  if (hasPositiveContext(query, /身体|沐浴/g)) return '身体护理';
  if (hasPositiveContext(query, /口腔|牙膏|牙刷|漱口/g)) return '口腔护理';
  if (hasPositiveContext(query, /家居|洗衣|洗洁精|清洁剂/g)) return '家居清洁';
  const typeCategory = categoryForProductTypes(productTypes);
  if (typeCategory) return typeCategory;
  if (hasPositiveContext(query, /清洁卸妆|洁面|洗面|卸妆/g)) return '清洁卸妆';
  if (hasPositiveContext(query, /底妆|粉底|气垫|遮瑕/g)) return '底妆';
  if (hasPositiveContext(query, /眼妆|眼部彩妆|眼影|眼线|睫毛|眉妆/g)) return '眼部彩妆';
  if (hasPositiveContext(query, /唇妆|唇部彩妆|口红|唇膏|唇釉/g)) return '唇部彩妆';
  if (hasPositiveContext(query, /香氛|香水|古龙水/g)) return '香氛';
  if (/日化|都可以|不限品类/.test(query)) return '全部日化';
  if (/彩妆/.test(query)) return '彩妆';
  if (/护肤/.test(query)) return '护肤';
  return '面部护理';
}

function hasPositiveContext(query: string, pattern: RegExp): boolean {
  let state: { positive: boolean; index: number } | null = null;
  for (const segmentMatch of query.matchAll(/[^，。；;]+/g)) {
    const segment = segmentMatch[0];
    const matcher = new RegExp(pattern.source, pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`);
    for (const match of segment.matchAll(matcher)) {
      const index = match.index ?? 0;
      state = { positive: !isNegativeProductMention(segment, index), index: (segmentMatch.index ?? 0) + index };
    }
  }
  return state?.positive ?? false;
}

type BudgetRange = { min: number | null; max: number | null; explicit: boolean };

function amount(value: string, multiplier = 1): number | null {
  const parsed = Math.round(Number(value) * multiplier);
  return parsed >= 10 && parsed <= 50000 ? parsed : null;
}

function parseChineseNumber(value: string): number | null {
  const digits: Record<string, number> = {
    '零': 0, '〇': 0, '一': 1, '二': 2, '两': 2, '三': 3, '四': 4,
    '五': 5, '六': 6, '七': 7, '八': 8, '九': 9,
  };
  const units: Record<string, number> = { '十': 10, '百': 100, '千': 1000, '万': 10000 };
  if (!value || ![...value].every((char) => char in digits || char in units)) return null;
  if (![...value].some((char) => char in units)) {
    const joined = [...value].map((char) => digits[char]).join('');
    const parsed = Number(joined);
    return Number.isFinite(parsed) ? parsed : null;
  }
  let total = 0;
  let section = 0;
  let number = 0;
  for (const char of value) {
    if (char in digits) {
      number = digits[char];
      continue;
    }
    const unit = units[char];
    if (unit === 10000) {
      section = (section + number) * unit;
      total += section;
      section = 0;
    } else {
      section += (number || 1) * unit;
    }
    number = 0;
  }
  const parsed = total + section + number;
  return parsed > 0 ? parsed : null;
}

function normalizeChineseBudget(query: string): string {
  const chineseNumber = '[零〇一二三四五六七八九十百千万两]+';
  const withCurrency = new RegExp(`(${chineseNumber})\\s*(?:元|块钱?|rmb)`, 'gi');
  const normalizedCurrency = query.replace(withCurrency, (match, raw: string) => {
    const parsed = parseChineseNumber(raw);
    return parsed === null ? match : `${parsed}元`;
  });
  const afterBudgetWord = new RegExp(`((?:预算|上限|不超过|控制在|最多|至少|不低于|最低)\\s*[:：]?\\s*)(${chineseNumber})`, 'g');
  return normalizedCurrency.replace(afterBudgetWord, (match, prefix: string, raw: string) => {
    const parsed = parseChineseNumber(raw);
    return parsed === null ? match : `${prefix}${parsed}`;
  });
}

function inferBudgetRange(query: string): BudgetRange {
  const budgetQuery = normalizeChineseBudget(query);
  const candidates: Array<BudgetRange & { index: number; priority: number }> = [];
  const rangeSpans: Array<{ start: number; end: number }> = [];
  for (const match of budgetQuery.matchAll(/(\d+(?:\.\d+)?)\s*(千|[kK])?\s*(?:元)?\s*(?:到|至|[-~—–])\s*(\d+(?:\.\d+)?)\s*(千|[kK])?\s*(?:元)?/g)) {
    const min = amount(match[1], match[2] ? 1000 : 1);
    const max = amount(match[3], match[4] ? 1000 : 1);
    const index = match.index ?? 0;
    rangeSpans.push({ start: index, end: index + match[0].length });
    if (min !== null && max !== null) candidates.push({
      min: Math.min(min, max),
      max: Math.max(min, max),
      explicit: true,
      index,
      priority: 3,
    });
  }
  for (const match of budgetQuery.matchAll(/不限预算|预算不限|不设预算|预算无上限|价格不限/g)) {
    candidates.push({ min: null, max: null, explicit: true, index: match.index ?? 0, priority: 4 });
  }
  for (const match of budgetQuery.matchAll(/(?:至少|不低于|最低|起步|起价)\s*[:：]?\s*(\d+(?:\.\d+)?)\s*(千|[kK])?\s*(?:元)?|(?:^|[^\d])(\d+(?:\.\d+)?)\s*(千|[kK])?\s*元?\s*(?:以上|起)/g)) {
    const index = match.index ?? 0;
    if (rangeSpans.some((span) => index >= span.start && index < span.end)) continue;
    const value = amount(match[1] ?? match[3], match[2] || match[4] ? 1000 : 1);
    if (value !== null) candidates.push({ min: value, max: null, explicit: true, index, priority: 2 });
  }
  const upperPatterns = [
    /(?:预算|上限|不超过|控制在|低于|少于|大约|约|最多|改成|调整为|降到|提高到)\s*[:：]?\s*(\d+(?:\.\d+)?)\s*(千|[kK])?\s*(?:元)?/g,
    /(?:^|[^\d])(\d+(?:\.\d+)?)\s*(千|[kK])?\s*元\s*(?:内|以内|以下|左右|上下)?(?!\s*(?:以上|起))/g,
  ];
  for (const pattern of upperPatterns) {
    for (const match of budgetQuery.matchAll(pattern)) {
      const index = match.index ?? 0;
      if (rangeSpans.some((span) => index >= span.start && index < span.end)) continue;
      const value = amount(match[1], match[2] ? 1000 : 1);
      if (value !== null) candidates.push({ min: null, max: value, explicit: true, index, priority: 1 });
    }
  }
  const selected = candidates.sort((a, b) => b.index - a.index || b.priority - a.priority)[0];
  return selected
    ? { min: selected.min, max: selected.max, explicit: true }
    : { min: null, max: null, explicit: false };
}

function inferSkinType(query: string): string {
  const states: Array<{ value: string; excluded: boolean; index: number }> = [];
  const rules: Array<[string, RegExp]> = [
    ['混合性', /混合|混油|混干/g],
    ['油性', /油皮|油性|出油/g],
    ['干性', /干皮|干性|干燥/g],
    ['中性', /中性/g],
  ];
  for (const segmentMatch of query.matchAll(/[^，。；;]+/g)) {
    const segment = segmentMatch[0];
    const offset = segmentMatch.index ?? 0;
    rules.forEach(([value, pattern]) => {
      for (const match of segment.matchAll(pattern)) {
        const index = match.index ?? 0;
        states.push({ value, excluded: isNegativeMention(segment, index), index: offset + index });
      }
    });
  }
  return states.filter((item) => !item.excluded).sort((a, b) => b.index - a.index)[0]?.value ?? '未知';
}

function inferSensitiveSkin(query: string): boolean | null {
  let state: { value: boolean; index: number } | null = null;
  for (const segmentMatch of query.matchAll(/[^，。；;]+/g)) {
    const segment = segmentMatch[0];
    for (const match of segment.matchAll(/敏感肌|敏感皮|容易泛红|易泛红|敏皮/g)) {
      const index = match.index ?? 0;
      state = { value: !isNegativeMention(segment, index), index: (segmentMatch.index ?? 0) + index };
    }
  }
  return state?.value ?? null;
}

function inferEffects(query: string, productTypes: string[] = []): string[] {
  const states = new Map<string, { excluded: boolean; index: number; segment: string }>();
  for (const segmentMatch of query.matchAll(/[^，。；;]+/g)) {
    const segment = segmentMatch[0];
    const offset = segmentMatch.index ?? 0;
    Object.entries(EFFECT_WORDS).forEach(([effect, words]) => {
      words.forEach((word) => {
        const lowerSegment = segment.toLowerCase();
        const lowerWord = word.toLowerCase();
        let cursor = 0;
        while (cursor < lowerSegment.length) {
          const index = lowerSegment.indexOf(lowerWord, cursor);
          if (index < 0) break;
          const globalIndex = offset + index;
          if (!states.has(effect) || globalIndex >= (states.get(effect)?.index ?? -1)) {
            states.set(effect, { excluded: isNegativeMention(segment, index), index: globalIndex, segment });
          }
          cursor = index + Math.max(1, lowerWord.length);
        }
      });
    });
  }
  return [...states.entries()]
    .filter(([effect, state]) => {
      if (state.excluded) return false;
      if (effect === '清洁' && productTypes.includes('洁面') && !/深层清洁|温和清洁|清洁力|清洁毛孔/.test(state.segment)) return false;
      if (effect === '防晒' && productTypes.includes('防晒') && !/高倍|spf|pa\+|紫外线|防护/i.test(state.segment)) return false;
      if (effect === '卸妆' && productTypes.includes('卸妆') && !/卸妆力|卸得干净|清洁力/.test(state.segment)) return false;
      if (effect === '定妆' && productTypes.includes('散粉') && !/定妆|持妆/.test(state.segment)) return false;
      return true;
    })
    .sort((a, b) => a[1].index - b[1].index)
    .map(([effect]) => effect);
}

function inferExcludedEffects(query: string): string[] {
  const states = new Map<string, { excluded: boolean; index: number }>();
  for (const segmentMatch of query.matchAll(/[^，。；;]+/g)) {
    const segment = segmentMatch[0];
    const offset = segmentMatch.index ?? 0;
    Object.entries(EFFECT_WORDS).forEach(([effect, words]) => {
      words.forEach((word) => {
        const lowerSegment = segment.toLowerCase();
        const lowerWord = word.toLowerCase();
        let cursor = 0;
        while (cursor < lowerSegment.length) {
          const index = lowerSegment.indexOf(lowerWord, cursor);
          if (index < 0) break;
          const globalIndex = offset + index;
          if (!states.has(effect) || globalIndex >= (states.get(effect)?.index ?? -1)) {
            states.set(effect, { excluded: isNegativeMention(segment, index), index: globalIndex });
          }
          cursor = index + Math.max(1, lowerWord.length);
        }
      });
    });
  }
  return [...states.entries()].filter(([, state]) => state.excluded).map(([effect]) => effect);
}

function inferIngredientPreferences(query: string): { avoid: string[]; preferred: string[] } {
  const states = new Map<string, { excluded: boolean; index: number }>();
  const rules: Array<[string, RegExp]> = [
    ['fragrance', /香精|香料|fragrance|parfum/i], ['alcohol', /酒精|乙醇|alcohol/i],
    ['drying alcohol', /变性乙醇|alcohol denat/i], ['paraben', /paraben|对羟基苯甲酸酯/i],
    ['mineral oil', /矿物油|mineral oil/i], ['SLS', /\bsls\b|月桂醇硫酸酯钠/i],
    ['SLES', /\bsles\b|月桂醇聚醚硫酸酯钠/i], ['talc', /滑石粉|talc/i],
    ['phthalates', /邻苯二甲酸酯|phthalate/i], ['salicylic acid', /水杨酸|salicylic acid/i],
    ['retinol', /视黄醇|a醇|retinol/i],
  ];
  for (const segmentMatch of query.matchAll(/[^，。；;]+/g)) {
    const segment = segmentMatch[0];
    const offset = segmentMatch.index ?? 0;
    rules.forEach(([name, pattern]) => {
      const flags = `${pattern.flags.replace('g', '')}g`;
      for (const match of segment.matchAll(new RegExp(pattern.source, flags))) {
        const index = match.index ?? 0;
        const normalized = normalizeIngredient(name);
        states.set(normalized, {
          excluded: isNegativeMention(segment, index) || /过敏|不能用|不耐受|避雷/.test(segment.slice(0, index + match[0].length)),
          index: offset + index,
        });
      }
    });
  }
  const ordered = [...states.entries()].sort((a, b) => a[1].index - b[1].index);
  return {
    avoid: ordered.filter(([, state]) => state.excluded).map(([name]) => name),
    preferred: ordered.filter(([, state]) => !state.excluded).map(([name]) => name),
  };
}

function inferBrandPreferences(query: string): { preferred: string[]; excluded: string[] } {
  const states = new Map<string, { excluded: boolean; index: number }>();
  for (const segmentMatch of query.matchAll(/[^，。；;]+/g)) {
    const segment = segmentMatch[0];
    const offset = segmentMatch.index ?? 0;
    KNOWN_BRANDS.forEach((brand) => {
      const lowerSegment = segment.toLowerCase();
      const lowerBrand = brand.toLowerCase();
      let cursor = 0;
      while (cursor < lowerSegment.length) {
        const index = lowerSegment.indexOf(lowerBrand, cursor);
        if (index < 0) break;
        states.set(brand, { excluded: isNegativeBrandMention(segment, index), index: offset + index });
        cursor = index + Math.max(1, lowerBrand.length);
      }
    });
  }
  const ordered = [...states.entries()].sort((a, b) => a[1].index - b[1].index);
  return {
    preferred: unique(ordered.filter(([, state]) => !state.excluded).map(([brand]) => brand), 8),
    excluded: unique(ordered.filter(([, state]) => state.excluded).map(([brand]) => brand), 8),
  };
}

function inferVerifiedEfficacy(query: string): boolean {
  return /(?:官方|核实|证据|实证|临床)[^，。；]{0,12}(?:功效|效果|宣称)|(?:功效|效果|宣称)[^，。；]{0,12}(?:官方|核实|证据|实证|临床)/.test(query);
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
  const sensitiveSkin = inferSensitiveSkin(query);
  const productTypes = normalizeProductTypes([], query);
  const excludedProductTypes = inferExcludedProductTypes(query);
  const ingredients = inferIngredientPreferences(query);
  const brands = inferBrandPreferences(query);
  const desiredEffects = inferEffects(query, productTypes);
  const skinType = inferSkinType(query);
  const primaryPreference = preferenceFor({ sensitiveSkin, avoidIngredients: ingredients.avoid, desiredEffects });
  const budgetRange = inferBudgetRange(query);
  const requiresVerifiedEfficacy = inferVerifiedEfficacy(query);
  const requiresVerifiedEvidence = Boolean(sensitiveSkin || ingredients.avoid.length || requiresVerifiedEfficacy);
  const intent: Intent = {
    category: inferCategory(query, productTypes),
    productTypes,
    excludedProductTypes,
    budgetMin: budgetRange.min,
    budget: budgetRange.max,
    skinType,
    sensitiveSkin,
    concerns: desiredEffects,
    desiredEffects,
    avoidIngredients: ingredients.avoid,
    preferredIngredients: ingredients.preferred,
    avoidFragrance: ingredients.avoid.includes('fragrance') ? true : null,
    preferredBrands: brands.preferred,
    excludedBrands: brands.excluded,
    preferredBrand: brands.preferred[0] ?? null,
    keywords: unique([...desiredEffects, ...productTypes, ...ingredients.preferred, ...brands.preferred]),
    useCase: '',
    primaryPreference,
    preferences: buildPreferences(primaryPreference),
    requiresVerifiedEvidence,
    requiresVerifiedEfficacy,
    needsClarification: !budgetRange.explicit,
    clarificationField: budgetRange.explicit ? null : 'budget',
    confidence: 0.72,
    provider: 'local-fallback',
  };
  intent.useCase = describeUseCase(intent);
  return intent;
}

type RemoteIntent = Partial<Intent> & { budgetMax?: number | null };

export function normalizeIntent(value: RemoteIntent, fallbackQuery = ''): Intent {
  const fallback = understandIntent(fallbackQuery);
  const explicitBudget = inferBudgetRange(fallbackQuery);
  const queryIngredients = inferIngredientPreferences(fallbackQuery);
  const queryBrands = inferBrandPreferences(fallbackQuery);
  const queryExcludedTypes = inferExcludedProductTypes(fallbackQuery);
  const queryPositiveTypes = normalizeProductTypes([], fallbackQuery);
  const queryExcludedEffects = inferExcludedEffects(fallbackQuery);
  const sourceProductTypes = Array.isArray(value.productTypes) ? value.productTypes : fallback.productTypes;
  const productTypes = normalizeProductTypes(sourceProductTypes, fallbackQuery)
    .filter((item) => !queryExcludedTypes.includes(item));
  const excludedProductTypes = unique([
    ...(Array.isArray(value.excludedProductTypes) ? value.excludedProductTypes.map(canonicalizeProductType).filter((item) => !queryPositiveTypes.includes(item)) : []),
    ...fallback.excludedProductTypes,
    ...queryExcludedTypes,
  ], 8);
  const remoteAvoid = (Array.isArray(value.avoidIngredients) ? value.avoidIngredients.map(normalizeIngredient) : [])
    .filter((item) => !queryIngredients.preferred.includes(item));
  const avoidIngredients = unique([
    ...remoteAvoid,
    ...fallback.avoidIngredients,
    ...queryIngredients.avoid,
    ...(value.avoidFragrance === true ? ['fragrance'] : []),
  ]);
  const preferredIngredients = unique([
    ...(Array.isArray(value.preferredIngredients) ? value.preferredIngredients.map(normalizeIngredient) : []),
    ...fallback.preferredIngredients,
    ...queryIngredients.preferred,
  ].filter((item) => !avoidIngredients.includes(item)), 12);
  const desiredEffects = unique((
    fallback.desiredEffects.length
      ? fallback.desiredEffects
      : Array.isArray(value.desiredEffects) && value.desiredEffects.length
        ? value.desiredEffects
        : Array.isArray(value.concerns) ? value.concerns : []
  ).filter((effect) => !queryExcludedEffects.includes(effect)));
  const sensitiveSkin = fallbackQuery && fallback.sensitiveSkin !== null
    ? fallback.sensitiveSkin
    : typeof value.sensitiveSkin === 'boolean' ? value.sensitiveSkin : fallback.sensitiveSkin;
  const budgetMin = explicitBudget.explicit
    ? explicitBudget.min
    : clampNumber(value.budgetMin ?? fallback.budgetMin, 10, 50000);
  let budget = explicitBudget.explicit
    ? explicitBudget.max
    : clampNumber(value.budget ?? value.budgetMax ?? fallback.budget, 10, 50000);
  if (budgetMin !== null && budget !== null && budgetMin > budget) budget = budgetMin;
  const seed = { sensitiveSkin, avoidIngredients, desiredEffects };
  const primaryPreference = SPEC_KEYS.includes(value.primaryPreference as SpecKey)
    ? value.primaryPreference as SpecKey
    : preferenceFor(seed);
  const excludedBrands = unique([
    ...(Array.isArray(value.excludedBrands) ? value.excludedBrands.filter((brand) => !queryBrands.preferred.some((preferred) => preferred.toLowerCase() === brand.toLowerCase())) : []),
    ...fallback.excludedBrands,
    ...queryBrands.excluded,
  ], 8);
  const preferredBrands = unique([
    ...(Array.isArray(value.preferredBrands) ? value.preferredBrands : []),
    ...fallback.preferredBrands,
    ...queryBrands.preferred,
  ].filter((brand) => !excludedBrands.some((excluded) => excluded.toLowerCase() === brand.toLowerCase())), 8);
  const requiresVerifiedEfficacy = Boolean(value.requiresVerifiedEfficacy || fallback.requiresVerifiedEfficacy);
  const needsClarification = explicitBudget.explicit ? false : Boolean(value.needsClarification ?? budget === null);
  const remoteKeywords = (Array.isArray(value.keywords) ? value.keywords : [])
    .filter((item): item is string => typeof item === 'string' && item.length > 0 && item.length <= 40)
    .filter((item) => !fallbackQuery || fallbackQuery.toLowerCase().includes(item.toLowerCase()));
  const intent: Intent = {
    category: normalizeCategory(
      fallbackQuery && ['护肤', '彩妆', '全部日化'].includes(fallback.category)
        ? fallback.category
        : value.category ?? fallback.category,
      productTypes,
      fallbackQuery,
    ),
    productTypes,
    excludedProductTypes,
    budgetMin,
    budget,
    skinType: fallbackQuery && fallback.skinType !== '未知'
      ? fallback.skinType
      : typeof value.skinType === 'string' && value.skinType ? value.skinType : fallback.skinType,
    sensitiveSkin,
    concerns: unique((Array.isArray(value.concerns) ? value.concerns : desiredEffects).filter((effect) => !queryExcludedEffects.includes(effect))),
    desiredEffects,
    avoidIngredients,
    preferredIngredients,
    avoidFragrance: value.avoidFragrance === true || avoidIngredients.includes('fragrance') ? true : value.avoidFragrance ?? fallback.avoidFragrance,
    preferredBrands,
    excludedBrands,
    preferredBrand: preferredBrands[0] ?? null,
    keywords: unique([
      ...desiredEffects,
      ...productTypes,
      ...preferredIngredients,
      ...preferredBrands,
      ...remoteKeywords,
    ], 16),
    useCase: '',
    primaryPreference,
    preferences: buildPreferences(primaryPreference),
    requiresVerifiedEvidence: Boolean(sensitiveSkin || avoidIngredients.length || requiresVerifiedEfficacy),
    requiresVerifiedEfficacy,
    needsClarification,
    clarificationField: needsClarification
      ? typeof value.clarificationField === 'string' ? value.clarificationField : 'budget'
      : null,
    confidence: clampNumber(value.confidence ?? fallback.confidence, 0, 1) ?? fallback.confidence,
    provider: value.provider === 'doubao' ? 'doubao' : 'local-fallback',
  };
  intent.useCase = describeUseCase(intent);
  return intent;
}

function budgetFit(price: number, budget: number | null): number {
  if (!budget) return 0.78;
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

function ingredientMatchesTerm(value: string, rawTerm: string): boolean {
  const ingredient = normalizeIngredient(value);
  const term = normalizeIngredient(rawTerm);
  if (term === 'paraben') return /paraben|对羟基苯甲酸酯/i.test(ingredient);
  if (term === 'phthalates') return /phthalate|邻苯二甲酸酯/i.test(ingredient);
  if (term === 'fragrance') return /^(fragrance|parfum|香精|香料)$/i.test(ingredient);
  if (term === 'alcohol') return /^(alcohol|ethanol|乙醇|酒精)$/i.test(ingredient);
  return ingredient === term;
}

function ingredientMentioned(product: Product, term: string): boolean {
  return [...product.normalized_ingredients, ...product.title_ingredient_mentions]
    .some((ingredient) => ingredientMatchesTerm(ingredient, term));
}

function ingredientAvoidancePasses(product: Product, avoided: string[]): boolean {
  if (!avoided.length) return true;
  if (!product.recommendation_eligibility.ingredient_avoidance) return false;
  return avoided.every((raw) => {
    const term = normalizeIngredient(raw);
    if (product.normalized_ingredients.some((item) => ingredientMatchesTerm(item, term))) return false;
    if (product.normalized_formulated_without.some((item) => ingredientMatchesTerm(item, term))) return true;
    if (term === 'alcohol' && product.normalized_formulated_without.includes('drying alcohol')) return true;
    return ['full', 'full_current_reference'].includes(product.ingredient_list_completeness);
  });
}

function productTypeMatches(product: Product, requestedType: string): boolean {
  if (requestedType === '手足护理') return product.category === '手足护理';
  return product.product_type === requestedType;
}

function coreEligible(product: Product, intent: Intent): boolean {
  const categoryMatches = intent.category === '全部日化'
    || intent.category === '护肤' && ['面部护理', '清洁卸妆', '防晒'].includes(product.category)
    || intent.category === '彩妆' && ['底妆', '唇部彩妆', '眼部彩妆'].includes(product.category)
    || product.category === intent.category;
  if (!categoryMatches) return false;
  if (intent.productTypes.length && !intent.productTypes.some((type) => productTypeMatches(product, type))) return false;
  if (intent.excludedProductTypes.some((type) => productTypeMatches(product, type))) return false;
  if (intent.budgetMin !== null && product.price < intent.budgetMin) return false;
  if (intent.budget !== null && product.price > intent.budget) return false;
  if (intent.excludedBrands.some((brand) => product.brand.toLowerCase().includes(brand.toLowerCase()))) return false;
  return true;
}

function eligible(product: Product, intent: Intent): boolean {
  if (!coreEligible(product, intent)) return false;
  if (intent.sensitiveSkin && !product.recommendation_eligibility.sensitive_skin) return false;
  if (intent.desiredEffects.length && intent.requiresVerifiedEfficacy) {
    if (!product.recommendation_eligibility.efficacy) return false;
    if (!intent.desiredEffects.every((effect) => effectMatches(product, effect, true))) return false;
  }
  if (!ingredientAvoidancePasses(product, intent.avoidIngredients)) return false;
  return true;
}

function skinMatchScore(product: Product, skinType: string): number {
  if (skinType === '未知') return 0.5;
  const official = product.official_skin_types.join(' ').toLowerCase();
  const text = textFor(product);
  const terms: Record<string, string[]> = {
    '油性': ['油性', '油皮', 'oily'],
    '干性': ['干性', '干皮', 'dry'],
    '混合性': ['混合性', '混合', 'combination'],
    '中性': ['中性', 'normal'],
  };
  const aliases = terms[skinType] ?? [skinType];
  if (aliases.some((term) => official.includes(term.toLowerCase()))) return 1;
  if (official) return 0.12;
  return aliases.some((term) => text.includes(term.toLowerCase())) ? 0.7 : 0.45;
}

function hasVerifiedEvidence(product: Product): boolean {
  return product.evidence_level === 'official_current_reference';
}

function retrievalScore(product: Product, intent: Intent): number {
  const searchable = textFor(product);
  const keywordMatches = intent.keywords.filter((keyword) => searchable.includes(keyword.toLowerCase())).length;
  const effectMatchCount = intent.desiredEffects.filter((effect) => effectMatches(product, effect, intent.requiresVerifiedEfficacy)).length;
  const brandMatch = intent.preferredBrands.some((brand) => product.brand.toLowerCase().includes(brand.toLowerCase())) ? 1 : 0;
  const preferredIngredientMatches = intent.preferredIngredients.filter((term) => ingredientMentioned(product, term)).length;
  const evidence = hasVerifiedEvidence(product) ? 1 : 0;
  return budgetFit(product.price, intent.budget) * 0.22
    + Math.min(keywordMatches, 4) * 0.05
    + Math.min(effectMatchCount, 3) * 0.13
    + brandMatch * 0.16
    + Math.min(preferredIngredientMatches, 2) * 0.09
    + skinMatchScore(product, intent.skinType) * 0.1
    + evidence * (intent.requiresVerifiedEvidence ? 0.22 : 0.04)
    + product.popularity * 0.06;
}

function recommendationScore(product: Product, intent: Intent, retrieval: number): number {
  const preference = SPEC_KEYS.reduce((sum, key) => sum + product[key] * intent.preferences[key], 0);
  return Math.max(0, Math.min(1, preference * 0.68 + Math.min(1, retrieval) * 0.32));
}

function reasonsFor(product: Product, intent: Intent): string[] {
  const reasons: string[] = [];
  if (intent.budgetMin !== null && intent.budget !== null) reasons.push(`样本价 ¥${product.price.toLocaleString('zh-CN')}，在 ¥${intent.budgetMin.toLocaleString('zh-CN')}–¥${intent.budget.toLocaleString('zh-CN')} 范围内`);
  else if (intent.budget) reasons.push(`样本价 ¥${product.price.toLocaleString('zh-CN')}，在 ¥${intent.budget.toLocaleString('zh-CN')} 预算内`);
  else if (intent.budgetMin !== null) reasons.push(`样本价 ¥${product.price.toLocaleString('zh-CN')}，不低于 ¥${intent.budgetMin.toLocaleString('zh-CN')}`);
  if (intent.sensitiveSkin && product.recommendation_eligibility.sensitive_skin) reasons.push('当前品牌官方页包含敏感肌相关声明，已作为跨市场参考核实');
  if (intent.skinType !== '未知' && skinMatchScore(product, intent.skinType) === 1) reasons.push(`当前品牌官方页标注适用于${intent.skinType}肤质`);
  if (intent.avoidIngredients.length) {
    const explicit = intent.avoidIngredients.filter((item) => product.normalized_formulated_without.some((without) => ingredientMatchesTerm(without, item)));
    if (explicit.length) reasons.push(`品牌官方明确列为不含：${explicit.join('、')}`);
    else reasons.push('当前官方完整成分参考未命中已指定的避开项');
  }
  const preferred = intent.preferredIngredients.filter((item) => ingredientMentioned(product, item));
  if (preferred.length) reasons.push(`商品信息可对应偏好成分：${preferred.join('、')}`);
  const matchedEffects = intent.desiredEffects.filter((effect) => effectMatches(product, effect, true));
  if (matchedEffects.length) reasons.push(`品牌官方产品页可对应：${matchedEffects.join('、')}（品牌声明）`);
  if (!intent.requiresVerifiedEvidence) {
    if (product.sales_count !== null) reasons.push(`历史热度记录 ${product.sales_count.toLocaleString('zh-CN')}，仅作离线排序信号`);
    else reasons.push('历史热度字段缺失，排序时未按零值处理');
  }
  if (product.evidence_level === 'web_public_reference') {
    const officialDiscovery = product.evidence_sources.some((source) => source.source_kind === 'brand_official_page_web');
    reasons.push(officialDiscovery
      ? '联网检索已定位品牌官网来源；搜索摘要只作发现线索，不提高敏感肌、成分或核实功效资格'
      : '已补充联网公开来源；第三方内容只作线索，不作敏感肌、成分安全或核实功效结论');
  }
  else if (product.evidence_level !== 'official_current_reference') reasons.push('只有历史标题字段，成分与功效尚未核实');
  if (reasons.length < 2) reasons.push(`${SPEC_LABELS[intent.primaryPreference]}指数 ${Math.round(product[intent.primaryPreference] * 100)} 分`);
  return unique(reasons, 4);
}

export function webEvidenceCandidates(intentValue: Intent, products: Product[], limit = 3): Product[] {
  const intent = normalizeIntent(intentValue);
  return products
    .filter((product) => coreEligible(product, intent))
    .map((product) => ({ product, score: retrievalScore(product, intent) }))
    .sort((a, b) => b.score - a.score || a.product.price - b.product.price)
    .slice(0, Math.max(1, Math.min(limit, 5)))
    .map((item) => item.product);
}

export function shouldUseWebDiscovery(intentValue: Intent): boolean {
  const intent = normalizeIntent(intentValue);
  return Boolean(
    intent.sensitiveSkin
    || intent.avoidIngredients.length
    || intent.requiresVerifiedEfficacy
    || intent.desiredEffects.length
    || intent.preferredIngredients.length
    || intent.preferredBrands.length
    || intent.productTypes.includes('其他'),
  );
}

export function applyWebEvidence(products: Product[], evidence: WebEvidence[], intentValue: Intent): Product[] {
  void intentValue;
  const byProduct = new Map<string, WebEvidence[]>();
  evidence.forEach((item) => byProduct.set(item.productId, [...(byProduct.get(item.productId) ?? []), item]));
  return products.map((product) => {
    const matches = byProduct.get(product.product_id);
    if (!matches?.length) return product;
    const sources: EvidenceSource[] = matches.map((item) => ({
      source_kind: item.sourceAuthority === 'official' ? 'brand_official_page_web' : 'web_public_reference',
      url: item.url,
      checked_at: item.retrievedAt,
      supports: unique([
        'source_discovery',
        ...item.matchedEffects.map((effect) => `search_summary_mentions_effect:${effect}`),
        ...item.matchedSkinTypes.map((skin) => `search_summary_mentions_skin_type:${skin}`),
        ...item.formulatedWithout.map((ingredient) => `search_summary_mentions_formulated_without:${normalizeIngredient(ingredient)}`),
      ]),
    }));
    return {
      ...product,
      evidence_level: product.evidence_level === 'official_current_reference' ? 'official_current_reference' : 'web_public_reference',
      match_status: product.evidence_level === 'official_current_reference' ? product.match_status : 'web_source_only',
      evidence_sources: [...product.evidence_sources, ...sources],
    };
  });
}

export function runAgentFromIntent(intentValue: Intent, products: Product[]): AgentResponse {
  const intent = normalizeIntent(intentValue);
  if (intent.needsClarification && intent.clarificationField === 'budget') {
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
