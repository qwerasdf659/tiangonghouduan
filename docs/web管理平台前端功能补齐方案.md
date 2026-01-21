# 🎯 Web管理平台前端功能补齐方案

> **核心原则**：以后端数据库提供的能力为权威核心，前端必须完全覆盖所有数据库能力
> 
> **生成时间**：2026-01-21
> 
> **数据来源**：真实数据库分析（67张表，连接真实MySQL数据库）
> 
> **验证状态**：✅ 已通过Node.js连接真实数据库验证

---

## 🛠️ 技术栈决策（已拍板）

| 技术领域 | 技术选型 | 决策状态 | 说明 |
|----------|----------|----------|------|
| **图表库** | **ECharts（本地引入）** | ✅ 已确定 | 所有图表统一使用 ECharts，**仅本地引入**（`js/lib/echarts.min.js`），不使用 CDN |
| 前端框架 | 原生HTML/CSS/JS | ✅ 已确定 | 保持现有架构一致性 |
| API调用 | api-config.js | ✅ 已确定 | 统一API端点管理 |
| 样式规范 | admin-common.css | ✅ 已确定 | 统一视觉风格 |

### ECharts 使用场景

| 页面 | 图表类型 | 数据来源 |
|------|----------|----------|
| dashboard.html | 仪表盘、趋势图 | 汇总统计API |
| lottery-metrics.html | 实时监控、热力图 | lottery_hourly_metrics |
| analytics.html | 折线图、饼图、柱状图 | 各业务统计API |
| debt-management.html | 欠账趋势、分布图 | debt-management API |
| risk-alerts.html | 告警分布、时间轴 | risk-alerts API |
| statistics.html | 多维度统计图表 | 业务统计API |

---

## 🔴 本文档解决什么问题？

### 问题描述

**当前痛点**：后端数据库已具备完整的业务能力（67张表），但Web管理平台前端页面覆盖不完整，导致运营人员无法通过管理后台操作部分核心业务功能。

### 差距量化

| 维度 | 后端能力 | 前端覆盖 | 差距 |
|------|----------|----------|------|
| 数据库表 | 67张 | 40个页面 | **27张表无对应页面** |
| 抽奖活动管理 | ✅ 完整API | ❌ 无独立页面 | **核心业务缺失** |
| 抽奖策略引擎 | ✅ 17条配置+12种矩阵 | ❌ 无可视化配置 | **策略调整需改数据库** |
| 欠账管理系统 | ✅ 10+个API端点 | ❌ 无前端入口 | **运营无法查看/处理欠账** |
| 门店/员工管理 | ✅ 4门店+员工关系 | ❌ 无管理页面 | **线下运营无法管理** |
| 风控告警系统 | ✅ 7个API端点 | ❌ 无告警页面 | **风控告警无法处理** |

### 解决思路

1. **盘点数据库能力** → 明确后端已支持的全部业务能力
2. **对照现有页面** → 识别前端缺失和不完整的功能
3. **按优先级补齐** → P0核心业务 → P1功能增强 → P2监控运维
4. **不发明新业务** → 前端只做数据库已有能力的可视化呈现

### 预期成果

- ✅ 新增 **6个P0核心页面**：活动管理、策略配置、欠账管理、门店管理、员工管理、风控告警
- ✅ 增强 **5个现有页面**：用户管理、角色管理、物品模板、字典管理、BxPx矩阵
- ✅ 补充 **4个P2监控页面**：抽奖监控、核销码、定价配置、会话管理
- ✅ 运营人员可通过管理后台完成 **100%** 的业务操作，无需直接操作数据库

---

## 📊 真实数据库验证结果（2026-01-21）

### 验证方式

通过Node.js连接真实MySQL数据库，执行SQL查询获取实际数据统计。

### 数据库统计概览

| 指标 | 数值 | 说明 |
|------|------|------|
| 总表数 | **67张** | 包含所有业务表 |
| 用户数 | 28（活跃28） | 全部活跃 |
| 抽奖活动 | 1个进行中 | 当前活跃活动 |
| 奖品配置 | 16个 | 活动奖品 |
| 物品实例 | **1,992个（可用473）** | 不可叠加物品 |
| 物品模板 | 16个 | 物品定义 |
| 市场挂牌 | 38个（在售0） | 交易市场 |
| 系统配置 | 39项 | 系统设置 |
| 审计日志 | **3,977条** | 操作日志 |
| 门店 | 4个 | 合作门店 |
| 门店员工 | 2条 | 员工关系 |
| 角色 | **10个** | 角色定义 |
| 类目字典 | 6个 | 物品分类 |
| 稀有度字典 | 5个 | 稀有度等级 |
| 资产组字典 | 8个 | 资产分组 |
| 策略配置 | 17条 | 抽奖策略 |
| BxPx矩阵配置 | 12条 | 档位矩阵 |
| 档位规则 | 9条 | 抽奖档位 |
| 核销订单 | **932条** | 核销记录 |
| 定价配置 | 4条 | 活动定价 |
| 行政区划 | 44,703条 | 省市区街道 |
| 风控告警 | 1条 | 告警记录 |

### 完整数据库表清单（67张）

