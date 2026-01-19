# is_admin 字段彻底移除方案

> 📅 创建时间：2026-01-19
> 📅 最后更新：2026-01-19（基于数据库真实数据验证）
> 🎯 目标：统一使用 `role_level` 判断权限，彻底移除 `is_admin` 字段，降低维护成本
> 🚀 项目状态：未上线，可一次性投入，无需兼容旧接口

---

## 〇、决策记录（2026-01-19 已拍板）

### 核心决策

| 决策项 | 选择 | 说明 |
|--------|------|------|
| **是否执行** | ✅ **彻底移除** | 修改 28 个文件（95 处引用），统一使用 `role_level` |
| **User.prototype.isAdmin() 方法** | ✅ **删除方法** | 调用方直接用 `role_level >= 100` 判断 |
| **LotteryUserService.isAdmin() 方法** | ✅ **删除方法** | 调用方直接用 `getUserRoles().role_level >= 100` |
| **req.isAdmin 挂载** | ✅ **改为 req.role_level** | 后续路由用 `req.role_level >= 100` 判断，支持多级权限 |
| **API 响应 is_admin 字段** | ✅ **全部移除** | 只返回 `role_level`，前端自行判断 |
| **便捷权限字段** | ✅ **全部移除** | `can_manage_lottery`、`can_view_admin_panel`、`can_modify_user_permissions` |
| **服务层参数命名** | ✅ **改为 has_admin_access** | 语义清晰，不与旧字段混淆 |
| **模型注释** | ✅ **删除注释** | `models/User.js`、`models/Role.js`、`models/index.js` 中相关注释 |

### 统一权限判断标准

```javascript
// 全系统只用 role_level 这一个概念
role_level >= 100  // 管理员（admin）
role_level >= 80   // 区域经理（regional_manager）
role_level >= 60   // 业务经理（business_manager）
role_level >= 40   // 销售/商户管理（sales_staff, merchant_manager）
role_level >= 30   // 运营人员（ops）
role_level >= 20   // 商户员工（merchant_staff）
role_level < 20    // 普通用户
```

---

## 一、当前状态分析（基于数据库真实数据验证 2026-01-19）

### 1.1 已完成的清理
| 项目 | 状态 | 验证方式 |
|------|------|----------|
| 数据库 `users.is_admin` 字段 | ✅ 已删除 | `SHOW COLUMNS FROM users` 确认无此字段 |
| `modules/UserPermissionModule.js` | ✅ 已删除 | 文件不存在 |
| `scripts/check_admin_users.js` | ✅ 已删除 | 文件不存在 |
| `_archived_phase5/` 目录 | ✅ 已删除 | 目录不存在 |

### 1.2 数据库真实数据（2026-01-19 验证）

**users 表字段**：
```
user_id, mobile, nickname, status, last_login, created_at, updated_at, 
login_count, consecutive_fail_count, history_total_points, user_uuid, user_level
```
（无 is_admin 字段 ✅）

**角色分布**：
| 角色 | role_level | 用户数 |
|------|------------|--------|
| admin | 100 | 2 |
| regional_manager | 80 | 0 |
| business_manager | 60 | 0 |
| merchant_manager | 40 | 1 |
| ops | 30 | 1 |
| user | 0 | 14 |

**管理员用户**：user_id 31, 135（通过 `role_level >= 100` 判断）

### 1.3 待清理的代码残留

**统计：28 个文件包含 95 处 `is_admin` 引用**（grep 实际统计）
- 后端服务：6 个文件
- 路由/API：8 个文件
- 中间件：1 个文件
- 前端代码：1 个文件
- 测试文件：5 个文件
- 工具/脚本：3 个文件
- 模型注释：3 个文件
- 迁移脚本：1 个文件（历史记录，无需修改）

---

## 二、统一方案

### 2.1 核心原则
```
旧方案：is_admin: true/false （布尔值）
新方案：role_level >= 100    （数值判断）

权限级别标准：
- role_level >= 100：管理员（admin）
- role_level >= 30：运营人员（ops）
- role_level < 30：普通用户
```

### 2.2 API响应变更
```javascript
// 旧响应格式
{
  user_id: 31,
  is_admin: true,      // ❌ 移除
  role_level: 100,
  roles: [...]
}

// 新响应格式
{
  user_id: 31,
  role_level: 100,     // ✅ 保留，前端用此判断
  roles: [...]
}
```

