# 抽奖模块 Strategy → Pipeline 迁移方案

> **目标**：一次性干净统一重构，让 Pipeline 成为唯一主链路  
> **约束**：不引入 BaseController/BaseService，继承仅用于"可插拔组件族"（Pipeline/Stage/Provider）  
> **前提**：项目未上线，可一次性投入，不需兼容旧接口  

## 🎯 一次性干净统一目标（已拍板 2026-01-19）

### 结构统一
- 所有抽奖入口最终只走一条链路：`DrawOrchestrator → Pipeline(Stages) → 统一结算`
- 不再存在 Strategy 分支/重复结算代码
- Preset/Override/Normal 共用同一套 `DecisionSnapshotStage + SettleStage`

### 功能统一
- 定价/连抽/幂等/配额/保底/预设/干预/预算/库存/审计，都有**唯一真值**与**唯一落点**
- 不存在"某条路径漏扣/漏记/漏审计"

---

## 📋 架构决策汇总（已拍板）

### 基础架构
| 决策点 | 最终决定 | 理由 |
|-------|---------|------|
| 架构模式 | 继续单体 + 模块化，不拆分微服务 | 团队规模适配，避免分布式复杂度 |
| 审计强度 | 每次抽奖都必须落完整决策快照 | 强审计/强可回放，支持客诉/风控/对账 |
| 基类边界 | 仅用于可插拔组件族（Stage/Provider/Pipeline） | 避免基类承载业务逻辑 |
| **Strategy 清理时机** | ✅ **A方案：一次性切换**（修改 UnifiedLotteryEngine 直接调用 DrawOrchestrator，归档 Strategy） | 项目未上线，一次性切换风险可控，避免双栈维护成本 |

### 终态语义（核心拍板）
| 决策点 | 最终决定 | 理由 |
|-------|---------|------|
| **Preset/Override 是否扣积分** | ✅ 扣 | 旧 `execute_draw` 是统一先扣积分再决定结果，避免"某些命中不扣费"的经济分叉 |
| **保底规则** | 按累计次数取模触发（当前代码实现） | 不引入"触发后重置"状态机，避免新表/新一致性复杂度 |
| **连抽记录模型** | N 条 draw + N 条 decision + **必须落 batch_id** | 方便连抽批次查询/对账，不新建复杂 batch 表 |

### 数据管理（已拍板 2026-01-19）
| 决策点 | 最终决定 | 理由 |
|-------|---------|------|
| **batch_id 是否落库** | ✅ 必须落库 | 方便连抽批次查询/对账，字段加在 `lottery_draws` 表 |
| **定价配置缺失时的行为** | ✅ 严格报错阻断 | 逼迫唯一真值落地，不允许"兜底默认值"掩盖配置缺失 |
| **决策快照保留策略** | 90 天热数据 + 归档 | 热数据支持客诉/风控/对账，归档数据用于审计/复盘 |

### 🛡️ 硬护栏（已拍板 2026-01-18，防止计费漏洞/规则漂移）

> ⚠️ **必须实现**：这两条硬护栏是"动态 1-20 + 严格报错"方案的安全基石，缺失会导致计费漏洞

| 护栏 | 要求 | 风险说明 |
|-----|------|---------|
| **硬护栏 1** | `draw_count` 只能取**该活动配置里启用的按钮档位**，不在列表里直接 400 | 否则客户端传 2/4/7 等未配置的次数，会按单抽取价或计费错误 |
| **硬护栏 2** | 严格报错要做到**前端拿配置**和**后端执行抽奖**两处一致 | 否则前端能拿到配置但后端拒绝，或后端允许但前端没按钮 |
| **缓存一致性** | 运营改配置后必须**精准失效活动缓存** | 否则配置改了但用户端 60s 内不生效（活动配置缓存 TTL=60s） |

#### 硬护栏 1 详细说明：draw_count 白名单校验

```
当前风险（必须修复）：
- 旧代码 execute_draw() 只校验 1-10，但定价映射只对 1/3/5/10 有明确 key
- 如果客户端传 draw_count=2/4/7，会出现"按单抽配置取价"的风险

修复方案：
- 后端强制白名单校验：draw_count 必须在 活动配置.draw_buttons 中 enabled=true 的 count 列表中
- 不在列表里直接返回 400 BAD_REQUEST
```

#### 硬护栏 2 详细说明：前后端严格一致

| 接口 | 配置缺失时的行为 | draw_count 不在启用列表时的行为 |
|-----|-----------------|------------------------------|
| `GET /api/v4/lottery/config/:campaignCode` | 返回 **400 错误**（告知运营先配置） | N/A（此接口不传 draw_count） |
| `POST /api/v4/lottery/draw` | 返回 **400 错误**（配置缺失） | 返回 **400 错误**（不支持的抽奖次数） |

#### 缓存一致性详细说明

```javascript
// 运营修改活动配置后，必须调用精准失效
await BusinessCacheHelper.invalidateLotteryCampaign(campaign_id, 'draw_pricing_updated')

// 已有基础设施（无需新建）：
// - 活动配置缓存 TTL = 60s
// - 失效方法：BusinessCacheHelper.invalidateLotteryCampaign()
// - 失效触发点：活动更新 API 已集成（需确认 draw_pricing 修改也触发失效）
```

### 连抽语义（已拍板 2026-01-18）
| 决策点 | 最终决定 | 理由 |
|-------|---------|------|
| **支持的连抽档位** | **动态 1-20**（运营可配置） | 能力上限放宽到 20，运营按活动独立配置启用哪些按钮 |
| **按钮配置粒度** | **按活动（campaign）独立** | 不同活动可展示不同连抽按钮，灵活性更高 |
| **定价模式** | **运营配 discount**，后端计算 total_cost | 单抽成本来自 DB，`total_cost = 单抽成本 × count × discount`，抗改价 |
| 积分扣减 | 统一扣一次（consume），不再用 `skip_points_deduction` | 连抽升级为一等公民，消除隐藏语义 |
| 配额扣减 | 一次原子扣 draw_count | 使用 `LotteryQuotaService.tryDeductQuota` |
| 保底计算 | 在 N 次内部按顺序计算 | 第几抽触发保底必须一致 |

### 定价体系（已拍板 2026-01-18，补充 2026-01-19）
| 决策点 | 最终决定 | 理由 |
|-------|---------|------|
| **定价真值来源** | **新建活动级定价配置表**（可版本化/可回滚/可定时生效） | 比活动 JSON 更强的配置管理能力，支持大厂级运营需求 |
| **迁移策略** | **方案 A2**：自动迁移 + 严格模式 | 迁移时自动把 `draw_pricing` 写入新表，之后活动 JSON 仅作创建活动的默认模板 |
| **定价模式** | **运营配 discount**，后端动态计算 | `total_cost = 单抽成本(DB) × count × discount`，抗单抽成本变更 |
| **draw_count 范围** | **1-20**，运营按活动启用/禁用 | 能力上限 20，运营选择展示哪些按钮 |
| **版本化能力** | ✅ 可回滚/可定时生效/多版本 | 支持运营预配置、AB测试、紧急回滚等场景 |
| **5连抽折扣策略** | ✅ 默认无折扣（A方案），运营可动态调整 | 5连定位"便捷包"，10连定位"价值锚点"；折扣需运营可配置 |
| **折扣动态调整能力** | ✅ 运营可随时修改任意档位的 discount | 通过 `lottery_campaign_pricing_config` 表版本化管理，支持 AB 测试/限时活动 |
| business.config | 只保留系统上限常量（如 `max_draw_count = 20`） | 不再参与定价计算 |
| **配置缺失时的行为** | ✅ 严格报错阻断（不兜底） | 逼迫唯一真值落地，运营必须先配置定价 |
| **draw_count 白名单校验** | ✅ 后端强制校验 `draw_count` 在活动配置的启用列表中 | 防止客户端传未配置的次数导致计费漏洞 |

### 配额体系
| 决策点 | 最终决定 | 理由 |
|-------|---------|------|
| 配额真值来源 | 唯一入口：`LotteryQuotaService.tryDeductQuota` | 已有成熟实现，支持四维度配额 |
| Pipeline 配额检查 | `EligibilityStage` 不再用 `LotteryDraw.count` 自己算 | 避免统计口径不一致 |

### 幂等体系
| 决策点 | 最终决定 | 理由 |
|-------|---------|------|
| 幂等键派生规则 | `{request_key}:consume` / `{request_key}:reward_{n}` | 与旧链路一致 |
| 数据库约束 | `lottery_draws.idempotency_key` 升级为唯一约束 | 幂等靠结构而非约定 |

### 档位与奖品权重体系（已拍板 2026-01-18）

> ⚠️ **重要**：基于 2026-01-18 对真实数据库的检查，当前 `lottery_tier_rules` 表为空，`lottery_prizes.win_weight` 全部为 0

| 决策点 | 最终决定 | 理由 |
|-------|---------|------|
| **档位规则表初始化** | ✅ 迁移时初始化 `lottery_tier_rules` 表 | Pipeline 的 `TierPickStage` 需要真实的档位权重配置 |
| **奖品权重真值** | ✅ 以 `win_weight`（整数权重）为真值 | 整数运算无精度问题，`win_probability` 仅作展示/导入字段 |
| **空奖是否参与概率分配** | ✅ 是，按运营配置的权重正常参与 | 运营需要通过空奖控制成本，不做特殊处理 |
| **档位划分策略** | ✅ 自动按 `prize_value_points` 推导 | 快速上线，后续运营可手动调整 |
| **分群支持** | ✅ 一次性做完：默认分群 + 预留多分群 | 第一阶段 `segment_key='default'`，预留 VIP/新用户等分群 |

#### 档位划分规则（自动推导）

```javascript
/**
 * 根据 prize_value_points 自动推导档位
 * 运营后续可在 lottery_prizes.reward_tier 手动覆盖
 */
function inferRewardTier(prize_value_points) {
  if (prize_value_points >= 100) return 'high'   // 高价值奖品
  if (prize_value_points >= 10)  return 'mid'    // 中等价值奖品
  return 'low'                                   // 低价值/空奖
}
```

#### win_probability → win_weight 映射规则

```javascript
/**
 * 概率转权重（缩放因子 = 1,000,000）
 * 保证整数运算，避免浮点精度问题
 */
const WEIGHT_SCALE = 1000000

function probabilityToWeight(win_probability) {
  return Math.round(win_probability * WEIGHT_SCALE)
}

// 示例：
// win_probability = 0.30 → win_weight = 300000
// win_probability = 0.01 → win_weight = 10000
// win_probability = 0.00 → win_weight = 0（不参与抽奖）
```

#### 档位规则初始化数据（默认分群）

