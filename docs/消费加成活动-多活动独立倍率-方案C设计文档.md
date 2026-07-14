# 消费加成活动 · 多活动独立倍率（方案C）设计文档

> 文档版本：v2.0（已拍板，待实施） | 日期：2026-07-15
> 状态：**已拍板** —— 关键决策已确认，本文档为实施依据。尚未改动代码/数据库。
> 依据：现有代码 `services/consumption/CoreService.js`、`services/lottery/EventBudgetService.js`、
> `models/EventBudgetCollectionRule.js`、`models/ConsumptionRecord.js`（真实结构，非推测）。
>
> **已拍板决策（v2.0 新增）**：
> 1. 活动范围：全平台活动 + 单商家专属活动**并存**（靠 store_ids/merchant_ids 的 NULL=不限语义，一张表覆盖）。
> 2. 冲突处理：**商家专属活动优先于全平台活动**（在搞专属活动的商家消费用商家的，否则用平台的）。
> 3. 全局旧配置 `system_settings.points/activity_bonus_rate`：**删除**（不保留兜底）。
> 4. 小程序展示：**要展示**当前生效活动（新增 C 端查活动接口）。
> 5. store_id 可靠性：已核实 `consumption_records.store_id` 为 NOT NULL、现网 100% 填充，按门店命中可靠。
> 6. 用户无需选活动：后端按"消费场景（商家/门店/时间）自动匹配"，用户/商家零选择成本。
> 7. 人群定向（segment/等级）：本期不做（YAGNI）。

---

## 一、要解决的问题

**现状**：消费可见积分的活动加成率是全局单值 `system_settings.points/activity_bonus_rate`，
全平台只有一个值，无法做到「活动1=0.5、活动2=0.7」这类按活动分别设置。

**目标**：支持多个消费加成活动并行，各自独立倍率、独立时间窗、独立生效范围（门店/商家），
互不干扰。要求长期低维护、低技术债、贴合现有技术栈。

---

## 二、为什么选方案C（新建专用表），而非复用抽奖倍率引擎

评估了复用现有 `RewardMultiplierCampaign`（抽奖水晶倍率引擎）的方案B，结论是**不复用**，原因基于代码事实：

| 对比点 | 复用 RewardMultiplierCampaign（方案B） | 新建 consumption_bonus_rules（方案C） |
|---|---|---|
| 活动绑定 | 强绑定 `lottery_campaign_id`（NOT NULL），消费活动被迫挂靠抽奖活动，语义扭曲 | 独立配置，消费活动无需依赖抽奖活动 |
| 字段匹配度 | 一半字段抽奖专用（reward_scope/extra_cost_limit/rounding_mode），消费用不上 | 字段全部为消费加成语义，无包袱 |
| 技术债 | 背抽奖包袱、语义混淆 | 语义干净 |
| 蓝本 | — | 照 `EventBudgetCollectionRule` 成熟模式（同为"消费审核时按活动/门店/商家/时间窗命中"，几乎同构） |

**核心判断**：方案C 不是"另起炉灶"，而是"复用项目已验证的 `EventBudgetCollectionRule` 设计模式"，
与现有架构风格完全一致（配置实体 + Service 命中判定 + ServiceManager + 提交时锁定）。

---

## 三、新增数据表设计：consumption_bonus_rules

结构借鉴 `event_budget_collection_rules`（已生产验证的成熟模式），字段全部为消费加成语义。

| 字段 | 类型 | 约束 | 说明 |
|---|---|---|---|
| `consumption_bonus_rule_id` | BIGINT | PK, AUTO_INCREMENT | 主键 |
| `rule_name` | VARCHAR(100) | NOT NULL | 规则名（对内运营识别，如"双11消费加成"） |
| `display_name` | VARCHAR(100) | NOT NULL | 对用户展示名（如"双11消费多送50%积分"） |
| `bonus_rate` | DECIMAL(4,2) | NOT NULL | **核心**：加成率（如 0.50=多送50%）；getter 转数字 |
| `store_ids` | JSON | NULL | 命中门店ID数组（消费 store_id 在列表内才命中）；NULL=不限 |
| `merchant_ids` | JSON | NULL | 命中商家ID数组（消费 merchant_id 在列表内才命中）；NULL=不限 |
| `start_at` | DATETIME | NULL | 生效开始（北京时间）；NULL=不限 |
| `end_at` | DATETIME | NULL | 生效结束（北京时间）；NULL=不限 |
| `priority` | INT | NOT NULL, DEFAULT 0 | 优先级（多规则命中取最高优先级一条，越大越优先） |
| `max_bonus_rate` | DECIMAL(4,2) | NOT NULL, DEFAULT 2.00 | 加成率硬上限（配合总倍数 3.0 封顶，防配错） |
| `status` | ENUM('active','inactive') | NOT NULL, DEFAULT 'inactive' | 开关 |
| `remark` | VARCHAR(500) | NULL | 备注 |
| `created_at`/`updated_at` | DATETIME | | 时间戳（underscored） |

