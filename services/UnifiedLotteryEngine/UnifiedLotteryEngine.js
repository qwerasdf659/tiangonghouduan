/**
 * V4统一抽奖引擎主引擎类
 * 整合所有抽奖决策逻辑，提供统一的抽奖服务入口
 *
 * @description 基于餐厅积分抽奖系统的真实业务需求设计
 * @version 4.0.0
 * @date 2025-09-19
 * @timezone Asia/Shanghai (北京时间)
 */

const BasicGuaranteeStrategy = require('./strategies/BasicGuaranteeStrategy')
const ManagementStrategy = require('./strategies/ManagementStrategy')
const PerformanceMonitor = require('./utils/PerformanceMonitor')
const CacheManager = require('./utils/CacheManager')
const Logger = require('./utils/Logger')

class UnifiedLotteryEngine {
  constructor (config = {}) {
    // 基础配置初始化
    this.version = config.engineVersion || '4.0.0'
    this.config = {
      enableMetrics: config.enableMetrics !== false,
      enableCache: config.enableCache !== false,
      maxExecutionTime: config.maxExecutionTime || 30000,
      maintenanceMode: config.maintenanceMode || false,
      ...config
    }

    // 核心组件初始化
    this.performanceMonitor = new PerformanceMonitor()
    this.cacheManager = new CacheManager()
    this.logger = new Logger()

    // 策略管理
    this.strategies = new Map()
    this.initializeStrategies()

    // 性能指标
    this.metrics = {
      totalExecutions: 0,
      successfulExecutions: 0,
      averageExecutionTime: 0,
      executionTimes: [],
      strategiesUsed: {},
      lastResetTime: new Date().toISOString()
    }

    // 启动时间戳
    this.startTime = Date.now()

    this.logInfo('V4统一抽奖引擎初始化完成', {
      version: this.version,
      strategiesCount: this.strategies.size,
      enableMetrics: this.config.enableMetrics
    })
  }

  /**
   * 初始化V4两种策略
   */
  initializeStrategies () {
    try {
      // 基础抽奖保底策略（合并了基础抽奖和保底功能）
      const basicGuaranteeStrategy = new BasicGuaranteeStrategy()
      this.strategies.set('basic_guarantee', basicGuaranteeStrategy)

      // 管理策略
      const managementStrategy = new ManagementStrategy()
      this.strategies.set('management', managementStrategy)

      this.logInfo('V4抽奖策略初始化完成', {
        strategies: ['basic_guarantee', 'management']
      })
    } catch (error) {
      this.logError('策略初始化失败', { error: error.message })
      throw error
    }
  }

  /**
   * 统一抽奖执行入口
   * @param {Object} context 抽奖上下文
   * @returns {Object} 抽奖结果
   */
  async executeLottery (context) {
    const startTime = Date.now()
    const executionId = this.generateExecutionId()

    try {
      this.logInfo('开始执行抽奖', {
        executionId,
        userId: context?.user_id || context?.userId,
        campaignId: context?.campaign_id || context?.campaignId
      })

      // 直接使用传入的上下文，添加执行信息
      const executionContext = {
        execution_id: executionId,
        timestamp: this.getBeijingTimestamp(),
        engine_version: this.version,
        ...context
      }

      // 获取策略执行链
      const strategyChain = this.getExecutionChain(executionContext)

      // 执行策略链
      let finalResult = null
      for (const strategyName of strategyChain) {
        const strategy = this.strategies.get(strategyName)

        if (!strategy || !strategy.enabled) {
          this.logDebug(`跳过未启用的策略: ${strategyName}`)
          continue
        }

        try {
          // 策略验证
          const isValid = await this.validateStrategy(strategy, executionContext)
          if (!isValid) {
            this.logDebug(`策略验证失败: ${strategyName}`)
            continue
          }

          // 执行策略
          const strategyResult = await this.executeWithTimeout(strategy, executionContext)

          if (strategyResult.success) {
            this.logInfo(`策略执行成功: ${strategyName}`, {
              executionId,
              strategy: strategyName
            })

            // 标准化策略结果
            finalResult = this.normalizeStrategyResult(strategyResult, strategyName)
            finalResult.strategy_used = strategyName
            finalResult.execution_id = executionId
            finalResult.engine_version = this.version
            finalResult.timestamp = this.getBeijingTimestamp()

            // 管理策略特殊处理：检查是否需要继续执行
            if (strategyName === 'management' && strategyResult.shouldContinue) {
              this.logDebug('管理策略指示继续执行其他策略')
              continue
            }

            break
          } else {
            this.logDebug(`策略执行失败: ${strategyName}`, {
              error: strategyResult.error || strategyResult.message
            })
          }
        } catch (error) {
          this.logError(`策略执行异常: ${strategyName}`, {
            error: error.message,
            executionId
          })
          continue
        }
      }

      // 检查是否有成功的结果
      if (!finalResult) {
        const executionTime = Date.now() - startTime
        this.updateMetrics(startTime, false, null)
        return this.createEngineError('所有策略执行失败', {
          availableStrategies: strategyChain,
          executionTime
        })
      }

      // 更新性能指标
      this.updateMetrics(startTime, true, finalResult.strategy_used)

      this.logInfo('抽奖执行完成', {
        executionId,
        success: finalResult.success,
        strategy: finalResult.strategy_used,
        executionTime: Date.now() - startTime
      })

      return finalResult
    } catch (error) {
      const executionTime = Date.now() - startTime
      this.updateMetrics(startTime, false, null)

      this.logError('抽奖执行异常', {
        error: error.message,
        executionId,
        executionTime
      })

      return this.createEngineError('抽奖执行异常', { error: error.message, executionTime })
    }
  }