```sql
-- 默认分群的三档位初始化（权重之和 = 1,000,000）
-- 第一阶段：所有用户使用此配置
INSERT INTO lottery_tier_rules (campaign_id, segment_key, tier_name, tier_weight, status, created_by)
VALUES
  (1, 'default', 'high',    50000,  'active', 1),  -- 5% 高档命中率
  (1, 'default', 'mid',    150000,  'active', 1),  -- 15% 中档命中率
  (1, 'default', 'low',    800000,  'active', 1);  -- 80% 低档命中率（含空奖）
```

#### 多分群预留配置（第二阶段）

```sql
-- 预留：新用户分群（高档概率翻倍，提升新用户体验）
INSERT INTO lottery_tier_rules (campaign_id, segment_key, tier_name, tier_weight, status, created_by)
VALUES
  (1, 'new_user', 'high',   100000, 'active', 1),  -- 10%
  (1, 'new_user', 'mid',    200000, 'active', 1),  -- 20%
  (1, 'new_user', 'low',    700000, 'active', 1);  -- 70%

-- 预留：VIP用户分群（中高档概率提升）
INSERT INTO lottery_tier_rules (campaign_id, segment_key, tier_name, tier_weight, status, created_by)
VALUES
  (1, 'vip_user', 'high',    80000, 'active', 1),  -- 8%
  (1, 'vip_user', 'mid',    220000, 'active', 1),  -- 22%
  (1, 'vip_user', 'low',    700000, 'active', 1);  -- 70%
```

#### 当前数据库状态（2026-01-18 检查结果）

```
lottery_tier_rules: 0 条（空表）
lottery_prizes (campaign_id=1):
  - 共 9 个奖品，全部 reward_tier='low'
  - win_probability 总和 = 1.0（100%中奖设计）
  - win_weight 全部为 0（需迁移）
  - 空奖 1 个：青菜1份（prize_value_points=0）
  - 概率为 0 的奖品 3 个：八八折、生腌拼盘158、九八折券（保底专用）
```

---

---

## 0. 迁移关键对齐要求（基于代码与数据库检查结果）

> ⚠️ **重要**：以下内容基于 2026-01-18 对真实代码与数据库（`restaurant_points_dev`）的检查结果

### 0.1 旧链路已实现的关键能力（必须搬迁）

| 能力 | 旧链路实现位置 | 迁移目标 | 状态 |
|------|--------------|---------|------|
| 连抽定价（动态 1-20） | `UnifiedLotteryEngine.getDrawPricing()` | `PricingStage._loadPricingAndValidate()` | 🔴 待搬迁 |
| 连抽统一扣积分 | `UnifiedLotteryEngine._processMultiDraw()` | `SettleStage` 内部一次扣积分（支持 draw_count） | 🔴 待搬迁 |
| 连抽批量语义（替代 skip_points_deduction） | `context.skip_points_deduction = true` | `PickStage + SettleStage` 批量处理（连抽一等公民） | 🔴 待搬迁 |
| 派生幂等键模型 | `deriveTransactionIdempotencyKey()` | `SettleStage` 幂等键生成 | 🔴 待搬迁 |
| 折扣显示字段 | `discount_label/saved_points` | `PricingStage` 输出 | 🔴 待搬迁 |

### 0.2 数据库索引状态（已确认存在）

```
真实数据库: restaurant_points_dev (MySQL 8.0.42)

lottery_draws.indexes:
 - PRIMARY unique=true cols=draw_id
 - idx_campaign_id unique=false cols=campaign_id
 - idx_created_at unique=false cols=created_at
 - idx_lottery_draws_idempotency unique=false cols=idempotency_key  ⚠️ 非唯一索引
 - idx_lottery_draws_user_campaign_date unique=false cols=user_id,campaign_id,created_at
 - idx_user_id unique=false cols=user_id

lottery_campaign_user_quota.indexes:
 - PRIMARY unique=true cols=quota_id
 - idx_user_campaign unique=false cols=user_id,campaign_id
 - uk_user_campaign_unique unique=true cols=user_id,campaign_id

lottery_prizes.indexes:
 - PRIMARY unique=true cols=prize_id
 - idx_campaign_id unique=false cols=campaign_id
```

✅ **已拍板**：`idx_lottery_draws_idempotency` 当前是**非唯一索引**，将升级为**唯一约束**（见 4.1.2 / Phase 4）

### 0.3 其他调用点需清理

| 调用点位置 | 调用方式 | 处理建议 |
|-----------|---------|---------|
| `services/index.js` L89 | `getExecutionChain()` 注册 | Phase 4 删除 |
| `routes/v4/console/shared/middleware.js` | `LotteryStrategy` 引用 | Phase 4 删除 |

### 0.4 定价规则复用要求（已拍板 2026-01-18：运营配 discount）

旧链路 `getDrawPricing()` 输出结构（**Pipeline 必须保持一致**）：
```javascript
{
  total_cost: number,           // 实付积分（后端动态计算：单抽成本 × count × discount）
  per_draw: number,             // 折后单抽价格
  original_cost: number,        // 原价（单抽成本 × count）
  discount: number,             // 折扣率（运营配置，如 0.95）
  label: string,                // 显示文案（运营配置，如 "10连抽 9折"）
  saved_points: number,         // 节省积分（original_cost - total_cost）
  pricing_source: 'campaign'    // 唯一来源：活动配置
}
```

**定价模式变更说明（已拍板 2026-01-18）**：
- ❌ 旧方式：运营可能配 `total_cost`（固定值），单抽成本变更时需逐个手动改
- ✅ 新方式：运营配 `discount`，后端用 `单抽成本(DB) × count × discount` 动态计算
- ✅ 好处：抗改价、减少配置错误、审计链路透明

### 0.5 幂等键派生规则（必须沿用）

旧链路的幂等键派生模型（**SettleStage 必须保持一致**）：
```
请求级幂等键: request_idempotency_key = 用户传入
  ├── 消费幂等键: request_idempotency_key + ':consume'      → 扣积分
  └── 发奖幂等键: request_idempotency_key + ':reward_' + n   → 发第n个奖品
```

---

## 0.6 统一管线终态架构（已拍板）

### 终态目标：所有模式共用一套 Stage

```
DrawOrchestrator.execute(context)
       ↓
  selectPipeline() → 设置 context.decision_source = 'preset' | 'override' | 'normal'
       ↓
  UnifiedDrawPipeline.run(context)  ← 所有模式走同一条管线
       ↓
  顺序执行 Stage：
    1. LoadCampaignStage        - 加载活动配置
    2. LoadDecisionSourceStage  - 加载决策来源（preset/override/normal）
    3. EligibilityStage         - 资格检查（含 draw_count 语义）
    4. QuotaDeductStage         - 配额原子扣减（使用 LotteryQuotaService）
    5. PricingStage             - 定价计算（唯一真值：management_settings）
    6. PickStage                - 选奖（根据 decision_source 决定结果）
       ├─ preset:   直接使用预设奖品
       ├─ override: 根据 force_win/force_lose 决定
       ├─ guarantee: 检查保底触发（累计次数取模）
       └─ normal:   概率抽取（tier_first）
    7. DecisionSnapshotStage    - 决策快照（所有模式统一结构）
    8. SettleStage              - 统一结算（唯一写入点）
       ├─ 扣积分（一次，含 Preset/Override）
       ├─ 扣库存（支持欠账）
       ├─ 扣预算（支持欠账）
       ├─ 发奖品
       ├─ 创建 N 条 lottery_draws（含 batch_id）
       ├─ 创建 N 条 lottery_draw_decisions
       └─ 记录欠账（如有）
```

### 与当前架构的核心区别

| 当前架构 | 终态架构 | 改进点 |
|---------|---------|-------|
| 3 条独立管线（Normal/Preset/Override） | 1 条统一管线 | 消除重复结算代码 |
| 各管线有独立的 `*SettleStage` | 共用 `SettleStage` | 统一写入点、统一审计口径 |
| 连抽靠 `skip_points_deduction` 隐含开关 | 连抽是一等公民（N 次结果批量处理） | 消除隐藏语义 |
| 定价来源混合（活动/setting/config） | 定价唯一真值（management_settings） | 一处改价，全链路一致 |
| 配额自己 count draw | 配额唯一真值（LotteryQuotaService） | 统一四维度配额规则 |
| 幂等键非唯一索引 | 幂等键唯一约束 | 幂等靠结构而非约定 |

### 连抽一等公民化详细说明

**当前方式（隐含开关）**：
```
外层统一扣积分 → for 循环 N 次 → 每次设置 skip_points_deduction=true → 调用策略/管线
```

**终态方式（一等公民）**：
```
管线接收 draw_count → 配额一次扣 N → 积分一次扣总价 → PickStage 产生 N 个结果 → SettleStage 一次事务写入 N 条记录
```

### 保底规则详细说明

**规则（已拍板）**：
- 按用户在该活动的**累计抽奖次数取模**触发（如第 10/20/30... 次触发）
- 连抽场景下，N 次内部按顺序计算（如 10 连抽的第 10 抽可能触发保底）
- **不引入"触发后重置"状态机**，保持当前 `user_draw_count % threshold === 0` 逻辑

### Preset/Override 扣积分说明

**规则（已拍板）**：
- Preset（预设）：**扣积分**，与正常抽奖一致
- Override（干预）：**扣积分**，与正常抽奖一致
- 理由：旧 `execute_draw` 是"统一先扣积分，再决定结果"，保持经济模型一致

---

## 1. 现状分析

### 1.1 Strategy 链路现状（方案A）

```
UnifiedLotteryEngine.execute_draw()
       ↓
  getExecutionChain() → [BasicGuaranteeStrategy, ManagementStrategy]
       ↓
  strategy.execute(context)
       ↓
  内部编排逻辑：
    1. validateInput()     → 验证用户资格、积分
    2. checkGuarantee()    → 保底机制
    3. checkPresetQueue()  → 预设队列
    4. selectPrize()       → 概率选奖
    5. deductPoints()      → 扣积分（幂等）
    6. deductStock()       → 扣库存
    7. distributePrize()   → 发奖
    8. recordHistory()     → 记录
```

**问题**：Strategy 内部承担了"编排"职责，与 Pipeline 重复

### 1.2 Pipeline 链路现状（方案B）

```
DrawOrchestrator.execute()
       ↓
  selectPipeline() → [Preset > Override > Normal]
       ↓
  NormalDrawPipeline.run()
       ↓
  顺序执行 Stage：
    1. LoadCampaignStage      ✅ 已实现
    2. EligibilityStage       ✅ 已实现
    3. BudgetContextStage     ✅ 已实现
    4. BuildPrizePoolStage    ✅ 已实现
    5. GuaranteeStage         ✅ 已实现
    6. TierPickStage          ✅ 已实现
    7. PrizePickStage         ✅ 已实现
    8. DecisionSnapshotStage  ✅ 已实现
    9. SettleStage            ✅ 已实现（唯一写入点）
```

