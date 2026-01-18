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

### 连抽语义
| 决策点 | 最终决定 | 理由 |
|-------|---------|------|
| 支持的连抽档位 | 仅支持 1/5/10 | 与旧链路一致，不引入新档位 |
| 积分扣减 | 统一扣一次（consume），不再用 `skip_points_deduction` | 连抽升级为一等公民，消除隐藏语义 |
| 配额扣减 | 一次原子扣 draw_count | 使用 `LotteryQuotaService.tryDeductQuota` |
| 保底计算 | 在 N 次内部按顺序计算 | 第几抽触发保底必须一致 |

### 定价体系
| 决策点 | 最终决定 | 理由 |
|-------|---------|------|
| 定价真值来源 | 唯一入口：`lottery_management_settings(setting_type='pricing')` | 一处改价，全链路一致 |
| 活动表配置 | `prize_distribution_config.draw_pricing` 仅作为初始化默认值 | 不再作为运行时真值 |
| business.config | 只保留枚举/常量（如允许的 draw_count） | 不再参与定价计算 |
| **配置缺失时的行为** | ✅ 严格报错阻断（不兜底） | 逼迫唯一真值落地，运营必须先配置定价 |

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

---

---

## 0. 迁移关键对齐要求（基于代码与数据库检查结果）

> ⚠️ **重要**：以下内容基于 2026-01-18 对真实代码与数据库（`restaurant_points_dev`）的检查结果

### 0.1 旧链路已实现的关键能力（必须搬迁）

| 能力 | 旧链路实现位置 | 迁移目标 | 状态 |
|------|--------------|---------|------|
| 连抽定价（1/5/10连） | `UnifiedLotteryEngine.getDrawPricing()` | `PricingStage._calculatePricing()` | 🔴 待搬迁 |
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

### 0.4 定价规则复用要求（禁止重新设计）

