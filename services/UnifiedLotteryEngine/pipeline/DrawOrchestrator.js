'use strict'

/**
 * DrawOrchestrator - 抽奖管线编排器
 *
 * ⚠️ V4.6 Phase 5 重构（2026-01-19）：
 * - 原 3 条管线（Normal/Preset/Override）已合并为统一管线
 * - 决策来源由管线内部的 LoadDecisionSourceStage 判断
 * - Orchestrator 现在只负责创建和执行统一管线
 *
 * 职责：
 * 1. 创建统一抽奖管线
 * 2. 执行管线并返回结果
 * 3. 记录执行日志
 *
 * 决策来源判断逻辑已移至管线内部的 LoadDecisionSourceStage：
 * 1. 预设（Preset）- 最高优先级
 * 2. 管理干预（Override）- 次高优先级
 * 3. 正常抽奖（Normal）- 最低优先级
 *
 * @module services/UnifiedLotteryEngine/pipeline/DrawOrchestrator
 * @author 统一抽奖架构重构
 * @since 2026-01-18
 * @updated 2026-01-19 Phase 5 统一管线合并
 */

const { logger } = require('../../../utils/logger')

// 管线类型常量（保留用于日志和状态报告）
const PIPELINE_TYPES = {
  UNIFIED: 'unified' // Phase 5: 统一管线
}

/**
 * 抽奖管线编排器
 *
 * Phase 5 重构：使用统一管线替代原 3 条管线
 */
class DrawOrchestrator {
  /**
   * 创建编排器实例
   *
   * @param {Object} options - 配置选项
   */
  constructor(options = {}) {
    this.options = {
      ...options
    }

    // 延迟加载统一管线（避免循环依赖）
    this._pipeline = null
  }

  /**
   * 获取统一管线实例（延迟加载）
   *
   * ⚠️ Phase 5 更新：
   * - 原 3 条管线已合并为 NormalDrawPipeline（统一管线）
   * - 决策来源由管线内部的 LoadDecisionSourceStage 判断
   *
   * @returns {Object} 统一管线实例
   * @private
   */
  _getPipeline() {
    if (!this._pipeline) {
      const NormalDrawPipeline = require('./NormalDrawPipeline')
      this._pipeline = new NormalDrawPipeline()
    }
    return this._pipeline
  }

  /**
   * 执行抽奖
   *
   * ⚠️ Phase 5 重构：
   * - 不再需要选择管线，直接执行统一管线
   * - 决策来源由管线内部的 LoadDecisionSourceStage 判断
   *
   * @param {Object} context - 抽奖上下文
   * @param {number} context.user_id - 用户ID
   * @param {number} context.lottery_campaign_id - 活动ID
   * @param {string} context.idempotency_key - 幂等键
   * @param {Object} context.transaction - 数据库事务（可选）
   * @returns {Promise<Object>} 抽奖结果
   */
  async execute(context) {
    const { user_id, lottery_campaign_id } = context
    const start_time = Date.now()

    this._log('info', '开始抽奖编排', { user_id, lottery_campaign_id })

    try {
      // 1. 获取统一管线实例
      const pipeline = this._getPipeline()

      this._log('info', '使用统一管线执行抽奖', {
        user_id,
        lottery_campaign_id,
        pipeline_type: PIPELINE_TYPES.UNIFIED
      })

      // 2. 准备管线上下文
      const pipeline_context = {
        ...context,
        orchestrator_start_time: start_time
      }

      // 3. 执行统一管线
      const result = await pipeline.run(pipeline_context)

      // 4. 记录执行结果
      const duration = Date.now() - start_time

      // 从管线结果中获取实际的决策来源
      const decision_source =
        result.stage_data?.LoadDecisionSourceStage?.data?.decision_source || 'normal'

      this._log('info', '抽奖编排完成', {
        user_id,
        lottery_campaign_id,
        pipeline_type: PIPELINE_TYPES.UNIFIED,
        decision_source,
        success: result.success,
        duration_ms: duration
      })

      return {
        ...result,
        pipeline_type: PIPELINE_TYPES.UNIFIED,
        decision_source,
        orchestrator_duration_ms: duration
      }
    } catch (error) {
      const duration = Date.now() - start_time

      this._log('error', '抽奖编排失败', {
        user_id,
        lottery_campaign_id,
        error: error.message,
        duration_ms: duration
      })

      throw error
    }
  }

  /**
   * 记录日志
   *
   * @param {string} level - 日志级别
   * @param {string} message - 日志消息
   * @param {Object} data - 附加数据
   * @returns {void}
   * @private
   */
  _log(level, message, data = {}) {
    const log_data = {
      component: 'DrawOrchestrator',
      ...data
    }

    if (logger && typeof logger[level] === 'function') {
      logger[level](`[Orchestrator] ${message}`, log_data)
    } else {
      console.log(`[${level.toUpperCase()}] [Orchestrator] ${message}`, log_data)
    }
  }

  /**
   * 获取编排器状态
   *
   * @returns {Object} 编排器状态信息
   */
  getStatus() {
    return {
      options: this.options,
      pipeline_type: PIPELINE_TYPES.UNIFIED,
      pipeline_loaded: this._pipeline !== null,
      architecture: 'unified_pipeline', // Phase 5: 统一管线架构
      decision_source_stage: 'LoadDecisionSourceStage' // 决策来源判断移至 Stage 内部
    }
  }
}

// 导出管线类型常量
DrawOrchestrator.PIPELINE_TYPES = PIPELINE_TYPES

module.exports = DrawOrchestrator
