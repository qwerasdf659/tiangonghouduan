# 接口重复问题诊断报告 - 资产域API

**报告生成时间**: 2026-01-07  
**问题级别**: 🔴 严重（P0）  
**影响范围**: 资产查询接口（余额/流水）  
**数据来源**: 当前代码仓库实际状态 + 真实数据库模型  
**决策状态**: ✅ **所有关键决策已拍板（2026-01-07）**

---

## 🎯 拍板决策快速摘要（2026-01-07）

| 决策项            | 最终选择                                         | 核心理由                                                                |
| ----------------- | ------------------------------------------------ | ----------------------------------------------------------------------- |
| **1. 字段命名**   | ✅ `available_amount/frozen_amount/total_amount` | 与 AssetService.getBalance() 返回一致，全链路统一                       |
| **2. 参数策略**   | ✅ `asset_code` 强制必填，不提供默认值           | 防误查；用户端频繁查 DIAMOND 应在前端固定传参或用 /backpack             |
| **3. 后台域路径** | ✅ 统一后台域（console）+ RBAC 角色              | 从 `/admin` 迁移到 `/console`；语义更准确，符合大厂命名                 |
| **4. 迁移策略**   | ✅ 一次性切换，不设置过渡期，不保留兼容层        | 当前处于架构重构关键期，最佳时机；避免长期维护双路径                    |
| **5. 权限模型**   | ✅ 按能力细分：ops 只读、admin 可写              | `requireRole(['admin', 'ops'])`；查询类接口适合只读角色；符合 RBAC 模型 |

**权限分配明细**:

- **admin 角色**: 可读可写所有 console 接口（包括冻结/解冻/调账等写操作）
- **ops 角色**: 仅可读（portfolio/transactions/balance 等查询类接口）；POST/PUT/DELETE 返回 403
- **普通用户**: 访问 console 接口返回 403

---

## 📋 问题概述

发现 **3 组重复接口**，分别在 `/api/v4/assets/*` 和 `/api/v4/shop/assets/*` 两个域下各实现了一遍，造成：

1. **代码重复**：两套路由文件实现相同功能
2. **口径不一致**：参数默认值、返回字段命名、错误处理存在差异
3. **边界混淆**：调用方不清楚应该用哪个域的接口

| 重复组   | 接口 A（assets 域）             | 接口 B（shop/assets 域）             | 问题         |
| -------- | ------------------------------- | ------------------------------------ | ------------ |
| 余额查询 | GET /api/v4/assets/balance      | GET /api/v4/shop/assets/balance      | 代码几乎相同 |
| 余额列表 | GET /api/v4/assets/balances     | GET /api/v4/shop/assets/balances     | 代码几乎相同 |
| 流水查询 | GET /api/v4/assets/transactions | GET /api/v4/shop/assets/transactions | 功能相同     |

---

## 🔍 问题验证（基于真实代码）

### 1. 路由文件对比

#### `/api/v4/assets/balance` 实现

**文件位置**: `routes/v4/assets/balance.js`

```javascript
// 关键实现
router.get(
  '/balance',
  authenticateToken,
  asyncHandler(async (req, res) => {
    const { asset_code } = req.query
    const user_id = req.user.user_id

    if (!asset_code) {
      return res.apiError('asset_code 是必填参数', 'BAD_REQUEST', null, 400)
    }

    const AssetService = req.app.locals.services.getService('asset')
    const balance = await AssetService.getBalance({ user_id, asset_code })

    return res.apiSuccess({
      asset_code,
      available: Number(balance.available_amount),
      frozen: Number(balance.frozen_amount),
      total: Number(balance.available_amount) + Number(balance.frozen_amount)
    })
  })
)
```

**特点**:

- ✅ `asset_code` 强制必填（缺失返回 400）
- ✅ 返回字段：`available/frozen/total`（简洁命名）
- ✅ 轻量级错误处理（`res.apiError/apiSuccess`）

---

#### `/api/v4/shop/assets/balance` 实现

**文件位置**: `routes/v4/shop/assets/balance.js`

```javascript
// 关键实现
router.get('/balance', authenticateToken, async (req, res) => {
  try {
    const user_id = req.user.user_id
    const asset_code = (req.query.asset_code || 'DIAMOND').toString() // ⚠️ 默认值

    const AssetService = req.app.locals.services.getService('asset')
    const balance = await AssetService.getBalance({ user_id, asset_code })

    return res.apiSuccess(
      {
        asset_code,
        ...balance // ⚠️ 直接展开，字段名可能不同
      },
      '获取资产余额成功'
    )
  } catch (error) {
    logger.error('获取资产余额失败', {
      error: error.message,
      stack: error.stack,
      user_id: req.user?.user_id,
      asset_code: req.query?.asset_code
    })
    return handleServiceError(error, res, '获取资产余额失败')
  }
})
```

**特点**:

- ⚠️ `asset_code` 缺省时默认 `'DIAMOND'`（可能误查）
- ⚠️ 返回字段：直接展开 `balance`（可能包含 `available_amount/frozen_amount/total_amount`）
- ⚠️ 完整的 try-catch + logger + handleServiceError

---

### 2. 核心服务层验证（数据源一致性）

**两套接口都调用同一个服务**：`services/AssetService.js`

