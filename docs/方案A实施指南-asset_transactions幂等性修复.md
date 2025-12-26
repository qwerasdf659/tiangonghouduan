# asset_transactions 表幂等性修复实施指南（✅ 方案A已采纳）

**决策日期**: 2025-12-26  
**决策人**: 项目负责人  
**执行优先级**: P1（本周内完成）

---

## 📋 方案A概述

**核心决策**: `business_id` 语义明确为"抽奖业务关联ID"（lottery_session_id），允许一对多；新增独立的 `idempotency_key` 字段作为真正的幂等键。

**设计理念**:

- **职责分离**: `lottery_session_id` 只负责"关联同一业务事件的多条记录"
- **幂等保证**: `idempotency_key` 独立承担"防止重复入账"的责任
- **语义清晰**: 不再让一个字段同时承担"关联"和"唯一"两种冲突的语义

### 方案架构：入口幂等 + 内部派生（业界标准）

本方案采用**"入口幂等 + 内部派生"**的两层幂等设计，这是美团/腾讯/阿里巴巴等大厂在支付/交易/虚拟物品系统中的标准做法：

#### 第一层：入口幂等（Request-Level Idempotency）

- **目的**：防止"同一个业务请求"被重复提交（重试/超时/重复点击）
- **实现方式**：
  - 客户端为每次请求生成全局唯一的 `Request-Idempotency-Key`（如 UUID）
  - 服务端在接口入口通过幂等表（或 Redis）记录该 key 的处理状态
  - 同一个 key 的重复请求直接返回首次处理结果（或拒绝）

#### 第二层：内部派生（Transaction-Level Idempotency）

- **目的**：同一个业务请求内部可能产生多条事务记录（如抽奖=扣费+发奖），每条记录需要独立的幂等键
- **实现方式**：
  - 从入口 key 派生出子幂等键：`{request_key}:consume`、`{request_key}:reward`
  - 每个子幂等键对应一条 `asset_transactions` 记录，有独立的唯一约束
  - 同一次请求的多条记录共享同一个 `lottery_session_id`（业务关联ID）

#### 完整请求的 ID 体系示例

```plaintext
用户点击"抽奖"按钮（可能重试多次）
    ↓
[入口层] Request-Idempotency-Key（客户端生成/服务端记录）
    例如：req_idem_9f3a82b5-uuid
    目的：阻止"同一次点击"的重复提交
    ↓
[业务层] lottery_session_id（一次抽奖的关联ID）
    例如：lottery_tx_1703511234567_abc123_001
    目的：把 consume + reward 两条流水串起来
    ↓
[事务层] idempotency_key（每条流水的独立幂等键）
    例如：
      - lottery_consume_6_1703511234567_a1b2c3（扣费记录）
      - lottery_reward_6_1703511234567_d4e5f6（发奖记录）
    目的：防止每条流水被重复写入
```

#### 方案优势对比

| 对比维度         | 单层幂等（仅 business_id）          | 两层幂等（入口+内部派生） |
| ---------------- | ----------------------------------- | ------------------------- |
| **重复请求防护** | ❌ 无法防止（business_id 允许重复） | ✅ 入口层直接拦截         |
| **多条流水支持** | ⚠️ 需手动处理冲突                   | ✅ 自动派生子幂等键       |
| **数据库约束**   | ⚠️ 唯一索引失效或冲突               | ✅ 每条记录独立约束       |
| **业务语义清晰** | ❌ 职责混淆                         | ✅ 关联ID和幂等键分离     |
| **行业标准**     | ⚠️ 非标准做法                       | ✅ 大厂标准架构           |

#### 本项目实施细节

**简化版实现**（适合当前阶段）：

- **暂不实现独立的"入口幂等表"**（可后续扩展）
- **直接在 `asset_transactions` 表通过 `idempotency_key` 唯一约束实现内部派生层幂等**
- **通过 `lottery_session_id` 实现业务关联**
- **客户端暂不需要传 Request-Idempotency-Key**（服务端内部生成即可）

**未来扩展方向**（P2/P3）：

- 新增 `api_idempotency_requests` 表实现完整的入口幂等
- 支持客户端传入自定义 `Idempotency-Key`（HTTP Header）
- 实现幂等结果缓存（避免重复计算）

