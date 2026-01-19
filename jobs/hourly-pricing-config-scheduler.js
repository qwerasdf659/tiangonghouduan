'use strict'

/**
 * 定价配置定时生效任务
 *
 * @module jobs/hourly-pricing-config-scheduler
 * @version 1.0.0
 * @date 2026-01-19
 *
 * 业务场景：
 * - 每小时检查是否有 scheduled 状态的定价配置到达生效时间
 * - 自动激活到期的定时配置
 * - 支持活动级定价配置的定时生效功能
 *
 * 执行频率：每小时第 10 分钟执行（避开整点流量高峰）
 *
 * 设计原则：
 * - 幂等性：多次执行结果一致
 * - 容错性：单个配置失败不影响其他配置处理
 * - 可追溯：完整的日志记录
 *
 * 依赖服务：
 * - LotteryCampaignPricingConfigService.processScheduledActivations()
 */

const logger = require('../utils/logger').logger
const LotteryCampaignPricingConfigService = require('../services/LotteryCampaignPricingConfigService')
const BeijingTimeHelper = require('../utils/timeHelper')

/**
 * 定价配置定时生效任务类
 *
 * @class HourlyPricingConfigScheduler
 */
class HourlyPricingConfigScheduler {
  /**
   * 任务名称（用于日志和监控）
   * @type {string}
   */
  static JOB_NAME = 'hourly-pricing-config-scheduler'

  /**
   * 执行定时任务
   *
   * @description 检查并激活到期的 scheduled 定价配置
   * @returns {Promise<Object>} 执行结果
   */
  static async execute() {
    const start_time = Date.now()
    const job_id = `${this.JOB_NAME}_${BeijingTimeHelper.formatBeijingDateTime(new Date()).replace(/[:\s]/g, '-')}`

    logger.info(`[${this.JOB_NAME}] 开始执行定价配置定时生效任务`, {
      job_id,
      start_time: BeijingTimeHelper.formatBeijingDateTime(new Date())
    })

    try {
      // 调用 Service 处理定时生效配置
      const result = await LotteryCampaignPricingConfigService.processScheduledActivations()

      const duration_ms = Date.now() - start_time

      logger.info(`[${this.JOB_NAME}] 定时生效任务执行完成`, {
        job_id,
        duration_ms,
        processed: result.processed,
        activated: result.activated,
        failed: result.failed,
        skipped: result.skipped
      })

      return {
        success: true,
        job_id,
        duration_ms,
        ...result
      }
    } catch (error) {
      const duration_ms = Date.now() - start_time

      logger.error(`[${this.JOB_NAME}] 定时生效任务执行失败`, {
        job_id,
        duration_ms,
        error: error.message,
        stack: error.stack
      })

      return {
        success: false,
        job_id,
        duration_ms,
        error: error.message
      }
    }
  }

  /**
   * 手动触发任务（用于管理员手动执行）
   *
   * @description 提供给管理 API 或 CLI 手动触发任务
   * @returns {Promise<Object>} 执行结果
   */
  static async manualTrigger() {
    logger.info(`[${this.JOB_NAME}] 管理员手动触发定时生效任务`)
    return await this.execute()
  }
}

module.exports = HourlyPricingConfigScheduler
