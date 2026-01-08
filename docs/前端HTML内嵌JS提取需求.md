# 前端HTML内嵌JS提取需求

**创建时间**：2026年01月09日  
**项目版本**：V4.0.0  
**文档目的**：记录web管理后台HTML页面中内嵌JavaScript的提取工作

---

## 📋 需求背景

### 问题描述

web管理后台的HTML文件中存在大量内嵌JavaScript代码：

- 无法通过ESLint进行代码质量检查
- 代码复用性差，相同逻辑在多个页面重复
- 维护困难，修改时需要在HTML中查找JavaScript代码
- 不符合前端工程化最佳实践

### 解决方案

1. 将HTML文件中的内嵌`<script>`代码提取到独立的`.js`文件
2. 创建公共模块（如Toast组件）供多个页面复用
3. HTML文件只引用外部JS文件，不再包含业务逻辑代码

---

## ✅ 已完成工作

### 公共模块

| 文件路径                    | 功能说明                              | 状态      |
| --------------------------- | ------------------------------------- | --------- |
| `/admin/js/admin-common.js` | 公共工具库（认证、API请求、工具函数） | ✅ 已存在 |
| `/admin/js/common/toast.js` | Bootstrap Toast提示组件封装           | ✅ 已创建 |

### P0页面JS提取（9个页面）

| 序号 | HTML文件                      | 提取的JS文件                         | 状态    |
| ---- | ----------------------------- | ------------------------------------ | ------- |
| 1    | `lottery-quota.html`          | `js/pages/lottery-quota.js`          | ✅ 完成 |
| 2    | `campaign-budget.html`        | `js/pages/campaign-budget.js`        | ✅ 完成 |
| 3    | `assets-portfolio.html`       | `js/pages/assets-portfolio.js`       | ✅ 完成 |
| 4    | `asset-adjustment.html`       | `js/pages/asset-adjustment.js`       | ✅ 完成 |
| 5    | `material-balances.html`      | `js/pages/material-balances.js`      | ✅ 完成 |
| 6    | `material-transactions.html`  | `js/pages/material-transactions.js`  | ✅ 完成 |
| 7    | `diamond-accounts.html`       | `js/pages/diamond-accounts.js`       | ✅ 完成 |
| 8    | `exchange-market-orders.html` | `js/pages/exchange-market-orders.js` | ✅ 完成 |
| 9    | `presets.html`                | `js/pages/presets.js`                | ✅ 完成 |

---

## 📁 文件结构

```
public/admin/
├── js/
│   ├── admin-common.js          # 公共工具库（认证、API、工具函数）
│   ├── api-config.js            # API配置
│   ├── dom-utils.js             # DOM工具函数
│   ├── resource-config.js       # 资源配置
│   ├── common/
│   │   └── toast.js             # ✅ Toast提示组件
│   ├── pages/
│   │   ├── # ===== P0 页面 =====
│   │   ├── lottery-quota.js     # ✅ 抽奖配额页面逻辑
│   │   ├── campaign-budget.js   # ✅ 活动预算页面逻辑
│   │   ├── assets-portfolio.js  # ✅ 资产总览页面逻辑
│   │   ├── asset-adjustment.js  # ✅ 资产调整页面逻辑
│   │   ├── material-balances.js # ✅ 材料余额页面逻辑
│   │   ├── material-transactions.js # ✅ 材料流水页面逻辑
│   │   ├── diamond-accounts.js  # ✅ 钻石账户页面逻辑
│   │   ├── exchange-market-orders.js # ✅ 兑换订单页面逻辑
│   │   ├── presets.js           # ✅ 干预规则页面逻辑
│   │   ├── # ===== P1 页面 =====
│   │   ├── users.js             # ✅ 用户管理页面逻辑
│   │   ├── consumption.js       # ✅ 消费记录页面逻辑
│   │   ├── # ===== P2 页面 =====
│   │   ├── dashboard.js         # ✅ 首页仪表板页面逻辑
│   │   ├── login.js             # ✅ 登录页面逻辑
│   │   ├── settings.js          # ✅ 系统设置页面逻辑
│   │   ├── prizes.js            # ✅ 奖品管理页面逻辑
│   │   ├── announcements.js     # ✅ 公告管理页面逻辑
│   │   ├── feedbacks.js         # ✅ 反馈管理页面逻辑
│   │   ├── notifications.js     # ✅ 通知管理页面逻辑
│   │   ├── statistics.js        # ✅ 统计分析页面逻辑
│   │   ├── analytics.js         # ✅ 数据分析页面逻辑
│   │   ├── charts.js            # ✅ 图表页面逻辑
│   │   ├── # ===== P3 页面 =====
│   │   ├── customer-service.js  # ✅ 客服工作台页面逻辑
│   │   ├── audit-logs.js        # ✅ 审计日志页面逻辑
│   │   ├── image-resources.js   # ✅ 图片资源页面逻辑
│   │   ├── activity-conditions.js # ✅ 活动条件页面逻辑
│   │   ├── config-tools.js      # ✅ 配置工具页面逻辑
│   │   ├── exchange-market-items.js # ✅ 兑换商品页面逻辑
│   │   ├── exchange-market-stats.js # ✅ 兑换统计页面逻辑
│   │   ├── marketplace-stats.js # ✅ 市场统计页面逻辑
│   │   ├── material-asset-types.js # ✅ 材料类型页面逻辑
│   │   ├── material-conversion-rules.js # ✅ 转换规则页面逻辑
│   │   ├── merchant-points.js # ✅ 商家积分审核页面逻辑（适配后端API）
│   │   ├── orphan-frozen.js     # ✅ 孤儿冻结页面逻辑
│   │   ├── popup-banners.js     # ✅ 弹窗横幅页面逻辑
│   │   ├── trade-orders.js      # ✅ 交易订单页面逻辑
│   │   ├── # ===== 补充页面 =====
│   │   ├── user-hierarchy.js    # ✅ 用户层级管理页面逻辑
│   │   └── merchant-points.js   # ✅ 商家积分审核页面逻辑
│   └── vendor/                  # 第三方库
│       └── socket.io.min.js     # Socket.IO客户端库
└── *.html                       # HTML页面文件
```

