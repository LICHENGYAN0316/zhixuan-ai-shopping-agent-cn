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
import { SPEC_LABELS, runAgent, runAgentFromIntent, understandIntent } from '../lib/agent';
import type { AgentResponse, Intent, Product, Recommendation } from '../lib/agent';

type Metrics = {
  dataset: Record<string, number>;
};

type View = 'welcome' | 'clarify' | 'processing' | 'results' | 'compare' | 'evidence' | 'project';
type EvidenceKey = 'product' | 'query' | 'review';
type Tone = 'neutral' | 'success' | 'warning' | 'accent';

const defaultNeed = '200 元内，敏感肌想要舒缓保湿，避开香精';

const sampleNeeds = [
  { label: '敏感肌舒缓', query: defaultNeed },
  { label: '油皮控油定妆', query: '80 元内，油皮需要控油定妆散粉，避开香精和滑石粉' },
  { label: '干皮保湿修护', query: '200 元内，干皮需要保湿修护乳液，不要香精' },
];

const projectDocs = [
  { title: '产品需求文档', detail: '用户问题、目标、功能范围与产品边界', file: '产品需求文档_PRD.md', icon: FileText },
  { title: '系统架构与 RAG', detail: '豆包需求解析、本地检索与证据约束链路', file: '系统架构与RAG流程.md', icon: Stack },
  { title: '数据质量与指标', detail: '清洗规则、缺失值与核实属性覆盖率', file: '实验与指标设计.md', icon: ChartLineUp },
  { title: '日化数据字典', detail: '历史商品快照、样本价与官方证据字段', file: '数据字典.md', icon: Database },
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
      <small>日化智能选品</small>
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
      <span className="mobile-demo-label">在线服务</span>
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
  const specKeys = [feature, 'sensitivity', 'ingredientTransparency', 'popularity'].filter((key, position, values) => values.indexOf(key) === position).slice(0, 3) as Array<keyof typeof SPEC_LABELS>;
  const evidenceComplete = item.product.evidence_level === 'official_current_reference';
  const tradeoff = item.product.limitations.replace(/[。.]$/, '');
  return (
    <article className={'recommendation-card ' + (index === 0 ? 'is-priority ' : '') + (mobileActive ? 'is-mobile-active' : '')}>
      <div className="card-topline">
        <span className={index === 0 ? 'rank-badge rank-badge-accent' : 'rank-badge'}>{index === 0 ? 'TOP 1' : '候选 ' + (index + 1)}</span>
        <span className={'evidence-badge ' + (evidenceComplete ? 'is-complete' : 'is-limited')}>{evidenceComplete ? '2 条完整依据' : '1 条依据待补'}</span>
      </div>
      <div className="synthetic-product-visual"><SquaresFour aria-hidden="true" size={18} /><span>HISTORICAL ITEM · {item.product.product_id}</span></div>
      <div className="card-title"><p>{item.product.name}</p><strong>¥{item.product.price.toLocaleString('zh-CN')} · 样本价</strong></div>
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
  const executionRequestRef = useRef(0);

  const loadData = useCallback(() => {
    const requestId = ++loadRequestRef.current;
    Promise.all([
      fetchJson<Product[]>('/data/daily-products.json'),
      fetchJson<Metrics>('/data/metrics.json'),
    ]).then(([productData, metricData]) => {
      if (requestId !== loadRequestRef.current) return;
      setProducts(productData); setMetrics(metricData); setLoading(false);
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
  const dataReady = !loading && !dataError && products.length > 0;
  const activeRecommendation = recommendation?.results[activeResult] ?? recommendation?.results[0];

  const previewRecommendation = useMemo(() => {
    if (products.length === 0) return null;
    const preview = runAgent(defaultNeed, products);
    return preview.kind === 'recommendation' ? preview : null;
  }, [products]);
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
    if (category === '底妆' || category === '唇部彩妆' || category === '眼部彩妆') return [50, 100, 200, 300];
    if (category === '香氛' || category === '套装') return [200, 500, 1000, 2000];
    return [100, 200, 300, 500];
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
    if (view === 'processing' && next !== 'processing') { clearTimers(); executionRequestRef.current += 1; }
    if (next === 'results' && !recommendation) { setView('clarify'); return; }
    setView(next);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function startNew() {
    executionRequestRef.current += 1; clearTimers(); setQuery(''); setResponse(null); setProcessingStage(0); setView('clarify');
  }

  async function execute(nextQuery: string) {
    if (!products.length || !nextQuery.trim()) return;
    const requestId = ++executionRequestRef.current;
    const trimmed = nextQuery.trim();
    clearTimers();
    const localIntent = understandIntent(trimmed);
    const localResponse = runAgentFromIntent(localIntent, products);
    setResponse(localResponse); setActiveResult(0);
    if (localResponse.kind === 'clarification') { setView('clarify'); return; }
    setCompareIds([]);
    setProcessingStage(0); setView('processing');
    [650, 1320, 2050].forEach((delay, index) => timersRef.current.push(window.setTimeout(() => setProcessingStage(index + 1), delay)));
    const minimumAnimation = new Promise<void>((resolve) => window.setTimeout(resolve, 2800));
    let next: AgentResponse = localResponse;
    try {
      const apiResponse = await fetch('/api/intent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: trimmed }),
      });
      if (apiResponse.ok) {
        const data = await apiResponse.json() as { intent?: Intent };
        if (data.intent) next = runAgentFromIntent(data.intent, products);
      }
    } catch {
      next = localResponse;
    }
    await minimumAnimation;
    if (requestId !== executionRequestRef.current) return;
    setResponse(next);
    setView(next.kind === 'clarification' ? 'clarify' : 'results');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function submit(event?: FormEvent) { event?.preventDefault(); void execute(query); }
  function retryData() { setLoading(true); setDataError(false); loadData(); }
  function editQuery(value: string) { setQuery(value); setResponse(null); }
  function addBudget(budget: number) {
    const next = query.replace(/[，。；;\s]+$/, '') + '，预算 ' + budget + ' 元';
    setQuery(next); void execute(next);
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
    const feature = recommendation?.intent.primaryPreference ?? 'efficacy';
    if (key === 'scene') return {
      label: index === 0 ? recommendation?.intent.useCase + '更均衡' : index === 1 ? '另一种侧重点' : '证据覆盖有取舍',
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
    const combined = (item.product.ingredientTransparency + item.product.sensitivity) / 2;
    const values = compareItems.map((entry) => (entry.product.ingredientTransparency + entry.product.sensitivity) / 2);
    const isBest = combined === Math.max(...values);
    return {
      label: '成分透明 ' + score(item.product.ingredientTransparency) + ' / 敏感适配 ' + score(item.product.sensitivity),
      badge: isBest ? '更优' : index === 2 ? '需取舍' : '平衡',
      tone: isBest ? 'success' : index === 2 ? 'warning' : 'neutral',
    };
  }

  const main = (() => {
    if (view === 'welcome') return (
      <section className="welcome-view">
        <div className="hero-copy">
          <span className="demo-chip"><span />在线体验 · 日化用品智能推荐</span>
          <h1 data-view-title tabIndex={-1}>把复杂参数，变成<br />适合你的选择</h1>
          <p>告诉我预算、肤质、想要的功效和需要避开的成分。智选会整理约束，再给出有依据、也说明证据边界的候选方案。</p>
          <div className="hero-actions">
            <Button onClick={startNew} disabled={!dataReady} icon={<ArrowRight aria-hidden="true" size={16} />}>开始导购</Button>
            <Button variant="secondary" onClick={() => { void execute(defaultNeed); }} disabled={!dataReady}>查看示例方案</Button>
          </div>
          <button className="sample-prompt" type="button" onClick={() => { void execute(defaultNeed); }} disabled={!dataReady}>
            <span>你可以这样说</span><strong>“{defaultNeed}”</strong>
          </button>
          <div className="demo-disclosure"><Info aria-hidden="true" size={16} />豆包只解析当前需求；商品检索与证据约束在本地完成</div>
          {dataError && <div className="inline-error"><span>商品数据暂时未载入。</span><button type="button" onClick={retryData}>重新载入</button></div>}
        </div>
        <div className="decision-preview">
          <div className="preview-heading"><h2>正在形成你的决策依据</h2><StatusChip tone={dataReady ? 'success' : 'warning'}>{dataReady ? '需求已确认' : '界面结构预览'}</StatusChip></div>
          <div className="preview-requirements"><span>面部护理</span><span>≤ ¥200</span><span>敏感肌</span><span>避开香精</span></div>
          <article className="preview-card">
            <div><span className="priority-label">优先候选 01</span><strong>{previewTop ? '需求匹配分 ' + score(previewTop.score) : '等待商品数据'}</strong></div>
            <h3>{previewTop?.product.name ?? '候选方案载入中'}</h3>
            <p>{previewTop?.product.description ?? '数据就绪后，这里会展示与预算、场景和优先条件对应的候选解释。'}</p>
            <div className="preview-tradeoff"><span>需要接受</span>{previewTop?.product.limitations ?? '同时说明候选的主要取舍'}</div>
          </article>
          <div className="preview-evidence"><span>关键结论均有可查看依据</span><small>3 类来源 · 核实属性</small></div>
        </div>
      </section>
    );

    if (view === 'clarify') return (
      <section className="workspace clarify-view">
        <div className="workspace-heading">
          <span>需求确认</span><h1 data-view-title tabIndex={-1}>先把需求说清楚，<br />再开始比较</h1>
          <p>系统会把自然语言整理成预算、日化品类、肤质、功效与成分约束。你可以在推荐前确认和修改。</p>
        </div>
        <div className="composer-panel">
          <div className="composer-heading">
            <div><span>STEP 01</span><h2>描述你的购买需求</h2></div>
            <StatusChip tone={response?.kind === 'clarification' ? 'warning' : 'accent'}>{response?.kind === 'clarification' ? '还差 1 项' : '等待确认'}</StatusChip>
          </div>
          <form onSubmit={submit}>
            <label htmlFor="shopping-need">你想买什么？</label>
            <textarea id="shopping-need" value={query} onChange={(event) => editQuery(event.target.value)} onKeyDown={handleQueryKeyDown} placeholder="例如：预算 200 元，敏感肌想保湿修护，避开香精……" autoFocus />
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
            {dataError && <div className="inline-error"><span>商品数据暂时未载入。</span><button type="button" onClick={retryData}>重新载入</button></div>}
            <div className="composer-footer"><small>Ctrl / Command + Enter 快速提交</small><Button type="submit" disabled={!dataReady || !query.trim()} icon={<ArrowRight aria-hidden="true" size={16} />}>确认需求并推荐</Button></div>
          </form>
        </div>
      </section>
    );

    if (view === 'processing') {
      const stages = [
        { label: '理解需求', detail: '抽取品类、预算、场景与偏好', Icon: ListChecks },
        { label: '检索候选', detail: '按约束从离线日化历史数据召回', Icon: MagnifyingGlass },
        { label: '证据排序', detail: '敏感肌、成分与功效启用核实证据门槛', Icon: SlidersHorizontal },
        { label: '整理依据', detail: '生成理由、限制与证据来源', Icon: ShieldCheck },
      ];
      return (
        <section className="workspace processing-view">
          <div className="processing-intro"><span>正在处理</span><h1 data-view-title tabIndex={-1}>把你的需求变成<br />可以比较的方案</h1><p>豆包仅接收当前需求文本；商品数据、本地检索和证据校验不上传。</p></div>
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
          <div><span>推荐结果 · 日化历史数据</span><h1 data-view-title tabIndex={-1}><span className="desktop-title">为你筛出 {recommendation.results.length} 个优先候选</span><span className="mobile-title">{recommendation.results.length} 个优先候选</span></h1><p>先满足预算和成分硬约束，再比较核实证据、历史信号与主要取舍。</p></div>
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
        { key: 'primary', label: SPEC_LABELS[recommendation.intent.primaryPreference] + '覆盖' }, { key: 'evidence', label: '成分与敏感适配' },
      ];
      return (
        <section className="workspace compare-view">
          <div className="comparison-header">
            <div><span>方案对比 · {compareItems.length} 个候选</span><h1 data-view-title tabIndex={-1}>不要只比参数，先看与你有关的差异</h1><p>按已确认需求排序：{recommendation.intent.useCase}优先，其次是预算、{SPEC_LABELS[recommendation.intent.primaryPreference]}与成分证据。</p></div>
            <div><Button variant="ghost" onClick={() => navigate('results')}>返回推荐</Button><StatusChip>已选 {compareItems.length} 个</StatusChip></div>
          </div>
          <div className="comparison-scroll">
            <div className="comparison-table" style={{ '--compare-count': compareItems.length } as CSSProperties}>
              <div className="comparison-axis comparison-axis-header">与你有关的维度</div>
              {compareItems.map((item, index) => <div className={'comparison-product ' + (index === 0 ? 'is-priority' : '')} key={item.product.product_id}><div><strong>{item.product.name}</strong><span>{index === 0 ? '优先候选' : '候选 ' + (index + 1)}</span></div><p>¥{item.product.price.toLocaleString('zh-CN')} · 样本价</p></div>)}
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
          <div className="comparison-footer"><p>当前更建议 {compareItems[0]?.product.name}：它的综合排序最符合“{recommendation.intent.useCase} + {SPEC_LABELS[recommendation.intent.primaryPreference]}优先”的当前证据约束。</p><div className="comparison-footer-actions"><Button variant="secondary" onClick={() => navigate('results')}>返回推荐</Button><Button onClick={() => openEvidence(recommendation.results.findIndex((item) => item.product.product_id === compareItems[0]?.product.product_id))} icon={<ArrowRight size={16} />}>查看完整依据</Button></div></div>
        </section>
      );
    }

    if (view === 'evidence' && recommendation && activeRecommendation) {
      const item = activeRecommendation;
      const verified = item.product.evidence_level === 'official_current_reference';
      const ingredientSummary = item.product.ingredients.length
        ? item.product.ingredients.slice(0, 5).join('、') + (item.product.ingredients.length > 5 ? '等' : '')
        : '暂无经核实的成分表';
      const sources: Array<{ key: EvidenceKey; label: string; source: string; status: string; summary: string; meta: string; limited?: boolean }> = [
        { key: 'product', label: '历史商品字段', source: '结构化商品记录 · ' + item.product.product_id, status: '可用', summary: '样本价 ¥' + item.product.price.toLocaleString('zh-CN') + '；历史热度 ' + (item.product.sales_count?.toLocaleString('zh-CN') ?? '缺失') + '；' + SPEC_LABELS[recommendation.intent.primaryPreference] + '指数 ' + score(item.product[recommendation.intent.primaryPreference]) + '。', meta: '来源：离线日化历史商品快照 · 不含实时库存与行情' },
        { key: 'query', label: '需求映射', source: '结构化需求摘要 · ' + (recommendation.intent.provider === 'doubao' ? 'DOUBAO' : 'LOCAL FALLBACK'), status: '可用', summary: '预算 ≤ ¥' + (recommendation.intent.budget?.toLocaleString('zh-CN') ?? '待补充') + '；' + recommendation.intent.useCase + '；' + SPEC_LABELS[recommendation.intent.primaryPreference] + '优先。', meta: '更新：当前会话 · 豆包只解析需求，本地完成商品检索' },
        { key: 'review', label: '成分与功效证据', source: verified ? '品牌官方产品页 · CURRENT REFERENCE' : '历史标题 · UNVERIFIED', status: verified ? '当前参考已核实' : '依据有限', summary: verified ? '成分参考：' + ingredientSummary + '。功效仅按品牌官方声明呈现。' : '历史标题中的功效与成分词未经核实，不作为敏感肌或成分避雷结论。', meta: verified ? '核实：' + (item.product.formula_checked_at ?? '未标注') + ' · 当前跨市场官方参考，不反推历史配方' : '仅可用于普通检索，不进入高风险推荐', limited: !verified },
      ];
      return (
        <section className="workspace evidence-view">
          <div className="evidence-header"><div><span>推荐详情 · 优先候选</span><h1 data-view-title tabIndex={-1}>先给结论，再把依据摊开</h1><p>依据说明“为什么推荐”，取舍说明“为什么它不是完美答案”。</p></div><div><Button variant="ghost" onClick={() => navigate('results')}>返回结果</Button><StatusChip>3 类来源</StatusChip></div></div>
          <div className="evidence-layout">
            <article className="evidence-product-card">
              <div><span className="priority-label">优先候选 {String(activeResult + 1).padStart(2, '0')}</span><strong>需求匹配分 {score(item.score)}</strong></div>
              <div className="synthetic-product-visual"><SquaresFour size={18} /><span>HISTORICAL ITEM · {item.product.product_id}</span></div>
              <h2>{item.product.name}</h2><h3>¥{item.product.price.toLocaleString('zh-CN')} · 样本价</h3>
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
              <div className="evidence-disclosure"><Info size={17} />商品与样本价来自离线日化历史数据；敏感肌、成分与功效仅使用已核实的当前官方参考。</div>
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
            <p>智选是一个面向中文日化选品的在线 Agent：豆包在服务端解析用户需求，本地从清洗后的历史商品快照中检索，并以官方核实属性约束敏感肌、成分避雷与功效推荐。</p>
            <div className="project-actions"><Button onClick={() => navigate('welcome')} icon={<ArrowRight size={16} />}>体验智能导购</Button><a className="ui-button ui-button-secondary" href={githubBase} target="_blank" rel="noreferrer"><span>查看 GitHub</span><GithubLogo size={17} /></a><a className="ui-button ui-button-ghost" href={figmaUrl} target="_blank" rel="noreferrer"><span>查看 Figma</span></a></div>
          </div>
          <div className="project-boundary"><ShieldCheck size={28} /><span>服务边界</span><p>不公开客户或订单明细，不调用实时商品服务，不用历史标题推断敏感肌安全性、完整成分或产品功效。</p></div>
        </div>
        <div className="project-metrics">
          <MetricCard label="UNIQUE PRODUCTS" value={metrics?.dataset.products?.toLocaleString('zh-CN') ?? '—'} detail="去重后的历史商品记录" tone="accent" />
          <MetricCard label="PRICE FIELD" value={formatPercent(metrics?.dataset.price_completeness, 1)} detail="样本价字段完整率" />
          <MetricCard label="HISTORICAL SIGNAL" value={formatPercent(metrics?.dataset.historical_signal_coverage, 1)} detail="历史销量或评论信号覆盖率" tone="success" />
          <MetricCard label="VERIFIED ATTRIBUTES" value={metrics?.dataset.verified_products?.toLocaleString('zh-CN') ?? '—'} detail="已人工核实的当前官方参考" />
        </div>
        <div className="project-section">
          <div className="section-title"><span>产品与模型流程</span><h2>每一步都能解释，也能验证</h2></div>
          <div className="flow-grid">
            {[
              ['01', '理解需求', '豆包抽取预算、品类、肤质、功效与成分约束；失败时回退本地规则。', ListChecks],
              ['02', '检索商品', '从清洗后的离线日化历史商品快照按结构化约束召回候选。', MagnifyingGlass],
              ['03', '证据排序', '预算、历史信号与官方核实属性共同构成可解释得分。', SlidersHorizontal],
              ['04', '约束生成', '只基于检索证据生成理由、限制和取舍，不让模型编造商品事实。', ShieldCheck],
            ].map(([step, title, detail, Icon]) => {
              const FlowIcon = Icon as typeof ListChecks;
              return <article key={String(step)}><div><span>{step as string}</span><FlowIcon size={21} /></div><h3>{title as string}</h3><p>{detail as string}</p></article>;
            })}
          </div>
        </div>
        <div className="project-section project-data">
          <div className="section-title"><span>日化历史数据</span><h2>可复现、可审计、证据分层</h2></div>
          <div className="data-summary">{[
            [metrics?.dataset.products?.toLocaleString('zh-CN') ?? '—', '去重商品'],
            [metrics?.dataset.shops?.toLocaleString('zh-CN') ?? '—', '店铺字段'],
            [metrics?.dataset.verified_products?.toLocaleString('zh-CN') ?? '—', '核实属性'],
            [metrics?.dataset.sensitive_skin_eligible?.toLocaleString('zh-CN') ?? '—', '敏感肌可推荐'],
            [metrics?.dataset.ingredient_avoidance_eligible?.toLocaleString('zh-CN') ?? '—', '成分避雷可用'],
          ].map(([value, label]) => <div key={label}><strong>{value}</strong><span>{label}</span></div>)}</div>
        </div>
        <div className="project-section">
          <div className="section-title"><span>公开项目文档</span><h2>从产品定义到实验复现</h2></div>
          <div className="doc-grid">{projectDocs.map((doc) => {
            const Icon = doc.icon;
            return <a key={doc.title} href={githubBase + '/blob/main/docs/' + encodeURIComponent(doc.file)} target="_blank" rel="noreferrer"><Icon size={22} /><div><h3>{doc.title}</h3><p>{doc.detail}</p></div><ArrowRight size={16} /></a>;
          })}</div>
        </div>
        <div className="project-note"><Code size={19} /><p>豆包 Key 仅通过服务端环境变量注入；无 Key、超时或返回无效时使用确定性本地解析，商品库不会发送给大模型。</p></div>
      </section>
    );

    return <section className="workspace empty-state"><Scales size={34} /><h1 data-view-title tabIndex={-1}>还没有可查看的方案</h1><p>先描述你的购买需求，智选会生成三个可比较的候选。</p><Button onClick={startNew}>开始导购</Button></section>;
  })();

  return (
    <main className={'app-shell view-' + view}>
      <Header view={view} onNavigate={navigate} />
      {main}
      <footer className="site-footer"><div><Logo /><span>日化用品在线 Agent · 历史数据与核实属性</span></div><a href={githubBase} target="_blank" rel="noreferrer"><GithubLogo size={17} />GitHub 项目</a></footer>
      <MobileNav view={view} onNavigate={navigate} />
    </main>
  );
}
