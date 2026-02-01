# 字段命名语义审计报告

> **生成时间**：2026-02-02  
> **审计范围**：整个后端项目的数据库字段、模型定义、服务代码  
> **审计方式**：连接真实数据库进行全面排查（非备份文件）  
> **最后更新**：2026-02-02（决策已确认，准备执行）

---

## ✅ 决策确认记录

| 决策点 | 选择 | 确认时间 |
|-------|------|---------|
| `session_id` 目标命名 | `behavior_session_id` | 2026-02-02 |
| 迁移执行策略 | 分 5 个迁移文件（P1-P5 各一个） | 2026-02-02 |
| 代码层变量名 | **不改**（仅修改数据库字段和模型定义） | 2026-02-02 |

**决策理由**：
- `behavior_session_id`：与表名 `user_behavior_tracks` 的领域词一致
- 分 5 个迁移：便于分阶段验证和精确回滚
- 不改代码层：JavaScript 惯例用简洁驼峰，数据库用完整蛇形，Sequelize 自动映射

---

## 📊 审计结果汇总

### 一、审计结论摘要

基于对以下内容的深度分析：
- **77个数据库模型**（V15.0 UUID角色系统集成版）
- **98个数据库迁移文件**（特别是最近的命名规范化迁移）
- **服务层代码中的字段引用**
- **全量数据库 INFORMATION_SCHEMA 扫描**

#### 📊 全量扫描结果

| 检查项 | 结果 |
|-------|------|
| 数据库模型总数 | 77 个 |
| 检查的短名称模式 | `campaign_id`, `prize_id`, `draw_id`, `preset_id`, `decision_id`, `debt_id` 等 15 种 |
| 发现的问题字段 | **11 个**（全部确定修复） |
| 已完成修复字段 | **11 个** |
| 无需修改的通用字段 | `user_id`, `store_id`, `account_id`, `operator_id` 等 |

#### ✅ 确认无问题的领域

| 领域 | 状态 | 说明 |
|-----|------|------|
| 消费记录 | ✅ 已规范 | `consumption_record_id` |
| 交易市场 | ✅ 已规范 | `market_listing_id`, `trade_order_id` |
| 资产系统 | ✅ 已规范 | `asset_transaction_id`, `account_asset_balance_id` |
| 用户系统 | ✅ 保持简洁 | `user_id` 等通用字段 |
| 预设债务 | ✅ 已规范 | `preset_budget_debt_id`, `preset_inventory_debt_id` |

### 二、已完成的修复（P0 - 已解决）

| 表名 | 旧字段名 | 新字段名 | 迁移文件 | 备注 |
|------|----------|----------|----------|------|
| `account_asset_balances` | `campaign_id` | `lottery_campaign_id` | `20260202110000` | 外键 |
| `preset_budget_debt` | `draw_id` | `lottery_draw_id` | `20260201102516` | 外键 |
| `preset_inventory_debt` | `draw_id` | `lottery_draw_id` | `20260201102516` | 外键 |
| `preset_budget_debt` | `preset_id` | `lottery_preset_id` | `20260201075523` | 外键 |
| `preset_inventory_debt` | `preset_id` | `lottery_preset_id` | `20260201075523` | 外键 |
| `preset_budget_debt` | `debt_id` | `preset_budget_debt_id` | `20260201075523` | 主键 |
| `preset_inventory_debt` | `debt_id` | `preset_inventory_debt_id` | `20260201075523` | 主键 |
| `lottery_draw_decisions` | `decision_id` | `lottery_draw_decision_id` | `20260201075523` | 主键 |
| `lottery_draws` | `campaign_id` | `lottery_campaign_id` | `20260201075523` | 外键 |
| `lottery_draws` | `prize_id` | `lottery_prize_id` | `20260201075523` | 外键 |
| `lottery_draw_decisions` | `draw_id` | `lottery_draw_id` | `20260201075523` | 外键 |

### 三、待执行（P1-P5 共 11 个字段）

| 阶段 | 字段变更 | 涉及表 | 类型 | 风险 |
|-----|---------|-------|------|------|
| **P1** | `preset_id` → `lottery_preset_id` | `lottery_draws`, `lottery_draw_decisions` | 外键 | 🟡中 |
| **P2** | `last_campaign_id` → `last_lottery_campaign_id` | `lottery_user_global_state` | 外键 | 🟢低 |
| **P3** | `fallback_prize_id` → `fallback_lottery_prize_id` | `lottery_campaigns` | 外键 | 🟢低 |
| **P3** | `tier_fallback_prize_id` → `tier_fallback_lottery_prize_id` | `lottery_campaigns` | 外键 | 🟢低 |
| **P4** | `decision_id` → `lottery_draw_decision_id` | `lottery_draws` | 外键 | 🟡中 |
| **P4** | `inventory_debt_id` → `preset_inventory_debt_id` | `lottery_draws` | 外键 | 🟡中 |
| **P4** | `budget_debt_id` → `preset_budget_debt_id` | `lottery_draws` | 外键 | 🟡中 |
| **P5** | `batch_id` → `lottery_batch_id` | `lottery_draws` | 业务标识 | 🟢低 |
| **P5** | `batch_draw_id` → `lottery_batch_draw_id` | `lottery_draws` | 业务标识 | 🟢低 |
| **P5** | `session_id` → `behavior_session_id` | `user_behavior_tracks` | 业务标识 | 🟢低 |

