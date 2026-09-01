import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  normalizeIntent,
  runAgentFromIntent,
  shouldUseWebDiscovery,
  understandIntent,
} from '../lib/agent.ts';
import type { Product } from '../lib/agent.ts';

const products = JSON.parse(readFileSync(new URL('../public/data/daily-products.json', import.meta.url), 'utf8')) as Product[];

test('product aliases use one canonical type without creating an efficacy gate', () => {
  const aliases = ['洗面奶', '洁面乳', '洗颜'];
  aliases.forEach((alias) => {
    const intent = understandIntent(`预算 300，${alias}，油皮`);
    assert.deepEqual(intent.productTypes, ['洁面']);
    assert.deepEqual(intent.desiredEffects, []);
    const response = runAgentFromIntent(intent, products);
    assert.equal(response.kind, 'recommendation');
    if (response.kind === 'recommendation') assert.ok(response.results.length > 0);
  });
  assert.deepEqual(understandIntent('预算 300，精华水').productTypes, ['精华水']);
  assert.deepEqual(understandIntent('预算 80，蜜粉').productTypes, ['散粉']);
});

test('negative, replacement and correction directives apply across product types', () => {
  const cases = [
    ['不要洗面奶，换成面霜，预算 300', '面霜', '洁面'],
    ['不要乳液，只要面霜，预算 300', '面霜', '乳液'],
    ['别推荐口红，我要粉底，预算 300', '粉底', '口红'],
  ] as const;
  cases.forEach(([query, wanted, excluded]) => {
    const intent = understandIntent(query);
    assert.deepEqual(intent.productTypes, [wanted]);
    assert.ok(intent.excludedProductTypes.includes(excluded));
    const response = runAgentFromIntent(intent, products);
    assert.equal(response.kind, 'recommendation');
    if (response.kind === 'recommendation') {
      assert.ok(response.results.every((item) => item.product.product_type === wanted));
      assert.ok(response.results.every((item) => item.product.product_type !== excluded));
    }
  });
});

test('ingredient and brand polarity are clause-aware', () => {
  const ingredients = understandIntent('避开香精，想要含水杨酸，预算 300');
  assert.deepEqual(ingredients.avoidIngredients, ['fragrance']);
  assert.deepEqual(ingredients.preferredIngredients, ['salicylic acid']);

  const brand = understandIntent('不要雅漾，想买喷雾，预算 300');
  assert.deepEqual(brand.excludedBrands, ['雅漾']);
  assert.deepEqual(brand.preferredBrands, []);
  const response = runAgentFromIntent(brand, products);
  if (response.kind === 'recommendation') {
    assert.ok(response.results.every((item) => !item.product.brand.includes('雅漾')));
  }

  const effects = normalizeIntent({ desiredEffects: ['提亮'], concerns: ['提亮'] }, '不要美白，只要保湿，预算 300');
  assert.deepEqual(effects.desiredEffects, ['保湿']);

  const correctedSkin = normalizeIntent({ skinType: '油性', sensitiveSkin: true }, '不是油皮，是干皮，也不是敏感肌，预算 300');
  assert.equal(correctedSkin.skinType, '干性');
  assert.equal(correctedSkin.sensitiveSkin, false);
});

test('negative modifiers stay attached to their entity instead of excluding the product', () => {
  const fragranceFreeCream = understandIntent('预算 300，不含香精的面霜');
  assert.deepEqual(fragranceFreeCream.productTypes, ['面霜']);
  assert.deepEqual(fragranceFreeCream.excludedProductTypes, []);
  assert.deepEqual(fragranceFreeCream.avoidIngredients, ['fragrance']);

  const excludedBrandSpray = understandIntent('预算 300，不要雅漾的喷雾');
  assert.deepEqual(excludedBrandSpray.productTypes, ['喷雾']);
  assert.deepEqual(excludedBrandSpray.excludedProductTypes, []);
  assert.deepEqual(excludedBrandSpray.excludedBrands, ['雅漾']);

  const withoutSalicylicCream = understandIntent('预算 300，不要含水杨酸的面霜');
  assert.deepEqual(withoutSalicylicCream.productTypes, ['面霜']);
  assert.deepEqual(withoutSalicylicCream.avoidIngredients, ['salicylic acid']);
  assert.deepEqual(withoutSalicylicCream.preferredIngredients, []);

  const categoryCorrection = understandIntent('预算 300，不要身体乳，只要面霜');
  assert.equal(categoryCorrection.category, '面部护理');
  assert.deepEqual(categoryCorrection.productTypes, ['面霜']);
});

