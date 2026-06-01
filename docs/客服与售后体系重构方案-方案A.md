# 客服与售后体系重构方案（方案A：业务分层 / 多表分离）

> **状态：📋 待评审（未实施）**
> **创建日期：2026-06-02**
> **适用范围：后端数据库项目（Node.js + Express + Sequelize + MySQL + Redis + Socket.io）**
> **决策性质：涉及数据库表结构调整，实施前需项目负责人书面批准**

## 一、本方案要解决的问题（先说清楚问题）

当前后端已经长出了**三套语义重叠**的"用户问题"系统，且其中一套被当成三种东西混用，导致边界模糊、维护成本高、易出 bug。

### 1.1 现状三套系统

| 系统 | 数据表 | 谁发起 | 形态 | 用户能否看到 |
|------|--------|--------|------|--------------|
| 意见反馈 | `feedbacks` | 用户 | 异步留言+回复 | 能（看自己的+回复） |
| 在线客服会话 | `customer_service_sessions` | 用户 | 实时 IM（Socket.io） | 能（聊天+满意度评分） |
| 客服工单 | `customer_service_issues` | **客服后台**（`created_by`=管理员） | 内部问题跟踪 | 只读（`GET /chat/issues`） |

### 1.2 三个核心问题

**问题1：`feedbacks` 与 `customer_service_issues` 语义重叠**
两张表都有 `priority`（优先级）、`status`（状态生命周期）、回复/处理结果字段。`customer_service_issues` 甚至有一个 `issue_type='feedback'` 的枚举值，表示"反馈升级成工单"——两者职责边界模糊，客服和开发都难以判断一个问题该进哪张表。

**问题2：`customer_service_issues` 一张表当三种东西用**
该表同时承载了：
- 普通内部工单（`issue_type` = asset/lottery/item/account...）
- 交易纠纷（`dispute_type`、`dispute_evidence`、`dispute_deadline`）
- 仲裁流程（`approval_chain_instance_id`）

交易纠纷有举证、仲裁、退款、审批链等独立且复杂的状态机，把它塞进通用工单表，导致大量 `if (issue_type === 'trade')` 的分支判断，逻辑分散难维护。

**问题3：内部概念"工单"对用户暴露**
`GET /api/v4/system/chat/issues` 让小程序用户能看到"工单"。但工单是**客服内部跟踪工具**（由管理员创建），"工单"是运营术语而非用户语言。用户关心的是"我反馈的问题处理得怎样了"，不需要理解工单/会话/反馈的区别。暴露工单会造成用户认知负担和渠道混乱。

### 1.3 问题归纳（纯文本数据流图）

```
现状（问题态）
──────────────────────────────────────────────────────────
feedbacks（反馈）          ┐
  priority/status/reply    ├─ 语义重叠：都有优先级+状态机+回复
customer_service_issues    ┘
  ├─ 普通工单              ┐
  ├─ 交易纠纷(dispute_*)    ├─ 一表三用：通用工单表硬扛纠纷+仲裁
  └─ 仲裁(approval_chain)  ┘
        │
        └─ GET /chat/issues ──► 小程序（内部"工单"概念泄漏给用户）
──────────────────────────────────────────────────────────
```

**目标**：让交易纠纷做回交易纠纷（用户可见的售后流程），让工单退回纯内部跟踪工具（用户不可见），让反馈保持轻量异步留言。三者各就各位。

## 二、方案A 目标架构（业务分层 / 多表分离）

### 2.1 核心思想

按**业务类型分表**，区分"用户可见层"和"内部处理层"。这是闲鱼、转转、得物、BUFF、米哈游等**带交易的平台型业务**的通用做法（与本项目业务形态最贴合）。

```
纯文本：方案A 目标架构
──────────────────────────────────────────────────────────
   用户可见层（业务语言）              内部处理层（运营语言）
   ─────────────────────             ─────────────────────
   ① 在线客服会话 (IM)      ┐
   ② 意见反馈 (Feedback)    ├──聚合──► 工单 (Issue)    ← 纯内部
   ③ 交易售后申诉 (Dispute) ┘          补偿 (GM工具)   ← 纯内部
──────────────────────────────────────────────────────────
铁律：用户只看到"会话/反馈/售后进度"，永远看不到"工单"二字。
     工单是客服把多来源问题聚合、跨班次跟踪的内部把手。
```