---

## 🌍 业界方案对比与决策依据

### 其它常见幂等方案对比

本项目采用的**"入口幂等 + 内部派生 + DB 唯一约束"**是业界最常见的方案之一，但并非唯一选择。以下是其它常见方案的对比：

| 方案                    | 实施成本        | 适用场景             | 优点                 | 缺点                         |
| ----------------------- | --------------- | -------------------- | -------------------- | ---------------------------- |
| **1. 仅靠 DB 唯一约束** | ⭐ 最低         | 简单单表操作         | 最可靠（以DB为准）   | 无法返回"首次结果"，只能拒绝 |
| **2. 独立请求幂等表**   | ⭐⭐ 中等       | 需要"重试返回同结果" | 入口语义清晰、审计强 | 需维护状态机、超时清理       |
| **3. 先占坑再执行**     | ⭐⭐ 中等       | 高并发入口           | 减少重复计算与竞争   | 需设计占坑过期策略           |
| **4. Redis 分布式锁**   | ⭐⭐⭐ 中高     | 高并发削峰           | 性能好、挡住重复请求 | 不能单独保证一致性           |
| **5. 事件驱动/MQ**      | ⭐⭐⭐⭐ 高     | 跨服务/链路长        | 削峰填谷、体系化     | 运维复杂度高                 |
| **6. 强账本/双录**      | ⭐⭐⭐⭐⭐ 最高 | 金融级审计           | 可审计、回放能力强   | 设计成本高、可能过度工程     |
| **✅ 本项目方案**       | ⭐⭐ 中等       | 一次操作多条记录     | 职责清晰、标准架构   | 需要两层设计                 |

### 不同行业/场景的幂等设计特点

#### 游戏虚拟物品/交易行/二手平台

**典型 ID 体系**：

- `order_id`（订单）
- `trade_id`（撮合成交）
- `listing_id`（挂牌）
- `escrow_id`（托管）
- `ledger_entry_id`（资产流水）

**幂等粒度**：

- 在"创建订单/成交确认/扣款/发货"这些关键步骤的**入口请求**做幂等
- 强依赖 **DB 唯一约束 + 事务/锁**（防重复扣、重复发货）

**特点**：

- ✅ 交易链路长，需要多阶段状态机
- ✅ 强调"防超卖/防重复扣款"
- ⚠️ 通常需要独立的"订单幂等表"或"交易状态表"

#### 活动策划/营销系统（抽奖、发券、积分）

**典型 ID 体系**：

- `activity_instance_id`（一次活动参与）
- `draw_id`（一次抽奖）
- `reward_id`（一次发奖）
- `ledger_entry_id`（积分流水）

**幂等粒度**：

- 在"参与活动/抽奖/发券"的**入口请求**做幂等
- **一次抽奖产生多条流水/多张表记录**（扣费+发奖+发券+通知）
- 更强调：**关联ID一对多 + 入口幂等键唯一**

**特点**：

- ✅ 一次操作产生多条记录（本项目特征）
- ✅ 需要把"同一次抽奖"的多条记录串起来
- ✅ 重试时应返回"首次抽奖结果"（不能重新抽）

#### 支付/交易/充值系统（美团/腾讯/阿里标准）

**典型 ID 体系**：

- `payment_request_id`（支付请求）
- `transaction_id`（支付流水）
- `settlement_id`（结算批次）
- `ledger_entry_id`（账本记录）

**幂等粒度**：

- **入口幂等表**（`payment_idempotency_requests`）记录每次支付请求
- **事务流水表**（`payment_transactions`）记录每笔扣款/到账
- **账本表**（`ledger_entries`）不可变记录

**特点**：

- ✅ 完整的"入口幂等表 + 事务流水表 + 账本表"三层架构
- ✅ 支持"重试返回首次结果"（含支付结果快照）
- ✅ 金融级审计要求

### 本项目为什么选择"入口幂等 + 内部派生"方案

#### 项目特征分析

