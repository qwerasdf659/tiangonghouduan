# 路由冲突修复方案：`POST /api/v4/auth/refresh` 不可达问题

**文档编号**：TECH-FIX-20260108-001  
**问题类型**：路由冲突（P0 级别 - 影响权限缓存刷新功能）  
**创建时间**：2026年01月08日 北京时间  
**分析方法**：代码静态分析 + 真实数据库直连核对（Node.js + Sequelize）  
**最终决策**：✅ **方案 A - 拆分到 `/api/v4/permissions/*`**（已确认）  
**决策时间**：2026年01月08日

### 🎯 关键决策确认（2026-01-08 已拍板）

| 决策项           | 最终决定                                       | 理由                                     | 拍板时间          |
| ---------------- | ---------------------------------------------- | ---------------------------------------- | ----------------- |
| **路由方案**     | ✅ 方案 A - 独立域 `/api/v4/permissions/*`     | 语义清晰、符合行业实践、长期可维护       | 2026-01-08 已拍板 |
| **兼容策略**     | ✅ 不做兼容（直接移除旧路径）                  | 旧路径本身就不可达，无历史包袱           | 2026-01-08 已拍板 |
| **接口命名**     | ✅ `POST /api/v4/permissions/cache/invalidate` | 语义更明确，避免与 Token refresh 混淆    | 2026-01-08 已拍板 |
| **ops 权限边界** | ✅ ops 不允许对他人 invalidate（只允许 self）  | 降低运维风险面，权限变更操作限定为 admin | 2026-01-08 已拍板 |
| **内部依赖修正** | ✅ 选项 A - 复用顶部已引入的函数               | 单一引入点、可读性高、避免相对路径错误   | 2026-01-08 已拍板 |

---

## 📋 问题概述

### 症状描述

- **冲突路径**：`POST /api/v4/auth/refresh`
- **预期行为**：根据请求参数/上下文路由到不同的业务逻辑
  - Token 刷新（无需认证，从 HttpOnly Cookie 读取 `refresh_token`）
  - 权限缓存刷新（需要认证，从请求体读取 `user_id`）
- **实际行为**：所有请求都被 Token 刷新 handler 拦截，权限缓存刷新接口**完全不可达**

### 真实数据库现状（Node.js + Sequelize 直连核对 - 2026-01-08）

- **活跃用户**：23 人
- **角色分布**：`admin` 2 人（role_level=100）、`ops` 1 人（role_level=30）、`user` 11 人（role_level=0）
- **特殊用户**：**无角色用户 10 人**、**多角色用户 1 人**
- **权限缓存配置**：内存 TTL 5 分钟 + Redis TTL 30 分钟（权限变更后最长可能延迟 30 分钟生效）
- **业务影响**：权限变更场景真实存在（管理员降级/升级、ops 权限调整、无角色用户批量分配、多角色用户调整）

### 影响范围（基于真实数据库核对 - 2026-01-08）

- **影响功能**：管理员手动清除用户权限缓存的运维接口失效
- **业务场景**（真实存在）：
  - 管理员修改用户角色后，需要立即清除权限缓存使新权限生效（当前 2 个 admin 用户）
  - 用户被禁用/降级后，需要清除缓存防止旧权限继续生效
  - 多角色用户权限变更后，需要强制刷新缓存（当前 1 个多角色用户）
  - 无角色用户批量分配角色后，需要清除缓存使新角色生效（当前 10 个无角色用户）
- **影响用户**（真实数据）：
  - **2 个 admin 用户**（role_level=100）
  - **1 个 ops 用户**（role_level=30）
  - **11 个 user 角色用户**（role_level=0）
  - **10 个无角色用户**（孤立用户，需要批量分配角色）
  - **1 个多角色用户**（同时拥有多个角色）
- **缓存延迟风险**：权限变更后如果不手动失效缓存，**最长可能延迟 30 分钟生效**（Redis TTL）

---

## 🔍 根因分析（基于当前代码）

### 1. 路由挂载顺序导致冲突

**文件**：`routes/v4/auth/index.js:36-39`

```javascript
// 挂载路由
router.use('/', loginRoutes) // POST /login, /quick-login, /decrypt-phone
router.use('/', tokenRoutes) // GET /verify, POST /refresh, /logout
router.use('/', profileRoutes) // GET /profile
router.use('/', permissionRoutes) // 权限相关（包含 POST /refresh）
```

**问题**：

- `tokenRoutes` 先挂载，注册了 `POST /refresh`（Token 刷新）
- `permissionRoutes` 后挂载，也注册了 `POST /refresh`（权限缓存刷新）
- Express 路由匹配规则：**先注册先匹配**，所以第二个 `POST /refresh` 永远不会被执行

### 2. 两个 handler 的业务语义完全不同

#### Token 刷新 handler（`routes/v4/auth/token.js:104`）

```javascript
router.post('/refresh', async (req, res) => {
  // 🔐 从 HttpOnly Cookie 读取 refresh_token
  const refresh_token = req.cookies.refresh_token

  // 验证 refresh_token 并生成新的 access_token
  // 返回：{ access_token, user, expires_in }
})
```

**特征**：

- **无需认证**（不依赖 `authenticateToken` 中间件）
- 从 Cookie 读取 `refresh_token`
- 返回新的 `access_token`

#### 权限缓存失效 handler（`routes/v4/auth/permissions.js:181`）

> **✅ 最终路径**：`POST /api/v4/permissions/cache/invalidate`

```javascript
router.post('/cache/invalidate', authenticateToken, async (req, res) => {
  // 🛡️ 需要认证，从请求体读取 user_id
  const { user_id } = req.body

  // 清除指定用户的权限缓存
  await invalidateUserPermissions(user_id, 'manual_refresh', request_user_id)

  // 返回：{ user_id, cache_cleared: true }
})
```

**特征**：

- **需要认证**（依赖 `authenticateToken` 中间件）
- 从请求体读取 `user_id`
- 调用 `invalidateUserPermissions()` 清除缓存
- 记录审计日志

### 3. 额外发现的隐患

**文件**：`routes/v4/auth/permissions.js:201`

```javascript
// 🔄 清除权限缓存
const { invalidateUserPermissions } = require('../../middleware/auth')
await invalidateUserPermissions(user_id, 'manual_refresh', request_user_id)
```

**问题**：相对路径错误

- 当前路径：`routes/v4/auth/permissions.js`
- 目标路径：`middleware/auth.js`（项目根目录）
- 错误路径：`../../middleware/auth` → 会找到 `routes/middleware/auth`（不存在）
- 正确路径：`../../../middleware/auth`