> ⚠️ **说明**：
> - P1-P4 阶段处理**外键字段**，确保与被引用表的主键名一致
> - P5 阶段处理**业务标识字段**，添加领域前缀提高语义清晰度

### 四、确定修复（P5 - 业务标识字段）

| 表名 | 字段 | 目标名称 | 类型 | 风险 |
|-----|-----|---------|------|------|
| `lottery_draws` | `batch_id` | `lottery_batch_id` | 业务标识 | 🟢低 |
| `lottery_draws` | `batch_draw_id` | `lottery_batch_draw_id` | 业务标识 | 🟢低 |
| `user_behavior_tracks` | `session_id` | `behavior_session_id` | 业务标识 | 🟢低 |

> ✅ **已确定执行**：虽然这些字段不是外键，但为保持命名一致性，统一添加领域前缀。

### 五、保持现状（无需修改）

| 表名 | 字段 | 原因 |
|-----|-----|------|
| `lottery_draws` | `asset_transaction_id` | 引用 `asset_transactions` 表，名称已正确 |
| `lottery_draws` | `business_id` | 幂等键，通用业务ID，保持简洁 |
| 各表 | `user_id`, `store_id`, `account_id` 等 | 通用字段，保持简洁 |

### 六、预计总工作量

| 阶段 | 任务 | 耗时 |
|-----|------|-----|
| P1 | preset_id 统一（2个表） | 3-4小时 |
| P2 | last_campaign_id 统一 | 1-2小时 |
| P3 | fallback_prize_id 系列（2个字段） | 2-3小时 |
| P4 | decision_id + debt 相关（3个字段） | 2-3小时 |
| P5 | batch_id + session_id（3个字段，2个表） | 2-3小时 |
| 测试 | 回归测试验证 | 2-3小时 |
| **总计** | **P1-P5 + 测试** | **12-18小时** |

### 七、执行顺序

```
P1 (preset_id) → P2 (last_campaign_id) → P3 (fallback_prize_id) → P4 (debt/decision) → P5 (batch/session) → 回归测试
```

---

## 📋 审计背景

### 问题发现

在修复消费审核功能时，发现以下命名不一致问题：

```
代码层：BalanceService.js 使用 lottery_campaign_id
数据库：account_asset_balances 表使用 campaign_id
```

这导致查询失败：`Unknown column 'AccountAssetBalance.lottery_campaign_id'`

### 命名规范原则

| 原则 | 说明 | 示例 |
|-----|------|------|
| **业务语义优先** | 字段名应明确表达业务含义 | `lottery_campaign_id` 优于 `campaign_id` |
| **避免歧义** | 避免使用可能有多种解释的名称 | `campaign` 可能是营销活动、抽奖活动、促销活动 |
| **前缀标识领域** | 特定领域的字段应加领域前缀 | `lottery_*`、`consumption_*`、`market_*` |
| **通用字段例外** | 通用字段保持简洁 | `user_id`、`account_id`、`created_at` |
| **外键与主键一致** | 外键名应与被引用表的主键名相同 | `lottery_draws.lottery_campaign_id` → `lottery_campaigns.lottery_campaign_id` |

---

## 🔴 已修复问题（P0 完成）

### 1. `account_asset_balances.campaign_id` → `lottery_campaign_id`

| 项目 | 修复前 | 修复后 |
|-----|-------|-------|
| **数据库字段** | `campaign_id` | `lottery_campaign_id` |
| **生成列** | `campaign_key` | `lottery_campaign_key` |
| **模型定义** | `campaign_id` | `lottery_campaign_id` |
| **服务代码** | 已统一 | `lottery_campaign_id` |

**迁移文件**：`20260202110000-rename-account-asset-balances-campaign-id.js`

### 2. 预设债务表字段重命名

| 表名 | 修复前 | 修复后 | 类型 |
|-----|-------|-------|------|
| `preset_budget_debt` | `draw_id` | `lottery_draw_id` | 外键 |
| `preset_inventory_debt` | `draw_id` | `lottery_draw_id` | 外键 |
| `preset_budget_debt` | `preset_id` | `lottery_preset_id` | 外键 |
| `preset_inventory_debt` | `preset_id` | `lottery_preset_id` | 外键 |
| `preset_budget_debt` | `debt_id` | `preset_budget_debt_id` | 主键 |
| `preset_inventory_debt` | `debt_id` | `preset_inventory_debt_id` | 主键 |

**迁移文件**：
- `20260201102516-fix-draw-id-to-lottery-draw-id.js`
- `20260201075523-rename-remaining-pks-and-fks.js`

### 3. 决策表主键和外键重命名

| 表名 | 修复前 | 修复后 | 类型 |
|-----|-------|-------|------|
| `lottery_draw_decisions` | `decision_id` | `lottery_draw_decision_id` | 主键 |
| `lottery_draw_decisions` | `draw_id` | `lottery_draw_id` | 外键 |

**迁移文件**：`20260201075523-rename-remaining-pks-and-fks.js`

---

## 🟡 待执行修复

### P1 - `preset_id` → `lottery_preset_id`（必须优先）

**当前状态**：