**发现**：Pipeline 基础设施已相当完善！

---

## 2. 功能对照表

| Strategy 功能 | Pipeline Stage | 状态 | 备注 |
|--------------|---------------|------|------|
| 加载活动配置 | LoadCampaignStage | ✅ 完成 | 含奖品、档位规则、兜底奖 |
| 验证抽奖资格 | EligibilityStage | ✅ 完成 | 每日次数、配额、黑名单 |
| 积分余额检查 | BudgetContextStage | ✅ 完成 | 通过 BudgetProvider |
| 奖品池过滤 | BuildPrizePoolStage | ✅ 完成 | 过滤无库存奖品 |
| 保底机制 | GuaranteeStage | ✅ 完成 | 累计N次触发 |
| 档位选择 | TierPickStage | ✅ 完成 | 加权随机 |
| 奖品选择 | PrizePickStage | ✅ 完成 | 档内加权随机 |
| 决策快照 | DecisionSnapshotStage | ✅ 完成 | 审计追溯 |
| 扣库存 | SettleStage | ✅ 完成 | 原子操作 |
| 扣预算 | SettleStage | ✅ 完成 | BudgetProvider.deduct |
| 发奖品 | SettleStage | ✅ 完成 | AssetService |
| 记录历史 | SettleStage | ✅ 完成 | LotteryDraw |
| **抽奖定价** | ❌ 缺失 | 🔴 待添加 | 多抽折扣、动态定价 |
| **预设队列** | PresetAwardPipeline | ✅ 完成 | 由 DrawOrchestrator 路由 |
| **管理干预** | OverridePipeline | ✅ 完成 | 由 DrawOrchestrator 路由 |

---

## 3. 迁移方案（一次性干净统一版）

### 3.1 迁移步骤总览

```
Phase 0: 写"终态真值规格"（已完成，见上述架构决策）
         ↓
Phase 1: 重组统一管线
         - 合并 Normal/Preset/Override 为一条管线
         - 新增 LoadDecisionSourceStage、QuotaDeductStage
         - 升级 PickStage（支持 preset/override/guarantee/normal）
         ↓
Phase 2: 连抽一等公民化
         - 管线内部产生 N 次结果
         - 结算一次事务提交
         - 删除 skip_points_deduction 隐藏语义
         ↓
Phase 3: 收敛定价与配额真值
         - 定价只走 management_settings
         - 配额只走 LotteryQuotaService
         ↓
Phase 4: 强化幂等与唯一约束
         - lottery_draws.idempotency_key 升级为唯一约束
         - lottery_draw_decisions.draw_id 外键约束
         ↓
Phase 5: 切换入口 + 清理代码
         - UnifiedLotteryEngine → DrawOrchestrator
         - 归档 Strategy 代码
```

---

### 3.2 Phase 1: 补齐 PricingStage

**目的**：实现抽奖定价逻辑（多抽折扣、会员优惠）

> ⚠️ **关键约束**：`PricingStage` 必须**复用旧链路 `getDrawPricing()` 的语义**，禁止重新设计定价规则

#### 3.2.1 新建文件 `pipeline/stages/PricingStage.js`

```javascript
/**
 * PricingStage - 抽奖定价计算 Stage
 *
 * 职责：
 * 1. 根据活动配置计算单次抽奖价格
 * 2. 支持多抽折扣（连抽优惠）
 * 3. 支持会员等级优惠
 * 4. 验证用户积分是否足够支付
 *
 * ⚠️ 关键约束：
 * - 必须复用旧链路 UnifiedLotteryEngine.getDrawPricing() 的语义
 * - 输出字段必须与旧链路一致（total_cost/discount/label/saved_points）
 * - 仅支持 draw_count = 1/5/10（与旧链路一致）
 *
 * 输入依赖：
 * - LoadCampaignStage.data.campaign.prize_distribution_config
 * - BudgetContextStage.data.budget_before
 *
 * 输出到上下文：
 * - draw_cost: 本次抽奖消耗积分（= total_cost）
 * - original_cost: 原价
 * - discount: 折扣率（如 0.95）
 * - discount_label: 折扣标签（如 "10连抽 9折"）
 * - saved_points: 节省积分
 * - pricing_source: 配置来源
 * - points_sufficient: 积分是否充足
 */
class PricingStage extends BaseStage {
  constructor() {
    super('PricingStage', { is_writer: false, required: true })
  }

  async execute(context) {
    const { user_id, campaign_id, draw_count = 1 } = context

    // 🔴 校验 draw_count 范围（已拍板 2026-01-18：动态 1-20，运营按活动配置）
    if (draw_count < 1 || draw_count > 20) {
      throw this.createError(
        `抽奖次数必须在 1-20 之间，当前: ${draw_count}`,
        'INVALID_DRAW_COUNT',
        false
      )
    }
    
    // 🔴 白名单校验：draw_count 必须在活动配置的启用按钮列表中（见 _loadPricingAndValidate）

    // 获取活动配置
    const campaign_data = this.getContextData(context, 'LoadCampaignStage.data')
    const campaign = campaign_data.campaign
    
    // 获取用户积分余额
    const budget_data = this.getContextData(context, 'BudgetContextStage.data')
    const user_points = budget_data.budget_before || 0

    // 🎯 复用旧链路定价逻辑（从 UnifiedLotteryEngine.getDrawPricing 搬迁）
    const pricing = await this._getDrawPricing(draw_count, campaign)

    // 验证积分是否充足
    const points_sufficient = user_points >= pricing.total_cost

    if (!points_sufficient) {
      throw this.createError(
        `积分不足：需要 ${pricing.total_cost}，当前 ${user_points}`,
        'INSUFFICIENT_POINTS',
        true
      )
    }

    // 🔴 输出字段必须与旧链路 getDrawPricing() 一致
    return this.success({
      draw_cost: pricing.total_cost,
      total_cost: pricing.total_cost,
      unit_cost: pricing.unit_cost || Math.floor(pricing.total_cost / draw_count),
      original_cost: pricing.original_cost || pricing.total_cost,
      discount: pricing.discount,
      discount_rate: pricing.discount,
      discount_label: pricing.discount_label || pricing.label,
      label: pricing.label,
      saved_points: pricing.saved_points || 0,
      pricing_source: pricing.pricing_source || 'default',
      points_before: user_points,
      points_after: user_points - pricing.total_cost,
      points_sufficient: true
    })
  }

  /**
   * 复用旧链路定价逻辑（从 UnifiedLotteryEngine.getDrawPricing 搬迁）
   * 
   * 配置来源优先级（已拍板）：
   * 1. lottery_management_settings 表（最高优先级，运营可随时改）
   * 2. lottery_campaigns.prize_distribution_config 字段
   * 3. 系统默认值（兜底）
   */
  async _getDrawPricing(draw_count, campaign) {
    // TODO: 从旧链路 UnifiedLotteryEngine.getDrawPricing() 搬迁完整实现
    // 以下为语义占位，实际实现需复制旧代码
    
    const config = campaign.prize_distribution_config || {}
    const base_cost = config.points_cost || config.base_cost || 100
    
    // 折扣配置（已拍板 2026-01-19：A方案 5连无折扣，运营可动态调整）
    const discount_tiers = config.multi_draw_discounts || [
      { min_count: 1,  max_count: 1,  discount: 1.0,  label: '单抽' },
      { min_count: 5,  max_count: 5,  discount: 1.0,  label: '5连抽' },        // A方案：无折扣
      { min_count: 10, max_count: 10, discount: 0.90, label: '10连抽 9折' },
    ]

    // 查找适用的折扣
    let tier = discount_tiers.find(t => 
      draw_count >= t.min_count && draw_count <= t.max_count
    ) || { discount: 1.0, label: '单抽' }

    const original_cost = base_cost * draw_count
    const total_cost = Math.floor(original_cost * tier.discount)
    const saved_points = original_cost - total_cost

    return {
      total_cost,
      discount: tier.discount,
      label: tier.label,
      discount_label: tier.label,
      saved_points,
      pricing_source: 'campaign',
      unit_cost: base_cost,
      original_cost
    }
  }
}
```

#### 3.2.2 更新 NormalDrawPipeline.js

```javascript
// 在 _initializeStages() 中添加 PricingStage
_initializeStages() {
  this.addStage(new LoadCampaignStage())
  this.addStage(new EligibilityStage())
  this.addStage(new BudgetContextStage())
  this.addStage(new PricingStage())        // 🆕 新增
  this.addStage(new BuildPrizePoolStage())
  this.addStage(new GuaranteeStage())
  this.addStage(new TierPickStage())
  this.addStage(new PrizePickStage())
  this.addStage(new DecisionSnapshotStage())
  this.addStage(new SettleStage())
}
```

---

### 3.3 Phase 2: 增强 SettleStage（积分扣减）

**目的**：确保 SettleStage 正确扣减用户积分（从 PricingStage 获取 draw_cost）

> ⚠️ **关键约束**：
> 1. **连抽场景下**：积分扣减由外层统一处理，`SettleStage` 内部需判断 `context.skip_points_deduction`
> 2. **幂等键派生**：必须沿用旧链路的派生规则（`:consume` / `:reward_n`）
> 3. **禁止硬编码默认值**：`draw_cost` 必须从 `PricingStage` 获取，不允许 `|| 100` 兜底

#### 3.3.1 修改 SettleStage.js