### 2.2 四张表的职责边界（重构后）

| 表 | 定位 | 谁发起 | 用户可见 | 状态机 |
|------|------|--------|----------|--------|
| `feedbacks` | 意见反馈（轻量异步留言） | 用户 | 是（看自己+回复） | pending→processing→replied→closed |
| `customer_service_sessions` | 在线客服会话（实时 IM） | 用户 | 是（聊天+评分） | waiting→assigned→active→closed |
| `trade_disputes`（新拆出） | 交易售后申诉 | **用户**（可自助）/客服 | 是（看进度+举证） | open→reviewing→arbitrating→resolved/rejected |
| `customer_service_issues`（瘦身） | 内部工单（聚合跟踪） | 客服 | 否 | open→processing→resolved→closed |

### 2.3 关键变化

1. **拆**：`customer_service_issues` 中的纠纷/仲裁字段（`dispute_type`/`dispute_evidence`/`dispute_deadline`/`approval_chain_instance_id`）独立成 `trade_disputes` 表，纠纷成为一等公民。
2. **瘦身**：`customer_service_issues` 只保留"内部工单"职责，可引用 `feedback_id`/`session_id`/`dispute_id` 做聚合。
3. **下线**：删除 `issue_type` 中的 `feedback`/`trade` 重载语义；工单不再对小程序暴露。

## 三、数据库结构变更详情

> ⚠️ 以下变更涉及表结构调整，须经批准后通过 Sequelize 迁移（`npm run migration:create`）执行，禁止手写 SQL 直接改库。

### 3.1 新建表 `trade_disputes`（交易售后申诉）

主键：`dispute_id`（BIGINT 自增）。字段从现有 `customer_service_issues` 的纠纷相关列迁移而来，并补齐用户自助申诉所需字段：

| 字段 | 类型 | 说明 |
|------|------|------|
| `dispute_id` | BIGINT PK | 申诉主键 |
| `user_id` | INT | 申诉人（买家） |
| `order_type` | ENUM(trade/redemption/consumption) | 关联订单类型 |
| `order_id` | VARCHAR(64) | 关联订单ID（多态） |
| `dispute_type` | ENUM(item_not_received/item_mismatch/quality_issue/fraud/other) | 纠纷类型 |
| `title` / `description` | STRING/TEXT | 申诉标题/描述 |
| `evidence` | JSON | 证据（截图URL数组等） |
| `status` | ENUM(open/reviewing/arbitrating/resolved/rejected) | 申诉状态机 |
| `assigned_to` | INT | 处理客服（内部） |
| `approval_chain_instance_id` | BIGINT | 仲裁审批链实例 |
| `deadline` | DATE | 处理截止（超时升级） |
| `resolution` / `resolved_at` | TEXT/DATE | 处理结果/时间 |

### 3.2 改造表 `customer_service_issues`（瘦身为纯内部工单）

**移除**以下纠纷/仲裁专用列（迁移到 `trade_disputes`）：
- `dispute_type`、`dispute_evidence`、`dispute_deadline`、`approval_chain_instance_id`

**调整** `issue_type` 枚举：移除 `trade`（归 `trade_disputes`）与 `feedback`（反馈不再升级为工单类型）。

**新增**聚合引用列（可选，便于工单关联来源）：
- `feedback_id` BIGINT NULL — 引用 `feedbacks`
- `dispute_id` BIGINT NULL — 引用 `trade_disputes`
- （`session_id` 已存在，保留）

### 3.3 数据迁移

1. 将现有 `customer_service_issues` 中 `issue_type='trade'` 且含 `dispute_*` 的记录，迁移到新表 `trade_disputes`。
2. 迁移后删除原表的纠纷列。
3. 提供完整 `up`（迁移）与 `down`（回滚）方法，迁移前用 `verify-migrations.js` 校验。
4. 真相库：`.env` 指定的 `restaurant_points_dev`（连真实库，不动备份文件）。

> 外键策略：`trade_disputes.user_id` → `users.user_id` 用 RESTRICT 保护；`order_id` 为多态值，不加物理外键（与现有工单一致）。

## 四、API 与路由变更

### 4.1 C 端（小程序，`/api/v4/system`）