| 表名 | 字段 | 类型 | 建议 |
|-----|------|------|------|
| `lottery_draws` | `preset_id` (INT) | 外键 | → `lottery_preset_id` |
| `lottery_draw_decisions` | `preset_id` (VARCHAR 50) | 外键 | → `lottery_preset_id` |

**分析**：
- `preset_id` 引用 `lottery_presets` 表
- 当前命名可能与其他系统的"预设"概念混淆
- 统一为 `lottery_preset_id` 明确关联抽奖预设

**🔴 严重问题发现**：`LotteryDrawDecision` 模型关联定义与数据库字段不匹配

```javascript
// models/LotteryDrawDecision.js 中的关联定义
LotteryDrawDecision.belongsTo(models.LotteryPreset, {
  foreignKey: 'lottery_preset_id',  // ❌ 关联使用完整名称
  as: 'preset'
});

// 但实际数据库字段是：
// lottery_draw_decisions.preset_id (varchar50)  // ❌ 数据库使用短名称
```

**影响**：当执行 `include: [{ model: LotteryPreset, as: 'preset' }]` 关联查询时，Sequelize 会查找不存在的 `lottery_preset_id` 字段，导致查询失败。

**风险评估**：🟡 中等
- 需要更新模型定义
- 需要数据库迁移
- 服务代码需要调整
- **决策**：✅ 确定执行修复（P1 优先级）

---

### P2 - `last_campaign_id` → `last_lottery_campaign_id`

**当前状态**：

| 表名 | 字段 | 建议 |
|-----|------|------|
| `lottery_user_global_state` | `last_campaign_id` | → `last_lottery_campaign_id` |

**分析**：
- 记录用户最后参与的抽奖活动
- 当前命名语义不够明确
- 统一添加 `lottery_` 前缀保持一致性

**风险评估**：🟢 低
- 仅一处使用
- 迁移简单
- **决策**：✅ 确定执行修复（P2 优先级）

---

### P3 - `fallback_prize_id` / `tier_fallback_prize_id`

**当前状态**：

| 表名 | 字段 | 建议 |
|-----|------|------|
| `lottery_campaigns` | `fallback_prize_id` | → `fallback_lottery_prize_id` |
| `lottery_campaigns` | `tier_fallback_prize_id` | → `tier_fallback_lottery_prize_id` |

**分析**：
- 这些字段引用 `lottery_prizes` 表
- 当前命名省略了 `lottery_` 前缀
- 为保持命名一致性，统一添加 `lottery_` 前缀

**风险评估**：🟢 低
- 字段在抽奖活动表内，上下文明确
- 修改后字段名较长但语义完整
- **决策**：✅ 确定执行修复（P3 优先级）

---

### P4 - `decision_id` 和 debt 相关字段

**补充审计发现**：`lottery_draws` 表中存在更多短名称外键字段

| 字段 | 引用表 | 引用表主键 | 问题描述 |
|-----|-------|----------|---------|
| `decision_id` | `lottery_draw_decisions` | `lottery_draw_decision_id` | 应与主键名保持一致 |
| `inventory_debt_id` | `preset_inventory_debt` | `preset_inventory_debt_id` | 应与主键名保持一致 |
| `budget_debt_id` | `preset_budget_debt` | `preset_budget_debt_id` | 应与主键名保持一致 |

> ⚠️ **说明**：被引用表的主键已在迁移 `20260201075523` 中完成重命名，但 `lottery_draws` 表中的这些外键字段尚未更新。

**风险评估**：🟡 中等
- 需要更新数据库字段
- 需要更新模型定义和关联
- **决策**：✅ 确定执行修复（P4 优先级）

---

## 🔵 代码层命名问题（可选）

### 函数参数和变量命名

**问题描述**：部分服务函数使用简化的参数名

```javascript
// 当前代码
static async getHourlyTrend(campaign_id, options = {})

// 建议改进（可选）
static async getHourlyTrend(lottery_campaign_id, options = {})
```

**涉及文件**：
- `services/lottery/AnalyticsQueryService.js`：约30处使用 `campaign_id` 作为参数名

**评估**：
- 参数名属于内部实现，不影响数据库
- 语义在函数上下文中是明确的（函数名含 `lottery`）
- **建议**：优先级低，可在重构时统一

---

### JSDoc 注释中的字段引用

**问题描述**：注释中引用字段名可能与实际字段不一致

```javascript
// 注释示例
* @param {number} prize_id - 奖品ID

// 实际字段
lottery_prize_id
```

**建议**：
- 更新 JSDoc 使用正确的字段名
- 使用 `@see` 标签关联模型定义

---

## 📊 字段命名对照表

### 抽奖领域（lottery）

| 短名称 | 完整名称 | 当前数据库状态 | 建议动作 |
|-------|---------|---------------|---------|
| `campaign_id` | `lottery_campaign_id` | ✅ 已统一 | 无 |
| `prize_id` | `lottery_prize_id` | ✅ 已统一 | 无 |
| `draw_id` | `lottery_draw_id` | ✅ 已统一 | 无 |
| `preset_id` | `lottery_preset_id` | 🔴待迁移 | P1阶段执行 |
| `last_campaign_id` | `last_lottery_campaign_id` | 🔴待迁移 | P2阶段执行 |
| `fallback_prize_id` | `fallback_lottery_prize_id` | 🔴待迁移 | P3阶段执行 |
| `tier_fallback_prize_id` | `tier_fallback_lottery_prize_id` | 🔴待迁移 | P3阶段执行 |
| `decision_id` | `lottery_draw_decision_id` | 🔴待迁移 | P4阶段执行 |

