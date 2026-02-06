/**
 * 🔴 utils/api.js - V4.0 API工具类（完全符合V4.0实际验证版对接文档）
 *
 * 📋 文档依据: 《前后端API对接规范文档_V4.0_实际验证版.md》
 * 🎯 核心原则:
 *   1. API路径严格按照文档规范 - /api/v4/{module}/{action}
 *   2. 统一使用snake_case命名 - user_id, access_token, verification_code等
 *   3. JWT Token机制 - access_token + refresh_token双Token
 *   4. 不使用Mock数据 - 所有数据从后端真实API获取
 *   5. 统一错误处理 - 标准化错误响应格式
 *
 * 📋 命名规范说明
 *
 * 本项目采用混合命名策略：
 *
 * 1️⃣ 业务逻辑层（100% camelCase）
 *    - 变量名：userName, pointsBalance
 *    - 函数名：showToast, getUserInfo
 *
 * 2️⃣ API交互层（100% snake_case）
 *    - 请求参数：{ user_id, campaign_code }
 *    - 响应字段：{ user_id, created_at }
 *    - 与后端数据库字段保持一致
 *
 * 3️⃣ 工具类/类名（PascalCase）
 *    - Wechat, Utils, Validation
 *    - 符合 JavaScript 类命名约定
 *
 * 🔄 字段转换方式：
 *    const { user_id } = apiResponse       // API层：保持snake_case
 *    const userId = user_id                // 业务层：转换为camelCase
 *    或使用解构赋值：
 *    const { user_id: userId } = apiResponse
 *
 * @file 餐厅积分抽奖系统 - V4.0统一引擎API客户端
 * @version 4.0.0
 * @author Restaurant Lottery Team
 * @since 2025-10-04
 */

// 🔧 延迟获取app实例,避免模块加载时调用getApp()
let app = null
function getAppInstance() {
  if (!app && typeof getApp !== 'undefined') {
    try {
      app = getApp()
    } catch (error) {
      console.warn('⚠️ 无法获取App实例:', error)
    }
  }
  return app
}

const { getApiConfig, getDevelopmentConfig, getSecurityConfig } = require('../config/env.js')

// 🔧 导入工具函数（避免循环依赖）
const { validateJWTTokenIntegrity } = require('./util')
// 🔴 导入微信工具函数（方案1：复用wechat.js工具函数）
const wechatUtils = require('./wechat')

/**
 * 🔴 V4.0 API客户端类
 *
 * @class APIClient
 * @description
 * - 基于V4统一引擎架构
 * - 完整支持V4统一抽奖引擎
 * - 实现V4统一认证系统
 * - JWT Token自动管理和刷新
 * - 统一响应格式处理
 * - 完善的错误处理机制
 */
class APIClient {
  constructor() {
    this.config = getApiConfig()
    this.devConfig = getDevelopmentConfig()
    this.securityConfig = getSecurityConfig()

    // Token刷新状态
    this.isRefreshing = false
    this.refreshSubscribers = []

    console.log('🚀 V4.0 API Client初始化完成', {
      baseURL: this.config.fullUrl,
      apiVersion: 'v4.0',
      isDevelopment: this.devConfig.enableUnifiedAuth
    })
  }

  /**
   * 🔴 统一请求方法（V4.0增强版 - 集成自动loading和错误提示）
   *
   * @description
   * 基于文档《天工小程序重复代码优化方案_执行文档_V1.0.md》方案1
   * 集成utils/wechat.js的showLoading、hideLoading、showToast工具函数
   * 实现自动化loading显示和错误提示，减少960行重复代码
   *
   * @param {String} url - API相对路径（不包含/api/v4前缀）
   * @param {Object} options - 请求选项
   *
   * 原有参数（100%向后兼容）：
   * @param {String} options.method - HTTP方法（GET/POST/PUT/DELETE）
   * @param {Object} options.data - 请求数据
   * @param {Boolean} options.needAuth - 是否需要认证（默认true）
   * @param {Number} options.timeout - 超时时间（默认15000ms）
   *
   * 新增参数（方案1增强功能）：
   * @param {Boolean} options.showLoading - 是否自动显示loading（默认true）
   * @param {String} options.loadingText - loading文案（默认"加载中..."）
   * @param {Boolean} options.showError - 是否自动显示错误toast（默认true）
   * @param {String} options.errorPrefix - 错误提示前缀（默认空）
   *
   * @returns {Promise} 响应数据
   *
   * @example
   * // 标准调用（自动loading + 自动错误提示）
   * const result = await API.getLotteryConfig()
   *
   * // 静默调用（无loading，无错误提示）
   * const result = await apiClient.request('/points/balance', {
   *   showLoading: false,
   *   showError: false
   * })
   *
   * // 自定义loading文案
   * const result = await apiClient.request('/exchange/products', {
   *   loadingText: '正在加载商品...'
   * })
   */
  async request(url, options = {}) {
    const {
      // 原有参数
      method = 'GET',
      data = {},
      needAuth = true,
      timeout = 15000,
      // 新增参数（方案1）
      showLoading = true,
      loadingText = '加载中...',
      showError = true,
      errorPrefix = ''
    } = options

    // 🔴 构建完整URL - 严格按照V4.0文档规范
    const fullUrl = `${this.config.fullUrl}${url}`

    console.log('\n🚀=================== V4.0 API请求 ===================')
    console.log(`📤 ${method} ${fullUrl}`)
    console.log('📋 请求数据:', data)

    // 构建请求头
    const headers = {
      'Content-Type': 'application/json'
    }

    // 🔴 认证处理 - JWT Token
    if (needAuth) {
      const token = wx.getStorageSync('access_token')
      if (token) {
        // Token完整性验证
        const integrityCheck = validateJWTTokenIntegrity(token)
        if (!integrityCheck.isValid) {
          console.error('🚨 Token完整性检查失败:', integrityCheck.error)
          return this.handleTokenInvalid()
        }

        headers.Authorization = `Bearer ${token}`
      } else if (needAuth) {
        console.error('❌ 未找到access_token')
        return this.handleTokenMissing()
      }
    }

    // 🆕 步骤1：自动显示loading（方案1新增）
    // 💡 复用utils/wechat.js的showLoading工具函数
    if (showLoading) {
      wechatUtils.showLoading(loadingText)
    }

    const startTime = Date.now()

    try {
      const response = await new Promise((resolve, reject) => {
        wx.request({
          url: fullUrl,
          method,
          data,
          header: headers,
          timeout,
          success: resolve,
          fail: reject
        })
      })

      const duration = Date.now() - startTime
      console.log(`✅ API请求成功，耗时: ${duration}ms`)
      console.log('📦 响应数据:', response.data)
      console.log('=======================================================\n')

      // 🔴 处理响应
      return this.handleResponse(response)
    } catch (error) {
      const duration = Date.now() - startTime
      console.error(`❌ API请求失败，耗时: ${duration}ms`, error)
      console.log('=======================================================\n')

      // 🆕 步骤2：自动显示错误toast（方案1新增）
      // 💡 复用utils/wechat.js的showToast工具函数
      if (showError) {
        const errorMessage = errorPrefix
          ? `${errorPrefix}${error.message || '请求失败'}`
          : error.message || '网络请求失败'

        wechatUtils.showToast(errorMessage, 'none', 2000)
      }

      throw this.handleError(error)
    } finally {
      // 🆕 步骤3：自动隐藏loading（方案1新增）
      // 💡 复用utils/wechat.js的hideLoading工具函数
      if (showLoading) {
        wechatUtils.hideLoading()
      }
    }
  }

  /**
   * 🔴 处理响应数据 - V4.0统一响应格式
   *
   * @param {object} response - 微信请求响应
   * @returns {Object} 处理后的数据
   */
  handleResponse(response) {
    const { statusCode, data } = response

    // 🔴 401认证失败 - Token过期或无效
    if (statusCode === 401) {
      console.error('🔒 认证失败(401)，Token可能已过期')

      // 检查错误类型
      if (data && data.error === 'TOKEN_EXPIRED') {
        console.log('🔄 Token已过期，尝试自动刷新')
        return this.handleTokenExpired()
      }

      // 其他认证错误
      return this.handleTokenInvalid()
    }

    // 🔴 403权限不足
    if (statusCode === 403) {
      console.error('🚫 权限不足(403)')
      throw new Error(data.message || '权限不足')
    }

    // 🔴 404资源不存在
    if (statusCode === 404) {
      console.error('❌ 资源不存在(404)')
      throw new Error(data.message || '请求的资源不存在')
    }

    // 🔴 500服务器错误
    if (statusCode === 500) {
      console.error('🚨 服务器错误(500)')
      throw new Error(data.message || '服务器内部错误')
    }

    // 🔴 V4.0统一响应格式检查
    if (statusCode === 200 || statusCode === 201) {
      // 标准成功响应格式: { success: true, data: {...}, message: "..." }
      // 返回完整响应对象
      if (data && typeof data === 'object') {
        if (data.success === true) {
          return data
        } else if (data.success === false) {
          // 业务逻辑失败
          throw new Error(data.message || '操作失败')
        } else {
          // 非标准格式响应，应由后端修复
          throw new Error('API响应格式错误：缺少success字段')
        }
      }

      return data
    }

    // 其他状态码
    throw new Error(`HTTP ${statusCode}: ${data.message || '请求失败'}`)
  }

