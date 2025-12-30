# PointsService 迁移遗留项执行清单

**文档版本**: v2.1
**创建时间**: 2025-12-30
**更新时间**: 2025-12-30（新增第七、八章：资产域统一架构遗留工作验证）
**最终方案**: 方案C（重构 ConsumptionService 工作流）
**前置文档**: 资产域标准架构-破坏性重构方案.md

---

## 一、背景

资产域标准架构重构已完成约 60%（2025-12-30 验证），但 `PointsService` 无法完全删除，原因是：

1. `ConsumptionService` 依赖其 **pending points 工作流**
2. 多个积分路由仍直接调用 `PointsService`
3. `AssetService.getAssetPortfolio()` 内部仍引用旧模型

### 1.1 已完成的迁移

| 文件                            | 原依赖                                          | 迁移至                          | 状态      |
| ------------------------------- | ----------------------------------------------- | ------------------------------- | --------- |
| callbacks/ImageAuditCallback.js | PointsService.addPoints                         | AssetService.changeBalance      | ✅ 完成   |
| services/UserService.js         | PointsService.createPointsAccount               | AssetService.getOrCreateAccount | ✅ 完成   |
| services/PremiumService.js      | PointsService.consumePoints                     | AssetService.changeBalance      | ✅ 完成   |
| services/ConsumptionService.js  | PointsService.createPendingPointsForConsumption | -                               | ❌ 待处理 |
| services/ConsumptionService.js  | PointsService.activatePendingPoints             | -                               | ❌ 待处理 |

### 1.2 问题核心

**Pending Points 工作流** 与 **AssetService 的 Freeze/Unfreeze 模型** 本质不同：

| 特性     | Pending Points (旧)                 | Freeze/Unfreeze (新)       |
| -------- | ----------------------------------- | -------------------------- |
| 目的     | 展示"即将到账"的奖励                | 锁定"已有"的资产           |
| 余额变化 | 不影响 available，创建 pending 记录 | 从 available 转移到 frozen |
| 激活方式 | pending → completed，增加 available | frozen → available，解冻   |
| 适用场景 | 消费奖励审核                        | 交易冻结、商家审核         |

### 1.3 当前数据状态（2025-12-30）

| 数据项           | 数量  | 说明                                                 |
| ---------------- | ----- | ---------------------------------------------------- |
| 待审核消费记录   | 70 条 | `consumption_records.status='pending'`，预计 6269 分 |
| pending 积分交易 | 36 条 | `points_transactions.status='pending'`，2502 分      |
| 脏数据           | 18 条 | 消费已 rejected 但积分仍 pending（900 分）           |
| 缺失覆盖         | 52 条 | 待审核消费有，但无对应 pending 积分交易（4667 分）   |

**结论**：当前双表同步已失效，用户看到的"审核中积分"与真实待审核消费不一致。

---

## 二、最终方案（✅ 已拍板）

### 方案 C：重构 ConsumptionService 工作流

**思路**：取消 pending points 概念，改用"审核通过后直接发放"模式。

**优点**：

- 彻底消除 pending points
- 简化业务逻辑
- 单一真相源：审核状态由 consumption_records 管理
- 避免双表同步导致的脏数据

**用户体验保障**（已确认）：

- ✅ 用户可看到"待审核积分"
- ✅ 展示口径：从 `consumption_records.status='pending'` 汇总 `points_to_award`
- ✅ 后端实现：在积分余额接口增加 `pending_points` 字段（从消费记录汇总）

**核心改动**：

1. 商家提交时：仅创建 `consumption_record`（不创建 pending 积分交易）
2. 审核通过时：直接调用 `AssetService.changeBalance` 发放积分
3. 审核拒绝时：仅更新消费记录状态（无需处理积分）
4. 用户展示：从 `consumption_records.status='pending'` 汇总待审核积分

**预估工作量**：2-3 小时

### 关键细节决策（✅ 已拍板）

**1. 待审核积分汇总字段放置**

- **`/api/v4/shop/points/balance`**：返回 `available_points` + `pending_points` + `pending_count`（纯数字摘要）
- **`/api/v4/shop/points/overview`**：返回 pending 明细/审核中文案/最近记录（低频进入才拉）