### 预设债务领域（preset）

| 短名称 | 完整名称 | 当前数据库状态 | 建议动作 |
|-------|---------|---------------|---------|
| `debt_id` (budget) | `preset_budget_debt_id` | ✅ 已统一 | 无 |
| `debt_id` (inventory) | `preset_inventory_debt_id` | ✅ 已统一 | 无 |
| `inventory_debt_id` | `preset_inventory_debt_id` | 🔴待迁移 | P4阶段执行 |
| `budget_debt_id` | `preset_budget_debt_id` | 🔴待迁移 | P4阶段执行 |

### 消费领域（consumption）

| 短名称 | 完整名称 | 当前数据库状态 | 建议动作 |
|-------|---------|---------------|---------|
| `record_id` | `consumption_record_id` | ✅ 已统一 | 无 |

### 交易市场领域（market）

| 短名称 | 完整名称 | 当前数据库状态 | 建议动作 |
|-------|---------|---------------|---------|
| `listing_id` | `market_listing_id` | ✅ 已统一 | 无 |
| `order_id` | `trade_order_id` | ✅ 已统一 | 无 |

### 通用字段（保持简洁）

| 字段名 | 说明 | 建议动作 |
|-------|------|---------|
| `user_id` | 用户ID | 保持不变 |
| `account_id` | 账户ID | 保持不变 |
| `store_id` | 门店ID | 保持不变 |
| `operator_id` | 操作人ID | 保持不变 |
| `reviewer_id` | 审核人ID | 保持不变 |
| `created_at` | 创建时间 | 保持不变 |
| `updated_at` | 更新时间 | 保持不变 |

---

## 🛠️ 修复方案（完整统一）

**目标**：彻底解决所有字段命名语义不一致问题，建立规范化的字段命名体系

### 需要修复的字段清单

| 序号 | 表名 | 当前字段 | 目标字段 | 优先级 | 风险 |
|-----|------|---------|---------|-------|------|
| 1 | `lottery_draws` | `preset_id` (int) | `lottery_preset_id` | P1 | 🟡中 |
| 2 | `lottery_draw_decisions` | `preset_id` (varchar50) | `lottery_preset_id` | P1 | 🟡中 |
| 3 | `lottery_user_global_state` | `last_campaign_id` (int) | `last_lottery_campaign_id` | P2 | 🟢低 |
| 4 | `lottery_campaigns` | `fallback_prize_id` | `fallback_lottery_prize_id` | P3 | 🟢低 |
| 5 | `lottery_campaigns` | `tier_fallback_prize_id` | `tier_fallback_lottery_prize_id` | P3 | 🟢低 |
| 6 | `lottery_draws` | `decision_id` | `lottery_draw_decision_id` | P4 | 🟡中 |
| 7 | `lottery_draws` | `inventory_debt_id` | `preset_inventory_debt_id` | P4 | 🟡中 |
| 8 | `lottery_draws` | `budget_debt_id` | `preset_budget_debt_id` | P4 | 🟡中 |

> ✅ **执行决策**：以上 8 个字段全部执行修复，不保留短名称

### 🎯 语义分析：为什么新名称更好

| 序号 | 当前字段 | 目标字段 | 语义问题分析 | 新名称优势 |
|-----|---------|---------|-------------|-----------|
| 1 | `preset_id` | `lottery_preset_id` | ❌ `preset` 过于通用，可能指任何"预设"（系统预设、用户预设、配置预设等） | ✅ `lottery_preset_id` 明确指向"抽奖预设"，消除歧义 |
| 2 | `last_campaign_id` | `last_lottery_campaign_id` | ❌ `campaign` 可能是营销活动、广告活动、促销活动等多种含义 | ✅ `lottery_campaign` 精确表达"抽奖活动"，避免与其他业务活动混淆 |
| 3 | `fallback_prize_id` | `fallback_lottery_prize_id` | ❌ `prize` 可能是任何奖品系统（积分兑换奖品、会员奖品等） | ✅ `lottery_prize` 明确是"抽奖奖品"，保持领域一致性 |
| 4 | `tier_fallback_prize_id` | `tier_fallback_lottery_prize_id` | ❌ 同上，`prize` 语义不明确 | ✅ 添加 `lottery_` 前缀后与其他奖品系统区分 |
| 5 | `decision_id` | `lottery_draw_decision_id` | ❌ `decision` 极度模糊，可以是任何决策（审批决策、业务决策等） | ✅ `lottery_draw_decision` 明确是"抽奖开奖决策"记录 |
| 6 | `inventory_debt_id` | `preset_inventory_debt_id` | ❌ `inventory_debt` 缺少业务上下文，不知是什么库存的债务 | ✅ `preset_inventory_debt` 明确是"预设库存债务"（抽奖预设配置相关） |
| 7 | `budget_debt_id` | `preset_budget_debt_id` | ❌ `budget_debt` 过于通用，财务、营销都可能有预算债务 | ✅ `preset_budget_debt` 明确是"预设预算债务"（抽奖预设配置相关） |

#### 命名规范原则说明

