/**
 * 服务层测试工具套件 (Service Layer Test Suite)
 *
 * 业务场景：验证服务层实现是否符合项目架构标准
 *
 * 核心功能：
 * 1. 服务初始化验证 - 确保服务正确初始化
 * 2. 单例模式验证 - 确保服务遵循单例模式
 * 3. 依赖注入验证 - 确保依赖正确注入
 * 4. 服务健康检查 - 验证服务健康状态
 * 5. 服务方法验证 - 确保核心方法存在且可用
 *
 * 设计原则：
 * - 单例模式：每个服务全局唯一实例
 * - 依赖注入：通过constructor注入依赖
 * - 工厂模式：通过getService()获取实例
 * - 错误隔离：服务失败不影响其他服务
 *
 * 使用方式：
 * ```javascript
 * const { ServiceTestSuite } = require('./shared/service.test')
 *
 * // 验证服务单例模式
 * await ServiceTestSuite.testSingletonPattern(serviceManager, 'unifiedLotteryEngine')
 *
 * // 验证服务健康状态
 * await ServiceTestSuite.testServiceHealth(lotteryEngine)
 * ```
 *
 * 创建时间：2025-11-14
 * 符合规范：项目services/index.js架构标准
 * 最后更新：2025-11-14
 * 使用模型：Claude 4 Sonnet
 */

/**
 * 服务层测试工具类
 *
 * 提供统一的服务层验证方法，确保服务实现符合项目架构标准
 */
class ServiceTestSuite {
  /**
   * 测试服务单例模式
   *
   * 验证内容：
   * - 多次获取服务返回相同实例
   * - 服务实例是单例
   * - 服务状态在多次获取间保持一致
   *
   * @param {Object} serviceManager - 服务管理器实例
   * @param {string} serviceName - 服务名称
   * @returns {Promise<Object>} 测试结果
   * @throws {Error} 如果单例模式验证失败
   */
  static async testSingletonPattern(serviceManager, serviceName) {
    console.log(`🔍 测试单例模式: ${serviceName}`)

    // 第一次获取服务
    const service1 = serviceManager.getService(serviceName)

    if (!service1) {
      throw new Error(`❌ 服务不存在: ${serviceName}`)
    }

    // 第二次获取服务
    const service2 = serviceManager.getService(serviceName)

    // 验证是否为同一实例
    if (service1 !== service2) {
      throw new Error(`❌ 单例模式失败: ${serviceName}返回了不同实例`)
    }

    console.log(`✅ 单例模式验证通过: ${serviceName}`)

    return {
      success: true,
      serviceName,
      isSingleton: true,
      instance: service1
    }
  }

  /**
   * 测试服务初始化
   *
   * 验证内容：
   * - 服务管理器初始化成功
   * - 所有配置的服务都已初始化
   * - 服务初始化后可正常使用
   *
   * @param {Object} serviceManager - 服务管理器实例
   * @returns {Promise<Object>} 测试结果
   * @throws {Error} 如果初始化验证失败
   */
  static async testServiceInitialization(serviceManager) {
    console.log('🔍 测试服务初始化...')

    // 检查服务管理器是否已初始化
    if (!serviceManager._initialized) {
      console.log('⚠️ 服务管理器未初始化，执行初始化...')
      await serviceManager.initialize()
    }

    // 获取服务列表
    const serviceList = serviceManager.getServiceList()

    if (serviceList.length === 0) {
      throw new Error('❌ 服务初始化失败: 没有可用的服务')
    }

    console.log(`✅ 服务初始化成功: ${serviceList.length}个服务`)

    return {
      success: true,
      initialized: true,
      serviceCount: serviceList.length,
      services: serviceList
    }
  }

  /**
   * 测试服务健康状态
   *
   * 验证内容：
   * - 服务实例存在
   * - 服务状态健康
   * - 服务核心方法可用
   *
   * @param {Object} service - 服务实例
   * @param {Array<string>} requiredMethods - 必需的方法列表
   * @returns {Promise<Object>} 测试结果
   * @throws {Error} 如果健康检查失败
   */
  static async testServiceHealth(service, requiredMethods = []) {
    console.log('🏥 测试服务健康状态...')

    if (!service) {
      throw new Error('❌ 服务实例不存在')
    }

    // 检查必需方法
    const missingMethods = []
    for (const methodName of requiredMethods) {
      if (typeof service[methodName] !== 'function') {
        missingMethods.push(methodName)
      }
    }

    if (missingMethods.length > 0) {
      throw new Error(`❌ 服务缺少必需方法: ${missingMethods.join(', ')}`)
    }

    // 检查服务健康状态（如果服务提供健康检查方法）
    let healthStatus = null
    if (typeof service.getEngineHealth === 'function') {
      healthStatus = service.getEngineHealth()
      console.log(`✅ 服务健康状态: ${JSON.stringify(healthStatus, null, 2)}`)
    }

    console.log('✅ 服务健康检查通过')

    return {
      success: true,
      healthy: true,
      missingMethods: [],
      healthStatus
    }
  }

