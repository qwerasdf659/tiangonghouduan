'use strict'

/**
 * PipelineRunner - 管线运行器基类
 *
 * 职责：
 * 1. 按顺序执行管线中的各个 Stage
 * 2. 管理 Stage 之间的上下文传递
 * 3. 处理 Stage 执行过程中的错误
 * 4. 支持事务管理（所有写操作在 SettleStage 中完成）
 *
 * 设计原则：
 * - Single Writer Principle: 只有 SettleStage 可以执行写操作
 * - 强一致性: 所有写操作在单事务中完成
 * - 可审计性: 每个 Stage 的执行结果都记录在上下文中
 *
 * @module services/UnifiedLotteryEngine/pipeline/PipelineRunner
 * @author 统一抽奖架构重构
 * @since 2026-01-18
 */

const { logger } = require('../../../utils/logger')

/**
 * 管线运行器基类
 */
class PipelineRunner {
  /**
   * 创建管线运行器实例
   *
   * @param {string} pipeline_name - 管线名称（用于日志和监控）
   * @param {Object} options - 配置选项
   * @param {boolean} options.enable_timing - 是否启用耗时统计（默认true）
   * @param {boolean} options.enable_logging - 是否启用日志记录（默认true）
   */
  constructor(pipeline_name, options = {}) {
    this.pipeline_name = pipeline_name
    this.stages = []
    this.options = {
      enable_timing: true,
      enable_logging: true,
      ...options
    }
  }

  /**
   * 添加 Stage 到管线
   *
   * @param {Object} stage - Stage 实例，必须实现 execute(context) 方法
   * @returns {PipelineRunner} 返回自身，支持链式调用
   */
  addStage(stage) {
    if (!stage || typeof stage.execute !== 'function') {
      throw new Error('Invalid stage: must implement execute(context) method')
    }
    this.stages.push(stage)
    return this
  }

  /**
   * 执行管线
   *
   * @param {Object} context - 执行上下文
   * @param {number} context.user_id - 用户ID
   * @param {number} context.lottery_campaign_id - 活动ID
   * @param {string} context.idempotency_key - 幂等键
   * @param {Object} context.transaction - 数据库事务（可选，由 SettleStage 管理）
   * @returns {Promise<Object>} 执行结果
   */
  async run(context) {
    const start_time = Date.now()
    const execution_id = this._generateExecutionId()

    // 初始化上下文
    const pipeline_context = {
      ...context,
      pipeline_name: this.pipeline_name,
      execution_id,
      stage_results: {},
      stage_timings: {},
      errors: [],
      started_at: new Date().toISOString()
    }

    this._log('info', '开始执行管线', {
      execution_id,
      user_id: context.user_id,
      lottery_campaign_id: context.lottery_campaign_id,
      stage_count: this.stages.length
    })

    try {
      // 按顺序执行每个 Stage（管线设计要求顺序执行，每个 Stage 依赖上一个的结果）
      // eslint-disable-next-line no-await-in-loop
      for (const stage of this.stages) {
        const stage_name = stage.constructor.name
        const stage_start = Date.now()

        this._log('debug', `执行 Stage: ${stage_name}`, { execution_id })

        try {
          // 执行 Stage（管线设计要求顺序执行）
          // eslint-disable-next-line no-await-in-loop
          const stage_result = await stage.execute(pipeline_context)

          // 记录 Stage 结果
          pipeline_context.stage_results[stage_name] = stage_result
          pipeline_context.stage_timings[stage_name] = Date.now() - stage_start

          this._log('debug', `Stage ${stage_name} 执行完成`, {
            execution_id,
            duration_ms: pipeline_context.stage_timings[stage_name]
          })

          // 检查是否需要中断管线（如预设命中、保底触发等）
          if (stage_result && stage_result.should_skip_remaining) {
            this._log('info', `Stage ${stage_name} 请求跳过后续 Stage`, {
              execution_id,
              reason: stage_result.skip_reason
            })
            break
          }
        } catch (stage_error) {
          // 记录 Stage 错误
          pipeline_context.errors.push({
            stage: stage_name,
            error: stage_error.message,
            stack: stage_error.stack
          })

          this._log('error', `Stage ${stage_name} 执行失败`, {
            execution_id,
            error: stage_error.message
          })

          // 根据错误类型决定是否继续
          if (this._isFatalError(stage_error)) {
            throw stage_error
          }
        }
      }

      // 计算总耗时
      const total_duration = Date.now() - start_time
      pipeline_context.completed_at = new Date().toISOString()
      pipeline_context.total_duration_ms = total_duration

      this._log('info', '管线执行完成', {
        execution_id,
        total_duration_ms: total_duration,
        stage_count: this.stages.length,
        error_count: pipeline_context.errors.length
      })

      return {
        success: pipeline_context.errors.length === 0,
        execution_id,
        pipeline_name: this.pipeline_name,
        context: pipeline_context,
        duration_ms: total_duration
      }
    } catch (error) {
      const total_duration = Date.now() - start_time

      this._log('error', '管线执行失败', {
        execution_id,
        error: error.message,
        total_duration_ms: total_duration
      })

      return {
        success: false,
        execution_id,
        pipeline_name: this.pipeline_name,
        error: error.message,
        context: pipeline_context,
        duration_ms: total_duration
      }
    }
  }

  /**
   * 生成执行ID
   *
   * @returns {string} 唯一执行ID
   * @private
   */
  _generateExecutionId() {
    const timestamp = Date.now()
    const random = Math.random().toString(36).substring(2, 8)
    return `${this.pipeline_name}_${timestamp}_${random}`
  }

  /**
   * 判断是否为致命错误（需要中断管线）
   *
   * @param {Error} error - 错误对象
   * @returns {boolean} 是否为致命错误
   * @private
   */
  _isFatalError(error) {
    // 以下错误类型视为致命错误，需要中断管线
    const fatal_error_types = [
      'CAMPAIGN_NOT_FOUND',
      'CAMPAIGN_INACTIVE',
      'USER_NOT_ELIGIBLE',
      'INSUFFICIENT_POINTS',
      'QUOTA_EXHAUSTED',
      'TRANSACTION_FAILED'
    ]

    return fatal_error_types.includes(error.code) || error.fatal === true
  }

  /**
   * 记录日志
   *
   * @param {string} level - 日志级别（error/warn/info/debug）
   * @param {string} message - 日志消息
   * @param {Object} data - 附加数据
   * @returns {void}
   * @private
   */
  _log(level, message, data = {}) {
    if (!this.options.enable_logging) return

    const log_data = {
      pipeline: this.pipeline_name,
      ...data
    }

    logger[level](`[Pipeline] ${message}`, log_data)
  }

  /**
   * 获取管线信息
   *
   * @returns {Object} 管线信息
   */
  getInfo() {
    return {
      name: this.pipeline_name,
      stage_count: this.stages.length,
      stages: this.stages.map(s => s.constructor.name),
      options: this.options
    }
  }
}

module.exports = PipelineRunner
