# 路由层错误处理统一执行方案

> 解决的问题：项目 194 个路由文件中存在三套错误处理模式并存（裸 try/catch、handleServiceError、asyncHandler），导致同一个业务错误在不同路由返回不同的 HTTP 状态码和错误码，新人写路由需要猜用哪种模式
>
> 关联文档：`docs/coding-style-unification-2026-04-10.md` 第四章 4.4、第七章 7.3.3、阶段 2
>
> 创建日期：2026-04-24
>
> 目标终态：路由层零 try/catch 样板代码，全部使用 asyncHandler + 全局错误中间件（美团/腾讯标准）

---

## 一、当前状态（2026-04-24 实测）

### 1.1 路由文件错误处理分布

| 模式 | 文件数 | 说明 |
|------|--------|------|
| handleServiceError | 67 | catch 块调用 `handleServiceError(error, res, msg)` |
| 纯 asyncHandler（无 try/catch） | 22 | `asyncHandler(async (req, res) => { ... })`，错误自动 `catch(next)` → 全局中间件 |
| asyncHandler + try/catch 混用 | 32 | 部分路由用 asyncHandler，部分路由手写 try/catch |
| 裸 try/catch（GENERIC） | 66 | catch 块手写 `res.apiError(error.message, error.code \|\| 'INTERNAL_ERROR', null, error.statusCode \|\| 500)` |
| 裸 try/catch（CUSTOM） | 12 | catch 块有自定义 `error.code === 'XXX'` 分支判断 |
| **合计** | **~194** | 不含 index.js 路由聚合文件 |

### 1.2 服务层错误抛出分布

| 错误类型 | 数量 | 说明 |
|----------|------|------|
| `throw new Error('中文消息')` | 721 处 | 普通 Error，无 code 无 statusCode |
| `throw new BusinessError(msg, code, status)` | 79 处 | 自定义业务异常，带 code + statusCode |
| **合计** | **800 处** | 分布在 200+ 个服务文件中 |

721 个 `throw new Error` 中的消息关键词分布：

| 关键词 | 数量 | 应映射的 HTTP 状态码 |
|--------|------|---------------------|
| "不存在" / "未找到" | 226 | 404 |
| "不能" / "不足" / "无效" / "已存在" 等 | 239 | 400 |
| "无权限" / "权限不足" | 9 | 403 |
| 无关键词（纯技术错误） | 247 | 500 |

### 1.3 现有基础设施

| 组件 | 位置 | 状态 |
|------|------|------|
| `handleServiceError` | `middleware/validation.js:237-300` | 67 个文件在用，稳定 |
| `asyncHandler` | `middleware/validation.js:496-500` | 54 个文件在用，稳定 |
| `BusinessError` | `utils/BusinessError.js` | 4 个服务文件在用 |
| 全局错误中间件 | `app.js:854-924` | 存在但被架空（路由层 catch 拦截了错误） |

### 1.4 核心问题

同一个服务层错误 `throw new Error('座席不存在')` 在不同路由的返回结果：

```
handleServiceError 路由 → { status: 404, code: "NOT_FOUND" }        ✅ 正确
裸 try/catch 路由       → { status: 500, code: "INTERNAL_ERROR" }   ❌ 错误
asyncHandler 路由       → { status: 500, code: "INTERNAL_SERVER_ERROR" } ❌ 错误
                          （全局中间件不识别普通 Error 的消息关键词）
```

---

## 二、分步执行方案

### 为什么分两步

```
服务层现状：
  BusinessError（带 code + statusCode）→  79 处（11%）
  普通 Error（无 code 无 statusCode）  → 721 处（89%）← 这是瓶颈

如果直接做第二步（全部改 asyncHandler + 全局中间件）：
  721 个普通 Error → 全局中间件 → 全部返回 500
  226 个"不存在"错误从 404 退化成 500 ← API 行为退化

必须先做第一步（handleServiceError 兜底），再做第二步（服务层 Error → BusinessError）
```

---

