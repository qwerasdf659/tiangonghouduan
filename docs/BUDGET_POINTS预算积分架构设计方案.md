# BUDGET_POINTS 预算积分架构设计方案

**文档版本**：v1.0  
**创建时间**：2025年1月4日  
**适用系统**：餐厅积分抽奖系统 V4  
**设计目标**：实现"用户维度预算"与"活动池维度预算"的统一架构  
**设计基础**：基于真实库核查报告（`docs/积分预算架构真实状态核查报告.md`）

---

## 📊 一、当前系统真实状态

### 1.1 表结构现状（已就绪）

```sql
-- account_asset_balances 表
CREATE TABLE account_asset_balances (
  balance_id BIGINT PRIMARY KEY AUTO_INCREMENT,
  account_id BIGINT NOT NULL,
  asset_code VARCHAR(50) NOT NULL,
  campaign_id VARCHAR(50) NULL,           -- ✅ 已存在，支持活动维度
  available_amount BIGINT NOT NULL DEFAULT 0,
  frozen_amount BIGINT NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,

  UNIQUE KEY uk_account_asset_campaign (account_id, asset_code, campaign_id)
);
```

**关键发现**：

- `campaign_id` 字段**已存在**
- 唯一约束**已包含** `campaign_id`（支持同一账户在不同活动有独立预算）

### 1.2 真实数据现状（未就绪）

```javascript
// 真实库统计（2025-01-03 核查）
{
  POINTS: {
    余额记录: 7 条,
    总余额: 48352,
    流水记录: 1 条
  },
  BUDGET_POINTS: {
    余额记录: 0 条,      // ⚠️ 完全没有数据
    总余额: 0,
    流水记录: 0 条       // ⚠️ 完全没有数据
  }
}
```

**核心问题**：

- `BUDGET_POINTS` 在真实库中**完全不存在**
- 代码有发放逻辑，但未产生真实数据
- 抽奖"预算过滤"实际用的是 `POINTS`（而非 `BUDGET_POINTS`）

### 1.3 代码现状（部分实现）

**已实现部分**：

- `ConsumptionService.approveConsumption()`：审核通过时会发放 `BUDGET_POINTS`
- `AccountAssetBalance` 模型：支持 `campaign_id` 字段
- `AssetService.changeBalance()`：支持写入 `BUDGET_POINTS` 流水

**未实现/不一致部分**：

- 发放 `BUDGET_POINTS` 时**未传 `campaign_id`**（无法实现活动隔离）
- 抽奖"预算过滤"用的是 `POINTS`（而非 `BUDGET_POINTS`）
- 没有"活动池预算"的初始化/查询/扣减逻辑

### 1.4 活动预算模式区分问题（重要）

#### 问题描述

**当前数据库中无法区分活动的预算模式**：

- `lottery_campaigns` 表**没有 `budget_mode` 字段**
- **没有 `pool_budget_total` / `pool_budget_remaining` 字段**
- **没有 `allowed_campaign_ids` 字段**

真实字段列表（2025-01-04 核查）：

```javascript
lottery_campaigns 现有字段：
- campaign_id, campaign_name, campaign_code, campaign_type
- cost_per_draw, max_draws_per_user_daily, max_draws_per_user_total
- total_prize_pool, remaining_prize_pool, prize_distribution_config
- start_time, end_time, daily_reset_time
- banner_image_url, description, rules_text
- status, total_participants, total_draws, total_prizes_awarded
- created_at, updated_at
- participation_conditions, condition_error_messages
```

示例活动记录：

```javascript
{
  campaign_id: 1,
  campaign_code: 'BASIC_LOTTERY',
  campaign_name: '餐厅积分抽奖',
  campaign_type: 'permanent',  // ⚠️ 只能表达"长期/短期"，不能表达预算模式
  status: 'ended',
  start_time: '2025-08-18',
  end_time: '2025-12-31'
}
```

#### 当前判断方式（不可靠）

仅能通过**代码路径推断**，无法从数据库直接区分：

- 如果抽奖时扣的是**用户账户**的 `BUDGET_POINTS(campaign_id=xxx)` → 推测为"用户预算活动"
- 如果抽奖时扣的是**系统账户 `SYSTEM_CAMPAIGN_POOL`** 的 `BUDGET_POINTS(campaign_id=xxx)` → 推测为"活动池预算活动"
- 如果抽奖时不扣 `BUDGET_POINTS` → 推测为"无预算约束活动"

**缺陷**：

- 依赖人为约定，容易跑偏
- 无法在创建活动时强制声明预算模式
- 运营后台无法直观展示活动的预算类型
- 无法防止"同一活动混用两种预算"的错误

#### 解决方案：强制添加 `budget_mode` 字段

**必需的表结构变更**（见下文 3.1.1 节）：

```sql
-- 添加预算模式字段（强制字段）
ALTER TABLE lottery_campaigns
  ADD COLUMN budget_mode ENUM('user', 'pool', 'none') NOT NULL DEFAULT 'none'
  COMMENT '预算模式：user-用户维度预算，pool-活动池预算，none-无预算约束';

-- 活动池预算相关字段（仅 budget_mode=pool 时使用）
ALTER TABLE lottery_campaigns
  ADD COLUMN pool_budget_total INT NULL DEFAULT NULL
  COMMENT '活动池总预算（仅 budget_mode=pool 时使用）';

ALTER TABLE lottery_campaigns
  ADD COLUMN pool_budget_remaining INT NULL DEFAULT NULL
  COMMENT '活动池剩余预算（仅 budget_mode=pool 时使用，抽奖时递减）';

-- 用户预算来源配置（仅 budget_mode=user 时使用）
ALTER TABLE lottery_campaigns
  ADD COLUMN allowed_campaign_ids TEXT NULL DEFAULT NULL
  COMMENT '允许使用的用户预算来源活动ID列表（仅 budget_mode=user 时使用，JSON数组）';
```

**添加字段后的区分逻辑**：
| 预算模式 | budget_mode | 预算归属 | 扣减对象 | 相关字段 |
|---------|------------|---------|---------|---------|
| 用户维度预算 | `'user'` | 用户账户 | 用户自己的 `BUDGET_POINTS` | `allowed_campaign_ids` |
| 活动池预算 | `'pool'` | 系统账户 | 活动池的 `BUDGET_POINTS` | `pool_budget_total`, `pool_budget_remaining` |
| 无预算约束 | `'none'` | - | 不扣预算 | - |

#### 现有活动的迁移方案

对现有 `BASIC_LOTTERY` 活动，需要人工判定其预算模式：

**判定依据**：

1. **检查当前抽奖扣减逻辑**：查看 `BasicGuaranteeStrategy.getAvailablePrizes()` 实际在用什么余额做预算过滤
2. **检查 BUDGET_POINTS 发放逻辑**：`ConsumptionService` 是否在发放用户维度预算
3. **检查活动池初始化**：是否有"活动池预算账户"在 `account_asset_balances` 里持有该活动的 `BUDGET_POINTS`

**迁移 SQL 模板**：

```sql
-- 方案 1：标记为"用户预算活动"
UPDATE lottery_campaigns
SET budget_mode = 'user',
    allowed_campaign_ids = JSON_ARRAY('BASIC_LOTTERY')
WHERE campaign_code = 'BASIC_LOTTERY';

-- 方案 2：标记为"活动池预算活动"
UPDATE lottery_campaigns
SET budget_mode = 'pool',
    pool_budget_total = 0,      -- 需要运营配置初始预算
    pool_budget_remaining = 0
WHERE campaign_code = 'BASIC_LOTTERY';

-- 方案 3：标记为"无预算约束"（当前最可能）
UPDATE lottery_campaigns
SET budget_mode = 'none'
WHERE campaign_code = 'BASIC_LOTTERY';
```

**推荐方案**：

- 如果当前系统**没有在用 `BUDGET_POINTS`**（核查报告显示余额/流水都为0） → 标记为 `'none'`
- 如果未来要启用预算系统 → 新创建活动时明确指定 `budget_mode='user'` 或 `'pool'`

---

## 🎯 二、业务需求明确（基于用户确认）

### 2.0 核心业务规则（用户拍板 - 强制约束）

#### 核心决策确认（2025-01-04 最终拍板）

**✅ 方案确认：双账户体系 - BUDGET_POINTS 预算模式**

- **POINTS（可见积分）**：仅作为抽奖门票，控制"能否参加抽奖"
- **BUDGET_POINTS（预算积分）**：作为内部预算，控制"能抽到什么奖品"
- **用户感知**：用户侧完全无感知两套账户体系存在

**✅ prize_value_points 语义确认：成本档位 / 预算成本**

- **含义**：系统为发放该奖品需要消耗的预算额度（内部成本）
- **作用**：用于成本控制（预算够不够、预算扣不扣得动、预算用完自动降级到空奖）
- **越大越贵**：数值越大，发放该奖品的成本越高
- **对账对象**：能跟预算池/预算账户严丝合缝对账
- **用户不可见**：用户永远看不到此字段，只有运营/财务/系统关心

**✅ 与"奖励档位/价值档位"的区别**

- `prize_value_points`（成本档位）：系统内部成本口径，用户不可见
- `prize_value`（展示价值）：用户可见的奖品价值/展示积分
- `rarity`（稀有度）：用户可见的奖品档次感知
- **不混用**：成本与价值分离，成本用于风控，价值用于展示

---

#### 规则 1：奖品配置强制约束

**每个活动 必须 至少配置 1 个 `prize_value_points = 0` 的奖品（空奖）**

- **目的**：保证预算耗尽时仍有兜底奖品可抽，系统不会报错
- **约束范围**：无论通过代码修改还是Web管理后台修改奖品配置，都必须强制执行此约束
- **验证时机**：
  - ✅ 活动创建时：后台API必须强制校验
  - ✅ 奖品修改时：每次修改奖品配置必须重新校验
  - ✅ 奖品删除时：删除后必须校验剩余奖品是否仍满足约束
  - ✅ 奖品批量导入时：导入前必须校验整体配置
- **强制拦截**：
  - ❌ 不满足约束时，直接拒绝操作并提示错误
  - ❌ 不允许"先保存后补充"，必须当场满足约束
  - ❌ 管理员权限也不可绕过此约束
- **验证逻辑**：

```javascript
// 奖品配置强制校验（适用于所有修改入口）
function validatePrizeConfig(prizes) {
  const hasEmptyPrize = prizes.some(p => (p.prize_value_points || 0) === 0)

  if (!hasEmptyPrize) {
    throw new Error('❌ 强制约束：活动必须至少配置一个空奖（prize_value_points=0），否则不允许保存')
  }

  return true
}

// API层强制拦截示例
router.post('/campaigns/:id/prizes', async (req, res) => {
  const { prizes } = req.body

  try {
    // ✅ 强制校验
    validatePrizeConfig(prizes)

    // 校验通过后才允许保存
    await savePrizes(prizes)

    return res.apiSuccess(null, '奖品配置保存成功')
  } catch (error) {
    // ❌ 校验失败，拒绝操作
    return res.apiBadRequest(error.message)
  }
})

// 管理后台前端也应该有相同的校验提示
// 前端校验（提升用户体验，但后端校验是强制的）
function validatePrizesInFrontend(prizes) {
  const hasEmptyPrize = prizes.some(p => (p.prize_value_points || 0) === 0)

  if (!hasEmptyPrize) {
    alert('❌ 至少需要配置一个预算成本为0的奖品（空奖/兜底奖），否则预算耗尽时抽奖会失败')
    return false
  }

  return true
}
```

- **错误提示规范**：
  - 代码调用：`throw new Error('活动必须至少配置一个空奖（prize_value_points=0）')`
  - API响应：`{ "success": false, "code": "INVALID_PRIZE_CONFIG", "message": "至少需要配置一个预算成本为0的奖品" }`
  - 管理后台：弹窗提示 "❌ 至少需要配置一个预算成本为0的奖品（空奖/兜底奖），否则预算耗尽时抽奖会失败"

#### 规则 2：双积分体系分工明确（用户拍板 - 方案B）

**POINTS 仅作为门票控制"能否参加抽奖"，BUDGET_POINTS 控制"能抽到什么"**

| 积分类型                          | 作用             | 业务语义             | 获取方式         | 耗尽后果     | 用户可见  |
| --------------------------------- | ---------------- | -------------------- | ---------------- | ------------ | --------- |
| **POINTS**<br>（可见积分）        | 控制抽奖动作资格 | 抽奖门票             | 充值/活动/任务   | 无法发起抽奖 | ✅ 可见   |
| **BUDGET_POINTS**<br>（预算积分） | 控制可抽奖品范围 | 预算额度（成本控制） | 消费抽成自动注入 | 只能抽空奖   | ❌ 不可见 |

**关键逻辑（方案B最终确认）**：

- POINTS ≥ cost_per_draw → **允许参加抽奖**（即使 BUDGET_POINTS = 0）
- POINTS < cost_per_draw → **不允许参加抽奖**（即使 BUDGET_POINTS 很多）
- 预算为 0 时仍允许抽奖，但**抽到的一定是空奖**（用户无感知）
- **POINTS 只控制"能不能参加抽奖"**，不参与预算过滤逻辑

#### 规则 3：用户感知隔离（重要）

**禁止向用户透露双账户体系存在**

- **原则**：用户只需要知道"POINTS 够就能抽"，至于抽到什么由系统控制
- **禁止话术**：
  - ❌ "您的预算积分不足，无法获得高价值奖品"
  - ❌ "请先充值预算积分"
  - ❌ "您的预算余额为 XXX"
- **推荐话术**：
  - ✅ "恭喜您获得了 XX 奖品"
  - ✅ "很遗憾未中奖，再接再厉"
  - ✅ "您的积分余额为 XXX"（仅指 POINTS）
- **实现要求**：
  - 前端不展示 BUDGET_POINTS 余额
  - 客服话术培训必须遵守此规则
  - API 响应不向前端返回 BUDGET_POINTS 信息（除管理后台）

#### 规则 4：抽奖费扣除规则

**无论预算是否充足，抽奖费（POINTS）始终扣除**

```javascript
// 抽奖扣费逻辑
抽奖前：
  - 扣除 cost_per_draw 的 POINTS（必扣）

抽奖中（预算过滤）：
  - 预算充足 → 可抽高价值奖品
  - 预算不足 → 只能抽低价值/空奖

抽奖后（中奖扣费）：
  - 抽到空奖（prize_value_points=0） → 不扣 BUDGET_POINTS
  - 抽到实物奖品（prize_value_points>0） → 扣除对应的 BUDGET_POINTS
```

**示例场景**：

- 用户 POINTS=500, BUDGET_POINTS=0
- 活动 cost_per_draw=100
- 结果：
  - ✅ 允许抽奖（POINTS 够）
  - ✅ 扣除 100 POINTS
  - ✅ 只能抽到空奖（预算不足过滤掉所有实物奖品）
  - ✅ 不扣 BUDGET_POINTS（空奖无成本）
  - ✅ 用户体验：正常抽奖，获得空奖，无感知预算系统存在

---

### 2.1 核心决策（用户拍板 - 2025-01-04）

#### 决策 1：BUDGET_POINTS 是真实可消费资产

- **性质定位**：BUDGET_POINTS 是真实的"预算额度"，不是虚拟门槛
- **消耗方式**：**抽奖前过滤 + 中奖后扣减**（完整双重约束）
- **业务语义**：类比"钱包里的钱"，先看够不够买（过滤），买了就扣钱（扣减）

#### 决策 2：抽奖预算过滤逻辑明确

- **奖品池（全集）**：活动配置的所有奖品，存储在数据库 `lottery_prizes` 表，不会被"放进去/拿出去"
- **过滤（子集）**：抽奖前临时筛选出"本次用户可抽的奖品列表"
- **过滤规则**：
  - 用户维度预算：只保留 `prize_value_points <= 用户可用 BUDGET_POINTS` 的奖品
  - 活动池维度预算：只保留 `prize_value_points <= 活动池剩余 BUDGET_POINTS` 的奖品
  - 过滤后至少保留空奖（`prize_value_points = 0`）
- **扣减时机**：抽中奖品后，从对应预算账户扣减 `prize_value_points`

#### 决策 3：活动预算模式强制声明

- **强制字段**：每个活动创建时**必须明确指定** `budget_mode`
- **可选值**：`'user'`（用户维度预算）、`'pool'`（活动池预算）、`'none'`（无预算约束）
- **禁止混用**：一个活动**不可以同时存在两种预算**
- **后台验证**：创建活动 API 必须校验 `budget_mode` 不为空

#### 决策 4：两种预算模式都要实现（方案B最终确认）

- ✅ **路线1：用户维度预算（BUDGET_POINTS）- 主要方案**
  - **预算来源**：从门店消费抽成自动注入
  - **商业语义**：消费返"预算积分"（内部成本额度），用于成本控制
  - **与普通积分分离**：POINTS（抽奖门票，只控制能否参加）vs BUDGET_POINTS（预算额度，控制能抽到什么）
  - **用户完全无感知**：用户不知道 BUDGET_POINTS 存在，只看到 POINTS
  - **实现优先级**：先把最小闭环跑起来
- ✅ **路线2：活动池预算（SYSTEM_CAMPAIGN_POOL）**
  - **预算来源**：运营手动充值
  - **商业语义**：活动有总预算上限（成本控制），先到先得
  - **实现需求**：
    - 新系统账户的引入（`SYSTEM_CAMPAIGN_POOL`）
    - 活动配置字段扩展（`budget_mode`/`pool_budget_total`/`pool_budget_remaining`）
    - 抽奖时从系统账户扣池子预算

