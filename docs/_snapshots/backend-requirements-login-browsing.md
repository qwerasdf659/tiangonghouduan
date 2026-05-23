# 后端需求文档：未登录浏览 + 登录弹窗优化

**文档日期**: 2026-05-14  
**需求来源**: 微信小程序前端 UI/UX 优化  
**优先级**: 高  
**影响范围**: 认证中间件、抽奖活动路由、系统配置路由

---

## 一、项目技术架构概览（真实现状）

### 1.1 后端数据库项目（权威核心）

| 维度 | 技术选型 |
|------|----------|
| 运行时 | Node.js >= 20.18.0 |
| Web 框架 | Express.js ^4.18.2 |
| ORM | Sequelize ^6.35.2（MySQL 方言） |
| 数据库 | MySQL（`restaurant_points_dev`，Sealos 托管） |
| 缓存 | Redis（ioredis ^5.7.0） |
| 认证 | JWT（jsonwebtoken ^9.0.2）+ 会话表双层验证 |
| 限流 | express-rate-limit ^7.1.5 + Redis 滑动窗口 |
| 实时通信 | Socket.IO ^4.8.1 |
| 请求验证 | Joi ^17.11.0 |
| 日志 | Winston ^3.11.0 |

### 1.2 Web 管理后台前端（admin/）

| 维度 | 技术选型 |
|------|----------|
| 构建工具 | Vite ^6.4.1 |
| 响应式框架 | Alpine.js ^3.15.4 |
| CSS 框架 | Tailwind CSS ^3.4.19 |
| 架构模式 | MPA（多页应用，58 个独立 HTML 入口） |
| API 封装 | 原生 fetch 封装（`admin/src/api/base.js`） |
| 字段命名 | **与后端完全一致，snake_case** |

### 1.3 微信小程序前端（独立仓库，不在本项目中）

- 本仓库不包含小程序代码，小程序在独立仓库维护
- 后端已支持微信小程序：`WX_APPID`/`WX_SECRET` 配置、`WXBizDataCrypt` 解密工具、`wechat_mp` 平台标识
- 认证会话表 `authentication_sessions` 支持 `login_platform = 'wechat_mp'`

---

## 二、需求背景

当前小程序各页面在用户未登录时，大部分功能不可用或显示空白状态。为提升用户体验和转化率，需要实现"先浏览后登录"模式：

- 用户未登录时可以浏览内容（活动列表、商品列表、DIY 设计等）
- 用户点击交互按钮（参与活动、兑换商品、保存设计等）时弹出登录弹窗
- 登录方式支持：微信一键登录 + 手机验证码登录

---

## 三、后端现状分析（基于真实代码和数据库）

### 3.1 认证中间件体系（`middleware/auth.js`）

后端已有完善的双层认证中间件：

| 中间件 | 行为 | 适用场景 |
|--------|------|----------|
| `authenticateToken` | 强制认证，无 Token 返回 401 | 写操作、用户隐私数据 |
| `optionalAuth` | 可选认证，无 Token 也放行，有 Token 则解析 `req.user` | 公开浏览接口 |

**`optionalAuth` 关键行为**：
- 无 Authorization 头 → 直接 `next()`（匿名访问）
- 有 Token 但无效 → 仍然 `next()`（不阻断请求）
- 有 Token 且有效 → 设置 `req.user` + `req.role_level`
- **永远不返回 401**

### 3.2 当前路由认证状态（真实代码）

**已公开的接口（无需认证）**：

| 路由 | 认证方式 | 说明 |
|------|----------|------|
| `POST /api/v4/auth/login` | 无 | 验证码登录 |
| `POST /api/v4/auth/send-code` | 无 | 发送验证码 |
| `POST /api/v4/auth/quick-login` | 无 | 微信快速登录 |
| `POST /api/v4/auth/wx-code-login` | 无 | wx.login code 登录 |
| `POST /api/v4/auth/decrypt-phone` | 无 | 微信手机号解密 |
| `GET /api/v4/system/config/placement` | 无 | 活动位置配置 |
| `GET /api/v4/system/config/product-filter` | 无 | 商品筛选配置 |
| `GET /api/v4/system/config/feedback` | 无 | 反馈表单配置 |
| `GET /api/v4/system/config/settings` | 无 | 公开系统配置（白名单过滤） |
| `GET /api/v4/system/dictionaries/types` | 无 | 字典类型列表 |
| `GET /api/v4/system/dictionaries/type/:dictType` | 无 | 字典数据 |
| `GET /api/v4/system/status` | `optionalAuth` | 系统状态 |

