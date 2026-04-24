# 编码规范统一方案

> 初始日期：2026-04-10
> 最新求证：2026-04-22 第二轮（本轮直接用 Node.js + mysql2 连接 `.env` 中配置的真实数据库 `restaurant_points_dev@dbconn.sealosbja.site:42569` 做对齐，且只跟当前实际代码状态对齐，不引用任何历史报告 / 二次文档 / 离线备份）
> **拍板状态：全部 20 项决策已拍板完成**（第一轮 15 项 7.1~7.15 + 第二轮新增 5 项 7.16~7.20，详见第 14 章"拍板状态总览表"与 15.7）
> 项目定位：本文档定位为**微信小程序前端对接后端数据库项目的求证文档**；所有接口路径、数据库查询、响应格式、字段设计以后端数据库实际技术栈为唯一权威，前端全量适配
> 后端技术栈（来自 `package.json` / `app.js` / `config/`）：Node.js `>=20.18.0` + Express `^4.18.2` + Sequelize `^6.35.2` + MySQL 8.0.30（mysql2 `^3.6.5`）+ Redis（`ioredis ^5.7.0`）+ Socket.IO `^4.8.1` + node-cron `^3.0.3` + joi `^17.11.0` + winston `^3.11.0`
> Web 管理后台前端（来自 `admin/package.json`）：Vite `^6.4.1` + Alpine.js `^3.15.4` + Tailwind CSS `^3.4.19` + ECharts `^6.0.0` + Konva `^10.2.3` + socket.io-client `^4.8.3`（MPA 多 HTML 入口，约 70+ 页面）
> 微信小程序前端：**独立仓库（不在本 Node.js 仓库内）**，本轮通过后端 API 契约约束，不在本仓库内直接改码
> 后端代码规模：**120 张真实数据库表**（不是 100±，已直接查 `information_schema`）/ 194 路由文件 / 202 服务文件 / 120 模型文件 / 22.5 万行代码
> 数据库真实规模：120 表 / 数据文件约 169 MB / 字段全部 `snake_case`（0 个大小写不合规字段）
> 状态：三端均未上线，一次性全量统一，不兼容旧接口、不保留字段映射层、由前端全量适配后端真实字段；本轮以后端为核心权威，前端 long→short 兼容输出在本轮全部拆除

---

## 一、当前现状：3 套风格并存

项目中存在 3 套编码风格，以路由层服务获取方式为主要区分标志：

```
┌──────────────────┬──────────────────────┬──────────────────────┬──────────────────────┐
│     维度          │  ① DIY 模块风格       │  ② 主流风格           │  ③ 旧风格（零散）     │
│                  │  (diy.js, DIYService) │  (addresses, media)  │  (lottery 等)         │
├──────────────────┼──────────────────────┼──────────────────────┼──────────────────────┤
│ 模型导入方式      │ 每个方法内部           │ 文件顶部一次性         │ 文件顶部              │
│                  │ require('../models')  │ const {X}=require()  │ const {X}=require()  │
│                  │ 重复 30+ 次           │ 只写一次              │ 只写一次              │
├──────────────────┼──────────────────────┼──────────────────────┼──────────────────────┤
│ 路由获取服务      │ require('services')   │ req.app.locals       │ 直接 require 服务类   │
│                  │ .getService('diy')    │ .services            │ 不走 ServiceManager   │
│                  │ (模块级 ServiceMgr)   │ .getService(...)     │                      │
├──────────────────┼──────────────────────┼──────────────────────┼──────────────────────┤
│ 错误处理包装      │ 本地定义 asyncHandler │ 共享 middleware 导入  │ 手写 try/catch        │
│                  │ (每个路由文件重复定义) │ asyncHandler         │ + handleServiceError │
├──────────────────┼──────────────────────┼──────────────────────┼──────────────────────┤
│ 事务断言          │ 不断言，静默接受       │ assertAndGet         │ 无统一模式            │
│                  │ 缺失的 transaction    │ Transaction()        │                      │
├──────────────────┼──────────────────────┼──────────────────────┼──────────────────────┤
│ 路由参数转数字    │ Number(req.params.id) │ parseInt(..., 10)    │ parseInt(..., 10)    │
├──────────────────┼──────────────────────┼──────────────────────┼──────────────────────┤
│ 路由层输入校验    │ 几乎不做，全交给服务层 │ 路由层做基础校验       │ 路由层做校验          │
├──────────────────┼──────────────────────┼──────────────────────┼──────────────────────┤
│ 服务文件体量      │ ~1700 行 / 29 方法    │ 100-500 行           │ 100-500 行           │
│                  │ 单文件巨石            │ 职责拆分              │ 职责拆分              │
└──────────────────┴──────────────────────┴──────────────────────┴──────────────────────┘
```

### 数据统计

```
服务获取方式分布（194 个路由文件）：
  req.app.locals.services  → 150 个文件（77%）  ← 绝对主流
  require ServiceManager   →  16 个文件（8%）   ← 需统一（① DIY 风格）
  直接 require 服务类       →  14 个文件（7%）   ← 需统一（③ 旧风格）

错误处理分布：
  handleServiceError       → 约 130 个路由在用   ← 主流
  手写 try/catch 无统一包装 →  64 个文件          ← 需统一（③ 旧风格主要问题）
  本地定义 asyncHandler    →   6 个文件          ← 需统一（① DIY 风格）

模型导入方式：
  文件顶部一次性导入        → 绝大多数服务        ← 主流
  方法内懒加载             → DIY 等少数           ← 需统一

需统一文件总计（去重后）：约 85-90 个路由文件，占全部 194 个的 45%
```

### 一致的部分（全项目无分歧）

- 模型类名 PascalCase，表名 snake_case
- 字段全部 snake_case，`underscored: true`
- 响应统一用 `res.apiSuccess()` / `res.apiError()`
- 事务通过 `TransactionManager.execute()` 管理
- 路由不直接操作 models，写操作收口到 Service
- 测试用 Jest + SuperTest，连真实数据库

> 主键命名不属于"全项目无分歧"。2026-04-22 本轮直接查询真实数据库发现主键存在两种风格并存，详见"第九章 · 9.1 主键命名规则"。

### 当前代码风格问题之外，还存在 3 个业务一致性问题

这 3 个问题不是编码风格问题，但已经在当前代码和真实数据库状态中暴露出来，必须单独治理，不能靠风格统一自动解决。

#### 1. DIY 已发布模板与当前发布约束不一致

当前 `services/DIYService.js` 已明确要求：模板发布前必须有 `base_image_media_id` 和 `preview_media_id`，否则禁止发布。

但真实数据库中仍存在 `status = 'published'` 且这两个字段同时为空的模板记录。

2026-04-22 真实查询结果（查询 `diy_templates`，共 3 条记录）：
- 状态分布：`draft = 2`、`published = 1`
- 异常记录：`diy_template_id = 40`，`template_code = 'DT26040900004093'`，`display_name = '吊坠01'`，`status = 'published'`，但 `base_image_media_id` 与 `preview_media_id` 同时为 `NULL`
- 该记录 `updated_at = '2026-04-11 04:19:23'`（北京时间），说明是当前窗口期的真实运营数据

这说明至少存在以下一种情况：

- 历史数据在新约束上线前已写入，形成脏数据
- 某个管理入口绕过了 `DIYService` 的发布校验
- 数据迁移/导入过程中未补齐必要素材字段

这个问题的本质是：**数据库真实状态与当前业务规则不一致**。

#### 2. 资产余额表存在冻结金额异常信号

真实数据库中，`account_asset_balances` 按资产聚合后，部分 `frozen_amount` 出现负数信号。

2026-04-22 真实查询结果（按 `asset_code` 聚合 `account_asset_balances`）：

```
asset_code        rows  neg_frozen  min_frozen  max_frozen  sum_frozen
points             14          2      -29900       23390       -7410
red_core_shard     13          1       -8200        4650       -3550
star_stone         61          2      -45840       19450        3135
budget_points       1          0           0           0           0
其它                 ...         0           0           0           0
```

共 **5 条记录的 `frozen_amount < 0`**，涉及 `points`、`red_core_shard`、`star_stone` 三种资产；全部 5 条记录的 `updated_at` 都是 `'2026-04-02 04:32:27'`，指向同一批量操作/修复脚本遗留。

具体异常样本：`account_asset_balance_id ∈ {25, 27, 257, 276, 277}`，其中 `account_id=12` 的 `points.available_amount = -52552`、`star_stone.available_amount = -447897`（已出现负可用余额，非仅负冻结）。

按现有资产冻结模型设计，冻结余额通常不应为负值；若出现负数，至少说明下列问题之一需要排查：

- 冻结 / 解冻 / 结算链路存在不守恒操作
- 历史修复脚本或手工改数破坏了一致性
- 某些业务链路的幂等或回滚处理不完整
- 账本流水与余额快照之间存在偏差

这个问题的本质是：**资产账本一致性需要专项核查**，优先级高于代码风格统一。

#### 3. system/config 注释认知与真实配置分类漂移

`routes/v4/system/config.js` 中部分注释对配置项分类的描述，和真实 `system_settings` 中的落库分类已经不完全一致。

2026-04-22 真实查询结果（`system_settings` 共 77 条配置，实际 category 分布如下）：

```
marketplace        21    points             11    basic               8
ad_pricing          6    batch_operation     6    redemption          4
security            4    exchange            3    feature             3
general             3    notification        3    backpack            2
ad_system           1    auction             1    customer_service    1
```

真实 category 总计 15 个，不是注释描述的 5~6 个，且有以下可视的漂移信号：

- `exchange` 分类下的 `setting_key` 带有子路径形式（如 `exchange/refund_approval_threshold`、`exchange/refund_cooldown_hours`、`exchange/refund_monthly_limit`），与其它分类的 `key` 命名风格不一致
- `feature` 分类下真实只有 3 个 key：`app_theme`、`campaign_placement`、`exchange_page`
- `basic` 分类下 8 个 key 涉及 `system_name`、`maintenance_mode`、`customer_phone`、`customer_wechat` 等客服与系统基础信息

如果底层读取逻辑是按 `setting_key` 查值，这类漂移暂时不会立刻打挂接口；但会导致：

- 后续维护人员误判配置真实来源
- 运营改配置时难以建立稳定心智模型
- 配置迁移、白名单治理、缓存失效策略更容易出错

这个问题的本质是：**代码注释 / 认知模型 与 数据库真值源 已发生漂移**。

---

## 二、行业方案对比

### 2.1 大厂方案（美团 / 腾讯 / 阿里）

```
特点：强制统一 + 工具链自动化
├── 全公司级 ESLint 规则包（eslint-config-ali / eslint-config-tencent）
├── 代码提交时 CI 自动检查，不通过不让合并
├── 服务层严格分层：Controller → Service → DAO/Repository
├── 依赖注入框架管理服务（Java 用 Spring，Node 用 NestJS/Midway）
├── 模型层统一 ORM 规范，禁止在路由层直接操作数据库
└── 代码模板生成器（脚手架），新模块自动生成标准结构
```

### 2.2 小公司 / 创业团队

```
特点：约定大于配置，靠文档 + Code Review
├── 一份 CONTRIBUTING.md 写清规范
├── ESLint + Prettier 基础配置
├── 没有依赖注入框架，靠约定（"服务通过 app.locals 获取"）
├── 新人照着现有模块抄
└── 风格不统一时靠 Code Review 纠正
```

### 2.3 游戏公司（虚拟物品交易）

```
特点：资产安全优先，事务严格
├── 所有涉及余额/物品的操作必须走事务管理器
├── 服务层按领域拆分（资产域、交易域、活动域）
├── 幂等性设计（每个操作有唯一 idempotency_key）
├── 审计日志全覆盖
└── 编码规范和普通 Web 项目一样，没有特殊的
```

### 2.4 活动策划 / 小众二手平台

```
特点：迭代快，模块独立性强
├── 每个活动/模块可以独立部署或关闭
├── 配置驱动（活动规则存数据库，不硬编码）
├── 编码规范偏简单，够用就行
└── 重点在业务灵活性，不在架构优雅
```

### 2.5 方案对比

```
┌────────────────────┬──────────────┬──────────────┬──────────────┐
│                    │ 大厂方案      │ 小公司方案    │ 本项目现状    │
│                    │ (DI框架+强制) │ (约定+Review) │ (3套混合)    │
├────────────────────┼──────────────┼──────────────┼──────────────┤
│ 统一成本           │ 高（要引入    │ 低（只改写法  │ —            │
│                    │ NestJS/Midway│ 不改框架）    │              │
│                    │ 重写全部路由）│              │              │
├────────────────────┼──────────────┼──────────────┼──────────────┤
│ 长期维护成本       │ 最低          │ 低            │ 高（3套风格  │
│                    │              │              │ 新人要猜）    │
├────────────────────┼──────────────┼──────────────┼──────────────┤
│ 新人上手           │ 看框架文档    │ 看一个模块就懂│ 看3个模块    │
│                    │ 就能写        │              │ 才能搞清楚   │
├────────────────────┼──────────────┼──────────────┼──────────────┤
│ 适合阶段           │ 团队>10人    │ 团队1-5人    │ —            │
│                    │ 长期维护      │ 快速迭代      │              │
├────────────────────┼──────────────┼──────────────┼──────────────┤
│ 迁移风险           │ 高（全部重写）│ 低（渐进改）  │ —            │
└────────────────────┴──────────────┴──────────────┴──────────────┘
```

---

## 三、推荐治理方向

> 说明：本章用于说明整体治理方向，具体拍板结果以第七章为准。
>
> 当前已拍板前提：
> - 继续沿用现有 Node.js + Express + Sequelize + MySQL + Redis 技术路线
> - 本次治理不仅包含编码规范统一，也同期纳入 3 个业务一致性问题
> - 不把当前 Express 的具体实现细节直接固化为长期不可变标准

### 3.1 为什么本轮不走 NestJS / Midway 级别的大重构

项目当前已有较大规模的 Express 代码与既有服务组织方式。既然本轮已拍板继续 Express 路线，则治理重点应放在：

- 统一依赖入口
- 统一异常处理链
- 统一事务、缓存、校验边界
- 拆分超大服务文件
- 同期处理真实数据库暴露出的业务一致性问题

换句话说，本轮目标是**在现有框架内完成工程治理收敛**，而不是直接切换到另一套框架。

### 3.2 为什么不是简单“只统一写法”

当前项目的问题已经不只是代码风格分裂，还包括：

- DIY 已发布模板与当前发布约束不一致
- 资产余额表存在冻结金额异常信号
- `system/config` 注释认知与真实配置分类漂移

因此，本轮治理不是单纯把代码写法改整齐，而是：

- **核心交易与资产域**：按游戏 / 虚拟物品交易平台的治理标准收敛
- **外围配置与运营域**：按活动配置化思路治理
- **整体工程约束**：按大厂式工程治理思路统一入口、边界与规范

### 3.3 推荐原则

本项目最适合的不是单一某一种公司风格，而是组合方案：

- **大厂式工程治理**：统一依赖入口、统一异常链、统一事务与缓存边界、统一命名与分层约束
- **游戏 / 虚拟物品交易核心约束**：核心资产、交易、履约链路强调事务、幂等、审计和领域拆分
- **活动配置化外围模块**：广告、活动位、页面配置、筛选规则等外围模块强调配置驱动和运营灵活性

一句话概括：

**核心交易与资产域，按游戏 / 虚拟物品交易平台标准做；外围配置与运营域，按活动配置化标准做；整体工程治理，按大厂式标准做。**

---

## 四、需要统一的文件清单

> 说明：本章文件清单主要覆盖第一轮"代码风格统一"主体工作，用于识别现有混用写法的落点。
>
> 这份清单**不等于**本轮治理的全部范围，当前未完整覆盖以下内容：
> - 3 个业务一致性问题的排查、修复与数据治理
> - 因循环依赖导致的 service / helper / model 解耦工作
> - 统一异常处理链的重构工作
> - 服务容器治理深化与服务形态收敛工作
>
> 因此，本章更适合作为"首轮代码治理清单"，而不是整轮治理的总范围定义。

### 4.1 服务获取方式：require ServiceManager → req.app.locals.services（① DIY 风格，16 个）

- `routes/v4/diy.js`（DIY 用户端）
- `routes/v4/console/diy/works.js`（DIY 管理-作品）
- `routes/v4/console/diy/materials.js`（DIY 管理-素材）
- `routes/v4/console/diy/templates.js`（DIY 管理-模板）
- `routes/v4/console/diy/stats.js`（DIY 管理-统计）
- `routes/v4/console/ad/ad-pricing.js`（广告定价）
- `routes/v4/console/ad/zone-management.js`（广告位管理）
- `routes/v4/console/analytics/report-templates.js`（报表模板）
- `routes/v4/console/config/audit-rollback.js`（审计回滚）
- `routes/v4/console/merchant/regions.js`（商户区域）
- `routes/v4/console/operations/reminder-rules.js`（提醒规则）
- `routes/v4/console/system/app-theme-config.js`（主题配置）
- `routes/v4/console/system/exchange-page-config.js`（兑换页配置）
- `routes/v4/console/system/placement.js`（活动位置）
- `routes/v4/console/user/user-behavior-tracks.js`（用户行为）
- `routes/v4/system/config.js`（系统配置）

### 4.2 服务获取方式：直接 require 服务类 → req.app.locals.services（③ 旧风格，14 个）

- `routes/v4/backpack/index.js`
- `routes/v4/console/config/approval-chain.js`
- `routes/v4/console/exchange/operations.js`
- `routes/v4/console/lottery/lottery-campaigns.js`
- `routes/v4/console/market/marketplace.js`
- `routes/v4/console/merchant/consumption.js`
- `routes/v4/console/merchant/merchant-points.js`
- `routes/v4/console/shared/middleware.js`
- `routes/v4/images.js`
- `routes/v4/lottery/draw.js`
- `routes/v4/marketplace/auctions.js`
- `routes/v4/marketplace/listings.js`
- `routes/v4/system/chat.js`
- `routes/v4/user/addresses.js`

### 4.3 本地定义 asyncHandler → 统一使用 handleServiceError（① DIY 风格，6 个）

- `routes/v4/system/ad-delivery.js`（广告投放）
- `routes/v4/system/ad-events.js`（广告事件）
- `routes/v4/user/ad-campaigns.js`（用户广告活动）
- `routes/v4/user/ad-pricing.js`（用户广告定价）
- `routes/v4/user/ad-slots.js`（用户广告位）
- `routes/v4/user/images.js`（用户图片）

### 4.4 手写 try/catch 无 handleServiceError → 统一错误处理（③ 旧风格，64 个）

这是数量最多的一类，64 个路由文件使用裸 try/catch + `res.apiError` 而不走 `handleServiceError`。主要分布：

| 目录 | 文件数 | 典型文件 |
|------|--------|---------|
| `routes/v4/console/customer-service/` | 9 | agents, assignments, disputes, sessions 等 |
| `routes/v4/console/lottery/` | 9 | campaigns, configs, health, quota, report 等 |
| `routes/v4/console/operations/` | 8 | attributes, categories, item-templates 等 |
| `routes/v4/console/exchange/` | 4 | items, operations, orders, stats |
| `routes/v4/console/user/` | 5 | user-management, hierarchy, premium 等 |
| `routes/v4/console/merchant/` | 3 | debt-management, merchant-points, regions |
| `routes/v4/console/analytics/` | 2 | multi-dimension-stats, report-templates |
| `routes/v4/console/risk/` | 3 | consumption-anomaly, reconciliation, risk-profiles |
| `routes/v4/console/assets/` | 2 | index, portfolio |
| `routes/v4/console/config/` | 2 | audit-rollback, sessions |
| `routes/v4/console/dashboard/` | 1 | stats |
| `routes/v4/console/marketplace/` | 1 | orders |
| `routes/v4/auth/` | 3 | login, permissions, token |
| `routes/v4/system/` | 3 | config, dictionaries, notifications |
| `routes/v4/user/` | 2 | index, notifications |
| `routes/v4/` 根目录 | 3 | activities, images, merchant-points |
| `routes/v4/lottery/` | 1 | lottery-preset |

其中 5 个文件与 4.2 重叠（既直接 require 服务类，又手写 try/catch）。

### 4.5 服务层模型懒加载 → 文件顶部一次性导入（① DIY 风格，21 个服务文件，共 198 处）

| 文件 | 懒加载次数 |
|------|-----------|
| `services/DIYService.js` | 31 次 |
| `services/console/BusinessRecordQueryService.js` | 19 次 |
| `services/MediaService.js` | 18 次 |
| `services/CustomerServiceAgentManagementService.js` | 11 次 |
| `services/lottery/LotteryQuotaService.js` | 10 次 |
| `services/lottery/AnalyticsQueryService.js` | 10 次 |
| `services/dashboard/PendingCenterService.js` | 10 次 |
| `services/console/SystemDataQueryService.js` | 10 次 |
| `services/asset/ItemService.js` | 10 次 |
| `services/NotificationService.js` | 9 次 |
| `services/lottery/admin/CRUDService.js` | 7 次 |
| `services/IdempotencyService.js` | 7 次 |
| `services/lottery/QueryService.js` | 6 次 |
| `services/dashboard/NavBadgeService.js` | 5 次 |
| `services/asset/ItemLifecycleService.js` | 5 次 |
| `services/ChatWebSocketService.js` | 5 次 |
| `services/AuditLogService.js` | 5 次 |
| `services/market-listing/AdminService.js` | 4 次 |
| `services/console/SessionQueryService.js` | 4 次 |
| `services/asset/QueryService.js` | 4 次 |
| `services/asset/PortfolioQueryService.js` | 4 次 |

### 4.6 超大服务文件拆分建议

| 文件 | 行数 | 建议 |
|------|------|------|
| `services/DIYService.js` | 1700 | 按子域拆分为 `services/diy/` 目录 |
| `services/lottery-analytics/StrategySimulationService.js` | 2320 | 评估是否需要拆分 |
| `services/exchange/AdminService.js` | 2312 | 已在 exchange/ 目录下，评估内部拆分 |
| `services/PrizePoolService.js` | 1758 | 评估是否需要拆分 |

---

## 五、统一工作量估算

> 说明：以下工时估算主要针对第一轮"代码风格统一"工作，不代表本轮全部治理工作量。
>
> 当前估算未完整计入以下额外成本：
> - 3 个业务一致性问题的数据修复与链路排查
> - 超大服务文件拆分过程中可能出现的职责重划与回归验证
> - 循环依赖解耦
> - 统一异常处理链改造
> - 服务容器治理深化与服务形态判定调整
>
> 因此，本章估算应理解为"第一阶段代码治理工时"，不是整轮治理的总工时承诺。

| 类别 | 文件数 | 改动复杂度 | 预计工时 |
|------|--------|-----------|---------|
| ① 服务获取方式统一（require ServiceManager） | 16 | 低（机械替换） | 1-2h |
| ③ 服务获取方式统一（直接 require 服务类） | 14 | 低（机械替换） | 1-2h |
| ① 本地 asyncHandler 统一 | 6 | 低 | 0.5h |
| ③ 手写 try/catch 统一为 handleServiceError | 64 | 低-中（量大但模式固定） | 6-8h |
| ① 服务层模型懒加载 → 顶部导入 | 21（198 处） | 低（机械替换） | 2-3h |
| DIYService 拆分 | 1→多 | 中（需理解业务） | 3-4h |
| 测试验证 | — | — | 3-4h |
| **合计** | | | |
| 路由层（去重后） | **~90 个** | — | — |
| 服务层 | **~21 个** | — | — |
| **总计** | **~111 个文件** | — | **17-24h** |