---

## 🔧 HTML引用规范

### 标准引用模板

每个HTML页面的`<script>`部分应按以下顺序引用：

```html
<!-- Bootstrap JS（必需） -->
<script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/js/bootstrap.bundle.min.js"></script>

<!-- 公共工具库（必需） -->
<script src="/admin/js/admin-common.js"></script>

<!-- Toast组件（推荐） -->
<script src="/admin/js/common/toast.js"></script>

<!-- 页面专属逻辑（必需） -->
<script src="/admin/js/pages/页面名称.js"></script>
```

### 示例：lottery-quota.html

```html
<!DOCTYPE html>
<html lang="zh-CN">
  <head>
    <!-- ... head内容 ... -->
  </head>
  <body>
    <!-- ... 页面内容 ... -->

    <!-- 引入外部JS文件 -->
    <script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/js/bootstrap.bundle.min.js"></script>
    <script src="/admin/js/admin-common.js"></script>
    <script src="/admin/js/common/toast.js"></script>
    <script src="/admin/js/pages/lottery-quota.js"></script>
  </body>
</html>
```

---

## 📦 公共模块API

### admin-common.js

提供以下全局函数：

| 函数名                     | 说明                 |
| -------------------------- | -------------------- |
| `getToken()`               | 获取JWT Token        |
| `getCurrentUser()`         | 获取当前登录用户信息 |
| `checkAdminPermission()`   | 检查管理员权限       |
| `logout()`                 | 退出登录             |
| `apiRequest(url, options)` | 统一API请求函数      |
| `formatDate(date)`         | 日期格式化           |
| `showLoading(show)`        | 显示/隐藏加载状态    |

### common/toast.js

提供以下全局函数：

| 函数名                      | 说明                 | 示例                           |
| --------------------------- | -------------------- | ------------------------------ |
| `showSuccessToast(message)` | 显示成功提示（绿色） | `showSuccessToast('操作成功')` |
| `showErrorToast(message)`   | 显示错误提示（红色） | `showErrorToast('操作失败')`   |
| `showWarningToast(message)` | 显示警告提示（黄色） | `showWarningToast('请注意')`   |
| `showInfoToast(message)`    | 显示信息提示（蓝色） | `showInfoToast('提示信息')`    |

---

## ✅ P1页面JS提取（2个页面）

| 序号 | HTML文件           | 提取的JS文件              | 状态    |
| ---- | ------------------ | ------------------------- | ------- |
| 1    | `users.html`       | `js/pages/users.js`       | ✅ 完成 |
| 2    | `consumption.html` | `js/pages/consumption.js` | ✅ 完成 |

---

## ✅ P2页面JS提取（10个页面）

