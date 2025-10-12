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
// const UserInventoryService = require('./UserInventoryService') // TODO: 待实现
// const PhotoUploadService = require('./PhotoUploadService') // TODO: 待实现

// V4 模块化服务
const { lottery_service_container } = require('./lottery')

// 数据库模型
const models = require('../models')

class ServiceManager {
  constructor () {
    this.models = models
    this._services = new Map()
    this._initialized = false
  }

  /**
   * 初始化所有服务
   */
  async initialize () {
    if (this._initialized) {
      return
    }

    try {
      console.log('🚀 初始化V4服务管理器...')

      // ✅ 注册V4统一抽奖引擎（移除旧版LotteryDrawService）
      this._services.set('unifiedLotteryEngine', new UnifiedLotteryEngine(this.models))

      // 注册其他核心服务
      // this._services.set('userInventory', new UserInventoryService(this.models)) // TODO: 待实现
      // this._services.set('photoUpload', new PhotoUploadService(this.models)) // TODO: 待实现
      this._services.set('thumbnail', new ThumbnailService(this.models))

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
   * @returns {boolean}
   */
  hasService (serviceName) {
    return this._services.has(serviceName)
  }

  /**
   * 获取所有服务列表
   * @returns {Array<string>}
   */
  getServiceList () {
    return Array.from(this._services.keys())
  }

  /**
   * 获取服务健康状态
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
    getService: (serviceName) => serviceManager.getService(serviceName),

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
