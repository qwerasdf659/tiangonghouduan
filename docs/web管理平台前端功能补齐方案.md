# 🎯 Web管理平台前端功能补齐方案

> **核心原则**：以后端数据库提供的能力为权威核心，前端必须完全覆盖所有数据库能力
> 
> **生成时间**：2026-01-21
> 
> **数据来源**：真实数据库分析（65张表，连接真实MySQL数据库）

---

## 📊 数据库能力盘点（真实数据）

### 数据库统计概览

| 指标 | 数值 |
|------|------|
| 总表数 | 65张 |
| 用户数 | 28（活跃28） |
| 抽奖活动 | 1个进行中 |
| 奖品配置 | 16个 |
| 物品实例 | 1,777个（可用423） |
| 市场挂牌 | 38个 |
| 系统配置 | 39项 |
| 审计日志 | 3,555条 |
| 门店 | 4个 |

---

## 🔴 差距分析：数据库能力 vs 前端页面

### 一、已有前端页面（37个HTML页面）

```
/public/admin/
├── dashboard.html             ✅ 仪表盘
├── login.html                 ✅ 登录
├── users.html                 ✅ 用户列表
├── user-management.html       ✅ 用户管理
├── user-hierarchy.html        ✅ 用户层级
├── prizes.html                ✅ 奖品管理
├── presets.html               ✅ 预设管理
├── lottery-quota.html         ✅ 抽奖配额
├── campaign-budget.html       ✅ 活动预算
├── settings.html              ✅ 系统设置
├── system-config.html         ✅ 系统配置
├── config-tools.html          ✅ 配置工具
├── announcements.html         ✅ 系统公告
├── notifications.html         ✅ 通知管理
├── popup-banners.html         ✅ 弹窗Banner
├── feedbacks.html             ✅ 用户反馈
├── customer-service.html      ✅ 客服会话
├── consumption.html           ✅ 消费记录
├── merchant-points.html       ✅ 商家积分
├── audit-logs.html            ✅ 审计日志
├── analytics.html             ✅ 数据分析
├── statistics.html            ✅ 统计报表
├── charts.html                ✅ 图表展示
├── image-resources.html       ✅ 图片资源
├── asset-adjustment.html      ✅ 资产调整
├── asset-management.html      ✅ 资产管理
├── assets-portfolio.html      ✅ 资产组合
├── diamond-accounts.html      ✅ 钻石账户
├── material-asset-types.html  ✅ 材料类型
├── material-balances.html     ✅ 材料余额
├── material-transactions.html ✅ 材料流水
├── material-conversion-rules.html ✅ 转换规则
├── exchange-market-items.html ✅ 兑换商品
├── exchange-market-orders.html ✅ 兑换订单
├── exchange-market-stats.html ✅ 兑换统计
├── marketplace-stats.html     ✅ 市场统计
├── market-management.html     ✅ 市场管理
├── trade-orders.html          ✅ 交易订单
├── orphan-frozen.html         ✅ 孤儿冻结
├── activity-conditions.html   ✅ 活动条件
```

### 二、数据库能力 vs 前端页面对照表

#### 🔴 缺失的前端页面（需新增）

