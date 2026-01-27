# 基于 role_level 的前端权限控制方案

> **文档版本**: 2.0.0（已实施）  
> **创建日期**: 2026-01-27  
> **状态**: ✅ 已实施  
> **相关项目**: admin 前端项目

---

## 1. 方案概述

| 项目 | 说明 |
|-----|------|
| **权限判断依据** | 纯 role_level 阈值 |
| **配置方式** | 前端配置文件 `config/permission-rules.js` |
| **权限粒度** | 菜单级 + 页面级 |
| **技术栈** | Alpine.js Store + Mixin + ES Module |

---

## 2. 业务规则

| role_level | 角色类型 | 可访问功能 |
|------------|---------|-----------|
| `< 80` | 客服 | 工作台 + 客服工作台 |
| `80 - 99` | 运营 | 日常运营、抽奖活动、资产中心、市场交易、用户门店、数据分析 |
| `>= 100` | 管理员 | 全部功能（含系统设置） |

---

## 3. 实现架构

```
┌─────────────────────────────────────────────────────────────┐
│              config/permission-rules.js                     │
│  ┌───────────────────────────────────────────────────────┐  │
│  │ ROLE_LEVEL_THRESHOLDS = { CUSTOMER_SERVICE: 80, ... } │  │
│  │ MENU_ACCESS_RULES = { 'operations.customer': {...} }  │  │
│  │ PAGE_ACCESS_RULES = { 'lottery-management.html': {} } │  │
│  │                                                        │  │
│  │ hasMenuAccess(menuId) → boolean                       │  │
│  │ hasPageAccess(pagePath) → boolean                     │  │
│  │ checkCurrentPageAccess(options) → boolean             │  │
│  └───────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                              │
              ┌───────────────┼───────────────┐
              ▼               ▼               ▼
┌──────────────────┐ ┌──────────────────┐ ┌──────────────────┐
│ Alpine.store     │ │ sidebar-nav.js   │ │ auth-guard.js    │
│ ('auth')         │ │                  │ │ Mixin            │
│                  │ │ filterNavBy      │ │                  │
│ hasMenuAccess()  │ │ Permission()     │ │ checkAuthAnd     │
│ hasPageAccess()  │ │                  │ │ Permission()     │
│ checkPageAccess()│ │ 菜单过滤         │ │ 页面拦截         │
└──────────────────┘ └──────────────────┘ └──────────────────┘
```

---

## 4. 文件清单

### 4.1 新增文件

| 文件 | 说明 |
|-----|------|
| `src/config/permission-rules.js` | 权限规则配置（集中管理） |

### 4.2 修改文件

| 文件 | 修改内容 |
|-----|---------|
| `src/alpine/init.js` | 扩展 auth store，添加权限方法 |
| `src/alpine/components/sidebar-nav.js` | 添加菜单权限过滤 |
| `src/alpine/mixins/auth-guard.js` | 添加页面级权限检查 |

---

## 5. 配置说明

### 5.1 权限阈值配置

文件：`src/config/permission-rules.js`

```javascript
export const ROLE_LEVEL_THRESHOLDS = {
  CUSTOMER_SERVICE: 80,  // 低于此值为客服
  OPERATIONS: 100,       // 低于此值为运营
  ADMIN: 999             // 超管
}
```

### 5.2 菜单权限配置

```javascript
export const MENU_ACCESS_RULES = {
  // 所有人可访问
  'dashboard': { minLevel: 0 },
  'operations.customer': { minLevel: 0 },

  // 需要 role_level >= 80
  'operations': { minLevel: 80 },
  'lottery': { minLevel: 80 },
  'assets': { minLevel: 80 },
  // ...

  // 需要 role_level >= 100
  'system': { minLevel: 100 },
  'system.settings': { minLevel: 100 },
  // ...
}
```

### 5.3 页面权限配置

```javascript
export const PAGE_ACCESS_RULES = {
  'statistics.html': { minLevel: 0 },
  'customer-service.html': { minLevel: 0 },
  'lottery-management.html': { minLevel: 80 },
  'system-settings.html': { minLevel: 100 },
  // ...
}
```

---

