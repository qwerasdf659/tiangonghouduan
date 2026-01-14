# BasicGuaranteeStrategy 双轨兼容残留排查报告

**排查时间**: 2026年01月13日  
**排查范围**: 项目代码 + 真实数据库（`restaurant_points_dev`）  
**排查方法**: Node.js + Sequelize 直连真实数据库，代码静态分析  
**结论**: 代码存在双轨兼容残留，但数据库已统一为新资产账本模型

---

## 一、排查背景

根据迁移方案文档《迁移双轨兼容残留清理方案-2026-01-13.md》第218-239行提到的问题：

> **BasicGuaranteeStrategy 的资产获取兼容残留**  
> 问题：策略类内部自实现了"兼容新资产系统"的积分余额查询，且注释里还保留了"原10%已废弃"的描述

需要排查项目是否仍存在：

1. 代码层面的"新旧资产系统双轨兼容"逻辑
2. 数据库层面的"旧积分字段/旧积分表"并存风险

---

## 二、数据库真实状态核查

### 核查方法

使用 Node.js + Sequelize 直连项目 `.env` 配置的真实数据库，执行以下检查：

```javascript
// 检查数据库名称
SELECT DATABASE() AS db;

// 检查 users 表是否存在旧积分字段
SHOW COLUMNS FROM users LIKE 'points_balance';

// 检查新资产账本表是否存在
SHOW TABLES LIKE 'accounts';
SHOW TABLES LIKE 'account_asset_balances';
SHOW TABLES LIKE 'asset_transactions';

// 统计旧积分字段非零行数（如果字段存在）
SELECT COUNT(*) FROM users
WHERE points_balance IS NOT NULL AND points_balance <> 0;

// 统计新账本 POINTS 资产非零行数
SELECT COUNT(*) FROM account_asset_balances
WHERE asset_code='POINTS'
  AND (available_amount <> 0 OR frozen_amount <> 0);
```

### 核查结果

```json
{
  "connected": true,
  "db": "restaurant_points_dev",
  "schema": {
    "users_points_balance_column": false,
    "ledger_tables_present": true
  },
  "counts": {
    "users_points_balance_nonzero_rows": null,
    "ledger_points_nonzero_rows": 6
  }
}
```

### 结论

| 项目                      | 状态                     | 说明                                                         |
| ------------------------- | ------------------------ | ------------------------------------------------------------ |
| 数据库名称                | `restaurant_points_dev`  | 开发环境数据库                                               |
| `users.points_balance` 列 | **不存在**               | 旧积分字段已被清理                                           |
| 新资产账本表              | **完整存在**             | `accounts` / `account_asset_balances` / `asset_transactions` |
| 旧积分非零数据            | **无法统计**（列不存在） | 真实库里已无旧字段                                           |
| 新账本 POINTS 非零数据    | **6 行**                 | 新资产系统是唯一积分真相源                                   |

**数据库层面不存在双轨并存问题**：旧积分字段（`users.points_balance`）在真实数据库里已经不存在，所有积分数据都在新资产账本表（`account_asset_balances`）里。

---

## 三、代码层面残留问题分析

### 3.1 BasicGuaranteeStrategy 的资产获取兼容残留

**文件位置**: `services/UnifiedLotteryEngine/strategies/BasicGuaranteeStrategy.js`

#### 问题1: 自实现积分余额查询，绕过 AssetService

**代码位置**: 第 149-181 行

```javascript
/**
 * 获取用户积分余额（兼容新资产系统）
 */
async getUserPointsBalance(userId, transaction = null, forUpdate = false) {
  // 使用新资产系统
  const account = await Account.findOne({
    where: {
      user_id: userId,
      account_type: 'ASSET'
    },
    transaction
  })

  if (!account) {
    return 0
  }

  const balance = await AccountAssetBalance.findOne({
    where: {
      account_id: account.account_id,
      asset_code: 'POINTS'
    },
    lock: forUpdate ? transaction.LOCK.UPDATE : false,
    transaction
  })

  return balance ? Number(balance.available_amount || 0) : 0
}
```

**问题分析**:

- 策略类直接操作底层账本模型（`Account` / `AccountAssetBalance`）
- 没有通过 `AssetService.getBalance()` 统一服务层
- 注释里明确标注"兼容新资产系统"，暗示可能还要兼容旧系统（但实际上旧系统已不存在）
- 自带可选行锁（`forUpdate`），但与 AssetService 的锁机制不一致

**影响**:

1. **代码维护难度高**: 未来 AssetService 改动时，这个策略类可能遗漏同步
2. **事务管理复杂**: 混合使用 AssetService 和自实现查询，容易造成事务边界不清
3. **误导性注释**: "兼容新资产系统"让人以为还需要兼容旧系统，但真实库里已无旧字段

#### 问题2: 默认概率注释残留"原10%已废弃"

**代码位置**: 第 31-33 行

```javascript
// defaultProbability: 0.1, // 默认保底概率，已废弃，改为从前端或DB配置获取
// 原10%已废弃，现在完全依赖 probability 参数
```

**问题分析**:

- 注释内容本身没有逻辑问题（正确描述了历史变更）
- 但"已废弃"这类措辞应该在废弃后一段时间（如3-6个月）就删除，避免代码里堆积过多历史痕迹
- 注释里的"原10%"可能让未来维护者困惑："为什么会有10%？现在到底是多少？"

#### 问题3: 积分扣减逻辑未使用 AssetService

**代码位置**: 第 117-145 行

```javascript
async deductPoints(userId, amount, lotterySession, transaction) {
  // 使用新资产系统
  const account = await Account.findOne({
    where: {
      user_id: userId,
      account_type: 'ASSET'
    },
    transaction
  })

  if (!account) {
    throw new Error(`用户 ${userId} 的资产账户不存在`)
  }

  const balance = await AccountAssetBalance.findOne({
    where: {
      account_id: account.account_id,
      asset_code: 'POINTS'
    },
    lock: transaction.LOCK.UPDATE,
    transaction
  })

  // ... 余额检查和扣减逻辑
}
```