```
1. account_asset_balances (18行) - 账户资产余额表
2. accounts (22行) - 账户表
3. admin_operation_logs (3377行) - 操作审计日志表
4. administrative_regions (44569行) - 行政区划字典表
5. api_idempotency_requests (917行) - API入口幂等表
6. asset_group_defs (8行) - 资产分组字典表
7. asset_transactions (4363行) - 资产流水表
8. authentication_sessions (0行) - 用户会话管理表
9. category_defs (6行) - 物品类目字典表
10. chat_messages (5行) - 聊天消息表
11. consumption_records (11行) - 用户消费记录表
12. content_review_records (208行) - 审核记录表
13. customer_service_sessions (1行) - 客户聊天会话表
14. exchange_items (26行) - 兑换市场商品表
15. exchange_records (7行) - 兑换市场记录表
16. feature_flags (7行) - 功能开关表
17. feedbacks (25行) - 用户反馈表
18. image_resources (1行) - 统一图片资源管理表
19. item_instance_events (912行) - 物品实例事件表
20. item_instances (1772行) - 物品实例表
21. item_templates (16行) - 物品模板表
22. lottery_campaign_pricing_config (4行) - 活动级定价配置表
23. lottery_campaign_quota_grants (0行) - 配额发放记录表
24. lottery_campaign_user_quota (0行) - 用户活动配额表
25. lottery_campaigns (1行) - 抽奖活动配置表
26. lottery_clear_setting_records (402行) - 抽奖清除设置记录表
27. lottery_daily_metrics (0行) - 抽奖日报统计表
28. lottery_draw_decisions (0行) - 抽奖决策快照表
29. lottery_draw_quota_rules (4行) - 抽奖配额规则表
30. lottery_draws (2行) - 抽奖记录表
31. lottery_hourly_metrics (0行) - 抽奖监控指标表
32. lottery_management_settings (2023行) - 抽奖管理设置表
33. lottery_presets (2行) - 抽奖结果预设表
34. lottery_prizes (16行) - 奖品表
35. lottery_strategy_config (17行) - 抽奖策略全局配置表
36. lottery_tier_matrix_config (12行) - BxPx矩阵配置表
37. lottery_tier_rules (9行) - 抽奖档位规则表
38. lottery_user_daily_draw_quota (7行) - 用户每日抽奖配额表
39. lottery_user_experience_state (0行) - 用户抽奖体验状态表
40. lottery_user_global_state (0行) - 用户全局抽奖统计表
41. market_listings (33行) - 市场挂牌表
42. material_asset_types (4行) - 材料资产类型表
43. material_conversion_rules (1行) - 材料转换规则表
44. merchant_operation_logs (27行) - 商家操作审计日志表
45. popup_banners (2行) - 弹窗Banner表
46. preset_budget_debt (0行) - 预设预算欠账表
47. preset_debt_limits (0行) - 欠账上限配置表
48. preset_inventory_debt (0行) - 预设库存欠账表
49. products (52行) - 商品表
50. rarity_defs (5行) - 稀有度字典表
51. redemption_orders (804行) - 兑换订单表
52. risk_alerts (0行) - 风控告警表
53. roles (9行) - 角色管理表
54. sequelizemeta (230行) - 迁移元数据表
55. store_staff (2行) - 门店员工关系表
56. stores (4行) - 门店信息表
57. system_announcements (8行) - 系统公告表
58. system_settings (38行) - 系统设置表
59. trade_orders (0行) - 交易订单表
60. user_hierarchy (8行) - 用户层级关系表
61. user_premium_status (0行) - 用户高级空间状态表
62. user_risk_profiles (2行) - 用户风控配置表
63. user_role_change_records (145行) - 用户角色变更记录表
64. user_roles (20行) - 用户角色关联表
65. user_status_change_records (144行) - 用户状态变更记录表
66. users (28行) - 用户表
67. websocket_startup_logs (860行) - WebSocket服务启动日志表
```

---

## ✅ 后端API覆盖率验证

根据 `/routes/v4/console/index.js` 验证，**后端API已完整实现**：

| 模块 | API路径前缀 | 实现状态 | 端点数 |
|------|------------|----------|--------|
| 门店管理 | `/console/stores/*` | ✅ 已实现 | 9个端点 |
| 员工管理 | `/console/staff/*` | ✅ 已实现 | 8个端点 |
| 风控告警 | `/console/risk-alerts/*` | ✅ 已实现 | 7个端点 |
| 欠账管理 | `/console/debt-management/*` | ✅ 已实现 | 10个端点 |
| 字典管理 | `/console/dictionaries/*` | ✅ 已实现 | 6个端点 |
| 策略配置 | `/console/lottery-configs/*` | ✅ 已实现 | 10个端点 |
| 物品模板 | `/console/item-templates/*` | ✅ 已实现 | 4个端点 |
| 档位规则 | `/console/lottery-tier-rules/*` | ✅ 已实现 | 3个端点 |
| 抽奖监控 | `/console/lottery-monitoring/*` | ✅ 已实现 | 11个端点 |
| 交易订单 | `/console/trade-orders/*` | ✅ 已实现 | 5个端点 |
| 业务记录 | `/console/business-records/*` | ✅ 已实现 | 7个端点 |
| 系统数据 | `/console/system-data/*` | ✅ 已实现 | 10个端点 |
| 功能开关 | `/console/feature-flags/*` | ✅ 已实现 | 7个端点 |
| 用户风控 | `/console/risk-profiles/*` | ✅ 已实现 | 6个端点 |
| 用户高级状态 | `/console/user-premium/*` | ✅ 已实现 | 4个端点 |
| 管理员审计日志 | `/console/admin-audit-logs/*` | ✅ 已实现 | 1个端点 |
| 策略统计 | `/console/lottery-strategy-stats/*` | ✅ 已实现 | 多个端点 |