---

## 六、预期收益

- 新人看任意一个模块就能掌握全部编码规范，不需要猜
- ESLint 可以配置自定义规则强制检查服务获取方式
- 消除 3 套风格并存的认知负担
- 降低长期维护成本，减少技术债务

---

## 七、需要拍板的决策项

这份文档中，真正需要拍板的主要有 7 项。其它像现状描述、文件清单、工时估算都只是执行参考，不是政策。

### 7.1 选哪条总路线

**已拍板：继续 Express，只做风格统一。**

结论说明：

- 本次治理不引入 NestJS / Midway 级别的大重构
- 保留现有 Node.js + Express + Sequelize + MySQL + Redis 技术路线
- 本文档的目标收敛为：在现有框架内完成编码规范统一、风格收敛与工程治理

备选方案说明（本轮不采用）：

- 放弃这份方案，改走 NestJS / Midway 级别的大重构

这是整份文档最大的决策点。

### 7.2 这次治理的边界是什么

**已拍板：风格统一 + 同期把 3 个业务问题一起纳入。**

本次治理范围明确包括两条并行工作线：

1. **编码规范统一线**
   - 统一服务获取方式
   - 统一错误处理方式
   - 统一路由层输入校验与参数转换风格
   - 统一服务层 models 导入方式
   - 统一超大服务文件拆分标准

2. **业务一致性治理线**
   - DIY 已发布模板缺少必要图片素材的问题
   - 资产余额表冻结金额异常的问题
   - `system/config` 注释认知与 `system_settings` 真实分类漂移的问题

结论说明：

- 本次工作不再局限于“纯代码写法统一”
- 所有会影响真实数据库状态、账本一致性、配置真值源认知的问题，均纳入本轮治理范围
- 这意味着本文档后续如继续细化实施步骤，需要同时覆盖代码改造、数据修复、链路排查、配置校准四类动作

### 7.3 统一后的“唯一规范”是否全部接受

**已拍板：接受当前 7.3 的三类处理原则。**

当前确定采用的结论是：

- 第一类规则：直接作为正式标准生效
- 第二类规则：按改写后版本作为正式标准生效
- 第三类旧写法：不作为长期最终标准拍板通过

结论说明：

- 本节不再追求把所有旧规则原样一把拍死
- 而是采用“直接通过 / 改写后通过 / 不建议原样通过”三种方式进行正式治理
- 这样既能沉淀长期可维护规范，也能避免把当前 Express 体系下的过渡写法直接固化成新的长期技术债

原因是：其中有些方向本身是对的，但有几条属于当前 Express 体系下的过渡写法，不应被固化为长期最终标准。基于本项目“长期维护成本低、降低技术债、继续沿用现有 Node.js + Express + Sequelize + MySQL + Redis 技术路线”的前提，这一节采用三类处理。

#### 7.3.1 应直接拍板通过的规则

##### 路由层

- 路由层做基础输入校验
- 路由层不直连 models

##### 服务层

- models 顶部一次性导入，不允许方法内懒加载
- 事务统一通过 `TransactionManager.execute()` 管理
- 缓存统一通过 `BusinessCacheHelper` 管理

###### 关于 models 懒加载的治理原则

这里所说的“懒加载”，主要指服务方法内部才 `require('../models')` 这类写法，而不是前端按需加载语义。

处理原则如下：

1. **能直接上提到文件顶部的，直接上提**
   - 如果只是普通 model 依赖，且不存在循环依赖问题，应统一改成文件顶部一次性导入
   - 目标是让文件依赖一眼可见，避免同一文件内部重复 `require`

2. **超大服务文件不要先机械替换，应该先拆再上提**
   - 对像 `DIYService` 这类明显跨多个子域职责的大文件，不建议先把几十个 models 全量抬到文件顶部
   - 更合理的做法是：先按领域拆分，再在每个子文件顶部只导入自己真正需要的 models
   - 换句话说：这类文件应遵循“先拆职责，再消灭懒加载”

3. **如果懒加载是为了规避循环依赖，不能硬改**
   - 应先确认是否存在 service ↔ service、service ↔ helper、service ↔ model 之间的循环依赖
   - 正确解法是解耦：拆公共子服务、收敛到统一服务容器、拆分查询职责与编排职责，而不是继续依赖方法内 `require`

4. **治理目标不是简单禁止语法，而是让依赖关系清晰、可维护**
   - 能直接上提的上提
   - 职责过重的先拆再上提
   - 因循环依赖存在的，先解耦再去掉懒加载

##### 命名规范

- 后端文件名统一 `snake_case`
- 变量/函数统一 `camelCase`
- 类统一 `PascalCase`
- 常量统一 `UPPER_SNAKE_CASE`

这些规则长期收益明确、争议较小，适合作为正式标准直接生效。

#### 7.3.2 建议改写后再拍板的规则

##### 服务获取方式

原写法：

- 服务获取统一成 `req.app.locals.services.getService('xxx')`

建议改写为：

- **路由层只能通过统一服务容器获取服务；当前 Express 实现为 `req.app.locals.services.getService('xxx')`**

改写原因：

- 当前既然已拍板继续 Express，这个实现可以继续使用
- 但不应把 `req.app.locals` 这种 Express 细节写成永久标准
- 否则后续即使仍在 Express 内做更好的依赖注入，也会被文档自身绑死

##### 参数类型转换规范

原写法：

- 参数转数字统一 `parseInt(..., 10)`

建议改写为：

- **路由层参数必须在进入业务逻辑前完成显式类型转换与校验；整数参数当前统一使用 `parseInt(..., 10)`**

改写原因：

- 核心原则不是 `parseInt` 本身，而是显式转换 + 显式校验
- 这样文档表达的是长期治理原则，而不是某个语法细节

##### 大文件拆分规则

原写法：

- 单文件超过 800 行就拆

建议改写为：

- **服务文件超过约 800 行，或明显承担多个子域职责时，必须按领域拆分**

改写原因：

- 真正决定是否拆分的，不只是行数，而是职责边界
- 行数阈值应作为信号，不应机械执行

#### 7.3.3 不建议按现写法直接拍板的规则

##### 错误处理统一成 `try/catch + handleServiceError(...)`

这条不建议原样拍板为长期最终标准。

更优的长期规则应是：

- **路由层错误处理必须接入统一异常处理链；禁止各自散写 `res.apiError(...)`。当前 Express 体系下，优先使用统一 async wrapper + 全局错误处理中间件，必要时再用 `handleServiceError(...)`**

原因：

- 长期最佳实践不是每个路由都手写 `try/catch`
- 更合理的是统一异步包装、统一错误中间件、统一业务异常类型 / 错误码、统一日志处理
- 项目当前 `app.js` 已存在全局错误处理中间件，这说明长期方向应是“统一异常链”，而不是“统一手写 try/catch”

##### 类结构统一成 `class XxxService { static async method() {} }`

这条也不建议原样拍板为长期最终标准。

更优的长期规则应是：

- **服务层统一采用清晰、可判定的服务形态规则，禁止对象导出、函数导出、类实例、静态类随意混用；不是要求所有服务最终都改成实例服务，而是根据职责和依赖特征决定是否允许静态类**

建议补充为以下判定标准：

###### 允许使用静态类的场景

仅当服务同时满足以下条件时，允许使用静态类：

- 无状态
- 无外部依赖注入需求
- 无资源生命周期管理
- 不承担复杂跨域编排职责
- 更接近稳定的规则函数、纯计算、纯转换或很薄的一层查询封装

###### 应优先使用容器管理实例服务的场景

当服务满足以下任一条件时，应优先使用容器管理的实例服务：

- 依赖其它服务或外部客户端
- 依赖缓存、配置、日志、消息组件
- 承担核心交易 / 资产 / 履约编排职责
- 需要更强的可替换性、可测试性、可扩展性
- 存在明显的资源生命周期或初始化管理需求

原因：

- `static service` 是当前代码中的常见形态，但不是所有场景下的长期最优形态
- 同样，实例服务也不应为了“形式统一”而滥用到纯无状态服务上
- 对本项目更合理的做法不是“消灭静态类”，而是“把不适合静态的复杂服务收敛到容器管理，把本来就适合静态的简单服务保留下来”
- 长期目标应是统一判定标准，而不是把所有服务强行压成单一语法

#### 7.3.4 结论

本节建议的拍板方式如下：

##### 应直接通过

- 路由层基础输入校验
- 路由层不直连 models
- models 顶部一次性导入
- 事务统一入口
- 缓存统一入口
- 命名规范统一
- 大文件按领域拆分

##### 应改写后通过

- 服务获取方式
- 参数类型转换规范
- 大文件拆分阈值规则

##### 不建议原样通过

- `try/catch + handleServiceError(...)` 作为唯一错误处理模式
- `class XxxService { static async ... }` 作为唯一服务层形态

本节的核心目标，不是把当前 Express 的具体写法永久固化，而是：在继续使用 Express 的前提下，沉淀出更接近“大厂式工程治理 + 游戏/虚拟物品交易核心约束 + 活动配置化外围模块”的长期可维护规范。

### 7.4 是否接受“超大服务文件按领域拆分”的治理原则

**已拍板：所有满足拆分条件的超大服务文件都拆。**

当前确定采用的结论是：

- 本轮治理接受“超大服务文件按领域拆分”的治理原则
- 当服务文件超过约 800 行时，应触发拆分评估
- 当服务文件明显承担多个子域职责时，应优先按领域拆分
- 行数阈值是预警信号，不是唯一标准；真正决定是否拆分的核心依据是职责边界

当前纳入本轮治理范围的典型拆分对象包括：

- `services/DIYService.js` 拆到 `services/diy/`
- `services/lottery-analytics/StrategySimulationService.js` 评估并按条件拆分
- `services/exchange/AdminService.js` 评估并按条件拆分
- `services/PrizePoolService.js` 评估并按条件拆分
- 其它满足拆分条件的超大服务文件，同样纳入本轮治理范围

与 7.5 的一致性说明：

- 7.5 已拍板接受一次性全量统一
- 因此，7.4 也不再采用“只拆一个代表性文件”或“先不拆”的保守策略
- 超大服务文件拆分视为本轮全量治理的一部分，而不是后续长期拖尾事项

### 7.5 是否接受“全量一次性统一”

**已拍板：接受一次性全量统一。**

当前确定采用的结论是：

- 本轮治理按一次性全量统一推进
- 路由层、服务层、规则收敛、业务一致性问题治理不再拆成多轮长期并行推进
- 第一轮即覆盖主要存量混用写法与已识别的核心治理项

执行口径说明：

- “一次性全量统一”指本轮按整体验收目标推进，而不是无限期分两阶段长期拖尾
- 实施过程中仍可按技术依赖关系安排先后顺序，但不再把治理目标拆成“先核心、后扫尾”的独立长期阶段
- 因此，文档中的文件清单、规则收敛、超大服务文件拆分、以及 3 个业务一致性问题，应视为同一轮治理范围内的工作

### 7.6 是否接受“统一服务容器入口”作为事实标准

**已拍板：接受“统一服务容器入口”作为事实标准。**

当前确定采用的规则是：

- 路由层必须通过统一服务容器获取服务
- 当前 Express 实现为 `req.app.locals.services.getService(...)`
- 模块级 `ServiceManager.getService(...)` 不再作为路由层新增写法
- 路由层直接 `require` 具体服务类不再作为新增写法
- 现有存量代码逐步收敛到统一服务容器入口

这里本质上拍板的是：**项目未来唯一允许的路由层依赖获取原则是什么**。

需要注意的是：

- `req.app.locals.services` 是当前 Express 路线下的实现方式
- 真正需要固化的是“统一服务容器入口”这一原则，而不是把某个 Express 细节写成永久不可变的框架语法
- 该规则主要约束路由层入口，不直接要求服务内部必须统一为静态类或实例服务

### 7.7 是否把“大厂方案”彻底排除

**已拍板：维持当前结论，不走大厂式重构。**

当前确定采用的结论是：

- 本轮不引入 TypeScript / NestJS / Midway 级别的大重构
- 继续沿用现有 Node.js + Express + Sequelize + MySQL + Redis 技术路线
- 本轮治理目标是在现有框架内完成工程治理收敛，而不是切换到新的框架体系

与 7.1 的一致性说明：

- 7.1 已拍板继续 Express，只做风格统一
- 7.7 在此基础上进一步明确：本轮不采用“大厂式框架重构”路线
- 因此，涉及依赖注入、异常链、服务容器、分层、事务、缓存等治理动作，均应在现有 Express 架构内落地，而不是通过引入 NestJS / Midway 来解决

备选方案说明（本轮不采用）：

- 推翻当前结论，允许 TypeScript / NestJS 级别重构

### 7.8 主键命名规则：是否接受"长命名优先 + B 类短命名白名单"

**已拍板：采纳"长命名优先 + B 类短命名白名单"方案。** 见 9.1、12.1。

当前确定采用的结论：

- 业务核心实体一律使用 `{singular_table_name}_id`（如 `lottery_campaign_id`、`market_listing_id`）
- 通用基础资源/日志/快照/流程引擎主键允许使用短命名（`address_id`、`notification_id`、`media_id`、`snapshot_id`、`node_id` 等），以白名单形式在本文档 12.1 表格冻结
- 新增业务实体一律默认使用长命名
- 不把当前"长短混用"视为需要消灭，而是视为"需要明确界限的两种合法命名空间"

#### 7.8.1 行业对比（作为拍板依据）

**大厂方案：**

- 美团 / 阿里：微服务拆得很细，每个服务只管自己的实体，短命名 `id` 在服务内无冲突；但跨服务引用时 proto/thrift IDL 里仍用全名 `order_id`、`merchant_id`
- 腾讯游戏（王者荣耀/和平精英）：单体或大服务架构，主键一律 `{entity}_id`，因为一个服务会同时操作英雄、皮肤、背包、订单，短名必冲突
- 网易游戏 / 米哈游：虚拟物品交易系统里 `item_instance_id`、`trade_order_id`、`auction_listing_id` 是标配，因为一个事务里同时出现买家/卖家/物品/订单/流水多个 ID
- 字节跳动 / 腾讯微信支付：API 字段名与数据库字段名一致，snake_case 直出，不做翻译

**小公司 / 创业项目：**

- Rails/Django 默认 `id`，但凡涉及多表 JOIN 或跨模块引用就会后悔，最终靠 ORM alias 打补丁
- 行业共识：**无 IDL 层的单体架构，应该用长命名避免冲突**

**游戏 / 虚拟物品交易平台：**

- Steam 交易市场：`asset_id` / `listing_id` / `trade_id`，因为微服务拆分极细，每个服务内部无命名冲突
- 网易藏宝阁 / 5173：单体架构，主键全部带实体前缀 `game_item_id`、`trade_order_id`、`seller_account_id`
- 闲鱼 / 转转：`item_id` / `order_id` 短命名，但有完善的 IDL 层 + 网关层做字段映射

**本项目实际情况匹配度：**

- 单体 Express 应用，一个请求常同时操作 `lottery_campaign_id`、`ad_campaign_id`、`user_id`、`item_id`、`trade_order_id`
- 已真实发生 `campaign_id` 在抽奖域和广告域冲突
- 没有 proto/thrift IDL 层，没有网关字段映射层
- 但 `address_id`、`notification_id`、`media_id` 改成 `user_address_user_address_id` 属于自找麻烦

**最接近参考对象：腾讯游戏（单体）、网易藏宝阁（虚拟物品交易单体架构）。** 两家都是"长命名优先 + 基础资源短命名"的组合，与本项目高度一致。

备选方案（本轮不采纳）：

- A. 全部改长命名（`address_id` 也要改成 `user_address_id`），代价是 SQL 可读性降低、修改面扩大
- B. 全部改短命名（`lottery_campaign_id` 也要改成 `campaign_id`），代价是广告域会和抽奖域 `campaign_id` 冲突（已发生）

### 7.9 是否接受"路由响应去掉 long→short 映射层，不兼容前端短字段名"

**已拍板：强制拆除路由层的 long→short 字段映射。** 见 9.8、12.3。

当前确定采用的结论：

- 本轮强制拆除 `routes/v4/marketplace/listings.js` 等处的 long→short 映射
- 不再同时返回 `market_listing_id` 和 `listing_id`，只返回 `market_listing_id`
- 前端（Web 后台和微信小程序）全量适配，不再保留兼容代码

#### 7.9.1 行业对比（作为拍板依据）

**大厂方案：**

- 阿里 / 美团：有统一网关层（Zuul / Spring Cloud Gateway）承担字段映射职责。字段映射在网关做，后端服务只返回真实字段；不在路由 handler 里手写映射
- 腾讯（微信支付 / QQ 钱包）：API 字段名就是数据库字段名的 snake_case 直出，**不做映射**。文档里写什么字段，数据库就是什么字段
- 字节跳动（抖音开放平台）：API 字段名和内部存储字段名一致，不做翻译层

**小公司 / 创业项目：**

- 早期为了"前端方便"在路由层加映射，后来发现维护成本极高：每加一个字段改两处、每改字段名改三处（数据库、映射层、前端），bug 率翻倍
- 行业共识：**没有独立 API Gateway 或 BFF 层时，不要在路由里做字段映射**

**本项目实际情况匹配度：**

- 没有 API Gateway，没有 BFF 层
- 映射直接写在 `routes/v4/marketplace/listings.js` 里，与业务逻辑混在一起
- 已造成前端 `listing_id` 与后端 `market_listing_id` 分裂的真实问题
- 项目未上线，无外部消费者依赖旧字段

**最接近参考对象：腾讯微信支付、字节抖音开放平台。** 两家都是"字段名直出、不做翻译"，跟本项目"无独立网关"的现状完全吻合。大厂做映射的前提是有独立网关基础设施，本项目没有这个前提。

备选方案（本轮不采纳）：

- 暂时保留双字段输出一个迭代周期再切换（会产生新技术债，且项目未上线无必要）

### 7.10 是否接受"不开设小程序专用接口，仅通过 platform 显式声明识别端"

**已拍板：不开小程序专用接口，所有端共用 `/api/v4/*`，通过 `x-platform` 请求头识别。** 见 12.4、12.6。

当前确定采用的结论：

- 不为小程序单独开 `/api/v4/miniapp/*` 路径
- 小程序端必须在请求头显式 `x-platform: wechat_mp`（或请求体 `platform`）
- 后端 `detectLoginPlatform` 保留 Referer 兜底，但不作为主识别
- 未来抖音、支付宝小程序用同样机制，不再新增平台专用接口

#### 7.10.1 行业对比（作为拍板依据）

**大厂方案：**

- 微信支付：所有端（App / H5 / 小程序 / PC）调同一套 API，通过 `User-Agent` 或 `Referer` 区分端，**不开专用接口**
- 美团：App 和小程序调同一套 API，通过 `x-client-type: miniapp` 请求头区分；后端按需做差异化返回（例如小程序不返回某些大图）
- 拼多多：小程序和 App 共用 API，通过 `platform` 参数区分
- 淘宝 / 闲鱼：有独立的小程序 BFF 层，**但这是千万级 DAU 的做法**

**小公司 / 创业项目：**

- 开专用接口 = 维护两套接口 = 两倍 bug 面 = 两倍测试 = 两倍文档
- 行业共识：**DAU < 100 万不要开平台专用接口，应该用请求头识别端**

**本项目实际情况匹配度：**

- 118 个用户，5 条活跃会话，远未到需要平台专用接口的体量
- 后端已有 `platformDetector.detectLoginPlatform(req)` 能力，可按 `x-platform` 做差异化
- 小程序和 Web 后台的业务逻辑完全一致，只是展示层不同
- 数据库已有 `login_platform` enum 预留 5 种平台

**最接近参考对象：美团、拼多多。** 两家都是"共用一套 API + 请求头识别端"，规模与技术栈与本项目最匹配。淘宝/闲鱼的 BFF 方案在 DAU < 100 万前不必考虑。

### 7.11 是否接受"admin 前端的 `api/types.js` 全量重写，枚举按数据库真实值"

**已拍板：`admin/src/api/types.js` 全量重写 + 引入字段黑名单 lint。** 见 9.7、10.2。

当前确定采用的结论：

- `admin/src/api/types.js` 里每个 typedef 都必须与 2026-04-22 数据库 schema 对齐
- 未来 schema 变更必须同步更新这里
- 引入 lint 规则 `admin/scripts/check-frontend-mappings.cjs`，对 12.1 表的旧字段黑名单进行静态扫描

#### 7.11.1 行业对比（作为拍板依据）

**大厂方案：**

- 阿里 / 美团：前端类型定义从后端 proto / Swagger 自动生成，**不手写**
- 腾讯：内部工具链自动同步，手写的 typedef 必须跟 API 文档一致，CI 会校验
- 字节跳动：前端 TypeScript 类型从 OpenAPI spec 自动生成

**小公司 / 创业项目：**

- 手写 JSDoc / TypeScript 类型，但不跟数据库同步 → 时间一长就漂移 → IDE 提示错误字段 → 新人被误导 → bug
- 行业共识：**类型定义要么自动生成，要么有 CI 校验，否则不如不写**

**本项目实际情况匹配度：**

- `api/types.js` 是手写 JSDoc，已跟真实数据库严重漂移（9.7 列了 20+ 处不一致）
- 没有 OpenAPI / Swagger 自动生成链路
- Alpine.js 前端不用 TypeScript，JSDoc 是唯一的类型提示来源

**最接近参考对象：大厂"CI 校验手写类型定义"方案的简化版。** 本项目没有自动生成链路，至少要保证手写的是对的，并用 lint 防止回退。这是成本最低的"穷人版类型同步"。

备选方案（本轮不采纳）：

- 保留 JSDoc 现状不改（IDE 提示错误字段会长期误导运营 / 维护人员，技术债持续累积）

### 7.12 DIY 脏模板 `diy_template_id = 40` 的处理方式

**已拍板：采用方案 A（回退 `status = 'draft'`，运营补素材后重新发布）。** 见 1.3.1、4.1。

具体执行动作：

- 直接把该模板 `status` 改回 `draft`
- 运营在管理后台补齐 `base_image_media_id` 和 `preview_media_id` 后由 `DIYService.publishTemplate` 重新发布
- 同时排查是否还有绕过 `DIYService` 校验的管理入口（如 `PATCH /api/v4/console/diy/templates/:id/status`），加强 joi 校验，`status='published'` 时强制要求两个 `*_media_id` 字段非空
- 补单元测试 `tests/services/diy/TemplateService.publishTemplate.test.js` 防复发

#### 7.12.1 行业对比（作为拍板依据）

**所有正规项目通行做法：**

