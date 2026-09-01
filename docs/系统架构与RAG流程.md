# 系统架构与 RAG 流程

## 1. 实际架构

```mermaid
flowchart TD
    U["1–500 字当前需求"] --> API["POST /api/intent"]
    API -->|"有 ARK_API_KEY"| ARK["Agent Plan Responses API"]
    API -->|"缺 Key / 超时 / 上游失败"| LOCAL["understandIntent"]
    ARK --> FC["命名 Function Calling"]
    FC --> N["normalizeIntent"]
    LOCAL --> N
    N -->|"缺预算"| Q["预算澄清"]
    N -->|"预算已说明或不限"| R["本地过滤与候选召回"]
    P[("daily-products.json")] --> R
    R --> W["POST /api/search"]
    W -->|"已配置联网能力"| WEB["品牌官网与公开网页"]
    W -->|"失败或未开通"| G["保留本地结果"]
    WEB --> E["来源白名单分级与摘要线索"]
    E --> G
    R --> G
    G --> H["人工官方参考执行硬约束"]
    H --> S["启发式检索分 + 推荐分"]
    S --> T["Top 3"]
    T --> UI["理由 / 取舍 / 三类依据"]
    M[("metrics.json")] --> UI
```

浏览器加载 `daily-products.json` 与 `metrics.json`。需求解析只把当前需求文本、System Prompt 和 Function Schema 发给豆包。浏览器调用联网接口时只提交最多 3 个候选 ID，服务端再从清洗生成的身份白名单重建名称、品牌、品类和产品类型；不发送完整商品目录、销售聚合或样本价。

## 2. 本项目中的 RAG

本版的 RAG 是“本地候选 + 联网证据 + 本地复核”，不是让大模型自由生成商品事实：

1. **Retrieval**：按结构化意图从 3,497 个商品对象过滤并打分；只有敏感肌、成分、功效、品牌或未枚举类型需求才选最多 3 个联网候选，基础品类/预算需求不消耗搜索额度。
2. **Web evidence**：`/api/search` 使用 Search Infinity 专用 Key，或复用已开通豆包搜索的 Agent Plan Key；上游固定，响应只保留安全 URL、标题、摘要和匹配字段。
3. **Evidence gating**：敏感肌、明确避开成分或用户明确要求核实功效时触发硬门槛；普通“想要保湿”等只作为相关性偏好。
4. **Authority check**：品牌与官网域名白名单同时命中时标记为官网发现线索；所有搜索摘要都只记录 `search_summary_mentions_*`，不改变敏感肌、具体功效或成分避雷资格。
5. **Generation**：`lib/agent.ts` 使用确定性模板生成理由与取舍；联网搜索不覆盖历史样本价，也不生成实时售价。

## 3. 数据构建链路

`scripts/build_daily_catalog.py` 有两个 required 参数：`--beauty-csv` 和 `--daily-xlsx`。

### 3.1 商品快照

```text
CSV
  → 检查 update_time / id / title / price / sale_count / comment_count / 店名
  → 删除完全重复行
  → 解析日期和数值，排除无效日期、非正价格和负信号
  → 每个 source_product_id 取最新有效记录
  → 清洗活动词，规则推断 category / product_type
  → 从标题提取 merchant_claim_tags / title_ingredient_mentions
  → 计算 popularity / reviewSignal / value
  → 关联 5 条 verified_product_attributes
  → public/data/daily-products.json
```

当前实际计数：27,598 行输入，删除 86 行完全重复，27,512 行进入快照，输出 3,497 个唯一商品和 22 个店铺字段。301 个商品同时缺少历史销量与评论。

### 3.2 日化销售工作簿

```text
销售订单表 + 商品信息表
  → 删除完全重复行
  → 解析日期、数量、单价和金额
  → 排除无效日期、无效数值和无法关联商品的行
  → 按 商品编号 / 大类 / 小类 聚合
  → category_sales_summary.json
```

当前实际计数：31,452 行订单输入，删除 6 行重复、1 行日期异常、4 行数值异常、1 行无法关联；31,440 行用于 122 个商品编码聚合。输出字段只有 `product_code`、`category`、`subcategory`、`order_count`、`quantity` 和 `amount`。

### 3.3 输出

- `public/data/daily-products.json`：前端商品目录；
- `public/data/metrics.json`：项目页指标；
- `public/data/manifest.json`：Schema、来源层、公开文件名和布尔边界；
- `data/daily_chemicals/catalog_quality.json`：实际清洗计数与资格计数；
- `data/daily_chemicals/category_sales_summary.json`：去标识商品编码聚合。
- `data/daily_chemicals/product-identities.json`：服务端联网候选身份白名单，只含 ID、名称、品牌、品类和产品类型。

