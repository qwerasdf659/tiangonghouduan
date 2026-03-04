# 双配额体系下 Budget Tier 概率门控失效问题与重构方案

> **本文档解决的问题**：抽奖经济模型引入 DIAMOND_QUOTA + BUDGET_POINTS 双配额体系后，`BudgetTierCalculator._calculateDynamicThresholds` 因 DIAMOND 奖品的 `prize_value_points=0` 导致动态阈值坍塌为 0，所有用户无论预算多少均被判定为 B3（最高档），Budget Tier 概率门控体系完全失效。本文档分析根因、对比行业方案、给出适合本项目的重构方案。
>
> 创建日期：2026-03-04
>
> **拍板记录（2026-03-04）**：
> - 决策 1：**采纳** — Budget Tier 降级为纯监控指标，概率层只保留 Pressure Tier，资格全靠资源级过滤
> - 决策 2：**确认** — Pressure-Only 矩阵数值（P0: high=1.3/mid=1.1/low=0.9/fb=0.8, P1: 全 1.0, P2: high=0.6/mid=0.8/low=1.2/fb=1.5）
> - 决策 3：**清理旧数据** — `lottery_tier_matrix_config` 表 ALTER ENUM 加 'ALL'，删除旧 B0-B3 共 12 行，写入 3 行 budget_tier='ALL' 的 P0/P1/P2 数据
> - 决策 4：**采纳方案 B** — ALTER ENUM('B0','B1','B2','B3','ALL')，删旧插新，DB 层面最干净
> - 决策 5：**采纳方案 A** — Web 管理后台矩阵编辑 UI 简化为 1×3 网格（只显示 P0/P1/P2）
> - 决策 6：**采纳** — `updateMatrix` 修复为更新全部 6 个乘数字段（cap/empty + high/mid/low/fallback），DB 为唯一权威数据源
> - 决策 7：**采纳方案 A** — 两套矩阵合并为一套，TierMatrixCalculator 统一管理全部 6 字段，ComputeConfig 不再维护独立 TIER_MATRIX_CONFIG
> - 决策 8：**采纳方案 A** — SettleStage._createDrawRecord 将 budget_tier/pressure_tier 写入 lottery_draws.result_metadata JSON 字段

---

## 零、项目实际技术栈与真实数据验证

> 以下所有内容均基于 2026-03-04 对后端代码仓库和线上数据库 `restaurant_points_dev` 的实际查询验证，不引用任何历史报告或其他文档。

### 0.1 技术栈总览

| 层 | 技术 | 版本 |
|---|---|---|
| **后端运行时** | Node.js | ≥ 20.18 |
| **Web 框架** | Express | 4.18 |
| **ORM** | Sequelize | 6.35 |
| **数据库驱动** | mysql2 | 3.6 |
| **数据库** | MySQL（Sealos 托管） | — |
| **缓存** | ioredis | 5.7 |
| **实时通信** | socket.io | 4.8 |
| **Web 管理后台前端** | Alpine.js + Vite 6 + Tailwind CSS + EJS | — |
| **微信小程序前端** | **不在本仓库**，独立代码库 | — |

### 0.2 数据库真实数据验证

**`lottery_tier_matrix_config` 表**（12 行，全部属于 campaign_id=1）：
- 当前存有 B0×P0, B0×P1, B0×P2, B1×P0 ... B3×P2 共 12 条
- `budget_tier` 字段类型 `ENUM('B0','B1','B2','B3') NOT NULL`
- 唯一索引 `(lottery_campaign_id, budget_tier, pressure_tier)`
- 当前 B3×P2 行 high_multiplier=0.60, low_multiplier=1.20 — 即文档 4.3 中已确认的 P2 数值

**`lottery_prizes` 表**（campaign_id=1，未删除的 8 条奖品，完整数据）：

| id | prize_name | material_asset_code | material_amount | prize_value_points | reward_tier | is_fallback | win_weight |
|---|---|---|---|---|---|---|---|
| 163 | 四人鸳鸯锅套餐 | null | null | 20 | high | 0 | 200000 |
| 164 | 八折优惠券 | null | null | 15 | high | 0 | 800000 |
| 165 | 招牌虾滑1份 | null | null | 10 | mid | 0 | 400000 |
| 166 | 精酿啤酒1杯 | null | null | 8 | mid | 0 | 350000 |
| 167 | 九五折券 | null | null | 5 | mid | 0 | 250000 |
| 168 | 钻石x1 | DIAMOND | 1 | 0 | low | 0 | 300000 |
| 169 | 幸运5积分 | null | null | 1 | low | 0 | 350000 |
| 170 | 幸运5积分 | null | null | 0 | low | 1 | 350000 |

- id=168 `钻石x1` — **触发 bug 的奖品**：`material_asset_code='DIAMOND'`, pvp=0
- id=170 — fallback 保底奖品，pvp=0
- high 档（id=163/164）和 mid 档（id=165/166/167）全部为非 DIAMOND 奖品，pvp>0

**`lottery_campaigns` 表**：仅 campaign_id=1 为 active 状态（3763 次抽奖，1570 参与者）

**`lottery_strategy_config` 表**（campaign_id=1，28 条配置）：
- `matrix.enabled=true`，`pressure_tier.enabled=true`
- `anti_empty.empty_streak_threshold=5`，`pity.hard_guarantee_threshold=10`
- `grayscale.pity_percentage=52`（灰度 52%）
- `tier_fallback.prize_id=170`（指向 fallback 保底奖品）

**`lottery_draws` 表**：`result_metadata` 为 JSON 字段，实际查询 `JSON_EXTRACT(result_metadata, '$.budget_tier')` 返回 null — **budget_tier 未被写入 result_metadata**

### 0.3 后端代码实际状态

| 文件 | 当前状态 |
|---|---|
| `BuildPrizePoolStage.js` | `_filterByResourceEligibility` **已实现**（DIAMOND→配额检查，碎片→预算检查，pvp=0→通过），`_filterByAllowedTiers` 已废弃不被 execute() 调用 |
| `TierMatrixCalculator.js` | **仍使用 B0-B3 × P0-P2** 的 DEFAULT_TIER_MATRIX，calculate() 接收 budget_tier 参数 |
| `ComputeConfig.js` | **仍导出** BUDGET_TIER_AVAILABILITY, TIER_MATRIX_CONFIG（含 B0-B3），`getMatrixValue(budget_tier, pressure_tier)` 返回 cap/empty 两字段 |
| `TierPickStage.js` | **仍从** BuildPrizePoolStage 读取 budget_tier（默认 'B1'）传给 computeWeightAdjustment |
| `LotteryComputeEngine.js` | computeWeightAdjustment **仍接收** budget_tier 参数，委托给 TierMatrixCalculator |
| `BudgetTierCalculator.js` | **仍完整运行**，`_calculateDynamicThresholds` 用 pvp 计算阈值（DIAMOND pvp=0 导致坍塌），TIER_AVAILABILITY 定义 B0=['low','fallback'] |
| `models/LotteryTierMatrixConfig.js` | budget_tier 字段为 `ENUM('B0','B1','B2','B3') NOT NULL` |

#### 0.3.1 新发现的代码级问题（2026-03-04 数据库实查确认）

