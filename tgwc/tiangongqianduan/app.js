// app.js - 餐厅积分抽奖系统V4.0主入口
// 基于：《前后端API对接规范文档_V4.0_实际验证版.md》

const {
  getApiConfig,
  getDevelopmentConfig,
  getWebSocketConfig,
  getCurrentEnv
} = require('./config/env.js')
const { initializeWechatEnvironment } = require('./utils/wechat.js')

/**
 * 🔴 餐厅积分抽奖系统V4.0 - 应用主入口
 * 📊 完全符合V4.0统一引擎架构
 * 🏗️ JWT双Token机制 + UUID角色系统
 * 🔐 开发阶段123456万能验证码支持
 */
App({
  /**
   * 🔴 全局数据管理 - V4.0统一引擎架构
   */
  globalData: {
    // 🔴 系统基础信息
    version: '4.0.0',
    systemName: '餐厅积分抽奖系统',
    buildTime: new Date().toISOString(),

    // 🔴 用户认证状态 - V4.0统一使用snake_case命名
    isLoggedIn: false,
    userInfo: null,
    // 🔴 V4.0规范：统一使用snake_case
    access_token: null,
    // 🔴 V4.0规范：统一使用snake_case
    refresh_token: null,

    // 🔴 用户权限（简化为二级权限）
    // guest, user
    userRole: 'guest',

    // 🔴 业务数据缓存
    // 🔴 V4.0规范：统一使用snake_case
    points_balance: 0,
    // 🔴 V4.0规范：统一使用snake_case
    lottery_config: null,
    exchange_products: {
      // 🔴 V4.0规范：统一使用snake_case
      // 幸运空间商品
      lucky: [],
      // 臻选空间商品
      premium: []
    },
    // 🔴 V4.0规范：统一使用snake_case
    premium_unlocked: false,

    // 🔴 系统状态
    // 🔴 V4.0规范：统一使用snake_case
    network_status: 'online',
    // 🔴 V4.0规范：统一使用snake_case
    current_page: '',

    // 🔴 WebSocket配置
    // 🔴 V4.0规范：统一使用snake_case
    ws_url: null,
    // 🔴 V4.0规范：统一使用snake_case
    ws_connected: false,
    // 🔴 V4.0规范：统一使用snake_case
    ws_config: null,

    // 🔴 开发阶段配置
    // 🔴 V4.0规范：统一使用snake_case
    is_development: false,
    // 🔴 万能验证码123456完全由后端控制，前端不设置

    // 🔴 多业务线存储配置
    storage_config: {
      // 🔴 V4.0规范：统一使用snake_case
      // 20MB
      max_image_size: 20 * 1024 * 1024,
      allowed_image_types: ['jpg', 'jpeg', 'png', 'webp'],
      business_types: ['lottery', 'exchange', 'trade', 'uploads']
    }
  },

  /**
   * 🔴 应用启动初始化
   * @param {object} options - 启动参数对象
   * @returns {Promise<void>} Promise对象
   */
  async onLaunch(options) {
    console.log('🚀 餐厅积分抽奖系统v2.0启动中...')
    console.log('📱 启动参数:', options)

    try {
      // 1. 初始化系统环境
      await this.initializeSystem()

      // 2. 检查用户认证状态
      await this.checkAuthStatus()

      // 3. 初始化微信环境
      await initializeWechatEnvironment()

      console.log('✅ 系统初始化完成')
    } catch (error) {
      console.error('❌ 系统初始化失败:', error)
      this.handleInitializationError(error)
    }
  },

  /**
   * 🔴 初始化系统环境
   * @returns {Promise<void>} Promise对象
   */
  async initializeSystem() {
    // 获取配置
    const apiConfig = getApiConfig()
    const devConfig = getDevelopmentConfig()
    const wsConfig = getWebSocketConfig()

    // 🔴 V4.3：已删除过度设计的error-handler.js（683行）
    // 🔴 V4.3：新增极简错误处理工具simple-error.js（50行）
    // 统一通过 utils/index.js 的 ErrorHandler 模块使用
    console.log('✅ 系统核心服务初始化完成')

    // 🔴 V4.0规范：设置开发阶段标识（统一snake_case）
    this.globalData.is_development = devConfig.enableUnifiedAuth
    // 🔴 万能验证码123456完全由后端控制，前端不设置

    // 🔴 V4.0规范：设置WebSocket配置（统一snake_case）
    this.globalData.ws_url = wsConfig.url
    this.globalData.ws_config = wsConfig

    console.log('🔧 系统环境配置:', {
      currentEnv: getCurrentEnv(),
      apiBaseUrl: apiConfig.baseUrl,
      webSocketUrl: wsConfig.url,
      // 🔴 V4.0规范
      is_development: this.globalData.is_development,
      version: this.globalData.version
    })

    console.log('🔍 详细配置调试:', {
      'config/env.js当前环境': getCurrentEnv(),
      API配置: apiConfig,
      WebSocket配置: wsConfig,
      // 🔴 V4.0规范
      设置到globalData的ws_url: this.globalData.ws_url
    })
  },

  /**
   * 🔴 检查用户认证状态
   * @returns {Promise<void>} Promise对象
   */
  async checkAuthStatus() {
    try {
      const token = wx.getStorageSync('access_token')
      let userInfo = wx.getStorageSync('user_info')

      console.log('🔍 检查认证状态:', {
        hasToken: !!token,
        hasUserInfo: !!userInfo,
        tokenLength: token ? token.length : 0
      })

      // 🔴 修复：如果有token但没有userInfo，从JWT Token中解析
      if (token && !userInfo) {
        console.log('⚠️ 检测到Token存在但userInfo缺失，尝试从JWT Token中恢复userInfo...')
        const { Utils } = require('./utils/index')
        const { decodeJWTPayload, validateJWTTokenIntegrity, isTokenExpired } = Utils

        // Token完整性验证
        const integrityCheck = validateJWTTokenIntegrity(token)
        if (!integrityCheck.isValid) {
          console.error('❌ Token完整性验证失败，需要重新登录')
          this.clearAuthData()
          return
        }

        // Token过期检查
        if (isTokenExpired(token)) {
          console.warn('⚠️ Token已过期，需要重新登录')
          this.clearAuthData()
          return
        }

        // 从JWT Token中解析userInfo
        try {
          const jwtPayload = decodeJWTPayload(token)
          if (jwtPayload) {
            userInfo = {
              user_id: jwtPayload.user_id,
              mobile: jwtPayload.mobile,
              nickname: jwtPayload.nickname || '用户',
              status: jwtPayload.status,
              is_admin: jwtPayload.is_admin || false,
              user_role: jwtPayload.user_role || 'user',
              role_level: jwtPayload.role_level || 0,
              iat: jwtPayload.iat,
              exp: jwtPayload.exp
            }

            // 保存恢复的userInfo到Storage
            wx.setStorageSync('user_info', userInfo)
            console.log('✅ 从JWT Token恢复userInfo成功:', {
              user_id: userInfo.user_id,
              mobile: userInfo.mobile,
              is_admin: userInfo.is_admin,
              user_role: userInfo.user_role,
              role_level: userInfo.role_level
            })
          }
        } catch (decodeError) {
          console.error('❌ JWT Token解析失败:', decodeError)
          this.clearAuthData()
          return
        }
      }

      if (token && userInfo) {
        // 🔧 Token健康检查
        const { Utils } = require('./utils/index')
        const { validateJWTTokenIntegrity, isTokenExpired } = Utils

        // 完整性验证
        const integrityCheck = validateJWTTokenIntegrity(token)
        if (!integrityCheck.isValid) {
          console.error('🚨 检测到Token完整性问题:', integrityCheck.error)
          if (integrityCheck.error.includes('截断')) {
            wx.showModal({
              title: '认证令牌异常',
              content: `检测到认证令牌传输异常，可能影响应用功能。\n\n问题：${integrityCheck.error}\n\n解决方案：\n1. 重新登录获取完整令牌\n2. 检查网络连接稳定性\n3. 清除应用缓存后重试`,
              showCancel: true,
              cancelText: '稍后处理',
              confirmText: '立即修复',
              success: res => {
                if (res.confirm) {
                  this.clearAuthData()
                  wx.redirectTo({
                    url: '/pages/auth/auth'
                  })
                }
              }
            })
            return
          } else {
            console.warn('⚠️ Token格式问题，自动清理并重新验证')
            this.clearAuthData()
            return
          }
        }

        // 过期检查
        if (isTokenExpired(token)) {
          console.warn('⚠️ Token已过期，清理认证数据')
          this.clearAuthData()
          return
        }

        console.log('✅ Token健康检查通过')

        // 🔴 V4.0规范：恢复认证状态（统一snake_case）
        this.globalData.access_token = token
        this.globalData.userInfo = userInfo
        this.globalData.isLoggedIn = true

        // 🔴 修复：使用正确的权限判断逻辑
        this.globalData.userRole = this.getUserRoleFromV4(userInfo)
        this.globalData.points_balance = userInfo.points || userInfo.total_points || 0

        console.log('✅ 用户认证状态恢复成功:', {
          user_id: userInfo.user_id,
          mobile: userInfo.mobile,
          is_admin: userInfo.is_admin,
          user_role: userInfo.user_role,
          role_level: userInfo.role_level,
          globalData_userRole: this.globalData.userRole,
          globalData_isLoggedIn: this.globalData.isLoggedIn,
          points: this.globalData.points_balance
        })

        // 🔧 Token使用统计
        this.logTokenUsage('restore_success', {
          tokenLength: token.length,
          userType: this.globalData.userRole,
          mobile: userInfo.mobile
        })
      } else {
        console.log('💡 没有存储的认证信息')
      }
    } catch (error) {
      console.log('⚠️ 认证状态恢复失败:', error.message)
      console.error('🔧 错误详情:', error)

      this.logTokenUsage('restore_error', {
        error: error.message,
        timestamp: new Date().toISOString()
      })

      this.clearAuthData()
    }
  },

  /**
   * 🔴 清空认证数据 - V4.0统一snake_case
   * @returns {void}
   */
  clearAuthData() {
    this.globalData.isLoggedIn = false
    this.globalData.userInfo = null
    // 🔴 V4.0规范
    this.globalData.access_token = null
    // 🔴 V4.0规范
    this.globalData.refresh_token = null
    this.globalData.userRole = 'guest'

    // 🔴 V4.0规范
    this.globalData.points_balance = 0

    wx.removeStorageSync('access_token')
    // 🔴 V4.0规范
    wx.removeStorageSync('refresh_token')
    wx.removeStorageSync('user_info')
  },

  /**
   * 🔴 更新用户信息 - V4.0 UUID角色系统（统一snake_case）
   * @param {object} userInfo - 用户信息对象
   * @returns {void} 无返回值
   */
  updateUserInfo(userInfo) {
    this.globalData.userInfo = userInfo
    this.globalData.isLoggedIn = true

    // 🔴 V4.0修复：使用UUID角色系统判断管理员权限
    this.globalData.userRole = this.getUserRoleFromV4(userInfo)
    // 🔴 V4.0规范
    this.globalData.points_balance =
      userInfo.points || userInfo.total_points || userInfo.totalPoints || 0

    wx.setStorageSync('user_info', userInfo)

    console.log('✅ 用户信息已更新:', {
      // 🔴 V4.0规范
      user_id: userInfo.user_id || userInfo.userId,
      // 🔴 V4.0规范
      role_based_admin: userInfo.role_based_admin || userInfo.roleBasedAdmin,
      roles: userInfo.roles,
      userRole: this.globalData.userRole,
      // 🔴 V4.0规范
      points: this.globalData.points_balance
    })
  },

  /**
   * 🔴 更新积分余额 - V4.0统一snake_case
   * @param {Number} points - 积分数值
   * @returns {void} 无返回值
   */
  updatePointsBalance(points) {
    // 🔴 V4.0规范
    this.globalData.points_balance = points
    if (this.globalData.userInfo) {
      this.globalData.userInfo.points = points
      wx.setStorageSync('user_info', this.globalData.userInfo)
    }
  },

  /**
   * 🔴 设置访问令牌 - V4.0统一snake_case
   * @param {String} token - 访问令牌
   * @returns {void} 无返回值
   */
  setAccessToken(token) {
    // 🔴 V4.0规范
    this.globalData.access_token = token
    wx.setStorageSync('access_token', token)
  },

  /**
   * 🔴 设置刷新令牌 - V4.0双Token机制
   * @param {String} token - 刷新令牌
   * @returns {void} 无返回值
   */
  setRefreshToken(token) {
    // 🔴 V4.0规范
    this.globalData.refresh_token = token
    wx.setStorageSync('refresh_token', token)
  },

  /**
   * 🔴 获取用户权限
   * @returns {String} 用户角色（admin/user/guest）
   */
  getUserRole() {
    return this.globalData.userRole
  },

  /**
   * 🔴 V4.0新增：从JWT Token或用户信息中获取角色
   * @param {object} userInfo - 用户信息对象（从JWT解析得到）
   * @returns {string} 'admin' | 'user' | 'guest'
   */
  getUserRoleFromV4(userInfo) {
    if (!userInfo) {
      return 'guest'
    }

    console.log('🔍 getUserRoleFromV4 检查用户权限:', {
      has_is_admin: 'is_admin' in userInfo,
      is_admin_value: userInfo.is_admin,
      has_user_role: 'user_role' in userInfo,
      user_role_value: userInfo.user_role,
      has_role_level: 'role_level' in userInfo,
      role_level_value: userInfo.role_level
    })

    // 🔴 方式1：使用is_admin字段（V4.0 JWT标准字段，snake_case命名）
    if (userInfo.is_admin === true) {
      console.log('✅ 通过is_admin字段识别为管理员')
      return 'admin'
    }

    // 🔴 方式2：使用user_role字段（V4.0 JWT标准字段，snake_case命名）
    if (userInfo.user_role === 'admin') {
      console.log('✅ 通过user_role字段识别为管理员')
      return 'admin'
    }

    // 🔴 方式3：使用role_level字段（V4.0 JWT标准字段，snake_case命名）
    // role_level >= 100 表示管理员权限
    if (userInfo.role_level && userInfo.role_level >= 100) {
      console.log('✅ 通过role_level字段识别为管理员')
      return 'admin'
    }

    console.log('ℹ️ 识别为普通用户')
    return 'user'
  },

  /**
   * 🔴 处理初始化错误
   * @param {Error} error - 错误对象
   * @returns {void}
   */
  handleInitializationError(error) {
    console.error('🚨 系统初始化错误:', error)

    wx.showModal({
      title: '系统初始化失败',
      content: '系统启动时发生错误，请重启小程序',
      showCancel: false,
      confirmText: '重启',
      success: () => {
        wx.reLaunch({
          url: '/pages/lottery/lottery'
        })
      }
    })
  },

  /**
   * 🔴 应用显示时触发
   * @returns {void}
   */
  onShow() {
    console.log('📱 应用进入前台')
    const pages = getCurrentPages()
    // 🔴 V4.0规范：统一snake_case
    this.globalData.current_page =
      pages.length > 0 && pages[pages.length - 1] ? pages[pages.length - 1].route || '' : ''
  },

  /**
   * 🔴 应用隐藏时触发
   */
  onHide() {
    console.log('📱 应用进入后台')
  },

  /**
   * 🔴 应用错误处理
   */
  onError(error) {
    console.error('🚨 应用发生错误:', error)

    // 记录错误信息
    this.logError(error)
  },

  /**
   * 🔴 记录错误信息
   */
  logError(error) {
    const errorInfo = {
      message: error.message || error,
      stack: error.stack,
      timestamp: new Date().toISOString(),
      // 🔴 V4.0规范
      page: this.globalData.current_page,
      // 🔧 兼容性修复：安全获取微信系统信息
      userAgent: this.getSafeSystemInfo()
    }

    console.error('📝 错误记录:', errorInfo)

    // 🔴 V4.0规范：在开发环境显示详细错误
    if (this.globalData.is_development) {
      wx.showModal({
        title: '开发错误提示',
        content: `错误信息: ${error.message || error}`,
        showCancel: false
      })
    }
  },

  /**
   * 🔴 获取微信系统信息 - V4.0标准API
   *
   * @returns {Object} 系统信息对象
   *
   * @description
   * 使用微信小程序最新API获取系统信息（基础库2.20.1+）。
   *
   * **V4.0特性**：
   * - 仅使用新版API（wx.getWindowInfoSync、wx.getDeviceInfoSync、wx.getAppBaseInfoSync）
   * - 移除旧版API兼容代码
   * - 要求微信基础库版本≥2.20.1
   *
   * **返回信息包含**：
   * - 窗口信息（屏幕宽高、像素比等）
   * - 设备信息（型号、系统版本等）
   * - 小程序基础信息（版本、宿主环境等）
   *
   * @throws {Error} API调用失败时抛出错误
   */
  getSafeSystemInfo() {
    try {
      // 🔴 V4.0规范：使用新版API（基础库2.20.1+）
      const windowInfo = wx.getWindowInfoSync()
      const deviceInfo = wx.getDeviceInfoSync()
      const appBaseInfo = wx.getAppBaseInfoSync()

      // 合并所有系统信息
      const systemInfo = {
        ...windowInfo,
        ...deviceInfo,
        ...appBaseInfo
      }

      return systemInfo
    } catch (error) {
      console.error('❌ 获取系统信息失败:', error)
      throw new Error(`系统信息获取失败，请确保微信基础库版本≥2.20.1：${error.message}`)
    }
  },

  /**
   * 🔴 统一WebSocket管理机制 - 解决频繁断开重连问题
   */

  // 🔴 WebSocket连接状态
  websocketData: {
    connected: false,
    connecting: false,
    reconnectAttempts: 0,
    maxReconnectAttempts: 5,
    heartbeatTimer: null,
    reconnectTimer: null,
    // 🔴 页面消息订阅者
    pageSubscribers: new Map(),
    lastHeartbeatTime: null
  },

  /**
   * 🔴 统一WebSocket连接管理
   */
  connectWebSocket() {
    // 防止重复连接
    if (this.websocketData.connected || this.websocketData.connecting) {
      console.log('🔌 WebSocket已连接或正在连接中，跳过重复连接')
      return Promise.resolve()
    }

    // 🔴 V4.0规范：检查登录状态（统一snake_case）
    if (!this.globalData.isLoggedIn || !this.globalData.access_token) {
      console.log('🚫 用户未登录，跳过WebSocket连接')
      return Promise.reject(new Error('用户未登录'))
    }

    this.websocketData.connecting = true
    console.log('🔌 启动统一WebSocket连接...')

    return new Promise((resolve, reject) => {
      // 🔴 V4.0规范：使用统一命名
      const wsUrl = `${this.globalData.ws_url}?token=${encodeURIComponent(this.globalData.access_token)}`

      wx.connectSocket({
        url: wsUrl,
        protocols: ['websocket'],
        success: () => {
          console.log('✅ WebSocket连接请求已发送')
        },
        fail: error => {
          console.error('❌ WebSocket连接失败:', error)
          this.websocketData.connecting = false
          reject(error)
        }
      })

      // 🔧 统一设置全局事件监听器（只设置一次）
      wx.onSocketOpen(() => {
        console.log('✅ 统一WebSocket连接已建立')
        this.websocketData.connected = true
        this.websocketData.connecting = false
        this.websocketData.reconnectAttempts = 0
        // 🔴 V4.0规范
        this.globalData.ws_connected = true

        this.startUnifiedHeartbeat()
        this.notifyPageSubscribers('websocket_connected', {})
        resolve()
      })

      wx.onSocketMessage(res => {
        try {
          const message = JSON.parse(res.data)
          console.log('📨 统一WebSocket消息接收:', message)
          this.handleUnifiedWebSocketMessage(message)
        } catch (error) {
          console.error('❌ WebSocket消息解析失败:', error)
        }
      })

      wx.onSocketError(error => {
        console.error('❌ 统一WebSocket连接错误:', error)
        this.websocketData.connected = false
        this.websocketData.connecting = false
        // 🔴 V4.0规范
        this.globalData.ws_connected = false
        this.stopUnifiedHeartbeat()
        this.notifyPageSubscribers('websocket_error', { error })
        this.handleUnifiedReconnect()
      })

      wx.onSocketClose(res => {
        console.log('🔌 统一WebSocket连接关闭，状态码:', res.code)
        this.websocketData.connected = false
        this.websocketData.connecting = false
        // 🔴 V4.0规范
        this.globalData.ws_connected = false
        this.stopUnifiedHeartbeat()
        this.notifyPageSubscribers('websocket_closed', { code: res.code })

        // 只有非正常关闭才自动重连
        if (res.code !== 1000 && this.globalData.isLoggedIn) {
          this.handleUnifiedReconnect()
        }
      })
    })
  },

  /**
   * 🔴 统一心跳机制
   */
  startUnifiedHeartbeat() {
    this.stopUnifiedHeartbeat()
    console.log('💓 启动统一WebSocket心跳机制')

    this.websocketData.heartbeatTimer = setInterval(() => {
      if (this.websocketData.connected) {
        const heartbeatMessage = {
          type: 'heartbeat',
          timestamp: Date.now(),
          // 🔴 V4.0规范：优先使用snake_case
          clientId:
            this.globalData.userInfo?.user_id || this.globalData.userInfo?.userId || 'unknown'
        }

        wx.sendSocketMessage({
          data: JSON.stringify(heartbeatMessage),
          success: () => {
            console.log('💓 统一心跳发送成功')
            this.websocketData.lastHeartbeatTime = Date.now()
          },
          fail: error => {
            console.error('❌ 统一心跳发送失败:', error)
            this.websocketData.connected = false
            // 🔴 V4.0规范
            this.globalData.ws_connected = false
          }
        })
      }
      // 🔴 统一60秒间隔
    }, 60000)
  },

  /**
   * 🔴 停止心跳机制
   */
  stopUnifiedHeartbeat() {
    if (this.websocketData.heartbeatTimer) {
      clearInterval(this.websocketData.heartbeatTimer)
      this.websocketData.heartbeatTimer = null
      console.log('🛑 统一心跳机制已停止')
    }
  },

  /**
   * 🔴 统一重连机制
   */
  handleUnifiedReconnect() {
    if (this.websocketData.reconnectAttempts >= this.websocketData.maxReconnectAttempts) {
      console.log('❌ WebSocket重连次数已达上限，停止重连')
      this.notifyPageSubscribers('websocket_max_reconnect_reached', {})
      return
    }

    const delay = Math.min(Math.pow(2, this.websocketData.reconnectAttempts) * 1000, 30000)
    this.websocketData.reconnectAttempts++

    console.log(
      `🔄 WebSocket统一重连 (${this.websocketData.reconnectAttempts}/${this.websocketData.maxReconnectAttempts})，延迟: ${delay}ms`
    )

    this.websocketData.reconnectTimer = setTimeout(() => {
      if (this.globalData.isLoggedIn && !this.websocketData.connected) {
        this.connectWebSocket().catch(error => {
          console.error('❌ 统一重连失败:', error)
        })
      }
    }, delay)
  },

  /**
   * 🔴 统一消息处理分发
   */
  handleUnifiedWebSocketMessage(message) {
    const { type, data, event_name } = message
    const eventName = event_name || type

    console.log(`📢 统一处理WebSocket消息: ${eventName}`)

    // 全局消息处理
    switch (eventName) {
    case 'auth_verify_result':
      if (data.status === 'success') {
        console.log('✅ WebSocket认证成功')
      } else {
        console.warn('⚠️ WebSocket认证失败')
        this.clearAuthData()
      }
      break

    case 'connection_established':
      console.log('✅ WebSocket连接确认')
      break

    case 'heartbeat_response':
      console.log('💓 收到心跳响应')
      break

    case 'system_message':
      if (data.level === 'urgent') {
        wx.showModal({
          title: '🚨 紧急通知',
          content: data.content,
          showCancel: false
        })
      }
      break
    default:
      console.warn(`🚫 未知的WebSocket消息类型: ${eventName}`)
      break
    }

    // 🔴 分发消息到所有订阅页面
    this.notifyPageSubscribers(eventName, data)
  },

  /**
   * 🔴 页面消息订阅机制
   */
  subscribeWebSocketMessages(pageId, callback) {
    console.log(`📱 页面 ${pageId} 订阅WebSocket消息`)
    this.websocketData.pageSubscribers.set(pageId, callback)
  },

  /**
   * 🔴 取消页面订阅
   */
  unsubscribeWebSocketMessages(pageId) {
    console.log(`📱 页面 ${pageId} 取消WebSocket消息订阅`)
    this.websocketData.pageSubscribers.delete(pageId)
  },

  /**
   * 🔴 通知所有订阅页面
   */
  notifyPageSubscribers(eventName, data) {
    this.websocketData.pageSubscribers.forEach((callback, pageId) => {
      try {
        callback(eventName, data)
      } catch (error) {
        console.error(`❌ 页面 ${pageId} 消息处理失败:`, error)
      }
    })
  },

  /**
   * 🔴 发送WebSocket消息
   */
  sendWebSocketMessage(message) {
    return new Promise((resolve, reject) => {
      if (!this.websocketData.connected) {
        reject(new Error('WebSocket未连接'))
        return
      }

      wx.sendSocketMessage({
        data: JSON.stringify(message),
        success: resolve,
        fail: reject
      })
    })
  },

  /**
   * 🔴 断开WebSocket连接
   */
  disconnectWebSocket() {
    console.log('🔌 断开统一WebSocket连接')
    this.stopUnifiedHeartbeat()

    if (this.websocketData.reconnectTimer) {
      clearTimeout(this.websocketData.reconnectTimer)
      this.websocketData.reconnectTimer = null
    }

    this.websocketData.connected = false
    this.websocketData.connecting = false
    // 🔴 V4.0规范
    this.globalData.ws_connected = false
    this.websocketData.pageSubscribers.clear()

    wx.closeSocket()
  },

  /**
   * 🔧 新增：Token使用日志记录
   * 用于分析Token问题的发生频率和模式
   */
  logTokenUsage(action, details) {
    try {
      const logs = wx.getStorageSync('token_usage_logs') || []
      const logEntry = {
        action,
        timestamp: new Date().toISOString(),
        details
      }

      // 只保留最近50条记录
      logs.push(logEntry)
      if (logs.length > 50) {
        logs.shift()
      }

      wx.setStorageSync('token_usage_logs', logs)
      console.log('📊 Token使用日志记录:', logEntry)
    } catch (error) {
      console.warn('⚠️ Token日志记录失败:', error.message)
    }
  }
})