**需要变更的接口（✅ 已全部完成）**：

| 路由 | 变更前 | 变更后 | 状态 |
|------|--------|--------|------|
| `GET /api/v4/lottery/campaigns/active` | `authenticateToken` | `optionalAuth` | ✅ 已完成 |
| `GET /api/v4/exchange/items` | `authenticateToken` | `optionalAuth` | ✅ 已完成 |
| `GET /api/v4/exchange/items/:exchange_item_id` | `authenticateToken` | `optionalAuth` | ✅ 已完成 |
| `GET /api/v4/marketplace/listings` | `authenticateToken` | `optionalAuth` | ✅ 已完成（2026-05-15） |
| `GET /api/v4/marketplace/listings/facets` | `authenticateToken` | `optionalAuth` | ✅ 已完成（2026-05-15） |
| `GET /api/v4/marketplace/listings/:market_listing_id` | `authenticateToken` | `optionalAuth` | ✅ 已完成（2026-05-15） |

### 3.3 登录接口真实格式（`routes/v4/auth/login.js`）

**请求**：
```json
POST /api/v4/auth/login
{
  "mobile": "13612227930",
  "verification_code": "123456"
}
```

**验证规则**：
- `mobile`：必填，正则 `/^1[3-9]\d{9}$/`
- `verification_code`：必填，非空字符串
- 万能验证码 `123456` 在开发环境有效（通过 `SmsService.verifyCode()` 支持）

**成功响应**：
```json
{
  "success": true,
  "message": "登录成功",
  "data": {
    "access_token": "eyJ...",
    "user": {
      "user_id": 1,
      "mobile": "138****8000",
      "nickname": "用户昵称",
      "role_level": 0,
      "roles": [],
      "status": "active",
      "last_login": "2026-05-14T08:00:00+08:00",
      "login_count": 5
    },
    "is_new_user": false,
    "expires_in": 604800,
    "timestamp": "2026-05-14T08:00:00+08:00"
  }
}
```

**特性**：
- 首次登录自动注册（`is_new_user: true`）
- `refresh_token` 通过 HttpOnly Cookie 传递（不在响应体中）
- 创建 `AuthenticationSession` 记录（`session_token` = UUID v4）
- 多平台隔离：同一 `user_type + platform` 仅保留一个活跃会话

### 3.4 活动列表接口真实格式（`routes/v4/lottery/campaigns.js`）

**当前路由定义**（第 85-113 行）：
```javascript
router.get('/active', authenticateToken, asyncHandler(async (req, res) => {
  const LotteryQueryService = req.app.locals.services.getService('lottery_query')
  const activeCampaigns = await LotteryQueryService.getActiveCampaigns()
  const campaignList = activeCampaigns.map(campaign => ({
    campaign_code: campaign.campaign_code,
    campaign_name: campaign.campaign_name,
    campaign_type: campaign.campaign_type,
    status: campaign.status,
    display: {
      mode: campaign.display_mode || 'grid_3x3',
      effect_theme: campaign.effect_theme || null
    },
    start_time: campaign.start_time,
    end_time: campaign.end_time,
    is_featured: !!campaign.is_featured,
    display_tags: campaign.display_tags || [],
    display_start_time: campaign.display_start_time || null,
    display_end_time: campaign.display_end_time || null
  }))
  return res.apiSuccess(campaignList, '获取活动列表成功', 'ACTIVE_CAMPAIGNS_SUCCESS')
}))
```