| 数据库能力 | 表名 | 后端API | 前端页面状态 | 建议页面 |
|------------|------|---------|--------------|----------|
| **抽奖活动管理** | lottery_campaigns (41字段) | ✅ /api/v4/lottery/campaigns | ❌ **无独立页面** | campaigns.html |
| **抽奖档位规则** | lottery_tier_rules | ✅ /api/v4/console/lottery-management | ❌ **无独立页面** | lottery-tier-rules.html |
| **抽奖决策快照** | lottery_draw_decisions | ✅ /api/v4/console/analytics | ❌ **无独立页面** | lottery-decisions.html |
| **抽奖策略配置** | lottery_strategy_config | ✅ 需确认 | ❌ **无独立页面** | lottery-strategy.html |
| **BxPx矩阵配置** | lottery_tier_matrix_config | ✅ 需确认 | ❌ **无独立页面** | tier-matrix.html |
| **用户体验状态** | lottery_user_experience_state | ✅ 需确认 | ❌ **无独立页面** | 合并到用户详情 |
| **用户全局状态** | lottery_user_global_state | ✅ 需确认 | ❌ **无独立页面** | 合并到用户详情 |
| **小时监控指标** | lottery_hourly_metrics | ✅ 需确认 | ❌ **无独立页面** | lottery-metrics.html |
| **预设库存欠账** | preset_inventory_debt | ✅ /api/v4/console/debt-management | ❌ **无独立页面** | debt-management.html |
| **预设预算欠账** | preset_budget_debt | ✅ /api/v4/console/debt-management | ❌ **无独立页面** | 合并到debt-management |
| **欠账上限配置** | preset_debt_limits | ✅ /api/v4/console/debt-management | ❌ **无独立页面** | 合并到debt-management |
| **物品模板** | item_templates (16模板) | ✅ /api/v4/console/assets | ❌ **无独立页面** | item-templates.html |
| **物品实例事件** | item_instance_events | ✅ /api/v4/console/assets/item-events | ❌ **无独立页面** | 合并到资产管理 |
| **类目字典** | category_defs | ✅ 需确认 | ❌ **无独立页面** | dict-management.html |
| **稀有度字典** | rarity_defs | ✅ 需确认 | ❌ **无独立页面** | 合并到dict-management |
| **资产组字典** | asset_group_defs | ✅ 需确认 | ❌ **无独立页面** | 合并到dict-management |
| **角色管理** | roles (10角色) | ✅ /api/v4/console/user-management/roles | ❌ **无独立页面** | roles.html |
| **用户角色关联** | user_roles | ✅ /api/v4/console/user-management | ❌ **无独立页面** | 合并到用户管理 |
| **门店管理** | stores (4门店) | ✅ /api/v4/console/stores | ❌ **无独立页面** | stores.html |
| **门店员工** | store_staff | ✅ /api/v4/console/staff | ❌ **无独立页面** | store-staff.html |
| **行政区划** | administrative_regions (44703条) | ✅ /api/v4/console/regions | ❌ **无独立页面** | 合并到门店管理 |
| **风控告警** | risk_alerts | ✅ /api/v4/console/risk-alerts | ❌ **无独立页面** | risk-alerts.html |
| **商家操作日志** | merchant_operation_logs | ✅ /api/v4/console/audit-logs | ❌ **分离不完整** | merchant-audit-logs.html |
| **用户状态变更记录** | user_status_change_records | ✅ 需确认 | ❌ **无独立页面** | 合并到审计日志 |
| **用户角色变更记录** | user_role_change_records | ✅ 需确认 | ❌ **无独立页面** | 合并到审计日志 |
| **抽奖清除设置记录** | lottery_clear_setting_records | ✅ 需确认 | ❌ **无独立页面** | 合并到审计日志 |
| **用户风控配置** | user_risk_profiles | ✅ 需确认 | ❌ **无独立页面** | 合并到用户详情 |
| **用户高级状态** | user_premium_status | ✅ 需确认 | ❌ **无独立页面** | 合并到用户详情 |
| **认证会话** | authentication_sessions | ✅ 需确认 | ❌ **无独立页面** | sessions.html |
| **API幂等请求** | api_idempotency_requests | ✅ 需确认 | ❌ **无独立页面** | 系统监控 |
| **活动用户配额** | lottery_campaign_user_quota | ✅ /api/v4/console/lottery-quota | ⚠️ **部分覆盖** | 增强lottery-quota |
| **配额发放记录** | lottery_campaign_quota_grants | ✅ /api/v4/console/lottery-quota | ⚠️ **部分覆盖** | 增强lottery-quota |
| **活动定价配置** | lottery_campaign_pricing_config | ✅ 需确认 | ❌ **无独立页面** | pricing-config.html |
| **核销订单** | redemption_orders (832条) | ✅ /api/v4/backpack | ❌ **无独立页面** | redemption-orders.html |
| **WebSocket日志** | websocket_startup_logs | ✅ 需确认 | ❌ **无独立页面** | 系统监控 |

---

## 🎯 功能补齐方案

### 第一优先级：P0 核心业务缺失（必须补齐）

#### 1. 抽奖活动管理页面 `campaigns.html`

