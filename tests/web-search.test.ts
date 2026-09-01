import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { applyWebEvidence, understandIntent } from '../lib/agent.ts';
import type { Product, WebEvidence } from '../lib/agent.ts';
import { resolveSearchCandidates } from '../lib/search-catalog.ts';
import { searchWebEvidence } from '../lib/web-search.ts';

const products = JSON.parse(readFileSync(new URL('../public/data/daily-products.json', import.meta.url), 'utf8')) as Product[];

test('search candidates are reconstructed from the server-side catalog whitelist', () => {
  const product = products[0];
  const resolved = resolveSearchCandidates([product.product_id]);
  assert.equal(resolved?.[0]?.name, product.name);
  assert.equal(resolved?.[0]?.brand, product.brand);
  assert.deepEqual(resolveSearchCandidates(['A520711852230'])?.[0]?.officialUrls, [
    'https://www.aveneusa.com/thermal-spring-water-300ml',
  ]);
  assert.equal(resolveSearchCandidates(['not-in-catalog']), null);
  assert.equal(resolveSearchCandidates([product.product_id, product.product_id]), null);
  assert.equal(resolveSearchCandidates([{ productId: product.product_id }]), null);
});

test('web search maps official citations to a candidate and explicit constraints', async () => {
  const originalFetch = globalThis.fetch;
  const originalSearchKey = process.env.WEB_SEARCH_API_KEY;
  const originalArkKey = process.env.ARK_API_KEY;
  process.env.WEB_SEARCH_API_KEY = 'test-only';
  delete process.env.ARK_API_KEY;
  globalThis.fetch = async () => new Response(JSON.stringify({
    Result: {
      WebResults: [{
        Title: '雅漾舒护活泉水喷雾 官方产品页',
        SiteName: '雅漾官网',
        Url: 'https://www.aveneusa.com/thermal-spring-water-300ml',
        Summary: '适合敏感肌，提供舒缓功效，配方不含香精。',
      }],
    },
  }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  try {
    const intent = understandIntent('预算 300，敏感肌想要舒缓喷雾，避开香精');
    const result = await searchWebEvidence([{
      productId: 'P1',
      name: '雅漾舒护活泉水喷雾',
      brand: 'Avène 雅漾',
      category: '面部护理',
      productType: '喷雾',
    }], intent, new AbortController().signal);
    assert.equal(result.provider, 'search-infinity');
    assert.equal(result.evidence.length, 1);
    assert.equal(result.evidence[0].sourceAuthority, 'official');
    assert.deepEqual(result.evidence[0].matchedEffects, ['舒缓']);
    assert.deepEqual(result.evidence[0].formulatedWithout, ['fragrance']);
    assert.equal(result.evidence[0].sensitiveSkinClaim, true);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalSearchKey === undefined) delete process.env.WEB_SEARCH_API_KEY;
    else process.env.WEB_SEARCH_API_KEY = originalSearchKey;
    if (originalArkKey === undefined) delete process.env.ARK_API_KEY;
    else process.env.ARK_API_KEY = originalArkKey;
  }
});

test('Doubao web search is required and maps action sources from a bilingual catalog brand', async () => {
  const originalFetch = globalThis.fetch;
  const originalSearchKey = process.env.WEB_SEARCH_API_KEY;
  const originalArkKey = process.env.ARK_API_KEY;
  delete process.env.WEB_SEARCH_API_KEY;
  process.env.ARK_API_KEY = 'test-only';
  globalThis.fetch = async (_input, init) => {
    const body = JSON.parse(String(init?.body)) as { tool_choice?: string; include?: string[] };
    assert.equal(body.tool_choice, 'required');
    assert.deepEqual(body.include, ['web_search_call.action.sources']);
    return new Response(JSON.stringify({
      output: [{
        type: 'web_search_call',
        status: 'completed',
        action: {
          type: 'search',
          sources: [{ type: 'url', url: 'https://www.aveneusa.com/thermal-spring-water-300ml' }],
        },
      }, {
        type: 'message',
        provider_payload: {
          records: [{ uri: 'https://www.eau-thermale-avene.com/product/thermal-spring-water' }],
        },
        content: [{
          type: 'output_text',
          text: [
            '雅漾舒护活泉水喷雾 300ml https://www.aveneusa.com/thermal-spring-water-300ml',
            '雅漾舒护活泉水喷雾 300ml https://www.eau-thermale-avene.com/product/thermal-spring-water',
          ].join('\n'),
          annotations: [],
        }],
      }],
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
  try {
    const intent = understandIntent('预算 300，敏感肌想要舒缓喷雾，避开香精');
    const result = await searchWebEvidence([{
      productId: 'P1',
      name: '雅漾舒护活泉水喷雾 300ml',
      brand: 'Avène 雅漾',
      category: '面部护理',
      productType: '喷雾',
    }], intent, new AbortController().signal);
    assert.equal(result.provider, 'doubao-web-search');
    assert.equal(result.evidence.length, 2);
    assert.ok(result.evidence.every((item) => item.sourceAuthority === 'official'));
  } finally {
    globalThis.fetch = originalFetch;
    if (originalSearchKey === undefined) delete process.env.WEB_SEARCH_API_KEY;
    else process.env.WEB_SEARCH_API_KEY = originalSearchKey;
    if (originalArkKey === undefined) delete process.env.ARK_API_KEY;
    else process.env.ARK_API_KEY = originalArkKey;
  }
});

test('an exact verified official URL disambiguates multilingual same-brand candidates', async () => {
  const originalFetch = globalThis.fetch;
  const originalSearchKey = process.env.WEB_SEARCH_API_KEY;
  const originalArkKey = process.env.ARK_API_KEY;
  delete process.env.WEB_SEARCH_API_KEY;
  process.env.ARK_API_KEY = 'test-only';
  globalThis.fetch = async () => new Response(JSON.stringify({
    output: [{
      type: 'web_search_call',
      status: 'completed',
      action: {
        type: 'search',
        sources: [{ type: 'url', url: 'https://www.aveneusa.com/thermal-spring-water-300ml' }],
      },
    }],
  }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  try {
    const intent = understandIntent('雅漾舒护活泉水喷雾 300ml，敏感肌，舒缓，避开香精');
    const result = await searchWebEvidence([{
      productId: 'P1',
      name: '雅漾舒护活泉水喷雾 300ml',
      brand: 'Avène 雅漾',
      category: '面部护理',
      productType: '喷雾',
      officialUrls: ['https://aveneusa.com/thermal-spring-water-300ml/'],
    }, {
      productId: 'P2',
      name: '雅漾修红洁面乳 300ml',
      brand: 'Avène 雅漾',
      category: '面部护理',
      productType: '洁面',
    }], intent, new AbortController().signal);
    assert.equal(result.provider, 'doubao-web-search');
    assert.equal(result.evidence.length, 1);
    assert.equal(result.evidence[0].productId, 'P1');
    assert.equal(result.evidence[0].sourceAuthority, 'official');
  } finally {
    globalThis.fetch = originalFetch;
    if (originalSearchKey === undefined) delete process.env.WEB_SEARCH_API_KEY;
    else process.env.WEB_SEARCH_API_KEY = originalSearchKey;
    if (originalArkKey === undefined) delete process.env.ARK_API_KEY;
    else process.env.ARK_API_KEY = originalArkKey;
  }
});

test('brand, generic type and weak size tokens cannot identify a product', async () => {
  const originalFetch = globalThis.fetch;
  const originalSearchKey = process.env.WEB_SEARCH_API_KEY;
  const originalArkKey = process.env.ARK_API_KEY;
  delete process.env.WEB_SEARCH_API_KEY;
  process.env.ARK_API_KEY = 'test-only';
  globalThis.fetch = async () => new Response(JSON.stringify({
    output: [{
      type: 'web_search_call',
      status: 'completed',
      action: {
        type: 'search',
        sources: [
          { type: 'url', url: 'https://www.aveneusa.com/unrelated-spray-300ml' },
          { type: 'url', url: 'https://www.aveneusa.com/' },
        ],
      },
    }],
  }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  try {
    const intent = understandIntent('雅漾舒护活泉水喷雾 300ml，敏感肌，舒缓，避开香精');
    const result = await searchWebEvidence([{
      productId: 'P1',
      name: '雅漾舒护活泉水喷雾 300ml',
      brand: 'Avène 雅漾',
      category: '面部护理',
      productType: '喷雾',
      officialUrls: ['https://www.aveneusa.com/thermal-spring-water-300ml'],
    }], intent, new AbortController().signal);
    assert.equal(result.provider, 'doubao-web-search');
    assert.deepEqual(result.evidence, []);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalSearchKey === undefined) delete process.env.WEB_SEARCH_API_KEY;
    else process.env.WEB_SEARCH_API_KEY = originalSearchKey;
    if (originalArkKey === undefined) delete process.env.ARK_API_KEY;
    else process.env.ARK_API_KEY = originalArkKey;
  }
});

test('compound quantities, pack sizes and generic claims stay weak identity signals', async () => {
  const originalFetch = globalThis.fetch;
  const originalSearchKey = process.env.WEB_SEARCH_API_KEY;
  const originalArkKey = process.env.ARK_API_KEY;
  delete process.env.WEB_SEARCH_API_KEY;
  process.env.ARK_API_KEY = 'test-only';
  const cases = [
    { name: '雅漾专属面膜 24ml*4', productType: '面膜', token: '24ml*4' },
    { name: '雅漾活泉喷雾 300ml*2', productType: '喷雾', token: '300ml*2' },
    { name: '雅漾活泉喷雾 300ml×2瓶', productType: '喷雾', token: '300ml×2瓶' },
    { name: '雅漾修护面膜 10片装', productType: '面膜', token: '10片装' },
    { name: '雅漾喷雾 300ml', productType: '喷雾', token: '喷雾 300ml' },
    { name: '雅漾 喷雾 保湿 300ml', productType: '喷雾', token: '保湿' },
    { name: '雅漾 喷雾 舒缓 300ml', productType: '喷雾', token: '舒缓' },
    { name: '雅漾 喷雾 敏感肌 300ml', productType: '喷雾', token: '敏感肌' },
    { name: '雅漾 防晒 SPF50', productType: '防晒', token: 'SPF50' },
  ];
  let callIndex = 0;
  globalThis.fetch = async () => {
    const current = cases[callIndex++];
    return new Response(JSON.stringify({
      output: [{
        type: 'web_search_call',
        status: 'completed',
        action: {
          type: 'search',
          sources: [{
            type: 'url',
            title: `Avène 雅漾 ${current.token} 官方页面`,
            url: `https://www.aveneusa.com/unrelated-${callIndex}`,
          }],
        },
      }],
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
  try {
    const intent = understandIntent('雅漾日化用品，敏感肌，舒缓');
    for (const item of cases) {
      const result = await searchWebEvidence([{
        productId: 'P1',
        name: item.name,
        brand: 'Avène 雅漾',
        category: '面部护理',
        productType: item.productType,
      }], intent, new AbortController().signal);
      assert.deepEqual(result.evidence, []);
    }
  } finally {
    globalThis.fetch = originalFetch;
    if (originalSearchKey === undefined) delete process.env.WEB_SEARCH_API_KEY;
    else process.env.WEB_SEARCH_API_KEY = originalSearchKey;
    if (originalArkKey === undefined) delete process.env.ARK_API_KEY;
    else process.env.ARK_API_KEY = originalArkKey;
  }
});

test('Doubao sources that identify only a shared brand do not attach to the wrong product', async () => {
  const originalFetch = globalThis.fetch;
  const originalSearchKey = process.env.WEB_SEARCH_API_KEY;
  const originalArkKey = process.env.ARK_API_KEY;
  delete process.env.WEB_SEARCH_API_KEY;
  process.env.ARK_API_KEY = 'test-only';
  globalThis.fetch = async () => new Response(JSON.stringify({
    output: [{
      type: 'web_search_call',
      status: 'completed',
      action: {
        type: 'search',
        sources: [
          { type: 'url', url: 'https://www.clinique.com.cn/custom-repair-moisturizer-gel-jelly/11584' },
          { type: 'url', url: 'https://www.clinique.com.cn/custom-repair-moisturizer-gel-jelly/11583' },
        ],
      },
    }],
  }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  try {
    const intent = understandIntent('200 元内，敏感肌，保湿，避开香精');
    const result = await searchWebEvidence([{
      productId: 'P1',
      name: '倩碧卓越润肤乳 50ml',
      brand: 'Clinique 倩碧',
      category: '面部护理',
      productType: '乳液',
    }, {
      productId: 'P2',
      name: '倩碧卓越润肤啫喱（无油）50ml',
      brand: 'Clinique 倩碧',
      category: '面部护理',
      productType: '乳液',
    }], intent, new AbortController().signal);
    assert.equal(result.provider, 'doubao-web-search');
    assert.deepEqual(result.evidence, []);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalSearchKey === undefined) delete process.env.WEB_SEARCH_API_KEY;
    else process.env.WEB_SEARCH_API_KEY = originalSearchKey;
    if (originalArkKey === undefined) delete process.env.ARK_API_KEY;
    else process.env.ARK_API_KEY = originalArkKey;
  }
});

test('third-party pages stay public evidence and cannot become official by wording', async () => {
  const originalFetch = globalThis.fetch;
  const originalSearchKey = process.env.WEB_SEARCH_API_KEY;
  process.env.WEB_SEARCH_API_KEY = 'test-only';
  globalThis.fetch = async () => new Response(JSON.stringify({
    Result: {
      WebResults: [{
        Title: '雅漾舒护活泉水喷雾 官方推荐',
        SiteName: '第三方博客',
        Url: 'https://example.com/review',
        Summary: '文章称适合敏感肌且不含香精。',
      }],
    },
  }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  try {
    const intent = understandIntent('预算 300，敏感肌雅漾喷雾，避开香精');
    const result = await searchWebEvidence([{
      productId: 'P1',
      name: '雅漾舒护活泉水喷雾',
      brand: '雅漾',
      category: '面部护理',
      productType: '喷雾',
    }], intent, new AbortController().signal);
    assert.equal(result.evidence[0]?.sourceAuthority, 'public');
  } finally {
    globalThis.fetch = originalFetch;
    if (originalSearchKey === undefined) delete process.env.WEB_SEARCH_API_KEY;
    else process.env.WEB_SEARCH_API_KEY = originalSearchKey;
  }
});

test('a negative claim cannot cross punctuation or a contrasting ingredient clause', async () => {
  const originalFetch = globalThis.fetch;
  const originalSearchKey = process.env.WEB_SEARCH_API_KEY;
  const originalArkKey = process.env.ARK_API_KEY;
  process.env.WEB_SEARCH_API_KEY = 'test-only';
  delete process.env.ARK_API_KEY;
  globalThis.fetch = async () => new Response(JSON.stringify({
    Result: {
      WebResults: [{
        Title: '雅漾舒护活泉水喷雾 官方产品页',
        SiteName: '雅漾官网',
        Url: 'https://www.eau-thermale-avene.com.cn/product/spray',
        Summary: '产品不含酒精，但含有香精。',
      }],
    },
  }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  try {
    const intent = understandIntent('预算 300，雅漾喷雾，避开香精');
    const result = await searchWebEvidence([{
      productId: 'P1',
      name: '雅漾舒护活泉水喷雾',
      brand: '雅漾',
      category: '面部护理',
      productType: '喷雾',
    }], intent, new AbortController().signal);
    assert.deepEqual(result.evidence[0]?.formulatedWithout, []);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalSearchKey === undefined) delete process.env.WEB_SEARCH_API_KEY;
    else process.env.WEB_SEARCH_API_KEY = originalSearchKey;
    if (originalArkKey === undefined) delete process.env.ARK_API_KEY;
    else process.env.ARK_API_KEY = originalArkKey;
  }
});

test('search summaries never upgrade sensitive-skin, efficacy or ingredient hard gates', () => {
  const base = products.find((product) => product.evidence_level === 'historical_title_only') as Product;
  const intent = understandIntent(`预算 ${Math.ceil(base.price + 10)}，敏感肌需要官方核实的舒缓功效，避开香精`);
  const evidence: WebEvidence = {
    productId: base.product_id,
    title: '品牌官网搜索结果',
    url: 'https://www.eau-thermale-avene.com.cn/example',
    siteName: '品牌官网',
    summary: '搜索摘要称敏感肌舒缓且不含香精',
    retrievedAt: '2026-09-01',
    sourceAuthority: 'official',
    matchedEffects: ['舒缓'],
    matchedSkinTypes: ['敏感肌'],
    formulatedWithout: ['fragrance'],
    sensitiveSkinClaim: true,
  };
  const merged = applyWebEvidence([base], [evidence], intent)[0];
  assert.deepEqual(merged.recommendation_eligibility, base.recommendation_eligibility);
  assert.deepEqual(merged.official_concerns, base.official_concerns);
  assert.deepEqual(merged.official_formulated_without, base.official_formulated_without);
  assert.equal(merged.evidence_sources.at(-1)?.supports[0], 'source_discovery');
});