| 发现项 | 当前实际状态 | 影响 |
|---|---|---|
| **`updateMatrix` 字段缺失** | `LotteryTierMatrixConfig.updateMatrix()` 只更新 `cap_multiplier` 和 `empty_weight_multiplier`，**不更新** `high/mid/low/fallback_multiplier` | 管理后台无法通过 API 编辑权重乘数，DB 中 high/mid/low/fallback 值为迁移初始化值，不可运营调整 |
| **两套矩阵并存** | `ComputeConfig.TIER_MATRIX_CONFIG`（cap/empty 两字段）与 `TierMatrixCalculator.DEFAULT_TIER_MATRIX`（high/mid/low/fallback 四字段）服务不同计算路径 | 语义重叠，维护成本高，管理后台只能编辑 cap/empty |
| **权重乘数来源为硬编码** | `TierMatrixCalculator` 运行时使用的 `DEFAULT_TIER_MATRIX` 是代码硬编码值；`loadFromDatabase` 方法存在但走 DynamicConfigLoader 三层优先级（DB→环境变量→硬编码） | DB 中 high/mid/low/fallback 字段有值但未被运行时权重调整路径有效读取 |
| **result_metadata 监控断裂** | `SettleStage._createDrawRecord` **未将** `budget_tier` 写入 `lottery_draws.result_metadata` JSON 字段 | 文档计划的 "budget_tier 作为监控指标写入 result_metadata" 路径实际不通 |
| **已跑迁移 vs 待建迁移** | 2026-03-04 已有 3 个迁移（测试数据清理、B0 low_multiplier 修复、DIAMOND pvp=0 设置）— **Pressure-Only ALTER ENUM 迁移尚未创建** | 步骤 1 迁移为全新迁移，不与已有迁移冲突 |

### 0.4 Web 管理后台前端实际状态

| 文件 | 当前状态 |
|---|---|
| `admin/src/modules/lottery/composables/strategy.js` | 硬编码 `budgetTiers: ['B0','B1','B2','B3']`，editMatrixCell 操作 budget_tier 字段 |
| `admin/src/modules/lottery/composables/strategy-simulation.js` | matrix_config 对象含 budget_tier、pressure_tier 字段 |
| `admin/lottery-management.html` | BxPx 矩阵 UI 渲染 4×3 网格，按 budget_tier × pressure_tier 循环 |

### 0.5 微信小程序前端

微信小程序前端代码**不在本仓库**。后端为小程序提供的抽奖 API 为 `POST /api/v4/lottery/draw`，返回结果中 `result_metadata` 为 JSON 字段（当前实际未写入 budget_tier，见 B10）。小程序端不消费 budget_tier 做任何 UI 逻辑。**本次重构不涉及微信小程序前端改动。**

---

## 一、问题现象

### 1.1 复现场景

用户 BUDGET_POINTS = 0（红水晶碎片配额耗尽），DIAMOND_QUOTA = 300（钻石配额充足）。

**预期行为**：Budget Tier = B0，BxPx 矩阵大幅压低非空奖概率（empty_weight_multiplier = 10.0），用户几乎只能抽到 low 档的免费奖品。

**实际行为**：Budget Tier = B3，所有档位概率正常，用户以 5% 概率抽到 high 档钻石奖品。

### 1.2 问题追踪

```
BudgetTierCalculator._calculateDynamicThresholds(prizes)
  ↓
高档 prizes: [钻石×600(pvp=0), 钻石×180(pvp=0)]
  → getMinPositiveCost([0, 0]) = null → 阈值 = 0
  ↓
保序修正: mid(80) > high(0) → mid = 0
  ↓
最终阈值: high=0, mid=0, low=6
  ↓
effective_budget(0) >= threshold_high(0) → true → B3
```

根因：`_calculateDynamicThresholds` 用 `prize_value_points` 计算各档位的准入门槛，但 DIAMOND 奖品的 pvp=0（它们不消耗 BUDGET_POINTS，成本由 `material_amount` 对 `DIAMOND_QUOTA` 衡量）。当某档位仅含 DIAMOND 奖品时，该档位阈值被计算为 0，保序修正进一步将下游阈值拉低，导致整个阈值体系坍塌。

### 1.3 影响范围

| 影响项 | 说明 |
|---|---|
| Budget Tier 分层 | B0/B1/B2 不可达，所有用户恒为 B3 |
| BxPx 矩阵 | B0 行（empty_weight_multiplier=10.0）永远不会被命中 |
| BUDGET_TIER_AVAILABILITY | B0=['low','fallback'] 的档位限制失效 |
| 经济安全性 | 资源级过滤（_filterByResourceEligibility）仍然有效，不会超发，但概率分配不符合设计意图 |

---

## 二、问题本质分析

### 2.1 两层职责重叠

当前架构中，**资格控制**存在两层：

```
第一层：BuildPrizePoolStage._filterByResourceEligibility（资源级过滤）
  → 按单个奖品的资源类型独立判断：DIAMOND→配额检查，碎片→预算检查，pvp=0→通过
  → 过滤后的奖品池保证用户只能抽到"买得起"的奖品

第二层：BudgetTierCalculator + TierMatrixCalculator（概率门控）
  → 根据 BUDGET_POINTS 计算 Budget Tier
  → BxPx 矩阵根据 Budget Tier 调整各档位概率权重
  → 试图通过概率压低来限制低预算用户
```

第一层已经**完整解决**了资格问题：BUDGET_POINTS=0 的用户，所有碎片类奖品已被移除，剩余的钻石奖品由 DIAMOND_QUOTA 独立控制。第二层的 Budget Tier 概率门控是**多余的重复控制**，且在双配额体系下无法正确工作。

### 2.2 _calculateDynamicThresholds 的设计假设已失效

该函数的设计假设：**所有有价值的奖品都通过 prize_value_points 消耗 BUDGET_POINTS**。

在单配额时代（只有 BUDGET_POINTS），这个假设成立。引入 DIAMOND_QUOTA 后，钻石奖品的成本维度变成了 `material_amount` 对 `DIAMOND_QUOTA`，pvp=0 不代表"免费"，而是"不消耗这种资源"。函数无法区分"真正免费的保底"和"走其他配额的钻石奖品"。

### 2.3 修补方案（排除 DIAMOND 计算阈值）的局限性

一种思路是在 `_calculateDynamicThresholds` 中排除 `material_asset_code='DIAMOND'` 的奖品。这能解决当前问题，但存在长期风险：

- 每新增一种资源类型（如"金券配额"），都需要在阈值计算中增加排除规则
- Budget Tier 概率门控与资源级过滤的职责重叠问题依然存在
- BxPx 矩阵的预算维度（Bx）在多资源场景下语义模糊：B0 是"BUDGET_POINTS 不足"还是"所有配额不足"？

---

## 三、行业方案对比

### 3.1 四种主流设计流派

| 流派 | 代表 | 资格控制方式 | 概率层是否感知资源 |
|---|---|---|---|
| A. 单池统一预算 | 线下扫码抽奖、简单红包活动 | 一种预算管一切 | 否（只有一种资源） |
| B. 多池独立 | 原神、崩坏星穹铁道、王者荣耀 | 每个池子物理隔离，独立保底 | 否（每池只有一种资源） |
| C. 单池多资源 + 资源级过滤 | 美团红包雨、阿里双11、拼多多转盘 | 过滤层按资源类型判断资格 | **否（概率层不关心资源类型）** |
| D. 单池多资源 + 概率门控 | 本项目当前设计 | 资源过滤 + Budget Tier 概率调整 | **是（导致问题）** |

### 3.2 米哈游（原神）：多池独立模式

- 角色池、武器池、常驻池各自独立，概率/保底/计数互不干扰
- 每个池子内只有一种抽取货币（原石/纠缠之缘/相遇之缘）
- 不存在"跨池预算分层"概念
- **不适用于本项目**：用户看到的是一个九宫格/转盘，不存在"选池子"的 UX

### 3.3 美团/阿里/腾讯：单池资源过滤模式

- 一个奖品池包含多种资源类型（红包、优惠券、实物、积分）
- 资格过滤在概率计算之前完成（用户额度不够的奖品直接移除）
- 概率层只看过滤后的奖品池和权重，不关心"用户预算处于哪个等级"
- 阿里通过分桶方案解决并发瓶颈，美团通过拍卖机制分配预算，但概率层本身不做预算门控
- **最符合本项目架构**：`_filterByResourceEligibility` 已经实现了这个模式

### 3.4 核心共识

**概率层不做资格门控**是行业共识：