**数据库能力**：
- lottery_campaigns：41字段，含 status/budget_mode/budget_source/user_budget/pool_budget 等
- 当前数据：1个活动，16个奖品

**需要的页面功能**：
| 功能 | 对应数据库字段 | 说明 |
|------|----------------|------|
| 活动列表 | campaign_id, name, status, start_time, end_time | 分页展示所有活动 |
| 活动详情 | 全部41字段 | 查看活动完整配置 |
| 创建/编辑活动 | 写入字段 | 支持所有配置项 |
| 预算模式配置 | budget_mode, budget_source, user_budget, pool_budget | 三种预算模式切换 |
| 空奖约束验证 | empty_prize_*字段 | 验证空奖配置 |
| 活动状态切换 | status | active/paused/ended |
| 奖品关联管理 | 关联lottery_prizes | 查看/配置活动奖品 |

**后端API**：`/api/v4/lottery/campaigns` + `/api/v4/console/campaign-budget`

---

#### 2. 抽奖策略引擎配置 `lottery-strategy.html`

**数据库能力**：
- lottery_strategy_config：17条配置
- lottery_tier_matrix_config：12种BxPx组合

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
- preset_debt_limits：1条上限配置

**需要的页面功能**：
| 功能 | 对应表 | 说明 |
|------|--------|------|
| 欠账仪表盘 | 汇总统计 | 总欠账/已清偿/待清偿 |
| 库存欠账列表 | preset_inventory_debt | 按活动/奖品/责任人分组 |
| 预算欠账列表 | preset_budget_debt | debt_source区分来源 |
| 清偿操作 | cleared_quantity/cleared_amount | 运营补货/充值清偿 |
| 上限配置 | preset_debt_limits | global/campaign/prize三级上限 |
| 告警检查 | - | 接近上限预警 |

**后端API**：`/api/v4/console/debt-management/*`（已实现21个端点）

---

#### 4. 门店管理页面 `stores.html`

**数据库能力**：
- stores：4门店，20字段（含省市区街道8字段）
- store_staff：2条员工关系
- administrative_regions：44,703条行政区划

**需要的页面功能**：
| 功能 | 对应表 | 说明 |
|------|--------|------|
| 门店列表 | stores | 分页、筛选、搜索 |
| 门店CRUD | stores | 创建/编辑/删除 |
| 省市区级联选择 | administrative_regions | 四级级联 |
| 门店状态管理 | status | 激活/停用 |
| 门店统计 | - | 门店数、员工数 |
| 员工关联 | store_staff | 查看门店员工 |

**后端API**：`/api/v4/console/stores/*` + `/api/v4/console/regions/*`

---

#### 5. 员工管理页面 `store-staff.html`

**数据库能力**：
- store_staff：员工-门店多对多关系
- merchant_operation_logs：34条商家操作日志

**需要的页面功能**：
| 功能 | 对应表 | 说明 |
|------|--------|------|
| 员工列表 | store_staff | 按门店/用户筛选 |
| 入职分配 | store_staff | 创建员工-门店关系 |
| 调店操作 | transfer | 更换门店 |
| 角色变更 | staff/manager | 升级/降级 |
| 离职禁用 | deactivate | 设为inactive |
| 操作日志 | merchant_operation_logs | 查看员工操作历史 |

**后端API**：`/api/v4/console/staff/*` + `/api/v4/console/audit-logs/*`

---

#### 6. 风控告警页面 `risk-alerts.html`

**数据库能力**：
- risk_alerts：17字段，含alert_type/severity/is_blocking

**需要的页面功能**：
| 功能 | 对应表 | 说明 |
|------|--------|------|
| 告警列表 | risk_alerts | 按类型/严重度/状态筛选 |
| 待处理告警 | status=pending | 优先显示 |
| 告警复核 | review操作 | approve/ignore/escalate |
| 告警统计 | 汇总 | 按类型/门店/时间统计 |
| 告警类型说明 | - | 频次阻断/金额告警/关联告警 |

**后端API**：`/api/v4/console/risk-alerts/*`（已实现7个端点）

---

### 第二优先级：P1 增强现有页面

#### 7. 增强用户管理页面

