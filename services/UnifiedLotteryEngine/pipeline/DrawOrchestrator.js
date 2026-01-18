'use strict'

/**
 * DrawOrchestrator - 抽奖管线编排器
 *
 * 职责：
 * 1. 根据上下文选择合适的管线（Normal/Preset/Override）
 * 2. 管理管线的创建和执行
 * 3. 处理管线选择的优先级逻辑
 *
 * 管线选择优先级（已拍板 2026-01-18）：
 * 1. 预设（Preset）- 最高优先级：有待使用预设时，走 PresetAwardPipeline
 * 2. 管理干预（Override）- 次高优先级：有 force_win/force_lose 时，走 OverridePipeline
 * 3. 正常抽奖（Normal）- 最低优先级：无上述情况时，走 NormalDrawPipeline
 *
 * @module services/UnifiedLotteryEngine/pipeline/DrawOrchestrator
 * @author 统一抽奖架构重构
 * @since 2026-01-18
 */

const { logger } = require('../../../utils/logger')
const { LotteryPreset, LotteryManagementSetting } = require('../../../models')

// 管线类型常量
const PIPELINE_TYPES = {
  NORMAL: 'normal',
  PRESET: 'preset',
  OVERRIDE: 'override'
}

/**
 * 抽奖管线编排器
 */
class DrawOrchestrator {
  /**
   * 创建编排器实例
   *
   * @param {Object} options - 配置选项
   * @param {boolean} options.enable_preset - 是否启用预设管线（默认true）
   * @param {boolean} options.enable_override - 是否启用干预管线（默认true）
   */
  constructor(options = {}) {
    this.options = {
      enable_preset: true,
      enable_override: true,
      ...options
    }

    // 延迟加载管线（避免循环依赖）
    this._pipelines = null
  }

  /**
   * 获取管线实例（延迟加载）
   *
   * @returns {Object} 管线实例映射
   * @private
   */
  _getPipelines() {
    if (!this._pipelines) {
      const NormalDrawPipeline = require('./NormalDrawPipeline')
      const PresetAwardPipeline = require('./PresetAwardPipeline')
      const OverridePipeline = require('./OverridePipeline')

      this._pipelines = {
        [PIPELINE_TYPES.NORMAL]: new NormalDrawPipeline(),
        [PIPELINE_TYPES.PRESET]: new PresetAwardPipeline(),
        [PIPELINE_TYPES.OVERRIDE]: new OverridePipeline()
      }
    }
    return this._pipelines
  }

  /**
   * 执行抽奖
   *
   * @param {Object} context - 抽奖上下文
   * @param {number} context.user_id - 用户ID
   * @param {number} context.campaign_id - 活动ID
   * @param {string} context.idempotency_key - 幂等键
   * @param {Object} context.transaction - 数据库事务（可选）
   * @returns {Promise<Object>} 抽奖结果
   */
  async execute(context) {
    const { user_id, campaign_id } = context
    const start_time = Date.now()

    this._log('info', '开始抽奖编排', { user_id, campaign_id })

    try {
      // 1. 选择管线
      const selection = await this.selectPipeline(context)

      this._log('info', '管线选择完成', {
        user_id,
        campaign_id,
        pipeline_type: selection.pipeline_type,
        reason: selection.reason
      })

      // 2. 获取管线实例
      const pipelines = this._getPipelines()
      const pipeline = pipelines[selection.pipeline_type]

      if (!pipeline) {
        throw new Error(`未知的管线类型: ${selection.pipeline_type}`)
      }

      // 3. 准备管线上下文
      const pipeline_context = {
        ...context,
        pipeline_type: selection.pipeline_type,
        selection_reason: selection.reason,
        preset: selection.preset || null,
        override: selection.override || null
      }

      // 4. 执行管线
      const result = await pipeline.run(pipeline_context)

      // 5. 记录执行结果
      const duration = Date.now() - start_time

      this._log('info', '抽奖编排完成', {
        user_id,
        campaign_id,
        pipeline_type: selection.pipeline_type,
        success: result.success,
        duration_ms: duration
      })

      return {
        ...result,
        pipeline_type: selection.pipeline_type,
        selection_reason: selection.reason,
        orchestrator_duration_ms: duration
      }
    } catch (error) {
      const duration = Date.now() - start_time

      this._log('error', '抽奖编排失败', {
        user_id,
        campaign_id,
        error: error.message,
        duration_ms: duration
      })

      throw error
    }
  }

  /**
   * 选择管线
   *
   * 优先级顺序（已拍板 2026-01-18）：
   * 1. 预设（Preset）- 最高优先级
   * 2. 管理干预（Override）- 次高优先级
   * 3. 正常抽奖（Normal）- 最低优先级
   *
   * @param {Object} context - 抽奖上下文
   * @returns {Promise<Object>} 管线选择结果
   */
  async selectPipeline(context) {
    const { user_id, campaign_id } = context

    // 优先级1：检查预设（最高优先级）
    if (this.options.enable_preset) {
      const preset = await this._checkPreset(user_id, campaign_id)
      if (preset) {
        return {
          pipeline_type: PIPELINE_TYPES.PRESET,
          preset,
          reason: 'preset_hit'
        }
      }
    }

    // 优先级2：检查管理干预
    if (this.options.enable_override) {
      const override = await this._checkOverride(user_id, campaign_id)
      if (override) {
        return {
          pipeline_type: PIPELINE_TYPES.OVERRIDE,
          override,
          reason: 'override_hit'
        }
      }
    }

    // 优先级3：默认走正常抽奖管线
    return {
      pipeline_type: PIPELINE_TYPES.NORMAL,
      reason: 'normal_draw'
    }
  }

  /**
   * 检查是否有待使用的预设
   *
   * @param {number} user_id - 用户ID
   * @param {number} campaign_id - 活动ID
   * @returns {Promise<Object|null>} 预设记录或null
   * @private
   */
  async _checkPreset(user_id, campaign_id) {
    try {
      const preset = await LotteryPreset.findOne({
        where: {
          user_id,
          campaign_id,
          status: 'pending',
          approval_status: 'approved'
        },
        order: [['queue_order', 'ASC']]
      })

      if (preset) {
        this._log('debug', '命中预设', {
          user_id,
          campaign_id,
          preset_id: preset.preset_id,
          prize_id: preset.prize_id
        })
      }

      return preset
    } catch (error) {
      this._log('warn', '检查预设失败', {
        user_id,
        campaign_id,
        error: error.message
      })
      return null
    }
  }

  /**
   * 检查是否有管理干预设置
   *
   * @param {number} user_id - 用户ID
   * @param {number} campaign_id - 活动ID
   * @returns {Promise<Object|null>} 干预设置或null
   * @private
   */
  async _checkOverride(user_id, campaign_id) {
    try {
      const override = await LotteryManagementSetting.findOne({
        where: {
          user_id,
          campaign_id,
          setting_type: ['force_win', 'force_lose'],
          status: 'active'
        }
      })

      if (override) {
        this._log('debug', '命中管理干预', {
          user_id,
          campaign_id,
          setting_type: override.setting_type,
          setting_id: override.setting_id
        })
      }

      return override
    } catch (error) {
      this._log('warn', '检查管理干预失败', {
        user_id,
        campaign_id,
        error: error.message
      })
      return null
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
      pipeline_types: Object.values(PIPELINE_TYPES),
      pipelines_loaded: this._pipelines !== null
    }
  }
}

// 导出管线类型常量
DrawOrchestrator.PIPELINE_TYPES = PIPELINE_TYPES

module.exports = DrawOrchestrator