## 三、第一步：路由层 catch 块统一到 handleServiceError

### 3.1 目标

- 78 个文件（66 GENERIC + 12 CUSTOM）的 catch 块统一使用 `handleServiceError`
- 完成后路由层只剩两种模式：handleServiceError（145 个）和 asyncHandler（22 个纯 + 32 个混用中的 asyncHandler 部分）
- 消除"裸 try/catch + 手写 res.apiError"模式

### 3.2 改动规则

#### GENERIC 文件（66 个）— 机械替换

改前：

```javascript
catch (error) {
  logger.error('获取xxx失败:', error)
  res.apiError(error.message, error.code || 'INTERNAL_ERROR', null, error.statusCode || 500)
}
```

改后：

```javascript
catch (error) {
  logger.error('获取xxx失败:', error)
  return handleServiceError(error, res, '获取xxx失败')
}
```

文件顶部确保有：

```javascript
const { handleServiceError } = require('对应相对路径/middleware/validation')
```

#### CUSTOM 文件（12 个）— 保留自定义逻辑，fallback 改为 handleServiceError

改前：

```javascript
catch (error) {
  if (error.code === 'SMS_RATE_LIMIT') {
    return res.apiError('发送过于频繁', 'RATE_LIMIT', null, 429)
  }
  logger.error('发送验证码失败:', error)
  res.apiError(error.message || '发送失败', 'INTERNAL_ERROR', null, 500)
}
```

改后：

```javascript
catch (error) {
  if (error.code === 'SMS_RATE_LIMIT') {
    return res.apiError('发送过于频繁', 'RATE_LIMIT', null, 429)
  }
  logger.error('发送验证码失败:', error)
  return handleServiceError(error, res, '发送验证码失败')
}
```

只改最后的 fallback 分支，自定义 error.code 判断保持不动。

### 3.3 GENERIC 文件清单（66 个，约 380 处 catch 块）