**影响**：修复路由冲突后，权限缓存刷新接口会因为 `require` 失败返回 500

---

## 🗄️ 真实数据库现状（Node.js + Sequelize 直连核对 - 2026-01-08）

### 连接配置

- **数据库**：使用项目 `.env` 配置（`DB_HOST`/`DB_PORT`/`DB_NAME`/`DB_USER`/`DB_PASSWORD`）
- **连接方式**：通过 `config/database.js` 的 Sequelize 实例
- **时区设置**：`timezone: '+08:00'`（北京时间）
- **核对方式**：Node.js 脚本 + Sequelize ORM + Raw SQL（非备份文件，直连真实库）

### 核心数据统计（2026-01-08 实时核对）

#### 用户与角色分布（真实数据）

```json
{
  "users": {
    "total": 23,
    "active": 23
  },
  "roles": {
    "total": 7,
    "active": 7
  },
  "admin_users_active": 2,
  "ops_users_active": 1,
  "user_role_users_active": 11
}
```

#### 角色详细分布（真实数据）

| 角色名称           | 权限级别 | 绑定用户数 | 业务用途               | ops 权限边界                |
| ------------------ | -------- | ---------- | ---------------------- | --------------------------- |
| `admin`            | 100      | **2**      | 超级管理员（全权限）   | ✅ 可失效任意用户缓存       |
| `regional_manager` | 80       | 0          | 区域负责人（层级管理） | -                           |
| `business_manager` | 60       | 0          | 业务经理（层级管理）   | -                           |
| `sales_staff`      | 40       | 0          | 业务员（层级管理）     | -                           |
| `ops`              | 30       | **1**      | 运维人员（只读权限）   | ❌ 仅可失效自己缓存（self） |
| `campaign_2`       | 10       | 0          | 活动角色（特殊权限）   | -                           |
| `user`             | 0        | **11**     | 普通用户（基础权限）   | ❌ 仅可失效自己缓存（self） |

#### 特殊用户情况（真实数据）

- **无角色用户**：**10 个**活跃用户未分配任何角色（孤立用户，批量分配角色后需要失效缓存）
- **多角色用户**：**1 个**用户同时拥有多个角色（如 `admin` + `user`，角色调整需要立即生效）

#### 权限缓存架构（当前实现）

- **内存缓存 TTL**：5 分钟（`middleware/auth.js` 第 27 行）
- **Redis 缓存 TTL**：30 分钟（`middleware/auth.js` 第 28 行）
- **最长延迟**：权限变更后如果不手动失效缓存，**最长可能延迟 30 分钟生效**
- **缓存键格式**：`auth:permissions:{user_id}`

### 业务影响分析

- **权限变更场景真实存在**：
  - 2 个管理员可能需要降级/升级操作
  - 1 个 ops 用户的权限调整（只读 ↔ 可写）
  - 10 个无角色用户需要批量分配角色
  - 1 个多角色用户的角色调整
- **缓存刷新需求**：当前系统使用**内存缓存（5分钟 TTL）+ Redis 缓存（30分钟 TTL）**，权限变更后如果不手动刷新缓存，**最长可能延迟 30 分钟生效**
- **运维痛点**：管理员修改权限后无法立即验证效果，影响运维效率和用户体验

---

## 🎯 解决方案对比

### ✅ 方案 A：拆分到 `/api/v4/permissions/*`（已选定 - 最终方案）

#### 目标路径规划（已确认最终命名）

| 当前路径                                  | 新路径                                             | 业务功能                 | 备注               |
| ----------------------------------------- | -------------------------------------------------- | ------------------------ | ------------------ |
| `POST /api/v4/auth/refresh`               | **保持不变**                                       | Token 刷新（JWT 续期）   | 无变更             |
| ~~`POST /api/v4/auth/refresh`~~（不可达） | ✅ **`POST /api/v4/permissions/cache/invalidate`** | 权限缓存失效（运维接口） | **已确认最终命名** |
| `GET /api/v4/auth/me`                     | `GET /api/v4/permissions/me`                       | 获取当前用户权限         | -                  |
| `POST /api/v4/auth/check`                 | `POST /api/v4/permissions/check`                   | 检查用户权限             | -                  |
| `GET /api/v4/auth/admins`                 | `GET /api/v4/permissions/admins`                   | 获取管理员列表           | -                  |

> **💡 命名决策说明**：
>
> - 原方案使用 `refresh`，但容易与 Token 刷新混淆
> - 最终采用 `cache/invalidate`，语义更精确：**失效权限缓存**
> - 符合 RESTful 资源命名规范：`/permissions/cache` 是资源，`invalidate` 是动作

#### 实施步骤

**步骤 1：调整路由挂载**

- [ ] 在 `app.js` 第 568 行附近（auth 域挂载之后）新增：
  ```javascript
  /*
   * ========================================
   * 11. /permissions - 权限管理域（2026-01-08 从 auth 域拆分）
   * ========================================
   */
  app.use('/api/v4/permissions', require('./routes/v4/auth/permissions'))
  appLogger.info('✅ permissions域加载成功', { route: '/api/v4/permissions' })
  ```
- [ ] 在 `routes/v4/auth/index.js` 第 39 行删除或注释：
  ```javascript
  // router.use('/', permissionRoutes) // ❌ 删除此行（权限路由已独立挂载）
  ```

**步骤 2：修正权限刷新内部依赖（✅ 已拍板采用选项 A）**

**✅ 选项 A（已拍板）**：复用文件顶部已引入的函数

- [ ] 在 `routes/v4/auth/permissions.js` 第 11 行确认已引入：
  ```javascript
  const {
    authenticateToken,
    getUserRoles,
    invalidateUserPermissions
  } = require('../../../middleware/auth')
  ```
- [ ] 在第 201 行删除重复的 `require`：
  ```javascript
  // 删除：const { invalidateUserPermissions } = require('../../middleware/auth')
  // 直接使用顶部已引入的 invalidateUserPermissions
  await invalidateUserPermissions(user_id, 'manual_refresh', request_user_id)
  ```

**拍板理由**：

- ✅ 单一引入点，避免重复 `require`
- ✅ 可读性高，维护成本低
- ✅ 避免以后目录调整导致相对路径再次写错
- ✅ 符合代码规范（DRY 原则）

**❌ 选项 B（已否决）**：修正相对路径

- 虽然能跑，但属于"补洞式修复"
- 仍然保留重复引入的坏味道
- 以后文件移动/重构更容易再次踩坑

**步骤 3：兼容性处理**

> **✅ 决策：不做兼容处理（直接移除旧路径）**  
> **理由**：旧路径 `POST /api/v4/auth/refresh`（权限缓存刷新）本身就从未可达，不存在历史调用，无需兼容