  /**
   * 🔴 处理错误
   */
  handleError(error) {
    if (error.errMsg) {
      // 微信请求错误
      if (error.errMsg.includes('timeout')) {
        return new Error('请求超时，请检查网络连接')
      } else if (error.errMsg.includes('fail')) {
        return new Error('网络请求失败，请检查网络连接')
      }
    }

    return error
  }

  /**
   * 🔴 处理Token缺失
   */
  handleTokenMissing() {
    wx.showModal({
      title: '未登录',
      content: '请先登录后再进行操作',
      showCancel: false,
      success: () => {
        wx.redirectTo({
          url: '/pages/auth/auth'
        })
      }
    })

    throw new Error('未登录')
  }

  /**
   * 🔴 处理Token无效
   */
  handleTokenInvalid() {
    const appInstance = getAppInstance()
    if (appInstance) {
      appInstance.clearAuthData()
    }

    wx.showModal({
      title: 'Token无效',
      content: '登录状态已失效，请重新登录',
      showCancel: false,
      success: () => {
        wx.redirectTo({
          url: '/pages/auth/auth'
        })
      }
    })

    throw new Error('Token无效')
  }

  /**
   * 🔴 处理Token过期 - 自动刷新机制
   */
  async handleTokenExpired() {
    // 防止并发刷新
    if (this.isRefreshing) {
      return new Promise(resolve => {
        this.refreshSubscribers.push(resolve)
      })
    }

    this.isRefreshing = true

    try {
      const refreshToken = wx.getStorageSync('refresh_token')
      if (!refreshToken) {
        throw new Error('未找到refresh_token')
      }

      console.log('🔄 开始刷新Token...')

      // 调用刷新Token API（V4.0文档Line 815-868）
      // 刷新接口不需要access_token
      const response = await this.request('/auth/refresh', {
        method: 'POST',
        data: {
          refresh_token: refreshToken
        },
        needAuth: false
      })

      if (response.success && response.data) {
        const { access_token, refresh_token: new_refresh_token } = response.data

        // 更新Token
        wx.setStorageSync('access_token', access_token)
        wx.setStorageSync('refresh_token', new_refresh_token)

        // 更新全局状态
        const appInstance = getAppInstance()
        if (appInstance) {
          appInstance.setAccessToken(access_token)
        }

        console.log('✅ Token刷新成功')

        // 通知所有等待的请求
        this.refreshSubscribers.forEach(callback => callback(access_token))
        this.refreshSubscribers = []

        return response
      } else {
        throw new Error('Token刷新失败')
      }
    } catch (error) {
      console.error('❌ Token刷新失败:', error)
      this.handleTokenInvalid()
      throw error
    } finally {
      this.isRefreshing = false
    }
  }
}

// ============================================================================
// 🔴 V4.0 API方法集合 - 严格按照文档规范
// ============================================================================

// 创建全局API客户端实例
const apiClient = new APIClient()

/**
 * ==================== 🔐 认证系统API ====================
 * 文档位置: V4.0文档 Line 660-943
 */

/**
 * 🔴 用户登录 - V4.0统一认证系统
 *
 * @param {string} mobile - 手机号
 * @param {String} verification_code - 验证码（开发环境：123456万能码）
 * @returns {Promise} { success, data: { access_token, refresh_token, user, expires_in } }
 *
 * 文档位置: Line 663-762
 */
async function userLogin(mobile, verification_code) {
  return apiClient.request('/auth/login', {
    method: 'POST',
    data: {
      mobile,
      verification_code
    },
    needAuth: false
  })
}

/**
 * ==================== 🎫 消费积分二维码系统API ====================
 * 文档位置: 《身份证二维码功能-前后端对接文档.md》
 * 模块说明: 消费积分身份验证和二维码管理
 */

/**
 * 🔴 生成用户身份二维码
 *
 * @description
 * 为用户生成固定身份二维码，用于商家扫码录入消费。
 *
 * 核心特性：
 * - 固定身份码：每个用户的二维码永久有效，可打印使用
 * - 防伪签名：使用HMAC-SHA256签名，后端生成，前端不可伪造
 * - 二维码格式：QR_{user_id}_{64位十六进制签名}
 * - 权限控制：用户本人或管理员可生成
 *
 * @param {number} user_id - 用户ID（必填）
 * @returns {Promise<object>} 返回二维码信息
 * @returns {boolean} returns.success - 请求是否成功
 * @returns {String} returns.message - 响应消息
 * @returns {Object} returns.data - 二维码数据
 * @returns {String} returns.data.qr_code - 完整二维码字符串（用于渲染二维码图片）
 * @returns {Number} returns.data.user_id - 用户ID
 * @returns {String} returns.data.generated_at - 生成时间（北京时间）
 * @returns {String} returns.data.validity - 有效期："permanent"表示永久有效
 * @returns {String} returns.data.note - 使用说明文字
 * @returns {String} returns.data.usage - 用途说明文字
 *
 * @throws {Error} 401 - Token无效或过期，需要重新登录
 * @throws {Error} 403 - 权限不足，普通用户只能生成自己的二维码
 * @throws {Error} 404 - 用户不存在
 * @throws {Error} 500 - 服务器错误，二维码生成失败
 *
 * @example
 * // 用户端：生成自己的二维码
 * const userId = app.globalData.userInfo.user_id
 * const result = await API.getUserQRCode(userId)
 *
 * if (result.success) {
 *   console.log('二维码字符串:', result.data.qr_code)
 *   console.log('使用说明:', result.data.note)
 *   // 使用qr_code字符串渲染二维码图片
 *   this.renderQRCode(result.data.qr_code)
 * }
 *
 * @example
 * // 管理员：生成任意用户的二维码
 * const result = await API.getUserQRCode(123) // 管理员可以生成任意用户的二维码
 *
 * 文档位置: 《身份证二维码功能-前后端对接文档.md》Line 185-303
 * 后端路由: routes/v4/unified-engine/consumption.js:372
 * 后端工具: utils/QRCodeValidator.js:337 (generateQRCodeInfo方法)
 */
async function getUserQRCode(user_id) {
  // 参数验证
  if (!user_id) {
    throw new Error('用户ID不能为空')
  }

  if (!Number.isInteger(user_id) || user_id <= 0) {
    throw new Error('用户ID必须是正整数')
  }

  // 🔴 V4.0统一路径：按照文档规范
  // 完整路径：/api/v4/consumption/qrcode/:user_id
  return apiClient.request(`/consumption/qrcode/${user_id}`, {
    method: 'GET',
    needAuth: true,
    showLoading: true,
    loadingText: '生成二维码中...',
    showError: true,
    errorPrefix: '二维码生成失败：'
  })
}

/**
 * 🆕 获取用户最近审核记录数量
 *
 * @description
 * 轻量级接口，仅返回记录数量，用于徽章显示
 * 
 * @returns {Promise<object>}
 * @returns {boolean} .success - 是否成功
 * @returns {object} .data - 数据对象
 * @returns {Number} .data.count - 审核记录总数
 * @returns {Number} .data.pending - 待审核数量
 * @returns {Number} .data.approved - 已通过数量
 * @returns {Number} .data.rejected - 已拒绝数量
 * 
 * @example
 * // 获取审核记录数量
 * const result = await API.getMyRecentAuditsCount()
 * console.log('审核记录数量:', result.data.count)
 * console.log('待审核:', result.data.pending)
 */
async function getMyRecentAuditsCount() {
  return apiClient.request('/consumption/my-recent-audits/count', {
    method: 'GET',
    needAuth: true,
    showLoading: false, // 静默加载，不显示loading
    showError: false // 静默失败，不影响主功能
  })
}

/**
 * 🆕 获取用户最近5笔积分审核记录
 *
 * @description
 * 获取当前用户最近5笔消费积分审核记录详情，包含：
 * - 消费金额
 * - 预计奖励积分
 * - 审核状态（pending/approved/rejected）
 * - 商家备注
 * - 商家信息
 * - 提交时间
 *
 * @returns {Promise<object>}
 * @returns {Boolean} .success - 是否成功
 * @returns {Array} .data - 审核记录列表
 * @returns {Number} .data[].id - 记录ID
 * @returns {String} .data[].consumption_amount - 消费金额
 * @returns {Number} .data[].points_to_award - 预计奖励积分
 * @returns {String} .data[].status - 审核状态：pending/approved/rejected
 * @returns {String} .data[].merchant_notes - 商家备注
 * @returns {String} .data[].created_at - 创建时间（ISO 8601格式）
 * @returns {Object} .data[].merchant_info - 商家信息
 * @returns {String} .data[].merchant_info.name - 商家名称
 * @returns {String} .data[].merchant_info.store_id - 商家门店ID
 * @returns {String | null} .data[].rejection_reason - 拒绝原因（仅rejected状态有值）
 *
 * @example
 * // 获取审核记录列表
 * const result = await API.getMyRecentAudits()
 * if (result.success) {
 *   console.log('记录数量:', result.data.length)
 *   result.data.forEach(record => {
 *     console.log(`记录#${record.id}: ¥${record.consumption_amount} -> ${record.points_to_award}积分 [${record.status}]`)
 *   })
 * }
 */