当前 manifest 不生成文件哈希、字节数或生成时间。

## 4. 服务端豆包接口

### 4.1 请求约束

`POST /api/intent` 接受 `{ "query": string }`：

- Content-Length 大于 4,096 字节返回 413；
- 空字符串或长度超过 500 字返回 400；
- 正常豆包结果与本地降级结果显式返回 `Cache-Control: no-store`；当前 400/413 输入错误分支没有单独设置该响应头。

### 4.2 Agent Plan 调用

- 默认地址：`https://ark.cn-beijing.volces.com/api/plan/v3`；
- `ARK_BASE_URL` 只有与上述 Agent Plan 官方地址完全一致时才会采用，其他值回退到默认地址；
- 默认模型：`doubao-seed-2.0-lite`，可由 `ARK_MODEL` 覆盖；
- 当前配置对应 Agent Plan 专属 Key，不与普通 `/api/v3` 的通用 API Key 混用；
- 请求设置 `thinking: { "type": "disabled" }`，让结构化需求抽取保持较低延迟；
- `store: false`；
- 强制函数名：`extract_personal_care_intent`；服务端先把模型偶发返回的可空字符串哨兵（如 `"null"`）规范为 JSON `null`，再执行完整类型、枚举、长度和范围校验；
- 429、502、503、504 最多重试一次，退避 220–399 ms；
- 整体 AbortController 超时为 6 秒。

失败返回本地 `understandIntent(query)`，并带 `provider: local-fallback` 与原因分类。成功返回 `provider: doubao`。接口没有把上游完整响应或 API Key返回给浏览器。

### 4.3 Function 字段

远端函数包含：

```json
{
  "category": "面部护理",
  "productTypes": ["乳液"],
  "excludedProductTypes": [],
  "budgetMin": null,
  "budgetMax": 200,
  "skinType": "油性",
  "sensitiveSkin": true,
  "concerns": ["保湿"],
  "desiredEffects": ["保湿"],
  "avoidIngredients": ["fragrance"],
  "preferredIngredients": [],
  "avoidFragrance": true,
  "preferredBrands": [],
  "excludedBrands": [],
  "keywords": ["乳液", "保湿"],
  "needsClarification": false,
  "clarificationField": null,
  "confidence": 0.9
}
```

Function Schema 对本地规范品类、产品类型、排除产品类型、肤质、关注问题、数组数量、预算上下限、澄清字段和置信度设定约束。`normalizeIntent` 仍以用户原句中的明确正负关系为准，处理“不要/只要/换成/改成”、产品别名、预算范围和成分同义词，防止模型结果直接进入检索。当前没有已知过敏史、质地偏好或 `medical_red_flag` 等医疗风险字段。

当前 UI 只实现预算澄清：没有预算时进入澄清页并显示预算按钮。即使远端返回其他 `clarificationField`，当前推荐流程不会展示专门的品类、肤质或功效追问界面。

### 4.4 豆包联网接口

`POST /api/search` 接受当前需求及最多 3 个本地候选 ID。服务端执行：

- 校验同源请求标记，并按来源地址执行每 5 分钟最多 12 次的进程内限流；
- Content-Length 最大 4,000 字节，需求仍限制 1–500 字；
- 只接受 `product-identities.json` 中存在且不重复的 1–3 个 ID，商品名称、品牌、品类和类型均由服务端重建；
- 优先使用仅存在服务端的 `WEB_SEARCH_API_KEY` 调用固定 Search Infinity 地址；没有专用 Key 时，使用 `ARK_API_KEY` 与 Responses `web_search`；
- Search Infinity 每次只发一个合并查询，最多取 10 条结果；Responses 最多允许 2 次搜索工具调用；
- 相同候选和约束的成功结果在当前服务实例内缓存 15 分钟；
- 8 秒超时，失败返回空证据与原因，前端保留本地推荐；
- 过滤非 HTTP(S)、本机与私网 URL，限制标题和摘要长度；
- 按品牌、产品类型与商品名词项映射回本地候选；
- 只有品牌域名白名单命中时标为 `official`，第三方网页即使标题写“官方”也只能标为 `public`；二者都只作发现线索。

联网请求不包含样本价，因此不会提供或覆盖当前售价、促销、库存或购买链接。

## 5. 商品与证据结构

### 5.1 历史商品层

可用于基础过滤和排序的实际字段包括：

- `product_id`、`name`、清洗后的 `source_title`；
- `category`、`product_type`；
- `brand`、`shop_name`；
- `price` 与固定 `price_label="样本价"`；
- 可空的 `sales_count`、`review_count`；
- `merchant_claim_tags`、`title_ingredient_mentions`；
- `popularity`、`reviewSignal`、`value`。