- 资格问题在概率计算之前解决（过滤层/资格检查层）
- 概率层只处理"过滤后的奖品怎么分配权重"
- 概率调整只基于**体验因素**（活动压力、保底、防连空等），不基于资格因素

---

## 四、采纳方案：去 Budget Tier 概率门控，保留资源级过滤

> **已拍板（2026-03-04）**：采纳此方案，Pressure-Only 矩阵数值已确认，`lottery_tier_matrix_config` 旧数据清理后写入新 P0/P1/P2 数据。

### 4.1 方案核心

```
当前：资源过滤（正确）→ Budget Tier 概率门控（多余且有 bug）→ Pressure Tier 概率调整 → 抽取

改后：资源过滤（保留）→ Pressure Tier 概率调整（保留）→ 抽取
```

去掉 Budget Tier 对概率的影响，让它变成纯监控/分析指标。概率调整只保留 Pressure Tier（活动消耗压力）维度。

### 4.2 各组件变更清单（基于代码实际状态验证）

| 组件 | 实际文件路径 | 当前状态 | 变更 |
|---|---|---|---|
| **ComputeConfig** | `services/UnifiedLotteryEngine/compute/config/ComputeConfig.js` | 仍导出 B0-B3 配置 | TIER_MATRIX_CONFIG 简化为 P0/P1/P2；BUDGET_TIER_AVAILABILITY 标注为监控用途 |
| **BudgetTierCalculator** | `services/UnifiedLotteryEngine/compute/calculators/BudgetTierCalculator.js` | 完整运行中 | 保留计算逻辑（监控用途）；TIER_AVAILABILITY 不再被概率层引用 |
| **TierMatrixCalculator** | `services/UnifiedLotteryEngine/compute/calculators/TierMatrixCalculator.js` | 使用 B0-B3 × P0-P2 矩阵 | DEFAULT_TIER_MATRIX 改为 P0/P1/P2 结构；calculate() 去掉 budget_tier 参数；删除 _filterByAvailability |
| **TierPickStage** | `services/UnifiedLotteryEngine/pipeline/stages/TierPickStage.js` | 读 budget_tier 传给权重计算 | computeWeightAdjustment 调用去掉 budget_tier；budget_tier 仍写入返回结果（日志用） |
| **BuildPrizePoolStage** | `services/UnifiedLotteryEngine/pipeline/stages/BuildPrizePoolStage.js` | `_filterByResourceEligibility` **已实现** | **不改** |
| **LotteryComputeEngine** | `services/UnifiedLotteryEngine/compute/LotteryComputeEngine.js` | computeWeightAdjustment 接收 budget_tier | 方法签名去掉 budget_tier |
| **BudgetContextStage** | `services/UnifiedLotteryEngine/pipeline/stages/BudgetContextStage.js` | 计算 budget_tier 写入上下文 | **不改**（budget_tier 仍计算、仍写入上下文，仅标注为分析字段） |
| **LotteryTierMatrixConfig** | `models/LotteryTierMatrixConfig.js` | getFullMatrix 按 budget_tier 分组 | ENUM 加 'ALL'；getFullMatrix 改为 Pressure-Only（按 budget_tier='ALL' 查询） |

### 4.3 改后的 Pressure-Only 矩阵

```javascript
// 改前：4×3 矩阵（12 种组合）
TIER_MATRIX_CONFIG = {
  B0: { P0: {...}, P1: {...}, P2: {...} },  // ← 删除
  B1: { P0: {...}, P1: {...}, P2: {...} },  // ← 删除
  B2: { P0: {...}, P1: {...}, P2: {...} },  // ← 删除
  B3: { P0: {...}, P1: {...}, P2: {...} }   // ← 删除
}

// 改后：1×3 矩阵（3 种组合）
PRESSURE_MATRIX_CONFIG = {
  P0: { high: 1.3, mid: 1.1, low: 0.9,  fallback: 0.8 },  // 低压：高档概率略提
  P1: { high: 1.0, mid: 1.0, low: 1.0,  fallback: 1.0 },  // 中压：保持原始权重
  P2: { high: 0.6, mid: 0.8, low: 1.2,  fallback: 1.5 }   // 高压：压低高档，提高低档
}
```

### 4.4 改后的完整抽奖流程

```
用户发起抽奖
  │
  ├── LoadCampaignStage        → 加载活动配置和奖品列表
  ├── BudgetContextStage       → 计算 effective_budget（用于资源过滤 + 日志）
  │                               计算 budget_tier（仅用于监控报表，不影响概率）
  │                               计算 pressure_tier（用于概率调整）
  │
  ├── BuildPrizePoolStage
  │     ├── _filterByAvailability           → 库存/每日上限
  │     ├── _filterByResourceEligibility    → DIAMOND→配额, 碎片→预算, pvp=0→通过
  │     ├── _filterByUserWins               → 用户总中奖上限
  │     └── _groupByTier                    → 按 reward_tier 分组
  │
  ├── TierPickStage
  │     ├── 获取分群基础权重        → high:5%, mid:15%, low:80%, fallback:0%
  │     ├── Pressure Tier 调整     → P0 提高高档 / P2 压低高档
  │     ├── high 硬上限 8%         → 不可绕过的安全网
  │     ├── 体验平滑               → Pity / AntiEmpty / AntiHigh
  │     └── 降级路径               → high→mid→low→fallback
  │
  ├── PrizePickStage             → 档内按 win_weight 抽具体奖品
  └── SettleStage                → 扣减对应资源（DIAMOND_QUOTA / BUDGET_POINTS）
```

### 4.5 Budget Tier 的新定位：纯监控指标

Budget Tier 不再参与任何概率决策，仅用于：

1. **运营报表** — "当前活动 B0 用户占比 45%，B3 占比 8%"
2. **日志追踪** — 每次抽奖日志记录 budget_tier（`lottery_draws.result_metadata`）
3. **告警监控** — "B0 用户占比突然升至 90%" → 可能活动配置异常
4. **数据分析** — 不同 Budget Tier 用户的中奖体验差异

**后端保留的计算路径**：`BudgetContextStage` → `BudgetTierCalculator.calculate()` → 输出 `budget_tier` 到上下文。这条路径不改动，只是下游（TierPickStage）不再用 budget_tier 查矩阵乘数。**注意**：当前 `SettleStage._createDrawRecord` 未将 budget_tier 写入 `lottery_draws.result_metadata`（见 B10），需通过步骤 6.1（取决于决策 8）补齐。

---

## 五、经济安全性论证

### 5.1 去掉概率门控后，会不会超发？

**不会。** 资源级过滤（`_filterByResourceEligibility`）是唯一的资格关卡，且覆盖所有场景：

| 场景 | DIAMOND_QUOTA | BUDGET_POINTS | 资源过滤结果 | 能抽到什么 |
|---|---|---|---|---|
| 新用户首次消费 300 元 | 300 | 60 | 全部奖品可用 | 所有奖品 |
| 碎片配额耗尽 | 300 | 0 | 碎片奖品移除 | 钻石 + 保底 |
| 钻石配额耗尽 | 0 | 60 | 钻石奖品移除 | 碎片 + 保底 |
| 双配额耗尽 | 0 | 0 | 钻石+碎片均移除 | 仅保底 |
| 只剩小额钻石配额 | 15 | 0 | 钻石×60/180/600 移除 | 钻石×15 + 保底 |

每种场景下，用户只能抽到配额足够支付的奖品。**配额是硬顶，过滤是硬过滤，不依赖概率控制。**

### 5.2 Pressure Tier 如何替代 Budget Tier 的节奏控制？

Budget Tier 原本想做的"预算低的用户少出好奖"，在资源过滤后已经**自然实现**：

- BUDGET_POINTS 低 → 高价碎片奖品被过滤 → 剩余奖品池自然偏低价值
- DIAMOND_QUOTA 低 → 高价钻石奖品被过滤 → 同上
- 概率层不需要额外干预，奖品池的自然变化已经决定了用户体验