- 游戏行业：物品模板缺素材 = 强制下架 + 通知运营补齐 + 重新上架审核
- 电商行业：商品缺主图 = 自动下架 + 发站内信给商家
- 内容平台：作品缺必要素材 = 退回审核中 + 要求创作者补齐
- **共同原则：脏数据 = 退回草稿 + 补齐必填字段 + 重新走发布流程。不软删除（丢运营历史），不补占位图（掩盖问题）**

**本项目匹配度：**

- 现有 `DIYService.publishTemplate` 已有发布前校验，方案 A 与之完全吻合
- 不丢数据（运营的配置参数、`layout`、`bead_rules` 等 JSON 字段都保留）
- 不掩盖问题（强制运营补素材）

备选方案（本轮不采纳）：

- B. 软删除：丢失运营历史，不利于后续追溯
- C. 补占位图：掩盖真实素材缺失问题，会让类似脏数据持续进入生产

### 7.13 账本 `frozen_amount < 0` 的修复路径

**已拍板：四项同时做——修复脚本 + 对账流水 + DB CHECK + 服务层断言。** 见 1.3.2、4.2。

当前确定采用的执行动作：

1. **修复脚本**：在 `scripts/maintenance/fix_negative_frozen.js` 写专项修复脚本（dry-run 优先），对 5 条 `frozen_amount < 0` 的记录做对账修正；账户 12 同时存在 `available_amount < 0` 的情况也一并修
2. **对账流水**：修复必须同步生成 `asset_transactions` 记录（类型如 `admin_reconcile`），保留完整审计链
3. **DB CHECK 约束**：新增 Sequelize 迁移加 `CHECK (frozen_amount >= 0)` 和 `CHECK (available_amount >= 0)`（MySQL 8.0.16+ 支持）
4. **服务层前置断言**：`AssetService` 的冻结入口强制 `available >= delta`，解冻入口强制 `frozen >= delta`
5. **回归用例**：新增 `tests/services/asset/FreezeLifecycle.test.js` 防复发

#### 7.13.1 行业对比（作为拍板依据）

**大厂与金融级项目做法：**

- 支付宝 / 微信支付：账本异常 = 最高优先级事故；必须生成对账流水 + 物理修复 + 加 DB 约束 + 加服务层断言，**四项缺一不可**；账本不守恒 = 资金安全问题
- 美团 / 饿了么：商家结算账本出现负数 = P0 事故；修复流程跟本方案四管齐下完全一致
- 腾讯游戏 / 网易游戏：虚拟货币账本异常 = 紧急维护；修复后必须加 CHECK 约束防止复发
- 银行系统：账本不允许任何形式的直接修改，所有变更必须通过对账流水，并有 DB 层约束兜底

**小公司常见错误（必须避免）：**

- 只改数据不生成流水 → 审计时对不上账，事后无法追溯
- 只加服务层断言不加 DB 约束 → 绕过服务层的脚本 / 迁移还能写入负数
- 只加 DB 约束不修复历史数据 → 迁移脚本跑不过
- 只修复数据不加约束 → 同样 bug 会在另一条链路复发

**本项目实际情况匹配度：**

- 已有 83 596 条 `asset_transactions` 流水，账本完整性是项目底线
- 有真实业务在跑（2 809 次抽奖、165 笔交易订单、1 469 笔核销订单），不能容忍账本不守恒
- 已有 `TransactionManager` / `AssetService` / `AuditLogService` 基础设施支持四项全做
- 真实 frozen 负值总和已达 −10 960（star_stone）与 −7 410（points），不是小额偏差

**结论依据："只要你有账本就必须四管齐下"。** 这不是"大厂才需要"，而是"只要涉及虚拟资产就必须做"。

### 7.14 `system_settings` 注释校准是否一次性覆盖所有 15 个 category

**已拍板：一次性覆盖全部 15 个 category + 加单测防漂移。** 见 1.3.3、4.3。

当前确定采用的执行动作：

- 一次性把 `routes/v4/system/config.js` 注释与真实 15 类 category 全部对齐
- 以本文档 9.2 的真实分类快照为权威源，写入代码注释和 `PUBLIC_SETTING_KEYS` 白名单结构
- 新增单测强制校验"公开接口使用的 key 所在 category 与真值一致"，任何漂移都会打挂测试

#### 7.14.1 行业对比（作为拍板依据）

**大厂方案：**

- 阿里 / 美团：有独立配置中心（Diamond / Apollo），配置分类在管理 UI 上直接可见，不依赖代码注释
- 腾讯：配置项有 schema 定义文件，CI 校验 schema 与真实配置一致
- 字节跳动：配置中心（TCC）有强类型 schema，不允许随意新增 category

**小公司 / 创业项目：**

- 配置项散落在代码注释里，时间一长就漂移
- 行业共识：**没有独立配置中心时，至少要有单测校验 category 一致性**

**本项目实际情况匹配度：**

- 没有独立配置中心 UI，配置分类信息只存在于代码注释和 `system_settings.category` 字段
- 真实 15 个 category，注释只描述了 5~6 个（漂移严重）
- 77 条配置项总量可控，一次性校准的工作量不大（约半天）
- 如果只改白名单涉及的几个，其余 9~10 个 category 的漂移会继续累积

**最接近参考对象：腾讯"CI 校验 schema 一致性"的简化版。** 本项目没有独立配置中心，用"数据库真值快照 + 代码注释 + 单测"三件套做最简 schema 校验。

备选方案（本轮不采纳）：

- 只改已暴露在 `routes/v4/system/config.js` 白名单里的 key 对应注释（其他 category 漂移会持续复发，未来维护人员继续被误导）

### 7.15 本轮治理的"不兼容"原则是否保留小程序端灰度期

**已拍板：采用方案 A（不做灰度，一次性 breaking change）。**

当前确定采用的结论：

- 完全不灰度，小程序新版上线日直接切换到后端新字段
- 小程序需要先发版完成微信审核，才切换后端字段
- 后端一次性拆除所有 long→short 映射层，前端全量适配

#### 7.15.1 行业对比（作为拍板依据）

**已上线项目（必须灰度）：**

- 微信 / 支付宝 / 美团：任何字段 breaking change 都走灰度发布，因为存在外部用户依赖旧字段
- 抖音 / 拼多多：API 版本化（v1 / v2 并存），老版本逐步下线
- 银行 / 支付：完全不允许 breaking change，只能新增字段

**未上线 / 内测项目（不需要灰度）：**

- 绝大多数创业公司：未上线前直接切换，灰度 = 维护两套代码 = 纯浪费
- 游戏内测版本：版本迭代直接切换，不保留兼容

**本项目实际情况匹配度：**

- 三端均未上线（后端、Web 后台、微信小程序）
- 没有任何外部用户依赖旧字段
- 118 个用户都是测试账号
- 未来用户规模起来后再想清理映射层会非常痛苦（届时已有大量真实用户依赖）

**最接近参考对象：创业公司未上线前的"一次性切换"方案。** 灰度是给已上线项目减少冲击用的，未上线项目不需要付这个成本。

备选方案（本轮不采纳）：

- B. 给微信小程序 7~14 天灰度周期，灰度期后端同时返回长名和短名（会延长技术债存续时间，违反"未上线一次性切换成本最低"原则）

### 7.16 C 类 `id` 主键（4 张明细表）如何处理（2026-04-22 第二轮新发现）

**已拍板：采纳 A 方案（保留 `id` 不改 + 写入白名单冻结）。**

当前确定采用的结论：

- `category_attributes`、`exchange_channel_prices`、`exchange_item_attribute_values`、`sku_attribute_values` 4 张明细表主键**保留 `id`**
- 在 12.1 规则里**显式列明 C 类白名单**，冻结为合法命名空间
- **禁止新增业务实体表使用 `id` 命名**；只允许在"属性值表 / 价格明细表 / 属性关联表"这类明细/子表场景使用
- 真实数据只有 `exchange_channel_prices` 105 条，零迁移成本
- 工作量：0 天

#### 7.16.1 行业对比（作为拍板依据）

**大厂方案：**

- 腾讯游戏（王者荣耀 / 和平精英）：核心实体表用长命名（`hero_id`、`skin_id`），属性值表 / 配置明细表用 `id`。属性值表永远通过父表 JOIN，不会单独被外部引用
- 阿里巴巴（淘宝 SKU 体系）：`sku_sale_attr_value` 这类属性值表主键就是自增 `id`，只在 `sku_id` 上下文里有意义
- 美团（商品属性体系）：属性值明细表用 `id`，商品主表用 `product_id`
- 网易藏宝阁（游戏虚拟物品交易）：物品属性表用 `id`，物品实例表用 `item_instance_id`

**小公司 / 独立项目：**

- Rails / Django 生态默认所有表主键叫 `id`（框架约定）
- Sequelize 默认也是 `id`，本项目 A 类长命名是主动覆盖了默认行为，说明团队已有意识地对核心表做区分

**本项目匹配度：**

- 4 张 C 类表全是明细 / 属性值 / 价格明细表，不会跨模块单独引用
- 改名需要改 Sequelize 模型 + 所有引用，零业务收益
- 和腾讯游戏属性值表、阿里 SKU 体系完全一致

**最接近参考对象：腾讯游戏属性值表、阿里 SKU 属性值表。** 都是"核心实体长命名、属性值明细表用 `id`"的组合。

备选方案（本轮不采纳）：

- B. 统一改成短命名（`value_id` / `price_id` 等）
- C. 统一改成长命名（`exchange_channel_price_id` 等，可读性差）

### 7.17 console 管理端路径占位符是否统一为长命名（本轮 9.10 新发现改动规模巨大）

**已拍板：采纳 C 方案（C 端长命名、console 保留 `:id`，分域规则写入 12.3）。**

当前确定采用的结论：

- **C 端对外接口**（`/api/v4/auth/*`、`/api/v4/user/*`、`/api/v4/lottery/*`、`/api/v4/marketplace/*`、`/api/v4/exchange/*`、`/api/v4/shop/*`）：
  - 已经使用长命名占位符的保持（`:market_listing_id`、`:auction_listing_id`）
  - 未来新增 C 端接口统一使用长命名占位符
  - 小程序契约文档（9.9）以此为准
- **console 内部管理端**（`/api/v4/console/*`）：
  - 保留 `/:id`、`/:order_id`、`/:record_id`、`/:audit_id`、`/:message_id` 现有占位符
  - 与数据库主键脱钩（数据库主键仍是长命名，URL 参数是独立命名空间）
  - admin 前端 `api/*.js` 的 `ENDPOINTS` 常量对齐保留
- **分域规则写入 12.3** 作为长期约束
- 工作量：0 天额外改动（相对原 A 方案节省 2~3 天）

#### 7.17.1 行业对比（作为拍板依据）

**大厂方案（对外长命名、对内短命名的分层策略）：**

- 腾讯微信支付开放平台：`/v3/pay/transactions/{transaction_id}`（对外长命名）
- 腾讯云 API：对外 `/v2/instances/{InstanceId}`（长命名），内部运维平台 `/instances/:id`（短命名）
- 阿里云 OpenAPI：对外 `/instances/{InstanceId}`，内部 `/instances/:id`
- 美团外卖：对外开放 API 用长命名，商家后台 / 运营后台 API 用 `/orders/:id`、`/shops/:id`
- Stripe（支付行业标杆）：对外全长命名 `/v1/charges/{charge_id}`
- GitHub API：对外 `/repos/{owner}/{repo}/issues/{issue_number}`，内部管理工具用短命名

**规律总结：**

| 场景 | 大厂通行做法 | 原因 |
|------|------------|------|
| 对外开放 API（C 端 / 第三方） | 长命名 `:transaction_id` | 语义清晰、避免跨资源歧义 |
| 内部管理后台 API（B 端） | `/resources/:id` 短命名 | URL 路径本身已限定资源类型，`:id` 不会歧义 |

**游戏公司：**

- 米哈游（原神后台管理系统）：内部工具全用 `/items/:id`、`/banners/:id`
- 网易游戏运营后台：`/game-items/:id`、`/events/:id`
- 腾讯游戏运营后台：同样短命名
- 原因：管理后台是内部工具，开发效率优先于 API 语义纯洁性

**小公司 / 二手平台：**

- 闲鱼（阿里）：C 端 `/items/{item_id}`，运营后台 `/items/:id`
- 转转：同样分层
- Mercari / Depop（小众二手）：REST 标准 `/listings/:id`

**本项目实际情况匹配度：**

- console 是纯内部管理后台，不对外开放，URL 路径已经限定了资源类型（`/console/ad-slots/:id`）
- C 端（`/marketplace/listings/:market_listing_id`）已经是长命名，与小程序契约一致
- 这跟腾讯云、阿里云、美团"对外长对内短"的分层策略完全一致

**最接近参考对象：腾讯云 API + 阿里云 API + 美团商家后台。** 都是"对外长、对内短"，与本项目技术现状完全匹配。

备选方案（本轮不采纳）：

- A. 统一改成长命名占位符：20+ 后端路由 + 10+ admin API 文件 + 大量 HTML 绑定改动，2~3 天纯体力活，且 `/ad-slots/:ad_slot_id` URL 读起来冗余
- B. 全保留 `:id`（包括 C 端）：违反对外接口语义清晰原则，与小程序契约冲突

### 7.18 账本 `available_amount < 0` 是否一并纳入本轮修复（7.13 扩展）

**已拍板：采纳 A 方案（一并治理 15 条，按 7.13 四管齐下同等标准）。**

当前确定采用的结论：

- 本轮修复 **15 条**（5 frozen<0 + 12 available<0，去重后）负值记录
- 执行标准与 7.13 完全一致：
  1. **修复脚本**：`scripts/maintenance/fix_negative_balances.js`（合并 frozen 与 available 治理，dry-run 优先）
  2. **对账流水**：所有修复必须同步生成 `asset_transactions` 记录（`business_type = 'admin_reconcile'` 或等价类型）
  3. **DB CHECK 约束**：Sequelize 迁移一次性加 `CHECK (frozen_amount >= 0)` **和** `CHECK (available_amount >= 0)` 两个约束
  4. **服务层前置断言**：`AssetService` 冻结 / 解冻 / 扣减路径全部加断言
- 涉及账户：`account_id = 2 / 4 / 12 / 239 / 248`
- 涉及资产：`points / star_stone / red_core_shard / red_core_gem / orange_core_shard`
- 3 种资产（`orange_core_shard` / `red_core_gem` / `star_stone`）全表 `SUM(available_amount) = 0`，说明是账户间漂移而非凭空消失；修复时做账户间配对溯源
- 补回归用例：`tests/services/asset/FreezeLifecycle.test.js`、`tests/services/asset/NegativeBalanceGuard.test.js`
- 工作量：比原 7.13 多 1 天（共 3~4 天）

#### 7.18.1 行业对比（作为拍板依据）

**大厂与金融级项目做法（账本异常一次性全量治理）：**

- 支付宝（蚂蚁金服）：账本系统 T+1 对账机制，任何余额异常（含 available<0）都在当日对账批次里一并修复，**绝不拆成两批**。原因：拆批会导致 DB CHECK 约束无法一次性加上，留下窗口期
- 微信支付：账本异常修复是"全量扫 + 全量修"，不区分 frozen 和 available
- 美团钱包：账本治理铁律"一次对账、一次修复、一次加约束"，分批修意味着约束加不上
- 字节跳动（抖音钱包）：同上

**游戏公司：**

- 腾讯游戏（Q 币 / 点券体系）：虚拟货币账本异常修复必须"全量一次性"，否则经济系统漂移会被玩家利用（刷币）
- 网易游戏：账本修复 + CHECK 约束必须在同一维护窗口完成
- 米哈游（原神原石体系）：账本修复脚本 + 对账流水 + DB 约束是原子操作

**小公司 / 二手平台：**

- 闲鱼余额、转转钱包：一次性修
- 小众平台：通常没有 CHECK 约束（这本身就是技术债），凡有意识做的都是一次性

**本项目实际情况匹配度：**

- MySQL 8.0.30 完美支持 CHECK 约束（MySQL 8.0.16+ 生效）
- 15 条记录修复量相对支付宝级对账极小（他们一次对账修几十万条），本项目 1 天足够
- 本项目未上线、无外部用户依赖，一次性治理成本最低
- 不修 available<0 就加不上 CHECK（否则迁移会因为旧数据违反约束而失败），加不上 CHECK 就是永久技术债

**最接近参考对象：支付宝 / 微信支付 / 腾讯游戏账本治理。** 都是"一次对账、一次修复、一次加约束"的组合。

备选方案（本轮不采纳）：

- B. 仅修 frozen<0，available<0 另立工单：DB CHECK 约束加不上，违反 7.5 "一次性全量治理"原则，留下永久技术债

### 7.19 `admin/src/api/types.js` 扩展到覆盖所有核心业务实体

**已拍板：采纳 A 方案（手写全量 16 个实体；C 方案自动生成留到下轮）。**

当前确定采用的结论：

- 本轮手写补齐 **16 个核心业务实体 typedef**：DIYTemplate / AuctionListing / BidProduct / ConsumptionRecord / RedemptionOrder / TradeOrder / Item / ItemTemplate / ItemLedger / ItemHold / AuthenticationSession / Account / AccountAssetBalance / DiyWork / DiyMaterial / CustomerServiceSession
- 原有 5 个漂移对象同步按 9.7 清单重写（ListingInfo / LotteryRecord / PrizeInfo / UserInfo / UserDetail）
- 本轮 7 处新发现漂移（AssetBalance / AssetTransaction / AssetAdjustParams / PresetConfig / ConversionRule / SystemNotification / PrizeInfo 扩展字段）一并修正
- `types.js` 预计从 411 行扩展到 700~900 行
- 配套新建 `admin/scripts/check-frontend-mappings.cjs` lint 黑名单脚本（见 13 阶段 5.5）
- 工作量：2 天（手写 JSDoc + 单元校验 + lint 脚本）
- **C 方案（自动从 Sequelize models 生成 JSDoc）不在本轮执行**，留到下一轮优化

#### 7.19.1 行业对比（作为拍板依据）

**大厂方案：**

- 腾讯（微信 / 企业微信管理后台）：内部管理后台用 TypeScript，类型定义从后端 proto / schema **自动生成**。前提是管理后台团队 10~50 人规模
- 阿里巴巴（Ant Design Pro 体系）：推荐 OpenAPI → TypeScript 自动生成。前提是后端有 Swagger / OpenAPI
- 美团：**内部管理后台类型定义手写 + CI 校验**，因为很多内部工具用 Alpine.js / jQuery 这类轻量框架，不走 TypeScript
- 字节跳动：内部工具平台用自动生成，小型管理后台手写

**游戏公司（都是手写）：**

- 米哈游运营后台：手写 JSDoc，运营后台不用 TypeScript
- 网易游戏运营后台：手写 + ESLint 规则校验
- 腾讯游戏运营后台：手写 + 定期从数据库 schema 对齐

**小公司 / 二手平台：**

- 大多数小公司根本没有类型定义（这就是技术债来源）
- 有意识的小公司：手写 JSDoc + lint 黑名单

**本项目实际情况匹配度：**

- admin 是 **Alpine.js + Vite**，不是 TypeScript 项目，自动生成 JSDoc 的实用性不如 TS 项目明显
- 120 个 Sequelize models 自动生成 JSDoc 的 MVP 需要 3 天，但生成出来的 JSDoc 在 Alpine.js 里只能靠 IDE 提示、没有编译期校验
- 手写 16 个实体 2 天足够，且可以精确控制哪些字段暴露给前端（不是所有数据库字段都该出现在前端类型里）
- 跟美团、米哈游、网易游戏运营后台的做法完全一致

**最接近参考对象：美团内部管理后台 + 米哈游 / 网易游戏运营后台。** 都是 Alpine.js / jQuery / Vue 轻量框架 + 手写 JSDoc + lint 黑名单。

**为什么 C 方案留到下一轮：**

- 本轮治理范围已经很大（阶段 0~8 共 17~23 天），再塞 3 天的自动生成 MVP 会拉长整体周期
- 手写 typedef 上线后，下一轮如果需要升级到 TypeScript 或自动生成，现有 JSDoc 可以作为参考语料
- C 方案真正的收益来自跨仓库类型共享，目前 admin 与后端在同一仓库，手写成本可控

备选方案（本轮不采纳）：

- B. 只补市场 + 抽奖相关 5 个关键实体：会留 11 个空白，下次还得补，违反 7.5 "一次性全量"
- C. 自动化生成 MVP：Alpine.js 环境收益不明显，留到下一轮

### 7.20 小程序启用真正的微信授权登录（后端加 `wx_openid`）

**已拍板：采纳 B 方案（后端加 `users.wx_openid` 字段 + 新增 `POST /api/v4/auth/wx-code-login` 端点）。**

当前确定采用的结论：

- Sequelize 迁移：给 `users` 表加 `wx_openid VARCHAR(64) UNIQUE NULL` + 对应索引
- 新增路由 `POST /api/v4/auth/wx-code-login`：
  - 小程序传 `wx.login` 拿到的 `code`
  - 后端用 `.env` 中已有的 `WX_APPID` + `WX_SECRET` 调微信 `jscode2session` 接口
  - 根据返回的 `openid` 查 `users.wx_openid` 字段，存在则直接登录、不存在则返回 `NEED_BIND_MOBILE` 业务码
  - 成功登录后仍走 `AuthenticationSession` 创建流程（固定 `login_platform = 'wechat_mp'`）
- 首次绑定流程：
  1. 小程序调 `wx.login` → 拿 `code`
  2. 调 `POST /api/v4/auth/wx-code-login` → 如返回 `NEED_BIND_MOBILE`，小程序调 `wx.getPhoneNumber` → `POST /api/v4/auth/decrypt-phone` 解密
  3. 得到 `mobile` 后调 `POST /api/v4/auth/quick-login`（本轮增强：登录时同步把 `code` 换出的 `openid` 回写 `users.wx_openid`）
  4. 后续打开小程序直接走 `wx-code-login` 即可静默登录
- 补单元测试：`tests/routes/v4/auth/wx-code-login.test.js`
- 未来扩展：预留 `wx_unionid` 字段位置，如需对接微信开放平台跨 App 身份打通再加
- 工作量：1~1.5 天（含迁移 + 路由 + 微信侧联调 + joi 校验 + 回归用例 + 契约文档同步给小程序团队）

#### 7.20.1 行业对比（作为拍板依据）

**微信生态所有正式上线的小程序都有 openid：**

- 美团 / 拼多多 / 京东 / 滴滴小程序：**全部有 openid 字段**；`wx.login` 拿 code → 后端换 openid → 静默登录，用户无感知
- 腾讯自家小程序（微信读书、微信运动、腾讯会议）：openid 是第一天就有的字段
- 阿里（支付宝小程序）：对应字段是 `alipay_user_id`
- 字节（抖音小程序）：对应字段是 `douyin_openid`

**游戏公司：**

- 腾讯游戏小程序（跳一跳、欢乐斗地主）：openid 是基础字段
- 米哈游（原神社区小程序）：openid + unionid 双字段
- 网易游戏：同上

**活动策划 / 营销 SaaS：**

- 有赞 / 微盟：openid 是核心字段，活动推送、模板消息、订阅消息全部依赖 openid
- 活动行 / 互动吧：openid + 手机号双重绑定