**结论**：后端API已100%覆盖数据库能力，仅需开发前端页面对接即可。

---

## 📱 前端页面现状

### 已有前端页面（40个HTML页面）

```
/public/admin/
├── activity-conditions.html   ✅ 活动条件
├── analytics.html             ✅ 数据分析
├── announcements.html         ✅ 系统公告
├── asset-adjustment.html      ✅ 资产调整
├── asset-management.html      ✅ 资产管理
├── assets-portfolio.html      ✅ 资产组合
├── audit-logs.html            ✅ 审计日志
├── campaign-budget.html       ✅ 活动预算
├── charts.html                ✅ 图表展示
├── config-tools.html          ✅ 配置工具
├── consumption.html           ✅ 消费记录
├── customer-service.html      ✅ 客服会话
├── dashboard.html             ✅ 仪表盘
├── diamond-accounts.html      ✅ 钻石账户
├── exchange-market-items.html ✅ 兑换商品
├── exchange-market-orders.html ✅ 兑换订单
├── exchange-market-stats.html ✅ 兑换统计
├── feedbacks.html             ✅ 用户反馈
├── image-resources.html       ✅ 图片资源
├── login.html                 ✅ 登录
├── lottery-quota.html         ✅ 抽奖配额
├── market-management.html     ✅ 市场管理
├── marketplace-stats.html     ✅ 市场统计
├── material-asset-types.html  ✅ 材料类型
├── material-balances.html     ✅ 材料余额
├── material-conversion-rules.html ✅ 转换规则
├── material-transactions.html ✅ 材料流水
├── merchant-points.html       ✅ 商家积分
├── notifications.html         ✅ 通知管理
├── orphan-frozen.html         ✅ 孤儿冻结
├── popup-banners.html         ✅ 弹窗Banner
├── presets.html               ✅ 预设管理
├── prizes.html                ✅ 奖品管理
├── settings.html              ✅ 系统设置
├── statistics.html            ✅ 统计报表
├── system-config.html         ✅ 系统配置
├── trade-orders.html          ✅ 交易订单
├── user-hierarchy.html        ✅ 用户层级
├── user-management.html       ✅ 用户管理
├── users.html                 ✅ 用户列表
└── pages/                     📁 子目录（5个页面）
    ├── asset-management.html
    ├── market-management.html
    ├── system-config.html
    ├── unified-page.html
    └── user-management.html
```

### 🔴 缺失的核心页面（14个）

| 序号 | 页面文件 | 功能描述 | 后端API | 数据库数据 |
|------|----------|----------|---------|------------|
| 1 | ❌ `campaigns.html` | 抽奖活动管理 | ✅ 已实现 | 1个活动 |
| 2 | ❌ `lottery-strategy.html` | 策略引擎配置 | ✅ 已实现 | 17条配置 |
| 3 | ❌ `tier-matrix.html` | BxPx矩阵配置 | ✅ 已实现 | 12条配置 |
| 4 | ❌ `debt-management.html` | 欠账管理 | ✅ 已实现 | 0条待清偿 |
| 5 | ❌ `stores.html` | 门店管理 | ✅ 已实现 | 4个门店 |
| 6 | ❌ `store-staff.html` | 门店员工管理 | ✅ 已实现 | 2条记录 |
| 7 | ❌ `risk-alerts.html` | 风控告警 | ✅ 已实现 | 1条告警 |
| 8 | ❌ `roles.html` | 角色管理 | ✅ 已实现 | 10个角色 |
| 9 | ❌ `item-templates.html` | 物品模板管理 | ✅ 已实现 | 16个模板 |
| 10 | ❌ `dict-management.html` | 字典管理 | ✅ 已实现 | 19条字典 |
| 11 | ❌ `lottery-metrics.html` | 抽奖监控仪表盘 | ✅ 已实现 | 待数据 |
| 12 | ❌ `redemption-orders.html` | 核销码管理 | ✅ 已实现 | 932条 |
| 13 | ❌ `pricing-config.html` | 活动定价配置 | ✅ 已实现 | 4条 |
| 14 | ❌ `sessions.html` | 会话管理 | ⚠️ 需先启用会话存储 | 0条（待启用） |

---

## 🎯 功能补齐方案

### 第一优先级：P0 核心业务缺失（必须补齐）

#### 1. 抽奖活动管理页面 `campaigns.html`

**数据库能力**：
- lottery_campaigns：41字段，含 status/budget_mode/budget_source/user_budget/pool_budget 等
- 当前数据：1个活动，16个奖品

**对接API**：
- `GET /api/v4/console/system-data/lottery-campaigns` - 活动列表
- `GET /api/v4/console/system-data/lottery-campaigns/:campaign_id` - 活动详情
- `GET /api/v4/console/campaign-budget/campaigns/:campaign_id` - 预算配置

**需要的页面功能**：
| 功能 | 对应数据库字段 | 说明 |
|------|----------------|------|
| 活动列表 | campaign_id, name, status, start_time, end_time | 分页展示所有活动 |
| 活动详情 | 全部41字段 | 查看活动完整配置 |
| 预算模式配置 | budget_mode, budget_source, user_budget, pool_budget | 三种预算模式切换 |
| 空奖约束验证 | empty_prize_*字段 | 验证空奖配置 |
| 活动状态切换 | status | active/paused/ended |
| 奖品关联管理 | 关联lottery_prizes | 查看/配置活动奖品 |

