import { CANONICAL_CATEGORIES, CANONICAL_PRODUCT_TYPES } from './agent.ts';

export const INTENT_SKIN_TYPES = ['干性', '油性', '混合性', '中性', '未知'] as const;
export const INTENT_CONCERNS = ['保湿', '控油', '舒缓', '清洁', '祛痘', '抗老', '提亮', '修护', '防晒', '去屑', '定妆', '卸妆', '其他'] as const;
export const INTENT_CLARIFICATION_FIELDS = ['category', 'budget', 'skin_type', 'concern'] as const;

const categoryValues = new Set<string>(CANONICAL_CATEGORIES);
const productTypeValues = new Set<string>(CANONICAL_PRODUCT_TYPES);
const skinTypeValues = new Set<string>(INTENT_SKIN_TYPES);
const concernValues = new Set<string>(INTENT_CONCERNS);
const clarificationValues = new Set<string>(INTENT_CLARIFICATION_FIELDS);

function isNullableNumber(value: unknown) {
  return value === null || (typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 50_000);
}

function isNullableBoolean(value: unknown) {
  return value === null || typeof value === 'boolean';
}

function sanitizeStringArray(value: unknown, maximum: number, allowed?: Set<string>): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return [...new Set(value.filter(
    (item): item is string => typeof item === 'string'
      && item.length > 0
      && item.length <= 80
      && (!allowed || allowed.has(item)),
  ))].slice(0, maximum);
}

function canonicalizeNullableFields(value: unknown): unknown {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
  const record = { ...(value as Record<string, unknown>) };
  const nullableFields = ['budgetMin', 'budgetMax', 'sensitiveSkin', 'avoidFragrance', 'clarificationField'];
  nullableFields.forEach((field) => {
    const current = record[field];
    if (typeof current === 'string' && ['null', 'none', 'nil'].includes(current.trim().toLowerCase())) record[field] = null;
  });
  return record;
}

export function sanitizeIntentArguments(value: unknown): Record<string, unknown> | null {
  const canonical = canonicalizeNullableFields(value);
  if (!canonical || typeof canonical !== 'object' || Array.isArray(canonical)) return null;
  const record = canonical as Record<string, unknown>;
  const safe: Record<string, unknown> = {};

  if (typeof record.category === 'string' && categoryValues.has(record.category)) safe.category = record.category;
  const arrays: Array<[string, number, Set<string> | undefined]> = [
    ['productTypes', 8, productTypeValues],
    ['excludedProductTypes', 8, productTypeValues],
    ['concerns', 10, concernValues],
    ['desiredEffects', 10, undefined],
    ['avoidIngredients', 12, undefined],
    ['preferredIngredients', 12, undefined],
    ['preferredBrands', 8, undefined],
    ['excludedBrands', 8, undefined],
    ['keywords', 16, undefined],
  ];
  arrays.forEach(([key, maximum, allowed]) => {
    const sanitized = sanitizeStringArray(record[key], maximum, allowed);
    if (sanitized) safe[key] = sanitized;
  });
  ['budgetMin', 'budgetMax'].forEach((key) => {
    if (isNullableNumber(record[key])) safe[key] = record[key];
  });
  ['sensitiveSkin', 'avoidFragrance'].forEach((key) => {
    if (isNullableBoolean(record[key])) safe[key] = record[key];
  });
  if (typeof record.skinType === 'string' && skinTypeValues.has(record.skinType)) safe.skinType = record.skinType;
  if (typeof record.needsClarification === 'boolean') safe.needsClarification = record.needsClarification;
  if (record.clarificationField === null
    || (typeof record.clarificationField === 'string' && clarificationValues.has(record.clarificationField))) {
    safe.clarificationField = record.clarificationField;
  }
  if (typeof record.confidence === 'number' && Number.isFinite(record.confidence)) {
    safe.confidence = Math.max(0, Math.min(1, record.confidence));
  }
  return safe;
}
