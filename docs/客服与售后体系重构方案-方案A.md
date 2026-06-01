# 客服与售后体系重构方案（方案A：业务分层 / 多表分离）

> **状态：📋 待评审（未实施）**
> **创建日期：2026-06-02 ｜ 校准日期：2026-06-02**
> **适用范围：后端数据库项目（Node.js 20 + Express 4 + Sequelize 6 + MySQL + Redis + Socket.io）**
> **决策性质：涉及数据库表结构调整，实施前需项目负责人书面批准**
>
> **本版校准说明**：本方案已用 Node.js（`mysql2`）直连 `.env` 指定的真实库
> `restaurant_points_dev`（外网 `dbconn.sealosbja.site:42569`，**非备份文件**）核对全部表结构、
> 真实行数与 ENUM，并通读后端实际代码（`models/`、`routes/v4/`、`services/`、`utils/`）
> 与 Web 管理后台前端（`admin/`）实际调用。**本次复核新增修正**：`feedbacks.category` 实含
> `suggestion`、拍卖争议 BUG 比原描述更严重（4 重失败）、`compensation_log` 列应保留、
> 审批链已有 98 条真实实例。全文以**后端数据库项目现有技术栈/路由/字段为唯一权威**，前端一律
> 适配后端、直接改用后端字段名（不做映射兼容）。不引用任何历史报告或其他文档。

## 零、与真实代码 / 数据库的对齐结论（先看这里）

本节是对原方案的"事实校准"。原方案有几处与现状不符，已在本版改正，**这些差异直接影响实施量与风险评估**。

### 0.1 真实库核对结果（连 `restaurant_points_dev` 实测，非备份）

| 表 | 真实行数 | 状态机/关键列（实测） | 说明 |
|------|----------|----------------------|------|
| `feedbacks` | **315** | `pending/processing/replied/closed` | 主键 `feedback_id`(INT)，活跃使用；`category` 实含 `suggestion`（共6值） |
| `customer_service_sessions` | **67** | `waiting/assigned/active/closed` | 主键 `customer_service_session_id`(BIGINT)，已含 `issue_id`/`tags`/`resolution_summary` |
| `customer_service_issues` | **0（空表）** | `open/processing/resolved/closed` | 主键 `issue_id`(BIGINT)，**已含 `order_type`/`order_id`/`dispute_*`/`approval_chain_instance_id`/`compensation_log`**；`order_type` ENUM 仅 `trade/redemption/consumption`（无 auction） |
| `customer_service_notes` | 0 | — | 内部备注，用户不可见 |
| `customer_service_agents` | 1 | `active/inactive/on_break` | 客服座席 |
| `customer_service_user_assignments` | （存在） | — | 会话分配表，本方案不涉及 |
| `approval_chain_templates` | 3 | `consumption_default/large`、`merchant_points_default`（列名 `template_code`+`auditable_type`） | **无 `trade_dispute` 类型模板** |
| `approval_chain_instances` | **98** | `in_progress/completed/rejected/cancelled/timeout` | 审批链已活跃运行（佐证仲裁链路可复用） |

### 0.2 原方案需要改正的关键事实

1. **`customer_service_issues` 是空表（0 行），不是"有 trade 数据待迁移"**。原方案 3.3「数据迁移」按"把现有 trade 记录迁到新表"来设计，但库里一条都没有 → **数据迁移步骤可删除/降级为空跑校验**，迁移风险≈0。

2. **后端早已存在 `TradeDisputeService` + 管理端 `disputes/*` 路由**，但它们**当前读写的是 `customer_service_issues`（`issue_type='trade'`）**，不是独立 `trade_disputes` 表。代码层面：`services/TradeDisputeService.js`、`routes/v4/console/customer-service/disputes.js` 已上线，admin 前端 `content.js` 已配 `DISPUTE_*` 端点并在客服工作台「纠纷」Tab 调用。所以方案A 的本质是**把已有 dispute 逻辑从"借住工单表"搬到"自己的表"**，而非从零搭建。

3. **存在一个真实 BUG（与本方案同域，建议一并修），且比原校准描述的更严重**：`routes/v4/marketplace/auctions.js` 的 `POST /:auction_listing_id/dispute`（实测第 275–315 行）调用 `tradeDisputeService.createDispute({ order_type:'auction', order_id, dispute_type, description, evidence })`。该调用目前**有 4 个并存的失败点**，按代码执行顺序：
   - **(a) 漏传事务**：路由直接 `await createDispute({...})`，没有第二参 `{ transaction }`、也没有 `TransactionManager.execute` 包裹。`createDispute` 第一行 `assertAndGetTransaction(options, ...)` 会先抛 `TRANSACTION_REQUIRED`（`utils/transactionHelpers.js`）。→ **最先触发，请求直接 500。**
   - **(b) 漏传 `title`**：服务层 `if (!title) throw '纠纷标题不能为空'`，但拍卖路由没传 `title`。
   - **(c) `order_type` 硬校验**：`if (order_type !== 'trade') throw 'TRADE_NOT_ALLOWED'`（服务层第 87 行），且 `customer_service_issues.order_type` ENUM 实测只有 `('trade','redemption','consumption')`，**无 `auction`**。
   - **(d) 订单模型耦合**：`createDispute` 内部硬查 `this.models.TradeOrder.findByPk(parseInt(order_id))` 并用 `order.buyer_user_id` 校验买家——但拍卖根本没有 `TradeOrder`，`order_id` 是 `auction_listing_id`，必然查不到/校验失败。
   → 结论：拍卖发起争议**现在必然报错**，且原方案"只放开 `order_type` 白名单"**不足以修复**。方案A 重建 `trade_disputes` 时必须同时：放开 `order_type`、让 C 端/拍卖入口统一走事务、补 `title` 默认值、并把"订单归属校验"按 `order_type` 分流（trade 查 `TradeOrder`，auction 查拍卖表），否则修了表仍跑不通（详见 4.3 修订）。

4. **`approval_chain` 没有 `trade_dispute` 模板**：`escalateToArbitration` 调 `ApprovalChainService.matchTemplate('trade_dispute', ...)`，但库里只有 consumption/merchant_points 模板 → **升级仲裁现在会抛 `TRADE_NOT_CONFIGURED`**。方案A 需把"建 trade_dispute 审批链模板"列为配套数据初始化项。

5. **`feedbacks.feedback_id` 是 INT 自增**（不是原方案默认假设的 BIGINT 风格）。实测 `category` 枚举为 `technical/feature/bug/complaint/suggestion/other`（**含 `suggestion`，原校准漏写**，真实库有 4 行 `suggestion`、290 行 `other`、10 行 `technical`、6 行 `bug`、5 行 `feature`）；`priority` 枚举 `high/medium/low`；`status` 枚举 `pending/processing/replied/closed`（真实分布 pending 298 / replied 7 / processing 6 / closed 4）。`feedbacks` 表本次**不改动，保持**。

6. **`customer_service_issues` 实有 `compensation_log`(JSON) 列**（GM 补偿记录，由 `CompensateService` 填充），原方案 3.2「移除纠纷列」未提及它。该列属"内部工单"职责，**应保留**，不随纠纷字段迁出（详见 3.2 修订）。

7. **审批链是活跃系统、非纸面能力**：实测 `approval_chain_instances` 已有 **98 行**真实实例、`approval_chain_nodes` 4 行、`approval_chain_templates` 3 行、另有 `approval_chain_steps` 表。说明仲裁所依赖的审批链体系已在线运行，方案A 接入它属"复用成熟链路"而非"新建"。

8. **存在两张本方案不涉及、但同域的真实表**：`customer_service_user_assignments`（客服会话分配）、`customer_service_notes`（内部备注，0 行）。本次重构**不动这两张表**，仅在此登记以免遗漏。

### 0.3 问题归属（哪些是后端/Web前端/小程序前端的问题）