```javascript
// AssetService.getBalance() - 真实数据源
static async getBalance (params, options = {}) {
  const { user_id, system_code, asset_code, campaign_id } = params
  const { transaction } = options

  const account = await this.getOrCreateAccount({ user_id, system_code }, { transaction })

  const whereCondition = {
    account_id: account.account_id,
    asset_code
  }

  // BUDGET_POINTS 按活动隔离
  if (asset_code === 'BUDGET_POINTS' && campaign_id) {
    whereCondition.campaign_id = String(campaign_id)
  }

  const balance = await AccountAssetBalance.findOne({
    where: whereCondition,
    transaction
  })

  if (!balance) {
    return {
      available_amount: 0,
      frozen_amount: 0,
      total_amount: 0,
      campaign_id: campaign_id || null
    }
  }

  return {
    available_amount: Number(balance.available_amount),
    frozen_amount: Number(balance.frozen_amount),
    total_amount: Number(balance.available_amount) + Number(balance.frozen_amount),
    campaign_id: balance.campaign_id || null
  }
}
```

**数据库真实表结构**（通过 Sequelize 模型确认）:

- **表名**: `account_asset_balances`
- **主键**: `balance_id`
- **关键字段**:
  - `account_id` (BIGINT) - 账户ID
  - `asset_code` (STRING) - 资产代码（DIAMOND/POINTS/red_shard等）
  - `available_amount` (BIGINT) - 可用余额
  - `frozen_amount` (BIGINT) - 冻结余额
  - `campaign_id` (STRING, nullable) - 活动ID（仅BUDGET_POINTS使用）

**结论**: 两套接口查询的是**同一张表**，数据源完全一致。

---

### 3. 口径差异对比表

| 维度           | `/api/v4/assets/balance` | `/api/v4/shop/assets/balance`                 | 风险等级 |
| -------------- | ------------------------ | --------------------------------------------- | -------- |
| **参数默认值** | 强制必填 `asset_code`    | 缺省时默认 `'DIAMOND'`                        | 🔴 高    |
| **返回字段**   | `available/frozen/total` | `available_amount/frozen_amount/total_amount` | 🟡 中    |
| **错误处理**   | `res.apiError`           | `handleServiceError + logger`                 | 🟢 低    |
| **日志记录**   | 无                       | 完整的 `logger.error` + stack                 | 🟢 低    |
| **消息文案**   | 无                       | `'获取资产余额成功'`                          | 🟢 低    |

**最危险的差异**: **参数默认值不一致**

- 如果前端误调用 `/api/v4/shop/assets/balance` 且未传 `asset_code`，会默认查询 DIAMOND
- 如果前端调用 `/api/v4/assets/balance` 且未传 `asset_code`，会直接返回 400 错误
- 这会导致"同样的调用代码在不同接口下行为完全不同"

---

## 📊 当前使用情况分析

### 路由注册位置

```javascript
// app.js - 路由注册
app.use('/api/v4/assets', require('./routes/v4/assets')) // Line 632
app.use('/api/v4/shop', require('./routes/v4/shop')) // Line 600
```

### 子路由挂载

```javascript
// routes/v4/assets/index.js
const balanceRoutes = require('./balance')
const transactionsRoutes = require('./transactions')
router.use('/', balanceRoutes)
router.use('/', transactionsRoutes)

// routes/v4/shop/assets/index.js
const balanceRoutes = require('./balance')
const transactionsRoutes = require('./transactions')
const portfolioRoutes = require('./portfolio')
const convertRoutes = require('./convert')
const rulesRoutes = require('./rules')
router.use('/', balanceRoutes)
router.use('/', transactionsRoutes)
router.use('/', portfolioRoutes)
router.use('/', convertRoutes)
router.use('/', rulesRoutes)
```

**发现**: `/api/v4/shop/assets/*` 功能更全（包含 portfolio/convert/rules），但基础查询三件套（balance/balances/transactions）与 `/api/v4/assets/*` 重复。

---

## 💡 解决方案对比分析

### 方案 A（✅ 已选定）：确定唯一主域 = `/api/v4/assets/*`

**定位**: `/assets` 作为跨业务域（抽奖/交易/兑换）共用的"资产账本查询能力"

#### 保留接口

- ✅ `/api/v4/assets/balance`
- ✅ `/api/v4/assets/balances`
- ✅ `/api/v4/assets/transactions`

#### 下线接口

- 🚫 `/api/v4/shop/assets/balance`
- 🚫 `/api/v4/shop/assets/balances`
- 🚫 `/api/v4/shop/assets/transactions`

#### shop/assets 保留的接口（商城业务专用）

- ✅ `/api/v4/shop/assets/convert` - 材料转换（用户端功能）
- ✅ `/api/v4/shop/assets/conversion-rules` - 转换规则查询（用户端功能）

#### 需要迁移到 console 域的接口（后台运营能力）

- 🔄 `/api/v4/shop/assets/portfolio` → `/api/v4/console/assets/portfolio` - 资产总览
- 🔄 `/api/v4/shop/assets/portfolio/items` → `/api/v4/console/assets/portfolio/items` - 物品列表
- 🔄 `/api/v4/shop/assets/portfolio/items/:id` → `/api/v4/console/assets/portfolio/items/:id` - 物品详情
- 🔄 `/api/v4/shop/assets/item-events` → `/api/v4/console/assets/item-events` - 物品事件历史

#### 优点

