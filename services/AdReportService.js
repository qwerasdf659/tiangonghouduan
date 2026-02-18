/**
 * 广告报表服务层（AdReportService）
 *
 * 业务场景：
 * - 每日报表快照生成：凌晨4点聚合前一天的广告数据
 * - 多维度报表查询：按计划、广告位、全局维度统计
 * - 支持CTR、CVR等关键指标计算
 *
 * 服务对象：
 * - 定时任务：jobs/ad-cron-jobs.js（04:00执行）
 * - /api/v4/console/ad-reports（管理端 - 报表查询）
 *
 * 创建时间：2026-02-18
 */

const logger = require('../utils/logger').logger
const {
  AdReportDailySnapshot,
  AdImpressionLog,
  AdClickLog,
  AdAttributionLog,
  AdBillingRecord,
  AdCampaign
} = require('../models')
const { Op, literal } = require('sequelize')
const BeijingTimeHelper = require('../utils/timeHelper')

/**
 * 广告报表服务类
 */
class AdReportService {
  /**
   * 生成每日报表快照（定时任务）
   *
   * @param {Date|string} date - 日期（Date对象或YYYY-MM-DD字符串），默认昨天
   * @param {Object} options - 选项
   * @param {Object} options.transaction - 数据库事务
   * @returns {Promise<Object>} 生成结果统计
   */
  static async generateDailySnapshot(date = null, options = {}) {
    const startTime = Date.now()
    const { transaction } = options

    try {
      // 确定日期（默认昨天）
      let targetDate
      if (date) {
        targetDate = typeof date === 'string' ? new Date(date) : date
      } else {
        const yesterday = new Date()
        yesterday.setDate(yesterday.getDate() - 1)
        targetDate = yesterday
      }

      const dateStr = BeijingTimeHelper.formatDate(targetDate, 'YYYY-MM-DD')
      const dateStart = BeijingTimeHelper.startOfDay(targetDate)
      const dateEnd = BeijingTimeHelper.endOfDay(targetDate)

      logger.info('[AdReportService] 开始生成每日报表快照', { dateStr })

      // 1. 获取所有活跃的计划+广告位组合
      const activeCampaigns = await AdCampaign.findAll({
        where: {
          status: { [Op.in]: ['active', 'paused', 'completed'] },
          [Op.or]: [
            {
              start_date: { [Op.lte]: dateEnd },
              end_date: { [Op.gte]: dateStart }
            }
          ]
        },
        attributes: ['ad_campaign_id', 'ad_slot_id'],
        transaction
      })

      logger.info('[AdReportService] 找到活跃计划', {
        count: activeCampaigns.length
      })

      let successCount = 0
      let errorCount = 0

      // 2. 逐个计划+广告位组合生成快照
      for (const campaign of activeCampaigns) {
        try {
          await AdReportService._generateSnapshotForCampaignSlot(
            campaign.ad_campaign_id,
            campaign.ad_slot_id,
            dateStr,
            dateStart,
            dateEnd,
            { transaction }
          )
          successCount++
        } catch (error) {
          errorCount++
          logger.error('[AdReportService] 单个计划快照生成失败', {
            campaign_id: campaign.ad_campaign_id,
            slot_id: campaign.ad_slot_id,
            error: error.message
          })
        }
      }

      const duration = Date.now() - startTime
      logger.info('[AdReportService] 每日报表快照生成完成', {
        dateStr,
        totalCampaigns: activeCampaigns.length,
        successCount,
        errorCount,
        duration_ms: duration
      })

      return {
        success: true,
        dateStr,
        totalCampaigns: activeCampaigns.length,
        successCount,
        errorCount,
        duration_ms: duration
      }
    } catch (error) {
      logger.error('[AdReportService] 每日报表快照生成失败', {
        error: error.message,
        stack: error.stack
      })
      throw error
    }
  }