Pressure Tier 负责的是**整体活动节奏**：
- 活动初期（P0）：高价值奖品发放较快，吸引参与
- 活动中期（P1）：正常速度
- 活动后期/库存紧张（P2）：压低高档概率，保护剩余库存

这是一个**全局维度**的控制，与个人预算无关，不存在双配额冲突问题。

---

## 六、新增资源类型的扩展性对比

假设将来需要新增第三种配额（如"金券配额 GOLD_COUPON_QUOTA"）：

### 当前方案（Budget Tier 概率门控）

需要修改的文件和逻辑：
1. `_calculateDynamicThresholds` —— 排除 GOLD_COUPON 类奖品
2. `BUDGET_TIER_AVAILABILITY` —— 决定哪个 Budget Tier 能抽到金券档位
3. `TIER_MATRIX_CONFIG` —— 4×3 矩阵每个格子都要考虑金券的影响
4. 所有 Budget Tier 相关的测试用例 —— 交叉场景从 2 资源×4 Tier×3 Pressure = 24 种变成 3×4×3 = 36 种

### 采纳方案（资源级过滤 + Pressure-Only）

需要修改的文件和逻辑：
1. `_filterByResourceEligibility` —— 增加一个 `if` 分支

```javascript
if (prize.material_asset_code === 'GOLD_COUPON' && prize.material_amount > 0) {
  return user_gold_coupon_quota >= prize.material_amount
}
```

完毕。Pressure 矩阵、TierPickStage、BudgetTierCalculator 均不需要任何修改。

---

## 七、问题归属分析

### 7.1 后端数据库项目（本仓库）问题清单

| # | 问题 | 影响文件 | 严重度 |
|---|---|---|---|
| B1 | `_calculateDynamicThresholds` 因 DIAMOND pvp=0 坍塌为全员 B3 | `BudgetTierCalculator.js` | **P0 Bug** |
| B2 | TierMatrixCalculator 仍按 B0-B3 × P0-P2 查矩阵乘数 | `TierMatrixCalculator.js` | 架构 |
| B3 | ComputeConfig 仍导出 BUDGET_TIER_AVAILABILITY 给概率层使用 | `ComputeConfig.js` | 架构 |
| B4 | TierPickStage 仍读 budget_tier 传给 computeWeightAdjustment | `TierPickStage.js` | 架构 |
| B5 | LotteryComputeEngine.computeWeightAdjustment 仍接收 budget_tier | `LotteryComputeEngine.js` | 架构 |
| B6 | DB `lottery_tier_matrix_config` 12 行 B0-B3 数据，budget_tier 维度产生概率差异 | 数据层 | 数据 |
| B7 | `LotteryTierMatrixConfig` 模型 getFullMatrix 按 budget_tier 分组返回 | `models/LotteryTierMatrixConfig.js` | 架构 |
| B8 | `updateMatrix` 只更新 `cap_multiplier` + `empty_weight_multiplier`，不更新 `high/mid/low/fallback_multiplier` — 管理后台无法编辑权重乘数 | `models/LotteryTierMatrixConfig.js` | **P1 Bug** |
| B9 | `TierMatrixCalculator.DEFAULT_TIER_MATRIX` 硬编码为 B0-B3，运行时权重调整未从 DB 读取 high/mid/low/fallback（DynamicConfigLoader 框架存在但连接不完整） | `TierMatrixCalculator.js` | 架构 |
| B10 | `SettleStage._createDrawRecord` 未将 budget_tier 写入 `lottery_draws.result_metadata`，导致监控数据链路断裂 | `pipeline/stages/SettleStage.js` | 监控 |
| B11 | `ComputeConfig.TIER_MATRIX_CONFIG`（cap/empty）和 `TierMatrixCalculator.DEFAULT_TIER_MATRIX`（high/mid/low/fallback）两套矩阵配置并存，语义重叠 | `ComputeConfig.js` + `TierMatrixCalculator.js` | 技术债 |

### 7.2 Web 管理后台前端项目（admin/ 目录）问题清单

| # | 问题 | 影响文件 |
|---|---|---|
| W1 | strategy.js 硬编码 `budgetTiers: ['B0','B1','B2','B3']`，矩阵编辑 UI 为 4×3 网格 | `admin/src/modules/lottery/composables/strategy.js` |
| W2 | strategy-simulation.js 矩阵对比 UI 含 budget_tier 维度 | `admin/src/modules/lottery/composables/strategy-simulation.js` |
| W3 | lottery-management.html 模板按 budget_tier × pressure_tier 循环渲染矩阵网格 | `admin/lottery-management.html` |
| W4 | strategy.js 策略分组配置列表包含 `budget_tier` 作为独立策略组 | `admin/src/modules/lottery/composables/strategy.js` |

### 7.3 微信小程序前端项目

**无需改动。** 小程序不在本仓库，且小程序端仅调用 `POST /api/v4/lottery/draw`，不消费 budget_tier 做任何 UI 逻辑。抽奖结果中的 budget_tier 保留在 result_metadata 中作为日志字段，小程序端无需感知。

---

## 八、需要拍板的决策

### 决策 4：`lottery_tier_matrix_config` 表 budget_tier 列处理方式

**约束事实**：当前 `budget_tier` 列为 `ENUM('B0','B1','B2','B3') NOT NULL`，且有唯一索引 `(lottery_campaign_id, budget_tier, pressure_tier)`。无法直接插入不含 budget_tier 的行。

**方案 A：保留 12 行结构，按 pressure_tier 统一赋值**
- 不改表结构，不改 ENUM，不改模型字段定义
- 把同一 pressure_tier 下的 B0/B1/B2/B3 四行全部设为相同乘数值
- 优点：零 DDL 风险，零模型改动，回滚只需恢复旧数据值
- 缺点：DB 里仍有 12 行（而非 3 行），视觉上有冗余

**方案 B（已拍板采纳）：ALTER ENUM 加 'ALL' 值 + 删旧插新**
- ALTER TABLE 加 `ENUM('B0','B1','B2','B3','ALL')`
- 删除旧 12 行，插入 3 行 budget_tier='ALL' 的数据
- 优点：DB 层面最干净，只有 3 行，语义清晰
- 需要配套改动：模型 ENUM 定义加 'ALL'；管理后台前端新建活动时插 3 行而非 12 行；唯一索引天然兼容

### 决策 5：Web 管理后台矩阵编辑 UI 的处理方式

**方案 A（已拍板采纳）：简化为 1×3 网格（只显示 P0/P1/P2）**
- strategy.js 删掉 `budgetTiers` 数组，矩阵 UI 只渲染 3 行
- 编辑时固定 budget_tier='ALL'
- 保存时直接更新对应 pressure_tier 的 1 行（budget_tier='ALL'）
- 管理后台策略分组配置列表中把 `budget_tier` 改为纯只读监控指标

**方案 B：保留 4×3 网格但锁定行一致**
- 不采纳

### 决策 6：`updateMatrix` 是否改为更新全部 6 个乘数字段？（已拍板采纳）

**现状事实**：`LotteryTierMatrixConfig.updateMatrix(matrix_data, updated_by)` 当前只更新 `cap_multiplier` 和 `empty_weight_multiplier`，不更新 `high_multiplier`/`mid_multiplier`/`low_multiplier`/`fallback_multiplier`。导致：
- 管理后台矩阵编辑 UI 提交的 high/mid/low/fallback 值被忽略
- DB 中这 4 个字段为迁移写入的初始值，无法通过管理后台运营调整
- TierMatrixCalculator 运行时使用的是硬编码 `DEFAULT_TIER_MATRIX`，不是 DB 值

**推荐方案：修复 updateMatrix 为更新全部 6 字段**
- 让 DB 成为矩阵数据的唯一权威来源
- 管理后台可实时调整所有乘数
- Pressure-Only 后只有 3 行数据，编辑范围清晰可控

### 决策 7：两套矩阵配置是否合并为一套？（已拍板采纳方案 A）

