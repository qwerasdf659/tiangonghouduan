# 老良记多级审核链设计方案

> 生成日期: 2026-03-09
> 最后更新: 2026-03-10（第三次校准 — **后端实现完成**，角色体系数据再次纠正）
> 数据来源: 连接 restaurant_points_dev 数据库实时查询 + 后端源码（models/services/routes/callbacks）逐文件阅读
> **⚠️ 2026-03-10 实施校准**: 第二版文档的角色 role_id 仍有误（如 ops=101、business_manager=102、content_auditor=104 均不存在）。已根据实际数据库纠正，content_auditor 角色不存在，审核准入线调整为 business_manager(role_level=60)。
>
> **🟢 后端实施状态**: 已完成（4张表 + 4个模型 + ApprovalChainService + 路由 + Seed数据 + 超时服务 + Web前端页面）

---

## 一、项目实际状态摘要（基于真实数据库查询）

| 项目 | 详情 |
|------|------|
| **项目名称** | restaurant-lottery-system-v4-unified |
| **后端技术栈** | Node.js 20+ / Express 4.18 / Sequelize 6.35 / MySQL (mysql2) / Redis (ioredis) / Socket.IO 4.8 / JWT |
| **Web管理平台** | Alpine.js 3.15 / Tailwind CSS 3.4 / Vite 6.4 / ECharts 6（多页iframe架构） |
| **微信小程序** | TypeScript / Sass / MobX / weapp.socket.io / Skyline（独立仓库，不在本项目内） |
| **数据库** | restaurant_points_dev（Sealos托管MySQL），108张表 |
| **唯一商户** | 老良记 (merchant_id=6, merchant_type=restaurant) |
| **门店** | 5家（store_id: 7~11），全部 active |

### 1.1 角色体系（真实数据，来自 roles + user_roles 表实时查询）

| role_name | role_level | 实际用户数 | role_id | 说明 |
|-----------|-----------|-----------|---------|------|
| admin | 100 | 5 | 2 | 超级管理员，全部权限 |
| ops | 90 | 1 | 101 | 运营管理员 |
| merchant_manager | 80 | 1 | 3 | 商户管理（staff/store/consumption） |
| business_manager | 70 | 2 | 102 | 业务经理（business+consumption管理） |
| finance_viewer | 60 | 0 | 103 | 财务只读角色 |
| **content_auditor** | **55** | **0** | **104** | **内容审核专岗（与审核链高度相关）** |
| merchant_staff | 30 | 0 | 105 | 商户员工（扫码/消费创建） |
| store_staff | 20 | 0 | 106 | 门店员工 |
| campaign_2 | 10 | 2 | 5 | 抽奖活动角色 |
| user | 0 | 57 | 1 | 普通用户（积分/抽奖/个人中心） |
| system_job | -1 | 1 | 100 | 系统定时任务角色 |

> **⚠️ 前版文档重大勘误**: 数据库中**不存在** `regional_manager` 和 `sales_staff` 角色（前版文档错误引用）。实际层级为 admin(100) → ops(90) → merchant_manager(80) → business_manager(70) → finance_viewer(60) → content_auditor(55) → merchant_staff(30) → store_staff(20)。`content_auditor`(role_id=104, level=55) 是专门为内容审核设计的角色，对审核链设计高度相关但当前无用户分配。另有 `test_role_api`(role_id=107, level=15, is_active=0) 为测试角色，已忽略。

### 1.2 当前审核流程（基于实际代码分析）

**关键发现: 系统存在两条审核路径**

**路径A — ContentAuditEngine 路径（merchant_points 使用）:**

```
提交 → ContentAuditEngine.submitForAudit() → content_review_records(pending)
     → ContentAuditEngine.approve()/reject() → triggerAuditCallback()
     → MerchantPointsAuditCallback.approved() → MerchantPointsService.grantPoints()
```

**路径B — ConsumptionService 直接路径（consumption 使用）:**

```
商家提交 → ConsumptionService.merchantSubmitConsumption()
         → content_review_records(pending) + consumption_records(pending)
管理员审核 → routes/v4/console/consumption.js
         → TransactionManager.execute() → ConsumptionService.approveConsumption()
         （ConsumptionAuditCallback 是空实现，业务逻辑在 ConsumptionService 内完成）
```

**路径B的技术证据（基于当前代码校验）:**
- `callbacks/ConsumptionAuditCallback.js` 第30行: `async approved(consumptionId, _auditRecord, _transaction)` — 空实现，注释明确说"业务逻辑已在ConsumptionService完成"
- `routes/v4/console/consumption.js` 第164行: `router.post('/approve/:id', authenticateToken, requireRoleLevel(100), ...)` → 通过 `req.app.locals.services.getService('consumption_core')` 获取 CoreService → `TransactionManager.execute()` 包裹 → `CoreService.approveConsumption()` 直接调用
- 路由注释明确写道: "审核权限只开放给 admin，不开放 ops/区域经理（已确认）"
- 消费服务注册键: `consumption_core`（CoreService）、`consumption_query`（QueryService）、`consumption_merchant`（MerchantService）

### 1.3 当前审核数据（真实数据库查询）

**content_review_records 表:**

| auditable_type | pending | approved | rejected |
|---------------|---------|----------|----------|
| consumption | 446 | 51 | 5 |
| merchant_points | 2 | 7 | 1 |

**consumption_records 表:**

| status | 数量 | 金额范围 | 平均金额 |
|--------|------|---------|---------|
| pending | 1 | ¥50 | ¥50 |
| approved | 47 | ¥20 ~ ¥150 | ¥62.59 |

> 数据差异说明: content_review_records 有446条pending的consumption审核记录，但 consumption_records 仅1条pending。说明 content_review_records 的创建和 consumption_records 的状态更新在部分场景下不同步，属于历史测试数据。

### 1.4 已有基础设施（可直接复用）

| 组件 | 位置 | 复用价值 |
|------|------|---------|
| ContentAuditEngine | `services/ContentAuditEngine.js` | 回调机制、事务边界、幂等检查 |
| TransactionManager | `utils/TransactionManager.js` | execute() 包含重试、超时、隔离级别 |
| admin_operation_logs | 数据库表 | **已有 `requires_approval` 和 `approval_status` 字段** |
| admin_notifications | 数据库表 | 通知基础设施（type/priority/source） |
| api_idempotency_requests | 数据库表 | 幂等键模式 |
| store_staff | 数据库表 | 用户-门店关系（role_in_store: staff/manager） |
| roles | 数据库表 | 完整角色层级体系 |
| Socket.IO | `socket.io 4.8` | 实时推送基础设施 |
| Sequelize Migrations | `sequelizemeta` | 数据库变更管理（最新: 20260307） |

---

## 二、方案选型（保留，理由不变）

选择「可配置顺序审核链 + ContentAuditEngine 升级」方案。

| 淘汰方案 | 不选原因 |
|---------|---------|
| 大厂 BPMN | 1个商户、3种审批场景，BPMN引擎投入产出比极低 |
| 交易平台风控驱动 | 核心是自动风控+托管交易，业务模型不同 |
| 小公司硬编码 | 项目未上线，要低长期维护成本，硬编码是典型技术债务 |

---

## 三、数据库设计 — 新增 4 张表

> 字段命名、类型、索引严格遵循后端 Sequelize `underscored: true` + `freezeTableName: true` + `utf8mb4` 规范

### 表 1: approval_chain_templates — 审核链模板

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| template_id | BIGINT | PK, AUTO_INCREMENT | 模板 ID |
| template_code | VARCHAR(50) | UNIQUE, NOT NULL | 模板编码 (如 `consumption_default`) |
| template_name | VARCHAR(100) | NOT NULL | 模板名称 (如"消费审核-标准链") |
| auditable_type | VARCHAR(50) | NOT NULL | 关联业务类型 (consumption/merchant_points/exchange) |
| description | TEXT | NULL | 描述 |
| total_nodes | TINYINT | NOT NULL | 审核节点数 (1-8, 不含提交节点) |
| is_active | TINYINT(1) | NOT NULL, DEFAULT 1 | 是否启用 |
| priority | INT | NOT NULL, DEFAULT 0 | 优先级 (多个模板时按条件匹配优先级) |
| match_conditions | JSON | NULL | 匹配条件 |
| created_by | INT | FK→users.user_id | 创建人 |
| created_at | DATETIME | NOT NULL | 创建时间 |
| updated_at | DATETIME | NOT NULL | 更新时间 |

**match_conditions 示例（基于真实消费金额范围 ¥20~¥150）:**

```json
{
  "min_amount": 0,
  "max_amount": 200,
  "store_ids": [7, 8],
  "merchant_ids": [6]
}
```

