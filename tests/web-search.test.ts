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
    assert.equal(result.evidence.length, 1);
    assert.equal(result.evidence[0].sourceAuthority, 'official');
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
        Title: '雅漾喷雾官方推荐',
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
