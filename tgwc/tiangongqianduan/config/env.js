// config/env.js - 环境配置管理v4.0（基于V4统一引擎架构）

/**
 * 🔴 v4.0环境配置 - 完全符合V4统一引擎架构
 * 📊 基于V4.0实际代码验证版对接文档
 * 🏗️ 支持V4统一抽奖引擎架构
 */
const ENV_CONFIG = {
  // 🚧 开发环境配置（微信开发者工具）- 对接V4统一引擎后端服务
  development: {
    // 🔴 API服务配置 - 对接V4统一引擎架构
    api: {
      baseUrl: 'http://localhost:3000', // V4统一引擎服务地址
      apiPrefix: '/api/v4', // 🔴 V4 API版本
      timeout: 30000,
      retryTimes: 3,
      retryDelay: 2000,
      // 🔧 网络诊断配置
      healthCheckTimeout: 8000,
      enableNetworkDiagnostics: true,
      enableAutoRetry: true
    },

    // 🔴 WebSocket服务配置 - V4架构WebSocket服务
    websocket: {
      url: 'ws://localhost:3000/ws', // V4架构WebSocket服务地址
      reconnectInterval: 3000,
      maxReconnectAttempts: 5,
      heartbeatInterval: 30000,
      enableHeartbeat: true
    },

    // 🚧 开发阶段特殊配置 - V4统一认证系统
    development: {
      // 📱 开发阶段：V4统一认证方式
      enableUnifiedAuth: true,
      mockVerificationCode: '123456', // V4开发环境万能验证码
      skipSmsVerification: true,

      // 🔐 管理员权限识别 - V4权限系统
      enableAdminAutoDetection: true,
      adminFieldMapping: 'is_admin',

      // 📞 短信服务暂停
      disableSmsService: true,
      preserveSmsFields: true,

      // 🔧 调试模式
      enableDebugMode: true,
      showDetailedErrors: true
    },

    // 🔴 V4业务模块配置 - 统一引擎架构
    business: {
      // V4统一抽奖引擎
      lottery: {
        enabled: true,
        engineVersion: '4.0.0',
        defaultStrategy: 'basic_guarantee',
        defaultCostPerDraw: 100,
        supportMultipleDraw: true,
        enableGuarantee: true
      },

      // V4库存管理系统
      inventory: {
        enabled: true,
        enableUserInventory: true,
        supportTransfer: true,
        supportVerification: true
      },

      // V4图片上传系统 - Sealos对象存储
      uploads: {
        enabled: true,
        storageProvider: 'sealos',
        manualReviewMode: true,
        maxFileSize: 10485760, // 10MB (V4限制)
        allowedTypes: ['jpg', 'jpeg', 'png', 'gif']
      },

      // V4权限管理系统
      permissions: {
        enabled: true,
        enableRoleBasedAccess: true,
        supportBatchCheck: true
      }
    },

    // 🔴 V4数据安全配置
    security: {
      enableFieldMapping: true,
      enableDataValidation: true,
      enableSafetyChecks: true,
      apiVersion: 'v4.0'
    }
  },

  // 🔧 真机调试环境配置 - V4架构
  mobile: {
    // 🔴 API服务配置 - V4统一引擎
    api: {
      baseUrl: 'http://192.168.43.12:3000',
      apiPrefix: '/api/v4', // 🔴 V4 API版本
      timeout: 30000,
      retryTimes: 3,
      retryDelay: 2000,
      healthCheckTimeout: 8000,
      enableNetworkDiagnostics: true,
      enableAutoRetry: true
    },

    // 🔴 WebSocket服务配置 - V4架构
    websocket: {
      url: 'ws://192.168.43.12:3000/ws',
      reconnectInterval: 3000,
      maxReconnectAttempts: 5,
      heartbeatInterval: 30000,
      enableHeartbeat: true
    },

    // 🚧 开发阶段特殊配置 - V4统一认证
    development: {
      enableUnifiedAuth: true,
      mockVerificationCode: '123456',
      skipSmsVerification: true,
      enableAdminAutoDetection: true,
      adminFieldMapping: 'is_admin',
      disableSmsService: true,
      preserveSmsFields: true,
      enableDebugMode: true,
      showDetailedErrors: true
    },

    // 🔴 V4业务模块配置
    business: {
      lottery: {
        enabled: true,
        engineVersion: '4.0.0',
        defaultStrategy: 'basic_guarantee',
        defaultCostPerDraw: 100,
        supportMultipleDraw: true,
        enableGuarantee: true
      },
      inventory: {
        enabled: true,
        enableUserInventory: true,
        supportTransfer: true,
        supportVerification: true
      },
      uploads: {
        enabled: true,
        storageProvider: 'sealos',
        manualReviewMode: true,
        maxFileSize: 10485760,
        allowedTypes: ['jpg', 'jpeg', 'png', 'gif']
      },
      permissions: {
        enabled: true,
        enableRoleBasedAccess: true,
        supportBatchCheck: true
      }
    },

    // 🔴 V4数据安全配置
    security: {
      enableFieldMapping: true,
      enableDataValidation: true,
      enableSafetyChecks: true,
      apiVersion: 'v4.0'
    }
  },

  // 🔴 测试环境配置 - V4统一引擎架构
  testing: {
    api: {
      baseUrl: 'https://omqktqrtntnn.sealosbja.site',
      apiPrefix: '/api/v4', // 🔴 V4 API版本
      timeout: 15000,
      retryTimes: 3,
      retryDelay: 2000
    },

    websocket: {
      url: 'wss://omqktqrtntnn.sealosbja.site/ws',
      reconnectInterval: 3000,
      maxReconnectAttempts: 5,
      heartbeatInterval: 30000,
      enableHeartbeat: true
    },

    development: {
      enableUnifiedAuth: true,
      mockVerificationCode: '123456',
      skipSmsVerification: true,
      enableAdminAutoDetection: true,
      adminFieldMapping: 'is_admin',
      disableSmsService: false,
      preserveSmsFields: true,
      enableDebugMode: false,
      showDetailedErrors: true
    },

    business: {
      lottery: {
        enabled: true,
        engineVersion: '4.0.0',
        defaultStrategy: 'basic_guarantee',
        defaultCostPerDraw: 100,
        supportMultipleDraw: true,
        enableGuarantee: true
      },
      inventory: {
        enabled: true,
        enableUserInventory: true,
        supportTransfer: true,
        supportVerification: true
      },
      uploads: {
        enabled: true,
        storageProvider: 'sealos',
        manualReviewMode: true,
        maxFileSize: 10485760,
        allowedTypes: ['jpg', 'jpeg', 'png', 'gif']
      },
      permissions: {
        enabled: true,
        enableRoleBasedAccess: true,
        supportBatchCheck: true
      }
    },

    security: {
      enableFieldMapping: true,
      enableDataValidation: true,
      enableSafetyChecks: true,
      apiVersion: 'v4.0'
    }
  },

  // 🔴 生产环境配置 - V4统一引擎架构
  production: {
    // 🔴 API服务配置 - V4生产服务器
    api: {
      baseUrl: 'https://omqktqrtntnn.sealosbja.site', // 🚨 部署时更新为正式域名
      apiPrefix: '/api/v4', // 🔴 V4 API版本
      timeout: 20000,
      retryTimes: 2,
      retryDelay: 3000,
      healthCheckTimeout: 10000,
      enableNetworkDiagnostics: false,
      enableAutoRetry: true
    },

    websocket: {
      url: 'wss://omqktqrtntnn.sealosbja.site/ws',
      reconnectInterval: 5000,
      maxReconnectAttempts: 3,
      heartbeatInterval: 60000,
      enableHeartbeat: true
    },

    // 🔐 生产环境严格安全设置
    development: {
      enableUnifiedAuth: false, // 🚨 生产环境禁用万能验证码
      mockVerificationCode: null,
      skipSmsVerification: false,
      enableAdminAutoDetection: true,
      adminFieldMapping: 'is_admin',
      disableSmsService: false,
      preserveSmsFields: true,
      enableDebugMode: false, // 🚨 必须关闭调试模式
      showDetailedErrors: false // 🚨 隐藏详细错误信息
    },

    business: {
      lottery: {
        enabled: true,
        engineVersion: '4.0.0',
        defaultStrategy: 'basic_guarantee',
        defaultCostPerDraw: 100,
        supportMultipleDraw: true,
        enableGuarantee: true
      },
      inventory: {
        enabled: true,
        enableUserInventory: true,
        supportTransfer: true,
        supportVerification: true
      },
      uploads: {
        enabled: true,
        storageProvider: 'sealos',
        manualReviewMode: true,
        maxFileSize: 10485760,
        allowedTypes: ['jpg', 'jpeg', 'png', 'gif']
      },
      permissions: {
        enabled: true,
        enableRoleBasedAccess: true,
        supportBatchCheck: true
      }
    },

    security: {
      enableFieldMapping: true,
      enableDataValidation: true,
      enableSafetyChecks: true,
      apiVersion: 'v4.0'
    }
  }
}