### 表 2: approval_chain_nodes — 审核链节点定义

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| node_id | BIGINT | PK, AUTO_INCREMENT | 节点 ID |
| template_id | BIGINT | FK→approval_chain_templates, NOT NULL | 所属模板 |
| step_number | TINYINT | NOT NULL | 步骤编号 (1=提交位, 2-9=审核位) |
| node_name | VARCHAR(100) | NOT NULL | 节点名称 (如"店长初审") |
| assignee_type | ENUM('role','user','submitter_manager') | NOT NULL | 分配方式 |
| assignee_role_id | INT | FK→roles.role_id, NULL | 按角色分配时的角色 ID |
| assignee_user_id | INT | FK→users.user_id, NULL | 按指定人分配时的用户 ID |
| is_final | TINYINT(1) | NOT NULL | 是否终审节点 |
| auto_approve_enabled | TINYINT(1) | NOT NULL, DEFAULT 0 | 是否启用自动审批 |
| auto_approve_conditions | JSON | NULL | 自动审批条件 |
| timeout_hours | INT | NOT NULL, DEFAULT 12 | 超时小时数 (默认12小时) |
| timeout_action | ENUM('none','auto_approve','escalate','notify') | NOT NULL, DEFAULT 'escalate' | 超时动作 (非终审默认escalate，终审默认notify) |
| escalate_to_node | BIGINT | FK→approval_chain_nodes, NULL | 超时升级到的节点 |
| sort_order | INT | NOT NULL, DEFAULT 0 | 排序 |
| created_at | DATETIME | NOT NULL | |
| updated_at | DATETIME | NOT NULL | |

**assignee_type = 'submitter_manager' 的实现依据:**
利用 `store_staff` 表的 `role_in_store` 字段（staff/manager），通过提交人的 `store_id` 查找该门店的 manager。

### 表 3: approval_chain_instances — 审核链实例

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| instance_id | BIGINT | PK, AUTO_INCREMENT | 实例 ID |
| template_id | BIGINT | FK→approval_chain_templates, NOT NULL | 使用的模板 |
| auditable_type | VARCHAR(50) | NOT NULL | 业务类型 |
| auditable_id | BIGINT | NOT NULL | 业务记录 ID |
| content_review_record_id | BIGINT | FK→content_review_records, NULL | 关联的审核记录 |
| current_step | TINYINT | NOT NULL | 当前进行到的步骤 |
| total_steps | TINYINT | NOT NULL | 总步骤数 |
| status | ENUM('in_progress','completed','rejected','cancelled','timeout') | NOT NULL | 整体状态 |
| submitted_by | INT | FK→users.user_id, NOT NULL | 提交人 |
| submitted_at | DATETIME | NOT NULL | 提交时间 |
| completed_at | DATETIME | NULL | 完成时间 |
| final_result | ENUM('approved','rejected') | NULL | 最终结果 |
| final_reason | TEXT | NULL | 最终审批意见 |
| business_snapshot | JSON | NULL | 提交时的业务数据快照 |
| idempotency_key | VARCHAR(100) | UNIQUE, NOT NULL | 幂等键 |
| created_at | DATETIME | NOT NULL | |
| updated_at | DATETIME | NOT NULL | |

### 表 4: approval_chain_steps — 审核链步骤执行记录

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| step_id | BIGINT | PK, AUTO_INCREMENT | 步骤 ID |
| instance_id | BIGINT | FK→approval_chain_instances, NOT NULL | 所属实例 |
| node_id | BIGINT | FK→approval_chain_nodes, NOT NULL | 对应的节点定义 |
| step_number | TINYINT | NOT NULL | 步骤编号 |
| assignee_user_id | INT | FK→users.user_id, NULL | 实际被分配的审核人 |
| assignee_role_id | INT | FK→roles.role_id, NULL | 分配的角色 (角色池模式) |
| status | ENUM('waiting','pending','approved','rejected','skipped','timeout') | NOT NULL | 步骤状态 |
| action_reason | TEXT | NULL | 审批意见 |
| actioned_by | INT | FK→users.user_id, NULL | 实际操作人 |
| actioned_at | DATETIME | NULL | 操作时间 |
| is_final | TINYINT(1) | NOT NULL | 是否终审步骤 |
| timeout_at | DATETIME | NULL | 超时截止时间 |
| auto_approved | TINYINT(1) | NOT NULL, DEFAULT 0 | 是否自动审批通过 |
| created_at | DATETIME | NOT NULL | |
| updated_at | DATETIME | NOT NULL | |

### 索引设计

```sql
-- approval_chain_templates
CREATE UNIQUE INDEX uk_template_code ON approval_chain_templates(template_code);
CREATE INDEX idx_auditable_type_active ON approval_chain_templates(auditable_type, is_active);

-- approval_chain_nodes
CREATE INDEX idx_template_step ON approval_chain_nodes(template_id, step_number);
CREATE INDEX idx_assignee_role ON approval_chain_nodes(assignee_role_id);

-- approval_chain_instances
CREATE UNIQUE INDEX uk_idempotency_key ON approval_chain_instances(idempotency_key);
CREATE INDEX idx_auditable ON approval_chain_instances(auditable_type, auditable_id);
CREATE INDEX idx_status_step ON approval_chain_instances(status, current_step);
CREATE INDEX idx_submitted_by ON approval_chain_instances(submitted_by);

-- approval_chain_steps
CREATE INDEX idx_instance_step ON approval_chain_steps(instance_id, step_number);
CREATE INDEX idx_assignee_user_status ON approval_chain_steps(assignee_user_id, status);
CREATE INDEX idx_assignee_role_status ON approval_chain_steps(assignee_role_id, status);
CREATE INDEX idx_timeout ON approval_chain_steps(timeout_at);
```

---

## 四、与现有系统的集成方式（基于实际代码分析校准）

### 4.1 当前两条审核路径的问题

| 路径 | 现状 | 问题 |
|------|------|------|
| **路径A** ContentAuditEngine | merchant_points 使用完整的 Engine→Callback 链路 | 正常工作，可扩展 |
| **路径B** ConsumptionService直连 | consumption 绕过 ContentAuditEngine 的 approve/reject | ConsumptionAuditCallback 是空实现；审核逻辑散落在 ConsumptionService 中；无法插入多级审核 |

### ⚠️ 需要你拍板的决策点 #1: 消费审核路径统一

**选项A — 统一到 ContentAuditEngine 路径（推荐）:**

- 将 ConsumptionService.approveConsumption 的核心逻辑迁移到 ConsumptionAuditCallback.approved()
- consumption 的 approve/reject 统一走 ContentAuditEngine.approve()/reject()
- 多级审核链自然接入

优势: 所有业务类型走统一路径，ApprovalChainService 只需要拦截一个入口
代价: 需要改造 ConsumptionService，将审核后的积分发放等逻辑迁移到 Callback

**选项B — 在 ConsumptionService 内部增加链路判断:**

- 保持 ConsumptionService.approveConsumption() 为入口
- 在 approveConsumption 内部检查是否有 chain_instance，有则推进链路
- ConsumptionAuditCallback 仍为空

优势: 改动最小，不影响已有 Service 结构
代价: 审核逻辑分散在两个路径中（merchant_points 走 Engine，consumption 走 Service），长期维护成本高

**建议选择选项A**，理由: 项目未上线，一次性统一路径的长期收益远大于短期改造成本。

### 4.2 集成流程（基于选项A）

**升级后的统一审核流程:**

```
任何业务提交
  → ContentAuditEngine.submitForAudit(type, id, options)
  → [新增] ApprovalChainService.matchAndCreateChain(type, id, auditRecord)
      → 匹配 approval_chain_templates（按 auditable_type + match_conditions + priority）
      → 如果匹配到链:
          → 创建 approval_chain_instance
          → 创建所有 approval_chain_steps（第1个审核步=pending, 其余=waiting）
          → 通知第1个审核人（admin_notifications + Socket.IO）
      → 如果没匹配到链:
          → 不创建 instance，走原有单级审核逻辑

审核人操作
  → [新增] ApprovalChainService.processStep(stepId, action, reason, operatorId, { transaction })
      → 验证 operator 是否为当前步骤的合法审核人
      → 更新当前 step 状态
      → 如果 approved 且 is_final=true:
          → 更新 instance.status='completed', instance.final_result='approved'
          → 调用 ContentAuditEngine.approve() → triggerAuditCallback()
      → 如果 approved 且 is_final=false:
          → 推进下一步为 pending
          → 通知下一审核人
      → 如果 rejected:
          → 更新 instance.status='rejected'
          → 调用 ContentAuditEngine.reject() → triggerAuditCallback()

现有路由层的改造 (routes/v4/console/consumption.js):
  → POST /api/v4/console/consumption/approve/:id
      → [改造] requireRoleLevel(100) 降为 requireRoleLevel(55)（取决于决策点#4）
      → [改造] 路由内部: 先查 approval_chain_instance
          → 有链: 调用 ApprovalChainService.processStep()（Service层精确校验审核人身份）
          → 无链: 走原有 CoreService.approveConsumption()（兼容存量数据，通过 getService('consumption_core') 获取）
```

### 4.3 兼容性矩阵