**数据库真实数据**（`lottery_campaigns` 表）：
- 主键：`lottery_campaign_id`（int）
- 业务码：`campaign_code`（varchar(100)，唯一索引）
- 状态枚举：`draft`, `active`, `paused`, `ended`, `cancelled`
- 当前有 4 条记录，1 条 `active` 状态

### 3.5 商城配置接口（已公开，无需变更）

`GET /api/v4/system/config/settings` 返回白名单内的公开配置，包含：
- `exchange_page`：兑换页面 UI 配置（tabs、spaces、card_display、shop_filters、market_filters）
- `product_filter`：商品筛选配置

这些接口**已经是公开的**，无需修改。

---

## 四、方案设计（以后端为准）

### 4.1 后端变更（唯一需要改动的地方）

**变更内容**：将 `GET /api/v4/lottery/campaigns/active` 的中间件从 `authenticateToken` 改为 `optionalAuth`

**变更文件**：`routes/v4/lottery/campaigns.js` 第 87 行

**变更前**：
```javascript
router.get('/active', authenticateToken, asyncHandler(async (req, res) => {
```

**变更后**：
```javascript
router.get('/active', optionalAuth, asyncHandler(async (req, res) => {
```

**需要在文件头部引入**（确认 `optionalAuth` 已导入）：
```javascript
const { authenticateToken, optionalAuth } = require('../../../middleware/auth')
```

**为什么用 `optionalAuth` 而不是完全去掉认证**：
- `optionalAuth` 是后端已有的成熟中间件，经过生产验证
- 如果用户已登录，`req.user` 仍然可用，未来可以做个性化推荐
- 不需要新增任何代码，只需替换中间件引用

### 4.2 可选增强：限流配置

后端已有 `middleware/RateLimiterMiddleware.js`（Redis 滑动窗口），建议为公开接口配置限流：

```javascript
const { createRateLimiter } = require('../../../middleware/RateLimiterMiddleware')

const publicCampaignLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  max: 60,
  keyGenerator: (req) => req.ip
})

router.get('/active', publicCampaignLimiter, optionalAuth, asyncHandler(async (req, res) => {
```

> **需要你拍板**：是否需要为此接口单独配置限流？当前 `.env` 中 `DISABLE_RATE_LIMITER=true`（开发环境已禁用全局限流），上线前需要改为 `false`。

---

## 五、问题归属分析

### 5.1 后端数据库项目的问题（1 项）

| # | 问题 | 影响 | 工作量 |
|---|------|------|--------|
| 1 | `GET /api/v4/lottery/campaigns/active` 使用了 `authenticateToken`，未登录用户无法访问 | 小程序发现页无法展示活动列表 | 改 1 行代码 |

### 5.2 Web 管理后台前端项目的问题（0 项）

Web 管理后台（`admin/`）是运营人员使用的，**始终需要登录**，不受本次需求影响。

- Web 前端字段名已与后端完全一致（snake_case）
- API 封装层（`admin/src/api/base.js`）直接使用后端字段，无映射层
- 无需任何改动

### 5.3 微信小程序前端项目的问题（需确认）

小程序代码不在本仓库中，以下是基于后端接口规范的要求：

| # | 问题 | 说明 |
|---|------|------|
| 1 | 活动列表请求需支持无 Token 调用 | 去掉请求头中的 `Authorization`（或允许为空） |
| 2 | 字段名必须与后端一致 | 使用 `campaign_code`（非 `campaignCode`）、`campaign_name`（非 `name`）等 |
| 3 | 登录接口参数格式 | 必须是 `{ mobile, verification_code }`，不能是嵌套对象 |
| 4 | Token 存储 | 登录成功后存储 `data.access_token`，后续请求带 `Authorization: Bearer <token>` |
| 5 | 登录态判断 | 检查本地是否有有效 `access_token`，无则为未登录状态 |

---

## 六、后端可复用能力清单

### 6.1 已有可直接复用的能力