// 🔴 当前环境设置 - V4统一引擎测试环境
let CURRENT_ENV = 'testing' // development | mobile | testing | production
// ✅ 2025-09-27 环境切换：V4统一引擎架构测试环境
// 🌐 API地址: https://omqktqrtntnn.sealosbja.site/api/v4
// 📡 WebSocket地址: wss://omqktqrtntnn.sealosbja.site/ws
// 🔑 支持123456万能验证码（开发测试阶段）
// 🔐 SSL证书: 支持HTTPS和WSS协议
// �� V4统一抽奖引擎: 已启用

/**
 * 获取当前环境的完整配置
 * 
 * @description
 * 根据CURRENT_ENV获取对应环境的完整配置对象。
 * 
 * **支持的环境**:
 * - `development` - 开发环境（微信开发者工具）
 * - `mobile` - 真机调试环境
 * - `testing` - 测试环境（云端测试服务器）
 * - `production` - 生产环境（正式服务器）
 * 
 * **配置包含**:
 * - API服务配置（baseUrl、apiPrefix、timeout等）
 * - WebSocket配置（url、reconnectInterval等）
 * - 开发阶段配置（万能验证码、调试模式等）
 * - 业务模块配置（抽奖、库存、上传、权限）
 * - 安全配置（字段映射、数据验证等）
 * 
 * **降级策略**:
 * - 如果CURRENT_ENV无效，自动降级到development环境
 * 
 * @returns {object} 当前环境的完整配置对象
 * 
 * @example
 * // 获取当前环境配置
 * const config = getConfig()
 * console.log('当前环境:', config)
 * console.log('API地址:', config.api.baseUrl)
 * console.log('是否开发模式:', config.development.enableUnifiedAuth)
 * 
 * @since 2025-10-31
 * @version 4.0.0
 * @see {@link getApiConfig} 获取API专项配置
 * @see {@link getDevelopmentConfig} 获取开发阶段配置
 */
