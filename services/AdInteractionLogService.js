/**
 * 内容交互日志服务层（AdInteractionLogService）
 *
 * 业务场景：
 * - 统一记录弹窗/轮播/公告的展示、点击、关闭、滑动等交互事件
 * - 替代原 PopupShowLogService 和 CarouselShowLogService
 * - 提供按计划、用户、类型维度的统计查询
 *
 * 服务对象：
 * - /api/v4/system/ad-events/interaction-log（小程序端 - 统一交互日志上报）
 * - /api/v4/console/ad-campaigns（管理端 - 展示统计查询）
 *
 * @see docs/内容投放系统-重复功能合并方案.md 第十七节 17.3
 */

const logger = require('../utils/logger').logger
const { AdInteractionLog, AdCampaign } = require('../models')

/**
 * 内容交互日志服务类
 */
class AdInteractionLogService {
  /**
   * 创建交互日志
   *
   * @param {Object} data - 日志数据
   * @param {number} data.ad_campaign_id - 广告计划ID
   * @param {number} data.user_id - 用户ID
   * @param {number} [data.ad_slot_id] - 广告位ID
   * @param {string} data.interaction_type - 交互类型（impression/click/close/swipe）
   * @param {Object} [data.extra_data] - 扩展数据JSON
   * @param {Object} options - 操作选项
   * @param {Object} options.transaction - 数据库事务
   * @returns {Promise<Object>} 创建的日志记录
   */
  static async createLog(data, options = {}) {
    try {
      const campaign = await AdCampaign.findByPk(data.ad_campaign_id, {
        attributes: ['ad_campaign_id', 'ad_slot_id'],
        transaction: options.transaction
      })

      if (!campaign) {
        throw new Error('广告计划不存在: ' + data.ad_campaign_id)
      }

      const log = await AdInteractionLog.create(
        {
          ad_campaign_id: data.ad_campaign_id,
          user_id: data.user_id,
          ad_slot_id: data.ad_slot_id || campaign.ad_slot_id,
          interaction_type: data.interaction_type,
          extra_data: data.extra_data || null
        },
        { transaction: options.transaction }
      )

      logger.info('创建交互日志成功', {
        log_id: log.ad_interaction_log_id,
        campaign_id: data.ad_campaign_id,
        user_id: data.user_id,
        type: data.interaction_type
      })

      return log
    } catch (error) {
      logger.error('创建交互日志失败', { error: error.message, data })
      throw error
    }
  }

  /**
   * 获取指定计划的展示统计
   *
   * @param {number} campaignId - 广告计划ID
   * @param {Object} options - 查询选项
   * @param {string} [options.start_date] - 开始日期
   * @param {string} [options.end_date] - 结束日期
   * @returns {Promise<Object>} 统计数据
   */
  static async getShowStats(campaignId, options = {}) {
    try {
      const { Op } = require('sequelize')
      const where = { ad_campaign_id: campaignId }

      if (options.start_date || options.end_date) {
        where.created_at = {}
        if (options.start_date) {
          where.created_at[Op.gte] = new Date(options.start_date)
        }
        if (options.end_date) {
          where.created_at[Op.lte] = new Date(options.end_date + ' 23:59:59')
        }
      }

      const typeCounts = await AdInteractionLog.findAll({
        attributes: [
          'interaction_type',
          [
            AdInteractionLog.sequelize.fn(
              'COUNT',
              AdInteractionLog.sequelize.col('ad_interaction_log_id')
            ),
            'count'
          ]
        ],
        where,
        group: ['interaction_type'],
        raw: true
      })

      const stats = { impression: 0, click: 0, close: 0, swipe: 0 }
      typeCounts.forEach(row => {
        stats[row.interaction_type] = parseInt(row.count) || 0
      })

      return {
        ad_campaign_id: campaignId,
        ...stats,
        total: Object.values(stats).reduce((sum, v) => sum + v, 0)
      }
    } catch (error) {
      logger.error('获取展示统计失败', { campaignId, error: error.message })
      throw error
    }
  }
}

module.exports = AdInteractionLogService