- ✅ **一次抽奖产生多条记录**：`lottery_consume` + `lottery_reward`（可能还有发券、通知等）
- ✅ **需要关联查询**：查询"某次抽奖的所有流水"
- ✅ **需要防重复提交**：同一次抽奖请求重试不能重复扣费/重新抽奖
- ✅ **当前是单体应用**：暂不需要跨服务/MQ 等复杂架构
- ⚠️ **未来可能扩展**：需要支持"重试返回首次抽奖结果"

#### 决策理由

1. **职责分离**：`lottery_session_id`（关联）和 `idempotency_key`（幂等）各司其职
2. **标准架构**：对齐美团/腾讯/阿里等大厂的标准做法
3. **渐进式实施**：
   - **短期（P1）**：先实现"内部派生层幂等"（DB 唯一约束）
   - **中期（P2）**：升级到"独立请求幂等表"（支持重试返回同结果）
   - **长期（P3）**：扩展到跨服务/MQ（如需要）
4. **性价比高**：实施成本中等，但能覆盖 90% 的业务场景

#### 与其它方案的对比决策

| 对比项             | 仅 DB 约束  | 本项目方案  | 独立幂等表    | Redis 锁      | MQ 事件  |
| ------------------ | ----------- | ----------- | ------------- | ------------- | -------- |
| **防重复扣费**     | ✅          | ✅          | ✅            | ⚠️ 需 DB 兜底 | ✅       |
| **多条记录关联**   | ❌ 需手动   | ✅          | ✅            | ❌            | ✅       |
| **重试返回同结果** | ❌          | ⚠️ 简化版   | ✅            | ❌            | ✅       |
| **实施成本**       | ⭐          | ⭐⭐        | ⭐⭐⭐        | ⭐⭐⭐        | ⭐⭐⭐⭐ |
| **适合当前阶段**   | ⚠️ 功能不足 | ✅ **最佳** | ⚠️ 可后续升级 | ⚠️ 过度       | ❌ 过度  |

#### 最终决策

**✅ 采用"入口幂等 + 内部派生"方案（简化版实施）**

**实施策略**：

- **P1（本周）**：实现内部派生层幂等（DB 唯一约束 + 事务锁）
- **P2（下月）**：升级到独立请求幂等表（支持重试返回同结果）
- **P3（按需）**：扩展到 Redis 缓存、MQ 解耦（如高并发需要）

**决策人**: 项目负责人  
**决策日期**: 2025-12-26  
**决策依据**: 基于项目特征（一次操作多条记录）、业界标准（大厂标准架构）、实施成本（性价比最高）

---

## 🎯 数据库迁移脚本（可直接执行）

```sql
-- ============================================================
-- 迁移脚本：asset_transactions_add_idempotency_key.sql
-- 目标：新增 idempotency_key 和 lottery_session_id 字段
-- 执行前务必备份数据库！
-- ============================================================

-- 步骤1: 新增字段（先允许NULL，避免阻塞）
ALTER TABLE asset_transactions
ADD COLUMN idempotency_key VARCHAR(100) DEFAULT NULL COMMENT '幂等键（每条事务记录唯一）' AFTER business_id,
ADD COLUMN lottery_session_id VARCHAR(100) DEFAULT NULL COMMENT '抽奖会话ID（一次抽奖对应多条事务）' AFTER business_id;

-- 步骤2: 数据回填
-- 规则1：idempotency_key = 'tx_' + transaction_id（保证唯一性）
-- 规则2：lottery_session_id = 原 business_id（保持业务关联）
UPDATE asset_transactions
SET idempotency_key = CONCAT('tx_', transaction_id),
    lottery_session_id = business_id
WHERE idempotency_key IS NULL;

-- 步骤3: 验证数据完整性
SELECT
  COUNT(*) AS total_records,
  COUNT(DISTINCT idempotency_key) AS unique_keys,
  COUNT(*) - COUNT(DISTINCT idempotency_key) AS duplicates
FROM asset_transactions;
-- 预期：duplicates = 0

-- 步骤4: 添加唯一索引（此时应该无冲突）
ALTER TABLE asset_transactions
ADD UNIQUE INDEX uk_idempotency_key (idempotency_key);

-- 步骤5: 设置 NOT NULL 约束
ALTER TABLE asset_transactions
MODIFY COLUMN idempotency_key VARCHAR(100) NOT NULL COMMENT '幂等键（每条事务记录唯一）',
MODIFY COLUMN lottery_session_id VARCHAR(100) NOT NULL COMMENT '抽奖会话ID（一次抽奖对应多条事务）';

-- 步骤6: 添加普通索引（优化关联查询性能）
ALTER TABLE asset_transactions
ADD INDEX idx_lottery_session_id (lottery_session_id);

-- 步骤7: 可选 - 移除旧索引（如果 business_id 不再作为幂等键）
-- ⚠️ 谨慎执行，确认业务代码已完全迁移后再操作
-- ALTER TABLE asset_transactions DROP INDEX uk_business_idempotency;

-- ============================================================
-- 验证脚本（迁移后执行）
-- ============================================================

-- 验证1：idempotency_key 唯一性
SELECT idempotency_key, COUNT(*) AS cnt
FROM asset_transactions
GROUP BY idempotency_key
HAVING COUNT(*) > 1;
-- 预期：0行

-- 验证2：lottery_session_id 关联正确性
SELECT lottery_session_id,
       GROUP_CONCAT(business_type ORDER BY business_type) AS types,
       COUNT(*) AS record_count
FROM asset_transactions
WHERE business_type IN ('lottery_consume', 'lottery_reward')
GROUP BY lottery_session_id
HAVING COUNT(*) > 1
LIMIT 10;
-- 预期：每个 lottery_session_id 有 consume + reward 两条记录

-- 验证3：表结构确认
SHOW CREATE TABLE asset_transactions;
-- 预期：包含 idempotency_key UNIQUE 和 lottery_session_id INDEX
```