async function getMyRecentAudits() {
  return apiClient.request('/consumption/my-recent-audits', {
    method: 'GET',
    needAuth: true,
    showLoading: false, // 由页面自己控制loading
    showError: false // 由页面自己控制错误提示
  })
}

/**
 * 🔴 根据二维码获取用户信息（新增API - 待后端实现）
 *
 * @description
 * 商家扫描用户二维码后，根据二维码字符串获取用户信息。
 * 用于在消费录入页面自动显示用户昵称和完整手机号码。
 *
 * 核心特性：
 * - 二维码验证：后端使用HMAC-SHA256验证签名
 * - 完整手机号：返回完整的11位手机号码（不脱敏）
 * - 用户昵称：返回用户设置的昵称
 *
 * @param {string} qr_code - 用户二维码（必填，格式：QR_{user_id}_{signature}）
 * @returns {Promise<object>} 返回用户信息
 * @returns {boolean} returns.success - 请求是否成功
 * @returns {string} returns.message - 响应消息
 * @returns {object} returns.data - 用户数据
 * @returns {Number} returns.data.user_id - 用户ID
 * @returns {String} returns.data.nickname - 用户昵称
 * @returns {String} returns.data.mobile - 完整手机号码（11位，不脱敏）
 *
 * @throws {Error} 400 - 参数错误（二维码格式错误）
 * @throws {Error} 401 - 签名验证失败（二维码无效）
 * @throws {Error} 404 - 用户不存在
 * @throws {Error} 500 - 服务器错误
 *
 * @example
 * // 获取用户信息
 * const result = await API.getUserInfoByQRCode('QR_123_a1b2c3d4e5f6...')
 *
 * if (result.success) {
 *   console.log('用户昵称:', result.data.nickname)
 *   console.log('手机号码:', result.data.mobile)
 * }
 *
 * ⚠️ 后端接口：GET /api/v4/consumption/user-info?qr_code=xxx
 * ✅ API已在文档中完整定义（含实现方案）
 * 📋 文档位置：《管理员扫码审核功能技术方案-重构版.md》Line 323-423
 * 📝 包含：API规范、请求参数、响应格式、后端实现建议代码
 */
async function getUserInfoByQRCode(qr_code) {
  // 参数验证
  if (!qr_code) {
    throw new Error('二维码不能为空')
  }

  if (!qr_code.startsWith('QR_')) {
    throw new Error('二维码格式错误')
  }

  // 🔴 调用后端API（按文档Line 323-423实现）
  return apiClient.request(`/consumption/user-info?qr_code=${encodeURIComponent(qr_code)}`, {
    method: 'GET',
    needAuth: true,
    showLoading: true,
    loadingText: '获取用户信息中...',
    showError: true,
    errorPrefix: '获取用户信息失败：'
  })
}

/**
 * 🔴 商家提交消费记录
 *
 * @description
 * 商家扫描用户二维码后，录入消费金额和备注，提交消费记录。
 * 后端会验证二维码、计算积分、创建待审核记录。
 *
 * 核心特性：
 * - 二维码验证：后端使用HMAC-SHA256验证签名
 * - 积分计算：1元=1分，四舍五入（Math.round）
 * - 防重复提交：3分钟内相同用户+商家+二维码不能重复提交
 * - 状态管理：创建status='pending'的待审核记录
 *
 * @param {object} params - 请求参数对象
 * @param {string} params.qr_code - 用户二维码（必填，格式：QR_{user_id}_{signature}）
 * @param {Number} params.consumption_amount - 消费金额（必填，单位：元，范围：0.01-99999.99）
 * @param {String} [params.merchant_notes] - 商家备注（可选，如"消费2份套餐"）
 * @returns {Promise<Object>} 返回消费记录信息
 * @returns {Boolean} returns.success - 请求是否成功
 * @returns {String} returns.message - 响应消息
 * @returns {Object} returns.data - 消费记录数据
 * @returns {Number} returns.data.record_id - 消费记录ID（主键）
 * @returns {Number} returns.data.user_id - 用户ID（消费者）
 * @returns {Number} returns.data.consumption_amount - 消费金额（元）
 * @returns {Number} returns.data.points_to_award - 预计奖励积分（分）
 * @returns {String} returns.data.status - 记录状态（pending=待审核）
 * @returns {String} returns.data.status_name - 状态中文名称
 * @returns {String} returns.data.created_at - 创建时间（北京时间）
 *
 * @throws {Error} 400 - 参数错误（二维码为空、金额无效等）
 * @throws {Error} 401 - Token无效或过期
 * @throws {Error} 403 - 权限不足（非商家/管理员）
 * @throws {Error} 500 - 服务器错误
 *
 * @example
 * // 提交消费记录
 * const result = await API.submitConsumption({
 *   qr_code: 'QR_123_a1b2c3d4e5f6...',
 *   consumption_amount: 88.50,
 *   merchant_notes: '消费2份套餐'
 * })
 *
 * if (result.success) {
 *   console.log('提交成功，预计积分:', result.data.points_to_award)
 * }
 *
 * 后端接口：POST /api/v4/consumption/submit
 * 后端路由：routes/v4/consumption.js:58
 * 文档位置：《管理员扫码审核功能技术方案-重构版.md》Line 245-322
 */
async function submitConsumption(params) {
  // 参数验证
  if (!params || typeof params !== 'object') {
    throw new Error('参数格式错误')
  }

  if (!params.qr_code) {
    throw new Error('二维码不能为空')
  }

  if (!params.consumption_amount || params.consumption_amount <= 0) {
    throw new Error('消费金额必须大于0')
  }

  if (params.consumption_amount > 99999.99) {
    throw new Error('消费金额不能超过99999.99元')
  }

  // 🔴 V4.0统一路径：按照文档规范
  return apiClient.request('/consumption/submit', {
    method: 'POST',
    data: {
      qr_code: params.qr_code,
      consumption_amount: parseFloat(params.consumption_amount),
      merchant_notes: params.merchant_notes || undefined
    },
    needAuth: true,
    showLoading: true,
    loadingText: '提交中...',
    showError: true,
    errorPrefix: '提交失败：'
  })
}

/**
 * 🔴 获取待审核消费记录列表（管理员）
 *
 * @description
 * 管理员查看所有待审核的消费记录，用于审核通过或拒绝。
 * 返回记录包含用户信息、商家信息、消费金额、预计积分等。
 *
 * 核心特性：
 * - 权限控制：仅管理员可调用
 * - 分页查询：支持page和page_size参数
 * - 关联查询：自动关联用户和商家信息
 * - 时间显示：北京时间（GMT+8），格式化为中文友好格式
 *
 * @param {object} [params={}] - 查询参数对象
 * @param {number} [params.page=1] - 页码（默认1）
 * @param {number} [params.page_size=20] - 每页数量（默认20，最大100）
 * @returns {Promise<object>} 返回待审核记录列表
 * @returns {boolean} returns.success - 请求是否成功
 * @returns {string} returns.message - 响应消息
 * @returns {object} returns.data - 响应数据
 * @returns {Array} returns.data.records - 消费记录数组
 * @returns {object} returns.data.pagination - 分页信息
 * @returns {number} returns.data.pagination.total - 总记录数
 * @returns {number} returns.data.pagination.page - 当前页码
 * @returns {number} returns.data.pagination.page_size - 每页数量
 * @returns {Number} returns.data.pagination.total_pages - 总页数
 *
 * @throws {Error} 401 - Token无效或过期
 * @throws {Error} 403 - 权限不足（非管理员）
 * @throws {Error} 500 - 服务器错误
 *
 * @example
 * // 获取第1页待审核记录
 * const result = await API.getPendingConsumption({
 *   page: 1,
 *   page_size: 20
 * })
 *
 * if (result.success) {
 *   console.log('待审核记录:', result.data.records)
 *   console.log('总记录数:', result.data.pagination.total)
 * }
 *
 * 后端接口：GET /api/v4/consumption/pending
 * 后端路由：routes/v4/consumption.js:213
 * 文档位置：《管理员扫码审核功能技术方案-重构版.md》Line 364-455
 */
async function getPendingConsumption(params = {}) {
  const { page = 1, page_size = 20 } = params

  // 🔴 V4.0统一路径：按照文档规范
  return apiClient.request(`/consumption/pending?page=${page}&page_size=${page_size}`, {
    method: 'GET',
    needAuth: true,
    showLoading: true,
    loadingText: '加载中...',
    showError: true
  })
}