#### 决策 5：campaign_id 存储方案（关键技术决策）

- ✅ **采用方案：存储 `campaign_code`（字符串）**
  - **存储内容**：`account_asset_balances.campaign_id = 'BASIC_LOTTERY'`（字符串格式）
  - **不使用**：数值 `campaign_id`（如 `1`, `2`, `3`）
- **选择理由**：
  - ✅ 与当前列类型 `varchar(50)` 天然匹配，不用改表结构
  - ✅ `campaign_code` 是业务稳定标识，更适合做隔离/统计/运营配置
  - ✅ `campaign_code` 在不同环境（开发/测试/生产）保持一致，便于数据迁移
- **实现约定**：
  - 所有涉及 BUDGET_POINTS 的操作，`campaign_id` 参数传 `campaign_code`（字符串）
  - 查询/Join 时使用 `campaign_code` 对齐（而不是数值主键）
  - 示例：`campaign_id: 'LONG_TERM_2025'` 而不是 `campaign_id: 1`

#### 决策 6：预算维度区分（方案B最终确认）

- **用户维度预算**：预算归属于用户账户，扣用户自己的 `BUDGET_POINTS`（用户不可见）
- **活动池维度预算**：预算归属于活动（系统账户），扣活动池的 `BUDGET_POINTS`（用户不可见）
- **过滤视角不同**：前者按用户余额过滤，后者按活动池余额过滤
- **用户感知统一**：无论哪种模式，用户只看到 POINTS 余额，不知道预算机制

### 2.1 两种预算类型（基于用户拍板决策）

#### 类型 A：用户维度预算（User Budget）- 路线1（✅ 已确认为主要方案）

**业务场景**：长期活动，门店消费返预算

- 用户在门店消费 → **按比例自动获得预算积分**（如消费 1000 元 × 0.24 = 240 预算积分）
- 预算积分**归属于用户本人**
- 预算积分**只能用于特定活动/活动类型**（有 scope 约束）
- 用户参与活动抽奖时，从**用户自己的预算余额**扣减
- **预算来源**：消费抽成自动注入（系统自动发放）
- **⚠️ 用户完全无感知**：用户不知道 BUDGET_POINTS 的存在

**数据结构**：

```javascript
{
  account_id: 5,                    // 用户账户ID（user_id=31 对应 account_id=5）
  asset_code: 'BUDGET_POINTS',
  campaign_id: 'LONG_TERM_2025',    // ✅ 存储 campaign_code（字符串）
  available_amount: 240,             // 用户在该活动的预算余额（内部成本额度）
  frozen_amount: 0
}
```

**商业语义（方案B最终确认）**：

- **POINTS（普通积分）**：抽奖门票，只控制"能否参加抽奖"，每次消耗固定数量（如 100）
- **BUDGET_POINTS（预算积分）**：预算额度（内部成本控制），控制"能抽到什么"，用户完全无感知
- **prize_value_points**：奖品的成本档位（预算成本），越大越贵，用于预算过滤与扣减

#### 类型 B：活动池维度预算（Campaign Pool Budget）- 路线2

**业务场景**：短期活动，活动总预算成本控制

- 短期活动创建时，**运营手动充值活动总预算**（如 2000 预算积分）
- 预算**归属于活动本身**（不归属任何用户）
- 符合条件的用户可以参与抽奖"先到先得"
- 抽中奖品后，从**活动池预算**扣减
- 池子抽完就没了（活动自然结束/只剩空奖）
- **预算来源**：运营手动充值（管理后台操作）

**数据结构**：

```javascript
{
  account_id: 999,                   // 系统账户ID（SYSTEM_CAMPAIGN_POOL）
  asset_code: 'BUDGET_POINTS',
  campaign_id: 'SHORT_TERM_202501',  // ✅ 存储 campaign_code（字符串）
  available_amount: 2000,             // 活动剩余预算
  frozen_amount: 0
}
```

**商业语义**：

- 活动有总预算上限（成本控制）
- 先到先得，预算用完活动自然结束
- 运营可控的活动成本

### 2.2 核心约束（用户强调）

#### 约束 1：一个活动只能有一种预算模式

> **"一个活动不可以存在两种预算"**

**语义解释**：

- 每个活动（`campaign_id`）在创建时**强制明确选择**预算模式：
  - `budget_mode: 'user'`（使用用户维度预算）
  - `budget_mode: 'pool'`（使用活动池维度预算）
  - `budget_mode: 'none'`（无预算约束）
- 抽奖时**只能消耗一种预算**（不允许同时扣用户预算+活动池预算）
- **禁止混用**：同一活动不允许部分用户用用户预算、部分用户用活动池预算

#### 约束 2：BUDGET_POINTS 的双重约束机制

**抽奖前过滤（Pre-Filter）**：

- 系统先查询用户/活动池的可用 BUDGET_POINTS 余额
- 从活动奖品池（全集）中筛选出 `prize_value_points <= 余额` 的奖品（子集）
- 如果过滤后无奖品，至少保留空奖（`prize_value_points = 0`）
- **不修改奖品池配置**，只是临时决定本次抽奖可参与的奖品范围

**中奖后扣减（Post-Deduct）**：

- 抽中奖品后，从对应预算账户扣减 `prize_value_points`
- 用户预算模式：扣用户的 `BUDGET_POINTS(campaign_id=xxx)`
- 活动池模式：扣系统账户的 `BUDGET_POINTS(campaign_id=xxx)` 并同步更新 `pool_budget_remaining`
- **扣减必须成功**，否则整个抽奖事务回滚

#### 约束 3：预算余额必须真实可用

- 所有 BUDGET_POINTS 余额必须有对应的流水记录（可审计）
- 禁止直接插入余额表，必须通过 `AssetService.changeBalance()` 产生
- 余额不足时抽奖前过滤会自动降级到空奖（不会报错）
- 中奖后扣减余额不足会导致事务回滚（系统保护）

### 2.3 BUDGET_POINTS 使用模式说明

#### 模式确认：抽奖前过滤 + 中奖后扣减

**业务语义**：BUDGET_POINTS 是真实的"可消费资产"，类似钱包里的钱

**执行流程**：

```
1. 用户点击抽奖
   ↓
2. 系统查询用户/活动池的可用 BUDGET_POINTS 余额（如 1000）
   ↓
3. 从活动奖品池（全集）筛选可抽奖品（子集）
   - 保留：prize_value_points <= 1000 的奖品
   - 过滤：prize_value_points > 1000 的奖品（本次不可抽）
   - 兜底：至少保留空奖（prize_value_points = 0）
   ↓
4. 在筛选后的子集中，按概率随机抽取一个奖品
   ↓
5. 如果中奖且 prize_value_points > 0：
   - 从预算账户扣减 prize_value_points
   - 扣减失败 → 整个抽奖事务回滚
   ↓
6. 发放奖品（物品实例/资产）
   ↓
7. 返回抽奖结果
```

**关键特征**：

- ✅ **过滤**：预算不够的奖品本次抽不到（但仍在奖品池配置中）
- ✅ **扣减**：中奖后真实扣除预算余额
- ✅ **可审计**：每次扣减都有流水记录
- ✅ **成本可控**：预算余额直接限制了中奖成本上限

**通俗类比**：

- 进商店前先看钱包够不够买（过滤）
- 买到后结账扣钱（扣减）
- 钱包余额始终真实反映你的购买能力

#### 为什么不用"只过滤不扣减"或"只扣减不预过滤"？

**只过滤不扣减（门槛模式）**：

- 问题：预算不会减少，用户可能长期一直能抽高价值奖品
- 风险：成本控制依赖其他机制（库存、概率、次数限制）
- 不符合"预算积分"的语义（既然叫"积分"就应该能消耗）

**只扣减不预过滤（先抽后结账）**：

- 问题：可能抽到买不起的奖品，需要回滚/降级/透支
- 风险：用户体验差（抽到了发不出来）
- 并发场景更容易出问题

**抽奖前过滤 + 中奖后扣减（推荐）**：

- ✅ 最符合直觉：先看买得起什么，买了就扣钱
- ✅ 可审计性强：每笔扣减都有记录
- ✅ 成本可控：预算用完自动降级到空奖
- ✅ 用户体验好：抽到的一定能发放

### 2.4 数字只是示意

- 240、2000、0.24 等数字都是为了说明概念
- 实际系统应该是**配置驱动**（预算系数、活动总预算都是运营可配置参数）

### 2.5 活动创建时的强制约束

#### 后台创建活动时必填项

```javascript
// 创建活动 API 请求体（必填字段）
{
  campaign_code: 'LONG_TERM_2025',          // 必填
  campaign_name: '长期消费返预算活动',         // 必填
  campaign_type: 'permanent',               // 必填
  budget_mode: 'user',                      // ✅ 必填：强制声明预算模式

  // 如果 budget_mode='user'，建议填写（可选）
  allowed_campaign_ids: ['LONG_TERM_2025'], // 允许使用的预算来源

  // 如果 budget_mode='pool'，必填
  pool_budget_total: 5000,                  // 活动总预算
  pool_budget_remaining: 5000,              // 初始剩余预算

  // 如果 budget_mode='none'，无需填写预算相关字段

  // 其他通用字段...
}
```

#### 后台验证规则

```javascript
// 创建活动时的强制校验逻辑
function validateCampaignCreation(data) {
  // 规则1：budget_mode 必填且值合法
  if (!data.budget_mode || !['user', 'pool', 'none'].includes(data.budget_mode)) {
    throw new Error('budget_mode 必填，且只能是 user/pool/none')
  }

  // 规则2：pool 模式必须提供预算总额
  if (data.budget_mode === 'pool') {
    if (!data.pool_budget_total || data.pool_budget_total <= 0) {
      throw new Error('budget_mode=pool 时，必须提供有效的 pool_budget_total')
    }
    if (!data.pool_budget_remaining) {
      data.pool_budget_remaining = data.pool_budget_total // 自动设置
    }
  }

  // 规则3：user 模式建议提供预算来源
  if (data.budget_mode === 'user' && !data.allowed_campaign_ids) {
    // 默认只允许使用本活动的预算
    data.allowed_campaign_ids = [data.campaign_code]
  }

  // 规则4：none 模式不应有预算字段
  if (data.budget_mode === 'none') {
    if (data.pool_budget_total || data.allowed_campaign_ids) {
      console.warn('budget_mode=none 但提供了预算配置，将被忽略')
    }
  }

  return true
}
```

### 3.1 数据库层设计

#### 3.1.1 活动表（LotteryCampaign）扩展字段

```sql
-- lottery_campaigns 表需新增字段
ALTER TABLE lottery_campaigns ADD COLUMN budget_mode ENUM('user', 'pool', 'none') NOT NULL DEFAULT 'none'
  COMMENT '预算模式：user-用户维度预算，pool-活动池预算，none-无预算约束';

ALTER TABLE lottery_campaigns ADD COLUMN pool_budget_total INT NULL DEFAULT NULL
  COMMENT '活动池总预算（仅 budget_mode=pool 时使用）';

ALTER TABLE lottery_campaigns ADD COLUMN pool_budget_remaining INT NULL DEFAULT NULL
  COMMENT '活动池剩余预算（仅 budget_mode=pool 时使用，抽奖时递减）';

ALTER TABLE lottery_campaigns ADD COLUMN allowed_campaign_ids TEXT NULL DEFAULT NULL
  COMMENT '允许使用的用户预算来源活动ID列表（仅 budget_mode=user 时使用，JSON数组，如 ["campaign_001","campaign_003"]）';
```

#### 3.1.2 账户资产余额表（account_asset_balances）

**当前表结构已满足需求**，无需修改：

```sql
-- 唯一约束已支持活动维度
UNIQUE KEY uk_account_asset_campaign (account_id, asset_code, campaign_id)

-- campaign_id 字段类型
campaign_id VARCHAR(50) NULL  -- ✅ 支持字符串格式，存储 campaign_code
```

**预算记录规范（基于用户拍板决策）**：

- **用户预算**：
  - `account_type='user'`
  - `asset_code='BUDGET_POINTS'`
  - `campaign_id='LONG_TERM_2025'`（✅ 存储 campaign_code 字符串）
  - 含义：用户在某活动的预算
- **活动池预算**：
  - `account_type='system'`
  - `system_code='SYSTEM_CAMPAIGN_POOL'`
  - `asset_code='BUDGET_POINTS'`
  - `campaign_id='SHORT_TERM_202501'`（✅ 存储 campaign_code 字符串）
  - 含义：活动池预算

**campaign_id 存储方案说明**：
| 方案 | 存储内容 | 优点 | 缺点 | 用户决策 |
|-----|---------|------|------|---------|
| 方案A | `campaign_code`（字符串）<br>如 `'BASIC_LOTTERY'` | • 与当前列类型 `varchar(50)` 天然匹配<br>• 业务稳定标识，适合隔离/统计<br>• 跨环境迁移更方便 | • 查询/Join 需要用字符串对齐 | ✅ **已采用** |
| 方案B | 数值 `campaign_id`<br>如 `1`, `2`, `3` | • 数值主键查询效率高<br>• 外键关联更直接 | • 需要改列类型或统一策略<br>• 跨环境不一致 | ❌ 不采用 |

**实现约定**：

```javascript
// ✅ 正确：使用 campaign_code（字符串）
await AssetService.changeBalance({
  user_id: userId,
  asset_code: 'BUDGET_POINTS',
  campaign_id: 'LONG_TERM_2025', // ✅ 字符串格式
  delta_amount: 240
  // ...
})

// ❌ 错误：使用数值 campaign_id
await AssetService.changeBalance({
  user_id: userId,
  asset_code: 'BUDGET_POINTS',
  campaign_id: 1, // ❌ 不使用数值
  delta_amount: 240
  // ...
})
```

#### 3.1.3 系统账户初始化

```sql
-- 创建活动池预算系统账户
INSERT INTO accounts (account_type, system_code, status, created_at, updated_at)
VALUES ('system', 'SYSTEM_CAMPAIGN_POOL', 'active', NOW(), NOW())
ON DUPLICATE KEY UPDATE updated_at=NOW();
```

### 3.2 业务层设计

#### 3.2.1 预算发放逻辑（ConsumptionService - 用户维度预算自动注入）

**用户拍板决策**：用户维度预算从**门店消费抽成自动注入**

**当前代码问题**：发放 `BUDGET_POINTS` 时未传 `campaign_id`

**修复方案**：

```javascript
// services/ConsumptionService.js - approveConsumption()

// ❌ 当前代码（未传 campaign_id）
const budgetResult = await AssetService.changeBalance({
  user_id: record.user_id,
  asset_code: 'BUDGET_POINTS',
  delta_amount: budgetPointsToAllocate,
  business_type: 'consumption_budget_allocation',
  idempotency_key: `consumption_budget:approve:${recordId}`,
  meta: { ... }
}, { transaction })

// ✅ 修复后（必须传 campaign_id，使用 campaign_code 字符串）
const targetCampaignCode = await getDefaultBudgetCampaign() // 查询配置：消费返预算归属哪个活动
const budgetResult = await AssetService.changeBalance({
  user_id: record.user_id,
  asset_code: 'BUDGET_POINTS',
  campaign_id: targetCampaignCode,  // ✅ 必须：用户预算归属于哪个活动（字符串格式，如 'LONG_TERM_2025'）
  delta_amount: budgetPointsToAllocate,
  business_type: 'consumption_budget_allocation',
  idempotency_key: `consumption_budget:approve:${recordId}`,
  meta: {
    consumption_id: recordId,
    consumption_amount: record.consumption_amount,
    budget_ratio: budgetRatio,
    target_campaign_code: targetCampaignCode,  // 记录归属活动
    description: '门店消费抽成自动注入预算'  // 业务语义
  }
}, { transaction })

/**
 * 获取默认预算归属活动
 * 从系统配置中读取消费返预算应该归属哪个活动
 *
 * @returns {Promise<string>} campaign_code（字符串格式）
 */
async function getDefaultBudgetCampaign() {
  // 方案1：从 system_settings 表读取
  const setting = await SystemSetting.findOne({
    where: { setting_key: 'consumption_budget_target_campaign' }
  })

  if (setting && setting.setting_value) {
    return setting.setting_value  // 如 'LONG_TERM_2025'
  }

  // 方案2：从环境变量读取
  if (process.env.DEFAULT_BUDGET_CAMPAIGN) {
    return process.env.DEFAULT_BUDGET_CAMPAIGN
  }

  // 方案3：fallback 到配置文件
  return require('../config/business').DEFAULT_BUDGET_CAMPAIGN || 'LONG_TERM_2025'
}
```

**配置示例**（`system_settings` 表）：

```sql
INSERT INTO system_settings (setting_key, setting_value, setting_type, description)
VALUES
  ('consumption_budget_ratio', '0.24', 'number', '消费返预算系数（消费金额×系数=预算积分）'),
  ('consumption_budget_target_campaign', 'LONG_TERM_2025', 'string', '消费返预算归属的活动代码'),
  ('consumption_budget_enabled', 'true', 'boolean', '是否启用消费返预算');
```

#### 3.2.2 活动池预算初始化（新增 - 活动池预算运营手动充值）

**用户拍板决策**：活动池预算由**运营手动充值**

**业务场景**：创建短期活动时，运营通过管理后台手动充值活动池预算