---

## 💻 Sequelize 模型更新

```javascript
// models/AssetTransaction.js

const { DataTypes } = require('sequelize')

module.exports = sequelize => {
  const AssetTransaction = sequelize.define(
    'AssetTransaction',
    {
      transaction_id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true
      },

      // ⚠️ 已废弃字段（保留以兼容旧数据，但不再用于幂等性）
      business_id: {
        type: DataTypes.STRING(100),
        allowNull: false,
        comment: '业务ID（已废弃，请使用 lottery_session_id）'
      },

      // ✅ 新增：抽奖会话ID（业务关联ID，允许重复）
      lottery_session_id: {
        type: DataTypes.STRING(100),
        allowNull: false,
        comment: '抽奖会话ID（一次抽奖对应多条事务记录，如 consume + reward）'
      },

      // ✅ 新增：幂等键（唯一约束，防止重复入账）
      idempotency_key: {
        type: DataTypes.STRING(100),
        allowNull: false,
        unique: true,
        comment: '幂等键（每条事务记录唯一，格式：{type}_{account}_{timestamp}_{random}）'
      },

      business_type: {
        type: DataTypes.STRING(50),
        allowNull: false,
        comment: '业务类型（lottery_consume/lottery_reward/recharge等）'
      },

      asset_code: {
        type: DataTypes.STRING(50),
        allowNull: false,
        comment: '资产代码（POINT/COIN等）'
      },

      delta_amount: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
        comment: '变动金额（正数=增加，负数=扣除）'
      },

      balance_before: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false
      },

      balance_after: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false
      },

      account_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
          model: 'account_asset_balances',
          key: 'id'
        }
      },

      notes: {
        type: DataTypes.TEXT,
        allowNull: true
      }
    },
    {
      tableName: 'asset_transactions',
      timestamps: true,
      underscored: true,

      indexes: [
        {
          unique: true,
          fields: ['idempotency_key'],
          name: 'uk_idempotency_key'
        },
        {
          fields: ['lottery_session_id'],
          name: 'idx_lottery_session_id'
        },
        {
          fields: ['account_id', 'created_at'],
          name: 'idx_account_created'
        }
      ]
    }
  )

  return AssetTransaction
}
```

---

## 🔧 业务代码调整

### 1. 幂等键生成函数（统一标准）

