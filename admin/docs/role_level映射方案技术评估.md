# role_level 映射方案技术评估与债务分析

> **文档版本**: 2.0.0  
> **创建日期**: 2026-01-27  
> **更新日期**: 2026-01-27  
> **适用项目**: 餐厅积分抽奖系统 V4.0 管理后台  
> **文档目的**: 基于真实数据库数据评估权限方案，提供长期最优解决方案

---

## 一、项目技术栈概述

### 1.1 后端技术框架

| 技术领域 | 技术选型 |
|----------|----------|
| **后端框架** | Node.js 20+ + Express 4.x |
| **数据库** | MySQL + Sequelize 6.x ORM |
| **缓存** | Redis (ioredis) + 内存双层缓存 |
| **认证** | JWT (jsonwebtoken) + RBAC 权限 |
| **时区** | 全系统北京时间 (UTC+8) |

### 1.2 前端技术框架（2026-01-27 实际代码分析）

| 技术领域 | 技术选型 |
|----------|----------|
| **构建工具** | Vite 6.x |
| **响应式框架** | Alpine.js 3.x（轻量级，非 Vue/React） |
| **CSS 框架** | Tailwind CSS 3.x |
| **图表库** | ECharts 6.x |
| **WebSocket** | Socket.io-client 4.x |
| **模块化** | ES Module |
| **架构模式** | MPA 多页面应用（非 SPA） |

**前端权限控制机制**：
- 权限规则定义在 `admin/src/config/permission-rules.js`
- 侧边栏组件 `sidebar-nav.js` 调用 `hasMenuAccess()` 过滤菜单
- 页面级权限通过 `checkCurrentPageAccess()` 检查
- 用户 `role_level` 从 `localStorage.admin_user` 获取

### 1.3 权限系统核心文件

**后端文件**：

| 文件路径 | 用途 |
|----------|------|
| `middleware/auth.js` | 后端权限中间件，包含 ROLE_LEVEL_MAP |
| `models/Role.js` | 角色模型定义 |
| `models/UserRole.js` | 用户角色关联表 |

**前端文件**（2026-01-27 实际代码分析）：

| 文件路径 | 用途 | 需要修改 |
|----------|------|----------|
| `admin/src/config/permission-rules.js` | 权限规则配置（阈值、菜单、页面） | ✅ 是 |
| `admin/src/alpine/components/sidebar-nav.js` | 侧边栏导航组件（调用权限过滤） | ❌ 否 |
| `admin/src/utils/index.js` | 工具函数（无权限相关） | ❌ 否 |
| `admin/src/main.js` | 前端入口（无权限相关） | ❌ 否 |

---

## 二、真实数据库数据分析

> **数据来源**: 2026-01-27 从生产数据库实时查询

### 2.1 roles 表实际数据

```
┌─────────┬────────────────────┬────────────┬───────────────────────────────┐
│ role_id │ role_name          │ role_level │ 主要权限                      │
├─────────┼────────────────────┼────────────┼───────────────────────────────┤
│ 2       │ admin              │ 100        │ *:* (所有权限)                │
│ 6       │ regional_manager   │ 80         │ staff/users/stores/reports... │
│ 7       │ business_manager   │ 60         │ staff/stores/consumption...   │
│ 8       │ sales_staff        │ 40         │ stores/profile/consumption    │
│ 11      │ merchant_manager   │ 40         │ staff/store/consumption       │
│ 9       │ ops                │ 30         │ 全部只读权限                  │
│ 10      │ merchant_staff     │ 20         │ consumption:create/read       │
│ 5       │ campaign_2         │ 10         │ campaign:access               │
│ 1       │ user               │ 0          │ lottery/profile/points        │
│ 100     │ system_job         │ -1         │ 系统定时任务专用              │
└─────────┴────────────────────┴────────────┴───────────────────────────────┘
```

### 2.2 user_roles 关联统计

```
┌────────────────────┬────────────┬────────────┐
│ role_name          │ role_level │ user_count │
├────────────────────┼────────────┼────────────┤
│ admin              │ 100        │ 4          │
│ regional_manager   │ 80         │ 0          │
│ business_manager   │ 60         │ 1          │
│ merchant_manager   │ 40         │ 1          │
│ ops                │ 30         │ 1          │
│ merchant_staff     │ 20         │ 0          │
│ user               │ 0          │ 13         │
└────────────────────┴────────────┴────────────┘
```

### 2.3 🔴 发现的核心问题：前后端阈值严重不一致

| 位置 | ops 阈值定义 | 实际 ops role_level |
|------|-------------|---------------------|
| 后端 `auth.js` ROLE_LEVEL_MAP | `ops: 80` | - |
| 前端 `permission-rules.js` | `CUSTOMER_SERVICE: 80` | - |
| **数据库实际值** | - | **30** |

**影响**：
- 实际 ops 用户 (role_level=30) 无法通过后端 ROLE_LEVEL_MAP 的 `ops: 80` 映射
- 前端 minLevel: 80 的菜单对 ops 用户不可见

---

## 三、现有实现方案分析

### 3.1 后端 requireRole 中间件