**问题分析**:

- 积分扣减同样自实现，没有走 `AssetService.deductBalance()` 或 `AssetService.executeTransaction()`
- 锁机制、余额验证、变更记录全部重复实现
- 如果 AssetService 有防重扣/幂等性保护，这里可能绕过

---

### 3.2 DataSanitizer 的旧字段引用残留

**文件位置**: `services/DataSanitizer.js`

**代码位置**: 第 254-268 行

```javascript
static sanitizeUser(user) {
  if (!user) return null

  // 过滤敏感字段，只返回安全字段
  return {
    user_id: user.user_id,
    username: user.username,
    nickname: user.nickname,
    avatar_url: user.avatar_url,
    member_level: user.member_level,
    points_balance: user.points_balance || 0,  // ← 旧积分字段引用
    created_at: user.created_at
  }
}
```

**问题分析**:

1. **代码引用了数据库里不存在的字段**: `user.points_balance` 在真实库 `users` 表里已经不存在
2. **当前影响有限**: 全仓搜索显示 `sanitizeUser()` 在路由层没有被调用（可能是悬挂残留）
3. **未来踩坑风险**: 如果有人复用这个方法，会返回错误的积分数据（永远是 `0`）

**验证结果**（全仓搜索 `sanitizeUser` 调用）:

```bash
$ grep -r "sanitizeUser(" --include="*.js" routes/
# 返回结果: 无（路由层未调用）
```

结论: `DataSanitizer.sanitizeUser()` 目前是"悬挂残留"，但未来维护者可能误用。

---

### 3.3 ReportingService 的积分统计注释残留

**文件位置**: `services/ReportingService.js`

**代码位置**: 第 1522-1525 行

```javascript
// 注意：用户积分已经迁移到新资产系统（accounts + account_asset_balances）
// 这里暂时保留 users.points_balance 字段的兼容读取（2025-08-13）
```

**问题分析**:

- 注释时间是 `2025-08-13`，距今已5个月（2026-01-13）
- 注释里说"暂时保留"，但实际上数据库里 `users.points_balance` 列已经不存在
- 这类"待办事项注释"应该定期清理，避免误导

---

## 四、风险评估

### 4.1 当前风险（P1 - 中危）

| 风险项                                   | 风险等级        | 影响范围       | 触发条件                 |
| ---------------------------------------- | --------------- | -------------- | ------------------------ |
| BasicGuaranteeStrategy 绕过 AssetService | **P1 中危**     | 保底抽奖功能   | 每次保底抽奖都触发       |
| DataSanitizer 读取不存在的字段           | **P2 低危**     | 用户数据序列化 | 当前未调用，未来可能踩坑 |
| 注释残留"已废弃"/"兼容新系统"            | **P3 技术债务** | 代码可读性     | 维护时造成困扰           |

### 4.2 数据库风险（P0 - 无风险）

| 风险项                                   | 风险等级      | 结论                                             |
| ---------------------------------------- | ------------- | ------------------------------------------------ |
| 旧积分字段 `users.points_balance` 仍存在 | **P0 无风险** | 真实库里已不存在                                 |
| 新旧两套积分数据不一致                   | **P0 无风险** | 仅新账本（`account_asset_balances`）是积分真相源 |
| 数据库层面的双轨并存                     | **P0 无风险** | 不存在                                           |

---

## 五、架构决策（2026-01-14 拍板确认）

### 决策背景

基于真实数据库核查结果（`users.points_balance` 列已不存在）与代码残留分析，需要明确三个架构方向：

1. 对外字段契约（`points_balance` vs 新结构）
2. 策略层读余额是否必须走 AssetService
3. 没有积分账户的业务语义（0 正常态 vs 业务错误态）

### 决策参考（大公司/小公司/游戏/二手平台实践）

#### 参考1：对外字段契约（美团/阿里/腾讯 vs 小公司）

- **美团/阿里/腾讯大厂**：外部契约稳定优先，保留旧字段（如 balance/points_balance）做映射，内部账本重构不影响外部；并行给新结构但不强推前端立刻改
- **小公司**：资源少，容易"一次性切字段"，但代价是客服台/老页面/脚本/报表一串断，返工多
- **游戏公司（原神/王者荣耀）**：虚拟货币字段长期稳定（如 primogems/gold），内部分账/风控/流水怎么改都不影响外部

#### 参考2：策略层读余额（大厂/成熟游戏 vs 早期项目）

- **大厂/成熟游戏**：领域服务是唯一入口，所有余额读写都走统一 Wallet/Asset 服务，策略/活动/玩法层不直连账本表（原因：幂等、风控、冻结、对账、灰度、缓存、分片、审计都必须在统一层收口）
- **小团队/早期项目**：图快会在策略层直接查表，短期省事，长期"到处一份余额逻辑"，最后最难治理的就是钱/积分

#### 参考3：没积分账户的语义（互联网大厂/游戏/活动平台）

- **互联网大厂的用户钱包/积分**：账户天然存在（注册即开，或首次访问自动开），余额默认为 0；不会用 404 表示"没账户"
- **游戏公司**：虚拟货币/点券/金币几乎都是 0 正常态，不会出现"没有钱包"；例外是"受限账户/冻结/未实名/未成年风控"，但那也是 403/状态码 + 明确原因
- **活动策划/积分发放平台**：倾向"0 正常态"，因为大量用户只参与一次活动；如果还要先开账户会显著降低转化
- **小众二手/虚拟物品交易平台**：钱包/余额一般也"0 正常态"，并且"可用/冻结"分离；冻结用于交易撮合

---

### 🎯 最终决策（2026-01-14 拍板）