| 能力 | 实现位置 | 说明 |
|------|----------|------|
| `optionalAuth` 中间件 | `middleware/auth.js` | 公开接口可选认证，零开发成本 |
| Redis 限流中间件 | `middleware/RateLimiterMiddleware.js` | 滑动窗口限流，支持 IP/用户维度 |
| 统一响应格式 `res.apiSuccess/apiError` | Express 扩展 | 所有接口已统一 |
| `LotteryQueryService.getActiveCampaigns()` | `services/` | 查询逻辑已封装，无需修改 |
| 验证码登录全流程 | `routes/v4/auth/login.js` | 含自动注册、会话管理、多平台隔离 |
| 微信登录全流程 | `routes/v4/auth/login.js` | `quick-login`、`wx-code-login`、`decrypt-phone` |
| 系统配置公开接口 | `routes/v4/system/config.js` | 白名单机制，安全可控 |
| 数据脱敏服务 | `DataSanitizer` | 奖品列表自动脱敏（隐藏概率/库存） |

### 6.2 可扩展的能力

| 能力 | 扩展方式 | 场景 |
|------|----------|------|
| 更多接口改为 `optionalAuth` | 替换中间件即可 | 如商品列表、DIY 模板列表 |
| 匿名用户行为追踪 | `optionalAuth` + `req.ip` | 未登录用户浏览数据统计 |
| 个性化推荐 | `optionalAuth` 中 `req.user` 存在时返回个性化数据 | 已登录用户看到不同内容 |

---

## 七、执行步骤

### 步骤 1：后端代码变更 ✅ 已完成（2026-05-14）

**已修改文件**：

1. `routes/v4/lottery/campaigns.js`
   - 导入 `optionalAuth`
   - `GET /active` 中间件：`authenticateToken` → `optionalAuth`

2. `routes/v4/exchange/index.js`
   - 导入 `optionalAuth`
   - `GET /items` 中间件：`authenticateToken` → `optionalAuth`
   - `GET /items/:exchange_item_id` 中间件：`authenticateToken` → `optionalAuth`
   - 修复 `req.user` 安全访问（`req.user?.user_id`）

3. `services/diy/QRCodeService.js`（新建）
   - 修复启动时 `Cannot find module './QRCodeService'` 错误
   - 占位实现，待微信小程序上线后对接

**DIY 模板浏览接口**：已确认 `/api/v4/diy/templates`、`/templates/:id`、`/templates/:id/beads`、`/material-groups` 原本就是公开的，无需修改。

### 步骤 2：验证 ✅ 已通过

| 测试项 | 结果 |
|--------|------|
| 未登录访问 `GET /api/v4/lottery/campaigns/active` | ✅ 200 + 活动数据 |
| 未登录访问 `GET /api/v4/exchange/items` | ✅ 200 + 商品列表 |
| 未登录访问 `GET /api/v4/exchange/items/:id` | ✅ 200 + 商品详情 |
| 未登录访问 `POST /api/v4/lottery/draw` | ✅ 401 MISSING_TOKEN |
| 已登录访问 `GET /api/v4/lottery/campaigns/active` | ✅ 200 + 活动数据 |
| ESLint 检查 | ✅ 通过 |
| Prettier 格式检查 | ✅ 通过 |
| Jest API 契约测试（lottery） | ✅ 8/8 通过 |
| Jest API 契约测试（exchange-page-config） | ✅ 6/6 通过 |
| 认证中间件测试 | ✅ 9/9 通过 |
| 健康检查 | ✅ 系统正常运行 |

### 步骤 3：微信小程序前端适配（交给前端开发人员）

小程序前端需要确保：

1. **活动列表页**：请求 `GET /api/v4/lottery/campaigns/active` 时，如果用户未登录，不带 `Authorization` 头
2. **字段直接使用后端返回值**：
   - `campaign_code` — 活动唯一标识
   - `campaign_name` — 活动名称
   - `campaign_type` — 活动类型（`event`/`daily`/`weekly`/`permanent`/`pool_*`）
   - `status` — 状态（`active`）
   - `display.mode` — 展示模式（`grid_3x3`）
   - `display.effect_theme` — 特效主题
   - `start_time` / `end_time` — 活动时间
   - `is_featured` — 是否精选
   - `display_tags` — 展示标签数组