```javascript
// 在 execute() 方法中添加积分扣减逻辑

async execute(context) {
  // ... 现有代码 ...

  // 获取定价信息（从 PricingStage）
  const pricing_data = this.getContextData(context, 'PricingStage.data')
  
  // 🔴 禁止硬编码默认值，PricingStage 必须提供 draw_cost
  if (!pricing_data || pricing_data.draw_cost === undefined) {
    throw this.createError(
      'PricingStage 未提供 draw_cost',
      'MISSING_PRICING_DATA',
      true
    )
  }
  
  const draw_cost = pricing_data.draw_cost

  try {
    // 🔴 连抽场景：检查是否跳过积分扣减（由外层统一处理）
    const skip_points_deduction = context.skip_points_deduction === true
    
    // 1. 扣减用户积分（使用 AssetService）
    if (draw_cost > 0 && !skip_points_deduction) {
      // 🔴 幂等键派生规则（与旧链路一致）：request_key + ':consume'
      const consume_idempotency_key = `${idempotency_key}:consume`
      
      await AssetService.changeBalance({
        user_id,
        asset_code: 'POINTS',
        delta_amount: -draw_cost,
        idempotency_key: consume_idempotency_key,  // 🔴 派生幂等键
        lottery_session_id,
        business_type: 'lottery_consume',          // 🔴 与旧链路一致
        meta: {
          source_type: 'system',
          title: '抽奖消耗',
          description: `抽奖消耗 ${draw_cost} 积分`,
          draw_count: context.draw_count || 1,
          discount_applied: pricing_data.saved_points || 0
        }
      }, { transaction })
      
      this.log('info', '用户积分扣减成功', {
        user_id,
        draw_cost,
        idempotency_key: consume_idempotency_key,
        skip_points_deduction
      })
    } else if (skip_points_deduction) {
      this.log('info', '跳过积分扣减（连抽子请求）', {
        user_id,
        draw_cost,
        reason: 'skip_points_deduction=true'
      })
    }

    // 2. 发奖品（使用派生幂等键）
    // 🔴 幂等键派生规则（与旧链路一致）：request_key + ':reward_' + index
    const reward_index = context.current_draw_index || 0
    const reward_idempotency_key = `${idempotency_key}:reward_${reward_index}`
    
    await this._deliverPrize(final_prize, user_id, reward_idempotency_key, transaction)

    // 3. 扣减奖品库存（现有逻辑）
    await this._deductPrizeStock(final_prize, transaction)

    // ... 后续现有逻辑 ...
  }
}
```

#### 3.3.2 连抽外层处理逻辑（DrawOrchestrator 或 UnifiedLotteryEngine）

```javascript
// 连抽场景：外层统一扣积分，子抽奖跳过扣减
async _processMultiDraw(params, options = {}) {
  const { user_id, campaign_id, draw_count, idempotency_key } = params
  
  // 1. 先计算总价格（从 PricingStage 或复用旧 getDrawPricing）
  const pricing = await this._getDrawPricing(draw_count, campaign)
  
  // 2. 统一扣除总积分（使用 :consume 派生幂等键）
  await AssetService.changeBalance({
    user_id,
    asset_code: 'POINTS',
    delta_amount: -pricing.total_cost,
    idempotency_key: `${idempotency_key}:consume`,
    business_type: 'lottery_consume'
  })
  
  // 3. 循环执行子抽奖（跳过积分扣减）
  const results = []
  for (let i = 0; i < draw_count; i++) {
    const sub_context = {
      ...params,
      draw_count: 1,
      skip_points_deduction: true,  // 🔴 关键：子抽奖跳过扣减
      current_draw_index: i,
      idempotency_key: `${idempotency_key}_${i}`  // 派生子幂等键
    }
    
    const result = await this.orchestrator.execute(sub_context)
    results.push(result)
  }
  
  return { results, pricing, total_cost: pricing.total_cost }
}
```

---

### 3.4 Phase 3: 切换入口点

**目的**：让 `UnifiedLotteryEngine.execute_draw` 调用 `DrawOrchestrator`

#### 3.4.1 修改 UnifiedLotteryEngine.js

```javascript
// 修改 execute_draw 方法
class UnifiedLotteryEngine {
  constructor() {
    // 初始化 DrawOrchestrator
    this.orchestrator = new DrawOrchestrator()
  }

  /**
   * 执行单次抽奖（主入口）
   * 
   * @param {Object} params - 抽奖参数
   * @param {number} params.user_id - 用户ID
   * @param {number|string} params.campaign_id - 活动ID
   * @param {string} params.idempotency_key - 幂等键
   * @param {string} params.lottery_session_id - 会话ID
   * @param {Object} options - 选项
   * @returns {Promise<Object>} 抽奖结果
   */
  async execute_draw(params, options = {}) {
    const { user_id, campaign_id, idempotency_key, lottery_session_id } = params
    
    // 构建 Pipeline 上下文
    const context = {
      user_id,
      campaign_id: this._normalizeCampaignId(campaign_id),
      idempotency_key,
      lottery_session_id,
      transaction: options.transaction || null,
      draw_count: params.draw_count || 1
    }

    // 调用 DrawOrchestrator 执行
    const result = await this.orchestrator.execute(context)

    // 转换为标准返回格式
    return this._formatResult(result)
  }

  /**
   * 格式化返回结果（兼容原有格式）
   */
  _formatResult(pipeline_result) {
    if (!pipeline_result.success) {
      return {
        success: false,
        error: pipeline_result.error,
        code: pipeline_result.context?.errors?.[0]?.code || 'DRAW_FAILED'
      }
    }

    const settle_data = pipeline_result.context.stage_results.SettleStage?.data
    if (!settle_data) {
      return {
        success: false,
        error: 'SettleStage 未返回数据',
        code: 'SETTLE_MISSING'
      }
    }

    return {
      success: true,
      draw_id: settle_data.draw_record.draw_id,
      prize: {
        prize_id: settle_data.draw_record.prize_id,
        prize_name: settle_data.draw_record.prize_name,
        prize_type: settle_data.draw_record.prize_type,
        prize_value: settle_data.draw_record.prize_value
      },
      reward_tier: settle_data.draw_record.reward_tier,
      guarantee_triggered: settle_data.draw_record.guarantee_triggered,
      points_cost: settle_data.settle_result.draw_cost || 100,
      pipeline_type: pipeline_result.pipeline_type,
      execution_id: pipeline_result.execution_id
    }
  }
}
```

---

### 3.5 Phase 4: 清理 Strategy 代码

**目的**：移除不再使用的 Strategy 文件

#### 3.5.1 归档目录结构

```
services/UnifiedLotteryEngine/
├── strategies/                    # 🗑️ 待归档
│   ├── BasicGuaranteeStrategy.js
│   ├── ManagementStrategy.js
│   └── index.js
├── core/
│   └── LotteryStrategy.js         # 🗑️ 待归档
├── pipeline/                      # ✅ 保留（主链路）
│   ├── PipelineRunner.js
│   ├── DrawOrchestrator.js
│   ├── NormalDrawPipeline.js
│   ├── PresetAwardPipeline.js
│   ├── OverridePipeline.js
│   ├── stages/
│   │   ├── BaseStage.js           # ✅ 保留（可插拔组件基类）
│   │   ├── LoadCampaignStage.js
│   │   ├── EligibilityStage.js
│   │   ├── PricingStage.js        # 🆕 新增
│   │   ├── BudgetContextStage.js
│   │   ├── BuildPrizePoolStage.js
│   │   ├── GuaranteeStage.js
│   │   ├── TierPickStage.js
│   │   ├── PrizePickStage.js
│   │   ├── DecisionSnapshotStage.js
│   │   └── SettleStage.js
│   └── budget/
│       ├── BudgetProvider.js      # ✅ 保留（可插拔组件基类）
│       ├── BudgetProviderFactory.js
│       ├── UserBudgetProvider.js
│       ├── PoolBudgetProvider.js
│       └── PoolQuotaBudgetProvider.js
└── UnifiedLotteryEngine.js        # ✅ 保留（入口层，薄封装）
```

#### 3.5.2 执行归档

```bash
# 创建归档目录
mkdir -p services/UnifiedLotteryEngine/_archived_strategy_20260118

# 移动 Strategy 文件
mv services/UnifiedLotteryEngine/strategies/* \
   services/UnifiedLotteryEngine/_archived_strategy_20260118/

mv services/UnifiedLotteryEngine/core/LotteryStrategy.js \
   services/UnifiedLotteryEngine/_archived_strategy_20260118/

# 删除空目录
rmdir services/UnifiedLotteryEngine/strategies
```

---

## 4. 数据库相关

### 4.1 索引现状与建议（基于真实数据库检查）

> ⚠️ 以下内容基于 2026-01-18 对 `restaurant_points_dev` 数据库的真实检查

#### 4.1.1 已存在的索引（无需创建）

```sql
-- lottery_draws 表
-- ✅ PRIMARY (draw_id)
-- ✅ idx_campaign_id (campaign_id)
-- ✅ idx_created_at (created_at)
-- ✅ idx_user_id (user_id)
-- ✅ idx_lottery_draws_user_campaign_date (user_id, campaign_id, created_at)
-- ⚠️ idx_lottery_draws_idempotency (idempotency_key) -- 注意：当前是非唯一索引

-- lottery_campaign_user_quota 表
-- ✅ PRIMARY (quota_id)
-- ✅ idx_user_campaign (user_id, campaign_id)
-- ✅ uk_user_campaign_unique (user_id, campaign_id) -- 唯一索引

-- lottery_prizes 表
-- ✅ PRIMARY (prize_id)
-- ✅ idx_campaign_id (campaign_id)
```

#### 4.1.2 索引调整（已拍板）

```sql
-- ✅ 已拍板：幂等键升级为数据库唯一约束（项目未上线，一次性收敛）
-- 执行前置检查：确认不存在重复 idempotency_key（否则先清理数据）
DROP INDEX idx_lottery_draws_idempotency ON lottery_draws;
CREATE UNIQUE INDEX uk_lottery_draws_idempotency ON lottery_draws(idempotency_key);
-- 说明：不再保留"代码层幂等 + 非唯一索引"的方案（会导致并发/对账歧义）

-- 🟡 奖品库存索引（建议新增）
CREATE INDEX IF NOT EXISTS idx_lottery_prizes_campaign_status
ON lottery_prizes(campaign_id, status);
```

#### 4.1.3 新表创建（已拍板 2026-01-18：方案 A2 定价配置表）

```sql
-- ✅ 已拍板：新建活动级定价配置表（可版本化/可回滚/可定时生效）
-- 详细表结构见 9.2 章节

CREATE TABLE lottery_campaign_pricing_config (
  config_id         VARCHAR(50) PRIMARY KEY,
  campaign_id       INT NOT NULL,
  version           INT NOT NULL DEFAULT 1,
  pricing_config    JSON NOT NULL,
  status            ENUM('draft', 'active', 'scheduled', 'archived') NOT NULL DEFAULT 'draft',
  effective_at      DATETIME NULL,
  expired_at        DATETIME NULL,
  created_by        INT NOT NULL,
  updated_by        INT NULL,
  created_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  INDEX idx_campaign_status (campaign_id, status),
  INDEX idx_campaign_version (campaign_id, version),
  INDEX idx_effective_at (effective_at),
  UNIQUE KEY uk_campaign_version (campaign_id, version)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='活动级定价配置表（可版本化）';
```

#### 4.1.4 DDL 兼容性说明