function getConfig() {
  const config = ENV_CONFIG[CURRENT_ENV]
  if (!config) {
    console.error(`❌ 无效的环境配置: ${CURRENT_ENV}`)
    return ENV_CONFIG.development // 降级到开发环境
  }
  return config
}

/**
 * 获取API服务配置
 * 
 * @description
 * 获取当前环境的API服务相关配置，包含完整URL、超时设置、重试策略等。
 * 
 * **返回配置项**:
 * - `baseUrl` - API基础地址（如http://localhost:3000）
 * - `apiPrefix` - API路径前缀（/api/v4）
 * - `fullUrl` - 完整API地址（baseUrl + apiPrefix）
 * - `timeout` - 请求超时时间（毫秒）
 * - `retryTimes` - 失败重试次数
 * - `retryDelay` - 重试延迟时间（毫秒）
 * 
 * **使用场景**:
 * - APIClient初始化时配置
 * - API请求拦截器配置
 * - 网络诊断和健康检查
 * 
 * @returns {object} API配置对象
 * @returns {string} returns.baseUrl - API基础地址
 * @returns {string} returns.apiPrefix - API路径前缀
 * @returns {string} returns.fullUrl - 完整API地址
 * @returns {number} returns.timeout - 请求超时时间（毫秒）
 * @returns {number} returns.retryTimes - 失败重试次数
 * @returns {number} returns.retryDelay - 重试延迟时间（毫秒）
 * 
 * @example
 * // 在APIClient中使用
 * const { getApiConfig } = require('../config/env')
 * 
 * class APIClient {
 *   constructor() {
 *     const apiConfig = getApiConfig()
 *     this.baseURL = apiConfig.fullUrl
 *     this.timeout = apiConfig.timeout
 *     this.retryTimes = apiConfig.retryTimes
 *     console.log('API配置:', apiConfig)
 *     // => {
 *     //   baseUrl: 'https://omqktqrtntnn.sealosbja.site',
 *     //   apiPrefix: '/api/v4',
 *     //   fullUrl: 'https://omqktqrtntnn.sealosbja.site/api/v4',
 *     //   timeout: 30000,
 *     //   retryTimes: 3,
 *     //   retryDelay: 2000
 *     // }
 *   }
 * }
 * 
 * @since 2025-10-31
 * @version 4.0.0
 * @see {@link getConfig} 获取完整配置
 */