  /**
   * 为单个计划+广告位组合生成快照（内部方法）
   *
   * @param {number} campaignId - 广告计划ID
   * @param {number} slotId - 广告位ID
   * @param {string} dateStr - 日期字符串（YYYY-MM-DD）
   * @param {Date} dateStart - 日期开始时间
   * @param {Date} dateEnd - 日期结束时间
   * @param {Object} options - 选项
   * @param {Object} options.transaction - 数据库事务
   * @returns {Promise<void>} UPSERT 快照记录到 ad_report_daily_snapshots
   */
  static async _generateSnapshotForCampaignSlot(
    campaignId,
    slotId,
    dateStr,
    dateStart,
    dateEnd,
    options = {}
  ) {
    const { transaction } = options

    // 1. 统计曝光（总数和有效数）
    const impressionStats = await AdImpressionLog.findAll({
      where: {
        ad_campaign_id: campaignId,
        ad_slot_id: slotId,
        created_at: {
          [Op.gte]: dateStart,
          [Op.lte]: dateEnd
        }
      },
      attributes: [
        [literal('COUNT(*)'), 'total_impressions'],
        [literal('SUM(CASE WHEN is_valid = 1 THEN 1 ELSE 0 END)'), 'valid_impressions']
      ],
      raw: true,
      transaction
    })

    const totalImpressions = parseInt(impressionStats[0]?.total_impressions || 0)
    const validImpressions = parseInt(impressionStats[0]?.valid_impressions || 0)

    // 2. 统计点击（总数和有效数）
    const clickStats = await AdClickLog.findAll({
      where: {
        ad_campaign_id: campaignId,
        ad_slot_id: slotId,
        created_at: {
          [Op.gte]: dateStart,
          [Op.lte]: dateEnd
        }
      },
      attributes: [
        [literal('COUNT(*)'), 'total_clicks'],
        [literal('SUM(CASE WHEN is_valid = 1 THEN 1 ELSE 0 END)'), 'valid_clicks']
      ],
      raw: true,
      transaction
    })

    const totalClicks = parseInt(clickStats[0]?.total_clicks || 0)
    const validClicks = parseInt(clickStats[0]?.valid_clicks || 0)

    // 3. 统计转化
    const conversions = await AdAttributionLog.count({
      where: {
        ad_campaign_id: campaignId,
        conversion_at: {
          [Op.gte]: dateStart,
          [Op.lte]: dateEnd
        }
      },
      transaction
    })

    // 4. 统计消耗（钻石）
    const spendStats = await AdBillingRecord.findAll({
      where: {
        ad_campaign_id: campaignId,
        billing_at: {
          [Op.gte]: dateStart,
          [Op.lte]: dateEnd
        }
      },
      attributes: [[literal('SUM(amount_diamond)'), 'total_spend_diamond']],
      raw: true,
      transaction
    })

    const totalSpendDiamond = parseInt(spendStats[0]?.total_spend_diamond || 0)

    // 5. 计算指标
    const ctr = validImpressions > 0 ? validClicks / validImpressions : 0
    const cvr = validClicks > 0 ? conversions / validClicks : 0

    // 6. UPSERT快照
    await AdReportDailySnapshot.upsert(
      {
        snapshot_date: dateStr,
        ad_campaign_id: campaignId,
        ad_slot_id: slotId,
        impressions_total: totalImpressions,
        impressions_valid: validImpressions,
        clicks_total: totalClicks,
        clicks_valid: validClicks,
        conversions,
        spend_diamond: totalSpendDiamond,
        ctr: parseFloat(ctr.toFixed(4)),
        cvr: parseFloat(cvr.toFixed(4)),
        generated_at: BeijingTimeHelper.createDatabaseTime()
      },
      {
        fields: [
          'impressions_total',
          'impressions_valid',
          'clicks_total',
          'clicks_valid',
          'conversions',
          'spend_diamond',
          'ctr',
          'cvr',
          'generated_at'
        ],
        transaction
      }
    )
  }

  /**
   * 获取计划报表数据
   *
   * @param {number} campaignId - 广告计划ID
   * @param {Date|string} startDate - 开始日期
   * @param {Date|string} endDate - 结束日期
   * @param {Object} options - 选项
   * @param {Object} options.transaction - 数据库事务
   * @returns {Promise<Object>} 报表数据
   */
  static async getCampaignReport(campaignId, startDate, endDate, options = {}) {
    const { transaction } = options

    try {
      const start = typeof startDate === 'string' ? new Date(startDate) : startDate
      const end = typeof endDate === 'string' ? new Date(endDate) : endDate

      const snapshots = await AdReportDailySnapshot.findAll({
        where: {
          ad_campaign_id: campaignId,
          snapshot_date: {
            [Op.gte]: BeijingTimeHelper.formatDate(start, 'YYYY-MM-DD'),
            [Op.lte]: BeijingTimeHelper.formatDate(end, 'YYYY-MM-DD')
          }
        },
        order: [['snapshot_date', 'ASC']],
        transaction
      })

      // 计算总计
      const totals = snapshots.reduce(
        (acc, s) => {
          acc.total_impressions += s.total_impressions
          acc.valid_impressions += s.valid_impressions
          acc.total_clicks += s.total_clicks
          acc.valid_clicks += s.valid_clicks
          acc.conversions += s.conversions
          acc.total_spend_diamond += s.total_spend_diamond
          return acc
        },
        {
          total_impressions: 0,
          valid_impressions: 0,
          total_clicks: 0,
          valid_clicks: 0,
          conversions: 0,
          total_spend_diamond: 0
        }
      )

      totals.ctr = totals.valid_impressions > 0 ? totals.valid_clicks / totals.valid_impressions : 0
      totals.cvr = totals.valid_clicks > 0 ? totals.conversions / totals.valid_clicks : 0

      return {
        campaign_id: campaignId,
        start_date: BeijingTimeHelper.formatDate(start, 'YYYY-MM-DD'),
        end_date: BeijingTimeHelper.formatDate(end, 'YYYY-MM-DD'),
        daily_data: snapshots.map(s => s.toJSON()),
        totals
      }
    } catch (error) {
      logger.error('[AdReportService] 获取计划报表失败', {
        campaignId,
        error: error.message,
        stack: error.stack
      })
      throw error
    }
  }

