# 前端运营体验问题审计报告

> **审计范围**: `/admin/src/` 全部 JS/HTML 文件  
> **审计日期**: 2026-02-06  
> **审计方法**: 代码级全量扫描 + 模式匹配验证  
> **结论**: 附录 13 项问题 **全部确认存在**

---

## 问题总览

| # | 问题 | 验证结果 | 严重程度 | 影响面 |
|:---:|---|:---:|:---:|---|
| 1 | 错误提示暴露技术细节 | ✅ 30+处 | 🔴 高 | 全局 |
| 2 | 数据刷新状态不透明 | ✅ 仅2/15有提示 | 🔴 高 | 告警/审核/仪表盘 |
| 3 | 筛选重置覆盖不全 | ✅ 部分页面缺失 | 🟡 中 | lottery-alerts/risk-alerts/sessions等 |
| 4 | 分页默认值不统一 | ✅ 5种不同值 | 🟡 中 | 全局列表页 |
| 5 | 错误静默/反馈缺失 | ✅ 无统一错误状态 | 🔴 高 | 多数页面 |
| 6 | 危险操作缺少二次确认 | ⚠️ 有但不统一 | 🟡 中 | 6+个关键页面 |
| 7 | 筛选条件刷新后丢失 | ✅ 未同步到URL | 🟡 中 | 几乎所有列表页 |
| 8 | 图表环境色不跟随暗色主题 | ✅ 38处硬编码 | 🟡 中 | 含图表的6个页面 |
| 9 | 已有组件未接入业务 | ✅ 3组件0使用 | 🟠 低 | 全局 |
| 10 | 表格不支持列排序 | ✅ 仅~4页面有 | 🟡 中 | 22/26个表格页 |
| 11 | 部分页面无帮助提示 | ✅ 确认缺失 | 🟠 低 | dashboard-panel等 |
| 12 | 部分页面不支持数据导出 | ⚠️ 部分缺失 | 🟠 低 | store/content/trade等 |
| 13 | 批量操作覆盖不全 | ⚠️ 部分缺失 | 🟠 低 | analytics/dict等 |

---

## 1. 错误提示直接暴露技术细节

**严重程度**: 🔴 高 — 运营看到 `SequelizeUniqueConstraintError` 等技术堆栈完全无法理解

### 问题证据

在 **30+ 处** catch 块中直接将 `error.message` 原样展示给用户，后端若返回数据库/框架级错误信息会直接透传到 UI：

| 文件 | 行号 | 代码 |
|---|---|---|
| `asset/composables/adjustment.js` | 267, 429, 533, 607 | `this.showError(error.message)` |
| `lottery/composables/redemption.js` | 203, 251, 410 | `this.showError(error.message \|\| '...')` |
| `operations/composables/pending.js` | 325, 365 | `Alpine.store('notification').show('批量通过失败: ' + error.message, 'error')` |
| `content/composables/customer-service.js` | 158, 191, 250, 300, 365 | `this.showError(error.message)` |
| `lottery/pages/lottery-alerts.js` | 586, 633 | `this.showError(error.message)` |
| `user/pages/user-management.js` | 561, 721 | `Alpine.store('notification')?.show?.('...失败: ' + error.message, 'error')` |
| `market/pages/trade-management.js` | 740 | `this.$toast?.error('加载交易订单失败: ' + error.message)` |
| `system/pages/risk-alerts.js` | 1050 | `this.showError(error.message)` |
| `system/pages/config-tools.js` | 300, 361, 432 | `this.$toast.error('保存失败：' + error.message)` |
| `system/pages/sessions.js` | 253, 364, 431, 473, 534 | `this.showError(error.message \|\| '...')` |
| `lottery/composables/metrics.js` | 247, 824 | `Alpine.store('notification').error('刷新失败: ' + error.message)` |
| `lottery/composables/pricing.js` | 126 | `Alpine.store('notification').error('刷新失败: ' + error.message)` |
| `lottery/composables/alerts.js` | 194, 256 | `Alpine.store('notification').error('确认失败: ' + (error.message \|\| '...'))` |
| `alpine/mixins/async-data.js` | 326, 460, 516 | `this.showError(error.message \|\| errorMessage)` |
| `alpine/components/export-modal.js` | 354 | `Alpine.store('notification').show('导出失败: ' + error.message, 'error')` |

### 运营感受

API 失败时会看到诸如 `SequelizeUniqueConstraintError: Validation error` 或 `Cannot read properties of null` 等技术错误，完全无法理解和自行排查。

---

