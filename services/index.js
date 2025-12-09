/**
 * 服务管理器 - V4统一版本
 * 管理系统中所有服务的生命周期
 *
 * @description 基于V4架构，移除向后兼容代码
 * @version 4.0.0
 * @date 2025-09-25
 */

// V4 核心服务
const { UnifiedLotteryEngine } = require('./UnifiedLotteryEngine/UnifiedLotteryEngine')
const { ThumbnailService } = require('./ThumbnailService') // 🎯 导入类

// V4 领域服务
const InventoryService = require('./InventoryService')
const PointsService = require('./PointsService')
const ExchangeMarketService = require('./ExchangeMarketService')
const ExchangeOperationService = require('./ExchangeOperationService')
const ContentAuditEngine = require('./ContentAuditEngine')
const AnnouncementService = require('./AnnouncementService')
const NotificationService = require('./NotificationService')
const ConsumptionService = require('./ConsumptionService')
const CustomerServiceSessionService = require('./CustomerServiceSessionService')
const HierarchyManagementService = require('./HierarchyManagementService')
const UserRoleService = require('./UserRoleService')

// V4 模块化服务
const { lottery_service_container } = require('./lottery')

// 数据库模型
const models = require('../models')

/**
 * 服务管理器 - V4统一版本
 *
 * 业务场景：
 * - 统一管理整个后端系统的所有服务实例
 * - 提供服务生命周期管理（初始化、获取、关闭）
 * - 实现服务单例模式（避免重复实例化）
 * - 提供服务健康检查和监控功能
 *
 * 管理的服务：
 * - unifiedLotteryEngine：V4统一抽奖引擎
 * - thumbnail：缩略图服务
 * - lotteryContainer：抽奖服务容器（包含user_service、history_service）
 * - 未来扩展：userInventory（用户库存服务）等
 *
 * 核心功能：
 * - initialize()：初始化所有服务
 * - getService(name)：获取指定服务实例
 * - hasService(name)：检查服务是否存在
 * - getServiceList()：获取所有服务名称列表
 * - getHealthStatus()：获取所有服务的健康状态
 * - shutdown()：优雅关闭所有服务
 *
 * 设计模式：
 * - 单例模式：确保ServiceManager全局唯一
 * - 依赖注入：服务通过constructor注入models依赖
 * - 工厂模式：通过getService()获取服务实例
 * - 容器模式：使用Map管理所有服务实例
 *
 * 使用方式：
 * ```javascript
 * const serviceManager = require('./services')
 *
 * // 初始化所有服务
 * await serviceManager.initialize()
 *
 * // 获取统一抽奖引擎
 * const lotteryEngine = serviceManager.getService('unifiedLotteryEngine')
 *
 * // 检查服务健康状态
 * const healthStatus = await serviceManager.getHealthStatus()
 *
 * // 优雅关闭所有服务
 * await serviceManager.shutdown()
 * ```
 *
 * 技术特性：
 * - 使用Map存储服务实例（性能优于Object）
 * - 异步初始化（支持服务异步启动）
 * - 错误隔离（单个服务失败不影响其他服务）
 * - 健康检查（自动检测服务健康状态）
 * - 优雅关闭（确保资源正确释放）
 *
 * 安全设计：
 * - 防止未初始化访问（getService()会检查初始化状态）
 * - 防止重复初始化（_initialized标志）
 * - 错误传播控制（shutdown()时隔离单个服务错误）
 *
 * 性能优化：
 * - 单例模式减少实例化开销
 * - 懒加载设计（需要时才初始化）
 * - 使用Map提升查找性能
 *
 * 架构升级说明：
 * - V4版本移除了所有向后兼容代码
 * - 移除了旧版LotteryDrawService（替换为UnifiedLotteryEngine）
 * - 采用模块化设计（lottery服务独立容器）
 *
 * 创建时间：2025年09月25日
 * 最后更新：2025年10月30日
 *
 * @class ServiceManager
 */
class ServiceManager {
  /**
   * 构造函数 - 初始化服务管理器
   *
   * 功能说明：
   * - 存储数据库模型引用（供服务使用）
   * - 创建服务实例存储容器（Map）
   * - 初始化状态标志（_initialized）
   *
   * 设计决策：
   * - 使用Map而非Object存储服务（性能更好）
   * - 在constructor中不进行服务实例化（延迟到initialize()）
   *
   * @constructor
   */
  constructor () {
    this.models = models
    this._services = new Map()
    this._initialized = false
  }