/**
 * 🔴 审核通过消费记录（管理员）
 *
 * @description
 * 管理员审核通过消费记录，后端自动发放积分给用户。
 * 使用数据库事务确保数据一致性（消费记录更新 + 积分发放）。
 *
 * 核心特性：
 * - 权限控制：仅管理员可调用
 * - 事务处理：使用Sequelize事务 + 行锁，确保数据一致性
 * - 积分发放：自动调用PointsService.addPoints()发放积分
 * - 状态更新：status='pending' → 'approved'
 * - 审核记录：记录审核员ID、审核时间、审核备注
 *
 * @param {number} record_id - 消费记录ID（必填）
 * @param {object} [params={}] - 请求参数对象
 * @param {string} [params.admin_notes] - 审核备注（可选，如"核实无误，审核通过"）
 * @returns {Promise<object>} 返回审核结果
 * @returns {boolean} returns.success - 请求是否成功
 * @returns {string} returns.message - 响应消息（如"审核通过，已奖励89积分"）
 * @returns {object} returns.data - 审核结果数据
 * @returns {number} returns.data.record_id - 消费记录ID
 * @returns {string} returns.data.status - 更新后的状态（approved）
 * @returns {number} returns.data.points_awarded - 实际奖励的积分
 * @returns {number} returns.data.new_balance - 用户新的积分余额
 * @returns {String} returns.data.reviewed_at - 审核时间（北京时间）
 *
 * @throws {Error} 400 - 参数错误或记录状态不正确
 * @throws {Error} 401 - Token无效或过期
 * @throws {Error} 403 - 权限不足（非管理员）
 * @throws {Error} 404 - 消费记录不存在
 * @throws {Error} 500 - 服务器错误
 *
 * @example
 * // 审核通过
 * const result = await API.approveConsumption(123, {
 *   admin_notes: '核实无误，审核通过'
 * })
 *
 * if (result.success) {
 *   console.log('审核成功:', result.message)
 *   console.log('奖励积分:', result.data.points_awarded)
 * }
 *
 * 后端接口：POST /api/v4/consumption/approve/:record_id
 * 后端路由：routes/v4/consumption.js:254
 * 后端服务：services/ConsumptionService.js:173（使用事务）
 * 文档位置：《管理员扫码审核功能技术方案-重构版.md》Line 458-501
 */
async function approveConsumption(record_id, params = {}) {
  // 参数验证
  if (!record_id) {
    throw new Error('消费记录ID不能为空')
  }

  if (!Number.isInteger(record_id) || record_id <= 0) {
    throw new Error('消费记录ID必须是正整数')
  }

  // 🔴 V4.0统一路径：按照文档规范
  return apiClient.request(`/consumption/approve/${record_id}`, {
    method: 'POST',
    data: {
      admin_notes: params.admin_notes || undefined
    },
    needAuth: true,
    showLoading: true,
    loadingText: '审核中...',
    showError: true,
    errorPrefix: '审核失败：'
  })
}

/**
 * 🔴 审核拒绝消费记录（管理员）
 *
 * @description
 * 管理员审核拒绝消费记录，冻结的积分不会发放给用户。
 * 使用数据库事务确保数据一致性。
 *
 * 核心特性：
 * - 权限控制：仅管理员可调用
 * - 事务处理：使用Sequelize事务 + 行锁
 * - 拒绝原因：必填，且至少5个字符
 * - 状态更新：status='pending' → 'rejected'
 * - 审核记录：记录审核员ID、审核时间、拒绝原因
 * - 积分处理：冻结的积分不会发放
 *
 * @param {number} record_id - 消费记录ID（必填）
 * @param {object} params - 请求参数对象
 * @param {String} params.admin_notes - 拒绝原因（必填，至少5个字符）
 * @returns {Promise<Object>} 返回审核结果
 * @returns {Boolean} returns.success - 请求是否成功
 * @returns {String} returns.message - 响应消息（如"已拒绝该消费记录"）
 * @returns {Object} returns.data - 审核结果数据
 * @returns {Number} returns.data.record_id - 消费记录ID
 * @returns {String} returns.data.status - 更新后的状态（rejected）
 * @returns {String} returns.data.reject_reason - 拒绝原因
 * @returns {String} returns.data.reviewed_at - 审核时间（北京时间）
 *
 * @throws {Error} 400 - 参数错误（拒绝原因为空或太短）
 * @throws {Error} 401 - Token无效或过期
 * @throws {Error} 403 - 权限不足（非管理员）
 * @throws {Error} 404 - 消费记录不存在
 * @throws {Error} 500 - 服务器错误
 *
 * @example
 * // 审核拒绝
 * const result = await API.rejectConsumption(123, {
 *   admin_notes: '消费金额与实际不符'
 * })
 *
 * if (result.success) {
 *   console.log('拒绝成功:', result.message)
 * }
 *
 * 后端接口：POST /api/v4/consumption/reject/:record_id
 * 后端路由：routes/v4/consumption.js:307
 * 后端服务：services/ConsumptionService.js:266（使用事务）
 * 文档位置：《管理员扫码审核功能技术方案-重构版.md》Line 504-551
 */
async function rejectConsumption(record_id, params) {
  // 参数验证
  if (!record_id) {
    throw new Error('消费记录ID不能为空')
  }

  if (!Number.isInteger(record_id) || record_id <= 0) {
    throw new Error('消费记录ID必须是正整数')
  }

  if (!params || !params.admin_notes) {
    throw new Error('拒绝原因不能为空')
  }

  if (params.admin_notes.length < 5) {
    throw new Error('拒绝原因至少5个字符')
  }

  // 🔴 V4.0统一路径：按照文档规范
  return apiClient.request(`/consumption/reject/${record_id}`, {
    method: 'POST',
    data: {
      admin_notes: params.admin_notes
    },
    needAuth: true,
    showLoading: true,
    loadingText: '处理中...',
    showError: true,
    errorPrefix: '拒绝失败：'
  })
}

/**
 * 🔴 快速登录（手机号直接登录）
 *
 * @param {string} mobile - 手机号
 * @returns {Promise} { success, data: { access_token, refresh_token, user } }
 *
 * 文档位置: Line 765-813
 */
async function quickLogin(mobile) {
  return apiClient.request('/auth/quick-login', {
    method: 'POST',
    data: {
      mobile
    },
    needAuth: false
  })
}

/**
 * 🔴 获取当前用户信息
 *
 * @returns {Promise} { success, data: { user } }
 *
 * 文档位置: Line 871-910
 */
async function getUserInfo() {
  return apiClient.request('/auth/profile', {
    method: 'GET',
    needAuth: true
  })
}

/**
 * 🔴 验证Token有效性
 *
 * @returns {Promise} { success, data: { valid, user } }
 *
 * 文档位置: Line 915-940
 */
async function verifyToken() {
  return apiClient.request('/auth/verify', {
    method: 'POST',
    needAuth: true
  })
}

/**
 * 🔴 获取用户身份信息（用于生成二维码）
 *
 * @returns {Promise} { success, data: { user_id, user_signature, nickname, phone, points, total_points } }
 *
 * 📋 数据说明：
 * - user_id: 用户ID
 * - user_signature: 防伪签名（后端HMAC-SHA256生成，前端不可伪造）
 * - nickname: 用户昵称
 * - phone: 手机号（脱敏处理）
 * - points: 当前可用积分
 * - total_points: 累计总积分
 *
 * 文档位置: 待后端API实现后更新
 *
 * ⚠️ 前端注意：此API需要后端提供真实接口
 * 🔴 需要后端提供的API路径示例: /api/v4/unified-engine/auth/user-identity
 */
async function getUserIdentity() {
  // 🚨 此API需要后端实现，目前返回错误提示
  console.error('❌ getUserIdentity API未实现')
  console.error('🔴 需要后端提供接口: /api/v4/unified-engine/auth/user-identity')
  console.error('📋 需要返回字段: user_id, user_signature, nickname, phone, points, total_points')

  return {
    success: false,
    message: '此功能需要后端API支持，请联系后端开发人员实现用户身份信息接口',
    error: 'API_NOT_IMPLEMENTED',
    data: null
  }

  // 🔴 后端API实现后，使用以下代码：
  // return apiClient.request('/unified-engine/auth/user-identity', {
  //   method: 'GET',
  //   needAuth: true
  // })
}

/**
 * ==================== 🎰 抽奖系统API ====================
 * 文档位置: V4.0文档 Line 944-1308
 */

/**
 * 🔴 获取抽奖奖品列表（数据已脱敏）（V4.2更新）
 *
 * @param {string} campaign_code - 活动代码（如'BASIC_LOTTERY'）
 * @returns {Promise} { success, data: [prizes] }
 *
 * 文档位置: Line 1143-1253
 */
async function getLotteryPrizes(campaign_code) {
  return apiClient.request(`/lottery/prizes/${campaign_code}`, {
    method: 'GET',
    needAuth: true
  })
}

/**
 * 🔴 获取抽奖配置（数据已脱敏）（V4.2更新）
 *
 * @param {string} campaign_code - 活动代码（如'BASIC_LOTTERY'）
 * @returns {Promise} { success, data: { campaign_id, campaign_name, draw_cost, max_draws_per_day, guarantee_info } }
 *
 * 文档位置: Line 1256-1299
 */
async function getLotteryConfig(campaign_code) {
  return apiClient.request(`/lottery/config/${campaign_code}`, {
    method: 'GET',
    needAuth: true
  })
}