**2. 数据清理范围**

- **rejected + expired**：直接 cancel 清理旧 pending 积分交易
- **approved**：先对账，确认已发放则终结旧 pending；未发放则补发，不直接 cancel

**3. AssetService 幂等键命名规则（长期统一模板）**

- **格式**：`<business_type>:<action>:<entity_id>`
- **示例**：
  - 审核通过发放：`consumption_reward:approve:${recordId}`
  - 审核拒绝（如需）：`consumption_reward:reject:${recordId}`
- **理由**：可读、可 grep、可 SQL 过滤、长期可扩展

**4. PointsService 处理策略**

- ✅ **马上移除**：不兼容、不过渡
- 删除 `createPendingPointsForConsumption()` 和 `activatePendingPoints()` 方法
- 删除 `ConsumptionService` 中的 `PointsService` 导入
- 长期待其他业务完全迁移后删除整个 `PointsService.js`

---

## 三、执行计划

### 阶段一：数据清理（必需前置步骤）

**目的**：清理历史脏数据，避免影响用户展示

**清理策略（已拍板）**：

- **rejected + expired**：直接 cancel 清理旧 pending 积分交易
- **approved**：先对账，确认已发放则终结旧 pending；未发放则补发

```sql
-- 1. 检查现有数据状态
SELECT
  COUNT(*) as pending_consumption_count,
  SUM(cr.points_to_award) as pending_consumption_points,
  SUM(CASE WHEN pt.transaction_id IS NULL THEN 1 ELSE 0 END) as missing_tx_count,
  SUM(CASE WHEN cr.status = 'rejected' THEN 1 ELSE 0 END) as rejected_with_pending_count,
  SUM(CASE WHEN cr.status = 'expired' THEN 1 ELSE 0 END) as expired_with_pending_count,
  SUM(CASE WHEN cr.status = 'approved' THEN 1 ELSE 0 END) as approved_with_pending_count
FROM consumption_records cr
LEFT JOIN points_transactions pt
  ON pt.reference_type = 'consumption'
  AND pt.reference_id = cr.record_id
  AND pt.status = 'pending'
  AND pt.is_deleted = 0
WHERE cr.status = 'pending' OR pt.transaction_id IS NOT NULL;

-- 2. 清理 rejected + expired 的脏数据
UPDATE points_transactions pt
JOIN consumption_records cr ON cr.record_id = pt.reference_id
SET
  pt.status = 'cancelled',
  pt.failure_reason = '关联消费记录已审核拒绝/过期，自动取消积分交易',
  pt.updated_at = NOW()
WHERE pt.is_deleted = 0
  AND pt.status = 'pending'
  AND pt.transaction_type = 'earn'
  AND pt.business_type = 'consumption_reward'
  AND pt.reference_type = 'consumption'
  AND cr.status IN ('rejected', 'expired');

-- 3. 对账 approved 的情况（检查是否已发放）
SELECT
  cr.record_id,
  cr.user_id,
  cr.points_to_award,
  cr.reviewed_at,
  pt.transaction_id as pending_tx_id,
  pt.points_amount as pending_amount,
  completed_tx.transaction_id as completed_tx_id,
  completed_tx.delta_amount as completed_amount
FROM consumption_records cr
JOIN points_transactions pt
  ON pt.reference_type = 'consumption'
  AND pt.reference_id = cr.record_id
  AND pt.status = 'pending'
  AND pt.is_deleted = 0
LEFT JOIN asset_transactions completed_tx
  ON completed_tx.meta->>'$.reference_id' = cr.record_id
  AND completed_tx.business_type = 'consumption_reward'
  AND completed_tx.asset_code = 'POINTS'
WHERE cr.status = 'approved';

-- 4. 处理 approved 的 pending 交易
-- 情况A：已通过 AssetService 发放 → 终结旧 pending
UPDATE points_transactions pt
JOIN consumption_records cr ON cr.record_id = pt.reference_id
JOIN asset_transactions at
  ON at.meta->>'$.reference_id' = cr.record_id
  AND at.business_type = 'consumption_reward'
  AND at.asset_code = 'POINTS'
SET
  pt.status = 'cancelled',
  pt.failure_reason = '消费已审核通过并通过AssetService发放，终结旧pending交易',
  pt.updated_at = NOW()
WHERE pt.is_deleted = 0
  AND pt.status = 'pending'
  AND pt.transaction_type = 'earn'
  AND pt.business_type = 'consumption_reward'
  AND pt.reference_type = 'consumption'
  AND cr.status = 'approved';

-- 情况B：未发放 → 需要人工补发（记录到日志，手动处理）
-- 这种情况应该很少，需要人工介入确认

-- 5. 验证清理结果
SELECT
  COUNT(*) as cleaned_count,
  SUM(pt.points_amount) as cleaned_points,
  GROUP_CONCAT(DISTINCT pt.failure_reason) as reasons
FROM points_transactions pt
WHERE pt.status = 'cancelled'
  AND pt.failure_reason LIKE '%关联消费记录已审核%';
```