## 2. 数据刷新状态不透明

**严重程度**: 🔴 高 — 运营不知道当前数据是10秒前还是10分钟前的

### 轮询逻辑统计（15处 `setInterval`）

| 文件 | setInterval数量 | 轮询内容 |
|---|:---:|---|
| `customer-service.js` | 2 | 会话列表(30s) + 响应统计(60s) |
| `dashboard-panel.js` | 1 | 仪表盘数据刷新 |
| `pending.js` (composable) | 1 | 待处理项更新 |
| `message-center.js` | 1 | 消息轮询 |
| `customer-service.js` (composable) | 1 | 消息内容轮询 |
| `lottery-alerts.js` | 2 | 告警列表(60s) × 2处 |
| `risk-alerts.js` | 3 | 告警列表(60s) × 2处 + 升级检查 |
| `sidebar-nav.js` | 1 | 徽章数字更新 |
| `notification-center.js` | 1 | 通知轮询 |
| `dashboard.js` | 1 | 仪表盘自动刷新 |
| `export-modal.js` | 1 | 导出进度轮询 |

### 「上次更新时间」展示情况

**仅 2 个页面** 在 UI 上展示了 `lastUpdateTime`：

```
dashboard-panel.html:59  → 实时监控核心业务指标 · 最后更新: <span x-text="lastUpdateTime">
pending-center.html:46   → 汇总所有待处理事项 · 最后更新: <span x-text="lastUpdateTime">
```

以下页面 **有轮询但无更新时间提示**：
- `lottery-alerts`（60秒轮询）
- `risk-alerts`（60秒轮询 × 3处）
- `customer-service`（30秒轮询）
- `message-center`（轮询）
- `notification-center`（轮询）
- `sidebar-nav`（徽章轮询）
- `dashboard`（轮询）

---

## 3. 筛选重置功能覆盖不全

**严重程度**: 🟡 中 — 设了筛选条件后想看全量数据只能刷新整个页面

### 现状

- `filter-bar.js` 组件提供了 `resetFilters` 方法
- 多个 composable 有 `resetFilters`/`clearSearch` 实现（`presets.js`、`user-hierarchy.js`、`audit-logs.js` 等）
- 但 `lottery-alerts`、`risk-alerts`、`sessions` 等页面的筛选逻辑是自行实现的，重置按钮覆盖参差不齐
- 没有发现统一的「清除所有筛选」按钮规范

---

## 4. 分页默认值不统一

**严重程度**: 🟡 中 — 用户体验不一致，`page_size=1000` 会导致性能问题

### 各 page_size 值分布

| page_size | 使用数量 | 典型文件 |
|:---:|:---:|---|
| **20** | ~28处 | `user-management`、`sessions`、`lottery-alerts`、`risk-alerts`、`message-center`、`system-settings`、`staff`、`finance-management`、`orphan-frozen`、`pending`、`user-hierarchy`、`system-advance` 等 |
| **10** | ~6处 | `presets.js`、`batch-operations.js`、`user-drawer.js`（4个分页）、`drill-down.js`、`dashboard-panel.js`（实时告警） |
| **1000** | **2处** | `exchange-stats.js:57` 和 `exchange-stats.js:119` |
| **100** | 2处 | `stores.js:58`（门店列表）、`debt-management.js:63`（活动列表） |
| **50** | 1处 | `campaign-budget.js:66` |

#### 高风险项

```javascript
// exchange-stats.js:57 — 数据量增长后会突然变卡
params: { page: 1, page_size: 1000 }

// exchange-stats.js:119 — 同上
params: { page: 1, page_size: 1000 }
```

---

## 5. 错误静默/反馈缺失

**严重程度**: 🔴 高 — 加载失败时运营看到空白，不知道原因

### 问题证据

HTML 层面搜索 `x-show="error"` / `x-if="error"`，仅发现 **2处**（且都是表单校验场景而非加载错误状态）：

```
lottery-management.html:3854 → <template x-if="resolveError && quotaForm.rule_type === 'user'">
finance-management.html:995  → <template x-if="resolveError">
```

虽然有 `empty-state.js` 组件（15处相关代码），但该组件用于「数据为空」的提示，**没有「加载失败」的统一错误状态展示机制**。

多数页面在 API 失败后仅通过 toast 提示，内容区域保持空白或旧数据——如果 toast 自动消失后，运营完全无法知道发生了什么。

---

## 6. 危险操作缺少二次确认

**严重程度**: 🟡 中 — 实现方式不统一，部分操作缺少确认