| 编号 | 问题 | 归属项目 | 为什么是它的问题 |
|------|------|----------|------------------|
| P1 | `feedbacks` 与 `customer_service_issues` 语义重叠（都有 priority/status/回复） | **后端数据库** | 表结构与服务边界在后端定义 |
| P2 | `customer_service_issues` 一表三用（工单+纠纷+仲裁） | **后端数据库** | 模型 `CustomerServiceIssue.js` 把 dispute_* 列塞进通用工单表 |
| P3 | `issue_type` 含 `trade`/`feedback` 重载语义 | **后端数据库** | 模型枚举定义在后端 |
| P4 | 拍卖争议 4 重失败（漏事务/漏 title/`order_type='auction'` 不在 ENUM 与白名单/`TradeOrder` 耦合校验） | **后端数据库**（服务层+表ENUM）+ **后端路由**（拍卖入口未走事务/未传 title） | 失败点全在后端：服务层校验、ENUM 定义、拍卖路由调用方式 |
| P5 | 升级仲裁缺 `trade_dispute` 审批链模板 | **后端数据库**（配置数据） | 模板表无对应记录 |
| P6 | 小程序通过 `GET /chat/issues` 看到"工单" | **后端数据库**（接口暴露） + **小程序前端**（调用） | 接口在 `routes/v4/system/chat.js`；是否调用由小程序决定 |
| P7 | 客服工作台「纠纷」Tab 字段两套兜底 `issue_id \|\| customer_service_issue_id` | **Web 管理后台前端** | `cs-user-context.js` 对后端字段名不确定，做了防御兜底 |
| P8 | admin `DISPUTE_*` 端点指向 `customer-service/disputes`，但读的是工单表 | **后端数据库**（数据源）；前端端点路径本身正确 | 前端路径对，后端数据源要换表 |

> 结论：**绝大多数是后端数据库项目的问题（P1–P6、P8 的数据源）**。Web 前端只有 P7 的字段兜底需要清理。小程序前端只需在后端下线 `/chat/issues` 后移除调用并改走业务化入口。

## 一、本方案要解决的问题

当前后端已长出**三套语义重叠**的"用户问题"系统，且其中一套（`customer_service_issues`）被当三种东西混用，导致边界模糊、维护成本高、易出 bug。

### 1.1 现状三套系统（与真实库/代码一致）

| 系统 | 数据表（真实行数） | 谁发起 | 形态 | 用户能否看到 |
|------|--------|--------|------|--------------|
| 意见反馈 | `feedbacks`（315） | 用户 | 异步留言+回复 | 能（`GET /system/feedback/my`） |
| 在线客服会话 | `customer_service_sessions`（67） | 用户 | 实时 IM（Socket.io） | 能（聊天+满意度评分） |
| 客服工单 | `customer_service_issues`（0） | 客服后台（`created_by`=管理员） | 内部问题跟踪 | 只读（`GET /system/chat/issues`） |

### 1.2 三个核心问题

**问题1：`feedbacks` 与 `customer_service_issues` 语义重叠** —— 两表都有 `priority`、`status` 生命周期、回复/处理结果字段；`customer_service_issues.issue_type` 还有 `feedback` 枚举值表示"反馈升级成工单"，边界模糊。

**问题2：`customer_service_issues` 一张表当三种东西用** —— 实测该表同时承载：普通内部工单（`issue_type`=asset/lottery/item/account/consumption）、交易纠纷（`dispute_type`/`dispute_evidence`/`dispute_deadline`）、仲裁流程（`approval_chain_instance_id`）。交易纠纷有举证、仲裁、退款、审批链等独立复杂状态机，塞进通用工单表导致 `TradeDisputeService` 里大量 `issue_type==='trade'` 分支判断。

**问题3：内部概念"工单"对用户暴露** —— `GET /api/v4/system/chat/issues`（`routes/v4/system/chat.js` 第565行）让小程序用户能看到"工单"。工单是客服内部跟踪工具（由管理员创建），术语属运营语言，暴露给用户造成认知负担。

### 1.3 目标

让交易纠纷做回交易纠纷（用户可见的售后流程），让工单退回纯内部跟踪工具（用户不可见），让反馈保持轻量异步留言。三者各就各位。

## 二、目标架构（业务分层 / 多表分离）

### 2.1 核心思想

按**业务类型分表**，区分"用户可见层"和"内部处理层"。这是闲鱼、转转、得物、BUFF、米哈游等带交易的平台型业务的通用做法（与本项目业务形态最贴合）。

```
用户可见层（业务语言）              内部处理层（运营语言）
─────────────────────             ─────────────────────
① 在线客服会话 (IM)      ┐
② 意见反馈 (Feedback)    ├──聚合──► 工单 (Issue)    ← 纯内部
③ 交易售后申诉 (Dispute) ┘          补偿 (GM工具)   ← 纯内部

铁律：用户只看到"会话/反馈/售后进度"，永远看不到"工单"二字。
```

### 2.2 四张表的职责边界（重构后）

| 表 | 定位 | 谁发起 | 用户可见 | 状态机 |
|------|------|--------|----------|--------|
| `feedbacks` | 意见反馈（轻量异步留言） | 用户 | 是 | pending→processing→replied→closed（不变） |
| `customer_service_sessions` | 在线客服会话（实时 IM） | 用户 | 是 | waiting→assigned→active→closed（不变） |
| `trade_disputes`（新拆出） | 交易售后申诉 | 用户（可自助）/客服 | 是 | open→reviewing→arbitrating→resolved/rejected |
| `customer_service_issues`（瘦身） | 内部工单（聚合跟踪） | 客服 | 否 | open→processing→resolved→closed |

### 2.3 关键变化

1. **拆**：`customer_service_issues` 中的纠纷/仲裁字段（`dispute_type`/`dispute_evidence`/`dispute_deadline`/`approval_chain_instance_id` 及多态 `order_type`/`order_id` 的纠纷用法）独立成 `trade_disputes` 表。
2. **瘦身**：`customer_service_issues` 只保留"内部工单"职责，可引用 `feedback_id`/`session_id`/`dispute_id` 做聚合。
3. **下线**：移除 `issue_type` 的 `trade`/`feedback` 重载语义；下线 `GET /system/chat/issues`。
4. **修Bug**：`trade_disputes.order_type` 纳入 `auction`，放开服务层 `order_type` 白名单（修 P4）。
5. **补配置**：初始化 `trade_dispute` 审批链模板（修 P5）。

## 三、数据库结构变更详情

> ⚠️ 变更须经批准后通过 Sequelize 迁移执行（`npm run migration:create` → `npm run migration:up`，含 `migration:verify` 预校验）。禁止手写 SQL 直接改库。真相库为 `.env` 的 `restaurant_points_dev`。
>
> **命名遵循后端现有约定**（实测）：主键用"全名_id"（如 `customer_service_session_id`），时间列 `created_at`/`updated_at`（`underscored: true`），多态订单用 `order_type`(ENUM)+`order_id`(VARCHAR(64))，证据/标签用 JSON 列，金额相关用整数（积分制）。

### 3.1 新建表 `trade_disputes`（交易售后申诉）

主键 `trade_dispute_id`（BIGINT 自增，遵循"全名_id"约定）。字段对齐现有 `customer_service_issues` 纠纷列并补齐用户自助申诉所需：

| 字段 | 类型 | 说明 |
|------|------|------|
| `trade_dispute_id` | BIGINT PK AI | 申诉主键 |
| `user_id` | INT NOT NULL | 申诉人（买家），→ `users.user_id` |
| `order_type` | ENUM(trade/redemption/consumption/auction) | 关联订单类型（**含 auction，修 P4**） |
| `order_id` | VARCHAR(64) NOT NULL | 关联订单ID（多态值，兼容 BIGINT/UUID） |
| `dispute_type` | ENUM(item_not_received/item_mismatch/quality_issue/fraud/other) | 纠纷类型（沿用现有枚举） |
| `title` | VARCHAR(200) NOT NULL | 申诉标题 |
| `description` | TEXT NULL | 申诉描述 |
| `evidence` | JSON NULL | 证据（截图URL数组等，对应旧 `dispute_evidence`） |
| `status` | ENUM(open/reviewing/arbitrating/resolved/rejected) | 申诉状态机 |
| `priority` | ENUM(low/medium/high/urgent) | 优先级（沿用工单约定） |
| `assigned_to` | INT NULL | 处理客服（内部，→ `users.user_id`） |
| `approval_chain_instance_id` | BIGINT NULL | 仲裁审批链实例（对应旧列） |
| `deadline` | DATETIME NULL | 处理截止（超时升级，对应旧 `dispute_deadline`） |
| `resolution` | TEXT NULL | 处理结果 |
| `resolved_at` | DATETIME NULL | 处理时间 |
| `created_by` | INT NULL | 发起人（自助=user 本人，代发=客服） |
| `created_at`/`updated_at` | DATETIME | 时间戳（`underscored`） |

索引：`user_id`、`status`、`(order_type, order_id)`、`assigned_to`、`created_at`。
外键：`user_id` → `users.user_id`（RESTRICT）；`order_id` 多态不加物理外键（与现有工单一致）。

### 3.2 改造表 `customer_service_issues`（瘦身为纯内部工单）

**移除**纠纷/仲裁专用列（迁入 `trade_disputes`）：`dispute_type`、`dispute_evidence`、`dispute_deadline`、`approval_chain_instance_id`。