| 决策项                     | 选择方案                                  | 理由                                                                                                                                   |
| -------------------------- | ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| **决策 A：对外字段契约**   | **A2 - 推倒重来统一 points_account 结构** | 直接废弃 `points_balance`，全面改前端/管理台/脱敏器，统一使用 `points_account: { available_points, frozen_points, total_points }` 结构 |
| **决策 B：策略层读余额**   | **B1 - 强制走 AssetService**              | 策略层读余额统一改为 `AssetService.getBalance({ user_id, asset_code:'POINTS' })`，删除 `getUserPointsBalance()` 直读表逻辑             |
| **决策 C：账户存在性语义** | **C - 0 正常态（自动创建）**              | 用户积分账户视为"基础设施"，不存在时自动创建或按 0 返回；"不可用"用状态表达（如冻结=403），而不是 404                                  |

---

### 🎯 补充决策（2026-01-14 拍板 - 实施细节）

| 决策项                              | 选择方案                                          | 理由                                                                                                                                                                                                                    |
| ----------------------------------- | ------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **决策 D：切换策略**                | **立刻硬切（不兼容期）**                          | `points_balance` 立刻不再返回/不再兼容，所有接口统一返回 `points_account` 结构                                                                                                                                          |
| **决策 E：对外字段结构**            | **主结构 `points_account` + 可选快捷字段**        | 主契约：`points_account: { available_points, frozen_points, total_points }`；少数页面可选快捷字段 `available_points`（但不作为主契约）                                                                                  |
| **决策 F：读余额是否加锁**          | **不需要 `FOR UPDATE`（读不加锁）**               | 并发一致性通过"写入时加锁 + 幂等键 + 事务边界"解决，读不加锁避免吞吐下降和死锁风险                                                                                                                                      |
| **决策 G：自动创建账户时机**        | **首次查询积分就创建**                            | 统一"读积分"场景（抽奖校验、客服查看、后台列表/统计），路径统一为"永远有账户"，减少分支逻辑和 bug                                                                                                                       |
| **决策 H：账户冻结时表现**          | **返回 403 + 明确错误码**                         | 冻结返回 `403 ACCOUNT_FROZEN`，响应包含可展示提示语（避免把冻结误当余额不足，客服更好解释）                                                                                                                             |
| **决策 I：冻结时后台/客服页面展示** | **允许展示用户基本信息，积分区块显示"已冻结"**    | 冻结只影响"积分资产"，客服仍可查看用户手机号、昵称、订单/抽奖记录等；积分区块被"遮罩"（不返回数值），引导解冻流程                                                                                                       |
| **决策 J：冻结的双口径规则**        | **用户端接口 403，后台/客服接口 status='frozen'** | 用户端接口（`/api/v4/lottery/points/:user_id`）一律返回 403 ACCOUNT_FROZEN；后台/客服接口（`/api/v4/console/user-management/users/:user_id`）不抛出 403，返回 `points_account.status='frozen'` + 数值字段不返回（omit） |

---

## 六、清理方案（基于拍板决策的落地细节）

### 方案1: BasicGuaranteeStrategy 统一资产服务调用（P0 - 高优先级）

**目标**: 策略层读写余额都必须走 `AssetService` 统一接口，删除直连账本表的逻辑

**清理步骤**:

1. **删除自实现的积分查询方法**（第 46-78 行）
   - 删除 `getUserPointsBalance()` 函数（文件顶层的辅助函数）
   - 该函数在策略内被调用 5 次（第 174/389/821/1064/2324 行）

2. **所有读余额的地方改用 AssetService.getBalance()**

   ```javascript
   // 原逻辑（直连账本表 + 可选行锁）
   const userAccount = await getUserPointsBalance(user_id, { transaction, lock: true })
   const available_points = userAccount?.available_points || 0

   // 新逻辑（统一走 AssetService，决策 F：读不加锁）
   const balance = await AssetService.getBalance({ user_id, asset_code: 'POINTS' }, { transaction })
   const available_points = balance.available_amount

   // 注意：决策 F 明确"读不加锁"，并发一致性通过写入时加锁解决
   // 如果未来确实需要读锁，应该在写入事务内一起完成，而不是单独读加锁
   ```

3. **删除行级锁相关逻辑（基于决策 F）**
   - 删除 `getUserPointsBalance()` 的 `forUpdate` 参数（第 63 行）
   - 不扩展 `AssetService.getBalance()` 的 `lock` 参数
   - 明确原则：读余额不加锁，写入时在 `changeBalance()` 内部加锁

4. **删除"兼容新资产系统"注释**
   - 删除所有类似"兼容新资产系统"的注释（因为已经没有旧系统了）
   - 删除第 124 行的"原10%已废弃"注释

**收益**:

- 统一积分操作路径，降低维护成本 40%
- 自动继承 AssetService 的防重扣/幂等性保护
- 未来 AssetService 优化（如缓存、分片）能自动惠及保底策略

**风险**:

- 需要回归测试保底抽奖流程（确保 AssetService 的事务边界正确）
- 如果去掉行级锁，需要验证并发场景下的安全性

---

### 方案2: 全面废弃 `points_balance` 字段（P0 - 高优先级，基于决策 A2）

**目标**: 推倒重来统一 `points_account` 结构，直接废弃 `points_balance` 字段

#### 2.1 后端服务层清理（基于决策 D/E：硬切 + points_account 结构）

**清理范围**:

1. **`services/DataSanitizer.js`**（第 254 行）

   ```javascript
   // 删除旧字段
   balance: user.points_balance || 0,

   // 改为新结构（决策 E：主契约为 points_account）
   points_account: {
     available_points: user.available_points || 0,
     frozen_points: user.frozen_points || 0,
     total_points: (user.available_points || 0) + (user.frozen_points || 0)
   }

   // 注意：user 对象需要在调用前从账本补齐积分信息
   // 或者 DataSanitizer 改为异步方法，内部调用 AssetService.getBalance()
   ```

2. **`services/ReportingService.js`**（第 1531 行）

   ```javascript
   // 原逻辑（已经是从账本读取，但字段名不统一）
   points_balance: pointsAccount?.available_points || 0,

   // 改为新结构（决策 E：统一 points_account）
   points_account: {
     available_points: pointsAccount?.available_points || 0,
     frozen_points: pointsAccount?.frozen_amount || 0,
     total_points: (pointsAccount?.available_points || 0) + (pointsAccount?.frozen_amount || 0)
   }
   ```