---

## 三、需要修改的文件清单

### 3.1 中间件层（1个文件）

#### `middleware/auth.js`
| 行号 | 当前代码 | 修改方案 |
|------|----------|----------|
| 259 | `isAdmin: false` | 移除此属性 |
| 288 | `isAdmin: maxRoleLevel >= 100` | 移除此属性 |
| 305 | `isAdmin: false` | 移除此属性 |
| 364 | `is_admin: userRoles.isAdmin` | 移除此行 |
| 481 | `req.isAdmin = userRoles.isAdmin` | **【已拍板】改为 `req.role_level = userRoles.role_level`** |
| 588 | `req.isAdmin = userRoles.isAdmin` | **【已拍板】改为 `req.role_level = userRoles.role_level`** |

**注意**：
1. `getUserRoles()` 函数返回值中移除 `isAdmin` 属性
2. 后续路由统一使用 `req.role_level >= 100` 判断管理员权限

---

### 3.2 路由/API层（8个文件）

#### `routes/v4/auth/login.js`
| 行号 | 修改内容 |
|------|----------|
| 145 | 移除 `is_admin: userRoles.isAdmin` |
| 344 | 移除 `is_admin: userRoles.isAdmin` |

#### `routes/v4/auth/token.js`
| 行号 | 修改内容 |
|------|----------|
| 80 | 移除 `is_admin: userRoles.isAdmin` |
| 167 | 移除 `is_admin: userRoles.isAdmin` |

#### `routes/v4/auth/profile.js`
| 行号 | 修改内容 |
|------|----------|
| 42 | 移除 `is_admin: userRoles.isAdmin` |

#### `routes/v4/auth/permissions.js`
| 行号 | 修改内容 |
|------|----------|
| 100 | 移除 `is_admin: permissions.is_admin` |
| 103-105 | **【已拍板】全部移除** `can_manage_lottery`, `can_view_admin_panel`, `can_modify_user_permissions`，前端自行用 `role_level >= 100` 判断 |
| 141 | 移除 `is_admin: user_roles.isAdmin` |
| 152 | 移除 `is_admin: user_roles.isAdmin` |
| 188 | 移除 `is_admin: admin.is_admin` |
| 234 | 移除 `is_admin: request_user_roles.isAdmin` |
| 362 | 移除 `is_admin: request_user_roles.isAdmin` |

#### `routes/v4/console/user_management.js`
无 `is_admin` 返回值，仅有 `invalidateUserPermissions` 调用（保留）

#### `routes/v4/console/auth.js`
| 行号 | 当前代码 | 修改内容 |
|------|----------|----------|
| 3 | 注释：`移除is_admin字段依赖` | 删除此注释（已完成移除） |
| 75 | `if (!userRoles.isAdmin)` | 改为 `if (userRoles.role_level < 100)` |

#### `routes/v4/system/popup-banners.js`
| 行号 | 当前代码 | 修改内容 |
|------|----------|----------|
| 90 | `const isAdmin = req.user?.is_admin \|\| req.user?.role_level >= 100` | 改为 `const isAdmin = req.user?.role_level >= 100` |
| 122 | `is_admin: isAdmin` | 移除此行 |

#### `routes/v4/system/user-stats.js`
| 行号 | 当前代码 | 修改内容 |
|------|----------|----------|
| 53 | `const isAdmin = req.isAdmin` | 改为 `const isAdmin = req.role_level >= 100` |
| 56 | `if (user_id !== currentUserId && !isAdmin)` | 无需修改（使用局部变量） |
| 64 | `ReportingService.getUserStatistics(user_id, isAdmin)` | 无需修改（传参） |
| 80 | `is_admin: req.isAdmin` | 移除此行 |
| 100 | `if (!req.isAdmin)` | 改为 `if (req.role_level < 100)` |

---

### 3.3 服务层（6个文件）