## 6. 使用方式

### 6.1 菜单自动过滤

侧边栏菜单会在 `init()` 时自动根据用户 `role_level` 过滤，无需额外代码。

### 6.2 页面级权限检查

在页面组件的 `init()` 方法中调用：

```javascript
function somePage() {
  return {
    ...authGuardMixin(),

    async init() {
      // 方式1：仅检查登录
      if (!this.checkAuth()) return

      // 方式2：检查登录 + 页面权限（推荐）
      if (!this.checkAuthAndPermission()) return

      // 正常初始化
      await this.loadData()
    }
  }
}
```

### 6.3 在 Alpine Store 中使用

```javascript
// 检查菜单权限
Alpine.store('auth').hasMenuAccess('operations.customer')

// 检查页面权限
Alpine.store('auth').hasPageAccess('/admin/lottery-management.html')

// 获取用户权限等级
Alpine.store('auth').roleLevel  // => 50

// 获取权限等级描述
Alpine.store('auth').roleLevelDescription  // => '客服'
```

---

## 7. 效果说明

### 7.1 客服账号（role_level < 80）

**侧边栏显示**：
```
✅ 工作台
✅ 日常运营
   └── ✅ 客服工作台
❌ 抽奖活动（隐藏）
❌ 资产中心（隐藏）
❌ 市场交易（隐藏）
❌ 用户门店（隐藏）
❌ 系统设置（隐藏）
❌ 数据分析（隐藏）
```

**直接访问 URL**：
- 访问 `/admin/lottery-management.html` → 提示"您没有访问此页面的权限" → 跳转到工作台

### 7.2 运营账号（80 <= role_level < 100）

显示除"系统设置"外的所有菜单。

### 7.3 管理员账号（role_level >= 100）

显示全部菜单。

---

## 8. 如何修改权限规则

### 8.1 调整权限阈值

修改 `src/config/permission-rules.js` 中的 `ROLE_LEVEL_THRESHOLDS`：

```javascript
export const ROLE_LEVEL_THRESHOLDS = {
  CUSTOMER_SERVICE: 60,  // 改为 60
  // ...
}
```

### 8.2 新增菜单权限

在 `MENU_ACCESS_RULES` 中添加：

```javascript
'new-menu': { minLevel: 80, description: '新菜单' },
'new-menu.sub-item': { minLevel: 80, description: '子菜单' },
```

### 8.3 新增页面权限

在 `PAGE_ACCESS_RULES` 中添加：

```javascript
'new-page.html': { minLevel: 80, menuId: 'new-menu' },
```

---

## 9. 测试用例

### 9.1 客服账号测试

| 测试项 | 预期结果 |
|-------|---------|
| 登录 role_level=50 账号 | 侧边栏只显示工作台和客服工作台 |
| 点击客服工作台 | 正常跳转 |
| 直接访问 `/admin/lottery-management.html` | 提示无权限，跳转工作台 |
| 控制台日志 | 显示 `[SidebarNav] 用户权限等级: 50，菜单已过滤` |

### 9.2 管理员账号测试

| 测试项 | 预期结果 |
|-------|---------|
| 登录 role_level=100 账号 | 侧边栏显示全部菜单 |
| 访问任意页面 | 正常访问 |

---

## 10. 安全性说明

| 层级 | 控制方式 | 安全性 |
|-----|---------|-------|
| 菜单级 | 侧边栏隐藏 | ⚠️ 可绕过 |
| 页面级 | 页面加载时检查 | ✅ 有保障 |
| API级 | 后端校验 | ✅ 最安全（需后端配合） |

> **建议**：对于敏感操作（如删除、修改配置），建议后端 API 也加 role_level 校验。

---

## 11. 相关文件

| 文件 | 说明 |
|-----|------|
| `src/config/permission-rules.js` | 权限规则配置 |
| `src/alpine/init.js` | Alpine Store 定义 |
| `src/alpine/components/sidebar-nav.js` | 侧边栏组件 |
| `src/alpine/mixins/auth-guard.js` | 认证守卫 Mixin |
| `docs/权限控制功能区域展示方案.md` | 完整权限设计文档 |