  /**
   * 初始化所有服务
   *
   * 业务场景：
   * - 应用启动时统一初始化所有服务
   * - 确保服务按正确顺序初始化
   * - 防止重复初始化
   *
   * 初始化的服务：
   * - unifiedLotteryEngine：V4统一抽奖引擎
   * - thumbnail：缩略图服务
   * - lotteryContainer：抽奖服务容器
   *
   * @async
   * @returns {Promise<void>} 初始化完成后resolve，失败则抛出错误
   * @throws {Error} 当服务初始化失败时抛出错误
   */
  async initialize () {
    if (this._initialized) {
      return
    }

    try {
      console.log('🚀 初始化V4服务管理器...')

      // ✅ 注册V4统一抽奖引擎（移除旧版LotteryDrawService）
      this._services.set('unifiedLotteryEngine', new UnifiedLotteryEngine(this.models))

      // ✅ 注册缩略图服务
      this._services.set('thumbnail', new ThumbnailService(this.models))

      // ✅ 注册领域服务（Domain Services）
      this._services.set('inventory', InventoryService)
      this._services.set('points', PointsService)
      this._services.set('exchangeMarket', ExchangeMarketService)
      this._services.set('exchangeOperation', ExchangeOperationService)
      this._services.set('contentAudit', ContentAuditEngine)
      this._services.set('announcement', AnnouncementService)
      this._services.set('notification', NotificationService)
      this._services.set('consumption', ConsumptionService)
      this._services.set('customerServiceSession', CustomerServiceSessionService)
      this._services.set('hierarchyManagement', HierarchyManagementService)
      this._services.set('userRole', UserRoleService)

      // 注册模块化抽奖服务容器
      this._services.set('lotteryContainer', lottery_service_container)

      this._initialized = true
      console.log('✅ V4服务管理器初始化完成')
      console.log(`📊 已注册服务: ${Array.from(this._services.keys()).join(', ')}`)
    } catch (error) {
      console.error('❌ 服务管理器初始化失败:', error)
      throw error
    }
  }

  /**
   * 获取服务实例
   * @param {string} serviceName - 服务名称
   * @returns {Object} 服务实例
   */
  getService (serviceName) {
    if (!this._initialized) {
      throw new Error('服务管理器尚未初始化，请先调用 initialize()')
    }

    const service = this._services.get(serviceName)
    if (!service) {
      const availableServices = Array.from(this._services.keys()).join(', ')
      throw new Error(`服务 "${serviceName}" 不存在。可用服务: ${availableServices}`)
    }

    return service
  }

  /**
   * 检查服务是否存在
   * @param {string} serviceName - 服务名称
   * @returns {boolean} 服务存在返回true，否则返回false
   */
  hasService (serviceName) {
    return this._services.has(serviceName)
  }

  /**
   * 获取所有服务列表
   * @returns {Array<string>} 所有已注册服务的名称数组
   */
  getServiceList () {
    return Array.from(this._services.keys())
  }

  /**
   * 获取服务健康状态
   *
   * 业务场景：
   * - 健康检查接口中验证所有服务状态
   * - 监控告警时检测服务异常
   * - 运维排查问题时诊断服务状态
   *
   * 返回格式：
   * {
   *   initialized: boolean,      // 服务管理器是否已初始化
   *   totalServices: number,     // 总服务数量
   *   services: {
   *     serviceName: {
   *       status: 'active' | 'error',
   *       message: string
   *     }
   *   }
   * }
   *
   * @async
   * @returns {Promise<Object>} 包含所有服务健康状态的对象
   */
  async getHealthStatus () {
    const status = {
      initialized: this._initialized,
      totalServices: this._services.size,
      services: {}
    }

    for (const [serviceName, service] of this._services.entries()) {
      try {
        // 检查服务是否有健康检查方法
        if (typeof service.getHealthStatus === 'function') {
          status.services[serviceName] = await service.getHealthStatus()
        } else if (typeof service.health === 'function') {
          status.services[serviceName] = await service.health()
        } else {
          status.services[serviceName] = {
            status: 'active',
            message: '服务运行正常（无健康检查接口）'
          }
        }
      } catch (error) {
        status.services[serviceName] = {
          status: 'error',
          message: error.message
        }
      }
    }

    return status
  }

  /**
   * 优雅关闭所有服务
   *
   * 业务场景：
   * - 应用关闭时释放所有服务资源
   * - 重启应用时先关闭旧服务
   * - 测试结束后清理服务实例
   *
   * 功能说明：
   * - 遍历所有服务，调用各自的shutdown()方法
   * - 错误隔离：单个服务关闭失败不影响其他服务
   * - 清空服务Map并重置初始化标志
   *
   * @async
   * @returns {Promise<void>} 所有服务关闭完成后resolve
   */
  async shutdown () {
    console.log('🛑 开始关闭服务管理器...')

    for (const [serviceName, service] of this._services.entries()) {
      try {
        if (typeof service.shutdown === 'function') {
          await service.shutdown()
          console.log(`✅ 服务 ${serviceName} 已关闭`)
        }
      } catch (error) {
        console.error(`❌ 服务 ${serviceName} 关闭失败:`, error)
      }
    }

    this._services.clear()
    this._initialized = false
    console.log('✅ 服务管理器已关闭')
  }
}

// 创建单例实例
const serviceManager = new ServiceManager()

/**
 * 初始化服务并返回服务容器
 * @param {Object} _models - 数据库模型
 * @returns {Object} 服务容器
 */
function initializeServices (_models) {
  const container = {
    // 提供getService方法来获取服务
    getService: serviceName => serviceManager.getService(serviceName),

    // 提供getAllServices方法
    getAllServices: () => serviceManager._services,

    // 提供服务健康状态
    getHealthStatus: () => serviceManager.getHealthStatus()
  }

  // 异步初始化
  serviceManager.initialize().catch(error => {
    console.error('服务管理器初始化失败:', error)
  })

  return container
}

module.exports = serviceManager
module.exports.initializeServices = initializeServices