/**
 * 🔴 执行抽奖（V4.2更新 + V2.0活动权限检查）
 *
 * @param {string} campaign_code - 活动代码
 * @param {Number} draw_count - 抽奖次数（默认1）
 * @returns {Promise} { success, data: { prizes } }
 *
 * 文档位置: Line 1302-1391
 */
async function performLottery(campaign_code, draw_count = 1) {
  return apiClient.request('/lottery/draw', {
    method: 'POST',
    data: {
      campaign_code,
      draw_count
    },
    needAuth: true
  })
}

/**
 * 🔴 获取用户抽奖历史
 *
 * @param {number} user_id - 用户ID
 * @param {number} page - 页码（默认1）
 * @param {number} limit - 每页数量（默认20）
 * @returns {Promise} { success, data: { records, pagination } }
 *
 * 文档位置: Line 1231-1274
 */
async function getLotteryHistory(user_id, page = 1, limit = 20) {
  return apiClient.request(
    `/lottery/history/${user_id}?page=${page}&limit=${limit}`,
    {
      method: 'GET',
      needAuth: true
    }
  )
}

/**
 * 🔴 获取活动列表
 *
 * @param {string} status - 状态筛选（active/inactive）
 * @returns {Promise} { success, data: [campaigns] }
 *
 * 文档位置: Line 1277-1307
 */
async function getLotteryCampaigns(status = 'active') {
  return apiClient.request(`/lottery/campaigns?status=${status}`, {
    method: 'GET',
    needAuth: true
  })
}

/**
 * ==================== 💰 积分系统API ====================
 * 文档位置: Part2文档 Line 4583-7214
 */

/**
 * 🔴 获取当前用户积分余额
 *
 * @returns {Promise} { success, data: { user_id, available_points, total_earned, total_consumed } }
 *
 * 文档位置: Part2 Line 4585-4726
 */
async function getCurrentUserBalance() {
  return apiClient.request('/points/balance', {
    method: 'GET',
    needAuth: true
  })
}

/**
 * 🔴 获取指定用户积分余额
 *
 * @param {number} user_id - 用户ID
 * @returns {Promise} { success, data: { user_id, available_points, total_earned, total_consumed } }
 *
 * 文档位置: Part2 Line 4729-4857
 */
async function getPointsBalance(user_id) {
  // 如果没有传user_id，从全局状态获取
  if (!user_id) {
    const appInstance = getAppInstance()
    if (appInstance && appInstance.globalData && appInstance.globalData.userInfo) {
      user_id = appInstance.globalData.userInfo.user_id || appInstance.globalData.userInfo.userId
    }
  }

  // 🔧 修复：如果globalData没有，尝试从Storage恢复
  if (!user_id) {
    try {
      const userInfo = wx.getStorageSync('user_info')
      if (userInfo && (userInfo.user_id || userInfo.userId)) {
        user_id = userInfo.user_id || userInfo.userId
        console.log('✅ 从Storage恢复user_id成功:', user_id)

        // 同时恢复到globalData
        const appInstance = getAppInstance()
        if (appInstance && appInstance.globalData) {
          appInstance.globalData.userInfo = userInfo
          console.log('✅ 同步恢复userInfo到globalData')
        }
      }
    } catch (error) {
      console.error('❌ 从Storage恢复user_id失败:', error)
    }
  }

  if (!user_id) {
    throw new Error('未找到user_id，请重新登录')
  }

  return apiClient.request(`/points/balance/${user_id}`, {
    method: 'GET',
    needAuth: true
  })
}

/**
 * 🔴 获取用户积分交易历史
 *
 * @param {number} user_id - 用户ID
 * @param {number} page - 页码
 * @param {number} limit - 每页数量
 * @param {string} type - 交易类型（earn/consume）
 * @returns {Promise} { success, data: { transactions, pagination } }
 *
 * 🔴 V4.0修正: 返回字段名为transactions，不是items或records（文档Line 39, 50, 5871）
 *
 * 文档位置: Line 1367-1429, 5835-5918
 */
async function getPointsTransactions(user_id, page = 1, limit = 20, type = null) {
  let url = `/points/transactions/${user_id}?page=${page}&limit=${limit}`
  if (type) {
    url += `&type=${type}`
  }

  return apiClient.request(url, {
    method: 'GET',
    needAuth: true
  })
}

/**
 * 🔴 获取用户统计数据
 *
 * @param {number} user_id - 用户ID
 * @returns {Promise} { success, data: { statistics } }
 *
 * 文档位置: Part2 Line 4866-6948
 */
async function getUserStatistics(user_id) {
  return apiClient.request(`/points/user/statistics/${user_id}`, {
    method: 'GET',
    needAuth: true
  })
}

/**
 * 🔴 管理员调整用户积分
 *
 * @param {string} user_id - 用户UUID
 * @param {number} amount - 调整数量（正数=增加，负数=扣除）
 * @param {string} reason - 调整原因（必填）
 * @param {string} type - 调整类型（默认admin_adjust）
 * @returns {Promise} { success, data: { user_id, adjustment, new_balance } }
 *
 * 文档位置: Part2 Line 5549-6059
 */
async function adminAdjustPoints(user_id, amount, reason, type = 'admin_adjust') {
  return apiClient.request('/points/admin/adjust', {
    method: 'POST',
    data: {
      user_id,
      amount,
      reason,
      type
    },
    needAuth: true
  })
}

/**
 * 🔴 管理员积分统计
 *
 * @returns {Promise} { success, data: { total_users, active_users, total_points_issued, ... } }
 *
 * 文档位置: Part2 Line 6062-6863
 */
async function getAdminPointsStatistics() {
  return apiClient.request('/points/admin/statistics', {
    method: 'GET',
    needAuth: true
  })
}

/**
 * ==================== 🎒 用户库存和兑换API ====================
 * 文档位置: V4.0文档 Line 1608-2095
 */

/**
 * 🔴 获取用户库存列表（数据已脱敏）
 *
 * @param {number} user_id - 用户ID
 * @param {Number} page - 页码
 * @param {Number} limit - 每页数量
 * @param {String} status - 状态筛选（available/used/expired/transferred）
 * @param {String} type - 类型筛选（prize/exchange/points/voucher）
 * @returns {Promise} { success, data: { inventory, pagination, summary } }
 *
 * 🔴 V4.0修正: 返回字段名为inventory，不是items（文档Line 40, 51）
 *
 * 文档位置: Line 1610-1710
 */
async function getUserInventory(user_id, page = 1, limit = 20, status = null, type = null) {
  let url = `/inventory/user/${user_id}?page=${page}&limit=${limit}`
  if (status) {
    url += `&status=${status}`
  }
  if (type) {
    url += `&type=${type}`
  }

  return apiClient.request(url, {
    method: 'GET',
    needAuth: true
  })
}

/**
 * 🔴 获取物品详情
 *
 * @param {number} item_id - 物品ID
 * @returns {Promise} { success, data: { item } }
 *
 * 文档位置: Line 1713-1750
 */
async function getInventoryItem(item_id) {
  return apiClient.request(`/inventory/item/${item_id}`, {
    method: 'GET',
    needAuth: true
  })
}

/**
 * 🔴 使用库存物品
 *
 * @param {number} item_id - 物品ID
 * @param {String} verification_code - 验证码（如果物品需要）
 * @returns {Promise} { success, data: { item } }
 *
 * 文档位置: Line 1753-1795
 */
async function useInventoryItem(item_id, verification_code = null) {
  return apiClient.request(`/inventory/use/${item_id}`, {
    method: 'POST',
    data: {
      verification_code
    },
    needAuth: true
  })
}

/**
 * 🔴 兑换商品列表（数据已脱敏）
 *
 * @param {string} space - 空间筛选（lucky/premium/both）
 * @param {string} category - 分类筛选
 * @param {number} page - 页码
 * @param {number} limit - 每页数量
 * @returns {Promise} { success, data: { products, pagination, filters } }
 *
 * 文档位置: Line 1799-1861
 */
async function getExchangeProducts(space = null, category = null, page = 1, limit = 20) {
  let url = `/inventory/products?page=${page}&limit=${limit}`
  if (space) {
    url += `&space=${space}`
  }
  if (category) {
    url += `&category=${category}`
  }

  return apiClient.request(url, {
    method: 'GET',
    needAuth: true
  })
}

/**
 * 🔴 兑换商品
 *
 * @param {number} product_id - 商品ID
 * @param {Number} quantity - 数量（默认1）
 * @returns {Promise} { success, data: { exchange, inventory_item, remaining_points } }
 *
 * 文档位置: Line 1864-1931
 */
async function exchangeProduct(product_id, quantity = 1) {
  return apiClient.request('/inventory/exchange', {
    method: 'POST',
    data: {
      product_id,
      quantity
    },
    needAuth: true
  })
}

/**
 * 🔴 获取兑换记录（数据已脱敏）
 *
 * @param {number} page - 页码
 * @param {number} limit - 每页数量
 * @param {string} status - 状态筛选（pending/completed/cancelled）
 * @returns {Promise} { success, data: { records, pagination } }
 *
 * 文档位置: Line 1934-1975
 */
