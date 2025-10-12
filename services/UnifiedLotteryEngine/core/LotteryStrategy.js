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
   * @returns {Promise<Object>} 策略执行结果
   */
  async execute (_context) {
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
        : this.strategyName.includes('management') ? 'management' : 'unknown',
      description: this.config.description || `${this.constructor.name}策略`,
      version: this.config.version || '4.0.0',
      metrics: this.metrics
    }
  }

  /**
   * 更新策略配置
   *
   * @param {Object} newConfig - 新配置
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
   * @param {number} executionTime - 执行时间（毫秒）
   * @param {boolean} success - 是否成功
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
   * @param {string} level - 日志级别
   * @param {string} message - 日志消息
   * @param {Object} data - 日志数据
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
   */
  logInfo (message, data = {}) {
    this.log('INFO', message, data)
  }

  /**
   * Error级别日志
   */
  logError (message, data = {}) {
    this.log('ERROR', message, data)
  }

  /**
   * Debug级别日志
   */
  logDebug (message, data = {}) {
    this.log('DEBUG', message, data)
  }

  /**
   * Warn级别日志
   */
  logWarn (message, data = {}) {
    this.log('WARN', message, data)
  }
}

module.exports = LotteryStrategy
