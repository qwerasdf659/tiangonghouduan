/**
 * 广告归因追踪服务层（AdAttributionService）
 *
 * 业务场景：
 * - 追踪广告点击后的转化行为（抽奖、兑换、市场购买等）
 * - 24小时归因窗口：点击后24小时内的转化行为归因到该点击
 * - 支持多种转化类型：lottery_draw, exchange, market_buy, page_view
 *
 * 服务对象：
 * - 业务钩子：LotteryDrawService, ExchangeService, MarketService（转化时调用）
 *
 * 创建时间：2026-02-18
 */

const logger = require('../utils/logger').logger
const { AdAttributionLog, AdClickLog } = require('../models')
const { Op } = require('sequelize')
const { sequelize } = require('../models')
const BeijingTimeHelper = require('../utils/timeHelper')

/**
 * 归因窗口时长（小时）
 */
const ATTRIBUTION_WINDOW_HOURS = 24

/**
 * 广告归因追踪服务类
 */
class AdAttributionService {
  /**
   * 检查转化归因
   *
   * @param {number} userId - 用户ID
   * @param {string} conversionType - 转化类型（lottery_draw / exchange / market_buy / page_view）
   * @param {string} entityId - 转化实体ID（如：lottery_draw_id, exchange_record_id）
   * @param {Object} options - 选项
   * @param {Object} options.transaction - 数据库事务
   * @returns {Promise<Object>} { attributed, ad_campaign_id, click_log_id } 或 { attributed: false }
   */
  static async checkConversion(userId, conversionType, entityId, options = {}) {
    const { transaction } = options

    try {
      // 1. 查找24小时内的有效广告点击
      const windowStart = new Date(Date.now() - ATTRIBUTION_WINDOW_HOURS * 60 * 60 * 1000)
      const recentClicks = await AdClickLog.findAll({
        where: {
          user_id: userId,
          is_valid: true,
          created_at: { [Op.gte]: windowStart }
        },
        order: [['created_at', 'DESC']], // 最近的点击优先
        limit: 1, // 只取最近一次点击
        transaction
      })

      if (recentClicks.length === 0) {
        return { attributed: false }
      }

      const clickLog = recentClicks[0]

      // 2. 检查是否已存在归因记录（避免重复归因）
      const existingAttribution = await AdAttributionLog.findOne({
        where: {
          ad_click_log_id: clickLog.ad_click_log_id,
          conversion_type: conversionType,
          conversion_entity_id: entityId
        },
        transaction
      })

      if (existingAttribution) {
        logger.debug('[AdAttributionService] 转化已归因', {
          userId,
          conversionType,
          entityId,
          clickLogId: clickLog.ad_click_log_id
        })
        return {
          attributed: true,
          ad_campaign_id: clickLog.ad_campaign_id,
          click_log_id: clickLog.ad_click_log_id
        }
      }

      // 3. 创建归因记录
      await AdAttributionLog.create(
        {
          ad_click_log_id: clickLog.ad_click_log_id,
          ad_campaign_id: clickLog.ad_campaign_id,
          user_id: userId,
          conversion_type: conversionType,
          conversion_entity_id: entityId,
          conversion_at: BeijingTimeHelper.createDatabaseTime()
        },
        { transaction }
      )

      logger.info('[AdAttributionService] 转化归因成功', {
        userId,
        conversionType,
        entityId,
        ad_campaign_id: clickLog.ad_campaign_id,
        click_log_id: clickLog.ad_click_log_id
      })

      return {
        attributed: true,
        ad_campaign_id: clickLog.ad_campaign_id,
        click_log_id: clickLog.ad_click_log_id
      }
    } catch (error) {
      logger.error('[AdAttributionService] 转化归因检查失败', {
        userId,
        conversionType,
        entityId,
        error: error.message,
        stack: error.stack
      })
      // 错误时返回未归因，避免影响业务流程
      return { attributed: false }
    }
  }

  /**
   * 获取归因统计
   *
   * @param {number} campaignId - 广告计划ID
   * @param {Object} options - 选项
   * @param {Object} options.transaction - 数据库事务
   * @returns {Promise<Object>} 归因统计数据
   */
  static async getAttributionStats(campaignId, options = {}) {
    const { transaction } = options

    try {
      // 总转化数
      const totalConversions = await AdAttributionLog.count({
        where: { ad_campaign_id: campaignId },
        transaction
      })

      // 按转化类型分组统计
      const conversionsByType = await AdAttributionLog.findAll({
        where: { ad_campaign_id: campaignId },
        attributes: [
          'conversion_type',
          [sequelize.fn('COUNT', sequelize.col('ad_attribution_log_id')), 'count']
        ],
        group: ['conversion_type'],
        raw: true,
        transaction
      })

      const typeBreakdown = {}
      conversionsByType.forEach(item => {
        typeBreakdown[item.conversion_type] = parseInt(item.count)
      })

      return {
        total_conversions: totalConversions,
        by_type: typeBreakdown
      }
    } catch (error) {
      logger.error('[AdAttributionService] 获取归因统计失败', {
        campaignId,
        error: error.message,
        stack: error.stack
      })
      throw error
    }
  }
}

module.exports = AdAttributionService
