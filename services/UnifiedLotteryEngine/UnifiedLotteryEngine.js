/**
 * V4统一抽奖引擎主引擎类
 * 整合所有抽奖决策逻辑，提供统一的抽奖服务入口
 *
 * @description 基于餐厅积分抽奖系统的真实业务需求设计
 * @version 4.0.0
 * @date 2025-01-21
 * @timezone Asia/Shanghai (北京时间)
 */

const BeijingTimeHelper = require('../../utils/timeHelper')
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
      lastResetTime: BeijingTimeHelper.now()
    }

    // 启动时间戳
    this.startTime = BeijingTimeHelper.timestamp()

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
      // 基础抽奖保底策略（合并了基础抽奖和保底机制）
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
   * @param {Transaction} transaction 外部事务对象（可选，用于连抽统一事务保护）
   * @returns {Object} 抽奖结果
   */
  async executeLottery (context, transaction = null) {
    const startTime = BeijingTimeHelper.timestamp()
    const executionId = this.generateExecutionId()

    try {
      this.logInfo('开始执行抽奖', {
        executionId,
        user_id: context?.user_id || context?.user_id,
        campaignId: context?.campaign_id || context?.campaignId,
        hasExternalTransaction: !!transaction
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

          // 执行策略（传递transaction参数）
          const strategyResult = await this.executeWithTimeout(
            strategy,
            executionContext,
            transaction
          )

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
        const executionTime = BeijingTimeHelper.timestamp() - startTime
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
        executionTime: BeijingTimeHelper.timestamp() - startTime
      })

      return finalResult
    } catch (error) {
      const executionTime = BeijingTimeHelper.timestamp() - startTime
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
   * @param {Object} strategy - 策略实例
   * @param {Object} context - 执行上下文
   * @param {Transaction} transaction - 外部事务对象（可选）
   */
  async executeWithTimeout (strategy, context, transaction = null) {
    const timeout = this.config.maxExecutionTime

    return Promise.race([
      strategy.execute(context, transaction),
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
            sort_order: result.prize?.sort_order || null, // 🎯 方案3：传递sort_order字段
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
    const executionTime = Math.max(BeijingTimeHelper.timestamp() - startTime, 1) // 最小1ms

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
      this.metrics.strategiesUsed[strategyUsed] =
        (this.metrics.strategiesUsed[strategyUsed] || 0) + 1
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
      lastChecked: BeijingTimeHelper.now()
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
    const uptime = BeijingTimeHelper.timestamp() - this.startTime
    const successRate =
      this.metrics.totalExecutions > 0
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
      const enabledStrategies = Array.from(this.strategies.entries()).filter(
        ([_, strategy]) => strategy.enabled !== false
      )

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
        uptime: this.formatUptime(BeijingTimeHelper.timestamp() - this.startTime),
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
    const startTime = BeijingTimeHelper.timestamp()

    try {
      const strategies = {}

      // 检查每个策略的健康状态
      for (const [name, strategy] of this.strategies.entries()) {
        strategies[name] = {
          enabled: strategy.enabled !== false,
          healthy: true // 假设策略健康，实际项目中可以添加更详细的检查
        }
      }

      const checkTime = BeijingTimeHelper.timestamp() - startTime

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
    const timestamp = BeijingTimeHelper.timestamp()
    const random = Math.random().toString(36).substr(2, 6)
    return `exec_${timestamp}_${random}`
  }

  /**
   * 获取北京时间戳
   */
  getBeijingTimestamp () {
    return BeijingTimeHelper.now()
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

  /**
   * ============================================
   * 🔥 业务API方法（路由层调用）
   * 以下方法为路由层提供直接的业务功能支持
   * ============================================
   */

  /**
   * 获取活动的奖品列表
   * @param {number} campaign_id - 活动ID
   * @returns {Promise<Array>} 奖品列表
   */
  async get_campaign_prizes (campaign_id) {
    try {
      const models = require('../../models')

      const prizes = await models.LotteryPrize.findAll({
        where: {
          campaign_id,
          status: 'active'
        },
        attributes: [
          'prize_id',
          'prize_name',
          'prize_type',
          'prize_value',
          'prize_description',
          'image_id',
          'win_probability',
          'stock_quantity',
          'max_daily_wins',
          'daily_win_count',
          'status',
          'sort_order',
          'created_at'
        ],
        order: [
          ['sort_order', 'ASC'],
          ['prize_id', 'ASC']
        ]
      })

      this.logInfo('获取活动奖品列表', {
        campaign_id,
        prizesCount: prizes.length
      })

      return prizes
    } catch (error) {
      this.logError('获取活动奖品列表失败', {
        campaign_id,
        error: error.message
      })
      throw new Error(`获取活动奖品失败: ${error.message}`)
    }
  }

  /**
   * 获取活动配置信息
   * @param {number} campaign_id - 活动ID
   * @returns {Promise<Object>} 活动配置
   */
  async get_campaign_config (campaign_id) {
    try {
      const models = require('../../models')

      const campaign = await models.LotteryCampaign.findOne({
        where: { campaign_id },
        attributes: [
          'campaign_id',
          'campaign_name',
          'campaign_code',
          'campaign_type',
          'cost_per_draw',
          'max_draws_per_user_daily',
          'max_draws_per_user_total',
          'status',
          'start_time',
          'end_time',
          'total_prize_pool',
          'remaining_prize_pool',
          'prize_distribution_config', // 🔥 2025-10-23 新增：包含draw_pricing定价配置
          'created_at',
          'updated_at'
        ]
      })

      if (!campaign) {
        throw new Error('活动不存在')
      }

      // 🎯 整合保底规则配置（从BasicGuaranteeStrategy获取）
      const basicGuaranteeStrategy = this.strategies.get('basic_guarantee')
      const guaranteeRule = basicGuaranteeStrategy?.config?.guaranteeRule || null

      this.logInfo('获取活动配置', {
        campaign_id,
        campaign_name: campaign.campaign_name,
        status: campaign.status
      })

      return {
        ...campaign.toJSON(),
        guarantee_rule: guaranteeRule // 添加保底规则信息
      }
    } catch (error) {
      this.logError('获取活动配置失败', {
        campaign_id,
        error: error.message
      })
      throw new Error(`获取活动配置失败: ${error.message}`)
    }
  }

  /**
   * 🎯 新增方法：获取连抽定价配置
   *
   * 根据抽奖次数从活动配置中获取对应的定价信息
   *
   * 业务规则：
   * - 单抽：100积分，无折扣
   * - 3连抽：300积分，无折扣
   * - 5连抽：500积分，无折扣
   * - 10连抽：900积分，九折优惠（节省100积分）
   *
   * 技术实现：
   * - 从prize_distribution_config的draw_pricing字段读取配置
   * - 如果配置缺失，降级为默认值（100积分/次，无折扣）
   * - 确保向后兼容性
   *
   * @param {number} draw_count - 抽奖次数（1/3/5/10）
   * @param {Object} campaign - 活动配置对象（包含prize_distribution_config）
   * @returns {Object} 定价配置 { total_cost, per_draw, discount, count, label }
   *
   * @example
   * // 10连抽的定价配置
   * getDrawPricing(10, campaign)
   * // 返回：{ total_cost: 900, per_draw: 90, discount: 0.9, count: 10, label: '10连抽(九折)' }
   */
  getDrawPricing (draw_count, campaign) {
    // 步骤1：从活动配置中读取定价配置（JSON字段）
    const pricingConfig = campaign.prize_distribution_config?.draw_pricing || {}

    // 步骤2：根据抽奖次数确定配置key
    const drawKeys = {
      1: 'single', // 单抽
      3: 'triple', // 3连抽
      5: 'five', // 5连抽
      10: 'ten' // 10连抽（九折优惠）
    }
    const drawKey = drawKeys[draw_count] || 'single'

    // 步骤3：获取对应的定价配置，如果不存在则使用默认值
    const pricing = pricingConfig[drawKey] || {
      total_cost: draw_count * 100, // 默认定价（无折扣）
      per_draw: 100, // 单次价格
      discount: 1.0, // 无折扣
      count: draw_count, // 抽奖次数
      label: `${draw_count}连抽` // 显示名称
    }

    // 步骤4：记录日志（便于调试和问题排查）
    this.logInfo('获取连抽定价配置', {
      draw_count, // 请求的抽奖次数
      drawKey, // 映射的配置key
      pricing, // 最终的定价配置
      is_custom: !!pricingConfig[drawKey] // 是否使用了自定义配置
    })

    return pricing
  }

  /**
   * 执行抽奖（路由层调用接口）
   *
   * 🎯 核心改动：添加统一事务保护，确保连抽操作的原子性
   *
   * @param {number} user_id - 用户ID
   * @param {number} campaign_id - 活动ID
   * @param {number} draw_count - 抽奖次数（默认1次）
   * @returns {Promise<Object>} 抽奖结果
   */
  async execute_draw (user_id, campaign_id, draw_count = 1) {
    /*
     * 🎯 核心改动1：开启统一事务（新增代码）
     *
     * 业务价值：
     * - 防止出现"扣了600积分但只抽了6次"的部分失败情况
     * - 确保保底计数的准确性（如果失败，保底计数自动回滚）
     */
    const models = require('../../models')
    const transaction = await models.sequelize.transaction()

    try {
      this.logInfo('开始执行抽奖（路由层调用）', {
        user_id,
        campaign_id,
        draw_count
      })

      // 🔴 参数验证
      if (!user_id || !campaign_id) {
        throw new Error('缺少必需参数：user_id或campaign_id')
      }

      if (draw_count < 1 || draw_count > 10) {
        throw new Error('抽奖次数必须在1-10之间')
      }

      // 获取用户积分信息
      const userAccount = await models.UserPointsAccount.findOne({
        where: { user_id },
        transaction // 🎯 关键：在事务中查询，确保数据一致性
      })

      if (!userAccount) {
        throw new Error('用户积分账户不存在')
      }

      // 🔴 获取活动配置（用于读取定价配置）
      const campaign = await models.LotteryCampaign.findByPk(campaign_id, {
        transaction
      })

      if (!campaign) {
        throw new Error('活动不存在')
      }

      /**
       * 🔴 核心改动：积分计算逻辑优化（配置驱动）
       *
       * ❌ 原逻辑：const requiredPoints = draw_count * 100
       * 问题：硬编码定价，无法实现折扣机制
       *
       * ✅ 新逻辑：从配置读取定价
       * 优势：
       * - 10连抽可享受九折优惠（900积分，节省100积分）
       * - 修改定价只需改配置，无需改代码
       * - 支持灵活的折扣策略
       */
      const pricing = this.getDrawPricing(draw_count, campaign) // 从配置读取定价
      const requiredPoints = pricing.total_cost // 使用配置的总价格

      // 记录详细的积分计算日志
      this.logInfo('连抽积分计算', {
        draw_count, // 抽奖次数
        pricing, // 定价配置
        requiredPoints, // 所需积分
        user_available: userAccount.available_points, // 用户余额
        is_enough: userAccount.available_points >= requiredPoints, // 是否足够
        shortage: Math.max(0, requiredPoints - userAccount.available_points) // 不足金额
      })

      // 🆕 积分充足性预检查（连抽事务安全的关键保护）
      if (userAccount.available_points < requiredPoints) {
        throw new Error(
          `积分不足：需要${requiredPoints}积分，当前仅有${userAccount.available_points}积分`
        )
      }

      /**
       * 🔥 核心修复：统一扣除折扣后的总积分（2025-10-23）
       * 
       * 问题根因：
       * - 原逻辑：每次抽奖都扣除100积分，10连抽实际扣除1000积分
       * - 折扣失效：虽然计算了900积分，但实际每次还是扣100积分
       * 
       * 修复方案：
       * - 在抽奖前统一扣除折扣后的总积分（单抽100，10连抽900）
       * - 传递skip_points_deduction标识给策略，避免重复扣除
       * - 确保事务一致性：统一扣除 + 循环抽奖 + 发放奖品
       */
      const PointsService = require('../../services/PointsService')
      const batchDrawId = `batch_${BeijingTimeHelper.generateIdTimestamp()}_${user_id}` // 批次ID用于幂等性控制

      // 步骤1：统一扣除折扣后的总积分（在事务中执行）
      await PointsService.consumePoints(user_id, requiredPoints, {
        transaction,
        business_id: batchDrawId, // 使用批次ID实现幂等性
        business_type: 'lottery_consume',
        source_type: 'system',
        title: draw_count === 1 ? '抽奖消耗积分' : `${draw_count}连抽消耗积分`,
        description: draw_count === 1
          ? `单次抽奖消耗${requiredPoints}积分`
          : `${draw_count}连抽消耗${requiredPoints}积分（${pricing.label}，原价${draw_count * 100}积分，节省${draw_count * 100 - requiredPoints}积分）`
      })

      this.logInfo('连抽积分统一扣除成功', {
        user_id,
        draw_count,
        requiredPoints,
        pricing,
        batchDrawId
      })

      const results = []
      let totalPointsCost = 0 // 实际已扣除金额（用于统计）

      // 步骤2：执行多次抽奖（不再重复扣除积分）
      for (let i = 0; i < draw_count; i++) {
        const context = {
          user_id,
          campaign_id,
          draw_number: i + 1,
          total_draws: draw_count,
          skip_points_deduction: true, // 🎯 关键标识：告诉策略不要再扣除积分
          batch_draw_id: batchDrawId, // 传递批次ID
          user_status: {
            available_points: userAccount.available_points - requiredPoints // 显示扣除后的余额
          }
        }

        /*
         * 🎯 核心改动2：传入外部事务对象（唯一的重要改动）
         *
         * 业务价值：
         * - 让底层的保底机制、积分扣除等都在统一事务中
         * - 任何环节失败，都能回滚所有操作，保证数据一致性
         */
        const drawResult = await this.executeLottery(context, transaction)

        if (drawResult.success) {
          results.push({
            draw_number: i + 1,
            is_winner: drawResult.data?.draw_result?.is_winner || false,
            prize: drawResult.data?.draw_result?.prize_id
              ? {
                id: drawResult.data.draw_result.prize_id,
                name: drawResult.data.draw_result.prize_name,
                type: drawResult.data.draw_result.prize_type,
                value: drawResult.data.draw_result.prize_value,
                sort_order: drawResult.data.draw_result.sort_order // 🎯 方案3：传递sort_order给路由层
              }
              : null,
            points_cost: drawResult.data?.draw_result?.points_cost || 0
          })

          // 🔥 修复：连抽场景不累加points_cost（外层已统一扣除）
          // totalPointsCost仅用于统计，实际扣除金额是requiredPoints
        } else {
          // 抽奖失败，停止后续抽奖
          throw new Error(drawResult.message || '抽奖执行失败')
        }
      }

      /*
       * 🎯 核心改动3：统一提交事务（关键步骤）
       *
       * 提交时机：所有抽奖都成功后
       * 提交效果：所有数据库操作（积分扣除、奖品发放、抽奖记录、保底计数等）一次性生效
       */
      await transaction.commit()

      // 🆕 事务提交后重新查询实际积分余额（确保数据准确）
      const updatedAccount = await models.UserPointsAccount.findOne({
        where: { user_id }
      })

      const remainingPoints = updatedAccount ? updatedAccount.available_points : userAccount.available_points - requiredPoints

      this.logInfo('抽奖执行完成（事务已提交）', {
        user_id,
        campaign_id,
        draw_count,
        actualPointsCost: requiredPoints, // 🔥 修复：实际扣除的积分数（含折扣）
        remainingPoints,
        winners: results.filter(r => r.is_winner).length,
        pricing
      })

      /**
       * 🎯 改动3：返回结果中添加折扣信息（前端显示需要）
       *
       * 业务场景：
       * - 前端需要显示"您本次消耗900积分，节省100积分"
       * - 需要显示折扣率"九折优惠"
       * - 需要显示原价对比
       *
       * 返回数据结构说明：
       * - success：操作是否成功
       * - draw_count：本次抽奖次数
       * - prizes：抽奖结果数组（N次抽奖的详细结果）
       * - total_points_cost：实际消耗积分（折后价）
       * - original_cost：原价积分（用于对比显示优惠）
       * - discount：折扣率（0.9=九折，1.0=无折扣）
       * - saved_points：节省的积分数量（前端显示优惠金额）
       * - remaining_balance：用户剩余积分余额
       * - draw_type：前端显示的抽奖类型名称
       */
      return {
        success: true,
        draw_count, // 抽奖次数
        prizes: results, // 抽奖结果数组
        total_points_cost: requiredPoints, // 实际消耗积分（折后价）
        original_cost: draw_count * 100, // 原价（无折扣价格）
        discount: pricing.discount, // 折扣率（0.9=九折）
        saved_points: (draw_count * 100) - requiredPoints, // 节省积分（优惠金额）
        remaining_balance: remainingPoints, // 剩余积分余额
        draw_type: pricing.label || `${draw_count}连抽` // 前端显示的抽奖类型名称
      }
    } catch (error) {
      /*
       * 🎯 核心改动4：统一回滚事务（关键步骤）
       *
       * 回滚时机：任何一次抽奖失败时
       * 回滚效果：所有已执行的数据库操作都会被撤销
       *
       * 具体回滚内容：
       * 1. 已扣除的积分 → 自动退回
       * 2. 已发放的奖品 → 自动撤回
       * 3. 已保存的抽奖记录 → 自动删除
       * 4. 已更新的保底计数 → 自动恢复
       */
      await transaction.rollback()

      this.logError('抽奖执行失败，事务已回滚', {
        user_id,
        campaign_id,
        draw_count,
        error: error.message
      })
      throw new Error(`抽奖执行失败: ${error.message}`)
    }
  }

  /**
   * 获取用户抽奖历史
   * @param {number} user_id - 用户ID
   * @param {Object} options - 查询选项 {page, limit, campaign_id}
   * @returns {Promise<Object>} 抽奖历史记录
   */
  async get_user_history (user_id, options = {}) {
    try {
      const models = require('../../models')
      const { page = 1, limit = 20, campaign_id } = options

      const offset = (page - 1) * limit

      // 构建查询条件
      const whereClause = { user_id }
      if (campaign_id) {
        whereClause.campaign_id = campaign_id
      }

      // 查询抽奖记录
      const { rows: records, count: total } = await models.LotteryDraw.findAndCountAll({
        where: whereClause,
        include: [
          {
            model: models.LotteryCampaign,
            as: 'campaign',
            attributes: ['campaign_id', 'campaign_name', 'campaign_type']
          },
          {
            model: models.LotteryPrize,
            as: 'prize',
            attributes: [
              'prize_id',
              'prize_name',
              'prize_type',
              'prize_value',
              'image_id',
              'win_probability'
            ], // 🎯 从奖品中获取概率
            required: false
          }
        ],
        attributes: [
          'draw_id',
          'user_id',
          'campaign_id',
          'prize_id',
          'is_winner',
          'draw_type',
          'cost_points',
          // 🎯 移除win_probability（LotteryDraw中不存在此字段）
          'guarantee_triggered',
          'created_at'
        ],
        order: [['created_at', 'DESC']],
        limit: parseInt(limit),
        offset: parseInt(offset)
      })

      const totalPages = Math.ceil(total / limit)

      this.logInfo('获取用户抽奖历史', {
        user_id,
        page,
        limit,
        total,
        recordsCount: records.length
      })

      return {
        records: records.map(record => ({
          draw_id: record.draw_id,
          campaign_id: record.campaign_id,
          campaign_name: record.campaign?.campaign_name || '未知活动',
          is_winner: record.is_winner,
          prize: record.prize
            ? {
              id: record.prize.prize_id,
              name: record.prize.prize_name,
              type: record.prize.prize_type,
              value: record.prize.prize_value,
              image_id: record.prize.image_id
            }
            : null,
          points_cost: record.cost_points,
          probability: record.prize?.win_probability || 0, // 🎯 从关联的奖品中获取概率
          is_guarantee: record.guarantee_triggered || false,
          draw_time: record.created_at
        })),
        pagination: {
          current_page: parseInt(page),
          page_size: parseInt(limit),
          total_records: total,
          total_pages: totalPages
        }
      }
    } catch (error) {
      this.logError('获取用户抽奖历史失败', {
        user_id,
        options,
        error: error.message
      })
      throw new Error(`获取抽奖历史失败: ${error.message}`)
    }
  }

  /**
   * 获取活动列表
   * @param {Object} options - 查询选项 {status, user_id}
   * @returns {Promise<Array>} 活动列表
   */
  async get_campaigns (options = {}) {
    try {
      const models = require('../../models')
      const { status = 'active', user_id } = options

      // 构建查询条件
      const whereClause = {}
      if (status) {
        whereClause.status = status
      }

      // 查询活动列表
      const campaigns = await models.LotteryCampaign.findAll({
        where: whereClause,
        attributes: [
          'campaign_id',
          'campaign_name',
          'campaign_code',
          'campaign_type',
          'cost_per_draw',
          'max_draws_per_user_daily',
          'status',
          'start_time',
          'end_time',
          'total_prize_pool',
          'remaining_prize_pool'
        ],
        order: [
          ['status', 'DESC'], // active优先
          ['start_time', 'DESC']
        ]
      })

      // 如果提供了user_id，查询用户今日抽奖次数
      const userDrawCounts = {}
      if (user_id) {
        const today = require('moment-timezone')().tz('Asia/Shanghai').startOf('day').toDate()

        for (const campaign of campaigns) {
          const drawCount = await models.LotteryDraw.count({
            where: {
              user_id,
              campaign_id: campaign.campaign_id,
              created_at: {
                [require('sequelize').Op.gte]: today
              }
            }
          })
          userDrawCounts[campaign.campaign_id] = drawCount
        }
      }

      this.logInfo('获取活动列表', {
        status,
        user_id,
        campaignsCount: campaigns.length
      })

      return campaigns.map(campaign => ({
        campaign_id: campaign.campaign_id,
        campaign_name: campaign.campaign_name,
        campaign_code: campaign.campaign_code,
        campaign_type: campaign.campaign_type,
        cost_per_draw: campaign.cost_per_draw,
        max_draws_per_day: campaign.max_draws_per_user_daily,
        status: campaign.status,
        start_time: campaign.start_time,
        end_time: campaign.end_time,
        total_prize_pool: campaign.total_prize_pool,
        remaining_prize_pool: campaign.remaining_prize_pool,
        user_today_draws: user_id ? userDrawCounts[campaign.campaign_id] || 0 : undefined,
        can_draw: user_id
          ? (userDrawCounts[campaign.campaign_id] || 0) < campaign.max_draws_per_user_daily
          : undefined
      }))
    } catch (error) {
      this.logError('获取活动列表失败', {
        options,
        error: error.message
      })
      throw new Error(`获取活动列表失败: ${error.message}`)
    }
  }

  /**
   * 获取用户抽奖统计信息
   * @param {number} user_id - 用户ID
   * @returns {Promise<Object>} 统计信息
   */
  async get_user_statistics (user_id) {
    try {
      const models = require('../../models')
      const { Op } = require('sequelize')

      // 统计总抽奖次数
      const totalDraws = await models.LotteryDraw.count({
        where: { user_id }
      })

      // 统计中奖次数
      const totalWins = await models.LotteryDraw.count({
        where: {
          user_id,
          is_winner: true
        }
      })

      // 统计保底中奖次数
      const guaranteeWins = await models.LotteryDraw.count({
        where: {
          user_id,
          is_winner: true,
          guarantee_triggered: true
        }
      })

      // 统计今日抽奖次数
      const today = require('moment-timezone')().tz('Asia/Shanghai').startOf('day').toDate()
      const todayDraws = await models.LotteryDraw.count({
        where: {
          user_id,
          created_at: {
            [Op.gte]: today
          }
        }
      })

      // 统计今日中奖次数
      const todayWins = await models.LotteryDraw.count({
        where: {
          user_id,
          is_winner: true,
          created_at: {
            [Op.gte]: today
          }
        }
      })

      // 统计总消耗积分
      const totalPointsCost =
        (await models.LotteryDraw.sum('cost_points', {
          where: { user_id }
        })) || 0

      // 统计各类奖品中奖次数
      const prizeTypeStats = await models.LotteryDraw.findAll({
        where: {
          user_id,
          is_winner: true,
          prize_type: { [Op.ne]: null }
        },
        attributes: ['prize_type', [models.sequelize.fn('COUNT', '*'), 'count']],
        group: ['prize_type'],
        raw: true
      })

      // 查询最近一次中奖记录
      const lastWin = await models.LotteryDraw.findOne({
        where: {
          user_id,
          is_winner: true
        },
        include: [
          {
            model: models.LotteryPrize,
            as: 'prize',
            attributes: ['prize_id', 'prize_name', 'prize_type', 'prize_value']
          }
        ],
        attributes: ['draw_id', 'campaign_id', 'created_at', 'guarantee_triggered'],
        order: [['created_at', 'DESC']]
      })

      // 计算中奖率
      const winRate = totalDraws > 0 ? ((totalWins / totalDraws) * 100).toFixed(2) : 0
      const todayWinRate = todayDraws > 0 ? ((todayWins / todayDraws) * 100).toFixed(2) : 0

      this.logInfo('获取用户抽奖统计', {
        user_id,
        totalDraws,
        totalWins,
        winRate
      })

      return {
        user_id,
        total_draws: totalDraws,
        total_wins: totalWins,
        guarantee_wins: guaranteeWins,
        normal_wins: totalWins - guaranteeWins,
        win_rate: parseFloat(winRate),
        today_draws: todayDraws,
        today_wins: todayWins,
        today_win_rate: parseFloat(todayWinRate),
        total_points_cost: parseInt(totalPointsCost),
        prize_type_distribution: prizeTypeStats.reduce((acc, stat) => {
          acc[stat.prize_type] = parseInt(stat.count)
          return acc
        }, {}),
        last_win: lastWin
          ? {
            draw_id: lastWin.draw_id,
            campaign_id: lastWin.campaign_id,
            prize: lastWin.prize
              ? {
                id: lastWin.prize.prize_id,
                name: lastWin.prize.prize_name,
                type: lastWin.prize.prize_type,
                value: lastWin.prize.prize_value
              }
              : null,
            is_guarantee: lastWin.guarantee_triggered || false,
            win_time: lastWin.created_at
          }
          : null,
        timestamp: BeijingTimeHelper.now()
      }
    } catch (error) {
      this.logError('获取用户抽奖统计失败', {
        user_id,
        error: error.message
      })
      throw new Error(`获取用户统计失败: ${error.message}`)
    }
  }
}

// 🔥 导出单例实例（供路由层直接调用）
const engineInstance = new UnifiedLotteryEngine()

// 同时导出类（供需要自定义配置的场景）
module.exports = engineInstance
module.exports.UnifiedLotteryEngine = UnifiedLotteryEngine