test('entity scope, broad categories, mixed categories and Chinese budgets share the generic flow', () => {
  const effectCorrection = understandIntent('不要抗老但要保湿的面霜，预算三百元');
  assert.deepEqual(effectCorrection.productTypes, ['面霜']);
  assert.deepEqual(effectCorrection.excludedProductTypes, []);
  assert.deepEqual(effectCorrection.desiredEffects, ['保湿']);

  const noAlcohol = understandIntent('不要添加酒精的面霜，预算三百元');
  assert.deepEqual(noAlcohol.productTypes, ['面霜']);
  assert.deepEqual(noAlcohol.avoidIngredients, ['alcohol']);
  assert.deepEqual(noAlcohol.preferredIngredients, []);

  const ingredientBeforeBrand = understandIntent('不要水杨酸的雅漾面霜，预算三百元');
  assert.deepEqual(ingredientBeforeBrand.productTypes, ['面霜']);
  assert.deepEqual(ingredientBeforeBrand.avoidIngredients, ['salicylic acid']);
  assert.deepEqual(ingredientBeforeBrand.preferredBrands, ['雅漾']);
  assert.deepEqual(ingredientBeforeBrand.excludedBrands, []);

  assert.equal(understandIntent('预算三百元，香氛').category, '香氛');
  assert.equal(understandIntent('预算三百元，底妆').category, '底妆');
  assert.equal(understandIntent('预算三百元，眼妆').category, '眼部彩妆');

  const mixed = understandIntent('三百元内，面霜或者粉底');
  assert.equal(mixed.category, '全部日化');
  assert.deepEqual(mixed.productTypes, ['面霜', '粉底']);
  assert.equal(mixed.budget, 300);
  assert.equal(mixed.needsClarification, false);

  const chineseBudget = understandIntent('三百元，洗面奶，油皮');
  assert.equal(chineseBudget.budget, 300);
  assert.equal(chineseBudget.needsClarification, false);
  assert.equal(runAgentFromIntent(chineseBudget, products).kind, 'recommendation');

  const remoteKeyword = normalizeIntent({
    category: '面部护理',
    productTypes: ['其他'],
    keywords: ['眼霜', '用户没有说的词'],
    budgetMax: 300,
    needsClarification: false,
  }, '预算三百元，眼霜');
  assert.deepEqual(remoteKeyword.keywords, ['其他', '眼霜']);
});

test('budget floor, ceiling, range and unbounded modes keep their semantics', () => {
  const ceiling = understandIntent('200 元内，面霜');
  assert.equal(ceiling.budgetMin, null);
  assert.equal(ceiling.budget, 200);

  const floor = understandIntent('200 元以上，面霜');
  assert.equal(floor.budgetMin, 200);
  assert.equal(floor.budget, null);
  assert.equal(floor.needsClarification, false);

  const range = understandIntent('100 到 300 元，面霜');
  assert.equal(range.budgetMin, 100);
  assert.equal(range.budget, 300);

  const unbounded = understandIntent('不限预算，面霜');
  assert.equal(unbounded.budgetMin, null);
  assert.equal(unbounded.budget, null);
  assert.equal(unbounded.needsClarification, false);
  assert.equal(runAgentFromIntent(unbounded, products).kind, 'recommendation');

  const corrected = understandIntent('预算 200，后来改成 300，面霜');
  assert.equal(corrected.budgetMin, null);
  assert.equal(corrected.budget, 300);
});

test('remote broad categories normalize to the local leaf category', () => {
  const intent = normalizeIntent({
    category: '底妆',
    productTypes: ['口红'],
    budgetMax: 300,
    needsClarification: false,
    clarificationField: null,
  }, '预算 300，口红');
  assert.equal(intent.category, '唇部彩妆');
  assert.deepEqual(intent.productTypes, ['口红']);
  const response = runAgentFromIntent(intent, products);
  assert.equal(response.kind, 'recommendation');
  if (response.kind === 'recommendation') assert.ok(response.results.length > 0);
});