3. **登录弹窗调用**：
   - 验证码登录：`POST /api/v4/auth/login` body `{ mobile, verification_code }`
   - 微信一键登录：`POST /api/v4/auth/quick-login` 或 `POST /api/v4/auth/wx-code-login`
4. **登录成功后**：存储 `response.data.access_token`，刷新当前页面数据

---

## 八、安全考量

### 8.1 公开接口安全性

`GET /api/v4/lottery/campaigns/active` 改为 `optionalAuth` 后：

- ✅ 返回数据不含用户隐私信息（仅活动配置数据）
- ✅ 不含概率、库存等商业敏感数据（由 `LotteryQueryService.getActiveCampaigns()` 控制返回字段）
- ✅ 后端已有全局 CORS 白名单（`.env` 中 `ALLOWED_ORIGINS`）
- ⚠️ 建议上线前将 `DISABLE_RATE_LIMITER` 改为 `false`

### 8.2 仍需强制认证的操作

| 操作 | 接口 | 中间件 |
|------|------|--------|
| 抽奖 | `POST /api/v4/lottery/draw` | `authenticateToken` |
| 兑换商品 | `POST /api/v4/exchange` | `authenticateToken` |
| 保存 DIY 作品 | `POST /api/v4/diy` | `authenticateToken` |
| 查看积分 | `GET /api/v4/assets/*` | `authenticateToken` |
| 查看订单 | `GET /api/v4/exchange/orders` | `authenticateToken` |
| 市场交易 | `POST /api/v4/marketplace/*` | `authenticateToken` |

---

## 九、数据库无变更

本次需求**不涉及数据库表结构变更**，仅涉及：
- 路由中间件替换（1 行代码）

---

## 十、需要你拍板的决定（含行业调研）

### 10.1 行业方案对比

#### 大公司方案（美团/淘宝/饿了么/拼多多）

| 平台 | 未登录浏览策略 | 登录触发时机 | 限流策略 |
|------|---------------|-------------|----------|
| 美团外卖 | 商品列表、店铺详情全部公开浏览 | 下单、加购物车时弹登录 | 全局网关限流 + IP 维度 |
| 淘宝/闲鱼 | 商品列表公开，详情页部分公开 | 购买、收藏、聊天时强制登录 | 用户维度 + AppKey 维度分级限流 |
| 拼多多 | 所有浏览类接口公开 | 拼团、下单时登录 | 全局限流 + 动态调整 |
| 饿了么 | 菜单浏览公开 | 下单时返回 `USER_AUTHENTICATION_REQUIRED` | 全局网关统一处理 |

**共同点**：所有大公司的「浏览类」接口（列表、详情）全部公开，仅「写操作」（下单、支付、评价）强制登录。

#### 游戏虚拟物品交易平台（C5GAME/BUFF/Steam）

| 平台 | 未登录浏览 | 限流 | 认证方式 |
|------|-----------|------|----------|
| 网易 BUFF | 市场列表完全公开浏览 | Cookie 级别防爬，频率 5秒/次 | 购买/出售时登录 |
| C5GAME | 在售列表公开（需 app-key） | 默认 50 QPS，部分接口 5次/秒 | app-key + IP 白名单 |
| Steam 市场 | 商品列表公开浏览 | IP 级别限流 | 购买时 Steam Guard 验证 |

**共同点**：市场浏览全部公开，交易操作强制认证。限流以 IP 维度为主。

#### 活动/抽奖类平台

| 平台 | 活动列表 | 参与活动 | 设计理念 |
|------|---------|---------|----------|
| 支付宝蚂蚁森林 | 公开展示活动入口 | 参与时需登录 | 先吸引再转化 |
| 京东抽奖 | 活动页面公开 | 抽奖消耗积分时验证 | 最大化曝光 |
| 各游戏公司活动 | 活动列表/预告全部公开 | 领奖/参与时验证角色 | 拉新导流 |

#### 小公司/独立开发者方案

| 方案 | 特点 | 适用场景 |
|------|------|----------|
| 全部需要登录 | 简单粗暴，开发成本最低 | 内部工具、B2B 系统 |
| 微信静默登录 | 用户无感，自动获取 openid | 纯微信生态，不需要手机号 |
| 先浏览后登录（你的需求） | 平衡体验和转化 | C2C 平台、活动运营类 |

