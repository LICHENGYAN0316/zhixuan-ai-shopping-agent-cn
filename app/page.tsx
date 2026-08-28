'use client';

import {
  ArrowCounterClockwise,
  ArrowRight,
  ArrowsLeftRight,
  CaretDown,
  ChartLineUp,
  Check,
  Code,
  Database,
  FileText,
  GithubLogo,
  House,
  Info,
  ListChecks,
  MagnifyingGlass,
  Scales,
  ShieldCheck,
  SlidersHorizontal,
  SquaresFour,
  Stack,
  WarningCircle,
} from '@phosphor-icons/react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, FormEvent, KeyboardEvent, ReactNode } from 'react';
import { SPEC_LABELS, runAgent } from '../lib/agent';
import type { AgentResponse, Product, Ranker, Recommendation } from '../lib/agent';

type Metrics = {
  model: Record<string, number>;
  popularity_baseline: Record<string, number>;
  price_baseline: Record<string, number>;
  dataset: Record<string, number>;
};

type View = 'welcome' | 'clarify' | 'processing' | 'results' | 'compare' | 'evidence' | 'project';
type EvidenceKey = 'product' | 'query' | 'review';
type Tone = 'neutral' | 'success' | 'warning' | 'accent';

const defaultNeed = '5000 元内，适合视频剪辑、经常出差的轻薄本';

const sampleNeeds = [
  { label: '移动剪辑轻薄本', query: defaultNeed },
  { label: '编程与轻度游戏', query: '预算 7000 元，编程和轻度游戏，续航要好' },
  { label: '拍照续航手机', query: '3000 元以内的手机，拍照和续航优先' },
];

const projectDocs = [
  { title: '产品需求文档', detail: '用户问题、目标、功能范围与产品边界', file: '产品需求文档_PRD.md', icon: FileText },
  { title: '系统架构与 RAG', detail: '需求理解、召回、排序与证据生成链路', file: '系统架构与RAG流程.md', icon: Stack },
  { title: '实验与指标设计', detail: 'Precision、Recall、NDCG、MRR 与基线', file: '实验与指标设计.md', icon: ChartLineUp },
  { title: '合成数据字典', detail: '数据库结构、字段语义与质量规则', file: '数据字典.md', icon: Database },
];

const githubBase = 'https://github.com/LICHENGYAN0316/zhixuan-ai-shopping-agent-cn';
const figmaUrl = 'https://www.figma.com/design/0cQqKzVoOS9376uWrMgwGV';

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) throw new Error('Failed to load ' + url);
  return response.json() as Promise<T>;
}

function formatPercent(value: number | undefined, digits = 0) {
  return value === undefined ? '—' : (value * 100).toFixed(digits) + '%';
}

function score(value: number) {
  return Math.round(value * 100);
}

function Logo() {
  return (
    <span className="brand" aria-label="智选">
      <span className="logo-mark">Z</span>
      <strong>智选</strong>
      <small>3C 智能导购</small>
    </span>
  );
}

function StatusChip({ children, tone = 'success' }: { children: ReactNode; tone?: Tone }) {
  return (
    <span className={'status-chip status-chip-' + tone}>
      <span className="status-dot" aria-hidden="true" />
      {children}
    </span>
  );
}

function Header({ view, onNavigate }: { view: View; onNavigate: (next: View) => void }) {
  const shoppingActive = ['welcome', 'clarify', 'processing'].includes(view);
  const planActive = ['results', 'compare', 'evidence'].includes(view);
  return (
    <header className="site-header">
      <button className="brand-button" type="button" onClick={() => onNavigate('welcome')}><Logo /></button>
      <nav className="desktop-nav" aria-label="主导航">
        <button className={shoppingActive ? 'is-active' : ''} type="button" onClick={() => onNavigate('welcome')}>智能导购</button>
        <button className={planActive ? 'is-active' : ''} type="button" onClick={() => onNavigate('results')}>我的方案</button>
        <button className={view === 'project' ? 'is-active' : ''} type="button" onClick={() => onNavigate('project')}>项目说明</button>
      </nav>
      <span className="mobile-demo-label">公开演示</span>
    </header>
  );
}

function Button({
  children,
  onClick,
  variant = 'primary',
  disabled,
  type = 'button',
  icon,
  className = '',
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: 'primary' | 'secondary' | 'ghost';
  disabled?: boolean;
  type?: 'button' | 'submit';
  icon?: ReactNode;
  className?: string;
}) {
  return (
    <button className={'ui-button ui-button-' + variant + ' ' + className} disabled={disabled} type={type} onClick={onClick}>
      <span>{children}</span>{icon}
    </button>
  );
}

