'use client';

import { FormEvent, KeyboardEvent, useEffect, useMemo, useRef, useState } from 'react';
import { AgentResponse, Product, Ranker, SPEC_LABELS, runAgent } from '../lib/agent';

type Metrics = {
  model: Record<string, number>;
  popularity_baseline: Record<string, number>;
  price_baseline: Record<string, number>;
  dataset: Record<string, number>;
};

const sampleNeeds = [
  { label: '编程轻游戏', query: '预算 7000 元，编程和轻度游戏，续航要好' },
  { label: '差旅轻薄本', query: '想买一台适合出差的轻薄本，预算 6000 元，屏幕护眼' },
  { label: '拍照续航手机', query: '3000 元以内的手机，拍照和续航优先' },
];

const projectDocs = [
  ['产品需求文档', '用户问题、产品目标与功能边界', '产品需求文档_PRD.md'],
  ['系统架构', 'Agent、检索、排序与生成链路', '系统架构与RAG流程.md'],
  ['实验设计', '指标定义、基线对比与结果边界', '实验与指标设计.md'],
  ['数据字典', '合成数据库结构、字段与质量规则', '数据字典.md'],
];

const githubBase = 'https://github.com/LICHENGYAN0316/zhixuan-ai-shopping-agent-cn';

function formatPercent(value: number | undefined) {
  return value === undefined ? '—' : `${(value * 100).toFixed(1)}%`;
}

function MetricCard({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <article className="metric-card">
      <p className="eyebrow text-slate-500">{label}</p>
      <strong className="mt-2 block text-3xl font-black tracking-[-.045em] text-[#172033]">{value}</strong>
      <p className="mt-2 text-xs leading-5 text-slate-500">{detail}</p>
    </article>
  );
}

function Step({ number, label, state }: { number: string; label: string; state: 'done' | 'active' | 'pending' }) {
  return (
    <div className={`agent-step agent-step-${state}`}>
      <span>{state === 'done' ? '完成' : number}</span>
      <p>{label}</p>
    </div>
  );
}