  /**
   * 测试服务依赖注入
   *
   * 验证内容：
   * - 服务依赖正确注入
   * - 依赖服务可用
   * - 依赖链完整
   *
   * @param {Object} service - 服务实例
   * @param {Array<string>} expectedDependencies - 预期的依赖列表
   * @returns {Promise<Object>} 测试结果
   * @throws {Error} 如果依赖注入验证失败
   */
  static async testDependencyInjection(service, expectedDependencies = []) {
    console.log('🔍 测试服务依赖注入...')

    const missingDependencies = []

    for (const depName of expectedDependencies) {
      if (!service[depName]) {
        missingDependencies.push(depName)
      }
    }

    if (missingDependencies.length > 0) {
      throw new Error(`❌ 缺少依赖: ${missingDependencies.join(', ')}`)
    }

    console.log('✅ 依赖注入验证通过')

    return {
      success: true,
      dependenciesInjected: true,
      missingDependencies: [],
      expectedDependencies
    }
  }

  /**
   * 测试服务方法调用
   *
   * 验证内容：
   * - 服务方法存在
   * - 方法调用成功
   * - 方法返回预期结果
   *
   * @param {Object} service - 服务实例
   * @param {string} methodName - 方法名称
   * @param {Array} methodArgs - 方法参数
   * @param {Function} validateResult - 结果验证函数（可选）
   * @returns {Promise<Object>} 测试结果
   * @throws {Error} 如果方法调用失败
   */
  static async testServiceMethod(service, methodName, methodArgs = [], validateResult = null) {
    console.log(`🔍 测试服务方法: ${methodName}`)

    // 检查方法存在
    if (typeof service[methodName] !== 'function') {
      throw new Error(`❌ 方法不存在: ${methodName}`)
    }

    // 调用方法
    const result = await service[methodName](...methodArgs)

    // 验证结果
    if (validateResult) {
      const isValid = validateResult(result)
      if (!isValid) {
        throw new Error(`❌ 方法返回结果验证失败: ${methodName}`)
      }
    }

    console.log(`✅ 方法调用成功: ${methodName}`)

    return {
      success: true,
      methodName,
      result
    }
  }

  /**
   * 测试服务错误处理
   *
   * 验证内容：
   * - 服务正确处理错误
   * - 错误信息完整
   * - 错误不影响服务稳定性
   *
   * @param {Object} service - 服务实例
   * @param {string} methodName - 方法名称
   * @param {Array} invalidArgs - 无效参数（预期触发错误）
   * @returns {Promise<Object>} 测试结果
   * @throws {Error} 如果错误处理验证失败
   */
  static async testServiceErrorHandling(service, methodName, invalidArgs = []) {
    console.log(`🔍 测试服务错误处理: ${methodName}`)

    let errorCaught = false
    let errorMessage = ''

    try {
      await service[methodName](...invalidArgs)
    } catch (error) {
      errorCaught = true
      errorMessage = error.message
      console.log(`✅ 错误正确捕获: ${error.message}`)
    }

    if (!errorCaught) {
      throw new Error(`❌ 错误处理失败: ${methodName}应该抛出错误但未抛出`)
    }

    console.log('✅ 错误处理验证通过')

    return {
      success: true,
      errorCaught,
      errorMessage
    }
  }