**设计说明**：
- 配置实体（低频变更），主键自增数字，符合项目"事务实体用数字ID"约定。
- `store_ids`/`merchant_ids` JSON 弱引用（NULL=不限），与 `EventBudgetCollectionRule` 完全一致。
- `bonus_rate` 用 DECIMAL + getter 转数字（遵循项目"DECIMAL 返回字符串问题已用 getter 解决"约定）。
- 字符集 utf8mb4_unicode_ci（项目标准）。
- **命中人群定向（segment/growth_level）暂不做**：消费加成按"门店/商家/时间窗"命中已够用；
  若未来要按人群，可加 target 子表（照 RewardMultiplierTarget 模式），当前 YAGNI 不做。

---

## 四、命中判定逻辑（复用现有成熟模式）

新建 Service 方法 `resolveConsumptionBonusRate(params)`，命中判定借鉴 `EventBudgetService.resolveCollectionTarget`
的时间窗/门店/商家判定，并叠加**"商家专属优先"**的分组决策（已拍板 2）：

```
输入：{ store_id, merchant_id, now, transaction }
流程：
  1. 查 status='active' 的规则，逐条过滤命中（时间窗 + 门店 + 商家条件，同 resolveCollectionTarget）
     - 时间窗：start_at/end_at（NULL 不限）
     - 门店条件：store_ids 非空时，消费 store_id 必须在列表内
     - 商家条件：merchant_ids 非空时，消费 merchant_id 必须在列表内
  2. 将命中规则分两组：
     - 商家专属组：store_ids 或 merchant_ids 非空（针对特定商家/门店）
     - 全平台组：store_ids 且 merchant_ids 均为 NULL（面向所有商家）
  3. 【商家专属优先】商家专属组非空 → 取该组 priority 最高一条；
     否则取全平台组 priority 最高一条
  4. 命中 → 返回 min(bonus_rate, max_bonus_rate)；无命中 → 返回 0
```

> **判定"是否商家专属"的口径**：规则的 `store_ids` 或 `merchant_ids` 任一非空即视为"商家专属"；
> 两者皆 NULL 即"全平台"。同组内多规则命中仍按 priority 取最高（同层取优）。

---

## 五、发放链路改动点（改动极小）

### 改动点1：提交时锁定（consumption/CoreService.js 第 215-224 行）

**现状**：
```
读 system_settings.points/activity_bonus_rate（全局单值）→ 锁定到 activity_bonus_rate_locked
```

**改为**：
```
调 ConsumptionBonusService.resolveConsumptionBonusRate({ store_id, merchant_id, ... })
→ 命中活动返回其 bonus_rate → 锁定到 activity_bonus_rate_locked
```

### 发放侧：完全不动 ✅

`_buildBonusRules`（第 644 行）读的是 `record.activity_bonus_rate_locked`，
它不关心这个值来自全局配置还是活动规则。所以**发放逻辑、加成笔计算、总倍数封顶 3.0、防复利全部不变**。
这是方案C 最大的优势：只改"值从哪来"，不改"怎么发"。

### ConsumptionRecord 表：不动 ✅

`activity_bonus_rate_locked` 字段已存在，语义不变（锁定的活动加成率），无需迁移。

---

## 六、其它配套

| 项 | 处理 |
|---|---|
| 全局 `system_settings.points/activity_bonus_rate` | **废弃删除**（你要求不兼容旧接口，直接移除白名单项 + 相关读取） |
| 新建 Service | `ConsumptionBonusService`（静态类，ServiceManager 注册键 `consumption_bonus`）；写操作收口、外部传入事务 |
| 路由 | 新增运营配置 CRUD 路由（console 域），照 `event-budget-collection-rules.js` 模式，走 ServiceManager |
| Web 管理后台 | ✅ 已完成：新增"消费加成活动"配置页（`admin/consumption-bonus-management.html` 三件套 + 侧边栏/权限/构建注册，已 build） |
| **C 端展示接口** | ✅ 已完成：`GET /api/v4/user/consumption-bonus`，返回"当前对该门店/商家生效的活动"展示信息。**脱敏**：只下发 display_name + bonus_rate + 时间窗，不下发 priority/上限/商家ID列表等内部字段（详见第十节） |
| 迁移 | `migration:create` 创建 consumption_bonus_rules 表（完整字段+约束+注释，含 down 回滚） |
| 测试 | `ConsumptionBonusService` 命中判定单测（时间窗/门店/商家/**商家专属优先**/上限夹紧）+ 提交锁定集成测试 |