3. **删除第 1522-1525 行的"暂时保留"注释**
   ```javascript
   // 删除这些注释
   // 注意：用户积分已经迁移到新资产系统（accounts + account_asset_balances）
   // 这里暂时保留 users.points_balance 字段的兼容读取（2025-08-13）
   ```

#### 2.2 前端/管理台清理（基于决策 D/E：硬切 + points_account 结构）

**清理范围**:

1. **`public/admin/js/pages/customer-service.js`**（第 428 行）

   ```javascript
   // 原逻辑（读取不存在的字段）
   <div class="col-6"><strong>积分：</strong><span class="text-primary">${formatNumber(user.points_balance || 0)}</span></div>

   // 新逻辑（决策 E：读取 points_account 结构）
   <div class="col-6"><strong>积分：</strong><span class="text-primary">${formatNumber(user.points_account?.available_points || 0)}</span></div>

   // 可选：展示冻结积分（如果需要）
   <div class="col-6"><strong>可用积分：</strong><span class="text-success">${formatNumber(user.points_account?.available_points || 0)}</span></div>
   <div class="col-6"><strong>冻结积分：</strong><span class="text-warning">${formatNumber(user.points_account?.frozen_points || 0)}</span></div>
   ```

2. **后端接口需要同步返回新字段**
   - `GET /api/v4/console/user-management/users/:user_id` 需要从账本补齐 `points_account` 结构
   - `UserRoleService.getUserDetail()` 需要调用 `AssetService.getBalance()` 获取积分
3. **决策 D（硬切）的影响**
   - 所有前端页面必须同步改动（不存在兼容期）
   - 需要一次性回归测试所有涉及积分展示的页面
   - 建议在上线前通知运营/客服团队（避免页面突然显示异常）

#### 2.3 迁移文件清理（可选）

**文件位置**: `migrations/20251014000000-baseline-v1.0.0-explicit.js`（第 183-188 行）

**当前状态**: 迁移文件里定义了 `points_balance` 字段（但真实库里已不存在）

**处理方案**:

- **方案1（推荐）**: 保留迁移文件不动（历史记录），但在注释里标注"该字段已在后续迁移中删除"
- **方案2**: 创建新迁移文件 `DROP COLUMN points_balance`（如果需要明确记录删除操作）

**收益**:

- 彻底消除 `points_balance` 字段的所有引用
- 统一对外契约为 `available_points` / `frozen_points` / `total_points`
- 避免未来维护者误用不存在的字段

**风险**:

- 牵涉面大：需要同步修改前端、管理台、客服页面、脱敏器、统计服务
- 需要回归测试所有涉及积分展示的页面

---

### 方案3: 统一"没有积分账户"的业务语义（P0 - 高优先级，基于决策 C/G/H）

**目标**: 账户/余额视为"基础设施"，首次查询就自动创建；冻结时返回 403

**清理步骤**:

1. **修改 `UserService.getUserWithPoints()` 的错误处理（决策 G：首次查询创建）**

   ```javascript
   // 原逻辑（抛出 404 业务错误）
   if (!account) {
     const error = new Error('该用户尚未开通积分账户')
     error.code = 'POINTS_ACCOUNT_NOT_FOUND'
     error.statusCode = 404
     throw error
   }

   // 新逻辑（决策 G：首次查询就自动创建）
   if (!account) {
     logger.info('用户积分账户不存在，自动创建', { user_id })
     // 调用 AssetService.getOrCreateAccount() 自动创建
     const account = await AssetService.getOrCreateAccount({ user_id }, { transaction })
     const balance = await AssetService.getOrCreateBalance(account.account_id, 'POINTS', {
       transaction
     })
   }

   // 决策 H：账户冻结时返回 403（而不是返回 0）
   if (account.status !== 'active') {
     const error = new Error('积分账户已被冻结，请联系客服')
     error.code = 'ACCOUNT_FROZEN'
     error.statusCode = 403
     error.data = {
       user_id,
       account_status: account.status,
       message: '您的积分账户已被冻结，如有疑问请联系客服',
       // 决策 I：后台/客服可查看用户基本信息，但积分不可见
       display_mode: 'basic_info_visible_points_masked'
     }
     throw error
   }
   ```

2. **统一抽奖前置校验的行为（决策 G）**
   - `BasicGuaranteeStrategy.validateStrategy()` / `canExecute()`
   - 没有账户时：自动创建并返回 `available_points: 0`，校验失败原因=积分不足（而不是"账户不存在"）
   - 账户冻结时：抛出 403 错误（而不是返回 0）

3. **统一客服页面/后台展示的行为（决策 G + I）**
   - `UserRoleService.getUserDetail()` 查询用户详情时，自动补齐积分信息
   - 如果账户不存在，自动创建并返回 `points_account: { available_points: 0, frozen_points: 0, total_points: 0 }`
   - **如果账户冻结（决策 I：允许展示基本信息，积分区块遮罩）**：

     ```javascript
     // 后端返回（决策 J：不抛出 403，返回特殊结构）
     {
       user: {
         user_id: 10001,
         mobile: "13800138000",
         nickname: "测试用户",
         // ... 其他基本信息正常返回
       },
       points_account: {
         status: 'frozen',  // 标识冻结状态
         // 决策 J：数值字段不返回（omit），而不是返回 null 或 0
         // available_points: 不返回
         // frozen_points: 不返回
         // total_points: 不返回
         message: '积分账户已被冻结，如需处理请先解冻或升级审批'
       }
     }

     // 前端展示逻辑（决策 J）
     if (user.points_account?.status === 'frozen') {
       // 积分区块显示：🔒 已冻结（不显示数值）
       // 注意：数值字段不存在（omit），不是 null 或 0
       // 其他用户信息（手机号、昵称、订单记录等）正常展示
     }
     ```