export default function Home() {
  const [query, setQuery] = useState(sampleNeeds[0].query);
  const [products, setProducts] = useState<Product[]>([]);
  const [ranker, setRanker] = useState<Ranker | null>(null);
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [response, setResponse] = useState<AgentResponse | null>(null);
  const [selected, setSelected] = useState(0);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [dataError, setDataError] = useState(false);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    let active = true;
    Promise.all([
      fetch('/data/demo-products.json').then((item) => item.json()),
      fetch('/data/ranker.json').then((item) => item.json()),
      fetch('/data/metrics.json').then((item) => item.json()),
    ]).then(([productData, rankerData, metricData]) => {
      if (!active) return;
      setProducts(productData);
      setRanker(rankerData);
      setMetrics(metricData);
      setResponse(runAgent(sampleNeeds[0].query, productData, rankerData));
      setLoading(false);
    }).catch(() => {
      if (!active) return;
      setLoading(false);
      setDataError(true);
    });

    return () => {
      active = false;
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    };
  }, []);

  const recommendation = response?.kind === 'recommendation' ? response : null;
  const selectedResult = recommendation?.results[selected] ?? recommendation?.results[0];
  const modelNdcg = metrics?.model['ndcg@10'] ?? 0;
  const baselineNdcg = metrics?.popularity_baseline['ndcg@10'] ?? 0;
  const lift = baselineNdcg ? (modelNdcg - baselineNdcg) / baselineNdcg : 0;
  const workflowState = processing ? 'processing' : response?.kind ?? 'idle';

  const intentChips = useMemo(() => {
    if (!response) return [];
    return [
      ['品类', response.intent.category],
      ['预算', response.intent.budget ? `¥${response.intent.budget.toLocaleString('zh-CN')}` : '待补充'],
      ['场景', response.intent.useCase],
      ['优先项', SPEC_LABELS[response.intent.primaryPreference]],
    ];
  }, [response]);

  const budgetChoices = useMemo(() => {
    const category = response?.intent.category;
    if (category === '智能手机') return [2000, 3000, 5000, 7000];
    if (category === '头戴耳机' || category === '键鼠套装') return [500, 1000, 2000, 3000];
    return [4000, 6000, 8000, 10000];
  }, [response]);

  function run(nextQuery: string) {
    if (!ranker || !nextQuery.trim()) return;
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    setSelected(0);
    setProcessing(true);
    timerRef.current = window.setTimeout(() => {
      setResponse(runAgent(nextQuery.trim(), products, ranker));
      setProcessing(false);
      timerRef.current = null;
    }, 420);
  }

  function submit(event?: FormEvent) {
    event?.preventDefault();
    run(query);
  }

  function chooseSample(nextQuery: string) {
    setQuery(nextQuery);
    run(nextQuery);
  }

  function addBudget(budget: number) {
    const nextQuery = `${query.replace(/[，。；;\s]+$/, '')}，预算 ${budget} 元`;
    setQuery(nextQuery);
    run(nextQuery);
  }

  function handleQueryKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') submit();
  }

  return (
    <main className="min-h-screen bg-[#f4f5f8] text-[#172033]">
      <header className="sticky top-0 z-30 border-b border-slate-200/80 bg-[#fbfbfc]/90 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-[1180px] items-center justify-between px-5 lg:px-8">
          <a className="flex items-center gap-3" href="#top" aria-label="返回首页">
            <span className="brand-mark">智</span>
            <span>
              <strong className="block text-[15px] leading-none">智选 Agent</strong>
              <span className="mt-1 block text-[10px] font-medium tracking-[.13em] text-slate-400">3C 智能导购</span>
            </span>
          </a>
          <nav className="hidden items-center gap-7 text-sm font-medium text-slate-600 md:flex" aria-label="主导航">
            <a className="nav-link" href="#agent">在线体验</a>
            <a className="nav-link" href="#evidence">实验结果</a>
            <a className="nav-link" href="#architecture">系统流程</a>
            <a className="nav-link" href="#docs">项目文档</a>
          </nav>
          <a className="header-link" href={githubBase} target="_blank" rel="noreferrer">查看源码</a>
        </div>
      </header>

      <section id="top" className="relative overflow-hidden border-b border-slate-200/80 bg-[#fbfbfc]">
        <div className="soft-grid absolute inset-0" />
        <div className="relative mx-auto grid max-w-[1180px] gap-10 px-5 pb-16 pt-12 lg:grid-cols-[.72fr_1.28fr] lg:items-center lg:px-8 lg:pb-20 lg:pt-16">
          <div className="lg:pb-5">
            <p className="eyebrow text-[#d6531b]">中文 3C 电商智能导购</p>
            <h1 className="mt-4 max-w-xl text-balance text-[clamp(2.55rem,5vw,4.7rem)] font-black leading-[1.03] tracking-[-.065em]">
              少做功课，<br />更快选对。
            </h1>
            <p className="mt-6 max-w-lg text-[16px] leading-8 text-slate-600">
              用一句话描述预算、用途和偏好。Agent 会理解需求、检索商品、排序候选，并说明推荐依据与取舍。
            </p>
            <div className="mt-8 grid max-w-lg grid-cols-3 gap-3">
              <div className="hero-stat"><strong>720</strong><span>合成商品</span></div>
              <div className="hero-stat"><strong>96K</strong><span>行为记录</span></div>
              <div className="hero-stat"><strong>+{formatPercent(lift)}</strong><span>NDCG 提升</span></div>
            </div>
            <p className="mt-5 max-w-lg text-xs leading-5 text-slate-400">全部商品与行为均为合成数据，仅用于展示产品方案与可复现实验。</p>
          </div>

          <section id="agent" className="agent-shell" aria-labelledby="agent-title">
            <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-200 px-5 py-5 sm:px-6">
              <div>
                <p className="eyebrow text-[#d6531b]">在线体验</p>
                <h2 id="agent-title" className="mt-1 text-xl font-black tracking-[-.025em]">告诉我你想买什么</h2>
              </div>
              <span className="status-pill"><span />模型与商品库已就绪</span>
            </div>

            <div className="grid grid-cols-3 border-b border-slate-200 bg-slate-50/70 px-5 py-3 sm:px-6">
              <Step number="1" label="理解需求" state={workflowState === 'clarification' ? 'active' : response ? 'done' : 'pending'} />
              <Step number="2" label="检索排序" state={workflowState === 'processing' ? 'active' : recommendation ? 'done' : 'pending'} />
              <Step number="3" label="生成建议" state={!processing && recommendation ? 'done' : 'pending'} />
            </div>

            <div className="p-5 sm:p-6">
              <form onSubmit={submit}>
                <label className="mb-2 block text-sm font-bold" htmlFor="shopping-need">我的购买需求</label>
                <textarea
                  id="shopping-need"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  onKeyDown={handleQueryKeyDown}
                  className="query-input"
                  placeholder="例如：预算 6000 元，经常出差，希望轻薄、续航好……"
                />
                <div className="mt-3 flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
                  <div className="flex flex-wrap gap-2" aria-label="示例需求">
                    {sampleNeeds.map((item) => (
                      <button key={item.label} type="button" onClick={() => chooseSample(item.query)} className="choice-chip">
                        {item.label}
                      </button>
                    ))}
                  </div>
                  <button disabled={loading || processing || !query.trim()} type="submit" className="primary-button">
                    {loading ? '准备数据中' : processing ? '正在分析需求' : '生成推荐'}
                  </button>
                </div>
                <p className="mt-3 text-[11px] text-slate-400">支持 Ctrl / Command + Enter 快速提交</p>
              </form>

              <div className="mt-5" aria-live="polite" aria-busy={processing}>
                {dataError ? (
                  <div className="message message-warning">
                    <strong>演示数据暂时没有载入。</strong>
                    <p>请刷新页面后重试；项目源码和完整数据仍可在 GitHub 查看。</p>
                  </div>
                ) : processing ? (
                  <div className="processing-card">
                    <div className="processing-line" />
                    <div>
                      <strong>正在理解需求并比较候选</strong>
                      <p>依次完成意图抽取、商品召回和模型排序。</p>
                    </div>
                  </div>
                ) : response?.kind === 'clarification' ? (
                  <div className="message message-agent">
                    <p className="eyebrow text-[#b54517]">需要补充一个信息</p>
                    <strong className="mt-2 block text-base">{response.question}</strong>
                    <div className="mt-4 flex flex-wrap gap-2">
                      {budgetChoices.map((budget) => (
                        <button key={budget} type="button" className="budget-chip" onClick={() => addBudget(budget)}>
                          ¥{budget.toLocaleString('zh-CN')}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : recommendation ? (
                  <div className="space-y-4">
                    <div className="message message-agent">
                      <p className="eyebrow text-[#b54517]">导购建议</p>
                      <p className="mt-2 text-sm leading-6 text-slate-700">{recommendation.summary}</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {intentChips.map(([label, value]) => (
                        <span key={label} className="intent-chip"><small>{label}</small>{value}</span>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          </section>
        </div>
      </section>

      <section className="mx-auto max-w-[1180px] px-5 py-14 lg:px-8 lg:py-20">
        <div className="section-heading">
          <div>
            <p className="eyebrow text-[#d6531b]">推荐结果</p>
            <h2 className="mt-2 text-3xl font-black tracking-[-.045em]">先看结论，再看依据。</h2>
          </div>
          {recommendation && <p className="section-note">从 {recommendation.retrievedCount} 个候选中输出 Top {recommendation.results.length}</p>}
        </div>

        {recommendation?.results.length ? (
          <div className="mt-7 grid gap-5 lg:grid-cols-[.82fr_1.18fr]">
            <div className="space-y-3" aria-label="推荐候选">
              {recommendation.results.map((item, index) => (
                <button
                  key={item.product.product_id}
                  type="button"
                  onClick={() => setSelected(index)}
                  className={`result-row ${selected === index ? 'result-row-selected' : ''}`}
                  aria-pressed={selected === index}
                >
                  <span className="rank-number">{index + 1}</span>
                  <span className="min-w-0 flex-1">
                    <strong className="block truncate text-[15px]">{item.product.name}</strong>
                    <span className="mt-1 block text-xs text-slate-500">{item.product.brand} · {item.product.category} · 评分 {item.product.rating.toFixed(1)}</span>
                  </span>
                  <span className="text-right">
                    <strong className="block text-lg">¥{item.product.price.toLocaleString('zh-CN')}</strong>
                    <span className="mt-1 block text-xs font-bold text-emerald-700">匹配 {formatPercent(item.score)}</span>
                  </span>
                </button>
              ))}
            </div>

            {selectedResult && (
              <article className="detail-panel">
                <div className="flex flex-col justify-between gap-4 border-b border-slate-200 pb-5 sm:flex-row sm:items-start">
                  <div>
                    <p className="eyebrow text-slate-500">当前查看</p>
                    <h3 className="mt-2 text-2xl font-black tracking-[-.035em]">{selectedResult.product.name}</h3>
                    <p className="mt-2 text-sm text-slate-500">{selectedResult.product.description}</p>
                  </div>
                  <div className="shrink-0 rounded-2xl bg-[#172033] px-4 py-3 text-white">
                    <span className="block text-[11px] text-slate-300">综合匹配</span>
                    <strong className="mt-1 block text-2xl">{formatPercent(selectedResult.score)}</strong>
                  </div>
                </div>

                <div className="mt-5 grid gap-5 sm:grid-cols-2">
                  <div>
                    <p className="text-sm font-bold">推荐依据</p>
                    <ul className="mt-3 space-y-3">
                      {selectedResult.reasons.map((reason, index) => (
                        <li key={reason} className="evidence-item"><span>{index + 1}</span><p>{reason}</p></li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <div className="flex items-center justify-between text-sm">
                      <strong>{SPEC_LABELS[recommendation.intent.primaryPreference]}能力</strong>
                      <span className="font-black">{Math.round(selectedResult.product[recommendation.intent.primaryPreference] * 100)} 分</span>
                    </div>
                    <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-200">
                      <div className="h-full rounded-full bg-[#f2672e]" style={{ width: `${selectedResult.product[recommendation.intent.primaryPreference] * 100}%` }} />
                    </div>
                    <div className="mt-5 rounded-2xl bg-[#fff7f2] p-4">
                      <p className="text-xs font-bold text-[#b54517]">购买前留意</p>
                      <p className="mt-2 text-sm leading-6 text-slate-700">{selectedResult.product.limitations}</p>
                    </div>
                  </div>
                </div>
              </article>
            )}
          </div>
        ) : (
          <div className="empty-result mt-7">
            <strong>{response?.kind === 'clarification' ? '补充预算后即可查看推荐' : '输入需求后，这里会出现可比较的候选商品'}</strong>
            <p>{response?.kind === 'clarification' ? '可直接使用上方预算选项，流程会自动继续。' : '推荐会同时展示匹配度、证据与取舍提醒。'}</p>
          </div>
        )}
      </section>

      <section id="evidence" className="border-y border-slate-200 bg-white py-14 lg:py-20">
        <div className="mx-auto max-w-[1180px] px-5 lg:px-8">
          <div className="section-heading">
            <div>
              <p className="eyebrow text-[#d6531b]">离线实验</p>
              <h2 className="mt-2 text-3xl font-black tracking-[-.045em]">指标来自可复现脚本。</h2>
              <p className="mt-3 max-w-2xl text-sm leading-7 text-slate-500">按时间切分训练、验证和测试集，并与热门度、价格两种基线进行同口径比较。</p>
            </div>
            <span className="section-note">测试查询 {metrics?.dataset.test_queries?.toLocaleString('zh-CN') ?? '—'} 条</span>
          </div>

          <div className="mt-7 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <MetricCard label="PRECISION@5" value={formatPercent(metrics?.model['precision@5'])} detail="前 5 个结果中的相关商品比例" />
            <MetricCard label="RECALL@10" value={formatPercent(metrics?.model['recall@10'])} detail="前 10 个结果覆盖相关商品的比例" />
            <MetricCard label="NDCG@10" value={formatPercent(metrics?.model['ndcg@10'])} detail="同时考虑匹配程度与排序位置" />
            <MetricCard label="MRR" value={formatPercent(metrics?.model.mrr)} detail="首个相关结果出现位置的质量" />
          </div>

          <div className="mt-5 grid gap-5 lg:grid-cols-[1.25fr_.75fr]">
            <article className="rounded-[24px] border border-slate-200 bg-[#f7f8fa] p-6">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div><h3 className="font-bold">NDCG@10 基线对比</h3><p className="mt-1 text-xs text-slate-500">模型相对热门度基线提升 {formatPercent(lift)}</p></div>
                <span className="rounded-full bg-emerald-100 px-3 py-1.5 text-xs font-bold text-emerald-700">离线验证</span>
              </div>
              <div className="mt-6 space-y-4">
                {[
                  ['排序模型', modelNdcg, '#f2672e'],
                  ['价格基线', metrics?.price_baseline['ndcg@10'] ?? 0, '#64748b'],
                  ['热门度基线', baselineNdcg, '#a1aab8'],
                ].map(([label, value, color]) => (
                  <div key={String(label)}>
                    <div className="mb-2 flex justify-between text-xs"><span className="font-semibold text-slate-600">{label}</span><strong>{formatPercent(Number(value))}</strong></div>
                    <div className="h-2.5 overflow-hidden rounded-full bg-slate-200"><div className="h-full rounded-full" style={{ width: `${Number(value) * 100}%`, backgroundColor: String(color) }} /></div>
                  </div>
                ))}
              </div>
            </article>
            <article className="rounded-[24px] bg-[#172033] p-6 text-white">
              <p className="eyebrow text-orange-300">合成数据库</p>
              <div className="mt-5 grid grid-cols-2 gap-5">
                {[
                  ['720', '商品'], ['2,500', '用户'], ['8,000', '查询'], ['96,000', '交互'],
                ].map(([value, label]) => (
                  <div key={label}><strong className="block text-2xl font-black">{value}</strong><span className="mt-1 block text-xs text-slate-400">合成{label}</span></div>
                ))}
              </div>
              <p className="mt-5 border-t border-white/10 pt-4 text-xs leading-5 text-slate-400">固定随机种子、SQLite、CSV 与文件哈希全部随仓库提供。</p>
            </article>
          </div>
        </div>
      </section>

      <section id="architecture" className="mx-auto max-w-[1180px] px-5 py-14 lg:px-8 lg:py-20">
        <div className="max-w-2xl">
          <p className="eyebrow text-[#d6531b]">系统流程</p>
          <h2 className="mt-2 text-3xl font-black tracking-[-.045em]">每一步都能解释，也能验证。</h2>
        </div>
        <div className="mt-7 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {[
            ['01', '理解需求', '抽取预算、品类、场景与偏好；缺少关键信息时先澄清。'],
            ['02', '检索商品', '按品类、预算与关键词召回候选，并保留商品证据。'],
            ['03', '排序候选', '模型计算需求匹配度，输出 Top-K 并与基线比较。'],
            ['04', '生成建议', '只依据召回字段说明推荐理由、价格与使用取舍。'],
          ].map(([step, title, detail]) => (
            <article key={step} className="flow-card">
              <span>{step}</span><h3>{title}</h3><p>{detail}</p>
            </article>
          ))}
        </div>
      </section>

      <section id="docs" className="border-t border-slate-200 bg-[#172033] py-14 text-white lg:py-20">
        <div className="mx-auto max-w-[1180px] px-5 lg:px-8">
          <div className="section-heading border-white/10">
            <div>
              <p className="eyebrow text-orange-300">项目文档</p>
              <h2 className="mt-2 text-3xl font-black tracking-[-.045em]">从产品定义到实验复现。</h2>
              <p className="mt-3 max-w-2xl text-sm leading-7 text-slate-300">公开内容只保留项目本身、实现方法与结果边界，便于快速了解和复核。</p>
            </div>
            <a className="docs-main-link" href={githubBase} target="_blank" rel="noreferrer">进入 GitHub 项目</a>
          </div>
          <div className="mt-7 grid gap-3 sm:grid-cols-2">
            {projectDocs.map(([title, detail, file], index) => (
              <a key={title} className="doc-card" href={`${githubBase}/blob/main/docs/${encodeURIComponent(file)}`} target="_blank" rel="noreferrer">
                <span>{String(index + 1).padStart(2, '0')}</span>
                <div><h3>{title}</h3><p>{detail}</p></div>
              </a>
            ))}
          </div>
        </div>
      </section>

      <footer className="border-t border-white/10 bg-[#172033] text-slate-400">
        <div className="mx-auto flex max-w-[1180px] flex-col gap-2 px-5 py-7 text-xs sm:flex-row sm:items-center sm:justify-between lg:px-8">
          <span>智选 Agent · 中文 3C 电商智能导购</span>
          <span>合成数据 · 可复现训练 · 证据约束推荐</span>
        </div>
      </footer>
    </main>
  );
}