### 阶段二：修改 ConsumptionService

**文件**：`services/ConsumptionService.js`

**修改点 1：商家提交消费记录（移除 pending 积分交易创建）**

```javascript
// 修改前（L299-319）
// 🔒 步骤8：创建pending积分交易
const pointsTransaction = await PointsService.createPendingPointsForConsumption(
  {
    user_id: userId,
    points: pointsToAward,
    reference_type: 'consumption',
    reference_id: consumptionRecord.record_id,
    business_type: 'consumption_reward',
    transaction_title: '消费奖励（待审核）',
    transaction_description: `消费${data.consumption_amount}元，预计奖励${pointsToAward}分`
  },
  transaction
)

// 修改后
// ✅ 方案C：不再创建 pending 积分交易
// 待审核积分直接从 consumption_records.status='pending' 展示
logger.info(`✅ 消费记录创建成功，预计奖励${pointsToAward}分（审核通过后发放）`)
```

**修改点 2：审核通过（改用 AssetService 直接发放）**

```javascript
// 修改前（L425-451）
// 5. 激活pending积分交易
const pendingTransaction = await PointsTransaction.findOne({
  where: {
    reference_type: 'consumption',
    reference_id: recordId,
    transaction_type: 'earn',
    status: 'pending'
  },
  transaction
})

if (!pendingTransaction) {
  throw new Error(`找不到对应的pending积分交易（消费记录ID: ${recordId}）`)
}

const pointsResult = await PointsService.activatePendingPoints(
  pendingTransaction.transaction_id,
  { transaction, operator_id: reviewData.reviewer_id, ... }
)

// 修改后
// ✅ 方案C：审核通过时直接发放积分（使用 AssetService）
const AssetService = require('./AssetService')
const pointsResult = await AssetService.changeBalance({
  user_id: record.user_id,
  asset_code: 'POINTS',
  delta_amount: record.points_to_award,
  business_type: 'consumption_reward',
  // ✅ 幂等键命名规则（已拍板）：<business_type>:<action>:<entity_id>
  idempotency_key: `consumption_reward:approve:${recordId}`,
  meta: {
    reference_type: 'consumption',
    reference_id: recordId,
    title: `消费奖励${record.points_to_award}分`,
    description: `【审核通过】消费${record.consumption_amount}元，奖励${record.points_to_award}积分`,
    operator_id: reviewData.reviewer_id
  }
}, { transaction })
```

**修改点 3：审核拒绝（无需处理积分，保持现有逻辑即可）**

```javascript
// 当前 rejectConsumption() 已经正确：
// - 只更新 consumption_records.status = 'rejected'
// - 只更新 content_review_records.audit_status = 'rejected'
// - 不涉及积分变动（因为审核拒绝=不发放）
// ✅ 无需修改
```

### 阶段三：后端提供待审核积分汇总

**接口分层（已拍板）**：

**接口 1：`/api/v4/shop/points/balance`（高频查询）**

- **文件**：`services/PointsService.js` → `getBalanceResponse()`
- **返回**：纯数字摘要（`available_points` + `pending_points` + `pending_count`）