function MobileNav({ view, onNavigate }: { view: View; onNavigate: (view: View) => void }) {
  const items = [
    { key: 'welcome' as View, label: '导购', active: ['welcome', 'clarify', 'processing'].includes(view), Icon: House },
    { key: 'results' as View, label: '方案', active: ['results', 'compare', 'evidence'].includes(view), Icon: Scales },
    { key: 'project' as View, label: '项目', active: view === 'project', Icon: SquaresFour },
  ];
  return (
    <nav className="mobile-nav" aria-label="移动端主导航">
      {items.map(({ key, label, active, Icon }) => (
        <button className={active ? 'is-active' : ''} key={key} type="button" onClick={() => onNavigate(key)}>
          <Icon aria-hidden="true" size={19} weight={active ? 'fill' : 'regular'} /><span>{label}</span>
        </button>
      ))}
    </nav>
  );
}

function MetricCard({ label, value, detail, tone = 'neutral' }: { label: string; value: string; detail: string; tone?: Tone }) {
  return <article className={'metric-card metric-card-' + tone}><p>{label}</p><strong>{value}</strong><span>{detail}</span></article>;
}

function RecommendationCard({
  item,
  index,
  intent,
  selectedForCompare,
  mobileActive,
  onToggleCompare,
  onEvidence,
}: {
  item: Recommendation;
  index: number;
  intent: NonNullable<Extract<AgentResponse, { kind: 'recommendation' }>>['intent'];
  selectedForCompare: boolean;
  mobileActive: boolean;
  onToggleCompare: () => void;
  onEvidence: () => void;
}) {
  const feature = intent.primaryPreference;
  const specKeys = [feature, 'portability', 'battery', 'performance'].filter((key, position, values) => values.indexOf(key) === position).slice(0, 3) as Array<keyof typeof SPEC_LABELS>;
  const evidenceComplete = index < 2;
  const tradeoff = item.product.limitations.replace(/[。.]$/, '');
  return (
    <article className={'recommendation-card ' + (index === 0 ? 'is-priority ' : '') + (mobileActive ? 'is-mobile-active' : '')}>
      <div className="card-topline">
        <span className={index === 0 ? 'rank-badge rank-badge-accent' : 'rank-badge'}>{index === 0 ? 'TOP 1' : '候选 ' + (index + 1)}</span>
        <span className={'evidence-badge ' + (evidenceComplete ? 'is-complete' : 'is-limited')}>{evidenceComplete ? '2 条完整依据' : '1 条依据待补'}</span>
      </div>
      <div className="synthetic-product-visual"><SquaresFour aria-hidden="true" size={18} /><span>SYNTHETIC SKU · {item.product.product_id}</span></div>
      <div className="card-title"><p>{item.product.name}</p><strong>¥{item.product.price.toLocaleString('zh-CN')} · 合成示例</strong></div>
      <div className="card-reasons">
        <span>为什么适合你</span>
        {item.reasons.slice(0, 2).map((reason) => <p key={reason}><Check aria-hidden="true" size={13} weight="bold" />{reason}</p>)}
      </div>
      <div className="spec-chips">{specKeys.map((key) => <span key={key}>{SPEC_LABELS[key]} {score(item.product[key])}</span>)}</div>
      <div className="tradeoff-box"><WarningCircle aria-hidden="true" size={16} /><span>主要取舍 · {tradeoff}</span></div>
      <div className="card-actions">
        <button className={selectedForCompare ? 'is-selected' : ''} type="button" onClick={onToggleCompare} aria-pressed={selectedForCompare}>
          {selectedForCompare ? '已加入对比' : '加入对比'}
        </button>
        <button type="button" onClick={onEvidence}>查看完整依据 <ArrowRight aria-hidden="true" size={14} /></button>
      </div>
    </article>
  );
}