```javascript
// middleware/auth.js (当前实现)
const ROLE_LEVEL_MAP = {
  admin: 100,           // role_level >= 100 视为 admin
  ops: 80,              // role_level >= 80 视为 ops ← 与数据库不一致！
  customer_service: 1   // role_level >= 1 视为 customer_service
}

const hasMatchingRole = roles.some(role => {
  // 1. 先检查角色名称匹配
  if (userRoleNames.includes(role)) return true
  
  // 2. 再检查 role_level 映射
  const minLevel = ROLE_LEVEL_MAP[role]
  if (minLevel !== undefined && userRoleLevel >= minLevel) return true
  
  return false
})
```

### 3.2 路由中的使用情况

通过 grep 分析，共发现 **56 处** 使用 requireRole：

```javascript
// 模式1：大量使用（~50处）
router.use(authenticateToken, requireRole(['admin', 'ops']))

// 模式2：客服路由（3处）
router.use(authenticateToken, requireRole(['admin', 'ops', 'customer_service']))

// 模式3：仅管理员（少量）
router.use(authenticateToken, requireRole('admin'))
```

### 3.3 前端权限配置

```javascript
// admin/src/config/permission-rules.js
export const ROLE_LEVEL_THRESHOLDS = {
  CUSTOMER_SERVICE: 80,  // ← 与后端不一致
  OPERATIONS: 100,
  ADMIN: 999
}

export const MENU_ACCESS_RULES = {
  'dashboard': { minLevel: 0 },
  'operations.customer': { minLevel: 0 },
  'operations': { minLevel: 80 },        // ← ops用户(30)看不到
  'lottery': { minLevel: 80 },
  'assets': { minLevel: 80 },
  'system': { minLevel: 100 },
  // ...
}
```

---

## 四、🔴 前后端与数据库实际差异对照（核心问题）

> **决策基础**：以下差异分析是三个决策点的直接依据。

### 4.1 数据库实际值（权威数据源 - 保持不变）

| role_name | role_level | 用户数 | 定位 |
|-----------|------------|--------|------|
| admin | 100 | 4 | 超级管理员 |
| regional_manager | 80 | 0 | 区域经理（预留） |
| business_manager | 60 | 1 | 业务经理 |
| sales_staff | 40 | 0 | 销售人员 |
| merchant_manager | 40 | 1 | 商户店长 |
| **ops** | **30** | 1 | 运营人员（只读） |
| merchant_staff | 20 | 0 | 商户员工 |
| user | 0 | 13 | 普通用户 |

### 4.2 后端错误配置（需废除）

**文件**: `middleware/auth.js`

```javascript
// ❌ 当前错误配置 - ROLE_LEVEL_MAP
const ROLE_LEVEL_MAP = {
  admin: 100,           // ✅ 与数据库一致
  ops: 80,              // ❌ 错误！数据库是 30
  customer_service: 1   // ⚠️ 数据库无此角色
}
```

**问题说明**：
- `ops: 80` 与数据库实际 `role_level=30` 严重不一致
- 当调用 `requireRole(['ops'])` 时，会要求 `role_level >= 80`
- 但实际 ops 用户的 `role_level=30`，导致判断逻辑混乱

### 4.3 前端错误配置（需修改）

**文件**: `admin/src/config/permission-rules.js`（2026-01-27 实际代码分析）

```javascript
// ❌ 当前错误配置（第22-29行）
export const ROLE_LEVEL_THRESHOLDS = {
  CUSTOMER_SERVICE: 80,  // ❌ 错误！实际 ops 角色的 level 是 30
  OPERATIONS: 100,
  ADMIN: 999
}

// ❌ 菜单权限配置（第40-81行）- 大量使用 minLevel: 80
export const MENU_ACCESS_RULES = {
  'dashboard': { minLevel: 0 },           // ✅ 正确
  'operations.customer': { minLevel: 0 }, // ✅ 正确
  
  'operations': { minLevel: 80 },         // ❌ ops(30)看不到
  'operations.consumption': { minLevel: 80 },
  'lottery': { minLevel: 80 },            // ❌ ops(30)看不到
  'assets': { minLevel: 80 },             // ❌ ops(30)看不到
  'market': { minLevel: 80 },             // ❌ ops(30)看不到
  'users': { minLevel: 80 },              // ❌ ops(30)看不到
  'analytics': { minLevel: 80 },          // ❌ ops(30)看不到
  
  'system': { minLevel: 100 },            // ✅ 正确
}

// ❌ 页面权限配置（第90-123行）- 同样使用 minLevel: 80
export const PAGE_ACCESS_RULES = {
  'statistics.html': { minLevel: 0 },        // ✅ 正确
  'customer-service.html': { minLevel: 0 },  // ✅ 正确
  
  'finance-management.html': { minLevel: 80 },  // ❌ 需改为30
  'lottery-management.html': { minLevel: 80 },  // ❌ 需改为30
  'asset-management.html': { minLevel: 80 },    // ❌ 需改为30
  // ... 共18处需要修改
  
  'system-settings.html': { minLevel: 100 },    // ✅ 正确
}
```

**问题说明**：
- 前端要求 `minLevel: 80` 才能访问运营菜单
- 但 `ops` 角色实际 `role_level=30`
- 导致 ops 用户无法看到本应有权访问的菜单