```javascript
// services/ActivityService.js 或 PrizePoolService.js

/**
 * 初始化活动池预算（运营手动充值）
 *
 * @param {string} campaign_code - 活动代码（字符串，如 'SHORT_TERM_202501'）
 * @param {number} pool_budget_total - 活动池总预算
 * @param {Object} operatorInfo - 操作员信息
 * @param {Object} options - 选项
 * @returns {Promise<Object>} 初始化结果
 */
async function initializeCampaignPoolBudget(
  campaign_code,
  pool_budget_total,
  operatorInfo,
  options = {}
) {
  const { transaction } = options

  // 1. 验证活动存在且为活动池模式
  const campaign = await LotteryCampaign.findOne({
    where: { campaign_code: campaign_code, budget_mode: 'pool' },
    transaction
  })

  if (!campaign) {
    throw new Error(`活动不存在或非活动池预算模式: ${campaign_code}`)
  }

  // 2. 获取活动池系统账户
  const poolAccount = await AssetService.getOrCreateAccount(
    { system_code: 'SYSTEM_CAMPAIGN_POOL' },
    { transaction }
  )

  // 3. 创建活动池预算余额（运营手动充值）
  const budgetResult = await AssetService.changeBalance(
    {
      system_code: 'SYSTEM_CAMPAIGN_POOL',
      asset_code: 'BUDGET_POINTS',
      campaign_id: campaign_code, // ✅ 活动池预算归属于该活动（字符串格式）
      delta_amount: pool_budget_total, // 运营充值金额
      business_type: 'campaign_pool_init',
      idempotency_key: `campaign_pool_init:${campaign_code}:${Date.now()}`,
      meta: {
        campaign_code: campaign_code,
        campaign_name: campaign.campaign_name,
        pool_budget_total: pool_budget_total,
        operator_id: operatorInfo.operator_id,
        operator_name: operatorInfo.operator_name,
        description: `运营手动充值活动池预算 ${pool_budget_total}`,
        recharge_type: 'manual' // 标记为手动充值
      }
    },
    { transaction }
  )

  // 4. 更新活动表字段
  await LotteryCampaign.update(
    {
      pool_budget_total: pool_budget_total,
      pool_budget_remaining: pool_budget_total
    },
    {
      where: { campaign_code: campaign_code },
      transaction
    }
  )

  // 5. 记录审计日志
  await AuditLogService.logCampaignPoolRecharge(
    {
      operator_id: operatorInfo.operator_id,
      campaign_code: campaign_code,
      amount: pool_budget_total,
      operation_type: 'init',
      idempotency_key: `audit:pool_init:${campaign_code}:${Date.now()}`
    },
    { transaction }
  )

  return {
    campaign_code,
    pool_budget_total,
    balance_id: budgetResult.balance.balance_id,
    transaction_id: budgetResult.transaction_record.transaction_id,
    operator: operatorInfo.operator_name
  }
}
```

**管理后台 API 示例**：

```javascript
// routes/v4/admin/campaign-pool-budget.js

/**
 * POST /api/v4/admin/campaign-pool/recharge
 * 运营手动充值活动池预算
 */
router.post('/recharge', requireAdmin, async (req, res, next) => {
  try {
    const { campaign_code, amount, reason } = req.body

    // 参数验证
    if (!campaign_code || !amount || amount <= 0) {
      return res.apiBadRequest('参数错误：campaign_code 和 amount 必填且 amount 必须大于 0')
    }

    const operatorInfo = {
      operator_id: req.user.user_id,
      operator_name: req.user.nickname || req.user.mobile,
      reason: reason || '运营手动充值'
    }

    const result = await initializeCampaignPoolBudget(campaign_code, amount, operatorInfo)

    return res.apiSuccess(result, '活动池预算充值成功')
  } catch (error) {
    next(error)
  }
})
```

#### 3.2.3 抽奖预算查询与扣减（核心逻辑重构）

**当前问题**：`BasicGuaranteeStrategy.getAvailablePrizes()` 用的是 `POINTS`

**修复方案**：按活动配置的 `budget_mode` 走不同预算查询逻辑

**核心逻辑说明**：

- **奖品池（全集）**：从 `lottery_prizes` 表查询活动的所有奖品，不会修改这个全集
- **过滤（子集）**：根据用户/活动池的可用预算，临时筛选本次可抽的奖品
- **兜底保护**：过滤后如果无奖品，至少保留空奖（`prize_value_points = 0`）

```javascript
// services/UnifiedLotteryEngine/strategies/BasicGuaranteeStrategy.js

/**
 * 获取可用奖品池（预算过滤）
 *
 * ⚠️ 重要说明：
 * - 奖品池（全集）：活动配置的所有奖品，存储在 lottery_prizes 表
 * - 过滤（子集）：临时筛选出"本次用户可抽的奖品列表"
 * - 不修改奖品池配置，只是决定本次抽奖可参与的奖品范围
 *
 * @param {number} campaignId - 活动ID
 * @param {number|null} userId - 用户ID
 * @param {Object} options - 选项
 * @returns {Promise<Array>} 可用奖品列表（本次可抽的子集）
 */
async getAvailablePrizes(campaignId, userId = null, options = {}) {
  const { transaction = null } = options

  // 1. 查询活动配置（获取 budget_mode）
  const campaign = await LotteryCampaign.findByPk(campaignId, {
    attributes: ['campaign_id', 'budget_mode', 'pool_budget_remaining', 'allowed_campaign_ids'],
    transaction
  })

  if (!campaign) {
    throw new Error(`活动不存在：campaign_id=${campaignId}`)
  }

  // 2. 查询活动所有奖品（奖品池全集）
  const allPrizes = await LotteryPrize.findAll({
    where: { campaign_id: campaignId, status: 'active' },
    attributes: ['prize_id', 'prize_name', 'prize_type', 'prize_value_points', 'win_probability', 'stock_quantity'],
    order: [['win_probability', 'DESC']],
    transaction
  })

  if (allPrizes.length === 0) {
    return []
  }

  // 3. 根据 budget_mode 过滤奖品（筛选本次可抽的子集）
  let availablePrizes = allPrizes  // 默认全部可抽
  let remainingBudget = 0

  switch (campaign.budget_mode) {
    case 'user':
      // 用户维度预算：查询用户在相关活动的预算余额
      remainingBudget = await this.getUserBudgetBalance(userId, campaign, { transaction })

      // 过滤：只保留用户买得起的奖品
      availablePrizes = allPrizes.filter(p => (p.prize_value_points || 0) <= remainingBudget)

      this.logInfo('用户预算过滤（Pre-Filter）', {
        userId,
        campaignId,
        budget_mode: 'user',
        remainingBudget,
        allPrizesCount: allPrizes.length,
        availablePrizesCount: availablePrizes.length,
        filteredOutCount: allPrizes.length - availablePrizes.length
      })
      break

    case 'pool':
      // 活动池预算：查询活动池剩余预算
      remainingBudget = await this.getPoolBudgetBalance(campaignId, { transaction })

      // 过滤：只保留活动池买得起的奖品
      availablePrizes = allPrizes.filter(p => (p.prize_value_points || 0) <= remainingBudget)

      this.logInfo('活动池预算过滤（Pre-Filter）', {
        campaignId,
        budget_mode: 'pool',
        remainingBudget,
        allPrizesCount: allPrizes.length,
        availablePrizesCount: availablePrizes.length,
        filteredOutCount: allPrizes.length - availablePrizes.length
      })
      break

    case 'none':
      // 无预算约束：不过滤奖品（全集即可抽）
      this.logInfo('无预算约束', {
        campaignId,
        budget_mode: 'none',
        allPrizesCount: allPrizes.length
      })
      break

    default:
      throw new Error(`未知预算模式：${campaign.budget_mode}`)
  }

  // 4. 兜底保护：如果过滤后无奖品，至少保留空奖
  if (availablePrizes.length === 0) {
    availablePrizes = allPrizes.filter(p => (p.prize_value_points || 0) === 0)

    this.logWarn('预算耗尽，降级到空奖', {
      campaignId,
      userId,
      budget_mode: campaign.budget_mode,
      remainingBudget,
      emptyPrizesCount: availablePrizes.length
    })
  }

  return availablePrizes  // 返回本次可抽的奖品子集
}

/**
 * 获取用户预算余额（用户维度预算）
 *
 * @param {number} userId - 用户ID
 * @param {Object} campaign - 活动配置对象
 * @param {Object} options - 选项
 * @returns {Promise<number>} 用户可用预算余额
 */
async getUserBudgetBalance(userId, campaign, options = {}) {
  const { transaction } = options

  // 1. 解析允许使用的预算来源活动ID
  let allowedCampaignIds = []
  try {
    allowedCampaignIds = campaign.allowed_campaign_ids
      ? JSON.parse(campaign.allowed_campaign_ids)
      : [campaign.campaign_id]
  } catch (error) {
    // 解析失败，默认只允许当前活动
    allowedCampaignIds = [campaign.campaign_id]
  }

  // 2. 查询用户账户
  const account = await Account.findOne({
    where: { user_id: userId, account_type: 'user' },
    transaction
  })

  if (!account) {
    return 0
  }

  // 3. 查询用户在允许的活动中的预算总余额
  const balances = await AccountAssetBalance.findAll({
    where: {
      account_id: account.account_id,
      asset_code: 'BUDGET_POINTS',
      campaign_id: allowedCampaignIds  // ✅ 只查询允许使用的活动预算
    },
    attributes: ['available_amount'],
    transaction
  })

  // 4. 汇总用户可用预算
  const totalBudget = balances.reduce((sum, bal) => sum + Number(bal.available_amount), 0)

  this.logDebug('查询用户预算余额', {
    userId,
    campaignId: campaign.campaign_id,
    allowedCampaignIds,
    balanceCount: balances.length,
    totalBudget
  })

  return totalBudget
}

/**
 * 获取活动池预算余额（活动池维度预算）
 *
 * @param {string} campaignId - 活动ID
 * @param {Object} options - 选项
 * @returns {Promise<number>} 活动池剩余预算
 */
async getPoolBudgetBalance(campaignId, options = {}) {
  const { transaction } = options

  // 1. 查询活动池系统账户
  const poolAccount = await Account.findOne({
    where: { account_type: 'system', system_code: 'SYSTEM_CAMPAIGN_POOL' },
    transaction
  })

  if (!poolAccount) {
    this.logWarn('活动池系统账户不存在', { campaignId })
    return 0
  }

  // 2. 查询活动池在该活动的预算余额
  const balance = await AccountAssetBalance.findOne({
    where: {
      account_id: poolAccount.account_id,
      asset_code: 'BUDGET_POINTS',
      campaign_id: campaignId  // ✅ 活动池预算按活动隔离
    },
    attributes: ['available_amount'],
    transaction
  })

  const remainingBudget = balance ? Number(balance.available_amount) : 0

  this.logDebug('查询活动池预算余额', {
    campaignId,
    poolAccountId: poolAccount.account_id,
    remainingBudget
  })

  return remainingBudget
}
```

#### 3.2.4 抽奖预算扣减逻辑（抽中奖品后 - Post-Deduct）

**核心逻辑说明**：

- **扣减时机**：抽中奖品后，如果 `prize_value_points > 0`，则扣减对应预算
- **扣减对象**：根据活动 `budget_mode` 决定从哪个账户扣
- **事务保护**：扣减失败会导致整个抽奖事务回滚，确保不会"抽到但发不了"

```javascript
// services/UnifiedLotteryEngine/strategies/BasicGuaranteeStrategy.js

/**
 * 扣减预算（抽中奖品后 - Post-Deduct）
 *
 * ⚠️ 重要说明：
 * - 抽奖前已经通过预算过滤（Pre-Filter），此处是二次扣减确认
 * - 扣减失败会导致整个抽奖事务回滚
 * - 扣减成功才会继续发放奖品
 *
 * @param {Object} campaign - 活动配置
 * @param {number} userId - 用户ID
 * @param {Object} prize - 中奖奖品
 * @param {Object} options - 选项
 * @returns {Promise<Object>} 扣减结果
 */
async deductBudget(campaign, userId, prize, options = {}) {
  const { transaction, idempotency_key } = options

  const prizeValuePoints = prize.prize_value_points || 0

  // 如果奖品无预算成本，无需扣减
  if (prizeValuePoints === 0) {
    return {
      deducted: false,
      reason: '奖品无预算成本',
      prize_value_points: 0
    }
  }

  this.logInfo('开始扣减预算（Post-Deduct）', {
    campaign_id: campaign.campaign_id,
    budget_mode: campaign.budget_mode,
    user_id: userId,
    prize_id: prize.prize_id,
    prize_value_points: prizeValuePoints
  })

  // 根据活动预算模式扣减
  let deductResult
  switch (campaign.budget_mode) {
    case 'user':
      // 从用户预算扣减
      deductResult = await this.deductUserBudget(userId, campaign, prizeValuePoints, {
        transaction,
        idempotency_key: `${idempotency_key}:user_budget_deduct`,
        meta: {
          campaign_id: campaign.campaign_id,
          prize_id: prize.prize_id,
          prize_name: prize.prize_name,
          deduct_reason: '抽奖中奖扣除用户预算'
        }
      })
      break

    case 'pool':
      // 从活动池预算扣减
      deductResult = await this.deductPoolBudget(campaign.campaign_id, prizeValuePoints, {
        transaction,
        idempotency_key: `${idempotency_key}:pool_budget_deduct`,
        meta: {
          campaign_id: campaign.campaign_id,
          user_id: userId,
          prize_id: prize.prize_id,
          prize_name: prize.prize_name,
          deduct_reason: '抽奖中奖扣除活动池预算'
        }
      })
      break

    case 'none':
      // 无预算约束，不扣减
      return {
        deducted: false,
        reason: '活动无预算约束',
        budget_mode: 'none'
      }

    default:
      throw new Error(`未知预算模式：${campaign.budget_mode}`)
  }

  this.logInfo('预算扣减成功（Post-Deduct）', {
    campaign_id: campaign.campaign_id,
    budget_mode: campaign.budget_mode,
    user_id: userId,
    prize_id: prize.prize_id,
    deducted_amount: prizeValuePoints,
    deduct_result: deductResult
  })

  return deductResult
}

/**
 * 扣减用户预算
 */
async deductUserBudget(userId, campaign, amount, options = {}) {
  const { transaction, idempotency_key, meta = {} } = options

  // 解析允许使用的预算来源活动ID
  const allowedCampaignIds = campaign.allowed_campaign_ids
    ? JSON.parse(campaign.allowed_campaign_ids)
    : [campaign.campaign_id]

  // 查询用户账户
  const account = await AssetService.getOrCreateAccount(
    { user_id: userId },
    { transaction }
  )

  // 查询用户在允许的活动中的预算余额（按优先级排序）
  const balances = await AccountAssetBalance.findAll({
    where: {
      account_id: account.account_id,
      asset_code: 'BUDGET_POINTS',
      campaign_id: allowedCampaignIds
    },
    order: [['available_amount', 'DESC']],  // 优先使用余额多的
    transaction,
    lock: transaction.LOCK.UPDATE
  })

  // 从余额充足的预算来源扣减
  let remainingAmount = amount
  const deductions = []

  for (const balance of balances) {
    if (remainingAmount <= 0) break

    const deductFromThis = Math.min(remainingAmount, Number(balance.available_amount))

    const result = await AssetService.changeBalance({
      user_id: userId,
      asset_code: 'BUDGET_POINTS',
      campaign_id: balance.campaign_id,  // ✅ 从特定活动的预算扣减
      delta_amount: -deductFromThis,
      business_type: 'lottery_budget_consume',
      idempotency_key: `${idempotency_key}:${balance.campaign_id}`,
      meta: {
        ...meta,
        source_campaign_id: balance.campaign_id,
        target_campaign_id: campaign.campaign_id
      }
    }, { transaction })

    deductions.push({
      campaign_id: balance.campaign_id,
      amount: deductFromThis,
      transaction_id: result.transaction_record.transaction_id
    })

    remainingAmount -= deductFromThis
  }

  if (remainingAmount > 0) {
    throw new Error(`用户预算不足：需要 ${amount}，实际可用 ${amount - remainingAmount}`)
  }

  return { deducted: true, deductions, total_amount: amount }
}

/**
 * 扣减活动池预算
 */
async deductPoolBudget(campaignId, amount, options = {}) {
  const { transaction, idempotency_key, meta = {} } = options

  // 1. 从活动池系统账户扣减
  const result = await AssetService.changeBalance({
    system_code: 'SYSTEM_CAMPAIGN_POOL',
    asset_code: 'BUDGET_POINTS',
    campaign_id: campaignId,  // ✅ 从该活动的池预算扣减
    delta_amount: -amount,
    business_type: 'lottery_pool_budget_consume',
    idempotency_key: idempotency_key,
    meta: {
      ...meta,
      campaign_id: campaignId
    }
  }, { transaction })

  // 2. 同步更新活动表的 pool_budget_remaining
  await LotteryCampaign.decrement('pool_budget_remaining', {
    by: amount,
    where: { campaign_id: campaignId },
    transaction
  })

  return {
    deducted: true,
    amount,
    transaction_id: result.transaction_record.transaction_id,
    remaining: result.balance.available_amount
  }
}
```

### 3.3 AssetService 扩展（支持 campaign_id）

**当前问题**：`AssetService.changeBalance()` 虽然能接收参数，但实际传递到 `AccountAssetBalance.findOrCreate()` 时未使用 `campaign_id`

**修复方案**：