#### `services/UserRoleService.js`
| 行号 | 修改内容 |
|------|----------|
| 59 | 更新 JSDoc：移除 `is_admin` 返回值说明 |
| 98 | 移除 `is_admin: await user.isAdmin()` |
| 646 | 移除 `is_admin: false` |
| 677 | 移除 `is_admin: maxRoleLevel >= 100` |
| 690 | 移除 `is_admin: false` |
| 735 | 移除 `is_admin: true` |
| 787 | 移除 `is_admin: userPermissions.is_admin` |
| 823 | 改为 `if (required_level === 'admin' && operatorPermissions.role_level < 100)` |
| 841 | 移除 `is_admin: operatorPermissions.is_admin` |
| 867 | 改为 `if (userPermissions.role_level < 100)` |
| 876 | 移除 `is_admin: true` |

#### `services/lottery/LotteryUserService.js`
| 行号 | 修改内容 |
|------|----------|
| 26、45-50 | 更新 JSDoc：移除 `is_admin` 和 `isAdmin()` 相关说明 |
| 105、117 | 更新 JSDoc：移除 `@returns is_admin` 说明 |
| 134 | 移除 `is_admin: userRoles.isAdmin` |
| 154-165 | **【已拍板】删除整个 `isAdmin()` 方法** |
| 209、240、269、297 | 移除 `is_admin` 相关代码和注释 |

#### `services/ChatWebSocketService.js`
检查是否有 `is_admin` 引用（之前已确认使用 `role_level >= 100`）

#### `services/ConsumptionService.js`
| 行号 | 当前代码 | 修改内容 |
|------|----------|----------|
| 1100 | `@param {boolean} isAdmin - 是否为管理员` | 改为 `@param {boolean} hasAdminAccess - 是否具有管理权限` |
| 1117 | `static async getConsumptionDetailWithAuth(recordId, viewerId, isAdmin = false, options = {})` | 参数名改为 `hasAdminAccess` |
| 1139 | `viewerId === basicRecord.merchant_id \|\| isAdmin` | 改为 `hasAdminAccess` |
| 1389-1398 | `isAdmin` 参数 | 参数名改为 `hasAdminAccess` |
| 1400 | `is_admin: isAdmin` | 改为 `has_admin_access: hasAdminAccess` |
| 1413 | `if (!isAdmin && record.user_id !== userId)` | 改为 `hasAdminAccess` |

**说明**：参数名从 `isAdmin` 改为 `hasAdminAccess`，保持语义清晰，但不再使用 `is_admin` 命名

#### `services/BackpackService.js`
| 行号 | 当前代码 | 修改内容 |
|------|----------|----------|
| 301 | `@param {boolean} [options.is_admin]` | 改为 `@param {boolean} [options.has_admin_access]` |
| 322 | `const { viewer_user_id, is_admin = false, transaction = null } = options` | 改为 `has_admin_access = false` |
| 328 | `is_admin` | 改为 `has_admin_access` |
| 343 | `if (!is_admin && viewer_user_id && ...)` | 改为 `has_admin_access` |

**说明**：参数名从 `is_admin` 改为 `has_admin_access`，统一命名风格

---

### 3.4 前端代码（1个文件）

#### `public/admin/js/pages/login.js`
```javascript
// 旧代码（第124-136行）
function checkAdminAccess(user) {
  if (!user) return false
  
  // 检查is_admin字段
  if (user.is_admin === true) return true
  
  // 检查roles数组
  if (user.roles && Array.isArray(user.roles)) {
    return user.roles.some(role => {
      if (typeof role === 'object') {
        return role.role_name === 'admin' || role.role_level >= 100
      }
      return role === 'admin'
    })
  }
  return false
}

// 新代码
function checkAdminAccess(user) {
  if (!user) return false
  
  // 统一使用 role_level 判断（role_level >= 100 为管理员）
  if (user.role_level >= 100) return true
  
  // 兼容：检查roles数组中的role_level
  if (user.roles && Array.isArray(user.roles)) {
    return user.roles.some(role => 
      typeof role === 'object' && role.role_level >= 100
    )
  }
  return false
}
```

---

### 3.5 测试文件（5个文件）

#### `tests/api-contracts/auth-verify.contract.test.js`
| 修改内容 |
|----------|
| 移除 `is_admin` 字段断言 |
| 保留 `role_level` 字段断言 |
| 移除 `is_admin 应与 role_level 一致` 测试用例 |