function getApiConfig() {
  const config = getConfig()
  return {
    baseUrl: config.api.baseUrl,
    apiPrefix: config.api.apiPrefix,
    fullUrl: `${config.api.baseUrl}${config.api.apiPrefix}`,
    timeout: config.api.timeout,
    retryTimes: config.api.retryTimes,
    retryDelay: config.api.retryDelay
  }
}

/**
 * 获取开发阶段特殊配置
 * 
 * @description
 * 获取开发阶段的特殊配置，包含万能验证码、调试模式等开发便利功能。
 * 
 * **配置项说明**:
 * - `enableUnifiedAuth` - 是否启用V4统一认证（开发/测试环境true，生产环境false）
 * - `mockVerificationCode` - 万能验证码（开发/测试为'123456'，生产为null）
 * - `skipSmsVerification` - 是否跳过短信验证
 * - `enableAdminAutoDetection` - 是否启用管理员自动检测
 * - `adminFieldMapping` - 管理员字段映射（'is_admin'）
 * - `disableSmsService` - 是否禁用短信服务
 * - `preserveSmsFields` - 是否保留短信字段
 * - `enableDebugMode` - 是否启用调试模式
 * - `showDetailedErrors` - 是否显示详细错误信息
 * 
 * **业务场景**:
 * - 验证码验证时检查是否启用万能验证码
 * - 登录时判断是否需要发送短信
 * - 错误处理时决定是否显示详细信息
 * - 管理员权限识别
 * 
 * **⚠️ 安全提示**:
 * - 万能验证码123456仅用于开发和测试环境
 * - 生产环境必须禁用万能验证码（enableUnifiedAuth=false）
 * - 生产环境必须关闭详细错误信息（showDetailedErrors=false）
 * 
 * @returns {object} 开发阶段配置对象
 * @returns {boolean} returns.enableUnifiedAuth - 是否启用V4统一认证
 * @returns {string|null} returns.mockVerificationCode - 万能验证码
 * @returns {boolean} returns.skipSmsVerification - 是否跳过短信验证
 * @returns {boolean} returns.enableAdminAutoDetection - 是否启用管理员自动检测
 * @returns {string} returns.adminFieldMapping - 管理员字段映射
 * @returns {boolean} returns.disableSmsService - 是否禁用短信服务
 * @returns {boolean} returns.preserveSmsFields - 是否保留短信字段
 * @returns {boolean} returns.enableDebugMode - 是否启用调试模式
 * @returns {boolean} returns.showDetailedErrors - 是否显示详细错误
 * 
 * @example
 * // 在验证码验证中使用
 * const { getDevelopmentConfig } = require('../config/env')
 * 
 * function validateVerificationCode(code) {
 *   const devConfig = getDevelopmentConfig()
 *   
 *   // 开发/测试环境支持万能验证码
 *   if (devConfig.enableUnifiedAuth && code === '123456') {
 *     return { isValid: true, isDevelopmentCode: true }
 *   }
 *   
 *   // 正常验证逻辑...
 * }
 * 
 * @example
 * // 错误处理时使用
 * const devConfig = getDevelopmentConfig()
 * if (devConfig.showDetailedErrors) {
 *   console.error('详细错误信息:', error.stack)
 * }
 * 
 * @since 2025-10-31
 * @version 4.0.0
 * @see {@link isDevelopmentPhase} 检查是否为开发阶段
 */