| 操作 | 端点 | 变更 |
|------|------|------|
| 提交反馈 | `POST /system/feedback` | 不变 |
| 我的反馈 | `GET /system/feedback/my` | 不变 |
| 客服会话/消息/评分 | `POST/GET /system/chat/sessions/*` | 不变 |
| **我的工单** | `GET /system/chat/issues` | **下线**（工单不再对用户暴露） |
| **发起售后申诉** | `POST /system/disputes`（新增） | 用户对订单自助发起 |
| **我的售后列表** | `GET /system/disputes/my`（新增） | 用户看自己的申诉进度（脱敏） |
| **售后详情** | `GET /system/disputes/:id`（新增） | 仅本人可见，脱敏 |

### 4.2 管理端（`/api/v4/console/customer-service`）

- `disputes/*` 路由从"读 `customer_service_issues`"改为"读 `trade_disputes`"，服务层 `TradeDisputeService` 同步改表。
- `issues/*` 路由保留，但只处理瘦身后的内部工单。
- 写操作仍走 `ServiceManager` 取 Service + `TransactionManager` 管事务（不变）。

### 4.3 数据脱敏（发给小程序的敏感字段控制）

售后申诉下发给小程序时，**禁止**返回以下内部字段（通过 `DataSanitizer` 'public' 级别过滤）：
- `assigned_to`（处理客服ID）、`approval_chain_instance_id`（仲裁审批链）
- 内部备注类字段、其他用户的 `user_id`/手机号

用户端只下发：申诉状态、纠纷类型、自己提交的证据、处理结果摘要（`resolution`）、时间。

## 五、实施清单（一次到位，不留兼容层）

按项目规则"不兼容旧接口、旧路由直接删除、全链路同步修改"执行：

- [ ] 1. 新建模型 `models/TradeDispute.js`（完整字段+索引+关联+中文注释）
- [ ] 2. 创建迁移：建 `trade_disputes` 表 + 数据迁移 + 删 `customer_service_issues` 纠纷列（含 down 回滚）
- [ ] 3. 改造 `CustomerServiceIssue.js`（移除纠纷字段、调整枚举、加聚合引用列）
- [ ] 4. 改造 `TradeDisputeService.js`（改读写 `trade_disputes`；支持用户自助发起）
- [ ] 5. 新增 C 端路由 `routes/v4/system/disputes.js`（发起/列表/详情）
- [ ] 6. 下线 `GET /system/chat/issues`，调整 `CustomerServiceIssueService.getUserIssues`
- [ ] 7. 管理端 `disputes/*`、`issues/*` 路由与服务对齐新表
- [ ] 8. `ServiceManager` 注册校验、ESLint、Jest+SuperTest、健康检查全过
- [ ] 9. 同步更新所有相关注释/JSDoc，与新结构一致

## 六、需项目负责人拍板的事项

以下涉及后端数据库结构与业务规则，按项目规则须经明确批准后才实施。每项附"行业做法对比 + 建议"作为决策依据。

### 6.1 拍板项汇总（建议一览）

| 拍板项 | 建议 | 一句话理由 |
|--------|------|------------|
| 1 是否采用方案A | ✅ 采用 | 同业（闲鱼/BUFF/得物）都这么做，最契合带交易的平台 |
| 2 纠纷是否用户自助发起 | ✅ 允许（表先建好，可一期先审核制） | 交易平台标配 |
| 3 `GET /chat/issues` 处置 | ✅ 直接下线 | 工单是内部术语，用户不该看到 |

<!-- DECISION1 -->
### 6.2 拍板项1：是否采用方案A（纠纷独立成 `trade_disputes`）

```
纯文本：各类公司怎么放"交易纠纷"
──────────────────────────────────────────────────────────
公司类型              做法
──────────────────────────────────────────────────────────
阿里/美团/腾讯        纠纷·退款·申诉=独立强流程·独立表·独立状态机
(大平台)             有资金/法律风险，绝不和"意见反馈"混表
闲鱼/转转/得物        "申请客服介入"是订单维度的独立售后流程 ★最像你
BUFF/悠悠(虚拟交易)   纠纷有举证+仲裁+退款，独立于普通客服    ★最像你
游戏公司(米哈游/网易) 账号/封号/充值申诉各自独立；补偿是GM内部工具
小公司/活动策划       通常不做纠纷，或塞进万能表凑合 = 本项目现状
──────────────────────────────────────────────────────────
```