**前端权限过滤机制**（`sidebar-nav.js` 第367-409行）：
```javascript
// 侧边栏初始化时调用
filterNavByPermission() {
  this.navGroups = this._originalNavGroups
    .map(group => {
      // 过滤子菜单项
      filteredGroup.items = group.items.filter(item => {
        const menuId = `${group.id}.${item.id}`
        return hasMenuAccess(menuId)  // ← 调用 permission-rules.js
      })
      // 子菜单全部过滤则隐藏整个分组
      if (filteredGroup.items.length === 0) return null
      return filteredGroup
    })
    .filter(group => group !== null)
}
```

**结论**：前端只需修改 `permission-rules.js` 中的阈值配置，无需修改 `sidebar-nav.js` 逻辑。

### 4.4 差异汇总表

| 配置位置 | ops 对应的 role_level | 状态 | 修复方案 |
|----------|----------------------|------|----------|
| **数据库** | 30 | ✅ 权威数据源 | 保持不变 |
| **后端 ROLE_LEVEL_MAP** | 80 | ❌ 与数据库不一致 | **废除整个 ROLE_LEVEL_MAP** |
| **前端 ROLE_LEVEL_THRESHOLDS** | 80（作为运营阈值） | ❌ 与数据库不一致 | **修改为 30** |

### 4.5 最终统一的 role_level 阈值标准（已决策）

```javascript
// ✅ 统一标准（以数据库实际值为准，零冗余常量）
const PERMISSION_LEVELS = {
  ADMIN: 100,          // role_level >= 100：超级管理员
  OPS: 30,             // role_level >= 30：运营及以上 ← 核心修改点
  CUSTOMER_SERVICE: 1, // role_level >= 1：客服及以上
  USER: 0              // role_level = 0：普通用户
}
// 注：HIGH_OPS(80) 不单独定义，需要时直接用数值 80
```

---

## 五、🔴 需要决策的问题（全部已确认 2026-01-27）

### 决策1：是否完全废除 ROLE_LEVEL_MAP 映射？ ✅ 已确认

**背景**：当前 `requireRole(['admin', 'ops'])` 依赖 ROLE_LEVEL_MAP 将角色名映射到 role_level 阈值。

| 选项 | 描述 | 优点 | 缺点 |
|------|------|------|------|
| **A. 完全废除** ✅ | 改用 `requireRoleLevel(30)` | 无映射表维护、无同步问题 | 需批量替换 56 处代码 |
| B. 保留但修正 | 修改 ROLE_LEVEL_MAP 使其与数据库一致 | 改动小 | 映射表仍是技术债务 |

**最终决策**：✅ **选项 A - 完全废除 ROLE_LEVEL_MAP**
- `role_name` 字段保留，仅用于**显示**和**日志记录**
- 权限判断**完全使用 role_level 数值比较**，不再做任何名称映射

---

### 决策2：统一的 role_level 阈值标准 ✅ 已确认

**问题**：前端当前使用 `minLevel: 80` 作为运营菜单阈值，但数据库 ops 角色实际是 30。

| 访问级别 | 决策前（错误） | 决策后（以数据库为准） | 可访问的角色 |
|----------|---------------|----------------------|--------------|
| 管理员功能 | >= 100 | **>= 100** | admin |
| 高级运营功能 | >= 80 | **>= 80** | admin, regional_manager |
| 运营功能 | >= 80 ❌ | **>= 30** ✅ | admin, regional_manager, business_manager, sales_staff, merchant_manager, **ops** |
| 客服功能 | >= 80 ❌ | **>= 1** ✅ | 所有 role_level > 0 的用户 |

**最终决策**：✅ **以数据库实际值为准**
- 运营功能阈值从 80 改为 **30**
- 客服功能阈值明确为 **1**
- 前端 `permission-rules.js` 需要同步修改

---

### 决策3：ops 角色的定位 ✅ 已确认

**现状分析**：

| 视角 | ops 的 role_level |
|------|-------------------|
| 代码暗示（`requireRole(['admin', 'ops'])`） | 高权限，与 admin 并列 |
| 后端 ROLE_LEVEL_MAP 配置 | 80（错误配置） |
| **数据库实际值** | **30**（只读运营） |

**选项分析**：

| 选项 | 操作 | 优点 | 缺点 |
|------|------|------|------|
| A. 调整数据库 | 将 ops 的 role_level 改为 80 | 与旧代码意图一致 | 改变现有权限层级设计 |
| **B. 调整代码** ✅ | 改用 `requireRoleLevel(30)` | 尊重数据库设计 | 需批量改代码 |
| C. 重新设计 | 重新定义所有角色 | 彻底解决 | 工作量过大 |

**最终决策**：✅ **选项 B - 保持 ops 角色 role_level=30 不变**
- **不调整数据库**，尊重现有的权限分层设计
- 代码侧改用 `requireRoleLevel(30)` 作为运营功能的访问阈值
- ops 定位：**运营人员（只读权限）**，不是高级运营

---

## 六、推荐方案：统一 requireRoleLevel 中间件

> **前提**：项目未上线，愿意一次性投入成本，追求长期维护成本最低。

### 6.1 方案概述

**核心思路**：废除 ROLE_LEVEL_MAP 映射，统一使用 `requireRoleLevel(minLevel)` 进行权限控制。

