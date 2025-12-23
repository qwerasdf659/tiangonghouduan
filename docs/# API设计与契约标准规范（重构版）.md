# API设计与契约标准规范（重构版）

> **最后更新**: 2025-12-23  
> **适用范围**: 后端API设计、路由规范、参数命名、响应格式  
> **文档版本**: v2.0  
> **实施核对**: 2025-12-23（基于当前代码与数据库真实状态）

---

## 📊 实施进度（基于当前代码与数据库核对）

### ✅ 已完成项（符合规范）

#### 1. 版本前缀与域划分（✅ 100%完成）

- **现状**: `app.js` 明确挂载 8 个标准域到 `/api/v4/*`
- **证据**:
  ```javascript
  app.use('/api/v4/auth', require('./routes/v4/auth'))
  app.use('/api/v4/admin', require('./routes/v4/admin'))
  app.use('/api/v4/lottery', require('./routes/v4/lottery'))
  app.use('/api/v4/system', require('./routes/v4/system'))
  // ... 共8个域
  ```

#### 2. 统一响应契约（✅ 90%完成）

- **现状**: `ApiResponse.middleware()` 已注入 `/api/*` 路径，提供统一响应方法
- **证据**:
  - `app.js` 第160行：`app.use('/api/', ApiResponse.middleware())`
  - 所有路由使用 `res.apiSuccess/apiError` 等方法
  - 响应包含 `success/code/message/data/timestamp/version/request_id`
- **边角**: `/health` 与根路径 `/` 直接返回 JSON（不影响 API 契约）

#### 3. 统计接口按形态拆分（✅ 100%完成）

- **现状**: `/api/v4/system/statistics/charts|report|export` 三个独立 endpoint
- **证据**: `routes/v4/system/statistics.js` 实现了三个路径，export 返回 Excel 文件流

#### 4. 抽奖接口单一 Canonical（✅ 100%完成）

- **现状**: 只有 `POST /api/v4/lottery/draw`，路由层无 `/execute`
- **证据**: `routes/v4/lottery/draw.js` 只定义了 `/draw`

#### 5. 幂等性与审计（✅ 100%完成 - 数据库层+模型层）

- **现状**: 关键表的 `business_id` 唯一约束已落库且字段 NOT NULL，Sequelize 模型定义同步一致
- **数据库层证据**:
  - `trade_orders.business_id`：唯一索引 `business_id`
  - `market_listings.business_id`：唯一索引 `uk_market_listings_business_id`
  - `lottery_draws.business_id`：唯一索引 `uk_lottery_draws_business_id`
  - `consumption_records.business_id`：唯一索引 `uk_consumption_records_business_id`
  - `exchange_records.business_id`：唯一索引 `idx_business_id_unique`
  - `asset_transactions`：复合唯一索引 `uk_business_idempotency(business_id,business_type)`
  - `redemption_orders.code_hash`：唯一索引 `code_hash`
  - `account_asset_balances`：复合唯一索引 `uk_account_asset(account_id,asset_code)`
- **模型层证据**（P1修复 - 2025-12-23）:
  - `models/ConsumptionRecord.js`：`business_id` 已改为 `allowNull: false, unique: true`
  - `models/MarketListing.js`：`business_id` 已改为 `allowNull: false`，索引定义包含 `uk_market_listings_business_id`
  - 迁移脚本：`migrations/20251223000100-add-idempotency-constraints-p1-fix.js`
- **数据验证**: 所有幂等字段当前数据 NULL 数量为 0

---

### ❌ 未完成项（需要修复）

#### P0-1: 聊天接口旧路径未硬切断（❌ 违反"单一 Canonical"）

- **问题**: `routes/v4/system/chat.js` 同时保留旧动作式路径与新 RESTful 路径
- **现状**:

  ```javascript
  // 旧路径（应删除）
  router.post('/chat/create', ...)          // 第36行
  router.post('/chat/send', ...)            // 第205行
  router.get('/chat/history/:sessionId', ...)  // 第149行

  // 新路径（应保留）
  router.get('/chat/sessions', ...)         // 第95行
  ```

- **规范要求**: 删除 `/chat/create|send|history`，只保留 `/chat/sessions` 嵌套路径
- **影响**: 前端/小程序可能仍在调用旧路径

#### P0-2: 弹窗接口旧路径未硬切断（❌ 违反"资源化 + query 筛选"）

- **问题**: `routes/v4/system/popup-banners.js` 实现了 `/popup-banners/active`
- **现状**: 第56行 `router.get('/popup-banners/active', ...)`
- **规范要求**: 改为 `router.get('/popup-banners', ...)` 并用 `?status=active` 筛选
- **额外问题**: 数据库表 `popup_banners` 没有 `status` 字段（只有 `is_active`），需要：
  - 方案A：添加 `status` 枚举字段（`active/draft/expired`）并迁移数据
  - 方案B：调整规范，承认当前设计用 `is_active + start_time/end_time` 表达状态

#### P0-3: 参数命名违规（❌ 违反"禁止语义不清的裸 code"）

- **问题1**: `routes/v4/auth/login.js` 第168行

  ```javascript
  const { code, encryptedData, iv } = req.body // 微信解密手机号
  ```

  - 规范要求：改为 `wx_code` 或 `js_code`

- **问题2**: `routes/v4/shop/redemption/fulfill.js` 第53行

  ```javascript
  const { code } = req.body // 核销码
  ```

  - 规范要求：改为 `redeem_code` 或 `redemption_code`

#### P1-1: 服务自描述文档过时（❌ 误导调用方）

- **问题**: `app.js` 中 `/api/v4/docs` 与 404 处理器仍声明 `POST /api/v4/lottery/execute`
- **现状**:
  - 第396行：`'POST /api/v4/lottery/execute': '执行抽奖'`
  - 第676行：404 列表包含 `'POST /api/v4/lottery/execute'`