```javascript
// services/AssetService.js

/**
 * 获取或创建资产余额记录（支持 campaign_id）
 *
 * @param {number} account_id - 账户ID
 * @param {string} asset_code - 资产代码
 * @param {string|null} campaign_id - 活动ID（BUDGET_POINTS 必填）
 * @param {Object} options - 选项
 * @returns {Promise<Object>} 资产余额对象
 */
static async getOrCreateBalance(account_id, asset_code, campaign_id = null, options = {}) {
  const { transaction } = options

  // BUDGET_POINTS 必须提供 campaign_id
  if (asset_code === 'BUDGET_POINTS' && !campaign_id) {
    throw new Error('BUDGET_POINTS 必须指定 campaign_id（实现活动维度隔离）')
  }

  // 其他资产（POINTS/DIAMOND等）的 campaign_id 应为 null
  const normalizedCampaignId = (asset_code === 'BUDGET_POINTS') ? campaign_id : null

  const [balance, created] = await AccountAssetBalance.findOrCreate({
    where: {
      account_id,
      asset_code,
      campaign_id: normalizedCampaignId  // ✅ 包含 campaign_id 在 where 条件中
    },
    defaults: {
      account_id,
      asset_code,
      campaign_id: normalizedCampaignId,
      available_amount: 0,
      frozen_amount: 0
    },
    transaction
  })

  if (created) {
    logger.info('✅ 创建新资产余额记录', {
      balance_id: balance.balance_id,
      account_id,
      asset_code,
      campaign_id: normalizedCampaignId
    })
  }

  return balance
}

/**
 * 改变可用余额（核心方法 - 支持 campaign_id）
 *
 * @param {Object} params - 参数对象
 * @param {number} params.user_id - 用户ID（用户账户）
 * @param {string} params.system_code - 系统账户代码（系统账户）
 * @param {string} params.asset_code - 资产代码
 * @param {string|null} params.campaign_id - 活动ID（BUDGET_POINTS 必填）
 * @param {number} params.delta_amount - 变动金额（正数=增加，负数=扣减）
 * @param {string} params.business_type - 业务类型（必填）
 * @param {string} params.idempotency_key - 独立幂等键（必填）
 * @param {string} params.lottery_session_id - 抽奖会话ID（可选）
 * @param {Object} params.meta - 扩展信息（可选）
 * @param {Object} options - 选项
 * @returns {Promise<Object>} 结果对象
 */
static async changeBalance(params, options = {}) {
  const {
    user_id,
    system_code,
    asset_code,
    campaign_id = null,  // ✅ 新增：支持 campaign_id
    delta_amount,
    business_type,
    idempotency_key,
    lottery_session_id,
    meta = {}
  } = params

  // ... 参数验证 ...

  // 获取账户
  const account = user_id
    ? await this.getOrCreateAccount({ user_id }, { transaction })
    : await this.getOrCreateAccount({ system_code }, { transaction })

  // 获取或创建资产余额（包含 campaign_id）
  const balance = await this.getOrCreateBalance(
    account.account_id,
    asset_code,
    campaign_id,  // ✅ 传递 campaign_id
    { transaction, lock: true }
  )

  // ... 余额验证与变更逻辑 ...

  // 创建流水记录
  const txRecord = await AssetTransaction.create({
    account_id: account.account_id,
    asset_code,
    delta_amount,
    balance_before: oldBalance,
    balance_after: newBalance,
    business_type,
    idempotency_key,
    lottery_session_id,
    meta: {
      ...meta,
      campaign_id: campaign_id || null  // ✅ 记录到流水的 meta 中
    }
  }, { transaction })

  // ...
}
```

---

## 🔄 四、数据迁移与初始化方案

### 4.1 系统账户初始化

```sql
-- 创建活动池预算系统账户（如果不存在）
INSERT INTO accounts (account_type, system_code, status, created_at, updated_at)
SELECT 'system', 'SYSTEM_CAMPAIGN_POOL', 'active', NOW(), NOW()
WHERE NOT EXISTS (
  SELECT 1 FROM accounts WHERE system_code = 'SYSTEM_CAMPAIGN_POOL'
);
```

### 4.2 活动表字段迁移

```sql
-- 添加预算模式字段
ALTER TABLE lottery_campaigns
  ADD COLUMN budget_mode ENUM('user', 'pool', 'none') NOT NULL DEFAULT 'none'
  COMMENT '预算模式：user-用户维度预算，pool-活动池预算，none-无预算约束';

-- 添加活动池预算字段（仅 budget_mode=pool 时使用）
ALTER TABLE lottery_campaigns
  ADD COLUMN pool_budget_total INT NULL DEFAULT NULL
  COMMENT '活动池总预算（仅 budget_mode=pool 时使用）';

ALTER TABLE lottery_campaigns
  ADD COLUMN pool_budget_remaining INT NULL DEFAULT NULL
  COMMENT '活动池剩余预算（仅 budget_mode=pool 时使用，抽奖时递减）';

-- 添加用户预算来源配置（仅 budget_mode=user 时使用）
ALTER TABLE lottery_campaigns
  ADD COLUMN allowed_campaign_ids TEXT NULL DEFAULT NULL
  COMMENT '允许使用的用户预算来源活动ID列表（仅 budget_mode=user 时使用，JSON数组）';
```

### 4.2.1 现有活动预算模式判定与迁移

**步骤 1：自动检测现有活动的预算模式**

```javascript
// scripts/detect-campaign-budget-mode.js

require('dotenv').config()
const mysql = require('mysql2/promise')

;(async () => {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME
  })

  console.log('🔍 检测现有活动的预算模式...\n')

  // 1. 获取所有活动
  const [campaigns] = await conn.query(`
    SELECT campaign_id, campaign_code, campaign_name, campaign_type, status
    FROM lottery_campaigns
    ORDER BY campaign_id
  `)

  console.log(`📊 共 ${campaigns.length} 个活动需要判定预算模式\n`)

  for (const camp of campaigns) {
    console.log(`\n活动: ${camp.campaign_name} (${camp.campaign_code})`)
    console.log(`  类型: ${camp.campaign_type}, 状态: ${camp.status}`)

    // 2. 检查是否有用户维度预算数据
    const [userBudgets] = await conn.query(
      `
      SELECT COUNT(*) AS count, SUM(b.available_amount) AS total
      FROM account_asset_balances b
      JOIN accounts a ON b.account_id = a.account_id
      WHERE a.account_type = 'user'
        AND b.asset_code = 'BUDGET_POINTS'
        AND b.campaign_id = ?
    `,
      [camp.campaign_code]
    )

    const userBudgetCount = Number(userBudgets[0].count)
    const userBudgetTotal = Number(userBudgets[0].total || 0)

    // 3. 检查是否有活动池预算数据
    const [poolBudgets] = await conn.query(
      `
      SELECT COUNT(*) AS count, SUM(b.available_amount) AS total
      FROM account_asset_balances b
      JOIN accounts a ON b.account_id = a.account_id
      WHERE a.account_type = 'system'
        AND a.system_code = 'SYSTEM_CAMPAIGN_POOL'
        AND b.asset_code = 'BUDGET_POINTS'
        AND b.campaign_id = ?
    `,
      [camp.campaign_code]
    )

    const poolBudgetCount = Number(poolBudgets[0].count)
    const poolBudgetTotal = Number(poolBudgets[0].total || 0)

    // 4. 判定预算模式
    let recommendedMode = 'none'
    let reason = ''

    if (userBudgetCount > 0 && poolBudgetCount > 0) {
      recommendedMode = 'CONFLICT'
      reason = `⚠️ 冲突：同时存在用户预算(${userBudgetCount}个用户,${userBudgetTotal})和活动池预算(${poolBudgetTotal})，需人工决策`
    } else if (userBudgetCount > 0) {
      recommendedMode = 'user'
      reason = `✅ 用户维度预算：${userBudgetCount}个用户，总计${userBudgetTotal}`
    } else if (poolBudgetCount > 0) {
      recommendedMode = 'pool'
      reason = `✅ 活动池预算：总计${poolBudgetTotal}`
    } else {
      recommendedMode = 'none'
      reason = `⚪ 无预算数据（BUDGET_POINTS 余额为0）`
    }

    console.log(`  推荐模式: ${recommendedMode}`)
    console.log(`  判定依据: ${reason}`)

    // 5. 生成迁移SQL
    if (recommendedMode === 'user') {
      console.log(
        `  迁移SQL: UPDATE lottery_campaigns SET budget_mode='user', allowed_campaign_ids='["${camp.campaign_code}"]' WHERE campaign_code='${camp.campaign_code}';`
      )
    } else if (recommendedMode === 'pool') {
      console.log(
        `  迁移SQL: UPDATE lottery_campaigns SET budget_mode='pool', pool_budget_total=${poolBudgetTotal}, pool_budget_remaining=${poolBudgetTotal} WHERE campaign_code='${camp.campaign_code}';`
      )
    } else if (recommendedMode === 'none') {
      console.log(
        `  迁移SQL: UPDATE lottery_campaigns SET budget_mode='none' WHERE campaign_code='${camp.campaign_code}';`
      )
    } else {
      console.log(`  ⚠️ 需要人工决策后再迁移`)
    }
  }

  console.log('\n✅ 检测完成')
  await conn.end()
})()
```

**步骤 2：执行迁移（基于检测结果）**

```bash
# 1. 先添加字段（4.2 节的 ALTER TABLE 语句）
cd /home/devbox/project
mysql -u<user> -p<password> <database> < migrations/add_budget_mode_fields.sql

# 2. 运行检测脚本
node scripts/detect-campaign-budget-mode.js

# 3. 根据检测结果执行迁移SQL（示例）
mysql -u<user> -p<password> <database> <<SQL
UPDATE lottery_campaigns SET budget_mode='none' WHERE campaign_code='BASIC_LOTTERY';
-- 根据实际检测结果调整上述SQL
SQL
```

**步骤 3：迁移后验证**

```javascript
// scripts/verify-campaign-budget-mode.js

require('dotenv').config()
const mysql = require('mysql2/promise')

;(async () => {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME
  })

  console.log('🔍 验证活动预算模式迁移...\n')

  const [campaigns] = await conn.query(`
    SELECT campaign_id, campaign_code, campaign_name, budget_mode, 
           pool_budget_total, pool_budget_remaining, allowed_campaign_ids
    FROM lottery_campaigns
    ORDER BY campaign_id
  `)

  let passCount = 0
  let failCount = 0

  for (const camp of campaigns) {
    console.log(`\n活动: ${camp.campaign_name} (${camp.campaign_code})`)
    console.log(`  budget_mode: ${camp.budget_mode}`)

    let valid = true

    // 验证规则1：budget_mode 必须有值
    if (!camp.budget_mode || camp.budget_mode === '') {
      console.log(`  ❌ budget_mode 为空`)
      valid = false
    }

    // 验证规则2：pool 模式必须有 pool_budget_* 字段
    if (camp.budget_mode === 'pool') {
      if (camp.pool_budget_total === null || camp.pool_budget_remaining === null) {
        console.log(`  ❌ budget_mode=pool 但缺少 pool_budget_total/pool_budget_remaining`)
        valid = false
      } else {
        console.log(
          `  ✅ 活动池预算配置: total=${camp.pool_budget_total}, remaining=${camp.pool_budget_remaining}`
        )
      }
    }

    // 验证规则3：user 模式建议有 allowed_campaign_ids
    if (camp.budget_mode === 'user') {
      if (!camp.allowed_campaign_ids) {
        console.log(`  ⚠️ budget_mode=user 但未配置 allowed_campaign_ids（将默认只允许当前活动）`)
      } else {
        try {
          const allowed = JSON.parse(camp.allowed_campaign_ids)
          console.log(`  ✅ 允许使用的预算来源: ${allowed.join(', ')}`)
        } catch (e) {
          console.log(`  ❌ allowed_campaign_ids JSON 格式错误`)
          valid = false
        }
      }
    }

    if (valid) {
      console.log(`  ✅ 验证通过`)
      passCount++
    } else {
      console.log(`  ❌ 验证失败`)
      failCount++
    }
  }

  console.log(`\n📊 验证结果: ${passCount}个通过, ${failCount}个失败`)

  if (failCount === 0) {
    console.log('✅ 所有活动预算模式迁移验证通过')
  } else {
    console.log('⚠️ 部分活动需要修正配置')
  }

  await conn.end()
})()
```

### 4.3 测试数据初始化方案

#### 方案 1：完全重置数据库（推荐）

```bash
# 1. 删除并重建数据库（需要 root/管理员权限）
cd /home/devbox/project

# 重置数据库
node <<'NODE'
require('dotenv').config()
const mysql = require('mysql2/promise')

;(async () => {
  const cfg = {
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD
  }

  const conn = await mysql.createConnection(cfg)

  // 删除并重建数据库
  const dbName = process.env.DB_NAME
  console.log(`🗑️ 删除数据库: ${dbName}`)
  await conn.query(`DROP DATABASE IF EXISTS ${dbName}`)

  console.log(`🏗️ 创建数据库: ${dbName}`)
  await conn.query(`CREATE DATABASE ${dbName} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`)

  console.log('✅ 数据库重置完成')
  await conn.end()
})()
NODE

# 2. 重新运行所有迁移
npm run db:migrate

# 3. 运行 seed（如果有）
npm run db:seed  # 或手动创建测试数据
```

#### 方案 2：保留 schema，清空业务数据

```javascript
// scripts/reset-test-data.js

require('dotenv').config()
const mysql = require('mysql2/promise')

;(async () => {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME
  })

  console.log('🗑️ 清空业务数据（保留表结构）...')

  // 关闭外键约束检查
  await conn.query('SET FOREIGN_KEY_CHECKS = 0')

  // 清空核心业务表（按依赖顺序）
  const tablesToTruncate = [
    'asset_transactions', // 先清流水
    'account_asset_balances', // 再清余额
    'lottery_draws', // 抽奖记录
    'consumption_records', // 消费记录
    'exchange_records', // 兑换记录
    'trade_orders', // 交易订单
    'market_listings', // 市场挂牌
    'item_instances', // 物品实例
    'chat_messages', // 聊天消息
    'customer_service_sessions', // 客服会话
    'accounts', // 账户主体（会级联清理 account_asset_balances）
    'users' // 用户主体（最后清）
  ]

  for (const table of tablesToTruncate) {
    try {
      await conn.query(`TRUNCATE TABLE ${table}`)
      console.log(`✅ 清空表: ${table}`)
    } catch (error) {
      if (error.message.includes("doesn't exist")) {
        console.log(`⚠️ 表不存在（跳过）: ${table}`)
      } else {
        console.error(`❌ 清空表失败: ${table}`, error.message)
      }
    }
  }

  // 恢复外键约束检查
  await conn.query('SET FOREIGN_KEY_CHECKS = 1')

  console.log('✅ 业务数据清空完成')
  await conn.end()
})()
```

### 4.4 测试数据 seed（保证余额与流水同步）

**关键原则**：初始余额/积分**必须通过 `AssetService.changeBalance()` 产生**，而不是直接插入余额表