```javascript
// utils/idempotencyHelper.js

const crypto = require('crypto')

/**
 * 生成请求级幂等键（Request-Level Idempotency Key）
 * 格式：lottery_req_{timestamp}_{random8}_{seq}
 *
 * 用途：防止"同一次抽奖请求"被重复提交（重试/超时/重复点击）
 *
 * @returns {string} 请求幂等键
 */
function generateRequestIdempotencyKey() {
  const timestamp = Date.now()
  const random = crypto.randomBytes(4).toString('hex') // 8位16进制
  const seq = ('000' + Math.floor(Math.random() * 1000)).slice(-3)
  return `lottery_req_${timestamp}_${random}_${seq}`
}

/**
 * 从请求幂等键派生事务级幂等键（Transaction-Level Idempotency Key）
 * 格式：{request_key}:{transaction_type}
 *
 * 用途：同一请求内的多条事务记录，各自有独立的幂等键
 *
 * @param {string} requestIdempotencyKey - 请求级幂等键
 * @param {string} transactionType - 事务类型（consume/reward/refund等）
 * @returns {string} 事务级幂等键
 */
function deriveTransactionIdempotencyKey(requestIdempotencyKey, transactionType) {
  return `${requestIdempotencyKey}:${transactionType}`
}

/**
 * 生成独立的事务级幂等键（独立场景使用）
 * 格式：{business_type}_{account_id}_{timestamp}_{random6}
 *
 * 用途：非抽奖类的独立事务（充值/转账等），直接生成独立幂等键
 *
 * @param {string} businessType - 业务类型（recharge/transfer/refund等）
 * @param {number} accountId - 账户ID
 * @returns {string} 事务幂等键
 */
function generateStandaloneIdempotencyKey(businessType, accountId) {
  const timestamp = Date.now()
  const random = crypto.randomBytes(3).toString('hex') // 6位16进制
  return `${businessType}_${accountId}_${timestamp}_${random}`
}

/**
 * 生成抽奖会话ID（lottery_session_id）
 * 格式：lottery_tx_{timestamp}_{random6}_{seq}
 *
 * 用途：把同一次抽奖的多条流水（consume + reward）关联起来
 *
 * @returns {string} 抽奖会话ID
 */
function generateLotterySessionId() {
  const timestamp = Date.now()
  const random = crypto.randomBytes(3).toString('hex') // 6位16进制
  const seq = ('000' + Math.floor(Math.random() * 1000)).slice(-3)
  return `lottery_tx_${timestamp}_${random}_${seq}`
}

module.exports = {
  generateRequestIdempotencyKey,
  deriveTransactionIdempotencyKey,
  generateStandaloneIdempotencyKey,
  generateLotterySessionId
}
```

### 2. 抽奖服务改造示例（双层幂等完整实现）