**现状事实**：两套矩阵配置并存，服务不同计算路径：
- `ComputeConfig.TIER_MATRIX_CONFIG`：B0-B3 × P0-P2 结构，每格 `{ cap_multiplier, empty_weight_multiplier }`，用于 cap/empty 控制
- `TierMatrixCalculator.DEFAULT_TIER_MATRIX`：B0-B3 × P0-P2 结构，每格 `{ high, mid, low, fallback }`，用于权重调整

DB 表 `lottery_tier_matrix_config` 每行同时存储这 6 个字段，但两个代码模块各取所需。

**方案 A（推荐）：合并为一套，统一由 TierMatrixCalculator 管理**
- TierMatrixCalculator 从 DB 加载全部 6 字段（high/mid/low/fallback + cap/empty）
- ComputeConfig 不再维护独立的 `TIER_MATRIX_CONFIG`
- `getMatrixValue(pressure_tier)` 返回全部 6 字段
- DynamicConfigLoader 缓存框架完全复用
- 优点：单一数据源，零冗余，长期维护成本最低

**方案 B：保持两套，各管各的**
- ComputeConfig 管 cap/empty，TierMatrixCalculator 管 high/mid/low/fallback
- 两者都从 DB 读同一张表，但各自缓存各自的字段
- 优点：改动面最小
- 缺点：两套缓存、两处 fallback 逻辑、新成员难以理解架构

### 决策 8：budget_tier 监控数据写入方式（已拍板采纳方案 A）

**现状事实**：`SettleStage._createDrawRecord` 未将 `budget_tier` 写入 `lottery_draws.result_metadata`。文档设计 budget_tier 降级为监控指标，但当前监控数据路径不通。

**方案 A（推荐）：在 SettleStage 写入 result_metadata**
- `_createDrawRecord` 时将 `budget_tier`、`pressure_tier` 等上下文字段写入 `result_metadata` JSON
- lottery_draws 表已有 result_metadata JSON 字段，无需 DDL
- 运营报表可直接 `JSON_EXTRACT(result_metadata, '$.budget_tier')` 查询

**方案 B：依赖 lottery_draw_decisions 表**
- budget_tier 已写入 `lottery_draw_decisions` 表
- 监控查询需 JOIN 两张表
- 缺点：查询复杂度高，lottery_draw_decisions 表数据量大

---

## 九、基于后端实际技术栈的实施步骤

### 步骤总览

> 步骤编号对应执行顺序。已有 3 个 2026-03-04 迁移（测试数据清理、B0 修复、DIAMOND pvp=0）已跑完，本方案从步骤 1 开始为全新迁移。

| 步骤 | 层 | 内容 | 影响文件 | 解决问题 |
|---|---|---|---|---|
| 1 | 后端 - 数据 | Sequelize 迁移：ALTER ENUM + 删旧插新 | `migrations/YYYYMMDDHHMMSS-pressure-only-matrix.js` | B6 |
| 2 | 后端 - 模型 | LotteryTierMatrixConfig：ENUM 加 'ALL'、getFullMatrix 改 Pressure-Only、**updateMatrix 修复为全字段更新** | `models/LotteryTierMatrixConfig.js` | B7, **B8** |
| 3 | 后端 - 计算 | TierMatrixCalculator：DEFAULT_TIER_MATRIX 改 Pressure-Only、calculate() 去 budget_tier、**loadFromDatabase 对齐新结构** | `TierMatrixCalculator.js` | B2, **B9** |
| 4 | 后端 - 配置 | ComputeConfig：**合并或清理** TIER_MATRIX_CONFIG（取决于决策 7）、去 BUDGET_TIER_AVAILABILITY 概率影响 | `ComputeConfig.js` | B3, **B11** |
| 5 | 后端 - 引擎 | LotteryComputeEngine.computeWeightAdjustment 去 budget_tier 参数 | `LotteryComputeEngine.js` | B5 |
| 6 | 后端 - 管道 | TierPickStage 不再传 budget_tier 给权重计算 | `TierPickStage.js` | B4 |
| 6.1 | 后端 - 管道 | SettleStage._createDrawRecord 写入 budget_tier 到 result_metadata（取决于决策 8） | `pipeline/stages/SettleStage.js` | **B10** |
| 7 | 后端 - 测试 | 更新所有涉及 BxPx 的单测 | `tests/unit/compute/*.test.js` | — |
| 8 | 前端 - Web | strategy.js 矩阵 UI 简化为 1×3 | `admin/src/modules/lottery/composables/strategy.js` | W1, W4 |
| 9 | 前端 - Web | strategy-simulation.js 去 budget_tier 维度 | `admin/src/modules/lottery/composables/strategy-simulation.js` | W2 |
| 10 | 前端 - Web | lottery-management.html 矩阵模板改 1×3 | `admin/lottery-management.html` | W3 |

### 步骤 1：Sequelize 迁移 — ALTER ENUM + 删旧插新（决策 4 方案 B）

使用项目现有的 Sequelize CLI 迁移框架（`migrations/` 目录），创建迁移文件。

```javascript
// migrations/YYYYMMDDHHMMSS-pressure-only-matrix.js
module.exports = {
  async up(queryInterface) {
    // 1. ALTER ENUM 加 'ALL' 值
    await queryInterface.sequelize.query(`
      ALTER TABLE lottery_tier_matrix_config
      MODIFY COLUMN budget_tier ENUM('B0','B1','B2','B3','ALL') NOT NULL DEFAULT 'ALL'
    `)

    // 2. 删除旧的 B0-B3 数据（所有活动）
    await queryInterface.sequelize.query(`
      DELETE FROM lottery_tier_matrix_config
      WHERE budget_tier IN ('B0','B1','B2','B3')
    `)

    // 3. 为现有活动插入 Pressure-Only 数据（budget_tier='ALL'）
    // campaign_id=1 是当前唯一 active 活动
    await queryInterface.sequelize.query(`
      INSERT INTO lottery_tier_matrix_config
        (lottery_campaign_id, budget_tier, pressure_tier,
         high_multiplier, mid_multiplier, low_multiplier, fallback_multiplier,
         cap_multiplier, empty_weight_multiplier,
         description, is_active)
      VALUES
        (1, 'ALL', 'P0', 1.30, 1.10, 0.90, 0.80, 1.00, 1.00, 'Pressure-Only P0：低压，高档概率略提', 1),
        (1, 'ALL', 'P1', 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 'Pressure-Only P1：中压，保持原始权重', 1),
        (1, 'ALL', 'P2', 0.60, 0.80, 1.20, 1.50, 1.00, 1.00, 'Pressure-Only P2：高压，压低高档提高低档', 1)
    `)
  },

  async down(queryInterface) {
    // 回滚步骤：
    // 1. 删除 'ALL' 行
    await queryInterface.sequelize.query(`
      DELETE FROM lottery_tier_matrix_config WHERE budget_tier = 'ALL'
    `)

    // 2. 恢复 ENUM（去掉 'ALL'）
    await queryInterface.sequelize.query(`
      ALTER TABLE lottery_tier_matrix_config
      MODIFY COLUMN budget_tier ENUM('B0','B1','B2','B3') NOT NULL
    `)

    // 3. 需手动重新插入原始 12 行 B0-B3 差异化数据
  }
}
```

**验证方式**：迁移后查 `SELECT * FROM lottery_tier_matrix_config WHERE lottery_campaign_id = 1`，应只有 3 行，budget_tier 均为 'ALL'，pressure_tier 分别为 P0/P1/P2。

### 步骤 2：LotteryTierMatrixConfig 模型改造（配合决策 4 方案 B + 决策 6 修复）