```
MySQL 版本: 8.0.42（支持 IF NOT EXISTS 语法）

注意事项：
1. CREATE INDEX IF NOT EXISTS 在 MySQL 8.0+ 需要使用如下方式：
   - MySQL 8.0.29+ 直接支持 IF NOT EXISTS
   - 更早版本需要用存储过程或先检查再创建
   
2. 生产执行建议：
   - 先用 SHOW INDEX FROM table_name 确认索引存在性
   - 再决定是否执行 CREATE INDEX
```

### 4.2 事务边界说明

```
Pipeline 事务边界：

┌─────────────────────────────────────────────────────────────┐
│  LoadCampaignStage   │  读取（无事务）                       │
│  EligibilityStage    │  读取（无事务）                       │
│  BudgetContextStage  │  读取（无事务）                       │
│  PricingStage        │  计算（无事务）                       │
│  BuildPrizePoolStage │  读取（无事务）                       │
│  GuaranteeStage      │  读取（无事务）                       │
│  TierPickStage       │  计算（无事务）                       │
│  PrizePickStage      │  计算（无事务）                       │
│  DecisionSnapshotStage│  计算（无事务）                      │
├─────────────────────────────────────────────────────────────┤
│  SettleStage         │  🔒 事务开始                         │
│    ├─ 扣用户积分     │  ├─ AssetService.changeBalance      │
│    ├─ 扣奖品库存     │  ├─ UPDATE lottery_prizes           │
│    ├─ 扣预算         │  ├─ BudgetProvider.deduct           │
│    ├─ 发奖品         │  ├─ AssetService.mintItem/changeBalance│
│    ├─ 创建抽奖记录   │  ├─ INSERT lottery_draws            │
│    ├─ 创建决策记录   │  ├─ INSERT lottery_draw_decisions   │
│    │                 │  │   🎯 强制落完整快照（已拍板）：    │
│    │                 │  │   - 所有 Stage 的输入/输出         │
│    │                 │  │   - 决策路径（档位/奖品选择）      │
│    │                 │  │   - 保底/预设/干预触发情况         │
│    │                 │  │   - 预算/库存/积分变动明细         │
│    └─ 更新配额       │  └─ UPDATE user_quota               │
│                      │  🔒 事务提交                         │
└─────────────────────────────────────────────────────────────┘
```

**审计强度说明（已拍板）**：
- **每次抽奖都必须落完整决策快照**，不区分活动类型/用户等级
- 快照内容包括：完整上下文、所有 Stage 输出、决策路径、资产变动明细
- 存储成本预估：每条快照约 2-5KB，日均 1 万次抽奖约 20-50MB/天
- 保留策略（已拍板）：90 天热数据 + 归档历史数据（用于客诉/风控/审计）

---

## 5. 继承关系确认

### 5.1 保留的继承（可插拔组件族）

| 基类 | 子类 | 用途 |
|------|------|------|
| `BaseStage` | 所有 *Stage.js | Pipeline 阶段标准化 |
| `BudgetProvider` | User/Pool/PoolQuota | 预算模式抽象 |
| `PipelineRunner` | Normal/Preset/Override | 管线执行器 |

### 5.2 移除的继承

| 基类 | 子类 | 处理 |
|------|------|------|
| `LotteryStrategy` | BasicGuarantee/Management | 🗑️ 归档 |

### 5.3 不引入的继承

| 层级 | 说明 |
|------|------|
| Controller 层 | 无 BaseController，保持薄封装 + 组合 |
| Service 层 | 无 BaseService，保持薄封装 + 组合 |
| Engine 层 | UnifiedLotteryEngine 保持组合模式 |

---

## 6. 测试验证

### 6.1 单元测试

```javascript
// tests/pipeline/NormalDrawPipeline.test.js

describe('NormalDrawPipeline', () => {
  it('should execute all stages in order', async () => {
    const pipeline = new NormalDrawPipeline()
    const context = {
      user_id: 1,
      campaign_id: 1,
      idempotency_key: 'test_' + Date.now()
    }
    
    const result = await pipeline.run(context)
    
    expect(result.success).toBe(true)
    expect(result.context.stage_results).toHaveProperty('LoadCampaignStage')
    expect(result.context.stage_results).toHaveProperty('EligibilityStage')
    expect(result.context.stage_results).toHaveProperty('PricingStage')
    expect(result.context.stage_results).toHaveProperty('SettleStage')
  })

  it('should fail fast on insufficient points', async () => {
    // ... 测试积分不足场景
  })

  it('should trigger guarantee mechanism', async () => {
    // ... 测试保底触发场景
  })

  it('should respect idempotency', async () => {
    // ... 测试幂等性
  })
})
```

### 6.2 集成测试

```javascript
// tests/integration/DrawOrchestrator.test.js

describe('DrawOrchestrator', () => {
  it('should route to PresetPipeline when preset exists', async () => {
    // 创建预设记录
    await LotteryPreset.create({ ... })
    
    const orchestrator = new DrawOrchestrator()
    const result = await orchestrator.execute({ user_id: 1, campaign_id: 1 })
    
    expect(result.pipeline_type).toBe('preset')
  })

  it('should route to OverridePipeline when override exists', async () => {
    // 创建干预设置
    await LotteryManagementSetting.create({ ... })
    
    const orchestrator = new DrawOrchestrator()
    const result = await orchestrator.execute({ user_id: 1, campaign_id: 1 })
    
    expect(result.pipeline_type).toBe('override')
  })

  it('should fallback to NormalPipeline', async () => {
    const orchestrator = new DrawOrchestrator()
    const result = await orchestrator.execute({ user_id: 1, campaign_id: 1 })
    
    expect(result.pipeline_type).toBe('normal')
  })
})
```

---

## 7. 迁移检查清单（一次性干净统一版）

### Phase 0: 终态真值规格确认 ✅（已拍板）
- [x] Preset/Override 扣积分：**是**
- [x] 保底规则：按累计次数取模触发
- [x] 连抽记录模型：N 条 draw + N 条 decision + **必须落 batch_id**
- [x] **定价唯一真值**：`lottery_campaign_pricing_config` 表（新表，可版本化）
- [x] **迁移策略**：方案 A2（自动迁移 + 严格模式）
- [x] **版本化能力**：可回滚/可定时生效/多版本
- [x] 定价模式：运营配 `discount`，后端动态计算 `total_cost`
- [x] draw_count 范围：动态 1-20，运营按活动启用/禁用
- [x] 配额唯一真值：`LotteryQuotaService.tryDeductQuota`
- [x] 幂等键派生规则：`{request_key}:consume` / `{request_key}:reward_{n}`
- [x] **档位规则真值**：`lottery_tier_rules` 表（需初始化数据）✅ 已拍板 2026-01-18
- [x] **奖品权重真值**：`win_weight`（整数权重），`win_probability` 仅作展示/导入 ✅ 已拍板 2026-01-18
- [x] **档位划分策略**：自动按 `prize_value_points` 推导（value≥100→high，10-99→mid，<10→low）✅ 已拍板 2026-01-18
- [x] **空奖处理**：按运营配置的权重正常参与概率分配 ✅ 已拍板 2026-01-18
- [x] **分群支持**：一次性做完（默认分群 + 预留 VIP/新用户等多分群）✅ 已拍板 2026-01-18

### 🛡️ 硬护栏检查清单（必须实现，防止计费漏洞）
- [ ] **硬护栏 1**：`PricingStage` 白名单校验 `draw_count` 在活动启用按钮列表（`enabled=true`）中
- [ ] **硬护栏 1**：不在列表中的 `draw_count` 直接返回 400 `INVALID_DRAW_COUNT`
- [ ] **硬护栏 2**：`GET /config/:campaignCode` 配置缺失时返回 400 错误（告知运营先配置）
- [ ] **硬护栏 2**：`POST /draw` 配置缺失时返回 400 错误
- [ ] **硬护栏 2**：`POST /draw` `draw_count` 不在启用列表时返回 400 错误
- [ ] **缓存一致性**：活动配置更新 API 调用 `BusinessCacheHelper.invalidateLotteryCampaign()`
- [ ] **缓存一致性**：确认 `draw_pricing` 修改也触发缓存失效

### Phase 1: 重组统一管线
- [ ] 新增 `LoadDecisionSourceStage.js`（加载 preset/override/normal 决策来源）
- [ ] 新增 `QuotaDeductStage.js`（调用 LotteryQuotaService，原子扣 draw_count）
- [ ] 升级 `PickStage.js`（支持 preset/override/guarantee/normal 四种模式）
- [ ] 合并 3 条管线为 1 条 `UnifiedDrawPipeline.js`
- [ ] 删除 `PresetAwardPipeline.js`、`OverridePipeline.js`（归档）
- [ ] `DrawOrchestrator` 只设置 `context.decision_source`，不再选择管线

### Phase 2: 连抽一等公民化（已拍板 2026-01-18：动态 1-20 + 按活动配置）
- [ ] `EligibilityStage` 增加 `draw_count` 参数验证（范围 1-20，白名单校验活动配置）
- [ ] `PricingStage` 白名单校验 `draw_count` 在活动启用按钮列表中
- [ ] `PricingStage` 用 `单抽成本 × count × discount` 动态计算 `total_cost`
- [ ] `QuotaDeductStage` 一次扣 draw_count 配额
- [ ] `PickStage` 产生 N 个结果（N = draw_count）
- [ ] `SettleStage` 一次事务写入 N 条 draw + N 条 decision
- [ ] 删除 `skip_points_deduction` 隐藏语义（不再对外暴露）
- [ ] 新增 `batch_id` 字段关联连抽批次

### Phase 3: 收敛定价与配额真值（已拍板 2026-01-18：方案 A2）

#### 3.1 新表创建与数据迁移
- [ ] 创建 `lottery_campaign_pricing_config` 表（见 9.2 表结构）
- [ ] 创建 `LotteryCampaignPricingConfig` Sequelize 模型
- [ ] 执行迁移脚本：将活动表 `draw_pricing` 写入新表（见 9.3 脚本）
- [ ] 验证迁移数据完整性：新表记录数 = 活动数

#### 3.2 PricingStage 改造
- [ ] `PricingStage._loadPricingAndValidate()` 改为读 `lottery_campaign_pricing_config` 表
- [ ] 读取逻辑：优先取 `status='active'` 且 `effective_at <= NOW()` 的最新版本
- [ ] `PricingStage` 用 `单抽成本(DB) × count × discount` 动态计算 `total_cost`
- [ ] `PricingStage` 白名单校验 `draw_count` 在活动启用按钮列表中

#### 3.3 配置管理 API
- [ ] 新增定价配置管理 API（CRUD + 版本管理）
- [ ] 新增定价配置回滚 API
- [ ] 新增定价配置定时生效逻辑（定时任务或触发器）
- [ ] 配置变更时精准失效活动缓存