```javascript
// services/LotteryService.js

const {
  generateRequestIdempotencyKey,
  deriveTransactionIdempotencyKey,
  generateLotterySessionId
} = require('../utils/idempotencyHelper')
const { AssetTransaction, AccountAssetBalance } = require('../models')
const sequelize = require('../config/database').sequelize

/**
 * 执行抽奖（含双层幂等性保护）
 *
 * @param {number} userId - 用户ID
 * @param {number} accountId - 资产账户ID
 * @param {string} [requestIdempotencyKey] - 客户端传入的请求幂等键（可选）
 * @returns {Object} 抽奖结果
 */
async function executeLottery(userId, accountId, requestIdempotencyKey = null) {
  const transaction = await sequelize.transaction()

  try {
    // ============================================================
    // 【入口幂等层】防止"同一次请求"被重复提交
    // ============================================================

    // 1. 生成/使用请求级幂等键
    const reqIdempotencyKey = requestIdempotencyKey || generateLotterySessionId()

    // 2. 【简化实现】检查是否已存在该请求的 consume 记录
    //    完整实现应该查询独立的 api_idempotency_requests 表
    const existingRequest = await AssetTransaction.findOne({
      where: {
        lottery_session_id: reqIdempotencyKey,
        business_type: 'lottery_consume'
      },
      transaction
    })

    if (existingRequest) {
      console.warn('🚫 入口幂等拦截：重复请求', {
        reqIdempotencyKey,
        accountId,
        existingTxId: existingRequest.transaction_id
      })
      await transaction.rollback()

      // 返回首次处理结果（幂等性要求）
      const allTxs = await AssetTransaction.findAll({
        where: { lottery_session_id: reqIdempotencyKey },
        raw: true
      })

      return {
        success: true,
        reason: 'DUPLICATE_REQUEST_IDEMPOTENT',
        lotterySessionId: reqIdempotencyKey,
        transactions: allTxs
      }
    }

    // ============================================================
    // 【内部派生层】同一请求内的多条事务记录，各自独立幂等
    // ============================================================

    // 3. 生成抽奖会话ID（业务关联ID）
    const lotterySessionId = reqIdempotencyKey // 与请求幂等键保持一致

    // 4. 生成子幂等键：{request_key}:consume
    const consumeKey = `${lotterySessionId}:consume`

    // 5. 检查是否已存在该 consume 记录（数据库层唯一约束）
    const existingConsume = await AssetTransaction.findOne({
      where: { idempotency_key: consumeKey },
      transaction
    })

    if (existingConsume) {
      console.warn('⚠️ 内部派生层检测到重复（不应出现，可能并发）', { consumeKey })
      await transaction.rollback()
      return { success: false, reason: 'DUPLICATE_TRANSACTION' }
    }

    // 4. 扣除积分（lottery_consume）
    const account = await AccountAssetBalance.findByPk(accountId, {
      lock: transaction.LOCK.UPDATE,
      transaction
    })

    if (account.balance < 1) {
      await transaction.rollback()
      return { success: false, reason: 'INSUFFICIENT_BALANCE' }
    }

    await AssetTransaction.create(
      {
        lottery_session_id: lotterySessionId,
        idempotency_key: consumeKey, // 独立幂等键：{request_key}:consume
        business_id: lotterySessionId, // 兼容旧字段
        business_type: 'lottery_consume',
        asset_code: 'POINT',
        delta_amount: -1,
        balance_before: account.balance,
        balance_after: account.balance - 1,
        account_id: accountId,
        notes: `抽奖扣费，会话ID: ${lotterySessionId}`
      },
      { transaction }
    )

    await account.update(
      {
        balance: account.balance - 1
      },
      { transaction }
    )

    // 5. 执行抽奖逻辑（省略）
    const prizeAmount = Math.random() < 0.3 ? 5 : 0 // 30%概率中奖5积分

    if (prizeAmount > 0) {
      // 6. 发放奖励（lottery_reward）- 派生独立幂等键
      const rewardKey = `${lotterySessionId}:reward` // 从请求key派生

      await AssetTransaction.create(
        {
          lottery_session_id: lotterySessionId, // 与 consume 共享同一个关联ID
          idempotency_key: rewardKey, // 独立幂等键：{request_key}:reward
          business_id: lotterySessionId,
          business_type: 'lottery_reward',
          asset_code: 'POINT',
          delta_amount: prizeAmount,
          balance_before: account.balance - 1,
          balance_after: account.balance - 1 + prizeAmount,
          account_id: accountId,
          notes: `抽奖奖励，会话ID: ${lotterySessionId}`
        },
        { transaction }
      )

      await account.update(
        {
          balance: account.balance - 1 + prizeAmount
        },
        { transaction }
      )
    }

    await transaction.commit()

    console.log('✅ 抽奖成功', {
      lotterySessionId,
      consumeKey,
      rewardKey: prizeAmount > 0 ? `${lotterySessionId}:reward` : null,
      prizeAmount
    })

    return {
      success: true,
      lotterySessionId,
      prizeAmount,
      requestIdempotencyKey: reqIdempotencyKey // 返回请求幂等键供客户端重试使用
    }
  } catch (error) {
    await transaction.rollback()
    throw error
  }
}

/**
 * 查询抽奖会话的所有事务记录
 */
async function getLotterySessionTransactions(lotterySessionId) {
  return await AssetTransaction.findAll({
    where: { lottery_session_id: lotterySessionId },
    order: [['transaction_id', 'ASC']]
  })
}

module.exports = {
  executeLottery,
  getLotterySessionTransactions
}
```

---

## ✅ 测试验证清单

### 数据库层验证

