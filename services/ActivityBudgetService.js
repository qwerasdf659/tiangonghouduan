const logger = require('../utils/logger').logger

/**
 * 活动预算管理服务（ActivityBudgetService）
 *
 * @description 从 ActivityService 拆分，负责活动预算相关的查询和管理
 *
 * 核心功能：
 * 1. 批量获取活动预算状态 - getBatchBudgetStatus()
 * 2. 获取单个活动预算配置 - getCampaignBudgetConfig()
 * 3. 获取活动奖品配置 - getPrizeConfig()
 * 4. 获取预算消耗统计 - getBudgetConsumptionStats()
 * 5. 调整活动预算 - adjustCampaignBudget()
 */

const models = require('../models')
const { AssetCode } = require('../constants/AssetCode')
const { Op } = require('sequelize')

/**
 * 活动预算管理服务
 *
 * @description 负责活动预算相关的查询和管理，包括批量预算状态、预算配置、奖品配置、消耗统计和预算调整
 */
class ActivityBudgetService {
  /**
   * 批量获取活动预算状态
   *
   * @param {Object} options - 查询选项
   * @returns {Object} 包含预算状态列表、总数和汇总信息的结果
   */
  static async getBatchBudgetStatus(options = {}) {
    const { lottery_campaign_ids = [], status = '', page_size, limit = 50 } = options
    const raw = page_size !== undefined ? page_size : limit
    const maxLimit = Math.min(parseInt(raw) || 50, 100)

    let whereCondition = {}
    if (lottery_campaign_ids.length > 0) {
      whereCondition = { lottery_campaign_id: { [Op.in]: lottery_campaign_ids } }
    } else if (
      status &&
      ['active', 'draft', 'completed', 'paused', 'ended', 'cancelled'].includes(status)
    ) {
      whereCondition = { status }
    }

    const campaigns = await models.LotteryCampaign.findAll({
      where: whereCondition,
      attributes: [
        'lottery_campaign_id',
        'campaign_name',
        'campaign_code',
        'budget_mode',
        'pool_budget_total',
        'pool_budget_remaining',
        'allowed_campaign_ids',
        'status'
      ],
      limit: maxLimit,
      order: [['lottery_campaign_id', 'ASC']]
    })

    if (campaigns.length === 0) {
      return {
        campaigns: [],
        grouped: {
          user: { campaigns: [], summary: {} },
          pool: { campaigns: [], summary: {} },
          none: { campaigns: [], summary: {} }
        },
        total_count: 0,
        summary: {}
      }
    }

    const campaignIdList = campaigns.map(c => c.lottery_campaign_id)
    const budgetStats = await models.LotteryDraw.findAll({
      where: {
        lottery_campaign_id: { [Op.in]: campaignIdList },
        prize_value_points: { [Op.gt]: 0 }
      },
      attributes: [
        'lottery_campaign_id',
        [models.sequelize.fn('COUNT', models.sequelize.col('lottery_draw_id')), 'draw_count'],
        [models.sequelize.fn('SUM', models.sequelize.col('prize_value_points')), 'total_consumed']
      ],
      group: ['lottery_campaign_id'],
      raw: true
    })

    const statsMap = {}
    budgetStats.forEach(stat => {
      statsMap[stat.lottery_campaign_id] = {
        winning_draws: parseInt(stat.draw_count) || 0,
        total_consumed: parseInt(stat.total_consumed) || 0
      }
    })

    const userModeCampaigns = campaigns.filter(c => c.budget_mode === 'user')
    const userBudgetTotals = await this._getUserBudgetPointsSummary(userModeCampaigns)

    const grouped = { user: [], pool: [], pool_quota: [], none: [] }

    const allResults = campaigns.map(campaign => {
      const stats = statsMap[campaign.lottery_campaign_id] || {
        winning_draws: 0,
        total_consumed: 0
      }
      const budgetMode = campaign.budget_mode || 'none'

      const baseResult = {
        lottery_campaign_id: campaign.lottery_campaign_id,
        campaign_name: campaign.campaign_name,
        campaign_code: campaign.campaign_code,
        budget_mode: budgetMode,
        status: campaign.status,
        statistics: stats
      }

      if (budgetMode === 'user') {
        const allowedIds = campaign.allowed_campaign_ids || []
        const userBudgetInfo = userBudgetTotals[campaign.lottery_campaign_id] || {
          total_balance: 0,
          user_count: 0
        }
        const result = {
          ...baseResult,
          allowed_campaign_ids: allowedIds,
          user_budget: {
            total_balance: userBudgetInfo.total_balance,
            user_count: userBudgetInfo.user_count,
            budget_source_display:
              allowedIds.length > 0
                ? allowedIds.map(id => (typeof id === 'string' ? id : `活动${id}`)).join('、')
                : '所有来源（无限制）'
          },
          pool_budget: { total: 0, remaining: 0, used: 0, usage_rate: 'N/A' }
        }
        grouped.user.push(result)
        return result
      } else if (budgetMode === 'pool' || budgetMode === 'pool_quota') {
        const total = Number(campaign.pool_budget_total) || 0
        const remaining = Number(campaign.pool_budget_remaining) || 0
        const used = total - remaining
        const result = {
          ...baseResult,
          pool_budget: {
            total,
            remaining,
            used,
            usage_rate: total > 0 ? ((used / total) * 100).toFixed(2) + '%' : 'N/A'
          }
        }
        const groupKey = budgetMode === 'pool_quota' ? 'pool' : budgetMode
        grouped[groupKey].push(result)
        return result
      } else {
        const result = {
          ...baseResult,
          pool_budget: { total: 0, remaining: 0, used: 0, usage_rate: 'N/A' }
        }
        grouped.none.push(result)
        return result
      }
    })

    const userSummary = {
      total_campaigns: grouped.user.length,
      total_user_budget_balance: grouped.user.reduce(
        (sum, c) => sum + (c.user_budget?.total_balance || 0),
        0
      ),
      total_user_count: grouped.user.reduce((sum, c) => sum + (c.user_budget?.user_count || 0), 0),
      total_consumed: grouped.user.reduce((sum, c) => sum + c.statistics.total_consumed, 0)
    }

    const poolSummary = {
      total_campaigns: grouped.pool.length,
      total_budget: grouped.pool.reduce((sum, c) => sum + c.pool_budget.total, 0),
      total_remaining: grouped.pool.reduce((sum, c) => sum + c.pool_budget.remaining, 0),
      total_used: grouped.pool.reduce((sum, c) => sum + c.pool_budget.used, 0)
    }

    const noneSummary = {
      total_campaigns: grouped.none.length
    }

    const summary = {
      total_campaigns: allResults.length,
      total_budget: poolSummary.total_budget + userSummary.total_user_budget_balance,
      total_remaining: poolSummary.total_remaining + userSummary.total_user_budget_balance,
      total_used: poolSummary.total_used + userSummary.total_consumed,
      by_mode: {
        user: userSummary,
        pool: poolSummary,
        none: noneSummary
      }
    }

    return {
      campaigns: allResults,
      grouped: {
        user: { campaigns: grouped.user, summary: userSummary },
        pool: { campaigns: grouped.pool, summary: poolSummary },
        none: { campaigns: grouped.none, summary: noneSummary }
      },
      total_count: allResults.length,
      summary
    }
  }