改动点：
- 模型 `budget_tier` 字段 ENUM 定义加 `'ALL'`：`DataTypes.ENUM('B0','B1','B2','B3','ALL')`
- `getFullMatrix(lottery_campaign_id)` 改为直接按 `budget_tier='ALL'` + `pressure_tier` 查询，返回 `{ P0: {...}, P1: {...}, P2: {...} }` 结构
- 删除原 BxPx 嵌套格式（不再有 `matrix[budget_tier][pressure_tier]` 两层嵌套）
- `getMatrixValue(pressure_tier)` 去掉 budget_tier 参数，WHERE 条件固定 `budget_tier='ALL'`
- **（B8 修复）`updateMatrix(matrix_data, updated_by)` 改为更新全部 6 个乘数字段**：`cap_multiplier`、`empty_weight_multiplier`、`high_multiplier`、`mid_multiplier`、`low_multiplier`、`fallback_multiplier`。当前只更新 cap/empty，导致管理后台无法编辑权重乘数
- `updateMatrix` 入参从 `{ B0: { P0: {...} } }` 改为 `{ P0: {...}, P1: {...}, P2: {...} }`，每个 P 对象包含全部 6 字段
- `getConfigsByBudgetTier` 方法删除（不再按 budget_tier 查询）
- 新建活动时初始化矩阵：从插入 12 行改为插入 3 行（budget_tier='ALL' + P0/P1/P2）

**可复用部分**：`getFormattedConfig()`、`isForcedEmpty()`、`isEmptySuppressed()` 实例方法保留。模型关联（campaign、creator、updater）不变。唯一索引 `(lottery_campaign_id, budget_tier, pressure_tier)` 天然兼容。

**API 路由不变**：`routes/v4/console/lottery-configs.js` 中 GET/PUT `/matrix` 端点保留，`LotteryConfigService.getMatrixConfigs` 查询条件加 `budget_tier='ALL'` 过滤即可。

### 步骤 3：TierMatrixCalculator 去 budget_tier 维度 + DB 加载对齐（含 B9 修复）

改动点：
- `DEFAULT_TIER_MATRIX` 简化为 Pressure-Only 结构（仅 P0/P1/P2 三组乘数），作为 DB 不可用时的兜底
- `calculate(context)` 不再要求 `context.budget_tier`，只需 `{ pressure_tier, base_weights }`
- `_getMatrixMultipliers(pressure_tier)` 只按 pressure_tier 查，返回全部 6 字段（high/mid/low/fallback + cap/empty）
- 删除对 `TIER_AVAILABILITY` 的引用（不再做概率层档位限制）
- `_filterByAvailability` 方法删除（资格由 BuildPrizePoolStage 资源过滤负责）
- **（B9 修复）`loadFromDatabase` 对齐新结构**：调用 `LotteryTierMatrixConfig.getFullMatrix(campaign_id)` 获取 `{ P0: {全部6字段}, P1: {...}, P2: {...} }`，DynamicConfigLoader 三层优先级框架（DB→环境变量→DEFAULT_TIER_MATRIX 硬编码）完整复用
- **（决策 7 已确认）** TierMatrixCalculator 同时管理 cap/empty，ComputeConfig 不再维护独立 TIER_MATRIX_CONFIG 矩阵

**可复用部分**：`_applyMultipliers`、`_normalizeWeights`、`loadFromDatabase` 核心框架完整保留，只改数据索引维度从 `[budget_tier][pressure_tier]` 到 `[pressure_tier]`。

### 步骤 4：ComputeConfig 去 BUDGET_TIER_AVAILABILITY 概率影响 + 矩阵合并（含 B11 清理）

改动点：
- `BUDGET_TIER_AVAILABILITY` 从导出中删除（或保留但标注仅用于监控报表，不被概率层引用）
- **（决策 7 已确认方案 A）** 删除 `TIER_MATRIX_CONFIG` 常量，`getMatrixValue` 统一由 TierMatrixCalculator 提供
- `getMatrixValue(budget_tier, pressure_tier)` 改为 `getMatrixValue(pressure_tier)`
- `DynamicConfigLoader.getMatrixValue` 同步简化，去掉 budget_tier 参数

**可复用部分**：`DynamicConfigLoader` 整个缓存框架（TTL=5分钟、活动级隔离、并发加载锁）完整保留。`BUDGET_TIER_CONFIG`（阈值配置）保留供 BudgetTierCalculator 监控计算使用。`DynamicConfigLoader.loadConfig` 的三层优先级机制（DB→环境变量→硬编码）完整保留。

### 步骤 5：LotteryComputeEngine 去 budget_tier 参数

改动点：
- `computeWeightAdjustment({ budget_tier, pressure_tier, base_tier_weights })` → `computeWeightAdjustment({ pressure_tier, base_tier_weights })`
- TierMatrixCalculator 实例创建方式不变，只是 calculate 调用不传 budget_tier
- 导出的 `BUDGET_TIERS` 常量保留（监控用途）

**可复用部分**：`computeBudgetContext`（计算 budget_tier 写入日志）、`applyExperienceSmoothing`（Pity/AntiEmpty/AntiHigh）、`updateExperienceState`、`getLuckDebtMultiplier` 全部不动。

### 步骤 6：TierPickStage 不传 budget_tier 给权重计算

改动点（`execute()` 方法内）：
- 从 `this.computeEngine.computeWeightAdjustment({ budget_tier, pressure_tier, base_tier_weights })` 改为 `this.computeEngine.computeWeightAdjustment({ pressure_tier, base_tier_weights })`
- `budget_tier` 仍然从 `prize_pool_data.budget_tier` 读取并写入最终结果（用于日志和监控报表），但不参与权重计算

**不动的部分**：分群解析、基础权重获取、high 硬上限 8%、每日高档上限、体验平滑（Pity/AntiEmpty/AntiHigh）、降级路径 — 全部保留。

### 步骤 6.1：SettleStage 写入 budget_tier 到 result_metadata（含 B10 修复，决策 8 已确认）

改动点（决策 8 已确认方案 A）：
- `SettleStage._createDrawRecord` 在构建 `lottery_draws` 记录时，将上下文中的 `budget_tier`、`pressure_tier` 写入 `result_metadata` JSON 字段
- `result_metadata` 字段已存在（JSON 类型），无需 DDL 变更
- 写入格式：`{ budget_tier: 'B2', pressure_tier: 'P1', ... }` 嵌入现有 result_metadata 对象

**不改的部分**：`lottery_draw_decisions` 表中已有的 budget_tier 写入逻辑不变。

### 步骤 7：更新测试

涉及的测试文件（均在 `tests/` 目录下已存在）：
- `tests/unit/compute/TierMatrixCalculator.test.js` — 去 budget_tier 维度的用例
- `tests/unit/compute/LotteryComputeEngine.test.js` — computeWeightAdjustment 参数变更
- `tests/unit/compute/ProbabilityCalculator.test.js` — 概率计算验证
- `tests/unit/compute/BoundaryScenarios.test.js` — 边界场景
- `tests/unit/stages/BuildPrizePoolStage.test.js` — 资源过滤测试（应已通过，无需改）
- `tests/services/unified_lottery_engine/budget_exhaustion.test.js` — 预算耗尽场景

### 步骤 8-10：Web 管理后台前端适配

**步骤 8：strategy.js**
- 删除 `budgetTiers: ['B0','B1','B2','B3']`
- `loadTierMatrix()` 返回数据仍从 `/api/v4/console/lottery-configs/matrix` 获取，后端只返回 3 行（budget_tier='ALL'），UI 直接按 pressure_tier 渲染
- `editMatrixCell(pressureTier)` 只传 pressure_tier，保存时提交 budget_tier='ALL'，后端更新对应的 1 行
- `getMatrixConfig(pressureTier)` 去掉 budgetTier 参数
- 策略分组配置列表中 `budget_tier` 改为只读监控项，不可编辑

**步骤 9：strategy-simulation.js**
- `proposed_config.matrix_config` 数组从 12 项变为 3 项（P0/P1/P2）
- `getProposedMatrixValue(pressure_tier, field)` 去掉 budget_tier 参数
- 模拟对比 UI 按 1×3 网格渲染