**调整** `issue_type` 枚举：移除 `trade`（归 `trade_disputes`）与 `feedback`（反馈不再升级为工单类型）。改造后枚举：`asset/lottery/item/account/consumption/other`。

**`order_type`/`order_id` 保留**（工单本就支持多态关联订单，`CustomerServiceIssueService.create/list` 已用到），但语义收敛为"内部工单关联的订单"，与纠纷无关。

**保留**内部工单原有列（实测存在，属工单职责，**不迁出**）：`compensation_log`(JSON，GM 补偿记录，由 `CompensateService` 填充)、`resolution`、`resolved_at`、`closed_at`、`priority`、`title`、`description`。

**新增**聚合引用列（便于工单关联来源）：
- `feedback_id` INT NULL — 引用 `feedbacks.feedback_id`（注意 feedbacks 主键是 INT）
- `dispute_id` BIGINT NULL — 引用 `trade_disputes.trade_dispute_id`
- `session_id` BIGINT NULL — 已存在，保留

### 3.3 数据迁移（实测后大幅简化）

> **实测：`customer_service_issues` 当前 0 行**，无 `issue_type='trade'` 历史数据。因此原"批量迁移 trade 记录"步骤**降级为空表校验**：

1. 迁移 `up`：建 `trade_disputes` 表 → 建 `trade_dispute` 审批链模板 → （存量为 0，仅执行 `SELECT COUNT(*) WHERE issue_type='trade'` 断言为 0，若非 0 则把这些行搬到 `trade_disputes`，做成幂等兜底）→ 删 `customer_service_issues` 纠纷列 + 调整 `issue_type` 枚举 + 加聚合列。
2. 迁移 `down`：恢复纠纷列与枚举、删除聚合列、删 `trade_disputes` 表、删模板。
3. 迁移前 `npm run migration:verify` 校验；`feedbacks`/`customer_service_sessions` 不动。

> 因为是空表，本次迁移**几乎零数据风险**，这是"项目未上线、一次到位"的最佳时机。

## 四、API 与路由变更（接口/字段以后端为准）

> 全部沿用后端现有约定：路由不直连 models，统一 `req.app.locals.services.getService(key)` 取服务；写操作走 `TransactionManager.execute`；响应用 `res.apiSuccess(data, msg)` / `res.apiError(msg, code, data, status)`；字段 `snake_case`；统一响应体 `{ success, code, message, data, timestamp, version }`（见 `utils/ApiResponse.js`）。

### 4.1 C 端（小程序，前缀 `/api/v4/system`）

| 操作 | 端点 | 变更 | 鉴权 |
|------|------|------|------|
| 提交反馈 | `POST /system/feedback` | 不变 | `authenticateToken` |
| 我的反馈 | `GET /system/feedback/my` | 不变 | `authenticateToken` |
| 客服会话/消息/评分/上传 | `POST/GET /system/chat/sessions/*` | 不变 | `authenticateToken` |
| 我的工单 | `GET /system/chat/issues` | **下线删除**（修 P6） | — |
| 发起售后申诉 | `POST /system/disputes`（新增） | 用户对订单自助发起 | `authenticateToken` |
| 我的售后列表 | `GET /system/disputes/my`（新增） | 看自己的申诉进度（脱敏） | `authenticateToken` |
| 售后详情 | `GET /system/disputes/:id`（新增） | 仅本人可见，脱敏 | `authenticateToken` |

新建 `routes/v4/system/disputes.js`，在 `routes/v4/system/index.js` 增 `router.use('/disputes', disputesRoutes)`（与现有 `notifications`/`config` 等同款挂载）。下线 `chat.js` 中 `GET /chat/issues` 路由块，并删除 `CustomerServiceIssueService.getUserIssues`（仅该处调用）。

### 4.2 管理端（前缀 `/api/v4/console/customer-service`）

- `disputes/*`（`routes/v4/console/customer-service/disputes.js` 已存在）：服务层 `TradeDisputeService` 由"读写 `customer_service_issues`(`issue_type='trade'`)"改为"读写 `trade_disputes`"。**路由路径与方法签名不变**，admin 前端 `DISPUTE_*` 端点无需改路径。
- `issues/*`：保留，只处理瘦身后的内部工单（移除 trade 相关分支）。
- 写操作仍走 `ServiceManager` + `TransactionManager`（不变）。

### 4.3 拍卖争议入口修复（P4，需 4 处一起改才跑得通）

`routes/v4/marketplace/auctions.js` 的 `POST /:auction_listing_id/dispute` 现在 4 重失败（见 0.2 第 3 条）。仅放开白名单不够，须**同时**改：

1. **拍卖路由**（`auctions.js`）：把 `createDispute` 调用包进 `TransactionManager.execute(async transaction => svc.createDispute({...}, { transaction }))`，并补 `title`（如 `title: '拍卖争议-' + auctionListingId`）、`created_by: userId`。
2. **服务层白名单**（`TradeDisputeService.createDispute`）：`order_type` 由仅 `'trade'` 放开为 `['trade','redemption','consumption','auction']`。
3. **表 ENUM**（`trade_disputes.order_type`）：定义即含 `auction`（见 3.1）。
4. **订单归属校验按 `order_type` 分流**：`order_type==='trade'` 查 `TradeOrder` 校验 `buyer_user_id`；`order_type==='auction'` 查拍卖表校验 `winner_user_id`（路由已先校验 `winner_user_id===userId`，服务层可据 `order_type` 跳过 `TradeOrder` 查询，避免对 auction 误查交易订单）。

> 这是"修 P4"的完整定义。若只做原方案的第 2 步（放开白名单），(a)漏事务 与 (d)`TradeOrder` 耦合 仍会让拍卖争议失败。

### 4.4 数据脱敏（下发给小程序的字段控制）

复用现有 `DataSanitizer`（`services/index.js` 注册为 `data_sanitizer`，方法形如 `sanitizeXxx(list, 'public'|'full')`）。需**新增** `sanitizeDisputes(list, dataLevel)` 方法（现有有 `sanitizeFeedbacks`/`sanitizeChatSessions` 可参照）。

售后申诉下发小程序（`'public'`）时**禁止**返回：`assigned_to`（处理客服ID）、`approval_chain_instance_id`（仲裁审批链）、内部备注、其他用户的 `user_id`/手机号。用户端只下发：申诉状态、纠纷类型、自己提交的证据、处理结果摘要（`resolution`）、时间。

### 4.5 C 端新增接口请求/响应契约（小程序按此对接，字段以后端为准）

**`POST /system/disputes`** 请求体：

```json
{
  "order_type": "trade",
  "order_id": "10086",
  "dispute_type": "item_not_received",
  "title": "未收到物品",
  "description": "付款后3天未发货",
  "evidence": ["https://.../1.jpg"]
}
```

成功响应（脱敏后）：

```json
{
  "success": true,
  "code": "SUCCESS",
  "message": "申诉已提交",
  "data": {
    "trade_dispute_id": 12,
    "order_type": "trade",
    "order_id": "10086",
    "dispute_type": "item_not_received",
    "status": "open",
    "deadline": "2026-06-09 00:00:00"
  }
}
```

**`GET /system/disputes/my`** 响应 `data`：`{ rows: [...], count, page, page_size }`，`rows[]` 每条仅含 `trade_dispute_id/order_type/order_id/dispute_type/status/title/resolution/created_at/resolved_at`（脱敏，无 `assigned_to`/`approval_chain_instance_id`）。

> 小程序前端**直接使用上述后端字段名**（如 `trade_dispute_id`、`status`、`dispute_type`），不要自建映射；不要再出现 `issue`/`工单` 字样。

## 五、基于现有技术栈：可复用 / 可扩展点

> 方案A 完全落在后端现有技术框架内（Express + Sequelize + Redis + Socket.io + ServiceManager + TransactionManager + 审批链），**无需引入任何新依赖**。

### 5.1 后端可直接复用（已存在，几乎零新建）

| 现有资产 | 路径 | 复用方式 |
|----------|------|----------|
| `TradeDisputeService` | `services/TradeDisputeService.js` | 改表名/枚举即可，业务流程（创建/升级仲裁/解决）保留 |
| 管理端 `disputes` 路由 | `routes/v4/console/customer-service/disputes.js` | 路径不变，仅服务层换表 |
| 审批链体系 | `services/ApprovalChainService.js` + `approval_chain_*` 表（实测 templates 3 / nodes 4 / **instances 98** / 另有 steps 表） | 仲裁直接接入，只需加 `trade_dispute` 模板；98 条真实实例证明链路已在线运行，属复用成熟系统 |
| ServiceManager 注册 | `services/index.js`（`trade_dispute`/`cs_issue`/`feedback`/`data_sanitizer` 已注册） | 沿用，无需新增注册项（仅改实现） |
| `TransactionManager` | `utils/TransactionManager.js` | 所有写操作沿用 |
| `DataSanitizer` | `services/DataSanitizer.js`（含 `sanitizeFeedbacks`/`sanitizeChatSessions`） | 新增 `sanitizeDisputes` 一个方法 |
| 迁移工具链 | `npm run migration:create/verify/up` | 沿用，含预校验 |
| 多态订单字段范式 | `customer_service_issues.order_type/order_id` 现成范式 | `trade_disputes` 照搬 |
| 校验脚本 | `check:fields`/`check:api-contract`/`validate:routes` | CI 防回归 |