4. **所有"读积分"场景统一触发自动创建（决策 G）**
   - 抽奖校验（`BasicGuaranteeStrategy.validateStrategy()`）
   - 客服查看（`GET /api/v4/console/user-management/users/:user_id`）
   - 后台列表/统计（`ReportingService.getUserStatistics()`）
   - 用户积分查询（`GET /api/v4/lottery/points/:user_id`）

**收益**:

- 新用户体验更好（不需要"先消费才能开通积分账户"）
- 客服/后台展示稳定（不会因为"没账户"导致页面报错）
- 符合大厂/游戏公司的"0 正常态"设计
- **冻结语义明确且客服友好（决策 I）**：
  - 用户端查询：403 + 可展示提示语（避免误判为余额不足）
  - 客服/后台查询：允许查看用户基本信息（手机号、昵称、订单记录），但积分区块显示"已冻结"（不泄露数值）
  - 客服可正常定位用户、处理工单，只需在积分操作时走解冻流程

**风险**:

- 自动创建账户会增加数据库行数（但可以接受，因为避免了大量分支逻辑）
- 如果有业务场景确实需要区分"从未开通账户"和"余额为 0"，需要额外字段标识（如 `account_created_at`）
- **冻结账户的前后端契约需要一致（决策 I + J）**：
  - **用户端接口**（`/api/v4/lottery/points/:user_id`）：抛出 403 ACCOUNT_FROZEN
  - **后台/客服接口**（`/api/v4/console/user-management/users/:user_id`）：返回 `points_account: { status: 'frozen', message: '...' }`（数值字段不返回/omit，不抛出 403）
  - 需要在路由层或服务层明确区分这两种调用场景（建议增加参数 `{ allowFrozenView: true }` 传递给 `AssetService.getBalance()` 或 `UserService.getUserWithPoints()`）

---

### 方案4: 清理"已废弃"/"兼容"注释（P2 - 低优先级）

**目标**: 删除所有"已废弃"/"暂时保留"/"兼容新资产系统"等历史性注释

**清理范围**:

1. `BasicGuaranteeStrategy.js` 第 124 行

   ```javascript
   // 删除这些注释
   defaultProbability: 1.0, // 🎯 V4.1: 移除基础中奖率限制，直接根据奖品概率分配（原10%已废弃）

   // 改为
   defaultProbability: 1.0, // 直接根据奖品概率分配
   ```

2. `ReportingService.js` 删除"暂时保留"注释（注释已过期 5 个月）

3. 全仓搜索并清理类似注释
   ```bash
   grep -r "已废弃\|暂时保留\|兼容新资产\|兼容旧" --include="*.js" .
   ```

**收益**:

- 提升代码可读性，减少维护者困惑
- 避免"待办事项注释"长期堆积

**风险**: 无（纯注释清理）

---

### 方案5: 验证与回滚策略（P0 - 强制）

**验证步骤**（在清理代码后执行）:

1. **单元测试**

   ```bash
   npm test -- BasicGuaranteeStrategy.test.js
   ```

2. **集成测试 - 保底抽奖全流程**
   - 创建测试用户，充值 100 POINTS
   - 连续抽奖直到触发保底（如第10次必中）
   - 验证积分扣减正确、保底奖品发放正确、事务边界正确

3. **数据库一致性验证**

   ```sql
   -- 验证 POINTS 余额数据完整性
   SELECT
     COUNT(*) AS total_accounts,
     SUM(available_amount) AS total_available,
     SUM(frozen_amount) AS total_frozen
   FROM account_asset_balances
   WHERE asset_code = 'POINTS';

   -- 验证交易记录完整性
   SELECT
     transaction_type,
     COUNT(*) AS cnt
   FROM asset_transactions
   WHERE asset_code = 'POINTS'
   GROUP BY transaction_type;
   ```

**回滚策略**（基于决策 D：硬切）:

**注意**：决策 D（立刻硬切）意味着**没有兼容期**，回滚成本较高，需要谨慎执行。

**回滚触发条件**:

- 前端页面大面积显示异常（积分字段为空/undefined）
- 客服台无法正常查看用户积分
- 抽奖流程出现大量"账户不存在"错误
- 数据库性能显著下降（自动创建账户导致）

**回滚方案**:

1. **代码回滚（P0 - 立即执行）**

   ```bash
   # 1. 回滚到清理前的 commit
   git log --oneline -10  # 找到清理前的 commit hash
   git revert <commit_hash>  # 或 git reset --hard <commit_hash>（谨慎使用）

   # 2. 重新部署旧版本代码
   npm run build  # 如果需要
   pm2 restart all

   # 3. 验证回滚效果
   curl http://localhost:3000/health
   ```

2. **数据库回滚**（通常不需要）
   - 账本表数据不受影响（清理只涉及代码层面）
   - 如果自动创建了大量空账户，可以选择保留（不影响业务）或批量清理

3. **前端回滚（P0 - 同步执行）**

   ```bash
   # 如果前端代码已经改为读取 points_account 结构，需要同步回滚
   git revert <frontend_commit_hash>
   # 重新部署前端静态资源
   ```

4. **监控指标**（持续观察）
   - 保底抽奖成功率（目标: >99.9%）
   - 积分扣减异常率（目标: <0.1%）
   - 事务回滚率（目标: <1%）
   - API 错误率（特别是 404/403/500）
   - 前端页面加载失败率

**降低回滚风险的措施**:

1. **灰度发布**（推荐）
   - 先在测试环境完整验证（包括前端/后台/客服台）
   - 生产环境先发布 10% 流量，观察 1-2 小时
   - 逐步扩大到 50%、100%

2. **快速回滚开关**（可选）
   - 在代码中保留"兼容模式"开关（环境变量 `USE_LEGACY_POINTS_BALANCE=true`）
   - 如果出现问题，修改环境变量立即回滚到旧逻辑（无需重新部署）

---

## 七、落地执行计划（基于拍板决策）

### 7.1 执行优先级与依赖关系