  /**
   * 获取策略执行链
   */
  getExecutionChain (context) {
    // 管理员操作优先使用管理策略
    if (context.operationType === 'admin_preset' || context.operation_type === 'admin_preset') {
      return ['management']
    }

    // 默认策略链：基础抽奖保底策略（合并了保底和基础抽奖功能）
    return ['basic_guarantee']
  }

  /**
   * 验证策略可用性
   */
  async validateStrategy (strategy, context) {
    try {
      if (typeof strategy.validate === 'function') {
        return await strategy.validate(context)
      }

      if (typeof strategy.validateStrategy === 'function') {
        return await strategy.validateStrategy(context)
      }

      if (typeof strategy.canExecute === 'function') {
        const result = await strategy.canExecute(context)
        return result.valid || result
      }

      // 默认验证：检查策略是否启用
      this.logWarn(`策略 ${strategy.strategyName || 'unknown'} 没有验证方法，使用默认验证`)
      return strategy.enabled !== false
    } catch (error) {
      this.logError('策略验证异常', { error: error.message })
      return false
    }
  }

  /**
   * 带超时的策略执行
   */
  async executeWithTimeout (strategy, context) {
    const timeout = this.config.maxExecutionTime

    return Promise.race([
      strategy.execute(context),
      new Promise((resolve, reject) => {
        setTimeout(() => reject(new Error('策略执行超时')), timeout)
      })
    ])
  }

  /**
   * 标准化策略结果
   */
  normalizeStrategyResult (result, strategyName) {
    // 如果已经是统一格式，直接返回
    if (result.success !== undefined && result.data !== undefined) {
      return result
    }

    // 处理is_winner格式
    if (result.is_winner !== undefined) {
      return {
        success: true,
        data: {
          draw_result: {
            is_winner: result.is_winner,
            prize_id: result.prize?.id || null,
            prize_name: result.prize?.name || null,
            prize_type: result.prize?.type || null,
            prize_value: result.prize?.value || null,
            probability: result.probability || 0,
            points_cost: result.pointsCost || 0,
            remaining_points: result.remainingPoints || 0
          },
          strategy_type: strategyName,
          execution_time: result.executionTime || 0
        }
      }
    }

    // 处理错误格式
    if (result.error) {
      return {
        success: false,
        code: 'STRATEGY_ERROR',
        message: result.error,
        data: { strategy_type: strategyName }
      }
    }

    // 未知格式，返回错误
    return {
      success: false,
      code: 'UNKNOWN_FORMAT',
      message: '策略返回了未知的结果格式',
      data: { strategy_type: strategyName, raw_result: result }
    }
  }

  /**
   * 创建引擎错误响应
   */
  createEngineError (message, data = {}) {
    return {
      success: false,
      code: 'ENGINE_ERROR',
      message,
      data: {
        engine_version: this.version,
        timestamp: this.getBeijingTimestamp(),
        ...data
      }
    }
  }

  /**
   * 更新性能指标
   */
  updateMetrics (startTime, success, strategyUsed) {
    const executionTime = Math.max(Date.now() - startTime, 1) // 最小1ms

    this.metrics.totalExecutions++
    if (success) {
      this.metrics.successfulExecutions++
    }

    // 更新执行时间统计
    this.metrics.executionTimes.push(executionTime)
    if (this.metrics.executionTimes.length > 100) {
      this.metrics.executionTimes = this.metrics.executionTimes.slice(-100)
    }

    // 计算平均执行时间
    this.metrics.averageExecutionTime = Math.round(
      this.metrics.executionTimes.reduce((sum, time) => sum + time, 0) /
      this.metrics.executionTimes.length
    )

    // 更新策略使用统计
    if (strategyUsed) {
      this.metrics.strategiesUsed[strategyUsed] = (this.metrics.strategiesUsed[strategyUsed] || 0) + 1
    }
  }

  /**
   * 获取策略运行状态
   */
  getStrategyStatus (strategyType) {
    const strategy = this.strategies.get(strategyType)
    if (!strategy) {
      return null
    }

    let config = {}

    // 尝试获取策略配置
    if (typeof strategy.getConfig === 'function') {
      config = strategy.getConfig()
    } else {
      // 降级方案：从策略对象直接读取
      config = {
        name: strategy.strategyName || strategyType,
        enabled: strategy.enabled !== false,
        config: strategy.config || {},
        metrics: strategy.metrics || {}
      }
    }

    return {
      strategyType,
      status: strategy.enabled !== false ? 'enabled' : 'disabled',
      config,
      lastChecked: new Date().toISOString()
    }
  }