- ✅ 语义清晰：资产基础能力不挂在 shop 子域下
- ✅ 跨域复用：抽奖/交易/兑换都可以直接用 `/assets/*`
- ✅ 边界明确：shop/assets 只保留"后台资产中心特有聚合能力"

#### 迁移步骤（已拍板 - 2026-01-07）

1. **统一返回字段命名**：✅ **已拍板** - 使用 `available_amount/frozen_amount/total_amount`（与 AssetService.getBalance() 一致）
2. **统一参数默认值策略**：✅ **已拍板** - `asset_code` 强制必填，不提供默认值；用户端频繁查 DIAMOND 应在前端固定传参或用 /backpack
3. **后台域路径迁移**：✅ **已拍板** - 统一后台域（console）+ RBAC 角色；从 `/admin` 迁移到 `/console`
4. **迁移策略**：✅ **已拍板** - 一次性切换，不设置过渡期，不保留兼容层
5. **权限模型**：✅ **已拍板** - 按能力细分：ops 只读、admin 可写；`requireRole(['admin', 'ops'])`

---

### 方案 B（❌ 已否决）：确定唯一主域 = `/api/v4/shop/assets/*`

**定位**: 把"资产查询"当作 shop/运营体系的一部分

**否决理由**: 资产作为跨域底座能力，放在 shop 下长期会引起边界混淆

#### 保留接口

- ✅ `/api/v4/shop/assets/balance`
- ✅ `/api/v4/shop/assets/balances`
- ✅ `/api/v4/shop/assets/transactions`
- ✅ `/api/v4/shop/assets/portfolio`
- ✅ `/api/v4/shop/assets/convert`
- ✅ `/api/v4/shop/assets/conversion-rules`

#### 下线接口

- 🚫 `/api/v4/assets/balance`
- 🚫 `/api/v4/assets/balances`
- 🚫 `/api/v4/assets/transactions`

#### 优点

- ✅ shop/assets 目前功能更"全"（portfolio/convert/rules 都在这个域下）
- ✅ 减少迁移工作量（如果现有调用方主要用 shop/assets）

#### 缺点

- ⚠️ 资产作为跨域底座能力，放在 shop 下长期会继续引起边界混淆
- ⚠️ 抽奖/交易也要用资产能力时，路径语义别扭（`/shop/assets` 但不是 shop 业务）

#### 迁移步骤

1. **统一返回字段命名和参数默认值策略**
2. **标记 `/api/v4/assets/*` 的三个接口为废弃**
3. **给出 2~4 周迁移窗口**
4. **迁移期满后删除 `routes/v4/assets/` 目录**

---

### 方案 C（❌ 已否决）：两域都保留，但强制"使用场景不同"

**定位**: 通过权限硬隔离实现"不是重复接口"

**否决理由**: 维护成本高、容易混淆、测试成本高

#### 使用场景区分

- `/api/v4/assets/*`：给内部/服务间/通用调用（更严格、字段更稳定）
- `/api/v4/shop/assets/*`：只给后台/客服/对账（更丰富、可导出/更审计友好）

#### 必需的改造

1. **shop/assets 必须加管理员/运营权限中间件**（否则用户端也能调用，边界形同虚设）
2. **明确文档说明两域的使用场景差异**
3. **返回字段必须完全一致**（避免口径漂移）

#### 缺点

- ⚠️ 维护成本高：两套代码需要同步更新
- ⚠️ 容易混淆：调用方不清楚应该用哪个域
- ⚠️ 测试成本高：需要覆盖两套接口的所有场景

---

## 🎯 最终决策（已拍板）

### ✅ 确定方案：方案 A + 域边界重新划分

**核心决策**（2026-01-07 拍板）:

1. **资产基础能力统一收敛到 `/api/v4/assets/*`**
   - 余额查询（balance/balances）
   - 流水查询（transactions）
   - 这是跨业务域的底座能力，不属于任何子业务

2. **后台/运营能力统一归类为 console 域（大规模路径迁移）**
   - ✅ **已拍板**：所有后台接口从 `/api/v4/admin/*` 迁移到 `/api/v4/console/*`
   - 资产总览（portfolio）
   - 物品列表（portfolio/items）
   - 物品详情（portfolio/items/:id）
   - 物品事件历史（item-events）
   - 以及所有现有后台模块（用户管理/抽奖管理/客服管理/数据分析等）
   - **这些是 console/ops 能力，而非 shop 业务的一部分**

3. **shop 域只承载商城业务本身**
   - 材料转换（convert）- 用户端功能
   - 转换规则查询（conversion-rules）- 用户端功能
   - B2C 兑换（exchange/\*）
   - 核销系统（redemption/\*）
   - 消费记录（consumption/\*）
   - 会员权益（premium/\*）

**理由**:

1. **语义清晰**: 资产账本是跨业务域的底座能力，不应挂在 shop 子域下
2. **边界明确**: console/ops 能力与 shop 业务能力严格分离
3. **长期可维护**: 避免"资产基础能力"、"后台运营能力"、"商城业务"三者混淆
4. **命名准确**: console 比 admin 更贴近"控制台"语义（符合大厂通用命名）

### 迁移计划（2~4 周，一次性切换，不设置过渡期）

#### 第 1 周：标准化和准备迁移清单