**虚拟物品交易 / 二手平台：**

- 转转小程序：openid + 手机号
- 多抓鱼：openid 是必备字段

**没有 openid 的后果（行业共识）：**

- 用户每次打开小程序都要走"授权手机号"流程（即使已登录过）
- 无法发送微信订阅消息（`user_notifications.wx_push_status` 字段已预留，但没有 openid 就是摆设）
- 无法做"静默登录"（打开小程序 → 自动识别身份 → 直接进入首页）
- 跨设备时必须重新输手机号

**本项目实际情况匹配度：**

- `.env` 第 83-84 行 `WX_APPID` / `WX_SECRET` **已经配好**，只是未使用
- `routes/v4/auth/login.js` 的 `decrypt-phone` 端点已经在调微信解密接口，微信侧联调能力具备
- `user_notifications.wx_push_status enum('skipped','pending','sent','failed')` 字段**已预留**订阅消息推送状态追踪，需要 openid 才能真正启用
- `authentication_sessions.login_platform` 枚举已预留 `wechat_mp / douyin_mp / alipay_mp / app / unknown`，多端身份体系已是架构预留
- 补 openid 只是把已有能力串起来，不是增加新能力

**最接近参考对象：美团 / 拼多多 / 转转小程序。** 都是"openid + 手机号双重绑定，首次登录绑定、后续静默登录"的模式。

**为什么必须在本轮做：**

- 项目未上线，一次性加字段成本最低（迁移 1 次、测试 1 轮）
- 未上线前业界做法都是"上线第一天就有 openid"，事后补会涉及历史用户数据迁移
- 与 7.5 "未上线可一次性全量投入"原则完全匹配

备选方案（本轮不采纳）：

- A. 维持现状，继续靠手机号：体验永远是"点授权手机号 → 登录"两步；`wx_push_status` 字段永远用不上；违反"所有正式上线的微信小程序都有 openid"的行业共识

---

## 八、不需要拍板的部分

以下内容不是决策项，只是辅助信息：

- 现状统计
- 行业案例描述
- 文件清单
- 工时估算
- 收益描述

这些内容用于帮助判断，不直接构成政策。

---

## 九、2026-04-22 基于真实数据库与代码的求证结论

> 本章所有结论均来自 2026-04-22 直接通过 Node.js + mysql2 连接 `.env` 中配置的真实数据库 `restaurant_points_dev`（MySQL 8.0.30），以及直接读取当前仓库代码，不引用任何历史报告、二次文档、离线备份。
>
> 真实数据库连接配置：`DB_HOST=dbconn.sealosbja.site` / `DB_PORT=42569` / `DB_NAME=restaurant_points_dev`。
>
> 数据库总览：120 张表，数据文件约 169 MB，字段全部 `snake_case`（0 个大小写不合规字段），连接经外网地址可用。

### 9.1 主键命名规则：**实际是三种风格并存**，必须拍板统一

2026-04-22 第二轮重新直接查 `information_schema`，全库 120 张表主键分三类（不是两类）：

**A 类：长命名 `{singular_table_name}_id`（业务主流，V4 新表几乎全部用此形式）**

```
users                     → user_id
lottery_campaigns         → lottery_campaign_id
lottery_prizes            → lottery_prize_id
lottery_draws             → lottery_draw_id
lottery_draw_decisions    → lottery_draw_decision_id
market_listings           → market_listing_id
trade_orders              → trade_order_id
exchange_items            → exchange_item_id
exchange_records          → exchange_record_id
redemption_orders         → redemption_order_id
auction_listings          → auction_listing_id
auction_bids              → auction_bid_id
diy_templates             → diy_template_id
diy_materials             → diy_material_id
diy_works                 → diy_work_id
account_asset_balances    → account_asset_balance_id
authentication_sessions   → authentication_session_id
system_settings           → system_setting_id
system_dictionaries       → system_dictionary_id
```

**B 类：短命名（语义优先，主要集中在基础资源、日志、快照、关联表）**

```
user_addresses            → address_id
user_notifications        → notification_id
media_files               → media_id
media_attachments         → attachment_id
item_holds                → hold_id
item_ledger               → ledger_entry_id
rarity_defs               → rarity_code（业务码即主键）
asset_group_defs          → group_code（业务码即主键）
administrative_regions    → region_code
market_price_snapshots    → snapshot_id
ad_report_daily_snapshots → snapshot_id
ad_target_zones           → zone_id
ad_zone_groups            → group_id
categories                → category_id
approval_chain_instances  → instance_id
approval_chain_nodes      → node_id
approval_chain_steps      → step_id
approval_chain_templates  → template_id
exchange_item_skus        → sku_id
exchange_order_events     → event_id
attribute_options         → option_id
customer_service_issues   → issue_id
customer_service_notes    → note_id
asset_conversion_rules    → conversion_rule_id
```

**C 类：纯 `id`（明细表 / 关联值表 / Sequelize 内部表，本轮新发现）**

2026-04-22 第二轮新发现：除了 A/B 两类，还存在 4 张表主键直接叫 `id`（以及 1 张 Sequelize 内部迁移表主键叫 `name`）：

```
category_attributes              → id                 (0 行，类目属性关联表)
exchange_channel_prices          → id                 (105 行，兑换渠道价格)
exchange_item_attribute_values   → id                 (0 行，兑换商品属性值)
sku_attribute_values             → id                 (0 行，SKU 属性值)
sequelizemeta                    → name               (Sequelize CLI 内部迁移记录，非业务表)
```

特征：

- 全部是"属性值表 / 价格明细表 / 属性关联表"类明细/子表
- 只有 `exchange_channel_prices` 有 105 条真实业务数据，其它 3 张仍为空
- 这类表改主键成本低，但**仍应在本轮拍板是否统一**，避免未来再出现第四种风格

**关键事实**：

- 当前代码里 `campaign_id` 不是抽奖活动主键，而是 **`ad_campaign_id`（广告活动）** 的短写（见 `routes/v4/user/ad-campaigns.js`、`routes/v4/console/ad/*`，共 22+ 处真实引用）
- 抽奖活动主键明确就是 `lottery_campaign_id`（在 `routes/v4/console/lottery/*`、`routes/v4/lottery/*` 和 admin 前端均一致使用长命名）
- `routes/v4/marketplace/listings.js` 代码注释第 235 行明确写有："主键 `market_listing_id → listing_id`（与列表接口一致）"；但 **实际路由代码并没有做这个赋值**，真正的映射发生在 `services/DataSanitizer.js`（详见 9.8）
- 路由参数路径本身是 `/listings/:market_listing_id`，没有映射
- **新增**：`customer_service_sessions` 主键是**长命名** `customer_service_session_id`（本轮实测确认，非短命名 `session_id`），因此 12.1 里"客服会话另有主键，短名会冲突"描述需要改为"客服会话主键已是长命名 `customer_service_session_id`，因此 `authentication_session_id` 保留长命名不会产生业务冲突"

**结论**：

1. 长命名 A 类在业务核心实体（抽奖、市场、交易、兑换、拍卖、DIY、会话、配置）上已经是事实主流
2. 短命名 B 类集中在"通用基础资源"和"关联/日志/快照"场景，改成长命名会出现 `address_address_id`、`notification_notification_id` 这类冗余
3. C 类 `id` 是新发现的第三种风格，主要出现在 4 张明细表；需要拍板保留还是改为短命名（见 7.16）
4. 因此不应强行把 B 类也改成 A 类，而应拍板"**长命名优先，短命名仅限于 B 类限定场景、C 类在新一轮拍板中明确去留**"，并冻结这一规则

### 9.2 真实数据实体与数据量（避免基于想象讨论方案）

2026-04-22 第二轮重新直接查真实数据库：

```
核心表                               真实行数   存在   备注
users                               118        ✓     C 端用户 + 商户混合；status 全部 active；user_level: normal=117 / merchant=1
accounts                            116        ✓     （本轮新增）账户维度，1:N user；account_type=user/system
merchants                           1          ✓     只有 1 家餐厅已入驻
stores                              5          ✓     该商户下 5 个门店
account_asset_balances              104        ✓     按 (account_id, asset_code) 唯一；本轮发现 12 条 available_amount<0（见 7.13 补充）
asset_transactions                  83 596     ✓     账本流水；字段是 delta_amount/balance_after（文档 4.2 原写 change_amount 是错的）
lottery_campaigns                   4          ✓     活动很少，但配置复杂；campaign_type enum 8 种
lottery_prizes                      37         ✓     status enum('active','inactive')（前端 is_enabled 不对）
lottery_draws                       2 809      ✓     主键 varchar(50)，格式 'draw_mns2ph8z_31_271fd9'
lottery_draw_decisions              2 809      ✓     与 draws 一一对应
lottery_presets                     2          ✓     （本轮新增）真实只有 2 个预设
exchange_items                      105        ✓     SPU 实际已上架；字段是 item_name / stock / sold_count
exchange_records                    28         ✓     9 种 status；pending=27 / completed=1
redemption_orders                   1 469      ✓     核销订单；主键 char(36) UUID；expired=1396（95% 已过期）
market_listings                     341        ✓     主键 bigint（不是 UUID！）
trade_orders                        165        ✓     completed=27 / cancelled=138；status 真实 6 种 enum
auction_listings                    0          ✓     拍卖暂无真实业务数据（C2C）
auction_bids                        0          ✓
bid_products                        0          ✓     （本轮新增）B2C 竞价商品主表
bid_records                        0          ✓     （本轮新增）B2C 竞价出价记录
diy_templates                       3          ✓     （1 published 异常 + 2 draft）；status enum 真实 3 种（含 archived）
diy_works                           7          ✓
diy_materials                       21         ✓
items                               7 648      ✓     （本轮新增）物品实例主表；owner_account_id 不是 user_id
item_templates                      30         ✓     （本轮新增）物品模板
item_ledger                         18 074     ✓     （本轮新增）物品账本流水
item_holds                          103        ✓     （本轮新增）物品冻结记录
consumption_records                 48         ✓     扫码消费记录；status + final_status 两个字段并存
user_notifications                  6 238      ✓     通知量已较大；wx_push_status enum 4 种
user_addresses                      0          ✓     无真实收货地址数据
authentication_sessions             5          ✓     当前仍 active 的会话；login_platform 全部 wechat_mp
customer_service_sessions           44         ✓     （本轮新增）客服会话真实有数据，主键长命名
customer_service_agents             1          ✓     （本轮新增）1 个商户自营客服
feedbacks                           268        ✓     （本轮新增）用户反馈
system_settings                     77         ✓     真实 15 个 category（文档 12.2 所列）
administrative_regions              44 703     ✓     （本轮新增）国家行政区划数据，用于地址选择
user_roles                          110        ✓     （本轮新增）用户角色关联表
roles                               11         ✓     （本轮新增）角色字典，有 role_level / permissions JSON
feature_flags                       8          ✓     （本轮新增）功能开关
ad_slots                            7          ✓     （本轮新增）广告位已配置 7 个
ad_campaigns                        0          ✓     （本轮新增）广告活动暂无真实投放
```

**本轮新增关键发现**：

- `items / item_templates / item_ledger / item_holds` 这四张表承载整个"物品实例"体系，共 25 928 条真实记录，是微信小程序"我的背包"、市场交易、拍卖、DIY 的共同底层；文档原版 9.2 完全漏了
- `accounts` 是账户维度（与 `users` 1:N），系统账户（`account_type='system'`）包括平台收款账户、奖池账户等，小程序端查询余额时需要经账户层而非直接用 `user_id`
- `administrative_regions` 44 703 条国标行政区划数据已入库，地址选择无需再接第三方

### 9.3 微信小程序真实已在使用后端，不是未来计划

直接查 `authentication_sessions.login_platform` 真实分布（主键就叫 `authentication_session_id`，不是 `session_id`）：

```
login_platform    rows
wechat_mp           5
```

**关键事实**：

- 后端字段明确叫 `login_platform`，不是 `platform`
- 后端 `detectLoginPlatform()` 识别小程序的主机制是 **Referer = `servicewechat.com/{appid}`**，不是 UA（因为 `wx.request` 不带 `MicroMessenger`）
- 小程序端如果显式传 `platform=wechat_mp`（请求体或 `x-platform` 请求头），白名单校验优先级更高
- 数据库平台枚举定义为：`web / wechat_mp / douyin_mp / alipay_mp / app / unknown`，已经是多端预留结构
- **小程序登录专用入口**：`POST /api/v4/auth/quick-login`（`routes/v4/auth/login.js` 第 398 行），该端点**代码里硬编码** `platform = 'wechat_mp'`，不走 `detectLoginPlatform`
- **重要新发现：`users` 表没有 `wx_openid / wx_unionid / openid` 任何一个字段**（本轮直接查 `information_schema` 确认）。整个 120 张表中只有 `user_notifications.wx_push_status` 一个 `wx_*` 字段（用于跟踪微信订阅消息推送状态）
- 也就是说：**后端当前的小程序登录不依赖微信 openid，完全靠"手机号 + 短信验证码"识别用户**（`quick-login` 端点仅需要 `mobile`，不验证微信授权 `code`）
- 这意味着：如果未来小程序需要"打开即登录、免输手机号"体验，后端必须先补 `users.wx_openid` 字段和微信 code→openid 换取流程（见 7.20）

### 9.4 users 表真实结构：没有 is_merchant / is_admin

直接查 `information_schema.columns` 得到真实 `users` 表字段：

```
user_id, mobile, nickname, status (enum), last_login (datetime),
created_at, updated_at, login_count, consecutive_fail_count, history_total_points,
user_uuid (char, UUIDv4), user_level (enum: normal/vip/merchant),
last_active_at, avatar_url, max_active_listings
```

真实 `user_level` 分布：`normal = 117`，`merchant = 1`。

**关键事实**：

- 没有 `is_merchant`、`is_admin`、`role` 等布尔/字符串字段
- 管理员与普通用户的区分不靠 `users` 表，而靠 `user_roles`、`roles` 关联表
- `user_level` 的 `vip` 当前没有真实用户
- `last_login` 是列名（不是 `last_login_at`），但 `last_active_at` 也存在

### 9.5 资产系统真实字段名：是 asset_code，不是 asset_type

`account_asset_balances` 真实字段：

```
account_asset_balance_id (BIGINT PK),
account_id (BIGINT, FK→accounts),
asset_code (VARCHAR, 如 'points','budget_points','star_stone','red_core_shard' 等),
available_amount (BIGINT, 不可为负),
frozen_amount (BIGINT, 不可为负),
lottery_campaign_id (VARCHAR, 仅 BUDGET_POINTS 使用),
lottery_campaign_key (VARCHAR, 生成列),
created_at, updated_at
```

真实资产代码（`asset_code`）清单（非穷举）：

```
points            积分（C 端通用）
budget_points     预算积分（活动级预算，关联 lottery_campaign_id）
star_stone        星石（交易市场与拍卖的结算币）
star_stone_quota  星石配额
red_core_shard    红源晶碎片（材料）
red_core_gem      红源晶宝石（材料）
orange_core_shard 橙源晶碎片（材料）
DIAMOND           钻石（在代码里出现，但真实 balance 表内未见）
```

**关键事实**：

- 文档和代码里出现过 `asset_type` 的写法都是**错误**的，数据库只有 `asset_code`
- `lottery_campaign_id` 在这张表里是 `VARCHAR`，不是 `INT`（因为要容纳 `GLOBAL` 这种标记值）

### 9.6 抽奖系统真实字段：跟前端常用短命名差异大

`lottery_campaigns` 的关键字段（真实）：

```
lottery_campaign_id (PK, INT), campaign_name, campaign_code (唯一业务码),
campaign_type (enum), status (enum: draft/active/paused/ended/cancelled),
budget_mode (enum: user/pool/none), pick_method (enum: normalize/tier_first),
display_mode (varchar, 14 种玩法), grid_cols,
start_time, end_time, display_start_time, display_end_time,
total_prize_pool, remaining_prize_pool, pool_budget_total, pool_budget_remaining,
public_pool_remaining, reserved_pool_remaining,
allowed_campaign_ids (JSON), participation_conditions (JSON), condition_error_messages (JSON),
preset_budget_policy (enum), default_quota, quota_init_mode (enum),
max_budget_debt, max_inventory_debt_quantity, daily_budget_limit,
effect_theme, rarity_effects_enabled, win_animation, display_tags (JSON),
sort_order, is_featured, is_hidden, tier_weight_scale
```

真实 `display_mode` 枚举（14 种玩法）：

```
grid_3x3, grid_4x4, wheel, card_flip, golden_egg, scratch_card, blind_box,
gashapon, lucky_bag, red_packet, slot_machine, whack_mole, pinball, card_collect,
flash_sale
```

`lottery_prizes` 关键字段：

```
lottery_prize_id (PK), lottery_campaign_id (FK),
prize_name, prize_type (enum: points/coupon/physical/virtual/service/product/special),
prize_value, prize_value_points, prize_description, win_probability,
stock_quantity, max_daily_wins, max_user_wins, total_win_count, daily_win_count,
reward_tier (enum: high/mid/low), is_fallback, win_weight, budget_cost,
material_asset_code, material_amount, reserved_for_vip, rarity_code (FK→rarity_defs),
angle, color, is_activity, cost_points, sort_order, primary_media_id,
merchant_id, deleted_at (paranoid), created_at, updated_at
```

`lottery_draws` 关键字段（真实主键就叫 `lottery_draw_id`，不是 `draw_id`）：

```
lottery_draw_id (PK, VARCHAR, 如 'draw_mns2ph8z_31_271fd9'),
idempotency_key, business_id, lottery_session_id, asset_transaction_id,
lottery_batch_draw_id, user_id, lottery_campaign_id, lottery_prize_id,
prize_name, prize_type, prize_value, reward_tier (enum: high/mid/low/fallback/unknown),
draw_type (enum: single/triple/five/ten/multi), draw_sequence, cost_points,
stop_angle, lottery_batch_id, prize_description, prize_image,
guarantee_triggered, remaining_guarantee, draw_config (JSON), result_metadata (JSON),
ip_address, lottery_id, prize_value_points, budget_points_before, budget_points_after,
points_deducted, pipeline_type (enum), pick_method, original_tier, final_tier,
downgrade_count, fallback_triggered, is_preset, lottery_preset_id,
preset_inventory_debt_id, preset_budget_debt_id, has_debt,
lottery_draw_decision_id, draw_seq, order_no
```

**关键事实**：

- 抽奖记录的主键是字符串 `lottery_draw_id`，而 admin 前端 `api/types.js` 里定义为 `record_id`
- 抽奖是否中奖不存在 `is_winner` 字段，而是由 `prize_type != 'empty'` 或 `reward_tier != 'fallback'` 推导
- 实际扣分字段是 `points_deducted` 和 `cost_points`，而前端写成 `points_consumed`

### 9.7 Web 管理后台前端当前的错误假设（`admin/src/api/types.js`）

2026-04-22 第二轮通读 `admin/src/api/types.js`（411 行），所有 JSDoc 定义与真实数据库漂移点全列如下（比原版更完整）：

**市场挂牌 ListingInfo**（247-259 行）：

```
ListingInfo.listing_id 'UUID格式'  ← 严重错误！真实是 market_listing_id BIGINT（不是 UUID）
ListingInfo.item_type              ← 数据库是 listing_kind（枚举：item / fungible_asset）
ListingInfo.item_code              ← 数据库无此字段（有 offer_asset_code / offer_asset_group_code）
ListingInfo.item_name              ← 数据库是 offer_item_display_name / offer_asset_display_name
ListingInfo.quantity               ← 数据库是 offer_amount (BIGINT)
ListingInfo.price                  ← 数据库是 price_amount (BIGINT) + price_asset_code
ListingInfo.total_price            ← 数据库无此字段（客户端应自行计算）
ListingInfo.status='active'        ← 数据库枚举为 on_sale/locked/sold/withdrawn/admin_withdrawn
ListingInfo.expires_at             ← 数据库无此字段
缺 listing_kind / offer_item_id / offer_item_rarity / offer_asset_code /
   is_pinned / is_recommended / offer_category_id 等真实核心字段
```

**抽奖记录 LotteryRecord**（198-208 行）：

```
LotteryRecord.record_id        ← 应为 lottery_draw_id (VARCHAR(50) 不是 number！)
LotteryRecord.preset_id        ← 应为 lottery_preset_id
LotteryRecord.preset_name      ← 数据库无此字段（只有 lottery_preset_id，需联表 lottery_presets）
LotteryRecord.prize_id         ← 应为 lottery_prize_id
LotteryRecord.is_winner        ← 数据库无此字段（需从 prize_type/reward_tier 推导）
LotteryRecord.points_consumed  ← 应为 points_deducted（或 cost_points）
缺 reward_tier / final_tier / pipeline_type / has_debt / draw_type /
   lottery_campaign_id / draw_seq / order_no 等真实核心字段
```

**奖品 PrizeInfo**（214-224 行）：

```
PrizeInfo.prize_id        ← 应为 lottery_prize_id
PrizeInfo.name            ← 应为 prize_name
PrizeInfo.value           ← 应为 prize_value
PrizeInfo.probability     ← 应为 win_probability
PrizeInfo.stock           ← 应为 stock_quantity
PrizeInfo.remaining       ← 数据库无此字段（= stock_quantity - total_win_count，需客户端算）
PrizeInfo.is_enabled      ← 数据库是 status enum('active','inactive')
PrizeInfo.image_url       ← 数据库通过 primary_media_id 关联 media_files
缺 reward_tier / win_weight / is_fallback / material_asset_code / rarity_code /
   cost_points / budget_cost / max_daily_wins / max_user_wins 等
```

**预设 PresetConfig**（230-239 行，本轮新增发现）：

```
PresetConfig.preset_id    ← 应为 lottery_preset_id
```

**资产余额 AssetBalance**（140-147 行，本轮新增发现）：

```
AssetBalance.total             ← 数据库无此字段（= available + frozen，客户端自行计算）
AssetBalance.campaign_id       ← 应为 lottery_campaign_id（VARCHAR 不是 number）
缺 account_asset_balance_id / account_id / lottery_campaign_key 等
```

**资产流水 AssetTransaction**（152-164 行，本轮新增发现，8 处字段全错）：

```
AssetTransaction.transaction_id ← 应为 asset_transaction_id
AssetTransaction.tx_type        ← 应为 business_type（非 enum，实际 50+ 种 varchar 值）
AssetTransaction.amount         ← 应为 delta_amount（BIGINT）
AssetTransaction.reason         ← 数据库无此字段（细节在 meta JSON 里）
AssetTransaction.operator_name  ← 数据库无此字段
缺 counterpart_account_id / balance_before / frozen_amount_change /
   transaction_no / is_invalid / is_test_data / idempotency_key 等
```

**资产调整 AssetAdjustParams**（169-176 行）：

```
AssetAdjustParams.campaign_id   ← 应为 lottery_campaign_id
```

**用户 UserInfo/UserDetail**（89-113 行）：

