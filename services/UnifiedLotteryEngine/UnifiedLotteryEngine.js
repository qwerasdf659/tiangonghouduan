/**
 * 餐厅积分抽奖系统 V4.6 统一引擎架构 - 统一抽奖引擎（UnifiedLotteryEngine）
 *
 * 业务场景：提供统一的抽奖服务入口，整合所有抽奖决策逻辑，使用 Pipeline 管线架构
 *
 *
 * 核心功能：
 * 1. 管线编排管理（DrawOrchestrator 编排 3 种管线）
 * 2. 抽奖执行入口（executeLottery → DrawOrchestrator.execute）
 * 3. 性能监控（执行时间、成功率、管线使用统计）
 * 4. 缓存管理（奖品配置缓存、用户抽奖次数缓存）
 * 5. 日志追踪（完整的执行日志、错误追踪、审计记录）
 *
 * V4.6 业务流程：
 *
 * ⚠️ Phase 5 架构变更：原 3 条管线已合并为 1 条统一管线（NormalDrawPipeline）
 * - 决策来源判断由 LoadDecisionSourceStage 在管线内统一处理
 * - 预设/覆盖/普通 三种模式通过 decision_source 字段区分
 *
 * 1. **统一抽奖流程**（NormalDrawPipeline + LoadDecisionSourceStage）
 *    - 用户发起抽奖 → executeLottery() → DrawOrchestrator.execute()
 *    - 检查抽奖资格（积分余额、每日次数限制、活动有效性）
 *    - LoadDecisionSourceStage 检查决策来源（preset > override > normal）
 *    - 执行统一管线 → 概率计算、保底机制触发
 *    - 从奖品池选择奖品 → 100%中奖（只是奖品价值不同）
 *    - 创建抽奖记录、扣除积分、创建用户库存
 *
 * 2. **决策来源优先级**
 *    - preset（预设奖品）：管理员预设的中奖记录，最高优先级
 *    - override（管理干预）：管理员临时干预，次高优先级
 *    - normal（正常抽奖）：默认流程，按权重选择奖品
 *
 * 3. **管线执行流程**
 *    - Step 1: DrawOrchestrator.execute() 接收抽奖上下文
 *    - Step 2: 统一执行 NormalDrawPipeline（内含决策来源判断）
 *    - Step 3: 管线内部执行各 Stage（决策来源 → 验证 → 选奖 → 结算 → 记录）
 *    - Step 4: 结果标准化并返回
 *
 * 设计原则：
 * - **管线模式应用**：使用 Pipeline + Stage 架构，替代原策略模式
 * - **编排器模式**：DrawOrchestrator 统一编排所有管线
 * - **事务安全保障**：支持外部事务传入，确保抽奖、扣分、创建库存的原子性
 * - **性能监控完善**：记录每次执行的时间、成功率、管线使用情况
 * - **超时保护机制**：默认30秒超时，防止管线执行过长阻塞服务
 * - **缓存优化性能**：奖品配置、用户抽奖次数使用缓存，减少数据库查询
 * - **日志完整追踪**：详细的执行日志（INFO/DEBUG/ERROR三级），便于问题排查
 *
 * V4.6 架构特点：
 * - **1 条统一管线**：NormalDrawPipeline（整合原 3 条管线功能）
 * - **决策来源 Stage**：LoadDecisionSourceStage 统一判断 preset/override/normal
 * - **100%中奖机制**：每次抽奖必定从奖品池选择一个奖品（不存在"不中奖"逻辑）
 * - **保底机制集成**：保底逻辑整合在 GuaranteeStage 中
 * - **统一事务管理**：所有管线执行支持外部事务，确保数据一致性
 * - **ManagementStrategy 保留**：仅用于管理 API（如强制中奖、查询历史）
 *
 * 关键方法列表：
 * - executeLottery() - 统一抽奖执行入口（委托给 DrawOrchestrator）
 * - getHealthStatus() - 获取引擎健康状态（Pipeline 模式）
 * - healthCheck() - 健康检查（Pipeline 状态）
 * - getMetrics() - 获取性能指标
 * - updateMetrics() - 更新性能指标（执行时间、成功率、管线使用统计）
 * - getEngineHealth() - 获取引擎健康状态（运行时长、成功率、平均执行时间）
 *
 * 组件依赖：
 * - DrawOrchestrator：管线编排器（核心执行入口）
 * - NormalDrawPipeline：统一抽奖管线（整合 preset/override/normal）
 * - LoadDecisionSourceStage：决策来源判断 Stage
 * - ManagementStrategy：管理操作策略（仅用于管理 API）
 * - PerformanceMonitor：性能监控组件（执行时间、慢查询告警）
 * - CacheManager：缓存管理组件（奖品配置、用户次数）
 * - Logger：日志组件（INFO/DEBUG/ERROR三级日志）
 *
 * 数据模型关联：
 * - LotteryCampaign：抽奖活动表（活动配置、有效期、奖品池）
 * - LotteryPrize：奖品表（奖品信息、概率、库存）
 * - LotteryDraw：抽奖记录表（用户抽奖历史、中奖记录）
 * - ItemInstance：物品实例表（中奖奖品存储）
 * - AssetTransaction：资产交易表（抽奖扣分记录）
 *
 * 性能指标：
 * - 平均执行时间：< 500ms（不含数据库写入）
 * - 管线执行超时：30秒（可配置）
 * - 缓存命中率：> 80%（奖品配置缓存）
 * - 成功率：> 99%（排除用户资格不足）
 *
 * 使用示例：
 * ```javascript
 * // 示例1：普通用户抽奖（带事务保护）
 * const transaction = await sequelize.transaction();
 * try {
 *   const engine = new UnifiedLotteryEngine({
 *     enableMetrics: true,
 *     enableCache: true,
 *     maxExecutionTime: 30000
 *   });
 *
 *   const result = await engine.executeLottery({
 *     user_id: 1,
 *     lottery_campaign_id: 2,
 *     draws_count: 1,
 *     user_points: 500,
 *     user_draws_today: 2
 *   }, transaction);
 *
 *   if (result.success) {
 *     logger.info(`中奖：${result.prize_name}，价值：${result.prize_value}分`);
 *     await transaction.commit();
 *   } else {
 *     await transaction.rollback();
 *   }
 * } catch (error) {
 *   await transaction.rollback();
 * }
 *
 * // 示例2：查看引擎健康状态
 * const health = engine.getEngineHealth();
 * logger.info(`运行时长: ${health.uptime_hours}小时`);
 * logger.info(`总执行次数: ${health.metrics.total_executions}`);
 * logger.info(`成功率: ${health.metrics.success_rate}%`);
 * logger.info(`平均执行时间: ${health.metrics.average_execution_time}ms`);
 * ```
 *
 * @version 4.0.0
 * @date 2025年01月21日
 * @timezone Asia/Shanghai (北京时间)
 * @description 基于餐厅积分抽奖系统的真实业务需求设计
 *
 * 创建时间：2025年01月21日
 * 最后更新：2025年10月30日
 * 使用模型：Claude Sonnet 4.5
 */

