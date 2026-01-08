/**
 * 统一测试管理器 - UnifiedTestManager
 *
 * 职责：
 * - 集成 ServiceManager 到测试基础设施
 * - 提供测试中服务获取的统一入口
 * - 确保测试使用与业务代码相同的服务获取方式
 * - 管理测试生命周期（初始化/清理）
 *
 * P1-9 决策对齐（2026-01-09）：
 * - J2-RepoWide：全仓统一，测试也必须通过 ServiceManager 获取服务
 * - E2-Strict：强制使用 snake_case key
 * - B1-Injected：提供与 req.app.locals.services 相似的注入方式
 *
 * 使用方式：
 * ```javascript
 * // 在测试文件中
 * const { getTestService, getTestServiceManager } = require('../helpers/UnifiedTestManager')
 *
 * // 获取服务（使用 snake_case key，与路由层保持一致）
 * const BackpackService = getTestService('backpack')
 * const AssetService = getTestService('asset')
 *
 * // 或者获取 ServiceManager 实例（用于更复杂的场景）
 * const serviceManager = getTestServiceManager()
 * const service = serviceManager.getService('market_listing')
 * ```
 *
 * 创建时间：2026-01-09
 * 版本：1.0.0
 */

'use strict'

// 确保测试环境
if (!process.env.NODE_ENV) {
  process.env.NODE_ENV = 'test'
}

// 加载 .env 配置（单一真相源）
if (!process.env.DB_HOST) {
  require('dotenv').config()
}

/**
 * ServiceManager 引用（延迟加载，避免循环依赖）
 * @type {import('../../services/index')|null}
 */
let serviceManagerInstance = null

/**
 * 初始化状态标志
 * @type {boolean}
 */
let initialized = false

/**
 * 初始化 ServiceManager
 *
 * 说明：
 * - 确保 ServiceManager 只初始化一次
 * - 返回初始化后的 ServiceManager 实例
 * - 如果已初始化，直接返回现有实例
 *
 * @returns {Promise<Object>} ServiceManager 实例
 * @throws {Error} 初始化失败时抛出错误
 */
async function initializeTestServiceManager() {
  if (initialized && serviceManagerInstance) {
    return serviceManagerInstance
  }

  try {
    // 延迟加载 ServiceManager（避免模块加载顺序问题）
    serviceManagerInstance = require('../../services')

    // 检查是否需要初始化
    if (!serviceManagerInstance._initialized) {
      await serviceManagerInstance.initialize()
      console.log('✅ [UnifiedTestManager] ServiceManager 初始化完成')
      console.log(
        `📊 [UnifiedTestManager] 已注册服务数量: ${serviceManagerInstance.getServiceList().length}`
      )
    }

    initialized = true
    return serviceManagerInstance
  } catch (error) {
    console.error('❌ [UnifiedTestManager] ServiceManager 初始化失败:', error.message)
    throw error
  }
}

/**
 * 获取 ServiceManager 实例（同步版本）
 *
 * 说明：
 * - 用于需要 ServiceManager 实例的场景
 * - 如果 ServiceManager 尚未初始化，会抛出错误
 * - 推荐在 beforeAll 中先调用 initializeTestServiceManager()
 *
 * @returns {Object} ServiceManager 实例
 * @throws {Error} 如果 ServiceManager 尚未初始化
 */
function getTestServiceManager() {
  if (!serviceManagerInstance) {
    // 尝试同步加载（假设已在 jest.setup.js 中初始化）
    serviceManagerInstance = require('../../services')
  }

  if (!serviceManagerInstance._initialized) {
    console.warn('⚠️ [UnifiedTestManager] ServiceManager 尚未完全初始化，某些服务可能不可用')
  }

  return serviceManagerInstance
}

/**
 * 获取测试服务（同步版本）
 *
 * 说明：
 * - 提供与路由层 req.app.locals.services.getService() 相似的接口
 * - 强制使用 snake_case key（P1-9 E2-Strict）
 * - 如果使用 camelCase key，会自动抛出错误并提供迁移提示
 *
 * @param {string} serviceName - 服务名称（必须使用 snake_case）
 * @returns {Object} 服务实例
 * @throws {Error} 如果服务不存在或使用了旧 key
 *
 * @example
 * // ✅ 正确：使用 snake_case key
 * const BackpackService = getTestService('backpack')
 * const MarketListingService = getTestService('market_listing')
 *
 * // ❌ 错误：使用 camelCase key（会抛出错误并提供迁移提示）
 * const MarketListingService = getTestService('marketListing')
 */
