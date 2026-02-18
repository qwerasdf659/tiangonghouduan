/**
 * 广告点击日志服务层（AdClickLogService）
 *
 * 业务场景：
 * - 记录用户点击广告的事件（经反作弊校验后）
 * - 为归因追踪（AdAttributionService）提供点击→转化关联的数据源
 *
 * 服务对象：
 * - /api/v4/system/ad-events/click（小程序端 - 点击事件上报）
 *
 * 创建时间：2026-02-18
 * @see docs/广告系统升级方案.md Phase 5
 */

const logger = require('../utils/logger').logger
const { AdClickLog } = require('../models')
const BeijingTimeHelper = require('../utils/timeHelper')

/**
 * 广告点击日志服务类
 *
 * @class AdClickLogService
 * @description 记录广告点击事件，为归因追踪和报表提供数据基础
 */
class AdClickLogService {
  /**
   * 创建广告点击日志
   *
   * @param {Object} data - 点击事件数据
   * @param {number} data.ad_campaign_id - 广告计划ID
   * @param {number} data.user_id - 点击用户ID
   * @param {number} data.ad_slot_id - 广告位ID
   * @param {string|null} [data.click_target=null] - 跳转目标URL
   * @param {boolean} [data.is_valid=true] - 是否有效（反作弊判定结果）
   * @param {string|null} [data.invalid_reason=null] - 无效原因
   * @param {Object} [options={}] - 选项
   * @param {Object} [options.transaction] - 数据库事务
   * @returns {Promise<Object>} 创建的点击日志记录
   */
  static async createLog(data, options = {}) {
    const {
      ad_campaign_id,
      user_id,
      ad_slot_id,
      click_target = null,
      is_valid = true,
      invalid_reason = null
    } = data
    const { transaction } = options

    try {
      const log = await AdClickLog.create(
        {
          ad_campaign_id: parseInt(ad_campaign_id),
          user_id: parseInt(user_id),
          ad_slot_id: parseInt(ad_slot_id),
          click_target,
          is_valid: is_valid ? 1 : 0,
          invalid_reason,
          created_at: BeijingTimeHelper.createBeijingTime()
        },
        { transaction }
      )

      logger.info('创建广告点击日志成功', {
        ad_click_log_id: log.ad_click_log_id,
        ad_campaign_id,
        user_id,
        is_valid
      })

      return log
    } catch (error) {
      logger.error('创建广告点击日志失败', {
        ad_campaign_id,
        user_id,
        ad_slot_id,
        error: error.message
      })
      throw error
    }
  }
}

module.exports = AdClickLogService