#### 3.4 其他收敛
- [ ] `business.config` 只保留 `max_draw_count = 20`，不再参与定价计算
- [ ] `EligibilityStage` 不再用 `LotteryDraw.count` 自己算配额
- [ ] 配额全部走 `LotteryQuotaService.tryDeductQuota`

### Phase 3.5: 档位规则与奖品权重初始化（已拍板 2026-01-18）

> ⚠️ **前置条件**：当前 `lottery_tier_rules` 表为空，`lottery_prizes.win_weight` 全部为 0

#### 3.5.1 奖品权重迁移（win_probability → win_weight）
- [ ] 编写迁移脚本：`win_weight = Math.round(win_probability * 1000000)`
- [ ] 执行迁移：更新所有活动奖品的 `win_weight` 字段
- [ ] 验证：`win_weight` 总和应与 `win_probability` 总和（缩放后）一致
- [ ] 确认：概率为 0 的奖品（保底专用）`win_weight` 保持为 0

```sql
-- 迁移脚本：win_probability → win_weight（缩放因子 = 1,000,000）
UPDATE lottery_prizes
SET win_weight = ROUND(win_probability * 1000000)
WHERE campaign_id = 1 AND status = 'active';
```

#### 3.5.2 奖品档位自动推导（按 prize_value_points）
- [ ] 编写迁移脚本：根据 `prize_value_points` 更新 `reward_tier`
- [ ] 执行迁移：`value≥100→high，10-99→mid，<10→low`
- [ ] 验证：检查各档位奖品分布是否合理

```sql
-- 迁移脚本：自动推导 reward_tier
UPDATE lottery_prizes
SET reward_tier = CASE
  WHEN prize_value_points >= 100 THEN 'high'
  WHEN prize_value_points >= 10 THEN 'mid'
  ELSE 'low'
END
WHERE campaign_id = 1 AND status = 'active';
```

#### 3.5.3 档位规则表初始化（lottery_tier_rules）
- [ ] 插入默认分群配置（`segment_key='default'`，权重之和 = 1,000,000）
- [ ] 插入新用户分群配置（`segment_key='new_user'`，高档概率翻倍）
- [ ] 插入 VIP 分群配置（`segment_key='vip_user'`，中高档概率提升）
- [ ] 验证：每个分群的三档位权重之和 = 1,000,000

```sql
-- 默认分群（所有用户）
INSERT INTO lottery_tier_rules (campaign_id, segment_key, tier_name, tier_weight, status, created_by)
VALUES
  (1, 'default', 'high',    50000,  'active', 1),  -- 5%
  (1, 'default', 'mid',    150000,  'active', 1),  -- 15%
  (1, 'default', 'low',    800000,  'active', 1);  -- 80%

-- 新用户分群（高档概率翻倍）
INSERT INTO lottery_tier_rules (campaign_id, segment_key, tier_name, tier_weight, status, created_by)
VALUES
  (1, 'new_user', 'high',   100000, 'active', 1),  -- 10%
  (1, 'new_user', 'mid',    200000, 'active', 1),  -- 20%
  (1, 'new_user', 'low',    700000, 'active', 1);  -- 70%

-- VIP 用户分群（中高档概率提升）
INSERT INTO lottery_tier_rules (campaign_id, segment_key, tier_name, tier_weight, status, created_by)
VALUES
  (1, 'vip_user', 'high',    80000, 'active', 1),  -- 8%
  (1, 'vip_user', 'mid',    220000, 'active', 1),  -- 22%
  (1, 'vip_user', 'low',    700000, 'active', 1);  -- 70%
```

#### 3.5.4 Pipeline 代码对齐
- [ ] 确认 `TierPickStage` 使用 `win_weight` 而非 `win_probability`
- [ ] 确认 `PrizePickStage` 使用 `win_weight` 而非 `win_probability`
- [ ] 确认 `BuildPrizePoolStage` 过滤条件使用 `win_weight > 0`
- [ ] 确认 `LoadCampaignStage` 正确加载 `lottery_tier_rules`

### Phase 4: 强化幂等与唯一约束
- [ ] 升级 `lottery_draws.idempotency_key` 为唯一约束（已拍板）
```sql
DROP INDEX idx_lottery_draws_idempotency ON lottery_draws;
CREATE UNIQUE INDEX uk_lottery_draws_idempotency ON lottery_draws(idempotency_key);
```
- [ ] 验证 `lottery_draw_decisions.draw_id` 外键约束
- [ ] 验证 `uk_user_campaign_unique` 唯一索引存在

### Phase 5: 切换入口 + 清理代码
- [ ] `UnifiedLotteryEngine` 初始化 `DrawOrchestrator`
- [ ] 修改 `execute_draw` 调用 `orchestrator.execute`
- [ ] 删除 `_processMultiDraw`（连抽已在管线内部处理）
- [ ] 删除 `getExecutionChain` 和 `initializeStrategies`
- [ ] 归档 `strategies/` 目录
- [ ] 归档 `core/LotteryStrategy.js`
- [ ] **🔴 清理 `services/index.js` 中的 Strategy 引用**
- [ ] **🔴 清理 `routes/v4/console/shared/middleware.js` 中的 Strategy 引用**

### 数据库
- [ ] 执行幂等键唯一约束升级（Phase 4）
- [ ] 新增 `lottery_draws.batch_id` 字段（**必须**，用于连抽批次查询/对账）
- [ ] 确认事务边界正确

### 测试
- [ ] **关键对比测试**：同一参数分别调用旧/新链路，输出必须完全一致
- [ ] 单抽 + Preset 测试（验证 Preset 扣积分）
- [ ] 单抽 + Override 测试（验证 Override 扣积分）
- [ ] 单抽 + 保底触发测试（验证累计次数取模）
- [ ] 5 连抽测试（验证折扣 + 配额 + 保底序号）
- [ ] 10 连抽测试（验证折扣 + 配额 + 保底序号）
- [ ] 幂等性测试（重复请求，验证唯一约束生效）
- [ ] batch_id 查询测试（验证连抽批次聚合）
- [ ] 单元测试全部通过
- [ ] 集成测试全部通过

---

## 8. 总结

### 8.1 迁移前后对比（一次性干净统一版）

| 维度 | 迁移前（Strategy + 3 条管线） | 迁移后（统一管线） |
|------|---------------------------|-------------------|
| 入口 | `execute_draw` → Strategy 链 / 3 条管线分叉 | `execute_draw` → DrawOrchestrator → 1 条统一管线 |
| 管线数量 | Normal + Preset + Override = 3 条 | UnifiedDrawPipeline = 1 条 |
| 编排 | Strategy 内部编排 + 各管线独立结算 | Pipeline 顺序执行，共用 SettleStage |
| 写入点 | 分散在 Strategy + 3 个 *SettleStage | 集中在唯一 SettleStage |
| 连抽处理 | 外层循环 + skip_points_deduction 开关 | 管线一等公民，批量产生 N 结果 |
| 定价真值 | 活动 JSON + setting + config 混合 | 唯一：management_settings |
| 配额真值 | Pipeline 自己 count draw | 唯一：LotteryQuotaService |
| 幂等约束 | 非唯一索引 + 代码约定 | 唯一约束（数据库层） |
| 审计 | 各管线口径不完全一致 | DecisionSnapshotStage 统一结构 |

### 8.2 核心原则确认

✅ **不引入 BaseController/BaseService**
- Controller 层：直接调用 UnifiedLotteryEngine，无继承
- Service 层：AssetService 等保持独立，无继承

✅ **继承仅用于可插拔组件族**
- `BaseStage` → 各 Stage
- `BudgetProvider` → User/Pool/PoolQuota
- `PipelineRunner` → UnifiedDrawPipeline（不再有 3 条分叉）

✅ **入口层保持薄封装 + 组合**
- UnifiedLotteryEngine 仅做参数转换和结果格式化
- 实际逻辑下沉到 Pipeline 各 Stage

✅ **一次性干净统一**
- 结构统一：所有抽奖入口走同一条链路
- 功能统一：所有真值有唯一落点
- 不存在"某条路径漏扣/漏记/漏审计"

### 8.3 已拍板的关键决策（完整版 2026-01-19）

#### 基础架构决策
| 决策点 | 最终决定 | 理由 |
|-------|---------|------|
| **迁移前提** | 项目未上线，可一次性投入，不需兼容旧接口 | 降低迁移复杂度，避免双栈维护成本 |
| **架构目标** | 继续单体 + 模块化，不拆分微服务 | 团队规模适配，避免分布式复杂度 |
| **审计强度** | 每次抽奖都必须落完整决策快照 | 强审计/强可回放，支持客诉/风控/对账 |
| **基类边界** | 仅用于可插拔组件族（Stage/Provider/Pipeline） | 避免基类承载业务逻辑，保持架构清晰 |

#### 终态语义决策（核心拍板 2026-01-19）
| 决策点 | 最终决定 | 理由 |
|-------|---------|------|
| **Preset/Override 是否扣积分** | ✅ 扣 | 旧 `execute_draw` 是统一先扣积分再决定结果，避免经济分叉 |
| **保底规则** | 按累计次数取模触发（当前代码实现） | 不引入"触发后重置"状态机，避免新表/新一致性 |
| **连抽记录模型** | N 条 draw + N 条 decision + **必须落 batch_id** | 方便连抽批次查询/对账，不新建复杂 batch 表 |

#### 连抽语义决策（已拍板 2026-01-18）
| 决策点 | 最终决定 | 理由 |
|-------|---------|------|
| **支持的连抽档位** | **动态 1-20**（运营可配置） | 能力上限放宽，运营按活动选择展示哪些按钮 |
| **按钮配置粒度** | **按活动（campaign）独立** | 不同活动可展示不同连抽按钮，灵活性更高 |
| **定价模式** | **运营配 discount**，后端计算 total_cost | `total_cost = 单抽成本 × count × discount`，抗改价 |
| **draw_count 校验** | **白名单校验**（活动启用的按钮列表） | 防止客户端传未配置的次数导致计费漏洞 |
| **积分扣减** | 统一扣一次（consume） | 连抽升级为一等公民，消除隐藏语义 |
| **配额扣减** | 一次原子扣 draw_count | 使用 LotteryQuotaService.tryDeductQuota |
| **保底计算** | 在 N 次内部按顺序计算 | 第几抽触发保底必须一致 |

