# 管理端 Token 安全升级方案

**项目**: 餐厅积分抽奖系统 V4.0  
**文档版本**: v1.0  
**创建时间**: 2025-12-23  
**状态**: 待实施

---

## 📋 目录

- [1. 背景与目标](#1-背景与目标)
- [2. 现状分析](#2-现状分析)
- [3. 技术方案](#3-技术方案)
- [4. 实施计划](#4-实施计划)
- [5. 测试验证](#5-测试验证)
- [6. 风险评估](#6-风险评估)
- [7. 回滚方案](#7-回滚方案)

---

## 1. 背景与目标

### 1.1 业务需求

管理端需要同时满足以下两个核心需求：

1. **多 Tab 共享登录态**：用户在浏览器中登录后，可以开多个管理页面 Tab，无需重复登录
2. **安全性提升**：避免使用 localStorage 长期存储高权限 token，降低 XSS 攻击和浏览器残留风险

### 1.2 目标收益

- ✅ **降低残留风险**：关闭浏览器后 token 自动失效（Cookie 会话级别）
- ✅ **防御 XSS 盗取**：refresh_token 使用 HttpOnly Cookie，JavaScript 无法读取
- ✅ **保持用户体验**：多 Tab 共享登录态，用户无需频繁登录
- ✅ **服务端可控**：为未来实现"踢下线/吊销会话"预留接口（可选）

---

## 2. 现状分析

### 2.1 当前实现（存在的问题）

**前端存储方式**：

```javascript
// public/admin/login.html (Line 114-115)
localStorage.setItem('admin_token', result.data.access_token)
localStorage.setItem('admin_user', JSON.stringify(user))

// public/admin/js/admin-common.js (Line 45)
const token = localStorage.getItem('admin_token')
```

**问题点**：

1. ❌ **localStorage 持久化**：关闭浏览器后 token 仍然有效，存在残留风险
2. ❌ **XSS 可读取**：JavaScript 可以直接读取 token，XSS 攻击可盗取
3. ❌ **无服务端撤销**：token 在过期前始终有效，无法主动踢下线

**后端实现现状**：

```javascript
// routes/v4/auth/login.js (Line 115-116)
access_token: tokens.access_token,
refresh_token: tokens.refresh_token,

// middleware/auth.js (Line 326-334)
const access_token = jwt.sign(payload, process.env.JWT_SECRET, {
  expiresIn: process.env.JWT_EXPIRES_IN || '24h'
})
const refresh_token = jwt.sign(...)
```

**数据库现状**（2025-12-23 验证）：

- `authentication_sessions` 表：**0 行**（会话表存在但未启用）
- `users`: 22 / `roles`: 6 / `user_roles`: 13 / 管理员用户: 2

---

## 3. 技术方案

### 3.1 方案架构

```
┌─────────────────────────────────────────────────────────────┐
│                      用户登录流程                              │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
        ┌──────────────────────────────────────┐
        │  POST /api/v4/auth/login             │
        │  - 验证手机号 + 验证码                 │
        │  - 生成 access_token + refresh_token │
        └──────────────────────────────────────┘
                            │
                ┏━━━━━━━━━━━┻━━━━━━━━━━━┓
                ▼                        ▼
    ┌─────────────────────┐  ┌─────────────────────────┐
    │ access_token        │  │ refresh_token           │
    │ - 返回 JSON 响应     │  │ - Set-Cookie (HttpOnly) │
    │ - 前端存内存/不存储   │  │ - SameSite=Strict       │
    │ - 有效期: 15分钟     │  │ - Secure (生产环境)      │
    └─────────────────────┘  │ - 有效期: 7天            │
                             └─────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│                   多 Tab 共享登录态                           │
└─────────────────────────────────────────────────────────────┘

    Tab 1                    Tab 2                    Tab 3
      │                        │                        │
      │ 页面加载               │ 页面加载 (新开)         │ 页面加载 (新开)
      ▼                        ▼                        ▼
  检查内存 token            检查内存 token            检查内存 token
      │ (无)                   │ (无)                   │ (无)
      ▼                        ▼                        ▼
  POST /auth/refresh       POST /auth/refresh       POST /auth/refresh
  (自动携带 refresh cookie) (自动携带 refresh cookie) (自动携带 refresh cookie)
      │                        │                        │
      ▼                        ▼                        ▼
  获得 access_token         获得 access_token         获得 access_token
  存入本 Tab 内存           存入本 Tab 内存           存入本 Tab 内存
      │                        │                        │
      ▼                        ▼                        ▼
  正常使用 API             正常使用 API             正常使用 API

┌─────────────────────────────────────────────────────────────┐
│                      用户退出流程                              │
└─────────────────────────────────────────────────────────────┘

    Tab 1 (用户点击退出)
      │
      ▼
  POST /api/v4/auth/logout
      │
      ├─ 后端: Set-Cookie refresh_token=; Max-Age=0 (清除)
      ├─ 后端: 清除权限缓存
      │
      ▼
  前端: 清除本 Tab 内存 token
      │
      ▼
  BroadcastChannel 广播退出事件
      │
      ├──────────────┬──────────────┐
      ▼              ▼              ▼
    Tab 2          Tab 3          Tab N
    收到退出事件    收到退出事件    收到退出事件
    清除内存 token  清除内存 token  清除内存 token
    跳转登录页      跳转登录页      跳转登录页
```

### 3.2 核心变更点

#### 3.2.1 后端变更（4 个文件）

**A. `routes/v4/auth/login.js` - 登录接口**

```javascript
// 变更前（Line 114-116）
const responseData = {
  access_token: tokens.access_token,
  refresh_token: tokens.refresh_token,  // ❌ 返回给前端
  user: { ... }
}

// 变更后
const responseData = {
  access_token: tokens.access_token,
  // ❌ 删除 refresh_token 字段（不再返回给前端）
  user: { ... }
}

// ✅ 新增：通过 HttpOnly Cookie 设置 refresh_token
res.cookie('refresh_token', tokens.refresh_token, {
  httpOnly: true,        // JavaScript 无法读取
  secure: process.env.NODE_ENV === 'production', // 生产环境强制 HTTPS
  sameSite: 'strict',    // 防御 CSRF
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7天
  path: '/api/v4/auth'   // 仅在认证路径下携带
})
```

**B. `routes/v4/auth/token.js` - Token 刷新接口**

```javascript
// 变更前（Line 103）
const { refresh_token } = req.body  // ❌ 从请求体读取

// 变更后
const refresh_token = req.cookies.refresh_token  // ✅ 从 Cookie 读取

// 验证逻辑保持不变
const verifyResult = await verifyRefreshToken(refresh_token)
if (!verifyResult.valid) {
  return res.apiError('刷新Token无效', 'INVALID_REFRESH_TOKEN', null, 401)
}

// ✅ 响应时重新设置 Cookie（Token 旋转，可选）
res.cookie('refresh_token', tokens.refresh_token, {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'strict',
  maxAge: 7 * 24 * 60 * 60 * 1000,
  path: '/api/v4/auth'
})

// 响应体仅返回 access_token
return res.apiSuccess({
  access_token: tokens.access_token,
  user: { ... }
}, 'Token刷新成功')
```

**C. `routes/v4/auth/token.js` - 退出登录接口**

```javascript
// 变更前（Line 155-165）
router.post('/logout', authenticateToken, async (req, res) => {
  const user_id = req.user.user_id
  await invalidateUserPermissions(user_id, 'user_logout', user_id)
  logger.info(`✅ [Auth] 用户退出登录: user_id=${user_id}`)
  return res.apiSuccess(null, '退出登录成功', 'LOGOUT_SUCCESS')
})

// 变更后
router.post('/logout', authenticateToken, async (req, res) => {
  const user_id = req.user.user_id

  // ✅ 清除 refresh_token Cookie
  res.clearCookie('refresh_token', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/api/v4/auth'
  })

  // 清除权限缓存（保持不变）
  await invalidateUserPermissions(user_id, 'user_logout', user_id)

  logger.info(`✅ [Auth] 用户退出登录: user_id=${user_id}`)
  return res.apiSuccess(null, '退出登录成功', 'LOGOUT_SUCCESS')
})
```

**D. `app.js` - 启用 Cookie 解析中间件**

```javascript
// 在 Line 145 附近（express.json() 之后）添加

// ✅ 新增：Cookie 解析中间件（用于读取 refresh_token）
const cookieParser = require('cookie-parser')
app.use(cookieParser())
```

**依赖安装**：

```bash
npm install cookie-parser --save
```

#### 3.2.2 前端变更（2 个文件）

**A. `public/admin/login.html` - 登录页面**

```javascript
// 变更前（Line 102-115）
if (result.success && result.data && result.data.access_token) {
  const user = result.data.user

  // 权限检查...

  if (hasAdminAccess) {
    showStatus('✅ 登录成功，正在跳转...')

    // ❌ 删除：不再存储到 localStorage
    // localStorage.setItem('admin_token', result.data.access_token);
    // localStorage.setItem('admin_user', JSON.stringify(user));

    // ✅ 新增：存储到内存（全局变量）
    window._adminToken = result.data.access_token
    window._adminUser = user

    setTimeout(() => {
      window.location.href = '/admin/dashboard.html'
    }, 1000)
  }
}
```

**B. `public/admin/js/admin-common.js` - 通用工具库**

```javascript
// ==================== Token管理（重构版）====================

/**
 * 全局内存存储（仅当前 Tab 有效）
 */
let _memoryToken = null
let _memoryUser = null

/**
 * 初始化 Token（页面加载时自动调用）
 *
 * 逻辑：
 * 1. 检查内存中是否有 token
 * 2. 如果没有，调用 /auth/refresh 静默刷新（浏览器自动携带 refresh_token Cookie）
 * 3. 如果刷新失败，跳转登录页
 */
async function initializeToken() {
  // 1. 检查内存 token
  if (_memoryToken) {
    console.log('✅ 使用内存中的 token')
    return _memoryToken
  }

  // 2. 尝试静默刷新
  console.log('🔄 内存无 token，尝试静默刷新...')
  try {
    const response = await fetch('/api/v4/auth/refresh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include' // ✅ 关键：携带 Cookie
    })

    const result = await response.json()

    if (result.success && result.data && result.data.access_token) {
      _memoryToken = result.data.access_token
      _memoryUser = result.data.user
      console.log('✅ Token 刷新成功')
      return _memoryToken
    } else {
      throw new Error('Token 刷新失败')
    }
  } catch (error) {
    console.error('❌ Token 刷新失败:', error)
    // 跳转登录页
    window.location.href = '/admin/login.html'
    return null
  }
}

/**
 * 获取 Token（同步方法，用于已初始化场景）
 */
function getToken() {
  if (!_memoryToken) {
    console.warn('⚠️ Token 未初始化，跳转登录页')
    window.location.href = '/admin/login.html'
    return null
  }
  return _memoryToken
}

/**
 * 保存 Token（登录成功后调用）
 */
function saveToken(token, user) {
  _memoryToken = token
  _memoryUser = user
}

/**
 * 清除 Token（退出登录时调用）
 */
function clearToken() {
  _memoryToken = null
  _memoryUser = null
}

/**
 * 退出登录（增强版：广播退出事件）
 */
async function logout() {
  try {
    // 1. 调用后端退出接口（清除 Cookie）
    await fetch('/api/v4/auth/logout', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${getToken()}`,
        'Content-Type': 'application/json'
      },
      credentials: 'include'
    })
  } catch (error) {
    console.error('退出登录请求失败:', error)
  }

  // 2. 清除本 Tab 内存
  clearToken()

  // 3. 广播退出事件（通知其他 Tab）
  if (window.BroadcastChannel) {
    const channel = new BroadcastChannel('admin_auth')
    channel.postMessage({ type: 'LOGOUT' })
    channel.close()
  }

  // 4. 跳转登录页
  window.location.href = '/admin/login.html'
}

/**
 * 获取当前用户信息
 */
function getCurrentUser() {
  return _memoryUser
}

/**
 * 获取当前用户ID
 */
function getCurrentUserId() {
  return _memoryUser ? _memoryUser.user_id : null
}

// ==================== 跨 Tab 退出监听 ====================

/**
 * 监听其他 Tab 的退出事件
 */
if (window.BroadcastChannel) {
  const authChannel = new BroadcastChannel('admin_auth')
  authChannel.onmessage = event => {
    if (event.data.type === 'LOGOUT') {
      console.log('📢 收到其他 Tab 的退出通知')
      clearToken()
      window.location.href = '/admin/login.html'
    }
  }
}

// ==================== 页面初始化 ====================

/**
 * 页面加载时自动初始化 Token
 */
document.addEventListener('DOMContentLoaded', async function () {
  // 登录页不需要初始化 token
  if (window.location.pathname === '/admin/login.html') {
    return
  }

  // 其他页面：初始化 token
  await initializeToken()

  // 权限检查（保持不变）
  checkAdminPermission()
})

// ==================== API请求封装（更新版）====================

/**
 * 统一的API请求封装函数（支持自动刷新）
 */
async function apiRequest(url, options = {}) {
  const token = getToken()
  if (!token) {
    return // getToken() 内部已跳转登录页
  }

  const defaultOptions = {
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    credentials: 'include' // ✅ 携带 Cookie
  }

  try {
    const response = await fetch(url, { ...defaultOptions, ...options })

    // 处理 401（Token 过期）
    if (response.status === 401) {
      console.log('🔄 Token 过期，尝试刷新...')

      // 尝试刷新 token
      const newToken = await initializeToken()
      if (newToken) {
        // 刷新成功，重试原请求
        options.headers = options.headers || {}
        options.headers.Authorization = `Bearer ${newToken}`
        return await fetch(url, { ...defaultOptions, ...options })
      } else {
        // 刷新失败，已跳转登录页
        return
      }
    }

    // 处理非JSON响应
    const contentType = response.headers.get('content-type')
    let result
    if (contentType && contentType.includes('application/json')) {
      result = await response.json()
    } else {
      result = { success: false, message: await response.text() }
    }

    // 其他错误处理（保持不变）
    if (response.status === 403) {
      alert('权限不足，请确认您有管理员权限')
      return
    }

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${result.message || '请求失败'}`)
    }

    return result
  } catch (error) {
    console.error('API请求失败:', error)
    throw error
  }
}
```

---

## 4. 实施计划

### 4.1 实施步骤

#### Phase 1: 后端改造（预计 2 小时）

**步骤 1.1：安装依赖**

```bash
cd /home/devbox/project
npm install cookie-parser --save
```

**步骤 1.2：修改 `app.js`**

- 在 `express.json()` 之后添加 `app.use(cookieParser())`
- 位置：约 Line 145

**步骤 1.3：修改 `routes/v4/auth/login.js`**

- 删除响应体中的 `refresh_token` 字段
- 添加 `res.cookie()` 设置 HttpOnly Cookie
- 位置：Line 114-130

**步骤 1.4：修改 `routes/v4/auth/token.js`**

- 修改 refresh 接口：从 `req.cookies` 读取 token
- 修改 logout 接口：添加 `res.clearCookie()`
- 位置：Line 103, Line 155-165

**步骤 1.5：测试后端接口**

```bash
# 测试登录（验证 Set-Cookie 响应头）
curl -i -X POST http://localhost:3000/api/v4/auth/login \
  -H "Content-Type: application/json" \
  -d '{"mobile":"13800138000","verification_code":"123456"}'

# 预期：响应头包含 Set-Cookie: refresh_token=...; HttpOnly

# 测试刷新（验证 Cookie 自动携带）
curl -i -X POST http://localhost:3000/api/v4/auth/refresh \
  -H "Cookie: refresh_token=<从上一步获取>" \
  -H "Content-Type: application/json"

# 预期：返回新的 access_token
```

#### Phase 2: 前端改造（预计 1.5 小时）

**步骤 2.1：修改 `public/admin/js/admin-common.js`**

- 替换整个 Token 管理部分（约 Line 35-130）
- 添加 `initializeToken()` / `BroadcastChannel` 监听
- 修改 `apiRequest()` 支持自动刷新

**步骤 2.2：修改 `public/admin/login.html`**

- 删除 `localStorage.setItem()` 调用
- 改用 `window._adminToken` / `saveToken()`
- 位置：Line 114-115

**步骤 2.3：验证其他管理页面**

- 检查 `dashboard.html` / `marketplace-stats.html` 等页面
- 确保都引入了 `admin-common.js`
- 确认没有直接调用 `localStorage.getItem('admin_token')`

**步骤 2.4：清理浏览器缓存**

```javascript
// 在浏览器控制台执行（测试前）
localStorage.clear()
sessionStorage.clear()
```

#### Phase 3: 集成测试（预计 1 小时）

**测试用例 1：单 Tab 登录**

1. 打开 `/admin/login.html`
2. 输入手机号 `13800138000`，验证码 `123456`
3. 点击登录
4. 验证跳转到 `/admin/dashboard.html`
5. 打开浏览器开发者工具 → Application → Cookies
6. 验证存在 `refresh_token` Cookie（HttpOnly=true）
7. 验证 localStorage 中**没有** `admin_token`

**测试用例 2：多 Tab 共享登录态**

1. 在 Tab 1 登录成功后，保持页面打开
2. 新开 Tab 2，直接访问 `/admin/dashboard.html`
3. 验证 Tab 2 自动完成登录（无需重新输入账号）
4. 在 Tab 2 打开控制台，查看网络请求
5. 验证自动调用了 `POST /api/v4/auth/refresh`
6. 验证请求头自动携带 `Cookie: refresh_token=...`

**测试用例 3：退出登录广播**

1. 保持 Tab 1 和 Tab 2 都打开
2. 在 Tab 1 点击"退出登录"按钮
3. 验证 Tab 1 跳转到登录页
4. 验证 Tab 2 **自动跳转**到登录页（收到广播）
5. 打开开发者工具 → Application → Cookies
6. 验证 `refresh_token` Cookie 已被清除

**测试用例 4：Token 自动刷新**

1. 登录后等待 15 分钟（access_token 过期）
2. 在管理页面执行任意 API 操作
3. 验证请求自动刷新 token（控制台输出"Token 过期，尝试刷新..."）
4. 验证操作正常完成（无需重新登录）

**测试用例 5：关闭浏览器后重新打开**

1. 登录成功后，完全关闭浏览器（所有窗口）
2. 重新打开浏览器，访问 `/admin/dashboard.html`
3. 验证自动跳转到登录页（Cookie 会话级别已失效）

### 4.2 时间估算

| 阶段     | 任务     | 预计时间     |
| -------- | -------- | ------------ |
| Phase 1  | 后端改造 | 2 小时       |
| Phase 2  | 前端改造 | 1.5 小时     |
| Phase 3  | 集成测试 | 1 小时       |
| **总计** |          | **4.5 小时** |

---

## 5. 测试验证

### 5.1 功能测试清单

- [ ] **登录流程**
  - [ ] 登录成功后 Cookie 中存在 `refresh_token`（HttpOnly）
  - [ ] 响应体中**不包含** `refresh_token` 字段
  - [ ] localStorage 中**没有** `admin_token`
- [ ] **多 Tab 共享**
  - [ ] 新开 Tab 自动调用 `/auth/refresh` 获取 token
  - [ ] 新开 Tab 无需重新登录即可访问管理页面
  - [ ] 同时打开 3+ 个 Tab，所有 Tab 都能正常使用
- [ ] **退出登录**
  - [ ] 点击退出后 Cookie 被清除
  - [ ] 其他 Tab 收到广播并自动跳转登录页
  - [ ] 退出后无法再访问管理页面（自动跳转登录）
- [ ] **Token 刷新**
  - [ ] access_token 过期后自动刷新
  - [ ] 刷新失败时跳转登录页
  - [ ] 刷新成功后原请求自动重试
- [ ] **安全性验证**
  - [ ] JavaScript 无法读取 `refresh_token`（`document.cookie` 中看不到）
  - [ ] 关闭浏览器后 Cookie 失效（会话级别）
  - [ ] CSRF 防护：Cookie 设置了 `SameSite=Strict`

### 5.2 兼容性测试

| 浏览器  | 版本 | 测试状态  | 备注                       |
| ------- | ---- | --------- | -------------------------- |
| Chrome  | 120+ | ⬜ 待测试 | 主要测试浏览器             |
| Edge    | 120+ | ⬜ 待测试 | 基于 Chromium              |
| Firefox | 115+ | ⬜ 待测试 | 验证 Cookie 行为           |
| Safari  | 16+  | ⬜ 待测试 | 验证 BroadcastChannel 支持 |

-

--

## 6. 风险评估

### 6.1 技术风险

| 风险项                  | 影响 | 概率 | 缓解措施                                      |
| ----------------------- | ---- | ---- | --------------------------------------------- |
| Cookie 跨域问题         | 高   | 低   | 确保前后端同域，生产环境配置正确的 `domain`   |
| BroadcastChannel 不支持 | 中   | 低   | Safari 15- 不支持，可降级到 localStorage 事件 |
| Token 刷新失败          | 高   | 中   | 添加重试机制，最多重试 3 次                   |
| 用户体验下降            | 中   | 低   | 充分测试多 Tab 场景，确保体验流畅             |

### 6.2 业务风险

| 风险项         | 影响 | 概率 | 缓解措施                   |
| -------------- | ---- | ---- | -------------------------- |
| 管理员无法登录 | 高   | 低   | 灰度发布，先在测试环境验证 |
| 现有会话失效   | 中   | 高   | 发布时通知管理员重新登录   |
| 多 Tab 不同步  | 中   | 低   | 充分测试退出广播机制       |

---

## 7. 回滚方案

### 7.1 回滚触发条件

- ❌ 登录成功率 < 95%
- ❌ Token 刷新失败率 > 10%
- ❌ 用户反馈多 Tab 无法使用
- ❌ 出现安全漏洞或数据泄露

### 7.2 回滚步骤（预计 30 分钟）

**步骤 1：恢复后端代码**

```bash
# 回滚到上一个稳定版本
git revert <commit-hash>
git push origin main

# 或手动恢复文件
git checkout HEAD~1 -- routes/v4/auth/login.js
git checkout HEAD~1 -- routes/v4/auth/token.js
git checkout HEAD~1 -- app.js
```

**步骤 2：恢复前端代码**

```bash
git checkout HEAD~1 -- public/admin/login.html
git checkout HEAD~1 -- public/admin/js/admin-common.js
```

**步骤 3：重启服务**

```bash
pm2 restart restaurant-lottery-backend
```

**步骤 4：验证回滚**

- 登录管理后台
- 验证 token 存储在 localStorage
- 验证多 Tab 正常工作

### 7.3 数据恢复

**无需数据恢复**：本次升级不涉及数据库结构变更，仅修改 token 存储方式。

---

## 8. 附录

### 8.1 相关文档

- [API 设计标准](./api-design-standards.md)
- [API 测试报告](./api-test-report-2025-12-22.md)
- [管理前端重构计划](./admin-frontend-api-client-refactor-plan.md)

### 8.2 参考资料

- [OWASP - Session Management Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html)
- [MDN - HTTP Cookies](https://developer.mozilla.org/en-US/docs/Web/HTTP/Cookies)
- [RFC 6265 - HTTP State Management Mechanism](https://tools.ietf.org/html/rfc6265)

### 8.3 变更记录

| 版本 | 日期       | 作者         | 变更内容               |
| ---- | ---------- | ------------ | ---------------------- |
| v1.0 | 2025-12-23 | AI Assistant | 初始版本，完整技术方案 |

---

**文档状态**: ✅ 已完成  
**下一步行动**: 等待技术评审和实施排期