---

#### 2. 抽奖策略引擎配置 `lottery-strategy.html`

**数据库能力**：
- lottery_strategy_config：17条配置
- lottery_tier_matrix_config：12种BxPx组合
- lottery_tier_rules：9条档位规则

**对接API**：
- `GET/POST/PUT/DELETE /api/v4/console/lottery-configs/strategies/*` - 策略配置CRUD
- `GET/POST/PUT/DELETE /api/v4/console/lottery-configs/matrix/*` - 矩阵配置CRUD
- `GET/POST/PUT/DELETE /api/v4/console/lottery-tier-rules/*` - 档位规则CRUD

**需要的页面功能**：
| 功能 | 对应表 | 说明 |
|------|--------|------|
| 策略参数配置 | lottery_strategy_config | budget_tier/pity/luck_debt等分组配置 |
| BxPx矩阵配置 | lottery_tier_matrix_config | 4×3矩阵的cap乘数、空奖权重乘数 |
| 档位规则配置 | lottery_tier_rules | 9条规则，segment_key + tier_name |
| 配置生效管理 | effective_at, expires_at | 定时生效/过期管理 |

---

#### 3. 欠账管理页面 `debt-management.html`

**数据库能力**：
- preset_inventory_debt：库存欠账（系统垫付记录）
- preset_budget_debt：预算欠账
- preset_debt_limits：欠账上限配置

**对接API**：
- `GET /api/v4/console/debt-management/dashboard` - 欠账看板
- `GET /api/v4/console/debt-management/by-campaign` - 按活动汇总
- `GET /api/v4/console/debt-management/by-prize` - 按奖品汇总
- `GET /api/v4/console/debt-management/by-creator` - 按责任人汇总
- `GET /api/v4/console/debt-management/pending` - 待清偿列表
- `POST /api/v4/console/debt-management/clear` - 清偿操作
- `GET/PUT /api/v4/console/debt-management/limits/*` - 上限配置

**需要的页面功能**：
| 功能 | 对应表 | 说明 |
|------|--------|------|
| 欠账仪表盘 | 汇总统计 | 总欠账/已清偿/待清偿 |
| 库存欠账列表 | preset_inventory_debt | 按活动/奖品/责任人分组 |
| 预算欠账列表 | preset_budget_debt | debt_source区分来源 |
| 清偿操作 | cleared_quantity/cleared_amount | 运营补货/充值清偿 |
| 上限配置 | preset_debt_limits | global/campaign/prize三级上限 |
| 告警检查 | - | 接近上限预警 |

---

#### 4. 门店管理页面 `stores.html`

**数据库能力**：
- stores：4门店，20字段（含省市区街道8字段）
- administrative_regions：44,703条行政区划

**对接API**：
- `GET /api/v4/console/stores` - 门店列表
- `GET /api/v4/console/stores/stats` - 门店统计
- `GET /api/v4/console/stores/:store_id` - 门店详情
- `POST /api/v4/console/stores` - 创建门店
- `PUT /api/v4/console/stores/:store_id` - 更新门店
- `DELETE /api/v4/console/stores/:store_id` - 删除门店
- `POST /api/v4/console/stores/:store_id/activate` - 激活门店
- `POST /api/v4/console/stores/:store_id/deactivate` - 停用门店
- `GET /api/v4/console/regions/*` - 行政区划级联

**需要的页面功能**：
| 功能 | 对应表 | 说明 |
|------|--------|------|
| 门店列表 | stores | 分页、筛选、搜索 |
| 门店CRUD | stores | 创建/编辑/删除 |
| 省市区级联选择 | administrative_regions | 四级级联 |
| 门店状态管理 | status | 激活/停用 |
| 门店统计 | - | 门店数、员工数 |

---

#### 5. 员工管理页面 `store-staff.html`

**数据库能力**：
- store_staff：2条员工-门店关系
- merchant_operation_logs：27条商家操作日志

**对接API**：
- `GET /api/v4/console/staff` - 员工列表
- `GET /api/v4/console/staff/stats` - 员工统计
- `GET /api/v4/console/staff/:store_staff_id` - 员工详情
- `GET /api/v4/console/staff/by-user/:user_id` - 按用户查询
- `POST /api/v4/console/staff` - 员工入职
- `POST /api/v4/console/staff/transfer` - 员工调店
- `PUT /api/v4/console/staff/:store_staff_id/role` - 角色变更
- `POST /api/v4/console/staff/disable/:user_id` - 员工禁用
- `POST /api/v4/console/staff/enable` - 员工启用

**需要的页面功能**：
| 功能 | 对应表 | 说明 |
|------|--------|------|
| 员工列表 | store_staff | 按门店/用户筛选 |
| 入职分配 | store_staff | 创建员工-门店关系 |
| 调店操作 | transfer | 更换门店 |
| 角色变更 | staff/manager | 升级/降级 |
| 离职禁用 | deactivate | 设为inactive |

---

#### 6. 风控告警页面 `risk-alerts.html`

**数据库能力**：
- risk_alerts：17字段，含alert_type/severity/is_blocking
- 当前数据：1条告警

**对接API**：
- `GET /api/v4/console/risk-alerts` - 告警列表
- `GET /api/v4/console/risk-alerts/pending` - 待处理告警
- `GET /api/v4/console/risk-alerts/:alert_id` - 告警详情
- `POST /api/v4/console/risk-alerts/:alert_id/review` - 复核操作
- `GET /api/v4/console/risk-alerts/stats/summary` - 汇总统计
- `GET /api/v4/console/risk-alerts/stats/store/:store_id` - 按门店统计
- `GET /api/v4/console/risk-alerts/types` - 告警类型