- [x] **已确认不需要添加兼容别名或 410 Gone 处理**
- [x] 旧路径本身就是"不可达"状态，修复后直接使用新路径即可

**步骤 4：更新 404 处理器可用端点列表**

- [ ] 在 `app.js` 第 695-699 行更新：
  ```javascript
  availableEndpoints: [
    // ... 保留原有端点 ...
    'POST /api/v4/auth/refresh', // ✅ Token 刷新
    'GET /api/v4/permissions/me', // ✅ 新增：获取当前用户权限
    'POST /api/v4/permissions/check', // ✅ 新增：检查权限
    'POST /api/v4/permissions/cache/invalidate', // ✅ 新增：权限缓存失效（已确认最终命名）
    'GET /api/v4/permissions/admins', // ✅ 新增：管理员列表
    'GET /api/v4/permissions/statistics' // ✅ 新增：权限统计
  ]
  ```

#### ✅ 优势（选择此方案的关键原因）

- ✅ **语义清晰**：认证（auth）和权限（permissions）分离，符合 RESTful 设计原则
- ✅ **扩展性强**：未来新增权限相关接口都可以统一放在 `/api/v4/permissions/*`
- ✅ **测试覆盖**：测试用例中已经区分了"认证 API"和"权限 API"
- ✅ **行业最佳实践**：符合大厂（美团/腾讯/阿里）的认证授权分离架构
- ✅ **长期可维护性**：权限体系独立演进，不会与认证逻辑耦合

#### ⚠️ 实施成本（可接受）

- ⚠️ 需要同步调整多个文件（`app.js`、`routes/v4/auth/index.js`、测试用例）
- ⚠️ 预计耗时约 85 分钟（1.5 小时）
- ⚠️ 需要完整的测试验证确保无遗漏

---

### ⚪ 方案 B：改为 `/api/v4/auth/permissions/refresh`（备选方案 - 未采用）

#### 目标路径规划

| 当前路径                                  | 新路径                                  | 业务功能               |
| ----------------------------------------- | --------------------------------------- | ---------------------- |
| `POST /api/v4/auth/refresh`               | **保持不变**                            | Token 刷新（JWT 续期） |
| ~~`POST /api/v4/auth/refresh`~~（不可达） | `POST /api/v4/auth/permissions/refresh` | 权限缓存刷新           |

#### 实施步骤

**步骤 1：调整权限路由挂载**

- [ ] 在 `routes/v4/auth/index.js` 第 39 行修改：
  ```javascript
  // 从：router.use('/', permissionRoutes)
  // 改为：router.use('/permissions', permissionRoutes)
  ```

**步骤 2：修正权限刷新内部依赖**

- [ ] 同方案 A 步骤 2（修正 `require` 路径或复用顶部引入）

#### 优势

- ✅ **改动最小**：只需要调整一行挂载代码
- ✅ **路径层级清晰**：权限管理仍属于认证域的子模块

#### 劣势

- ⚠️ **语义混淆**：`/auth/permissions/refresh` 容易与 `/auth/refresh` 混淆
- ⚠️ **路径不一致**：与其他权限接口（当前在 `/api/v4/permissions/*`）路径不统一

---

## 🎯 最终决策：方案 A（拆分到独立域）

> **✅ 决策确认**：经过方案对比、行业实践分析、真实数据库核对，已确定采用**方案 A**  
> **决策依据**：
>
> - 项目已具备多角色权限体系（admin/ops/user + 无角色/多角色用户真实存在）
> - 权限管理已成为独立业务域，需要与认证（auth）清晰分离
> - 权限双层缓存（内存 5 分钟 + Redis 30 分钟）需要独立治理  
>   **决策时间**：2026年01月08日  
>   **决策人**：项目负责人  
>   **决策方式**：基于真实数据库核对（Node.js + Sequelize 直连）+ 当前代码状态分析

### 选择方案 A 的核心理由（基于真实业务现状）

#### 1. 语义清晰度（最重要）

- **认证（auth）**：负责"身份验证"和"Token 生命周期"
  - 登录/登出
  - Token 刷新（JWT 续期）
  - 身份验证
- **权限（permissions）**：负责"授权"和"权限管理"
  - 权限检查
  - 权限缓存失效（✅ 最终命名：`/cache/invalidate`，避免与 Token refresh 混淆）
  - 角色管理
  - 权限统计

**避免语义污染**：`/auth/refresh` 天然表示"刷新 Token"，权限缓存失效使用 `/permissions/cache/invalidate` 语义精确、无歧义。

#### 1.5 ops 权限边界明确（2026-01-08 已拍板）

- **ops 角色定位**：只读运维（role_level=30）
- **权限缓存失效限制**：
  - ✅ **允许**：ops 用户失效**自己的**权限缓存（`user_id === req.user.user_id`）
  - ❌ **禁止**：ops 用户失效**他人的**权限缓存（返回 403）
  - ✅ **允许**：admin 用户失效任意用户的权限缓存（role_level >= 100）
- **安全理由**：
  - 权限缓存失效会影响"权限生效时刻"，属于敏感操作
  - ops 只读定位，不应具备"影响他人权限"的能力
  - 降低误操作风险（当前有 10 个无角色用户 + 1 个多角色用户，排查时容易误操作）
- **运维需求**：如确有 ops 批量清缓存需求，后续可新增"受控运维入口"并强化审计/审批流程

#### 2. 符合行业最佳实践

- **大厂模式**：美团/腾讯/阿里等互联网大厂普遍采用"认证"与"授权"分离的架构
- **游戏行业**：虚拟物品交易/运营系统通常将权限管理独立为 IAM 模块
- **可扩展性**：权限体系后续会演进为独立能力（审计、风控联动、后台治理）

#### 3. 项目实际情况匹配（基于真实数据库核对 - 2026-01-08）

- **已有多角色体系**：`admin(100)`、`ops(30)`、`user(0)`、层级角色（`regional_manager/business_manager/sales_staff` 已定义但未分配）
- **真实用户分布**（Node.js + Sequelize 直连核对）：
  - **2 个 admin 用户**（role_level=100）
  - **1 个 ops 用户**（role_level=30）
  - **11 个 user 角色用户**（role_level=0）
  - **10 个无角色用户**（孤立用户，需要批量分配角色）
  - **1 个多角色用户**（同时拥有多个角色）
- **权限变更频繁**：需要立即生效的缓存失效机制（当前 TTL 最长 30 分钟）
- **权限缓存架构**：双层缓存（内存 5 分钟 + Redis 30 分钟），不手动失效会延迟生效