### 5.2 可扩展点（表结构一次建好，二期免改表）

- **多渠道订单**：`order_type` ENUM 预留 `auction`，未来加 `redemption`/`consumption` 售后只是放开业务校验，不动表。
- **自助/审核两档**：`status` 含 `reviewing`，一期可"用户提交→客服审核受理"，二期开全自助，无需改表。
- **仲裁可插拔**：`approval_chain_instance_id` 关联审批链，未来纠纷仲裁规则变化只改模板数据。
- **聚合工单**：`customer_service_issues` 加 `feedback_id`/`dispute_id` 后，可把"会话+反馈+申诉"聚合到一张内部工单跨班次跟踪。

### 5.3 是否符合 Web 管理后台前端（admin/）现有技术栈

符合，且改动很小。admin 技术栈实测为 **Vite 6 + Alpine.js 3 + Tailwind 3 + socket.io-client**（`admin/package.json`），API 端点集中在 `src/api/*.js`（`content.js` 已定义全部 `DISPUTE_*`/`CS_ISSUE_*`），客服工作台逻辑在 `src/modules/content/composables/`。

- **端点路径不变** → `content.js` 的 `DISPUTE_LIST/DETAIL/STATS/CREATE/ESCALATE/RESOLVE` 无需改。
- **唯一要清理**（P7）：`cs-user-context.js` 里 `dispute.issue_id || dispute.customer_service_issue_id` 的两套兜底，统一改成后端新字段 `dispute.trade_dispute_id`；`customer-service.html` 中 `:key="d.issue_id || d.customer_service_issue_id"` 同步改 `d.trade_dispute_id`。
- 这正是"前端适配后端、直接用后端字段名、不做映射"的落地点。

## 六、执行步骤与代码（按后端规范，一次到位不留兼容层）

> 按项目规则"不兼容旧接口、旧路由直接删、全链路同步修改"。每步附关键代码骨架（实施时补全字段注释/JSDoc）。

### 步骤1：新建模型 `models/TradeDispute.js`

```javascript
// models/TradeDispute.js（骨架，实施时补齐中文注释/索引）
const { DataTypes } = require('sequelize')
module.exports = sequelize => {
  const TradeDispute = sequelize.define('TradeDispute', {
    trade_dispute_id: { type: DataTypes.BIGINT, primaryKey: true, autoIncrement: true },
    user_id: { type: DataTypes.INTEGER, allowNull: false },
    order_type: { type: DataTypes.ENUM('trade', 'redemption', 'consumption', 'auction'), allowNull: false },
    order_id: { type: DataTypes.STRING(64), allowNull: false },
    dispute_type: { type: DataTypes.ENUM('item_not_received', 'item_mismatch', 'quality_issue', 'fraud', 'other'), allowNull: false },
    title: { type: DataTypes.STRING(200), allowNull: false },
    description: { type: DataTypes.TEXT, allowNull: true },
    evidence: { type: DataTypes.JSON, allowNull: true },
    status: { type: DataTypes.ENUM('open', 'reviewing', 'arbitrating', 'resolved', 'rejected'), defaultValue: 'open' },
    priority: { type: DataTypes.ENUM('low', 'medium', 'high', 'urgent'), defaultValue: 'high' },
    assigned_to: { type: DataTypes.INTEGER, allowNull: true },
    approval_chain_instance_id: { type: DataTypes.BIGINT, allowNull: true },
    deadline: { type: DataTypes.DATE, allowNull: true },
    resolution: { type: DataTypes.TEXT, allowNull: true },
    resolved_at: { type: DataTypes.DATE, allowNull: true },
    created_by: { type: DataTypes.INTEGER, allowNull: true }
  }, {
    tableName: 'trade_disputes', timestamps: true, underscored: true,
    createdAt: 'created_at', updatedAt: 'updated_at'
  })
  TradeDispute.associate = models => {
    TradeDispute.belongsTo(models.User, { foreignKey: 'user_id', as: 'user' })
    TradeDispute.belongsTo(models.User, { foreignKey: 'assigned_to', as: 'assignee' })
  }
  return TradeDispute
}
```

### 步骤2：创建迁移（建表 + 模板 + 空表校验 + 工单瘦身）

```bash
npm run migration:create -- create-trade-disputes-and-slim-issues
```

`up` 关键逻辑（伪代码顺序）：
1. `createTable('trade_disputes', {...})` + 索引；
2. 插入 `trade_dispute` 审批链模板（`approval_chain_templates`，实测列为 `template_code`(UNI)+`template_name`+`auditable_type='trade_dispute'`+`total_nodes`+`is_active`+`priority`+`match_conditions`(JSON)）+ 至少 1 个 `approval_chain_nodes`（`step_number`/`node_name`/`assignee_type`/`is_final` 等）；
3. 幂等兜底：`SELECT * FROM customer_service_issues WHERE issue_type='trade'` → 若有则搬到 `trade_disputes`（实测 0 行，正常空跑）；
4. `removeColumn` 删 `dispute_type/dispute_evidence/dispute_deadline/approval_chain_instance_id`（**`compensation_log` 不删，保留为工单职责**）；
5. `changeColumn` 收敛 `issue_type` 枚举为 `asset/lottery/item/account/consumption/other`；
6. `addColumn` 加 `feedback_id`(INT)、`dispute_id`(BIGINT)。

`down`：逆序回滚（恢复列与枚举、删聚合列、删表、删模板）。

### 步骤3：改造 `models/CustomerServiceIssue.js`

- `issue_type` 枚举删 `trade`、`feedback`；
- 删除 `dispute_type`/`dispute_evidence`/`dispute_deadline`/`approval_chain_instance_id` 四个字段定义；
- 新增 `feedback_id`(INTEGER, NULL)、`dispute_id`(BIGINT, NULL) 字段定义与索引；
- `order_type`/`order_id` 保留（内部工单关联订单用途）。

### 步骤4：改造 `services/TradeDisputeService.js`（改表 + 放开校验 + 支持自助）

关键改动：
- 所有 `this.models.CustomerServiceIssue` → `this.models.TradeDispute`；查询去掉 `issue_type:'trade'` 过滤（整表都是纠纷）。
- `createDispute`：`order_type` 白名单改为 `['trade','redemption','consumption','auction']`（修 P4-c）；返回字段 `issue_id` → `trade_dispute_id`。
- `createDispute` **订单归属校验按 `order_type` 分流**（修 P4-d）：`trade` 查 `TradeOrder.buyer_user_id`，`auction` 查拍卖表 `winner_user_id`，不再无条件 `TradeOrder.findByPk`。
- `createDispute` 入参支持 `created_by = user_id`（自助）；C 端路由与拍卖路由都传当前登录用户，并都走 `TransactionManager.execute`（修 P4-a）；拍卖入口补 `title`（修 P4-b）。
- `escalateToArbitration`：`matchTemplate('trade_dispute', ...)` 现在有模板可匹配（步骤2 已建，修 P5）；注意核对审批链实例返回字段（实例表主键实测为 `instance_id`，服务层引用 `approval_chain_instance_id`，实施时确认 `createChainInstance` 的返回别名一致）。
- `status` 改用新机：`open/reviewing/arbitrating/resolved/rejected`。

### 步骤5：新增 C 端路由 `routes/v4/system/disputes.js`