function getDevelopmentConfig() {
  const config = getConfig()
  return config.development
}

/**
 * 获取业务模块配置
 * 
 * @description
 * 获取V4统一引擎的业务模块配置（抽奖、库存、上传、权限）。
 * 
 * **支持的业务模块**:
 * - `lottery` - V4统一抽奖引擎配置
 *   - `enabled` - 是否启用
 *   - `engineVersion` - 引擎版本（'4.0.0'）
 *   - `defaultStrategy` - 默认策略（'basic_guarantee'）
 *   - `defaultCostPerDraw` - 默认单抽消耗（100积分）
 *   - `supportMultipleDraw` - 是否支持连抽
 *   - `enableGuarantee` - 是否启用保底机制
 * 
 * - `inventory` - V4库存管理系统配置
 *   - `enabled` - 是否启用
 *   - `enableUserInventory` - 是否启用用户库存
 *   - `supportTransfer` - 是否支持转让
 *   - `supportVerification` - 是否支持核销
 * 
 * - `uploads` - V4图片上传系统配置（Sealos对象存储）
 *   - `enabled` - 是否启用
 *   - `storageProvider` - 存储提供商（'sealos'）
 *   - `manualReviewMode` - 是否手动审核
 *   - `maxFileSize` - 最大文件大小（10MB）
 *   - `allowedTypes` - 允许的文件类型
 * 
 * - `permissions` - V4权限管理系统配置
 *   - `enabled` - 是否启用
 *   - `enableRoleBasedAccess` - 是否启用基于角色的访问控制
 *   - `supportBatchCheck` - 是否支持批量检查
 * 
 * @param {string|null} [businessType=null] - 业务类型（'lottery'|'inventory'|'uploads'|'permissions'，为null返回全部）
 * @returns {object} 业务配置对象
 * 
 * @example
 * // 获取抽奖引擎配置
 * const { getBusinessConfig } = require('../config/env')
 * 
 * const lotteryConfig = getBusinessConfig('lottery')
 * console.log('抽奖引擎版本:', lotteryConfig.engineVersion)
 * console.log('是否支持连抽:', lotteryConfig.supportMultipleDraw)
 * // => { enabled: true, engineVersion: '4.0.0', ... }
 * 
 * @example
 * // 获取所有业务配置
 * const allBusinessConfig = getBusinessConfig()
 * console.log('所有业务模块:', allBusinessConfig)
 * // => { lottery: {...}, inventory: {...}, uploads: {...}, permissions: {...} }
 * 
 * @example
 * // 检查库存模块是否启用
 * const inventoryConfig = getBusinessConfig('inventory')
 * if (inventoryConfig.enabled) {
 *   console.log('库存管理系统已启用')
 * }
 * 
 * @since 2025-10-31
 * @version 4.0.0
 * @see {@link getConfig} 获取完整配置
 */
function getBusinessConfig(businessType = null) {
  const config = getConfig()
  if (businessType) {
    return config.business[businessType] || {}
  }
  return config.business
}

/**
 * 获取V4数据安全配置
 * 
 * @description
 * 获取V4统一引擎的数据安全相关配置。
 * 
 * **配置项说明**:
 * - `enableFieldMapping` - 是否启用字段映射（数据脱敏）
 * - `enableDataValidation` - 是否启用数据验证
 * - `enableSafetyChecks` - 是否启用安全检查
 * - `apiVersion` - API版本标识（'v4.0'）
 * 
 * **业务场景**:
 * - API响应数据处理时进行字段映射
 * - 表单提交前进行数据验证
 * - 敏感数据传输前进行安全检查
 * 
 * @returns {object} 安全配置对象
 * @returns {boolean} returns.enableFieldMapping - 是否启用字段映射
 * @returns {boolean} returns.enableDataValidation - 是否启用数据验证
 * @returns {boolean} returns.enableSafetyChecks - 是否启用安全检查
 * @returns {string} returns.apiVersion - API版本标识
 * 
 * @example
 * // 获取安全配置
 * const { getSecurityConfig } = require('../config/env')
 * 
 * const securityConfig = getSecurityConfig()
 * if (securityConfig.enableFieldMapping) {
 *   console.log('字段映射已启用，将进行数据脱敏')
 * }
 * console.log('API版本:', securityConfig.apiVersion)
 * // => { enableFieldMapping: true, enableDataValidation: true, ... }
 * 
 * @since 2025-10-31
 * @version 4.0.0
 * @see {@link getConfig} 获取完整配置
 */