const BeijingTimeHelper = require('../../utils/timeHelper')
const PerformanceMonitor = require('./utils/PerformanceMonitor')
const CacheManager = require('./utils/CacheManager')

/**
 * V4.6 管线编排器
 *
 * 使用 Pipeline 架构编排抽奖流程
 */
const DrawOrchestrator = require('./pipeline/DrawOrchestrator')

/**
 * 抽奖定价服务 - 统一定价计算入口
 * 注意：BusinessCacheHelper 已迁移到 LotteryQueryService 使用
 */
const LotteryPricingService = require('../lottery/LotteryPricingService')

/**
 * V4统一抽奖引擎核心类
 *
 * 职责：统一管理抽奖策略、执行流程、性能监控、缓存管理
 * 设计模式：策略模式 + 责任链模式
 *
 * @class UnifiedLotteryEngine
 */
class UnifiedLotteryEngine {
  /**
   * 构造函数 - 初始化抽奖引擎
   *
   * @param {Object} config - 引擎配置对象
   * @param {string} config.engineVersion - 引擎版本号，默认'4.0.0'
   * @param {boolean} config.enableMetrics - 是否启用性能指标，默认true
   * @param {boolean} config.enableCache - 是否启用缓存，默认true
   * @param {number} config.maxExecutionTime - 最大执行时间（毫秒），默认30000
   * @param {boolean} config.maintenanceMode - 维护模式，默认false
   */
  constructor(config = {}) {
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
    this.logger = require('../../utils/logger').logger

    /**
     * V4.6 管线编排器
     *
     * 执行流程：drawOrchestrator → Pipeline(Stages) → 统一结算
     *
     * @type {DrawOrchestrator}
     */
    this.drawOrchestrator = new DrawOrchestrator({
      enable_preset: true,
      enable_override: true
    })

    // 性能指标（统一使用 snake_case 命名）
    this.metrics = {
      total_executions: 0,
      successful_executions: 0,
      average_execution_time: 0,
      execution_times: [],
      pipelines_used: {}, // 🔄 从 strategies_used 改为 pipelines_used
      last_reset_time: BeijingTimeHelper.now()
    }

    // 启动时间戳
    this.startTime = BeijingTimeHelper.timestamp()

    this.logInfo('V4.6统一抽奖引擎初始化完成（Pipeline 模式）', {
      version: this.version,
      orchestrator_status: this.drawOrchestrator.getStatus(),
      enableMetrics: this.config.enableMetrics
    })
  }