#### 4. 长期维护优势

- **边界清晰**：权限相关功能统一在 `/api/v4/permissions/*`，便于团队协作和代码维护
- **测试独立**：测试用例已区分"认证 API"和"权限 API"，迁移后测试逻辑更清晰
- **演进友好**：后续新增权限功能（批量检查、审计、统计）都有明确归属

### 真实数据验证支持（Node.js + Sequelize 直连核对 - 2026-01-08）

- **权限变更场景真实存在**：
  - 2 个 admin 用户（可能需要降级/升级）
  - 1 个 ops 用户（只读权限，不允许对他人 invalidate）
  - 1 个多角色用户（角色调整需要立即生效）
  - 10 个无角色用户（批量分配角色后需要失效缓存）
- **缓存失效有实际需求**：当前缓存 TTL 最长 30 分钟，权限变更后需要立即生效
- **运维接口必要性**：管理员需要在修改权限后立即验证效果，而不是等待缓存过期
- **ops 权限边界**：ops 只能失效自己的缓存（self），不能失效他人缓存（降低运维风险）

---

---

## 🏆 方案 A vs 方案 B：决策对比总结

### 为什么选择方案 A？

| 对比维度       | 方案 A（✅ 已选定）                | 方案 B（⚪ 未采用）              |
| -------------- | ---------------------------------- | -------------------------------- |
| **语义清晰度** | ⭐⭐⭐⭐⭐<br>认证与权限完全分离   | ⭐⭐⭐<br>容易混淆两个 refresh   |
| **扩展性**     | ⭐⭐⭐⭐⭐<br>权限独立域，易扩展   | ⭐⭐<br>权限仍属 auth 子模块     |
| **行业实践**   | ⭐⭐⭐⭐⭐<br>符合大厂标准架构     | ⭐⭐<br>适合早期小项目           |
| **实施成本**   | ⭐⭐⭐<br>需调整多个文件（85分钟） | ⭐⭐⭐⭐⭐<br>改动最小（15分钟） |
| **长期维护**   | ⭐⭐⭐⭐⭐<br>边界清晰，易维护     | ⭐⭐<br>后期拆分更痛             |
| **项目匹配度** | ⭐⭐⭐⭐⭐<br>已有多角色权限体系   | ⭐⭐⭐<br>适合简单权限场景       |

### 决策关键因素

1. **项目已不是"简单权限"阶段**
   - 已有 7 个角色（admin/ops/层级角色）
   - 存在多角色用户和无角色用户
   - 权限缓存需要独立管理

2. **符合行业最佳实践**
   - 大厂（美团/腾讯/阿里）：认证授权分离
   - 游戏公司：权限独立为 IAM 模块
   - 虚拟物品交易平台：权限独立治理

3. **长期可维护性优先**
   - 虽然实施成本稍高（85分钟 vs 15分钟）
   - 但长期维护成本更低
   - 避免后期痛苦的拆分重构

### 方案 B 为什么未采用？

虽然方案 B 实施成本最低（仅需 15 分钟），但存在以下问题：

- ❌ **语义混淆**：`/auth/refresh` 和 `/auth/permissions/refresh` 容易混淆
- ❌ **边界不清**：权限管理仍然耦合在认证域内
- ❌ **后期痛苦**：当权限体系继续复杂化时，拆分成本会更高
- ❌ **不符合项目现状**：项目已经不是"简单权限"阶段

---

## 📝 方案 A 详细实施清单（已确认执行方案）

> **🎯 执行目标**：将权限相关接口从 `/api/v4/auth/*` 迁移到独立的 `/api/v4/permissions/*` 域  
> **⏱️ 预计耗时**：约 85 分钟（1.5 小时）  
> **🔒 风险等级**：中（需要完整测试验证）  
> **📅 计划实施时间**：待定

### 阶段 1：路由调整（核心修复）

#### 1.1 调整 `app.js` 路由挂载

**文件**：`app.js`  
**位置**：第 568 行附近（auth 域挂载之后）

**操作**：新增独立的 permissions 域挂载

```javascript
// 在 app.use('/api/v4/auth', require('./routes/v4/auth')) 之后添加

/*
 * ========================================
 * 11. /permissions - 权限管理域（2026-01-08 从 auth 域拆分）
 * ========================================
 */
app.use('/api/v4/permissions', require('./routes/v4/auth/permissions'))
appLogger.info('✅ permissions域加载成功', { route: '/api/v4/permissions' })
```

**验证点**：

- [ ] 挂载顺序在 `/api/v4/auth` 之后（避免被 auth 域拦截）
- [ ] 日志输出"permissions域加载成功"
- [ ] 启动时无 require 错误

#### 1.2 调整 `routes/v4/auth/index.js`

**文件**：`routes/v4/auth/index.js`  
**位置**：第 39 行

**操作**：移除权限路由挂载

```javascript
// 挂载路由
router.use('/', loginRoutes) // POST /login, /quick-login, /decrypt-phone
router.use('/', tokenRoutes) // GET /verify, POST /refresh, /logout
router.use('/', profileRoutes) // GET /profile
// router.use('/', permissionRoutes) // ❌ 删除此行（权限路由已独立挂载）
```

**验证点**：

- [ ] 删除或注释掉 `permissionRoutes` 挂载
- [ ] 保留 `loginRoutes`、`tokenRoutes`、`profileRoutes` 挂载
- [ ] 启动后 `/api/v4/auth/refresh` 仍可正常访问（Token 刷新）

#### 1.3 修正权限缓存失效内部依赖 + 更新路由路径 + 限制 ops 权限

**文件**：`routes/v4/auth/permissions.js`  
**位置**：第 11 行（顶部引入）和第 181 行（handler 路由路径 + 内部逻辑）

**操作 1：修正 require 路径（✅ 已拍板采用选项 A - 复用顶部引入）**

```javascript
// 第 11 行：确认顶部已引入（如果没有则添加）
const {
  authenticateToken,
  getUserRoles,
  invalidateUserPermissions
} = require('../../../middleware/auth')

// 第 201 行：删除重复的 require，直接使用顶部已引入的函数
// 删除：const { invalidateUserPermissions } = require('../../middleware/auth')
await invalidateUserPermissions(user_id, 'manual_refresh', request_user_id)
```

**拍板理由**：单一引入点、避免重复 require、可读性高、避免相对路径错误

**操作 2：更新路由路径 + 限制 ops 权限（✅ 已确认最终命名和权限边界）**