  /**
   * 获取用户模式活动的预算积分汇总
   *
   * @private
   * @param {Array} userModeCampaigns - 用户模式活动列表
   * @returns {Object} 按活动ID分组的预算积分汇总
   */
  static async _getUserBudgetPointsSummary(userModeCampaigns) {
    if (!userModeCampaigns || userModeCampaigns.length === 0) return {}

    const allBucketIds = new Set()
    const campaignBucketMap = {}

    userModeCampaigns.forEach(campaign => {
      const allowedIds = campaign.allowed_campaign_ids || []
      campaignBucketMap[campaign.lottery_campaign_id] = allowedIds
      allowedIds.forEach(id => allBucketIds.add(String(id)))
    })

    if (allBucketIds.size === 0) return {}

    const bucketBalances = await models.AccountAssetBalance.findAll({
      where: {
        asset_code: AssetCode.BUDGET_POINTS,
        lottery_campaign_id: { [Op.in]: Array.from(allBucketIds) }
      },
      attributes: [
        'lottery_campaign_id',
        [models.sequelize.fn('SUM', models.sequelize.col('available_amount')), 'total_available'],
        [
          models.sequelize.fn('COUNT', models.sequelize.literal('DISTINCT account_id')),
          'user_count'
        ]
      ],
      group: ['lottery_campaign_id'],
      raw: true
    })

    const bucketMap = {}
    bucketBalances.forEach(b => {
      bucketMap[b.lottery_campaign_id] = {
        total_available: parseInt(b.total_available) || 0,
        user_count: parseInt(b.user_count) || 0
      }
    })

    const result = {}
    Object.entries(campaignBucketMap).forEach(([campaignId, bucketIds]) => {
      let totalBalance = 0
      let totalUsers = 0
      bucketIds.forEach(bucketId => {
        const bucket = bucketMap[String(bucketId)]
        if (bucket) {
          totalBalance += bucket.total_available
          totalUsers += bucket.user_count
        }
      })
      result[campaignId] = { total_balance: totalBalance, user_count: totalUsers }
    })

    return result
  }