  /**
   * 统一抽奖执行入口
   *
   * 使用 DrawOrchestrator 编排 Pipeline 执行抽奖流程
   *
   * @param {Object} context - 抽奖上下文
   * @param {number} context.user_id - 用户ID
   * @param {number} context.lottery_campaign_id - 活动ID
   * @param {string} context.idempotency_key - 幂等键
   * @param {Object} context.user_status - 用户状态（可选）
   * @param {Transaction} transaction - 外部事务对象（可选，用于连抽统一事务保护）
   * @returns {Promise<Object>} 抽奖结果
   */
  async executeLottery(context, transaction = null) {
    const startTime = BeijingTimeHelper.timestamp()
    const executionId = this.generateExecutionId()

    try {
      this.logInfo('开始执行抽奖（Pipeline 模式）', {
        executionId,
        user_id: context?.user_id,
        lottery_campaign_id: context?.lottery_campaign_id,
        hasExternalTransaction: !!transaction
      })

      // 构建 Pipeline 上下文
      const pipelineContext = {
        execution_id: executionId,
        timestamp: this.getBeijingTimestamp(),
        engine_version: this.version,
        transaction, // 传递外部事务
        ...context
      }

      /**
       * V4.6 核心改动：使用 DrawOrchestrator 替代 Strategy 链
       *
       * DrawOrchestrator 职责：
       * 1. 根据上下文选择管线（Preset > Override > Normal）
       * 2. 执行管线（各 Stage 顺序执行）
       * 3. 返回统一的结果格式
       */
      const orchestratorResult = await this.drawOrchestrator.execute(pipelineContext)

      // 格式化结果为标准抽奖返回格式
      const finalResult = this._formatOrchestratorResult(orchestratorResult, executionId)

      // 更新性能指标
      this.updateMetrics(startTime, finalResult.success, orchestratorResult.pipeline_type)

      this.logInfo('抽奖执行完成（Pipeline 模式）', {
        executionId,
        success: finalResult.success,
        pipeline_type: orchestratorResult.pipeline_type,
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
   * 格式化 DrawOrchestrator 返回结果为标准抽奖格式
   *
   * 将 Pipeline 执行结果转换为统一的 API 返回格式
   *
   * @param {Object} orchestratorResult - DrawOrchestrator.execute 返回结果
   * @param {string} executionId - 执行ID
   * @returns {Object} 标准化的抽奖结果
   * @private
   */
  _formatOrchestratorResult(orchestratorResult, executionId) {
    // 失败情况处理
    if (!orchestratorResult.success) {
      return {
        success: false,
        message: orchestratorResult.error || '抽奖执行失败',
        code: orchestratorResult.context?.errors?.[0]?.code || 'DRAW_FAILED',
        execution_id: executionId,
        engine_version: this.version,
        timestamp: this.getBeijingTimestamp()
      }
    }

    // 获取 SettleStage 的结算数据
    const settleData = orchestratorResult.context?.stage_results?.SettleStage?.data
    if (!settleData) {
      return {
        success: false,
        message: 'SettleStage 未返回数据',
        code: 'SETTLE_MISSING',
        execution_id: executionId,
        engine_version: this.version,
        timestamp: this.getBeijingTimestamp()
      }
    }

    // 构建标准返回格式
    const drawRecord = settleData.draw_record || {}
    const settleResult = settleData.settle_result || {}

    return {
      success: true,
      message: '抽奖成功',
      data: {
        draw_result: {
          lottery_draw_id: drawRecord.lottery_draw_id,
          lottery_prize_id: drawRecord.lottery_prize_id,
          prize_name: drawRecord.prize_name,
          prize_type: drawRecord.prize_type,
          prize_value: drawRecord.prize_value,
          reward_tier: drawRecord.reward_tier,
          guarantee_triggered: drawRecord.guarantee_triggered || false,
          points_cost: settleResult.draw_cost || 100,
          /**
           * 前端展示所需字段（多活动抽奖系统）
           * sort_order: 九宫格位置（来自 settle_result，原始来源 lottery_prizes 表）
           * rarity_code: 稀有度代码（来自 settle_result，原始来源 rarity_defs 外键）
           */
          sort_order: settleResult.sort_order,
          rarity_code: settleResult.rarity_code || 'common'
        }
      },
      // 元数据
      pipeline_type: orchestratorResult.pipeline_type,
      selection_reason: orchestratorResult.selection_reason,
      execution_id: executionId,
      engine_version: this.version,
      timestamp: this.getBeijingTimestamp()
    }
  }

  /**
   * 验证策略可用性
   *
   * @param {Object} strategy - 策略实例
   * @param {Object} context - 抽奖上下文
   * @returns {Promise<boolean>} 策略是否可用
   */
  async validateStrategy(strategy, context) {
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
   * @returns {Promise<Object>} 策略执行结果
   */
  async executeWithTimeout(strategy, context, transaction = null) {
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
   *
   * @param {Object} result - 策略原始返回结果
   * @param {string} strategyName - 策略名称
   * @returns {Object} 标准化后的结果
   */
  normalizeStrategyResult(result, strategyName) {
    // 如果已经是统一格式，直接返回
    if (result.success !== undefined && result.data !== undefined) {
      return result
    }

    // V4.0语义更新：处理 reward_tier 格式（替代原 is_winner）
    if (result.reward_tier !== undefined) {
      return {
        success: true,
        data: {
          draw_result: {
            reward_tier: result.reward_tier, // V4.0：奖励档位
            lottery_prize_id: result.prize?.id || null,
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
   *
   * @param {string} message - 错误消息
   * @param {Object} data - 附加数据
   * @returns {Object} 统一错误响应格式
   */
  createEngineError(message, data = {}) {
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
   *
   * @param {number} startTime - 开始时间戳
   * @param {boolean} success - 执行是否成功
   * @param {string|null} strategyUsed - 使用的策略名称
   * @returns {void} 无返回值
   */
  updateMetrics(startTime, success, strategyUsed) {
    const executionTime = Math.max(BeijingTimeHelper.timestamp() - startTime, 1) // 最小1ms

    this.metrics.total_executions++
    if (success) {
      this.metrics.successful_executions++
    }

    // 更新执行时间统计
    this.metrics.execution_times.push(executionTime)
    if (this.metrics.execution_times.length > 100) {
      this.metrics.execution_times = this.metrics.execution_times.slice(-100)
    }

    // 计算平均执行时间
    this.metrics.average_execution_time = Math.round(
      this.metrics.execution_times.reduce((sum, time) => sum + time, 0) /
        this.metrics.execution_times.length
    )

    // 更新管线使用统计（V4.6 改为 pipelines_used）
    if (strategyUsed) {
      this.metrics.pipelines_used[strategyUsed] =
        (this.metrics.pipelines_used[strategyUsed] || 0) + 1
    }
  }

  /**
   * 获取性能指标
   *
   * @returns {Object} 引擎性能指标数据（统一使用 snake_case 命名）
   * @returns {number} return.total_executions - 总执行次数
   * @returns {number} return.successful_executions - 成功执行次数
   * @returns {number} return.average_execution_time - 平均执行时间（毫秒）
   * @returns {Object} return.pipelines_used - 管线使用统计（V4.6 改为 pipelines_used）
   * @returns {string} return.last_reset_time - 上次重置时间
   * @returns {number} return.uptime - 运行时间（毫秒）
   * @returns {string} return.uptime_formatted - 格式化的运行时间
   * @returns {number} return.success_rate - 成功率（百分比）
   * @returns {string} return.engine_status - 引擎状态
   */
  getMetrics() {
    const uptime = BeijingTimeHelper.timestamp() - this.startTime
    const success_rate =
      this.metrics.total_executions > 0
        ? (this.metrics.successful_executions / this.metrics.total_executions) * 100
        : 0

    return {
      ...this.metrics,
      uptime,
      uptime_formatted: this.formatUptime(uptime),
      success_rate: Math.round(success_rate * 100) / 100,
      engine_status: this.config.maintenanceMode ? 'maintenance' : 'active'
    }
  }

  /**
   * 格式化运行时间
   *
   * @param {number} ms - 毫秒数
   * @returns {string} 格式化后的时间字符串
   */
  formatUptime(ms) {
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
   *
   * @returns {Object} 引擎健康状态信息
   */
  getHealthStatus() {
    try {
      // 获取 DrawOrchestrator 状态
      const orchestratorStatus = this.drawOrchestrator?.getStatus?.() || {}
      const pipelineTypes = orchestratorStatus.pipeline_types || []

      if (pipelineTypes.length === 0 && !this.drawOrchestrator) {
        return {
          status: 'unhealthy',
          message: 'V4.6: 管线编排器未初始化',
          pipelines: [],
          draw_orchestrator_ready: false,
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

      // V4.6: 构建管线状态列表
      const pipelines = pipelineTypes.map(name => ({
        name,
        status: 'enabled'
      }))

      return {
        status: 'healthy',
        message: 'V4.6引擎运行正常（Pipeline 模式）',
        pipelines,
        draw_orchestrator_ready: true,
        enabled_pipelines: pipelineTypes.length,
        total_executions: this.metrics.total_executions,
        success_rate: this.getMetrics().success_rate,
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
   * V4.6 健康检查方法（Pipeline 架构）
   *
   * @returns {Object} 健康检查结果
   */
  async healthCheck() {
    const startTime = BeijingTimeHelper.timestamp()

    try {
      /**
       * V4.6: 使用 Pipeline 状态替代原 Strategy 状态
       */
      const orchestratorStatus = this.drawOrchestrator?.getStatus?.() || {}
      const pipelineTypes = orchestratorStatus.pipeline_types || []

      // 构建管线状态信息
      const pipelines = {}
      for (const pipelineName of pipelineTypes) {
        pipelines[pipelineName] = {
          enabled: true,
          healthy: true
        }
      }

      const checkTime = BeijingTimeHelper.timestamp() - startTime

      return {
        status: 'healthy',
        version: this.version,
        checkTime,
        timestamp: this.getBeijingTimestamp(),
        pipelines, // V4.6: 使用 pipelines 替代 strategies
        draw_orchestrator_ready: !!this.drawOrchestrator,
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
   * 生成执行ID（已重命名为 lottery_session_id 格式，符合业界标准）
   *
   * @returns {string} 唯一执行ID（格式：lottery_tx_{timestamp}_{random}_{seq}）
   */
  generateExecutionId() {
    // 使用 IdempotencyHelper 生成标准的 lottery_session_id
    const { generateLotterySessionId } = require('../../utils/IdempotencyHelper')
    return generateLotterySessionId()
  }

  /**
   * 生成抽奖会话ID（lottery_session_id）
   * 用途：把同一次抽奖的多条流水（consume + reward）关联起来
   *
   * @returns {string} 抽奖会话ID
   */
  generateLotterySessionId() {
    return this.generateExecutionId()
  }

  /**
   * 获取北京时间戳
   *
   * @returns {string} 北京时间格式化字符串
   */
  getBeijingTimestamp() {
    return BeijingTimeHelper.now()
  }

  /**
   * 日志记录方法
   *
   * @param {string} level - 日志级别
   * @param {string} message - 日志消息
   * @param {Object} data - 附加数据
   * @returns {void} 无返回值
   */
  log(level, message, data = {}) {
    const logEntry = {
      timestamp: this.getBeijingTimestamp(),
      level: level.toUpperCase(),
      message,
      engineVersion: this.version,
      ...data
    }

    this.logger.info(`[${logEntry.timestamp}] ${logEntry.level}: ${message}`, data)
  }

  /**
   * 记录信息日志
   *
   * @param {string} message - 日志消息
   * @param {Object} data - 附加数据
   * @returns {void} 无返回值
   */
  logInfo(message, data = {}) {
    this.log('info', message, data)
  }

  /**
   * 记录错误日志
   *
   * @param {string} message - 日志消息
   * @param {Object} data - 附加数据
   * @returns {void} 无返回值
   */
  logError(message, data = {}) {
    this.log('error', message, data)
  }

  /**
   * 记录调试日志
   *
   * @param {string} message - 日志消息
   * @param {Object} data - 附加数据
   * @returns {void} 无返回值
   */
  logDebug(message, data = {}) {
    this.log('debug', message, data)
  }

  /**
   * 记录警告日志
   *
   * @param {string} message - 日志消息
   * @param {Object} data - 附加数据
   * @returns {void} 无返回值
   */
  logWarn(message, data = {}) {
    this.log('warn', message, data)
  }

  /**
   * ============================================
   * 🔥 业务API方法（路由层调用）
   * 以下方法为路由层提供直接的业务功能支持
   * ============================================
   */

  // 注意：get_campaign_prizes 已迁移到 LotteryQueryService.getCampaignPrizes

  // 注意：get_campaign_config 已迁移到 LotteryQueryService.getCampaignConfig

  /**
   * 执行抽奖（路由层调用接口）
   *
   * 🔒 事务边界治理（2026-01-05 决策）：
   * - 支持外部事务传入（options.transaction），由路由层统一开事务
   * - 如果未传入外部事务，则内部创建事务
   * - 外部事务模式下，不在方法内 commit/rollback（由外部控制）
   *
   * 幂等性机制（业界标准）：
   * - 入口幂等：通过路由层 IdempotencyService 实现"重试返回首次结果"
   * - 流水幂等：通过派生 idempotency_key 保证每条流水唯一
   *
   * @param {number} user_id - 用户ID
   * @param {number} lottery_campaign_id - 抽奖活动ID
   * @param {number} draw_count - 抽奖次数（默认1次）
   * @param {Object} options - 选项参数
   * @param {string} options.idempotency_key - 请求级幂等键（用于派生事务级幂等键）
   * @param {string} options.request_source - 请求来源标识
   * @param {Object} options.transaction - Sequelize事务对象（可选，由路由层 TransactionManager 传入）
   * @returns {Promise<Object>} 抽奖结果
   */
  async execute_draw(user_id, lottery_campaign_id, draw_count = 1, options = {}) {
    // 方案B：从请求参数获取或生成幂等键
    const {
      generateLotterySessionId,
      deriveTransactionIdempotencyKey
    } = require('../../utils/IdempotencyHelper')
    const requestIdempotencyKey =
      options.idempotency_key ||
      require('../../utils/IdempotencyHelper').generateRequestIdempotencyKey()
    const lotterySessionId = generateLotterySessionId()

    /*
     * 🔒 事务边界治理（2026-01-05 决策）
     *
     * 事务策略：
     * - 支持外部事务传入（options.transaction），由路由层统一开事务
     * - 如果未传入外部事务，则内部创建事务
     * - 外部事务模式下，不在方法内 commit/rollback（由外部控制）
     *
     * 业务价值：
     * - 防止出现"扣了600积分但只抽了6次"的部分失败情况
     * - 确保保底计数的准确性（如果失败，保底计数自动回滚）
     * - 符合"路由层统一开事务"的架构规范
     */
    const models = require('../../models')
    const { Sequelize } = require('sequelize')

    // 判断是否使用外部事务
    const externalTransaction = options.transaction
    const transaction =
      externalTransaction ||
      (await models.sequelize.transaction({
        timeout: 30000, // 30秒超时自动回滚，防止长事务卡死
        isolationLevel: Sequelize.Transaction.ISOLATION_LEVELS.READ_COMMITTED // 读已提交，防止脏读
      }))

    try {
      this.logInfo('开始执行抽奖（路由层调用）', {
        user_id,
        lottery_campaign_id,
        draw_count
      })

      // 🔴 参数验证
      if (!user_id || !lottery_campaign_id) {
        throw new Error('缺少必需参数：user_id或lottery_campaign_id')
      }

      if (draw_count < 1 || draw_count > 10) {
        throw new Error('抽奖次数必须在1-10之间')
      }

      // 🔧 V4.3修复：使用新的资产系统获取用户积分信息
      const BalanceService = require('../asset/BalanceService')
      const userAccountEntity = await BalanceService.getOrCreateAccount(
        { user_id },
        { transaction }
      )
      if (!userAccountEntity || userAccountEntity.status !== 'active') {
        throw new Error('用户账户不存在或已冻结')
      }
      const userPointsBalance = await BalanceService.getOrCreateBalance(
        userAccountEntity.account_id,
        'POINTS',
        { transaction }
      )
      if (!userPointsBalance) {
        throw new Error('用户积分账户不存在')
      }
      // 构造积分账户结构对象
      const userAccount = {
        account_id: userAccountEntity.account_id,
        user_id,
        available_points: userPointsBalance ? Number(userPointsBalance.available_amount) : 0
      }

      // 🔴 获取活动配置（用于读取定价配置）
      const campaign = await models.LotteryCampaign.findByPk(lottery_campaign_id, {
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
       * 通过 LotteryPricingService 统一获取定价：
       * - 10连抽可享受九折优惠（900积分，节省100积分）
       * - 修改定价只需改配置，无需改代码
       * - 支持灵活的折扣策略
       */
      const pricing = await LotteryPricingService.getDrawPricing(
        draw_count,
        campaign.lottery_campaign_id,
        {
          transaction
        }
      ) // 从 LotteryPricingService 统一获取定价
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

      /**
       * 🎯 V4.5 配额控制：原子扣减每日抽奖次数配额（2025-12-23 新增）
       *
       * 业务场景：
       * - 实现四维度（全局/活动/角色/用户）抽奖次数配额控制
       * - 支持连抽场景的原子性扣减（10连抽一次扣减10次）
       * - 避免并发窗口期问题，保证配额不超限
       *
       * 执行流程：
       * 1. 确保用户当日配额行存在（不存在则根据规则自动创建）
       * 2. 原子扣减配额（UPDATE ... WHERE 条件扣减）
       * 3. 如果配额不足，返回 403 错误（整笔拒绝，不支持部分成功）
       */
      const LotteryQuotaService = require('../lottery/LotteryQuotaService')

      // 原子扣减配额（事务内执行，支持连抽）
      const quotaResult = await LotteryQuotaService.tryDeductQuota(
        {
          user_id,
          lottery_campaign_id,
          draw_count
        },
        { transaction }
      )

      if (!quotaResult.success) {
        // 配额不足，抛出标准错误（带 statusCode 和 errorCode）
        const quotaError = new Error(
          quotaResult.message ||
            `今日抽奖次数已达上限（${quotaResult.limit + quotaResult.bonus}次），剩余${quotaResult.remaining}次`
        )
        quotaError.statusCode = 403 // 关键：明确设置 403 Forbidden
        quotaError.errorCode = 'DAILY_DRAW_LIMIT_EXCEEDED' // 关键：明确设置业务码
        quotaError.data = {
          user_id,
          lottery_campaign_id,
          requested_count: draw_count,
          remaining_quota: quotaResult.remaining || 0,
          limit_value: quotaResult.limit || 0,
          bonus_value: quotaResult.bonus || 0,
          used_count: quotaResult.used || 0,
          matched_rule_id: quotaResult.matched_rule_id || null
        }
        throw quotaError
      }

      this.logInfo('配额扣减成功', {
        user_id,
        lottery_campaign_id,
        draw_count,
        remaining: quotaResult.remaining,
        limit: quotaResult.limit,
        bonus: quotaResult.bonus,
        used: quotaResult.used
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
      /*
       * 🔧 V4.3修复：使用BalanceService替代PointsService
       * 方案B：使用派生幂等键（从请求幂等键派生消费幂等键）
       */
      const consumeIdempotencyKey = deriveTransactionIdempotencyKey(
        requestIdempotencyKey,
        'consume'
      )

      // 步骤1：统一扣除折扣后的总积分（在事务中执行）
      // eslint-disable-next-line no-restricted-syntax -- 已传递 transaction（见下方 options 参数）
      const assetChangeResult = await BalanceService.changeBalance(
        {
          user_id,
          asset_code: 'POINTS',
          delta_amount: -requiredPoints, // 扣减为负数
          business_type: 'lottery_consume',
          idempotency_key: consumeIdempotencyKey, // 方案B：使用派生幂等键
          lottery_session_id: lotterySessionId, // 方案B：关联抽奖会话
          meta: {
            source_type: 'system',
            title: draw_count === 1 ? '抽奖消耗积分' : `${draw_count}连抽消耗积分`,
            description:
              draw_count === 1
                ? `单次抽奖消耗${requiredPoints}积分`
                : `${draw_count}连抽消耗${requiredPoints}积分（${pricing.label}，原价${pricing.original_cost}积分，节省${pricing.saved_points}积分）`,
            request_idempotency_key: requestIdempotencyKey,
            lottery_campaign_id,
            draw_count
          }
        },
        { transaction }
      )

      /*
       * 🔥 事务边界治理：获取资产流水ID用于对账
       * 修复日期：2026-01-09
       * 问题：连抽场景下skip_points_deduction=true导致策略内部不会扣积分
       *       但asset_transaction_id未传递给context，导致LotteryDraw创建失败（NOT NULL约束）
       * 解决：在统一扣积分时获取transaction_id，传递给每次抽奖的context
       */
      const unifiedAssetTransactionId =
        assetChangeResult?.transaction_record?.transaction_id || null

      this.logInfo('连抽积分统一扣除成功', {
        user_id,
        draw_count,
        requiredPoints,
        pricing,
        lotterySessionId,
        consumeIdempotencyKey,
        asset_transaction_id: unifiedAssetTransactionId
      })

      const results = []

      /*
       * 🆕 Phase 2 增强：连抽批次ID生成
       *
       * 业务价值：
       * - 将同一次连抽的多条记录关联在一起
       * - 便于后续统计分析和审计追踪
       * - batch_id 格式：batch_{user_id}_{timestamp}_{random}
       */
      const batch_id =
        draw_count > 1
          ? `batch_${user_id}_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`
          : null // 单抽不需要 batch_id

      // 步骤2：执行多次抽奖（不再重复扣除积分）
      for (let i = 0; i < draw_count; i++) {
        /**
         * 🎯 方案B修复：使用派生幂等键用于每次抽奖记录
         *
         * 业务场景：防止用户重复提交创建多条抽奖记录
         * 幂等规则（方案B - 业界标准）：
         * - 格式：{request_idempotency_key}:reward_{draw_number}
         * - 从请求幂等键派生，而非抽奖会话ID
         * - 同一 idempotency_key 只能创建一条记录
         * - 重复提交返回已有记录（幂等）
         */
        const drawIdempotencyKey = deriveTransactionIdempotencyKey(
          requestIdempotencyKey,
          `reward_${i + 1}`
        )

        const context = {
          user_id,
          lottery_campaign_id,
          draw_number: i + 1,
          total_draws: draw_count,
          draw_count, // 🆕 Phase 2：传递抽奖次数
          batch_id, // 🆕 Phase 2：连抽批次ID（null 表示单抽）
          skip_points_deduction: true, // 🎯 关键标识：告诉策略不要再扣除积分
          lottery_session_id: lotterySessionId, // 方案B：传递抽奖会话ID
          idempotency_key: drawIdempotencyKey, // 方案B：派生幂等键
          request_idempotency_key: requestIdempotencyKey, // 请求级幂等键
          /*
           * 🔥 事务边界治理：传递统一扣款的资产流水ID（修复 2026-01-09）
           * 业务规则：连抽场景下积分已在外层统一扣除，需将流水ID传递给策略
           *          用于写入 lottery_draws.asset_transaction_id（NOT NULL字段）
           */
          asset_transaction_id: unifiedAssetTransactionId,
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
        // eslint-disable-next-line no-await-in-loop -- 多连抽需要在事务内串行执行
        const drawResult = await this.executeLottery(context, transaction)

        if (drawResult.success) {
          results.push({
            draw_number: i + 1,
            // V4.0语义更新：使用 reward_tier 替代 is_winner
            reward_tier: drawResult.data?.draw_result?.reward_tier || 'low',
            prize: drawResult.data?.draw_result?.lottery_prize_id
              ? {
                  id: drawResult.data.draw_result.lottery_prize_id,
                  name: drawResult.data.draw_result.prize_name,
                  type: drawResult.data.draw_result.prize_type,
                  value: drawResult.data.draw_result.prize_value,
                  sort_order: drawResult.data.draw_result.sort_order,
                  /** 稀有度代码（前端直接使用此字段名显示对应颜色光效） */
                  rarity_code: drawResult.data.draw_result.rarity_code || 'common'
                }
              : null,
            points_cost: drawResult.data?.draw_result?.points_cost || 0
          })

          /*
           * 🔥 修复：连抽场景不累加points_cost（外层已统一扣除）
           * totalPointsCost仅用于统计，实际扣除金额是requiredPoints
           */
        } else {
          // 抽奖失败，停止后续抽奖
          throw new Error(drawResult.message || '抽奖执行失败')
        }
      }

      /*
       * 🔒 事务边界治理（2026-01-05 决策）
       *
       * 提交时机：所有抽奖都成功后
       * 提交效果：所有数据库操作（积分扣除、奖品发放、抽奖记录、保底计数等）一次性生效
       *
       * 改造说明：仅在自建事务时提交，外部事务由调用方控制
       */
      if (!externalTransaction) {
        await transaction.commit()
      }

      /**
       * 🆕 事务提交后重新查询实际积分余额（确保数据准确）
       * 🔧 V4.3修复：使用新的资产系统查询余额
       */
      const updatedAccountEntity = await BalanceService.getOrCreateAccount({ user_id })
      const updatedPointsBalance = await BalanceService.getOrCreateBalance(
        updatedAccountEntity.account_id,
        'POINTS'
      )

      const remainingPoints = updatedPointsBalance
        ? Number(updatedPointsBalance.available_amount)
        : userAccount.available_points - requiredPoints

      this.logInfo('抽奖执行完成（事务已提交）', {
        user_id,
        lottery_campaign_id,
        draw_count,
        actualPointsCost: requiredPoints, // 🔥 修复：实际扣除的积分数（含折扣）
        remainingPoints,
        // V4.0语义更新：统计高档奖励次数（替代原中奖次数统计）
        highTierWins: results.filter(r => r.reward_tier === 'high').length,
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
        execution_id: lotterySessionId, // 方案B：返回抽奖会话ID（用于关联查询和入口幂等表）
        draw_count, // 抽奖次数
        prizes: results, // 抽奖结果数组
        total_points_cost: requiredPoints, // 实际消耗积分（折后价）
        original_cost: pricing.original_cost, // 原价（无折扣价格）- 🔴 2026-01-21 修复：使用服务计算值
        discount: pricing.discount, // 折扣率（0.9=九折）
        saved_points: pricing.saved_points, // 节省积分（优惠金额）- 🔴 2026-01-21 修复：使用服务计算值
        remaining_balance: remainingPoints, // 剩余积分余额
        draw_type: pricing.label || `${draw_count}连抽` // 前端显示的抽奖类型名称
      }
    } catch (error) {
      /*
       * 🔒 事务边界治理（2026-01-05 决策）
       *
       * 回滚时机：任何一次抽奖失败时
       * 回滚效果：所有已执行的数据库操作都会被撤销
       *
       * 改造说明：仅在自建事务时回滚，外部事务由调用方控制
       *
       * 具体回滚内容：
       * 1. 已扣除的积分 → 自动退回
       * 2. 已发放的奖品 → 自动撤回
       * 3. 已保存的抽奖记录 → 自动删除
       * 4. 已更新的保底计数 → 自动恢复
       */
      if (!externalTransaction) {
        await transaction.rollback()
      }

      this.logError('抽奖执行失败，事务已回滚', {
        user_id,
        lottery_campaign_id,
        draw_count,
        error: error.message
      })
      throw new Error(`抽奖执行失败: ${error.message}`)
    }
  }

  // 注意：get_user_history 已迁移到 LotteryQueryService.getUserHistory

  // 注意：get_campaigns 已迁移到 LotteryQueryService.getCampaigns
}

// 🔥 导出单例实例（供路由层直接调用）
const engineInstance = new UnifiedLotteryEngine()

// 同时导出类（供需要自定义配置的场景）
module.exports = engineInstance
module.exports.UnifiedLotteryEngine = UnifiedLotteryEngine
