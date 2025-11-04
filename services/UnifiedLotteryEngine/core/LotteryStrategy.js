/**
 * 抽奖策略基类 - 统一接口定义
 * 实现策略模式，支持3种抽奖功能模块
 *
 * @description 为餐厅积分抽奖系统提供统一的策略接口（精简版：基础/保底/管理策略）
 * @version 4.0.0
 * @date 2025-09-11
 */

const moment = require('moment-timezone')

/**
 * 抽奖策略基础接口类
 * 所有具体策略都必须继承此类并实现核心方法
 */
class LotteryStrategy {
  /**
   * 构造函数
   *
   * 业务场景：创建策略实例，初始化策略名称、配置和性能指标
   *
   * @param {string} strategyName - 策略名称（如：basic_guarantee、management）
   * @param {Object} [config={}] - 策略配置对象
   * @param {boolean} [config.enabled=true] - 是否启用策略
   * @param {string} [config.description] - 策略描述
   * @param {string} [config.version] - 策略版本
   *
   * @example
   * const strategy = new LotteryStrategy('basic_guarantee', {
   *   enabled: true,
   *   description: '基础保底策略',
   *   version: '4.0.0'
   * })
   */
  constructor (strategyName, config = {}) {
    this.strategyName = strategyName
    this.config = config
    this.enabled = config.enabled !== false

    // 性能监控指标
    this.metrics = {
      executionCount: 0,
      successCount: 0,
      averageExecutionTime: 0,
      lastExecutedAt: null
    }
  }

  /**
   * 策略执行核心方法 - 必须由子类实现
   *
   * @param {Object} _context - 执行上下文
   * @param {number} _context.user_id - 用户ID
   * @param {number} _context.activityId - 活动ID
   * @param {string} _context.lotteryType - 抽奖类型
   * @param {Object} _context.userProfile - 用户画像信息
   * @param {Object} _context.activityConfig - 活动配置
   * @param {Transaction} _transaction - 外部事务对象（可选，用于连抽统一事务保护）
   * @returns {Promise<Object>} 策略执行结果
   */
  async execute (_context, _transaction = null) {
    throw new Error(`Strategy ${this.strategyName} must implement execute method`)
  }

  /**
   * 策略验证方法 - 检查是否可以执行此策略
   *
   * @param {Object} context - 执行上下文
   * @returns {Promise<boolean>} 是否可以执行
   */
  async validate (context) {
    if (!this.enabled) {
      return false
    }
    return this.validateStrategy(context)
  }

  /**
   * 策略特定的验证逻辑 - 子类可覆盖
   *
   * @param {Object} _context - 执行上下文
   * @returns {Promise<boolean>} 验证结果
   */
  async validateStrategy (_context) {
    return true
  }

  /**
   * 获取策略配置信息
   *
   * @returns {Object} 策略配置
   */
  getConfig () {
    return {
      name: this.strategyName,
      enabled: this.enabled,
      config: this.config,
      metrics: this.metrics
    }
  }

  /**
   * 获取策略信息（包含策略名称和类型）
   *
   * @returns {Object} 策略信息
   */
  getStrategyInfo () {
    return {
      name: this.constructor.name,
      strategyName: this.strategyName,
      enabled: this.enabled,
      config: this.config,
      type: this.strategyName.includes('guarantee')
        ? 'basic_guarantee'
        : this.strategyName.includes('management')
          ? 'management'
          : 'unknown',
      description: this.config.description || `${this.constructor.name}策略`,
      version: this.config.version || '4.0.0',
      metrics: this.metrics
    }
  }

  /**
   * 更新策略配置
   *
   * 业务场景：动态修改策略配置，如启用/禁用策略、更新策略参数
   *
   * @param {Object} newConfig - 新配置对象
   * @param {boolean} [newConfig.enabled] - 是否启用
   * @param {string} [newConfig.description] - 策略描述
   * @returns {void}
   *
   * @example
   * strategy.updateConfig({ enabled: false, description: '暂停策略' })
   */
  updateConfig (newConfig) {
    this.config = { ...this.config, ...newConfig }
    if (Object.prototype.hasOwnProperty.call(newConfig, 'enabled')) {
      this.enabled = newConfig.enabled
    }
  }