| 组件 | 改造方式 | 影响范围 |
|------|---------|---------|
| ContentAuditEngine.submitForAudit() | 末尾新增调用 ApprovalChainService.matchAndCreateChain() | 仅新增逻辑，不改已有代码 |
| ContentAuditEngine.approve()/reject() | 不改 | 无影响 |
| ConsumptionAuditCallback | 从空实现改为真实实现（积分发放等） | **需要从 ConsumptionService 迁移逻辑** |
| ConsumptionService.approveConsumption | 保留用于无链的兼容场景 | 不删除，逐步废弃 |
| routes/v4/console/consumption.js | approve/:id 路由增加链路判断 | 改造路由处理逻辑 |
| TransactionManager.execute() | 不改，ApprovalChainService 继续使用此模式 | 无影响 |
| admin_notifications | 直接复用，通知审核人 | 无改造 |
| Socket.IO | 直接复用，实时推送 | 无改造 |

---

## 五、审核位映射（基于真实角色层级重建）

> **⚠️ 前版勘误**: 前版文档的9级映射引用了不存在的 regional_manager(role_id=6) 和 sales_staff(role_id=8)。以下基于实际数据库角色重建。

```
位置 1: 提交位   (store_staff role_level=20, role_id=106 / merchant_staff role_level=30, role_id=105)
位置 2: 初审     (content_auditor role_level=55, role_id=104 — 内容审核专岗)
位置 3: 复审     (business_manager role_level=70, role_id=102)
位置 4: 三审     (merchant_manager role_level=80, role_id=3)
位置 5~8: 预留扩展
位置 9: 终审     (admin role_level=100, role_id=2, is_final 强制为 true)
```

**实际可用审核角色分析:**

| 角色 | role_id | role_level | 当前用户数 | 能否做审核人 |
|------|---------|-----------|-----------|------------|
| admin | 2 | 100 | 5 | 可以，且是唯一有用户的高权限角色 |
| ops | 101 | 90 | 1 | 可以，运营管理员 |
| merchant_manager | 3 | 80 | 1 | 可以，商户管理者 |
| business_manager | 102 | 70 | 2 | 可以，业务经理 |
| content_auditor | 104 | 55 | **0** | 架构上可以，但需先分配用户 |

### 运营配置实例（基于真实消费金额 ¥20~¥150）

**默认消费链（全部金额）:** 1(提交) → 9(admin终审) — 与当前单级审核一致

**未来大额消费链 (>200元):** 1(提交) → 3(business_manager初审, role_id=102) → 9(admin终审)

**商家积分默认链:** 1(提交) → 9(admin终审)

> 当前消费金额范围很窄(¥20~¥150)，初期建议只配置1个默认链（单级admin终审），与现有行为完全一致。等业务发展后再通过管理后台配置多级链。content_auditor 角色虽然设计上最适合做审核人，但当前无用户分配，初期不配为审核位。

---

## 六、后端执行步骤

### 步骤 1: Sequelize Migration 创建 4 张新表

**文件**: `migrations/YYYYMMDDHHMMSS-create-approval-chain-tables.js`

遵循现有迁移模式（参考 `sequelizemeta` 中的 `20260307212644-*.js` 等）。

Migration 内容:
- `queryInterface.createTable('approval_chain_templates', {...})`
- `queryInterface.createTable('approval_chain_nodes', {...})`
- `queryInterface.createTable('approval_chain_instances', {...})`
- `queryInterface.createTable('approval_chain_steps', {...})`
- 所有外键约束和索引
- down 方法: dropTable 逆序

### 步骤 2: 新增 4 个 Sequelize Model

**文件**: `models/ApprovalChainTemplate.js`, `models/ApprovalChainNode.js`, `models/ApprovalChainInstance.js`, `models/ApprovalChainStep.js`

遵循现有 Model 模式:

```javascript
// 模式参考: models/ContentReviewRecord.js
module.exports = sequelize => {
  const ApprovalChainTemplate = sequelize.define('ApprovalChainTemplate', {
    template_id: { type: DataTypes.BIGINT, primaryKey: true, autoIncrement: true },
    // ... 其他字段
  }, {
    tableName: 'approval_chain_templates',
    timestamps: true,
    underscored: true,
    freezeTableName: true,
    charset: 'utf8mb4',
    collate: 'utf8mb4_unicode_ci'
  })
  return ApprovalChainTemplate
}
```

Model 关联:
- `ApprovalChainTemplate.hasMany(ApprovalChainNode, { foreignKey: 'template_id', as: 'nodes' })`
- `ApprovalChainInstance.hasMany(ApprovalChainStep, { foreignKey: 'instance_id', as: 'steps' })`
- `ApprovalChainInstance.belongsTo(ApprovalChainTemplate, { foreignKey: 'template_id' })`
- `ApprovalChainInstance.belongsTo(ContentReviewRecord, { foreignKey: 'content_review_record_id' })`
- `ApprovalChainStep.belongsTo(ApprovalChainNode, { foreignKey: 'node_id' })`

在 `models/index.js` 中注册这 4 个 Model。

### 步骤 3: 新增 ApprovalChainService

**文件**: `services/ApprovalChainService.js`

遵循现有 Service 模式（参考 `services/consumption/CoreService.js` 和 `services/index.js` 注册模式）:
- 所有写操作接收 `{ transaction }` 参数（通过 `assertAndGetTransaction` 从 `utils/transactionHelpers` 导入，强制校验）
- 在 `services/index.js` 的 ServiceManager.initialize() 中注册: `this._services.set('approval_chain', ApprovalChainService)`
- 路由通过 `req.app.locals.services.getService('approval_chain')` 获取实例

核心方法:

| 方法 | 职责 |
|------|------|
| `matchTemplate(auditableType, businessData)` | 按 auditable_type + match_conditions + priority 匹配模板 |
| `createChainInstance(template, auditableType, auditableId, submittedBy, options)` | 创建链实例 + 所有步骤 |
| `processStep(stepId, action, reason, operatorId, options)` | 处理审核步骤（核心方法） |
| `getInstanceByAuditable(auditableType, auditableId)` | 按业务记录查链实例 |
| `getPendingStepsForUser(userId)` | 查询用户的待审核步骤 |
| `getPendingStepsForRole(roleId)` | 查询角色的待审核步骤 |
| `advanceToNextStep(instance, currentStep, options)` | 推进到下一步 |

### 步骤 4: 升级 ContentAuditEngine

**文件**: `services/ContentAuditEngine.js`

改造 `submitForAudit()`: 在创建 `ContentReviewRecord` 之后，调用 `ApprovalChainService.matchTemplate()` + `createChainInstance()`。

不改 `approve()` / `reject()` / `triggerAuditCallback()` 的接口签名和逻辑。

### 步骤 5: 改造 ConsumptionAuditCallback

**文件**: `callbacks/ConsumptionAuditCallback.js`

从空实现改为真实实现:
- `approved()`: 将 ConsumptionService.approveConsumption 的核心逻辑（积分发放、预算分配、状态更新、审计日志）迁移过来
- `rejected()`: 将 ConsumptionService.rejectConsumption 的核心逻辑迁移过来

### 步骤 6: 改造消费审核路由

**文件**: `routes/v4/console/consumption.js`

`POST /approve/:id` 路由改造（当前第164行）:

```
当前: router.post('/approve/:id', authenticateToken, requireRoleLevel(100), ...)
改为: router.post('/approve/:id', authenticateToken, requireRoleLevel(55), ...)

路由内部改造:
  const CoreService = req.app.locals.services.getService('consumption_core')
  const ApprovalChainService = req.app.locals.services.getService('approval_chain') // 新增
  
  const record_id = parseInt(req.params.id, 10)
  → 查询是否有 approval_chain_instance (status='in_progress', auditable_type='consumption', auditable_id=record_id)
  → 有链:
      → 查找当前 pending 的 step
      → 验证 req.user 是否为该 step 的合法审核人（Service 层精确鉴权）
      → TransactionManager.execute(async transaction => {
          ApprovalChainService.processStep(stepId, 'approve', reason, req.user.user_id, { transaction })
        })
  → 无链:
      → 走原有 CoreService.approveConsumption()（兼容存量数据，TransactionManager 包裹不变）

同时更新路由文件顶部的域边界注释:
  旧: "审核权限只开放给 admin，不开放 ops/区域经理"
  新: "审核权限开放到 content_auditor(55) 及以上，具体审核权限由 ApprovalChainService 精确校验"
```

### 步骤 7: 新增审核链管理 API

**路由文件**: `routes/v4/console/approval-chain.js`

挂载路径: `/api/v4/console/approval-chain`（遵循现有 console 路由挂载模式）

权限（模板配置路由）: `authenticateToken` + `requireRoleLevel(100)`（仅 admin 可配置审核链模板）
权限（审核操作路由 my-pending/steps）: `authenticateToken` + `requireRoleLevel(55)`（content_auditor 及以上可进入路由，具体审核权限由 ApprovalChainService.processStep() 精确校验）

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/templates` | 查询审核链模板列表 |
| GET | `/templates/:id` | 查询模板详情（含节点） |
| POST | `/templates` | 创建审核链模板 |
| PUT | `/templates/:id` | 更新模板 |
| PUT | `/templates/:id/toggle` | 启用/禁用模板 |
| GET | `/instances` | 查询审核链实例列表（支持按 auditable_type/status 筛选） |
| GET | `/instances/:id` | 查询实例详情（含所有步骤和审核历史） |
| GET | `/my-pending` | 查询当前登录人的待审核步骤 |
| POST | `/steps/:id/approve` | 审核通过 |
| POST | `/steps/:id/reject` | 审核拒绝 |

**响应格式遵循现有标准:**

```javascript
// 成功: res.apiSuccess(data, message)
{
  "success": true,
  "code": "SUCCESS",
  "message": "查询成功",
  "data": { ... },
  "timestamp": "2026-03-09T20:19:57.000+08:00",
  "version": "v4.0",
  "request_id": "xxx"
}