```javascript
// 在 getBalanceResponse() 中增加待审核积分汇总
const [[pendingStats]] = await sequelize.query(
  `
  SELECT 
    COUNT(*) as pending_count,
    COALESCE(SUM(points_to_award), 0) as pending_points
  FROM consumption_records
  WHERE user_id = ? AND status = 'pending'
`,
  { replacements: [user_id] }
)

// 返回数据结构
return {
  user_id,
  available_points: points_overview.available_points,
  total_earned: points_overview.total_earned,
  total_consumed: points_overview.total_consumed,
  pending_points: parseFloat(pendingStats.pending_points) || 0, // ← 新增：待审核积分
  pending_count: parseInt(pendingStats.pending_count) || 0, // ← 新增：待审核消费条数
  last_earn_time: account.last_earn_time,
  last_consume_time: account.last_consume_time,
  is_active: account.is_active,
  timestamp: BeijingTimeHelper.apiTimestamp()
}
```

**接口 2：`/api/v4/shop/points/overview`（低频详情）**

- **文件**：`services/PointsService.js` → `getUserPointsOverview()`
- **返回**：pending 明细列表、审核中文案、最近记录（保持现有逻辑，但改为从 `consumption_records` 查询）

```javascript
// 修改 getUserPointsOverview() 中的冻结积分查询
// 修改前：查询 points_transactions.status='pending'
// 修改后：查询 consumption_records.status='pending'
const pendingConsumptions = await ConsumptionRecord.findAll({
  where: {
    user_id,
    status: 'pending'
  },
  attributes: [
    'record_id',
    'consumption_amount',
    'points_to_award',
    'merchant_notes',
    'created_at'
  ],
  order: [['created_at', 'DESC']],
  limit: 20,
  raw: true
})

const totalPending = pendingConsumptions.reduce((sum, c) => sum + parseFloat(c.points_to_award), 0)

return {
  available_points: parseFloat(account.available_points),
  pending_points: totalPending, // ← 从消费记录汇总
  total_earned: parseFloat(account.total_earned),
  total_consumed: parseFloat(account.total_consumed),
  pending_records: pendingConsumptions.map(c => ({
    record_id: c.record_id,
    consumption_amount: parseFloat(c.consumption_amount),
    points_to_award: parseFloat(c.points_to_award),
    merchant_notes: c.merchant_notes || '',
    created_at: BeijingTimeHelper.formatForAPI(c.created_at),
    status_text: '审核中',
    estimated_arrival: calculateETA(c.created_at) // 动态计算预计到账时间
  })),
  message:
    totalPending > 0
      ? `您有${totalPending}积分正在审核中，审核通过后将自动到账`
      : '当前无待审核积分'
}
```

### 阶段四：删除 pending points 相关代码（✅ 已拍板：马上移除，不兼容不过渡）

**移除调用**：

- `ConsumptionService.submitConsumption()` 中的 `PointsService.createPendingPointsForConsumption()` 调用
- `ConsumptionService.approveConsumption()` 中的 `PointsService.activatePendingPoints()` 调用
- `ConsumptionService` 中的 `PointsService` 导入

**删除方法**（从 `services/PointsService.js` 中移除）：

- `createPendingPointsForConsumption()` 方法（L469-518）
- `activatePendingPoints()` 方法（L531-643）

**验证无遗漏引用**：

```bash
grep -r "createPendingPointsForConsumption\|activatePendingPoints" --include="*.js" services/ routes/
# 预期结果：无匹配（或仅注释/文档中出现）
```

**长期清理**：

- 待其他业务完全迁移至 AssetService 后，删除整个 `PointsService.js`
- 删除 `models/UserPointsAccount.js` 和 `models/PointsTransaction.js`
- 更新 `models/index.js` 移除旧模型导出

### 阶段五：验证

**功能测试**：

- 商家提交消费记录 → 仅创建 `consumption_record`（无 pending 积分交易）
- 管理员审核通过 → 直接发放积分（`AssetService.changeBalance`）
- 管理员审核拒绝 → 仅更新消费记录状态
- 用户查询积分余额 → 能看到 `pending_points` 字段