async function getExchangeRecords(page = 1, limit = 20, status = null) {
  let url = `/inventory/exchange-records?page=${page}&limit=${limit}`
  if (status) {
    url += `&status=${status}`
  }

  return apiClient.request(url, {
    method: 'GET',
    needAuth: true
  })
}

/**
 * 🔴 取消兑换记录
 *
 * @param {number} exchange_id - 兑换记录ID
 * @returns {Promise} { success, data: { exchange_id, refunded_points, new_balance } }
 *
 * 文档位置: Part2 Line 4652-4708
 */
async function cancelExchange(exchange_id) {
  return apiClient.request(`/inventory/exchange-records/${exchange_id}/cancel`, {
    method: 'POST',
    needAuth: true
  })
}

/**
 * 🔴 生成核销码
 *
 * @param {number} item_id - 库存物品ID
 * @returns {Promise} { success, data: { item_id, verification_code, expires_at } }
 *
 * 文档位置: Part2 Line 3597-3649
 */
async function generateVerificationCode(item_id) {
  return apiClient.request(`/inventory/generate-code/${item_id}`, {
    method: 'POST',
    needAuth: true
  })
}

/**
 * 🔴 转移物品给其他用户
 *
 * @param {number} item_id - 库存物品ID
 * @param {Number} to_user_id - 接收用户ID
 * @param {String} message - 转移留言（可选）
 * @returns {Promise} { success, data: { transfer_id, item_id, from_user_id, to_user_id } }
 *
 * 文档位置: Part2 Line 4712-4781
 */
async function transferInventoryItem(item_id, to_user_id, message = null) {
  return apiClient.request('/inventory/transfer', {
    method: 'POST',
    data: {
      item_id,
      to_user_id,
      message
    },
    needAuth: true
  })
}

/**
 * 🔴 查询转移历史
 *
 * @param {number} page - 页码
 * @param {Number} limit - 每页数量
 * @param {String} direction - 筛选方向（sent/received/all）
 * @returns {Promise} { success, data: { items, pagination, summary } }
 *
 * 文档位置: Part2 Line 4892-4962
 */
async function getTransferHistory(page = 1, limit = 20, direction = 'all') {
  let url = `/inventory/transfer-history?page=${page}&limit=${limit}`
  if (direction && direction !== 'all') {
    url += `&direction=${direction}`
  }

  return apiClient.request(url, {
    method: 'GET',
    needAuth: true
  })
}

/**
 * 🔴 管理员库存统计
 *
 * @returns {Promise} { success, data: { total_items, available_items, used_items, ... } }
 *
 * 文档位置: Part2 Line 4150-4255
 */
async function getAdminInventoryStatistics() {
  return apiClient.request('/inventory/admin/statistics', {
    method: 'GET',
    needAuth: true
  })
}

/**
 * 🔴 查询市场商品列表
 *
 * @param {number} page - 页码
 * @param {number} limit - 每页数量
 * @param {number} min_price - 最低价格（可选）
 * @param {number} max_price - 最高价格（可选）
 * @returns {Promise} { success, data: { items, pagination } }
 *
 * 文档位置: Part2 Line 4019-4078
 */
async function getMarketProducts(page = 1, limit = 20, min_price = null, max_price = null) {
  let url = `/inventory/market/products?page=${page}&limit=${limit}`
  if (min_price !== null) {
    url += `&min_price=${min_price}`
  }
  if (max_price !== null) {
    url += `&max_price=${max_price}`
  }

  return apiClient.request(url, {
    method: 'GET',
    needAuth: true
  })
}

/**
 * 🔴 查询市场商品详情
 *
 * @param {number} id - 市场商品ID
 * @returns {Promise} { success, data: { market_product_id, inventory_item_id, ... } }
 *
 * 文档位置: Part2 Line 4259-4343
 */
async function getMarketProductDetail(id) {
  return apiClient.request(`/inventory/market/products/${id}`, {
    method: 'GET',
    needAuth: true
  })
}

/**
 * 🔴 购买市场商品
 *
 * @param {number} id - 市场商品ID
 * @returns {Promise} { success, data: { transaction_id, price, buyer_balance, ... } }
 *
 * 文档位置: Part2 Line 4082-4147
 */
async function purchaseMarketProduct(id) {
  return apiClient.request(`/inventory/market/products/${id}/purchase`, {
    method: 'POST',
    needAuth: true
  })
}

/**
 * 🔴 撤回市场商品
 *
 * @param {number} id - 市场商品ID
 * @returns {Promise} { success, data: { market_product_id, status, withdrawn_at } }
 *
 * 文档位置: Part2 Line 4346-4429
 */
async function withdrawMarketProduct(id) {
  return apiClient.request(`/inventory/market/products/${id}/withdraw`, {
    method: 'POST',
    needAuth: true
  })
}

/**
 * ==================== 📸 图片上传和审核API ====================
 * 文档位置: V4.0文档 Line 2098-2392
 */

/**
 * 🔴 用户图片上传（Sealos对象存储）
 *
 * @param {string} filePath - 图片临时文件路径
 * @param {string} category - 分类（默认food）
 * @param {string} description - 描述
 * @returns {Promise} { success, data: { upload } }
 *
 * 文档位置: Line 6375-6614（V4.0最终版）
 *
 * 🔴 V4.0最终版要求：
 * - 必传字段：photo（文件字段名）、user_id（用户ID）
 * - 可选字段：business_type、category
 * - 文件大小限制：最大10MB
 * - 支持格式：jpg、jpeg、png、gif、webp
 */