```javascript
// scripts/seed-test-data-with-budget.js

require('dotenv').config()
const { sequelize } = require('../config/database')
const { User, LotteryCampaign, LotteryPrize, Account, AccountAssetBalance } = require('../models')
const AssetService = require('../services/AssetService')

;(async () => {
  const transaction = await sequelize.transaction()

  try {
    console.log('🌱 开始初始化测试数据（预算模型）...')

    // ========== 1. 创建系统账户 ==========
    console.log('📋 1. 创建系统账户...')

    const systemAccounts = [
      { system_code: 'SYSTEM_PLATFORM_FEE', description: '平台手续费' },
      { system_code: 'SYSTEM_MINT', description: '系统发放' },
      { system_code: 'SYSTEM_BURN', description: '系统销毁' },
      { system_code: 'SYSTEM_CAMPAIGN_POOL', description: '活动池预算' }
    ]

    for (const sys of systemAccounts) {
      await Account.findOrCreate({
        where: { account_type: 'system', system_code: sys.system_code },
        defaults: {
          account_type: 'system',
          system_code: sys.system_code,
          status: 'active'
        },
        transaction
      })
      console.log(`✅ 系统账户: ${sys.system_code}`)
    }

    // ========== 2. 创建测试用户 ==========
    console.log('\n📋 2. 创建测试用户...')

    const testUsers = [
      { mobile: '13800000001', nickname: '测试用户1', password: 'test123' },
      { mobile: '13800000002', nickname: '测试用户2', password: 'test123' },
      { mobile: '13800000003', nickname: '测试用户3', password: 'test123' }
    ]

    const createdUsers = []
    for (const userData of testUsers) {
      const [user] = await User.findOrCreate({
        where: { mobile: userData.mobile },
        defaults: { ...userData, status: 'active' },
        transaction
      })
      createdUsers.push(user)
      console.log(`✅ 用户: ${user.mobile} (user_id=${user.user_id})`)
    }

    // ========== 3. 创建测试活动 ==========
    console.log('\n📋 3. 创建测试活动...')

    // 长期活动（用户维度预算）
    const [longTermCampaign] = await LotteryCampaign.findOrCreate({
      where: { campaign_code: 'LONG_TERM_2025' },
      defaults: {
        campaign_code: 'LONG_TERM_2025',
        campaign_name: '长期消费返预算活动',
        campaign_type: 'permanent',
        status: 'active',
        budget_mode: 'user', // ✅ 用户维度预算
        allowed_campaign_ids: JSON.stringify(['LONG_TERM_2025']), // 用户预算只能用于本活动
        start_time: new Date('2025-01-01'),
        end_time: new Date('2099-12-31'),
        cost_per_draw: 100,
        max_draws_per_user_daily: 10
      },
      transaction
    })
    console.log(`✅ 长期活动: ${longTermCampaign.campaign_name} (budget_mode=user)`)

    // 短期活动（活动池维度预算）
    const [shortTermCampaign] = await LotteryCampaign.findOrCreate({
      where: { campaign_code: 'SHORT_TERM_202501' },
      defaults: {
        campaign_code: 'SHORT_TERM_202501',
        campaign_name: '2025年1月限时活动',
        campaign_type: 'event',
        status: 'active',
        budget_mode: 'pool', // ✅ 活动池预算
        pool_budget_total: 5000, // 活动总预算 5000
        pool_budget_remaining: 5000, // 剩余预算 5000
        start_time: new Date('2025-01-01'),
        end_time: new Date('2025-01-31'),
        cost_per_draw: 100,
        max_draws_per_user_daily: 5
      },
      transaction
    })
    console.log(
      `✅ 短期活动: ${shortTermCampaign.campaign_name} (budget_mode=pool, pool_budget=5000)`
    )

    // ========== 4. 初始化活动池预算（短期活动） ==========
    console.log('\n📋 4. 初始化短期活动池预算...')

    const poolResult = await AssetService.changeBalance(
      {
        system_code: 'SYSTEM_CAMPAIGN_POOL',
        asset_code: 'BUDGET_POINTS',
        campaign_id: shortTermCampaign.campaign_code, // ✅ 活动池预算归属于该活动
        delta_amount: 5000,
        business_type: 'campaign_pool_init',
        idempotency_key: `pool_init:${shortTermCampaign.campaign_code}:${Date.now()}`,
        meta: {
          campaign_id: shortTermCampaign.campaign_code,
          campaign_name: shortTermCampaign.campaign_name,
          description: '初始化短期活动池预算'
        }
      },
      { transaction }
    )

    console.log(
      `✅ 活动池预算: ${shortTermCampaign.campaign_code} = 5000 (transaction_id=${poolResult.transaction_record.transaction_id})`
    )

    // ========== 5. 为测试用户发放初始积分与预算 ==========
    console.log('\n📋 5. 为测试用户发放初始积分与预算...')

    for (const user of createdUsers) {
      // 5.1 发放基础 POINTS（抽奖费）
      const pointsResult = await AssetService.changeBalance(
        {
          user_id: user.user_id,
          asset_code: 'POINTS',
          campaign_id: null, // POINTS 无 campaign_id
          delta_amount: 10000,
          business_type: 'system_grant',
          idempotency_key: `init_points:${user.user_id}:${Date.now()}`,
          meta: {
            description: '测试用户初始积分',
            grant_reason: '系统初始化'
          }
        },
        { transaction }
      )

      console.log(
        `✅ 用户 ${user.mobile}: POINTS = 10000 (transaction_id=${pointsResult.transaction_record.transaction_id})`
      )

      // 5.2 发放用户维度预算（模拟消费返预算）
      const budgetResult = await AssetService.changeBalance(
        {
          user_id: user.user_id,
          asset_code: 'BUDGET_POINTS',
          campaign_id: longTermCampaign.campaign_code, // ✅ 用户预算归属于长期活动
          delta_amount: 1000,
          business_type: 'consumption_budget_allocation',
          idempotency_key: `init_budget:${user.user_id}:${longTermCampaign.campaign_code}:${Date.now()}`,
          meta: {
            description: '测试用户初始预算',
            consumption_amount: 4000, // 模拟消费 4000 元 × 0.25
            budget_ratio: 0.25,
            target_campaign_id: longTermCampaign.campaign_code
          }
        },
        { transaction }
      )

      console.log(
        `✅ 用户 ${user.mobile}: BUDGET_POINTS(${longTermCampaign.campaign_code}) = 1000 (transaction_id=${budgetResult.transaction_record.transaction_id})`
      )
    }

    // ========== 6. 创建奖品配置 ==========
    console.log('\n📋 6. 创建奖品配置...')

    const prizes = [
      // 长期活动奖品（用户预算约束）
      {
        campaign_id: longTermCampaign.campaign_id,
        prize_name: '高价值奖品A',
        prize_type: 'material',
        prize_value_points: 500, // 需要 500 用户预算
        win_probability: 0.05,
        stock_quantity: 100
      },
      {
        campaign_id: longTermCampaign.campaign_id,
        prize_name: '中价值奖品B',
        prize_type: 'material',
        prize_value_points: 200, // 需要 200 用户预算
        win_probability: 0.15,
        stock_quantity: 200
      },
      {
        campaign_id: longTermCampaign.campaign_id,
        prize_name: '空奖',
        prize_type: 'none',
        prize_value_points: 0, // 无预算成本
        win_probability: 0.8,
        stock_quantity: 999999
      },

      // 短期活动奖品（活动池预算约束）
      {
        campaign_id: shortTermCampaign.campaign_id,
        prize_name: '限时大奖',
        prize_type: 'material',
        prize_value_points: 1000, // 需要 1000 活动池预算
        win_probability: 0.01,
        stock_quantity: 5
      },
      {
        campaign_id: shortTermCampaign.campaign_id,
        prize_name: '限时小奖',
        prize_type: 'material',
        prize_value_points: 100, // 需要 100 活动池预算
        win_probability: 0.19,
        stock_quantity: 50
      },
      {
        campaign_id: shortTermCampaign.campaign_id,
        prize_name: '空奖',
        prize_type: 'none',
        prize_value_points: 0, // 无预算成本
        win_probability: 0.8,
        stock_quantity: 999999
      }
    ]

    for (const prizeData of prizes) {
      await LotteryPrize.create(prizeData, { transaction })
    }
    console.log(`✅ 创建 ${prizes.length} 个奖品`)

    await transaction.commit()
    console.log('\n🎉 测试数据初始化完成')
  } catch (error) {
    await transaction.rollback()
    console.error('❌ 初始化失败:', error.message)
    throw error
  }
})()
```

### 4.5 验证数据一致性（初始化后检查）

```javascript
// scripts/verify-budget-consistency.js

require('dotenv').config()
const mysql = require('mysql2/promise')

;(async () => {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME
  })

  console.log('🔍 验证预算数据一致性...\n')

  // 1. 检查所有 BUDGET_POINTS 余额
  const [balances] = await conn.query(`
    SELECT 
      b.balance_id,
      b.account_id,
      a.account_type,
      a.user_id,
      a.system_code,
      b.asset_code,
      b.campaign_id,
      b.available_amount,
      b.frozen_amount
    FROM account_asset_balances b
    JOIN accounts a ON b.account_id = a.account_id
    WHERE b.asset_code = 'BUDGET_POINTS'
    ORDER BY a.account_type, b.campaign_id
  `)

  console.log(`📊 BUDGET_POINTS 余额记录数: ${balances.length}`)
  console.log('\n用户预算余额:')
  balances
    .filter(b => b.account_type === 'user')
    .forEach(b => {
      console.log(
        `  - user_id=${b.user_id}, campaign_id=${b.campaign_id}, amount=${b.available_amount}`
      )
    })

  console.log('\n活动池预算余额:')
  balances
    .filter(b => b.account_type === 'system')
    .forEach(b => {
      console.log(
        `  - system=${b.system_code}, campaign_id=${b.campaign_id}, amount=${b.available_amount}`
      )
    })

  // 2. 对账：余额 vs 流水
  console.log('\n🔍 对账检查（余额 vs 流水）...')

  for (const bal of balances) {
    // 查询最后一条流水
    const [lastTx] = await conn.query(
      `
      SELECT balance_after 
      FROM asset_transactions 
      WHERE account_id = ? AND asset_code = 'BUDGET_POINTS' 
        AND JSON_EXTRACT(meta, '$.campaign_id') = ?
      ORDER BY transaction_id DESC LIMIT 1
    `,
      [bal.account_id, bal.campaign_id]
    )

    if (lastTx.length === 0) {
      console.log(
        `  ❌ 余额无流水支撑: account_id=${bal.account_id}, campaign_id=${bal.campaign_id}, amount=${bal.available_amount}`
      )
    } else if (Number(lastTx[0].balance_after) !== Number(bal.available_amount)) {
      console.log(
        `  ⚠️ 余额与流水不一致: account_id=${bal.account_id}, campaign_id=${bal.campaign_id}, 余额=${bal.available_amount}, 流水=${lastTx[0].balance_after}`
      )
    } else {
      console.log(
        `  ✅ 一致: account_id=${bal.account_id}, campaign_id=${bal.campaign_id}, amount=${bal.available_amount}`
      )
    }
  }

  // 3. 检查活动配置与实际余额对应关系
  console.log('\n🔍 活动配置检查...')

  const [campaigns] = await conn.query(`
    SELECT campaign_id, campaign_code, campaign_name, budget_mode, pool_budget_total, pool_budget_remaining, allowed_campaign_ids
    FROM lottery_campaigns
    WHERE budget_mode IN ('user', 'pool')
  `)

  for (const camp of campaigns) {
    console.log(`\n活动: ${camp.campaign_name} (${camp.campaign_code})`)
    console.log(`  budget_mode: ${camp.budget_mode}`)

    if (camp.budget_mode === 'pool') {
      // 活动池预算：检查系统账户余额
      const [poolBal] = await conn.query(
        `
        SELECT b.available_amount
        FROM account_asset_balances b
        JOIN accounts a ON b.account_id = a.account_id
        WHERE a.system_code = 'SYSTEM_CAMPAIGN_POOL'
          AND b.asset_code = 'BUDGET_POINTS'
          AND b.campaign_id = ?
      `,
        [camp.campaign_code]
      )

      if (poolBal.length === 0) {
        console.log(`  ❌ 活动池预算未初始化`)
      } else {
        const actualBalance = Number(poolBal[0].available_amount)
        const configRemaining = Number(camp.pool_budget_remaining)

        if (actualBalance === configRemaining) {
          console.log(`  ✅ 活动池预算一致: ${actualBalance}`)
        } else {
          console.log(`  ⚠️ 活动池预算不一致: 配置=${configRemaining}, 实际余额=${actualBalance}`)
        }
      }
    } else if (camp.budget_mode === 'user') {
      // 用户预算：检查有多少用户有该活动的预算
      const [userCount] = await conn.query(
        `
        SELECT COUNT(DISTINCT a.user_id) AS user_count
        FROM account_asset_balances b
        JOIN accounts a ON b.account_id = a.account_id
        WHERE a.account_type = 'user'
          AND b.asset_code = 'BUDGET_POINTS'
          AND b.campaign_id = ?
          AND b.available_amount > 0
      `,
        [camp.campaign_code]
      )

      console.log(`  ✅ ${userCount[0].user_count} 个用户有该活动预算`)
    }
  }

  console.log('\n✅ 验证完成')
  await conn.end()
})()
```

---

## 🚀 五、完整落地执行计划

### 阶段 1：数据库重置（清理旧数据）

**时间**：10-15分钟

```bash
# 步骤 1：选择重置方式（二选一）

# 方式 A：完全重建数据库（推荐，最干净）
node scripts/reset-database-full.js

# 方式 B：保留表结构，清空数据（更保守）
node scripts/reset-test-data.js
```

### 阶段 2：Schema 迁移（添加预算字段）

**时间**：5分钟

```bash
# 创建迁移文件
npm run migration:create

# 手动编辑迁移文件，添加上述 SQL（3.2 节的 ALTER TABLE 语句）

# 执行迁移
npm run db:migrate
```

### 阶段 3：代码修改（实现预算逻辑）

**时间**：1-2小时

**必改文件清单**：

1. `services/ConsumptionService.js`（发放用户预算时传 `campaign_id`）
2. `services/AssetService.js`（`getOrCreateBalance` 支持 `campaign_id`；`changeBalance` 接收并传递 `campaign_id`）
3. `services/UnifiedLotteryEngine/strategies/BasicGuaranteeStrategy.js`（预算查询与扣减按 `budget_mode` 走不同逻辑）
4. `models/LotteryCampaign.js`（模型定义添加 `budget_mode` / `pool_budget_*` / `allowed_campaign_ids` 字段）

### 阶段 4：测试数据初始化

**时间**：5分钟

```bash
# 运行 seed 脚本（上述 4.4 节）
node scripts/seed-test-data-with-budget.js

# 验证数据一致性
node scripts/verify-budget-consistency.js
```

### 阶段 5：功能验证

**时间**：30分钟

**测试场景 A：长期活动（用户预算）**

```bash
# 1. 用户参与长期活动抽奖
curl -X POST http://localhost:3000/api/v4/lottery/draw \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"campaign_code":"LONG_TERM_2025","draw_count":1}'

# 预期结果：
# - 扣减 100 POINTS（抽奖费）
# - 如果中高价值奖品，扣减用户在该活动的 BUDGET_POINTS
# - 查询 account_asset_balances：用户的 BUDGET_POINTS(campaign_id=LONG_TERM_2025) 减少
# - 查询 asset_transactions：有对应的 lottery_budget_consume 流水

# 2. 验证预算余额
node -e "
const { sequelize } = require('./config/database');
const mysql = require('mysql2/promise');
(async () => {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME
  });

  const [bal] = await conn.query(\`
    SELECT a.user_id, b.campaign_id, b.available_amount, b.frozen_amount
    FROM account_asset_balances b
    JOIN accounts a ON b.account_id = a.account_id
    WHERE b.asset_code = 'BUDGET_POINTS' AND b.campaign_id = 'LONG_TERM_2025'
  \`);
  console.log('用户预算余额:', bal);

  await conn.end();
})();
"
```

**测试场景 B：短期活动（活动池预算）**

```bash
# 1. 用户参与短期活动抽奖
curl -X POST http://localhost:3000/api/v4/lottery/draw \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"campaign_code":"SHORT_TERM_202501","draw_count":1}'

# 预期结果：
# - 扣减 100 POINTS（抽奖费）
# - 如果中高价值奖品，扣减活动池的 BUDGET_POINTS
# - 查询 account_asset_balances：活动池的 BUDGET_POINTS(campaign_id=SHORT_TERM_202501) 减少
# - 查询 lottery_campaigns：pool_budget_remaining 同步减少

# 2. 验证活动池余额
node -e "
const mysql = require('mysql2/promise');
(async () => {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME
  });

  const [poolBal] = await conn.query(\`
    SELECT b.campaign_id, b.available_amount, c.pool_budget_remaining
    FROM account_asset_balances b
    JOIN accounts a ON b.account_id = a.account_id
    LEFT JOIN lottery_campaigns c ON b.campaign_id = c.campaign_code
    WHERE a.system_code = 'SYSTEM_CAMPAIGN_POOL'
      AND b.asset_code = 'BUDGET_POINTS'
      AND b.campaign_id = 'SHORT_TERM_202501'
  \`);
  console.log('活动池余额 vs 配置:', poolBal);

  await conn.end();
})();
"
```

---

## 📋 六、关键实现检查清单

### 6.1 数据库层

- [ ] `lottery_campaigns` 表添加 `budget_mode`、`pool_budget_total`、`pool_budget_remaining`、`allowed_campaign_ids` 字段
- [ ] `accounts` 表存在 `SYSTEM_CAMPAIGN_POOL` 系统账户
- [ ] `account_asset_balances` 的唯一约束包含 `campaign_id`（已存在）

### 6.2 代码层（AssetService）

- [ ] `AssetService.getOrCreateBalance()` 接收 `campaign_id` 参数
- [ ] `AssetService.changeBalance()` 接收 `campaign_id` 参数并传递到 `getOrCreateBalance()`
- [ ] `BUDGET_POINTS` 操作强制要求传 `campaign_id`（否则抛出异常）

### 6.3 代码层（ConsumptionService）

- [ ] `approveConsumption()` 发放 `BUDGET_POINTS` 时传 `campaign_id`
- [ ] `campaign_id` 从配置读取（可配置消费返预算归属哪个活动）
- [ ] 流水记录的 `meta` 包含 `target_campaign_id`

### 6.4 代码层（LotteryEngine）

- [ ] 抽奖策略读取活动的 `budget_mode` 配置
- [ ] `budget_mode='user'`：调用 `getUserBudgetBalance()`（查用户在允许活动的预算总和）
- [ ] `budget_mode='pool'`：调用 `getPoolBudgetBalance()`（查活动池余额）
- [ ] `budget_mode='none'`：不做预算过滤
- [ ] 抽中奖品后，调用 `deductBudget()` 按模式扣减对应预算

### 6.5 数据一致性

- [ ] 所有 `BUDGET_POINTS` 余额都有对应的流水记录
- [ ] 所有 `BUDGET_POINTS` 的 `campaign_id` 不为空
- [ ] 活动池预算的 `pool_budget_remaining` = 实际余额表 `available_amount`
- [ ] 用户预算的 `campaign_id` 在 `allowed_campaign_ids` 范围内

---

## 🔄 七、运营配置管理

### 7.1 活动创建时的预算配置

#### 长期活动（用户预算）

```javascript
// 管理后台 - 创建长期活动
{
  campaign_code: 'LONG_TERM_2025',
  campaign_name: '长期消费返预算活动',
  campaign_type: 'permanent',
  budget_mode: 'user',  // ✅ 用户维度预算
  allowed_campaign_ids: ['LONG_TERM_2025'],  // 用户预算只能用于本活动
  cost_per_draw: 100,
  max_draws_per_user_daily: 10,
  start_time: '2025-01-01 00:00:00',
  end_time: '2099-12-31 23:59:59'
}
```

#### 短期活动（活动池预算）

```javascript
// 管理后台 - 创建短期活动
{
  campaign_code: 'SHORT_TERM_202501',
  campaign_name: '2025年1月限时活动',
  campaign_type: 'event',
  budget_mode: 'pool',  // ✅ 活动池预算
  pool_budget_total: 5000,  // 活动总预算 5000
  pool_budget_remaining: 5000,
  cost_per_draw: 100,
  max_draws_per_user_daily: 5,
  start_time: '2025-01-01 00:00:00',
  end_time: '2025-01-31 23:59:59'
}

// 创建后需要调用初始化方法
await initializeCampaignPoolBudget('SHORT_TERM_202501', 5000)
```