#### `tests/business/auth/api.test.js`
| 行号 | 修改内容 |
|------|----------|
| 188 | 移除 `expect(user).toHaveProperty('is_admin')` |
| 204 | 移除 `expect(typeof user.is_admin).toBe('boolean')` |
| 209 | 移除 `is_admin: user.is_admin` 日志 |
| 303 | 移除 `expect(...).toHaveProperty('is_admin')` |
| 370 | 移除 `expect(...).toHaveProperty('is_admin')` |
| 398 | 移除 `expect(...).toHaveProperty('is_admin')` |
| 403 | 移除 `is_admin: response.data.data.is_admin` 日志 |

#### `tests/api-contracts/consumption.contract.test.js`
| 行号 | 当前代码 | 修改内容 |
|------|----------|----------|
| 13 | 注释：`移除is_admin字段` | 无需修改（已说明移除） |
| 28 | 注释：`避免is_admin字段等不一致` | 无需修改（历史说明） |

**说明**：该文件仅有注释提及，无实际代码需要修改 ✅

#### `tests/middleware/concurrency_control_middleware.test.js`
| 行号 | 当前代码 | 修改内容 |
|------|----------|----------|
| 16 | `is_admin: false` | 移除此行（mock用户数据） |

#### `tests/business/lottery/api.test.js`
| 行号 | 修改内容 |
|------|----------|
| 274 | 更新注释说明（当前是注释，改为使用 `role_level` 描述） |

---

### 3.6 工具类和脚本（3个文件）

#### `utils/TestAccountManager.js`
| 行号 | 修改内容 |
|------|----------|
| 298 | 移除 `is_admin` 日志输出，改为 `role_level` |
| 390 | 移除 `is_admin` 字段，改为 `role_level` |

#### `utils/PermissionAuditLogger.js`
| 行号 | 当前代码 | 修改内容 |
|------|----------|----------|
| 63 | `@param {boolean} data.is_admin` | 移除此参数注释 |
| 71 | 日志格式示例中的 `is_admin:false` | 从示例中移除 |
| 81 | `is_admin: data.is_admin \|\| false` | 移除此行，日志中不再记录 `is_admin` |

**说明**：审计日志中移除 `is_admin` 字段，仅保留 `role_level` 用于审计分析

#### `scripts/sealos/test_image_upload_api.js`
| 行号 | 修改内容 |
|------|----------|
| 52 | `console.log(\`是否管理员: ${user.is_admin}\`)` 改为 `console.log(\`权限级别: ${user.role_level}\`)` |

---

### 3.7 模型层（3个文件）

#### `models/User.js`
| 行号 | 当前代码 | 修改方案 |
|------|----------|----------|
| 4、14 | `is_admin` 相关注释 | 删除注释 |
| 225 | `is_admin` 相关注释 | 删除注释 |
| 270-272 | **`User.prototype.isAdmin()` 方法** | **【已拍板】删除整个方法** |

```javascript
// 删除此方法
User.prototype.isAdmin = async function () {
  return await this.hasRole('admin')
}
```

#### `models/Role.js`
| 行号 | 修改内容 |
|------|----------|
| 4 | 删除包含 `is_admin` 的注释行 |

#### `models/index.js`
| 行号 | 修改内容 |
|------|----------|
| 4、18 | 删除包含 `is_admin` 的注释行 |

---

### 3.8 无需修改的文件

| 类型 | 文件 | 原因 |
|------|------|------|
| 文档 | `docs/用户权限模块旧API清理分析报告.md` | 历史文档 |
| 备份 | `backups/*` | 历史备份数据 |
| 迁移 | `migrations/20251109234500-*.js` | 历史迁移脚本（删除旧索引） |
| 已修复 | `scripts/test_campaign_budget_api.js` | 已改为 `role_level: 200` |

---

## 四、执行顺序

### 阶段1：后端改造（影响范围最小）
```
1. middleware/auth.js          - 移除 isAdmin 属性，保留 role_level
2. services/UserRoleService.js - 移除 is_admin 返回
3. services/lottery/LotteryUserService.js - 移除 is_admin 返回
4. 其他 services/*             - 检查并移除
```

### 阶段2：API路由改造
```
5. routes/v4/auth/login.js     - 移除响应中的 is_admin
6. routes/v4/auth/token.js     - 移除响应中的 is_admin
7. routes/v4/auth/profile.js   - 移除响应中的 is_admin
8. routes/v4/auth/permissions.js - 移除响应中的 is_admin
9. 其他 routes/*               - 检查并移除
```

