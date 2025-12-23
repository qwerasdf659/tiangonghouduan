# 管理后台前端 API Client 重构方案

**文档版本**: v1.0.0  
**创建日期**: 2025-12-22  
**适用范围**: 管理端前端（`public/admin/`）  
**核心目标**: 暴力重构移除旧方案，只保留新方案，降低长期维护成本，以后端为唯一权威数据来源

---

## 📋 目录

1. [当前前端架构现状](#1-当前前端架构现状)
2. [存在的核心问题](#2-存在的核心问题)
3. [重构设计方案](#3-重构设计方案)
4. [登录鉴权与权限体系](#4-登录鉴权与权限体系)
5. [Devbox 联调访问策略](#5-devbox-联调访问策略)
6. [API 路由对照表](#6-api-路由对照表)
7. [迁移步骤与验收](#7-迁移步骤与验收)
8. [行业对比与最佳实践](#8-行业对比与最佳实践)

---

## 1. 当前前端架构现状

### 1.1 技术栈与部署形态

```
架构形态：
- 静态 HTML + 原生 JavaScript（无 React/Vue）
- 位置：public/admin/*.html（约 25+ 页面）
- 部署：同一 Sealos Devbox，Express 静态托管
- 访问：/admin/* 与 /api/v4/* 同源

目录结构：
public/admin/
├── *.html                    # 业务页面（内联大量 <script>）
├── js/
│   ├── admin-common.js       # 旧 API 封装（apiRequest）
│   ├── api-config.js         # 旧 API 封装（API 类）
│   ├── dom-utils.js          # DOM 工具
│   └── resource-config.js    # 静态资源
├── css/
│   └── common.css            # 统一样式
└── images/
```

### 1.2 现有 API 调用层（存在两套未统一）

#### 方案 A：`admin-common.js`（多数页面在用）

```javascript
// 使用方式
const response = await apiRequest('/api/v4/admin/system/dashboard');

// 特点
- 统一 Authorization header
- 401 直接 logout
- 无 token 刷新机制
- 错误处理简单（alert）
```

#### 方案 B：`api-config.js`（部分页面在用）

```javascript
// 使用方式
const presets = await API.getPresetList({ status: 'pending', page: 1 });

// 特点
- 有端点常量（API_ENDPOINTS）
- 有封装方法（API.xxx）
- 但定义与实现不一致（如 API.createPrize 用的 ENDPOINTS.PRIZE.CREATE 不存在）
- 内部仍依赖 apiRequest 降级
```

#### 方案 C：页面直接 fetch（绕过统一层）

```javascript
// 登录页、部分兑换市场页面
const response = await fetch('/api/v4/auth/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ mobile, verification_code })
})
```

---

## 2. 存在的核心问题

### 🔴 P0 级问题（影响线上稳定性）

#### 2.1 前后端接口路由不一致（高风险隐患）

| 前端实际调用路径                             | 后端真实路由                                           | 状态      | 风险                               |
| -------------------------------------------- | ------------------------------------------------------ | --------- | ---------------------------------- |
| `POST /api/v4/admin/exchange_market/items`   | `POST /api/v4/admin/marketplace/exchange_market/items` | ❌ 不一致 | 可能访问到不存在的接口或用户端接口 |
| `GET /api/v4/exchange_market/items/:id`      | 用户端接口，管理端应访问 admin 路由                    | ❌ 越权   | 权限控制绕过、数据结构不一致       |
| `GET /api/v4/admin/prize-pool/BASIC_LOTTERY` | 后端无此接口                                           | ❌ 404    | 功能失效                           |
| `POST /api/v4/auth/refresh`                  | ✅ 存在但前端未使用                                    | ⚠️ 未用   | token 过期强制登出，体验差         |

**实际代码证据**：

```javascript
// public/admin/exchange-market-items.html:504
const response = await fetch('/api/v4/admin/exchange_market/items', {
  method: 'POST',
  headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
  body: JSON.stringify(data)
});

// 后端真实路由：routes/v4/admin/marketplace.js:107
router.post('/exchange_market/items', ...)
// 完整路径应为：/api/v4/admin/marketplace/exchange_market/items
```

#### 2.2 API Client 双轨并存导致维护混乱

- 25+ 页面，部分用 `apiRequest`，部分用 `API.xxx`，部分直接 `fetch`
- 修改统一逻辑（如 token 刷新）需要三处改，极易遗漏
- 新人无法判断应该用哪套

#### 2.3 缺少 Token 刷新机制

- 后端提供 `POST /api/v4/auth/refresh`（返回新 access_token + refresh_token）
- 前端遇到 401 直接清理 localStorage 并跳登录
- 实际场景：用户填了半小时表单，提交时 token 过期，数据全丢

### ⚠️ P1 级问题（影响可维护性）

#### 2.4 大量内联脚本导致维护成本指数增长

```html
<!-- 每个页面都有 200-500 行内联 <script> -->
<script>
  async function loadData() {
    /* 重复逻辑 */
  }
  function renderTable(data) {
    /* 重复逻辑 */
  }
  function showError(msg) {
    /* 重复逻辑 */
  }
  // ... 300 行
</script>
```

#### 2.5 权限校验仅依赖本地 localStorage

```javascript
// admin-common.js:86
function checkAdminPermission() {
  const userStr = localStorage.getItem('admin_user')
  const user = JSON.parse(userStr)
  return user.roles && user.roles.some(role => role.role_name === 'admin' || role.role_level >= 100)
}
```

**问题**：

- 管理员被后台降权后，前端仍以为有权限（直到刷新页面 + token 过期）
- 无"权限权威校验"闭环

#### 2.6 错误处理不统一

- 部分页面用 `alert()`
- 部分页面用 `showError()` / `showSuccess()`（但实现各不相同）
- 部分页面静默失败（只 console.error）

---

## 3. 重构设计方案

### 3.1 设计原则

1. **只保留一套新方案，暴力移除旧方案**（不做向下兼容）
2. **后端是唯一权威数据来源**（前端不得定义接口路径常量）
3. **不引入过度设计**（不上 React/Vue，不做微前端，但要内核统一）
4. **统一 > 分散**（所有 API 调用、鉴权、错误处理必须走统一内核）

### 3.2 新架构分层

```
┌─────────────────────────────────────────────────┐
│  页面层（public/admin/js/pages/*.js）            │
│  - 只负责 UI 逻辑、DOM 操作、表单验证            │
│  - 调用 apis/* 模块，禁止直接 fetch              │
└─────────────────────────────────────────────────┘
                      ↓
┌─────────────────────────────────────────────────┐
│  API 业务模块层（public/admin/js/apis/*.js）     │
│  - 按业务域拆分：auth / marketplace / user 等    │
│  - 定义业务方法，调用 httpClient                 │
│  - 对齐后端真实路由（单一数据来源）              │
└─────────────────────────────────────────────────┘
                      ↓
┌─────────────────────────────────────────────────┐
│  HTTP Client 核心层（public/admin/js/core/）     │
│  - httpClient.js：请求内核（fetch 封装）         │
│  - authStore.js：token 存储与刷新                │
│  - errorHandler.js：统一错误处理                 │
│  - interceptors.js：请求/响应拦截器链            │
└─────────────────────────────────────────────────┘
                      ↓
              后端 API（/api/v4/*）
```

### 3.3 核心模块设计

#### 3.3.1 `httpClient.js`（请求内核）

```javascript
/**
 * HTTP Client 核心层
 * 职责：
 * 1. 构建完整 URL
 * 2. 统一 header 注入（Authorization、Content-Type）
 * 3. 统一响应解析（success/error 转换）
 * 4. 拦截器链执行
 *
 * 特点：
 * - 不关心业务逻辑
 * - 不处理具体错误（交给 errorHandler）
 * - 不持有 token（从 authStore 读取）
 */

class HttpClient {
  constructor(config = {}) {
    this.baseURL = config.baseURL || ''
    this.timeout = config.timeout || 30000
    this.beforeRequest = [] // 请求拦截器
    this.afterResponse = [] // 响应拦截器
    this.onError = [] // 错误拦截器
  }

  /**
   * 发起请求（核心方法）
   * @param {Object} options - 请求配置
   * @returns {Promise<Object>} 标准化响应
   */
  async request(options) {
    const {
      method = 'GET',
      path,
      query = {},
      body = null,
      headers = {},
      skipAuth = false,
      timeout = this.timeout
    } = options

    // 1. 构建完整 URL
    const url = this._buildURL(path, query)

    // 2. 执行请求前拦截器
    let requestConfig = { method, url, headers: { ...headers }, body }
    for (const interceptor of this.beforeRequest) {
      requestConfig = await interceptor(requestConfig)
    }

    // 3. 注入认证 header（从 authStore 读取）
    if (!skipAuth) {
      const token = authStore.getAccessToken()
      if (token) {
        requestConfig.headers['Authorization'] = `Bearer ${token}`
      }
    }

    // 4. 设置默认 Content-Type
    if (body && !requestConfig.headers['Content-Type']) {
      requestConfig.headers['Content-Type'] = 'application/json'
    }

    // 5. 发起 fetch 请求（带超时）
    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), timeout)

      const response = await fetch(url, {
        method: requestConfig.method,
        headers: requestConfig.headers,
        body: body ? JSON.stringify(body) : null,
        signal: controller.signal
      })

      clearTimeout(timeoutId)

      // 6. 解析响应
      const result = await this._parseResponse(response)

      // 7. 执行响应后拦截器
      let finalResult = result
      for (const interceptor of this.afterResponse) {
        finalResult = await interceptor(finalResult, response)
      }

      return finalResult
    } catch (error) {
      // 8. 执行错误拦截器
      let handledError = error
      for (const interceptor of this.onError) {
        handledError = await interceptor(handledError, requestConfig)
      }
      throw handledError
    }
  }

  /**
   * 构建完整 URL（baseURL + path + query）
   */
  _buildURL(path, query = {}) {
    let url = this.baseURL + path
    const queryString = new URLSearchParams(query).toString()
    return queryString ? `${url}?${queryString}` : url
  }

  /**
   * 解析响应（统一转换为标准格式）
   */
  async _parseResponse(response) {
    const contentType = response.headers.get('content-type')
    let data

    if (contentType && contentType.includes('application/json')) {
      data = await response.json()
    } else {
      data = { success: false, message: await response.text() }
    }

    // 标准化响应结构（对齐后端 ApiResponse）
    return {
      success: data.success ?? response.ok,
      code: data.code || (response.ok ? 'SUCCESS' : 'ERROR'),
      message: data.message || '',
      data: data.data || null,
      httpStatus: response.status,
      timestamp: data.timestamp || new Date().toISOString()
    }
  }

  // 便捷方法
  get(path, query = {}, options = {}) {
    return this.request({ method: 'GET', path, query, ...options })
  }

  post(path, body = {}, options = {}) {
    return this.request({ method: 'POST', path, body, ...options })
  }

  put(path, body = {}, options = {}) {
    return this.request({ method: 'PUT', path, body, ...options })
  }

  delete(path, options = {}) {
    return this.request({ method: 'DELETE', path, ...options })
  }
}

// 全局单例
const httpClient = new HttpClient({ baseURL: '' }) // 同源，无需 baseURL
```

#### 3.3.2 `authStore.js`（Token 存储与刷新）

```javascript
/**
 * 认证 Token 存储管理
 * 职责：
 * 1. Token 读写（access_token / refresh_token）
 * 2. 用户信息缓存
 * 3. Token 刷新逻辑（单飞刷新）
 * 4. 登出清理
 */

class AuthStore {
  constructor() {
    this.storageKey = {
      accessToken: 'admin_access_token',
      refreshToken: 'admin_refresh_token',
      user: 'admin_user'
    }
    this.isRefreshing = false
    this.refreshPromise = null
  }

  /**
   * 获取 access_token
   */
  getAccessToken() {
    return localStorage.getItem(this.storageKey.accessToken)
  }

  /**
   * 获取 refresh_token
   */
  getRefreshToken() {
    return localStorage.getItem(this.storageKey.refreshToken)
  }

  /**
   * 获取用户信息
   */
  getUser() {
    const userStr = localStorage.getItem(this.storageKey.user)
    return userStr ? JSON.parse(userStr) : null
  }

  /**
   * 保存登录信息
   */
  setLoginInfo(accessToken, refreshToken, user) {
    localStorage.setItem(this.storageKey.accessToken, accessToken)
    localStorage.setItem(this.storageKey.refreshToken, refreshToken)
    localStorage.setItem(this.storageKey.user, JSON.stringify(user))
  }

  /**
   * 刷新 Token（单飞模式：并发请求只刷新一次）
   * @returns {Promise<string>} 新的 access_token
   */
  async refreshToken() {
    // 如果正在刷新，等待同一个 Promise
    if (this.isRefreshing && this.refreshPromise) {
      return await this.refreshPromise
    }

    this.isRefreshing = true
    this.refreshPromise = this._doRefresh()

    try {
      const newAccessToken = await this.refreshPromise
      return newAccessToken
    } finally {
      this.isRefreshing = false
      this.refreshPromise = null
    }
  }

  /**
   * 实际刷新逻辑（内部方法）
   */
  async _doRefresh() {
    const refreshToken = this.getRefreshToken()

    if (!refreshToken) {
      throw new Error('REFRESH_TOKEN_MISSING')
    }

    // 直接调用 fetch（不走 httpClient 避免循环）
    const response = await fetch('/api/v4/auth/refresh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: refreshToken })
    })

    const result = await response.json()

    if (result.success && result.data) {
      const { access_token, refresh_token, user } = result.data

      // 更新 token
      this.setLoginInfo(access_token, refresh_token, user)

      console.log('✅ Token 刷新成功')
      return access_token
    } else {
      throw new Error('REFRESH_FAILED')
    }
  }

  /**
   * 清理所有认证信息
   */
  clear() {
    localStorage.removeItem(this.storageKey.accessToken)
    localStorage.removeItem(this.storageKey.refreshToken)
    localStorage.removeItem(this.storageKey.user)
  }

  /**
   * 检查是否已登录
   */
  isLoggedIn() {
    return !!this.getAccessToken()
  }
}

// 全局单例
const authStore = new AuthStore()
```

#### 3.3.3 `interceptors.js`（拦截器）

```javascript
/**
 * HTTP 拦截器
 * 职责：
 * 1. 401 自动刷新 Token + 重放请求
 * 2. 403 权限提示
 * 3. 429 限流提示
 * 4. 5xx 系统错误提示
 */

/**
 * 响应拦截器：处理 401（Token 过期）
 */
async function handle401Interceptor(result, response) {
  if (result.httpStatus === 401) {
    console.warn('⚠️ Token 过期，尝试刷新...')

    try {
      // 刷新 Token
      await authStore.refreshToken()

      // 重放原请求（新 token 会在 httpClient 中自动注入）
      console.log('🔄 Token 刷新成功，重放请求...')

      // 注意：这里需要重新发起请求，原始 response 对象已经消费
      // 实际实现中，httpClient 会在错误拦截器中处理重放
      return result // 标记为需要重试
    } catch (error) {
      console.error('❌ Token 刷新失败，跳转登录')

      // 清理认证信息
      authStore.clear()

      // 跳转登录页
      window.location.href = '/admin/login.html'

      throw new Error('AUTHENTICATION_EXPIRED')
    }
  }

  return result
}

/**
 * 错误拦截器：统一错误处理
 */
async function errorHandlerInterceptor(error, requestConfig) {
  // 网络错误
  if (error.name === 'AbortError') {
    return {
      success: false,
      code: 'TIMEOUT',
      message: '请求超时，请检查网络连接',
      httpStatus: 0
    }
  }

  if (error.name === 'TypeError' && error.message.includes('fetch')) {
    return {
      success: false,
      code: 'NETWORK_ERROR',
      message: '网络连接失败，请检查网络',
      httpStatus: 0
    }
  }

  // 其他错误透传
  throw error
}

// 注册拦截器到 httpClient
httpClient.afterResponse.push(handle401Interceptor)
httpClient.onError.push(errorHandlerInterceptor)
```

#### 3.3.4 `errorHandler.js`（统一错误提示）

```javascript
/**
 * 统一错误处理器
 * 职责：
 * 1. 根据 httpStatus + code 分类错误
 * 2. 统一用户提示（toast/modal）
 * 3. 开发态详细日志
 */

class ErrorHandler {
  /**
   * 处理 API 错误
   * @param {Object} result - httpClient 返回的标准化响应
   * @param {string} context - 错误上下文（如："加载用户列表"）
   */
  handle(result, context = '') {
    const { httpStatus, code, message } = result

    // 开发态：打印详细日志
    if (window.location.hostname === 'localhost' || window.location.hostname.includes('devbox')) {
      console.error('❌ API 错误:', {
        context,
        httpStatus,
        code,
        message,
        timestamp: new Date().toISOString()
      })
    }

    // 根据状态码分类处理
    switch (httpStatus) {
      case 400:
        this._showError(`参数错误: ${message}`, 'warning')
        break
      case 401:
        // 已在拦截器处理，这里不再提示
        break
      case 403:
        this._showError('您没有权限执行此操作', 'error')
        break
      case 404:
        this._showError('请求的资源不存在', 'warning')
        break
      case 429:
        this._showError('请求过于频繁，请稍后再试', 'warning')
        break
      case 500:
      case 502:
      case 503:
        this._showError('系统繁忙，请稍后重试', 'error')
        break
      default:
        this._showError(message || '操作失败，请稍后重试', 'error')
    }
  }

  /**
   * 显示成功提示
   */
  showSuccess(message) {
    this._showToast(message, 'success')
  }

  /**
   * 显示错误提示（内部方法）
   */
  _showError(message, type = 'error') {
    this._showToast(message, type)
  }

  /**
   * Toast 提示（统一实现）
   * 可选方案：
   * 1. Bootstrap Toast
   * 2. 第三方库（如 toastify-js）
   * 3. 自定义 DOM 实现
   */
  _showToast(message, type = 'info') {
    // 方案 1：使用 Bootstrap Toast（你的项目已引入 Bootstrap 5）
    const toastContainer = document.getElementById('toastContainer')

    if (!toastContainer) {
      // 首次使用，创建容器
      const container = document.createElement('div')
      container.id = 'toastContainer'
      container.className = 'toast-container position-fixed top-0 end-0 p-3'
      document.body.appendChild(container)
    }

    const toastId = `toast-${Date.now()}`
    const bgClass =
      {
        success: 'bg-success',
        error: 'bg-danger',
        warning: 'bg-warning',
        info: 'bg-info'
      }[type] || 'bg-secondary'

    const toastHTML = `
      <div id="${toastId}" class="toast align-items-center text-white ${bgClass} border-0" role="alert">
        <div class="d-flex">
          <div class="toast-body">${message}</div>
          <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast"></button>
        </div>
      </div>
    `

    document.getElementById('toastContainer').insertAdjacentHTML('beforeend', toastHTML)

    const toastElement = document.getElementById(toastId)
    const toast = new bootstrap.Toast(toastElement, { delay: 3000 })
    toast.show()

    // 移除 DOM
    toastElement.addEventListener('hidden.bs.toast', () => {
      toastElement.remove()
    })
  }
}

// 全局单例
const errorHandler = new ErrorHandler()
```

### 3.4 API 业务模块（按后端真实路由对齐）

#### 示例：`apis/adminMarketplace.js`（兑换市场管理）

```javascript
/**
 * 兑换市场管理 API
 * 对齐后端路由：routes/v4/admin/marketplace.js
 *
 * 权威路由前缀：/api/v4/admin/marketplace/
 */

const adminMarketplaceAPI = {
  /**
   * 查询所有用户上架状态
   * GET /api/v4/admin/marketplace/listing-stats
   */
  async getListingStats({ page = 1, limit = 20, filter = 'all' } = {}) {
    return await httpClient.get('/api/v4/admin/marketplace/listing-stats', {
      page,
      limit,
      filter
    })
  },

  /**
   * 创建兑换商品
   * POST /api/v4/admin/marketplace/exchange_market/items
   */
  async createExchangeItem(data) {
    return await httpClient.post('/api/v4/admin/marketplace/exchange_market/items', data)
  },

  /**
   * 更新兑换商品
   * PUT /api/v4/admin/marketplace/exchange_market/items/:item_id
   */
  async updateExchangeItem(itemId, data) {
    return await httpClient.put(`/api/v4/admin/marketplace/exchange_market/items/${itemId}`, data)
  },

  /**
   * 删除兑换商品
   * DELETE /api/v4/admin/marketplace/exchange_market/items/:item_id
   */
  async deleteExchangeItem(itemId) {
    return await httpClient.delete(`/api/v4/admin/marketplace/exchange_market/items/${itemId}`)
  }
}
```

#### 示例：`apis/auth.js`（认证相关）

```javascript
/**
 * 认证 API
 * 对齐后端路由：routes/v4/auth/login.js + routes/v4/auth/token.js
 */

const authAPI = {
  /**
   * 用户登录
   * POST /api/v4/auth/login
   */
  async login(mobile, verificationCode) {
    return await httpClient.post(
      '/api/v4/auth/login',
      {
        mobile,
        verification_code: verificationCode
      },
      { skipAuth: true }
    ) // 登录请求不需要 Authorization
  },

  /**
   * 验证 Token
   * GET /api/v4/auth/verify
   */
  async verifyToken() {
    return await httpClient.get('/api/v4/auth/verify')
  },

  /**
   * 退出登录
   * POST /api/v4/auth/logout
   */
  async logout() {
    return await httpClient.post('/api/v4/auth/logout')
  },

  /**
   * 管理员信息（推荐管理端使用）
   * GET /api/v4/admin/auth/profile
   */
  async getAdminProfile() {
    return await httpClient.get('/api/v4/admin/auth/profile')
  }
}
```

---

## 4. 登录鉴权与权限体系

### 4.1 Token 存储策略（安全 vs 易用）

#### 方案对比

| 方案               | access_token     | refresh_token    | 优点                     | 缺点                     | 推荐度     |
| ------------------ | ---------------- | ---------------- | ------------------------ | ------------------------ | ---------- |
| **方案 A（推荐）** | `sessionStorage` | `sessionStorage` | 关闭浏览器即失效，更安全 | 每次打开需重新登录       | ⭐⭐⭐⭐⭐ |
| 方案 B             | `localStorage`   | `localStorage`   | 持久化，用户体验好       | XSS 风险更高，需配合 CSP | ⭐⭐⭐     |
| 方案 C             | 内存变量         | `sessionStorage` | access_token 最安全      | 刷新页面需重新登录       | ⭐⭐⭐⭐   |

**推荐：方案 A（管理端适用）**

- 管理端对安全要求更高，可牺牲部分易用性
- 配合"去除内联脚本 + CSP"可大幅降低 XSS 风险

### 4.2 Token 刷新流程（单飞刷新 + 原请求重放）

```
用户操作 → 发起 API 请求
              ↓
        httpClient 拦截
              ↓
     注入 Authorization header
              ↓
         发送到后端
              ↓
    ┌─────────────────┐
    │  后端返回 401   │ ← Token 过期
    └─────────────────┘
              ↓
    响应拦截器检测到 401
              ↓
    调用 authStore.refreshToken()
              ↓
    ┌──────────────────────────┐
    │ 检查是否正在刷新？        │
    │ - 是：等待同一个 Promise  │
    │ - 否：发起刷新请求        │
    └──────────────────────────┘
              ↓
    POST /api/v4/auth/refresh
    { refresh_token: "..." }
              ↓
    后端验证 refresh_token
              ↓
    返回新的 access_token + refresh_token
              ↓
    authStore 更新本地 token
              ↓
    httpClient 自动重放原请求
    （新 token 已注入）
              ↓
    返回业务数据给前端
```

**关键点**：

1. **单飞刷新**：多个并发 401 请求只刷新一次，其他请求等待
2. **自动重放**：刷新成功后，原请求自动重试（用户无感知）
3. **失败降级**：刷新失败后，清理 token 并跳转登录

### 4.3 权限校验体系（以后端为权威）

#### 权限检查层次

```
┌─────────────────────────────────────────┐
│ 1. 页面加载前：软校验（localStorage）    │
│    - 目的：减少无意义请求               │
│    - 实现：checkAdminPermission()       │
│    - 失败：提示"无权限"，不跳转         │
└─────────────────────────────────────────┘
              ↓
┌─────────────────────────────────────────┐
│ 2. 页面初始化：权威校验（API）          │
│    - 调用：GET /api/v4/admin/auth/profile│
│    - 后端返回：roles、role_level、status │
│    - 失败：清理 token，跳转登录         │
└─────────────────────────────────────────┘
              ↓
┌─────────────────────────────────────────┐
│ 3. 操作执行时：后端强制校验             │
│    - 中间件：requireAdmin               │
│    - 返回 403：前端提示"无权限"         │
│    - 前端不做二次判断（信任后端）       │
└─────────────────────────────────────────┘
```

#### 统一权限守卫实现

```javascript
/**
 * 页面权限守卫（在每个管理端页面加载时调用）
 * 职责：
 * 1. 检查是否登录
 * 2. 验证管理员权限（权威 API）
 * 3. 缓存用户信息
 */
async function initAdminPage() {
  // 1. 检查是否登录
  if (!authStore.isLoggedIn()) {
    console.warn('⚠️ 未登录，跳转登录页')
    window.location.href = '/admin/login.html'
    return
  }

  try {
    // 2. 权威权限校验（调用后端 API）
    const result = await authAPI.getAdminProfile()

    if (result.success && result.data.user) {
      const user = result.data.user

      // 3. 验证管理员权限
      if (!user.roles || !user.roles.some(r => r.role_name === 'admin' || r.role_level >= 100)) {
        errorHandler.handle({
          httpStatus: 403,
          code: 'INSUFFICIENT_PERMISSION',
          message: '您没有管理员权限'
        })
        setTimeout(() => (window.location.href = '/admin/login.html'), 2000)
        return
      }

      // 4. 更新本地缓存（但以 API 返回为准）
      localStorage.setItem('admin_user', JSON.stringify(user))

      console.log('✅ 权限验证通过', {
        user_id: user.user_id,
        roles: user.roles.map(r => r.role_name).join(','),
        role_level: user.role_level
      })

      // 5. 初始化页面内容
      return user
    } else {
      throw new Error('权限验证失败')
    }
  } catch (error) {
    console.error('❌ 权限验证异常:', error)

    // Token 可能已过期，清理并跳转
    authStore.clear()
    window.location.href = '/admin/login.html'
  }
}
```

---

## 5. Devbox 联调访问策略

### 5.1 当前部署架构

```
┌────────────────────────────────────────┐
│  Sealos Devbox（同一容器）              │
│                                        │
│  ┌──────────────────────────────────┐ │
│  │  Express 服务（Port 3000）        │ │
│  │                                  │ │
│  │  ┌────────────────────────────┐ │ │
│  │  │ 静态托管：/admin/*         │ │ │
│  │  │ - 管理端前端 HTML/JS/CSS   │ │ │
│  │  └────────────────────────────┘ │ │
│  │                                  │ │
│  │  ┌────────────────────────────┐ │ │
│  │  │ API 路由：/api/v4/*        │ │ │
│  │  │ - 后端业务逻辑             │ │ │
│  │  └────────────────────────────┘ │ │
│  │                                  │ │
│  │  ┌────────────────────────────┐ │ │
│  │  │ 数据库：MySQL              │ │ │
│  │  └────────────────────────────┘ │ │
│  └──────────────────────────────────┘ │
│                                        │
│  访问方式（同源）：                     │
│  - 管理端：http://devbox:3000/admin/   │
│  - API：http://devbox:3000/api/v4/     │
└────────────────────────────────────────┘
```

### 5.2 推荐方案：同源部署（无需 CORS）

#### 优点

- ✅ **无需 CORS 配置**（同协议、同域名、同端口）
- ✅ **简化 token 管理**（无需处理 credentials）
- ✅ **排障成本最低**（只有一个入口，网络问题易定位）
- ✅ **部署简单**（Devbox 只暴露一个端口）

#### 实现方式（已满足，无需调整）

```javascript
// app.js（后端）
const express = require('express')
const app = express()

// 1. 静态托管管理端
app.use('/admin', express.static('public/admin'))

// 2. API 路由
app.use('/api/v4', require('./routes/v4'))

// 3. 默认重定向
app.get('/', (req, res) => {
  res.redirect('/admin/dashboard.html')
})

app.listen(3000, () => {
  console.log('✅ 服务启动：http://localhost:3000')
  console.log('   - 管理端：http://localhost:3000/admin/')
  console.log('   - API：http://localhost:3000/api/v4/')
})
```

#### 前端配置（相对路径）

```javascript
// httpClient.js
const httpClient = new HttpClient({
  baseURL: '' // 同源部署，使用相对路径
})

// API 调用（示例）
await httpClient.get('/api/v4/admin/system/dashboard')
// 实际请求：http://<current-domain>:3000/api/v4/admin/system/dashboard
```

### 5.3 备选方案对比（仅供参考）

| 方案                 | 适用场景                 | 复杂度        | 推荐度     |
| -------------------- | ------------------------ | ------------- | ---------- |
| **同源部署（当前）** | 管理端 + 后端同一 Devbox | ⭐ 最低       | ⭐⭐⭐⭐⭐ |
| 前端独立部署 + 反代  | 前端需独立域名/CDN       | ⭐⭐⭐ 中等   | ⭐⭐⭐     |
| 前端独立部署 + CORS  | 无法做反代               | ⭐⭐⭐⭐ 较高 | ⭐⭐       |

---

## 6. API 路由对照表

### 6.1 认证相关

| 功能       | 后端真实路由                     | 前端当前调用 | 状态 | 修复建议         |
| ---------- | -------------------------------- | ------------ | ---- | ---------------- |
| 用户登录   | `POST /api/v4/auth/login`        | ✅ 一致      | ✅   | -                |
| Token 验证 | `GET /api/v4/auth/verify`        | ✅ 一致      | ✅   | -                |
| Token 刷新 | `POST /api/v4/auth/refresh`      | ❌ 未使用    | ⚠️   | 集成到 authStore |
| 退出登录   | `POST /api/v4/auth/logout`       | ✅ 一致      | ✅   | -                |
| 管理员信息 | `GET /api/v4/admin/auth/profile` | ❌ 未使用    | ⚠️   | 推荐管理端使用   |

### 6.2 兑换市场管理

| 功能         | 后端真实路由                                                 | 前端当前调用                             | 状态 | 修复建议                 |
| ------------ | ------------------------------------------------------------ | ---------------------------------------- | ---- | ------------------------ |
| 用户上架统计 | `GET /api/v4/admin/marketplace/listing-stats`                | ❌ 不存在                                | ❌   | 新功能，需前端实现       |
| 创建兑换商品 | `POST /api/v4/admin/marketplace/exchange_market/items`       | ❌ `/api/v4/admin/exchange_market/items` | ❌   | **立即修复**（路径错误） |
| 更新兑换商品 | `PUT /api/v4/admin/marketplace/exchange_market/items/:id`    | ❌ 混用用户端接口                        | ❌   | **立即修复**（越权风险） |
| 删除兑换商品 | `DELETE /api/v4/admin/marketplace/exchange_market/items/:id` | ❌ 混用用户端接口                        | ❌   | **立即修复**（越权风险） |

**风险说明**：

- 当前 `exchange-market-items.html` 混用了：
  - 管理员创建：`POST /api/v4/admin/exchange_market/items`（路径少 `marketplace/`）
  - 用户端查询：`GET /api/v4/exchange_market/items/:id`（非管理员路由）
- 可能导致：权限绕过、数据结构不一致、功能异常

### 6.3 材料资产管理

| 功能         | 后端真实路由                                                  | 前端当前调用 | 状态 | 修复建议 |
| ------------ | ------------------------------------------------------------- | ------------ | ---- | -------- |
| 获取资产类型 | `GET /api/v4/admin/material/asset-types`                      | ✅ 一致      | ✅   | -        |
| 创建资产类型 | `POST /api/v4/admin/material/asset-types`                     | ✅ 一致      | ✅   | -        |
| 更新资产类型 | `PUT /api/v4/admin/material/asset-types/:code`                | ✅ 一致      | ✅   | -        |
| 查询用户余额 | `GET /api/v4/admin/material/users/:user_id/balance`           | ✅ 一致      | ✅   | -        |
| 调整用户余额 | `POST /api/v4/admin/material/users/:user_id/adjust`           | ✅ 一致      | ✅   | -        |
| 转换规则管理 | `GET/POST/PUT/DELETE /api/v4/admin/material/conversion-rules` | ✅ 一致      | ✅   | -        |

### 6.4 用户与权限管理

| 功能         | 后端真实路由                                              | 前端当前调用 | 状态 | 修复建议 |
| ------------ | --------------------------------------------------------- | ------------ | ---- | -------- |
| 用户列表     | `GET /api/v4/admin/user-management/users`                 | ✅ 一致      | ✅   | -        |
| 用户详情     | `GET /api/v4/admin/user-management/users/:user_id`        | ✅ 一致      | ✅   | -        |
| 更新用户角色 | `PUT /api/v4/admin/user-management/users/:user_id/role`   | ✅ 一致      | ✅   | -        |
| 更新用户状态 | `PUT /api/v4/admin/user-management/users/:user_id/status` | ✅ 一致      | ✅   | -        |
| 角色列表     | `GET /api/v4/admin/user-management/roles`                 | ✅ 一致      | ✅   | -        |

### 6.5 预设与奖品管理

| 功能         | 后端真实路由                                   | 前端当前调用 | 状态 | 修复建议 |
| ------------ | ---------------------------------------------- | ------------ | ---- | -------- |
| 预设列表     | `GET /api/v4/lottery-preset/list`              | ✅ 一致      | ✅   | -        |
| 创建预设     | `POST /api/v4/lottery-preset/create`           | ✅ 一致      | ✅   | -        |
| 奖品列表     | `GET /api/v4/admin/prize-pool/list`            | ✅ 一致      | ✅   | -        |
| 批量添加奖品 | `POST /api/v4/admin/prize-pool/batch-add`      | ✅ 一致      | ✅   | -        |
| 更新奖品     | `PUT /api/v4/admin/prize-pool/prize/:prize_id` | ✅ 一致      | ✅   | -        |

### 6.6 系统管理

| 功能       | 后端真实路由                         | 前端当前调用 | 状态 | 修复建议 |
| ---------- | ------------------------------------ | ------------ | ---- | -------- |
| 系统仪表板 | `GET /api/v4/admin/system/dashboard` | ✅ 一致      | ✅   | -        |
| 健康检查   | `GET /health`                        | ✅ 一致      | ✅   | -        |
| 系统设置   | `GET/PUT /api/v4/admin/settings/*`   | ✅ 一致      | ✅   | -        |
| 清理缓存   | `POST /api/v4/admin/cache/clear`     | ✅ 一致      | ✅   | -        |

---

## 7. 迁移步骤与验收

### 7.1 迁移总体规划

```
阶段 0：准备工作（1-2 天）
  ├─ 盘点所有页面的 API 调用
  ├─ 对照后端路由，标记不一致的接口
  └─ 确定优先级（P0 > P1 > P2）

阶段 1：核心层实现（2-3 天）
  ├─ 实现 httpClient.js
  ├─ 实现 authStore.js（含 token 刷新）
  ├─ 实现 interceptors.js
  ├─ 实现 errorHandler.js
  └─ 单元测试（token 刷新、拦截器）

阶段 2：API 模块迁移（3-5 天）
  ├─ 按业务域拆分 apis/*.js
  │   ├─ auth.js
  │   ├─ adminMarketplace.js
  │   ├─ adminMaterial.js
  │   ├─ adminUser.js
  │   └─ ...
  └─ 对齐后端真实路由

阶段 3：页面逐个迁移（5-10 天）
  ├─ 优先级 P0（兑换市场、登录、权限）
  ├─ 优先级 P1（材料管理、用户管理）
  └─ 优先级 P2（其他管理页面）

阶段 4：删除旧方案（1 天）
  ├─ 删除 admin-common.js
  ├─ 删除 api-config.js
  └─ 添加硬约束（CI 检查）

阶段 5：验收与上线（2-3 天）
  ├─ 功能回归测试
  ├─ 性能测试（token 刷新、并发请求）
  └─ 生产环境灰度发布
```

### 7.2 详细迁移步骤

#### Step 1：创建核心层文件结构

```bash
# 在 public/admin/js/ 下创建新结构
mkdir -p public/admin/js/core
mkdir -p public/admin/js/apis
mkdir -p public/admin/js/pages

# 核心层
touch public/admin/js/core/httpClient.js
touch public/admin/js/core/authStore.js
touch public/admin/js/core/interceptors.js
touch public/admin/js/core/errorHandler.js

# API 模块层
touch public/admin/js/apis/auth.js
touch public/admin/js/apis/adminMarketplace.js
touch public/admin/js/apis/adminMaterial.js
touch public/admin/js/apis/adminUser.js
touch public/admin/js/apis/adminSystem.js

# 页面层（示例）
touch public/admin/js/pages/login.js
touch public/admin/js/pages/dashboard.js
touch public/admin/js/pages/exchange-market-items.js
```

#### Step 2：实现核心层（参考第 3.3 节代码）

将本文档第 3.3 节的代码复制到对应文件，并根据实际情况调整。

#### Step 3：迁移第一个页面（登录页）

**修改前（login.html）**：

```html
<script>
  document.getElementById('loginForm').addEventListener('submit', async function (e) {
    e.preventDefault()
    const phone = document.getElementById('phone').value
    const code = document.getElementById('code').value

    const response = await fetch('/api/v4/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mobile: phone, verification_code: code })
    })

    const result = await response.json()

    if (result.success && result.data) {
      localStorage.setItem('admin_token', result.data.access_token)
      localStorage.setItem('admin_user', JSON.stringify(result.data.user))
      window.location.href = '/admin/dashboard.html'
    } else {
      alert('登录失败: ' + result.message)
    }
  })
</script>
```

**修改后（login.html + pages/login.js）**：

```html
<!-- login.html -->
<script src="/admin/js/core/httpClient.js"></script>
<script src="/admin/js/core/authStore.js"></script>
<script src="/admin/js/core/errorHandler.js"></script>
<script src="/admin/js/apis/auth.js"></script>
<script src="/admin/js/pages/login.js"></script>
```

```javascript
// pages/login.js
document.getElementById('loginForm').addEventListener('submit', async function (e) {
  e.preventDefault()

  const mobile = document.getElementById('phone').value
  const code = document.getElementById('code').value

  try {
    // 调用统一 API（不再直接 fetch）
    const result = await authAPI.login(mobile, code)

    if (result.success && result.data) {
      const { access_token, refresh_token, user } = result.data

      // 检查管理员权限
      if (!user.roles || !user.roles.some(r => r.role_name === 'admin' || r.role_level >= 100)) {
        errorHandler.handle({
          httpStatus: 403,
          message: '此账号没有管理员权限'
        })
        return
      }

      // 保存到 authStore（统一存储）
      authStore.setLoginInfo(access_token, refresh_token, user)

      // 提示并跳转
      errorHandler.showSuccess('登录成功')
      setTimeout(() => {
        window.location.href = '/admin/dashboard.html'
      }, 1000)
    } else {
      errorHandler.handle(result, '登录')
    }
  } catch (error) {
    console.error('登录异常:', error)
    errorHandler.handle(
      {
        httpStatus: 500,
        message: '登录失败，请稍后重试'
      },
      '登录'
    )
  }
})
```

#### Step 4：修复兑换市场接口路径（高优先级）

**修改前（exchange-market-items.html）**：

```javascript
// 创建商品
const response = await fetch('/api/v4/admin/exchange_market/items', {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify(data)
})
```

**修改后**：

```javascript
// 调用统一 API
const result = await adminMarketplaceAPI.createExchangeItem(data)

if (result.success) {
  errorHandler.showSuccess('添加成功')
  loadItems() // 刷新列表
} else {
  errorHandler.handle(result, '添加商品')
}
```

#### Step 5：批量迁移其他页面

**迁移模板**（每个页面都遵循）：

```javascript
// 1. 删除内联 <script>，移到 pages/<page-name>.js
// 2. 引入依赖（核心层 + API 模块层）
// 3. 替换所有 fetch/apiRequest 为 apis/* 调用
// 4. 统一错误处理（使用 errorHandler）
// 5. 添加页面权限守卫（initAdminPage）
```

#### Step 6：删除旧方案

```bash
# 备份旧文件（以防万一）
mv public/admin/js/admin-common.js public/admin/js/admin-common.js.bak
mv public/admin/js/api-config.js public/admin/js/api-config.js.bak

# 检查是否还有页面在引用（应该为空）
grep -r "admin-common.js" public/admin/*.html
grep -r "api-config.js" public/admin/*.html

# 确认无引用后，删除备份
rm public/admin/js/*.bak
```

#### Step 7：添加硬约束（防止回退）

```bash
# scripts/check-api-usage.sh
#!/bin/bash
echo "🔍 检查前端 API 调用规范..."

# 禁止页面直接调用 fetch('/api/v4
if grep -r "fetch\s*\(\s*['\"]\/api\/v4" public/admin/*.html; then
  echo "❌ 发现页面直接调用 fetch('/api/v4')，必须使用 apis/* 模块"
  exit 1
fi

# 禁止页面引用旧 API 封装
if grep -r "admin-common.js\|api-config.js" public/admin/*.html; then
  echo "❌ 发现页面引用旧 API 封装，必须使用新核心层"
  exit 1
fi

echo "✅ API 调用规范检查通过"
```

```json
// package.json
{
  "scripts": {
    "lint:api": "bash scripts/check-api-usage.sh",
    "prestart": "npm run lint:api"
  }
}
```

### 7.3 验收标准

#### 功能验收

- [ ] 所有管理端页面可正常访问（无 404/500）
- [ ] 登录功能正常（支持管理员权限验证）
- [ ] Token 自动刷新生效（401 自动续期，用户无感知）
- [ ] 权限校验闭环（后端变更权限，前端立即生效）
- [ ] 所有 API 调用走统一 httpClient（无直接 fetch）
- [ ] 错误提示统一（无 alert，全部使用 errorHandler）

#### 性能验收

- [ ] 首屏加载时间 < 2 秒
- [ ] API 请求平均响应时间 < 500ms
- [ ] Token 刷新不阻塞业务（并发请求单飞刷新）
- [ ] 无重复 API 调用（network 面板检查）

#### 安全验收

- [ ] Token 存储策略落地（sessionStorage 或 localStorage + CSP）
- [ ] 无内联脚本（或极少，准备迁移到 CSP）
- [ ] 所有管理员接口路径正确（无越权调用用户端接口）
- [ ] 退出登录清理所有 token

#### 可维护性验收

- [ ] 代码结构清晰（核心层、API 层、页面层分离）
- [ ] 新增页面有模板可参考（pages/template.js）
- [ ] 新增 API 模块有规范文档
- [ ] CI 检查阻断不规范写法

---

## 8. 行业对比与最佳实践

### 8.1 大公司常见方案（美团/腾讯/阿里）

#### 架构特点

```
前端应用（React/Vue）
      ↓
BFF 层（Node.js/Java）
  ├─ 接口聚合
  ├─ 鉴权（SSO/OAuth）
  ├─ 限流/熔断
  └─ 日志/监控
      ↓
微服务集群
  ├─ 用户服务
  ├─ 订单服务
  ├─ 支付服务
  └─ ...
```

#### 鉴权方案

- **SSO 单点登录**（统一认证中心）
- **HttpOnly Cookie**（前端拿不到 token，XSS 防御）
- **OAuth 2.0**（第三方应用授权）
- **网关统一鉴权**（微服务无状态）

#### API 规范

- **OpenAPI/Swagger**（接口契约自动生成）
- **自动生成 SDK**（Java/TypeScript/Go client）
- **统一错误码体系**（10000+错误码，文档化）
- **灰度发布**（按版本/用户分流）

#### 适用场景

- ✅ 多人协作（10+ 前端工程师）
- ✅ 多端应用（Web/App/小程序/H5）
- ✅ 长生命周期（3 年+持续迭代）
- ❌ 小团队成本过高
- ❌ 快速迭代不够灵活

### 8.2 小公司常见方案（初创/小团队）

#### 架构特点

```
前端应用（Vue/React 或静态页）
      ↓
单体后端（Express/Koa/Egg）
  ├─ RESTful API
  ├─ JWT 鉴权
  └─ 简单限流
      ↓
关系型数据库（MySQL/PostgreSQL）
```

#### 鉴权方案

- **JWT + localStorage**（简单高效）
- **Refresh Token**（延长有效期）
- **中间件鉴权**（Express/Koa middleware）

#### API 规范

- **手写文档**（Markdown/Postman）
- **统一响应格式**（success/code/message/data）
- **手写 API Client**（httpClient + apis/\*）

#### 适用场景

- ✅ 小团队（1-3 前端工程师）
- ✅ 快速迭代（2 周一版本）
- ✅ 成本敏感（人力/服务器有限）
- ✅ **本项目最适合此方案**

### 8.3 游戏/虚拟物品交易/二手平台

#### 管理后台特点

- **强 RBAC**（角色权限精细化）
- **操作审计**（所有敏感操作记录）
- **风控提示**（异常操作二次确认）
- **短 session**（15 分钟无操作自动登出）
- **权限即时生效**（后台改权限，前端立即失效）

#### 技术实现

- **权限中心化**（后端统一权限服务）
- **Token 短期化**（access_token 15 分钟，强制刷新）
- **WebSocket 推送**（权限变更实时通知前端）
- **操作日志**（每次 API 调用记录 user_id/action/timestamp）

#### 本项目可直接吸收的点

- ✅ **权限权威校验**（每次页面加载验证权限）
- ✅ **Token 刷新闭环**（自动续期 + 失败登出）
- ✅ **操作审计**（后端已有 AuditLog，前端对齐）
- ✅ **敏感操作二次确认**（如删除用户、清空数据）

### 8.4 本项目最佳实践总结

#### 技术选型（已定）

- ✅ **静态 HTML + 原生 JS**（不引入 React/Vue）
- ✅ **同源部署**（前端 + 后端同一 Devbox，无需 CORS）
- ✅ **JWT + Refresh Token**（后端已实现）

#### 核心优化方向

1. **统一 API Client**（httpClient + apis/\*）
2. **Token 自动刷新**（authStore + interceptors）
3. **权限权威校验**（页面加载调用后端 API）
4. **错误处理统一**（errorHandler + toast）
5. **内联脚本外置化**（为 CSP 做准备）

#### 与大厂/小厂的平衡

- **吸收大厂治理思想**：统一入口、强约束、自动化检查
- **采用小厂落地形态**：不引入过度设计，快速迭代
- **借鉴游戏行业经验**：权限中心化、操作审计、风控提示

---

## 附录 A：快速参考

### A.1 核心文件清单

```
public/admin/js/
├── core/                           # 核心层（不可绕过）
│   ├── httpClient.js               # HTTP 请求内核
│   ├── authStore.js                # Token 存储与刷新
│   ├── interceptors.js             # 请求/响应拦截器
│   └── errorHandler.js             # 统一错误处理
│
├── apis/                           # API 业务模块层
│   ├── auth.js                     # 认证相关
│   ├── adminMarketplace.js         # 兑换市场管理
│   ├── adminMaterial.js            # 材料资产管理
│   ├── adminUser.js                # 用户管理
│   ├── adminSystem.js              # 系统管理
│   └── ...
│
├── pages/                          # 页面脚本层
│   ├── login.js
│   ├── dashboard.js
│   ├── exchange-market-items.js
│   └── ...
│
└── utils/                          # 工具函数
    ├── dom-utils.js
    └── resource-config.js
```

### A.2 页面模板（标准引入方式）

```html
<!DOCTYPE html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <title>页面标题</title>
    <link
      href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css"
      rel="stylesheet"
    />
    <link href="/admin/css/common.css" rel="stylesheet" />
  </head>
  <body>
    <!-- 页面内容 -->

    <!-- Bootstrap JS -->
    <script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/js/bootstrap.bundle.min.js"></script>

    <!-- 核心层（必需） -->
    <script src="/admin/js/core/httpClient.js"></script>
    <script src="/admin/js/core/authStore.js"></script>
    <script src="/admin/js/core/interceptors.js"></script>
    <script src="/admin/js/core/errorHandler.js"></script>

    <!-- API 模块层（按需引入） -->
    <script src="/admin/js/apis/auth.js"></script>
    <script src="/admin/js/apis/adminSystem.js"></script>

    <!-- 页面脚本（本页面独有逻辑） -->
    <script src="/admin/js/pages/dashboard.js"></script>
  </body>
</html>
```

### A.3 常见问题 FAQ

**Q1：为什么不用 axios？**
A：静态页面引入第三方库需要 CDN 或打包，增加复杂度。原生 fetch 已足够，通过 httpClient 封装可实现 axios 大部分功能。

**Q2：Token 存 sessionStorage 会不会影响用户体验？**
A：管理端更注重安全，关闭浏览器需重新登录是可接受的。如需持久化，可用 localStorage + CSP。

**Q3：如何验证 Token 刷新是否生效？**
A：

1. 登录后等待 15 分钟（假设 access_token 有效期 15 分钟）
2. 执行任意操作（如查询用户列表）
3. Network 面板应看到：401 → refresh 请求 → 原请求重试（新 token）

**Q4：迁移期间如何保证业务不中断？**
A：采用**渐进式迁移**：

- 新核心层与旧方案可共存（不冲突）
- 按页面逐个迁移，迁移完一个上线一个
- 保留旧文件 `.bak`，出问题可快速回滚

---

## 附录 B：工作量评估

| 阶段     | 工作项               | 预估工时     | 风险                         |
| -------- | -------------------- | ------------ | ---------------------------- |
| 阶段 0   | 盘点 API、对照路由   | 1-2 天       | ⭐ 低                        |
| 阶段 1   | 核心层实现           | 2-3 天       | ⭐⭐ 中（需测试 token 刷新） |
| 阶段 2   | API 模块拆分         | 3-5 天       | ⭐ 低（机械工作）            |
| 阶段 3   | 页面迁移（25+ 页面） | 5-10 天      | ⭐⭐⭐ 高（工作量大）        |
| 阶段 4   | 删除旧方案           | 1 天         | ⭐ 低                        |
| 阶段 5   | 验收与上线           | 2-3 天       | ⭐⭐ 中（回归测试）          |
| **总计** |                      | **14-24 天** |                              |

**优化建议**：

- 阶段 3 可并行（多人协作，每人负责 5-8 个页面）
- 优先迁移高风险页面（兑换市场、登录、权限）

---

## 附录 C：联系与维护

**文档维护人**：开发团队  
**文档版本**：v1.0.0  
**最后更新**：2025-12-22  
**下次审查**：2026-03-22（季度审查）

统计/积分流水以哪个表为准：是补齐 points_transactions（建表/迁移），还是后端改为查询现有表（如果库里用的是别的表名/结构）。 你查一下现有项目实际代码设数据库实际数据是不是用的是其他的

结论（回答你的问题）
当前数据库没有“其他名字的 points_transactions 表”可以给你对齐。
当前数据库实际使用的是资产流水/资产余额体系（asset_transactions + account_asset_balances），用 asset_code='POINTS' 表示积分。
因此“统计/积分流水以哪个表为准”的现实答案是：以 asset_transactions（流水）和 account_asset_balances（余额）为准；现在这套库里，points_transactions 这条线已经不成立。

---

**END**