| 序号 | HTML文件             | 提取的JS文件                | 状态    |
| ---- | -------------------- | --------------------------- | ------- |
| 1    | `dashboard.html`     | `js/pages/dashboard.js`     | ✅ 完成 |
| 2    | `login.html`         | `js/pages/login.js`         | ✅ 完成 |
| 3    | `settings.html`      | `js/pages/settings.js`      | ✅ 完成 |
| 4    | `prizes.html`        | `js/pages/prizes.js`        | ✅ 完成 |
| 5    | `announcements.html` | `js/pages/announcements.js` | ✅ 完成 |
| 6    | `feedbacks.html`     | `js/pages/feedbacks.js`     | ✅ 完成 |
| 7    | `notifications.html` | `js/pages/notifications.js` | ✅ 完成 |
| 8    | `statistics.html`    | `js/pages/statistics.js`    | ✅ 完成 |
| 9    | `analytics.html`     | `js/pages/analytics.js`     | ✅ 完成 |
| 10   | `charts.html`        | `js/pages/charts.js`        | ✅ 完成 |

---

## ✅ P3页面JS提取（13个页面）

| 序号 | HTML文件                         | 提取的JS文件                            | 状态    |
| ---- | -------------------------------- | --------------------------------------- | ------- |
| 1    | `customer-service.html`          | `js/pages/customer-service.js`          | ✅ 完成 |
| 2    | `audit-logs.html`                | `js/pages/audit-logs.js`                | ✅ 完成 |
| 3    | `image-resources.html`           | `js/pages/image-resources.js`           | ✅ 完成 |
| 4    | `activity-conditions.html`       | `js/pages/activity-conditions.js`       | ✅ 完成 |
| 5    | `config-tools.html`              | `js/pages/config-tools.js`              | ✅ 完成 |
| 6    | `exchange-market-items.html`     | `js/pages/exchange-market-items.js`     | ✅ 完成 |
| 7    | `exchange-market-stats.html`     | `js/pages/exchange-market-stats.js`     | ✅ 完成 |
| 8    | `marketplace-stats.html`         | `js/pages/marketplace-stats.js`         | ✅ 完成 |
| 9    | `material-asset-types.html`      | `js/pages/material-asset-types.js`      | ✅ 完成 |
| 10   | `material-conversion-rules.html` | `js/pages/material-conversion-rules.js` | ✅ 完成 |
| 11   | `orphan-frozen.html`             | `js/pages/orphan-frozen.js`             | ✅ 完成 |
| 12   | `popup-banners.html`             | `js/pages/popup-banners.js`             | ✅ 完成 |
| 13   | `trade-orders.html`              | `js/pages/trade-orders.js`              | ✅ 完成 |

---

## ✅ 补充页面JS提取（2个页面）

| 序号 | HTML文件               | 提取的JS文件                  | 状态    |
| ---- | ---------------------- | ----------------------------- | ------- |
| 1    | `user-hierarchy.html`  | `js/pages/user-hierarchy.js`  | ✅ 完成 |
| 2    | `merchant-points.html` | `js/pages/merchant-points.js` | ✅ 完成 |

---

## 📝 开发规范

### 1. 文件命名

- 页面JS文件：与HTML文件同名，放在 `js/pages/` 目录
- 公共模块：按功能命名，放在 `js/common/` 目录
- 使用 `kebab-case`（短横线命名法）

### 2. 代码风格

- 使用ES6+语法
- 异步操作使用 `async/await`
- 错误处理使用 `try/catch`
- 添加JSDoc注释说明函数用途

### 3. API调用

- 统一使用 `apiRequest()` 函数
- 处理响应时检查 `response.success`
- 错误时显示用户友好的提示

### 4. Toast提示

- 成功操作：`showSuccessToast()`
- 失败/错误：`showErrorToast()`
- 警告信息：`showWarningToast()`
- 普通信息：`showInfoToast()`

---

## 🔗 相关文档

- [web管理平台前端功能完善方案](./web管理平台前端功能完善方案-2026-01-08.md)
- [admin-frontend-api-client-refactor-plan](./admin-frontend-api-client-refactor-plan.md)
- [待处理问题清单](./待处理问题清单-2026-01-09.md)

---

## 📊 进度统计

| 分类     | 总数 | 已完成 | 进度 |
| -------- | ---- | ------ | ---- |
| P0页面   | 9    | 9      | 100% |
| P1页面   | 2    | 2      | 100% |
| P2页面   | 10   | 10     | 100% |
| P3页面   | 13   | 13     | 100% |
| 补充页面 | 2    | 2      | 100% |
| 公共模块 | 2    | 2      | 100% |

**当前状态**：🎉 所有页面JS提取工作已全部完成 ✅

### 完成统计

- **P0-P3页面总计**：34个页面
- **补充页面**：2个（user-hierarchy.html, merchant-points.html）
- **提取的JS文件**：36个
- **公共模块**：2个（admin-common.js, common/toast.js）

---

_文档最后更新：2026年01月09日_  
_补充完成：user-hierarchy.js, merchant-points.js_