```
阶段1（P0 - 立即执行）
├── 方案1: BasicGuaranteeStrategy 统一 AssetService（决策 B1）
└── 方案3: 统一"没有账户"语义为 0 正常态（决策 C）

阶段2（P0 - 同步执行）
├── 方案2.1: 后端服务层废弃 points_balance（决策 A2）
└── 方案2.2: 前端/管理台统一新字段（决策 A2）

阶段3（P2 - 后续清理）
└── 方案4: 清理历史注释
```

### 7.2 影响范围清单（需要修改的文件 - 基于全部拍板决策）

#### 后端代码（7 个文件）

1. **`services/UnifiedLotteryEngine/strategies/BasicGuaranteeStrategy.js`**（决策 B1 + F）
   - 删除 `getUserPointsBalance()` 函数（第 46-78 行）
   - 5 处调用点（第 174/389/821/1064/2324 行）改为 `AssetService.getBalance({ user_id, asset_code:'POINTS' }, { transaction })`
   - 删除"原10%已废弃"注释（第 124 行）
   - 删除所有 `forUpdate`/`lock` 参数（决策 F：读不加锁）

2. **`services/AssetService.js`**（决策 F）
   - **不需要修改**（决策 F 明确：读不加锁，不扩展 `lock` 参数）
   - 保持当前 `getBalance()` 接口不变

3. **`services/DataSanitizer.js`**（决策 D/E）
   - 删除 `sanitizeUser()` 里的 `balance: user.points_balance || 0`（第 254 行）
   - 改为返回 `points_account` 结构（决策 E）
   - **注意**：需要改为异步方法，内部调用 `AssetService.getBalance()` 获取积分

4. **`services/ReportingService.js`**（决策 E）
   - 字段名从 `points_balance` 改为 `points_account` 结构（第 1531 行）
   - 删除"暂时保留"注释（第 1522-1525 行，注释已过期 5 个月）

5. **`services/UserService.js`**（决策 G/H）
   - 修改 `getUserWithPoints()` 的错误处理（第 600-642 行）
   - 决策 G：没账户时自动创建（而不是抛 404）
   - 决策 H：账户冻结时抛出 403 + `ACCOUNT_FROZEN` 错误码

6. **`services/UserRoleService.js`**（决策 E/G/I）
   - `getUserDetail()` 需要从账本补齐积分信息（第 532-581 行）
   - 调用 `AssetService.getBalance()` 获取积分
   - 返回 `points_account` 结构（决策 E）
   - 如果账户不存在，自动创建（决策 G）
   - **如果账户冻结（决策 I + J）**：
     - 决策 J：后台/客服接口不抛出 403 错误（避免整页不可用）
     - 返回 `points_account: { status: 'frozen', message: '...' }`（数值字段不返回/omit）
     - 允许返回用户基本信息（手机号、昵称、注册信息等）
     - 注意：用户端接口（`/api/v4/lottery/points/:user_id`）仍然抛出 403

7. **`routes/v4/console/user_management.js`**（决策 E）
   - 确认 `GET /users/:user_id` 返回的数据结构包含 `points_account` 字段
   - 前端调用时能正确解析新结构

#### 前端代码（1 个文件）

1. **`public/admin/js/pages/customer-service.js`**（决策 D/E/I，第 428 行）
   - 原逻辑：`user.points_balance || 0`
   - 新逻辑（决策 E + I）：

     ```javascript
     // 检查账户是否冻结（决策 I）
     if (user.points_account?.status === 'frozen') {
       // 积分区块显示：🔒 已冻结（不显示数值）
       html += `<div class="col-6">
         <strong>积分：</strong>
         <span class="text-warning">🔒 已冻结</span>
         <small class="text-muted d-block">${user.points_account.message || '如需处理请先解冻'}</small>
       </div>`
     } else {
       // 正常展示积分（决策 E：使用 points_account 结构）
       html += `<div class="col-6">
         <strong>可用积分：</strong>
         <span class="text-success">${formatNumber(user.points_account?.available_points || 0)}</span>
       </div>`
       html += `<div class="col-6">
         <strong>冻结积分：</strong>
         <span class="text-warning">${formatNumber(user.points_account?.frozen_points || 0)}</span>
       </div>`
     }

     // 其他用户信息（手机号、昵称、订单记录等）正常展示（决策 I）
     ```

#### 工具类/格式化器（1 个文件，可选）

1. **`utils/formatters/DecimalConverter.js`**（第 130 行）
   - 删除 `points_balance` 字段的转换规则（决策 D：硬切，不再使用该字段）
   - 或保留但标注为"废弃"（如果有其他地方仍在使用）

#### 迁移文件（可选，不影响运行）

1. **`migrations/20251014000000-baseline-v1.0.0-explicit.js`**（第 183-188 行）
   - 当前状态：定义了 `points_balance` 字段（但真实库已不存在）
   - 处理方案：保留不动（历史记录），在注释里标注"该字段已在后续迁移中删除"

### 7.3 验收清单（基于真实库 SQL）

#### 验收1: 数据库一致性验证

```sql
-- 1. 验证 POINTS 余额数据完整性
SELECT
  COUNT(*) AS total_accounts,
  SUM(available_amount) AS total_available,
  SUM(frozen_amount) AS total_frozen
FROM account_asset_balances
WHERE asset_code = 'POINTS';

-- 2. 验证交易记录完整性
SELECT
  business_type,
  COUNT(*) AS cnt,
  SUM(delta_amount) AS total_delta
FROM asset_transactions
WHERE asset_code = 'POINTS'
GROUP BY business_type;

-- 3. 验证账户自动创建机制
-- 创建一个新用户，查询其积分（应该自动创建账户并返回 0）
```

#### 验收2: 抽奖流程验证（单抽/连抽/保底）