### 现有确认机制

1. **`confirmAndExecute`**（推荐方式）：在 ~23 个文件中使用，如 `users.js` 的用户状态切换：
   ```javascript
   // users.js:331-344 — 正确实现
   await this.confirmAndExecute(
     `确定要${statusText}用户「${user.nickname || user.user_id}」吗？`,
     async () => { ... },
     { successMessage: `用户已${statusText}` }
   )
   ```

2. **原生 `confirm()`**（不推荐）：部分文件仍在使用：
   ```javascript
   // adjustment.js:517 — 使用原生 confirm
   if (!confirm(`确定要审批通过调账记录 ${record.adjustment_id} 吗？`)) return
   ```

3. **`confirm-dialog.js` store**：已定义（9处引用），但仅在 `alpine/init.js` 中集成

### 未覆盖的危险操作

需逐页排查以下场景是否均有确认：
- 资产调账审批（`adjustment.js` — 用原生 confirm）
- 批量操作（`batch-operations.js`、`pending.js`）
- 数据清理（`orphan-frozen.js`）
- 配置修改（`config-tools.js`、`system-settings.js`）

---

## 7. 筛选条件刷新后丢失

**严重程度**: 🟡 中 — 不保存到 URL，刷新回初始状态

### 现状分析

- `page-state.js` 已实现基于 `sessionStorage` 的状态保存/恢复机制（含 TTL 1小时过期策略）
- **但没有任何页面将筛选条件同步到 URL 参数**
- 全局搜索 `filter.*url`/`syncFiltersToURL`/`persistFilter` 等模式，仅找到 2 处不相关的结果

### 影响

- 刷新页面后依赖 `sessionStorage` 恢复（不可靠 + 有 1 小时过期）
- 无法通过 URL 分享当前筛选状态给同事
- 浏览器前进/后退无法恢复筛选状态

---

## 8. 图表环境色不跟随暗色主题

**严重程度**: 🟡 中 — 暗色模式下图表可读性严重下降

### 硬编码颜色值分布（JS 文件中 `#hex` / `rgba` 出现次数）

| 文件 | 硬编码颜色数 | 是否含环境色问题 |
|---|:---:|:---:|
| `dashboard-panel.js` | 26 | ✅ |
| `analytics.js` | 16 | ✅ |
| `dashboard.js` | 16 | ✅ |
| `mini-chart.js` | 15 | ✅ |
| `statistics.js` | 14 | ✅ |
| `audit-logs.js` | 12 | ✅ |
| `lottery-alerts.js` | 12 | 部分 |
| `metrics.js` | 10 | 部分 |
| `user-management.js` | 9 | 部分 |
| `report.js` | 8 | 主要为导出色 |
| `appearance-settings.js` | 26 | 主题配置本身 |
| `其他文件` | 若干 | 多为语义固定色 |

### 典型问题代码

```javascript
// dashboard-panel.js:335
tooltip: { trigger: 'axis', backgroundColor: 'rgba(255,255,255,0.95)', borderColor: '#e2e8f0' }
// ↑ 白底tooltip、浅灰边框 → 暗色下不可见

// dashboard-overview.js:404-407
tooltip: { ..., textStyle: { color: '#334155' } }      // 深色文字 → 暗色下也是深色
xAxis: { ..., axisLine: { lineStyle: { color: '#e2e8f0' } }, axisLabel: { color: '#64748b' } }
yAxis: { ..., splitLine: { lineStyle: { color: '#f1f5f9', type: 'dashed' } }, axisLabel: { color: '#64748b' } }
// ↑ 浅灰分割线、中灰标签 → 暗色背景下几乎不可见
```

### 颜色值分类

| 分类 | 数量 | 是否需改 | 说明 |
|---|:---:|:---:|---|
| 图表系列色（itemStyle/lineStyle/color数组） | ~87 | ❌ | 红=危险、绿=正常等语义固定色 |
| 导出报告HTML样式 | ~30 | ❌ | 打印/导出永远白底渲染 |
| **图表环境色**（轴线/背景/文字/tooltip） | **~38** | ✅ | 暗色模式下不可见 |

---

## 9. 已有组件能力未接入业务

**严重程度**: 🟠 低 — 高频操作全靠鼠标，已有的效率工具浪费了

### 三个已定义但零页面使用的组件