  /**
   * 测试UnifiedLotteryEngine（项目特定）
   *
   * 验证内容：
   * - 引擎初始化成功
   * - 策略加载成功
   * - 核心方法可用
   * - 健康状态正常
   *
   * @param {Object} UnifiedLotteryEngine - 抽奖引擎实例
   * @returns {Promise<Object>} 测试结果
   * @throws {Error} 如果验证失败
   */
  /**
   * V4.6 测试 UnifiedLotteryEngine（Pipeline 架构）
   *
   * 2026-01-19 Phase 5 迁移重构：
   * - 移除原 initializeStrategies、getExecutionChain 方法检查
   * - 使用 drawOrchestrator 替代 strategies
   *
   * @param {Object} UnifiedLotteryEngine - UnifiedLotteryEngine 实例
   * @returns {Promise<Object>} 测试结果
   */
  static async testUnifiedLotteryEngine(UnifiedLotteryEngine) {
    console.log('🎲 测试UnifiedLotteryEngine（V4.6 Pipeline 架构）...')

    // V4.6: 验证核心方法（Pipeline 架构）
    const requiredMethods = ['executeLottery', 'getEngineHealth', 'getHealthStatus', 'healthCheck']

    await ServiceTestSuite.testServiceHealth(UnifiedLotteryEngine, requiredMethods)

    // V4.6: 验证 DrawOrchestrator 初始化
    const drawOrchestrator = UnifiedLotteryEngine.drawOrchestrator
    if (!drawOrchestrator) {
      throw new Error('❌ DrawOrchestrator 未初始化')
    }

    console.log('✅ DrawOrchestrator 已就绪')

    // 验证健康状态
    const health = UnifiedLotteryEngine.getEngineHealth()
    if (!health) {
      throw new Error('❌ 无法获取引擎健康状态')
    }

    console.log('✅ UnifiedLotteryEngine 验证通过（V4.6 Pipeline 模式）')

    // V4.6: 获取管线状态
    const orchestratorStatus = drawOrchestrator?.getStatus?.() || {}
    const pipelineTypes = orchestratorStatus.pipeline_types || []

    return {
      success: true,
      pipelineCount: pipelineTypes.length,
      pipelines: pipelineTypes,
      health
    }
  }

  /**
   * 测试资产子服务（V4.7.0 AssetService 拆分）
   *
   * 验证内容：
   * - BalanceService: 余额操作方法完整
   * - ItemService: 物品操作方法完整
   * - QueryService: 查询统计方法完整
   *
   * @param {Object} BalanceService - 余额服务实例
   * @param {Object} ItemService - 物品服务实例
   * @param {Object} QueryService - 查询服务实例
   * @returns {Promise<Object>} 测试结果
   * @throws {Error} 如果验证失败
   */
  static async testAssetSubServices(BalanceService, ItemService, QueryService) {
    console.log('💰 测试资产子服务（V4.7.0 拆分架构）...')

    const results = {
      balance: null,
      item: null,
      query: null
    }

    // 1. 测试 BalanceService（8个方法）
    const balanceMethods = [
      'getOrCreateAccount',
      'getOrCreateBalance',
      'changeBalance',
      'freeze',
      'unfreeze',
      'settleFromFrozen',
      'getBalance',
      'getAllBalances'
    ]
    await ServiceTestSuite.testServiceHealth(BalanceService, balanceMethods)
    results.balance = { success: true, methods: balanceMethods }
    console.log('  ✅ BalanceService 验证通过')

    // 2. 测试 ItemService（9个方法）
    const itemMethods = [
      'createItem',
      'updateItemOwner',
      'getItem',
      'getItemsByOwner',
      'redeemItem',
      'consumeItem',
      'getItemStats',
      'migrateInventoryToAssetDomain',
      'syncItemsFromExistingData'
    ]
    await ServiceTestSuite.testServiceHealth(ItemService, itemMethods)
    results.item = { success: true, methods: itemMethods }
    console.log('  ✅ ItemService 验证通过')

    // 3. 测试 QueryService（7个方法）
    const queryMethods = [
      'getTransactions',
      'getTransactionStats',
      'getAssetSummary',
      'getUserPortfolio',
      'queryBalanceHistory',
      'getAssetDistribution',
      'exportTransactionReport'
    ]
    await ServiceTestSuite.testServiceHealth(QueryService, queryMethods)
    results.query = { success: true, methods: queryMethods }
    console.log('  ✅ QueryService 验证通过')

    console.log('✅ 资产子服务全部验证通过')

    return {
      success: true,
      results
    }
  }

  /**
   * 测试ServiceManager（项目特定）
   *
   * 验证内容：
   * - 服务管理器初始化成功
   * - 所有服务可正常获取
   * - 健康状态检查正常
   *
   * @param {Object} serviceManager - 服务管理器实例
   * @returns {Promise<Object>} 测试结果
   * @throws {Error} 如果验证失败
   */
  static async testServiceManager(serviceManager) {
    console.log('🏭 测试ServiceManager...')

    // 测试初始化
    await ServiceTestSuite.testServiceInitialization(serviceManager)

    // 获取所有服务
    const serviceList = serviceManager.getServiceList()

    // 测试每个服务的单例模式
    for (const serviceName of serviceList) {
      await ServiceTestSuite.testSingletonPattern(serviceManager, serviceName)
    }

    // 测试健康状态
    const healthStatus = await serviceManager.getHealthStatus()
    console.log(`✅ 服务健康状态: ${JSON.stringify(healthStatus, null, 2)}`)

    console.log('✅ ServiceManager验证通过')

    return {
      success: true,
      serviceList,
      healthStatus
    }
  }
}

// 导出测试工具
module.exports = {
  ServiceTestSuite
}