function getSecurityConfig() {
  const config = getConfig()
  return config.security
}

/**
 * 获取WebSocket服务配置
 * 
 * @description
 * 获取当前环境的WebSocket服务配置，用于实时通信功能。
 * 
 * **配置项说明**:
 * - `url` - WebSocket服务地址（ws://或wss://）
 * - `reconnectInterval` - 重连间隔时间（毫秒）
 * - `maxReconnectAttempts` - 最大重连次数
 * - `heartbeatInterval` - 心跳间隔时间（毫秒）
 * - `enableHeartbeat` - 是否启用心跳机制
 * 
 * **业务场景**:
 * - 商品库存实时更新（交易市场）
 * - 在线客服聊天功能
 * - 实时消息推送
 * 
 * **降级策略**:
 * - 如果当前环境没有配置WebSocket，返回默认配置
 * 
 * @returns {object} WebSocket配置对象
 * @returns {string} returns.url - WebSocket服务地址
 * @returns {number} returns.reconnectInterval - 重连间隔（毫秒）
 * @returns {number} returns.maxReconnectAttempts - 最大重连次数
 * @returns {number} returns.heartbeatInterval - 心跳间隔（毫秒）
 * @returns {boolean} returns.enableHeartbeat - 是否启用心跳
 * 
 * @example
 * // 获取WebSocket配置
 * const { getWebSocketConfig } = require('../config/env')
 * 
 * const wsConfig = getWebSocketConfig()
 * console.log('WebSocket地址:', wsConfig.url)
 * console.log('重连间隔:', wsConfig.reconnectInterval)
 * // => {
 * //   url: 'wss://omqktqrtntnn.sealosbja.site/ws',
 * //   reconnectInterval: 3000,
 * //   maxReconnectAttempts: 5,
 * //   heartbeatInterval: 30000,
 * //   enableHeartbeat: true
 * // }
 * 
 * @example
 * // 初始化WebSocket连接
 * const wsConfig = getWebSocketConfig()
 * const socket = wx.connectSocket({
 *   url: wsConfig.url,
 *   success: () => {
 *     console.log('WebSocket连接成功')
 *   }
 * })
 * 
 * @since 2025-10-31
 * @version 4.0.0
 * @see {@link getWsUrl} 快速获取WebSocket URL
 */
function getWebSocketConfig() {
  const config = getConfig()
  return (
    config.websocket || {
      url: 'ws://localhost:3000/ws',
      reconnectInterval: 3000,
      maxReconnectAttempts: 5,
      heartbeatInterval: 30000,
      enableHeartbeat: true
    }
  )
}

/**
 * 快速获取WebSocket服务地址
 * 
 * @description
 * 获取当前环境的WebSocket服务地址（简化版本）。
 * 
 * **使用场景**:
 * - 只需要WebSocket URL，不需要完整配置
 * - 快速初始化WebSocket连接
 * 
 * @returns {string} WebSocket服务地址（如'wss://omqktqrtntnn.sealosbja.site/ws'）
 * 
 * @example
 * // 快速获取WebSocket URL
 * const { getWsUrl } = require('../config/env')
 * 
 * const wsUrl = getWsUrl()
 * console.log('WebSocket地址:', wsUrl)
 * // => 'wss://omqktqrtntnn.sealosbja.site/ws'
 * 
 * @example
 * // 直接用于连接
 * wx.connectSocket({
 *   url: getWsUrl()
 * })
 * 
 * @since 2025-10-31
 * @version 4.0.0
 * @see {@link getWebSocketConfig} 获取完整WebSocket配置
 */
function getWsUrl() {
  const wsConfig = getWebSocketConfig()
  return wsConfig.url
}