1. **统一 `/api/v4/assets/*` 的返回字段命名**
   - ✅ **已拍板（2026-01-07）**：使用 `available_amount/frozen_amount/total_amount`（与 AssetService.getBalance() 返回一致）
   - 修改 `routes/v4/assets/balance.js` 和 `routes/v4/assets/transactions.js`
   - **理由**：全链路统一（Service → API → 文档），避免口径漂移
   - **参数策略已拍板**：`asset_code` 强制必填，不提供默认值；用户端频繁查 DIAMOND 应在前端固定传 `asset_code=DIAMOND` 或使用 `/api/v4/backpack`

2. **生成完整迁移清单**
   - 扫描所有需要修改的文件（路由/前端/测试/文档）
   - 生成批量替换脚本（`/api/v4/admin/` → `/api/v4/console/`）
   - 验证迁移清单完整性（确保不遗漏任何调用点）

3. **大规模路径迁移：`/admin` → `/console`（一次性解决）**
   - ✅ **已拍板**：所有后台接口从 `/api/v4/admin/*` 迁移到 `/api/v4/console/*`
   - ✅ **已拍板**：不设置兼容期，不保留旧路径（一次性切换）
   - **迁移范围**：
     - 22 个后台路由文件（`routes/v4/admin/*` → `routes/v4/console/*`）
     - 15 个管理后台 HTML 页面（`public/admin/*.html` 中的 97+ 处 API 调用）
     - app.js 路由注册（`app.use('/api/v4/admin')` → `app.use('/api/v4/console')`）
     - 所有测试用例中的后台接口路径
   - **理由**：
     - 语义更准确：console（控制台）比 admin（管理员）更贴近实际定位
     - 符合大厂通用命名：统一后台域（console）+ RBAC 角色
     - 一次性解决，避免长期维护兼容层

4. **创建 `/api/v4/console/assets/*` 路由结构**
   - 创建 `routes/v4/console/assets/` 目录
   - 将 portfolio/items/item-events 相关路由迁移到 console 域
   - ✅ **已拍板权限模型（2026-01-07）**：`requireRole(['admin', 'ops'])`，**按能力细分：ops 只读、admin 可写**
   - **权限分配**：
     - **admin 角色**：可读可写所有 console 接口（包括冻结/解冻/调账等写操作）
     - **ops 角色**：仅可读（portfolio/transactions/balance 等查询类接口）；POST/PUT/DELETE 返回 403
     - **普通用户**：访问 console 接口返回 403
   - **理由**：
     - 权限由角色控制更灵活（未来可扩展 fraud/finance 等角色）
     - 查询类接口天然适合只读角色（portfolio/transactions/balance）
     - 符合大厂/交易平台/游戏运维 RBAC 模型

#### 第 2 周：执行大规模路径迁移（/admin → /console）

**迁移策略**：✅ **已拍板 - 一次性切换，不设置过渡期，不保留兼容层**

##### 步骤 1：后端路由迁移（22 个文件）

```bash
# 1. 重命名目录
mv routes/v4/admin routes/v4/console

# 2. 批量替换路由文件内的路径引用
find routes/v4/console -type f -name "*.js" -exec sed -i 's|/api/v4/admin/|/api/v4/console/|g' {} \;

# 3. 更新 app.js 路由注册
sed -i "s|app.use('/api/v4/admin'|app.use('/api/v4/console'|g" app.js
sed -i "s|require('./routes/v4/admin')|require('./routes/v4/console')|g" app.js
```

##### 步骤 2：测试用例迁移（80+ 处）

```bash
# 批量替换所有测试文件
find tests -type f -name "*.js" -exec sed -i 's|/api/v4/admin/|/api/v4/console/|g' {} \;
```

##### 步骤 3：后端脚本迁移

```bash
# 批量替换后端脚本（仅 .js 文件）
find scripts -type f -name "*.js" -exec sed -i 's|/api/v4/admin/|/api/v4/console/|g' {} \;
```

##### 步骤 4：验证后端代码迁移完整性

```bash
# 检查后端代码是否还有遗漏的 /api/v4/admin/ 引用
grep -r "/api/v4/admin/" routes/ tests/ app.js services/ middleware/ scripts/ \
  --exclude="接口重复问题诊断报告-资产域API.md" 2>/dev/null

# 预期结果：0 处遗漏
```

#### 第 3 周：资产域接口迁移 + 创建 console/assets

##### 步骤 1：删除 shop/assets 重复接口

```bash
# 直接删除重复的路由文件（不标记废弃，一次性切换）
rm routes/v4/shop/assets/balance.js
rm routes/v4/shop/assets/transactions.js
```

##### 步骤 2：创建 console/assets 路由

```bash
# 1. 创建目录
mkdir -p routes/v4/console/assets

# 2. 移动 portfolio 相关路由到 console
mv routes/v4/shop/assets/portfolio.js routes/v4/console/assets/portfolio.js

# 3. 更新 portfolio.js 内的路径注释
sed -i 's|/api/v4/shop/assets/portfolio|/api/v4/console/assets/portfolio|g' routes/v4/console/assets/portfolio.js

# 4. 创建 console/assets/index.js 聚合路由
# 5. 在 routes/v4/console/index.js 中挂载 assets 子路由
```

##### 步骤 3：更新 shop/assets/index.js