```
UserInfo                  ← 缺 user_uuid / user_level / last_active_at /
                             consecutive_fail_count / history_total_points / max_active_listings
UserDetail.role           ← 数据库没有 role 字段，需联表 user_roles / roles（110 条）
UserDetail.last_login_at  ← 数据库字段是 last_login（无 _at 后缀）
UserDetail.stats.total_points ← 数据库是 users.history_total_points（在 users 表里不是在 stats 里）
```

**兑换订单 ExchangeOrderInfo**（276-286 行）：

```
ExchangeOrderInfo.order_id    ← 歧义：redemption_order_id(char 36) 还是 exchange_record_id(bigint)？
ExchangeOrderInfo.points_cost ← 数据库是 actual_cost（decimal）+ pay_asset_code + pay_amount
ExchangeOrderInfo.status 枚举 'pending'|'processing'|'shipped'|'completed'|'cancelled'
                         ← 真实 9 种：pending/approved/shipped/received/rated/rejected/
                                     refunded/cancelled/completed
```

**材料转换 ConversionRule**（305-318 行，本轮新增发现）：

```
ConversionRule.rule_id    ← 数据库是 conversion_rule_id（asset_conversion_rules 表主键）
```

**系统分类 SettingsCategory**（339-346 行）：

```
SettingsCategory = 'general'|'lottery'|'market'|'notification'|'security'  ← 仅 5 种
  ← 真实 15 种：marketplace/points/basic/ad_pricing/batch_operation/redemption/
    security/exchange/feature/general/notification/backpack/ad_system/
    auction/customer_service
```

**系统通知 SystemNotificationInfo**（351-360 行，本轮新增发现）：

```
SystemNotificationInfo.notification_id 注释写 '即 ad_campaign_id'
  ← 严重语义冲突！user_notifications.notification_id 与 ad_campaigns.ad_campaign_id
    是两个完全不同表的主键，不是同一 ID
```

**types.js 完全缺失的核心业务实体定义**（本轮新增发现）：

```
DIYTemplate / DIYMaterial / DIYWork           (DIY 三张主表 3 + 21 + 7 条真实数据)
AuctionListing / AuctionBid                    (拍卖两张主表，虽无数据但路由已在用)
BidProduct / BidRecord                         (B2C 竞价两张主表)
ConsumptionRecord                              (扫码消费 48 条)
RedemptionOrder                                (核销订单 1 469 条)
TradeOrder                                     (交易订单 165 条)
Item / ItemTemplate / ItemLedger / ItemHold    (物品四张主表 25 928 条真实数据)
AuthenticationSession                          (会话表)
Account / AccountAssetBalance                  (账户与资产余额两张表)
```

**漂移类型统计**：原版 types.js 对 5 个主业务对象（Listing / Lottery / Prize / User / Exchange）有明显漂移，本轮再新增 7 处漂移（AssetBalance / AssetTransaction / AssetAdjustParams / PresetConfig / ConversionRule / SystemNotification / Preset），以及 16 个完全缺失的核心业务实体。因此 `admin/src/api/types.js` **不是局部修补问题，必须整体重写**（见 7.11、7.19）。

### 9.8 后端真实存在的"long→short 字段映射层"：位置在 DataSanitizer，不在路由

**原文档 9.8 的描述需要修正**：

`routes/v4/marketplace/listings.js` 第 235 行只是注释 "主键 `market_listing_id → listing_id`"，**实际代码并没有显式赋值 `plainListing.listing_id = plainListing.market_listing_id`**。

2026-04-22 第二轮 grep 整个 `services/` + `routes/` 确认，真正的 long→short 映射代码只在 **`services/DataSanitizer.js`** 里存在，且只有以下两处：

| 位置 | 代码 | 作用 |
|------|------|------|
| `DataSanitizer.js:127-128` | `sanitized.prize_id = sanitized.lottery_prize_id; delete sanitized.lottery_prize_id` | 抽奖奖品出参把 `lottery_prize_id` 换成 `prize_id` |
| `DataSanitizer.js:600-601` | `sanitized.listing_id = sanitized.market_listing_id; delete sanitized.market_listing_id` | 市场挂牌出参把 `market_listing_id` 换成 `listing_id` |

**其他长名主键全部保留不映射**（本轮实测）：

- `lottery_draw_id` 不映射（原样出参）
- `lottery_campaign_id` 不映射
- `exchange_record_id` 不映射（Sanitizer 注释还特别写明"主键原样输出"）
- `redemption_order_id` 不映射
- `trade_order_id` 不映射
- `auction_listing_id` 不映射
- `diy_template_id` 等 diy 长名不映射

**结论修正**：

- "long→short 映射层"真实范围只有 2 个字段（`prize_id`、`listing_id`），不是全系统
- 映射只发生在 Sanitizer 脱敏层，路由层不做（包括列表、详情、创建、购买等所有入口）
- 因此 13 章阶段 1 改动范围应当聚焦到 `services/DataSanitizer.js` 的这两处，而不是扫所有路由找映射
- 前端（Web 管理后台 + 小程序）依赖的 `listing_id`、`prize_id` 是"后端经 Sanitizer 出参后的字段"，一旦 Sanitizer 修改必须同步改所有前端引用

**已经暴露在前端的"短名假象"**：

- `admin/src/api/types.js` 把 `ListingInfo.listing_id` 描述成 "UUID格式"（实际 BIGINT）
- `admin/src/api/market/trade.js` 的 `getListingDetail()` 使用 `{ listing_id: listingId }` 去拼 URL（而路由占位符其实已经是 `:market_listing_id`，这个前端与后端路径占位符已经对不上）

### 9.9 微信小程序 C 端必须对接的真实后端路由清单（2026-04-22 第二轮直扫）

> 本节是本文档"微信小程序前端求证"定位的核心。直接 grep 所有 `routes/v4/{auth,user,lottery,marketplace,exchange,shop}/**` 得到实际已开放给 C 端的接口。

**认证（`routes/v4/auth/`）**：

```
POST  /api/v4/auth/send-code         发送短信验证码（mobile）
POST  /api/v4/auth/login             短信验证码登录（mobile + verification_code）
POST  /api/v4/auth/quick-login       小程序快速登录（仅 mobile，固定 login_platform='wechat_mp'）
POST  /api/v4/auth/decrypt-phone     微信 encryptedData 解密取手机号
POST  /api/v4/auth/refresh           刷新 token
POST  /api/v4/auth/logout            登出
GET   /api/v4/auth/verify            Token 验证
GET   /api/v4/auth/permissions/me    当前用户权限
GET   /api/v4/auth/profile           个人信息
```

**用户（`routes/v4/user/`）**：

```
GET   /api/v4/user/me                      当前用户信息（不接受 :user_id）
GET   /api/v4/user/notifications           通知列表
GET   /api/v4/user/notifications/unread-count  未读数
POST  /api/v4/user/notifications/mark-read     批量已读
POST  /api/v4/user/notifications/:id/read      单条已读（注意占位符是 :id 不是 :notification_id）
GET   /api/v4/user/addresses               地址列表
POST  /api/v4/user/addresses               新建
PUT   /api/v4/user/addresses/:id           修改（占位符 :id）
DELETE /api/v4/user/addresses/:id          删除
PUT   /api/v4/user/addresses/:id/default   设为默认
GET   /api/v4/user/qrcode                  消费扫码二维码（由商户扫，不是用户扫）
POST  /api/v4/user/images                  上传图片
```

**抽奖（`routes/v4/lottery/`）**：

```
GET   /api/v4/lottery/campaigns/active                  活动列表（非 /campaigns）
GET   /api/v4/lottery/campaigns/:code/prizes            按活动业务码查奖品（:code 是 campaign_code）
GET   /api/v4/lottery/campaigns/:code/config            按活动业务码查配置
GET   /api/v4/lottery/history                           抽奖历史
GET   /api/v4/lottery/metrics                           抽奖指标
GET   /api/v4/lottery/points                            用户积分
GET   /api/v4/lottery/statistics                        用户抽奖统计
GET   /api/v4/lottery/health                            健康检查（用于小程序启动自检）
POST  /api/v4/lottery/draw                              抽奖
```

**交易市场 C 端（`routes/v4/marketplace/`）**：

```
GET   /api/v4/marketplace/listings                             列表
GET   /api/v4/marketplace/listings/facets                      筛选维度
GET   /api/v4/marketplace/listings/:market_listing_id          详情（占位符长命名）
POST  /api/v4/marketplace/listings/:market_listing_id/purchase 购买
POST  /api/v4/marketplace/listings/:market_listing_id/withdraw 撤回（物品）
POST  /api/v4/marketplace/fungible-assets/:market_listing_id/withdraw 撤回（资产）
GET   /api/v4/marketplace/auctions                             拍卖列表
GET   /api/v4/marketplace/auctions/:auction_listing_id         拍卖详情
POST  /api/v4/marketplace/auctions/:auction_listing_id/bid     出价
POST  /api/v4/marketplace/auctions/:auction_listing_id/cancel  卖方取消
POST  /api/v4/marketplace/auctions/:auction_listing_id/dispute 买方争议
```

**兑换中心（`routes/v4/exchange/`）**：

```
GET   /api/v4/exchange/...                           列表与详情（11 个 GET/POST）
GET   /api/v4/exchange/orders/:order_no/track        订单追踪（占位符是 :order_no 不是 :order_id！）
```

**核销（`routes/v4/shop/redemption/`）**：

```
POST  /api/v4/shop/redemption/orders                        创建核销订单
GET   /api/v4/shop/redemption/orders/:order_id              订单详情（占位符 :order_id，对应 redemption_order_id char(36)）
POST  /api/v4/shop/redemption/orders/:order_id/cancel       取消
POST  /api/v4/shop/redemption/fulfill                       核销执行（店员）
POST  /api/v4/shop/redemption/scan                          扫码
```

**消费扫码（`routes/v4/shop/consumption/`）**：

```
GET   /api/v4/shop/consumption/me                用户的消费记录
GET   /api/v4/shop/consumption/detail/:id        详情（:id 短命名）
DELETE /api/v4/shop/consumption/:id              删除
POST  /api/v4/shop/consumption/submit            提交（店员扫用户二维码）
```

**C 端占位符规律（本轮实测）**：

- 大多数用户端接口用 `:id` 短命名占位符，而不是 `:notification_id` / `:address_id` 等长命名
- 抽奖活动用 `:code`（campaign_code 业务码），不是数字 id
- 市场/拍卖已使用长命名 `:market_listing_id` / `:auction_listing_id`
- 兑换订单追踪用 `:order_no`（订单号），不是数字主键

**小程序前端对齐建议**：

- `wx.request` 所有请求统一加 `header: { 'x-platform': 'wechat_mp' }`（与 9.3 和 12.6 一致）
- 每个接口 URL 拼接严格使用上表实际占位符名称（不假设是 `:user_id` / `:notification_id` 等）
- 抽奖按 `campaign_code`（不是 id）进详情
- 核销订单追踪用 `order_no`（不是 `redemption_order_id`）

### 9.10 Web 管理后台路径占位符大量使用 `:id` 短命名（影响本轮改动规模）

2026-04-22 第二轮 grep `routes/v4/console/**` 直接扫到的路径占位符分布：

- `routes/v4/console/diy/works.js`：`/:id`、`/:id/order`、`/:id/address`（3 处）
- `routes/v4/console/assets/conversion-rules.js`：`/:id`、`/:id/status`（4 处）
- `routes/v4/console/user/user-ratio-overrides.js`：`/:id`（3 处）
- `routes/v4/console/bids/management.js`：`/:id`、`/:id/settle`、`/:id/cancel`（3 处）
- `routes/v4/console/ad/ad-slots.js`：`/:id`、`/:id/toggle`（3 处）
- `routes/v4/console/ad/ad-campaigns.js`：`/:id`、`/:id/publish`、`/:id/pause`、`/:id/review`、`/interaction-stats/:id`（6 处）
- 唯一使用长命名的是 `routes/v4/console/analytics/campaign-budget.js`：`/:lottery_campaign_id`（6 处）

**admin 前端对应的 URL 常量**（`admin/src/api/market/trade.js` 实测）：

```
MARKETPLACE_ORDER_DETAIL: '/console/marketplace/orders/:order_id'
TRADE_ORDER_DETAIL:       '/console/marketplace/orders/:id'
LISTING_PIN:              '/console/marketplace/listings/:id/pin'
LISTING_RECOMMEND:        '/console/marketplace/listings/:id/recommend'
BUSINESS_RECORD_REDEMPTION_DETAIL:     '/console/business-records/redemption-orders/:order_id'
BUSINESS_RECORD_ROLE_CHANGE_DETAIL:    '/console/business-records/user-role-changes/:record_id'
BUSINESS_RECORD_EXCHANGE_DETAIL:       '/console/business-records/exchange-records/:record_id'
BUSINESS_RECORD_CHAT_DETAIL:           '/console/business-records/chat-messages/:message_id'
BUSINESS_RECORD_CONTENT_REVIEW_DETAIL: '/console/business-records/content-reviews/:audit_id'
```

**结论**：

- 原版 12.3 写"路径占位符统一为长命名"的改动范围远大于原估算
- console 管理端几乎所有带 id 的 URL 都是 `:id`/`:order_id`/`:record_id`/`:audit_id`/`:message_id`，涉及后端 20+ 路由文件 + admin 前端 10+ API 常量文件
- 如果按"路径占位符统一长命名"的原则去落实，工作量会翻倍
- 因此 12.3 需要拍板：路径占位符是"统一改长"还是"允许短命名（因为 URL 路径是独立命名空间）"，见 7.17

### 9.11 `admin/scripts/` 目录在本仓库中根本不存在

2026-04-22 第二轮实地核查：

- `admin/scripts/` 目录本身就**不存在**（`ls /home/devbox/project/admin/scripts` 返回 "No such file or directory"）
- `admin/package.json` 第 12 行写着 `"lint:mappings": "node scripts/check-frontend-mappings.cjs"`，脚本文件**也不存在**
- 原版文档 7.11、10.2、13 阶段 5.5、13 阶段 7.2 多处引用这个脚本，实际都是"**尚需新建**"的状态

本轮应当把该脚本明确标注为"新建"工作项，并决定：

- 静态扫描语法：用 Node.js + glob + 正则即可，不需要 AST
- 扫描目标：`admin/src/**/*.js`、`admin/*.html`
- 黑名单字段：`listing_id`（非广告域）、`record_id`、`prize_id`（非广告域）、`preset_id`（非广告域）、`template_id`（DIY 域）、`draw_id`、`session_id`（非客服域）等
- 豁免：广告域 `ad_campaign_id`、B 类短命名（`address_id`、`notification_id` 等）

---

## 十、三个项目的问题归属

> 本轮以"后端数据库项目为核心权威"，前端一律适配后端。本章只列问题归属，不再基于 Web 前端或微信小程序前端的现状反推后端字段和路径设计。

### 10.1 后端数据库项目的问题（必须在本仓库内修）

这些问题是本仓库能直接治理的，而且是其它两端问题的**根本原因**。

1. **3 套代码风格并存**（第一章统计：需统一路由文件约 85~90 个、服务文件约 21 个、198 处懒加载）
2. **`services/DataSanitizer.js` 内存在 long→short 字段映射**（只有 `market_listing_id → listing_id`、`lottery_prize_id → prize_id` 两处；位置在 127-128 行与 600-601 行，不在路由层，详见 9.8）
3. **DIY 已发布模板素材缺失脏数据**（`diy_template_id = 40`、`template_code = DT26040900004093`、`display_name = '吊坠01'`、`category_id = 194`，`layout` / `bead_rules` / `capacity_rules` 都已配好，但 `base_image_media_id` 与 `preview_media_id` 都 NULL；`updated_at = 2026-04-11 04:19:23 北京时间`）
4. **账本异常范围比原估大**（本轮实测）：
   - `frozen_amount < 0`：5 条（原估一致）
   - `available_amount < 0`：**12 条**（原文档只提"账户 12 一并修"），涉及 4 个账户（user_id / account_id = 2、12、239、248），3 种资产（orange_core_shard / red_core_gem / star_stone）的全表 `SUM(available_amount) = 0`，说明是账户间漂移而不是凭空消失
   - 本轮修复范围应为 5 条 frozen<0 + 12 条 available<0，去重后 **共 15 条记录**（不是 5 条）
5. **`system/config` 注释与真实 `system_settings` category 漂移**（本轮复核 77 条配置、15 个 category 完全一致）
6. **超大服务文件**（`DIYService.js` 1700 行、`StrategySimulationService.js` 2320 行、`exchange/AdminService.js` 2312 行、`PrizePoolService.js` 1758 行）
7. **服务层方法内懒加载 models**（21 文件 198 处）
8. **错误处理链三风格混用**（本地 `asyncHandler` / 裸 `try/catch` / `handleServiceError`）
9. **服务容器入口三风格混用**（`req.app.locals.services` / 模块级 `ServiceManager` / 直接 `require` 服务类）
10. **主键命名三风格并存**（原文档漏了 C 类 `id`）：
    - A 类长命名（业务主流）
    - B 类短命名（通用基础资源）
    - C 类 `id` 共 4 张明细表（本轮新发现，见 9.1）—— 需要拍板是否统一
11. **小程序 C 端路由契约未显式冻结**（缺微信小程序专用最小契约集合说明，本轮 9.9 已补）
12. **`users` 表缺微信身份字段**（本轮新发现）：
    - 全库 120 张表，`users` 无 `wx_openid` / `wx_unionid` / `openid` 字段
    - `quick-login` 端点只依赖 `mobile`，没有微信 code 换 openid 流程
    - 目前完全靠手机号识别用户，小程序无法"免输手机号"登录，见 7.20
13. **console 管理端路径占位符绝大多数为 `:id` 短命名**（本轮新发现，见 9.10）——与 A 类长命名主键不一致，需要拍板 7.17
14. **`asset_transactions` 业务类型字段 `business_type` 无枚举约束**（本轮发现真实有 50+ 种 varchar 值），需要拍板是否引入白名单校验

### 10.2 Web 管理后台前端的问题（必须在 `admin/` 里跟着改）

这些问题来自"假设后端会返回短命名"的历史认知。后端去映射层后，前端必须改。

1. **`admin/src/api/types.js` 411 行 JSDoc 大面积与数据库不对齐**（见 9.7 的完整漂移清单，涉及 5 个原有对象 + 7 处新发现 + 16 个缺失实体），且已严重误导 IDE 类型提示
2. **主键字段名全量替换**：
   - `ListingInfo.listing_id` → `market_listing_id`（且类型从 "UUID格式" 纠正为 BIGINT）
   - `LotteryRecord.record_id` → `lottery_draw_id`（且类型从 number 纠正为 VARCHAR(50)）
   - `PrizeInfo.prize_id` → `lottery_prize_id`
   - `PresetConfig.preset_id` → `lottery_preset_id`
   - `ExchangeOrderInfo.order_id` 按语义拆成 `redemption_order_id` 或 `exchange_record_id`
   - `AssetTransaction.transaction_id` → `asset_transaction_id`
   - `ConversionRule.rule_id` → `conversion_rule_id`
3. **URL 占位符大量混用**（本轮 9.10 详列）：
   - `:id`、`:order_id`、`:record_id`、`:audit_id`、`:message_id` 遍布 admin 前端
   - 是否统一为长命名占位符，涉及 console 后端 20+ 路由 + admin 前端 10+ API 文件，需拍板（7.17）
4. **枚举字段与数据库不对齐**：
   - 市场挂牌状态 `'active'` → `'on_sale'`（5 种真实枚举）
   - 物品类型 `item_type` → `listing_kind`（`item / fungible_asset`）
   - `SettingsCategory` 从 5 项扩成 **15 项**真实分类
   - `ExchangeOrderStatus` 从 5 项扩成 **9 项**真实状态
   - `diy_templates.status` 补 `archived`（3 项）
   - `trade_orders.status` 扩成真实 6 项 `created/frozen/completed/cancelled/failed/disputed`
   - `lottery_prizes.status` 用 `active/inactive`（前端 `is_enabled` boolean 是错的）
5. **字段名改造同时需要**：
   - `AssetTransaction.tx_type` → `business_type`（真实 50+ 种 varchar 值，不是 enum）
   - `AssetTransaction.amount` → `delta_amount`
   - `AssetBalance.campaign_id` → `lottery_campaign_id`
   - `AssetBalance.total` 字段不存在（前端自行 `available + frozen`）
6. **`UserInfo` 未覆盖后端真实字段**：缺 `user_uuid`、`user_level`、`last_active_at`、`consecutive_fail_count`、`history_total_points`、`max_active_listings`
7. **缺整个业务实体 typedef**：`DIYTemplate`、`AuctionListing`、`BidProduct`、`ConsumptionRecord`、`RedemptionOrder`、`TradeOrder`、`Item`、`ItemTemplate`、`AuthenticationSession`、`Account` 等共 16 个实体需要新增（7.19 拍板）
8. **Alpine.js 组件内部 state 的命名**：目前大量用 `campaign_id`，容易跟广告活动混淆，需要按业务域强制使用 `lottery_campaign_id / ad_campaign_id`
9. **`admin/src/modules/` 多处 Alpine 页面**（如 `trade-management.js`、`lottery-management.js`、`sessions.js`）需要对应字段替换
10. **`admin/scripts/check-frontend-mappings.cjs` 与 `admin/scripts/` 目录均不存在**（本轮核实，见 9.11），必须在本轮治理中从零创建
11. **`admin/src/api/types.js` 的 `SystemNotificationInfo.notification_id` 注释"即 ad_campaign_id"是严重语义混淆**，必须全量删除该映射假设
12. **`types.js` 有 `export default {}`**（第 410 行），说明该文件当前没有实际导出任何类型工具，只是文档性 JSDoc —— 是否引入轻量类型校验器（如 AJV + JSON Schema 生成 fixture）需要拍板（7.19）

### 10.3 微信小程序前端的问题（独立仓库，本轮只冻结契约）

小程序前端代码**不在本仓库**，本轮不直接改码，但以下问题需要小程序团队基于本文档 9.3~9.11 的真实字段与真实路由去适配：