```
┌─────────────────────────────────────────────────────────────────┐
│  当前方案（技术债务）                                            │
│  ─────────────────────────────────────────────────────────────  │
│  requireRole(['admin', 'ops'])                                   │
│         ↓                                                        │
│  ROLE_LEVEL_MAP: { admin: 100, ops: 80 }  ← 映射表（需维护）    │
│         ↓                                                        │
│  role_level >= 80 通过                                          │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│  推荐方案（零技术债务）                                          │
│  ─────────────────────────────────────────────────────────────  │
│  requireRoleLevel(30)  ← 直接指定阈值，无映射                   │
│         ↓                                                        │
│  role_level >= 30 通过                                          │
└─────────────────────────────────────────────────────────────────┘
```

### 6.2 统一阈值定义

基于数据库实际角色数据，建议采用以下阈值：

```javascript
// shared/permission-constants.js（前后端共用）
const PERMISSION_LEVELS = {
  /** 管理员：所有功能 */
  ADMIN: 100,
  
  /** 运营：大部分运营功能（含 ops、merchant_manager 等） */
  OPS: 30,
  
  /** 客服：仅客服工作台 */
  CUSTOMER_SERVICE: 1,
  
  /** 普通用户：无后台权限 */
  USER: 0
}
// 注：不定义 HIGH_OPS(80)，避免未使用的常量造成技术债务
// 如果后续需要区分高级运营，直接使用数值 80 即可
```

### 6.3 方案优势对比

| 维度 | 当前方案（映射） | 推荐方案（统一阈值） |
|------|-----------------|---------------------|
| 代码清晰度 | ⭐⭐⭐ 隐式映射 | ⭐⭐⭐⭐⭐ 直观明确 |
| 维护成本 | 需同步映射表 | 无映射表 |
| 前后端一致性 | 易不同步 | 共用常量文件 |
| 新人理解成本 | 高 | 低 |
| 扩展性 | 需改映射表 | 只改阈值 |

---

## 七、具体执行步骤（决策已确认，可执行）

> **说明**：以下步骤基于「推荐方案」设计，**三个决策已全部确认，可以开始执行**。

---

### 📦 任务划分总览

| 任务分类 | 项目 | 步骤 | 修改文件数 | 修改点数 |
|----------|------|------|------------|----------|
| **🔧 后端任务** | `/home/devbox/project/` | 7.1、7.2、7.3、7.5 | ~15个文件 | 58处 |
| **🎨 前端任务** | `/home/devbox/project/admin/` | 7.4 | 1个文件 | 41处 |

---

## 🔧 后端任务（项目路径：`/home/devbox/project/`）

### 7.1 【后端】步骤 1：创建共享常量文件

**文件位置**：`shared/permission-constants.js`（前后端共用）

```javascript
/**
 * 权限等级常量定义
 * 前后端共用，确保阈值一致
 * 注：不定义 HIGH_OPS(80)，避免未使用常量
 */
const PERMISSION_LEVELS = {
  /** 管理员：所有功能（包括系统设置） */
  ADMIN: 100,
  
  /** 运营：大部分运营功能 */
  OPS: 30,
  
  /** 客服：仅客服工作台 */
  CUSTOMER_SERVICE: 1,
  
  /** 普通用户：无后台权限 */
  USER: 0
}

// 前端菜单权限配置
const MENU_MIN_LEVELS = {
  // 所有人可访问
  'dashboard': PERMISSION_LEVELS.USER,
  'operations.customer': PERMISSION_LEVELS.CUSTOMER_SERVICE,
  
  // 运营功能（role_level >= 30）
  'operations': PERMISSION_LEVELS.OPS,
  'lottery': PERMISSION_LEVELS.OPS,
  'assets': PERMISSION_LEVELS.OPS,
  'market': PERMISSION_LEVELS.OPS,
  'users': PERMISSION_LEVELS.OPS,
  'analytics': PERMISSION_LEVELS.OPS,
  
  // 系统设置（仅管理员）
  'system': PERMISSION_LEVELS.ADMIN
}

module.exports = { PERMISSION_LEVELS, MENU_MIN_LEVELS }
```

### 7.2 【后端】步骤 2：新增 requireRoleLevel 中间件

**文件位置**：`middleware/auth.js`（新增函数）