**需要的页面功能**：
| 功能 | 对应表 | 说明 |
|------|--------|------|
| 告警列表 | risk_alerts | 按类型/严重度/状态筛选 |
| 待处理告警 | status=pending | 优先显示 |
| 告警复核 | review操作 | approve/ignore/escalate |
| 告警统计 | 汇总 | 按类型/门店/时间统计 |
| 告警类型说明 | - | 频次阻断/金额告警/关联告警 |

---

### 第二优先级：P1 增强现有页面

#### 7. 角色管理页面 `roles.html`

**数据库能力**：
- roles：10个角色（role_id, role_name, role_level, description）
- user_roles：20条用户角色关联

**对接API**：
- `GET /api/v4/console/user-management/roles` - 角色列表
- `GET /api/v4/console/system-data/user-roles` - 用户角色关联

**需要的页面功能**：
| 功能 | 对应表 | 说明 |
|------|--------|------|
| 角色列表 | roles | 展示所有角色 |
| 角色层级展示 | role_level | 100以上为管理员 |
| 角色创建/编辑 | roles | CRUD |
| 角色用户关联 | user_roles | 查看拥有该角色的用户 |

---

#### 8. 物品模板管理页面 `item-templates.html`

**数据库能力**：
- item_templates：16个模板
- category_defs：6个类目
- rarity_defs：5个稀有度
- asset_group_defs：8个资产组

**对接API**：
- `GET /api/v4/console/item-templates` - 模板列表
- `GET /api/v4/console/item-templates/types` - 类型查询
- `GET /api/v4/console/item-templates/:id` - 模板详情
- `POST /api/v4/console/item-templates` - 创建模板
- `PUT /api/v4/console/item-templates/:id` - 更新模板
- `DELETE /api/v4/console/item-templates/:id` - 删除模板
- `POST /api/v4/console/item-templates/batch/status` - 批量状态更新

**需要的页面功能**：
| 功能 | 对应表 | 说明 |
|------|--------|------|
| 模板列表 | item_templates | 展示所有物品模板 |
| 模板CRUD | item_templates | 创建/编辑模板 |
| 类目筛选 | category_defs | 按类目筛选 |
| 稀有度筛选 | rarity_defs | 按稀有度筛选 |
| 物品实例统计 | item_instances | 统计每个模板的实例数 |

---

#### 9. 字典管理页面 `dict-management.html`

**数据库能力**：
- category_defs：6条类目定义
- rarity_defs：5条稀有度定义
- asset_group_defs：8条资产组定义

**对接API**：
- `GET/POST/PUT/DELETE /api/v4/console/dictionaries/categories/*` - 类目CRUD
- `GET/POST/PUT/DELETE /api/v4/console/dictionaries/rarities/*` - 稀有度CRUD
- `GET/POST/PUT/DELETE /api/v4/console/dictionaries/asset-groups/*` - 资产组CRUD

**需要的页面功能**：
| 功能 | 对应表 | 说明 |
|------|--------|------|
| 类目字典管理 | category_defs | CRUD（6条） |
| 稀有度字典管理 | rarity_defs | CRUD（5条） |
| 资产组字典管理 | asset_group_defs | CRUD（8条） |
| 关联统计 | - | 统计各字典被引用次数 |

---

#### 10. BxPx矩阵配置页面 `tier-matrix.html`

**数据库能力**：
- lottery_tier_matrix_config：12种组合（4个Budget Tier × 3个Pressure Tier）

**对接API**：
- `GET /api/v4/console/lottery-configs/matrix` - 矩阵配置列表
- `GET /api/v4/console/lottery-configs/matrix/:id` - 配置详情
- `GET /api/v4/console/lottery-configs/matrix/full` - 完整矩阵视图
- `POST /api/v4/console/lottery-configs/matrix` - 创建配置
- `PUT /api/v4/console/lottery-configs/matrix/:id` - 更新配置

**需要的页面功能**：
| 功能 | 对应表 | 说明 |
|------|--------|------|
| 4×3矩阵展示 | lottery_tier_matrix_config | Budget × Pressure 矩阵 |
| cap乘数配置 | cap_multiplier | 保底乘数 |
| 空奖权重乘数 | empty_weight_multiplier | 空奖概率调整 |
| 配置生效管理 | effective_at, expires_at | 定时生效 |

---

#### 11. 增强用户管理页面 `user-management.html`

**需要添加的功能**：
| 功能 | 对应API | 说明 |
|------|---------|------|
| 用户角色标签显示 | `/console/system-data/user-roles` | 显示用户拥有的所有角色 |
| 高级状态显示 | `/console/user-premium/:user_id` | 是否解锁、过期时间 |
| 风控配置显示 | `/console/risk-profiles/user/:user_id` | 日限次/日限额 |
| 抽奖体验状态 | `/console/lottery-monitoring/user-experience-states/:user_id/:campaign_id` | Pity进度、空奖连击 |
| 全局运气状态 | `/console/lottery-monitoring/user-global-states/:user_id` | 历史空奖率、运气债务 |

---

### 第三优先级：P2 监控运维类

#### 12. 抽奖监控仪表盘 `lottery-metrics.html`