**建议：采用 A。** 本项目是带交易市场的平台，纠纷天然有举证/仲裁/退款/审批链（现有 `customer_service_issues` 表里的 `dispute_evidence`/`approval_chain_instance_id` 即为证据）。与本项目业务最像的闲鱼/BUFF/得物均采用独立纠纷表。结合"愿一次性投入、不要兼容、要长期低维护"的要求，A 一次拆正、最契合。

<!-- DECISION2 -->
### 6.3 拍板项2：交易纠纷是否允许用户自助发起

```
纯文本：谁能发起纠纷
──────────────────────────────────────────────────────────
做法              代表                  特点
──────────────────────────────────────────────────────────
用户自助发起 ★    闲鱼/转转/得物/淘宝    用户对订单点"申请介入"，传证据
(主流)            BUFF/悠悠              客服仅介入处理，不代发起
仅客服代发起      传统电话客服/早期平台   用户来电→客服帮建单
(过时)                                  本项目现状(requireRoleLevel 50)
──────────────────────────────────────────────────────────
```

**建议：允许用户自助发起。** 这是交易平台标配——用户自己对问题订单举证申诉，客服只负责审核/仲裁，效率与体验更好。代价是新增 C 端接口 + 权限调整（见第四节）。若初期客服人手紧，可**一期先做"用户提交→客服审核受理"**，二期再开全自助；但**表结构现在就按"支持自助"建**，不留二次改表。

<!-- DECISION3 -->
### 6.4 拍板项3：`GET /system/chat/issues`（用户看工单）如何处置

```
纯文本：用户端要不要"工单"概念
──────────────────────────────────────────────────────────
做法                  代表              特点
──────────────────────────────────────────────────────────
不暴露"工单"，改叫     美团/阿里/米哈游  用户只看"我的反馈/我的售后进度"
"我的反馈/售后进度"★  几乎所有大厂      工单纯内部，用户语言≠运营术语
暴露"工单/ticket"     Zendesk/Jira等    给企业内部IT用，普通C端不用
                     SaaS工具          本项目不属于此类
──────────────────────────────────────────────────────────
```

**建议：直接下线 `GET /chat/issues`，由 `/system/disputes/my` + 现有"我的反馈"替代。** 用户不需要懂"工单"，他要的是"我反馈的事/我申诉的订单"到哪一步了。这与全行业一致。

### 6.5 三项共同内核

三项本质同一件事：**让交易纠纷做回用户可见的售后流程，让工单退回纯内部工具**。这是带交易的平台型业务的标准活法，长期维护成本最低、技术债最少。


## 七、对各前端项目的影响

| 前端 | 影响 | 对接动作 |
|------|------|----------|
| Web 管理后台（`admin/`） | 客服工作台"纠纷"Tab 数据源从工单改为 `trade_disputes` | 调整纠纷相关 `*_ENDPOINTS` 指向新接口；字段以后端为准 |
| 微信小程序 | 不再出现"工单"；新增"在线客服+意见反馈+我的售后申诉"三入口 | 按本文档第四节接口对接，售后申诉为新页面 |

> 小程序前端拿本文档对接：用户问题统一走"在线客服 / 意见反馈 / 交易售后申诉"三个业务化入口，**不出现"工单/issue"字样**。

## 八、方案选型依据（为何选 A 而非 B/C）

- **方案A（本方案，多表分离）**：闲鱼、转转、得物、BUFF、米哈游、美团等带交易的平台型业务采用。纠纷强建模、边界清晰，与本项目业务最贴合。
- **方案B（单表 `service_requests` + type 统一）**：Zendesk、Intercom、Salesforce、GitHub、Jira 等通用客服/协作 SaaS 工具采用。抽象厚、通用性强，但对本项目具体业务属过度设计（违反 YAGNI/KISS）。
- **方案C（三表保留只划边界）**：早期/小团队的自然演进态，也是本项目现状。治标不治本，纠纷能力弱。

**结论**：项目当前处于 C（现状），目标迁移到 A（交易平台标准）。从 C→A 是把长歪的 `customer_service_issues` 拆正，改造量可控，长期维护成本最低。

---

> 本文档仅为方案设计，未改动任何代码或数据库。实施前须获得项目负责人对第六节三项的明确批准。