### 7.2 消费返预算配置

**系统配置项**（存储在 `system_settings` 或配置文件）：

```javascript
{
  // 消费返预算系数（可动态调整）
  consumption_budget_ratio: 0.24,  // 消费金额 × 0.24 = 预算积分

  // 消费返预算归属的活动ID（用户预算目标活动）
  consumption_budget_target_campaign: 'LONG_TERM_2025',

  // 是否启用消费返预算
  consumption_budget_enabled: true
}
```

### 7.3 运营临时增加预算（运营需求）

#### 7.3.1 用户维度预算追加

**业务场景**：长期活动进行中，运营给特定用户临时追加预算额度

**应用场景**：

- 客户投诉补偿：给用户追加预算作为补偿
- 活动奖励：给优质用户额外奖励预算
- 测试验证：给测试账号充值预算

```javascript
/**
 * 追加用户维度预算（运营手动充值）
 *
 * @param {number} user_id - 用户ID
 * @param {string} campaign_code - 活动代码（字符串格式）
 * @param {number} additional_budget - 追加预算数量
 * @param {Object} operatorInfo - 操作员信息
 * @param {string} reason - 追加原因
 * @returns {Promise<Object>} 追加结果
 */
async function addUserBudget(user_id, campaign_code, additional_budget, operatorInfo, reason) {
  const transaction = await sequelize.transaction()

  try {
    // 1. 验证活动存在且为用户预算模式
    const campaign = await LotteryCampaign.findOne({
      where: { campaign_code: campaign_code, budget_mode: 'user' },
      transaction
    })

    if (!campaign) {
      throw new Error('活动不存在或非用户预算模式')
    }

    // 2. 验证用户存在
    const user = await User.findByPk(user_id, { transaction })
    if (!user) {
      throw new Error('用户不存在')
    }

    // 3. 追加用户预算
    const result = await AssetService.changeBalance(
      {
        user_id: user_id,
        asset_code: 'BUDGET_POINTS',
        campaign_id: campaign_code, // ✅ 字符串格式
        delta_amount: additional_budget,
        business_type: 'admin_budget_topup', // 业务类型：管理员充值
        idempotency_key: `user_budget_topup:${user_id}:${campaign_code}:${Date.now()}`,
        meta: {
          user_id: user_id,
          campaign_code: campaign_code,
          operator_id: operatorInfo.operator_id,
          operator_name: operatorInfo.operator_name,
          reason: reason || '运营手动追加预算',
          additional_budget: additional_budget,
          topup_time: new Date().toISOString()
        }
      },
      { transaction }
    )

    // 4. 记录审计日志
    await AuditLogService.logUserBudgetTopup(
      {
        operator_id: operatorInfo.operator_id,
        user_id: user_id,
        campaign_code: campaign_code,
        amount: additional_budget,
        reason: reason,
        idempotency_key: `audit:user_budget_topup:${user_id}:${campaign_code}:${Date.now()}`
      },
      { transaction }
    )

    await transaction.commit()

    return {
      user_id,
      campaign_code,
      additional_budget,
      new_balance: result.new_balance,
      transaction_id: result.transaction_id
    }
  } catch (error) {
    await transaction.rollback()
    throw error
  }
}
```

**请求参数示例**：

```javascript
// 给用户追加预算的请求参数
{
  user_id: 31,                        // 用户ID
  campaign_code: 'LONG_TERM_2025',    // 活动代码
  additional_budget: 500,              // 追加数量
  reason: '客户投诉补偿',              // 追加原因
  operator_id: 1,                      // 操作员ID
  operator_name: 'admin'               // 操作员名称
}
```

#### 7.3.2 活动池预算追加

**业务场景**：短期活动进行中，运营决定追加活动池总预算

```javascript
/**
 * 追加活动池预算（运营手动充值）
 *
 * @param {string} campaign_code - 活动代码（字符串格式）
 * @param {number} additional_budget - 追加预算数量
 * @param {Object} operatorInfo - 操作员信息
 * @param {string} reason - 追加原因
 * @returns {Promise<Object>} 追加结果
 */
async function addCampaignPoolBudget(campaign_code, additional_budget, operatorInfo, reason) {
  const transaction = await sequelize.transaction()

  try {
    // 1. 验证活动存在且为活动池模式
    const campaign = await LotteryCampaign.findOne({
      where: { campaign_code: campaign_code, budget_mode: 'pool' },
      transaction
    })

    if (!campaign) {
      throw new Error('活动不存在或非活动池预算模式')
    }

    // 2. 追加活动池预算
    const result = await AssetService.changeBalance(
      {
        system_code: 'SYSTEM_CAMPAIGN_POOL',
        asset_code: 'BUDGET_POINTS',
        campaign_id: campaign_code, // ✅ 字符串格式
        delta_amount: additional_budget,
        business_type: 'campaign_pool_topup', // 业务类型：活动池充值
        idempotency_key: `pool_topup:${campaign_code}:${Date.now()}`,
        meta: {
          campaign_code: campaign_code,
          operator_id: operatorInfo.operator_id,
          operator_name: operatorInfo.operator_name,
          reason: reason || '运营追加活动池预算',
          additional_budget: additional_budget,
          topup_time: new Date().toISOString()
        }
      },
      { transaction }
    )

    // 3. 更新活动配置（同步更新活动表）
    await campaign.increment(
      {
        pool_budget_total: additional_budget,
        pool_budget_remaining: additional_budget
      },
      { transaction }
    )

    // 4. 记录审计日志
    await AuditLogService.logCampaignPoolTopup(
      {
        operator_id: operatorInfo.operator_id,
        campaign_code: campaign_code,
        amount: additional_budget,
        reason: reason,
        idempotency_key: `audit:pool_topup:${campaign_code}:${Date.now()}`
      },
      { transaction }
    )

    await transaction.commit()

    return {
      campaign_code,
      additional_budget,
      new_total: Number(campaign.pool_budget_total) + additional_budget,
      new_remaining: Number(campaign.pool_budget_remaining) + additional_budget,
      transaction_id: result.transaction_id
    }
  } catch (error) {
    await transaction.rollback()
    throw error
  }
}
```

**请求参数示例**：

```javascript
// 给活动池追加预算的请求参数
{
  campaign_code: 'SHORT_TERM_202501',  // 活动代码
  additional_budget: 1000,             // 追加数量
  reason: '活动效果好，追加预算',      // 追加原因
  operator_id: 1,                      // 操作员ID
  operator_name: 'admin'               // 操作员名称
}
```

#### 7.3.3 两种追加方式对比

| 维度         | 用户维度预算追加         | 活动池预算追加                   |
| ------------ | ------------------------ | -------------------------------- |
| **适用场景** | 给特定用户充值           | 给整个活动追加总预算             |
| **操作对象** | 某个用户在某个活动的预算 | 某个活动的池子预算               |
| **业务类型** | `admin_budget_topup`     | `campaign_pool_topup`            |
| **账户类型** | 用户账户                 | 系统账户（SYSTEM_CAMPAIGN_POOL） |
| **影响范围** | 单个用户                 | 所有参与该活动的用户             |
| **典型原因** | 客户补偿、活动奖励、测试 | 活动效果好、预算不足             |
| **前置条件** | 活动 budget_mode='user'  | 活动 budget_mode='pool'          |
| **权限要求** | 超级管理员或财务权限     | 超级管理员或运营总监             |

#### 7.3.4 管理后台 API 设计建议

**1. 给用户追加预算**

```javascript
// POST /api/v4/admin/budget/user-topup
router.post('/user-topup', requireRole('super_admin'), async (req, res) => {
  const { user_id, campaign_code, additional_budget, reason } = req.body

  // 参数校验
  if (!user_id || !campaign_code || !additional_budget || additional_budget <= 0) {
    return res.apiBadRequest('参数错误')
  }

  try {
    const result = await addUserBudget(
      user_id,
      campaign_code,
      additional_budget,
      {
        operator_id: req.user.user_id,
        operator_name: req.user.username
      },
      reason
    )

    return res.apiSuccess(result, '用户预算追加成功')
  } catch (error) {
    logger.error('用户预算追加失败', { error, user_id, campaign_code })
    return res.apiError(error.message)
  }
})
```

**2. 给活动池追加预算**

```javascript
// POST /api/v4/admin/budget/pool-topup
router.post('/pool-topup', requireRole('super_admin'), async (req, res) => {
  const { campaign_code, additional_budget, reason } = req.body

  // 参数校验
  if (!campaign_code || !additional_budget || additional_budget <= 0) {
    return res.apiBadRequest('参数错误')
  }

  try {
    const result = await addCampaignPoolBudget(
      campaign_code,
      additional_budget,
      {
        operator_id: req.user.user_id,
        operator_name: req.user.username
      },
      reason
    )

    return res.apiSuccess(result, '活动池预算追加成功')
  } catch (error) {
    logger.error('活动池预算追加失败', { error, campaign_code })
    return res.apiError(error.message)
  }
})
```

---

## 📊 八、预算模型对比总结

| 维度             | 用户维度预算（user） | 活动池维度预算（pool）          |
| ---------------- | -------------------- | ------------------------------- |
| **归属**         | 用户账户             | 系统账户（活动池）              |
| **account_type** | `user`               | `system` (SYSTEM_CAMPAIGN_POOL) |
| **campaign_id**  | 预算来源活动ID       | 预算归属活动ID                  |
| **获得方式**     | 门店消费返预算       | 活动创建时初始化                |
| **使用范围**     | 特定活动/活动类型    | 仅该活动                        |
| **消耗逻辑**     | 扣用户自己预算       | 扣活动池预算                    |
| **共享性**       | 每用户独立           | 所有用户共享                    |
| **运营可配**     | 预算系数、归属活动   | 总预算、追加预算                |
| **业务场景**     | 长期活动、消费返预算 | 短期活动、成本控制              |

---

## 🎯 九、核心设计原则（基于用户拍板决策）

### 9.0 核心业务规则（强制执行）

#### 业务规则 1：空奖强制配置（严格执行）

- **约束**：每个活动必须至少配置 1 个 `prize_value_points = 0` 的空奖
- **适用范围**：无论通过代码修改还是Web管理后台修改奖品配置，都必须强制执行
- **验证时机**：
  - ✅ 活动创建时：API层强制校验
  - ✅ 奖品修改时：每次修改必须重新校验
  - ✅ 奖品删除时：删除后必须校验剩余奖品
  - ✅ 奖品批量导入时：导入前必须校验
- **强制拦截**：不满足约束时，直接拒绝操作并返回错误，管理员也不可绕过
- **目的**：预算耗尽时仍能抽奖（兜底保护），防止系统报错
- **实现**：

```javascript
// API 层校验示例（适用于所有奖品配置修改接口）
router.post('/campaigns/:id/prizes', async (req, res) => {
  const { prizes } = req.body

  // ✅ 强制校验：至少一个空奖
  const hasEmptyPrize = prizes.some(p => (p.prize_value_points || 0) === 0)
  if (!hasEmptyPrize) {
    return res.apiBadRequest(
      '❌ 强制约束：活动必须至少配置一个空奖（prize_value_points=0），否则不允许保存',
      'INVALID_PRIZE_CONFIG'
    )
  }

  // 校验通过后才允许保存
  await savePrizes(campaignId, prizes)
  return res.apiSuccess(null, '奖品配置保存成功')
})

// 前端也应该有相同的校验提示（提升用户体验）
function validatePrizesBeforeSubmit(prizes) {
  const hasEmptyPrize = prizes.some(p => (p.prize_value_points || 0) === 0)

  if (!hasEmptyPrize) {
    alert('❌ 至少需要配置一个预算成本为0的奖品（空奖/兜底奖），否则预算耗尽时抽奖会失败')
    return false
  }

  return true
}
```

#### 业务规则 2：双积分分工明确

- **POINTS（可见积分）**：
  - 作用：控制"能否发起抽奖"
  - 语义：抽奖门票
  - 扣除时机：每次抽奖前扣除 cost_per_draw
  - 用户可见：✅ 前端展示，用户感知
- **BUDGET_POINTS（预算积分）**：
  - 作用：控制"能抽到什么奖品"
  - 语义：预算额度，限制中奖成本
  - 扣除时机：中奖后扣除 prize_value_points（如果>0）
  - 用户可见：❌ 前端不展示，用户无感知
- **抽奖准入判断**：

```javascript
// 只检查 POINTS 是否充足
if (userPoints < campaign.cost_per_draw) {
  return '积分不足，无法抽奖' // ✅ 提示 POINTS 不足
}

// ❌ 禁止检查 BUDGET_POINTS 并提示用户
// if (userBudgetPoints < someThreshold) {
//   return '预算不足'  // ❌ 不允许
// }
```

#### 业务规则 3：用户感知隔离（重要）

- **核心原则**：用户只知道 POINTS 存在，不知道 BUDGET_POINTS 存在
- **禁止行为**：
  - ❌ 前端展示 BUDGET_POINTS 余额
  - ❌ 提示"预算不足"或"预算积分"等字眼
  - ❌ 客服向用户解释预算系统
- **推荐做法**：
  - ✅ 用户 POINTS 充足 → 允许抽奖（即使预算为0）
  - ✅ 预算为 0 → 自动降级到空奖（用户无感知）
  - ✅ 所有提示都用"积分"指代 POINTS
- **示例对话**：

```
用户："为什么我积分够，但抽不到好东西？"
客服：✅ "奖品都是随机的，祝您下次好运！"（不提预算）
客服：❌ "因为您的预算积分不足"（泄露双账户体系）
```

#### 业务规则 4：抽奖费扣除一致性

- **无论预算是否充足，抽奖费（POINTS）始终扣除**
- **无论抽到什么奖品，都扣除 cost_per_draw 的 POINTS**
- **示例**：
  - POINTS=500, BUDGET_POINTS=0, cost_per_draw=100
  - 结果：扣除 100 POINTS，抽到空奖，用户体验正常

---

### 9.1 强制约束

#### 1. 活动预算模式强制声明

- **创建活动时必须明确指定 `budget_mode`**（不允许为空或默认值）
- **可选值**：`'user'`（用户维度预算）、`'pool'`（活动池预算）、`'none'`（无预算约束）
- **后台校验**：API 层必须强制校验 `budget_mode` 字段

#### 2. 一个活动只能有一种预算模式

- 每个活动（`campaign_id`）**有且仅有一种预算模式**
- **禁止混用**：不允许同一活动同时使用用户预算和活动池预算
- **禁止变更**：活动创建后不建议更改预算模式（需要数据迁移）

#### 3. BUDGET_POINTS 必须带 `campaign_id`

- 所有 `BUDGET_POINTS` 操作**强制要求传 `campaign_id`**
- 在 `AssetService.getOrCreateBalance()` 层校验：`BUDGET_POINTS` 无 `campaign_id` 时抛出异常
- **实现活动维度隔离**：用户在不同活动的预算互不影响

#### 4. BUDGET_POINTS 的双重约束机制

- **抽奖前过滤（Pre-Filter）**：
  - 查询用户/活动池可用预算余额
  - 从奖品池（全集）筛选出 `prize_value_points <= 余额` 的奖品（子集）
  - 不修改奖品池配置，只决定本次可抽范围
  - 过滤后如果无奖品，至少保留空奖
- **中奖后扣减（Post-Deduct）**：
  - 抽中奖品后，如果 `prize_value_points > 0`，则扣减对应预算
  - 用户模式：扣用户的 `BUDGET_POINTS(campaign_id=xxx)`
  - 活动池模式：扣系统账户的 `BUDGET_POINTS(campaign_id=xxx)` 并同步更新 `pool_budget_remaining`
  - 扣减失败会导致整个抽奖事务回滚

#### 5. 活动池预算必须用系统账户

- **系统账户**：`SYSTEM_CAMPAIGN_POOL`（`account_type='system'`）
- **数据隔离**：每个活动池预算用独立的 `campaign_id` 区分
- **余额同步**：`pool_budget_remaining`（活动表字段）必须等于实际余额表 `available_amount`

#### 6. 用户预算必须用用户账户

- **用户账户**：`account_type='user'`
- **预算来源可配**：通过 `allowed_campaign_ids` 配置允许使用哪些活动的预算
- **跨活动使用**：用户可能在多个活动有预算，抽奖时可合并使用（如果配置允许）

### 9.2 数据一致性保证

1. **余额与流水同步**：
   - 所有余额变更必须通过 `AssetService.changeBalance()` 产生
   - 禁止直接插入余额表
   - 每笔余额变动都有对应的流水记录
2. **活动配置与实际余额对应**：
   - 活动池的 `pool_budget_remaining` 必须等于余额表 `available_amount`
   - 抽奖扣减预算时，必须同时更新活动表字段和余额表
3. **预算来源可追溯**：
   - 流水的 `meta` 记录 `campaign_id` / `source_campaign_id` / `target_campaign_id`
   - 可以追溯每笔预算的来源和去向
4. **奖品池配置不可变**：
   - 奖品池（全集）在活动期间保持稳定
   - 预算过滤只是临时筛选，不修改奖品配置
   - 确保所有用户看到的奖品池是一致的

### 9.3 业务语义明确（方案B最终确认）

1. **BUDGET_POINTS 是真实可消费资产（内部成本额度）**：
   - 不是虚拟门槛，而是真实的"预算额度"（内部成本控制）
   - 类比"钱包里的钱"：先看够不够买（过滤），买了就扣钱（扣减）
   - **用户完全不知道**：用户只看到 POINTS，不知道 BUDGET_POINTS 存在