### 10.2 最适合你项目的方案

**结论：全面采用「先浏览后登录」模式，所有浏览类接口统一改为 `optionalAuth`。**

**理由**：

1. **行业共识**：从美团到 BUFF，所有面向 C 端用户的平台，浏览类接口都是公开的。没有任何一家把「看商品列表」设为需要登录。
2. **你的项目定位**：餐厅积分抽奖系统，核心目标是拉新和转化。用户连活动都看不到就要登录，转化漏斗直接断裂。
3. **技术零成本**：你的后端已有 `optionalAuth` 中间件，改动只是替换中间件引用，每个接口 1 行代码。
4. **项目未上线**：没有历史包袱，一次性做对比后续打补丁成本低得多。
5. **长期维护**：统一的认证策略（浏览=optionalAuth，写操作=authenticateToken）比逐个接口判断更清晰。

### 10.3 最终决定建议

| # | 决定项 | 建议选择 | 理由 |
|---|--------|----------|------|
| 1 | 限流策略 | **A) 依赖全局限流** | 大公司都是网关层统一限流，不按接口单独配。你的 `RateLimiterMiddleware` 已经是 Redis 滑动窗口，上线前开启即可。单独配反而增加维护点。 |
| 2 | 兑换商品列表改为公开 | **B) 一起改** | 美团/淘宝/BUFF/C5GAME 无一例外：商品列表公开浏览。你的商城页不让看商品就要登录，等于把用户赶走。 |
| 3 | DIY 模板列表改为公开 | **B) 一起改** | 同理。DIY 是你的差异化功能，应该最大化曝光。用户看到好玩的模板才有动力登录去设计。 |
| 4 | 上线前开启限流 | **A) 必须开启** | 所有公开接口的平台都有限流。BUFF 5秒/次，C5GAME 50QPS，得物 100次/分钟。你的全局限流开启后默认配置已经足够。 |

### 10.4 各方案区别总结

| 维度 | 全部需登录 | 静默登录 | 先浏览后登录（推荐） |
|------|-----------|---------|---------------------|
| 用户体验 | ❌ 差，首屏空白 | ⚠️ 中，依赖微信生态 | ✅ 好，即开即看 |
| 转化率 | ❌ 低，漏斗断裂 | ⚠️ 中，无法跨平台 | ✅ 高，先种草再收割 |
| 开发成本 | ✅ 零（现状） | ⚠️ 中，需改登录流程 | ✅ 极低（改中间件引用） |
| 安全性 | ✅ 最高 | ✅ 高 | ✅ 高（写操作仍需认证） |
| 长期维护 | ⚠️ 后续必须改 | ⚠️ 绑定微信 | ✅ 行业标准，不会过时 |
| 适合你的项目 | ❌ | ⚠️ 可作为补充 | ✅ 主方案 |

**注意**：「静默登录」和「先浏览后登录」不冲突。微信小程序可以在后台静默调用 `wx.login` 获取 openid（用于匿名行为追踪），同时 UI 层面展示为未登录状态，直到用户主动触发需要手机号的操作。这是美团、拼多多的做法。

---

## 十一、符合性总结

### 后端技术栈符合性 ✅

- 使用已有的 `optionalAuth` 中间件，零新增代码
- 遵循 Express 路由中间件链模式
- 遵循 `res.apiSuccess()` 统一响应格式
- 遵循 Sequelize 服务层架构（`LotteryQueryService`）
- 遵循 snake_case 字段命名规范

### Web 管理后台前端符合性 ✅

- 本次需求不影响 Web 管理后台
- Web 前端已与后端字段完全对齐（snake_case）
- 无需任何改动

### 微信小程序前端要求

- 小程序必须使用后端的 snake_case 字段名（`campaign_code`, `campaign_name` 等）
- 不做字段映射，直接使用后端返回的 JSON 结构
- 登录接口参数格式严格按照后端定义（`{ mobile, verification_code }`）