  /**
   * 获取单个活动的预算配置详情
   *
   * @param {number|string} campaignId - 活动ID
   * @returns {Object} 活动预算配置信息
   */
  static async getCampaignBudgetConfig(campaignId) {
    const campaign = await models.LotteryCampaign.findByPk(parseInt(campaignId), {
      attributes: [
        'lottery_campaign_id',
        'campaign_name',
        'campaign_code',
        'budget_mode',
        'pool_budget_total',
        'pool_budget_remaining',
        'allowed_campaign_ids',
        'preset_budget_policy',
        'status'
      ]
    })

    if (!campaign) {
      const error = new Error('活动不存在')
      error.code = 'CAMPAIGN_NOT_FOUND'
      error.statusCode = 404
      throw error
    }

    return {
      lottery_campaign_id: campaign.lottery_campaign_id,
      campaign_name: campaign.campaign_name,
      campaign_code: campaign.campaign_code,
      budget_mode: campaign.budget_mode,
      pool_budget: {
        total: Number(campaign.pool_budget_total) || 0,
        remaining: Number(campaign.pool_budget_remaining) || 0,
        used:
          (Number(campaign.pool_budget_total) || 0) - (Number(campaign.pool_budget_remaining) || 0)
      },
      preset_budget_policy: campaign.preset_budget_policy,
      allowed_campaign_ids: campaign.allowed_campaign_ids || [],
      status: campaign.status
    }
  }

  /**
   * 获取活动奖品配置信息
   *
   * @param {number|string} campaignId - 活动ID
   * @returns {Object} 包含活动信息、奖品列表和分析数据的配置
   */
  static async getPrizeConfig(campaignId) {
    const campaign = await models.LotteryCampaign.findByPk(parseInt(campaignId), {
      attributes: ['lottery_campaign_id', 'campaign_name', 'campaign_code', 'budget_mode']
    })

    if (!campaign) {
      const error = new Error('活动不存在')
      error.code = 'CAMPAIGN_NOT_FOUND'
      error.statusCode = 404
      throw error
    }

    const prizes = await models.LotteryPrize.findAll({
      where: { lottery_campaign_id: parseInt(campaignId) },
      attributes: [
        'lottery_prize_id',
        'prize_name',
        'prize_type',
        'prize_value_points',
        'win_probability',
        'stock_quantity',
        'status',
        'sort_order'
      ],
      order: [
        ['sort_order', 'ASC'],
        ['lottery_prize_id', 'ASC']
      ]
    })

    const analysis = {
      total_prizes: prizes.length,
      has_fallback_prize: prizes.some(p => p.prize_type === 'empty' || p.prize_value_points === 0),
      points_prizes_count: prizes.filter(p => p.prize_value_points > 0).length,
      total_probability: prizes.reduce((sum, p) => sum + Number(p.win_probability || 0), 0)
    }

    return {
      lottery_campaign_id: campaign.lottery_campaign_id,
      campaign_name: campaign.campaign_name,
      budget_mode: campaign.budget_mode,
      prizes: prizes.map(p => ({
        lottery_prize_id: p.lottery_prize_id,
        prize_name: p.prize_name,
        prize_type: p.prize_type,
        prize_value_points: p.prize_value_points,
        win_probability: p.win_probability,
        stock_quantity: p.stock_quantity,
        status: p.status,
        sort_order: p.sort_order
      })),
      analysis
    }
  }

