/**
 * API路径集中管理配置文件
 * 避免前端硬编码API路径，统一管理所有API端点
 *
 * 使用方式：
 * 1. 在HTML中引入此文件：<script src="js/api-config.js"></script>
 * 2. 使用API.xxx()方法调用接口，而不是直接写API路径
 *
 * 创建时间：2025年11月23日
 */

/**
 * API端点常量定义
 * 集中管理所有API路径，避免硬编码
 */
const API_ENDPOINTS = {
  // ===== 认证相关API =====
  AUTH: {
    LOGIN: '/api/v4/auth/login', // 登录
    REGISTER: '/api/v4/auth/register', // 注册
    LOGOUT: '/api/v4/auth/logout', // 登出
    VERIFY: '/api/v4/auth/verify', // 验证token
    REFRESH: '/api/v4/auth/refresh' // 刷新token
  },

  // ===== 预设管理API =====
  PRESET: {
    LIST: '/api/v4/lottery-preset/list', // 获取所有预设列表（管理员）
    CREATE: '/api/v4/lottery-preset/create', // 创建预设
    USER_LIST: '/api/v4/lottery-preset/user/:user_id', // 获取用户预设
    DELETE: '/api/v4/lottery-preset/user/:user_id', // 删除用户预设
    STATS: '/api/v4/lottery-preset/stats' // 获取统计信息
  },

  // ===== 奖品池管理API =====
  PRIZE: {
    LIST: '/api/v4/console/prize-pool/list', // 获取奖品列表
    BATCH_ADD: '/api/v4/console/prize-pool/batch-add', // 批量添加奖品
    UPDATE: '/api/v4/console/prize-pool/prize/:prize_id', // 更新奖品
    DELETE: '/api/v4/console/prize-pool/prize/:prize_id', // 删除奖品
    DETAIL: '/api/v4/console/prize-pool/prize/:prize_id', // 获取奖品详情
    ADD_STOCK: '/api/v4/console/prize-pool/prize/:prize_id/add-stock' // 增加库存
  },

  // ===== 用户管理API =====
  USER: {
    LIST: '/api/v4/console/user-management/users', // 获取用户列表
    DETAIL: '/api/v4/console/user-management/users/:user_id', // 获取用户详情
    UPDATE_ROLE: '/api/v4/console/user-management/users/:user_id/role', // 更新用户角色
    UPDATE_STATUS: '/api/v4/console/user-management/users/:user_id/status', // 更新用户状态
    DELETE: '/api/v4/console/user-management/users/:user_id' // 删除用户
  },

  // ===== 角色管理API =====
  ROLE: {
    LIST: '/api/v4/console/user-management/roles' // 获取角色列表
  },

  // ===== 抽奖管理API =====
  LOTTERY: {
    EXECUTE: '/api/v4/lottery/execute', // 执行抽奖
    HISTORY: '/api/v4/lottery/history', // 抽奖历史
    STRATEGIES: '/api/v4/lottery/strategies' // 获取抽奖策略列表
  },

  // ===== 权限管理API =====
  PERMISSION: {
    CHECK: '/api/v4/permissions/check', // 检查权限
    USER_PERMISSIONS: '/api/v4/permissions/user/:userId', // 获取用户权限
    MY_PERMISSIONS: '/api/v4/permissions/me', // 获取当前用户权限
    PROMOTE: '/api/v4/permissions/promote', // 提升用户权限
    CREATE_ADMIN: '/api/v4/permissions/create-admin' // 创建管理员
  },

  // ===== 系统管理API =====
  SYSTEM: {
    DASHBOARD: '/api/v4/console/system/dashboard', // 系统仪表板
    HEALTH: '/health', // 健康检查
    VERSION: '/api/v4' // 版本信息
  }
}

/**
 * API调用封装类
 * 提供统一的API调用方法，自动处理路径参数、查询参数等
 */
class API {
  /**
   * 构建API完整URL（处理路径参数）
   * @param {string} endpoint - API端点（可能包含路径参数，如 /user/:id）
   * @param {Object} pathParams - 路径参数对象
   * @returns {string} 完整URL
   *
   * @example
   * API.buildURL('/api/v4/users/:user_id', { user_id: 123 })
   * // 返回: '/api/v4/users/123'
   */
  static buildURL(endpoint, pathParams = {}) {
    let url = endpoint

    // 替换路径参数
    Object.entries(pathParams).forEach(([key, value]) => {
      url = url.replace(`:${key}`, value)
    })

    return url
  }

  /**
   * 构建查询字符串
   * @param {Object} queryParams - 查询参数对象
   * @returns {string} 查询字符串（如：?page=1&size=20）
   */
  static buildQueryString(queryParams = {}) {
    if (Object.keys(queryParams).length === 0) {
      return ''
    }

    const query = new URLSearchParams(queryParams).toString()
    return `?${query}`
  }