#### 真值收敛决策（已拍板 2026-01-18：方案 A2）
| 决策点 | 最终决定 | 理由 |
|-------|---------|------|
| **定价唯一真值** | **新表 `lottery_campaign_pricing_config`** | 支持版本化/回滚/定时生效，比活动 JSON 更强 |
| **迁移策略** | **方案 A2**：自动迁移 + 严格模式 | 迁移时自动写入新表，之后活动 JSON 仅作默认模板 |
| **版本化能力** | ✅ 可回滚/可定时生效/多版本 | 支持运营预配置、AB测试、紧急回滚等场景 |
| **定价模式** | 运营配 `discount`，后端动态计算 `total_cost` | 抗单抽成本变更，减少配置错误 |
| **draw_count 范围** | 1-20（运营按活动启用/禁用） | 能力上限 20，灵活性与安全性兼顾 |
| **配额唯一真值** | `LotteryQuotaService.tryDeductQuota` | 已有成熟实现，支持四维度配额 |

#### 幂等与约束决策
| 决策点 | 最终决定 | 理由 |
|-------|---------|------|
| **幂等键派生规则** | `{request_key}:consume` / `{request_key}:reward_{n}` | 与旧链路一致 |
| **数据库约束** | `lottery_draws.idempotency_key` 升级为唯一约束 | 幂等靠结构而非约定 |

### 8.4 成本与收益评估（一次性干净统一版）

**迁移成本**：
- 开发工时：约 5-8 人天（统一管线重组 + 连抽一等公民化 + 测试）
- 数据库改动：幂等键唯一约束升级、batch_id 字段新增
- 存储成本：每次抽奖 2-5KB 决策快照，日均 1 万次约 20-50MB/天

**迁移收益**：
- **结构干净**：从 3 条管线收敛为 1 条，消除重复结算代码
- **功能统一**：所有模式（Normal/Preset/Override）共用同一套审计
- **语义清晰**：连抽是一等公民，不再有隐藏开关
- **真值唯一**：定价/配额/幂等都有唯一落点
- **可扩展**：新增玩法只需实现新 Stage，不改主流程
- **可审计**：完整决策快照，支持客诉仲裁/风控追溯/对账复盘
- **可维护**：单一主链路，降低 50%+ 维护成本

---

## 9. 定价规则配置详细说明

### 9.1 定价唯一真值来源（已拍板 2026-01-18：方案 A2）

> ⚠️ **核心变更**：新建活动级定价配置表（可版本化/可回滚/可定时生效）

```
迁移策略（方案 A2 已拍板）：
┌────────────────────────────────────────────────────────────────────────┐
│ 旧架构                           │ 新架构（终态）                        │
├────────────────────────────────────────────────────────────────────────┤
│ lottery_campaigns                │ lottery_campaign_pricing_config      │
│   .prize_distribution_config     │   （新表，可版本化/可回滚/可定时生效）  │
│   .draw_pricing (JSON)           │                                      │
│        ↓                         │                                      │
│   运行时真值                      │   运行时唯一真值                      │
└────────────────────────────────────────────────────────────────────────┘
         │                                         ↑
         └─── 迁移脚本自动写入 ───────────────────────┘

迁移后角色分工：
- lottery_campaigns.prize_distribution_config.draw_pricing
  → 仅作为"创建活动时的默认模板"
  → 不再作为运行时真值

- lottery_campaign_pricing_config（新表）
  → 运行时唯一真值
  → 支持版本化、定时生效、回滚
```

**为什么选择方案 A2（新建活动级定价配置表）**：
| 对比项 | 活动 JSON 直接读写 | 新表方案（A2） |
|-------|------------------|---------------|
| 版本化 | ❌ 不支持 | ✅ 多版本共存 |
| 回滚 | ❌ 手动改回 | ✅ 一键回滚到历史版本 |
| 定时生效 | ❌ 不支持 | ✅ 预配置 + 定时切换 |
| 审计追溯 | ❌ 需查 JSON 变更记录 | ✅ 独立审计表 |
| AB测试 | ❌ 不支持 | ✅ 可按用户分群生效不同版本 |

### 9.2 新表设计：lottery_campaign_pricing_config（已拍板 2026-01-18）

> ⚠️ **唯一真值**：`lottery_campaign_pricing_config` 表（按活动独立，可版本化）

```sql
-- 活动级定价配置表（可版本化/可回滚/可定时生效）
CREATE TABLE lottery_campaign_pricing_config (
  config_id         VARCHAR(50) PRIMARY KEY COMMENT '配置唯一ID（格式：pricing_时间戳_随机码）',
  campaign_id       INT NOT NULL COMMENT '活动ID',
  version           INT NOT NULL DEFAULT 1 COMMENT '版本号（同一活动递增）',
  
  -- 定价配置（JSON）
  pricing_config    JSON NOT NULL COMMENT '定价配置（draw_buttons 数组）',
  
  -- 版本控制
  status            ENUM('draft', 'active', 'scheduled', 'archived') NOT NULL DEFAULT 'draft'
                    COMMENT 'draft-草稿, active-生效中, scheduled-待生效, archived-已归档',
  effective_at      DATETIME NULL COMMENT '生效时间（NULL=立即生效）',
  expired_at        DATETIME NULL COMMENT '过期时间（NULL=永不过期）',
  
  -- 审计字段
  created_by        INT NOT NULL COMMENT '创建人ID',
  updated_by        INT NULL COMMENT '最后修改人ID',
  created_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  -- 索引
  INDEX idx_campaign_status (campaign_id, status),
  INDEX idx_campaign_version (campaign_id, version),
  INDEX idx_effective_at (effective_at),
  
  -- 唯一约束：同一活动同一版本只能有一条记录
  UNIQUE KEY uk_campaign_version (campaign_id, version)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='活动级定价配置表（可版本化）';
```

**pricing_config JSON 结构**（已拍板 2026-01-19：5连无折扣，运营可动态调整）：

```jsonc
{
  "draw_buttons": [
    // 🎯 A方案已拍板：5连抽默认无折扣，10连抽9折；运营可随时修改 discount 字段
    { "count": 1,  "discount": 1.0,  "label": "单抽",           "enabled": true,  "sort_order": 1 },
    { "count": 3,  "discount": 1.0,  "label": "3连抽",          "enabled": false, "sort_order": 2 },
    { "count": 5,  "discount": 1.0,  "label": "5连抽",          "enabled": true,  "sort_order": 3 },  // A方案：无折扣
    { "count": 10, "discount": 0.90, "label": "10连抽 9折",     "enabled": true,  "sort_order": 4 },
    { "count": 20, "discount": 0.85, "label": "20连抽 85折",    "enabled": false, "sort_order": 5 }
  ]
}
```

**折扣动态调整说明**：
- 运营可通过管理后台随时修改任意档位的 `discount` 字段
- 修改后创建新版本配置（version 递增），支持回滚
- 可配置 `effective_at` 实现定时生效（如限时活动折扣）

### 9.3 迁移脚本设计（方案 A2：自动迁移 + 严格模式）

```javascript
/**
 * 定价配置迁移脚本
 * 
 * 执行时机：迁移部署时一次性执行
 * 功能：将活动表的 draw_pricing JSON 迁移到新的 pricing_config 表
 */
async function migratePricingConfig(transaction) {
  // 1. 查询所有活动的 draw_pricing 配置
  const campaigns = await LotteryCampaign.findAll({
    attributes: ['campaign_id', 'prize_distribution_config'],
    transaction
  })
  
  for (const campaign of campaigns) {
    const draw_pricing = campaign.prize_distribution_config?.draw_pricing
    
    if (!draw_pricing) {
      console.warn(`活动 ${campaign.campaign_id} 缺少 draw_pricing，跳过迁移`)
      continue
    }
    
    // 2. 写入新表（版本 1，状态 active）
    await LotteryCampaignPricingConfig.create({
      config_id: generateConfigId(),
      campaign_id: campaign.campaign_id,
      version: 1,
      pricing_config: { draw_buttons: normalizeDrawButtons(draw_pricing) },
      status: 'active',
      effective_at: null,  // 立即生效
      created_by: 1,       // 系统迁移
    }, { transaction })
    
    console.log(`活动 ${campaign.campaign_id} 定价配置迁移成功`)
  }
}

/**
 * 标准化 draw_buttons 结构
 * 兼容旧格式（single/triple/five/ten）到新格式（draw_buttons 数组）
 */
function normalizeDrawButtons(draw_pricing) {
  // 如果已经是新格式，直接返回
  if (draw_pricing.draw_buttons) {
    return draw_pricing.draw_buttons
  }
  
  // 旧格式转换
  const mapping = { single: 1, triple: 3, five: 5, ten: 10 }
  const buttons = []
  
  for (const [key, config] of Object.entries(draw_pricing)) {
    const count = mapping[key] || parseInt(key)
    if (!count) continue
    
    buttons.push({
      count,
      discount: config.discount || 1.0,
      label: config.label || `${count}连抽`,
      enabled: true,  // 旧配置默认全部启用
      sort_order: count
    })
  }
  
  return buttons.sort((a, b) => a.sort_order - b.sort_order)
}
```

### 9.4 PricingStage 读取逻辑（新表版本，已拍板 2026-01-19 更新）

```jsonc
// lottery_campaigns.prize_distribution_config.draw_pricing 字段示例
// 运营只配 count + discount + label + enabled，后端动态计算 total_cost/per_draw
// 🎯 已拍板：A方案 5连无折扣，运营可动态调整 discount
{
  "draw_buttons": [
    { "count": 1,  "discount": 1.0,  "label": "单抽",           "enabled": true,  "sort_order": 1 },
    { "count": 3,  "discount": 1.0,  "label": "3连抽",          "enabled": false, "sort_order": 2 },
    { "count": 5,  "discount": 1.0,  "label": "5连抽",          "enabled": true,  "sort_order": 3 },  // A方案：无折扣
    { "count": 10, "discount": 0.90, "label": "10连抽 9折",     "enabled": true,  "sort_order": 4 },
    { "count": 20, "discount": 0.85, "label": "20连抽 85折",    "enabled": false, "sort_order": 5 }
  ]
}
```

**字段说明**：
| 字段 | 类型 | 必填 | 说明 |
|-----|------|-----|------|
| count | number | ✅ | 抽奖次数（1-20） |
| discount | number | ✅ | 折扣率（1.0=无折扣，0.9=九折） |
| label | string | ✅ | 前端按钮显示文案 |
| enabled | boolean | ✅ | 是否启用（前端只渲染 enabled=true 的按钮） |
| sort_order | number | ✅ | 按钮排序（前端按此排序） |

**后端计算规则**：
```javascript
// 单抽成本从 DB 读取（system_settings.lottery_cost_points）
const base_cost = await AdminSystemService.getSettingValue('points', 'lottery_cost_points', null, { strict: true })

// 动态计算定价
const total_cost = Math.floor(base_cost * button.count * button.discount)
const per_draw = Math.floor(base_cost * button.discount)
const saved_points = base_cost * button.count - total_cost
```