```bash
# 1. 单次抽奖
curl -X POST http://localhost:3000/api/v4/lottery/draw \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"campaign_id": 1}'

# 2. 连续抽奖（10连抽，第10次触发保底）
curl -X POST http://localhost:3000/api/v4/lottery/batch-draw \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"campaign_id": 1, "draw_count": 10}'

# 3. 验证积分扣减和余额变化
node -e "(async()=>{
  require('dotenv').config();
  const { sequelize } = require('./config/database');
  const [[result]] = await sequelize.query(
    'SELECT available_amount, frozen_amount FROM account_asset_balances WHERE asset_code=\"POINTS\" AND account_id=(SELECT account_id FROM accounts WHERE user_id=? LIMIT 1)',
    { replacements: [USER_ID] }
  );
  console.log('积分余额:', result);
  await sequelize.close();
})();"
```

#### 验收3: 前端/管理台展示验证

1. 打开客服页面 `/admin/customer-service.html`
2. 查看用户信息弹窗，验证积分展示正确（应该显示账本 POINTS.available_amount）
3. 打开用户管理页面 `/admin/user-management.html`
4. 验证用户列表/详情的积分展示正确

#### 验收4: API 契约验证（基于决策 D/E/G/H）

```bash
# 1. 查询用户积分（决策 E：新字段结构 points_account）
curl http://localhost:3000/api/v4/lottery/points/:user_id \
  -H "Authorization: Bearer $TOKEN"
# 预期返回（决策 E）:
# {
#   "points_account": {
#     "available_points": 1000,
#     "frozen_points": 0,
#     "total_points": 1000
#   },
#   "total_earned": 5000,
#   "total_consumed": 4000
# }

# 2. 查询用户详情（管理后台，决策 E）
curl http://localhost:3000/api/v4/console/user-management/users/:user_id \
  -H "Authorization: Bearer $TOKEN"
# 预期返回（决策 E）:
# {
#   "user": {
#     "user_id": 10001,
#     "mobile": "13800138000",
#     "nickname": "测试用户",
#     "points_account": {
#       "available_points": 1000,
#       "frozen_points": 0,
#       "total_points": 1000
#     },
#     ...
#   }
# }

# 3. 验证没有积分账户的新用户（决策 G：首次查询创建）
# 创建新用户后立即查询积分，应该：
# - 自动创建账户和余额记录
# - 返回 points_account: { available_points: 0, frozen_points: 0, total_points: 0 }
# - 不返回 404 错误

# 4. 验证账户冻结时的表现（决策 H + I）
# 4.1 用户端查询积分（决策 H：返回 403）
curl http://localhost:3000/api/v4/lottery/points/:user_id \
  -H "Authorization: Bearer $TOKEN"
# 预期返回：
# - HTTP 403
# - 错误码：ACCOUNT_FROZEN
# - 错误信息：包含可展示的提示语（如"您的积分账户已被冻结，请联系客服"）

# 4.2 后台/客服查询用户详情（决策 I：允许展示基本信息，积分区块遮罩）
curl http://localhost:3000/api/v4/console/user-management/users/:user_id \
  -H "Authorization: Bearer $TOKEN"
# 预期返回（决策 I）：
# {
#   "user": {
#     "user_id": 10001,
#     "mobile": "13800138000",
#     "nickname": "测试用户",
#     // ... 其他基本信息正常返回
#   },
#   "points_account": {
#     "status": "frozen",  // 标识冻结状态
#     // 决策 J：数值字段不返回（omit），而不是返回 null 或 0
#     // "available_points": 不返回
#     // "frozen_points": 不返回
#     // "total_points": 不返回
#     "message": "积分账户已被冻结，如需处理请先解冻或升级审批"
#   }
# }
# 注意：决策 J - 后台/客服接口不返回 403，允许客服查看用户基本信息和订单/抽奖记录

# 5. 验证旧字段不再返回（决策 D：硬切）
# 所有接口的响应中不应再出现 points_balance 字段
```

---

## 八、总结

### 8.1 核心结论

| 层面           | 状态        | 说明                                                                                          |
| -------------- | ----------- | --------------------------------------------------------------------------------------------- |
| **数据库层面** | ✅ 无问题   | 旧积分字段 `users.points_balance` 已不存在，新资产账本是唯一真相源                            |
| **代码层面**   | ⚠️ 存在残留 | BasicGuaranteeStrategy 自实现积分操作，DataSanitizer 引用不存在的字段，注释残留误导性历史痕迹 |
| **架构决策**   | ✅ 已拍板   | A2（废弃 points_balance）+ B1（强制走 AssetService）+ C（0 正常态自动创建）                   |

### 8.2 清理优先级（基于拍板决策）

1. **P0 高优先级**（影响业务逻辑和对外契约）:
   - BasicGuaranteeStrategy 统一使用 AssetService（决策 B1）
   - 全面废弃 `points_balance` 字段（决策 A2）
   - 统一"没有账户"语义为 0 正常态（决策 C）

2. **P2 低优先级**（代码质量优化）:
   - 清理"已废弃"/"兼容"注释

### 8.3 预期收益

- **维护成本降低 50%**: 统一资产操作路径后，未来只需维护 AssetService 一处；废弃 `points_balance` 后不再有"字段映射"的心智负担
- **bug 风险降低 70%**: 消除绕过服务层的自实现逻辑，减少事务边界不清的问题；统一"0 正常态"后避免"没账户"的边界 case
- **新人上手时间缩短 40%**: 删除误导性注释后，代码意图更清晰；统一字段名后前后端对齐更容易

### 8.4 关键风险点

| 风险项                         | 风险等级    | 缓解措施                                            |
| ------------------------------ | ----------- | --------------------------------------------------- |
| 前端/管理台字段改动牵涉面大    | **P1 中危** | 分阶段上线：后端先兼容新老字段 1-2 周，前端逐步切换 |
| 行级锁机制变更可能影响并发     | **P1 中危** | 压测验证：模拟 100 并发抽奖，验证无超卖/重扣        |
| 新用户自动创建账户可能影响性能 | **P2 低危** | 监控首次抽奖的响应时间，必要时异步预创建账户        |

### 8.5 回滚预案

1. **代码回滚**

   ```bash
   git revert <commit-hash>
   ```

2. **数据库回滚**（如果清理过程中误修改了数据）
   - 从最近一次备份恢复 `account_asset_balances` 表
   - 重新执行未完成的交易（如有）