| 文件 | catch 块数 |
|------|-----------|
| `routes/v4/console/ad/ad-campaigns.js` | 17 |
| `routes/v4/console/exchange/items.js` | 15 |
| `routes/v4/console/lottery/lottery-simulation.js` | 15 |
| `routes/v4/console/lottery/lottery-campaigns.js` | 13 |
| `routes/v4/console/operations/batch-operations.js` | 13 |
| `routes/v4/console/operations/feature-flags.js` | 12 |
| `routes/v4/console/merchant/debt-management.js` | 11 |
| `routes/v4/console/lottery/prize_pool.js` | 11 |
| `routes/v4/console/operations/reminder-rules.js` | 11 |
| `routes/v4/console/user/user_management.js` | 11 |
| `routes/v4/console/lottery/lottery-configs.js` | 10 |
| `routes/v4/console/analytics/report-templates.js` | 9 |
| `routes/v4/console/config/audit-rollback.js` | 9 |
| `routes/v4/console/operations/item-templates.js` | 9 |
| `routes/v4/console/operations/attributes.js` | 8 |
| `routes/v4/console/lottery/lottery-quota.js` | 8 |
| `routes/v4/system/notifications.js` | 8 |
| `routes/v4/user/ad-campaigns.js` | 8 |
| `routes/v4/console/user/user-segments.js` | 8 |
| `routes/v4/console/customer-service/agents.js` | 7 |
| `routes/v4/console/config/sessions.js` | 7 |
| `routes/v4/console/lottery/lottery-strategy-stats.js` | 7 |
| `routes/v4/console/merchant/merchant-points.js` | 7 |
| `routes/v4/console/operations/categories.js` | 7 |
| `routes/v4/console/user/user-hierarchy.js` | 7 |
| `routes/v4/console/ad/ad-slots.js` | 6 |
| `routes/v4/console/merchant/regions.js` | 6 |
| `routes/v4/console/user/user-ratio-overrides.js` | 6 |
| `routes/v4/console/marketplace/orders.js` | 5 |
| `routes/v4/console/lottery/lottery-realtime.js` | 5 |
| `routes/v4/console/operations/material.js` | 5 |
| `routes/v4/console/risk/risk-profiles.js` | 5 |
| `routes/v4/console/ad/ad-reports.js` | 4 |
| `routes/v4/console/analytics/analytics.js` | 4 |
| `routes/v4/console/assets/portfolio.js` | 4 |
| `routes/v4/console/config/settings.js` | 4 |
| `routes/v4/console/customer-service/assignments.js` | 4 |
| `routes/v4/console/lottery/lottery-health.js` | 4 |
| `routes/v4/console/user/user-premium.js` | 4 |
| `routes/v4/merchant-points.js` | 4 |
| `routes/v4/user/notifications.js` | 4 |
| `routes/v4/console/customer-service/messages.js` | 3 |
| `routes/v4/console/customer-service/sessions.js` | 3 |
| `routes/v4/console/lottery/lottery-statistics.js` | 3 |
| `routes/v4/console/operations/reminder-history.js` | 3 |
| `routes/v4/console/risk/consumption-anomaly.js` | 3 |
| `routes/v4/system/ad-events.js` | 3 |
| `routes/v4/console/user/user-behavior-tracks.js` | 3 |
| `routes/v4/console/assets/index.js` | 2 |
| `routes/v4/console/config/config.js` | 2 |
| `routes/v4/console/lottery/lottery-campaign-analysis.js` | 2 |
| `routes/v4/console/lottery/lottery-report.js` | 2 |
| `routes/v4/console/operations/item-lifecycle.js` | 2 |
| `routes/v4/console/user/segment-rules.js` | 2 |
| `routes/v4/console/system/feedbacks.js` | 2 |
| `routes/v4/console/assets/transactions.js` | 1 |
| `routes/v4/console/dashboard/stats.js` | 1 |
| `routes/v4/console/system/monitoring.js` | 1 |
| `routes/v4/system/ad-delivery.js` | 1 |
| `routes/v4/user/ad-slots.js` | 1 |
| `routes/v4/user/index.js` | 1 |
| `routes/v4/console/shared/middleware.js` | — |
| `routes/v4/auth/token.js` | — |
| `routes/v4/console/config/auth.js` | — |
| `routes/v4/console/config/platform-star-stone.js` | — |
| `routes/v4/console/config/asset-adjustment.js` | 3 |

### 3.4 CUSTOM 文件清单（12 个）

| 文件 | 自定义 error.code 判断 |
|------|----------------------|
| `routes/v4/auth/login.js` | `SMS_RATE_LIMIT` → 429 |
| `routes/v4/auth/permissions.js` | 权限相关自定义码 |
| `routes/v4/activities.js` | 活动状态相关自定义码 |
| `routes/v4/images.js` | 上传相关自定义码 |
| `routes/v4/console/analytics/campaign-budget.js` | 预算相关自定义码 |
| `routes/v4/console/analytics/multi-dimension-stats.js` | 统计相关自定义码 |
| `routes/v4/console/lottery/adjustment.js` | 调整相关自定义码 |
| `routes/v4/console/lottery/force-control.js` | 强控相关自定义码 |
| `routes/v4/console/lottery/interventions.js` | 干预相关自定义码 |
| `routes/v4/console/lottery/user-status.js` | 用户状态相关自定义码 |
| `routes/v4/lottery/lottery-preset.js` | 预设相关自定义码 |
| `routes/v4/system/dictionaries.js` | 字典相关自定义码 |

### 3.5 handleServiceError 关键词映射规则（已有，不需要修改）

```
优先级 1：error.statusCode 存在 → 直接使用（BusinessError 走这条路）
优先级 2：消息包含"不存在/未找到" → 404 NOT_FOUND
优先级 3：消息包含"无权限/权限不足" → 403 FORBIDDEN
优先级 4：消息包含"不能/不支持/无效/不可用/过期/超出/不足/未绑定/已被禁用/已存在/已被占用/已离职/状态异常/必须/必填" → 400 BAD_REQUEST
优先级 5：SequelizeDatabaseError → 500 DATABASE_ERROR
优先级 6：SequelizeConnectionError → 503 SERVICE_UNAVAILABLE
优先级 7：SequelizeValidationError → 400 BAD_REQUEST
优先级 8：SequelizeTimeoutError → 504 DATABASE_TIMEOUT
优先级 9：默认 → 500 INTERNAL_ERROR
```