**步骤 10：lottery-management.html**
- BxPx 矩阵区域从 4×3 网格改为 1×3 网格
- 列头只显示 P0/P1/P2，不再显示 B0-B3 行头
- 标题从"BxPx 矩阵配置"改为"Pressure 矩阵配置"

---

## 十、可复用与可扩展分析

### 10.1 后端可复用资产

| 组件 | 可复用性 | 说明 |
|---|---|---|
| `BuildPrizePoolStage._filterByResourceEligibility` | **完全复用** | 已正确实现多资源过滤，新增资源只需加 if 分支 |
| `BudgetTierCalculator` | **保留复用**（监控） | 计算逻辑保留，输出 budget_tier 写日志，不参与概率 |
| `PressureTierCalculator` | **完全复用** | 计算 pressure_index → P0/P1/P2，不受此次重构影响 |
| `DynamicConfigLoader` | **完全复用** | 缓存框架、活动级隔离、三层优先级全部保留 |
| `LotteryTierMatrixConfig` 模型 | **重构复用** | ENUM 加 'ALL'，getFullMatrix 改为 Pressure-Only 返回结构 |
| Pity / AntiEmpty / AntiHigh / LuckDebt | **完全不动** | 体验平滑机制与 budget_tier 无关 |
| 分群解析 SegmentResolver | **完全不动** | 分群权重独立于矩阵维度 |

### 10.2 扩展性保障

新增第三种配额（如"金券配额 GOLD_COUPON_QUOTA"）时：
- **后端**：仅需在 `_filterByResourceEligibility` 加一个 `if (material_asset_code === 'GOLD_COUPON')` 分支
- **矩阵**：不需要任何改动（Pressure 维度与资源类型无关）
- **测试**：新增一组资源过滤测试用例

### 10.3 Web 管理后台前端技术栈兼容性（详细分析）

**技术栈实际确认**：Vite 6.4 + Alpine.js 3.15 + Tailwind CSS 3.4 + EJS 模板 + 多页面 HTML（vite-plugin-ejs）

| 改动项 | 涉及文件 | 与现有技术栈兼容性 | 改动复杂度 |
|---|---|---|---|
| strategy.js 删除 `budgetTiers` 数组 | `composables/strategy.js` 第 27 行 | Alpine.js 响应式数据，直接删属性即可 | 低 |
| `loadTierMatrix()` 适配 3 行数据 | `composables/strategy.js` 第 198-212 行 | 现有 `apiGet(LOTTERY_ENDPOINTS.MATRIX_LIST)` 封装不变，后端返回 3 行而非 12 行，`tierMatrix` 数组自动缩短 | 低 |
| `getMatrixConfig(pressureTier)` 去 budgetTier 参数 | `composables/strategy.js` 第 228-230 行 | 改 find 条件为 `item.pressure_tier === pressureTier && item.budget_tier === 'ALL'` | 低 |
| `editMatrixCell(pressureTier)` 去 budgetTier 参数 | `composables/strategy.js` 第 239-254 行 | 直接改函数签名，`editingMatrixCell.budget_tier` 固定为 `'ALL'` | 低 |
| `submitMatrixConfig()` 提交全部 6 字段 | `composables/strategy.js` 第 260-280 行 | 现有 `apiCall` 封装的 PUT 请求体加 high/mid/low/fallback 字段（当前只提交 cap/empty）| 低 |
| `getConfigGroupOptions()` 去 budget_tier 编辑项 | `composables/strategy.js` 第 347 行 | 从数组中删除 `{ value: 'budget_tier', label: '预算层级' }` | 极低 |
| 矩阵 UI 从 4×3 改 1×3 | `lottery-management.html` 第 1128-1134 行 | Tailwind CSS `x-for` 循环删外层 `budgetTiers` 循环，保留内层 `pressureTiers` | 中 |
| BxPx 命中统计表改 1×3 | `lottery-management.html` 第 978-980 行 | 删除 `x-for="bt in ['B0','B1','B2','B3']"` 循环 | 低 |
| 策略效果热力图改 1×3 | `lottery-management.html` 第 2967-2973 行 | 同上 | 低 |
| simulation matrix_config 从 12 项变 3 项 | `composables/strategy-simulation.js` | `proposed_config.matrix_config` 数组长度变化，`getProposedMatrixValue` / `updateProposedMatrixValue` 去 budget_tier 参数 | 中 |
| `SENSITIVITY_PARAMS` 键名变化 | `composables/strategy-simulation.js` 第 374-375 行 | `matrix_config.B3_P1.high_multiplier` → `matrix_config.P1.high_multiplier`，改键名前缀 | 低 |

**总结**：所有 Web 管理后台前端改动均在 Alpine.js 响应式数据 + Tailwind CSS 模板范围内，无需新增任何依赖、无需改构建配置（vite.config.js）、无需改 API 封装层（apiGet/apiCall）。前端直接使用后端字段名（`budget_tier`、`pressure_tier`、`high_multiplier` 等），不做任何映射。

### 10.4 后端技术框架契合度分析

| 技术组件 | 本方案使用方式 | 与项目现有框架契合度 |
|---|---|---|
| **Sequelize CLI 迁移** | `migrations/` 目录新建迁移文件，`queryInterface.sequelize.query` 执行 DDL/DML | 完全契合：`.sequelizerc` 已配置 `migrations-path`，`npm run db:migrate` 可直接执行 |
| **Sequelize 模型** | `DataTypes.ENUM` 加 'ALL' 值，`findAll` + `update` 操作 | 完全契合：现有 LotteryTierMatrixConfig 模型已定义全部字段和关联 |
| **DynamicConfigLoader** | 三层优先级（DB→环境变量→硬编码兜底），TTL 5 分钟缓存，活动级隔离 | 完全复用：已有框架，只改数据索引维度 |
| **Express 路由** | `routes/v4/console/lottery-configs.js` 已有 CRUD 端点 | 完全复用：端点 URL 不变，只改查询条件和响应结构 |
| **LotteryConfigService** | `getMatrixConfigs` 方法过滤 `budget_tier` | 简单改动：过滤条件默认 `budget_tier='ALL'` |
| **Pipeline Stage 架构** | BuildPrizePoolStage → TierPickStage → SettleStage | 完全契合：只改 Stage 内部参数传递，不改 Pipeline 架构 |
| **Jest 测试框架** | `tests/unit/compute/*.test.js` 已有完整测试 | 完全契合：改测试用例参数，不改测试框架 |
| **result_metadata JSON** | `lottery_draws.result_metadata` 已为 JSON 字段 | 完全契合：无需 DDL，直接在 SettleStage 写入 |

---

## 十一、实施注意事项

### 11.1 执行顺序

**必须先后端再前端**：前端依赖后端 API 返回的数据结构。

1. 跑数据库迁移（步骤 1）— 使用 `npm run db:migrate`，Sequelize CLI 已配置
2. 后端代码改动（步骤 2-6 + 6.1）+ 跑测试（步骤 7）— 使用 `npm test`
3. 最后改前端（步骤 8-10）— 使用 `npm run admin:dev` 验证

> 决策 6/7/8 已全部拍板确认，步骤 2/3/4/6.1 按确认方案执行。

### 11.2 已有迁移与新迁移的关系

2026-03-04 已有 3 个迁移（均已跑完，`SequelizeMeta` 表有记录）：
- `20260304185132-fix-lottery-test-data-and-configs.js` — 测试数据清理、anti_empty 阈值修正
- `20260304192803-remove-tier-budget-gating-add-resource-filter.js` — DIAMOND pvp=0、B0 low_multiplier 修复
- `20260304195213-clean-remaining-test-draws-reset-state.js` — 清理残留测试抽奖数据

**步骤 1 的迁移为全新文件**，不与上述 3 个冲突。迁移文件命名使用 `npx sequelize-cli migration:generate --name pressure-only-matrix` 自动生成时间戳。