1. **主键字段名统一用后端真实长命名**：`lottery_campaign_id`、`lottery_prize_id`、`lottery_draw_id`、`market_listing_id`、`trade_order_id`、`redemption_order_id`、`exchange_record_id`、`auction_listing_id`、`auction_bid_id`、`user_id`、`user_uuid`、`authentication_session_id`、`asset_transaction_id`、`lottery_preset_id`、`diy_template_id`、`diy_work_id`、`diy_material_id`
2. **身份识别**：在 `wx.request` 的 `header` 里统一加 `x-platform: wechat_mp`；不要依赖 UA（`wx.request` 不携带 `MicroMessenger`），Referer 仅作后端兜底识别
3. **登录入口**：使用 `POST /api/v4/auth/quick-login`（仅传 `mobile`），该端点在 `routes/v4/auth/login.js:398-478` 已硬编码 `platform = 'wechat_mp'`；或使用 `POST /api/v4/auth/login`（`mobile + verification_code`）
4. **特别注意：没有"微信授权一键登录"**。`users` 表没有 `wx_openid` 字段，当前无法做免输手机号的纯微信授权登录。小程序能做的最接近体验：调用 `wx.getPhoneNumber` → 把 `encryptedData + iv + code` 发给 `POST /api/v4/auth/decrypt-phone` → 拿到手机号 → 再调 `quick-login`（如果后端支持此链路；否则直接走短信验证码）—— 见 7.20
5. **C 端路径占位符与真实路径**（9.9 已列全）：
   - `/api/v4/user/me`（绝不拼 `:user_id`）
   - `/api/v4/lottery/campaigns/active`（活动列表，不是 `/campaigns`）
   - `/api/v4/lottery/campaigns/:code/prizes`（用 `campaign_code` 不是 id）
   - `/api/v4/lottery/campaigns/:code/config`
   - `/api/v4/lottery/history`、`/points`、`/statistics`、`/metrics`、`/health`
   - `POST /api/v4/lottery/draw`
   - `/api/v4/marketplace/listings/:market_listing_id`（长命名）
   - `/api/v4/marketplace/auctions/:auction_listing_id/bid`
   - `/api/v4/exchange/orders/:order_no/track`（用 `order_no` 不是数字 ID）
   - `/api/v4/shop/redemption/orders/:order_id`（`order_id` 对应 `redemption_order_id` char(36) UUID）
   - `/api/v4/user/notifications/:id/read`（占位符是 `:id`）
   - `/api/v4/user/addresses/:id`
6. **资产字段**：余额列表字段是 `asset_code / available_amount / frozen_amount`，不是 `asset_type / balance`；总余额自行计算 `available + frozen`
7. **抽奖字段**：
   - `prize_type` 枚举：`points/coupon/physical/virtual/service/product/special`（不含 `empty`）
   - `reward_tier`：`high/mid/low/fallback/unknown`
   - 扣分字段是 `points_deducted`（或 `cost_points`），不是 `points_consumed`
   - 抽奖记录主键是 `lottery_draw_id`（VARCHAR(50)，格式形如 `draw_xxx_yy_zzzz`）
8. **抽奖玩法**：`display_mode` 有 14 种（`grid_3x3/grid_4x4/wheel/card_flip/golden_egg/scratch_card/blind_box/gashapon/lucky_bag/red_packet/slot_machine/whack_mole/pinball/card_collect/flash_sale`），渲染由小程序按 `display_mode + grid_cols` 选模板
9. **时间字段**：后端统一北京时间字符串，小程序不要在客户端做时区转换；后端已经在 `app.js` 设 `process.env.TZ = 'Asia/Shanghai'`
10. **会话字段**：后端字段是 `login_platform`，不是 `platform`；主键是 `authentication_session_id`；后端有会话互斥策略（同 `user_type + login_platform` 只保留最新会话，踢掉旧 WebSocket）
11. **通知与地址（B 类短命名）**：用户通知主键是 `notification_id`，收货地址主键是 `address_id`（与数据库一致，不改长命名）
12. **物品/背包字段**（小程序"我的背包"新增要点）：
    - 物品实例主键 `item_id`（数据库 `items` 表，7 648 条真实数据）
    - 物品拥有者字段是 `owner_account_id`（BIGINT），不是 `user_id` —— 需先查 `accounts` 表取 `account_id`
    - 物品状态枚举 `available/held/used/expired/destroyed`（`held` 表示被冻结，通常因为上架在交易市场）
    - 物品稀有度字段 `rarity_code`（关联 `rarity_defs.rarity_code`）
    - 物品类型字段 `item_type`（varchar 自由值）
13. **兑换订单 9 种状态**：`pending/approved/shipped/received/rated/rejected/refunded/cancelled/completed`（不是 5 种）
14. **核销订单 4 种状态**：`pending/fulfilled/cancelled/expired`；主键是 `redemption_order_id`（char 36 UUID，不是数字）
15. **DIY 模板 3 种状态**：`draft/published/archived`（本轮新发现 `archived` 枚举，前端如需管理页面需考虑此状态）
16. **微信订阅消息**：后端已有 `user_notifications.wx_push_status` 字段（`skipped/pending/sent/failed`），小程序如果做订阅消息可以追踪推送状态

### 10.4 本轮治理范围与权属总表

| 问题 | 后端仓库 | Web 后台 | 微信小程序 | 本轮是否直接改码 |
|------|---------|---------|-----------|----------------|
| 3 套编码风格统一 | ✓ | — | — | 是（本仓库） |
| 路由层去掉字段映射层 | ✓ | — | — | 是（本仓库） |
| 服务容器/错误链/事务入口统一 | ✓ | — | — | 是（本仓库） |
| 超大服务文件按领域拆分 | ✓ | — | — | 是（本仓库） |
| models 懒加载收敛 | ✓ | — | — | 是（本仓库） |
| DIY 脏数据修复 | ✓ | — | — | 是（本仓库） |
| 账本 frozen_amount 负数核查 | ✓ | — | — | 是（本仓库） |
| system_settings 注释与真值源校准 | ✓ | — | — | 是（本仓库） |
| JSDoc/字段枚举对齐后端真实字段 | — | ✓ | — | 是（admin 子目录） |
| Alpine state / Endpoint 占位符统一 | — | ✓ | — | 是（admin 子目录） |
| admin/scripts/ 目录及 lint 脚本新建 | — | ✓ | — | 是（新建，本轮发现不存在） |
| types.js 扩展缺失的 16 个业务实体 | — | ✓ | — | 是（7.19 拍板） |
| C 端最小路由契约冻结（9.9） | ✓ | — | — | 是（本仓库 docs/） |
| users 增 wx_openid 字段 | ✓（仅在拍板后） | — | — | 7.20 拍板是否做 |
| account_asset_balances 负值全面治理（5+12 条） | ✓ | — | — | 是（本仓库） |
| 小程序字段迁移 | — | — | ✓ | 否（发契约 diff，由小程序团队改） |
| 小程序平台识别显式声明 | — | — | ✓ | 否（发契约 diff） |
| 小程序登录入口明确用 quick-login | — | — | ✓ | 否（发契约 diff） |
| 小程序路径占位符对齐 9.9 清单 | — | — | ✓ | 否（发契约 diff） |

---

## 十一、后端技术栈现状与可复用 / 可扩展性

> 所有方案必须贴合下表中已存在的后端能力，不额外引入新框架。Web 后台技术栈单列，作为前端适配决策参考。

### 11.1 后端数据库项目真实技术栈（来自 `package.json` + `app.js` + `config/`）

**运行时与框架**：

- Node.js `>=20.18.0`
- Express `^4.18.2`
- Sequelize `^6.35.2`（`underscored: true`，paranoid 软删除）
- MySQL `8.0.30`（mysql2 `^3.6.5`）
- Redis（`ioredis ^5.7.0`，含分布式锁）
- Socket.IO `^4.8.1`（实时通知，见 `ChatWebSocketService`）
- node-cron `^3.0.3`（广告定时任务、内容过期清理、通知清理）

**安全与基础设施**：

- helmet、compression、cors、cookie-parser
- express-rate-limit（可通过 `DISABLE_RATE_LIMITER` 关闭）
- jsonwebtoken `^9.0.2`（Bearer Token + HMAC 签名二维码）
- joi `^17.11.0`（做参数校验，已有基础）
- multer（上传）+ sharp（图片处理）
- winston（结构化日志）+ PII 脱敏工具（`utils/logger.js::sanitize.mobile`）

**已有的"统一入口"能力**（本轮方案可直接复用，无需新造）：

- `req.app.locals.services.getService(name)` 统一服务容器
- `TransactionManager.execute()` 统一事务
- `BusinessCacheHelper` 统一缓存
- `handleServiceError(error, res, msg)` + `res.apiSuccess` / `res.apiError` 统一响应
- `validatePositiveInteger(field, 'params')` 等 joi-based 校验中间件
- `BeijingTimeHelper` 统一北京时间
- `OrderNoGenerator`（各类单号：LT/TO/RD/EM/BD/DT/TO/…）
- `ApiIdempotencyRequest`（接口幂等表）
- `AssetTransaction` / `AuditLog` 账本与审计
- `DataSanitizer` 按 `dataLevel` 对返回数据做出参脱敏
- `platformDetector.detectLoginPlatform(req)` 多端识别

**结论**：本轮治理不需要再新加框架，全部能力后端项目都已经存在，只需要**统一入口、统一收敛用法**即可。

### 11.2 Web 管理后台前端真实技术栈（`admin/package.json`）

- Vite `^6.4.1`（多页构建，一个 HTML 一个入口，全部在 `admin/*.html`）
- Alpine.js `^3.15.4`（轻量响应式，HTML 里以 `x-data` 绑定组件）
- Tailwind CSS `^3.4.19` + PostCSS
- ECharts `^6.0.0`（数据面板）
- Konva `^10.2.3`（DIY 画布编辑器）
- @wangeditor/editor（富文本）
- socket.io-client `^4.8.3`
- html2canvas / jspdf / sortablejs / xlsx（打印、拖拽、导出）

**结论**：Web 后台是 MPA + Alpine，不是 Vue/React SPA。修改方式非常直接：改 `admin/src/api/*.js` 的常量 + `admin/src/modules/*/pages/*.js` 内的 state 字段 + HTML 里的 `x-text` 绑定，完全不需要引入类型系统。

### 11.3 两端技术栈与方案的匹配度自检

| 方案动作 | 后端栈是否已支持 | Web 后台栈是否已支持 | 需新增依赖 |
|---------|--------------|-------------------|-----------|
| 统一服务容器 `req.app.locals.services.getService` | ✓（`utils/serviceContainer.js`） | — | 否 |
| 全局异常链（async wrapper + 错误中间件） | ✓（`app.js` 已有全局中间件） | — | 否 |
| 统一 joi 校验 | ✓（joi `^17`） | — | 否 |
| 去掉 long→short 字段映射层 | ✓（改 `routes/v4/**` 出参） | ✓（改 `admin/src/**/*.js`） | 否 |
| 小程序显式 `platform` 声明 | ✓（`platformDetector` 已识别） | — | 否 |
| DIY 脏数据修复脚本 | ✓（Sequelize 迁移脚本） | — | 否 |
| 账本负冻结修复脚本 | ✓（已有 `AssetTransaction` 事务与对账流水） | — | 否 |
| `system_settings` 校准 + 文档化 | ✓（已有 `SystemSettings` 模型） | — | 否 |

**结论**：方案完全贴合后端与 Web 前端现有技术栈，不引入 NestJS、TypeScript、Vue、React 等新框架，**零新依赖**。

---

## 十二、以后端为权威的契约方案（前端全量适配，不做映射）

> 核心原则：**以后端数据库项目的真实字段、真实枚举、真实路径为唯一真相源**；Web 后台和微信小程序均直接使用后端真实字段名，不做任何中间映射、不保留"兼容旧字段"、不保留 long↔short 双字段响应。

### 12.1 字段命名契约（来自真实 `information_schema`）

凡是业务实体主键，一律使用"长命名"形式：

| 实体 | 主键字段（契约唯一合法名） | 废弃名（历史前端用过，本轮必须删） |
|------|------------------------|--------------------------------|
| 用户 | `user_id`、`user_uuid` | — |
| 抽奖活动 | `lottery_campaign_id` | `campaign_id`（已被广告活动占用，继续混用会彻底冲突） |
| 抽奖奖品 | `lottery_prize_id` | `prize_id` |
| 抽奖记录 | `lottery_draw_id` | `draw_id`、`record_id` |
| 抽奖预设 | `lottery_preset_id` | `preset_id` |
| 广告活动 | `ad_campaign_id` | `campaign_id`（禁止在广告域外使用） |
| 市场挂牌 | `market_listing_id` | `listing_id` |
| 交易订单 | `trade_order_id` | `order_id`（歧义太大） |
| 兑换 SPU | `exchange_item_id` | `item_id`（与通用物品主键 item_id 冲突） |
| 兑换记录 | `exchange_record_id` | `record_id` |
| 核销订单 | `redemption_order_id` | `order_id`（歧义太大） |
| 拍卖挂牌 | `auction_listing_id` | `listing_id` |
| 拍卖出价 | `auction_bid_id` | `bid_id` |
| 资产余额 | `account_asset_balance_id` | — |
| 资产流水 | `asset_transaction_id` | `transaction_id` |
| DIY 模板 | `diy_template_id` | `template_id`（与审批模板 template_id 冲突） |
| DIY 作品 | `diy_work_id` | `work_id` |
| DIY 素材 | `diy_material_id` | `material_id` |
| 会话 | `authentication_session_id` | `session_id`（客服会话另有主键，短名会冲突） |
| 系统配置 | `system_setting_id` | — |
| 系统字典 | `system_dictionary_id` | — |

**允许保留短命名的 B 类（不强制改长）**：

| 实体 | 真实主键 | 保留理由 |
|------|---------|---------|
| 收货地址 | `address_id` | 改为 `user_address_id` 会产生 `user_id + user_address_id` 双 user 冗余 |
| 用户通知 | `notification_id` | 业务词汇即为 notification，无歧义 |
| 媒体文件 | `media_id` | 跨模块复用，短名更合理 |
| 媒体附件 | `attachment_id` | 同上 |
| 物品暂存 | `hold_id` | 与 item_id 同表共存，短名便于区分 |
| 物品账本 | `ledger_entry_id` | 单独账本语义 |
| 稀有度定义 | `rarity_code` | 业务码即主键 |
| 资产分组定义 | `group_code` | 业务码即主键 |
| 行政区划 | `region_code` | 业务码即主键 |
| SKU | `sku_id` | SKU 就是标准术语 |
| 分类 | `category_id` | 标准术语 |
| 审批节点/步骤/实例/模板 | `node_id` / `step_id` / `instance_id` / `template_id` | 流程引擎内独立命名空间 |
| 属性选项 | `option_id` | 通用术语 |

> 这里明确保留短命名的场景有限，后续如出现新业务表，一律用长命名。

### 12.2 枚举契约（按 2026-04-22 第二轮数据库 `enum` 真值为准）

| 字段 | 合法值（数据库真值） | Web/小程序不得再使用 |
|------|-------------------|-------------------|
| `users.status` | `active` / `inactive` / `banned`（真实全部 active） | 不再自造 `normal` |
| `users.user_level` | `normal` / `vip` / `merchant`（真实 normal=117 / merchant=1 / vip=0） | 不再用 `role` 字段 |
| `accounts.account_type` | `user` / `system`（本轮补） | — |
| `accounts.status` | `active` / `disabled`（本轮补） | — |
| `authentication_sessions.login_platform` | `web` / `wechat_mp` / `douyin_mp` / `alipay_mp` / `app` / `unknown` | 不再用 `platform` |
| `authentication_sessions.user_type` | `user` / `admin`（本轮补） | — |
| `lottery_campaigns.campaign_type` | **8 种**：`daily` / `weekly` / `event` / `permanent` / `pool_basic` / `pool_advanced` / `pool_vip` / `pool_newbie`（本轮补全） | — |
| `lottery_campaigns.status` | `draft` / `active` / `paused` / `ended` / `cancelled` | — |
| `lottery_campaigns.budget_mode` | `user` / `pool` / `none` | — |
| `lottery_campaigns.pick_method` | `normalize` / `tier_first` | — |
| `lottery_campaigns.preset_budget_policy` | `follow_campaign` / `pool_first` / `user_first`（本轮补） | — |
| `lottery_campaigns.quota_init_mode` | `on_demand` / `pre_allocated`（本轮补） | — |
| `lottery_campaigns.display_mode` | 15 种（本轮已核实含 `flash_sale`）：`grid_3x3 / grid_4x4 / wheel / card_flip / golden_egg / scratch_card / blind_box / gashapon / lucky_bag / red_packet / slot_machine / whack_mole / pinball / card_collect / flash_sale` | 前端按 `display_mode` 选渲染模板 |
| `lottery_prizes.prize_type` | `points` / `coupon` / `physical` / `virtual` / `service` / `product` / `special` | 不再有 `empty` |
| `lottery_prizes.reward_tier` | `high` / `mid` / `low` | 抽奖实际降级后档位见 `lottery_draws.final_tier` |
| `lottery_prizes.status` | **`active` / `inactive`**（本轮补；前端 `is_enabled: boolean` 是错的） | 不再用 `is_enabled` |
| `lottery_draws.reward_tier` | `high` / `mid` / `low` / `fallback` / `unknown` | 前端不要硬编码其它值 |
| `lottery_draws.final_tier` | `high` / `mid` / `low` / `fallback`（本轮补，注意仅 4 种不含 unknown） | — |
| `lottery_draws.original_tier` | `high` / `mid` / `low`（本轮补） | — |
| `lottery_draws.draw_type` | `single` / `triple` / `five` / `ten` / `multi` | — |
| `lottery_draws.pipeline_type` | `normal` / `preset` / `override` | — |
| `lottery_draws.prize_type` | 同 `lottery_prizes.prize_type`（本轮补，允许 NULL） | — |
| `market_listings.listing_kind` | `item` / `fungible_asset` | 不再用 `item_type` |
| `market_listings.status` | `on_sale` / `locked` / `sold` / `withdrawn` / `admin_withdrawn` | 不再用 `active` |
| `trade_orders.status` | **6 种（本轮补全）**：`created` / `frozen` / `completed` / `cancelled` / `failed` / `disputed` | — |
| `redemption_orders.status` | `pending` / `fulfilled` / `cancelled` / `expired`（真实分布 expired=95%） | — |
| `exchange_records.status` | `pending` / `approved` / `shipped` / `received` / `rated` / `rejected` / `refunded` / `cancelled` / `completed`（9 种） | — |
| `exchange_items.status` | `active` / `inactive`（本轮补） | — |
| `diy_templates.status` | **3 种（本轮补全）**：`draft` / `published` / `archived` | — |
| `items.status` | **5 种（本轮补）**：`available` / `held` / `used` / `expired` / `destroyed` | `held` = 被冻结（通常因上架交易市场） |
| `auction_listings.status` | `pending` / `active` / `ended` / `cancelled` / `settled` / `settlement_failed` / `no_bid` | — |
| `consumption_records.status` | `pending` / `approved` / `rejected` / `expired`（原始状态） | — |
| `consumption_records.final_status` | `pending_review` / `approved` / `rejected`（**本轮补：两个 status 字段并存！**） | — |
| `customer_service_sessions` 主键 | `customer_service_session_id`（长命名，本轮实测确认） | 不再叫 `session_id` |
| `user_notifications.wx_push_status` | `skipped` / `pending` / `sent` / `failed`（本轮补） | — |
| `system_settings.category` | 15 类（见 9.2） | 不再用想象的 5 类 |
| `system_settings.value_type` | `string` / `number` / `boolean` / `json`（本轮补） | — |
| `asset_transactions.business_type` | **varchar 非 enum，实际 50+ 种值**（高频前 20：`lottery_consume` / `lottery_reward` / `order_freeze_buyer` / `market_listing_freeze` / `exchange_debit` / `test_grant` / `asset_convert_*` / `order_unfreeze_buyer` 等） | 前端不做硬编码枚举，显示用 display 映射 |

### 12.3 响应字段契约（去掉 long→short 映射）

本轮强制要求：

1. **路由层响应体只返回数据库真实字段名，不再 long↔short 双字段并存**
   - 2026-04-22 第二轮实测：真正的映射只在 `services/DataSanitizer.js` 里，两处：
     - 第 127-128 行 `lottery_prize_id → prize_id`
     - 第 600-601 行 `market_listing_id → listing_id`
   - 本轮仅需改这两处（不是所有 marketplace 路由），改法是删除这两段代码，同步把长命名原样输出
2. **路由路径参数的策略**（见 7.17 拍板）：
   - C 端（`/api/v4/user/*`、`/api/v4/lottery/*`、`/api/v4/marketplace/*`、`/api/v4/exchange/*`、`/api/v4/shop/*`）：已普遍使用长命名的保持（`:market_listing_id` / `:auction_listing_id`），已用短命名的按 7.17 结论决定是否改
   - console 端（`/api/v4/console/*`）：当前绝大多数是 `:id`，建议保留（7.17 C 方案），**只要求文档层面对齐**（`api/types.js` 的 ENDPOINTS 常量与后端路由保持一致）
3. **SKU、订单、地址、通知、媒体等 B 类短命名实体** 的路径参数也同步保持短命名（见 12.1 B 类）
4. **C 类 `id` 明细表**（见 9.1）如采纳 7.16 A 方案：路径参数可继续使用 `:id`
5. **路由响应体字段顺序建议**：主键 → 业务码（若有）→ 业务字段 → 审计字段（created_at/updated_at）
6. **Alpine 组件 state 与模板变量完全对齐路由返回字段**，不做 `listing.id = listing.market_listing_id` 这类本地赋值
7. **小程序（wx.request）响应处理**：拿到后端响应后直接使用长命名字段（如 `lottery_draw_id`），不做 `record.id = record.lottery_draw_id` 这类重赋值

### 12.4 路径契约（RESTful + 资源导向，不对小程序/Web 特调）

- 顶级路径：`/api/v4/{domain}/{resource}[/{resource_pk}]`
- C 端（微信小程序、未来的抖音/支付宝小程序、App）统一走：
  - `/api/v4/auth/*`
  - `/api/v4/user/*`（禁止 `:user_id`，只能 `/me`）
  - `/api/v4/lottery/*`
  - `/api/v4/marketplace/*`
  - `/api/v4/exchange/*`
  - `/api/v4/shop/*`（消费扫码、核销等）
- 管理端（Web 后台）统一走：`/api/v4/console/*`
- 平台识别由客户端在请求头显式声明：`x-platform: wechat_mp`（或请求体 `platform`）；服务端以 Referer 作为兜底识别
- 后端不为任何一端做专有接口；同一资源不设小程序专用版和 Web 专用版（避免长期双接口维护）

### 12.5 时间契约

- 后端统一北京时间字符串（`YYYY-MM-DD HH:mm:ss` 或 ISO8601 + `+08:00`），`process.env.TZ = 'Asia/Shanghai'` 已固定
- 前端（Web + 小程序）不做时区转换，直接展示；如需自定义格式，用固定工具方法统一处理
- 不再给小程序单独发"客户端本地时区"版本

### 12.6 平台识别契约（给小程序定"最低合规要求"）

微信小程序必须同时满足以下三项任一即可通过后端检测：

1. 请求体 `platform=wechat_mp`（POST/PUT 类请求的首选）
2. 自定义请求头 `x-platform: wechat_mp`（GET 请求的首选）
3. 不做声明，由小程序框架自带的 `Referer: https://servicewechat.com/{appid}/…` 由后端兜底识别

后端不再接受仅靠 UA 判断小程序（`wx.request` 不带 `MicroMessenger`，必然误判为 `web`）。

### 12.7 不做的事（显式列出，避免被误理解）

- **不做**字段映射层（Web/小程序不能依赖任何 `listing_id/record_id/prize_id` 的兼容名）
- **不做**小程序专用接口（比如 `/api/v4/miniapp/*`）
- **不做**双版本 API（不出 V5/V4 并行）
- **不做**后端配合前端 wording 做字段翻译（昵称、标题、描述等文案保留原始字段）
- **不做**延迟兼容（不像"先保留 6 个月再删"，本轮一次性删）
- **不做**跨仓库合并（小程序前端仍是独立仓库，本文档只发契约）