### 阶段3：前端改造
```
10. public/admin/js/pages/login.js - 改用 role_level >= 100 判断
```

### 阶段4：测试用例更新
```
11. tests/api-contracts/*.test.js  - 更新断言
12. tests/business/auth/api.test.js - 更新断言
13. 其他测试文件                    - 检查并更新
```

### 阶段5：工具和脚本更新
```
14. utils/TestAccountManager.js    - 更新输出
15. scripts/sealos/test_image_upload_api.js - 更新输出
```

### 阶段6：验证
```
16. npm run lint                   - 代码检查
17. npm test                       - 运行全量测试
18. curl 健康检查和API测试          - 功能验证
```

---

## 五、风险评估

### 5.1 影响范围
| 影响对象 | 风险级别 | 说明 |
|----------|----------|------|
| 后端API | 🟢 **低** | 项目未上线，无需兼容旧接口 |
| 前端代码 | 🟢 **低** | 仅 `login.js` 需要修改，无外部依赖 |
| 测试用例 | 🟢 **低** | 断言更新，不影响业务 |
| 数据库 | ✅ **无** | is_admin 字段已删除，无需改动 |

### 5.2 回滚方案
项目未上线，如果出现问题直接修改代码即可，无需回滚方案。

### 5.3 项目状态优势
- ✅ 未上线，可一次性彻底改造
- ✅ 无外部调用方，无需兼容旧接口
- ✅ 数据库已清理完毕，代码改造是最后一步

---

## 六、预期收益

| 收益项 | 说明 |
|--------|------|
| 概念统一 | 只有 `role_level`，无 `is_admin` 混淆 |
| 代码简化 | 减少计算属性维护点 |
| 扩展性好 | 未来新增权限级别时无需修改布尔判断 |
| 维护成本 | 减少 40+ 处代码维护点 |

---

## 七、执行检查清单

### 阶段1：核心改造
- [ ] `middleware/auth.js`：移除 isAdmin 属性，改用 req.role_level
- [ ] `models/User.js`：删除 `User.prototype.isAdmin()` 方法
- [ ] `services/lottery/LotteryUserService.js`：删除 `isAdmin()` 方法
- [ ] `services/UserRoleService.js`：移除所有 is_admin 返回

### 阶段2：API 路由改造
- [ ] `routes/v4/auth/login.js`：移除 is_admin 响应
- [ ] `routes/v4/auth/token.js`：移除 is_admin 响应
- [ ] `routes/v4/auth/profile.js`：移除 is_admin 响应
- [ ] `routes/v4/auth/permissions.js`：移除 is_admin 和便捷字段
- [ ] 其他路由：`req.isAdmin` → `req.role_level >= 100`

### 阶段3：服务层参数重命名
- [ ] `services/ConsumptionService.js`：isAdmin → has_admin_access
- [ ] `services/BackpackService.js`：is_admin → has_admin_access

### 阶段4：前端和测试
- [ ] `public/admin/js/pages/login.js`：改用 role_level 判断
- [ ] 测试文件：移除 is_admin 断言

### 阶段5：清理和验证
- [ ] 工具脚本更新完成
- [ ] 模型注释删除完成
- [ ] ESLint 检查通过
- [ ] 全量测试通过
- [ ] API 功能验证通过

---

**文档版本**：v2.0（最终拍板版 - 基于数据库真实数据验证）
**最后更新**：2026-01-19
**决策人**：用户
**决策时间**：2026-01-19
**项目状态**：未上线，可一次性投入，无需兼容旧接口

---

## 附录：关键决策汇总

| # | 决策项 | 最终选择 | 理由 |
|---|--------|----------|------|
| 1 | User.prototype.isAdmin() | **删除** | 直接用 `role_level >= 100`，减少封装层 |
| 2 | LotteryUserService.isAdmin() | **删除** | 调用方用 `getUserRoles().role_level >= 100` |
| 3 | req.isAdmin 挂载 | **改为 req.role_level** | 支持多级权限判断 |
| 4 | API 响应 is_admin | **移除** | 只返回 role_level |
| 5 | 便捷权限字段 | **全部移除** | 前端自行判断 |
| 6 | 服务层参数命名 | **has_admin_access** | 语义清晰 |
| 7 | 模型注释 | **删除** | 代码更干净 |