```javascript
// routes/v4/shop/assets/index.js - 仅保留商城业务
const convertRoutes = require('./convert')
const rulesRoutes = require('./rules')

router.use('/', convertRoutes) // POST /convert
router.use('/', rulesRoutes) // GET /conversion-rules

// 删除：balanceRoutes, transactionsRoutes, portfolioRoutes
```

##### 步骤 4：验证接口可用性

```bash
# 启动服务
npm start

# 验证新路径接口
curl http://localhost:3000/api/v4/console/system/status
curl http://localhost:3000/api/v4/console/assets/portfolio

# 验证旧路径失效
curl http://localhost:3000/api/v4/admin/system/status  # 应返回 404
```

#### 第 4 周：验证和上线

##### 步骤 1：后端测试验证

```bash
# 1. 运行所有测试用例
npm test

# 2. 手动验证关键接口
curl http://localhost:3000/api/v4/console/system/status     # 应返回数据
curl http://localhost:3000/api/v4/console/assets/portfolio  # 应返回数据
curl http://localhost:3000/api/v4/admin/system/status       # 应返回 404

# 3. 验证权限控制（需要 JWT token）
# - admin 角色：可读可写
# - ops 角色：仅可读（POST/PUT/DELETE 返回 403）
```

##### 步骤 2：检查后端代码遗漏

```bash
# 检查后端代码是否还有遗漏的 /api/v4/admin/ 引用
grep -r "/api/v4/admin/" routes/ tests/ app.js services/ middleware/ scripts/ \
  --exclude="接口重复问题诊断报告-资产域API.md" 2>/dev/null

# 预期结果：0 处遗漏
```

##### 步骤 3：清理确认

- ✅ 确认 `routes/v4/admin/` 目录已删除（已重命名为 console）
- ✅ 确认 `routes/v4/shop/assets/balance.js` 已删除
- ✅ 确认 `routes/v4/shop/assets/transactions.js` 已删除
- ✅ 确认 `routes/v4/shop/assets/portfolio.js` 已移动到 console/assets
- ✅ 确认后端代码所有旧路径引用已清理

---

## 📝 迁移执行清单（一次性切换，不设置过渡期）

### 第 1 周：准备阶段

- [ ] 统一 `/api/v4/assets/*` 的返回字段命名为 `available_amount/frozen_amount/total_amount`（✅ **已拍板 2026-01-07** - 与 AssetService.getBalance() 一致）
- [ ] 统一参数默认值策略：`asset_code` **强制必填，不默认**（✅ **已拍板 2026-01-07** - 用户端频繁查 DIAMOND 应在前端固定传参或用 /backpack）
- [ ] 后台域路径命名：**统一后台域（console）+ RBAC 角色**（✅ **已拍板 2026-01-07** - 从 `/admin` 迁移到 `/console`）
- [ ] 权限模型：**按能力细分：ops 只读、admin 可写**（✅ **已拍板 2026-01-07** - `requireRole(['admin', 'ops'])`）
- [ ] 生成后端代码迁移清单（路由/服务/中间件/测试）
- [ ] 编写批量替换脚本（仅后端代码）

### 第 2 周：后端路径迁移（/admin → /console）

- [ ] **后端路由迁移**（22 个文件）
  - [ ] 重命名目录：`routes/v4/admin/` → `routes/v4/console/`
  - [ ] 批量替换路由文件内的路径引用和注释
  - [ ] 更新 app.js 路由注册
  - [ ] 删除旧 admin 目录（✅ 已拍板，不保留）
- [ ] **测试用例迁移**（80+ 处）
  - [ ] 批量替换测试文件中的路径
  - [ ] 更新测试配置和 mock 数据
- [ ] **后端脚本迁移**
  - [ ] 批量替换后端脚本中的路径（scripts/\*.js）
  - [ ] 更新服务层和中间件中的路径引用（如有）

### 第 3 周：资产域接口迁移

- [ ] 删除 shop/assets 的三个重复接口（balance/balances/transactions）
- [ ] 创建 `/api/v4/console/assets/*` 路由结构
- [ ] 移动 portfolio.js 到 console/assets
- [ ] 更新 shop/assets/index.js（仅保留 convert/rules）
- [ ] 更新 console/index.js（挂载 assets 子路由）
- [ ] 添加权限中间件：`requireRole(['admin', 'ops'])`，**按能力细分：ops 只读、admin 可写**（✅ **已拍板 2026-01-07**）
  - admin 角色：可读可写所有 console 接口
  - ops 角色：仅可读（portfolio/transactions/balance 等查询类接口）；POST/PUT/DELETE 返回 403
  - 普通用户：访问 console 接口返回 403

### 第 4 周：验证和上线

- [ ] 运行所有测试用例（确保通过）
- [ ] 手动验证关键接口（console/assets/portfolio 等）
- [ ] 验证旧路径已完全失效（/api/v4/admin/\* 返回 404）
- [ ] 验证权限控制生效（ops 只读、admin 可写）
- [ ] 全局检查遗漏（grep 确认 0 处旧路径引用）
- [ ] 一次性部署上线（后端 + 前端同步）
- [ ] 监控错误日志和性能指标

### 迁移影响范围统计

#### 后端代码（routes/v4/admin → routes/v4/console）

- **路由文件**：22 个
  - analytics.js, asset-adjustment.js, auth.js, campaign-budget.js, config.js
  - customer-service/（3 个子文件）, index.js, lottery-management/（3 个子文件）
  - lottery-quota.js, marketplace.js, material.js, popup-banners.js
  - prize_pool.js, settings.js, shared/, system/（3 个子文件）, user_management.js