### 11.3 不涉及的表

- `lottery_prizes` — 不改
- `lottery_campaigns` — 不改
- `lottery_draws` — 不改表结构（若决策 8 方案 A，只在代码层写入 result_metadata JSON 内容）
- `lottery_strategy_config` — `budget_tier` config_group 的行保留（已被 `20260302193334` 迁移删除静态阈值），`pressure_tier` 和 `matrix` 配置行继续使用
- `lottery_draw_decisions` — 不改（已有 budget_tier 写入逻辑保留）
- `lottery_user_experience_state` — 不改

### 11.4 可回滚性

| 层 | 回滚方式 |
|---|---|
| 数据库 | 迁移 down（`npm run db:migrate:undo`）：删 'ALL' 行 → ALTER ENUM 去掉 'ALL' → 需手动重新插入 12 行 B0-B3 差异化数据 |
| 后端模型 | LotteryTierMatrixConfig ENUM 去掉 'ALL'，getFullMatrix 恢复 BxPx 两层嵌套 |
| 后端代码 | 恢复 computeWeightAdjustment 的 budget_tier 参数，TierMatrixCalculator 恢复 B0-B3 索引 |
| 前端 | 恢复 budgetTiers 数组和 4×3 网格渲染 |

### 11.5 待拍板决策汇总

| 决策 | 状态 | 采纳方案 | 影响步骤 |
|---|---|---|---|
| 决策 1-5 | **已拍板** | 见文档顶部拍板记录 | 步骤 1/8-10 |
| 决策 6：updateMatrix 全字段更新 | **已拍板** | 修复为更新全部 6 字段，DB 为唯一权威数据源 | 步骤 2 |
| 决策 7：两套矩阵合并 | **已拍板** | 方案 A：合并为一套，TierMatrixCalculator 统一管理 | 步骤 3/4 |
| 决策 8：budget_tier 监控写入 | **已拍板** | 方案 A：SettleStage 写入 result_metadata | 步骤 6.1 |

---

## 十二、实施完成记录（2026-03-04）

> 所有步骤已于 2026-03-04 完成实施和验证。

### 12.1 实施结果汇总

| 步骤 | 状态 | 验证结果 |
|---|---|---|
| 步骤 1：数据库迁移 | **已完成** | `20260304220236-pressure-only-matrix.js` 已执行，DB 仅剩 3 行 budget_tier='ALL' |
| 步骤 2：模型改造 | **已完成** | ENUM 加 'ALL'，getFullMatrix 返回 Pressure-Only 结构，updateMatrix 更新全部 6 字段 |
| 步骤 3：TierMatrixCalculator | **已完成** | DEFAULT_PRESSURE_MATRIX 3 组，calculate() 只接收 pressure_tier，loadFromDatabase 对齐 |
| 步骤 4：ComputeConfig | **已完成** | TIER_MATRIX_CONFIG 替换为 PRESSURE_MATRIX_FALLBACK，getMatrixValue 只需 pressure_tier |
| 步骤 5：LotteryComputeEngine | **已完成** | computeWeightAdjustment 去掉 budget_tier 参数 |
| 步骤 6：TierPickStage | **已完成** | 不再传 budget_tier 给权重计算 |
| 步骤 6.1：SettleStage | **已完成** | budget_tier/pressure_tier 写入 lottery_draws.result_metadata JSON |
| 步骤 7：测试更新 | **已完成** | 534 个测试全部通过（24 个测试套件），含 `bxpx_dynamic_change.test.js` 重写为 Pressure-Only |
| 步骤 8-10：Web 管理后台 | **已完成** | 矩阵 UI 简化为 1×3，strategy.js / simulation.js / HTML 均已适配 |

### 12.2 质量验证结果（2026-03-04 代码审计后更新）

- **ESLint**：0 错误 0 警告（后端全部通过）
- **Prettier**：格式检查通过（含 `ProbabilityCalculator.test.js`、`TierMatrixCalculator.test.js` 格式修正）
- **Jest 测试**：534 passed, 0 failed（24 test suites — compute 10 套 + stages 1 套 + integration 13 套）
- **健康检查**：database=connected, redis=connected, status=SYSTEM_HEALTHY
- **Matrix API**：`GET /api/v4/console/lottery-configs/matrix` 返回 3 行 budget_tier='ALL'，数值正确
- **Admin 前端构建**：Vite 构建成功，无错误
- **PM2 服务**：restaurant-lottery-backend online，内存 163MB，0 次重启

### 12.3 微信小程序前端对接说明

**本次重构不影响微信小程序前端。** 原因：

1. 小程序端调用的 `POST /api/v4/lottery/draw` 接口**无任何变更**
2. 接口入参不变：`{ lottery_campaign_id }`
3. 接口返回结构不变：`{ prize_name, reward_tier, ... }`
4. `result_metadata` 字段新增了 `budget_tier` 和 `pressure_tier`（纯追加，不影响旧字段）
5. 小程序端不消费 `budget_tier` 做任何 UI 逻辑

**如果小程序端未来需要使用 budget_tier（如显示用户预算等级），可从抽奖结果的 `result_metadata` 字段获取**：

```json
{
  "result_metadata": {
    "budget_tier": "B2",
    "pressure_tier": "P1",
    "effective_budget": 44,
    "weight_adjustment": null
  }
}
```

### 12.4 修改文件清单

**后端 — 修改的文件：**

| 文件 | 操作 | 改动摘要 |
|---|---|---|
| `migrations/20260304220236-pressure-only-matrix.js` | **新建** | ALTER ENUM + 删旧12行 + 插新3行 |
| `models/LotteryTierMatrixConfig.js` | **修改** | ENUM加'ALL'，getFullMatrix/getMatrixValue/updateMatrix改Pressure-Only |
| `services/.../TierMatrixCalculator.js` | **修改** | DEFAULT_PRESSURE_MATRIX，calculate()去budget_tier，loadFromDatabase对齐 |
| `services/.../ComputeConfig.js` | **修改** | TIER_MATRIX_CONFIG→PRESSURE_MATRIX_FALLBACK，getMatrixValue去budget_tier |
| `services/.../LotteryComputeEngine.js` | **修改** | computeWeightAdjustment去budget_tier，_getMatrixMultiplier简化 |
| `services/.../TierPickStage.js` | **修改** | 不传budget_tier给computeWeightAdjustment |
| `services/.../SettleStage.js` | **修改** | _createDrawRecord写入budget_tier到result_metadata |
| `services/.../compute/index.js` | **修改** | TIER_MATRIX_CONFIG→PRESSURE_MATRIX |
| `tests/unit/compute/TierMatrixCalculator.test.js` | **修改** | 全部改为Pressure-Only测试 |
| `tests/unit/compute/LotteryComputeEngine.test.js` | **修改** | 去budget_tier参数，PRESSURE_MATRIX |
| `tests/unit/compute/ProbabilityCalculator.test.js` | **修改** | 去B0-B3，只测P0/P1/P2 |
| `tests/unit/compute/BoundaryScenarios.test.js` | **修改** | 去budget_tier维度 |
| `tests/services/.../budget_exhaustion.test.js` | **修改** | 去TierMatrixCalculator BxPx测试 |
| `tests/services/.../bxpx_dynamic_change.test.js` | **重写** | 从B0-B3×P0-P2(12组合)改为Pressure-Only(3组合)，20个测试全部通过 |

**Web 管理后台前端 — 修改的文件：**

| 文件 | 操作 | 改动摘要 |
|---|---|---|
| `admin/src/modules/lottery/composables/strategy.js` | **修改** | 删budgetTiers，矩阵方法改Pressure-Only |
| `admin/src/modules/lottery/composables/strategy-simulation.js` | **修改** | SENSITIVITY_PARAMS去B3前缀，矩阵方法去budget_tier参数 |
| `admin/lottery-management.html` | **修改** | 矩阵UI从4×3改1×3，标题/说明/热力图/模拟全部适配 |