```javascript
// routes/v4/system/disputes.js（骨架）
const express = require('express')
const router = express.Router()
const { authenticateToken } = require('../../../middleware/auth')
const { asyncHandler } = require('../../../middleware/validation')
const TransactionManager = require('../../../utils/TransactionManager')

// 用户自助发起售后申诉
router.post('/disputes', authenticateToken, asyncHandler(async (req, res) => {
  const svc = req.app.locals.services.getService('trade_dispute')
  const { order_type, order_id, dispute_type, title, description, evidence } = req.body
  if (!order_type || !order_id || !dispute_type || !title) {
    return res.apiError('缺少必填参数', 'BAD_REQUEST', null, 400)
  }
  const result = await TransactionManager.execute(async transaction =>
    svc.createDispute({
      order_type, order_id: String(order_id), user_id: req.user.user_id,
      dispute_type, title, description, evidence, created_by: req.user.user_id
    }, { transaction }), { description: '用户自助发起售后申诉' })
  return res.apiSuccess(result, '申诉已提交')
}))

// 我的售后列表（脱敏）
router.get('/disputes/my', authenticateToken, asyncHandler(async (req, res) => {
  const svc = req.app.locals.services.getService('trade_dispute')
  const sanitizer = req.app.locals.services.getService('data_sanitizer')
  const data = await svc.listUserDisputes(req.user.user_id, req.query)
  data.rows = sanitizer.sanitizeDisputes(data.rows, 'public')
  return res.apiSuccess(data, '获取售后列表成功')
}))

// 售后详情（仅本人，脱敏）
router.get('/disputes/:id', authenticateToken, asyncHandler(async (req, res) => {
  const svc = req.app.locals.services.getService('trade_dispute')
  const sanitizer = req.app.locals.services.getService('data_sanitizer')
  const detail = await svc.getUserDisputeDetail(req.user.user_id, parseInt(req.params.id))
  return res.apiSuccess(sanitizer.sanitizeDisputes([detail], 'public')[0], '获取售后详情成功')
}))

module.exports = router
```

在 `routes/v4/system/index.js` 中：`const disputesRoutes = require('./disputes')` + `router.use('/disputes', disputesRoutes)`。
`TradeDisputeService` 需新增 `listUserDisputes(userId, query)` 与 `getUserDisputeDetail(userId, id)`（带 user 归属校验）两个 C 端方法。

### 步骤6：下线 `GET /system/chat/issues`

- 删除 `routes/v4/system/chat.js` 第 556–577 行的 `GET /chat/issues` 路由块；
- 删除 `services/CustomerServiceIssueService.js` 的 `getUserIssues` 方法（仅此一处调用）；
- 全局 grep 确认无其他引用。

### 步骤7：管理端 + 拍卖入口对齐

- `disputes.js` 路由：路径不变；服务层已在步骤4换表。`listDisputes` 返回的 `rows[].issue_id` 变为 `trade_dispute_id`。
- `issues.js`/`CustomerServiceIssueService`：移除 trade 相关分支与字段引用。
- `routes/v4/marketplace/auctions.js`（拍卖争议入口，修 P4-a/b）：把 `createDispute` 包进 `TransactionManager.execute` 并补 `title`/`created_by`（见 4.3）。
- admin 前端（P7）：`cs-user-context.js`（实测第 349/352/361/377 行）与 `customer-service.html`（实测第 796/799 行）把纠纷列表的 `issue_id || customer_service_issue_id` 统一改 `trade_dispute_id`。**注意**：同文件中"内部工单"列表（`order_linked_issues`/`context_issues`，html 第 339/827/904 行）用的是工单 `issue_id`，**保持不动**，不要误改。

### 步骤8：DataSanitizer 加 `sanitizeDisputes`

参照现有 `sanitizeFeedbacks`，`'public'` 级移除 `assigned_to`/`approval_chain_instance_id`/内部字段。

### 步骤9：校验与测试（全过才算完成）

```bash
npm run migration:verify        # 迁移预校验
npm run migration:up            # 执行迁移（连真实库）
npm run check:api-contract      # API 字段契约
npm run check:fields            # 字段黑名单
npm run validate:routes         # 路由校验
npm run lint                    # ESLint（standard）
npm test                        # Jest + SuperTest
npm run health:check            # 健康检查
```

同步更新所有相关 JSDoc/注释与本文档一致。

## 七、需项目负责人拍板的事项

### 7.0 勾选式待批准清单（直接逐条拍板）

> 用法：在每行 `决定` 列填 ✅采纳建议 / ❌否决 / ✏️改为(写你的意见)。13 项全部确认后即可进入实施（第六节步骤）。带 ⚠️ 的项若不拍板会**阻塞实施**或**留下现网 BUG / 资损**。

| # | 拍板项 | 我的建议 | 影响范围（改这里） | 不拍板的后果 | 决定 |
|---|--------|----------|--------------------|--------------|------|
| 1 | 是否采用方案A（纠纷独立成 `trade_disputes`） | ✅ 采用 | 新建 `models/TradeDispute.js` + 迁移；`TradeDisputeService` 换表 | ⚠️ 整个方案的前提，不定则无法开工 | ☐ |
| 2 | 纠纷是否允许用户自助发起 | ✅ 允许（表按自助建，一期可先审核制 `reviewing`） | 新增 C 端 `routes/v4/system/disputes.js`；`createDispute` 支持 `created_by=user` | 表结构留隐患，二期要二次改表 | ☐ |
| 3 | `GET /chat/issues` 处置 | ✅ 直接下线删除 | 删 `chat.js` 该路由块 + `CustomerServiceIssueService.getUserIssues` | 用户继续看到"工单"内部术语 | ☐ |
| 4 | 拍卖争议 `order_type='auction'` 是否纳入纠纷表 | ✅ 纳入（修现网 BUG，需 4 处一起改） | `auctions.js` 补事务/title、服务层放开白名单、表 ENUM、按 `order_type` 分流校验 | ⚠️ 拍卖发起争议**现在必然报错**，不修一直坏 | ☐ |
| 5 | 新表主键命名 | `trade_dispute_id`（合"全名_id"约定） | `models/TradeDispute.js`、迁移、前端字段名 | ⚠️ 命名定不下来，建表/前端无法落地 | ☐ |
| 6 | `trade_dispute` 审批链模板层级 | 1 级（高级客服终审），后续可加 | 迁移里插 `approval_chain_templates`+`nodes` | ⚠️ 不建模板则"升级仲裁"抛 `TRADE_NOT_CONFIGURED` | ☐ |
| 7 | 拍卖争议的订单归属校验口径 | 服务层按 `order_type` 分流（auction 查拍卖表 `winner_user_id`） | `TradeDisputeService.createDispute` | auction 误查 `TradeOrder`，第 4 项修了也跑不通 | ☐ |
| 8 | 自助申诉「可申诉订单状态」白名单 | 交易沿用 `completed/frozen`、拍卖 `settled` | `TradeDisputeService` 校验 | 用户能在错误状态发起申诉/或全被拦 | ☐ |
| 9 | ⚠️ 纠纷退款的资金语义（**现有真实资损 BUG**） | 复用 `TradeOrderService.cancelOrder` 真解冻；已完成订单需定"向卖家追回 vs 平台垫付" | `TradeDisputeService.resolveDispute` + `BalanceService.unfreeze` | ⚠️ 现 `refund=true` **只改订单状态为 cancelled、根本没退买家资产**（注释写了没做）→ 上线即"退款假成功"/资损 | ☐ |
| 10 | 纠纷状态变更是否通知用户 | ✅ 接 `NotificationService`（受理/升级/解决三节点），WebSocket 可选 | `TradeDisputeService` 各状态变更处 | 同域 escrow/拍卖/兑换都有通知，纠纷零通知 → 自助用户看不到进度 | ☐ |
| 11 | 超时是否自动升级仲裁 | 一期人工，二期加 `node-cron` 任务（项目已有定时任务体系） | `jobs/`（现无纠纷任务）+ `dispute_deadline` | 不做则 `deadline` 字段形同虚设，全靠客服盯 | ☐ |
| 12 | 操作角色等级是否沿用 | ✅ 沿用现值：查看 Lv1 / 解决 Lv50 / 升级仲裁 Lv100 | `routes/v4/console/customer-service/disputes.js` | 不确认则换表后权限口径可能漂移 | ☐ |
| 13 | 自助申诉防滥用阈值 | 建议加冷却+月限（参考兑换退款 `exchange/refund_cooldown_hours`/`refund_monthly_limit` 先例） | `TradeDisputeService.createDispute` 风控 | 自助开放后无频控易被刷单/恶意申诉 | ☐ |

> - 第 1–4 项是**原方案已有、本次复核确认**；第 5–8 项是**首轮实测新暴露**；**第 9–13 项是本轮再核代码新发现、原方案与前 8 项都未覆盖**的点。
> - ⚠️ 优先拍：第 4/5/6/7 项（阻塞实施或留 BUG）+ **第 9 项（现有真实资损 BUG：纠纷"退款"根本没退钱）**。
> - **第 9 项最关键**：实测 `resolveDispute(refund=true)` 仅 `order.update({status:'cancelled'})`，**没调用 `BalanceService.unfreeze` 退还买家冻结资产**（代码注释承认"将买家冻结的资产解冻退回"但未实现）。已完成订单的钱已通过 escrow 放给卖家，所以"退款资金从哪出"是必须你定的业务口径，不是纯技术问题。
> - 每项的详细论证见 7.2（项1）、7.3（项2）、7.4（项3）、**7.5（项9–13，本轮新增）**；其余项依据见 0.2 / 三 / 四 节。