async function uploadImage(filePath, category = 'food', description = '') {
  return new Promise((resolve, reject) => {
    const token = wx.getStorageSync('access_token')
    if (!token) {
      reject(new Error('未登录'))
      return
    }

    // 🔴 获取user_id（必填参数）
    const appInstance = getAppInstance()
    let user_id = null

    console.log('🔍 开始获取user_id...')
    console.log('🔍 appInstance存在:', !!appInstance)
    console.log('🔍 globalData存在:', appInstance?.globalData ? '是' : '否')
    console.log('🔍 userInfo存在:', appInstance?.globalData?.userInfo ? '是' : '否')

    // 方式1：从全局状态获取
    if (appInstance && appInstance.globalData && appInstance.globalData.userInfo) {
      const userInfo = appInstance.globalData.userInfo
      // 🔴 尝试多种可能的字段路径
      user_id =
        userInfo.user_id || // 直接在userInfo下
        userInfo.userId || // 驼峰命名
        userInfo.user?.user_id || // 在user对象中
        userInfo.user?.id || // user.id
        userInfo.user?.userId // user.userId
      console.log('✅ 从globalData获取user_id:', user_id)
      console.log('📋 完整userInfo:', userInfo)
      if (userInfo.user) {
        console.log('📋 user对象:', userInfo.user)
      }
    }

    // 方式2：从Storage获取
    if (!user_id) {
      console.log('⚠️ globalData中未找到user_id，尝试从Storage获取...')
      try {
        const userInfo = wx.getStorageSync('user_info')
        console.log('📦 Storage中的user_info:', userInfo)
        if (userInfo) {
          // 🔴 尝试多种可能的字段路径
          user_id =
            userInfo.user_id || // 直接在userInfo下
            userInfo.userId || // 驼峰命名
            userInfo.user?.user_id || // 在user对象中
            userInfo.user?.id || // user.id
            userInfo.user?.userId // user.userId
          console.log('✅ 从Storage获取user_id:', user_id)
          if (userInfo.user) {
            console.log('📦 user对象:', userInfo.user)
          }
        }
        if (!user_id) {
          console.error('❌ Storage中的user_info无效或缺少user_id字段')
        }
      } catch (error) {
        console.error('❌ 从Storage获取user_id失败:', error)
      }
    }

    // 验证user_id
    if (!user_id) {
      console.error('❌ 所有方式都无法获取user_id！')
      console.error('请检查：')
      console.error('1. 用户是否已登录？')
      console.error('2. app.globalData.userInfo 是否正确设置？')
      console.error('3. Storage中的 user_info 是否正确保存？')
      reject(new Error('用户ID不能为空'))
      return
    }

    const uploadUrl = `${apiClient.config.baseUrl}/api/v4/photo/upload`
    console.log('📤 开始上传图片:', {
      user_id,
      category,
      description,
      filePath
    })
    console.log('🔗 上传URL:', uploadUrl)
    console.log('🔗 baseUrl:', apiClient.config.baseUrl)
    console.log('🔗 完整配置:', apiClient.config)

    // 🔴 formData所有字段必须转换为字符串（微信小程序要求）
    const formData = {
      user_id: String(user_id), // ✅ 显式转换为字符串
      business_type: String('user_upload_review'),
      category: String('pending_review')
    }

    console.log('📋 formData:', formData)

    wx.uploadFile({
      url: uploadUrl, // 🔴 按照文档Line 6377：/api/v4/photo/upload（不在unified-engine下）
      filePath,
      name: 'photo', // 🔴 注意：字段名必须是photo，不是image
      timeout: 60000, // ✅ 60秒超时（解决503问题的关键设置）
      formData,
      header: {
        Authorization: `Bearer ${token}`
      },
      success: res => {
        try {
          console.log('📦 上传响应 - HTTP状态码:', res.statusCode)
          console.log('📦 上传响应 - 原始数据类型:', typeof res.data)
          console.log('📦 上传响应 - 原始数据:', res.data)

          // 🔴 检查HTTP状态码 - 特别处理503错误
          if (res.statusCode === 503) {
            console.error('🚨 503错误 - 后端服务不可用')
            console.error('📋 完整响应数据:', res.data)
            console.error('💡 可能的原因：')
            console.error('1. 后端路由未注册到app.js')
            console.error('2. 后端服务未正确部署')
            console.error('3. 网关配置问题')
            console.error('4. 后端服务崩溃或未启动')
            reject(new Error('后端服务不可用(503)，请联系后端团队检查路由注册'))
            return
          }

          // 🔴 检查其他异常HTTP状态码
          if (res.statusCode !== 200 && res.statusCode !== 201) {
            console.error('❌ HTTP状态码异常:', res.statusCode)
            console.error('📋 响应数据:', res.data)
            reject(new Error(`服务器错误(${res.statusCode})`))
            return
          }

          // 🔴 检查响应数据类型
          if (typeof res.data !== 'string') {
            // 如果已经是对象，直接使用
            if (res.data && typeof res.data === 'object') {
              if (res.data.success) {
                console.log('✅ 图片上传成功:', res.data)
                resolve(res.data)
              } else {
                console.error('❌ 图片上传失败:', res.data)
                reject(new Error(res.data.message || '上传失败'))
              }
              return
            }
          }

          // 🔴 尝试解析JSON
          const data = JSON.parse(res.data)
          if (data.success) {
            console.log('✅ 图片上传成功:', data)
            resolve(data)
          } else {
            console.error('❌ 图片上传失败:', data)
            reject(new Error(data.message || '上传失败'))
          }
        } catch (error) {
          // 🔴 详细的错误日志，帮助诊断后端问题
          console.error('❌ 响应解析失败 - 完整错误:', error)
          console.error('❌ HTTP状态码:', res.statusCode)
          console.error('❌ 响应头:', res.header)
          console.error('❌ 响应数据(前200字符):', String(res.data).substring(0, 200))

          // 判断是否是后端服务问题或配置问题
          const errorStr = String(res.data)
          if (
            errorStr.includes('upstream') ||
            errorStr.includes('502') ||
            errorStr.includes('503')
          ) {
            console.error('💡 提示：如果是503错误，可能是以下原因：')
            console.error('1. 微信小程序域名配置未生效 - 请重启开发者工具')
            console.error('2. 后端服务暂时不可用 - 请联系后端团队')
            console.error('3. 网络连接问题 - 请检查网络状态')
            reject(new Error('服务暂时不可用，请重启开发者工具或稍后重试'))
          } else {
            reject(new Error(`响应格式错误: ${error.message}`))
          }
        }
      },
      fail: error => {
        console.error('❌ 上传请求失败:', error)
        console.error('❌ 错误详情:', JSON.stringify(error))
        console.error('❌ 上传URL:', uploadUrl)
        console.error('❌ formData:', formData)
        console.error('❌ token存在:', !!token)
        console.error('❌ filePath:', filePath)

        // 🔴 详细的错误分类和提示
        let errorMsg = '上传失败'

        // 🔴 检查是否是域名配置问题（这是最常见的原因）
        if (error.errMsg && error.errMsg.includes('request:fail')) {
          console.error('🚨 网络请求失败 - 可能的原因：')
          console.error('1. ⭐⭐⭐⭐⭐ 域名未在微信公众平台配置【uploadFile合法域名】')
          console.error(
            '   解决：登录mp.weixin.qq.com → 开发设置 → 服务器域名 → uploadFile合法域名'
          )
          console.error('   添加：omqktqrtntnn.sealosbja.site')
          console.error('2. ⭐⭐⭐⭐ 开发者工具未勾选"不校验合法域名"')
          console.error('   解决：详情 → 本地设置 → 勾选"不校验合法域名"')
          console.error('3. ⭐⭐⭐ 网络连接问题')
          console.error('   解决：检查网络连接或使用浏览器测试 https://omqktqrtntnn.sealosbja.site')
          console.error('4. ⭐⭐ SSL证书问题')
          console.error('   解决：在浏览器中访问上述地址，检查证书是否有效')
          errorMsg = '网络连接失败，请检查域名配置'
        }

        if (error.errMsg) {
          if (error.errMsg.includes('timeout')) {
            errorMsg = '上传超时，请检查网络连接'
            console.error('💡 提示：超时可能由于图片过大或网络慢，已设置60秒超时')
          } else if (error.errMsg.includes('fail')) {
            errorMsg = '网络连接失败，可能是域名未配置'
          }
        }

        // 特别处理503错误
        if (error.statusCode === 503) {
          errorMsg = '服务暂时不可用(503)'
          console.error('🚨 503错误诊断：')
          console.error('1. ⭐⭐⭐⭐⭐ 检查uploadFile合法域名配置')
          console.error('2. ⭐⭐⭐⭐ 重启微信开发者工具')
          console.error('3. ⭐⭐⭐ 清除缓存：工具 → 清除缓存')
          console.error('4. ⭐⭐ 确认后端服务正常运行')
        }

        reject(new Error(errorMsg))
      }
    })
  })
}

/**
 * 🔴 获取用户上传历史
 *
 * @param {number} page - 页码
 * @param {number} limit - 每页数量
 * @param {string} review_status - 审核状态（pending/approved/rejected）
 * @returns {Promise} { success, data: { uploads, pagination } }
 *
 * 文档位置: Line 2289-2331
 */
async function getMyUploads(page = 1, limit = 20, review_status = null) {
  let url = `/photo/my-uploads?page=${page}&limit=${limit}` // 🔴 修正：按照文档，photo路径不在unified-engine下
  if (review_status) {
    url += `&review_status=${review_status}`
  }

  return apiClient.request(url, {
    method: 'GET',
    needAuth: true
  })
}

/**
 * 🔴 获取用户上传统计
 *
 * @returns {Promise} { success, data: { statistics } }
 *
 * 文档位置: Line 2336-2363
 */
async function getMyUploadStats() {
  return apiClient.request('/photo/my-stats', {
    // 🔴 修正：按照文档，photo路径不在unified-engine下
    method: 'GET',
    needAuth: true
  })
}

/**
 * ==================== 🌐 系统通用API ====================
 * 文档位置: V4.0文档 Line 2586-2933
 */

/**
 * 🔴 获取系统公告（数据已脱敏）
 *
 * @param {number} page - 页码
 * @param {number} limit - 每页数量
 * @param {boolean} is_important - 只获取重要公告
 * @returns {Promise} { success, data: { announcements, pagination } }
 *
 * 文档位置: Line 2588-2637
 */
async function getAnnouncements(page = 1, limit = 20, is_important = null) {
  let url = `/system/announcements?page=${page}&limit=${limit}`
  if (is_important !== null) {
    url += `&is_important=${is_important}`
  }

  return apiClient.request(url, {
    method: 'GET',
    needAuth: true
  })
}

/**
 * 🔴 获取首页公告
 *
 * @returns {Promise} { success, data: { announcements } }
 *
 * 文档位置: Line 2640-2665
 */
async function getHomeAnnouncements() {
  return apiClient.request('/system/announcements/home', {
    method: 'GET',
    needAuth: false
  })
}

/**
 * 🔴 提交用户反馈
 *
 * @param {string} type - 反馈类型（bug/suggestion/complaint/other）
 * @param {string} content - 反馈内容
 * @param {string} contact - 联系方式
 * @returns {Promise} { success, data: { feedback } }
 *
 * 文档位置: Line 2668-2704
 */
async function submitFeedback(type, content, contact = null) {
  return apiClient.request('/system/feedback', {
    method: 'POST',
    data: {
      type,
      content,
      contact
    },
    needAuth: true
  })
}

/**
 * 🔴 获取用户反馈列表
 *
 * @param {number} page - 页码
 * @param {Number} limit - 每页数量
 * @returns {Promise} { success, data: { feedbacks, pagination } }
 *
 * 文档位置: Line 2707-2743
 */
async function getMyFeedbacks(page = 1, limit = 20) {
  return apiClient.request(`/system/feedback/my?page=${page}&limit=${limit}`, {
    method: 'GET',
    needAuth: true
  })
}

/**
 * 🔴 获取系统状态
 *
 * @returns {Promise} { success, data: { status, version, server_time, statistics } }
 *
 * 文档位置: Line 2746-2787
 */
async function getSystemStatus() {
  return apiClient.request('/system/status', {
    method: 'GET',
    needAuth: true
  })
}

/**
 * 🔴 创建客服会话
 *
 * @returns {Promise} { success, data: { session } }
 *
 * 文档位置: Line 2790-2814
 */
async function createChatSession() {
  return apiClient.request('/system/chat/create', {
    method: 'POST',
    needAuth: true
  })
}

/**
 * 🔴 获取用户会话列表
 *
 * @returns {Promise} { success, data: { sessions } }
 *
 * 文档位置: Line 2817-2846
 */