---

## 七、实施步骤（拍板后执行顺序）

```
1. 迁移建表 consumption_bonus_rules（migration:create）
2. 新建 models/ConsumptionBonusRule.js
3. 新建 services/consumption/BonusService.js（或 ConsumptionBonusService）
   - resolveConsumptionBonusRate（命中判定，复用 resolveCollectionTarget 模式）
   - 规则 CRUD（写操作收口 + 事务）
4. 改 consumption/CoreService.js 提交锁定逻辑（仅第 215-224 行）
5. 删除 system_settings.points/activity_bonus_rate（白名单 + 读取处）
6. 新增 console 路由（规则 CRUD）
7. ServiceManager 注册 consumption_bonus
8. 写测试 + 跑全量质量检查（ESLint/Prettier/Jest）
9. 出前端对接文档（管理后台配置页 + 小程序若需展示活动加成）
```

---

## 八、风险与注意事项

1. **多活动命中冲突**：当前设计"取最高优先级一条"（不叠加），与 `EventBudgetCollectionRule` 一致。
   若未来要"多活动叠加"，需改合并策略——当前按 YAGNI 只做取最高。
2. **总倍数封顶不变**：等级倍率 + 活动加成率合计仍受 3.0 硬封顶（`_buildBonusRules` 的 rateHeadroom 截断），
   本方案不触碰该保护。
3. **提交时锁定语义不变**：活动加成率在小票提交时锁定，活动中途启停/调率不影响已提交小票（用户承诺一致）。
4. **数据敏感**：消费加成率 `bonus_rate` 属营销激励，可对用户展示活动本身（"双11多送50%"）；
   但预算账户放大逻辑仍保密（见成长等级倍率同款红线）。

---

## 九、工作量与影响评估

| 维度 | 评估 |
|---|---|
| 新增表 | 1 张（consumption_bonus_rules） |
| 新增模型/Service | 1 模型 + 1 Service |
| 改动现有代码 | 仅 consumption/CoreService.js 提交锁定 1 处（发放侧不动） |
| 删除 | system_settings 全局活动加成率配置 |
| 数据库迁移 | 1 个建表迁移（可回滚） |
| 前端 | 管理后台新增配置页（前端负责，另出文档） |
| 对现有功能影响 | 低（发放链路、抽奖、等级倍率均不受影响） |

---

## 十、微信小程序前端对接（C 端展示）

> 后端已实现并端到端验证通过，小程序前端按本节对接即可。完整版另见
> `docs/消费加成活动-前端对接说明.md`（含 Web 管理后台 + 小程序两端）。

### 10.1 用途

小程序在门店页/扫码页展示"本店当前有什么消费加成活动"（如"本店双11消费多送50%积分"），
用于激励消费。**用户无需选择活动**：消费时后端按门店/商家/时间自动匹配，展示只是告知。

### 10.2 接口契约

```
GET /api/v4/user/consumption-bonus?store_id=<门店ID>&merchant_id=<商家ID>
Header: Authorization: Bearer <access_token>   // 需登录
```

- `store_id` / `merchant_id` 至少传一个（查该门店/商家当前生效活动）；都不传则查全平台活动。

### 10.3 返回结构（真实实测）

有生效活动：

```json
{
  "success": true,
  "code": "SUCCESS",
  "message": "获取消费加成活动成功",
  "data": {
    "active": true,
    "activity": {
      "display_name": "双11消费多送50%积分",
      "bonus_rate": 0.5,
      "start_at": "2026-11-11T00:00:00.000+08:00",
      "end_at": "2026-11-12T00:00:00.000+08:00"
    }
  }
}
```

无生效活动：`data: { "active": false, "activity": null }`（前端不展示活动条）。

### 10.4 前端展示与字段说明

| 字段 | 类型 | 说明 |
|---|---|---|
| `data.active` | boolean | 是否有生效活动（false 时不展示） |
| `data.activity.display_name` | string | 活动展示名（直接展示，如"双11消费多送50%积分"） |
| `data.activity.bonus_rate` | number | 加成率（0.5=多送50%，可 `bonus_rate*100` 转百分比展示） |
| `data.activity.start_at` / `end_at` | string\|null | 活动起止（北京时间；null=不限） |

### 10.5 数据边界（安全红线，小程序必须遵守）