### 7.1 拍板项汇总

| 拍板项 | 建议 | 一句话理由 |
|--------|------|------------|
| 1 是否采用方案A（纠纷独立成 `trade_disputes`） | ✅ 采用 | 同业（闲鱼/BUFF/得物）通做；且现表为空，迁移零风险 |
| 2 纠纷是否允许用户自助发起 | ✅ 允许（表先建好，一期可先审核制） | 交易平台标配 |
| 3 `GET /chat/issues` 处置 | ✅ 直接下线删除 | 工单是内部术语，用户不该看到 |
| 4 拍卖争议 `order_type='auction'` 是否纳入纠纷表 | ✅ 纳入（修现网 BUG，需 4 处一起改） | 现在拍卖发起争议必报错（漏事务+漏title+ENUM缺auction+TradeOrder耦合），见 4.3 |
| 5 新表主键命名 | `trade_dispute_id`（建议） | 与后端"全名_id"约定一致；若你更想用 `dispute_id` 请定 |
| 6 `trade_dispute` 审批链模板的层级 | 建议 1 级（高级客服终审），后续可加 | 需你定仲裁审批人角色等级 |
| 7 拍卖争议的订单归属校验 | 建议服务层按 `order_type` 分流（auction 查拍卖表 `winner_user_id`） | 不分流则 auction 误查 `TradeOrder` 仍失败；需你确认拍卖中标人字段口径 |
| 8 自助申诉的「可申诉订单状态」白名单 | 建议沿用交易现有 `completed/frozen`、拍卖 `settled` | 决定用户在哪些订单状态下能发起售后，需你定边界 |

> 拍板项 5、6、7、8 是首轮校准新增、9–13 是本轮再核代码新增，都是原方案未覆盖、需要你明确的点（详见 7.5）。
>
> 📊 **行业怎么做、你为什么该选 A** 的完整横评见 **7.2**：6 类公司（超大平台/二手C2C/虚拟物品交易/游戏公司/活动策划/小公司）逐类展开怎么设计（7.2.1–7.2.2）+ 三方案区别（7.2.3）+ 按你 6 条决策约束打分的决策矩阵（7.2.3 末）+ 与你真实技术栈的绑定论证（7.2.4）。

### 7.2 拍板项1：是否采用方案A（含行业横评：各类公司怎么设计、你该选哪种）

> 这是你最关心的"外面大公司（美团/腾讯/阿里）/小公司/游戏公司/活动策划公司/虚拟物品交易/小众二手平台分别怎么做、我该选哪种"的完整对比。结论先行：**你的项目（担保交易 escrow + C2C 拍卖 auction + 审批链仲裁 + 积分资产冻结 + GM 补偿）在业务形态上 = "游戏虚拟物品交易平台（BUFF/悠悠）" ∩ "二手 C2C（闲鱼/转转）"，所以应采用它们的"纠纷/售后独立强建模"路线，即方案A。**
>
> 下面 6 类公司是按"业务形态"分的，不是按"公司大小"——决定怎么设计客服售后的，**是业务里有没有"钱/资产 + 交易 + 纠纷"，而不是公司规模**。

#### 7.2.1 六类玩家的设计对照表（按业务形态分）

| 业务形态 | 代表 | 客服/售后怎么放 | 纠纷/退款是否独立建模 | 数据建模特征 | 与你的契合度 |
|----------|------|----------------|----------------------|--------------|--------------|
| 超大综合平台 | 阿里/美团/腾讯/京东 | 客服、退款、纠纷、申诉**各自独立子系统**，跨多团队多服务 | 是（独立到「子系统/微服务」级） | 纠纷/售后独立状态机 + 独立资金/风控链路 + 工单中台 | 路线对，体量过重，直接照搬=过度设计 |
| 二手 C2C | 闲鱼/转转/得物 | "申请客服介入"是**订单维度的独立售后流程**；闲鱼有"小法庭"陪审 | 是（独立「售后单 aftersale order」） | 售后单独立于客服会话；举证+时效+裁决 | ★最像你：订单级售后、举证、平台介入 |
| 虚拟物品交易 | 网易BUFF/悠悠有品/Steam市场 | **担保交易**为核心；纠纷=冻结资金+调查+裁决+退款 | 是（独立「纠纷/仲裁」+ 资金冻结状态机） | escrow 托管状态机 + 纠纷调查 + 冻结/解冻 | ★★最像你：你已有 escrow 担保码 + 资产冻结 |
| 游戏公司 | 米哈游/网易游戏/腾讯游戏 | 账号/封号/充值申诉**各自独立**；补偿是**GM 内部工具**（用户不可见） | 是（申诉按类型分流 + 补偿走内部审批） | 申诉工单分类型；补偿/发奖走后台审批 | ★最像你：你已有 GM 补偿 + 审批链 |
| 活动策划/营销 | 活动H5、报名、抽奖类项目 | 客服多为**外包/IM 转人工**；售后≈"退报名费/补发奖品"，弱建模 | 否（多挂在订单备注或工单 type 上） | 活动结束即归档，无长期售后；常用第三方客服 SaaS | 不像你：你是长期运营的资产交易平台 |
| 小公司/早期项目 | 大量中小项目 | 一张"万能工单/反馈表"塞所有问题，靠 `type` 字段区分 | 否（字段重载硬撑）=**你现状 C** | 单表多用、字段重载 | 这是你现在长歪的样子，要拆掉 |

#### 7.2.2 各类公司具体怎么设计（展开说，便于你判断）

**① 超大综合平台（阿里 / 美团 / 腾讯 / 京东）**
- 客服是"中台"，退款、纠纷、申诉、舆情各自是**独立服务**，由独立团队维护，彼此通过消息队列/RPC 协作。
- 纠纷有独立的资金冻结、风控、信用分链路；退款走独立的资金清结算系统。
- 为什么这么重：**日均千万级订单 + 法务合规 + 多 BU**。这是组织规模逼出来的架构，不是技术偏好。
- **你能学的**：纠纷/售后必须独立建模（=A 的核心）。**不能照搬**：拆微服务、上工单中台——你是单体，没那么多团队，照搬就是给自己挖坑。

**② 二手 C2C（闲鱼 / 转转 / 得物）**
- 核心对象是"**售后单 / 退款单（aftersale order）**"，独立于"客服聊天会话"。用户在订单页点"申请售后/客服介入"，生成一张带**举证（图片/描述）+ 处理时效 + 裁决结果**的独立单据。
- 闲鱼的"小法庭"是**陪审团投票**裁决（亿级 C2C 才需要的去中心化降本手段）。
- 得物因为是"先鉴别后发货"，把**鉴别**也做成独立流程节点。
- **这是和你最像的一档**：你也是订单级、需要举证、需要平台介入裁决。

**③ 虚拟物品交易（网易 BUFF / 悠悠有品 / Steam 市场）**
- 一切围绕"**担保交易 escrow**"：买家付款→平台托管资金/资产→卖家发货→买家确认→放款。
- 纠纷 = **冻结那笔托管资金 + 平台调查 + 裁决 + 退款解冻**，是 escrow 状态机的一条分支，天然独立于"售前咨询客服"。
- **这是和你技术形态最像的一档**：你已经有担保码 escrow + 资产冻结，纠纷就该挂在这条资产链路上独立建模。

**④ 游戏公司（米哈游 / 网易游戏 / 腾讯游戏）**
- 玩家侧：账号申诉、封号申诉、充值/掉单申诉**各自独立入口**，按类型分流到不同处理队列。
- 运营侧：**补偿（发奖/补发/邮件）是 GM 内部工具**，玩家完全看不到，且大额补偿走**内部审批**。
- **这是和你运营形态最像的一档**：你已经有 `gm-tools/compensate`（GM 补偿）+ 审批链，正好对齐"补偿是内部工具、用户不可见"。

**⑤ 活动策划 / 营销项目**
- 生命周期短（活动结束就归档），客服常用**第三方 SaaS（如智齿、Udesk）或直接 IM 转人工**。
- 售后弱：退报名费/补发奖品，常挂在订单备注或一张工单 `type` 上，不做独立纠纷建模。
- **不像你**：你是长期运营、有真实资产流转的交易平台，不能用"活动级"的弱建模。