- **路由注册**：app.js（1 处）
- **接口总数**：80+ 个
- **测试用例**：80+ 处路径引用
- **后端脚本**：scripts/\*.js 中的路径引用

#### 测试用例（tests/）

- **测试文件**：涉及 admin 相关的所有测试
- **路径引用**：80+ 处

#### 文档和脚本

- **技术文档**：docs/\*.md（若干处）
- **脚本文件**：scripts/_.js, scripts/_.sh（若干处）

### 验证清单（仅后端代码）

- [ ] **功能验证**
  - [ ] 所有 `/api/v4/console/*` 接口正常工作（80+ 个接口）
  - [ ] 所有测试用例通过（npm test）
  - [ ] 服务启动无报错（npm start）
- [ ] **路径验证**
  - [ ] `/api/v4/admin/*` 旧路径完全失效（返回 404）
  - [ ] 后端代码无遗漏的旧路径引用（grep 确认 0 处）
- [ ] **权限验证**
  - [ ] admin 角色：可读可写所有 console 接口
  - [ ] ops 角色：可读 console 接口，写操作返回 403
  - [ ] 普通用户：访问 console 接口返回 403
- [ ] **数据验证**
  - [ ] 资产余额查询数据正确（console/assets/portfolio）
  - [ ] 流水查询数据正确（assets/transactions）
  - [ ] 接口返回字段符合规范（available_amount/frozen_amount/total_amount）

### 上线后监控（后端接口）

- [ ] 监控 404 错误（关注是否有旧路径调用）
- [ ] 监控 403 错误（权限控制是否符合预期）
- [ ] 监控接口响应时间（确保无性能退化）
- [ ] 监控错误日志（关注异常堆栈）

---

## 🏗️ 迁移后的最终架构

### 资产域三层架构（符合大厂/游戏公司最佳实践）

```
/api/v4/assets/*              # 基础资产能力（跨业务域底座）
├── GET  /balance             # 单资产余额查询
├── GET  /balances            # 全部资产余额列表
└── GET  /transactions        # 资产流水查询

/api/v4/console/assets/*      # 后台运营资产中心（需 console 权限）
├── GET  /portfolio           # 资产总览（含物品统计）
├── GET  /portfolio/items     # 物品列表（含 locked 状态）
├── GET  /portfolio/items/:id # 物品详情（含事件历史）
└── GET  /item-events         # 物品事件历史查询

/api/v4/console/*             # Console 后台域（所有后台运营能力）
├── /auth                     # 管理员认证
├── /system                   # 系统监控
├── /config                   # 配置管理
├── /settings                 # 系统设置
├── /prize-pool               # 奖品池管理
├── /user-management          # 用户管理
├── /lottery-management       # 抽奖管理
├── /analytics                # 数据分析
├── /customer-service         # 客服管理
├── /marketplace              # 市场统计
├── /material                 # 材料系统管理
├── /popup-banners            # 弹窗管理
├── /lottery-quota            # 抽奖配额管理
├── /asset-adjustment         # 资产调整管理
├── /campaign-budget          # 活动预算管理
└── /assets                   # 资产中心（新增）

/api/v4/shop/assets/*         # 商城业务专用（用户端功能）
├── POST /convert             # 材料转换（碎片→钻石）
└── GET  /conversion-rules    # 转换规则查询

/api/v4/backpack              # 用户背包聚合视图（用户端唯一入口）
└── GET  /                    # 背包总览（assets + items）
```

### 边界说明

| 域                         | 定位                           | 调用方            | 权限要求                       |
| -------------------------- | ------------------------------ | ----------------- | ------------------------------ |
| `/api/v4/assets/*`         | 资产账本基础能力（底座）       | 所有业务域        | 登录用户                       |
| `/api/v4/console/*`        | Console 后台域（所有运营能力） | 管理后台/客服系统 | **admin（可写）+ ops（只读）** |
| `/api/v4/console/assets/*` | 后台运营资产中心               | 管理后台/客服系统 | **admin（可写）+ ops（只读）** |
| `/api/v4/shop/assets/*`    | 商城业务专用功能               | 用户端商城页面    | 登录用户                       |
| `/api/v4/backpack`         | 用户背包聚合视图               | 用户端背包页面    | 登录用户                       |

**核心原则**:

- ✅ 资产基础能力不挂在任何子业务域下
- ✅ 后台运营能力与商城业务能力严格分离
- ✅ 用户端通过聚合视图减少口径漂移
- ✅ 所有能力共享同一账本真相（`account_asset_balances` + `asset_transactions`）

**已拍板的技术决策**（2026-01-07 最终确认）:

| 决策项         | 最终选择                                             | 理由                                                                                                                                                                  |
| -------------- | ---------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **字段命名**   | ✅ **`available_amount/frozen_amount/total_amount`** | 与 AssetService.getBalance() 返回一致，全链路统一，避免口径漂移                                                                                                       |
| **参数策略**   | ✅ **`asset_code` 强制必填，不提供默认值**           | 防误查，调用者必须明确意图；对 BUDGET_POINTS/campaign 隔离更安全；用户端频繁查 DIAMOND 应在前端固定传参或用 /api/v4/backpack                                          |
| **后台域路径** | ✅ **统一后台域（console）+ RBAC 角色**              | 采用 `/api/v4/console/*`（从 `/admin` 大规模迁移）；语义更准确（控制台 vs 管理员），符合大厂通用命名                                                                  |
| **迁移策略**   | ✅ **一次性切换，不设置过渡期，不保留兼容层**        | 一次性解决问题，避免长期维护双路径；当前处于架构重构关键期，最佳时机                                                                                                  |
| **权限模型**   | ✅ **按能力细分：ops 只读、admin 可写**              | `requireRole(['admin', 'ops'])`；查询类接口（portfolio/transactions/balance）天然适合只读角色；写操作（冻结/解冻/调账）仅 admin；符合大厂/交易平台/游戏运维 RBAC 模型 |

**决策依据**:

- 符合大厂/游戏/交易平台的"钱包底座 + Console 后台域 + RBAC 角色"通用模式
- 与当前代码结构（AssetService + 余额表 + 流水表）完全契合
- 一次性彻底解决命名和边界问题（不留历史包袱）

**迁移影响范围**（后端代码）:

- 后端路由文件：22 个（`routes/v4/admin/*` → `routes/v4/console/*`）
- 测试用例：80+ 处路径引用
- 后端脚本：scripts/\*.js 中的路径引用
- app.js 路由注册：1 处

**不在本次迁移范围**:

- ❌ 前端页面（Web 管理后台）- 由前端团队独立迁移
- ❌ 微信小程序前端 - 由前端团队独立迁移
- ❌ 数据库备份操作 - 不需要
- ❌ Git 操作 - 不需要

---

## 🔗 相关文档

- **技术架构文档**: `docs/暴力重构统一技术方案-只保留新方案.md`
- **AssetService 实现**: `services/AssetService.js`
- **数据库模型**: `models/AccountAssetBalance.js`, `models/AssetTransaction.js`
- **路由实现**:
  - `routes/v4/assets/` - 基础资产能力
  - `routes/v4/console/` - Console 后台域（从 admin 迁移）
  - `routes/v4/console/assets/` - 后台运营资产中心（待创建）
  - `routes/v4/shop/assets/` - 商城业务专用
  - `routes/v4/backpack/` - 用户背包聚合

---

---

## 🎓 行业最佳实践对比（决策依据）

### 大厂（美团/腾讯/阿里）通用模式

- **钱包/账本域独立**：不挂在任何子业务域下（shop/order/lottery 都是调用方）
- **字段命名严谨**：`*_amount`（金额）、`*_count`（数量）明确区分
- **后台统一域 + RBAC**：`/console` 或 `/admin` + 角色控制（admin/ops/finance/fraud）
  - 大多数大厂倾向用 **`/console`**（控制台）而非 `/admin`（管理员）
  - 原因：console 描述的是"系统"，admin 描述的是"人"，前者更准确
- **参数不默认**：底座能力接口要求调用方明确传参

### 游戏公司（虚拟物品交易）

- **Fungible（可叠加）+ Non-fungible（不可叠加）双轨**
- **用户端聚合视图**：背包/仓库接口（减少口径漂移）
- **后台审计中心**：流水/事件/纠纷处理（权限严格）
- **冻结链路**：交易/挂单必须冻结 → 结算 → 解冻

### 活动策划/营销积分平台

- **活动预算隔离**：`BUDGET_POINTS + campaign_id`（你项目已实现）
- **运营后台按活动维度查询**：余额/流水/统计
- **底层仍是统一账本**：不会为每个活动复制一套接口

### 小众二手/虚拟物品交易平台

- **核心诉求**：冻结与结算链路 + 审计可追溯
- **钱包域是唯一真相**：纠纷自证依赖流水不可篡改
- **后台权限严格**：ops 只读查账、admin 可调账/冻结/解冻

### 对你项目的映射

你的项目本质是：**餐厅积分抽奖 + 虚拟物品交易市场 + 材料兑换商城 + 活动预算管理**

- ✅ 已有完整的账本体系（余额表 + 流水表 + 冻结模型 + 幂等）
- ✅ 已有活动隔离机制（BUDGET_POINTS + campaign_id）
- ✅ 已有用户端聚合视图（/api/v4/backpack）
- ⚠️ 缺少清晰的"后台运营域"与"商城业务域"分离

**因此最适合你的就是：方案 A + 大规模路径迁移（admin → console）**，完全对齐行业最佳实践。

### 为什么选择"大规模迁移"而非"渐进式"

你的项目当前处于**架构重构关键期**（从旧 inventory/points 迁移到新 assets/backpack），此时一次性解决命名和边界问题是**最佳时机**：

- ✅ 避免长期维护双路径（兼容层会成为技术债务）
- ✅ 新旧接口同时迁移，调用方只需改一次
- ✅ 未来不会再有"admin 是路径还是角色"的混淆
- ✅ 符合大厂"控制台域"的通用命名

---

## 📞 联系人

如有疑问，请联系技术负责人或在项目 Issue 中讨论。

---

## 🚀 快速执行指南（一次性迁移脚本）

### 自动化迁移脚本（纯后端代码迁移）