/**
 * 检查是否为开发阶段（启用了万能验证码）
 * 
 * @description
 * 检查当前环境是否为开发阶段，判断依据是是否启用了V4统一认证和短信验证跳过。
 * 
 * **判断逻辑**:
 * - `enableUnifiedAuth === true` 且 `skipSmsVerification === true` → 开发阶段
 * - 否则 → 非开发阶段（生产环境）
 * 
 * **业务场景**:
 * - 验证码验证时判断是否使用万能验证码
 * - 登录流程中判断是否跳过短信验证
 * - 调试功能的条件性开启
 * 
 * **环境说明**:
 * - development环境: true
 * - mobile环境: true
 * - testing环境: true
 * - production环境: false（必须）
 * 
 * @returns {boolean} 是否为开发阶段
 * 
 * @example
 * // 验证码验证中使用
 * const { isDevelopmentPhase } = require('../config/env')
 * 
 * function validateCode(code) {
 *   if (isDevelopmentPhase() && code === '123456') {
 *     console.log('开发阶段，使用万能验证码')
 *     return true
 *   }
 *   
 *   // 正常验证逻辑
 *   return code.length === 6 && /^\d{6}$/.test(code)
 * }
 * 
 * @example
 * // 调试信息显示
 * if (isDevelopmentPhase()) {
 *   console.log('开发模式，显示详细调试信息')
 * }
 * 
 * @since 2025-10-31
 * @version 4.0.0
 * @see {@link getDevelopmentConfig} 获取开发阶段完整配置
 */
function isDevelopmentPhase() {
  const devConfig = getDevelopmentConfig()
  return devConfig.enableUnifiedAuth && devConfig.skipSmsVerification
}

/**
 * 获取当前运行环境名称
 * 
 * @description
 * 返回当前运行的环境名称。
 * 
 * **可能的返回值**:
 * - `'development'` - 开发环境（微信开发者工具）
 * - `'mobile'` - 真机调试环境
 * - `'testing'` - 测试环境（云端测试服务器）
 * - `'production'` - 生产环境（正式服务器）
 * 
 * **使用场景**:
 * - 日志记录中标识环境
 * - 条件性功能开启
 * - 环境诊断和调试
 * 
 * @returns {string} 当前环境名称
 * 
 * @example
 * // 获取当前环境
 * const { getCurrentEnv } = require('../config/env')
 * 
 * const env = getCurrentEnv()
 * console.log('当前环境:', env)
 * // => 'testing'
 * 
 * @example
 * // 根据环境执行不同逻辑
 * if (getCurrentEnv() === 'production') {
 *   console.log('生产环境，禁用调试功能')
 * }
 * 
 * @since 2025-10-31
 * @version 4.0.0
 * @see {@link setEnv} 切换环境（仅开发调试）
 */
function getCurrentEnv() {
  return CURRENT_ENV
}

/**
 * 切换运行环境（⚠️ 仅开发调试使用）
 * 
 * @description
 * 动态切换当前运行环境，用于开发调试和测试。
 * 
 * **⚠️ 重要警告**:
 * - 此函数仅用于开发调试
 * - 生产环境不应使用此函数
 * - 切换环境后立即生效，影响所有API请求
 * 
 * **支持的环境**:
 * - `'development'` - 开发环境
 * - `'mobile'` - 真机调试环境
 * - `'testing'` - 测试环境
 * - `'production'` - 生产环境
 * 
 * **使用场景**:
 * - 开发时快速切换测试环境
 * - 调试不同环境的配置
 * - 测试环境切换逻辑
 * 
 * @param {string} envName - 环境名称（'development'|'mobile'|'testing'|'production'）
 * @returns {boolean} 切换是否成功
 * 
 * @example
 * // 切换到测试环境
 * const { setEnv } = require('../config/env')
 * 
 * const success = setEnv('testing')
 * if (success) {
 *   console.log('已切换到测试环境')
 * }
 * // => true
 * 
 * @example
 * // 切换到开发环境
 * setEnv('development')
 * console.log('当前环境:', getCurrentEnv())
 * // => 'development'
 * 
 * @example
 * // 无效环境名称
 * const result = setEnv('invalid')
 * // => false，控制台输出错误信息
 * 
 * @since 2025-10-31
 * @version 4.0.0
 * @see {@link switchToDevTools} 快速切换到开发环境
 * @see {@link switchToMobile} 快速切换到真机环境
 */
