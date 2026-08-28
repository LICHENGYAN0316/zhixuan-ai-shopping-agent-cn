# 智选 Agent：3C / 数码电商智能导购

## [立即体验在线演示 →](https://zhixuan-agent-cn.plupluto.chatgpt.site)

无需登录，打开即可体验中文需求理解、主动澄清、候选排序和推荐解释。

[![打开智选 Agent 在线演示](public/social-card.png)](https://zhixuan-agent-cn.plupluto.chatgpt.site)

**[打开在线演示](https://zhixuan-agent-cn.plupluto.chatgpt.site)** · [阅读项目文档](#作品集文档) · [查看复现方法](#5-分钟复现)

**[查看完整 Figma 设计与交互原型](https://www.figma.com/design/0cQqKzVoOS9376uWrMgwGV)** · [阅读设计交付说明](design/figma/README.md)

[![智选 Agent Figma 作品集封面](design/figma/previews/cover.png)](https://www.figma.com/design/0cQqKzVoOS9376uWrMgwGV)

一个面向中文电商场景的可运行 AI 产品作品集：Agent 将自然语言购买需求转成结构化意图，从合成商品知识库召回候选，使用实际训练的推荐排序模型输出 Top-K，并基于可追溯商品证据生成购买建议与取舍提醒。

> 数据声明：本仓库中的商品、用户、评论、查询与行为全部为合成数据，不代表任何真实平台、品牌、商品或商业效果。

## 项目结果

| 模块 | 已实现内容 |
|---|---|
| 电商智能导购 | 预算/品类/使用场景/偏好抽取，关键信息缺失时主动澄清 |
| RAG 流程 | 商品文档检索、候选证据保留、基于证据的推荐理由与限制说明 |
| 推荐排序 | 可解释的逻辑回归排序模型，输出用于候选排序与解释的需求匹配分（不是购买概率） |
| 合成数据库 | 720 商品、2,500 用户、8,000 查询、96,000 交互、5,000 评论 |
| 离线实验 | Precision@K、Recall@K、NDCG@K、MRR，含热门度与价格基线 |
| 产品展示 | 中文响应式网站、交互式推荐、指标看板与完整技术说明 |

测试集结果（由 `scripts/train_ranker.py` 实际生成）：

| 模型 | Precision@5 | Recall@10 | NDCG@10 | MRR |
|---|---:|---:|---:|---:|
| 排序模型 | 87.28% | 91.78% | 96.27% | 94.73% |
| 热门度基线 | 68.33% | 82.30% | 77.73% | 81.29% |
| 价格基线 | 81.70% | 88.07% | 87.84% | 90.85% |

合成分布相对干净，离线指标不能直接外推到真实 GMV、CVR 或用户满意度。真实业务上线前仍需小流量 A/B Test。

## 系统流程

```mermaid
flowchart LR
    A[中文购买需求] --> B[意图抽取与澄清]
    B --> C[商品知识库召回]
    C --> D[排序特征构造]
    D --> E[Pointwise Ranker]
    E --> F[Top-K 候选]
    F --> G[证据约束生成]
    G --> H[推荐理由与取舍]
```

当前演示采用确定性中文模板生成，确保离线、无需密钥也能完整运行。产品方案预留在线大模型增强层；接入时仍要求模型仅使用召回证据，不允许补写商品参数。

## 5 分钟复现

环境要求：Node.js 22+、Python 3.12+。

```bash
npm install
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
npm run pipeline
npm run verify
npm run dev
```

打开 `http://localhost:3000`。如果只想体验前端，仓库已包含生成后的演示数据与模型参数，可直接运行 `npm install && npm run dev`。

## 数据库

SQLite 文件：`data/zhixuan_ecommerce.db`

| 表 | 用途 |
|---|---|
| `products` | 商品属性、价格、评分、能力分、证据文本 |
| `users` | 匿名合成用户偏好，不含真实个人信息 |
| `queries` | 自然语言需求、结构化意图、时间切分 |
| `interactions` | 曝光、点击、加购、购买、相关等级 |
| `reviews` | 合成评论文本与评分 |
| `product_fts` | SQLite FTS5 商品文档检索索引 |
| `experiments` | 模型版本与离线评估结果 |

CSV、字段解释、固定随机种子和文件哈希见 `data/generated/` 与 [数据字典](docs/数据字典.md)。

## 目录结构

```text
├── app/                  # 中文交互网站
├── lib/agent.ts          # 意图理解、召回、排序与证据生成
├── scripts/              # 数据生成与模型训练
├── data/                 # CSV + SQLite 合成数据
├── models/               # 模型文件与前端可读参数
├── reports/              # 指标和预测样例
├── tests/                # 数据完整性与实验结果测试
└── docs/                 # 面向项目评审的 PRD、架构、实验与数据说明
```

## 作品集文档

- [产品需求文档（PRD）](docs/产品需求文档_PRD.md)
- [系统架构与 RAG 流程](docs/系统架构与RAG流程.md)
- [实验与指标设计](docs/实验与指标设计.md)
- [数据字典](docs/数据字典.md)
- [Figma 设计系统、响应式界面与交互原型](design/figma/README.md)

## 当前边界与下一步

- 当前排序模型是可解释、可部署到浏览器的逻辑回归基线；下一步可加入 XGBoost LambdaMART 或双塔召回。
- 当前检索以结构化筛选和中文关键词为主；下一步可增加中文 embedding 和向量数据库。
- 当前结果来自合成数据；下一步应使用脱敏真实日志重新估计相关标签、位置偏差与转化漏斗。
- 当前生成层为确定性模板；接入大模型后需要加入引用校验、敏感内容策略、超时降级与成本监控。

## License

MIT。仅对本项目代码与生成逻辑授权；合成数据不可被表述为真实商业数据。