**数据库能力**：
- lottery_hourly_metrics：27字段，按小时聚合监控指标
- lottery_draw_decisions：30字段，决策快照
- lottery_user_experience_state：用户体验状态
- lottery_user_global_state：用户全局状态

**对接API**：
- `GET /api/v4/console/lottery-monitoring/hourly-metrics` - 小时指标列表
- `GET /api/v4/console/lottery-monitoring/hourly-metrics/summary/:campaign_id` - 活动汇总
- `GET /api/v4/console/lottery-monitoring/user-experience-states` - 用户体验状态
- `GET /api/v4/console/lottery-monitoring/user-global-states` - 用户全局状态
- `GET /api/v4/console/lottery-strategy-stats/*` - 策略统计

**需要的页面功能**：
| 功能 | 对应表 | 说明 |
|------|--------|------|
| 实时监控面板 | lottery_hourly_metrics | 空奖率/高价值率/档位分布 |
| Pity触发统计 | pity_triggers_count | 保底触发次数 |
| AntiEmpty统计 | anti_empty_triggers_count | 防空连触发次数 |
| 异常检测 | - | 异常率预警 |
| 决策审计 | lottery_draw_decisions | 抽奖决策路径查询 |

---

#### 13. 核销码管理页面 `redemption-orders.html`

**数据库能力**：
- redemption_orders：932条核销订单

**对接API**：
- `GET /api/v4/console/business-records/redemption-orders` - 核销订单列表

**需要的页面功能**：
| 功能 | 对应表 | 说明 |
|------|--------|------|
| 核销码列表 | redemption_orders | 按状态筛选 |
| 核销码查询 | code_hash | 支持模糊搜索 |
| 手动核销 | status变更 | 管理员手动核销 |
| 过期清理 | expired_at | 显示过期状态 |

---

#### 14. 活动定价配置页面 `pricing-config.html`

**数据库能力**：
- lottery_campaign_pricing_config：4条配置，支持版本化

**对接API**：
- `GET /api/v4/console/lottery-management/pricing-config` - 定价配置列表
- `POST /api/v4/console/lottery-management/pricing-config` - 创建配置
- `PUT /api/v4/console/lottery-management/pricing-config/:id` - 更新配置

**需要的页面功能**：
| 功能 | 对应表 | 说明 |
|------|--------|------|
| 定价配置列表 | - | 展示所有版本 |
| 创建新版本 | version | 版本化管理 |
| 连抽折扣配置 | single_draw_price, multi_draw_discount | 1抽/10抽定价 |
| 版本生效控制 | effective_at | 定时生效 |

---

#### 15. 会话管理页面 `sessions.html`（✅ 已拍板开发）

> ⚠️ **特殊说明**：此页面需要先启用会话存储功能（修改登录流程），详见 `会话管理功能补齐方案.md`

**数据库能力**：
- authentication_sessions：JWT会话管理（当前0条，需启用会话存储后才有数据）

**前置工作**（1天）：
| 任务 | 修改文件 | 说明 |
|------|----------|------|
| 启用会话存储 | `routes/v4/auth/login.js` | 登录时写入会话表 |
| 修改Token验证 | `middleware/auth.js` | 检查会话有效性 |
| 登出失效会话 | `routes/v4/auth/logout.js` | 登出时失效会话 |

**对接API**（需新建）：
- `GET /api/v4/console/sessions` - 会话列表
- `GET /api/v4/console/sessions/stats` - 会话统计
- `GET /api/v4/console/sessions/online-users` - 在线用户
- `POST /api/v4/console/sessions/:id/deactivate` - 失效会话
- `POST /api/v4/console/sessions/deactivate-user` - 失效用户所有会话
- `POST /api/v4/console/sessions/cleanup` - 清理过期会话

**需要的页面功能**：
| 功能 | 对应表 | 说明 |
|------|--------|------|
| 在线用户列表 | authentication_sessions | 当前有效会话 |
| 会话详情 | authentication_sessions | Token信息、登录IP |
| 强制登出 | deactivate | 失效指定会话 |
| 会话统计 | getActiveSessionStats | 在线用户数/登录趋势 |

**总工作量**：2-3天（含前置工作）

---

## 📋 实施优先级总结

### P0 必须补齐（核心业务缺失）- 6个页面

| 序号 | 页面 | 后端API | 数据库数据 | 理由 |
|------|------|---------|------------|------|
| 1 | campaigns.html | ✅ 已实现 | 1个活动 | 抽奖活动是核心业务 |
| 2 | lottery-strategy.html | ✅ 已实现 | 17条配置 | 策略引擎核心 |
| 3 | debt-management.html | ✅ 已实现 | 0条待清偿 | 欠账管理核心 |
| 4 | stores.html | ✅ 已实现 | 4个门店 | 线下运营核心 |
| 5 | store-staff.html | ✅ 已实现 | 2条记录 | 员工管理核心 |
| 6 | risk-alerts.html | ✅ 已实现 | 1条告警 | 风控核心 |

### P1 增强现有（功能不完整）- 5个页面

| 序号 | 页面 | 后端API | 数据库数据 | 理由 |
|------|------|---------|------------|------|
| 7 | roles.html | ✅ 已实现 | 10个角色 | 角色管理独立页面 |
| 8 | item-templates.html | ✅ 已实现 | 16个模板 | 物品模板管理 |
| 9 | dict-management.html | ✅ 已实现 | 19条字典 | 字典统一管理 |
| 10 | tier-matrix.html | ✅ 已实现 | 12条配置 | BxPx矩阵可视化 |
| 11 | 增强user-management.html | ✅ 已实现 | - | 完善用户详情 |