function setEnv(envName) {
  if (ENV_CONFIG[envName]) {
    CURRENT_ENV = envName
    console.log(`🔧 环境已切换到: ${envName}`)
    return true
  }
  console.error(`❌ 无效的环境名称: ${envName}`)
  return false
}

/**
 * 快速切换到开发者工具环境
 * 
 * @description
 * 快捷方法，将环境切换到development（微信开发者工具环境）。
 * 
 * **相当于**: `setEnv('development')`
 * 
 * **使用场景**:
 * - 从真机调试切换回开发者工具
 * - 开发调试时的快速切换
 * 
 * @returns {boolean} 切换是否成功
 * 
 * @example
 * // 快速切换到开发环境
 * const { switchToDevTools } = require('../config/env')
 * 
 * switchToDevTools()
 * console.log('当前环境:', getCurrentEnv())
 * // => 'development'
 * 
 * @since 2025-10-31
 * @version 4.0.0
 * @see {@link setEnv} 通用环境切换函数
 * @see {@link switchToMobile} 切换到真机环境
 */
function switchToDevTools() {
  return setEnv('development')
}

/**
 * 快速切换到真机调试环境
 * 
 * @description
 * 快捷方法，将环境切换到mobile（真机调试环境）。
 * 
 * **相当于**: `setEnv('mobile')`
 * 
 * **使用场景**:
 * - 真机调试时切换环境
 * - 测试真机特定功能
 * 
 * **环境说明**:
 * - mobile环境默认API地址: http://192.168.43.12:3000
 * - 需要确保手机和电脑在同一网络
 * 
 * @returns {boolean} 切换是否成功
 * 
 * @example
 * // 快速切换到真机环境
 * const { switchToMobile } = require('../config/env')
 * 
 * switchToMobile()
 * console.log('当前环境:', getCurrentEnv())
 * // => 'mobile'
 * 
 * @since 2025-10-31
 * @version 4.0.0
 * @see {@link setEnv} 通用环境切换函数
 * @see {@link switchToDevTools} 切换到开发环境
 * @see {@link isMobileDebug} 检查是否为真机环境
 */
function switchToMobile() {
  return setEnv('mobile')
}

/**
 * 检查当前是否为真机调试环境
 * 
 * @description
 * 判断当前运行环境是否为mobile（真机调试环境）。
 * 
 * **判断逻辑**:
 * - `CURRENT_ENV === 'mobile'` → true
 * - 否则 → false
 * 
 * **使用场景**:
 * - 真机特定功能的条件判断
 * - 日志输出时标识环境
 * - 调试信息显示
 * 
 * @returns {boolean} 是否为真机调试环境
 * 
 * @example
 * // 判断是否为真机环境
 * const { isMobileDebug } = require('../config/env')
 * 
 * if (isMobileDebug()) {
 *   console.log('真机调试模式，启用特定功能')
 * }
 * 
 * @example
 * // 根据环境显示不同日志
 * if (isMobileDebug()) {
 *   console.log('真机环境 - API地址:', getApiConfig().baseUrl)
 * } else {
 *   console.log('其他环境')
 * }
 * 
 * @since 2025-10-31
 * @version 4.0.0
 * @see {@link switchToMobile} 切换到真机环境
 * @see {@link getCurrentEnv} 获取当前环境名称
 */
function isMobileDebug() {
  return CURRENT_ENV === 'mobile'
}

// 🔴 导出配置
module.exports = {
  getConfig,
  getCurrentEnv,
  setEnv,
  isDevelopmentPhase,
  getDevelopmentConfig,
  getApiConfig,
  getBusinessConfig,
  getSecurityConfig,
  getWebSocketConfig,
  getWsUrl,

  // 🔧 新增：环境切换辅助方法
  switchToDevTools,
  switchToMobile,
  isMobileDebug,

  // 版本信息
  version: '4.0.0', // 🔧 V4统一引擎架构版本
  lastUpdated: '2025-09-27T21:17:00+08:00'
}