```javascript
/**
 * 🛡️ 基于 role_level 的权限检查中间件（推荐使用）
 * 
 * @description 直接使用 role_level 数值判断，无映射表，无技术债务
 * 
 * @param {number} minLevel - 最低权限等级
 * @returns {Function} Express 中间件函数
 * 
 * @example
 * router.use(authenticateToken, requireRoleLevel(30))   // 运营及以上
 * router.use(authenticateToken, requireRoleLevel(100))  // 仅管理员
 */
function requireRoleLevel(minLevel) {
  return async (req, res, next) => {
    try {
      if (!req.user) {
        return res.apiUnauthorized
          ? res.apiUnauthorized('未认证用户', 'UNAUTHENTICATED')
          : res.status(401).json({ success: false, code: 'UNAUTHENTICATED', message: '未认证用户' })
      }

      const userLevel = req.user.role_level || 0

      if (userLevel < minLevel) {
        logger.warn(
          `🚫 [Auth] 权限等级不足: user_id=${req.user.user_id}, 需要>=${minLevel}, 实际=${userLevel}`
        )
        return res.apiForbidden
          ? res.apiForbidden(`需要权限等级 ${minLevel} 以上`, 'INSUFFICIENT_LEVEL')
          : res.status(403).json({
              success: false,
              code: 'INSUFFICIENT_LEVEL',
              message: `需要权限等级 ${minLevel} 以上`,
              data: { required: minLevel, current: userLevel }
            })
      }

      next()
    } catch (error) {
      logger.error('❌ 权限等级检查失败:', error.message)
      return res.apiError
        ? res.apiError('权限验证失败', 'LEVEL_CHECK_FAILED', null, 500)
        : res.status(500).json({ success: false, code: 'LEVEL_CHECK_FAILED', message: '权限验证失败' })
    }
  }
}
```

### 7.3 【后端】步骤 3：批量替换路由权限检查

**替换规则**：

| 原代码 | 新代码 | 说明 |
|--------|--------|------|
| `requireRole(['admin', 'ops'])` | `requireRoleLevel(30)` | 运营及以上 |
| `requireRole(['admin', 'ops', 'customer_service'])` | `requireRoleLevel(1)` | 客服及以上 |
| `requireRole('admin')` | `requireRoleLevel(100)` | 仅管理员 |

**涉及文件清单**（共 56 处）：

```
routes/v4/console/system-data.js          (14处)
routes/v4/console/business-records.js     (22处)
routes/v4/console/staff.js                (4处)
routes/v4/console/user-hierarchy.js       (1处)
routes/v4/console/admin-audit-logs.js     (5处)
routes/v4/console/regions.js              (1处)
routes/v4/console/assets/portfolio.js     (4处)
routes/v4/system/dictionaries.js          (2处)
routes/v4/console/customer-service/*.js   (3处)
```

---

## 🎨 前端任务（项目路径：`/home/devbox/project/admin/`）

### 7.4 【前端】步骤 4：更新前端权限配置

**文件**：`admin/src/config/permission-rules.js`

**修改 1：阈值常量（第22-29行）**

```javascript
// ❌ 修改前
export const ROLE_LEVEL_THRESHOLDS = {
  CUSTOMER_SERVICE: 80,
  OPERATIONS: 100,
  ADMIN: 999
}

// ✅ 修改后（与数据库一致，零冗余常量）
export const ROLE_LEVEL_THRESHOLDS = {
  CUSTOMER_SERVICE: 1,   // 修正：>= 1 即可访问客服功能
  OPS: 30,               // 新增：运营阈值
  ADMIN: 100             // 修正：管理员阈值
}
// 注：不定义 HIGH_OPS(80)，当前无使用场景，需要时直接用数值
```

**修改 2：菜单权限配置（第40-81行）**

共 **18 处** `minLevel: 80` 需改为 `minLevel: 30`：

```javascript
export const MENU_ACCESS_RULES = {
  // 所有人可访问（保持不变）
  'dashboard': { minLevel: 0, description: '工作台' },
  'operations.customer': { minLevel: 0, description: '客服工作台' },

  // ✅ 运营功能：80 → 30
  'operations': { minLevel: 30, description: '日常运营（分组）' },
  'operations.consumption': { minLevel: 30, description: '消费记录审核' },
  'operations.risk': { minLevel: 30, description: '风控告警' },

  'lottery': { minLevel: 30, description: '抽奖活动（分组）' },
  'lottery.campaigns': { minLevel: 30, description: '活动管理' },
  'lottery.presets': { minLevel: 30, description: '抽奖预设' },

  'assets': { minLevel: 30, description: '资产中心（分组）' },
  'assets.asset-mgmt': { minLevel: 30, description: '资产管理' },
  'assets.asset-adj': { minLevel: 30, description: '资产调整' },
  'assets.orphan': { minLevel: 30, description: '孤儿冻结清理' },
  'assets.material-rules': { minLevel: 30, description: '物料转换规则' },
  'assets.assets-portfolio': { minLevel: 30, description: '资产组合' },

  'market': { minLevel: 30, description: '市场交易（分组）' },
  'market.exchange': { minLevel: 30, description: '兑换市场' },
  'market.trade': { minLevel: 30, description: 'C2C交易' },

  'users': { minLevel: 30, description: '用户门店（分组）' },
  'users.user-mgmt': { minLevel: 30, description: '用户管理' },
  'users.user-hierarchy': { minLevel: 30, description: '用户层级' },
  'users.stores': { minLevel: 30, description: '门店管理' },

  'analytics': { minLevel: 30, description: '数据分析（分组）' },
  'analytics.stats': { minLevel: 30, description: '统计报表' },
  'analytics.analytics': { minLevel: 30, description: '运营分析' },

  // 系统设置（保持不变）
  'system': { minLevel: 100, description: '系统设置（分组）' },
  'system.settings': { minLevel: 100, description: '系统配置' },
  'system.content': { minLevel: 100, description: '内容管理' },
  'system.sessions': { minLevel: 100, description: '会话管理' },
  'system.item-tpl': { minLevel: 100, description: '物品模板' },
  'system.config-tools': { minLevel: 100, description: '配置工具' }
}
```