| 原则 | 说明 | 好的示例 | 差的示例 |
|-----|------|---------|---------|
| **领域前缀** | 外键名应与引用表的主键保持一致 | `lottery_campaign_id` | `campaign_id` |
| **消除歧义** | 字段名应在脱离上下文时仍能理解 | `lottery_preset_id` | `preset_id` |
| **自描述性** | 字段名应包含足够的业务语义 | `lottery_draw_decision_id` | `decision_id` |
| **一致性** | 同一领域的字段使用相同的命名模式 | `lottery_*_id` 系列 | 混用短名称 |

#### 实际风险案例

**案例：`preset_id` 的歧义问题**

```javascript
// ❌ 现有代码 - 阅读者需要查看上下文才能理解
const result = await db.query('SELECT * FROM lottery_draws WHERE preset_id = ?', [presetId]);
// 问题：preset_id 是什么预设？用户预设？系统配置预设？

// ✅ 修复后 - 自描述性强
const result = await db.query('SELECT * FROM lottery_draws WHERE lottery_preset_id = ?', [lotteryPresetId]);
// 清晰：这是抽奖预设的 ID
```

**案例：`decision_id` 的歧义问题**

```javascript
// ❌ 现有代码 - 语义模糊
await LotteryDraw.update({ decision_id: newDecisionId }, { where: { lottery_draw_id } });
// 问题：decision_id 是审批决策？业务决策？抽奖决策？

// ✅ 修复后 - 语义明确
await LotteryDraw.update({ lottery_draw_decision_id: newDecisionId }, { where: { lottery_draw_id } });
// 清晰：这是抽奖开奖决策记录的 ID
```

**案例：外键与主键命名一致性**

```sql
-- ❌ 不一致：外键名与主键名不匹配
lottery_draws.decision_id --> lottery_draw_decisions.lottery_draw_decision_id

-- ✅ 一致：外键名等于被引用表的主键名
lottery_draws.lottery_draw_decision_id --> lottery_draw_decisions.lottery_draw_decision_id
```

> 💡 **总结**：完整的字段名虽然更长，但具有**自文档化**特性，减少了代码阅读和维护成本，降低了跨团队协作时的理解障碍。

### 实施步骤

**第一阶段：P1 - preset_id 统一（必须优先）**

1. **数据库迁移**
   ```sql
   -- lottery_draws 表
   ALTER TABLE lottery_draws 
   CHANGE COLUMN preset_id lottery_preset_id INT;
   
   -- lottery_draw_decisions 表
   ALTER TABLE lottery_draw_decisions 
   CHANGE COLUMN preset_id lottery_preset_id VARCHAR(50);
   ```

2. **模型更新**
   - `models/LotteryDraw.js`：字段定义 `preset_id` → `lottery_preset_id`
   - `models/LotteryDrawDecision.js`：字段定义 `preset_id` → `lottery_preset_id`（关联已正确）

3. **服务代码更新**
   - 检查所有使用 `preset_id` 的代码位置
   - 统一更新为 `lottery_preset_id`

**第二阶段：P2 - last_campaign_id 统一**

1. **数据库迁移**
   ```sql
   ALTER TABLE lottery_user_global_state 
   CHANGE COLUMN last_campaign_id last_lottery_campaign_id INT;
   ```

2. **模型更新**
   - `models/LotteryUserGlobalState.js`：字段定义更新

3. **服务代码更新**
   - `services/UnifiedLotteryEngine/compute/state/GlobalStateManager.js`
   - 其他引用该字段的文件

**第三阶段：P3 - fallback_prize_id 系列（必须执行）**

1. **数据库迁移**
   ```sql
   -- lottery_campaigns 表
   ALTER TABLE lottery_campaigns 
   CHANGE COLUMN fallback_prize_id fallback_lottery_prize_id INT;
   
   ALTER TABLE lottery_campaigns 
   CHANGE COLUMN tier_fallback_prize_id tier_fallback_lottery_prize_id INT;
   ```

2. **模型更新**
   - `models/LotteryCampaign.js`：字段定义更新
     - `fallback_prize_id` → `fallback_lottery_prize_id`
     - `tier_fallback_prize_id` → `tier_fallback_lottery_prize_id`

3. **服务代码更新**
   - 搜索所有使用 `fallback_prize_id` 和 `tier_fallback_prize_id` 的文件
   - 统一更新为完整名称

4. **关联定义检查**
   - 确认与 `lottery_prizes` 表的关联使用正确的外键名

**第四阶段：P4 - decision_id 和 debt 相关字段**

1. **数据库迁移**
   ```sql
   -- lottery_draws 表
   ALTER TABLE lottery_draws 
   CHANGE COLUMN decision_id lottery_draw_decision_id BIGINT;
   
   ALTER TABLE lottery_draws 
   CHANGE COLUMN inventory_debt_id preset_inventory_debt_id INT;
   
   ALTER TABLE lottery_draws 
   CHANGE COLUMN budget_debt_id preset_budget_debt_id INT;
   ```

2. **模型更新**
   - `models/LotteryDraw.js`：
     - `decision_id` → `lottery_draw_decision_id`
     - `inventory_debt_id` → `preset_inventory_debt_id`
     - `budget_debt_id` → `preset_budget_debt_id`

3. **服务代码更新**
   - 搜索所有使用这些字段的文件
   - 特别关注 `services/UnifiedLotteryEngine/` 目录