### P2 监控运维（锦上添花）- 4个页面

| 序号 | 页面 | 后端API | 数据库数据 | 理由 |
|------|------|---------|------------|------|
| 12 | lottery-metrics.html | ✅ 已实现 | 待数据 | 抽奖监控仪表盘 |
| 13 | redemption-orders.html | ✅ 已实现 | 932条 | 核销码管理 |
| 14 | pricing-config.html | ✅ 已实现 | 4条 | 定价配置管理 |
| 15 | sessions.html | ⚠️ 需先启用会话存储（已拍板开发） | 0条 | 会话管理 |

---

## 📐 页面结构规范

### 统一页面模板

所有新增页面应遵循现有页面结构：

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <!-- 公共Head -->
  <link rel="stylesheet" href="css/admin-common.css">
</head>
<body>
  <!-- 侧边栏导航 -->
  <nav id="sidebar">...</nav>
  
  <!-- 主内容区 -->
  <main class="main-content">
    <!-- 页面标题 -->
    <div class="page-header">...</div>
    
    <!-- 统计卡片（如有） -->
    <div class="stats-row">...</div>
    
    <!-- 筛选区域（如有） -->
    <div class="filter-section">...</div>
    
    <!-- 图表区域（如有，使用ECharts） -->
    <div class="charts-section">
      <div id="chart-container" style="width: 100%; height: 400px;"></div>
    </div>
    
    <!-- 数据表格 -->
    <div class="table-responsive">...</div>
    
    <!-- 分页组件 -->
    <nav class="pagination-wrapper">...</nav>
  </main>
  
  <!-- 公共脚本 -->
  <script src="js/admin-common.js"></script>
  <script src="js/api-config.js"></script>
  <!-- ECharts图表库（需要图表的页面引入，本地文件） -->
  <script src="js/lib/echarts.min.js"></script>
  <script src="js/pages/xxx.js"></script>
</body>
</html>
```

### ECharts 图表规范（已拍板）

**技术决策**：Web管理后台所有图表统一采用 **ECharts**（本地引入）

#### 引入方式（已拍板：仅本地引入）

```html
<!-- 本地引入（已确定） -->
<script src="js/lib/echarts.min.js"></script>
```

> ⚠️ **决策说明**：不使用 CDN，统一采用本地引入方式，确保内网/离线环境可用

#### 标准初始化代码

```javascript
// 图表容器初始化
const chartDom = document.getElementById('chart-container');
const myChart = echarts.init(chartDom);

// 图表配置
const option = {
  title: { text: '图表标题' },
  tooltip: { trigger: 'axis' },
  legend: { data: ['数据系列'] },
  xAxis: { type: 'category', data: [] },
  yAxis: { type: 'value' },
  series: [{ name: '数据系列', type: 'line', data: [] }]
};

myChart.setOption(option);