- **规范要求**: 改为 `POST /api/v4/lottery/draw`

---

### 📈 完成度统计

| 类别                 | 完成度  | 说明                                   |
| -------------------- | ------- | -------------------------------------- |
| **版本前缀与域划分** | ✅ 100% | 8个域全部挂载到 `/api/v4`              |
| **统一响应契约**     | ✅ 90%  | ApiResponse 已全局注入，边角场景除外   |
| **统计接口拆分**     | ✅ 100% | charts/report/export 三个独立 endpoint |
| **抽奖单一路径**     | ✅ 100% | 只有 `/draw`，无 `/execute`            |
| **幂等性数据库约束** | ✅ 100% | 所有关键表 business_id 唯一索引已落库  |
| **旧路径硬切断**     | ❌ 40%  | 聊天/弹窗仍保留旧路径                  |
| **参数命名规范**     | ❌ 60%  | 2处仍使用裸 `code`                     |
| **服务自描述一致性** | ❌ 80%  | 文档仍声明已删除的 `/execute`          |

**总体完成度**: 约 **78%**（8项中5项完成，3项部分完成）

---

## 📋 目录

- [第一部分：核心设计原则](#第一部分核心设计原则)
- [第二部分：参数命名规范](#第二部分参数命名规范)
- [第三部分：路由路径设计规范](#第三部分路由路径设计规范)
- [第四部分：实施标准与规范](#第四部分实施标准与规范)
- [第五部分：质量度量与监控](#第五部分质量度量与监控)
- [第六部分：迁移实施方案](#第六部分迁移实施方案)

---

## 第一部分：核心设计原则

### 1.1 五大核心原则（长期维护成本最低的设计）

#### 原则1：版本前缀 + 清晰域划分

**强制要求**：所有 API 路径必须包含版本前缀 `/api/v4`，并按业务域清晰划分。

```javascript
// ✅ 标准域结构（8个业务域）
/api/v4/auth      // 认证授权域
/api/v4/admin     // 管理后台域
/api/v4/lottery   // 抽奖系统域
/api/v4/inventory // 库存管理域
/api/v4/market    // 交易市场域
/api/v4/shop      // 积分商城域
/api/v4/system    // 系统功能域（公告/反馈/聊天/统计/通知/弹窗）
/api/v4/user      // 用户中心域
```

#### 原则2：每个能力一条 Canonical Path（唯一性原则）

**强制要求**：每个能力只有一个 Canonical Path，禁止多套路径共存。

```javascript
// ❌ 禁止：多套路径指向同一逻辑
router.get('/old-path', handler)
router.get('/new-path', handler)
router.get('/alias-path', handler)

// ✅ 强制：单一 Canonical 路径
router.get('/canonical-path', handler)
```

**旧路径处理策略**：纯硬切断（直接删除，前端/调用方 404）

#### 原则3：返回形态/权限边界不同就拆 endpoint

**拆分判定标准**（满足任一条件即拆分）：

- 返回形态/schema 明显不同（如图表 vs 报表 vs 导出文件）
- 权限边界不同（admin-only vs user）
- 副作用强（创建/扣款/抽奖/审批/状态迁移）
- 返回媒体类型不同（JSON vs Excel vs PDF）

```javascript
// ✅ 典型案例：统计接口按形态拆分
GET /api/v4/system/statistics/charts?days=7        // 图表数据（JSON）
GET /api/v4/system/statistics/report?period=week   // 报表数据（JSON）
GET /api/v4/system/statistics/export?days=30       // 文件下载（Excel）

// ❌ 禁止：type 大一统（当返回形态明显不同时）
GET /api/v4/system/statistics?type=charts
GET /api/v4/system/statistics?type=export
```

#### 原则4：同一 endpoint 的多条件筛选用 query

**适用场景**：同一资源的不同状态/筛选维度/分页排序。

```javascript
// ✅ 使用查询参数：状态筛选/分页/排序
GET /api/v4/system/popup-banners?status=active&position=home&limit=10
GET /api/v4/system/notifications?status=unread&page=1&limit=20
GET /api/v4/market/listings?status=on_sale&sort=price_asc

// ❌ 禁止：状态筛选用路径片段
GET /api/v4/system/popup-banners/active
GET /api/v4/system/notifications/unread
```

#### 原则5：交易/扣减类写操作强制幂等 + 审计

**强制要求**：所有涉及资产变动的写操作必须：

- **幂等性控制**：使用 `business_id` 唯一约束（数据库层）
- **审计追踪**：记录操作日志（`AdminOperationLog`）
- **事务保护**：使用数据库事务确保原子性

```javascript
// ✅ 交易/扣减操作标准实现
const transaction = await sequelize.transaction()
try {
  // 1. 幂等性检查（数据库唯一约束）
  const order = await TradeOrder.create(
    {
      business_id: `trade_${Date.now()}_${uuid}`, // 全局唯一
      buyer_id: userId,
      amount: price
      // ...
    },
    { transaction }
  )

  // 2. 资产扣减
  await AssetTransaction.create(
    {
      business_id: `asset_${order.order_id}`,
      delta_amount: -price
      // ...
    },
    { transaction }
  )

  // 3. 审计日志（同一事务）
  await AdminOperationLog.create(
    {
      operator_id: userId,
      operation_type: 'trade_create'
      // ...
    },
    { transaction }
  )

  await transaction.commit()
} catch (error) {
  await transaction.rollback()
  throw error
}
```

---

## 第二部分：参数命名规范

### 2.1 语义明确性要求

**核心规范**: 禁止"语义不清的裸参数名"，强制使用有明确上下文的命名。

#### 2.1.1 禁止使用的通用参数名

| ❌ 禁止用法 | 问题         | ✅ 推荐替代                                            |
| ----------- | ------------ | ------------------------------------------------------ |
| `code`      | 语义不明确   | `verification_code` / `wx_code` / `authorization_code` |
| `id`        | 上下文不清   | `user_id` / `order_id` / `product_id`                  |
| `type`      | 范围太广     | `user_type` / `payment_type` / `notification_type`     |
| `status`    | 状态归属不明 | `order_status` / `user_status` / `payment_status`      |

**HTTP 状态码使用规范**：

- **200 OK**：成功响应
- **400 Bad Request**：参数错误/验证失败
- **401 Unauthorized**：未登录/Token 无效
- **403 Forbidden**：权限不足
- **404 Not Found**：资源不存在
- **500 Internal Server Error**：服务器错误

**统一响应字段**（所有状态码都包含）：

- `success`: boolean（业务成功标识）
- `code`: string（业务代码）
- `message`: string（人类可读消息）
- `data`: object|array|null（业务数据）
- `timestamp`: string（北京时间 ISO8601）
- `version`: string（API 版本，固定 `v4.0`）
- `request_id`: string（请求追踪 ID）

#### 2.1.2 code 参数命名标准

**决策**: 禁止"语义不清的 `code`"，强制使用有明确上下文的命名

| 场景          | ❌ 禁止用法 | ✅ 推荐用法                        | 说明                 |
| ------------- | ----------- | ---------------------------------- | -------------------- |
| 短信验证码    | `code`      | `verification_code` / `sms_code`   | 登录/注册/验证场景   |
| 微信登录凭证  | `code`      | `wx_code` / `js_code`              | 微信小程序临时凭证   |
| OAuth 授权码  | `code`      | `authorization_code` / `auth_code` | OAuth 2.0 授权码模式 |
| 兑换码/优惠券 | `code`      | `redeem_code` / `coupon_code`      | 业务兑换码           |
| 邀请码        | `code`      | `invitation_code` / `invite_code`  | 用户邀请场景         |

**理由**: `code` 在同一系统中可能同时表示"验证码 / 授权码 / 错误码 / 兑换码 / 活动码"，语义不明确导致参数验证逻辑混乱。按语义命名 + 明确前缀是长期维护成本最低的方案。

### 2.2 参数校验标准

#### 2.2.1 强制单一参数验证

```javascript
// ✅ 正确：强制单一参数验证
const { verification_code } = req.body
if (!verification_code) {
  return res.apiError('缺少必需参数: verification_code', 'VERIFICATION_CODE_REQUIRED', null, 400)
}

// ❌ 禁止：多参数兼容逻辑
const code = req.body.verification_code || req.body.code // 禁止兼容逻辑
```

#### 2.2.2 参数命名实施标准

```javascript
// ❌ 禁止：语义不清的裸 code
const code = req.body.code // 这是什么 code？验证码？授权码？

// ✅ 强制：语义明确的命名
const { verification_code } = req.body // 短信验证码
const { wx_code } = req.body // 微信临时登录凭证
const { authorization_code } = req.body // OAuth 授权码

// ❌ 禁止：多参数兼容
const code = req.body.verification_code || req.body.code

// ✅ 强制：单一参数验证
const { verification_code } = req.body
if (!verification_code) {
  return res.apiError('缺少必需参数: verification_code', 'VERIFICATION_CODE_REQUIRED', null, 400)
}
```

### 2.3 禁止参数别名

```javascript
// ❌ 禁止：参数兼容逻辑
const value = req.body.new_name || req.body.old_name || req.body.alias

// ✅ 强制：单一参数名
const { canonical_name } = req.body
if (!canonical_name) {
  return res.apiError('缺少必需参数: canonical_name', 'MISSING_PARAM', null, 400)
}
```

---

## 第三部分：路由路径设计规范

### 3.1 资源化路径设计规范

**适用于**: system/内容/配置类接口

#### 3.1.1 标准资源化路径模式

```javascript
// ✅ 正确：弹窗资源化（status/position 枚举 + 默认值 + 权限控制）
GET /api/v4/system/popup-banners?status=active&position=home&limit=10
// 参数说明：
// - status: 枚举（active/draft/expired），默认 active，非管理员只能请求 active
// - position: 枚举（home/profile），默认 home
// - limit: 数量限制（1-10），默认 10

GET /api/v4/system/popup-banners/:banner_id           // 获取单个弹窗

// ✅ 正确：通知资源化（status 枚举 + 未读数在主接口返回）
GET /api/v4/system/notifications?status=unread&page=1&limit=20
// 响应包含 meta.unread_count 字段
GET /api/v4/system/notifications/:notification_id     // 单个通知

// ✅ 正确：统计按形态拆分 endpoint + query 做筛选
GET /api/v4/system/statistics/charts?days=7           // 图表数据（JSON，管理员）
GET /api/v4/system/statistics/report?period=week      // 报表数据（JSON，管理员）
GET /api/v4/system/statistics/export?days=30          // 导出文件（Excel，管理员）
// 参数说明：
// - days: 天数（7/30/90），默认 30
// - period: 周期（week/month/year），默认 week

// ❌ 禁止：状态筛选用路径片段
GET /api/v4/system/popup-banners/active               // 禁止（改用 ?status=active）
GET /api/v4/system/notifications/unread-count         // 禁止（合并到主接口返回）

// ❌ 禁止：type 大一统（当返回形态明显不同时）
GET /api/v4/system/statistics?type=charts             // 禁止（改用独立 endpoint）
GET /api/v4/statistics/charts                         // 禁止（缺少 /system 域前缀）
```

### 3.2 动作式路径使用规范

#### 3.2.1 允许场景1：状态迁移动作

**特征**: 有明确的状态变化（A状态 → B状态）

```javascript
// ✅ 正确：状态迁移动作
POST /api/v4/system/notifications/:notification_id/read     // unread → read
POST /api/v4/system/notifications/read-all                   // 批量状态迁移
POST /api/v4/system/notifications/:notification_id/clear    // 清除通知
POST /api/v4/market/listings/:listing_id/cancel              // 取消挂单
POST /api/v4/market/listings/:listing_id/buy                 // 购买挂单
```

#### 3.2.2 允许场景2：天然动作语义

**特征**: 业务领域固有动作，无法用资源化表达

```javascript
// ✅ 正确：天然动作语义（单一 Canonical）
POST / api / v4 / lottery / draw // 抽奖动作（唯一路径）
```

#### 3.2.3 禁止场景：非状态迁移的动作式

```javascript
// ❌ 禁止：非状态迁移的动作式（应使用 RESTful 资源嵌套）
POST /api/v4/system/chat/create                        // 改为 POST /api/v4/system/chat/sessions
POST /api/v4/system/chat/send                          // 改为 POST /api/v4/system/chat/sessions/:id/messages
GET /api/v4/system/chat/history/:session_id            // 改为 GET /api/v4/system/chat/sessions/:id/messages
```

### 3.3 RESTful资源嵌套规范

#### 3.3.1 标准嵌套模式

```javascript
// ✅ 正确：客服会话资源化（标准 RESTful，保留 /system/chat 前缀）
POST /api/v4/system/chat/sessions                      // 创建会话
GET /api/v4/system/chat/sessions                       // 获取会话列表
GET /api/v4/system/chat/sessions/:session_id           // 获取单个会话
GET /api/v4/system/chat/sessions/:session_id/messages  // 获取会话消息
POST /api/v4/system/chat/sessions/:session_id/messages // 发送消息

// ❌ 禁止：动作式路径（硬切断，直接删除）
POST /api/v4/system/chat/create                        // 删除（404）
POST /api/v4/system/chat/send                          // 删除（404）
GET /api/v4/system/chat/history/:session_id            // 删除（404）
```

#### 3.3.2 嵌套层级限制

**规范**: 资源嵌套最多3层

```javascript
// ✅ 正确：3层嵌套
GET /api/v4/users/:user_id/orders/:order_id/items

// ❌ 禁止：超过3层嵌套
GET /api/v4/users/:user_id/orders/:order_id/items/:item_id/details
```

### 3.4 Canonical Path映射表

#### 3.4.1 统一后的 Canonical 路径（唯一标准）

| 功能     | Canonical Path（包含 /api/v4 前缀）                       | 查询参数/请求体                                                                                                                                       | 权限                                   |
| -------- | --------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| 登录     | `POST /api/v4/auth/login`                                 | `verification_code`（必需）                                                                                                                           | Public                                 |
| 弹窗查询 | `GET /api/v4/system/popup-banners`                        | `status=active/draft/expired`（默认 active）<br>`position=home/profile`（默认 home）<br>`limit=1-10`（默认 10）<br>**非管理员只能请求 status=active** | Public（限 active）<br>Admin（全状态） |
| 创建会话 | `POST /api/v4/system/chat/sessions`                       | `source=mobile/web`（可选）                                                                                                                           | User                                   |
| 会话列表 | `GET /api/v4/system/chat/sessions`                        | `page=1`（默认 1）<br>`limit=10-50`（默认 10）                                                                                                        | User                                   |
| 会话消息 | `GET /api/v4/system/chat/sessions/:session_id/messages`   | `page=1`<br>`limit=50-100`（默认 50）                                                                                                                 | User                                   |
| 发送消息 | `POST /api/v4/system/chat/sessions/:session_id/messages`  | `content`（必需）<br>`message_type=text/image`（默认 text）                                                                                           | User                                   |
| 统计图表 | `GET /api/v4/system/statistics/charts`                    | `days=7/30/90`（默认 30）                                                                                                                             | Admin                                  |
| 统计报表 | `GET /api/v4/system/statistics/report`                    | `period=week/month/year`（默认 week）                                                                                                                 | Admin                                  |
| 统计导出 | `GET /api/v4/system/statistics/export`                    | `days=7/30/90`（默认 30）<br>**返回 Excel 文件流**                                                                                                    | Admin                                  |
| 通知列表 | `GET /api/v4/system/notifications`                        | `status=unread/read`（可选）<br>`page=1`<br>`limit=20-50`（默认 20）<br>**响应包含 meta.unread_count**                                                | Admin                                  |
| 标记已读 | `POST /api/v4/system/notifications/:notification_id/read` | -                                                                                                                                                     | Admin                                  |
| 全部已读 | `POST /api/v4/system/notifications/read-all`              | -                                                                                                                                                     | Admin                                  |
| 抽奖执行 | `POST /api/v4/lottery/draw`                               | `campaign_code`（必需）<br>`draw_count=1-10`（默认 1）<br>**强制幂等 + 审计**                                                                         | User                                   |

#### 3.4.2 禁止的非 Canonical 路径（硬切断策略）

**处理方式**：直接删除旧路由，前端/调用方收到 404（不保留 301/410 兼容）

| 禁止路径（直接删除）                            | 原因                           | Canonical 替代                                                     |
| ----------------------------------------------- | ------------------------------ | ------------------------------------------------------------------ |
| `GET /api/v4/system/popup-banners/active`       | 状态筛选应使用查询参数         | `GET /api/v4/system/popup-banners?status=active&position=home`     |
| `GET /api/v4/statistics/*`（缺少 /system）      | 缺少域前缀                     | `GET /api/v4/system/statistics/charts`                             |
| `POST /api/v4/system/chat/create`               | 非 RESTful，应使用标准资源路径 | `POST /api/v4/system/chat/sessions`                                |
| `POST /api/v4/system/chat/send`                 | 非 RESTful，应使用资源嵌套     | `POST /api/v4/system/chat/sessions/:session_id/messages`           |
| `GET /api/v4/system/chat/history/:session_id`   | 非资源嵌套标准                 | `GET /api/v4/system/chat/sessions/:session_id/messages`            |
| `GET /api/v4/system/notifications/unread-count` | 应合并到主接口 meta 返回       | `GET /api/v4/system/notifications`（响应包含 `meta.unread_count`） |
| `POST /api/v4/lottery/execute`                  | 与 /draw 功能重复              | `POST /api/v4/lottery/draw`                                        |

---

## 第四部分：实施标准与规范

### 4.1 路由实现标准

#### 4.1.1 禁止旧路径兼容（硬切断策略）

**策略**：直接删除旧路由，前端/调用方收到 404（不保留 301/410 引导）

```javascript
// ❌ 禁止：保留旧路径（直接删除）
router.get('/popup-banners/active', ...)       // 删除
router.post('/chat/create', ...)               // 删除
router.post('/chat/send', ...)                 // 删除
router.get('/chat/history/:id', ...)           // 删除
router.post('/lottery/execute', ...)           // 删除
```

#### 4.1.2 强制 Canonical 实现

```javascript
// ✅ 弹窗：资源化 + 枚举参数 + 权限控制
router.get('/popup-banners', async (req, res) => {
  const { status = 'active', position = 'home', limit = 10 } = req.query

  // 非管理员只能请求 active 状态
  if (!req.user?.is_admin && status !== 'active') {
    return res.apiForbidden('权限不足：只能查询 active 状态弹窗')
  }

  const banners = await PopupBannerService.getBanners({
    status,
    position,
    limit: Math.min(parseInt(limit), 10)
  })
  return res.apiSuccess({ banners }, '查询成功')
})

// ✅ 聊天：RESTful 资源嵌套（保留 /system/chat 前缀）
router.post('/chat/sessions', authenticateToken, async (req, res) => {
  const session = await ChatService.createSession({
    user_id: req.user.user_id,
    source: req.body.source || 'mobile'
  })
  return res.apiSuccess({ session }, '会话创建成功')
})

router.get('/chat/sessions/:session_id/messages', authenticateToken, async (req, res) => {
  const { page = 1, limit = 50 } = req.query
  const result = await ChatService.getMessages(req.params.session_id, {
    user_id: req.user.user_id,
    page: parseInt(page),
    limit: Math.min(parseInt(limit), 100)
  })
  return res.apiSuccess(result, '获取消息成功')
})

// ✅ 统计：按形态拆分 endpoint + query 筛选（保留 /system/statistics 前缀）
router.get('/statistics/charts', authenticateToken, requireAdmin, async (req, res) => {
  const { days = 30 } = req.query
  const data = await ReportingService.getChartsData(parseInt(days))
  return res.apiSuccess(data, '图表数据查询成功')
})

router.get('/statistics/report', authenticateToken, requireAdmin, async (req, res) => {
  const { period = 'week' } = req.query
  const days = period === 'week' ? 7 : period === 'month' ? 30 : 365
  const data = await ReportingService.getChartsData(days)
  return res.apiSuccess(data, '报表数据查询成功')
})

router.get('/statistics/export', authenticateToken, requireAdmin, async (req, res) => {
  const { days = 30 } = req.query
  const excelBuffer = await ReportingService.exportToExcel(parseInt(days))

  // 文件下载：不使用 ApiResponse 包装（规范允许的特例）
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  res.setHeader('Content-Disposition', `attachment; filename="统计报表_${days}天.xlsx"`)
  return res.send(excelBuffer)
})

// ✅ 抽奖：单一 Canonical（/draw，删除 /execute）
router.post('/lottery/draw', authenticateToken, async (req, res) => {
  const { campaign_code, draw_count = 1 } = req.body

  // 强制幂等 + 审计
  const result = await LotteryEngine.execute_draw(
    req.user.user_id,
    campaign_code,
    draw_count,
    { business_id: `draw_${Date.now()}_${uuid}` } // 幂等键
  )

  return res.apiSuccess(result, '抽奖成功', 'DRAW_SUCCESS')
})
```

### 4.2 维护复杂度控制标准

#### 4.2.1 禁止路径别名

```javascript
// ❌ 禁止：多套路径指向同一逻辑
router.get('/old-path', handler)
router.get('/new-path', handler)
router.get('/alias-path', handler)

// ✅ 强制：单一Canonical路径
router.get('/canonical-path', handler)
```

#### 4.2.2 禁止版本内路径变更

**同一API版本内禁止路径变更**，如需变更则升级API版本号

```javascript
// ❌ 禁止：v4版本内路径变更后保留旧路径
router.get('/api/v4/old-path', ...)  // v4.0路径
router.get('/api/v4/new-path', ...)  // v4.1路径（错误）

// ✅ 正确：升级版本
router.get('/api/v4/old-path', ...)  // v4.x路径
router.get('/api/v5/new-path', ...)  // v5.0新路径
```

### 4.3 响应格式标准

**核心要求**:

- 所有 API 响应使用统一格式（`success/code/message/data/timestamp/version/request_id`）
- **HTTP 状态码与业务码明确分离**：
  - HTTP 状态码：传输层（200/400/401/403/404/500）
  - 业务码（`code` 字段）：业务逻辑分类（字符串枚举）
- 404 处理器必须包含所有标准字段
- 全局错误处理必须使用 `ApiResponse` 标准格式

**响应格式示例**:

```javascript
// ✅ 成功响应（HTTP 200）
{
  "success": true,
  "code": "SUCCESS",
  "message": "操作成功",
  "data": { /* 业务数据 */ },
  "timestamp": "2025-12-23T10:30:00.000+08:00",
  "version": "v4.0",
  "request_id": "req_a1b2c3d4-e5f6-7890-abcd-ef1234567890"
}

// ✅ 参数错误（HTTP 400）
{
  "success": false,
  "code": "INVALID_PARAMS",
  "message": "参数验证失败",
  "data": { "errors": ["status 必须是 active/draft/expired"] },
  "timestamp": "2025-12-23T10:30:00.000+08:00",
  "version": "v4.0",
  "request_id": "req_a1b2c3d4-e5f6-7890-abcd-ef1234567890"
}

// ✅ 权限不足（HTTP 403）
{
  "success": false,
  "code": "FORBIDDEN",
  "message": "权限不足：只能查询 active 状态弹窗",
  "data": null,
  "timestamp": "2025-12-23T10:30:00.000+08:00",
  "version": "v4.0",
  "request_id": "req_a1b2c3d4-e5f6-7890-abcd-ef1234567890"
}
```

详细响应格式标准参见 `.cursor/rules/08-生产质量保证标准.mdc` 第1节。

---

## 第五部分：质量度量与监控

### 5.1 路径一致性指标

**定义**: 所有功能使用 Canonical Path 的比例

**目标**: 100%

**测量方法**:

```bash
# 扫描所有路由定义，检查是否存在非 Canonical 路径
npm run validate:routes

# 或手动扫描
grep -r "router\.(get|post|put|delete)" routes/v4/
```

### 5.2 参数一致性指标

**定义**: 相同语义参数使用统一命名的比例

**目标**: 100%

**测量方法**:

```bash
# 检查是否存在语义不清的裸参数名
grep -r "req\.body\.code\|req\.query\.code" routes/v4/
grep -r "req\.params\.id[^_]" routes/v4/
```

### 5.3 幂等性与审计覆盖率

**定义**: 所有交易/扣减类写操作包含 `business_id` 幂等键和审计日志的比例

**目标**: 100%

**测量方法**:

```bash
# 检查交易类操作是否包含 business_id
grep -r "TradeOrder\|AssetTransaction\|MarketListing" routes/v4/ | grep -c "business_id"

# 检查是否记录审计日志
grep -r "AdminOperationLog" routes/v4/ | wc -l
```

### 5.4 预期收益度量

| 维度           | 当前状态              | 重构后状态             | 改进幅度 |
| -------------- | --------------------- | ---------------------- | -------- |
| **路径一致性** | 70%（多处路径不一致） | 100%（唯一 canonical） | +30%     |
| **参数一致性** | 80%（code 语义混乱）  | 100%（语义明确命名）   | +20%     |
| **维护复杂度** | 高（多套路径/参数）   | 低（单一规范）         | -70%     |
| **幂等性覆盖** | 60%（部分缺失）       | 100%（强制要求）       | +40%     |

---

## 第六部分：后端实施方案

### 6.1 实施优先级

#### P0 级（立即执行，1周内完成）

- [ ] **参数名统一**: 移除所有"语义不清的裸 `code`"，强制使用语义明确的命名
  - [ ] `routes/v4/auth/login.js`：`code` → `verification_code`
  - [ ] `routes/v4/auth/wechat.js`：`code` → `wx_code`
  - [ ] `routes/v4/auth/oauth.js`：`code` → `authorization_code`
  - [ ] `routes/v4/shop/redemption/`：`code` → `redeem_code`

- [ ] **路由硬切断**: 直接删除所有非 canonical 路径（404，不保留 301/410）
  - [ ] `routes/v4/system/popup-banners.js`：删除 `/popup-banners/active`，改为 `?status=active`
  - [ ] `routes/v4/system/chat.js`：删除 `/chat/create|send`，改为 `/chat/sessions` 嵌套
  - [ ] `routes/v4/system/chat.js`：删除 `/chat/history/:id`，改为 `/chat/sessions/:id/messages`
  - [ ] `routes/v4/lottery/`：确认不存在 `/execute` 路由（当前已是 `/draw`）

- [ ] **幂等性与审计**: 所有交易/扣减类写操作添加 `business_id` + 审计日志
  - [ ] `routes/v4/lottery/draw.js`：确认包含 `business_id` 幂等键
  - [ ] `routes/v4/market/`：确认所有交易操作包含审计日志
  - [ ] `routes/v4/shop/`：确认所有扣减操作使用事务保护

#### P1 级（2周内完成）

- [ ] **契约文档生成**: 基于 canonical path 生成 OpenAPI 3.0 规范
- [ ] **自动化测试**: 基于契约生成 API 集成测试用例
- [ ] **路由扫描工具**: 自动检测非 canonical 路径和参数命名违规

### 6.2 后端路由迁移清单

#### 6.2.1 参数重命名清单

| 功能       | 旧参数 | 新参数               | 影响路由文件                 |
| ---------- | ------ | -------------------- | ---------------------------- |
| 登录       | `code` | `verification_code`  | `routes/v4/auth/login.js`    |
| 微信登录   | `code` | `wx_code`            | `routes/v4/auth/wechat.js`   |
| OAuth 授权 | `code` | `authorization_code` | `routes/v4/auth/oauth.js`    |
| 兑换码     | `code` | `redeem_code`        | `routes/v4/shop/redemption/` |

#### 6.2.2 路由路径迁移清单（硬切断策略）

| 功能       | 旧路径（硬切断删除，404）         | Canonical Path（唯一保留）                                          | 路由文件                            |
| ---------- | --------------------------------- | ------------------------------------------------------------------- | ----------------------------------- |
| 登录       | 参数 `code`                       | ✅ `POST /api/v4/auth/login`（参数: `verification_code`）           | `routes/v4/auth/login.js`           |
| 弹窗查询   | `GET /popup-banners/active`       | ✅ `GET /popup-banners?status=active&position=home`                 | `routes/v4/system/popup-banners.js` |
| 创建会话   | `POST /chat/create`               | ✅ `POST /chat/sessions`                                            | `routes/v4/system/chat.js`          |
| 会话消息   | `GET /chat/history/:session_id`   | ✅ `GET /chat/sessions/:session_id/messages`                        | `routes/v4/system/chat.js`          |
| 发送消息   | `POST /chat/send`                 | ✅ `POST /chat/sessions/:session_id/messages`                       | `routes/v4/system/chat.js`          |
| 通知未读数 | `GET /notifications/unread-count` | ✅ `GET /notifications?status=unread`（响应含 `meta.unread_count`） | `routes/v4/system/notifications.js` |
| 抽奖执行   | `POST /lottery/execute`           | ✅ `POST /lottery/draw`（强制幂等 + 审计）                          | `routes/v4/lottery/draw.js`         |

**说明**: 表格中路径省略了 `/api/v4/system` 或 `/api/v4/lottery` 前缀，完整路径参见 Canonical Path 映射表。

### 6.3 风险与应对（硬切断策略）

#### 风险1: 开发期间可能遗漏某些路径

**应对**:

- 建立路径扫描脚本（检查所有非 canonical 路径）
- Code Review 强制检查路径规范性
- CI/CD 流程增加路径规范性检查

```bash
# 路径规范性检查脚本
npm run validate:routes  # 扫描所有路由，检测非 canonical 路径

# 手动检查非 canonical 路径
grep -r "router\.(get|post)" routes/v4/ | grep -E "(active|create|send|history|execute)"

# 检查语义不清的参数名
grep -r "req\.body\.code[^_]" routes/v4/
grep -r "req\.query\.type[^_]" routes/v4/
```

### 6.4 迁移策略代码示例（硬切断）

```javascript
// ❌ 禁止：保留旧路径（直接删除，404）
router.get('/popup-banners/active', ...)       // 删除
router.post('/chat/create', ...)               // 删除
router.post('/chat/send', ...)                 // 删除
router.get('/chat/history/:id', ...)           // 删除
router.post('/lottery/execute', ...)           // 删除

// ✅ 强制：只保留 canonical path（routes/v4/system/popup-banners.js）
router.get('/popup-banners', async (req, res) => {
  const { status = 'active', position = 'home', limit = 10 } = req.query

  // 参数枚举验证
  const validStatus = ['active', 'draft', 'expired']
  const validPosition = ['home', 'profile']

  if (!validStatus.includes(status)) {
    return res.apiBadRequest(`无效的 status 参数，允许值: ${validStatus.join('/')}`)
  }

  // 权限控制：非管理员只能请求 active
  if (!req.user?.is_admin && status !== 'active') {
    return res.apiForbidden('权限不足：只能查询 active 状态弹窗')
  }

  const banners = await PopupBannerService.getBanners({
    status,
    position,
    limit: Math.min(parseInt(limit), 10)
  })
  return res.apiSuccess({ banners }, '查询成功')
})

// ✅ 强制：聊天 RESTful 嵌套（routes/v4/system/chat.js）
router.post('/chat/sessions', authenticateToken, async (req, res) => {
  const session = await ChatService.createSession({
    user_id: req.user.user_id,
    source: req.body.source || 'mobile'
  })
  return res.apiSuccess({ session }, '会话创建成功')
})

router.get('/chat/sessions/:session_id/messages', authenticateToken, async (req, res) => {
  const { page = 1, limit = 50 } = req.query
  const result = await ChatService.getMessages(req.params.session_id, {
    user_id: req.user.user_id,
    page: parseInt(page),
    limit: Math.min(parseInt(limit), 100)
  })
  return res.apiSuccess(result, '获取消息成功')
})

// ✅ 强制：统计按形态拆分（routes/v4/system/statistics.js）
router.get('/statistics/charts', authenticateToken, requireAdmin, async (req, res) => {
  const { days = 30 } = req.query
  const data = await ReportingService.getChartsData(parseInt(days))
  return res.apiSuccess(data, '图表数据查询成功')
})

router.get('/statistics/report', authenticateToken, requireAdmin, async (req, res) => {
  const { period = 'week' } = req.query
  const days = period === 'week' ? 7 : period === 'month' ? 30 : 365
  const data = await ReportingService.getChartsData(days)
  return res.apiSuccess(data, '报表数据查询成功')
})

router.get('/statistics/export', authenticateToken, requireAdmin, async (req, res) => {
  const { days = 30 } = req.query
  const excelBuffer = await ReportingService.exportToExcel(parseInt(days))

  // 文件下载特例：不使用 ApiResponse 包装
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  res.setHeader('Content-Disposition', `attachment; filename="统计报表_${days}天.xlsx"`)
  return res.send(excelBuffer)
})

// ✅ 强制：抽奖单一路径（routes/v4/lottery/draw.js）
router.post('/lottery/draw', authenticateToken, async (req, res) => {
  const { campaign_code, draw_count = 1 } = req.body

  // 强制幂等 + 审计
  const result = await LotteryEngine.execute_draw(
    req.user.user_id,
    campaign_code,
    draw_count,
    { business_id: `draw_${Date.now()}_${uuid}` }  // 幂等键
  )

  return res.apiSuccess(result, '抽奖成功', 'DRAW_SUCCESS')
})
```

---

## 附录A：快速参考

### A.1 参数命名速查表

| 场景       | ✅ 推荐命名                        | ❌ 禁止命名 | 说明                         |
| ---------- | ---------------------------------- | ----------- | ---------------------------- |
| 短信验证码 | `verification_code` / `sms_code`   | `code`      | 登录/注册场景                |
| 微信登录   | `wx_code` / `js_code`              | `code`      | 微信小程序临时凭证           |
| OAuth 授权 | `authorization_code` / `auth_code` | `code`      | OAuth 2.0 授权码             |
| 用户 ID    | `user_id`                          | `id`        | 所有用户相关接口             |
| 订单 ID    | `order_id`                         | `id`        | 所有订单相关接口             |
| 会话 ID    | `session_id`                       | `id`        | 聊天会话相关接口             |
| 用户类型   | `user_type`                        | `type`      | 用户分类场景                 |
| 订单状态   | `order_status`                     | `status`    | 订单状态查询                 |
| 弹窗状态   | `status`                           | -           | 枚举：`active/draft/expired` |
| 弹窗位置   | `position`                         | -           | 枚举：`home/profile`         |

### A.2 路径设计速查表

| 场景               | ✅ 推荐路径                                      | ❌ 禁止路径                                     |
| ------------------ | ------------------------------------------------ | ----------------------------------------------- |
| 资源列表（带过滤） | `GET /api/v4/system/popup-banners?status=active` | `GET /api/v4/system/popup-banners/active`       |
| 资源嵌套           | `GET /api/v4/system/chat/sessions/:id/messages`  | `GET /api/v4/system/chat/history/:id`           |
| 状态迁移           | `POST /api/v4/system/notifications/:id/read`     | `POST /api/v4/system/notifications/read/:id`    |
| 创建资源           | `POST /api/v4/system/chat/sessions`              | `POST /api/v4/system/chat/create`               |
| 按形态拆分         | `GET /api/v4/system/statistics/charts?days=7`    | `GET /api/v4/system/statistics?type=charts`     |
| 域前缀完整         | `GET /api/v4/system/statistics/charts`           | `GET /api/v4/statistics/charts`（缺少 /system） |

### A.3 常见错误与修正

| 错误模式                                       | 正确做法                                         |
| ---------------------------------------------- | ------------------------------------------------ |
| `const code = req.body.code`                   | `const { verification_code } = req.body`         |
| `GET /api/v4/system/popup-banners/active`      | `GET /api/v4/system/popup-banners?status=active` |
| `GET /api/v4/statistics/charts`                | `GET /api/v4/system/statistics/charts?days=30`   |
| `POST /api/v4/system/chat/create`              | `POST /api/v4/system/chat/sessions`              |
| `POST /api/v4/system/chat/send`                | `POST /api/v4/system/chat/sessions/:id/messages` |
| `GET /api/v4/system/chat/history/:id`          | `GET /api/v4/system/chat/sessions/:id/messages`  |
| `POST /api/v4/lottery/execute`                 | `POST /api/v4/lottery/draw`                      |
| `GET /api/v4/system/statistics?type=charts`    | `GET /api/v4/system/statistics/charts?days=7`    |
| `router.get('/old', h); router.get('/new', h)` | `router.get('/canonical', h)`                    |

---

## 附录B：决策记录

### B.1 核心决策

> **决策时间**: 2025-12-22 09:15:00 (北京时间)  
> **决策原则**: 彻底重构统一技术，降低维护复杂度，不兼容旧方案

#### 决策1：禁止语义不清的参数名

**理由**: `code` 在同一系统中可能同时表示"验证码 / 授权码 / 错误码 / 兑换码 / 活动码"，全局禁用会逼出更奇怪的命名。按语义命名 + 明确前缀才是正解。

#### 决策2：每个能力只有一个 Canonical Path

**理由**: 多套路径共存导致维护复杂度指数级增长，路由定义分散，新人上手时间长。

#### 决策3：硬切断旧路径（不保留兼容）

**理由**: 保留兼容逻辑会导致代码复杂度持续增长，技术债务无法清理。

**策略**: 直接删除旧路由定义（不保留 301/410 引导），调用方收到 404。

#### 决策4：统计接口按形态拆分 endpoint（保留 /system 域前缀）

**理由**: `/charts`、`/report`、`/export` 虽然调用同一 Service 方法，但在实际业务中代表不同的数据呈现形态（图表 JSON vs 报表 JSON vs 导出 Excel），且未来可能需要不同的缓存策略、限流策略、审计策略、权限控制与导出格式。按形态拆分比 `?type=` 大一统更利于长期维护与治理。

**Canonical 路径**: `/api/v4/system/statistics/charts|report|export`（保留 `/system` 前缀，符合域划分规范）

#### 决策5：抽奖接口统一使用 /draw

**理由**: `/draw` 和 `/execute` 功能完全重复，保留 `/draw` 作为唯一 canonical path，删除 `/execute`。

**Canonical 路径**: `POST /api/v4/lottery/draw`（强制幂等 + 审计）

#### 决策6：弹窗接口参数枚举化 + 权限控制

**理由**: `status`/`position` 参数需要明确的枚举值和默认值，避免参数验证逻辑不一致。同时非管理员只能请求 `status=active`，保证数据安全。

**参数规范**:

- `status`: 枚举（`active`/`draft`/`expired`），默认 `active`
- `position`: 枚举（`home`/`profile`），默认 `home`
- `limit`: 数量限制（1-10），默认 10
- **权限**: 非管理员只能请求 `status=active`

#### 决策7：聊天接口 RESTful 嵌套（保留 /system/chat 前缀）

**理由**: 符合 RESTful 资源嵌套标准，且保持与现有域结构一致。

**Canonical 路径**:

- `POST /api/v4/system/chat/sessions`
- `GET /api/v4/system/chat/sessions`
- `GET /api/v4/system/chat/sessions/:session_id/messages`
- `POST /api/v4/system/chat/sessions/:session_id/messages`

#### 决策8：HTTP 状态码与业务码分离

**理由**: HTTP 状态码用于传输层（200/400/401/403/404/500），业务码（`code` 字段）用于业务逻辑分类，两者分离更符合契约/可观测性/监控告警要求。

**规范**: 所有响应统一包含 `success/code/message/data/timestamp/version/request_id` 字段，HTTP 状态码根据错误类型设置。

**实现**: 使用 `ApiResponse.middleware()` 注入统一响应方法，全局错误处理器自动设置正确的 HTTP 状态码。

---

_文档结束_