4. **关联定义检查**
   - 确认与 `lottery_draw_decisions` 表的关联
   - 确认与 `preset_inventory_debt` 表的关联
   - 确认与 `preset_budget_debt` 表的关联

### 风险评估

| 风险点 | 级别 | 缓解措施 |
|-------|-----|---------|
| 关联查询失败 | 🔴高 | 同时更新数据库和模型 |
| 服务代码遗漏 | 🟡中 | 使用 grep 全量搜索 |
| API 响应字段变化 | 🟡中 | 检查 API 是否暴露原始字段名 |
| 历史数据兼容 | 🟢低 | 仅重命名，不改数据 |

### 验证脚本

```bash
# 执行修复后验证
cd /home/devbox/project && node -e "
require('dotenv').config();
const { sequelize, LotteryDraw, LotteryDrawDecision, LotteryPreset } = require('./models');

async function verify() {
  // 测试关联查询
  const draw = await LotteryDraw.findOne({
    include: [{ model: LotteryPreset, as: 'preset' }]
  });
  console.log('LotteryDraw 关联查询:', draw ? '✅成功' : '⚠️无数据');
  
  const decision = await LotteryDrawDecision.findOne({
    include: [{ model: LotteryPreset, as: 'preset' }]
  });
  console.log('LotteryDrawDecision 关联查询:', decision ? '✅成功' : '⚠️无数据');
  
  await sequelize.close();
}
verify();
"
```

### 预计工作量

| 阶段 | 任务 | 耗时 |
|-----|------|-----|
| P1 | preset_id 统一（2个表） | 3-4小时 |
| P2 | last_campaign_id 统一 | 1-2小时 |
| P3 | fallback_prize_id 系列（2个字段） | 2-3小时 |
| P4 | decision_id + debt 相关（3个字段） | 2-3小时 |
| P5 | batch_id + session_id（3个字段） | 2-3小时 |
| 测试 | 回归测试验证 | 2-3小时 |
| **总计** | | **12-18小时** |

### 执行决策

**✅ 已确定执行完整统一方案**

执行范围：五个阶段全部执行（共 11 个字段）

| 阶段 | 范围 | 状态 |
|-----|------|------|
| P1 | `preset_id` → `lottery_preset_id`（2个表） | 🔴待执行 |
| P2 | `last_campaign_id` → `last_lottery_campaign_id` | 🔴待执行 |
| P3 | `fallback_prize_id` 系列（2个字段） | 🔴待执行 |
| P4 | `decision_id`, `inventory_debt_id`, `budget_debt_id`（3个字段） | 🔴待执行 |
| P5 | `batch_id`, `batch_draw_id`, `session_id`（3个字段，2个表） | 🔴待执行 |

**执行顺序**：P1 → P2 → P3 → P4 → P5 → 回归测试

### 需要修改的文件清单

**P1 阶段 - preset_id 统一**

| 文件类型 | 文件路径 | 修改内容 |
|---------|---------|---------|
| 数据库迁移 | `migrations/` | 新建迁移文件 |
| 模型定义 | `models/LotteryDraw.js` | 字段 `preset_id` → `lottery_preset_id` |
| 模型定义 | `models/LotteryDrawDecision.js` | 字段 `preset_id` → `lottery_preset_id` |
| 服务代码 | `services/UnifiedLotteryEngine/compute/state/GlobalStateManager.js` | 更新字段引用 |
| 脚本文件 | `scripts/` 下相关脚本 | 检查并更新引用 |

**P2 阶段 - last_campaign_id 统一**

| 文件类型 | 文件路径 | 修改内容 |
|---------|---------|---------|
| 数据库迁移 | `migrations/` | 新建迁移文件 |
| 模型定义 | `models/LotteryUserGlobalState.js` | 字段 `last_campaign_id` → `last_lottery_campaign_id` |
| 服务代码 | 引用该字段的服务文件 | 更新字段引用 |

**P3 阶段 - fallback_prize_id 系列**

| 文件类型 | 文件路径 | 修改内容 |
|---------|---------|---------|
| 数据库迁移 | `migrations/` | 新建迁移文件 |
| 模型定义 | `models/LotteryCampaign.js` | 两个字段重命名 |
| 服务代码 | `services/UnifiedLotteryEngine/pipeline/stages/LoadCampaignStage.js` | 更新字段引用 |

**P4 阶段 - decision_id 和 debt 相关**

| 文件类型 | 文件路径 | 修改内容 |
|---------|---------|---------|
| 数据库迁移 | `migrations/` | 新建迁移文件 |
| 模型定义 | `models/LotteryDraw.js` | 三个字段重命名 |
| 服务代码 | `services/UnifiedLotteryEngine/` 相关文件 | 更新字段引用 |

**P5 阶段 - batch_id 和 session_id 业务标识**

| 文件类型 | 文件路径 | 修改内容 |
|---------|---------|---------|
| 数据库迁移 | `migrations/` | 新建迁移文件 |
| 模型定义 | `models/LotteryDraw.js` | `batch_id` → `lottery_batch_id`, `batch_draw_id` → `lottery_batch_draw_id` |
| 模型定义 | `models/UserBehaviorTrack.js` | `session_id` → `behavior_session_id` |
| 服务代码 | `services/UnifiedLotteryEngine/` 相关文件 | 更新 batch 相关引用 |
| 服务代码 | `services/` 行为追踪相关文件 | 更新 session_id 引用 |