  /**
   * 更新策略配置
   */
  updateStrategyConfig (strategyType, newConfig) {
    const strategy = this.strategies.get(strategyType)
    if (!strategy) {
      return false
    }

    try {
      if (typeof strategy.updateConfig === 'function') {
        return strategy.updateConfig(newConfig)
      } else {
        // 简单的配置更新
        Object.assign(strategy.config || {}, newConfig)
        return true
      }
    } catch (error) {
      this.logError('策略配置更新失败', {
        strategy: strategyType,
        error: error.message
      })
      return false
    }
  }

  /**
   * 获取性能指标
   */
  getMetrics () {
    const uptime = Date.now() - this.startTime
    const successRate = this.metrics.totalExecutions > 0
      ? (this.metrics.successfulExecutions / this.metrics.totalExecutions) * 100
      : 0

    return {
      ...this.metrics,
      uptime,
      uptimeFormatted: this.formatUptime(uptime),
      successRate: Math.round(successRate * 100) / 100,
      engineStatus: this.config.maintenanceMode ? 'maintenance' : 'active'
    }
  }

  /**
   * 格式化运行时间
   */
  formatUptime (ms) {
    const seconds = Math.floor(ms / 1000)
    const minutes = Math.floor(seconds / 60)
    const hours = Math.floor(minutes / 60)

    if (hours > 0) {
      return `${hours}小时${minutes % 60}分钟${seconds % 60}秒`
    } else if (minutes > 0) {
      return `${minutes}分钟${seconds % 60}秒`
    } else {
      return `${seconds}秒`
    }
  }

  /**
   * 获取引擎健康状态
   */
  getHealthStatus () {
    try {
      const enabledStrategies = Array.from(this.strategies.entries())
        .filter(([_, strategy]) => strategy.enabled !== false)

      if (enabledStrategies.length === 0) {
        return {
          status: 'unhealthy',
          message: '没有可用的抽奖策略',
          strategies: [],
          enabledStrategies: 0,
          timestamp: this.getBeijingTimestamp(),
          version: this.version
        }
      }

      if (this.config.maintenanceMode) {
        return {
          status: 'maintenance',
          message: '引擎处于维护模式',
          timestamp: this.getBeijingTimestamp(),
          version: this.version
        }
      }

      // 构建策略状态列表
      const strategies = enabledStrategies.map(([name, strategy]) => ({
        name,
        status: strategy.enabled !== false ? 'enabled' : 'disabled'
      }))

      return {
        status: 'healthy',
        message: '引擎运行正常',
        strategies,
        enabledStrategies: enabledStrategies.length,
        totalExecutions: this.metrics.totalExecutions,
        successRate: this.getMetrics().successRate,
        uptime: this.formatUptime(Date.now() - this.startTime),
        timestamp: this.getBeijingTimestamp(),
        version: this.version
      }
    } catch (error) {
      return {
        status: 'unhealthy',
        message: '健康检查异常: ' + error.message,
        error: error.message,
        strategies: [],
        timestamp: this.getBeijingTimestamp(),
        version: this.version
      }
    }
  }

  /**
   * 异步健康检查
   */
  async healthCheck () {
    const startTime = Date.now()

    try {
      const strategies = {}

      // 检查每个策略的健康状态
      for (const [name, strategy] of this.strategies.entries()) {
        strategies[name] = {
          enabled: strategy.enabled !== false,
          healthy: true // 假设策略健康，实际项目中可以添加更详细的检查
        }
      }

      const checkTime = Date.now() - startTime

      return {
        status: 'healthy',
        version: this.version,
        checkTime,
        timestamp: this.getBeijingTimestamp(),
        strategies,
        metrics: this.getMetrics()
      }
    } catch (error) {
      return {
        status: 'unhealthy',
        error: error.message,
        timestamp: this.getBeijingTimestamp()
      }
    }
  }

  /**
   * 获取策略实例
   */
  getStrategy (strategyType) {
    return this.strategies.get(strategyType) || null
  }

  /**
   * 生成执行ID
   */
  generateExecutionId () {
    const timestamp = Date.now()
    const random = Math.random().toString(36).substr(2, 6)
    return `exec_${timestamp}_${random}`
  }

  /**
   * 获取北京时间戳
   */
  getBeijingTimestamp () {
    return new Date().toISOString()
  }

  /**
   * 日志记录方法
   */
  log (level, message, data = {}) {
    const logEntry = {
      timestamp: this.getBeijingTimestamp(),
      level: level.toUpperCase(),
      message,
      engineVersion: this.version,
      ...data
    }

    console.log(`[${logEntry.timestamp}] ${logEntry.level}: ${message}`, data)
  }

  logInfo (message, data = {}) {
    this.log('info', message, data)
  }

  logError (message, data = {}) {
    this.log('error', message, data)
  }

  logDebug (message, data = {}) {
    this.log('debug', message, data)
  }

  logWarn (message, data = {}) {
    this.log('warn', message, data)
  }
}

module.exports = UnifiedLotteryEngine