  /**
   * 记录执行指标
   *
   * 业务场景：每次策略执行后记录性能指标，用于监控和统计
   *
   * @param {number} executionTime - 执行时间（毫秒）
   * @param {boolean} success - 是否成功
   * @returns {void}
   *
   * @example
   * const startTime = Date.now()
   * // 执行策略...
   * const duration = Date.now() - startTime
   * strategy.recordMetrics(duration, true)
   */
  recordMetrics (executionTime, success) {
    this.metrics.executionCount++
    if (success) {
      this.metrics.successCount++
    }

    // 计算平均执行时间
    const currentAvg = this.metrics.averageExecutionTime
    const count = this.metrics.executionCount
    this.metrics.averageExecutionTime = (currentAvg * (count - 1) + executionTime) / count

    this.metrics.lastExecutedAt = this.getBeijingTime()
  }

  /**
   * 获取北京时间
   * 统一时间处理，确保整个系统使用北京时间
   *
   * @returns {string} 北京时间字符串
   */
  getBeijingTime () {
    return moment().tz('Asia/Shanghai').format('YYYY-MM-DD HH:mm:ss')
  }

  /**
   * 获取北京时间戳
   *
   * @returns {string} ISO格式的北京时间戳
   */
  getBeijingTimestamp () {
    return moment().tz('Asia/Shanghai').toISOString()
  }

  /**
   * 生成统一的执行结果格式
   *
   * @param {boolean} success - 是否成功
   * @param {Object} data - 结果数据
   * @param {string} message - 结果消息
   * @param {Object} metadata - 元数据
   * @returns {Object} 统一格式的结果
   */
  createResult (success, data = {}, message = '', metadata = {}) {
    return {
      success,
      strategy: this.strategyName,
      data,
      message,
      metadata: {
        ...metadata,
        executedAt: this.getBeijingTimestamp(),
        strategyVersion: '4.0.0'
      }
    }
  }

  /**
   * 创建错误结果
   *
   * @param {string} error - 错误信息
   * @param {Object} details - 错误详情
   * @returns {Object} 错误结果
   */
  createError (error, details = {}) {
    return this.createResult(false, {}, error, {
      error: true,
      details
    })
  }

  /**
   * 创建成功结果
   *
   * @param {Object} data - 成功数据
   * @param {string} message - 成功消息
   * @param {Object} metadata - 元数据
   * @returns {Object} 成功结果
   */
  createSuccess (data, message = '执行成功', metadata = {}) {
    return this.createResult(true, data, message, metadata)
  }

  /**
   * 日志记录方法
   *
   * 业务场景：记录策略执行日志，包含时间戳、级别、策略名称、消息和数据
   *
   * @param {string} level - 日志级别（INFO/ERROR/DEBUG/WARN）
   * @param {string} message - 日志消息
   * @param {Object} [data={}] - 日志数据对象
   * @returns {void}
   *
   * @example
   * strategy.log('INFO', '策略执行成功', { duration: 150, result: 'win' })
   */
  log (level, message, data = {}) {
    const timestamp = this.getBeijingTime()
    console.log(
      JSON.stringify({
        timestamp,
        level,
        strategy: this.strategyName,
        message,
        data
      })
    )
  }

  /**
   * Info级别日志
   *
   * 业务场景：记录策略执行的一般信息，如执行开始、执行完成等
   *
   * @param {string} message - 日志消息
   * @param {Object} [data={}] - 日志数据
   * @returns {void}
   *
   * @example
   * strategy.logInfo('开始执行抽奖策略', { user_id: 10001 })
   */
  logInfo (message, data = {}) {
    this.log('INFO', message, data)
  }

  /**
   * Error级别日志
   *
   * 业务场景：记录策略执行错误，如参数错误、执行失败等
   *
   * @param {string} message - 错误消息
   * @param {Object} [data={}] - 错误数据（包含错误详情和堆栈）
   * @returns {void}
   *
   * @example
   * strategy.logError('策略执行失败', { error: err.message, user_id: 10001 })
   */
  logError (message, data = {}) {
    this.log('ERROR', message, data)
  }

  /**
   * Debug级别日志
   *
   * 业务场景：记录策略执行的调试信息，用于开发和问题排查
   *
   * @param {string} message - 调试消息
   * @param {Object} [data={}] - 调试数据
   * @returns {void}
   *
   * @example
   * strategy.logDebug('计算中奖概率', { probability: 0.15, pools: [1, 2, 3] })
   */
  logDebug (message, data = {}) {
    this.log('DEBUG', message, data)
  }

  /**
   * Warn级别日志
   *
   * 业务场景：记录策略执行的警告信息，如配置异常、性能问题等
   *
   * @param {string} message - 警告消息
   * @param {Object} [data={}] - 警告数据
   * @returns {void}
   *
   * @example
   * strategy.logWarn('策略执行时间过长', { duration: 3500, threshold: 3000 })
   */
  logWarn (message, data = {}) {
    this.log('WARN', message, data)
  }
}

module.exports = LotteryStrategy