**修改 3：页面权限配置（第90-123行）**

共 **18 处** `minLevel: 80` 需改为 `minLevel: 30`：

```javascript
export const PAGE_ACCESS_RULES = {
  // 所有人可访问（保持不变）
  'statistics.html': { minLevel: 0, menuId: 'dashboard' },
  'customer-service.html': { minLevel: 0, menuId: 'operations.customer' },

  // ✅ 运营功能：80 → 30
  'finance-management.html': { minLevel: 30, menuId: 'operations.consumption' },
  'risk-alerts.html': { minLevel: 30, menuId: 'operations.risk' },
  'lottery-management.html': { minLevel: 30, menuId: 'lottery.campaigns' },
  'presets.html': { minLevel: 30, menuId: 'lottery.presets' },
  'asset-management.html': { minLevel: 30, menuId: 'assets.asset-mgmt' },
  'asset-adjustment.html': { minLevel: 30, menuId: 'assets.asset-adj' },
  'orphan-frozen.html': { minLevel: 30, menuId: 'assets.orphan' },
  'material-conversion-rules.html': { minLevel: 30, menuId: 'assets.material-rules' },
  'assets-portfolio.html': { minLevel: 30, menuId: 'assets.assets-portfolio' },
  'exchange-market.html': { minLevel: 30, menuId: 'market.exchange' },
  'trade-management.html': { minLevel: 30, menuId: 'market.trade' },
  'user-management.html': { minLevel: 30, menuId: 'users.user-mgmt' },
  'user-hierarchy.html': { minLevel: 30, menuId: 'users.user-hierarchy' },
  'store-management.html': { minLevel: 30, menuId: 'users.stores' },
  'analytics.html': { minLevel: 30, menuId: 'analytics.analytics' },

  // 系统设置（保持不变）
  'system-settings.html': { minLevel: 100, menuId: 'system.settings' },
  'content-management.html': { minLevel: 100, menuId: 'system.content' },
  'sessions.html': { minLevel: 100, menuId: 'system.sessions' },
  'item-templates.html': { minLevel: 100, menuId: 'system.item-tpl' },
  'config-tools.html': { minLevel: 100, menuId: 'system.config-tools' }
}
```

**修改 4：角色描述函数（第261-273行）**

```javascript
// ❌ 修改前
export function getUserRoleLevelDescription() {
  const level = getUserRoleLevel()
  if (level >= ROLE_LEVEL_THRESHOLDS.ADMIN) return '超级管理员'
  else if (level >= ROLE_LEVEL_THRESHOLDS.OPERATIONS) return '管理员'
  else if (level >= ROLE_LEVEL_THRESHOLDS.CUSTOMER_SERVICE) return '运营'
  else return '客服'
}

// ✅ 修改后
export function getUserRoleLevelDescription() {
  const level = getUserRoleLevel()
  if (level >= 100) return '超级管理员'
  else if (level >= 80) return '高级运营'
  else if (level >= 30) return '运营'
  else if (level >= 1) return '客服'
  else return '普通用户'
}
```

---

## 🔧 后端任务（续）

### 7.5 【后端】步骤 5：废除旧代码

**删除内容**：

1. `middleware/auth.js` 中的 `ROLE_LEVEL_MAP` 常量
2. `requireRole` 函数中的 role_level 映射逻辑（可保留角色名称匹配作为兜底）

---

## 📋 执行顺序（前后端分离）

### 7.6 建议执行顺序