### 3.6 预计工作量

| 项目 | 工时 |
|------|------|
| 66 个 GENERIC 文件 catch 块替换 | 4-5h |
| 12 个 CUSTOM 文件 fallback 替换 | 1-2h |
| 补充 require 导入语句 | 含在上面 |
| 回归测试（47 + 187 = 234 个测试） | 0.5h |
| **合计** | **6-8h** |

### 3.7 验收标准

- [ ] `grep -rL 'handleServiceError' routes/v4/ --include="*.js" | xargs grep -l 'res\.apiError.*INTERNAL_ERROR'` 返回 0 个文件
- [ ] 回归测试 47/47 通过
- [ ] API 契约测试 187/187 通过
- [ ] Health Check healthy
- [ ] ESLint 不新增 error（JSDoc 相关的 201 个不计入）

### 3.8 完成后的效果

```
改动前：
  throw new Error('座席不存在')
  → 裸 try/catch 路由 → { status: 500, code: "INTERNAL_ERROR" }   ❌

改动后：
  throw new Error('座席不存在')
  → handleServiceError → { status: 404, code: "NOT_FOUND" }       ✅

路由层模式从 5 种收敛为 2 种：
  ① handleServiceError（~145 个文件）
  ② 纯 asyncHandler（22 个文件）
```

---

## 四、第二步：服务层 Error → BusinessError 迁移 + 路由层去 try/catch

### 4.1 目标

- 服务层 721 个 `throw new Error('中文消息')` 全部改为 `throw new BusinessError(msg, code, statusCode)`
- 路由层去掉所有 try/catch，全部使用 `asyncHandler` 包裹
- 全局错误中间件正式启用，不再被架空
- 达到美团/腾讯标准：路由层零 try/catch 样板代码

### 4.2 前提条件

- 第一步已完成（handleServiceError 作为安全垫，迁移过程中未改完的域不会退化）

### 4.3 服务层 throw new Error 按业务域分布（721 处）

| 业务域 | 目录 | throw new Error 数量 | 优先级 |
|--------|------|---------------------|--------|
| 兑换域 | `services/exchange/` | 82 | P1（已有 72 处 BusinessError，混用最严重） |
| 资产域 | `services/asset/` | 68 | P1（核心交易链路） |
| 抽奖域 | `services/lottery/` + `services/prize-pool/` | 64 | P1（核心业务） |
| 引擎域 | `services/UnifiedLotteryEngine/` | 35 | P2 |
| 拍卖域 | `services/auction/` | 32 | P2 |
| 消费域 | `services/consumption/` | 27 | P1（已有 7 处 BusinessError） |
| 交易域 | `services/TradeOrderService.js` | 23 | P1（核心交易链路） |
| 客服域 | `services/CustomerServiceSessionService.js` | 23 | P3 |
| 员工域 | `services/StaffManagementService.js` | 19 | P3 |
| 交易纠纷 | `services/TradeDisputeService.js` | 18 | P2 |
| 广告域 | `services/AdCampaignService.js` + `services/ad/` | 17 | P3 |
| 市场挂牌 | `services/market-listing/` | 16 | P2 |
| 兑换管理 | `services/RedemptionAdminService.js` + `services/RedemptionService.js` | 30 | P2 |
| 分群规则 | `services/SegmentRuleService.js` | 15 | P3 |
| 角色管理 | `services/RoleManagementService.js` | 14 | P3 |
| 审批链 | `services/ApprovalChainService.js` | 14 | P3 |
| 门店域 | `services/StoreService.js` | 12 | P3 |
| 风控域 | `services/MerchantRiskAlertService.js` | 12 | P3 |
| 反馈域 | `services/FeedbackService.js` | 12 | P3 |
| 其他（30+ 个文件） | 各根级服务 | ~98 | P3 |