function getTestService(serviceName) {
  const manager = getTestServiceManager()
  return manager.getService(serviceName)
}

/**
 * 创建模拟的 app.locals.services 对象
 *
 * 说明：
 * - 用于测试需要 req.app.locals.services 的场景
 * - 提供与业务代码相同的接口
 * - 适用于集成测试和路由测试
 *
 * @returns {Object} 模拟的 services 对象
 *
 * @example
 * // 在测试中模拟请求上下文
 * const mockRequest = {
 *   app: {
 *     locals: {
 *       services: createMockAppServices()
 *     }
 *   }
 * }
 *
 * // 在路由处理函数中使用
 * const MarketListingService = mockRequest.app.locals.services.getService('market_listing')
 */
function createMockAppServices() {
  const manager = getTestServiceManager()

  return {
    /**
     * 获取服务实例（与 app.locals.services.getService 保持一致）
     * @param {string} serviceName - 服务名称（必须使用 snake_case）
     * @returns {Object} 服务实例
     */
    getService: serviceName => manager.getService(serviceName),

    /**
     * 获取所有服务
     * @returns {Map} 服务 Map
     */
    getAllServices: () => manager._services,

    /**
     * 获取服务健康状态
     * @returns {Promise<Object>} 健康状态
     */
    getHealthStatus: () => manager.getHealthStatus()
  }
}

/**
 * 清理测试 ServiceManager
 *
 * 说明：
 * - 用于测试结束后清理资源
 * - 关闭所有有状态服务（WebSocket、定时器等）
 * - 重置初始化状态
 *
 * @returns {Promise<void>}
 */
async function cleanupTestServiceManager() {
  if (serviceManagerInstance && serviceManagerInstance._initialized) {
    try {
      await serviceManagerInstance.shutdown()
      console.log('✅ [UnifiedTestManager] ServiceManager 已关闭')
    } catch (error) {
      console.warn('⚠️ [UnifiedTestManager] ServiceManager 关闭时出错:', error.message)
    }
  }

  // 重置状态（允许重新初始化）
  initialized = false
  // 注意：不重置 serviceManagerInstance，因为它是单例
}

/**
 * 检查 ServiceManager 是否已初始化
 *
 * @returns {boolean} 是否已初始化
 */
function isTestServiceManagerInitialized() {
  return initialized && serviceManagerInstance && serviceManagerInstance._initialized
}

/**
 * 获取可用服务列表
 *
 * 说明：
 * - 用于调试和文档生成
 * - 返回所有已注册的服务名称（snake_case）
 *
 * @returns {string[]} 服务名称列表
 */
function getAvailableTestServices() {
  if (!serviceManagerInstance) {
    console.warn('⚠️ [UnifiedTestManager] ServiceManager 尚未加载，返回空列表')
    return []
  }

  return serviceManagerInstance.getServiceList()
}

/**
 * 验证服务获取（用于测试迁移验证）
 *
 * 说明：
 * - 验证指定的服务是否可以正常获取
 * - 用于迁移验证脚本
 *
 * @param {string[]} serviceNames - 要验证的服务名称列表
 * @returns {Object} 验证结果 { success: boolean, results: Array<{name, success, error?}> }
 */
function validateTestServiceAccess(serviceNames) {
  const results = serviceNames.map(name => {
    try {
      const service = getTestService(name)
      return {
        name,
        success: !!service,
        type: typeof service
      }
    } catch (error) {
      return {
        name,
        success: false,
        error: error.message
      }
    }
  })

  return {
    success: results.every(r => r.success),
    results
  }
}

// ========== 导出 ==========

module.exports = {
  // 核心方法
  initializeTestServiceManager,
  getTestServiceManager,
  getTestService,

  // 辅助方法
  createMockAppServices,
  cleanupTestServiceManager,
  isTestServiceManagerInitialized,
  getAvailableTestServices,
  validateTestServiceAccess
}