test('the same cross-category flow handles supported and absent catalog branches', () => {
  const cases = [
    ['护手霜', '手足护理', '手足护理', true],
    ['身体乳', '身体护理', '身体护理', true],
    ['洗发水', '洗护发', '洗发护发', true],
    ['防晒霜', '防晒', '防晒', true],
    ['口红', '唇部彩妆', '口红', true],
    ['牙膏', '口腔护理', '口腔护理', false],
    ['洗衣液', '家居清洁', '家居清洁', false],
  ] as const;
  cases.forEach(([label, category, productType, hasData]) => {
    const intent = understandIntent(`预算 300，${label}`);
    assert.equal(intent.category, category);
    assert.deepEqual(intent.productTypes, [productType]);
    const response = runAgentFromIntent(intent, products);
    assert.equal(response.kind, 'recommendation');
    if (response.kind === 'recommendation') {
      assert.equal(response.results.length > 0, hasData);
      assert.ok(response.results.every((item) => item.product.category === category));
    }
  });

  const broadCosmetics = runAgentFromIntent(understandIntent('预算 300，彩妆'), products);
  assert.equal(broadCosmetics.kind, 'recommendation');
  if (broadCosmetics.kind === 'recommendation') {
    assert.ok(broadCosmetics.results.every((item) => ['底妆', '唇部彩妆', '眼部彩妆'].includes(item.product.category)));
  }
});

test('verified efficacy requires the requested effect, not a generic boolean', () => {
  const base = products.find((product) => product.recommendation_eligibility.efficacy) as Product;
  assert.ok(base);
  const candidate: Product = {
    ...base,
    official_concerns: ['舒缓'],
    brand_claims: [],
    recommendation_eligibility: { ...base.recommendation_eligibility, efficacy: true },
  };
  const intent = understandIntent(`预算 ${Math.ceil(candidate.price + 10)}，需要官方核实的保湿功效，${candidate.product_type}`);
  const response = runAgentFromIntent(intent, [candidate]);
  assert.equal(response.kind, 'recommendation');
  if (response.kind === 'recommendation') assert.equal(response.results.length, 0);
});

test('ingredient families catch paraben variants', () => {
  const base = products.find((product) => product.category === '面部护理') as Product;
  const candidate: Product = {
    ...base,
    ingredient_list_completeness: 'full',
    normalized_ingredients: ['methylparaben'],
    recommendation_eligibility: { ...base.recommendation_eligibility, ingredient_avoidance: true },
  };
  const intent = normalizeIntent({
    ...understandIntent(`预算 ${Math.ceil(candidate.price + 10)}，避开 paraben`),
    category: candidate.category,
    productTypes: [candidate.product_type],
  });
  const response = runAgentFromIntent(intent, [candidate]);
  assert.equal(response.kind, 'recommendation');
  if (response.kind === 'recommendation') assert.equal(response.results.length, 0);
});

test('skin type contributes to ranking without fabricating a hard safety claim', () => {
  const base = products.find((product) => product.category === '面部护理' && product.product_type === '乳液') as Product;
  const oily: Product = { ...base, product_id: 'skin-oily', name: '油性肤质候选', official_skin_types: ['油性'] };
  const dry: Product = { ...base, product_id: 'skin-dry', name: '干性肤质候选', official_skin_types: ['干性'] };
  const intent = understandIntent(`预算 ${Math.ceil(base.price + 10)}，油皮乳液`);
  const response = runAgentFromIntent(intent, [dry, oily]);
  assert.equal(response.kind, 'recommendation');
  if (response.kind === 'recommendation') assert.equal(response.results[0]?.product.product_id, 'skin-oily');
});

test('web discovery is reserved for evidence-bearing or unknown-type needs', () => {
  assert.equal(shouldUseWebDiscovery(understandIntent('预算 300，洗面奶，油皮')), false);
  assert.equal(shouldUseWebDiscovery(understandIntent('预算 300，洗面奶，想要控油')), true);
  assert.equal(shouldUseWebDiscovery(understandIntent('预算 300，敏感肌洗面奶')), true);
  assert.equal(shouldUseWebDiscovery(normalizeIntent({ productTypes: ['其他'], keywords: ['眼霜'] }, '预算 300，眼霜')), true);
});