### 4.4 错误码命名规范

按域拆分前缀，与已有 BusinessError 的 `CONSUMPTION_*` 模式保持一致：

```
资产域：    ASSET_*          （如 ASSET_INSUFFICIENT_BALANCE、ASSET_NOT_FOUND）
兑换域：    EXCHANGE_*       （如 EXCHANGE_ITEM_NOT_FOUND、EXCHANGE_STOCK_INSUFFICIENT）
抽奖域：    LOTTERY_*        （如 LOTTERY_CAMPAIGN_NOT_FOUND、LOTTERY_PRIZE_EXHAUSTED）
消费域：    CONSUMPTION_*    （已有，保持不变）
交易域：    TRADE_*          （如 TRADE_ORDER_NOT_FOUND、TRADE_SELF_PURCHASE）
市场域：    MARKET_*         （如 MARKET_LISTING_NOT_FOUND、MARKET_STATUS_INVALID）
拍卖域：    AUCTION_*        （如 AUCTION_BID_TOO_LOW、AUCTION_ENDED）
客服域：    CS_*             （如 CS_SESSION_NOT_FOUND、CS_AGENT_OFFLINE）
广告域：    AD_*             （如 AD_CAMPAIGN_NOT_FOUND、AD_BUDGET_EXCEEDED）
门店域：    STORE_*          （如 STORE_NOT_FOUND、STORE_CODE_EXISTS）
用户域：    USER_*           （如 USER_NOT_FOUND、USER_DISABLED）
配置域：    CONFIG_*         （如 CONFIG_KEY_NOT_FOUND）
通用：      VALIDATION_*     （如 VALIDATION_REQUIRED_FIELD、VALIDATION_INVALID_FORMAT）
```

### 4.5 单个文件改造示例

改前（`services/StoreService.js`）：

```javascript
if (!storeData.store_name || storeData.store_name.trim() === '') {
  throw new Error('门店名称不能为空')
}
if (existingStore) {
  throw new Error(`门店编号 ${storeCode} 已存在`)
}
if (!assignedUser) {
  throw new Error(`分配的业务员 ID ${storeData.assigned_to} 不存在`)
}
```

改后：

```javascript
const BusinessError = require('../utils/BusinessError')

if (!storeData.store_name || storeData.store_name.trim() === '') {
  throw new BusinessError('门店名称不能为空', 'STORE_NAME_REQUIRED', 400)
}
if (existingStore) {
  throw new BusinessError(`门店编号 ${storeCode} 已存在`, 'STORE_CODE_EXISTS', 409)
}
if (!assignedUser) {
  throw new BusinessError(`分配的业务员 ID ${storeData.assigned_to} 不存在`, 'STORE_ASSIGNEE_NOT_FOUND', 404)
}
```

对应路由改造（第二步才做）：

改前：

```javascript
router.post('/', authenticateToken, async (req, res) => {
  try {
    const service = req.app.locals.services.getService('store')
    const result = await service.createStore(req.body)
    res.apiSuccess(result, '创建门店成功')
  } catch (error) {
    logger.error('创建门店失败:', error)
    return handleServiceError(error, res, '创建门店失败')
  }
})
```

改后：

```javascript
const { asyncHandler } = require('../../middleware/validation')

router.post('/', authenticateToken, asyncHandler(async (req, res) => {
  const service = req.app.locals.services.getService('store')
  const result = await service.createStore(req.body)
  res.apiSuccess(result, '创建门店成功')
}))
```

### 4.6 按域分批执行顺序