```javascript
// 第 181 行：将路由路径从 '/refresh' 改为 '/cache/invalidate'，并限制 ops 权限
// 从：router.post('/refresh', authenticateToken, async (req, res) => {
// 改为：
router.post('/cache/invalidate', authenticateToken, async (req, res) => {
  const { user_id } = req.body
  const request_user_id = req.user.user_id

  // 🛡️ 权限检查（2026-01-08 已拍板）：只允许 admin 或用户本人失效缓存
  const request_user_roles = await getUserRoles(request_user_id)
  const is_self = parseInt(user_id) === request_user_id

  // ✅ 允许：admin 对任意用户、用户对自己
  // ❌ 禁止：ops 对他人（即使 ops 对自己也只能 self，不能指定他人 user_id）
  if (!is_self && !request_user_roles.isAdmin) {
    return res.apiError(
      '只能失效自己的权限缓存或需要管理员权限',
      'FORBIDDEN',
      {
        hint: 'ops 角色仅可失效自己的缓存（self），失效他人缓存需要 admin 权限'
      },
      403
    )
  }

  // ... 业务逻辑保持不变 ...

  await invalidateUserPermissions(user_id, 'manual_refresh', request_user_id)

  return res.apiSuccess(response_data, '权限缓存已失效')
})
```

**验证点**：

- [ ] 文件可以正常 require（无路径错误）
- [ ] ✅ 第 201 行重复 require 已删除（选项 A）
- [ ] ✅ 直接使用顶部引入的 `invalidateUserPermissions`（单一引入点）
- [ ] 路由路径已更新为 `/cache/invalidate`
- [ ] 权限缓存失效接口不返回 500
- [ ] `invalidateUserPermissions` 函数正常执行
- [ ] ops 用户失效他人缓存返回 403（权限边界验证）
- [ ] ops 用户失效自己缓存返回 200（self 允许）
- [ ] admin 用户失效任意用户缓存返回 200（admin 全权限）

---

### 阶段 2：兼容性处理

> **✅ 最终决策：不做兼容处理（直接移除旧路径）**  
> **决策理由**：
>
> - 旧路径 `POST /api/v4/auth/refresh`（权限缓存刷新）本身就从未可达
> - 不存在历史调用，无需兼容别名或 410 Gone 处理
> - 直接使用新路径 `POST /api/v4/permissions/cache/invalidate` 即可

#### 2.1 无需兼容处理（已确认）

- [x] **已确认不添加 301 重定向**
- [x] **已确认不添加 410 Gone 处理**
- [x] **理由**：旧接口本身就不可达，修复即是"首次可用"

#### 2.2 ~~短期兼容别名~~（已废弃）

~~原计划添加 301 重定向或 410 Gone，但经确认无需兼容处理~~

---

### 阶段 3：文档和注释更新（可维护性）

#### 3.1 更新路由文件注释

**文件**：`routes/v4/auth/permissions.js`  
**位置**：第 1-6 行

**操作**：更新文件头部注释

```javascript
/**
 * V4权限管理路由 - 基于UUID角色系统
 * 🛡️ 权限管理：移除is_admin依赖，使用UUID角色系统
 *
 * 顶层路径：/api/v4/permissions（2026-01-08 从 /api/v4/auth 拆分）
 * 内部目录：routes/v4/auth/permissions.js
 *
 * 职责：
 * - 权限检查（check）
 * - 权限缓存刷新（refresh）
 * - 获取当前用户权限（me）
 * - 管理员列表（admins）
 * - 权限统计（statistics）
 *
 * 创建时间：2025年01月21日
 * 更新时间：2026年01月08日 - 拆分到独立域
 */
```

#### 3.2 更新接口注释

**文件**：`routes/v4/auth/permissions.js`  
**位置**：第 66、99、145、178、230、274 行

**操作**：更新所有接口注释中的路径

```javascript
/**
 * GET /api/v4/permissions/me - 获取我的权限信息
 * @route GET /api/v4/permissions/me
 */

/**
 * 🛡️ 检查权限
 * POST /api/v4/permissions/check
 */

/**
 * 🛡️ 获取管理员列表
 * GET /api/v4/permissions/admins
 */

/**
 * 🔄 权限缓存失效API（✅ 最终命名）
 * POST /api/v4/permissions/cache/invalidate
 */

/**
 * 🔄 批量权限检查API
 * POST /api/v4/permissions/batch-check
 */

/**
 * 🛡️ 获取权限统计信息
 * GET /api/v4/permissions/statistics
 */
```

---

### 阶段 4：验证和测试（确保修复生效）

#### 4.1 启动验证

**操作**：重启服务并检查日志

```bash
# 停止服务
npm run pm:stop

# 启动服务
npm run pm:start

# 检查日志
npm run pm:logs | grep "permissions域加载成功"
```

**预期输出**：

```
✅ auth域加载成功 { route: '/api/v4/auth' }
✅ permissions域加载成功 { route: '/api/v4/permissions' }
```

**验证点**：

- [ ] 启动日志包含"permissions域加载成功"
- [ ] 无 require 错误或路由冲突警告

#### 4.2 接口可达性测试

**操作**：使用 curl 测试两个 `/refresh` 接口

**测试 1：Token 刷新（应正常工作）**

```bash
# 先登录获取 refresh_token Cookie
curl -X POST http://localhost:3000/api/v4/auth/quick-login \
  -H "Content-Type: application/json" \
  -d '{"mobile":"13800138000","verification_code":"123456"}' \
  -c cookies.txt

# 使用 Cookie 刷新 Token
curl -X POST http://localhost:3000/api/v4/auth/refresh \
  -b cookies.txt \
  -v
```

**预期结果**：

- HTTP 状态码：200
- 响应体包含：`{ success: true, data: { access_token: "...", user: {...} } }`
- 响应头包含：`Set-Cookie: refresh_token=...`

**测试 2：权限缓存失效（应正常工作）**

> **✅ 最终路径**：`POST /api/v4/permissions/cache/invalidate`

**测试 2.1：admin 用户失效他人缓存（应成功）**

```bash
# 使用管理员 Token 失效他人权限缓存
curl -X POST http://localhost:3000/api/v4/permissions/cache/invalidate \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <admin_token>" \
  -d '{"user_id":1}'
```

**预期结果**：

- HTTP 状态码：200
- 响应体包含：`{ success: true, data: { cache_cleared: true, user_id: 1, invalidated_at: "..." } }`

**测试 2.2：ops 用户失效他人缓存（应拒绝 - 2026-01-08 已拍板）**

```bash
# 使用 ops Token 尝试失效他人权限缓存
curl -X POST http://localhost:3000/api/v4/permissions/cache/invalidate \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <ops_token>" \
  -d '{"user_id":1}'
```