export default function Home() {
  const [view, setView] = useState<View>('welcome');
  const [query, setQuery] = useState(defaultNeed);
  const [products, setProducts] = useState<Product[]>([]);
  const [ranker, setRanker] = useState<Ranker | null>(null);
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [response, setResponse] = useState<AgentResponse | null>(null);
  const [activeResult, setActiveResult] = useState(0);
  const [compareIds, setCompareIds] = useState<string[]>([]);
  const [processingStage, setProcessingStage] = useState(0);
  const [expandedEvidence, setExpandedEvidence] = useState<Record<EvidenceKey, boolean>>({ product: true, query: true, review: false });
  const [loading, setLoading] = useState(true);
  const [dataError, setDataError] = useState(false);
  const timersRef = useRef<number[]>([]);
  const loadRequestRef = useRef(0);

  const loadData = useCallback(() => {
    const requestId = ++loadRequestRef.current;
    Promise.all([
      fetchJson<Product[]>('/data/demo-products.json'),
      fetchJson<Ranker>('/data/ranker.json'),
      fetchJson<Metrics>('/data/metrics.json'),
    ]).then(([productData, rankerData, metricData]) => {
      if (requestId !== loadRequestRef.current) return;
      setProducts(productData); setRanker(rankerData); setMetrics(metricData); setLoading(false);
    }).catch(() => {
      if (requestId !== loadRequestRef.current) return;
      setDataError(true); setLoading(false);
    });
  }, []);

  useEffect(() => {
    loadData();
    return () => {
      loadRequestRef.current += 1;
      timersRef.current.forEach((timer) => window.clearTimeout(timer));
    };
  }, [loadData]);

  useEffect(() => {
    const focusTimer = window.setTimeout(() => {
      document.querySelector<HTMLElement>('[data-view-title]')?.focus({ preventScroll: true });
    }, 0);
    return () => window.clearTimeout(focusTimer);
  }, [view]);

  const recommendation = response?.kind === 'recommendation' ? response : null;
  const dataReady = !loading && !dataError && Boolean(ranker) && products.length > 0;
  const activeRecommendation = recommendation?.results[activeResult] ?? recommendation?.results[0];
  const modelNdcg = metrics?.model['ndcg@10'] ?? 0;
  const baselineNdcg = metrics?.popularity_baseline['ndcg@10'] ?? 0;
  const lift = baselineNdcg ? (modelNdcg - baselineNdcg) / baselineNdcg : 0;

  const previewRecommendation = useMemo(() => {
    if (!ranker || products.length === 0) return null;
    const preview = runAgent(defaultNeed, products, ranker);
    return preview.kind === 'recommendation' ? preview : null;
  }, [products, ranker]);
  const previewTop = previewRecommendation?.results[0];

  const intentChips = useMemo(() => {
    if (!response) return [];
    return [
      ['品类', response.intent.category],
      ['预算', response.intent.budget ? '≤ ¥' + response.intent.budget.toLocaleString('zh-CN') : '待补充'],
      ['场景', response.intent.useCase],
      ['优先', SPEC_LABELS[response.intent.primaryPreference]],
    ];
  }, [response]);

  const budgetChoices = useMemo(() => {
    const category = response?.intent.category;
    if (category === '智能手机') return [2000, 3000, 5000, 7000];
    if (category === '头戴耳机' || category === '键鼠套装') return [500, 1000, 2000, 3000];
    return [4000, 5000, 6000, 8000];
  }, [response]);

  const compareItems = useMemo(() => {
    if (!recommendation) return [];
    const chosen = recommendation.results.filter((item) => compareIds.includes(item.product.product_id));
    return chosen.length >= 2 ? chosen : recommendation.results;
  }, [compareIds, recommendation]);

  function clearTimers() {
    timersRef.current.forEach((timer) => window.clearTimeout(timer));
    timersRef.current = [];
  }

  function navigate(next: View) {
    if (view === 'processing' && next !== 'processing') clearTimers();
    if (next === 'results' && !recommendation) { setView('clarify'); return; }
    setView(next);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function startNew() {
    clearTimers(); setQuery(''); setResponse(null); setProcessingStage(0); setView('clarify');
  }

  function execute(nextQuery: string) {
    if (!ranker || !nextQuery.trim()) return;
    clearTimers();
    const next = runAgent(nextQuery.trim(), products, ranker);
    setResponse(next); setActiveResult(0);
    if (next.kind === 'clarification') { setView('clarify'); return; }
    setCompareIds([]);
    setProcessingStage(0); setView('processing');
    [650, 1320, 2050].forEach((delay, index) => timersRef.current.push(window.setTimeout(() => setProcessingStage(index + 1), delay)));
    timersRef.current.push(window.setTimeout(() => { setView('results'); window.scrollTo({ top: 0, behavior: 'smooth' }); }, 2800));
  }

  function submit(event?: FormEvent) { event?.preventDefault(); execute(query); }
  function retryData() { setLoading(true); setDataError(false); loadData(); }
  function editQuery(value: string) { setQuery(value); setResponse(null); }
  function addBudget(budget: number) {
    const next = query.replace(/[，。；;\s]+$/, '') + '，预算 ' + budget + ' 元';
    setQuery(next); execute(next);
  }
  function handleQueryKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') submit();
  }
  function toggleCompare(productId: string) {
    setCompareIds((current) => current.includes(productId) ? current.filter((id) => id !== productId) : [...current, productId].slice(0, 3));
  }
  function openEvidence(index: number) { setActiveResult(Math.max(0, index)); navigate('evidence'); }

  function comparisonData(key: string, item: Recommendation, index: number) {
    const budget = recommendation?.intent.budget ?? item.product.price;
    const feature = recommendation?.intent.primaryPreference ?? 'performance';
    if (key === 'scene') return {
      label: index === 0 ? recommendation?.intent.useCase + '更均衡' : index === 1 ? '另一种侧重点' : '性能侧重更明显',
      badge: index === 0 ? '更适合' : index === 2 ? '需取舍' : '参考',
      tone: index === 0 ? 'success' : index === 2 ? 'warning' : 'neutral',
    };
    if (key === 'budget') {
      const fits = item.product.price <= budget;
      return { label: '¥' + item.product.price.toLocaleString('zh-CN'), badge: fits ? '满足' : '超出', tone: fits ? 'success' : 'warning' };
    }
    if (key === 'primary') {
      const values = compareItems.map((entry) => entry.product[feature]);
      const isBest = item.product[feature] === Math.max(...values);
      return { label: SPEC_LABELS[feature] + '指数 ' + score(item.product[feature]), badge: isBest ? '更强' : '够用', tone: isBest ? 'success' : 'neutral' };
    }
    const combined = (item.product.portability + item.product.battery) / 2;
    const values = compareItems.map((entry) => (entry.product.portability + entry.product.battery) / 2);
    const isBest = combined === Math.max(...values);
    return {
      label: '便携 ' + score(item.product.portability) + ' / 续航 ' + score(item.product.battery),
      badge: isBest ? '更优' : index === 2 ? '需取舍' : '平衡',
      tone: isBest ? 'success' : index === 2 ? 'warning' : 'neutral',
    };
  }

  const main = (() => {
    if (view === 'welcome') return (
      <section className="welcome-view">
        <div className="hero-copy">
          <span className="demo-chip"><span />公开演示版 · 合成数据</span>
          <h1 data-view-title tabIndex={-1}>把复杂参数，变成<br />适合你的选择</h1>
          <p>告诉我预算、用途和不能妥协的条件。智选会把需求整理成可确认的约束，再给出 3 个有依据、也说明取舍的候选方案。</p>
          <div className="hero-actions">
            <Button onClick={startNew} disabled={!dataReady} icon={<ArrowRight aria-hidden="true" size={16} />}>开始导购</Button>
            <Button variant="secondary" onClick={() => execute(defaultNeed)} disabled={!dataReady}>查看示例方案</Button>
          </div>
          <button className="sample-prompt" type="button" onClick={() => execute(defaultNeed)} disabled={!dataReady}>
            <span>你可以这样说</span><strong>“{defaultNeed}”</strong>
          </button>
          <div className="demo-disclosure"><Info aria-hidden="true" size={16} />展示版不调用实时商品、库存或大模型服务</div>
          {dataError && <div className="inline-error"><span>演示数据暂时未载入。</span><button type="button" onClick={retryData}>重新载入</button></div>}
        </div>
        <div className="decision-preview">
          <div className="preview-heading"><h2>正在形成你的决策依据</h2><StatusChip tone={dataReady ? 'success' : 'warning'}>{dataReady ? '需求已确认' : '界面结构预览'}</StatusChip></div>
          <div className="preview-requirements"><span>笔记本电脑</span><span>≤ ¥5,000</span><span>内容创作</span><span>经常出差</span></div>
          <article className="preview-card">
            <div><span className="priority-label">优先候选 01</span><strong>{previewTop ? '需求匹配分 ' + score(previewTop.score) : '等待演示数据'}</strong></div>
            <h3>{previewTop?.product.name ?? '候选方案载入中'}</h3>
            <p>{previewTop?.product.description ?? '数据就绪后，这里会展示与预算、场景和优先条件对应的候选解释。'}</p>
            <div className="preview-tradeoff"><span>需要接受</span>{previewTop?.product.limitations ?? '同时说明候选的主要取舍'}</div>
          </article>
          <div className="preview-evidence"><span>关键结论均有可查看依据</span><small>3 类来源 · 合成示例</small></div>
        </div>
      </section>
    );

    if (view === 'clarify') return (
      <section className="workspace clarify-view">
        <div className="workspace-heading">
          <span>需求确认</span><h1 data-view-title tabIndex={-1}>先把需求说清楚，<br />再开始比较</h1>
          <p>系统会把自然语言整理成预算、品类、使用场景和优先条件。你可以在推荐前确认和修改。</p>
        </div>
        <div className="composer-panel">
          <div className="composer-heading">
            <div><span>STEP 01</span><h2>描述你的购买需求</h2></div>
            <StatusChip tone={response?.kind === 'clarification' ? 'warning' : 'accent'}>{response?.kind === 'clarification' ? '还差 1 项' : '等待确认'}</StatusChip>
          </div>
          <form onSubmit={submit}>
            <label htmlFor="shopping-need">你想买什么？</label>
            <textarea id="shopping-need" value={query} onChange={(event) => editQuery(event.target.value)} onKeyDown={handleQueryKeyDown} placeholder="例如：预算 6000 元，经常出差，希望轻薄、续航好……" autoFocus />
            <div className="sample-chips" aria-label="示例需求">
              {sampleNeeds.map((item) => <button key={item.label} type="button" onClick={() => editQuery(item.query)}>{item.label}</button>)}
            </div>
            {response?.kind === 'clarification' && (
              <div className="clarification-question">
                <WarningCircle aria-hidden="true" size={18} />
                <div><strong>{response.question}</strong><p>选择一个预算后会自动继续。</p></div>
                <div className="budget-options">{budgetChoices.map((budget) => <button key={budget} type="button" onClick={() => addBudget(budget)}>¥{budget.toLocaleString('zh-CN')}</button>)}</div>
              </div>
            )}
            {response && <div className="requirement-summary">{intentChips.map(([label, value]) => <div key={label}><span>{label}</span><strong>{value}</strong></div>)}</div>}
            {dataError && <div className="inline-error"><span>演示数据暂时未载入。</span><button type="button" onClick={retryData}>重新载入</button></div>}
            <div className="composer-footer"><small>Ctrl / Command + Enter 快速提交</small><Button type="submit" disabled={!dataReady || !query.trim()} icon={<ArrowRight aria-hidden="true" size={16} />}>确认需求并推荐</Button></div>
          </form>
        </div>
      </section>
    );

    if (view === 'processing') {
      const stages = [
        { label: '理解需求', detail: '抽取品类、预算、场景与偏好', Icon: ListChecks },
        { label: '检索候选', detail: '按约束从合成商品库召回', Icon: MagnifyingGlass },
        { label: '模型排序', detail: '构造特征并计算匹配得分', Icon: SlidersHorizontal },
        { label: '整理依据', detail: '生成理由、限制与证据来源', Icon: ShieldCheck },
      ];
      return (
        <section className="workspace processing-view">
          <div className="processing-intro"><span>正在处理</span><h1 data-view-title tabIndex={-1}>把你的需求变成<br />可以比较的方案</h1><p>公开演示使用本地合成数据和实际训练的排序参数，全程不发送个人数据。</p></div>
          <div className="pipeline-panel" aria-live="polite">
            <div className="pipeline-status"><div className="processing-spinner" /><div><span>AGENT WORKFLOW</span><h2>{stages[Math.min(processingStage, 3)].label}</h2></div><strong>{Math.min(processingStage + 1, 4)} / 4</strong></div>
            <div className="pipeline-steps">
              {stages.map(({ label, detail, Icon }, index) => {
                const state = index < processingStage ? 'complete' : index === processingStage ? 'active' : 'pending';
                return <article className={'pipeline-step is-' + state} key={label}><span>{state === 'complete' ? <Check aria-hidden="true" size={18} weight="bold" /> : <Icon aria-hidden="true" size={20} />}</span><div><strong>{label}</strong><p>{detail}</p></div><small>{state === 'complete' ? '完成' : state === 'active' ? '进行中' : '等待'}</small></article>;
              })}
            </div>
            <div className="pipeline-note"><Info aria-hidden="true" size={16} />排序分数用于候选解释，不代表真实购买概率。</div>
          </div>
        </section>
      );
    }

    if (view === 'results' && recommendation && recommendation.results.length === 0) return (
      <section className="workspace empty-state empty-results">
        <WarningCircle size={34} />
        <span>暂无满足候选</span>
        <h1 data-view-title tabIndex={-1}>当前预算下没有合适方案</h1>
        <p>{recommendation.summary}</p>
        <div><Button variant="secondary" onClick={() => navigate('clarify')}>调整需求</Button><Button onClick={startNew}>重新描述</Button></div>
      </section>
    );

    if (view === 'results' && recommendation) return (
      <section className="workspace results-view">
        <div className="results-header">
          <div><span>推荐结果 · 合成演示</span><h1 data-view-title tabIndex={-1}><span className="desktop-title">为你筛出 {recommendation.results.length} 个优先候选</span><span className="mobile-title">{recommendation.results.length} 个优先候选</span></h1><p>先满足硬约束，再比较场景适配；每个候选都说明适合理由与主要取舍。</p></div>
          <div><StatusChip>需求匹配完成</StatusChip><small>候选集 {recommendation.retrievedCount} · 生成 Top {recommendation.results.length}</small></div>
        </div>
        <div className="recommendation-grid">
          {recommendation.results.map((item, index) => <RecommendationCard key={item.product.product_id} item={item} index={index} intent={recommendation.intent} selectedForCompare={compareIds.includes(item.product.product_id)} mobileActive={index === activeResult} onToggleCompare={() => toggleCompare(item.product.product_id)} onEvidence={() => openEvidence(index)} />)}
        </div>
        <div className="mobile-carousel-footer">
          <div className="carousel-progress"><span>{activeResult + 1} / {recommendation.results.length}</span>{recommendation.results.map((item, index) => <button key={item.product.product_id} type="button" className={index === activeResult ? 'is-active' : ''} onClick={() => setActiveResult(index)} aria-label={'查看候选 ' + (index + 1)}><i /></button>)}</div>
          <Button className="mobile-compare-button" onClick={() => navigate('compare')} disabled={compareIds.length < 2}>{compareIds.length < 2 ? '再选 ' + (2 - compareIds.length) + ' 项' : '对比 ' + compareIds.length + ' 项'}</Button>
        </div>
        <div className="results-footer">
          <p><Info aria-hidden="true" size={16} />“需求匹配分”用于候选排序解释，不代表真实购买概率。</p>
          <div><Button variant="ghost" onClick={() => navigate('clarify')} icon={<ArrowCounterClockwise aria-hidden="true" size={15} />}>调整需求</Button><Button onClick={() => navigate('compare')} disabled={compareIds.length < 2} icon={<ArrowsLeftRight aria-hidden="true" size={16} />}>对比已选 {compareIds.length} 个</Button></div>
        </div>
      </section>
    );

    if (view === 'compare' && recommendation) {
      const rows = [
        { key: 'scene', label: '场景适配' }, { key: 'budget', label: '预算约束' },
        { key: 'primary', label: SPEC_LABELS[recommendation.intent.primaryPreference] + '能力' }, { key: 'portable', label: '便携与续航' },
      ];
      return (
        <section className="workspace compare-view">
          <div className="comparison-header">
            <div><span>方案对比 · {compareItems.length} 个候选</span><h1 data-view-title tabIndex={-1}>不要只比参数，先看与你有关的差异</h1><p>按已确认场景排序：{recommendation.intent.useCase}优先，其次是预算、{SPEC_LABELS[recommendation.intent.primaryPreference]}与续航。</p></div>
            <div><Button variant="ghost" onClick={() => navigate('results')}>返回推荐</Button><StatusChip>已选 {compareItems.length} 个</StatusChip></div>
          </div>
          <div className="comparison-scroll">
            <div className="comparison-table" style={{ '--compare-count': compareItems.length } as CSSProperties}>
              <div className="comparison-axis comparison-axis-header">与你有关的维度</div>
              {compareItems.map((item, index) => <div className={'comparison-product ' + (index === 0 ? 'is-priority' : '')} key={item.product.product_id}><div><strong>{item.product.name}</strong><span>{index === 0 ? '优先候选' : '候选 ' + (index + 1)}</span></div><p>¥{item.product.price.toLocaleString('zh-CN')} · 合成</p></div>)}
              {rows.flatMap((row) => [
                <div className="comparison-axis" key={row.key + '-axis'}>{row.label}</div>,
                ...compareItems.map((item, index) => {
                  const data = comparisonData(row.key, item, index);
                  return <div className={'comparison-cell comparison-cell-' + data.tone} key={row.key + '-' + item.product.product_id}><div><span>{row.label}</span><small>{data.badge}</small></div><strong>{data.label}</strong></div>;
                }),
              ])}
            </div>
          </div>
          <div className="mobile-comparison" aria-label="移动端方案对比" style={{ '--compare-count': compareItems.length } as CSSProperties}>
            <div className="mobile-comparison-products">
              {compareItems.map((item, index) => <article className={index === 0 ? 'is-priority' : ''} key={item.product.product_id}><span>{String.fromCharCode(65 + index)}{index === 0 ? ' · 首选' : ''}</span><strong>{item.product.name}</strong><small>¥{item.product.price.toLocaleString('zh-CN')}</small></article>)}
            </div>
            <div className="mobile-comparison-rows">
              {rows.map((row) => <article className="mobile-comparison-row" key={row.key}>
                <h2>{row.label}</h2>
                <div>
                  {compareItems.map((item, index) => {
                    const data = comparisonData(row.key, item, index);
                    return <section className={'comparison-cell-' + data.tone} key={item.product.product_id}><span>{String.fromCharCode(65 + index)}</span><strong>{data.label}</strong><small>{data.badge}</small></section>;
                  })}
                </div>
              </article>)}
            </div>
          </div>
          <div className="comparison-footer"><p>当前更建议 {compareItems[0]?.product.name}：它的综合排序最符合“{recommendation.intent.useCase} + {SPEC_LABELS[recommendation.intent.primaryPreference]}优先”。</p><div className="comparison-footer-actions"><Button variant="secondary" onClick={() => navigate('results')}>返回推荐</Button><Button onClick={() => openEvidence(recommendation.results.findIndex((item) => item.product.product_id === compareItems[0]?.product.product_id))} icon={<ArrowRight size={16} />}>查看完整依据</Button></div></div>
        </section>
      );
    }

    if (view === 'evidence' && recommendation && activeRecommendation) {
      const item = activeRecommendation;
      const sources: Array<{ key: EvidenceKey; label: string; source: string; status: string; summary: string; meta: string; limited?: boolean }> = [
        { key: 'product', label: '商品字段', source: '结构化商品参数 · ' + item.product.product_id, status: '可用', summary: '价格 ¥' + item.product.price.toLocaleString('zh-CN') + '；评分 ' + item.product.rating.toFixed(1) + '；' + SPEC_LABELS[recommendation.intent.primaryPreference] + '指数 ' + score(item.product[recommendation.intent.primaryPreference]) + '。', meta: '更新：固定合成数据 · 覆盖：价格 / 评分 / 能力字段' },
        { key: 'query', label: '需求映射', source: '结构化需求摘要 · QUERY DEMO', status: '可用', summary: '预算 ≤ ¥' + (recommendation.intent.budget?.toLocaleString('zh-CN') ?? '待补充') + '；' + recommendation.intent.useCase + '；' + SPEC_LABELS[recommendation.intent.primaryPreference] + '优先。', meta: '更新：当前会话 · 覆盖：预算 / 场景 / 关键偏好' },
        { key: 'review', label: '评论摘要', source: '合成评论集合 · REVIEW SET', status: '依据有限', summary: '评分来自 ' + item.product.review_count.toLocaleString('zh-CN') + ' 条合成评价；不代表真实用户口碑。', meta: '更新：固定合成数据 · 仅用于展示证据不足状态', limited: true },
      ];
      return (
        <section className="workspace evidence-view">
          <div className="evidence-header"><div><span>推荐详情 · 优先候选</span><h1 data-view-title tabIndex={-1}>先给结论，再把依据摊开</h1><p>依据说明“为什么推荐”，取舍说明“为什么它不是完美答案”。</p></div><div><Button variant="ghost" onClick={() => navigate('results')}>返回结果</Button><StatusChip>3 类来源</StatusChip></div></div>
          <div className="evidence-layout">
            <article className="evidence-product-card">
              <div><span className="priority-label">优先候选 {String(activeResult + 1).padStart(2, '0')}</span><strong>需求匹配分 {score(item.score)}</strong></div>
              <div className="synthetic-product-visual"><SquaresFour size={18} /><span>SYNTHETIC SKU · {item.product.product_id}</span></div>
              <h2>{item.product.name}</h2><h3>¥{item.product.price.toLocaleString('zh-CN')} · 合成示例</h3>
              <div className="evidence-conclusion"><span>结论</span><p>{recommendation.summary}</p></div>
              <h4>为什么适合你</h4><ul>{item.reasons.map((reason) => <li key={reason}><Check size={14} weight="bold" />{reason}</li>)}</ul>
              <div className="preview-tradeoff"><span>主要取舍</span>{item.product.limitations}</div>
            </article>
            <article className="evidence-panel">
              <div className="evidence-panel-title"><div><h2>推荐依据</h2><p>来源、摘要、更新时间与覆盖度</p></div><StatusChip>缺失依据会抑制结论</StatusChip></div>
              <div className="evidence-rows">
                {sources.map((source) => {
                  const expanded = expandedEvidence[source.key];
                  return <div className={'evidence-row ' + (source.limited ? 'is-limited' : '')} key={source.key}>
                    <button type="button" onClick={() => setExpandedEvidence((current) => ({ ...current, [source.key]: !current[source.key] }))} aria-expanded={expanded}>
                      <span>{source.label}</span><strong>{source.source}</strong><small>{source.status} · {expanded ? '收起' : '展开'}</small><CaretDown className={expanded ? 'is-expanded' : ''} size={17} />
                    </button>
                    {expanded && <div className="evidence-row-detail"><p>{source.summary}</p><small>{source.meta}</small></div>}
                  </div>;
                })}
              </div>
              <div className="evidence-disclosure"><Info size={17} />所有商品、价格、评论和来源均为合成演示，不代表实时市场信息。</div>
            </article>
          </div>
        </section>
      );
    }

    if (view === 'project') return (
      <section className="workspace project-view">
        <div className="project-hero">
          <div>
            <span>项目说明 · 可复现 AI 产品作品集</span><h1 data-view-title tabIndex={-1}>从需求理解，到有依据的推荐决策</h1>
            <p>智选是一个面向中文 3C 电商场景的公开演示：使用完整合成数据库、规则式意图理解、候选召回和实际训练的排序模型，展示 Agent 产品从交互到实验验证的闭环。</p>
            <div className="project-actions"><Button onClick={() => navigate('welcome')} icon={<ArrowRight size={16} />}>体验智能导购</Button><a className="ui-button ui-button-secondary" href={githubBase} target="_blank" rel="noreferrer"><span>查看 GitHub</span><GithubLogo size={17} /></a><a className="ui-button ui-button-ghost" href={figmaUrl} target="_blank" rel="noreferrer"><span>查看 Figma</span></a></div>
          </div>
          <div className="project-boundary"><ShieldCheck size={28} /><span>公开演示边界</span><p>不使用真实用户数据，不调用实时商品服务，不把离线指标表述为线上商业效果。</p></div>
        </div>
        <div className="project-metrics">
          <MetricCard label="PRECISION@5" value={formatPercent(metrics?.model['precision@5'], 1)} detail="前 5 个结果中的相关商品比例" tone="accent" />
          <MetricCard label="RECALL@10" value={formatPercent(metrics?.model['recall@10'], 1)} detail="前 10 个结果覆盖相关商品的比例" />
          <MetricCard label="NDCG@10" value={formatPercent(metrics?.model['ndcg@10'], 1)} detail={'较热门度基线提升 ' + formatPercent(lift, 1)} tone="success" />
          <MetricCard label="MRR" value={formatPercent(metrics?.model.mrr, 1)} detail="首个相关结果出现位置的质量" />
        </div>
        <div className="project-section">
          <div className="section-title"><span>产品与模型流程</span><h2>每一步都能解释，也能验证</h2></div>
          <div className="flow-grid">
            {[
              ['01', '理解需求', '抽取预算、品类、场景与偏好，信息不足时主动澄清。', ListChecks],
              ['02', '检索商品', '从合成商品知识库按结构化约束与关键词召回候选。', MagnifyingGlass],
              ['03', '排序候选', '使用实际训练的 Pointwise Ranker 计算匹配分数。', SlidersHorizontal],
              ['04', '约束生成', '只基于召回证据生成理由、限制和取舍说明。', ShieldCheck],
            ].map(([step, title, detail, Icon]) => {
              const FlowIcon = Icon as typeof ListChecks;
              return <article key={String(step)}><div><span>{step as string}</span><FlowIcon size={21} /></div><h3>{title as string}</h3><p>{detail as string}</p></article>;
            })}
          </div>
        </div>
        <div className="project-section project-data">
          <div className="section-title"><span>合成数据库</span><h2>可训练、可复现、可审计</h2></div>
          <div className="data-summary">{[['720', '商品'], ['2,500', '用户'], ['8,000', '查询'], ['96,000', '交互'], ['5,000', '评论']].map(([value, label]) => <div key={label}><strong>{value}</strong><span>合成{label}</span></div>)}</div>
        </div>
        <div className="project-section">
          <div className="section-title"><span>公开项目文档</span><h2>从产品定义到实验复现</h2></div>
          <div className="doc-grid">{projectDocs.map((doc) => {
            const Icon = doc.icon;
            return <a key={doc.title} href={githubBase + '/blob/main/docs/' + encodeURIComponent(doc.file)} target="_blank" rel="noreferrer"><Icon size={22} /><div><h3>{doc.title}</h3><p>{doc.detail}</p></div><ArrowRight size={16} /></a>;
          })}</div>
        </div>
        <div className="project-note"><Code size={19} /><p>当前公开版采用确定性中文模板生成，确保无需密钥即可运行；仓库同时提供数据生成、模型训练、测试与构建脚本。</p></div>
      </section>
    );

    return <section className="workspace empty-state"><Scales size={34} /><h1 data-view-title tabIndex={-1}>还没有可查看的方案</h1><p>先描述你的购买需求，智选会生成三个可比较的候选。</p><Button onClick={startNew}>开始导购</Button></section>;
  })();

  return (
    <main className={'app-shell view-' + view}>
      <Header view={view} onNavigate={navigate} />
      {main}
      <footer className="site-footer"><div><Logo /><span>公开展示版 · 全部商品与行为均为合成数据</span></div><a href={githubBase} target="_blank" rel="noreferrer"><GithubLogo size={17} />GitHub 项目</a></footer>
      <MobileNav view={view} onNavigate={navigate} />
    </main>
  );
}
