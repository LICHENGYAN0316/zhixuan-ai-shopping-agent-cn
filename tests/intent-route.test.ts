import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeIntent } from '../lib/agent.ts';
import { sanitizeIntentArguments } from '../lib/intent-contract.ts';

test('one malformed optional model field does not discard the valid Doubao intent', async () => {
  const sanitized = sanitizeIntentArguments({
        category: '清洁卸妆',
        productTypes: ['洁面'],
        excludedProductTypes: [],
        budgetMin: null,
        budgetMax: 300,
        skinType: '油性',
        sensitiveSkin: 'unknown',
        concerns: [],
        desiredEffects: [],
        avoidIngredients: [],
        preferredIngredients: [],
        avoidFragrance: null,
        preferredBrands: [],
        excludedBrands: [],
        keywords: ['洗面奶', 123],
        needsClarification: false,
        clarificationField: null,
        confidence: 1.2,
  });
  assert.ok(sanitized);
  assert.equal(Object.hasOwn(sanitized, 'sensitiveSkin'), false);
  assert.deepEqual(sanitized.keywords, ['洗面奶']);
  const intent = normalizeIntent(sanitized as Parameters<typeof normalizeIntent>[0], '预算300，洗面奶，油皮');
  assert.deepEqual(intent.productTypes, ['洁面']);
  assert.equal(intent.budget, 300);
  assert.equal(intent.skinType, '油性');
  assert.equal(intent.confidence, 1);
});