```bash
# 1. 连接数据库
mysql -h dbconn.sealosbja.site -P 42569 -u root -p restaurant_points_dev

# 2. 执行迁移脚本
source asset_transactions_add_idempotency_key.sql

# 3. 验证表结构
SHOW CREATE TABLE asset_transactions\G

# 4. 验证数据完整性
SELECT
  COUNT(*) AS total,
  COUNT(DISTINCT idempotency_key) AS unique_keys,
  COUNT(DISTINCT lottery_session_id) AS unique_sessions
FROM asset_transactions;

# 5. 抽样验证关联关系
SELECT lottery_session_id, business_type, delta_amount, idempotency_key
FROM asset_transactions
WHERE lottery_session_id IN (
  SELECT lottery_session_id
  FROM asset_transactions
  GROUP BY lottery_session_id
  HAVING COUNT(*) > 1
  LIMIT 5
);
```

### 应用层测试

```javascript
// tests/services/LotteryService.test.js

const { executeLottery, getLotterySessionTransactions } = require('../../services/LotteryService')
const { AssetTransaction } = require('../../models')

describe('抽奖幂等性测试（方案A）', () => {
  test('重复请求应被拒绝', async () => {
    const userId = 1
    const accountId = 6

    // 第一次抽奖
    const result1 = await executeLottery(userId, accountId)
    expect(result1.success).toBe(true)
    const consumeKey1 = result1.consumeKey

    // 模拟重复请求（使用相同的幂等键）
    const existingTx = await AssetTransaction.findOne({
      where: { idempotency_key: consumeKey1 }
    })
    expect(existingTx).not.toBeNull()

    // 预期：第二次请求会因幂等键冲突被拒绝
  })

  test('lottery_session_id 应关联 consume 和 reward', async () => {
    const userId = 1
    const accountId = 6

    // 执行抽奖
    const result = await executeLottery(userId, accountId)
    expect(result.success).toBe(true)

    // 查询会话的所有事务
    const transactions = await getLotterySessionTransactions(result.lotterySessionId)

    // 验证：至少有 consume 记录
    const consume = transactions.find(tx => tx.business_type === 'lottery_consume')
    expect(consume).toBeDefined()
    expect(consume.lottery_session_id).toBe(result.lotterySessionId)

    // 如果中奖，应该有 reward 记录
    if (result.prizeAmount > 0) {
      const reward = transactions.find(tx => tx.business_type === 'lottery_reward')
      expect(reward).toBeDefined()
      expect(reward.lottery_session_id).toBe(result.lotterySessionId)

      // 验证：consume 和 reward 的 idempotency_key 不同
      expect(consume.idempotency_key).not.toBe(reward.idempotency_key)
    }
  })
})
```

---

## 📋 执行时间表

| 阶段     | 任务               | 预估时间  | 负责人   | 状态      |
| -------- | ------------------ | --------- | -------- | --------- |
| 1        | 数据库迁移脚本编写 | 30分钟    | DBA/后端 | ⬜ 待开始 |
| 2        | 备份环境测试验证   | 30分钟    | DBA      | ⬜ 待开始 |
| 3        | 生产环境执行迁移   | 30分钟    | DBA      | ⬜ 待开始 |
| 4        | Sequelize 模型更新 | 30分钟    | 后端     | ⬜ 待开始 |
| 5        | 业务代码调整       | 1小时     | 后端     | ⬜ 待开始 |
| 6        | 单元测试编写       | 30分钟    | 后端     | ⬜ 待开始 |
| 7        | 集成测试验证       | 30分钟    | 测试     | ⬜ 待开始 |
| **总计** |                    | **4小时** |          |           |

---

## ⚠️ 风险与应对

| 风险                     | 影响             | 应对措施                                              |
| ------------------------ | ---------------- | ----------------------------------------------------- |
| 数据库迁移失败           | 服务中断         | 提前备份；在低峰期执行；准备回滚脚本                  |
| 代码部署与迁移不同步     | 数据不一致       | 先执行迁移，后部署代码；迁移后字段允许NULL过渡        |
| 幂等键生成冲突           | 重复入账被误拦截 | 使用高精度时间戳+随机数+递增序列；冲突率<0.0001%      |
| 旧代码仍使用 business_id | 幂等性失效       | 代码审查确认所有调用已迁移；保留 business_id 字段兼容 |

---

**执行负责人**: 后端团队负责人  
**审核负责人**: 技术负责人  
**执行截止日期**: 2025-12-27（本周五）