2. **抽奖前过滤 + 中奖后扣减（双重约束）**：
   - Pre-Filter：决定本次能抽哪些奖品（根据 BUDGET_POINTS 余额）
   - Post-Deduct：中奖后真实扣除预算余额（扣 prize_value_points）
   - 双重约束确保成本可控且可审计
   - **用户无感知**：整个过程对用户透明
3. **prize_value_points = 成本档位（预算成本）**：
   - **语义**：系统发放该奖品需要消耗的预算额度（内部成本）
   - **越大越贵**：数值越大，发放成本越高
   - **用户不可见**：用户永远看不到此字段
   - **对账对象**：能跟预算池/预算账户严丝合缝对账
4. **预算模式决定扣减对象**：
   - `budget_mode='user'`：扣用户自己的预算（用户不知道）
   - `budget_mode='pool'`：扣活动池的预算（用户不知道）
   - `budget_mode='none'`：不扣预算
5. **兜底保护机制**：
   - 预算不足时自动降级到空奖，不会报错
   - 确保用户始终能抽奖（即使只能抽空奖）
   - **用户无感知**：用户只觉得"运气不好"，不知道预算耗尽

### 9.3 可扩展性

- 支持未来增加"跨活动预算"（用户在多个活动的预算可合并使用）
- 支持"预算类型"扩展（如：季度预算、VIP专属预算）
- 支持"预算优先级"（如：优先使用即将过期的预算）

---

## ⚠️ 十、风险提示与注意事项

### 10.1 迁移风险

- **表结构变更**：需要在低峰期/维护窗口执行
- **数据重置**：会清空所有用户余额/积分/抽奖记录
- **代码部署**：必须与数据库迁移同步上线（否则会有兼容性问题）

### 10.2 测试验证要点

- **预算隔离**：验证用户在活动A的预算不能用于活动B（除非配置允许）
- **活动池耗尽**：验证活动池预算为0时，只能抽空奖
- **并发安全**：多用户同时抽同一活动池，预算不超扣
- **对账一致性**：每日运行对账脚本，确保余额=流水

### 10.3 性能考虑

- **预算查询**：用户预算查询可能涉及多个 `campaign_id`，需要建立联合索引
- **活动池扣减**：高并发下活动池预算扣减可能成为热点，考虑悲观锁
- **对账任务**：每日对账不应在业务高峰期运行

---

## 📌 十一、常见问题解答（FAQ）

### Q1: 现在数据库中有一个活动，怎么区分是用户维度预算的长期活动还是活动池维度预算短期活动？

**A: 当前无法直接区分，需要先添加 `budget_mode` 字段。**

#### 问题原因

截至 2025-01-04，真实数据库的 `lottery_campaigns` 表**没有任何字段能表达预算模式**：

- ❌ 没有 `budget_mode` 字段
- ❌ 没有 `pool_budget_total` / `pool_budget_remaining` 字段
- ❌ 没有 `allowed_campaign_ids` 字段

现有字段（如 `campaign_type: 'permanent'`）只能表达"长期/短期"，**无法表达预算从哪扣**。

#### 解决步骤

**步骤 1：添加预算模式字段**（必需）

```sql
ALTER TABLE lottery_campaigns
  ADD COLUMN budget_mode ENUM('user', 'pool', 'none') NOT NULL DEFAULT 'none';
```

**步骤 2：为现有活动判定并设置 budget_mode**

运行自动检测脚本（见 4.2.1 节）：

```bash
node scripts/detect-campaign-budget-mode.js
```

脚本会分析：

- 是否有用户维度的 `BUDGET_POINTS(campaign_id=xxx)` 余额
- 是否有活动池系统账户的 `BUDGET_POINTS(campaign_id=xxx)` 余额
- 根据实际数据推荐 `budget_mode` 值

**步骤 3：执行迁移 SQL**

根据检测结果，为每个活动设置 `budget_mode`：

```sql
-- 示例：当前 BASIC_LOTTERY 活动没有任何 BUDGET_POINTS 数据
UPDATE lottery_campaigns
SET budget_mode = 'none'
WHERE campaign_code = 'BASIC_LOTTERY';
```

**步骤 4：以后创建活动时强制指定**

新创建活动必须明确指定预算模式：

```javascript
// 创建用户预算活动
await LotteryCampaign.create({
  campaign_code: 'LONG_TERM_2025',
  campaign_name: '长期消费返预算活动',
  budget_mode: 'user', // ✅ 必须明确
  allowed_campaign_ids: JSON.stringify(['LONG_TERM_2025'])
  // ...
})

// 创建活动池预算活动
await LotteryCampaign.create({
  campaign_code: 'SHORT_TERM_202501',
  campaign_name: '短期限时活动',
  budget_mode: 'pool', // ✅ 必须明确
  pool_budget_total: 5000,
  pool_budget_remaining: 5000
  // ...
})
```

#### 区分逻辑（添加字段后）

| budget_mode | 含义         | 预算归属 | 扣减对象                 | 典型场景           |
| ----------- | ------------ | -------- | ------------------------ | ------------------ |
| `'user'`    | 用户维度预算 | 用户账户 | 用户自己的 BUDGET_POINTS | 长期消费返预算活动 |
| `'pool'`    | 活动池预算   | 系统账户 | 活动池的 BUDGET_POINTS   | 短期活动成本控制   |
| `'none'`    | 无预算约束   | -        | 不扣预算                 | 普通积分抽奖       |

#### 判定已有活动的依据

如果你不确定现有活动应该是什么模式，可以这样判断：

1. **查数据库余额表**：

   ```sql
   -- 是否有用户预算数据？
   SELECT COUNT(*) FROM account_asset_balances b
   JOIN accounts a ON b.account_id = a.account_id
   WHERE a.account_type = 'user'
     AND b.asset_code = 'BUDGET_POINTS'
     AND b.campaign_id = 'BASIC_LOTTERY';

   -- 是否有活动池预算数据？
   SELECT COUNT(*) FROM account_asset_balances b
   JOIN accounts a ON b.account_id = a.account_id
   WHERE a.system_code = 'SYSTEM_CAMPAIGN_POOL'
     AND b.asset_code = 'BUDGET_POINTS'
     AND b.campaign_id = 'BASIC_LOTTERY';
   ```

2. **查代码实际扣减逻辑**：
   - 打开 `BasicGuaranteeStrategy.js`，看 `getAvailablePrizes()` 实际在用什么余额
   - 如果用的是 `POINTS` → 目前没走预算系统 → `budget_mode='none'`

3. **查业务意图**：
   - 这个活动"应该"是用户自己预算玩，还是活动成本有上限？
   - 如果运营希望"用户消费返预算，在这个活动用掉" → `'user'`
   - 如果运营希望"活动整体预算5000，抽完就没" → `'pool'`
   - 如果运营不关心预算，只关心库存 → `'none'`

---

### Q2: "抽奖前过滤"具体是怎么工作的？会修改奖品池配置吗？

**A: 不会修改奖品池配置，只是临时筛选本次可抽的奖品子集。**

#### 工作原理

**奖品池（全集）**：

- 活动创建时配置的所有奖品
- 存储在 `lottery_prizes` 表
- 在活动期间保持不变（除非运营手动调整）

**预算过滤（子集筛选）**：

- 每次用户点击抽奖时，系统会：
  1. 查询用户/活动池的可用预算余额（如 1000）
  2. 从奖品池（全集）筛选：`prize_value_points <= 1000` 的奖品
  3. 得到一个"本次可抽奖品列表"（子集）
  4. 在这个子集中按概率随机抽取
- **关键**：这只是一次性筛选，不会修改数据库中的奖品配置

#### 示例说明

假设活动有 5 个奖品：

```javascript
奖品池（全集，数据库配置）：
- 奖品A: prize_value_points = 500, probability = 0.05
- 奖品B: prize_value_points = 200, probability = 0.15
- 奖品C: prize_value_points = 100, probability = 0.20
- 奖品D: prize_value_points = 50,  probability = 0.20
- 空奖:   prize_value_points = 0,   probability = 0.40
```

**场景 1：用户预算充足（如 1000）**

```javascript
预算过滤后（本次可抽）：
- 奖品A ✅ (500 <= 1000)
- 奖品B ✅ (200 <= 1000)
- 奖品C ✅ (100 <= 1000)
- 奖品D ✅ (50 <= 1000)
- 空奖 ✅   (0 <= 1000)

// 本次可以抽到任何奖品
```

**场景 2：用户预算较少（如 150）**

```javascript
预算过滤后（本次可抽）：
- 奖品A ❌ (500 > 150) - 本次抽不到
- 奖品B ❌ (200 > 150) - 本次抽不到
- 奖品C ✅ (100 <= 150)
- 奖品D ✅ (50 <= 150)
- 空奖 ✅   (0 <= 150)

// 本次只能抽到奖品C、D或空奖
// 但奖品A、B仍然在数据库配置中，下次预算够了还能抽到
```

**场景 3：用户预算耗尽（如 0）**

```javascript
预算过滤后（本次可抽）：
- 奖品A ❌ (500 > 0)
- 奖品B ❌ (200 > 0)
- 奖品C ❌ (100 > 0)
- 奖品D ❌ (50 > 0)
- 空奖 ✅   (0 <= 0)

// 本次只能抽到空奖（兜底保护）
```

#### 关键特征

1. **不修改配置**：奖品池配置始终不变
2. **临时筛选**：每次抽奖时动态筛选
3. **用户无感**：用户看到的是"能抽到"和"抽不到"的差异
4. **公平性**：所有用户的奖品池配置是一致的，只是预算不同导致可抽范围不同

---

### Q3: "中奖后扣减"是什么意思？如果扣减失败会怎样？

**A: 抽中奖品后，从预算账户真实扣除 `prize_value_points`，扣减失败会导致整个抽奖事务回滚。**

#### 扣减时机

```javascript
抽奖流程：
1. 用户点击抽奖
2. 扣除抽奖费（POINTS，如 100）
3. 【预算过滤】筛选出本次可抽奖品
4. 按概率随机抽取一个奖品
5. 如果中奖且 prize_value_points > 0：
   👉 【扣减预算】从预算账户扣除 prize_value_points
6. 发放奖品（物品实例/资产）
7. 返回抽奖结果
```

#### 扣减逻辑

**用户预算模式（budget_mode='user'）**：

```javascript
// 假设用户在长期活动有 1000 预算，抽中了价值 200 的奖品
await AssetService.changeBalance({
  user_id: userId,
  asset_code: 'BUDGET_POINTS',
  campaign_id: 'LONG_TERM_2025', // 从该活动的预算扣
  delta_amount: -200, // 扣减 200
  business_type: 'lottery_budget_consume'
  // ...
})

// 扣减后余额：1000 - 200 = 800
```

**活动池预算模式（budget_mode='pool'）**：

```javascript
// 假设活动池剩余 5000 预算，抽中了价值 1000 的奖品
await AssetService.changeBalance({
  system_code: 'SYSTEM_CAMPAIGN_POOL',
  asset_code: 'BUDGET_POINTS',
  campaign_id: 'SHORT_TERM_202501', // 从该活动池扣
  delta_amount: -1000, // 扣减 1000
  business_type: 'lottery_pool_budget_consume'
  // ...
})

// 扣减后余额：5000 - 1000 = 4000
// 同时更新活动表：pool_budget_remaining = 4000
```

#### 扣减失败的处理

**失败场景**：

- 预算余额不足（理论上不应发生，因为有预算过滤）
- 数据库事务冲突
- 系统异常

**失败后果**：

```javascript
try {
  await transaction.commit() // 提交整个抽奖事务
} catch (error) {
  await transaction.rollback() // 回滚所有操作
  // 结果：
  // - 抽奖费（POINTS）退回
  // - 预算扣减撤销
  // - 奖品不会发放
  // - 抽奖记录不会写入

  throw new Error('抽奖失败，请重试')
}
```

#### 为什么需要"中奖后扣减"

1. **真实消耗**：预算积分不是虚拟门槛，而是真实要消耗的资产
2. **可审计**：每次扣减都有流水记录，可以追溯
3. **成本控制**：预算余额直接反映了用户/活动池还能承受多少成本
4. **双重保护**：
   - Pre-Filter（过滤）：粗粒度控制，快速排除买不起的奖品
   - Post-Deduct（扣减）：细粒度确认，确保真实消耗并记录流水

---

### Q4: campaign_id 存储 campaign_code 还是数值 campaign_id？

**A: 存储 `campaign_code`（字符串），不使用数值 `campaign_id`。**

#### 用户拍板决策

- ✅ **采用**：存储 `campaign_code`（字符串格式，如 `'LONG_TERM_2025'`）
- ❌ **不采用**：存储数值 `campaign_id`（如 `1`, `2`, `3`）

#### 决策依据

**方案A：存储 campaign_code（字符串）- 已采用**

**优点**：

1. **与当前表结构天然匹配**
   - `account_asset_balances.campaign_id` 列类型是 `varchar(50)`
   - 不需要修改表结构

2. **业务稳定标识**
   - `campaign_code` 是业务层面的稳定标识
   - 更适合做隔离、统计、运营配置
   - 运营人员更容易理解（`'LONG_TERM_2025'` vs `1`）

3. **跨环境一致性**
   - 开发/测试/生产环境的 `campaign_code` 保持一致
   - 数据迁移不需要 ID 映射
   - 配置文件可以直接写 `'LONG_TERM_2025'`，不需要查询数据库获取 ID

**缺点**：

1. **查询性能略低**
   - 字符串比较比数值比较慢（但差异不大）
   - 可以通过索引优化

2. **Join 需要字符串对齐**
   - Join 时需要用 `campaign_code` 而不是数值主键
   - 示例：`ON b.campaign_id = c.campaign_code`

**方案B：存储数值 campaign_id - 未采用**

**优点**：

1. 数值主键查询效率高
2. 外键关联更直接
3. 存储空间小

**缺点（决策性）**：

1. **需要改表结构**
   - 需要将 `campaign_id varchar(50)` 改为 `int`
   - 影响现有数据

2. **跨环境不一致**
   - 开发环境：`campaign_id = 1` 可能是 `'BASIC_LOTTERY'`
   - 生产环境：`campaign_id = 100` 也是 `'BASIC_LOTTERY'`
   - 配置和数据迁移复杂

3. **业务语义不直观**
   - 运营看到 `campaign_id = 1` 不知道是哪个活动
   - 配置时需要先查数据库获取 ID

#### 实现示例

**正确用法**：

```javascript
// ✅ 发放用户预算（消费抽成自动注入）
await AssetService.changeBalance({
  user_id: userId,
  asset_code: 'BUDGET_POINTS',
  campaign_id: 'LONG_TERM_2025', // ✅ 字符串格式
  delta_amount: 240,
  business_type: 'consumption_budget_allocation'
})

// ✅ 充值活动池预算（运营手动充值）
await AssetService.changeBalance({
  system_code: 'SYSTEM_CAMPAIGN_POOL',
  asset_code: 'BUDGET_POINTS',
  campaign_id: 'SHORT_TERM_202501', // ✅ 字符串格式
  delta_amount: 5000,
  business_type: 'campaign_pool_init'
})

// ✅ 查询用户预算
const balances = await AccountAssetBalance.findAll({
  where: {
    account_id: accountId,
    asset_code: 'BUDGET_POINTS',
    campaign_id: ['LONG_TERM_2025', 'SEASONAL_2025'] // ✅ 字符串数组
  }
})

// ✅ Join 活动表
const data = await sequelize.query(`
  SELECT b.campaign_id, b.available_amount, c.campaign_name
  FROM account_asset_balances b
  LEFT JOIN lottery_campaigns c 
    ON b.campaign_id = c.campaign_code  -- ✅ 用 campaign_code Join
  WHERE b.asset_code = 'BUDGET_POINTS'
`)
```

**错误用法**：

```javascript
// ❌ 错误：使用数值 campaign_id
await AssetService.changeBalance({
  user_id: userId,
  asset_code: 'BUDGET_POINTS',
  campaign_id: 1, // ❌ 不使用数值
  delta_amount: 240
})
```

---

### Q5: 如果一个活动既想有用户预算，又想有活动池预算怎么办？

**A: 不允许。设计规则是"一个活动只能有一种预算模式"。**

#### 原因

- **避免复杂度**：两种预算并存会导致扣减逻辑复杂（先扣谁？扣多少？）
- **避免歧义**：抽奖时到底受哪个预算约束？

#### 替代方案

如果业务确实需要"既限制用户额度，又限制活动总成本"，可以：

**方案 1：拆成两个活动**

- 活动 A（用户预算）：用户用自己的预算抽
- 活动 B（活动池预算）：活动总成本有上限

**方案 2：用活动池 + 奖品库存双重约束**

- `budget_mode='pool'`（活动成本有上限）
- 奖品设置 `stock_quantity`（物理库存限制）
- 这样既控成本，又控奖品数量

**方案 3：扩展设计支持"双重预算"（不推荐，复杂度高）**

- 增加 `budget_mode='dual'`
- 抽奖时同时检查用户预算和活动池预算
- 扣减时同时扣两者
- **不推荐**：实现和测试成本高，容易出Bug

---

### Q3: `campaign_type` 和 `budget_mode` 有什么关系？

**A: 没有强关联，是两个独立维度。**

| 字段            | 含义         | 可选值                            | 用途                         |
| --------------- | ------------ | --------------------------------- | ---------------------------- |
| `campaign_type` | 活动周期类型 | `permanent`/`event`/`seasonal` 等 | 表达活动是"长期/短期/季节性" |
| `budget_mode`   | 预算模式     | `user`/`pool`/`none`              | 表达预算从哪扣               |