| 批次 | 业务域 | Error 数量 | 对应路由文件 | 预计工时 |
|------|--------|-----------|-------------|---------|
| 第 1 批 | 兑换域（已有 72 处 BusinessError） | 82 → 0 | exchange/*.js | 3-4h |
| 第 2 批 | 消费域（已有 7 处 BusinessError） | 27 → 0 | merchant/consumption.js | 2h |
| 第 3 批 | 资产域 | 68 → 0 | assets/*.js | 3-4h |
| 第 4 批 | 抽奖域 + 奖品池 | 64 → 0 | lottery/*.js | 3-4h |
| 第 5 批 | 交易域 + 市场挂牌 | 39 → 0 | marketplace/*.js | 2-3h |
| 第 6 批 | 引擎域 | 35 → 0 | （无直接路由） | 2h |
| 第 7 批 | 拍卖域 | 32 → 0 | bids/*.js | 2h |
| 第 8 批 | 客服域 + 员工域 | 42 → 0 | customer-service/*.js | 2-3h |
| 第 9 批 | 广告域 | 17 → 0 | ad/*.js | 1-2h |
| 第 10 批 | 其他（门店/风控/反馈/配置等） | ~98 → 0 | 各散落路由 | 4-5h |
| **合计** | | **721 → 0** | | **25-35h** |

每批完成后：
1. 该域的服务文件全部改为 BusinessError
2. 该域对应的路由文件去掉 try/catch，改为 asyncHandler
3. 跑回归测试 + API 契约测试
4. 未改完的域继续用 handleServiceError 兜底，不退化

### 4.7 验收标准

- [ ] `grep -rn "throw new Error(" services/ --include="*.js" | wc -l` 返回 0
- [ ] `grep -rn "try {" routes/v4/ --include="*.js" | wc -l` 返回 0（或仅剩 CUSTOM 文件的自定义判断）
- [ ] 所有路由使用 `asyncHandler` 包裹
- [ ] 全局错误中间件正式处理所有错误（不再被架空）
- [ ] 回归测试 47/47 通过
- [ ] API 契约测试 187/187 通过
- [ ] Health Check healthy

### 4.8 完成后的效果

```
改动前（第一步完成后）：
  throw new Error('座席不存在')
  → handleServiceError → { status: 404, code: "NOT_FOUND" }       ✅ 但错误码不够精确

改动后（两步都完成）：
  throw new BusinessError('座席不存在', 'CS_AGENT_NOT_FOUND', 404)
  → asyncHandler → catch(next) → 全局中间件
  → { status: 404, code: "CS_AGENT_NOT_FOUND" }                   ✅ 业务域精确错误码

路由层模式从 2 种收敛为 1 种：
  ① asyncHandler（全部路由文件）

路由代码：
  零 try/catch 样板代码
  零 handleServiceError 调用
  零 logger.error 调用（全局中间件统一记录）
  纯业务逻辑
```

---

## 五、两步完成后的整体对比

```
                    现状              第一步完成          两步都完成
                    ─────────────     ─────────────      ─────────────
路由层模式数         5 种              2 种               1 种
路由层样板代码       try/catch 遍布    try/catch 遍布     零样板代码
HTTP 状态码         ❌ 大量误报 500    ✅ 关键词自动分类   ✅ 服务层显式指定
错误码              ❌ INTERNAL_ERROR  ⚠️ 通用分类码       ✅ 业务域精确码
全局中间件          被架空             仍被架空            正式启用
新人写路由          要记住 catch 模板  要记住 catch 模板   只写业务逻辑
长期维护成本        高                 中                  低
行业对标            小公司水平         腾讯游戏运营后台    美团/腾讯微信支付
```

---

## 六、风险评估

| 风险 | 第一步 | 第二步 |
|------|--------|--------|
| API 行为退化 | 无（handleServiceError 只会更精确） | 无（每批完成后验证） |
| 服务层改动 | 无 | 有（721 处，但按域分批） |
| 路由层改动 | 78 个文件 catch 块替换 | 145 个文件去 try/catch |
| 测试覆盖 | 234 个测试验证 | 234 个测试验证 |
| 回滚难度 | 低（git revert 即可） | 中（按批次 revert） |