### 迁移文件命名规范

```
migrations/
├── 20260202120000-rename-preset-id-to-lottery-preset-id.js      # P1
├── 20260202120100-rename-last-campaign-id.js                    # P2
├── 20260202120200-rename-fallback-prize-id-fields.js            # P3
├── 20260202120300-rename-decision-and-debt-id-fields.js         # P4
└── 20260202120400-rename-batch-and-session-id-fields.js         # P5
```

---

## 📝 排查脚本

### 数据库字段检查脚本

```bash
# 检查残留的短字段名
cd /home/devbox/project && node -e "
require('dotenv').config();
const { sequelize } = require('./models');

async function checkFields() {
  const shortNames = ['campaign_id', 'prize_id', 'draw_id', 'preset_id', 'decision_id', 'inventory_debt_id', 'budget_debt_id', 'batch_id', 'batch_draw_id', 'session_id'];
  
  for (const name of shortNames) {
    const [results] = await sequelize.query(\`
      SELECT TABLE_NAME, COLUMN_NAME 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_SCHEMA = DATABASE() 
        AND COLUMN_NAME = '\${name}'
    \`);
    
    if (results.length > 0) {
      console.log('\\n发现 ' + name + ':');
      results.forEach(r => console.log('  - ' + r.TABLE_NAME));
    }
  }
  
  await sequelize.close();
}
checkFields();
"
```

### 代码层检查脚本

```bash
# 检查服务代码中的字段引用
grep -rn "\.preset_id\|'preset_id'\|\"preset_id\"" \
  --include="*.js" \
  services/ routes/ models/ | \
  grep -v "lottery_preset_id" | \
  grep -v "node_modules"

# 检查 decision_id 引用
grep -rn "\.decision_id\|'decision_id'\|\"decision_id\"" \
  --include="*.js" \
  services/ routes/ models/ | \
  grep -v "lottery_draw_decision_id" | \
  grep -v "node_modules"

# 检查 debt 相关引用
grep -rn "inventory_debt_id\|budget_debt_id" \
  --include="*.js" \
  services/ routes/ models/ | \
  grep -v "preset_inventory_debt_id\|preset_budget_debt_id" | \
  grep -v "node_modules"

# 检查 batch_id 相关引用（P5）
grep -rn "\.batch_id\|'batch_id'\|\"batch_id\"" \
  --include="*.js" \
  services/ routes/ models/ | \
  grep -v "lottery_batch_id" | \
  grep -v "node_modules"

# 检查 session_id 引用（P5）
grep -rn "\.session_id\|'session_id'\|\"session_id\"" \
  --include="*.js" \
  services/ routes/ models/ | \
  grep -v "behavior_session_id" | \
  grep -v "node_modules"
```

### 模型一致性检查脚本

```bash
# 检查模型定义与数据库字段是否一致
cd /home/devbox/project && node -e "
require('dotenv').config();
const { sequelize, LotteryDraw, LotteryDrawDecision, LotteryCampaign, LotteryUserGlobalState, UserBehaviorTrack } = require('./models');

async function checkModelConsistency() {
  const models = [
    { name: 'LotteryDraw', model: LotteryDraw },
    { name: 'LotteryDrawDecision', model: LotteryDrawDecision },
    { name: 'LotteryCampaign', model: LotteryCampaign },
    { name: 'LotteryUserGlobalState', model: LotteryUserGlobalState },
    { name: 'UserBehaviorTrack', model: UserBehaviorTrack }
  ];
  
  for (const { name, model } of models) {
    const attrs = Object.keys(model.rawAttributes);
    console.log(name + ' 模型中的 ID 字段:');
    attrs.filter(a => a.includes('_id')).forEach(a => console.log('  ' + a));
    console.log('');
  }
  
  await sequelize.close();
}
checkModelConsistency();
"
```

---

## ✅ 验收标准

### 完成条件

- [ ] **P1**：`lottery_draws.preset_id` → `lottery_preset_id` 完成
- [ ] **P1**：`lottery_draw_decisions.preset_id` → `lottery_preset_id` 完成
- [ ] **P2**：`lottery_user_global_state.last_campaign_id` → `last_lottery_campaign_id` 完成
- [ ] **P3**：`lottery_campaigns.fallback_prize_id` → `fallback_lottery_prize_id` 完成
- [ ] **P3**：`lottery_campaigns.tier_fallback_prize_id` → `tier_fallback_lottery_prize_id` 完成
- [ ] **P4**：`lottery_draws.decision_id` → `lottery_draw_decision_id` 完成
- [ ] **P4**：`lottery_draws.inventory_debt_id` → `preset_inventory_debt_id` 完成
- [ ] **P4**：`lottery_draws.budget_debt_id` → `preset_budget_debt_id` 完成
- [ ] **P5**：`lottery_draws.batch_id` → `lottery_batch_id` 完成
- [ ] **P5**：`lottery_draws.batch_draw_id` → `lottery_batch_draw_id` 完成
- [ ] **P5**：`user_behavior_tracks.session_id` → `behavior_session_id` 完成
- [ ] 数据库字段与模型定义一致
- [ ] 服务代码使用正确的字段名
- [ ] ESLint 检查通过
- [ ] 功能测试通过
- [ ] API 合约测试通过