**⑥ 小公司 / 早期项目**
- 一张"万能工单/反馈表"+ `type` 字段塞所有问题（你现状 C 就是这样：`customer_service_issues` 一表当工单+纠纷+仲裁三用）。
- 起步快，但业务一复杂就**字段重载、分支判断满天飞**（你代码里 `issue_type==='trade'` 的分支就是证据），技术债越滚越大。
- **这是你要拆掉的起点，不是终点。**

> 一句话归纳：**①②③④ 都把"纠纷/售后"独立建模（=A）；只有⑤⑥不独立（弱建模/单表重载）。** 你的业务里有钱、有资产、有交易、有纠纷，属于前者，必须独立建模。

#### 7.2.3 三种方案的本质区别（同一件事的三种活法）

| 维度 | 方案A 多表分离（本方案） | 方案B 单表 service_requests + type | 方案C 三表保留只划边界（现状） |
|------|--------------------------|------------------------------------|-------------------------------|
| 谁这么做 | 闲鱼/转转/得物/BUFF/悠悠/米哈游/美团 | Zendesk/Intercom/Salesforce/Jira/GitHub | 早期小团队、活动策划项目 |
| 核心思想 | 按业务类型拆表，各有独立状态机 | 一张大表抽象"服务请求"，用 type 区分 | 三张表都在，但职责仍重叠 |
| 纠纷能力 | 强（举证/仲裁/退款/审批链一等公民） | 中（要靠 type+扩展字段硬撑） | 弱（塞在工单表里，分支判断满天飞） |
| 长期维护成本 | **低**（边界清晰，改一处不影响其他） | 中（抽象层厚，牵一发动全身） | 高（语义重叠，越改越乱） |
| 技术债 | **最少** | 中（通用性换来的复杂度对你是浪费） | 最多（你现在就在还这个债） |
| 对你是否过度设计 | 否（刚好匹配你的交易业务） | **是**（你不是做通用客服 SaaS，违反 YAGNI/KISS） | —（这是起点不是终点） |
| 改造量（你现状） | 中（现表 0 行，拆正成本低） | 大（要重构整套服务请求抽象） | 0（但问题不解决） |

> **按你给的 6 条决策约束逐条打分**（你的原话：未上线、愿一次性投入、不兼容旧接口、长期维护成本低、降低技术债、贴合现有技术栈）：

| 你的约束 | 方案A | 方案B | 方案C |
|----------|-------|-------|-------|
| 项目未上线（现表 0 行，是拆正窗口） | ✅ 完美契合，零数据迁移风险 | △ 也能做但工程量大 | ✅ 无需动 |
| 愿一次性投入大量成本 | ✅ 一次拆正到位 | ✅ 但投入花在"造通用抽象"上不划算 | ❌ 等于没投入 |
| 不兼容旧接口、不留兼容层 | ✅ 直接换表换字段、前端改用后端字段名 | ✅ 但要重写更多 | ❌ 旧问题原样保留 |
| 长期维护成本低 | ✅ 边界清晰，最低 | △ 抽象层厚，中等 | ❌ 越改越乱，最高 |
| 降低技术债 | ✅ 最少 | △ 通用性换来的复杂度对你是新债 | ❌ 债最多 |
| 贴合现有技术栈（Express+Sequelize+审批链+escrow+GM补偿） | ✅ 全部复用，零新依赖 | ❌ 要造"服务请求"抽象，偏离现有骨架 | ✅ 但不解决问题 |
| **结论** | **6/6 命中你的约束** | 部分命中、性价比低 | 不解决问题 |

> 6 条约束 A 全中——这不是"A 恰好不错"，而是**你给的约束本身就指向 A**（未上线+愿投入+不要兼容+降债 = 教科书级的"一次拆正"场景）。

#### 7.2.4 为什么 A 最适合你（绑定你的真实技术栈与业务）

实测你的后端**已经具备交易平台的全套基础设施**，这正是 BUFF/闲鱼那条路线的底座，照搬 A 几乎是"顺着现有骨架长肉"：

- **担保交易（escrow）**：`routes/v4/marketplace/escrow.js` 已实现"买方付款→资产冻结→担保码确认收货→放款给卖方"（`POST /trade-orders/:id/confirm-delivery`、`escrow-status`、`cancel`），与 BUFF 担保交易模型一致 → 纠纷天然需要"冻结期举证+平台裁决+退款解冻"，必须独立强建模。
- **拍卖（auction）**：`models/AuctionListing.js`/`AuctionBid.js` + `routes/v4/marketplace/auctions.js` 已有 `POST /:id/dispute` 买方发起争议入口 → 证明"用户自助发起纠纷"是你产品既定方向（只是现在因 4 重 BUG 跑不通，见 0.2/4.3）。
- **审批链（approval_chain）**：`services/ApprovalChainService.js` + `approval_chain_*` 表已上线，**实测有 98 条真实实例**在跑 → 仲裁流程直接复用，不用造轮子（这是大平台才有的能力，你已经有了）。
- **GM 补偿工具**：`routes/v4/console/customer-service/gm-tools.js`（`POST /gm-tools/compensate`）+ `services/CustomerServiceCompensateService.js`（注册名 `cs_compensate`）已存在，补偿记录写入 `customer_service_issues.compensation_log` → 对齐"游戏公司补偿是内部工具、用户不可见"的做法。
- **资产/积分体系**：退款=解冻/退还积分资产，已有事务管理 `TransactionManager` 兜底。

> 一句话：**B 是给"做客服工具卖给别人"的公司用的；你是"自己做交易平台"，纠纷就是核心业务，必须像 BUFF/闲鱼那样把它当一等公民独立建模 = A。** 你已有 escrow + 拍卖 + 审批链 + GM 补偿，A 是把这些已有能力串成完整售后闭环，而不是新增一套抽象。

#### 7.2.5 不照搬大厂的部分（避免过度设计）

- **不做闲鱼"小法庭"第三方投票仲裁**：那是亿级 C2C 才需要的去中心化裁决，你用"客服审核 + 审批链仲裁"足够，YAGNI。
- **不拆微服务**：阿里/美团是多服务多团队；你是单体 Express + Sequelize，纠纷独立成表 + 独立 Service 即可，不需要拆独立服务进程。
- **不引入工作流引擎**：你已有 `approval_chain`，不需要再上 Camunda/Activiti 之类重型引擎。

> 即"路线学 BUFF/闲鱼，规模和复杂度匹配自己"——这恰好是"长期维护成本低、技术债最少"的解。

#### 7.2.6 结论

**建议采用 A。** 本项目是带交易市场的平台，纠纷天然有举证/仲裁/退款/审批链（现有 `customer_service_issues` 的 `dispute_evidence`/`approval_chain_instance_id` 即证据）。**且现表 0 行，是一次拆正、零数据风险的最佳窗口。**

### 7.3 拍板项2：是否允许用户自助发起

**建议允许。** 交易平台标配：用户对问题订单举证申诉，客服审核/仲裁。若初期客服人手紧，可一期"用户提交→客服审核受理"（用 `status='reviewing'`），二期开全自助；**但表结构现在就按"支持自助"建**（`created_by` 兼容 user/客服），不留二次改表。

### 7.4 拍板项3：`GET /system/chat/issues` 处置

**建议直接下线删除**，由 `/system/disputes/my` + 现有"我的反馈"替代。用户不需要懂"工单"，他要的是"我反馈的事/我申诉的订单到哪一步了"。

### 7.5 拍板项 9–13（本轮再核代码新发现，原方案与前 8 项均未覆盖）

#### 7.5.1 拍板项9 ⚠️：纠纷退款的资金语义（现有真实资损 BUG）

实测 `services/TradeDisputeService.js` 的 `resolveDispute(refund=true)`：

```js
if (refund && order) {
  // 注释写：将买家冻结的资产解冻退回   ← 实际没做
  await order.update({ status: 'cancelled' }, { transaction })   // 只改了订单状态
  refundResult = { ..., refunded: true }                          // 却返回 refunded:true
}
```

**问题**：它**只把订单状态改成 `cancelled`，从未调用 `BalanceService.unfreeze` 真正退还买家资产**——而同项目 `TradeOrderService.cancelOrder` 是规范地解冻的（`BalanceService.unfreeze` + 派生幂等键 + 双录记账）。所以纠纷"退款成功"是假的，上线即资损/客诉。

**这不是纯技术 bug，背后有你必须定的业务口径**：纠纷发起时订单可能是 `frozen`（钱还冻着）或 `completed`（钱已通过 escrow 放给卖家）：
- `frozen` 订单退款 → 直接 `unfreeze` 退回买家（可复用 `cancelOrder` 逻辑）。
- `completed` 订单退款 → 钱已在卖家手里，**退款资金从哪出？** 三个选项需你拍：
  - (a) 向卖家追回（卖家余额扣回，卖家余额不足时怎么办？）
  - (b) 平台垫付（平台账户出，记一笔平台损失）
  - (c) 不支持已完成订单退款，只做"协商/补偿"（用现有 GM 补偿工具发补偿，不动原单资金）

