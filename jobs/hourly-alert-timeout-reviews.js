/**
 * 商家审核超时告警任务
 *
 * 职责：
 * - 每小时扫描超时的商家审核单
 * - 推进状态到 expired（但不自动解冻积分）
 * - 发送告警通知客服
 *
 * 拍板决策（商业模式核心）：
 * - 只要没审核通过就不可以增加到可用积分中
 * - 冻结会无限期存在，接受用户资产长期不可用
 * - 超时兜底：仅推进状态 + 告警，不自动解冻
 *
 * 执行策略：
 * - 定时执行：每小时整点
 * - 超时阈值：24小时（配置在审核单创建时的 expires_at）
 *
 * 创建时间：2025-12-29
 * 使用模型：Claude Opus 4.5
 */

'use strict'

const MerchantReviewService = require('../services/MerchantReviewService')
const logger = require('../utils/logger')

/**
 * 商家审核超时告警任务类
 *
 * @class HourlyAlertTimeoutReviews
 * @description 扫描超时审核单并告警（不解冻）
 */
class HourlyAlertTimeoutReviews {
  /**
   * 执行超时告警任务
   *
   * @returns {Promise<Object>} 执行报告
   * @returns {number} report.timeout_count - 超时审核单数量
   * @returns {Array<Object>} report.reviews - 超时审核单列表
   * @returns {string} report.action - 执行的动作：alert_only_no_unfreeze
   */
  static async execute() {
    const start_time = Date.now()
    logger.info('开始执行商家审核超时告警任务')

    try {
      // 调用 MerchantReviewService 处理超时审核单
      const result = await MerchantReviewService.alertTimeoutReviews()

      const duration_ms = Date.now() - start_time

      const report = {
        timestamp: new Date().toISOString(),
        duration_ms,
        ...result
      }

      if (result.timeout_count > 0) {
        logger.warn('商家审核超时告警任务完成（有超时审核单）', report)
      } else {
        logger.info('商家审核超时告警任务完成（无超时审核单）', report)
      }

      return report
    } catch (error) {
      logger.error('商家审核超时告警任务失败', { error: error.message })
      throw error
    }
  }
}

module.exports = HourlyAlertTimeoutReviews