  /**
   * 统一API请求方法
   * @param {string} endpoint - API端点
   * @param {Object} options - 请求选项
   * @returns {Promise} API响应
   *
   * @example
   * const response = await API.request(API_ENDPOINTS.PRESET.LIST, {
   *   method: 'GET',
   *   queryParams: { page: 1, page_size: 20 }
   * });
   */
  static async request(endpoint, options = {}) {
    const { method = 'GET', pathParams = {}, queryParams = {}, body = null, headers = {} } = options

    try {
      // 构建完整URL
      let url = this.buildURL(endpoint, pathParams)

      // 添加查询参数
      url += this.buildQueryString(queryParams)

      // 准备请求配置
      const requestConfig = {
        method,
        headers: {
          'Content-Type': 'application/json',
          ...headers
        }
      }

      // 添加请求体
      if (body && method !== 'GET') {
        requestConfig.body = JSON.stringify(body)
      }

      // 发送请求（使用已有的apiRequest函数）
      if (typeof apiRequest === 'function') {
        return await apiRequest(url, requestConfig)
      } else {
        // 降级方案：使用fetch
        const response = await fetch(url, requestConfig)
        return await response.json()
      }
    } catch (error) {
      console.error(`❌ API请求失败: ${endpoint}`, error)
      throw error
    }
  }

  // ===== 预设管理API封装 =====

  /**
   * 获取预设列表
   * @param {Object} params - 查询参数
   * @param {string} params.status - 状态筛选（pending/used/all）
   * @param {number} params.page - 页码
   * @param {number} params.page_size - 每页数量
   * @returns {Promise} API响应
   */
  static async getPresetList(params = {}) {
    return await this.request(API_ENDPOINTS.PRESET.LIST, {
      queryParams: params
    })
  }

  /**
   * 获取用户预设
   * @param {number} userId - 用户ID
   * @param {Object} params - 查询参数
   * @returns {Promise} API响应
   */
  static async getUserPresets(userId, params = {}) {
    return await this.request(API_ENDPOINTS.PRESET.USER_LIST, {
      pathParams: { user_id: userId },
      queryParams: params
    })
  }

  /**
   * 创建预设
   * @param {Object} data - 预设数据
   * @returns {Promise} API响应
   */
  static async createPreset(data) {
    return await this.request(API_ENDPOINTS.PRESET.CREATE, {
      method: 'POST',
      body: data
    })
  }

  /**
   * 删除用户预设
   * @param {number} userId - 用户ID
   * @returns {Promise} API响应
   */
  static async deleteUserPresets(userId) {
    return await this.request(API_ENDPOINTS.PRESET.DELETE, {
      method: 'DELETE',
      pathParams: { user_id: userId }
    })
  }

  /**
   * 获取预设统计信息
   * @returns {Promise} API响应
   */
  static async getPresetStats() {
    return await this.request(API_ENDPOINTS.PRESET.STATS)
  }

  // ===== 认证相关API封装 =====

  /**
   * 用户登录
   * @param {string} mobile - 手机号
   * @param {string} verification_code - 验证码
   * @returns {Promise} API响应
   */
  static async login(mobile, verification_code) {
    return await this.request(API_ENDPOINTS.AUTH.LOGIN, {
      method: 'POST',
      body: { mobile, verification_code }
    })
  }

  /**
   * 用户登出
   * @returns {Promise} API响应
   */
  static async logout() {
    return await this.request(API_ENDPOINTS.AUTH.LOGOUT, {
      method: 'POST'
    })
  }

  /**
   * 验证token
   * @returns {Promise} API响应
   */
  static async verifyToken() {
    return await this.request(API_ENDPOINTS.AUTH.VERIFY)
  }

  // ===== 奖品管理API封装 =====

  /**
   * 获取奖品列表
   * @param {Object} params - 查询参数
   * @returns {Promise} API响应
   */
  static async getPrizeList(params = {}) {
    return await this.request(API_ENDPOINTS.PRIZE.LIST, {
      queryParams: params
    })
  }

  /**
   * 创建奖品
   * @param {Object} data - 奖品数据
   * @returns {Promise} API响应
   */
  static async createPrize(data) {
    return await this.request(API_ENDPOINTS.PRIZE.CREATE, {
      method: 'POST',
      body: data
    })
  }

  /**
   * 更新奖品
   * @param {number} prizeId - 奖品ID
   * @param {Object} data - 更新数据
   * @returns {Promise} API响应
   */
  static async updatePrize(prizeId, data) {
    return await this.request(API_ENDPOINTS.PRIZE.UPDATE, {
      method: 'PUT',
      pathParams: { prize_id: prizeId },
      body: data
    })
  }

  /**
   * 删除奖品
   * @param {number} prizeId - 奖品ID
   * @returns {Promise} API响应
   */
  static async deletePrize(prizeId) {
    return await this.request(API_ENDPOINTS.PRIZE.DELETE, {
      method: 'DELETE',
      pathParams: { prize_id: prizeId }
    })
  }

  // ===== 系统管理API封装 =====

  /**
   * 获取系统仪表板数据
   * @returns {Promise} API响应
   */
  static async getDashboard() {
    return await this.request(API_ENDPOINTS.SYSTEM.DASHBOARD)
  }

  /**
   * 健康检查
   * @returns {Promise} API响应
   */
  static async healthCheck() {
    return await this.request(API_ENDPOINTS.SYSTEM.HEALTH)
  }
}

// 暴露到全局作用域
if (typeof window !== 'undefined') {
  window.API_ENDPOINTS = API_ENDPOINTS
  window.API = API
  console.log('✅ API配置已加载')
}

// 支持模块化导出
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { API_ENDPOINTS, API }
}