- ✅ **C 端接口只下发**：`display_name` / `bonus_rate` / `start_at` / `end_at`（营销展示信息）。
- ❌ **不下发、前端不应尝试获取**：`priority` / `max_bonus_rate` / `store_ids` / `merchant_ids` /
  `rule_name` 等内部配置字段；预算账户放大逻辑（商业机密，同成长等级倍率红线）。

### 10.6 注意事项

1. **snake_case 解构**：`const { bonus_rate } = activity`，勿写驼峰（后端 snake_case，写驼峰取到 undefined）。
2. **时间北京时区**：`start_at`/`end_at` 已是北京时间，直接展示。
3. **无需用户选活动**：命中全自动，不存在"选错活动"，前端只做展示、不加选择项。

---

## 十一、Web 管理后台接口手册（运营配置端）

> Web 管理后台配置页（`admin/consumption-bonus-management.html`）后端已实现并联通。
> 本节为管理端 CRUD 接口的字段级手册，供后续维护该页或其它端对接管理接口时参考。

### 11.1 接口清单

所有接口需管理员登录（role_level ≥ 100），统一 `Authorization: Bearer <token>`。

| 操作 | 方法 | 路径 |
|---|---|---|
| 列表（分页） | GET | `/api/v4/console/consumption-bonus-rules?status=&page=1&page_size=20` |
| 详情 | GET | `/api/v4/console/consumption-bonus-rules/:id` |
| 创建 | POST | `/api/v4/console/consumption-bonus-rules` |
| 更新 | PUT | `/api/v4/console/consumption-bonus-rules/:id` |
| 启停 | PATCH | `/api/v4/console/consumption-bonus-rules/:id/status` |
| 删除 | DELETE | `/api/v4/console/consumption-bonus-rules/:id` |

> ⚠️ 路径前缀是 `/api/v4/console/consumption-bonus-rules`（console 域根路径下，**不带 /lottery**）。

### 11.2 创建/更新请求体（snake_case，字段名 = 数据库列名）

```json
{
  "rule_name": "双11消费加成",
  "display_name": "双11消费多送50%积分",
  "bonus_rate": 0.5,
  "store_ids": null,
  "merchant_ids": null,
  "start_at": "2026-11-11T00:00:00+08:00",
  "end_at": "2026-11-12T00:00:00+08:00",
  "priority": 0,
  "max_bonus_rate": 2.0,
  "status": "active",
  "remark": ""
}
```

启停请求体（PATCH /:id/status）：`{ "status": "active" }`

### 11.3 字段说明

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `rule_name` | string | 是 | 对内规则名（运营识别） |
| `display_name` | string | 是 | 对用户展示名（会下发给小程序） |
| `bonus_rate` | number | 是 | 加成率，如 0.5=多送50%积分 |
| `store_ids` | number[] \| null | 否 | 命中门店ID数组；**null=不限门店** |
| `merchant_ids` | number[] \| null | 否 | 命中商家ID数组；**null=不限商家** |
| `start_at` | string \| null | 否 | 生效开始（北京时间 ISO）；null=不限 |
| `end_at` | string \| null | 否 | 生效结束（北京时间 ISO）；null=不限 |
| `priority` | number | 否 | 优先级（同组多命中取最高），默认 0 |
| `max_bonus_rate` | number | 否 | 加成率上限，默认 2.0（防配错） |
| `status` | string | 否 | active/inactive，默认 inactive |
| `remark` | string \| null | 否 | 备注 |

### 11.4 全平台 vs 商家专属的配置方式（关键）

- **全平台活动**：`store_ids` 和 `merchant_ids` **都留 null**。
- **商家专属活动**：填 `merchant_ids`（如 `[80001]`）或 `store_ids`（如 `[90001, 90002]`）。
- 判定规则：`store_ids` 或 `merchant_ids` 任一非空 → 商家专属（命中时优先于全平台）。

### 11.5 前端表单校验（与后端一致，减少往返）

- `bonus_rate` 必须 ≥ 0，且 ≤ `max_bonus_rate`（后端会拦截，前端也应提示）。
- `store_ids`/`merchant_ids` 若填必须是数组。
- 总加成有硬封顶（等级倍率 + 活动加成率合计 ≤ 3.0），单活动 `bonus_rate` 建议不超过 2.0。

### 11.6 管理端 vs C 端字段可见性

- 管理后台前端可见**全部字段**（运营配置需要）。
- 小程序 C 端只能拿到脱敏后的展示字段（见第十节 10.5）。

---

**评审结论**：☑ 通过，已按本方案实施（后端 + Web 管理后台前端均已完成并验证；小程序 C 端待对接）