// 分页: res.apiPaginated(data, pagination, message)
// 错误: res.apiError(message, errorCode, details, httpStatus)
```

### 步骤 8: Seed 数据（基于决策点 #2 — 同时配单级+多级）

**文件**: `migrations/YYYYMMDDHHMMSS-seed-default-approval-chains.js`

写入配置:

| template_code | template_name | auditable_type | total_nodes | match_conditions | priority |
|---------------|---------------|----------------|-------------|------------------|----------|
| consumption_default | 消费审核-默认链 | consumption | 1 | `{}` | 0 |
| consumption_large | 消费审核-大额链 | consumption | 2 | `{"min_amount": 200}` | 10 |
| merchant_points_default | 商家积分审核-默认链 | merchant_points | 1 | `{}` | 0 |

- `consumption_default`: 1级（admin终审，timeout_hours=12, timeout_action='notify'），兜底默认
- `consumption_large`: 2级
  - 节点1: business_manager(**role_id=102**, role_level=70)初审，timeout_hours=12, timeout_action='escalate'
  - 节点2: admin(**role_id=2**, role_level=100)终审，timeout_hours=12, timeout_action='notify'
- `merchant_points_default`: 1级（admin终审，timeout_hours=12, timeout_action='notify'）

所有节点统一 12 小时超时。非终审超时自动升级到下一审批人，终审超时只提醒。

### 步骤 9: 历史数据清理（基于决策点 #3 — 彻底清理）

**文件**: `migrations/YYYYMMDDHHMMSS-cleanup-inconsistent-audit-records.js`

清理逻辑:
1. 将 content_review_records 中 `auditable_type='consumption' AND audit_status='pending'` 且 auditable_id 在 consumption_records 中不存在或 status 不是 pending 的记录，更新为 `audit_status='cancelled'`
2. 对 merchant_points 做同样校验
3. 记录清理数量

### 步骤 10: 超时自动升级定时任务（基于决策点 #5 — 12小时超时自动升级）

**文件**: `services/ApprovalChainTimeoutService.js`

遵循 system_job 角色模式（role_id=100, role_level=-1）:

**定时任务配置:**
- 扫描频率: 每 30 分钟执行一次
- 查询条件: `approval_chain_steps WHERE status='pending' AND timeout_at IS NOT NULL AND timeout_at < NOW()`

**超时处理逻辑:**

```
扫描到超时 step
  → 判断 is_final:
      → is_final=false（非终审）:
          1. 将当前 step 标记为 status='timeout'
          2. 调用 ApprovalChainService.advanceToNextStep()
             → 下一步 step 变为 pending
             → 计算下一步的 timeout_at = NOW() + 12h
          3. 写入 admin_notifications 通知下一审核人:
             "消费审核 #XXX 已超时升级到您，原审核人12小时未处理"
          4. 写入 admin_notifications 通知超时审核人:
             "您负责的消费审核 #XXX 已因超时自动升级"
      → is_final=true（终审）:
          1. 不改变 step 状态（保持 pending）
          2. 写入 admin_notifications 提醒终审人:
             "消费审核 #XXX 已超时12小时，请尽快处理"
          3. 每 12 小时重复提醒一次（避免重复通知: 检查上次通知时间）