  /**
   * 获取预算消耗统计数据
   *
   * @param {number|string} campaignId - 活动ID
   * @param {Object} options - 查询选项
   * @returns {Object} 预算消耗统计信息
   */
  static async getBudgetConsumptionStats(campaignId, options = {}) {
    const { start_date, end_date } = options

    const campaign = await models.LotteryCampaign.findByPk(parseInt(campaignId), {
      attributes: [
        'lottery_campaign_id',
        'campaign_name',
        'campaign_code',
        'budget_mode',
        'pool_budget_total',
        'pool_budget_remaining'
      ]
    })

    if (!campaign) {
      const error = new Error('活动不存在')
      error.code = 'CAMPAIGN_NOT_FOUND'
      error.statusCode = 404
      throw error
    }

    const drawWhere = {
      lottery_campaign_id: parseInt(campaignId),
      prize_value_points: { [Op.gt]: 0 }
    }

    if (start_date || end_date) {
      drawWhere.created_at = {}
      if (start_date) drawWhere.created_at[Op.gte] = new Date(start_date)
      if (end_date) drawWhere.created_at[Op.lte] = new Date(end_date)
    }

    const consumptionStats = await models.LotteryDraw.findOne({
      where: drawWhere,
      attributes: [
        [models.sequelize.fn('COUNT', models.sequelize.col('lottery_draw_id')), 'total_draws'],
        [models.sequelize.fn('SUM', models.sequelize.col('prize_value_points')), 'total_consumed'],
        [models.sequelize.fn('AVG', models.sequelize.col('prize_value_points')), 'avg_value'],
        [models.sequelize.fn('MAX', models.sequelize.col('prize_value_points')), 'max_value'],
        [models.sequelize.fn('MIN', models.sequelize.col('prize_value_points')), 'min_value']
      ],
      raw: true
    })

    const dailyStats = await models.LotteryDraw.findAll({
      where: {
        lottery_campaign_id: parseInt(campaignId),
        prize_value_points: { [Op.gt]: 0 },
        created_at: { [Op.gte]: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) }
      },
      attributes: [
        [models.sequelize.fn('DATE', models.sequelize.col('created_at')), 'date'],
        [models.sequelize.fn('COUNT', models.sequelize.col('lottery_draw_id')), 'draws'],
        [models.sequelize.fn('SUM', models.sequelize.col('prize_value_points')), 'consumed']
      ],
      group: [models.sequelize.fn('DATE', models.sequelize.col('created_at'))],
      order: [[models.sequelize.fn('DATE', models.sequelize.col('created_at')), 'DESC']],
      raw: true
    })

    const total = Number(campaign.pool_budget_total) || 0
    const remaining = Number(campaign.pool_budget_remaining) || 0