```
┌─────────────────────────────────────────────────────────────────┐
│                      🔧 后端任务（先执行）                        │
├─────────────────────────────────────────────────────────────────┤
│ 1. 创建 shared/permission-constants.js    【步骤7.1】            │
│ 2. 新增 requireRoleLevel 中间件            【步骤7.2】            │
│ 3. 批量替换路由 requireRole→requireRoleLevel【步骤7.3】          │
│ 4. 删除 ROLE_LEVEL_MAP 映射表               【步骤7.5】            │
│ 5. 后端测试验证                                                  │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│                      🎨 前端任务（后执行）                        │
├─────────────────────────────────────────────────────────────────┤
│ 6. 更新 permission-rules.js 阈值配置       【步骤7.4】            │
│ 7. 前端测试验证（菜单权限、页面访问）                              │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│                      🧪 联调测试                                 │
├─────────────────────────────────────────────────────────────────┤
│ 8. 前后端联调（不同角色登录验证）                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 7.7 任务清单（可打印）

#### 🔧 后端开发任务清单

| 序号 | 步骤 | 文件/位置 | 修改项数 | 状态 |
|------|------|-----------|----------|------|
| 1 | 7.1 | `shared/permission-constants.js`（新建） | 1 | ☐ |
| 2 | 7.2 | `middleware/auth.js`（新增函数） | 1 | ☐ |
| 3 | 7.3 | `routes/v4/console/*.js`（批量替换） | 56 | ☐ |
| 4 | 7.5 | `middleware/auth.js`（删除旧代码） | 1 | ☐ |
| - | - | **后端合计** | **59** | - |

#### 🎨 前端开发任务清单

| 序号 | 步骤 | 文件/位置 | 修改项数 | 状态 |
|------|------|-----------|----------|------|
| 1 | 7.4 修改1 | `src/config/permission-rules.js` 第22-29行 | 1 | ☐ |
| 2 | 7.4 修改2 | `src/config/permission-rules.js` 第40-81行 | 18 | ☐ |
| 3 | 7.4 修改3 | `src/config/permission-rules.js` 第90-123行 | 18 | ☐ |
| 4 | 7.4 修改4 | `src/config/permission-rules.js` 第261-273行 | 1 | ☐ |
| - | - | **前端合计** | **38** | - |

---

## 八、维护指南

### 8.1 新增角色时的检查清单

- [ ] 确定 role_level 数值（参考现有角色分布）
- [ ] 确定 role_name（仅用于显示和日志）
- [ ] 在 `shared/permission-constants.js` 中添加阈值常量（如需新阈值）
- [ ] 更新 `admin/src/config/permission-rules.js` 中的菜单权限
- [ ] 更新本文档的角色-等级对应表
- [ ] 配置 `permissions` JSON 字段的细粒度权限
- [ ] 添加单元测试覆盖新角色

### 8.2 字段用途说明

| 字段 | 用途 | 示例 |
|------|------|------|
| `role_level` | **权限判断**（唯一依据） | `>= 100` 为管理员 |
| `role_name` | 显示和日志（辅助） | `"admin"` → "管理员" |
| `permissions` | 细粒度控制（按钮级权限） | `{"assets": ["read", "write"]}` |

### 8.3 数据库角色-等级对应表（当前实际数据）

| role_id | role_name | role_level | 用户数 | 定位 |
|---------|-----------|------------|--------|------|
| 2 | admin | 100 | 4 | 超级管理员 |
| 6 | regional_manager | 80 | 0 | 区域经理 |
| 7 | business_manager | 60 | 1 | 业务经理 |
| 8 | sales_staff | 40 | 0 | 销售人员 |
| 11 | merchant_manager | 40 | 1 | 商户店长 |
| 9 | ops | 30 | 1 | 运营（只读） |
| 10 | merchant_staff | 20 | 0 | 商户员工 |
| 1 | user | 0 | 13 | 普通用户 |

### 8.4 常见问题排查

**问题：用户登录成功但 API 返回 403**

排查步骤：
1. 查询用户的 **role_level 值**：
   ```sql
   SELECT u.user_id, r.role_name, r.role_level 
   FROM users u 
   JOIN user_roles ur ON u.user_id = ur.user_id 
   JOIN roles r ON ur.role_id = r.role_id 
   WHERE u.mobile = '用户手机号';
   ```
2. 检查 API 路由的 `requireRoleLevel(minLevel)` 要求
3. 确认 `role_level >= minLevel`

**问题：前端菜单不显示**

排查步骤：
1. 检查 `permission-rules.js` 中的 `MENU_ACCESS_RULES` 配置
2. 确认用户 role_level 满足 minLevel 要求
3. 检查 localStorage 中的 `admin_user` 是否包含正确的 role_level

---

## 九、前后端技术兼容性确认

### 9.1 后端兼容性 ✅

| 检查项 | 状态 | 说明 |
|--------|------|------|
| Node.js 20+ | ✅ 兼容 | 方案使用标准 Express 中间件 |
| Sequelize ORM | ✅ 兼容 | 直接使用 `role_level` 字段 |
| JWT 认证 | ✅ 兼容 | `req.user.role_level` 已在 token 中 |
| 现有路由结构 | ✅ 兼容 | 仅需批量替换中间件调用 |

### 9.2 前端兼容性 ✅

| 检查项 | 状态 | 说明 |
|--------|------|------|
| Vite 构建 | ✅ 兼容 | 无需修改构建配置 |
| Alpine.js | ✅ 兼容 | `sidebar-nav.js` 无需修改逻辑 |
| ES Module | ✅ 兼容 | 权限规则使用标准 ES Module 导出 |
| 权限过滤机制 | ✅ 兼容 | 仅需修改 `permission-rules.js` 中的阈值 |

### 9.3 修改范围汇总（按项目划分）

#### 🔧 后端项目修改（`/home/devbox/project/`）

| 文件 | 修改内容 | 修改量 |
|------|----------|--------|
| `shared/permission-constants.js` | 新建常量文件 | +1 文件 |
| `middleware/auth.js` | 新增 `requireRoleLevel`，删除 `ROLE_LEVEL_MAP` | +1 函数, -1 常量 |
| `routes/v4/console/*.js` | 批量替换 `requireRole` → `requireRoleLevel` | 56 处 |
| **后端合计** | - | **~59 处** |

#### 🎨 前端项目修改（`/home/devbox/project/admin/`）

| 文件 | 修改内容 | 修改量 |
|------|----------|--------|
| `src/config/permission-rules.js` | 阈值常量修改 | 1 处 |
| `src/config/permission-rules.js` | 菜单权限 `minLevel: 80` → `30` | 18 处 |
| `src/config/permission-rules.js` | 页面权限 `minLevel: 80` → `30` | 18 处 |
| `src/config/permission-rules.js` | 角色描述函数修改 | 1 处 |
| **前端合计** | - | **38 处** |

---

### 9.4 原有汇总表（参考）

| 层级 | 文件 | 修改内容 | 修改量 |
|------|------|----------|--------|
| **后端** | `middleware/auth.js` | 新增 `requireRoleLevel()` | +40行 |
| **后端** | `middleware/auth.js` | 删除 `ROLE_LEVEL_MAP` | -10行 |
| **后端** | `routes/v4/**/*.js` | 替换 `requireRole` → `requireRoleLevel` | 56处 |
| **前端** | `admin/src/config/permission-rules.js` | 修改阈值常量 | 4处 |
| **前端** | `admin/src/config/permission-rules.js` | 修改菜单权限 minLevel | 18处 |
| **前端** | `admin/src/config/permission-rules.js` | 修改页面权限 minLevel | 18处 |
| **前端** | `admin/src/config/permission-rules.js` | 修改角色描述函数 | 1处 |
| **共享** | `shared/permission-constants.js` | 新建常量文件 | +30行 |

**总计**：后端 56 处替换 + 前端 41 处修改

---

## 十、总结

### 10.1 核心决策（已确认 2026-01-27）

| 问题 | 最终决策 | 状态 |
|------|----------|------|
| 是否废除 ROLE_LEVEL_MAP？ | ✅ 废除，改用 requireRoleLevel，role_name 保留但仅用于显示/日志 | ✅ 已拍板 |
| 统一阈值标准？ | 以数据库实际值为准：ADMIN=100, OPS=30, CUSTOMER_SERVICE=1（不定义 HIGH_OPS 避免死代码） | ✅ 已拍板 |
| ops 角色定位？ | 保持 role_level=30 不变，不调整数据库 | ✅ 已拍板 |
| HIGH_OPS(80) 是否保留？ | ❌ 不保留，避免未使用常量造成技术债务 | ✅ 已拍板 |

### 10.2 方案对比总结

| 维度 | 当前方案（映射） | 推荐方案（统一阈值） |
|------|-----------------|---------------------|
| 技术债务 | ⚠️ 映射表需维护 | ✅ 零债务 |
| 代码清晰度 | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ |
| 前后端一致性 | ⚠️ 易不同步 | ✅ 共用常量 |
| 实施成本 | 已实施 | 需改 56 处路由 |
| 长期维护成本 | 高 | 低 |

### 10.3 核心原则

```
┌─────────────────────────────────────────────────────────────┐
│  role_level 为唯一权限判断依据                              │
│  ─────────────────────────────────────────────────────────  │
│  • 权限判断：requireRoleLevel(minLevel) - 直接比较数值     │
│  • 显示/日志：role_name - 仅人类可读展示                   │
│  • 细粒度控制：permissions JSON - 按钮级权限控制           │
│  • 前后端统一：共享 permission-constants.js 常量           │
└─────────────────────────────────────────────────────────────┘
```

---

## 附录 A：相关文件索引

| 文件路径 | 用途 |
|----------|------|
| `middleware/auth.js` | 后端权限中间件（含 requireRole、requireRoleLevel） |
| `models/Role.js` | 角色模型定义 |
| `models/UserRole.js` | 用户角色关联表模型 |
| `admin/src/config/permission-rules.js` | 前端权限配置 |
| `shared/permission-constants.js` | 前后端共享常量（待创建） |

---

## 附录 B：数据库结构参考

### roles 表结构

```sql
CREATE TABLE roles (
  role_id INT PRIMARY KEY AUTO_INCREMENT,
  role_uuid VARCHAR(36) NOT NULL UNIQUE,
  role_name VARCHAR(50) NOT NULL UNIQUE,
  role_level INT NOT NULL DEFAULT 0,
  permissions JSON DEFAULT NULL,
  description TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  created_at DATETIME,
  updated_at DATETIME
);
```

### user_roles 表结构

```sql
CREATE TABLE user_roles (
  user_id INT NOT NULL,
  role_id INT NOT NULL,
  assigned_at DATETIME,
  assigned_by INT,
  is_active BOOLEAN DEFAULT TRUE,
  PRIMARY KEY (user_id, role_id),
  FOREIGN KEY (user_id) REFERENCES users(user_id),
  FOREIGN KEY (role_id) REFERENCES roles(role_id)
);
```

---

## 附录 C：快速参考

### 统一阈值速查表（推荐方案）

| 访问级别 | role_level | 对应角色 | 可访问功能 |
|----------|------------|----------|------------|
| 管理员 | >= 100 | admin | 所有功能 |
| 高级运营 | >= 80 | regional_manager | 除系统设置外所有 |
| 运营 | >= 30 | business_manager, ops, merchant_manager | 大部分运营功能 |
| 客服 | >= 1 | merchant_staff, 其他 | 仅客服工作台 |
| 普通用户 | = 0 | user | 无后台权限 |

### 路由权限替换速查

| 原代码 | 新代码 |
|--------|--------|
| `requireRole(['admin', 'ops'])` | `requireRoleLevel(30)` |
| `requireRole(['admin', 'ops', 'customer_service'])` | `requireRoleLevel(1)` |
| `requireRole('admin')` | `requireRoleLevel(100)` |
| `requireAdmin` | `requireRoleLevel(100)` |