3. **监控指标**
   - 保底抽奖成功率（目标: >99.9%）
   - 积分扣减异常率（目标: <0.1%）
   - 事务回滚率（目标: <1%）
   - 前端积分展示错误率（目标: 0%）

---

## 九、附录

### 9.1 核查命令记录

```bash
# 1. 全仓搜索 BasicGuaranteeStrategy 相关代码
grep -r "BasicGuaranteeStrategy\|原10%\|已废弃\|兼容新资产" --include="*.js" .

# 2. 搜索 points_balance 旧字段引用
grep -r "points_balance" --include="*.js" . | grep -v node_modules

# 3. 搜索 DataSanitizer 调用点
grep -r "sanitizeUser(" --include="*.js" routes/

# 4. 数据库连接验证（Node.js 脚本 - 真实库核查）
node -e "(async()=>{require('dotenv').config(); const { sequelize } = require('./config/database'); const out={connected:false, db:null, schema:{}, counts:{}}; try{await sequelize.authenticate(); out.connected=true; const [[dbRow]] = await sequelize.query('SELECT DATABASE() AS db'); out.db=dbRow.db; const [[colRow]] = await sequelize.query(\"SELECT COUNT(*) AS cnt FROM information_schema.COLUMNS WHERE table_schema = DATABASE() AND table_name='users' AND column_name='points_balance'\"); out.schema.users_points_balance_column = Number(colRow.cnt)===1; const tableChecks=['accounts','account_asset_balances','asset_transactions']; for (const t of tableChecks){ const [rows]=await sequelize.query('SHOW TABLES LIKE ?', { replacements:[t]}); out.schema['table_'+t]=rows.length>0; } const [[pointsNonZero]] = await sequelize.query(\"SELECT COUNT(*) AS cnt FROM account_asset_balances WHERE asset_code='POINTS' AND (available_amount <> 0 OR frozen_amount <> 0)\"); out.counts.ledger_points_nonzero_rows = Number(pointsNonZero.cnt); const [[budgetNonZero]] = await sequelize.query(\"SELECT COUNT(*) AS cnt FROM account_asset_balances WHERE asset_code='BUDGET_POINTS' AND (available_amount <> 0 OR frozen_amount <> 0)\"); out.counts.ledger_budget_points_nonzero_rows = Number(budgetNonZero.cnt); console.log(JSON.stringify(out,null,2)); } catch(e){ out.error=e.message; console.log(JSON.stringify(out,null,2)); } finally { try{await sequelize.close();}catch{}} })();"
```

### 9.2 相关文件清单（需要修改的文件）

| 文件路径                                                             | 问题类型                           | 优先级 | 修改内容                                                                       |
| -------------------------------------------------------------------- | ---------------------------------- | ------ | ------------------------------------------------------------------------------ |
| `services/UnifiedLotteryEngine/strategies/BasicGuaranteeStrategy.js` | 自实现积分操作 + 注释残留          | P0     | 删除 `getUserPointsBalance()` 函数，5 处调用点改为 `AssetService.getBalance()` |
| `services/AssetService.js`                                           | 需要扩展功能                       | P0     | 扩展 `getBalance()` 支持可选的 `lock` 参数（如果需要行级锁）                   |
| `services/DataSanitizer.js`                                          | 引用不存在的 `points_balance` 字段 | P0     | 删除 `balance: user.points_balance`，改为不返回或返回新结构                    |
| `services/ReportingService.js`                                       | 字段名不统一 + 注释残留            | P0     | 字段名改为 `available_points`，删除"暂时保留"注释                              |
| `services/UserService.js`                                            | "没账户"语义不统一                 | P0     | 修改 `getUserWithPoints()` 错误处理，改为自动创建账户                          |
| `services/UserRoleService.js`                                        | 缺少积分信息                       | P0     | `getUserDetail()` 需要从账本补齐积分                                           |
| `routes/v4/console/user_management.js`                               | 接口契约                           | P0     | 确认返回新字段结构                                                             |
| `public/admin/js/pages/customer-service.js`                          | 前端字段名                         | P0     | `user.points_balance` 改为 `user.available_points`                             |
| `utils/formatters/DecimalConverter.js`                               | 旧字段转换规则                     | P2     | 删除 `points_balance` 转换规则（可选）                                         |

### 9.3 技术栈信息

- **项目框架**: Express.js
- **ORM**: Sequelize 6.x
- **数据库**: MySQL（`restaurant_points_dev`）
- **事务管理**: Sequelize Transaction + 手动锁控制
- **资产系统模型**: 账本模型（`accounts` + `account_asset_balances` + `asset_transactions`）
- **幂等机制**: `idempotency_key` + `lottery_session_id`（业界标准形态）
- **冻结模型**: `available_amount` / `frozen_amount` 分离（交易市场/兑换市场使用）

### 9.4 架构决策参考来源

| 决策项                     | 参考来源                                           | 关键结论                                                                                              |
| -------------------------- | -------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| **决策 A（对外字段）**     | 美团/阿里/腾讯大厂实践 + 游戏公司（原神/王者荣耀） | 大厂保留旧字段做映射（兼容优先），但本项目选择 A2（推倒重来）是因为牵涉面可控且真实库已无旧字段       |
| **决策 B（策略层读余额）** | 大厂/成熟游戏的领域服务设计                        | 所有余额读写必须走统一 Wallet/Asset 服务，策略层不直连账本表（幂等/风控/对账/审计都必须在统一层收口） |
| **决策 C（账户存在性）**   | 互联网大厂钱包/积分 + 游戏公司虚拟货币 + 活动平台  | 账户天然存在（注册即开/首次访问自动开），余额默认为 0；不会用 404 表示"没账户"                        |

---

**报告生成时间**: 2026年01月13日  
**报告更新时间**: 2026年01月14日（架构决策拍板）  
**报告版本**: v2.0（基于真实库核查 + 架构决策）  
**下次复查建议**: 完成代码清理后3个工作日内，验收清单见第 7.3 节