  /**
   * 获取广告位报表数据
   *
   * @param {number} slotId - 广告位ID
   * @param {Date|string} startDate - 开始日期
   * @param {Date|string} endDate - 结束日期
   * @param {Object} options - 选项
   * @param {Object} options.transaction - 数据库事务
   * @returns {Promise<Object>} 报表数据
   */
  static async getSlotReport(slotId, startDate, endDate, options = {}) {
    const { transaction } = options

    try {
      const start = typeof startDate === 'string' ? new Date(startDate) : startDate
      const end = typeof endDate === 'string' ? new Date(endDate) : endDate

      const snapshots = await AdReportDailySnapshot.findAll({
        where: {
          ad_slot_id: slotId,
          snapshot_date: {
            [Op.gte]: BeijingTimeHelper.formatDate(start, 'YYYY-MM-DD'),
            [Op.lte]: BeijingTimeHelper.formatDate(end, 'YYYY-MM-DD')
          }
        },
        order: [['snapshot_date', 'ASC']],
        transaction
      })

      // 计算总计
      const totals = snapshots.reduce(
        (acc, s) => {
          acc.total_impressions += s.impressions_total
          acc.valid_impressions += s.impressions_valid
          acc.total_clicks += s.clicks_total
          acc.valid_clicks += s.clicks_valid
          acc.conversions += s.conversions
          acc.total_spend_diamond += s.spend_diamond
          return acc
        },
        {
          total_impressions: 0,
          valid_impressions: 0,
          total_clicks: 0,
          valid_clicks: 0,
          conversions: 0,
          total_spend_diamond: 0
        }
      )

      totals.ctr = totals.valid_impressions > 0 ? totals.valid_clicks / totals.valid_impressions : 0
      totals.cvr = totals.valid_clicks > 0 ? totals.conversions / totals.valid_clicks : 0

      return {
        slot_id: slotId,
        start_date: BeijingTimeHelper.formatDate(start, 'YYYY-MM-DD'),
        end_date: BeijingTimeHelper.formatDate(end, 'YYYY-MM-DD'),
        daily_data: snapshots.map(s => s.toJSON()),
        totals
      }
    } catch (error) {
      logger.error('[AdReportService] 获取广告位报表失败', {
        slotId,
        error: error.message,
        stack: error.stack
      })
      throw error
    }
  }

  /**
   * 获取全局仪表板概览
   *
   * @param {Date|string} startDate - 开始日期
   * @param {Date|string} endDate - 结束日期
   * @param {Object} options - 选项
   * @param {Object} options.transaction - 数据库事务
   * @returns {Promise<Object>} 仪表板数据
   */
  static async getDashboardOverview(startDate, endDate, options = {}) {
    const { transaction } = options

    try {
      const start = typeof startDate === 'string' ? new Date(startDate) : startDate
      const end = typeof endDate === 'string' ? new Date(endDate) : endDate

      // 总计划数
      const totalCampaigns = await AdCampaign.count({
        where: {
          status: { [Op.in]: ['active', 'paused'] }
        },
        transaction
      })

      // 聚合所有快照数据
      const snapshotStats = await AdReportDailySnapshot.findAll({
        where: {
          snapshot_date: {
            [Op.gte]: BeijingTimeHelper.formatDate(start, 'YYYY-MM-DD'),
            [Op.lte]: BeijingTimeHelper.formatDate(end, 'YYYY-MM-DD')
          }
        },
        attributes: [
          [literal('SUM(impressions_valid)'), 'total_impressions'],
          [literal('SUM(clicks_valid)'), 'total_clicks'],
          [literal('SUM(conversions)'), 'total_conversions'],
          [literal('SUM(spend_diamond)'), 'total_spend_diamond']
        ],
        raw: true,
        transaction
      })

      const totalImpressions = parseInt(snapshotStats[0]?.total_impressions || 0)
      const totalClicks = parseInt(snapshotStats[0]?.total_clicks || 0)
      const totalConversions = parseInt(snapshotStats[0]?.total_conversions || 0)
      const totalSpendDiamond = parseInt(snapshotStats[0]?.total_spend_diamond || 0)

      const ctr = totalImpressions > 0 ? totalClicks / totalImpressions : 0
      const cvr = totalClicks > 0 ? totalConversions / totalClicks : 0

      return {
        total_campaigns: totalCampaigns,
        total_impressions: totalImpressions,
        total_clicks: totalClicks,
        total_conversions: totalConversions,
        total_spend_diamond: totalSpendDiamond,
        ctr: parseFloat(ctr.toFixed(4)),
        cvr: parseFloat(cvr.toFixed(4))
      }
    } catch (error) {
      logger.error('[AdReportService] 获取仪表板概览失败', {
        error: error.message,
        stack: error.stack
      })
      throw error
    }
  }
}

module.exports = AdReportService