```bash
#!/bin/bash
# 大规模路径迁移脚本：/api/v4/admin → /api/v4/console
# 仅迁移后端代码，不涉及前端/数据库/Git

set -e  # 遇到错误立即退出

echo "🚀 开始后端路径迁移：/admin → /console"
echo "⚠️  一次性切换，不兼容旧接口"
echo ""

# 步骤 1：后端路由目录迁移
echo "📁 步骤 1/4：迁移后端路由目录..."
if [ -d "routes/v4/admin" ]; then
  mv routes/v4/admin routes/v4/console
  echo "✅ 目录重命名：routes/v4/admin → routes/v4/console"
else
  echo "❌ routes/v4/admin 目录不存在"
  exit 1
fi

# 步骤 2：批量替换后端路由文件内容
echo ""
echo "🔄 步骤 2/4：批量替换后端路由文件内容..."
find routes/v4/console -type f -name "*.js" -exec sed -i 's|/api/v4/admin/|/api/v4/console/|g' {} \;
echo "✅ 后端路由文件内容替换完成（22 个文件）"

# 步骤 3：更新 app.js 路由注册
echo ""
echo "🔧 步骤 3/4：更新 app.js 路由注册..."
sed -i "s|app.use('/api/v4/admin'|app.use('/api/v4/console'|g" app.js
sed -i "s|require('./routes/v4/admin')|require('./routes/v4/console')|g" app.js
echo "✅ app.js 路由注册更新完成"

# 步骤 4：批量替换测试用例
echo ""
echo "🧪 步骤 4/4：批量替换测试用例..."
find tests -type f -name "*.js" -exec sed -i 's|/api/v4/admin/|/api/v4/console/|g' {} \;
echo "✅ 测试用例替换完成（80+ 处）"

# 验证迁移完整性（仅检查后端代码）
echo ""
echo "🔍 验证后端代码迁移完整性..."
REMAINING=$(grep -r "/api/v4/admin/" routes/ tests/ app.js services/ middleware/ \
  --exclude="接口重复问题诊断报告-资产域API.md" \
  2>/dev/null | wc -l)

if [ "$REMAINING" -eq 0 ]; then
  echo "✅ 后端代码迁移完整：0 处遗漏"
else
  echo "⚠️  发现 $REMAINING 处遗漏的旧路径引用："
  grep -r "/api/v4/admin/" routes/ tests/ app.js services/ middleware/ \
    --exclude="接口重复问题诊断报告-资产域API.md" 2>/dev/null
fi

echo ""
echo "🎉 后端路径迁移完成！"
echo ""
echo "📋 验证步骤："
echo "1. 运行测试：npm test"
echo "2. 启动服务：npm start"
echo "3. 验证新路径：curl http://localhost:3000/api/v4/console/system/status"
echo "4. 验证旧路径失效：curl http://localhost:3000/api/v4/admin/system/status"
echo ""
echo "⚠️  前端页面需要独立迁移 API 调用路径（由前端团队负责）"
```

---

**报告结束 - 所有决策已拍板（2026-01-07）**

**最终决策总结**（2026-01-07 最终拍板确认）:

### 1. 字段命名标准

✅ **`available_amount/frozen_amount/total_amount`**

- **理由**: 与 AssetService.getBalance() 返回字段完全一致
- **优点**: 全链路统一（Service → API → 文档），避免口径漂移
- **执行**: 修改 `routes/v4/assets/balance.js` 返回字段

### 2. 参数策略

✅ **`asset_code` 强制必填，不提供默认值**

- **理由**: 防误查，调用者必须明确意图
- **优点**: 对 BUDGET_POINTS/campaign 隔离这类复杂资产更安全
- **用户端频繁查 DIAMOND 的处理**: 在前端固定传 `asset_code=DIAMOND`，或使用 `/api/v4/backpack` 聚合接口，不依赖后端默认值

### 3. 后台域路径命名

✅ **统一后台域（console）+ RBAC 角色**

- **路径**: `/api/v4/console/*`（从 `/admin` 大规模迁移）
- **理由**: console（控制台）比 admin（管理员）语义更准确，描述的是"系统"而非"人"
- **符合大厂通用命名**: 美团/腾讯/阿里等大厂倾向用 `/console`

### 4. 迁移策略

✅ **一次性切换，不设置过渡期，不保留兼容层**

- **理由**: 当前处于架构重构关键期（从旧 inventory/points 迁移到新 assets/backpack），是最佳时机
- **优点**: 避免长期维护双路径（兼容层会成为技术债务）；新旧接口同时迁移，调用方只需改一次

### 5. 权限模型

✅ **按能力细分：ops 只读、admin 可写**

- **实现**: `requireRole(['admin', 'ops'])`
- **权限分配**:
  - **admin 角色**: 可读可写所有 console 接口（包括冻结/解冻/调账等写操作）
  - **ops 角色**: 仅可读（portfolio/transactions/balance 等查询类接口）；POST/PUT/DELETE 返回 403
  - **普通用户**: 访问 console 接口返回 403
- **理由**: 查询类接口天然适合只读角色；符合大厂/交易平台/游戏运维 RBAC 模型

**迁移范围**（仅后端代码）:

- 后端路由：22 个文件，80+ 个接口
- 测试用例：80+ 处路径引用
- 后端脚本：scripts/\*.js 中的路径引用
- app.js 路由注册：1 处

**不在迁移范围**（由对应团队独立处理）:

- ❌ Web 管理后台前端（public/admin/\*.html）
- ❌ 微信小程序前端
- ❌ 数据库操作
- ❌ Git 操作