**典型组合**：

- `campaign_type='permanent'` + `budget_mode='user'`：长期消费返预算活动
- `campaign_type='event'` + `budget_mode='pool'`：短期限时活动（活动池预算）
- `campaign_type='permanent'` + `budget_mode='none'`：长期普通积分抽奖（不走预算）
- `campaign_type='event'` + `budget_mode='user'`：短期活动但用用户预算（也可以）

**核心区别**：

- `campaign_type` 是"时间维度"（长期/短期）
- `budget_mode` 是"预算归属维度"（用户/活动池/无）

---

### Q4: 如果活动进行中想改预算模式怎么办？

**A: 不建议，如果必须改，需要数据迁移和补录流水。**

#### 风险

- 已有预算余额/流水可能与新模式不匹配
- 用户体验可能突变（原本能抽的奖品突然不能抽）

#### 安全做法

1. **活动状态改为 `paused`**（暂停抽奖）
2. **执行预算模式迁移**：
   - 如果从 `none` → `user/pool`：初始化预算余额
   - 如果从 `user` → `pool`：将用户预算余额汇总到活动池（或清零）
   - 如果从 `pool` → `user`：将活动池预算按规则分配给用户（或清零）
3. **补录期初流水**（确保余额有流水支撑）
4. **验证数据一致性**
5. **恢复活动状态**

#### 推荐做法

- **创建新活动**（新的 `budget_mode`），旧活动保持不变或结束
- 这样历史数据清晰，不会混乱

---

### Q7: 用户能看到自己的 BUDGET_POINTS 余额吗？

**A: 不能。这是强制业务规则，禁止向用户透露双账户体系存在。**

#### 设计原则

- **用户只知道 POINTS 存在**，不知道 BUDGET_POINTS 存在
- **前端不展示预算余额**，只展示 POINTS 余额
- **客服不告知预算概念**，只说"积分"指代 POINTS

#### 实现要求

**1. 前端展示规范**

```javascript
// ✅ 正确：只展示 POINTS
<div>我的积分：{user.points}</div>

// ❌ 错误：展示 BUDGET_POINTS
<div>我的预算积分：{user.budget_points}</div>
<div>预算余额：{user.budget_balance}</div>
```

**2. API 响应规范**

```javascript
// ✅ 用户接口：不返回 BUDGET_POINTS
router.get('/user/profile', (req, res) => {
  res.apiSuccess({
    user_id: user.user_id,
    points: user.points_balance // ✅ 返回可见积分
    // budget_points: xxx              // ❌ 不返回预算
  })
})

// ✅ 管理后台接口：可返回 BUDGET_POINTS
router.get('/admin/users/:id', requireAdmin, (req, res) => {
  res.apiSuccess({
    user_id: user.user_id,
    points: user.points_balance,
    budget_points: user.budget_balance // ✅ 管理员可见
  })
})
```

**3. 错误提示规范**

```javascript
// ✅ 正确提示
if (points < cost_per_draw) {
  return '积分不足，无法抽奖'
}

// ❌ 错误提示（泄露预算系统）
if (budget_points < prize_cost) {
  return '预算不足，无法获得该奖品' // ❌ 不允许
}
```

**4. 客服话术规范**
| 场景 | 用户问题 | ✅ 正确回答 | ❌ 错误回答 |
|-----|---------|-----------|-----------|
| 抽奖结果差 | "为什么我积分够，但抽不到好东西？" | "奖品都是随机的，祝您下次好运！" | "因为您的预算积分不足" |
| 积分查询 | "我有多少积分？" | "您当前有 XXX 积分" | "您有 XXX POINTS 和 YYY BUDGET_POINTS" |
| 充值咨询 | "怎么获得更多积分？" | "通过消费、活动等方式可获得积分" | "POINTS 通过充值获得，预算积分通过消费获得" |

#### 业务语义

- **用户视角**：只有一种"积分"，够就能抽，抽到什么看运气
- **系统视角**：有两套账户，POINTS 控制准入，BUDGET_POINTS 控制中奖
- **运营工具**：管理后台可见两套账户，运营可调整预算

#### 为什么要隔离用户感知？

1. **简化用户认知**：避免用户困惑"为什么有两种积分"
2. **防止负面体验**：用户不会因"预算不足"而产生挫败感
3. **运营灵活性**：系统可调整预算策略，用户无感知
4. **业务合规性**：避免"虚拟货币"双账户的合规风险

---

### Q8: 如果用户发现"积分够但中不了好奖"，怎么解释？

**A: 强调随机性，不提预算系统。**

#### 推荐话术

```
用户："我积分明明够，为什么总抽到空奖/小奖？"

✅ 客服回答（推荐）：
"您好！抽奖结果完全随机，每个奖品都有对应的中奖概率。
高价值奖品的概率相对较低，所以需要多次尝试。
感谢您的参与，祝您下次好运！"

❌ 不要说：
"因为您的预算积分不足，系统自动过滤了高价值奖品。"
```

#### 技术实现保证

- 预算过滤是**后台自动完成**的，用户无感知
- 前端只展示"恭喜中奖"或"未中奖"，不解释为什么
- 奖品概率展示时，展示的是**全集概率**（不反映预算过滤）

#### 示例流程

```
用户侧体验：
1. 查看积分：500 POINTS ✅
2. 点击抽奖：扣除 100 POINTS
3. 看到转盘/抽奖动画（展示所有奖品）
4. 结果：获得空奖/小奖
5. 感觉：运气不好，下次再试

系统侧逻辑：
1. 检查 POINTS >= cost_per_draw ✅
2. 查询 BUDGET_POINTS = 0
3. 过滤奖品：只保留 prize_value_points = 0 的空奖
4. 在过滤后子集中"随机"抽取（实际只有空奖）
5. 返回：空奖
```

---

### Q9: 活动开始后，运营如何临时增加预算？

**A: 根据活动的预算模式（user/pool），使用不同的追加方法。**

#### 场景 1：用户维度预算追加（给特定用户充值）

**适用场景**：

- 客户投诉补偿：给受影响用户追加预算
- 活动奖励：给优质/活跃用户额外奖励
- 测试验证：给测试账号充值预算

**操作方式**：

- 管理后台调用 `addUserBudget(user_id, campaign_code, amount, operator, reason)`
- API 端点：`POST /api/v4/admin/budget/user-topup`

**示例**：

```javascript
// 给用户ID=31在"长期活动2025"追加500预算
{
  user_id: 31,
  campaign_code: 'LONG_TERM_2025',
  additional_budget: 500,
  reason: '客户投诉补偿'
}
```

**效果**：

- 用户A原本预算余额 240 → 追加后 740
- 仅影响该用户在该活动的预算
- 其他用户不受影响

#### 场景 2：活动池预算追加（给整个活动充值）

**适用场景**：

- 活动效果好，原预算不足
- 临时延长活动，需要追加预算
- 池子预算即将耗尽，需要补充

**操作方式**：

- 管理后台调用 `addCampaignPoolBudget(campaign_code, amount, operator, reason)`
- API 端点：`POST /api/v4/admin/budget/pool-topup`

**示例**：

```javascript
// 给"短期活动202501"追加1000池子预算
{
  campaign_code: 'SHORT_TERM_202501',
  additional_budget: 1000,
  reason: '活动效果好，追加预算'
}
```

**效果**：

- 活动池原本总预算 2000 → 追加后 3000
- 活动池剩余预算 500 → 追加后 1500
- 所有参与该活动的用户受益（池子更大，能抽更久）

#### 两种追加方式对比

| 维度         | 用户维度预算追加     | 活动池预算追加        |
| ------------ | -------------------- | --------------------- |
| **适用活动** | budget_mode='user'   | budget_mode='pool'    |
| **操作对象** | 特定用户             | 整个活动              |
| **影响范围** | 单个用户             | 所有用户              |
| **业务类型** | `admin_budget_topup` | `campaign_pool_topup` |
| **典型原因** | 补偿、奖励、测试     | 活动延长、预算不足    |
| **权限要求** | 超级管理员或财务     | 超级管理员或运营总监  |

#### 实现细节参考

详见文档 **7.3 节 "运营临时增加预算（运营需求）"**：

- 7.3.1：用户维度预算追加
- 7.3.2：活动池预算追加
- 7.3.3：两种追加方式对比
- 7.3.4：管理后台 API 设计建议

---

## 📌 总结

### 用户拍板的核心决策（2025-01-04）

#### 决策 0：核心业务规则（强制约束）

- ✅ **规则1：空奖强制配置（严格执行）**
  - **约束**：每个活动必须至少配置 1 个 `prize_value_points = 0` 的空奖
  - **强制执行范围**：无论通过代码修改还是Web管理后台修改奖品配置，都必须强制校验
  - **验证时机**：活动创建/奖品修改/奖品删除/批量导入时强制校验
  - **强制拦截**：不满足约束时直接拒绝操作并返回错误，管理员也不可绕过
  - **错误提示**：`"活动必须至少配置一个空奖（prize_value_points=0），用于预算耗尽时的兜底保护"`
  - **实施位置**：
    - 后台API层（所有奖品配置修改接口）
    - 管理后台前端（提交前预校验 + 明确提示）
    - 数据库约束（可选：触发器辅助防御）
- ✅ **规则2**：POINTS 只控制"能否参加抽奖"（门票），BUDGET_POINTS 控制"能抽到什么"（预算）
- ✅ **规则3**：禁止向用户透露双账户体系存在（用户无感知预算系统）
- ✅ **规则4**：抽奖费（POINTS）始终扣除，无论预算是否充足
- ✅ **规则5（新增）**：prize_value_points = 成本档位（预算成本），越大越贵，用户不可见

#### 决策 1：BUDGET_POINTS 使用模式（方案B最终确认）

- ✅ **确认**：BUDGET_POINTS 是真实可消费资产（内部预算额度）
- ✅ **确认**：采用"抽奖前过滤 + 中奖后扣减"模式（双重约束）
- ✅ **确认**：奖品池是固定全集，过滤只是临时筛选本次可抽子集
- ✅ **确认**：POINTS 仅作为门票，只控制"能否参加抽奖"，不参与预算过滤
- ✅ **确认**：用户侧完全无感知双账户体系存在

#### 决策 2：两种预算模式都要实现（方案B最终确认）

- ✅ **路线1：用户维度预算（BUDGET_POINTS）- 主要方案**
  - **预算来源**：门店消费抽成**自动注入**
  - **运营能力**：可临时给特定用户追加预算（补偿/奖励/测试）
  - **商业语义**：消费返"预算积分"（内部成本额度），与普通积分（POINTS 抽奖门票）完全分离
  - **用户感知**：用户完全不知道 BUDGET_POINTS 存在，只看到 POINTS 余额
  - **实现策略**：先把最小闭环跑起来
- ✅ **路线2：活动池预算（SYSTEM_CAMPAIGN_POOL）- 补充方案**
  - **预算来源**：运营**手动充值**
  - **运营能力**：可临时给活动池追加总预算（活动延长/预算不足）
  - **商业语义**：活动总预算成本控制（内部成本上限），先到先得
  - **用户感知**：用户只看到"活动奖品有限，先到先得"，不知道预算机制
  - **实现需求**：新系统账户 + 活动配置字段扩展

#### 决策 3：活动预算模式强制声明

- ✅ **确认**：每个活动创建时强制指定 `budget_mode`（user/pool/none）
- ✅ **确认**：一个活动不可以同时存在两种预算
- ✅ **确认**：必须明确区分用户维度预算 vs 活动池维度预算

#### 决策 4：campaign_id 存储方案（关键技术决策）

- ✅ **采用方案**：存储 `campaign_code`（字符串）
  - 存储示例：`campaign_id = 'LONG_TERM_2025'`（而不是数值 `1`）
  - 理由1：与当前列类型 `varchar(50)` 天然匹配，不用改表结构
  - 理由2：`campaign_code` 是业务稳定标识，更适合做隔离/统计/运营配置
  - 理由3：跨环境（开发/测试/生产）保持一致，便于数据迁移
- ❌ **不采用**：数值 `campaign_id`（如 `1`, `2`, `3`）
  - 原因：需要改列类型或统一策略，跨环境不一致

- **实现约定**：
  - 所有涉及 BUDGET_POINTS 的操作，`campaign_id` 参数传 `campaign_code`（字符串）
  - 查询/Join 时使用 `campaign_code` 对齐（而不是数值主键）

### campaign_id 存储方案对比（技术决策依据）

| 方案      | 存储内容                                              | 优点                                                                                                             | 缺点                                                                                                                 | 决策          |
| --------- | ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | ------------- |
| **方案A** | `campaign_code`<br>（字符串）<br>如 `'BASIC_LOTTERY'` | • 与当前列类型 `varchar(50)` 天然匹配<br>• 业务稳定标识，适合隔离/统计<br>• 跨环境迁移更方便<br>• 运营配置更直观 | • 查询/Join 需要用字符串对齐<br>• 字符串比较性能略低于数值                                                           | ✅ **已采用** |
| **方案B** | 数值 `campaign_id`<br>如 `1`, `2`, `3`                | • 数值主键查询效率高<br>• 外键关联更直接<br>• 存储空间小                                                         | • 需要改列类型 `varchar(50)` → `int`<br>• 跨环境不一致（开发环境 id=1 vs 生产环境 id=100）<br>• 数据迁移需要 ID 映射 | ❌ 不采用     |

**技术实现示例**：

```javascript
// ✅ 正确：使用 campaign_code（字符串）
await AssetService.changeBalance({
  user_id: userId,
  asset_code: 'BUDGET_POINTS',
  campaign_id: 'LONG_TERM_2025', // ✅ 字符串
  delta_amount: 240
})

// 查询示例
const balance = await AccountAssetBalance.findOne({
  where: {
    account_id: accountId,
    asset_code: 'BUDGET_POINTS',
    campaign_id: 'LONG_TERM_2025' // ✅ 字符串对齐
  }
})

// Join 示例
const data = await sequelize.query(`
  SELECT b.*, c.campaign_name
  FROM account_asset_balances b
  LEFT JOIN lottery_campaigns c 
    ON b.campaign_id = c.campaign_code  -- ✅ 用 campaign_code Join
  WHERE b.asset_code = 'BUDGET_POINTS'
`)

// ❌ 错误：使用数值
await AssetService.changeBalance({
  user_id: userId,
  asset_code: 'BUDGET_POINTS',
  campaign_id: 1, // ❌ 不使用数值
  delta_amount: 240
})
```

### 当前最严重的问题

1. **BUDGET_POINTS 完全不存在**（真实库 0 条数据）
2. **代码发放时未传 `campaign_id`**（无法实现活动隔离）
3. **抽奖筛奖用的是 POINTS**（而非 BUDGET_POINTS）
4. **活动表缺少 `budget_mode` 字段**（无法区分预算模式）

### 解决方案核心

#### 1. 明确两种预算归属

- **用户预算（user）**：
  - 归属用户账户，扣用户自己的 BUDGET_POINTS
  - 预算来源：消费抽成自动注入
  - 运营能力：可临时给特定用户追加预算
- **活动池预算（pool）**：
  - 归属系统账户（SYSTEM_CAMPAIGN_POOL），扣活动池的 BUDGET_POINTS
  - 预算来源：运营手动充值
  - 运营能力：可临时给活动池追加总预算

#### 2. 强制 campaign_id 维度

- `BUDGET_POINTS` 操作必须带 `campaign_id`（存储 campaign_code 字符串）
- 在 AssetService 层强制校验

#### 3. 活动配置驱动

- 通过 `budget_mode` 决定抽奖走哪套预算逻辑
- 创建活动时强制指定预算模式

#### 4. 双重约束机制

- Pre-Filter（过滤）：抽奖前筛选买得起的奖品
- Post-Deduct（扣减）：中奖后真实扣除预算余额

#### 5. 余额与流水同步

- 从初始化开始就通过 `AssetService` 写入（保证可审计）
- 运营追加预算也走统一流程，确保每笔变动都有流水记录

#### 6. 运营灵活性（新增能力）

- **用户维度预算追加**：给特定用户临时充值预算（补偿/奖励/测试）
- **活动池预算追加**：给活动池临时增加总预算（活动延长/预算不足）
- 两种追加都有审计日志和幂等性保证
- 详见 7.3 节 "运营临时增加预算（运营需求）"

### 业务语义明确

| 环节           | 说明                               | 用户预算模式               | 活动池预算模式   |
| -------------- | ---------------------------------- | -------------------------- | ---------------- |
| **抽奖前过滤** | 查询可用预算余额，筛选本次可抽奖品 | 查用户在允许活动的预算总和 | 查活动池剩余预算 |
| **随机抽取**   | 在筛选后的奖品子集中按概率抽取     | 同                         | 同               |
| **中奖后扣减** | 从预算账户扣除 prize_value_points  | 扣用户自己的预算           | 扣活动池的预算   |
| **兜底保护**   | 预算不足时自动降级到空奖           | 同                         | 同               |

###

### 关键约束重申

1. 活动创建时必须强制指定 `budget_mode`
2. BUDGET_POINTS 必须带 `campaign_id`（AssetService 层强制校验）
3. 一个活动只能有一种预算模式
4. 奖品池配置不可变，过滤只是临时筛选
5. 抽奖前过滤 + 中奖后扣减（双重约束）
6. 余额与流水必须同步（通过 AssetService.changeBalance）

---

**文档编写**：AI Assistant  
**基于材料**：真实库核查结果 + 用户业务需求确认  
**设计目标**：实现可落地的"用户预算 + 活动池预算"统一架构