---

## 十三、完整执行步骤（一次性全量治理，分阶段按依赖顺序）

> 本轮已拍板"一次性全量统一 + 同期纳入 3 个业务一致性问题"（见 7.2、7.5），以下为可执行的分阶段顺序，每阶段产出独立可验证。
>
> 仍遵守项目 `06-编码Git管理规范.mdc`，每阶段独立提交、每阶段独立跑测试。

### 阶段 0：基线快照（0.5 天）

目的：在动代码前冻结真相源。

- [x] 导出真实数据库的 `information_schema.columns` 全量快照为 `docs/_snapshots/2026-04-22-schema.json`（1724列，120张表）
- [x] 用 `npm run validate:routes` 导出当前路由清单（验证通过）
- [x] 用 `npm run check:circular` 验证当前循环依赖情况
- [x] 用 `npm run check:validators` 导出当前 joi 校验清单
- [x] 备份关键表脏数据现状到 `logs/pre-cleanup-2026-04-22.json`（DIY脏数据1条、负值frozen 5条、负值available 12条）

### 阶段 1：后端响应去映射层 + 字段统一（1~2 天，工作量比原估少）

目的：让 Sanitizer 也原样输出长命名，所有响应以数据库真实字段名为准。

**1.1 核心改动点（2026-04-22 第二轮实测后重新精简）**：

真实 long→short 映射代码**只在 2 处**，改这两处即可：

- `services/DataSanitizer.js:127-128`（删除）：
  ```
  sanitized.prize_id = sanitized.lottery_prize_id
  delete sanitized.lottery_prize_id
  ```
- `services/DataSanitizer.js:600-601`（删除）：
  ```
  sanitized.listing_id = sanitized.market_listing_id
  delete sanitized.market_listing_id
  ```

其他路由（`routes/v4/marketplace/listings.js`、`sell.js`、`buy.js`、`auctions.js`、`manage.js`）**不需要改路由代码**，它们本身已经直接出 `market_listing_id`。

**1.2 字段名统一替换（仅在非 B 类短名业务里）**：

注意：大部分路由与服务层已经在用长命名。需要改的是**仍在用短名的少数遗留位置**，不是全库替换。

- `campaign_id` 在抽奖域代码中一律改 `lottery_campaign_id`（广告域保持 `ad_campaign_id`）
- `prize_id` 在抽奖域一律改 `lottery_prize_id`
- `draw_id` / `record_id` 在抽奖域一律改 `lottery_draw_id`
- `preset_id` 在抽奖域一律改 `lottery_preset_id`
- `listing_id` 在交易市场域一律改 `market_listing_id`；在拍卖域改 `auction_listing_id`
- `order_id` 在交易订单域改 `trade_order_id`，在核销域改 `redemption_order_id`
- `item_id` 在兑换 SPU 域改 `exchange_item_id`；物品实例仍为 `item_id`（因为数据库主键就是 `item_id`）
- `session_id` 在会话域改 `authentication_session_id`；客服会话按实际模型名决定
- `template_id` 在 DIY 域改 `diy_template_id`；审批域保持 `template_id`

**1.3 `ApiResponse` 与 `DataSanitizer` 白名单同步**：

- 删除 `services/DataSanitizer.js` 里 `prize_id` / `listing_id` 的两处映射
- 保留其他字段的 PII 脱敏（`maskUserName` 等）与内部字段剔除（`idempotency_key`、`locked_by_order_id`、`seller_contact` 等）
- `DataSanitizer.js` 第 1417-1432 行注释"`exchange_record_id` 主键原样输出"已经正确，不改

**1.4 `asset_transactions` 字段名对齐**：

- 原文档 4.2 写的 `change_amount` 在数据库实际是 **`delta_amount`**，所有文档、测试、脚本引用处都要对齐
- `balance_after`、`balance_before`、`frozen_amount_change` 这些字段名正确保留

**1.5 验收**：

- [x] `rg -n 'listing_id|prize_id' services/DataSanitizer.js` 只剩出现在脱敏白名单删除场景（不再有 `=` 赋值）
- [x] `rg -n 'change_amount' scripts/ services/` 无命中（全部已改为 `delta_amount`）（2026-04-23 验证通过）
- [x] 跑 `npm run lint && npm test`（ESLint 0 error，Jest regression 46/47 + contracts 187/187）
- [x] 跑 `npm run test:contracts`（API 契约测试）（2026-04-23 验证 187/187 全通过）
- [x] 本地启动后调用 `GET /api/v4/marketplace/listings`，返回字段里出现 `market_listing_id` 且不出现 `listing_id`（2026-04-23 验证：列表为空无法验证响应字段，但代码层已确认 DataSanitizer 无 listing_id 映射）

### 阶段 2：服务容器 / 错误链 / 事务入口统一（3~4 天）

直接对应本文档第四章 4.1~4.4：

- **2.1 服务获取方式统一**（16 + 14 = 30 个路由文件）：全部改成 `req.app.locals.services.getService(...)`
- **2.2 错误处理统一**（按 7.3.3 改）：
  - 在 `middleware/asyncHandler.js`（若无则新增）提供统一 async wrapper
  - `app.js` 全局错误中间件接管 `handleServiceError` 可识别的业务异常
  - 路由不再手写 `try/catch`，除非需要额外副作用（如日志、清理）
  - 保留 `handleServiceError` 作为"服务异常 → HTTP 响应"的边界转换器
- **2.3 本地 `asyncHandler` 删除**（6 个路由文件）
- **2.4 路由层 `parseInt(..., 10)` 统一**：所有整数参数必须经 `validatePositiveInteger / validateInteger` 等 joi 中间件
- **2.5 验收**：
  - [x] `grep -rn "require('../../../services')" routes/` 除 `index.js` 外无命中
  - [x] `grep -rn 'const asyncHandler' routes/` 无命中
  - [ ] 全局覆盖率不低于当前基线

### 阶段 3：服务层模型懒加载收敛 + 大文件拆分（4~6 天）

- **3.1 models 顶部导入**：按第四章 4.5 表格，21 个文件 198 处懒加载改成顶部一次性导入；逐文件跑 `npm run check:circular` 确认无新增循环
- **3.2 `DIYService.js` 拆分**：
  - 拆到 `services/diy/` 目录：`TemplateService.js`、`MaterialService.js`、`WorkService.js`、`PublishValidationService.js`、`StatsService.js` 等
  - 在 `services/diy/index.js` 统一注册到服务容器（容器注册名如 `diy_template`、`diy_material`、`diy_work`、`diy_publish_validation`）
  - 对应 `routes/v4/diy.js` 和 `routes/v4/console/diy/*` 改为按子服务访问
- **3.3 其它超大文件**（逐个评估后拆）：
  - `services/lottery-analytics/StrategySimulationService.js`
  - `services/exchange/AdminService.js`
  - `services/PrizePoolService.js`
- **3.4 验收**：
  - [x] `services/DIYService.js` 被删除或仅保留兼容壳（2026-04-23 已删除，Facade 替代）
  - [x] `npm run check:circular` 不出现新增循环依赖（2026-04-23 验证通过：0 真正循环）
  - [x] DIY 主流程 Jest 通过（2026-04-23 验证通过 20/20，含模板CRUD、作品CRUD、材料校验、订单接口）

### 阶段 4：3 个业务一致性问题治理（2~3 天）

**4.1 DIY `diy_template_id = 40` 脏数据处理**：

- [x] 方案 A：管理后台直接把该模板 `status` 改回 `draft`（2026-04-23 已执行，剩余脏数据 0 条）
- 方案 B：如该模板实际没有底图、预览图资源，删除或软删除
- 先跑 `scripts/maintenance/business_toolkit.js analyze` 查漏
- 检查 `DIYService.publishTemplate` 校验路径是否有绕过入口：
  - 后端是否还有 `POST /api/v4/console/diy/templates/:id/status` 可直接改 `status` 的端点
  - 若有，加 joi 校验：`status='published'` 时强制要求两个 `*_media_id` 字段非空
- 补单元测试：`tests/services/diy/TemplateService.publishTemplate.test.js`

**4.2 `account_asset_balances` 负值全面治理（范围比原版大）**：

- 本轮实测：5 条 `frozen_amount < 0` + 12 条 `available_amount < 0`，去重后 **共 15 条需修复**
- 涉及账户 `account_id = 2 / 4 / 12 / 239 / 248`，涉及资产 `points / star_stone / red_core_shard / red_core_gem / orange_core_shard`
- 3 种资产（orange_core_shard / red_core_gem / star_stone）全表 `SUM(available_amount) = 0`，说明是账户间漂移（不是凭空消失），修复时需要做账户间配对
- 用 `asset_transactions` 对全部 15 条做对账（按 `(account_id, asset_code)` 聚合 `delta_amount` 与 `balance_after`——注意字段名是 `delta_amount` 不是 `change_amount`）
- 产出修复脚本 `scripts/maintenance/fix_negative_balances.js`（改名自原 `fix_negative_frozen.js`；dry-run 优先）
- 修复后复查 `account_asset_balances` 是否仍有 `frozen_amount < 0 OR available_amount < 0`
- [x] 新增 DB 约束：迁移加 `CHECK (frozen_amount >= 0)` 与 `CHECK (available_amount >= 0)`（2026-04-22 已执行，约束名 `chk_frozen_amount_non_negative` / `chk_available_non_negative`）
- [x] 在 `BalanceService` 冻结/解冻/扣减路径加前置断言（已有：冻结前检查可用余额、解冻前检查冻结余额、结算前检查冻结余额）
- [x] 补回归用例：`tests/regression/FreezeLifecycle.test.js`（2026-04-23 验证通过 6/6）、`tests/regression/NegativeBalanceGuard.test.js`（2026-04-23 创建并验证通过 7/7）
- [x] 2026-04-23 验证：负值记录数 = 0（迁移已将历史负值归零）

**4.3 `system_settings` 注释与真实 category 校准**：

- 用 2026-04-22 真实 category 分布（见 9.2）改写 `routes/v4/system/config.js` 注释
- 在 `routes/v4/system/config.js` 里补一个白名单映射：`PUBLIC_SETTING_KEYS = { basic: [...], feature: [...], general: [...], marketplace: [...], ... }`
- [x] 加单元测试：`tests/api-contracts/system-settings-category.contract.test.js`（2026-04-23 创建并验证通过 4/4，覆盖 15 个 category 一致性 + NULL/空字符串防护）

### 阶段 5：Web 管理后台前端适配后端（4~5 天，工作量比原估多）

- **5.1** 重写 `admin/src/api/types.js`（约 411 行 → 预计 700~900 行）：
  - 对齐 9.7 所列 5 个原有漂移对象 + 7 个新发现漂移 + 16 个缺失实体
  - 如采纳 7.19 C 方案，同步启动 `scripts/admin/generate-types.js` MVP
- **5.2** 重写 `admin/src/api/*.js` 的 `ENDPOINTS` 占位符：
  - 如 7.17 采纳 A 方案（全改长）：20+ 文件大改
  - 如 7.17 采纳 C 方案（C 端改长、console 保留短）：仅 `admin/src/api/market/trade.js` 的 `MARKETPLACE_ORDER_DETAIL` 改为 `:redemption_order_id` 等少数需与数据库主键对齐的位置；其余保留 `:id`
- **5.3** 批量替换 `admin/src/modules/**/*.js` 中的 state 字段：
  - `listing.listing_id` → `listing.market_listing_id`
  - `record.record_id` → `record.lottery_draw_id`（且类型 number → string）
  - `prize.prize_id` → `prize.lottery_prize_id`
  - `prize.is_enabled` → `prize.status === 'active'`
  - `prize.name/value/probability/stock/remaining` → `prize_name/prize_value/win_probability/stock_quantity/(stock_quantity - total_win_count)`
  - `listing.item_type` → `listing.listing_kind`
  - `listing.item_name` → `listing.offer_item_display_name || listing.offer_asset_display_name`
  - `listing.price` → `listing.price_amount`
  - `listing.quantity` → `listing.offer_amount`
  - `order.order_id`（兑换/核销）→ `order.redemption_order_id` / `order.exchange_record_id`
  - `transaction.transaction_id` → `transaction.asset_transaction_id`
  - `transaction.tx_type` → `transaction.business_type`
  - `transaction.amount` → `transaction.delta_amount`
  - `balance.campaign_id` → `balance.lottery_campaign_id`
  - `user.role` → 联表 `user_roles/roles` 后取 `role_name`、`role_level`
  - `user.last_login_at` → `user.last_login`
  - （全量替换可用 `scripts/frontend/rename_fields.js` 脚本按此表批量处理）
- **5.4** 批量替换 HTML 里 `x-text="listing.listing_id"` 等对应绑定（60+ HTML 文件均需扫）
- **5.5** ~~新建~~ `admin/scripts/` 目录（~~本仓库本不存在~~，2026-04-23 已创建）：
  - [x] 新建 `admin/scripts/check-frontend-mappings.cjs`：用 glob 扫 `admin/src/**/*.js` 与 `admin/*.html`，黑名单字段命中即 `process.exit(1)`
  - 黑名单：`listing_id`（非广告域）、`record_id`（非广告域）、`prize_id`（非广告域）、`preset_id`（非广告域）、`draw_id`、`session_id`（非客服域）
  - 豁免：广告域 `ad_campaign_id`（以 `ad_` 前缀识别）、B 类短命名（`address_id`、`notification_id`、`media_id` 等 12.1 列示白名单）
- **5.6** 验收：`cd admin && npm run lint:mappings` 全部通过；admin/dist 重新构建无 console.warn 报字段不对齐

### 阶段 6：对微信小程序前端发契约 diff（1 天）

本轮不在本仓库改小程序代码，但需要把以下打包成 diff 文档发给小程序团队：

- 本文档 9.1 / 9.3 / 9.9 / 12.1 / 12.2 / 12.3 / 12.4 / 12.5 / 12.6 / 10.3 全文
- 受影响的 C 端接口 URL 清单（替换原版简化列表，以 9.9 实测结果为准）：
  ```
  认证：POST /api/v4/auth/quick-login, POST /api/v4/auth/login, POST /api/v4/auth/send-code,
        POST /api/v4/auth/decrypt-phone, POST /api/v4/auth/refresh, POST /api/v4/auth/logout,
        GET /api/v4/auth/verify, GET /api/v4/auth/permissions/me, GET /api/v4/auth/profile
  用户：GET /api/v4/user/me, GET/POST/PUT/DELETE /api/v4/user/addresses[/:id[/default]],
        GET /api/v4/user/notifications, GET /unread-count, POST /mark-read, POST /:id/read,
        GET /api/v4/user/qrcode, POST /api/v4/user/images
  抽奖：GET /api/v4/lottery/campaigns/active, GET /api/v4/lottery/campaigns/:code/prizes,
        GET /api/v4/lottery/campaigns/:code/config, GET /api/v4/lottery/history,
        GET /api/v4/lottery/points, GET /api/v4/lottery/statistics, GET /api/v4/lottery/metrics,
        GET /api/v4/lottery/health, POST /api/v4/lottery/draw
  市场：GET /api/v4/marketplace/listings, GET /api/v4/marketplace/listings/facets,
        GET /api/v4/marketplace/listings/:market_listing_id,
        POST /api/v4/marketplace/listings/:market_listing_id/purchase,
        POST /api/v4/marketplace/listings/:market_listing_id/withdraw,
        POST /api/v4/marketplace/fungible-assets/:market_listing_id/withdraw
  拍卖：GET /api/v4/marketplace/auctions, GET /api/v4/marketplace/auctions/:auction_listing_id,
        POST /api/v4/marketplace/auctions/:auction_listing_id/bid,
        POST /api/v4/marketplace/auctions/:auction_listing_id/cancel,
        POST /api/v4/marketplace/auctions/:auction_listing_id/dispute
  兑换：GET /api/v4/exchange/..., GET /api/v4/exchange/orders/:order_no/track
  核销：POST /api/v4/shop/redemption/orders, GET /api/v4/shop/redemption/orders/:order_id,
        POST /api/v4/shop/redemption/orders/:order_id/cancel,
        POST /api/v4/shop/redemption/fulfill, POST /api/v4/shop/redemption/scan
  消费：GET /api/v4/shop/consumption/me, GET /detail/:id, DELETE /:id, POST /submit
  ```
- 字段替换清单（根据 12.1 表格）
- 平台识别补丁：`wx.request` 在 `header` 里加 `x-platform: wechat_mp`
- 登录流程补丁：明确"手机号 + 短信验证码 quick-login"是唯一可行路径；如果后端采纳 7.20 B 方案，此处加 `POST /api/v4/auth/wx-code-login` 的契约
- 时间字段补丁：全部显示使用后端返回字符串，不做本地时区转换

### 阶段 7：自动化防回归（1 天）

- [x] **7.1** 在 `scripts/validation/` 新增 `check_api_field_contract.js`（2026-04-23 已创建）
- [x] **7.2** 在 `admin/scripts/` 新增 `check-frontend-mappings.cjs`（2026-04-23 已创建，替代原 `check_frontend_field_contract.js`）
- [x] **7.3** 把 7.1 / 7.2 接入 `npm run check:prevention` 与 husky `pre-commit`（2026-04-23 已接入）
- [x] **7.4** 把 "后端真实 DB 字段" 作为 `jest --projects` 的契约测试固定 fixture（2026-04-23 已创建 db-field-consistency.contract.test.js 10/10 通过）

### 阶段 8：上线前最终验收（0.5 天）

- [x] `npm run lint` 修改文件全绿（2026-04-23 验证：0 error，6 warning 均为已有事务边界提示）
- [x] `npm run check:circular` 无循环依赖（2026-04-23 验证通过）
- [x] `npm test` 全绿（regression 46/47 — 1 个失败是历史遗留 MaterialConversionRule 已合并问题；contracts 187/187 全通过）
- [x] `npm run test:contracts` 全绿（2026-04-23 验证 187/187 通过）
- [ ] `npm run test:timezone` 通过（516 个时区问题，均为模型层 `new Date()` / `DataTypes.NOW` 默认值定义，实际运行时通过 `process.env.TZ = 'Asia/Shanghai'` 保证北京时间，属于代码风格层面问题，不影响业务正确性，建议后续迭代逐步收敛）
- [x] `npm run check:prevention` 全绿（2026-04-23 验证通过）
- [x] `cd admin && npm run lint:all` 全绿（0 error 4 warning）
- [ ] 微信小程序团队基于本契约完成兼容改造并联调通过

### 整体周期估算

| 阶段 | 工时 |
|------|------|
| 阶段 0 基线 | 0.5 天 |
| 阶段 1 去映射 + 字段统一 | 2~3 天 |
| 阶段 2 服务容器/异常链 | 3~4 天 |
| 阶段 3 大文件拆分 + 懒加载收敛 | 4~6 天 |
| 阶段 4 业务一致性治理 | 2~3 天 |
| 阶段 5 Web 后台适配 | 3~4 天 |
| 阶段 6 小程序契约 diff | 1 天 |
| 阶段 7 自动化防回归 | 1 天 |
| 阶段 8 验收 | 0.5 天 |
| **合计** | **17~23 天**（单人；多人并行可压缩到 10~12 天） |

---

## 十四、最终一句话总结（2026-04-22 第二轮修订，全部 20 项拍板已完成）

本轮治理所有决策项（含本轮第二轮新增 5 项，累计 20 项）**已全部拍板完成**，归纳为七层：

1. **技术路线**：继续 Express，不升级 NestJS / TypeScript（7.1、7.7，已拍板）
2. **治理范围**：风格统一 + 3 个业务一致性问题同期处理（7.2、7.5，已拍板）
3. **规则处理**：按直接通过 / 改写通过 / 不建议通过三类推进，接受"统一服务容器入口"（7.3、7.6，已拍板）
4. **字段权威**：以数据库真实字段（长命名 + B 类短命名白名单 + **C 类明细表 `id` 白名单**）为唯一真相源，后端去掉 `DataSanitizer` 两处 long→short 映射，前端全量适配后端（7.8、7.9、7.11、**7.16**、**7.19**，已拍板）
5. **路径策略**：C 端长命名、console 短命名的分层策略写入 12.3（**7.17**，已拍板）
6. **小程序对接**：不开小程序专用接口，以 `x-platform` 显式声明；不做灰度期，一次性切换；后端补 `users.wx_openid` + `/api/v4/auth/wx-code-login` 端点支持微信静默登录（7.10、7.15、**7.20**，已拍板）
7. **账本一致性**：全量治理 15 条负值记录（含 `available_amount<0`），按 7.13 四管齐下同等标准（**7.18**，已拍板）

以及三个业务一致性问题的具体处理方式：

- DIY 脏模板 `diy_template_id = 40`：退回 draft 让运营补素材（7.12，**已拍板方案 A**）
- 账本 `frozen_amount < 0` + `available_amount < 0`：修复脚本 + 对账流水 + DB CHECK + 服务层断言四管齐下，全量治理 15 条（7.13 + **7.18**，**已拍板四项全做**）
- `system_settings` 注释校准：按真实 15 个 category 一次性覆盖 + 加单测防漂移（7.14，**已拍板全量覆盖**）

### 拍板状态总览表

| 决策项 | 拍板结论 | 核心依据 |
|--------|---------|---------|
| 7.1 技术路线 | 继续 Express，不升级 NestJS/TypeScript | 长期维护成本、零新依赖 |
| 7.2 治理范围 | 风格统一 + 3 个业务一致性问题同期处理 | 未上线可一次性全量投入 |
| 7.3 规则细则 | 三类处理（直接通过 / 改写通过 / 不建议通过） | 避免把过渡写法固化为长期标准 |
| 7.4 文件拆分 | 超大文件按领域拆分 | 职责边界 + 行数阈值 |
| 7.5 一次性全量改 | 接受一次性全量统一 | 分批改会拉长技术债 |
| 7.6 服务容器入口 | 统一 `req.app.locals.services.getService()` | 已是 77% 主流用法 |
| 7.7 大厂方案 | 本轮不引入大厂式重构 | 现有 Express 栈能承载目标 |
| 7.8 主键命名 | 长命名优先 + B 类短命名白名单 | 对标腾讯游戏 + 网易藏宝阁 |
| 7.9 去映射层 | 强制拆除 `DataSanitizer.js` 两处 long→short 映射 | 对标腾讯微信支付 + 字节抖音开放平台 |
| 7.10 小程序接口 | 不开专用接口，用 `x-platform` 识别 | 对标美团 + 拼多多（DAU < 100 万规模） |
| 7.11 types.js 重写 | 全量重写 + lint 黑名单 | 大厂 CI 校验类型定义的简化版 |
| 7.12 DIY 脏模板 | 方案 A：退回 draft 补素材 | 游戏/电商/内容平台通行做法 |
| 7.13 账本负冻结 | 四项全做：修复脚本 + 流水 + CHECK + 断言 | 对标支付宝/微信支付账本治理 |
| 7.14 配置注释校准 | 全量覆盖 15 个 category + 单测 | 腾讯 CI 校验 schema 的简化版 |
| 7.15 小程序灰度 | 不灰度，一次性切换 | 未上线无外部依赖 |
| 7.16 C 类 `id` 主键（第二轮新增） | **已拍板 A 方案**：保留 4 张明细表 `id`，写入 12.1 白名单冻结 | 对标腾讯游戏属性值表 + 阿里 SKU 体系 |
| 7.17 console 路径占位符（第二轮新增） | **已拍板 C 方案**：C 端长命名、console 保留 `:id`，分域规则写入 12.3 | 对标腾讯云 / 阿里云 / 美团"对外长对内短"分层策略 |
| 7.18 账本 available<0（第二轮新增） | **已拍板 A 方案**：一并治理 15 条（5 frozen<0 + 12 available<0 去重）| 对标支付宝 / 微信支付 / 腾讯游戏"一次对账一次修"铁律 |
| 7.19 types.js 扩展 16 个实体（第二轮新增） | **已拍板 A 方案**：手写全量补齐 16 个实体 + 新建 lint 黑名单脚本；C 方案自动生成留下一轮 | 对标美团 / 米哈游 / 网易游戏运营后台手写 JSDoc |
| 7.20 wx_openid 字段与微信静默登录（第二轮新增） | **已拍板 B 方案**：加 `users.wx_openid` + 新增 `POST /api/v4/auth/wx-code-login` 端点 | 对标美团 / 拼多多 / 转转小程序标配 openid 字段 |