对没有官方参考的商品，`brand` 实际使用店铺名，不能一律视为已核实品牌。标题功效和成分词都是未核实检索标签。

### 5.2 当前品牌官方参考层

`verified_product_attributes.json` 当前有 5 条记录。其实际字段包括：

- `source_product_id`、匹配用历史标题、标准品牌与商品名、规格；
- `match_status`、`formula_market`、`formula_version_label`、`formula_checked_at`；
- `ingredient_list_completeness` 与 `ingredients: string[]`；
- `official_formulated_without`、`official_skin_types`、`official_concerns`；
- `brand_claims`、四类 `recommendation_eligibility`、`evidence_sources` 和 notes。

当前匹配状态为 4 条 `exact_name_size_current_cross_market` 和 1 条 `canonical_series_only`。它们是当前品牌官方参考，不证明历史中国市场配方。当前表没有监管备案、禁限用目录、浓度或香料过敏原专用字段。

## 6. 过滤与排序

### 6.1 硬过滤

`eligible()` 当前检查：

1. 规范化品类；
2. 包含产品类型与排除产品类型；
3. `budgetMin` 和预算上限；
4. 排除品牌；
5. 敏感肌资格；
6. 用户明确要求官方/核实功效时，同时检查功效资格与每个具体目标功效；
7. 成分避雷通过状态。

### 6.2 成分避雷

成分词先通过有限同义词表标准化。商品必须具有 `ingredient_avoidance=true`：

- 避开项出现在 `normalized_ingredients` 时排除；
- 出现在 `normalized_formulated_without` 时放行；
- `ingredient_list_completeness=full` 或 `full_current_reference` 时，完整列表未命中可放行；
- `key_only` 没有明确“不含”时不能据缺失推断安全，因而排除；
- 对 alcohol，官方明确 `drying alcohol` 不含可满足当前专门兼容规则。
- 成分族会把 `paraben` 与 `methylparaben` 等变体关联；酒精与脂肪醇不做简单子串等同。

### 6.3 分数

检索分由样本价匹配、关键词、具体功效匹配、品牌、偏好成分、肤质适配、证据状态与历史热度组成。推荐分再融合六个 0–1 指数：

- `efficacy`；
- `sensitivity`；
- `ingredientTransparency`；
- `value`；
- `popularity`；
- `reviewSignal`。

其中 `efficacy` 对历史标题商品可能含低权重标题标签启发值，不能单独作为核实功效证据。高级功效模式另有 `recommendation_eligibility.efficacy` 门槛。

## 7. 推荐理由

模板可输出：

- 样本价在预算内；
- 当前品牌官方页的敏感肌相关声明，并明确是跨市场参考；
- 品牌官方明确列出的“不含”项；
- 当前官方完整成分参考未命中用户避开项；
- 品牌官方产品页可对应的功效；
- 普通模式下的历史热度信号；
- 只有历史标题、成分与功效未核实的限制。

没有候选时，高级模式明确不会用未核实标题补齐结论；普通模式建议调整预算或品类。

## 8. 当前自动测试边界

`tests/test_data_pipeline.py` 当前验证：

- 活动词从展示标题移除；
- 商品快照去重、取最新记录、缺失历史信号保留 `null`；
- 工作簿混合日期、数值后缀、重复和孤儿行处理；
- 发布目录恰有 3,497 个唯一商品和 5 个官方参考；
- 公开商品不暴露日期、客户/订单字段或活动词，且价格标签为“样本价”；
- 六个指数有限且在 0–1，敏感肌资格记录具有官方参考和来源。

`tests/agent.test.ts`、`tests/intent-route.test.ts` 与 `tests/web-search.test.ts` 另覆盖产品别名、实体级否定/改口、宽类目与跨品类映射、目录缺失分支、中文数字及预算方向、成分/品牌正负关系、具体核实功效、paraben 成分族、肤质排序、豆包逐字段安全清洗、强制联网及多版本工具来源兼容解析、联网触发门槛、服务端候选白名单、官网域名分级、第三方降级及摘要不升级硬资格，共 19 个自动用例。

当前没有使用真实 Key 的豆包与搜索上游自动联调、浏览器 UI 回归测试、manifest 哈希测试或 `medical_red_flag` 等医疗风险测试。

## 9. 部署边界

- `ARK_API_KEY`、可选 `WEB_SEARCH_API_KEY`、`ARK_MODEL`、`ARK_BASE_URL` 只由服务端环境读取；
- `.env.local` 与其他 `.env*` 不提交；
- 前端公开 JSON 不包含用户输入、API Key、客户编码或订单编码；
- 无 Key 时基础体验使用本地规则；
- 当前参考主要为跨市场品牌页面，只能按来源和版本边界展示。
