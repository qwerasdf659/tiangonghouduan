/**
 * 广告曝光日志服务层（AdImpressionLogService）
 *
 * 业务场景：
 * - 记录广告的每次曝光事件（经反作弊校验后的有效/无效曝光）
 * - 为报表聚合（AdReportService）和归因追踪（AdAttributionService）提供数据源
 *
 * 服务对象：
 * - /api/v4/system/ad-events/impression（小程序端 - 曝光事件上报）
 *
 * 创建时间：2026-02-18
 * @see docs/广告系统升级方案.md Phase 5
 */

const logger = require('../utils/logger').logger
const { AdImpressionLog } = require('../models')
const BeijingTimeHelper = require('../utils/timeHelper')

/**
 * 广告曝光日志服务类
 *
 * @class AdImpressionLogService
 * @description 记录广告曝光事件，为计费和报表提供数据基础
 */
class AdImpressionLogService {
  /**
   * 创建广告曝光日志
   *
   * @param {Object} data - 曝光事件数据
   * @param {number} data.ad_campaign_id - 广告计划ID
   * @param {number} data.user_id - 观看用户ID
   * @param {number} data.ad_slot_id - 广告位ID
   * @param {boolean} [data.is_valid=true] - 是否有效（反作弊判定结果）
   * @param {string|null} [data.invalid_reason=null] - 无效原因
   * @param {Object} [options={}] - 选项
   * @param {Object} [options.transaction] - 数据库事务
   * @returns {Promise<Object>} 创建的曝光日志记录
   */
  static async createLog(data, options = {}) {
    const { ad_campaign_id, user_id, ad_slot_id, is_valid = true, invalid_reason = null } = data
    const { transaction } = options

    try {
      const log = await AdImpressionLog.create(
        {
          ad_campaign_id: parseInt(ad_campaign_id),
          user_id: parseInt(user_id),
          ad_slot_id: parseInt(ad_slot_id),
          is_valid: is_valid ? 1 : 0,
          invalid_reason,
          created_at: BeijingTimeHelper.createBeijingTime()
        },
        { transaction }
      )

      logger.info('创建广告曝光日志成功', {
        ad_impression_log_id: log.ad_impression_log_id,
        ad_campaign_id,
        user_id,
        is_valid
      })

      return log
    } catch (error) {
      logger.error('创建广告曝光日志失败', {
        ad_campaign_id,
        user_id,
        ad_slot_id,
        error: error.message
      })
      throw error
    }
  }
}

module.exports = AdImpressionLogService