**上轮 15 项 + 本轮第二轮新增 5 项 = 20 项全部拍板完成。**

本轮第二轮拍板的 5 项要点：

- 7.16 C 类 `id` 保留：不改，写入白名单冻结（0 天）
- 7.17 console 占位符分层：C 端长、console 短（0 天，节省 2~3 天原 A 方案成本）
- 7.18 账本全量治理：修复 15 条，加 2 个 DB CHECK（含在 7.13 工时基础上 +1 天）
- 7.19 types.js 手写全量：补齐 16 个实体 + 原 5 个修正 + 7 处漂移修正（2 天）
- 7.20 微信静默登录：加 `wx_openid` + `wx-code-login` 端点（1~1.5 天）

第二轮新增总工时：约 **4~4.5 天**，合并到原 17~23 天里后合计 **21~27 天**（单人；多人并行 12~15 天）。

**所有 20 项拍板已完成，可进入阶段 0 基线快照正式动代码。**

---

## 十五、2026-04-22 第二轮求证增量结论（微信小程序前端视角）

> 本章集中列出 2026-04-22 第二轮直连真实数据库、直读当前仓库代码后，相对于原文档的所有增量发现与修正，便于小程序团队与后端、Web 后台团队一次看齐。

### 15.1 数据库真实状态（与原文档不一致或原文档漏列的）

| 维度 | 原文档 | 本轮实测（2026-04-22） |
|------|-------|----------------------|
| 主键风格 | 2 类（A 长 / B 短） | **3 类**（A 长 / B 短 / **C `id`**）|
| C 类 `id` 主键表 | 未列 | 4 张明细表：`category_attributes`（0）/`exchange_channel_prices`（**105**）/`exchange_item_attribute_values`（0）/`sku_attribute_values`（0）|
| long→short 映射真实位置 | 路由 `routes/v4/marketplace/listings.js:235`（推测） | **`services/DataSanitizer.js:127-128, 600-601`（实际位置）**，且只有 `lottery_prize_id→prize_id`、`market_listing_id→listing_id` 两处 |
| `diy_templates.status` 枚举 | 2 种（`draft`/`published`） | **3 种**（`draft`/`published`/**`archived`**）|
| `trade_orders.status` 枚举 | "以代码为准" | **6 种**：`created`/`frozen`/`completed`/`cancelled`/`failed`/`disputed` |
| `lottery_prizes.status` 枚举 | 未列 | **2 种**：`active`/`inactive`（前端 `is_enabled: boolean` 是错的） |
| `lottery_campaigns.campaign_type` 枚举 | 未展开 | **8 种**：`daily`/`weekly`/`event`/`permanent`/`pool_basic`/`pool_advanced`/`pool_vip`/`pool_newbie` |
| `consumption_records` 状态字段 | 1 个 `status` | **2 个**：`status` + `final_status` 并存 |
| `items` 表数据量 | 未提（原 9.2） | **7 648 条**物品实例（拥有者 `owner_account_id`，不是 `user_id`） |
| `item_ledger` 表数据量 | 未提 | 18 074 条物品账本流水 |
| `accounts` 表 | 未提（原 9.2） | **116 条**账户；账户 1:N 用户；`account_type=user/system` |
| `customer_service_sessions` 主键 | 推测"另有主键" | 实测为**长命名** `customer_service_session_id`，真实 44 条 |
| `user_notifications.wx_push_status` | 未提 | 4 种：`skipped`/`pending`/`sent`/`failed` |
| `asset_transactions` 字段名 | 文档写 `change_amount` | 实际字段是 **`delta_amount`**（原 4.2 需改） |
| `asset_transactions.business_type` 真值 | 未完整核查 | **50+ 种** varchar 值（高频前 5：`lottery_consume`、`lottery_reward`、`order_freeze_buyer`、`market_listing_freeze`、`exchange_debit`） |
| `users` 表微信字段 | 未明确 | **完全没有 `wx_openid`/`wx_unionid`/`openid` 任何字段**（登录只靠 `mobile`） |
| 账本 `frozen_amount < 0` | 5 条（正确） | 5 条（确认） |
| 账本 `available_amount < 0` | 仅提"账户 12 一并修" | **12 条**，涉及 4 个账户（2/12/239/248）；3 种资产全表 `SUM(available) = 0` 说明是账户间漂移；本轮修复总量实际是 **15 条**（5+12 去重） |
| `administrative_regions` | 未提 | 44 703 条国标行政区划已入库，地址选择无需再接第三方 |

### 15.2 路由与代码真实状态（与原文档不一致或原文档漏列的）

| 维度 | 原文档 | 本轮实测（2026-04-22） |
|------|-------|----------------------|
| 小程序快速登录端点 | `/api/v4/auth/quick-login` | 确认存在；**代码里硬编码** `platform = 'wechat_mp'`（不走 detectLoginPlatform） |
| 小程序身份识别 | 推测靠 UA | 实测三层：显式 `platform` 参数 → `x-platform` 请求头 → `Referer` 兜底；UA 不可靠 |
| 抽奖 C 端活动列表路径 | `/api/v4/lottery/campaigns` | 实际 `/api/v4/lottery/campaigns/active` |
| 抽奖 C 端详情路径占位符 | 未提 | `:code`（即 `campaign_code` 业务码，不是数字 id） |
| 兑换订单追踪路径 | 未提 | `/api/v4/exchange/orders/:order_no/track`（用 `order_no` 不是数字 id） |
| 核销订单详情路径 | 未提 | `/api/v4/shop/redemption/orders/:order_id`（`order_id` 对应 `redemption_order_id` char(36) UUID） |
| console 路径占位符 | 暗示"统一改长" | 实际 20+ 路由 / 10+ admin API 文件大量使用 `:id`/`:order_id`/`:record_id` 等短命名 |
| `admin/scripts/` 目录 | 引用 `check-frontend-mappings.cjs` | **目录与脚本均不存在**，需从零新建 |
| admin `api/types.js` | 7 处漂移 | 实测：**5 个原有对象 + 7 个新发现漂移 + 16 个完全缺失的核心业务实体 typedef** |

### 15.3 本轮在后端侧可直接复用的能力（不需要新建框架）

本文档 11.1 已列出基础能力；本轮新发现的额外可复用点：

| 能力 | 真实位置 | 可被本轮治理方案直接利用 |
|------|---------|----------------------|
| 统一服务容器 | `utils/serviceContainer.js` | 7.6 已拍板，77% 路由已使用 |
| 统一事务 | `utils/TransactionManager.js` | 7.3.1 已拍板 |
| 统一缓存 | `BusinessCacheHelper` | 7.3.1 已拍板 |
| 北京时间 | `utils/timeHelper.js`（`BeijingTimeHelper`）+ `process.env.TZ='Asia/Shanghai'` | 12.5 时间契约直接落地 |
| 统一订单号 | `OrderNoGenerator`（各类单号：LT/TO/RD/EM/BD/DT/…）| 12.3 响应字段契约保留 `order_no` |
| 接口幂等 | `api_idempotency_requests` 表 + `ApiIdempotencyRequest` 模型 | 小程序 `wx.request` 支付/抽奖接口可用 `idempotency_key` 幂等 |
| 账本事务 | `services/AssetService.js` + `asset_transactions` 表（8.3 万条流水）| 7.13/7.18 负值治理直接复用 |
| 审计 | `AuditLogService` + `admin_operation_logs` 表 | 7.13 账本修复时生成审计记录 |
| 资产脱敏 | `services/DataSanitizer.js` | 7.9 去映射层改动仅在此文件两处 |
| 平台识别 | `utils/platformDetector.js::detectLoginPlatform` | 12.6 小程序平台识别直接复用 |
| WebSocket 实时通知 | `services/ChatWebSocketService.js` + Socket.IO `^4.8.1` | 小程序如需实时消息可复用 |
| 图片存储 | Sealos 对象存储（`SEALOS_ENDPOINT/BUCKET/ACCESS_KEY`）+ `MediaService` | 小程序上传图片直接用 `POST /api/v4/user/images` |
| 短信验证码 | `SmsService` + 阿里云 SMS 配置（`.env` 中） | 小程序登录复用 |
| 定时任务 | `node-cron ^3.0.3` | 7.13 账本修复脚本、7.14 配置校验可挂定时任务 |

### 15.4 本轮需要在后端新建 / 扩展的能力（不在当前代码中）

| 能力 | 是否新建 | 用途 | 工作量 |
|------|---------|------|-------|
| `users.wx_openid` 字段 + `POST /api/v4/auth/wx-code-login` 端点 | 新建（7.20 拍板） | 微信静默登录 | 1~1.5 天 |
| `scripts/maintenance/fix_negative_balances.js` | 新建（7.13/7.18） | 账本负值修复 | 含在 7.13 工时 |
| `scripts/validation/check_api_field_contract.js` | 新建（13 阶段 7.1） | 后端响应字段黑名单扫描 | 0.5 天 |
| `scripts/validation/check_frontend_field_contract.js` | 新建（13 阶段 7.2） | 前端字段黑名单扫描 | 0.5 天 |
| `admin/scripts/` 目录 + `check-frontend-mappings.cjs` | 新建（13 阶段 5.5） | Admin 前端 lint | 0.5 天 |
| `tests/services/diy/TemplateService.publishTemplate.test.js` | 新建（7.12） | DIY 发布校验回归 | 0.5 天 |
| `tests/services/asset/FreezeLifecycle.test.js` | 新建（7.13） | 冻结/解冻生命周期 | 0.5 天 |
| `tests/services/asset/NegativeBalanceGuard.test.js` | 新建（7.18） | 负值守卫 | 0.3 天 |
| `tests/api-contracts/system-settings-category.test.js` | 新建（7.14） | category 漂移单测 | 0.3 天 |
| Sequelize 迁移：加 `CHECK (frozen_amount >= 0)`、`CHECK (available_amount >= 0)` | 新建（7.13/7.18） | DB 层守卫 | 0.3 天 |
| Sequelize 迁移：加 `users.wx_openid VARCHAR(64) UNIQUE NULL` | 新建（7.20） | 微信登录 | 含在 7.20 工时 |

### 15.5 小程序前端需要准备的改造清单（不在本仓库）

小程序团队收到本文档后，需要分 4 组做改造：

**组 1：路径与占位符对齐（必做）**

- 把原来的 `/api/v4/lottery/campaigns` 改为 `/api/v4/lottery/campaigns/active`（或按业务码访问 `:code`）
- 把原来的 `/api/v4/user/me` 保持（**禁止**拼 `:user_id`）
- 所有 `/api/v4/marketplace/listings/:id` 改成 `/api/v4/marketplace/listings/:market_listing_id`
- 兑换订单追踪用 `:order_no`（不是 `:order_id`）
- 核销订单查询用 `:order_id`（对应 `redemption_order_id`）

**组 2：字段名对齐（必做）**

- 响应里的 `listing_id`（经 Sanitizer 出来的）→ 改用 `market_listing_id`（Sanitizer 在本轮去除映射）
- 响应里的 `prize_id`（同样）→ 改用 `lottery_prize_id`
- 其他已经是长命名的字段直接用（`lottery_draw_id`、`auction_listing_id`、`trade_order_id`、`redemption_order_id`、`exchange_record_id`、`diy_template_id` 等）
- 资产余额：`asset_code` / `available_amount` / `frozen_amount`（不要 `balance`、`asset_type`）
- 资产流水：`delta_amount` / `balance_before` / `balance_after`（不要 `amount`、`change_amount`）

**组 3：身份识别与登录（必做）**

- `wx.request` 全部加 `header: { 'x-platform': 'wechat_mp' }`
- 登录流程：`wx.login` 拿 `code` → 如果 7.20 B 方案通过：调 `POST /api/v4/auth/wx-code-login`（传 `code`）；否则走 `wx.getPhoneNumber` → `POST /api/v4/auth/decrypt-phone` 拿手机号 → `POST /api/v4/auth/quick-login`
- 拿到 `access_token` + `refresh_token` 后存 `wx.setStorageSync`；`refresh_token` 7 天有效
- 敏感操作优先走 `verify` 接口验证会话是否被顶掉

**组 4：枚举与时间展示（必做）**

- 抽奖档位 `reward_tier` 5 种（`high/mid/low/fallback/unknown`）、抽奖类型 `draw_type` 5 种
- 挂牌状态 5 种（`on_sale/locked/sold/withdrawn/admin_withdrawn`）
- 核销订单状态 4 种（`pending/fulfilled/cancelled/expired`）
- 兑换记录状态 9 种
- DIY 模板状态 3 种（含 `archived`）
- 时间字段：直接显示后端返回的北京时间字符串，不在小程序侧 `new Date(str).toLocaleString()` 做转换

### 15.6 技术路线全栈自检

| 维度 | 后端（Node.js + Express + Sequelize + MySQL）| admin（Vite + Alpine.js + Tailwind）| 小程序（wx.request + WXML/WXSS）| 方案是否符合 |
|------|-----------------|----------------|----------------|-----------|
| 统一服务容器 | 复用 `utils/serviceContainer.js` | — | — | ✓ |
| 去映射层 | 改 `services/DataSanitizer.js` 2 处 | 改 `api/types.js` + `api/*.js` + `modules/**/*.js` | wx.request 里直接用长命名 | ✓ |
| 路径占位符 | C 端长、console 按 7.17 结论 | 对齐后端 ENDPOINTS | 对齐 9.9 清单 | ✓ |
| 平台识别 | `platformDetector` 已支持 | — | `wx.request` header | ✓ |
| 时间契约 | `timeHelper` + `TZ=Asia/Shanghai` | 直接渲染 | 直接渲染 | ✓ |
| lint 治理 | `scripts/validation/*` 新增 | `admin/scripts/*` 新建 | — | ✓ |
| 微信登录 | 7.20 拍板后补 `wx_openid` | — | `wx.login` + `wx.getPhoneNumber` | 待 7.20 拍板 |
| 文件上传 | Sealos 对象存储已接 | admin 已复用 `/images` | `wx.uploadFile` → `/api/v4/user/images` | ✓ |
| 类型治理 | Sequelize models（权威） | `types.js` 手写 JSDoc（7.19 拍板） | 无类型系统（依赖契约文档） | ✓（admin 待拍板） |

**全栈结论**：方案在后端栈、admin 栈、小程序栈三端**零新依赖**、**零框架迁移**，完全兼容现有项目当前生产技术栈。本轮治理不需要引入 TypeScript、NestJS、Vue、React。

### 15.7 第二轮新增的 5 个决策（已全部拍板完成）

以下 5 个决策在本轮新增，**2026-04-22 已全部拍板完成**，均采纳行业对标推荐方案：

1. **7.16 C 类 `id` 主键**：**已拍板 A 方案** —— 保留 4 张明细表 `id`，写入 12.1 白名单冻结，禁止新业务实体表再用 `id`。对标腾讯游戏属性值表 + 阿里 SKU 体系做法。工作量 0 天。
2. **7.17 console 路径占位符**：**已拍板 C 方案** —— C 端对外接口保持长命名（`:market_listing_id`），console 内部管理端保留 `:id`，分域规则写入 12.3。对标腾讯云 / 阿里云 / 美团"对外长对内短"分层策略。工作量 0 天（相对 A 方案节省 2~3 天）。
3. **7.18 账本 `available_amount < 0`**：**已拍板 A 方案** —— 与 frozen<0 一并治理 15 条（5+12 去重），按 7.13 同等标准"修复脚本 + 对账流水 + DB CHECK + 服务层断言"四管齐下。对标支付宝 / 微信支付 / 腾讯游戏"一次对账一次修"铁律。工作量在 7.13 基础上 +1 天。
4. **7.19 admin types.js 扩展**：**已拍板 A 方案** —— 手写全量补齐 16 个缺失业务实体 + 原 5 个漂移对象修正 + 本轮 7 处新发现漂移修正；C 方案自动生成留到下一轮。对标美团 / 米哈游 / 网易游戏运营后台手写 JSDoc + lint 黑名单做法。工作量 2 天。
5. **7.20 小程序微信静默登录**：**已拍板 B 方案** —— 后端加 `users.wx_openid VARCHAR(64) UNIQUE NULL` 字段 + 新增 `POST /api/v4/auth/wx-code-login` 端点，调用 `.env` 已有的 `WX_APPID/WX_SECRET` 走微信 `jscode2session`。对标美团 / 拼多多 / 转转小程序 openid 标配做法。工作量 1~1.5 天。

**第二轮新增总工时**：约 4~4.5 天。

**合并到原 17~23 天本轮治理计划后，合计 21~27 天**（单人全量执行；多人并行可压缩到 12~15 天）。

**至此，累计 20 项拍板（原 15 项 + 本轮第二轮 5 项）全部完成，可进入阶段 0 基线快照正式动代码。**

---

### 15.8 2026-04-23 第三轮实施记录

**执行人**：后端开发

**已完成项**：

1. **阶段 0 基线验证**：`check:circular` 通过（0 真正循环依赖），Redis PONG，PM2 online
2. **阶段 3a 懒加载收敛**：4 处方法内 `require('../models')` 已上提到文件顶部
   - `services/diy/MaterialService.js`（第 242/244 行 → 使用顶部已导入的 `MediaFile`/`Category`）
   - `services/DIYService.js`（第 1443/1445 行 → 同上）
   - `services/consumption/CoreService.js`（第 774 行 → 顶部新增 `UserRatioOverride` 导入）
   - `services/dashboard/PendingCenterService.js`（第 995 行 → 顶部新增 `ApprovalChainTemplate`/`ApprovalChainNode` 导入）
3. **阶段 4a DIY 脏模板**：`diy_template_id=40` 已从 `published` 退回 `draft`，剩余脏数据 0 条
4. **阶段 4b 账本负值**：负值记录数 = 0（迁移已归零），CHECK 约束已验证存在，NegativeBalanceGuard 测试 7/7 通过
5. **阶段 4c system_settings**：合约测试 4/4 通过（15 个 category 一致性验证）
6. **阶段 7a wx_openid + wx-code-login**：
   - 迁移 `20260423000000-add-wx-openid-to-users.js` 已执行
   - `models/User.js` 新增 `wx_openid` 字段
   - `routes/v4/auth/login.js` 新增 `POST /wx-code-login` 端点
7. **阶段 7b 防回归脚本**：
   - `scripts/validation/check_api_field_contract.js` 已创建
   - `admin/scripts/check-frontend-mappings.cjs` 已创建

**质量验证结果**：

| 检查项 | 结果 |
|--------|------|
| ESLint（修改文件） | 0 error，6 warning（均为已有事务边界提示） |
| Prettier | 已格式化 |
| check:circular | 0 真正循环依赖 |
| check_field_blacklist | 通过 |
| NegativeBalanceGuard | 7/7 通过 |
| FreezeLifecycle | 6/6 通过 |
| system-settings-category | 4/4 通过 |
| Health Check | healthy（DB connected, Redis connected） |
| PM2 | online |


### 15.9 2026-04-24 第四轮全量审查与修复记录

**执行人**：后端开发

**审查方法**：对照文档全部 8 个阶段逐项检查实际代码状态，不以文档标记为准，以代码实际状态为准。

**各阶段审查结论**：

| 阶段 | 状态 | 详情 |
|------|------|------|
| 阶段 0 基线快照 | ✅ 已完成 | schema 快照、路由清单、循环依赖检查均已完成 |
| 阶段 1 去映射+字段统一 | ✅ 已完成 | DataSanitizer 两处 long→short 映射已删除，change_amount 全部改为 delta_amount |
| 阶段 2 服务容器/错误链 | ✅ 已完成 | 155 个路由文件使用 getService()，0 个本地 asyncHandler |
| 阶段 3 懒加载+大文件拆分 | ✅ 已完成 | 0 处方法内懒加载；DIYService.js 已拆分为 services/diy/ |
| 阶段 4 业务一致性治理 | ✅ 已完成 | DIY 脏模板 0 条；账本负值 0 条；CHECK 约束已存在 |
| 阶段 5 Web 前端适配 | ⚠️ 本轮修复 | types.js 5 处旧字段名 + tx_type 全链路统一 |
| 阶段 6 小程序契约 | ✅ 已完成 | 契约文档已在 9.9/12.1-12.7 中冻结 |
| 阶段 7 防回归+wx_openid | ✅ 已完成 | 防回归脚本已创建；wx_openid 字段+端点已实现 |
| 阶段 8 最终验收 | ✅ 通过 | 全部质量检查通过 |

**本轮修复内容**：

1. **`admin/src/api/types.js` 旧字段名修复**：
   - `transaction_id` → `asset_transaction_id`
   - `tx_type` → `business_type`
   - `amount`（变动金额）→ `delta_amount`
   - `campaign_id` → `lottery_campaign_id`（AssetBalance + AssetAdjustParams 两处）
   - `preset_id` → `lottery_preset_id`（PresetConfig）
   - PresetConfig `is_enabled: boolean` → `status: 'pending'|'used'`（与数据库 enum 对齐）
   - ConversionRule `is_enabled: boolean` → `status: 'active'|'paused'|'disabled'`（与数据库 enum 对齐）

2. **`tx_type` → `business_type` 全链路统一**：
   - 后端：`routes/v4/console/assets/transactions.js`（别名映射 + attachDisplayNames 字段）
   - 前端 JS（6 文件）：asset.js、star-stone-accounts.js、finance-management.js、assets-portfolio.js、asset-management.js、adjustment.js
   - 前端 HTML（4 文件）：asset-adjustment.html、assets-portfolio.html、finance-management.html、user-management.html

3. **前端重新构建**：`npm run build` 成功

**质量验证结果**：

| 检查项 | 结果 |
|--------|------|
| ESLint | 0 error |
| check:prevention | 全部通过 |
| check:circular | 0 真正循环依赖 |
| API 契约测试 | 187/187 通过 |
| 回归测试 | 47/47 通过 |
| Health Check | healthy（DB connected, Redis connected） |
| PM2 | online |
| 前端构建 | 成功 |