### 回归测试

修复字段命名后，需要验证以下功能：

1. **抽奖功能**
   - 创建抽奖活动
   - 执行抽奖
   - 查询抽奖结果

2. **消费审核功能**
   - 提交消费记录
   - 审核通过/拒绝
   - 积分发放

3. **资产管理功能**
   - 余额查询
   - 资产变动
   - 预算分配

---

## 📌 执行计划

**✅ 已确定采用完整统一方案 - P1/P2/P3/P4/P5 五个阶段全部执行（共 11 个字段）**

### 执行状态

| 阶段 | 字段变更 | 涉及表 | 状态 |
|-----|---------|-------|------|
| ✅ P0 | `campaign_id` → `lottery_campaign_id` | `account_asset_balances` | 已完成 |
| ✅ P0 | `draw_id` → `lottery_draw_id` | `preset_budget_debt`, `preset_inventory_debt` | 已完成 |
| ✅ P0 | `preset_id` → `lottery_preset_id` | `preset_budget_debt`, `preset_inventory_debt` | 已完成 |
| ✅ P0 | `debt_id` → `preset_*_debt_id` | `preset_budget_debt`, `preset_inventory_debt` | 已完成 |
| ✅ P0 | `decision_id` → `lottery_draw_decision_id` | `lottery_draw_decisions` (主键) | 已完成 |
| 🔴 P1 | `preset_id` → `lottery_preset_id` | `lottery_draws`, `lottery_draw_decisions` | 待执行 |
| 🔴 P2 | `last_campaign_id` → `last_lottery_campaign_id` | `lottery_user_global_state` | 待执行 |
| 🔴 P3 | `fallback_prize_id` → `fallback_lottery_prize_id` | `lottery_campaigns` | 待执行 |
| 🔴 P3 | `tier_fallback_prize_id` → `tier_fallback_lottery_prize_id` | `lottery_campaigns` | 待执行 |
| 🔴 P4 | `decision_id` → `lottery_draw_decision_id` | `lottery_draws` (外键) | 待执行 |
| 🔴 P4 | `inventory_debt_id` → `preset_inventory_debt_id` | `lottery_draws` (外键) | 待执行 |
| 🔴 P4 | `budget_debt_id` → `preset_budget_debt_id` | `lottery_draws` (外键) | 待执行 |
| 🔴 P5 | `batch_id` → `lottery_batch_id` | `lottery_draws` | 待执行 |
| 🔴 P5 | `batch_draw_id` → `lottery_batch_draw_id` | `lottery_draws` | 待执行 |
| 🔴 P5 | `session_id` → `behavior_session_id` | `user_behavior_tracks` | 待执行 |

### 执行顺序

```
P1 (preset_id) → P2 (last_campaign_id) → P3 (fallback_prize_id) → P4 (debt/decision) → P5 (batch/session) → 回归测试
```

### 预计总工作量

- **P1 阶段**：3-4小时（preset_id 2个表）
- **P2 阶段**：1-2小时（last_campaign_id）
- **P3 阶段**：2-3小时（fallback_prize_id 2个字段）
- **P4 阶段**：2-3小时（decision_id + debt 3个字段）
- **P5 阶段**：2-3小时（batch_id + session_id 3个字段）
- **回归测试**：2-3小时
- **总计**：**12-18小时**

---

## 🔗 相关文件

### 已完成的迁移文件

| 迁移文件 | 描述 | 状态 |
|---------|------|------|
| `20260202110000-rename-account-asset-balances-campaign-id.js` | campaign_id → lottery_campaign_id | ✅ 已执行 |
| `20260201102516-fix-draw-id-to-lottery-draw-id.js` | draw_id → lottery_draw_id (debt表) | ✅ 已执行 |
| `20260201075523-rename-remaining-pks-and-fks.js` | 49个主键+21个外键规范化 | ✅ 已执行 |

### 待创建的迁移文件

| 迁移文件 | 描述 | 阶段 |
|---------|------|------|
| `20260202120000-rename-preset-id-to-lottery-preset-id.js` | preset_id 统一 | P1 |
| `20260202120100-rename-last-campaign-id.js` | last_campaign_id 重命名 | P2 |
| `20260202120200-rename-fallback-prize-id-fields.js` | fallback 奖品ID重命名 | P3 |
| `20260202120300-rename-decision-and-debt-id-fields.js` | decision/debt 外键重命名 | P4 |
| `20260202120400-rename-batch-and-session-id-fields.js` | batch/session 业务标识重命名 | P5 |

### 相关模型文件

- `models/LotteryDraw.js`
- `models/LotteryDrawDecision.js`
- `models/LotteryCampaign.js`
- `models/LotteryUserGlobalState.js`
- `models/AccountAssetBalance.js`
- `models/UserBehaviorTrack.js`

### 相关服务文件

- `services/asset/BalanceService.js`
- `services/UnifiedLotteryEngine/compute/state/GlobalStateManager.js`
- `services/UnifiedLotteryEngine/pipeline/stages/LoadCampaignStage.js`

---

**文档作者**：AI Assistant  
**最后更新**：2026-02-02（全面数据库扫描完成 - 共 P0 已完成 11 个 + P1-P5 五阶段 11 个字段待修复）