**预期结果**：

- HTTP 状态码：403
- 响应体包含：`{ success: false, code: 'FORBIDDEN', message: '只能失效自己的权限缓存或需要管理员权限', data: { hint: 'ops 角色仅可失效自己的缓存（self），失效他人缓存需要 admin 权限' } }`

**测试 2.3：ops 用户失效自己缓存（应成功）**

```bash
# 使用 ops Token 失效自己的权限缓存（假设 ops 用户 user_id=5）
curl -X POST http://localhost:3000/api/v4/permissions/cache/invalidate \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <ops_token>" \
  -d '{"user_id":5}'
```

**预期结果**：

- HTTP 状态码：200
- 响应体包含：`{ success: true, data: { cache_cleared: true, user_id: 5, invalidated_at: "..." } }`

**验证点**：

- [ ] Token 刷新接口返回 200 和新 Token
- [ ] 权限缓存失效接口返回 200 和缓存清除确认
- [ ] 两个接口互不干扰（路径完全不同，无歧义）

#### 4.3 权限缓存失效功能验证

**操作**：验证缓存刷新的实际效果

**步骤**：

1. 查询用户权限（应命中缓存）

   ```bash
   curl -X GET http://localhost:3000/api/v4/permissions/me \
     -H "Authorization: Bearer <user_token>"
   ```

2. 修改用户角色（通过 API）

   ```bash
   curl -X PUT http://localhost:3000/api/v4/console/user-management/users/1/role \
     -H "Authorization: Bearer <admin_token>" \
     -H "Content-Type: application/json" \
     -d '{"role_name":"admin","reason":"测试权限缓存刷新"}'
   ```

3. 立即失效权限缓存

   ```bash
   curl -X POST http://localhost:3000/api/v4/permissions/cache/invalidate \
     -H "Authorization: Bearer <admin_token>" \
     -H "Content-Type: application/json" \
     -d '{"user_id":1}'
   ```

4. 再次查询用户权限（应返回新权限）
   ```bash
   curl -X GET http://localhost:3000/api/v4/permissions/me \
     -H "Authorization: Bearer <user_token>"
   ```

**预期结果**：

- 步骤 1：返回旧权限（如 `role_level: 0`）
- 步骤 2：角色更新成功
- 步骤 3：缓存清除成功
- 步骤 4：返回新权限（如 `role_level: 100`）

**验证点**：

- [ ] 权限缓存失效后立即生效（无需等待 30 分钟 TTL）
- [ ] 日志记录缓存失效操作和审计日志
- [ ] 内存缓存和 Redis 缓存都被清除

#### 4.4 运行自动化测试

**操作**：运行测试套件

```bash
# 运行认证和权限测试
npm test -- tests/business/auth/api.test.js

# 检查测试结果
echo $?  # 应返回 0（测试通过）
```

**验证点**：

- [ ] 所有认证 API 测试通过
- [ ] 所有权限 API 测试通过

---

### 阶段 5：监控和日志（可观测性）

#### 5.1 添加路由访问日志

**文件**：`routes/v4/auth/permissions.js`  
**位置**：在权限缓存失效 handler 中（第 181 行附近）

**操作**：增强日志记录

> **✅ 注意路由路径**：已更新为 `/cache/invalidate`

```javascript
router.post('/cache/invalidate', authenticateToken, async (req, res) => {
  try {
    const { user_id } = req.body
    const request_user_id = req.user.user_id

    // 记录权限缓存失效请求
    logger.info('收到权限缓存失效请求', {
      target_user_id: user_id,
      operator_id: request_user_id,
      ip: req.ip,
      user_agent: req.get('user-agent'),
      request_id: req.id
    })

    // ... 业务逻辑 ...

    logger.info('权限缓存失效成功', {
      target_user_id: user_id,
      operator_id: request_user_id,
      cache_types: ['memory', 'redis'],
      request_id: req.id
    })

    return res.apiSuccess(response_data, '权限缓存已失效')
  } catch (error) {
    logger.error('权限缓存失效失败', {
      error: error.message,
      stack: error.stack,
      request_id: req.id
    })
    return res.apiInternalError('失效权限缓存失败', error.message)
  }
})
```

**验证点**：

- [ ] 每次权限缓存失效都有日志记录
- [ ] 日志包含 `request_id`（便于链路追踪）
- [ ] 日志包含操作者和目标用户信息

#### 5.2 监控权限缓存失效频率

**文件**：`middleware/auth.js`  
**位置**：在 `invalidateUserPermissions` 函数中（第 161 行附近）

**操作**：添加频率统计

```javascript
// 缓存失效统计（全局变量）
const cacheInvalidationStats = {
  total: 0,
  by_reason: new Map(),
  last_report_time: Date.now()
}

async function invalidateUserPermissions(
  user_id,
  reason = 'unknown',
  operator_id = null,
  mobile = null
) {
  // 统计失效次数
  cacheInvalidationStats.total++
  const reasonCount = cacheInvalidationStats.by_reason.get(reason) || 0
  cacheInvalidationStats.by_reason.set(reason, reasonCount + 1)

  // 每 100 次失效输出统计报告
  if (cacheInvalidationStats.total % 100 === 0) {
    logger.info('权限缓存失效统计', {
      total: cacheInvalidationStats.total,
      top_reasons: Array.from(cacheInvalidationStats.by_reason.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([reason, count]) => ({ reason, count }))
    })
  }

  // ... 原有逻辑 ...
}
```

**验证点**：

- [ ] 每 100 次缓存失效输出统计报告
- [ ] 统计报告包含失效原因分布（如 `manual_refresh`、`role_changed`、`status_change`）

---

## 🧪 验证检查清单

### 功能验证（基于真实数据库核对 - 2026-01-08）

- [ ] `POST /api/v4/auth/refresh` 仍可正常刷新 Token（无影响）
- [ ] ✅ **`POST /api/v4/permissions/cache/invalidate` 可正常失效权限缓存（修复成功）**
- [ ] 权限缓存失效后立即生效（无需等待 30 分钟 Redis TTL）
- [ ] **admin 用户**（2 人）可以失效自己和他人的权限缓存
- [ ] **ops 用户**（1 人）只能失效自己的权限缓存（对他人返回 403）
- [ ] **普通用户**（11 人）只能失效自己的权限缓存
- [ ] 失效不存在的用户返回 404
- [ ] 失效**无角色用户**（10 人）正常工作（清除空缓存）
- [ ] 失效**多角色用户**（1 人）正常工作（清除所有角色缓存）

### 安全验证（2026-01-08 已拍板权限边界）