旧链路 `getDrawPricing()` 输出结构（**Pipeline 必须保持一致**）：
```javascript
{
  total_cost: number,           // 实付积分
  discount: number,             // 折扣率（如 0.95）
  label: string,                // 显示文案（如 "10连抽 9折"）
  discount_label: string,       // 折扣标签
  saved_points: number,         // 节省积分
  pricing_source: 'campaign' | 'management' | 'default'
}
```

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

    // 🔴 校验 draw_count 合法性（与旧链路一致，仅支持 1/5/10）
    const allowed_draw_counts = [1, 5, 10]
    if (!allowed_draw_counts.includes(draw_count)) {
      throw this.createError(
        `不支持的连抽数量: ${draw_count}，仅支持 ${allowed_draw_counts.join('/')}`,
        'INVALID_DRAW_COUNT',
        true
      )
    }

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
    
    // 折扣配置（与旧链路一致）
    const discount_tiers = config.multi_draw_discounts || [
      { min_count: 1,  max_count: 1,  discount: 1.0,  label: '单抽' },
      { min_count: 5,  max_count: 5,  discount: 0.95, label: '5连抽 95折' },
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
-- 说明：不再保留“代码层幂等 + 非唯一索引”的方案（会导致并发/对账歧义）

-- 🟡 奖品库存索引（建议新增）
CREATE INDEX IF NOT EXISTS idx_lottery_prizes_campaign_status
ON lottery_prizes(campaign_id, status);
```

#### 4.1.3 DDL 兼容性说明

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
- [x] 定价唯一真值：`lottery_management_settings(setting_type='pricing')`
- [x] 配额唯一真值：`LotteryQuotaService.tryDeductQuota`
- [x] 幂等键派生规则：`{request_key}:consume` / `{request_key}:reward_{n}`

### Phase 1: 重组统一管线
- [ ] 新增 `LoadDecisionSourceStage.js`（加载 preset/override/normal 决策来源）
- [ ] 新增 `QuotaDeductStage.js`（调用 LotteryQuotaService，原子扣 draw_count）
- [ ] 升级 `PickStage.js`（支持 preset/override/guarantee/normal 四种模式）
- [ ] 合并 3 条管线为 1 条 `UnifiedDrawPipeline.js`
- [ ] 删除 `PresetAwardPipeline.js`、`OverridePipeline.js`（归档）
- [ ] `DrawOrchestrator` 只设置 `context.decision_source`，不再选择管线

### Phase 2: 连抽一等公民化
- [ ] `EligibilityStage` 增加 `draw_count` 参数验证（仅支持 1/5/10）
- [ ] `QuotaDeductStage` 一次扣 draw_count 配额
- [ ] `PricingStage` 计算连抽总价（一次扣积分）
- [ ] `PickStage` 产生 N 个结果（N = draw_count）
- [ ] `SettleStage` 一次事务写入 N 条 draw + N 条 decision
- [ ] 删除 `skip_points_deduction` 隐藏语义（不再对外暴露）
- [ ] 新增 `batch_id` 字段关联连抽批次

### Phase 3: 收敛定价与配额真值
- [ ] `PricingStage._loadPricingConfig()` 只读 `management_settings`
- [ ] `lottery_campaigns.prize_distribution_config.draw_pricing` 仅作初始化默认值
- [ ] `business.config` 不再参与定价计算
- [ ] `EligibilityStage` 不再用 `LotteryDraw.count` 自己算配额
- [ ] 配额全部走 `LotteryQuotaService.tryDeductQuota`

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

#### 连抽语义决策
| 决策点 | 最终决定 | 理由 |
|-------|---------|------|
| **支持的连抽档位** | 仅支持 1/5/10 | 与旧链路一致，不引入新档位 |
| **积分扣减** | 统一扣一次（consume） | 连抽升级为一等公民，消除隐藏语义 |
| **配额扣减** | 一次原子扣 draw_count | 使用 LotteryQuotaService.tryDeductQuota |
| **保底计算** | 在 N 次内部按顺序计算 | 第几抽触发保底必须一致 |

#### 真值收敛决策
| 决策点 | 最终决定 | 理由 |
|-------|---------|------|
| **定价唯一真值** | `lottery_management_settings(setting_type='pricing')` | 一处改价，全链路一致 |
| **活动表配置** | 仅作初始化默认值，不作运行时真值 | 避免多来源冲突 |
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

### 9.1 定价唯一真值来源（已拍板 2026-01-19）

> ⚠️ **核心变更**：定价不再是"三级优先级"，而是**唯一真值**

```
唯一真值：lottery_management_settings(setting_type='pricing')
         ↓ 运营可随时修改，立即生效，全链路一致

活动表配置（prize_distribution_config.draw_pricing）：
         → 仅作为活动创建时的"初始化默认值"
         → 不再作为运行时真值
         → 可选：运营修改时同步更新到 management_settings

business.config：
         → 只保留枚举/常量（如允许的 draw_count = [1, 5, 10]）
         → 不再参与定价计算
```

**理由**：
- 旧方案"三级优先级"会导致"改价不知道改哪里"、"多个来源冲突"
- 新方案"一处改价，全链路一致"，降低运维和研发认知负担

### 9.2 配置表结构建议

```sql
-- lottery_management_settings 表新增字段
ALTER TABLE lottery_management_settings 
ADD COLUMN pricing_config JSON COMMENT '定价配置（允许运营随时改）' AFTER setting_value;

-- 配置示例
{
  "base_cost": 100,                    -- 单次抽奖基础价格
  "multi_draw_discounts": [            -- 连抽折扣
    { "min_count": 1,  "max_count": 1,  "discount": 1.0 },
    { "min_count": 5,  "max_count": 5,  "discount": 0.95 },
    { "min_count": 10, "max_count": 10, "discount": 0.90 }
  ],
  "vip_discounts": {                   -- 会员折扣（预留）
    "vip1": 0.98,
    "vip2": 0.95,
    "vip3": 0.90
  },
  "dynamic_pricing_enabled": false,    -- 动态定价开关（预留）
  "effective_time": "2026-01-18 00:00:00",
  "expire_time": null
}
```

### 9.3 PricingStage 读取逻辑（严格报错版，已拍板）

```javascript
async _loadPricingConfig(campaign_id) {
  // 唯一真值来源：lottery_management_settings(setting_type='pricing')
  const setting = await LotteryManagementSetting.findOne({
    where: {
      campaign_id,
      setting_type: 'pricing',
      status: 'active'
    }
  })
  
  if (setting?.pricing_config) {
    this.log('info', '定价配置已加载（唯一真值）', {
      campaign_id,
      source: 'management_settings',
      base_cost: setting.pricing_config.base_cost
    })
    return setting.pricing_config
  }
  
  // 🔴 严格报错阻断（已拍板 2026-01-19）
  // ⚠️ 不再使用"系统默认值兜底"，逼迫唯一真值落地
  // ⚠️ 运营必须先在 management_settings 配置定价，否则抽奖直接报错
  this.log('error', '定价配置缺失，严格报错阻断', {
    campaign_id,
    source: 'none',
    action: 'PRICING_CONFIG_REQUIRED'
  })
  
  throw this.createError(
    `活动 ${campaign_id} 缺少定价配置，请先在 lottery_management_settings 配置 setting_type='pricing'`,
    'PRICING_CONFIG_MISSING',
    true  // 是否可重试：false
  )
}
```

---

## 10. 迁移风险与缓解措施

### 10.1 已识别的风险（一次性干净统一版）

| 风险点 | 风险等级 | 缓解措施 | 状态 |
|-------|---------|---------|------|
| 定价规则不一致 | 🔴 高 | 定价唯一真值收敛到 management_settings | ✅ 已拍板 |
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
**最后更新**: 2026-01-19（补充数据管理拍板：batch_id 必须落库、定价缺失严格报错、决策快照 90 天保留）  
**数据来源**: 真实代码与数据库（`restaurant_points_dev`，MySQL 8.0.42）  
**适用版本**: 抽奖模块 v4.x → v5.x（一次性干净统一重构）

---

## 附录：拍板决策时间线

| 日期 | 决策内容 |
|-----|---------|
| 2026-01-18 | 迁移前提确认（未上线、一次性投入、不兼容旧接口） |
| 2026-01-18 | 架构目标确认（单体 + 模块化） |
| 2026-01-18 | 审计强度确认（每次抽奖落完整决策快照） |
| 2026-01-18 | 定价规则来源确认（management_settings） |
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