async function getChatSessions() {
  return apiClient.request('/system/chat/sessions', {
    method: 'GET',
    needAuth: true
  })
}

/**
 * 🔴 获取会话消息历史
 *
 * @param {number} session_id - 会话ID
 * @param {number} page - 页码
 * @param {number} limit - 每页数量
 * @returns {Promise} { success, data: { messages, pagination } }
 *
 * 文档位置: Line 2850-2892
 */
async function getChatHistory(session_id, page = 1, limit = 50) {
  return apiClient.request(`/system/chat/history/${session_id}?page=${page}&limit=${limit}`, {
    method: 'GET',
    needAuth: true
  })
}

/**
 * 🔴 发送消息
 *
 * @param {number} session_id - 会话ID
 * @param {String} content - 消息内容
 * @returns {Promise} { success, data: { message } }
 *
 * 文档位置: Line 2896-2930
 */
async function sendChatMessage(session_id, content) {
  return apiClient.request('/system/chat/send', {
    method: 'POST',
    data: {
      session_id,
      content
    },
    needAuth: true
  })
}

/**
 * ==================== 👑 管理员专用API ====================
 * 文档位置: V4.0文档 Line 2944-4021
 */

/**
 * 🔴 获取今日统计数据（仅管理员）
 *
 * @returns {Promise} { success, data: { statistics } }
 *
 * 文档位置: Line 2948-3136
 */
async function getAdminTodayStats() {
  return apiClient.request('/admin/statistics/today', {
    method: 'GET',
    needAuth: true
  })
}

/**
 * 🔴 获取用户列表（仅管理员）
 *
 * @param {number} page - 页码
 * @param {number} limit - 每页数量
 * @param {string} status - 状态筛选
 * @param {string} keyword - 关键词搜索
 * @returns {Promise} { success, data: { users, pagination } }
 *
 * 文档位置: Line 3140-3194
 */
async function getAdminUsers(page = 1, limit = 20, status = null, keyword = null) {
  let url = `/admin/users?page=${page}&limit=${limit}`
  if (status) {
    url += `&status=${status}`
  }
  if (keyword) {
    url += `&keyword=${keyword}`
  }

  return apiClient.request(url, {
    method: 'GET',
    needAuth: true
  })
}

/**
 * 🔴 获取待审核图片列表（管理员）
 *
 * @param {number} page - 页码
 * @param {Number} limit - 每页数量
 * @returns {Promise} { success, data: { images, pagination } }
 *
 * 文档位置: Line 2202-2238
 */
async function getPendingReviews(page = 1, limit = 20) {
  return apiClient.request(`/photo/pending-reviews?page=${page}&limit=${limit}`, {
    // 🔴 修正：按照文档，photo路径不在unified-engine下
    method: 'GET',
    needAuth: true
  })
}

/**
 * 🔴 审核图片（管理员）
 *
 * @param {number} resource_id - 资源ID
 * @param {string} status - 审核状态（approved/rejected）
 * @param {string} rejection_reason - 拒绝原因
 * @returns {Promise} { success, data: { review } }
 *
 * 文档位置: Line 2241-2285
 */
async function reviewImage(resource_id, status, rejection_reason = null) {
  return apiClient.request(`/photo/review/${resource_id}`, {
    // 🔴 修正：按照文档，photo路径不在unified-engine下
    method: 'POST',
    data: {
      status,
      rejection_reason
    },
    needAuth: true
  })
}

/**
 * 🔴 获取管理员会话列表
 *
 * @param {object} params - 查询参数对象
 * @param {number} params.page - 页码，默认1
 * @param {number} params.pageSize - 每页数量，默认20
 * @param {String} params.status - 状态筛选（active/closed/all）
 * @returns {Promise} { success, data: { sessions, pagination } }
 *
 * 文档位置: Line 4066-4114
 */
async function getAdminChatSessions(params = {}) {
  const { page = 1, pageSize = 20, status = null } = params

  let url = `/system/admin/chat/sessions?page=${page}&limit=${pageSize}`
  // status='all' 表示不过滤，不传递给后端
  if (status && status !== 'all') {
    url += `&status=${status}`
  }

  return apiClient.request(url, {
    method: 'GET',
    needAuth: true
  })
}

/**
 * 🔴 获取管理员会话历史
 *
 * @param {object} params - 查询参数对象
 * @param {number} params.sessionId - 会话ID
 * @param {number} params.page - 页码，默认1
 * @param {Number} params.pageSize - 每页数量，默认50
 * @returns {Promise} { success, data: { messages, pagination } }
 */
async function getAdminChatHistory(params = {}) {
  const { sessionId, page = 1, pageSize = 50 } = params

  if (!sessionId) {
    return {
      success: false,
      message: '会话ID不能为空'
    }
  }

  return apiClient.request(
    `/system/admin/chat/sessions/${sessionId}/messages?page=${page}&limit=${pageSize}`,
    {
      method: 'GET',
      needAuth: true
    }
  )
}

// ============================================================================
// 🔴 导出模块
// ============================================================================

/**
 * ⚠️ 【重要】新增API方法后，必须执行2个导出步骤：
 *
 * 1️⃣ 在本文件底部 module.exports 中添加导出
 * 2️⃣ 在 utils/index.js 的 API 对象中添加导出 ← 容易遗漏！
 *
 * 📋 完整检查清单详见：.cursor/rules/development-automation-unified.mdc
 * 搜索关键词："API方法新增检查清单"
 *
 * 🔴 不执行第2步会导致页面调用时报错：API.methodName is not a function
 */

module.exports = {
  // API客户端类
  APIClient,

  // ========== 认证系统 ==========
  userLogin,
  quickLogin,
  getUserInfo,
  getUserIdentity,
  verifyToken,

  // ========== 消费积分二维码系统 ==========
  getUserQRCode, // 🔴 新增：生成用户身份二维码
  getUserInfoByQRCode, // 🔴 新增：根据二维码获取用户信息（待后端实现）

  // 🆕 审核记录查询（用户端）
  getMyRecentAuditsCount, // 🆕 新增：获取用户最近审核记录数量
  getMyRecentAudits, // 🆕 新增：获取用户最近5笔积分审核记录

  // ========== 消费记录管理系统（管理员扫码审核功能）==========
  submitConsumption, // 🔴 新增：商家提交消费记录
  getPendingConsumption, // 🔴 新增：获取待审核消费记录列表（管理员）
  approveConsumption, // 🔴 新增：审核通过消费记录（管理员）
  rejectConsumption, // 🔴 新增：审核拒绝消费记录（管理员）

  // ========== 抽奖系统 ==========
  getLotteryPrizes,
  getLotteryConfig,
  performLottery,
  getLotteryHistory,
  getLotteryCampaigns,

  // ========== 积分系统 ==========
  getCurrentUserBalance, // 🆕 获取当前用户积分
  getPointsBalance,
  getPointsTransactions,
  getUserStatistics,
  adminAdjustPoints, // 🆕 管理员调整积分
  getAdminPointsStatistics, // 🆕 管理员积分统计

  // ========== 用户库存和兑换 ==========
  getUserInventory,
  getInventoryItem,
  useInventoryItem,
  getExchangeProducts,
  exchangeProduct,
  getExchangeRecords,
  cancelExchange,
  generateVerificationCode, // 🆕 生成核销码
  transferInventoryItem, // 🆕 转移物品
  getTransferHistory, // 🆕 转移历史
  getAdminInventoryStatistics, // 🆕 管理员库存统计
  getMarketProducts, // 🆕 市场商品列表
  getMarketProductDetail, // 🆕 市场商品详情
  purchaseMarketProduct, // 🆕 购买市场商品
  withdrawMarketProduct, // 🆕 撤回市场商品

  // ========== 图片上传和审核 ==========
  uploadImage,
  getMyUploads,
  getMyUploadStats,
  getPendingReviews,
  reviewImage,

  // ========== 系统通用 ==========
  getAnnouncements,
  getHomeAnnouncements,
  submitFeedback,
  getMyFeedbacks,
  getSystemStatus,

  // ========== 客服会话 ==========
  createChatSession,
  getChatSessions,
  getChatHistory,
  sendChatMessage,

  // ========== 管理员专用 ==========
  getAdminTodayStats,
  getAdminUsers,
  getAdminChatSessions,
  getAdminChatHistory,

  // API版本信息
  version: '4.0.1',
  lastUpdated: '2025-11-07T14:30:00+08:00',
  apiCompatibility: 'V4.0实际验证版 + 消费积分二维码',
  changelog: [
    '4.0.1 - 2025-11-07 - 新增消费积分二维码系统API',
    '- 新增getUserQRCode：生成用户身份二维码',
    '- 完整JSDoc文档注释，包含详细的中文说明',
    '- 集成自动loading和错误提示',
    '4.0.0 - 2025-10-04 - 完全重写，符合V4.0实际验证版对接文档',
    '- API路径统一使用/api/v4/unified-engine前缀',
    '- 所有字段统一使用snake_case命名',
    '- JWT Token双Token机制（access_token + refresh_token）',
    '- 清除所有Mock数据和兼容性代码',
    '- 统一错误处理和响应格式',
    '- 完善Token自动刷新机制'
  ]
}