**数据一致性检查**：

```bash
node scripts/verify-asset-domain.js
```

**确认无新增 pending 积分交易**：

```sql
SELECT COUNT(*) FROM points_transactions
WHERE status = 'pending'
  AND business_type = 'consumption_reward'
  AND created_at > '2025-12-30';  -- 方案C上线后的日期
-- 预期结果：0
```

---

## 四、关键决策记录

**决策时间**：2025-12-30  
**决策人**：项目负责人  
**最终方案**：✅ 方案C（重构 ConsumptionService 工作流）

**核心决策**：

1. **业务语义**：消费奖励审核流程本质是"审核通过后才发奖"，不是"先发放再冻结"
2. **用户体验**：用户可看到待审核积分（从 consumption_records.pending 汇总）
3. **单一真相源**：审核状态由 consumption_records 管理，避免双表同步脏数据
4. **现状验证**：当前库已存在 18 条"消费已 rejected 但积分仍 pending"的脏数据，证明双写同步不可靠

**实施细节决策（✅ 已拍板）**：

| 决策项                     | 最终方案                                                                      |
| -------------------------- | ----------------------------------------------------------------------------- |
| **待审核积分展示接口**     | `/points/balance` 返回数字摘要；`/points/overview` 返回明细列表               |
| **数据清理范围**           | rejected+expired 直接 cancel；approved 先对账再处理                           |
| **幂等键命名规则**         | `<business_type>:<action>:<entity_id>`（如 `consumption_reward:approve:123`） |
| **PointsService 处理策略** | 马上移除 pending 相关方法，不兼容不过渡                                       |

**待审核积分数据源**：

- **真相源**：`SUM(consumption_records.points_to_award WHERE status='pending')`
- **高频接口**：`/api/v4/shop/points/balance` 返回 `pending_points` + `pending_count`
- **详情接口**：`/api/v4/shop/points/overview` 返回 `pending_records` 明细列表

---

## 五、风险评估

| 风险项                    | 影响等级 | 缓解措施                                             |
| ------------------------- | -------- | ---------------------------------------------------- |
| 历史 pending 积分交易遗留 | 中       | 数据清理脚本分类处理（rejected/expired/approved）    |
| approved 消费未发放积分   | 中       | 对账后人工补发，记录审计日志                         |
| 用户展示口径变化          | 低       | 从 pending 积分交易改为 pending 消费汇总，数据更准确 |
| 业务中断                  | 低       | 仅修改 ConsumptionService，不涉及数据库结构变更      |
| 遗漏引用                  | 低       | 全量 grep 检查                                       |

---

## 六、执行检查清单

- [ ] **阶段一：数据清理**
  - [ ] 统计现有 pending 积分交易与消费记录的对齐情况（按 rejected/expired/approved 分类）
  - [ ] 清理 rejected + expired：直接标记为 cancelled
  - [ ] 对账 approved：检查是否已通过 AssetService 发放
    - [ ] 已发放：终结旧 pending 交易
    - [ ] 未发放：记录到日志，人工补发
  - [ ] 验证清理结果

- [ ] **阶段二：修改 ConsumptionService**
  - [ ] 移除商家提交时的 `PointsService.createPendingPointsForConsumption()` 调用（L304-315）
  - [ ] 修改审核通过逻辑：改用 `AssetService.changeBalance()` 直接发放积分（L429-451）
  - [ ] 使用幂等键规则：`consumption_reward:approve:${recordId}`
  - [ ] 验证审核拒绝逻辑：确认不涉及积分处理（当前已正确）
  - [ ] 移除 PointsService 导入

- [ ] **阶段三：后端提供待审核积分汇总**
  - [ ] 修改 `/points/balance` 接口：在 `getBalanceResponse()` 中增加 `pending_points` 和 `pending_count`
  - [ ] 修改 `/points/overview` 接口：改为从 `consumption_records.pending` 查询明细
  - [ ] API 测试验证