> 建议：一期先支持 `frozen` 订单走 `cancelOrder` 真解冻；`completed` 订单退款用 (c) GM 补偿过渡，把 (a)/(b) 留作二期。但**最终口径要你定**。

#### 7.5.2 拍板项10：纠纷状态变更是否通知用户

实测 `NotificationService` 对挂牌撤回/超时、竞拍落选、兑换驳回等**都有通知**，但**纠纷流程无任何通知**（grep 无 dispute/纠纷）。自助申诉的用户会期待"受理了吗/进展到哪/结果如何"。

> 建议：在 `createDispute`/受理/`escalateToArbitration`/`resolveDispute` 四个节点接 `NotificationService` 推站内信；实时 WebSocket（`ChatWebSocketService`）可选。需你确认是否做、做哪几个节点。

#### 7.5.3 拍板项11：超时是否自动升级仲裁

`trade_disputes.deadline`（旧 `dispute_deadline`，默认 7 天）字段在，但 `escalateToArbitration` 现在**只能人工触发**，`jobs/` 下无任何纠纷定时任务。

> 建议：一期人工升级；二期用项目已有的 `node-cron` 体系加"超时未处理→自动升级/告警"任务。需你定一期是否就要自动化。

#### 7.5.4 拍板项12：操作角色等级是否沿用

实测 `routes/v4/console/customer-service/disputes.js` 现状：查看 `requireRoleLevel(1)`、解决 `requireRoleLevel(50)`、升级仲裁 `requireRoleLevel(100)`、管理员代发起 `requireRoleLevel(50)`。换表后路径方法不变，这些等级默认沿用。

> 建议：沿用现值。若你对"谁能终裁退款"有更严要求（如退款必须 Lv100），现在一并定。

#### 7.5.5 拍板项13：自助申诉防滥用阈值

现有 `createDispute` 只挡"同订单已有未关闭纠纷"，无频率/次数限制。项目在兑换退款已有先例：`exchange/refund_cooldown_hours`、`exchange/refund_monthly_limit`、`exchange/refund_approval_threshold`（见 `services/exchange/CoreService.js`）。

> 建议：自助开放时复用同款"冷却 + 月限 + 大额转审"风控范式，阈值由你定（或一期先不限、仅记录，二期再收紧）。

#### 7.5.6 行业横评：项9（纠纷退款资金）各类公司怎么做、你该选哪种

> 第 9 项是这 5 个新拍板点里最值钱的一个，**也是各类平台差异最大的地方**——退款资金"从哪出、何时出、谁兜底"直接决定平台资损与信任模型。下面按业务形态对照，并落到你"未上线/愿投入/降技术债/贴现有技术栈"的约束上。

| 业务形态 | 代表 | 退款资金怎么出 | 兜底方 | 与你的契合 |
|----------|------|----------------|--------|------------|
| 超大综合平台 | 阿里/美团/京东 | **担保交易期内→平台托管资金原路退**；已确认收货→走"仅退款/退货退款"独立资损流程，平台先垫付再向卖家追偿 | 平台垫付 + 风控向卖家追偿 | 路线对，但"先垫付后追偿"需独立资金/风控系统，你单体先别上 |
| 二手 C2C | 闲鱼/转转/得物 | **未确认→原路退**；已确认有纠纷→平台介入裁决，判退则从卖家可用余额扣回/冻结，不足走平台风险金 | 卖家为主、平台风险金兜底 | ★最像你：你也有买卖双方余额账户，可"判退扣卖家" |
| 虚拟物品交易 | BUFF/悠悠/Steam市场 | 全程 **escrow 托管**：放款前纠纷→解冻原路退买家；放款后→冻结卖家对应金额调查后处置 | escrow 托管金 + 卖家余额 | ★★最像你：你已有 escrow 担保码 + 冻结/解冻双录 |
| 游戏公司 | 米哈游/网易 | 充值/掉单→原路退或**发等值补偿（道具/货币）**；多数争议用"补偿"而非"退现金" | 平台（补偿是虚拟资产，成本低） | ★像你：你有 GM 补偿 + 积分资产，可"补偿替退款" |
| 活动策划/营销 | 活动H5 | 退报名费走原支付渠道退回，弱建模 | 主办方 | 不像你 |
| 小公司/早期 | 大量中小项目 | 常**只改单状态不真退钱**（=你现在的 BUG），或人工手动转账 | 无（埋雷） | 你现状，要修掉 |

**结论（绑定你的真实技术栈）**：你= escrow + 双录记账 + 积分资产 + GM 补偿，**最该走"BUFF/闲鱼"那条**：
- **放款前（订单 `frozen`）**：纠纷判退 → 复用 `TradeOrderService.cancelOrder` 的 `BalanceService.unfreeze` **原路解冻退买家**（技术现成、零新依赖、双录平账）。
- **放款后（订单 `completed`，钱已给卖家）**：一期用**游戏公司式"补偿替退款"**——走现有 `gm-tools/compensate` 发等值积分补偿，**不动原单资金**（避免现在就建"向卖家追偿"的重型资金流）；二期再视体量上"扣卖家余额/平台风险金"的闲鱼式追偿。
- **不照搬大厂**："先垫付后追偿 + 独立资损系统"是平台级体量才需要的，对你属过度设计（违反 YAGNI），用 escrow 原路退 + GM 补偿过渡即可。

> 一句话：**项9 选"escrow 原路退（放款前）+ GM 补偿过渡（放款后）"**——这条 100% 落在你现有技术栈内、零新依赖、长期可平滑升级到闲鱼式追偿，是"维护成本低 + 技术债最少"的解。其余 项10–13 都是"复用现有 NotificationService / node-cron / requireRoleLevel / 兑换退款风控范式"，本质都是**沿用你后端既有能力**，不引入任何新框架。

## 八、对各前端项目的影响

| 前端 | 技术栈（实测） | 影响 | 对接动作 |
|------|----------------|------|----------|
| Web 管理后台（`admin/`） | Vite 6 + Alpine.js 3 + Tailwind 3 + socket.io-client | 客服工作台「纠纷」Tab 数据源由工单表改 `trade_disputes`；字段 `issue_id`→`trade_dispute_id` | 端点路径不变；仅清理 `cs-user-context.js`(349/352/361/377 行)/`customer-service.html`(796/799 行) 纠纷列的字段兜底，直接用 `trade_dispute_id`（修 P7）；**内部工单列（339/827/904 行）保持 `issue_id` 不动** |
| 后端拍卖入口（`routes/v4/marketplace/auctions.js`） | Express 4（后端，非前端） | 争议入口需补事务/title 才能跑通（P4-a/b） | 见 4.3、步骤7（这是后端改动，不是前端对接动作） |
| 微信小程序 | （独立仓库，不在本工作区） | 不再有"工单"；新增"在线客服+意见反馈+我的售后申诉"三入口 | 移除 `GET /system/chat/issues` 调用；按第四节对接 `POST/GET /system/disputes*`，直接用后端字段名 |

> 小程序与 admin 均**以后端字段为准、直接改用后端字段名，不做映射兼容**（符合项目"后端是数据权威来源"原则）。

## 九、方案选型依据（为何选 A 而非 B/C）

- **方案A（本方案，多表分离）**：闲鱼/转转/得物/BUFF/米哈游/美团等带交易平台采用。纠纷强建模、边界清晰，与本项目最贴合，且**现表为空、一次拆正成本最低**。
- **方案B（单表 `service_requests` + type 统一）**：Zendesk/Intercom/Salesforce/Jira 等通用客服 SaaS 采用。抽象厚，对本项目属过度设计（违反 YAGNI/KISS）。
- **方案C（三表保留只划边界）**：本项目现状。治标不治本，纠纷能力弱。

**结论**：从现状 C 迁移到 A，是把长歪的 `customer_service_issues` 拆正。借助"现表 0 行 + 项目未上线 + 愿一次性投入"三个有利条件，长期维护成本与技术债最低。

---

> 本文档为方案设计，已用 Node.js 直连真实库 `restaurant_points_dev` 及通读后端/admin 实际代码完成对齐复核（含本次新增修正：feedbacks 枚举、拍卖争议 4 重 BUG、compensation_log 保留、审批链 98 实例、纠纷退款资损 BUG），但**未改动任何代码或数据库**。实施前须获得项目负责人对第七节 **13 个拍板项**（见 7.0 勾选清单）的明确批准。