- [ ] 权限缓存失效需要认证（无 Token 返回 401）
- [ ] **ops 用户**失效他人缓存返回 403（✅ 已拍板：ops 只能 self）
- [ ] **普通用户**失效他人缓存返回 403
- [ ] **admin 用户**失效任意用户缓存返回 200（全权限）
- [ ] 所有操作都有审计日志记录（包含 ops 的 403 拒绝记录）
- [ ] 日志包含 `request_id`、操作者、目标用户、IP 地址、权限检查结果

### 性能验证

- [ ] 权限缓存失效响应时间 < 200ms
- [ ] 缓存失效不影响其他用户的权限查询
- [ ] 并发失效不会导致缓存不一致

### 兼容性验证

- [x] ✅ **无需兼容处理**（旧路径本身就不可达）
- [ ] 测试用例更新后全部通过

---

## 📊 影响面评估

### 后端代码变更文件清单（基于拍板决策 - 2026-01-08）

| 文件路径                          | 变更类型 | 变更内容                                           |
| --------------------------------- | -------- | -------------------------------------------------- |
| `app.js`                          | 新增挂载 | 新增 `/api/v4/permissions` 域挂载                  |
| `app.js`                          | 更新 404 | 更新可用端点列表                                   |
| `routes/v4/auth/index.js`         | 删除挂载 | 移除 `permissionRoutes` 挂载                       |
| `routes/v4/auth/permissions.js`   | 修正依赖 | ✅ 选项 A：删除第 201 行重复 require，复用顶部引入 |
| `routes/v4/auth/permissions.js`   | 更新路由 | 路径改为 `/cache/invalidate` + 增加 ops 权限检查   |
| `routes/v4/auth/permissions.js`   | 更新注释 | 更新文件头部和接口注释                             |
| `tests/business/auth/api.test.js` | 更新路径 | 权限 API 路径改为 `/api/v4/permissions/*`          |
| `public/admin/js/api-config.js`   | 已对齐   | 前端配置已使用 `/api/v4/permissions/*`（无需修改） |

### 影响的 API 端点

| 原路径                                    | 新路径                                             | 状态    | 影响                       |
| ----------------------------------------- | -------------------------------------------------- | ------- | -------------------------- |
| `POST /api/v4/auth/refresh`               | **不变**                                           | ✅ 正常 | 无影响                     |
| ~~`POST /api/v4/auth/refresh`~~（不可达） | ✅ **`POST /api/v4/permissions/cache/invalidate`** | ✅ 修复 | 功能恢复（已确认最终命名） |
| `GET /api/v4/auth/me`                     | `GET /api/v4/permissions/me`                       | ✅ 迁移 | 路径变更                   |
| `POST /api/v4/auth/check`                 | `POST /api/v4/permissions/check`                   | ✅ 迁移 | 路径变更                   |
| `GET /api/v4/auth/admins`                 | `GET /api/v4/permissions/admins`                   | ✅ 迁移 | 路径变更                   |

---

## 🚀 实施时间估算（基于拍板决策 - 2026-01-08）

| 阶段                                         | 预计耗时               | 风险等级 | 备注                                                 |
| -------------------------------------------- | ---------------------- | -------- | ---------------------------------------------------- |
| 阶段 1：路由调整 + 路径重命名 + ops 权限限制 | 25 分钟                | 低       | 核心修复 + 更新为 `/cache/invalidate` + ops 权限边界 |
| 阶段 2：兼容性处理                           | ~~15 分钟~~ **0 分钟** | 无       | ✅ **已确认无需兼容处理**                            |
| 阶段 3：文档注释更新                         | 10 分钟                | 低       | 可维护性提升                                         |
| 阶段 4：验证和测试（含 ops 权限边界测试）    | 35 分钟                | 中       | 确保修复生效 + ops 权限边界验证                      |
| 阶段 5：监控日志增强                         | 15 分钟                | 低       | 可观测性提升                                         |
| **总计**                                     | **85 分钟**            | **中**   | 约 1.5 小时完成（含 ops 权限边界实施与验证）         |

> **⏱️ 时间优化说明**：
>
> - 原计划 85 分钟，因确认无需兼容处理，节省 15 分钟
> - 路径重命名增加 5 分钟（`/refresh` → `/cache/invalidate`）
> - 最终预计 75 分钟（1.25 小时）

---

## 🔄 回滚方案（如果出现问题）

### 快速回滚步骤

1. **恢复 `routes/v4/auth/index.js` 的权限路由挂载**

   ```javascript
   router.use('/', permissionRoutes) // 恢复此行
   ```

2. **移除 `app.js` 中新增的 `/api/v4/permissions` 挂载**

   ```javascript
   // 注释或删除：
   // app.use('/api/v4/permissions', require('./routes/v4/auth/permissions'))
   ```

3. **重启服务**

   ```bash
   npm run pm:restart
   ```

4. **验证回滚效果**
   ```bash
   curl -X POST http://localhost:3000/api/v4/auth/refresh -b cookies.txt
   # 应返回 200（Token 刷新正常）
   ```

### 回滚影响

- Token 刷新接口恢复正常
- 权限缓存刷新接口仍然不可达（回到原始问题状态）

---

## 📚 相关文档和代码引用

### 核心代码文件

- `app.js:568` - auth 域挂载点
- `routes/v4/auth/index.js:36-39` - 子路由挂载
- `routes/v4/auth/token.js:104` - Token 刷新 handler
- `routes/v4/auth/permissions.js:181` - 权限缓存刷新 handler
- `middleware/auth.js:161` - `invalidateUserPermissions` 函数

### 相关配置文件

- `config/database.js` - 数据库连接配置（Sequelize）

### 数据库表结构

- `users` - 用户表（23 个活跃用户）
- `roles` - 角色表（7 个启用角色）
- `user_roles` - 用户角色关联表（多对多）

---

## 💡 最佳实践建议

### 路由设计原则

1. **单一路径单一职责**：一个路径只对应一个业务功能，避免根据参数/上下文分发
2. **语义清晰**：路径应明确表达业务含义（如 `/auth/refresh` vs `/permissions/refresh`）
3. **域划分合理**：相关功能归类到同一域下（如所有权限相关接口都在 `/permissions/*`）

### 权限缓存管理

1. **缓存失效时机**：所有权限变更操作（角色分配、状态修改、权限配置）都应自动失效缓存
2. **手动刷新接口**：提供运维接口支持手动刷新（用于紧急场景或验证）
3. **缓存一致性**：同时清除内存缓存和 Redis 缓存，避免不一致

### 测试覆盖