    return {
      campaign: {
        lottery_campaign_id: campaign.lottery_campaign_id,
        campaign_name: campaign.campaign_name,
        campaign_code: campaign.campaign_code,
        budget_mode: campaign.budget_mode
      },
      budget: {
        total,
        remaining,
        used: total - remaining,
        usage_rate: total > 0 ? (((total - remaining) / total) * 100).toFixed(2) + '%' : 'N/A'
      },
      consumption: {
        total_draws: parseInt(consumptionStats?.total_draws) || 0,
        total_consumed: parseInt(consumptionStats?.total_consumed) || 0,
        avg_value: parseFloat(consumptionStats?.avg_value) || 0,
        max_value: parseInt(consumptionStats?.max_value) || 0,
        min_value: parseInt(consumptionStats?.min_value) || 0
      },
      daily_stats: dailyStats.map(d => ({
        date: d.date,
        draws: parseInt(d.draws) || 0,
        consumed: parseInt(d.consumed) || 0
      }))
    }
  }

  /**
   * 调整活动预算
   *
   * @param {number|string} campaignId - 活动ID
   * @param {string} adjustmentType - 调整类型（increase/decrease/set）
   * @param {number|string} amount - 调整金额
   * @param {Object} options - 附加选项
   * @returns {Object} 调整后的预算信息
   */
  static async adjustCampaignBudget(campaignId, adjustmentType, amount, options = {}) {
    const { reason, operator_id, transaction } = options
    const parsedId = parseInt(campaignId)
    const parsedAmount = parseFloat(amount)

    const validTypes = ['increase', 'decrease', 'set']
    if (!validTypes.includes(adjustmentType)) {
      const error = new Error(`无效的调整类型: ${adjustmentType}，有效值：${validTypes.join('/')}`)
      error.code = 'INVALID_ADJUSTMENT_TYPE'
      error.statusCode = 400
      throw error
    }

    if (isNaN(parsedAmount) || parsedAmount < 0) {
      const error = new Error('调整金额必须为非负数值')
      error.code = 'INVALID_AMOUNT'
      error.statusCode = 400
      throw error
    }

    const campaign = await models.LotteryCampaign.findByPk(parsedId, {
      attributes: [
        'lottery_campaign_id',
        'campaign_name',
        'campaign_code',
        'budget_mode',
        'pool_budget_total',
        'pool_budget_remaining',
        'status'
      ],
      lock: transaction ? transaction.LOCK.UPDATE : undefined,
      transaction
    })

    if (!campaign) {
      const error = new Error(`活动不存在: lottery_campaign_id=${parsedId}`)
      error.code = 'CAMPAIGN_NOT_FOUND'
      error.statusCode = 404
      throw error
    }

    if (campaign.budget_mode !== 'pool') {
      const error = new Error(
        `活动 ${campaign.campaign_name} 的预算模式为 ${campaign.budget_mode}，` +
          '仅 budget_mode=pool 的活动支持预算调整'
      )
      error.code = 'BUDGET_MODE_NOT_SUPPORTED'
      error.statusCode = 400
      throw error
    }

    const oldTotal = Number(campaign.pool_budget_total) || 0
    const oldRemaining = Number(campaign.pool_budget_remaining) || 0
    const consumed = oldTotal - oldRemaining

    let newTotal
    let newRemaining

    switch (adjustmentType) {
      case 'increase':
        newTotal = oldTotal + parsedAmount
        newRemaining = oldRemaining + parsedAmount
        break

      case 'decrease':
        if (parsedAmount > oldRemaining) {
          const error = new Error(
            `减少金额 ${parsedAmount} 超过剩余预算 ${oldRemaining}，无法执行减少操作`
          )
          error.code = 'INSUFFICIENT_REMAINING_BUDGET'
          error.statusCode = 400
          throw error
        }
        newTotal = oldTotal - parsedAmount
        newRemaining = oldRemaining - parsedAmount
        break

      case 'set':
        if (parsedAmount < consumed) {
          const error = new Error(`目标总预算 ${parsedAmount} 不能小于已消耗金额 ${consumed}`)
          error.code = 'SET_BELOW_CONSUMED'
          error.statusCode = 400
          throw error
        }
        newTotal = parsedAmount
        newRemaining = parsedAmount - consumed
        break

      default:
        break
    }

    await campaign.update(
      {
        pool_budget_total: newTotal,
        pool_budget_remaining: newRemaining
      },
      { transaction }
    )

    logger.info('[ActivityBudgetService] 活动预算已调整', {
      lottery_campaign_id: parsedId,
      campaign_code: campaign.campaign_code,
      adjustment_type: adjustmentType,
      amount: parsedAmount,
      old_total: oldTotal,
      old_remaining: oldRemaining,
      new_total: newTotal,
      new_remaining: newRemaining,
      consumed,
      operator_id,
      reason
    })

    return {
      new_budget: newTotal,
      new_remaining: newRemaining,
      old_budget: oldTotal,
      old_remaining: oldRemaining,
      consumed,
      adjustment: {
        type: adjustmentType,
        amount: parsedAmount
      }
    }
  }
}

module.exports = ActivityBudgetService