**需要添加的功能**：
| 功能 | 对应表 | 说明 |
|------|--------|------|
| 用户角色标签显示 | user_roles | 显示用户拥有的所有角色 |
| 角色分配/撤销 | user_roles | 操作用户角色 |
| 高级状态显示 | user_premium_status | 是否解锁、过期时间 |
| 风控配置显示 | user_risk_profiles | 日限次/日限额 |
| 抽奖体验状态 | lottery_user_experience_state | Pity进度、空奖连击 |
| 全局运气状态 | lottery_user_global_state | 历史空奖率、运气债务 |

---

#### 8. 增强审计日志页面

**需要添加的功能**：
| 功能 | 对应表 | 说明 |
|------|--------|------|
| 商家日志Tab | merchant_operation_logs | 独立显示商家操作 |
| 状态变更记录 | user_status_change_records | 显示状态变更历史 |
| 角色变更记录 | user_role_change_records | 显示角色变更历史 |
| 抽奖清除记录 | lottery_clear_setting_records | 显示清除操作历史 |

---

#### 9. 角色管理页面 `roles.html`

**数据库能力**：
- roles：10个角色（role_id, role_name, role_level, description）

**需要的页面功能**：
| 功能 | 对应表 | 说明 |
|------|--------|------|
| 角色列表 | roles | 展示所有角色 |
| 角色层级展示 | role_level | 100以上为管理员 |
| 角色创建/编辑 | roles | CRUD |
| 角色用户关联 | user_roles | 查看拥有该角色的用户 |

---

#### 10. 物品模板管理页面 `item-templates.html`

**数据库能力**：
- item_templates：16个模板
- category_defs：6个类目
- rarity_defs：5个稀有度
- asset_group_defs：8个资产组

**需要的页面功能**：
| 功能 | 对应表 | 说明 |
|------|--------|------|
| 模板列表 | item_templates | 展示所有物品模板 |
| 模板CRUD | item_templates | 创建/编辑模板 |
| 类目筛选 | category_defs | 按类目筛选 |
| 稀有度筛选 | rarity_defs | 按稀有度筛选 |
| 物品实例统计 | item_instances | 统计每个模板的实例数 |

---

#### 11. 字典管理页面 `dict-management.html`

**数据库能力**：
- category_defs：6条类目定义
- rarity_defs：5条稀有度定义
- asset_group_defs：8条资产组定义

**需要的页面功能**：
| 功能 | 对应表 | 说明 |
|------|--------|------|
| 类目字典管理 | category_defs | CRUD |
| 稀有度字典管理 | rarity_defs | CRUD |
| 资产组字典管理 | asset_group_defs | CRUD |
| 关联统计 | - | 统计各字典被引用次数 |

---

### 第三优先级：P2 监控运维类

#### 12. 抽奖监控仪表盘 `lottery-metrics.html`

**数据库能力**：
- lottery_hourly_metrics：27字段，按小时聚合监控指标
- lottery_draw_decisions：30字段，决策快照

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
- redemption_orders：832条核销订单

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

**需要的页面功能**：
| 功能 | 对应表 | 说明 |
|------|--------|------|
| 定价配置列表 | - | 展示所有版本 |
| 创建新版本 | version | 版本化管理 |
| 连抽折扣配置 | single_draw_price, multi_draw_discount | 1抽/10抽定价 |
| 版本生效控制 | effective_at | 定时生效 |

---

#### 15. 会话管理页面 `sessions.html`

**数据库能力**：
- authentication_sessions：JWT会话管理

**需要的页面功能**：
| 功能 | 对应表 | 说明 |
|------|--------|------|
| 在线用户列表 | - | 当前有效会话 |
| 会话详情 | - | Token信息、登录IP |
| 强制登出 | - | 失效指定会话 |
| 会话统计 | - | 在线用户数/登录趋势 |

---

## 📋 实施优先级总结

### P0 必须补齐（核心业务缺失）

