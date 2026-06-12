/**
 * V4.7.0 管理后台抽奖查询服务（QueryService）
 *
 * 业务场景：管理员查询活动策略配置与抽奖流水
 *
 * 核心功能：
 * 1. getStrategyConfig - 获取活动的策略配置（按 config_group 分组）
 * 2. getDrawRecordsList - 分页查询抽奖流水（lottery_draws）
 *
 * 拆分日期：2026-01-31
 * 原文件：services/AdminLotteryService.js (1781行)
 *
 * 2026-06-04 合规改造：per-user 暗箱干预（lottery_management_settings）整体下线，
 * getInterventionList / getInterventionById 已随机制移除。
 */

const models = require('../../../models')
const _logger = require('../../../utils/logger').logger
const { Op } = require('sequelize')

/**
 * 管理后台抽奖查询服务类
 *
 * @class AdminLotteryQueryService
 */
class AdminLotteryQueryService {
  /**
   * 获取某活动的全部策略配置（按 config_group 分组）
   *
   * @description 用于9策略活动级开关管理页面
   * @param {number} lottery_campaign_id - 活动ID
   * @returns {Promise<Object>} 按 config_group 分组的策略配置
   * @throws {Error} 活动ID无效
   */
  static async getStrategyConfig(lottery_campaign_id) {
    if (!lottery_campaign_id || isNaN(parseInt(lottery_campaign_id))) {
      const error = new Error('无效的活动ID')
      error.code = 'INVALID_CAMPAIGN_ID'
      error.statusCode = 400
      throw error
    }

    const { LotteryStrategyConfig } = models
    const config = await LotteryStrategyConfig.getAllConfig(parseInt(lottery_campaign_id))

    return {
      lottery_campaign_id: parseInt(lottery_campaign_id),
      config
    }
  }

  /**
   * 管理后台：分页查询抽奖流水（lottery_draws）
   *
   * @description
   * 供运营后台「抽奖记录」列表使用，字段与 lottery_draws 表及关联活动/奖品对齐，
   * 包含面向用户的 order_no（LT）与内部 lottery_draw_id。
   *
   * @param {Object} query - 查询参数对象
   * @param {number} [query.page=1] - 页码（从 1 开始）
   * @param {number} [query.page_size=20] - 每页条数
   * @param {number} [query.user_id] - 按用户 ID 筛选
   * @param {number} [query.lottery_campaign_id] - 按活动 ID 筛选
   * @param {string} [query.keyword] - 模糊匹配 lottery_draw_id / order_no
   * @returns {Promise<{ draws: Object[], pagination: Object }>} 抽奖流水分页结果
   */
  static async getDrawRecordsList(query = {}) {
    const {
      page = 1,
      page_size = 20,
      user_id: filterUserId,
      lottery_campaign_id: filterCampaignId,
      keyword
    } = query

    const pageNum = Math.max(1, parseInt(page, 10) || 1)
    const pageSizeNum = Math.min(100, Math.max(1, parseInt(page_size, 10) || 20))
    const offset = (pageNum - 1) * pageSizeNum

    const where = {}
    if (filterUserId) {
      where.user_id = parseInt(filterUserId, 10)
    }
    if (filterCampaignId) {
      where.lottery_campaign_id = parseInt(filterCampaignId, 10)
    }
    if (keyword && String(keyword).trim()) {
      const k = String(keyword).trim()
      where[Op.or] = [
        { lottery_draw_id: { [Op.like]: `%${k}%` } },
        { order_no: { [Op.like]: `%${k}%` } }
      ]
    }

    const { count, rows } = await models.LotteryDraw.findAndCountAll({
      where,
      include: [
        {
          model: models.LotteryCampaign,
          as: 'campaign',
          attributes: ['lottery_campaign_id', 'campaign_name'],
          required: false
        },
        {
          model: models.LotteryCampaignPrize,
          as: 'campaignPrize',
          attributes: ['lottery_campaign_prize_id'],
          required: false,
          include: [{
            model: models.PrizeDefinition,
            as: 'prizeDefinition',
            attributes: ['display_name'],
            required: false
          }]
        }
      ],
      order: [['created_at', 'DESC']],
      limit: pageSizeNum,
      offset
    })

    const draws = rows.map(row => {
      const j = row.toJSON()
      const prizeName = j.campaignPrize?.prizeDefinition?.display_name || j.prize_name || '未中奖'
      return {
        /** 与历史前端列名 draw_id 对齐，值同 lottery_draw_id */
        draw_id: j.lottery_draw_id,
        lottery_draw_id: j.lottery_draw_id,
        order_no: j.order_no || null,
        user_id: j.user_id,
        campaign_name: j.campaign?.campaign_name || '—',
        prize_name: prizeName,
        result: j.result,
        cost_amount: j.cost_points != null ? Number(j.cost_points) : null,
        /** V4：用 reward_tier 表达结果；fallback 视为兜底档 */
        is_winner: j.reward_tier !== 'fallback',
        reward_tier: j.reward_tier,
        created_at: j.created_at
      }
    })

    return {
      draws,
      pagination: {
        total: count,
        page: pageNum,
        page_size: pageSizeNum,
        total_pages: Math.ceil(count / pageSizeNum) || 1
      }
    }
  }
}

module.exports = AdminLotteryQueryService