1. **路由冲突检测**：使用路由重复检测脚本（`scripts/check-route-duplicates.js`）
2. **接口可达性测试**：确保所有注册的路由都可以被正常访问
3. **权限缓存测试**：验证缓存刷新的实际效果（而不仅仅是接口返回 200）

---

## 📞 联系方式

如有疑问或需要支持，请联系：

- **技术负责人**：Restaurant Lottery Team
- **文档维护**：2026年01月08日
- **下次审查**：2026年02月08日（验证路由冲突检测脚本有效性、权限域一致性）

---

## 附录：真实数据库核对结果（Node.js + Sequelize 直连 - 2026-01-08）

### 连接方式

- **方法**：Node.js + Sequelize ORM + Raw SQL
- **配置源**：`.env` 文件（`DB_HOST`/`DB_PORT`/`DB_NAME`/`DB_USER`/`DB_PASSWORD`）
- **时区**：Asia/Shanghai (+08:00)
- **核对时间**：2026年01月08日 北京时间

### 数据统计（真实库实时数据）

```json
{
  "users": {
    "total": 23,
    "active": 23
  },
  "roles": {
    "total": 7,
    "active": 7,
    "distribution": [
      { "role_name": "admin", "role_level": 100, "user_count": 2 },
      { "role_name": "regional_manager", "role_level": 80, "user_count": 0 },
      { "role_name": "business_manager", "role_level": 60, "user_count": 0 },
      { "role_name": "sales_staff", "role_level": 40, "user_count": 0 },
      { "role_name": "ops", "role_level": 30, "user_count": 1 },
      { "role_name": "campaign_2", "role_level": 10, "user_count": 0 },
      { "role_name": "user", "role_level": 0, "user_count": 11 }
    ]
  },
  "special_cases": {
    "users_without_roles": 10,
    "multi_role_users": 1
  },
  "cache_config": {
    "memory_ttl": "5分钟",
    "redis_ttl": "30分钟",
    "max_delay_without_manual_refresh": "30分钟"
  },
  "permission_boundaries": {
    "admin_can_invalidate_others": true,
    "ops_can_invalidate_others": false,
    "user_can_invalidate_others": false,
    "ops_can_invalidate_self": true
  }
}
```

### 核对 SQL（可复现验证）

```sql
-- 角色分布统计
SELECT r.role_name, r.role_level, COUNT(DISTINCT u.user_id) AS user_count
FROM users u
JOIN user_roles ur ON u.user_id=ur.user_id AND ur.is_active=1
JOIN roles r ON r.role_id=ur.role_id AND r.is_active=1
WHERE u.status='active'
GROUP BY r.role_name, r.role_level
ORDER BY r.role_level DESC;

-- 无角色用户统计
SELECT COUNT(*) AS users_without_roles
FROM users u
LEFT JOIN user_roles ur ON u.user_id=ur.user_id AND ur.is_active=1
LEFT JOIN roles r ON r.role_id=ur.role_id AND r.is_active=1
WHERE u.status='active' AND r.role_id IS NULL;

-- 多角色用户统计
SELECT COUNT(*) AS multi_role_users FROM (
  SELECT u.user_id
  FROM users u
  JOIN user_roles ur ON u.user_id=ur.user_id AND ur.is_active=1
  JOIN roles r ON r.role_id=ur.role_id AND r.is_active=1
  WHERE u.status='active'
  GROUP BY u.user_id
  HAVING COUNT(DISTINCT ur.role_id) > 1
) t;
```

### 路由冲突检测脚本

可以使用项目现有的路由检测脚本验证修复效果：

```bash
node scripts/check-route-duplicates.js
```

预期输出（修复后）：

```
✅ 未发现真正的路径重复（同一URL+方法被多次注册）
```

---

---

## 📋 文档状态追踪

| 项目         | 状态      | 说明                                        | 时间       |
| ------------ | --------- | ------------------------------------------- | ---------- |
| **文档编写** | ✅ 已完成 | 问题分析、方案对比、实施清单已完成          | 2026-01-08 |
| **方案决策** | ✅ 已确认 | **方案 A - 拆分到 `/api/v4/permissions/*`** | 2026-01-08 |
| **代码实施** | ⏳ 待执行 | 等待开发团队按照实施清单执行                | -          |
| **功能验证** | ⏳ 待验证 | 实施完成后需要完整测试验证                  | -          |
| **上线部署** | ⏳ 待部署 | 验证通过后部署到生产环境                    | -          |

---

## 🎯 下一步行动（已明确所有决策）

### 立即执行清单（基于拍板决策 - 2026-01-08）

1. **路由调整 + ops 权限限制**（阶段 1）
   - 在 `app.js` 新增 `/api/v4/permissions` 域挂载
   - 在 `routes/v4/auth/index.js` 移除 `permissionRoutes` 挂载
   - ✅ **修正内部依赖**（选项 A）：删除第 201 行重复 require，复用顶部引入的 `invalidateUserPermissions`
   - ✅ **更新路由路径**：`/refresh` → `/cache/invalidate`
   - ✅ **限制 ops 权限**：ops 只能失效自己缓存（is_self 检查），对他人返回 403

2. **文档注释更新**（阶段 3）
   - 更新文件头部注释（顶层路径改为 `/api/v4/permissions`）
   - 更新接口注释（路径改为 `/cache/invalidate`，增加 ops 权限说明）

3. **验证测试**（阶段 4 - 含 ops 权限边界验证）
   - 确保 `POST /api/v4/auth/refresh`（Token 刷新）正常
   - 确保 `POST /api/v4/permissions/cache/invalidate`（权限缓存失效）正常
   - 两个接口互不干扰
   - **ops 权限边界验证**：
     - ops 失效他人缓存返回 403
     - ops 失效自己缓存返回 200
     - admin 失效任意用户缓存返回 200

4. **监控日志**（阶段 5）
   - 增强日志记录（包含 `request_id`、操作者、目标用户、权限检查结果）
   - 添加缓存失效频率统计
   - 记录 ops 的 403 拒绝操作（审计需求）

### 已确认无需执行（2026-01-08 已拍板）

- ❌ **兼容性处理**（阶段 2）：旧路径本身就不可达，无需 301/410
- ❌ **选项 B（修正相对路径）**：已否决，采用选项 A（复用顶部引入）

---

**文档状态**：✅ 已完成（含真实数据库核对）  
**方案决策**：✅ 已拍板（方案 A + `/cache/invalidate` + ops 权限边界）  
**决策依据**：真实数据库核对（Node.js + Sequelize 直连）+ 当前代码状态分析  
**实施状态**：⏳ 待实施  
**验证状态**：⏳ 待验证（含 ops 权限边界验证）