**为什么选择"运营配 discount"而非"运营配 total_cost"**：
- ✅ 抗改价：单抽成本调整时，所有连抽按钮自动跟随，无需逐个手动改
- ✅ 减少配置错误：运营只需关注"打几折"，不用手算总价
- ✅ 审计清晰：`total_cost = 单抽成本 × count × discount`，计算链路透明

### 9.3 PricingStage 读取逻辑（严格报错 + draw_count 白名单校验，已拍板 2026-01-18）

```javascript
/**
 * 加载定价配置并计算价格
 * 
 * 唯一真值来源：lottery_campaigns.prize_distribution_config.draw_pricing
 * 定价模式：运营配 discount，后端动态计算 total_cost
 */
async _loadPricingAndValidate(campaign, draw_count) {
  const draw_pricing = campaign.prize_distribution_config?.draw_pricing
  
  // 🔴 严格报错阻断：配置缺失直接拒绝
  if (!draw_pricing?.draw_buttons || draw_pricing.draw_buttons.length === 0) {
    throw this.createError(
      `活动 ${campaign.campaign_id} 缺少定价配置，请先配置 prize_distribution_config.draw_pricing`,
      'PRICING_CONFIG_MISSING',
      false
    )
  }
  
  // 🔴 白名单校验：draw_count 必须在活动配置的启用按钮列表中
  const enabled_buttons = draw_pricing.draw_buttons.filter(b => b.enabled === true)
  const matched_button = enabled_buttons.find(b => b.count === draw_count)
  
  if (!matched_button) {
    const allowed_counts = enabled_buttons.map(b => b.count).join('/')
    throw this.createError(
      `不支持的抽奖次数 ${draw_count}，该活动仅支持 ${allowed_counts}`,
      'INVALID_DRAW_COUNT',
      false
    )
  }
  
  // 🎯 动态计算定价（运营配 discount，后端算 total_cost）
  const AdminSystemService = require('../../AdminSystemService')
  const base_cost = await AdminSystemService.getSettingValue(
    'points', 'lottery_cost_points', null, { strict: true }
  )
  
  const total_cost = Math.floor(base_cost * matched_button.count * matched_button.discount)
  const per_draw = Math.floor(base_cost * matched_button.discount)
  const original_cost = base_cost * matched_button.count
  const saved_points = original_cost - total_cost
  
  this.log('info', '定价计算完成', {
    campaign_id: campaign.campaign_id,
    draw_count,
    base_cost,
    discount: matched_button.discount,
    total_cost,
    saved_points
  })
  
  return {
    total_cost,
    per_draw,
    original_cost,
    discount: matched_button.discount,
    label: matched_button.label,
    saved_points,
    pricing_source: 'campaign'
  }
}
```

### 9.4 前端获取按钮列表逻辑

```javascript
// GET /api/v4/lottery/config/:campaignCode 返回示例
// 🎯 已拍板 2026-01-19：A方案 5连无折扣，运营可动态调整
{
  "draw_pricing": {
    "draw_buttons": [
      // 只返回 enabled=true 的按钮，按 sort_order 排序
      { "count": 1,  "discount": 1.0,  "label": "单抽",       "per_draw": 100, "total_cost": 100,  "saved_points": 0 },
      { "count": 5,  "discount": 1.0,  "label": "5连抽",      "per_draw": 100, "total_cost": 500,  "saved_points": 0 },   // A方案
      { "count": 10, "discount": 0.90, "label": "10连抽 9折", "per_draw": 90,  "total_cost": 900,  "saved_points": 100 }
    ]
  }
}
```

**前端渲染规则**：
- 只渲染返回的按钮（后端已过滤 `enabled=false` 的）
- 按 `sort_order` 排序展示
- 用户点击按钮时，传对应的 `count` 给后端

---

## 10. 迁移风险与缓解措施

### 10.1 已识别的风险（一次性干净统一版）

| 风险点 | 风险等级 | 缓解措施 | 状态 |
|-------|---------|---------|------|
| 定价规则不一致 | 🔴 高 | 定价唯一真值收敛到活动表 `draw_pricing`，运营配 discount | ✅ 已拍板 |
| **draw_count 计费漏洞** | 🔴 高 | **🛡️ 硬护栏 1**：白名单校验，不在启用列表直接 400 | ✅ 已拍板 |
| **前后端校验不一致** | 🔴 高 | **🛡️ 硬护栏 2**：/config 和 /draw 两处严格一致报错 | ✅ 已拍板 |
| **配置更新延迟生效** | 🟡 中 | 运营改配置后精准失效活动缓存 | ✅ 已拍板 |
| 幂等键派生不一致 | 🔴 高 | 沿用 `:consume` / `:reward_n` 规则 + 升级数据库唯一约束 | ✅ 已拍板 |
| 连抽扣减语义变化 | 🔴 高 | 连抽升级为一等公民，管线内部批量处理，删除隐藏开关 | ✅ 已拍板 |
| Preset/Override 扣费分叉 | 🔴 高 | 统一扣积分（与 Normal 一致） | ✅ 已拍板 |
| 保底规则状态机复杂化 | 🟡 中 | 保持累计次数取模，不引入"触发后重置" | ✅ 已拍板 |
| 连抽记录模型复杂化 | 🟡 中 | N 条 draw + N 条 decision + **必须落 batch_id**，不新建 batch 表 | ✅ 已拍板 |
| 配额真值分散 | 🟡 中 | 配额唯一真值收敛到 LotteryQuotaService | ✅ 已拍板 |
| 3 条管线合并风险 | 🟡 中 | PickStage 支持 4 种模式（preset/override/guarantee/normal），充分测试 | 待实现 |
| 返回结构不兼容 | 🟢 低 | `_formatResult()` 必须输出与旧链路相同的字段集 | 待验证 |
| 其他调用点遗漏 | 🟢 低 | Phase 4 前扫描所有 Strategy 引用，逐个确认 |

### 10.2 验证策略

```
迁移验证三步走：

1. 对比测试（必须）
   - 同一参数分别调用旧/新链路
   - 比对输出结构、定价结果、幂等行为
   - 任何差异都是阻塞项

2. 灰度验证（建议）
   - 新链路先用于内部测试活动
   - 观察审计日志、资产流水、错误率
   - 确认无异常后再切换主链路

3. 回归测试（必须）
   - 单抽/5连/10连全覆盖
   - 保底触发场景
   - 预设队列场景
   - 管理干预场景
```

---

**文档生成时间**: 2026-01-18  
**最后更新**: 2026-01-19（新增 Strategy 清理时机拍板：A方案一次性切换）  
**数据来源**: 真实代码与数据库（`restaurant_points_dev`，MySQL 8.0.42）  
**适用版本**: 抽奖模块 v4.x → v5.x（一次性干净统一重构）

---

## 附录：拍板决策时间线

| 日期 | 决策内容 |
|-----|---------|
| 2026-01-18 | 迁移前提确认（未上线、一次性投入、不兼容旧接口） |
| 2026-01-18 | 架构目标确认（单体 + 模块化） |
| 2026-01-18 | 审计强度确认（每次抽奖落完整决策快照） |
| 2026-01-18 | **连抽档位拍板**：动态范围 1-20（运营可配置） ✅ |
| 2026-01-18 | **按钮配置粒度拍板**：按活动（campaign）独立 ✅ |
| 2026-01-18 | **定价模式拍板**：运营配 discount，后端动态计算 total_cost ✅ |
| 2026-01-18 | **配置缺失策略拍板**：严格报错阻断（不兜底） ✅ |
| 2026-01-18 | **draw_count 校验拍板**：白名单校验（活动启用的按钮列表） ✅ |
| 2026-01-18 | **🛡️ 硬护栏 1 拍板**：draw_count 必须在活动配置启用列表中，否则 400 ✅ |
| 2026-01-18 | **🛡️ 硬护栏 2 拍板**：前端/后端两处严格一致报错（/config + /draw） ✅ |
| 2026-01-18 | **缓存一致性拍板**：运营改配置后精准失效活动缓存 ✅ |
| 2026-01-18 | **定价迁移策略拍板**：方案 A2（新建活动级定价配置表 + 自动迁移 + 严格模式） ✅ |
| 2026-01-18 | **定价真值落点拍板**：新表 `lottery_campaign_pricing_config`（不用 management_settings） ✅ |
| 2026-01-18 | **版本化能力拍板**：可回滚/可定时生效/多版本 ✅ |
| 2026-01-19 | **终态语义拍板**：Preset/Override 扣积分 ✅ |
| 2026-01-19 | **终态语义拍板**：保底规则按累计次数取模触发 ✅ |
| 2026-01-19 | **终态语义拍板**：连抽记录 N 条 draw + N 条 decision + batch_id ✅ |
| 2026-01-19 | **一次性干净统一**：3 条管线收敛为 1 条统一管线 ✅ |
| 2026-01-19 | **一次性干净统一**：连抽升级为一等公民，删除隐藏开关 ✅ |
| 2026-01-19 | **一次性干净统一**：定价/配额收敛到唯一真值 ✅ |
| 2026-01-19 | **一次性干净统一**：幂等键升级为数据库唯一约束 ✅ |
| 2026-01-19 | **数据管理拍板**：batch_id 必须落库（方便连抽批次查询/对账） ✅ |
| 2026-01-19 | **数据管理拍板**：定价配置缺失时严格报错阻断（不兜底） ✅ |
| 2026-01-19 | **数据管理拍板**：决策快照保留策略 90 天热数据 + 归档 ✅ |
| 2026-01-18 | **档位规则拍板**：迁移时初始化 `lottery_tier_rules` 表（A 方案） ✅ |
| 2026-01-18 | **奖品权重拍板**：以 `win_weight`（整数权重）为真值，`win_probability` 仅作展示/导入 ✅ |
| 2026-01-18 | **档位划分拍板**：自动按 `prize_value_points` 推导（B 方案：value≥100→high，10-99→mid，<10→low） ✅ |
| 2026-01-18 | **空奖处理拍板**：按运营配置的权重正常参与概率分配（不做特殊处理） ✅ |
| 2026-01-18 | **分群支持拍板**：一次性做完（默认分群 + 预留 VIP/新用户等多分群） ✅ |
| 2026-01-19 | **5连抽折扣策略拍板**：A方案（默认无折扣，5连定位"便捷包"，10连定位"价值锚点"） ✅ |
| 2026-01-19 | **折扣动态调整能力拍板**：运营可随时修改任意档位的 discount（通过版本化配置表） ✅ |
| 2026-01-19 | **Strategy 清理时机拍板**：A方案（一次性切换，UnifiedLotteryEngine 直接调用 DrawOrchestrator，归档 Strategy） ✅ |