| 组件 | 定义文件 | 能力描述 | HTML页面引用数 |
|---|---|---|:---:|
| `keyboard-shortcuts` | `alpine/components/keyboard-shortcuts.js` | 580行代码，支持快捷键注册/全局搜索/导航 | **0** |
| `data-table` | `alpine/components/data-table.js` | 225行代码，支持排序/选择/分页的数据表格 | **0** |
| `virtual-list` | `alpine/components/virtual-list.js` | 884行代码，支持虚拟滚动/大数据列表渲染 | **0** |

- `keyboard-shortcuts` 在 `alpine/index.js` 中注册了 store，但无业务页面调用 `$store.shortcuts`
- `data-table` 导出了 `dataTable()` 函数，但无 `x-data="dataTable"` 引用
- `virtual-list` 导出了 `virtualList()` 和 `virtualTable()`，但无页面使用

---

## 10. 表格不支持列排序

**严重程度**: 🟡 中 — 只有约4个页面支持排序

### 排序相关代码分布

| 文件 | 排序相关代码 | 说明 |
|---|:---:|---|
| `data-table.js` | 5处 | 组件本身支持排序，但无页面使用 |
| `sessions.js` | 3处 | ✅ 有排序 |
| `asset-management.js` | 1处 | ✅ 有排序 |
| `exchange-items.js` | 2处 | ✅ 有排序 |
| `dict.js` | 1处 | ✅ 有排序 |

以下主要表格页 **无排序功能**：
- `user-management`（2169行HTML，主列表无排序）
- `lottery-alerts`（672行HTML）
- `risk-alerts`（393行HTML）
- `audit-logs`（588行HTML）
- `trade-management`（341行HTML）
- `finance-management`（1228行HTML）
- `store-management`（561行HTML）
- `lottery-management`（4568行HTML）
- `pending-center`（440行HTML）
- 以及其他列表页

---

## 11. 部分页面无帮助提示

**严重程度**: 🟠 低 — 无 tooltip/placeholder 引导

`dashboard-panel.js` 中 10 处 tooltip 相关代码全部是 ECharts 图表数据提示，不是 UI 操作引导。

大部分页面的筛选条件、操作按钮、数据指标缺乏辅助说明（如 placeholder 提示文字、hover tooltip 解释含义等），运营新人上手成本高。

---

## 12. 部分页面不支持数据导出

**严重程度**: 🟠 低 — 运营需手动复制数据

### 已有导出能力的页面

`export-modal.js`（24处相关代码）已提供统一导出框架，以下页面有导出功能：
- `statistics.js`（16处）
- `analytics.js`（24处）
- `audit-logs.js`（3处）
- `user-management.js`（7处）
- `user-hierarchy.js`（25处）
- `assets-portfolio.js`（6处）
- `report.js` / `daily-report.js`

### 缺少导出功能的页面

- `store-management`
- `content-management`
- `trade-management`
- `sessions`
- `dict-management`
- `config-tools`

---

## 13. 批量操作覆盖不全

**严重程度**: 🟠 低 — 需要逐条操作

### 已有批量操作能力的页面

- `batch-operations.js`（81处相关代码，专门的批量操作 composable）
- `table-selection.js` mixin（8处相关代码）
- 已接入页面：`lottery-alerts`、`risk-alerts`、`sessions`、`pending-center`、`orphan-frozen`、`consumption`

### 缺少批量操作的页面

- `analytics`
- `dict-management`
- `content-management`
- `store-management`
- `customer-service`

---

## 附录：搜索方法论

本报告中所有数据均通过以下方式获取：

| 验证项 | 搜索模式 | 搜索范围 |
|---|---|---|
| 错误暴露 | `showError(error.message`、`notification.*error.message` | `src/**/*.js` |
| 轮询逻辑 | `setInterval` | `src/**/*.js` |
| 更新时间提示 | `lastUpdateTime`、`最后更新` | `*.html` + `src/**/*.js` |
| 分页值 | `page_size` | `src/**/*.js` |
| 二次确认 | `confirmAndExecute`、`confirm(` | `src/**/*.js` |
| URL状态同步 | `syncFiltersToURL`、`pushState`、`replaceState` | `src/**/*.js` |
| 图表硬编码色 | `#[0-9a-fA-F]{6}`、`rgba(` | `src/**/*.js` |
| 组件使用 | `dataTable(`、`virtualList(`、`$store.shortcuts` | `*.html` + `src/**/*.js` |
| 排序 | `sortable`、`sort_by`、`orderBy` | `src/**/*.js` |
| 导出 | `export.*csv`、`导出`、`exportData` | `src/**/*.js` |
| 批量操作 | `batch`、`批量`、`selectAll`、`selectedItems` | `src/**/*.js` |