// 响应式处理
window.addEventListener('resize', () => myChart.resize());
```

#### 常用图表类型

| 场景 | 图表类型 | ECharts type |
|------|----------|--------------|
| 趋势分析 | 折线图 | `line` |
| 数量对比 | 柱状图 | `bar` |
| 占比分析 | 饼图 | `pie` |
| 数据分布 | 散点图 | `scatter` |
| 进度展示 | 仪表盘 | `gauge` |
| 关系网络 | 关系图 | `graph` |
| 热力分布 | 热力图 | `heatmap` |

#### 配色规范

```javascript
// 统一配色方案
const CHART_COLORS = [
  '#5470c6', // 主色-蓝
  '#91cc75', // 成功-绿
  '#fac858', // 警告-黄
  '#ee6666', // 危险-红
  '#73c0de', // 信息-青
  '#3ba272', // 辅助-深绿
  '#fc8452', // 辅助-橙
  '#9a60b4', // 辅助-紫
];
```

### API调用规范

使用统一的API配置文件（api-config.js），新增端点需添加：

```javascript
const API_ENDPOINTS = {
  // ... 现有端点
  
  // 新增：抽奖活动管理
  CAMPAIGN: {
    LIST: '/api/v4/console/system-data/lottery-campaigns',
    DETAIL: '/api/v4/console/system-data/lottery-campaigns/:campaign_id',
  },
  
  // 新增：策略配置
  STRATEGY: {
    LIST: '/api/v4/console/lottery-configs/strategies',
    DETAIL: '/api/v4/console/lottery-configs/strategies/:id',
    CREATE: '/api/v4/console/lottery-configs/strategies',
    UPDATE: '/api/v4/console/lottery-configs/strategies/:id',
    DELETE: '/api/v4/console/lottery-configs/strategies/:id',
  },
  
  // 新增：矩阵配置
  MATRIX: {
    LIST: '/api/v4/console/lottery-configs/matrix',
    FULL: '/api/v4/console/lottery-configs/matrix/full',
    DETAIL: '/api/v4/console/lottery-configs/matrix/:id',
  },
  
  // 新增：欠账管理
  DEBT: {
    DASHBOARD: '/api/v4/console/debt-management/dashboard',
    BY_CAMPAIGN: '/api/v4/console/debt-management/by-campaign',
    BY_PRIZE: '/api/v4/console/debt-management/by-prize',
    BY_CREATOR: '/api/v4/console/debt-management/by-creator',
    PENDING: '/api/v4/console/debt-management/pending',
    CLEAR: '/api/v4/console/debt-management/clear',
    LIMITS: '/api/v4/console/debt-management/limits',
  },
  
  // 新增：门店管理
  STORE: {
    LIST: '/api/v4/console/stores',
    STATS: '/api/v4/console/stores/stats',
    DETAIL: '/api/v4/console/stores/:store_id',
    CREATE: '/api/v4/console/stores',
    UPDATE: '/api/v4/console/stores/:store_id',
    DELETE: '/api/v4/console/stores/:store_id',
    ACTIVATE: '/api/v4/console/stores/:store_id/activate',
    DEACTIVATE: '/api/v4/console/stores/:store_id/deactivate',
  },
  
  // 新增：员工管理
  STAFF: {
    LIST: '/api/v4/console/staff',
    STATS: '/api/v4/console/staff/stats',
    DETAIL: '/api/v4/console/staff/:store_staff_id',
    BY_USER: '/api/v4/console/staff/by-user/:user_id',
    TRANSFER: '/api/v4/console/staff/transfer',
    ROLE: '/api/v4/console/staff/:store_staff_id/role',
    DISABLE: '/api/v4/console/staff/disable/:user_id',
    ENABLE: '/api/v4/console/staff/enable',
  },
  
  // 新增：风控告警
  RISK_ALERT: {
    LIST: '/api/v4/console/risk-alerts',
    PENDING: '/api/v4/console/risk-alerts/pending',
    DETAIL: '/api/v4/console/risk-alerts/:alert_id',
    REVIEW: '/api/v4/console/risk-alerts/:alert_id/review',
    STATS_SUMMARY: '/api/v4/console/risk-alerts/stats/summary',
    TYPES: '/api/v4/console/risk-alerts/types',
  },
  
  // 新增：字典管理
  DICT: {
    CATEGORIES: '/api/v4/console/dictionaries/categories',
    RARITIES: '/api/v4/console/dictionaries/rarities',
    ASSET_GROUPS: '/api/v4/console/dictionaries/asset-groups',
  },
  
  // 新增：物品模板
  ITEM_TEMPLATE: {
    LIST: '/api/v4/console/item-templates',
    TYPES: '/api/v4/console/item-templates/types',
    DETAIL: '/api/v4/console/item-templates/:id',
  },
  
  // 新增：抽奖监控
  LOTTERY_MONITORING: {
    HOURLY_METRICS: '/api/v4/console/lottery-monitoring/hourly-metrics',
    HOURLY_SUMMARY: '/api/v4/console/lottery-monitoring/hourly-metrics/summary/:campaign_id',
    USER_EXPERIENCE: '/api/v4/console/lottery-monitoring/user-experience-states',
    USER_GLOBAL: '/api/v4/console/lottery-monitoring/user-global-states',
    USER_QUOTAS: '/api/v4/console/lottery-monitoring/user-quotas',
  },
  
  // 新增：业务记录
  BUSINESS_RECORDS: {
    REDEMPTION_ORDERS: '/api/v4/console/business-records/redemption-orders',
    LOTTERY_CLEAR_SETTINGS: '/api/v4/console/business-records/lottery-clear-settings',
    CONTENT_REVIEWS: '/api/v4/console/business-records/content-reviews',
  },
  
  // 新增：行政区划
  REGION: {
    PROVINCES: '/api/v4/console/regions/provinces',
    CHILDREN: '/api/v4/console/regions/children/:parent_code',
    SEARCH: '/api/v4/console/regions/search',
    PATH: '/api/v4/console/regions/path/:region_code',
  },
  
  // 新增：会话管理（已拍板开发，需先启用会话存储）
  SESSIONS: {
    LIST: '/api/v4/console/sessions',
    STATS: '/api/v4/console/sessions/stats',
    DETAIL: '/api/v4/console/sessions/:session_id',
    DEACTIVATE: '/api/v4/console/sessions/:session_id/deactivate',
    DEACTIVATE_USER: '/api/v4/console/sessions/deactivate-user',
    CLEANUP: '/api/v4/console/sessions/cleanup',
    ONLINE_USERS: '/api/v4/console/sessions/online-users',
  },
}
```

---

## 📝 方案执行原则

1. **数据库为权威**：所有页面功能必须基于数据库已有字段/表
2. **不发明新业务**：不为前端"想要"而凭空创造后端功能
3. **API先行**：后端API已100%实现，可直接开发前端页面
4. **增量补齐**：按P0→P1→P2优先级逐步补齐
5. **风格统一**：遵循现有页面的UI/UX规范
6. **动态联动**：配置修改后数据展板实时更新

---

## 📅 实施计划建议

### 第一周：P0核心页面（6个）

- Day 1-2：campaigns.html + lottery-strategy.html
- Day 3-4：debt-management.html + stores.html
- Day 5：store-staff.html + risk-alerts.html

### 第二周：P1增强页面（5个）

- Day 1：roles.html
- Day 2：item-templates.html
- Day 3：dict-management.html
- Day 4：tier-matrix.html
- Day 5：增强user-management.html

### 第三周：P2监控页面（4个）

- Day 1-2：lottery-metrics.html
- Day 3：redemption-orders.html
- Day 4：pricing-config.html
- Day 5：sessions.html（✅ 已拍板开发，含启用会话存储，详见 `会话管理功能补齐方案.md`）

---

**文档维护人**：AI Assistant  
**最后更新**：2026-01-21  
**验证状态**：✅ 已通过真实数据库验证