| 序号 | 页面 | 理由 |
|------|------|------|
| 1 | campaigns.html | 抽奖活动是核心业务，无管理页面 |
| 2 | lottery-strategy.html | 策略引擎配置无可视化管理 |
| 3 | debt-management.html | 欠账管理后端API已完整但无前端 |
| 4 | stores.html | 门店管理后端API已完整但无前端 |
| 5 | store-staff.html | 员工管理后端API已完整但无前端 |
| 6 | risk-alerts.html | 风控告警后端API已完整但无前端 |

### P1 增强现有（功能不完整）

| 序号 | 页面 | 理由 |
|------|------|------|
| 7 | user-management.html | 缺少角色/高级状态/风控配置显示 |
| 8 | audit-logs.html | 缺少商家日志和变更记录Tab |
| 9 | roles.html | 角色管理无独立页面 |
| 10 | item-templates.html | 物品模板无管理页面 |
| 11 | dict-management.html | 字典管理无统一页面 |

### P2 监控运维（锦上添花）

| 序号 | 页面 | 理由 |
|------|------|------|
| 12 | lottery-metrics.html | 抽奖监控仪表盘 |
| 13 | redemption-orders.html | 核销码管理 |
| 14 | pricing-config.html | 定价配置管理 |
| 15 | sessions.html | 会话管理 |

---

## 🔧 后端API缺口分析

以下是数据库能力已有但后端API可能需要补充/确认的部分：

| 数据库表 | 需确认的后端API |
|----------|-----------------|
| lottery_strategy_config | CRUD接口 |
| lottery_tier_matrix_config | CRUD接口 |
| lottery_user_experience_state | 查询接口 |
| lottery_user_global_state | 查询接口 |
| lottery_hourly_metrics | 查询接口 |
| category_defs | CRUD接口 |
| rarity_defs | CRUD接口 |
| asset_group_defs | CRUD接口 |
| user_premium_status | 查询/管理接口 |
| authentication_sessions | 查询/管理接口 |

**注意**：以上需要先检查后端是否已有实现，如已有实现则仅需前端对接；如未实现则需要先补充后端API（但必须基于数据库已有字段，不能凭空发明新业务）

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
    
    <!-- 数据表格 -->
    <div class="table-responsive">...</div>
    
    <!-- 分页组件 -->
    <nav class="pagination-wrapper">...</nav>
  </main>
  
  <!-- 公共脚本 -->
  <script src="js/admin-common.js"></script>
  <script src="js/api-config.js"></script>
  <script src="js/pages/xxx.js"></script>
</body>
</html>
```

### API调用规范

使用统一的API配置文件（api-config.js）：

```javascript
// 新增API端点需要在API_ENDPOINTS中添加
const API_ENDPOINTS = {
  // ... 现有端点
  
  // 新增：抽奖活动管理
  CAMPAIGN: {
    LIST: '/api/v4/lottery/campaigns',
    DETAIL: '/api/v4/lottery/campaigns/:campaign_id',
    CREATE: '/api/v4/lottery/campaigns',
    UPDATE: '/api/v4/lottery/campaigns/:campaign_id',
  },
  
  // 新增：欠账管理
  DEBT: {
    DASHBOARD: '/api/v4/console/debt-management/dashboard',
    PENDING: '/api/v4/console/debt-management/pending',
    CLEAR: '/api/v4/console/debt-management/clear',
  },
  
  // 新增：门店管理
  STORE: {
    LIST: '/api/v4/console/stores',
    DETAIL: '/api/v4/console/stores/:store_id',
    CREATE: '/api/v4/console/stores',
    UPDATE: '/api/v4/console/stores/:store_id',
    ACTIVATE: '/api/v4/console/stores/:store_id/activate',
    DEACTIVATE: '/api/v4/console/stores/:store_id/deactivate',
  },
  
  // ... 其他新增端点
}
```

---

## 📝 方案执行原则

1. **数据库为权威**：所有页面功能必须基于数据库已有字段/表
2. **不发明新业务**：不为前端"想要"而凭空创造后端功能
3. **API先行**：确认后端API已实现后再开发前端页面
4. **增量补齐**：按P0→P1→P2优先级逐步补齐
5. **风格统一**：遵循现有页面的UI/UX规范
6. **动态联动**：配置修改后数据展板实时更新

---

**文档维护人**：AI Assistant  
**最后更新**：2026-01-21