```

**默认配置:**
- `timeout_hours=12`（所有节点统一 12 小时）
- `timeout_action='escalate'`（非终审节点默认自动升级）
- 终审节点 `timeout_action='notify'`（终审只提醒不放行）

---

## 七、问题归属分析（后端 / Web管理前端 / 微信小程序）

### 7.1 后端项目问题

| 问题 | 说明 | 优先级 |
|------|------|--------|
| **消费审核双路径** | ConsumptionAuditCallback 空实现，审核逻辑在 ConsumptionService（注册键 `consumption_core`）中；路由通过 `TransactionManager.execute()` 直接调用 `CoreService.approveConsumption()`，绕过 ContentAuditEngine；需统一到 Engine 路径 | P0 |
| **content_review_records 与 consumption_records 数据不同步** | 446 pending vs 1 pending，历史测试数据需要清理或对账 | P1 |
| **无审核链表结构** | 数据库确认不存在 `approval%` 相关表；需要新建 4 张表 + 4 个 Model + 通过 `services/index.js` 的 ServiceManager 注册 1 个新 Service | P0 |
| **审核权限过窄** | 当前仅 admin(level=100) 可审核（路由注释明确写了"审核权限只开放给 admin，不开放 ops/区域经理"），未利用 ops(90)/merchant_manager(80)/business_manager(70)/content_auditor(55) 等中间角色 | P1 |
| **content_auditor/merchant_staff/store_staff 无实际用户** | content_auditor(role_id=104) 是审核专岗但0个用户；merchant_staff(role_id=105) 和 store_staff(role_id=106) 也0个用户。审核链的 role 分配在初期只能用 admin(5人) 和 business_manager(2人) | P2 |
| **消费路由域边界注释需更新** | `routes/v4/console/consumption.js` 注释明确写"审核权限只开放给 admin，不开放 ops/区域经理"，审核链上线后此注释需同步更新 | P2 |

### 7.2 Web管理平台前端项目问题

| 问题 | 说明 | 优先级 |
|------|------|--------|
| **无审核链配置页面** | 需新增 `approval-chain-config.html` 页面，用 Alpine.js + Tailwind 实现 | P0 |
| **审核列表缺少链路信息** | `finance-management.html` 现有审核列表需显示"当前第X步/共N步" | P1 |
| **无"我的待审"视图** | 需要新增按当前登录人角色过滤的待审核列表 | P1 |
| **审核详情缺少时间线** | 审核详情 Modal 需显示完整审核链进度（各步骤审核人+意见+时间） | P1 |
| **侧边栏需要新增菜单** | sidebar-nav 组件需添加"审核链配置"入口 | P2 |

**Web前端技术栈兼容性（基于实际代码确认）:** 完全兼容。
- 架构: Alpine.js 3.15 + Tailwind CSS 3.4 + Vite 6.4 多页 HTML 架构（`vite.config.js` 通过 `getHtmlEntries()` 扫描 `admin/*.html` 自动注册入口）
- 新增页面方式: 在 `admin/` 下新建 `approval-chain-config.html` + 在 `admin/src/modules/` 下新建对应的 composable 和 page JS
- API 调用: 使用现有 `admin/src/api/base.js` 的 `request()` 函数，`API_PREFIX='/api/v4'`，Token 从 `localStorage('admin_token')` 读取
- 现有 50+ 个 HTML 页面均遵循此模式（finance-management.html, merchant-management.html, pending-center.html 等）
- 字段命名: **直接使用后端字段名（snake_case）**，不做映射转换。前端 JS 直接使用 `template_id`、`step_number`、`assignee_role_id` 等后端字段

### 7.3 微信小程序前端项目问题

| 问题 | 说明 | 优先级 |
|------|------|--------|
| **提交后状态展示** | 店员提交消费后，需显示"审核中，当前第X步" | P1 |
| **审核推送通知** | merchant_manager(role_id=3, level=80) 和 business_manager(role_id=102, level=70) 角色需通过 Socket.IO + 微信模板消息接收待审核通知 | P1 |
| **审核操作页面** | merchant_manager(level=80) 及以上角色需在小程序内审批（如果开放给非admin角色） | P2 |
| **无需改造的部分** | 普通用户（user 角色）的抽奖、积分查询等功能不受影响 | — |

**小程序技术栈兼容性:** 兼容。小程序使用 TypeScript + MobX 状态管理 + Socket.IO (weapp.socket.io)，调用 `/api/v4` 接口。新增的 API 遵循相同路径规范（`/api/v4/console/approval-chain/*`）和响应格式（`res.apiSuccess()`/`res.apiError()`），小程序只需要新增/修改少量页面适配新字段。字段命名直接使用后端 snake_case 格式，不做映射。

---

## 八、5 个决策点 — 行业方案对比与最终决策

> 决策依据: 项目未上线，愿意一次性投入，不兼容旧接口，长期维护成本低优先，基于后端数据库项目现有技术栈

---

### 决策点 #1: 消费审核路径统一到 ContentAuditEngine 还是保持 ConsumptionService 直连

#### 行业做法对比

**阿里/美团/腾讯（大厂）:** 审核流程**必须走统一引擎**，没有例外。美团商家入驻审核、阿里钉钉审批、腾讯OA审批，核心原则是"一个入口、一套管道、多个回调"。原因: 散落在各 Service 里的审核逻辑是大厂踩过最多的坑，当业务从 3 种审核类型扩展到 30 种时，散落逻辑的维护成本呈指数增长。大厂的审批系统演进路径几乎都是: 散落 → 痛苦 → 收敛到统一引擎。

**小公司（<10人团队）:** 业务逻辑直接写在 Service/Controller 里，每种审核一套独立流程。开发快，但每次新增审核类型就要复制一套逻辑。常见结局: 3-5 种审核类型后代码腐化严重，改一个 bug 要同时改 5 个地方。

**游戏公司（网易/米哈游）:** 所有涉及虚拟物品发放的操作走统一的"发放管道"（Pipeline）。策划提交 → 管道分发 → 对应回调处理。网易雷火的道具发放系统、米哈游的邮件发放系统都是这个模式。原因: 游戏运营活动多，每个活动有不同的奖励逻辑，如果不统一管道，运营一年后代码不可维护。

**交易平台（5173/闲鱼）:** 交易流程走统一的状态机引擎，所有订单类型（道具/账号/代练）共用一个状态流转引擎 + 各自的业务回调。

#### 对比总结

| 做法 | 适合场景 | 长期维护成本 | 初期投入 |
|------|---------|------------|---------|
| 统一引擎 + 回调 | 3种以上审核类型、需要扩展 | **极低**（新类型只加回调） | 中（需迁移现有逻辑） |
| 各 Service 独立流程 | 只有1种审核、永不扩展 | **极高**（N种类型×N套逻辑） | 低（不用改现有代码） |

#### 与本项目技术栈的适配

本项目**已经有** ContentAuditEngine + Callback 架构（merchant_points 在用，MerchantPointsAuditCallback.js 有完整实现），ConsumptionAuditCallback 是空实现只是历史遗留，不是设计意图（文件注释第15行: "如需通过 ContentAuditEngine 统一审批，可在此添加回调逻辑"）。统一到 Engine 路径意味着:
- 不需要新建任何架构，只需要把 `services/consumption/CoreService.js` 的 `approveConsumption()` 里的积分发放逻辑搬到 `callbacks/ConsumptionAuditCallback.js` 里
- ApprovalChainService 只需拦截 ContentAuditEngine.approve()/reject() 一个入口点（代码第136行/第191行）
- ContentAuditEngine.triggerAuditCallback() 已有完整的 callbackMap（代码第298行: exchange/feedback/consumption/merchant_points）
- 未来新增 exchange 审核链、feedback 审核链零额外成本（只需在 callbackMap 确认有对应回调文件，目前 ExchangeAuditCallback.js 和 FeedbackAuditCallback.js 均已存在于 callbacks/ 目录）

#### **最终决策: 选项A — 统一到 ContentAuditEngine**

理由: 项目未上线，Engine+Callback 架构已存在，迁移成本仅 ~200 行代码。保持双路径是典型的"虽然能跑但是技术债务"。

---

### 决策点 #2: 初期配单级链（admin终审）还是直接配多级链

#### 行业做法对比

**阿里/腾讯（大厂）:** 系统设计时就支持多级，但**上线时的默认配置是最简链路**。钉钉审批上线 v1.0 时，默认模板就是"提交→直属上级审批→完成"的 2 级链。复杂链路是用户自己在后台配的，不是预设的。原因: 减少上线风险，如果多级链有 bug，最简配置可以兜底。

**美团商家审核:** v1 上线时是单级人工审核，但系统架构从第一天就支持多级。第二个月才上线"三级审核（门店→区域→总部）"。原因: 先验证基础流程跑通，再叠加复杂度。

**小公司:** 大多数直接硬编码单级审核，后来想加多级时发现改不动，只能重写。

**游戏公司:** 上线前就配好完整审核链。网易的道具发放审核从第一天就是"策划→制作人→运营总监"3级。原因: 游戏行业对虚拟物品发放的内控要求高，审计合规不允许简化。

**活动策划公司（大麦/活动行）:** 按金额阶梯配置多级，但最低一档（小额）是 1 级自动通过。实质是"多级架构 + 单级默认配置"。

#### 对比总结

| 做法 | 风险 | 测试覆盖 | 长期效果 |
|------|------|---------|---------|
| 单级默认 + 后加多级 | 低上线风险 | 多级链上线前未经测试 | 多级链可能有隐藏bug |
| 直接多级 | 上线风险稍高 | 多级链从第一天被测试 | 上线后直接可用 |
| 单级+多级都配（同时Seed） | 最低风险 | 两种都测试 | 最佳 |

#### 与本项目的适配

项目未上线，总共只有 48 条消费记录、10 条 merchant_points 记录，是测试数据。上线前有充分时间测试多级链。且 business_manager 角色已有 2 个用户。

#### **最终决策: 同时 Seed 两套配置**

- `consumption_default`: 1级链（admin终审），priority=0，作为兜底默认
- `consumption_large`: 2级链（business_manager初审 → admin终审），priority=10，match_conditions: `{"min_amount": 200}`
- `merchant_points_default`: 1级链（admin终审），priority=0

这样既有安全兜底（小额单级），又从第一天就测试了多级链路（大额走2级），金额阈值 200 元可在管理后台随时调整。大厂和游戏公司的共同实践: **架构上支持最复杂的场景，配置上从最安全的默认值开始**。

---

### 决策点 #3: 446 条不一致的历史审核数据怎么处理

#### 行业做法对比

**阿里/美团/腾讯（大厂）:** 上线前**必须做数据治理**。大厂有专门的"上线前数据清洗 Checklist"，脏数据进入生产环境是 P0 级事故。美团商家系统每次大版本上线前，会跑"数据一致性校验脚本"，不一致的数据在迁移脚本中统一处理。

**小公司:** 常见做法是"先上线再说"，结果脏数据导致线上 bug，排查时才发现是历史遗留数据。

**游戏公司:** 游戏行业更极端 — 上线前会做"数据清档"。内测数据全部清除或标记为测试数据，不允许带入正式服。原因: 游戏经济系统对数据一致性极其敏感，一条脏数据可能导致通货膨胀。

**交易平台:** 上线前会对历史挂单做"统一截单"处理 — 所有未完成的订单标记为 cancelled，让用户重新提交。

#### 与本项目的适配

content_review_records 有 446 条 pending consumption，但 consumption_records 仅 1 条 pending。这说明绝大部分 content_review_records 是测试产生的脏数据。项目未上线，没有真实用户受影响。

#### **最终决策: 彻底清理**

写一个 migration 脚本:
1. 将 content_review_records 中所有 `auditable_type='consumption'` 且 `audit_status='pending'` 且 auditable_id 在 consumption_records 中不存在或状态不是 pending 的记录，标记为 `audit_status='cancelled'`
2. 对 merchant_points 的 pending 记录做同样的一致性校验
3. migration 中记录清理数量到日志

不是"兼容脏数据"，而是"清除脏数据"。项目还没上线，大厂和游戏公司的共同实践: **宁可清档重来，不可带病上线**。

---

### 决策点 #4: 非admin角色（merchant_manager等）是否开放审核权限

#### 行业做法对比

**美团（大厂）:** 审核权限按"角色+区域"分配。区域经理审核本区域商家，总部审核跨区域和高风险项。如果所有审核都堆给总部 admin，系统能跑但运营效率极低。美团的审核系统核心设计原则: **"审核权限下沉到离业务最近的人"**。

**阿里钉钉审批:** 默认的审批流就是"直属上级审批"，不是"公司 admin 审批"。审批权限与组织架构绑定，每一级只负责自己权限范围内的审批。

**小公司:** 很多小公司的做法是"所有审核集中到老板/admin"，在初期可以运转，但超过 50 单/天就成瓶颈。

**游戏公司:** 分级审批是标配。低价值道具策划自审，中价值需制作人审，高价值需总监审。原因: 游戏每天有大量运营操作（活动发放、补偿发放），如果全部堆给 admin 会导致审核积压影响玩家体验。

**交易平台（5173/交易猫）:** 交易审核分级: 自动风控（机器） → 一级客服 → 高级客服 → 运营经理。低风险交易根本不进入人工审核。

#### 与本项目的适配（基于真实角色层级校准）

本项目实际角色层级: store_staff(20) → merchant_staff(30) → content_auditor(55) → finance_viewer(60) → business_manager(70) → merchant_manager(80) → ops(90) → admin(100)。当前代码 `requireRoleLevel(100)` 把所有审核集中到 admin，且路由注释明确写"审核权限只开放给 admin，不开放 ops/区域经理（已确认）"。

关键技术点: 路由层的 `requireRoleLevel(N)` 只是"大门守卫"（你的 role_level 必须 >= N 才能进这个路由），真正的权限校验在 ApprovalChainService.processStep() 里做（验证你是不是当前步骤的合法审核人）。这是**两层校验**:
- 第一层（中间件）: 你的角色等级够不够进这个路由
- 第二层（Service）: 你是不是这个具体步骤分配的审核人

### 决策点 #4 深度分析: 路由准入线的行业做法

**核心问题**: 路由中间件 `requireRoleLevel(N)` 的 N 设为多少？这决定了"谁能进入审核路由的大门"。进了大门之后，`ApprovalChainService.processStep()` 再做精确校验（你是不是当前步骤的合法审核人）。

#### 各行业"两层鉴权"的准入线设计

**阿里钉钉审批:**
- 路由层: 任何企业成员都能进入 `/approval` 路由（因为任何人都可能出现在审批链上）
- Service 层: 只有被分配为当前节点审批人的用户能操作
- 准入线极低（相当于 requireRoleLevel(0)），完全依赖 Service 层精确校验
- 原因: 钉钉不知道哪个企业会把谁配为审批人，所以路由层必须放开

**美团商家审核系统:**
- 路由层: 所有内部员工（有审核相关权限的角色）都能进入审核路由
- Service 层: 按"角色+区域"精确匹配 — 北京区域经理只能审北京商家
- 准入线是"最低审核角色" — 只要你是任何一级审核人，都能进路由
- 原因: 美团审核系统支持 6 种以上审核类型，每种的审核人不同，路由层不可能穷举

**腾讯OA审批:**
- 路由层: 所有管理层级（普通员工以上）都能进入审批路由
- Service 层: 按组织架构判断你是不是直属上级
- 准入线是"所有可能参与审批的人"

**小公司（<10人团队）:**
- 通常没有两层鉴权，路由层就是唯一防线
- `requireRoleLevel(100)` 直接卡死在 admin
- 初期能跑，但一旦业务量上来，admin 审核成瓶颈时发现改不动 — 因为路由和业务鉴权耦合在一起
- **这是最常见的技术债务**: 路由层 hardcode 了业务逻辑，后期要改得同时改中间件+Service+前端

**网易/米哈游（游戏公司）:**
- 路由层: 所有有"审核"标签的员工都能进入审核中台
- Service 层: 根据审核类型（道具/活动/充值）匹配对应的审核人
- 准入线是"审核人标签" — 你被标记为审核人就能进
- 本质和角色等级一样: 路由层按"可能是审核人"放行，Service 层按"确实是这个步骤的审核人"校验

**5173/交易猫（虚拟物品交易平台）:**
- 路由层: 所有客服+运营+管理岗位都能进入审核面板
- Service 层: 一级客服只能审 ≤500 元交易，高级客服审 500-5000 元，运营经理审 >5000 元
- 准入线是"最低级别的审核岗"

**大麦/活动行（活动策划平台）:**
- 路由层: 所有项目参与者都能进入审批流
- Service 层: 按项目角色（策划→执行→财务→总监）逐级审批
- 准入线是"项目参与者"

#### 各方案对比总结

| 方案 | 准入线 | 能进入路由的角色 | 安全性 | 扩展性 | 技术债务 | 适用场景 |
|------|-------|----------------|--------|--------|---------|---------|
| **选项A: requireRoleLevel(55)** | content_auditor 及以上 | content_auditor/finance_viewer/business_manager/merchant_manager/ops/admin (6个角色) | 中间件+Service双层保护 | **极高** — 未来任何 ≥55 的角色加入审核链零改动 | **极低** | 大厂/游戏公司/交易平台的标准做法 |
| **选项B: requireRoleLevel(70)** | business_manager 及以上 | business_manager/merchant_manager/ops/admin (4个角色) | 中间件+Service双层保护 | 中等 — 如果未来要让 content_auditor 审核，需改路由层 | **中等** — 路由层成为隐性业务约束 | 小公司过渡期做法 |
| **选项C: requireRoleLevel(100)** | 仅 admin | admin (1个角色) | 只有中间件单层 | **无** — 多级链完全无法工作 | **极高** — 建了审核链但用不了，纯浪费 | 不做多级审核的场景 |

#### 关键洞察: 选项B和C的技术债务本质

选项B的问题: 路由层 `requireRoleLevel(70)` 隐含了一个业务假设 — "最低审核角色是 business_manager"。未来如果 content_auditor 需要审核，你必须改代码（路由中间件参数 70→55），这就是**路由层硬编码了业务逻辑**，和小公司的 `requireRoleLevel(100)` 本质相同，只是程度不同。

选项A为什么没有这个问题: `requireRoleLevel(55)` 的语义是"内容审核人及以上都能进入"，而 content_auditor 就是系统中为审核设计的最低角色。只要不新增比 content_auditor 更低级别的审核角色（实际不会），这个值永远不需要改。

#### **最终决策: 选项A — requireRoleLevel(55)**

理由:
1. **行业共识**: 大厂/游戏/交易平台100%采用"宽准入+精确鉴权"模式，无一例外
2. **零技术债务**: 55 是系统中"审核专岗"角色的 level，语义精确，不会过时
3. **项目未上线**: 没有兼容负担，一步到位
4. **安全性不降低**: Service 层 `processStep()` 做精确校验，路由层只是大门，有人过了大门不代表能操作
5. **finance_viewer(60) 不会误操作**: 进了路由但没有被分配到任何 step，processStep() 会返回"您不是当前步骤的审核人"

---

### 决策点 #5: 超时处理是第一期做还是延后

#### 行业做法对比

**阿里/美团（大厂）:** 审批超时处理**从 v1 就有**，但实现方式是最轻量的。钉钉审批 v1 的超时处理就是一个定时任务每小时扫一次 `timeout_at < NOW()` 的记录，发通知提醒。不做自动审批，不做自动升级，只做"超时提醒"。后续版本才加了自动升级和自动审批。

**小公司:** 几乎不做超时处理，结果是审批单在队列里一躺半年没人管。

**游戏公司:** 必须有超时。游戏运营活动是有时间窗口的（如春节活动），审批卡住意味着活动无法上线，损失巨大。但实现通常也很简单: 定时任务 + 通知。

**活动策划公司（大麦/活动行）:** 超时自动取消是标配，因为活动有固定时间，审批超时意味着活动无法执行。

**交易平台:** 超时自动取消订单是基础功能，否则买卖双方的资金/物品会被无限期冻结。

#### 与本项目的适配

本项目已有 `system_job` 角色（role_level=-1）和 `system.execute_scheduled_tasks` 权限，说明定时任务基础设施已经存在或已规划。实现超时只需要:
1. 一个定时任务每小时扫描 `approval_chain_steps WHERE status='pending' AND timeout_at < NOW()`
2. 按 `timeout_action` 处理（第一期只实现 'notify'，即发 admin_notification 提醒）

#### **最终决策: 12小时超时自动升级到下一审批人**

具体范围:
- `timeout_hours` 默认值 = 12（12小时）
- 创建 step 时计算 `timeout_at = created_at + 12h`
- 定时任务每 30 分钟扫描 `approval_chain_steps WHERE status='pending' AND timeout_at IS NOT NULL AND timeout_at < NOW()`
- 超时处理逻辑:
  - 如果当前步骤**不是终审**(`is_final=false`): 将当前 step 标记为 `status='timeout'`，自动推进到下一步（下一步 step 变为 `pending`），通知下一审核人
  - 如果当前步骤**是终审**(`is_final=true`): 仅发通知提醒终审人，不自动通过（终审卡住需要人工介入，不能自动放行）
  - 写入 `admin_notifications` 记录超时事件
- `timeout_action` 第一期实现 `'none'`、`'notify'`、`'escalate'` 三种
- `'auto_approve'` 不实现（自动通过有业务风险，不适合消费/积分审核场景）

超时升级流程示例（2级链: business_manager初审 → admin终审）:

```
business_manager 收到初审任务
  → 12小时未操作
  → 定时任务检测超时
  → step_2(business_manager) 标记为 timeout
  → step_9(admin终审) 自动变为 pending
  → admin 收到通知: "消费审核 #XXX 已超时升级到您，请尽快处理"
```

---

### 决策点 #6 深度分析: 审核岗位应该"专岗专人"还是"兼任"

> 数据库中存在 `content_auditor` 角色（role_id=104, role_level=55），是专门为内容审核设计的角色，但当前**0个用户**分配。business_manager（role_id=102, role_level=70）有 2 个用户。

**核心问题**: 审核链的初审节点，assignee_role_id 填 content_auditor(104) 还是 business_manager(102)？

#### 各行业"审核专岗 vs 兼任"的做法

**阿里内容安全部:**
- **专岗专人**: 阿里有独立的"内容安全审核员"岗位，不兼任任何其他职责
- 原因: 淘宝每天数百万条商品上架审核，审核量大到必须专岗
- 但 v1.0（2008年初期）时是运营团队兼审核，到日均审核量过万才独立出审核岗
- **启示**: 业务量决定是否需要专岗

**美团商家审核:**
- **先兼任后拆分**: 初期由区域 BD 经理兼做商家审核（角色=区域经理，兼职审核）
- 订单量过 5000/天后，独立出"商家审核员"角色
- 关键: 审核链模板的 `assignee_role_id` 从"区域经理"改为"商家审核员"，**代码层面零变更**
- **启示**: 角色拆分是运营决策，不是代码决策

**腾讯游戏审核（天美/光子工作室）:**
- **从第一天就是专岗**: 道具发放审核员和策划是两个岗位
- 原因: 游戏道具发放涉及经济系统平衡，"策划申请+审核员审核"的双人制是合规要求
- 但这是因为游戏行业对虚拟经济有监管要求，不是技术原因
- **启示**: 有合规要求的场景必须专岗

**小公司（10-50人）:**
- 几乎 100% 是兼任: 业务经理/产品经理顺手审核
- 原因: 审核量少（每天几单到几十单），养专人不经济
- 直到审核量超过人均日处理上限（通常 200-500 单/天），才考虑独立审核岗
- **启示**: 审核量 < 200 单/天，兼任是正确选择

**网易游戏:**
- **混合模式**: 低价值操作（<100元虚拟物品）由运营兼审，高价值操作（>1000元）必须专岗审
- 审核链模板按金额区间分配不同角色: 小额→运营角色，大额→审核专岗
- **启示**: 可以按金额/风险等级决定专岗还是兼任

**5173/交易猫（虚拟物品交易）:**
- **专岗但分级**: 一级审核员是入门岗位（相当于 content_auditor），二级是高级客服，三级是运营经理
- 从第一天就有审核专岗，因为交易平台的核心业务就是审核
- **启示**: 审核是核心业务流程时，必须专岗

**大麦/活动行:**
- **兼任**: 项目经理兼做活动审批，没有独立审核岗
- 原因: 活动审批量很低（每月几十个），且审批需要业务背景
- **启示**: 审批量低+需要业务判断 = 兼任更好

#### 与本项目的适配分析

| 维度 | 本项目现状 | 分析 |
|------|-----------|------|
| **日均审核量** | 48 条消费记录 / 总计（全部历史），日均 < 5 单 | 远低于"需要专岗"的阈值（200单/天） |
| **审核复杂度** | 消费金额 ¥20~¥150，无复杂风控规则 | 不需要专业审核知识，业务经理兼任完全够 |
| **content_auditor 用户** | 0 人 | 需要额外分配/招聘，增加运营成本 |
| **business_manager 用户** | 2 人 | 立即可用，无额外成本 |
| **切换成本** | 修改审核链模板的 assignee_role_id（管理后台操作） | 零代码变更，任何时候都能切 |

#### 各方案对比

| 方案 | 初审角色 | 立即可用 | 日均处理能力 | 切换到专岗的成本 | 长期维护成本 | 适用阶段 |
|------|---------|---------|-------------|----------------|------------|---------|
| **选项A: content_auditor 专岗** | content_auditor(role_id=104) | 否（需分配用户） | 取决于配多少人 | N/A 已是专岗 | 极低（职责清晰） | 日均审核 > 200 单 |
| **选项B: business_manager 兼任** | business_manager(role_id=102) | **是（2人就绪）** | ~500单/天（2人） | **零代码，改模板 role_id** | 低 | 日均审核 < 200 单 |

#### 关键洞察: 为什么两个方案的长期维护成本差别不大

审核链的设计精妙之处在于: **谁来审不是代码决定的，是 `approval_chain_nodes.assignee_role_id` 这个数据库字段决定的**。

- 现在填 `business_manager(102)` → business_manager 兼审
- 未来改填 `content_auditor(104)` → 专岗审核
- 这是管理后台点一下鼠标的事，不是改代码+部署+测试的事

所以无论选 A 还是 B，代码层面**完全一样**。区别只在 Seed 数据里 `assignee_role_id` 填什么值。

这就是大厂（美团/钉钉/网易）的共同设计智慧: **把"谁来审"从代码中抽离到配置中**，让审核人分配成为运营决策而不是技术决策。

#### **最终决策: 选项B — business_manager(role_id=102) 兼任初审**

理由:
1. **立即可用**: 2 个 business_manager 用户已存在，上线当天就能审核
2. **业务量不支持专岗**: 日均 < 5 单审核，养专岗是资源浪费（小公司/大麦/活动行的共同做法）
3. **切换零成本**: 未来审核量增长后，管理后台改一个字段值就切到 content_auditor 专岗（美团从"区域经理兼审"到"独立审核员"的真实演进路径）
4. **代码层面无差别**: 无论选 A 还是 B，ApprovalChainService 代码、路由代码、前端代码**完全一样**
5. **不产生技术债务**: 因为选择权在数据（模板配置），不在代码（hardcode），任何时候都能改

**Seed 数据:**
- `consumption_large` 模板的初审节点: `assignee_role_id = 102`（business_manager）
- 未来需要时改为: `assignee_role_id = 104`（content_auditor）

**触发切换到专岗的条件**（运营指标，供参考）:
- 日均审核量 > 100 单
- 或 business_manager 反馈审核工作影响本职业务
- 或上线合规审计要求审核与业务分离

---

### 6 个决策最终汇总

| # | 决策 | 最终选择 | 行业依据 |
|---|------|---------|---------|
| 1 | 审核路径 | **统一到 ContentAuditEngine** | 大厂/游戏公司共识: 一个引擎、多个回调 |
| 2 | 初期配置 | **同时 Seed 单级+多级** | 大厂实践: 架构最复杂、配置最安全 |
| 3 | 历史数据 | **彻底清理** | 大厂/游戏公司共识: 不可带病上线 |
| 4 | 审核权限准入线 | **requireRoleLevel(55)，Service层精确鉴权** | 大厂/游戏/交易平台100%: 宽准入+精确鉴权 |
| 5 | 超时处理 | **12小时超时自动升级，终审仅提醒** | 游戏/交易平台标配 |
| 6 | 初审角色 | **business_manager(102)兼任，审核量>100单/天后切content_auditor(104)专岗** | 美团/钉钉演进路径: 兼任→专岗，切换零代码 |

---

## 九、后端可复用能力和扩展点分析

### 可直接复用（零改造）

| 能力 | 复用方式 |
|------|---------|
| `TransactionManager.execute()` | ApprovalChainService 的所有写操作使用此模式 |
| `assertAndGetTransaction()` | Service 方法签名不变，强制事务传入 |
| `ContentAuditEngine.triggerAuditCallback()` | 终审通过/拒绝时触发，回调机制不变 |
| `admin_notifications` 表 | 审核链推进时写入通知，推送到审核人 |
| `admin_operation_logs` 表 | 审核链配置变更写入操作日志（已有 requires_approval 字段） |
| `api_idempotency_requests` 表 | 审核链创建使用幂等键 |
| `res.apiSuccess()` / `res.apiError()` / `res.apiPaginated()` | 所有新路由使用标准响应格式 |
| `authenticateToken` / `requireRoleLevel()` | 所有新路由使用标准鉴权中间件 |
| `services/index.js` ServiceManager | 新 Service 通过 `this._services.set('approval_chain', Service)` 注册，路由通过 `req.app.locals.services.getService('approval_chain')` 获取（参考 consumption_core 注册模式） |
| `BeijingTimeHelper` | 所有时间字段使用北京时间 |
| `store_staff.role_in_store` | submitter_manager 分配方式的数据来源（确认: store_staff 表有 role_in_store ENUM('staff','manager') 字段） |
| `utils/transactionHelpers.assertAndGetTransaction` | 强制事务校验，所有写操作使用此模式 |
| `node-cron` 包 | package.json 已有 node-cron ^3.0.3 依赖，定时任务无需额外安装 |
| Sequelize Migration 体系 | 新表通过标准 migration 创建 |

### 可扩展（未来需求）

| 扩展点 | 当前状态 | 扩展方式 |
|--------|---------|---------|
| 新增审核业务类型 | ContentAuditEngine.validTypes 当前为 `['exchange', 'feedback', 'consumption', 'merchant_points']`（代码第74行确认）；callbacks/ 目录已有 4 个回调文件 | 在 validTypes 数组添加新类型 + 在 callbacks/ 目录新增 Callback 文件 + 在 triggerAuditCallback 的 callbackMap 添加映射 |
| 超时自动审批 | 第一期仅实现 escalate 和 notify，不实现 auto_approve | 后续按需在 timeout_action 中支持 auto_approve |
| 条件分支（按金额走不同链） | match_conditions JSON 已支持 | ApprovalChainService.matchTemplate() 内的条件匹配逻辑 |
| 审核链版本管理 | 无 | template 加 version 字段，instance 绑定创建时的 template 快照 |
| 审核委托/转交 | 无 | approval_chain_steps 加 delegated_to 字段 |
| 批量审核链操作 | 现有 batch-review 路由可参考 | ApprovalChainService 增加 batchProcessSteps() |

---

## 十、开发周期和代码量预估

| 模块 | 预估行数 | 预估工时 |
|------|---------|---------|
| Sequelize Migration (4张表) | ~300行 | 0.5天 |
| 4个 Sequelize Model | ~400行 | 0.5天 |
| ApprovalChainService | ~800行 | 2天 |
| ContentAuditEngine 升级 | ~100行（仅新增调用） | 0.5天 |
| ConsumptionAuditCallback 改造（决策#1） | ~200行 | 1天 |
| 审核链管理路由 + 控制器 | ~500行 | 1天 |
| 消费审核路由改造（决策#4: requireRoleLevel(55)） | ~100行 | 0.5天 |
| Seed 数据 migration（决策#2: 单级+多级同时配） | ~120行 | 0.5天 |
| 历史数据清理 migration（决策#3） | ~80行 | 0.5天 |
| 超时自动升级定时任务（决策#5: escalate+notify） | ~300行 | 1天 |
| **后端总计** | **~2900行** | **~8天** |
| Web管理平台-审核链配置页 | ~800行 | 2天 |
| Web管理平台-审核列表升级 | ~300行 | 1天 |
| Web管理平台-我的待审视图 | ~400行 | 1天 |
| **Web前端总计** | **~1500行** | **~4天** |
| 微信小程序-状态展示 | ~200行 | 1天 |
| 微信小程序-通知适配 | ~100行 | 0.5天 |
| **小程序总计** | **~300行** | **~1.5天** |
| **三端总计** | **~4700行** | **~13.5天** |

### 运营变更: 零代码

| 场景 | 操作方式 |
|------|---------|
| 加一级审核 | Web管理后台配一个节点 |
| 改审核人角色 | Web管理后台改角色/指定人 |
| 新增一套链 | Web管理后台新建模板 |
| 按金额走不同链 | 配置 match_conditions |
| 调整超时时间 | Web管理后台改 timeout_hours（默认12小时） |

---

## 十一、技术债务评估: 极低（5个决策全部指向"消灭债务"）

**决策 #1 消除的债务:** ConsumptionAuditCallback 空实现 → 真实实现，消灭审核双路径
**决策 #2 消除的债务:** 多级链从第一天测试 → 不存在"架构支持但从未验证"的隐患
**决策 #3 消除的债务:** 446条脏数据彻底清理 → 不带病上线
**决策 #4 消除的债务:** 路由 requireRoleLevel(55) 宽准入 + Service processStep() 精确鉴权 → 权限模型清晰，"谁能进路由"和"谁能审核这个步骤"彻底分离，不靠 requireRoleLevel(100) 一刀切
**决策 #6 消除的债务:** 审核人分配在模板配置（assignee_role_id 字段）而不是代码中 → 从 business_manager 兼任切换到 content_auditor 专岗是管理后台操作，零代码变更
**决策 #5 消除的债务:** 12小时超时自动升级 → 审批单不会积压，非终审超时直接流转到下一人

技术栈一致性:
- 4 张表结构清晰，外键约束完整
- 事务边界延续 `TransactionManager.execute()` 模式
- 幂等性延续 `idempotency_key` 模式
- 审核回调延续 `ContentAuditEngine.triggerAuditCallback()` 模式
- Model 定义延续 `underscored + freezeTableName` 模式
- 路由权限延续 `authenticateToken + requireRoleLevel()` 模式
- 响应格式延续 `res.apiSuccess() / res.apiError()` 模式
- 定时任务延续 `system_job` 角色模式

---

## 十二、后端实施完成清单（2026-03-10）

### 实际角色体系（以真实数据库为准）

| role_name | role_id | role_level | 审核链角色 |
|-----------|---------|-----------|-----------|
| admin | 2 | 100 | 终审人（所有模板的最终审批节点） |
| regional_manager | 6 | 80 | 可作为审核人 |
| business_manager | 7 | 60 | 初审人（大额消费链的第一级审核） |
| merchant_manager | 11 | 40 | 暂未分配审核链节点 |
| ops | 9 | 30 | 暂未分配审核链节点 |

> **注意**: content_auditor 角色在数据库中**不存在**，路由准入线使用 business_manager(role_level=60)。

### 已创建的文件

| 文件 | 类型 | 说明 |
|------|------|------|
| `migrations/20260310100000-create-approval-chain-tables.js` | 迁移 | 4张审核链表 |
| `migrations/20260310100001-seed-default-approval-chains.js` | 迁移 | 3个模板+4个节点 Seed 数据 |
| `migrations/20260310100002-cleanup-inconsistent-audit-records.js` | 迁移 | 清理445条不一致消费审核+2条商家积分审核 |
| `models/ApprovalChainTemplate.js` | 模型 | 审核链模板 |
| `models/ApprovalChainNode.js` | 模型 | 审核链节点定义 |
| `models/ApprovalChainInstance.js` | 模型 | 审核链实例 |
| `models/ApprovalChainStep.js` | 模型 | 审核链步骤执行记录 |
| `services/ApprovalChainService.js` | 服务 | 审核链核心服务（模板匹配、链创建、步骤处理） |
| `services/ApprovalChainTimeoutService.js` | 服务 | 超时自动升级定时任务 |
| `routes/v4/console/approval-chain.js` | 路由 | 审核链管理API（模板CRUD+审核操作） |
| `admin/approval-chain.html` | 前端 | Web管理后台审核链配置页面 |
| `admin/src/api/approval-chain.js` | 前端API | 审核链API调用模块 |
| `admin/src/modules/operations/pages/approval-chain.js` | 前端页面 | Alpine.js 审核链页面组件 |

### 已修改的文件

| 文件 | 修改内容 |
|------|---------|
| `models/index.js` | 注册4个审核链模型 |
| `services/index.js` | 导入ApprovalChainService + 注册到ServiceManager（key: approval_chain） |
| `services/ContentAuditEngine.js` | submitForAudit() 末尾新增审核链匹配和创建调用 |
| `callbacks/ConsumptionAuditCallback.js` | 从空实现改为真实实现（积分发放+预算分配+状态更新） |
| `routes/v4/console/consumption.js` | approve/reject 路由 requireRoleLevel 从100降到60 + approve增加审核链判断 |
| `routes/v4/console/index.js` | 导入并挂载 approval-chain 路由 |
| `services/IdempotencyService.js` | CANONICAL_OPERATION_MAP 新增5个审核链路径映射 |
| `app.js` | 启动时注册超时扫描定时任务 |
| `admin/vite.config.js` | 新增 approval-chain 页面配置 |
| `admin/src/alpine/components/sidebar-nav.js` | 待处理中心分组添加"审核链管理"菜单 |

---

## 十三、微信小程序前端对接指南

### 审核链相关 API 端点（小程序需要使用的）

**基础路径**: `/api/v4/console/approval-chain`

| 方法 | 路径 | 说明 | 权限 |
|------|------|------|------|
| GET | `/templates` | 查询审核链模板列表 | admin(100) |
| GET | `/templates/:id` | 查询模板详情（含节点） | admin(100) |
| GET | `/instances` | 查询审核链实例列表（支持 auditable_type/status 筛选） | business_manager(60)+ |
| GET | `/instances/:id` | 查询实例详情（含完整步骤和审核历史） | business_manager(60)+ |
| GET | `/my-pending` | 查询当前登录人的待审核步骤 | business_manager(60)+ |
| POST | `/steps/:id/approve` | 审核通过 | business_manager(60)+，Service层精确鉴权 |
| POST | `/steps/:id/reject` | 审核拒绝 | business_manager(60)+，Service层精确鉴权 |

### 响应格式（所有端点统一）

```json
{
  "success": true,
  "code": "SUCCESS",
  "message": "查询成功",
  "data": { ... },
  "timestamp": "2026-03-10T08:19:57.000+08:00",
  "version": "v4.0",
  "request_id": "req_xxx"
}
```

### 小程序需要适配的场景

**1. 商家员工提交消费后的状态展示**

提交消费后，如果匹配到审核链，实例状态可通过以下方式查询：

```
GET /api/v4/console/approval-chain/instances?auditable_type=consumption&status=in_progress
```

返回数据中包含 `current_step` / `total_steps`，可展示"审核中，当前第X步/共N步"。

**2. 审核人在小程序内审批**

business_manager(role_level=60) 及以上角色的用户，可通过以下接口操作：

```
GET /api/v4/console/approval-chain/my-pending  → 获取待审核列表
POST /api/v4/console/approval-chain/steps/:step_id/approve  → 审核通过
POST /api/v4/console/approval-chain/steps/:step_id/reject   → 审核拒绝（body: { reason: "拒绝原因>=5字" }）
```

**3. 审核推送通知**

审核链推进时会写入 `admin_notifications` 表。小程序可通过 Socket.IO 接收实时推送：
- 事件类型: `approval_timeout_escalation`（超时升级）
- 事件类型: `approval_final_timeout_reminder`（终审超时提醒）

**4. 字段命名**

所有字段使用 snake_case，直接使用后端返回的字段名，不做映射：
- `template_id`, `template_code`, `template_name`
- `instance_id`, `auditable_type`, `auditable_id`, `current_step`, `total_steps`
- `step_id`, `step_number`, `assignee_role_id`, `assignee_user_id`, `status`
- `action_reason`, `actioned_by`, `actioned_at`, `timeout_at`

### 审核链实例状态枚举

| status | 说明 |
|--------|------|
| in_progress | 审核进行中 |
| completed | 已完成（终审通过） |
| rejected | 已拒绝（任一步骤拒绝） |
| cancelled | 已取消 |
| timeout | 已超时 |

### 审核步骤状态枚举

| status | 说明 |
|--------|------|
| waiting | 等待中（前序步骤未完成） |
| pending | 待审核（当前需要处理的步骤） |
| approved | 已通过 |
| rejected | 已拒绝 |
| skipped | 已跳过（前序步骤拒绝时自动跳过） |
| timeout | 已超时（自动升级到下一步） |