- [ ] **阶段四：删除 pending points 相关代码**
  - [ ] 确认 ConsumptionService 已完全迁移
  - [ ] 全量 grep 检查无其他业务依赖
  - [ ] 删除 `createPendingPointsForConsumption()` 方法（L469-518）
  - [ ] 删除 `activatePendingPoints()` 方法（L531-643）
  - [ ] 删除相关注释和文档引用

- [ ] **阶段五：验证**
  - [ ] 功能测试：商家提交 → 审核通过/拒绝 → 用户查询待审核积分
  - [ ] 数据一致性检查：`consumption_records.pending` 与展示对齐
  - [ ] 确认无新增 pending 积分交易（`created_at > '2025-12-30'`）
  - [ ] 验证脚本：`node scripts/verify-asset-domain.js`

---

## 七、资产域统一架构遗留工作（2025-12-30 验证）

**验证时间**：2025-12-30
**验证结论**：`资产域标准架构-破坏性重构方案.md` 文档声称的"破坏性重构"仅完成约 60%，新旧系统处于共存状态。

### 7.1 验证结果汇总

| 验证项                  | 文档声称                           | 实际状态        | 结论       |
| ----------------------- | ---------------------------------- | --------------- | ---------- |
| 新数据库表              | 需创建 6 张表                      | ✅ 全部存在     | 完成       |
| AssetService 冻结三件套 | freeze/unfreeze/settleFromFrozen   | ✅ 完整实现     | 完成       |
| MerchantReviewService   | 商家审核服务                       | ✅ 已创建       | 完成       |
| 定时任务                | hourly-alert-timeout-reviews.js 等 | ✅ 已创建       | 完成       |
| 新路由                  | /assets/_, /merchant/_             | ✅ 已创建       | 完成       |
| **旧数据库表**          | **需删除**                         | ⚠️ **仍存在**   | **未完成** |
| **旧模型文件**          | **需删除**                         | ⚠️ **仍存在**   | **未完成** |
| **PointsService**       | **需删除**                         | ⚠️ **仍被引用** | **未完成** |

### 7.2 待删除的旧数据库表

| 表名                   | 当前状态  | 说明                                            |
| ---------------------- | --------- | ----------------------------------------------- |
| `user_points_accounts` | ⚠️ 仍存在 | 旧积分账户表，应迁移至 `account_asset_balances` |
| `points_transactions`  | ⚠️ 仍存在 | 旧积分流水表，应迁移至 `asset_transactions`     |

**删除前提**：

1. 确认所有业务已迁移至新 AssetService
2. 确认历史数据已同步/归档
3. 确认无其他模型/服务依赖

### 7.3 待删除的旧代码文件

| 文件                          | 当前状态  | 活跃引用数                              |
| ----------------------------- | --------- | --------------------------------------- |
| `models/UserPointsAccount.js` | ⚠️ 仍存在 | 被 models/index.js 和 AssetService 引用 |
| `models/PointsTransaction.js` | ⚠️ 仍存在 | 被 models/index.js 引用                 |
| `services/PointsService.js`   | ⚠️ 仍存在 | 被 5+ 文件活跃引用                      |

### 7.4 PointsService 仍被引用的文件清单

```
services/index.js                    # 模块导出
services/ConsumptionService.js       # 消费奖励工作流（本文档核心）
routes/v4/shop/points/balance.js     # 积分余额接口
routes/v4/shop/points/index.js       # 积分路由入口
routes/v4/shop/points/statistics.js  # 积分统计接口
routes/v4/shop/points/admin.js       # 积分管理接口
routes/v4/shop/points/transactions.js # 积分流水接口
tests/business/points/service.test.js # 积分服务测试
scripts/test/test-pending-activation.js # 测试脚本
```

### 7.5 AssetService 内部遗留引用

**问题**：`services/AssetService.js` 的 `getAssetPortfolio()` 方法（第 1068-1086 行）仍引用旧模型 `UserPointsAccount` 获取积分余额。

