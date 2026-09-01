import { NextResponse } from 'next/server';
import { understandIntent } from '../../../lib/agent';
import { resolveSearchCandidates } from '../../../lib/search-catalog';
import { searchWebEvidence } from '../../../lib/web-search';

export const dynamic = 'force-dynamic';

const RATE_WINDOW_MS = 5 * 60 * 1000;
const RATE_LIMIT = 12;
const CACHE_TTL_MS = 15 * 60 * 1000;
const rateBuckets = new Map<string, { count: number; resetAt: number }>();
const responseCache = new Map<string, { expiresAt: number; result: Awaited<ReturnType<typeof searchWebEvidence>> }>();

function isSameOrigin(request: Request): boolean {
  const origin = request.headers.get('origin');
  if (!origin || request.headers.get('x-zhixuan-request') !== 'web-evidence-v1') return false;
  try {
    const expectedHost = request.headers.get('x-forwarded-host')
      ?? request.headers.get('host')
      ?? new URL(request.url).host;
    return new URL(origin).host === expectedHost;
  } catch {
    return false;
  }
}

function rateLimitKey(request: Request): string {
  return request.headers.get('cf-connecting-ip')
    ?? request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    ?? 'local-preview';
}

function isRateLimited(request: Request): boolean {
  const now = Date.now();
  if (rateBuckets.size > 1000) {
    for (const [key, bucket] of rateBuckets) if (bucket.resetAt <= now) rateBuckets.delete(key);
  }
  const key = rateLimitKey(request);
  const bucket = rateBuckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    rateBuckets.set(key, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return false;
  }
  bucket.count += 1;
  return bucket.count > RATE_LIMIT;
}

function pruneResponseCache(now: number) {
  for (const [key, cached] of responseCache) if (cached.expiresAt <= now) responseCache.delete(key);
  while (responseCache.size >= 500) {
    const oldestKey = responseCache.keys().next().value as string | undefined;
    if (!oldestKey) break;
    responseCache.delete(oldestKey);
  }
}

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return NextResponse.json({ error: '请求来源无效' }, { status: 403 });
  if (isRateLimited(request)) return NextResponse.json({ evidence: [], provider: 'unavailable', reason: 'rate_limited' }, { status: 429 });
  let query = '';
  let candidates: ReturnType<typeof resolveSearchCandidates> = null;
  try {
    const contentLength = Number(request.headers.get('content-length') ?? 0);
    if (contentLength > 4_000) return NextResponse.json({ error: '请求过大' }, { status: 413 });
    const body = await request.json() as { query?: unknown; candidateIds?: unknown };
    query = typeof body.query === 'string' ? body.query.trim() : '';
    candidates = resolveSearchCandidates(body.candidateIds);
  } catch {
    return NextResponse.json({ error: '请求格式无效' }, { status: 400 });
  }
  if (!query || query.length > 500 || !candidates?.length) {
    return NextResponse.json({ error: '缺少有效需求或候选商品' }, { status: 400 });
  }

  const intent = understandIntent(query);
  const cacheKey = JSON.stringify({
    candidateIds: candidates.map((candidate) => candidate.productId),
    effects: intent.desiredEffects,
    skinType: intent.skinType,
    sensitiveSkin: intent.sensitiveSkin,
    avoidIngredients: intent.avoidIngredients,
  });
  pruneResponseCache(Date.now());
  const cached = responseCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return NextResponse.json(cached.result, { headers: { 'Cache-Control': 'private, max-age=0' } });
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8_000);
  try {
    const result = await searchWebEvidence(candidates, intent, controller.signal);
    responseCache.set(cacheKey, { expiresAt: Date.now() + CACHE_TTL_MS, result });
    return NextResponse.json(result, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    const reason = controller.signal.aborted
      ? 'timeout'
      : error instanceof Error ? error.message.replace(/[^a-z0-9_-]/gi, '').slice(0, 80) : 'search_error';
    return NextResponse.json(
      { evidence: [], provider: 'unavailable', reason },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } finally {
    clearTimeout(timeout);
  }
}