```javascript
// 当前代码（第 1071-1086 行）
const { UserPointsAccount, ItemInstance, MaterialAssetType } = require('../models')

// 1. 获取积分余额
const pointsAccount = await UserPointsAccount.findOne({
  where: { user_id },
  transaction
})

const points = pointsAccount
  ? {
      available: Number(pointsAccount.available_points),
      total_earned: Number(pointsAccount.history_total_points || 0),
      total_consumed: Number(pointsAccount.consumed_total_points || 0)
    }
  : { available: 0, total_earned: 0, total_consumed: 0 }
```

**修复方案**：改用 `AccountAssetBalance` 查询 `asset_code='POINTS'` 的记录。

### 7.6 遗留工作执行清单

- [ ] **阶段六：彻底删除旧积分系统**

  **6.1 修改 AssetService.getAssetPortfolio()**
  - [ ] 将 `UserPointsAccount` 引用改为 `AccountAssetBalance` 查询
  - [ ] 移除 `UserPointsAccount` 导入

  **6.2 迁移积分路由至新资产接口**
  - [ ] `routes/v4/shop/points/balance.js` → 改用 AssetService.getBalance()
  - [ ] `routes/v4/shop/points/statistics.js` → 改用 AssetService.getTransactions() 统计
  - [ ] `routes/v4/shop/points/transactions.js` → 改用 AssetService.getTransactions()
  - [ ] `routes/v4/shop/points/admin.js` → 改用 AssetService.changeBalance()
  - [ ] 或直接废弃 `/shop/points/*` 路由，统一使用 `/assets/*` 路由

  **6.3 删除旧服务和模型**
  - [ ] 删除 `services/PointsService.js`
  - [ ] 删除 `models/UserPointsAccount.js`
  - [ ] 删除 `models/PointsTransaction.js`
  - [ ] 更新 `models/index.js` 移除旧模型导出
  - [ ] 更新 `services/index.js` 移除 PointsService 导出

  **6.4 删除旧数据库表（需数据迁移确认）**
  - [ ] 确认 `user_points_accounts` 数据已同步至 `account_asset_balances`
  - [ ] 确认 `points_transactions` 数据已同步/归档至 `asset_transactions`
  - [ ] 执行删除：
    ```sql
    DROP TABLE IF EXISTS points_transactions;
    DROP TABLE IF EXISTS user_points_accounts;
    ```

  **6.5 验证删除完成**
  - [ ] 全量 grep 检查无 PointsService 引用
    ```bash
    grep -r "PointsService\|UserPointsAccount\|PointsTransaction" \
      --include="*.js" services/ routes/ models/ \
      | grep -v node_modules | grep -v ".test.js"
    ```
  - [ ] 启动应用无报错
  - [ ] 积分相关功能测试通过

---

## 八、数据状态验证（2025-12-30）

### 当前数据库状态

| 数据项                  | 数量 | 说明                                               |
| ----------------------- | ---- | -------------------------------------------------- |
| 冻结余额记录            | 0 条 | `account_asset_balances.frozen_amount > 0`         |
| locked 物品             | 0 条 | `item_instances.status='locked'`                   |
| 冻结相关流水            | 0 条 | `asset_transactions.business_type LIKE '%freeze%'` |
| merchant_points_reviews | 0 条 | 商家审核表（已创建但无数据）                       |

**注**：文档中提到的 "user_id=31 冻结余额 3648" 和 "6条locked物品" 在当前数据库中已不存在，可能已被清理。

### 新旧表数据对比待确认

```sql
-- 检查旧表数据是否已同步
SELECT
  (SELECT COUNT(*) FROM user_points_accounts) as old_accounts,
  (SELECT COUNT(*) FROM accounts WHERE account_type='user') as new_accounts,
  (SELECT SUM(available_points) FROM user_points_accounts) as old_points_total,
  (SELECT SUM(available_amount) FROM account_asset_balances WHERE asset_code='POINTS') as new_points_total;

-- 检查是否有用户在旧表有数据但新表没有
SELECT upa.user_id, upa.available_points
FROM user_points_accounts upa
LEFT JOIN accounts a ON a.user_id = upa.user_id AND a.account_type='user'
LEFT JOIN account_asset_balances aab ON aab.account_id = a.account_id AND aab.asset_code='POINTS'
WHERE a.account_id IS NULL OR aab.balance_id IS NULL;
```
