/**
 * 客服用户上下文聚合查询服务（CustomerServiceUserContextService）
 *
 * 业务说明：
 * - 为客服工作台C区（用户上下文面板）提供用户全维度数据聚合查询
 * - 全部为只读操作，不涉及数据变更
 * - 薄封装层设计：委托 UserDataQueryService（8个已有方法覆盖70%功能）+ ItemService + 少量新增查询
 *
 * 委托关系：
 * - getSummary → UserDataQueryService.getUserOverview + 补充统计
 * - getAssets → UserDataQueryService.getAssetTransactions + BalanceService.getAllBalances
 * - getBackpack → ItemService.getUserItemInstances
 * - getLottery → UserDataQueryService.getLotteryDraws
 * - getTrades → UserDataQueryService.getTradeRecords + getMarketListings
 * - getTimeline → UserDataQueryService多方法合并 + consumption_records + feedbacks
 * - getRisk → 直接查 UserRiskProfile + RiskAlert（新增查询 ~30行）
 * - getHistory → 直接查 CustomerServiceSession 历史（新增查询 ~40行）
 *
 * 服务类型：静态类（与 UserDataQueryService 一致）
 * ServiceManager Key: cs_user_context
 *
 * @version 1.0.0
 * @date 2026-02-22
 */

const logger = require('../utils/logger').logger

class CustomerServiceUserContextService {
  /**
   * 获取用户画像聚合摘要
   *
   * @param {Object} models - Sequelize models 对象
   * @param {number} userId - 用户ID
   * @returns {Object} 用户基本信息 + 各模块统计计数
   */
  static async getSummary (models, userId) {
    const UserDataQueryService = require('./UserDataQueryService')

    /* 委托 UserDataQueryService 获取用户基本信息和资产汇总 */
    const overview = await UserDataQueryService.getUserOverview(models, userId)

    /* 补充各模块统计计数（并行查询提升性能） */
    const [itemCount, lotteryCount, tradeOrderCount, feedbackCount, sessionCount] =
      await Promise.all([
        models.ItemInstance.count({ where: { owner_user_id: userId } }),
        models.LotteryDraw.count({ where: { user_id: userId } }),
        models.TradeOrder.count({
          where: {
            [models.Op.or]: [{ buyer_user_id: userId }, { seller_user_id: userId }]
          }
        }),
        models.Feedback.count({ where: { user_id: userId } }),
        models.CustomerServiceSession.count({ where: { user_id: userId } })
      ])

    return {
      ...overview,
      stats: {
        item_count: itemCount,
        lottery_count: lotteryCount,
        trade_order_count: tradeOrderCount,
        feedback_count: feedbackCount,
        session_count: sessionCount
      }
    }
  }

  /**
   * 获取用户资产余额 + 最近变动流水
   *
   * @param {Object} models - Sequelize models 对象
   * @param {number} userId - 用户ID
   * @param {Object} params - 查询参数（分页、筛选）
   * @returns {Object} { balances: [...], transactions: { rows: [...], count, page, page_size } }
   */
  static async getAssets (models, userId, params = {}) {
    const UserDataQueryService = require('./UserDataQueryService')

    /* 查询用户账户，获取 account_id 用于余额查询 */
    const account = await models.Account.findOne({
      where: { user_id: userId },
      attributes: ['account_id']
    })

    let balances = []
    if (account) {
      /* 查询所有资产余额（默认只查 GLOBAL 全局余额，折叠展示活动专属余额） */
      const balanceRows = await models.AccountAssetBalance.findAll({
        where: { account_id: account.account_id },
        
        order: [['lottery_campaign_key', 'ASC']]
      })
      balances = balanceRows.map(b => b.get({ plain: true }))
    }

    /* 委托 UserDataQueryService 获取资产变动流水 */
    const transactions = await UserDataQueryService.getAssetTransactions(models, userId, {
      page: params.page || 1,
      page_size: params.page_size || 10
    })

    return { balances, transactions }
  }

  /**
   * 获取用户背包物品列表
   *
   * @param {Object} models - Sequelize models 对象
   * @param {number} userId - 用户ID
   * @param {Object} params - 查询参数（分页、状态筛选）
   * @returns {Object} { rows: [...], count, page, page_size }
   */
  static async getBackpack (models, userId, params = {}) {
    const page = parseInt(params.page) || 1
    const pageSize = Math.min(parseInt(params.page_size) || 20, 100)
    const offset = (page - 1) * pageSize

    const where = { owner_user_id: userId }
    if (params.status) {
      where.status = params.status
    }

    const { count, rows } = await models.ItemInstance.findAndCountAll({
      where,
      include: [
        {
          model: models.ItemTemplate,
          as: 'itemTemplate',
          attributes: ['item_template_id', 'template_code', 'display_name', 'item_type', 'rarity_code']
        }
      ],
      order: [['created_at', 'DESC']],
      limit: pageSize,
      offset
    })

    return {
      rows: rows.map(r => r.get({ plain: true })),
      count,
      page,
      page_size: pageSize
    }
  }

  /**
   * 获取用户抽奖记录 + 统计
   *
   * @param {Object} models - Sequelize models 对象
   * @param {number} userId - 用户ID
   * @param {Object} params - 查询参数（分页、活动筛选）
   * @returns {Object} { summary: {...}, records: { rows, count, page, page_size } }
   */
  static async getLottery (models, userId, params = {}) {
    const UserDataQueryService = require('./UserDataQueryService')

    /* 计算抽奖统计摘要（按档位分布） */
    const [totalCount, tierCounts, guaranteeCount] = await Promise.all([
      models.LotteryDraw.count({ where: { user_id: userId } }),
      models.LotteryDraw.findAll({
        where: { user_id: userId },
        attributes: [
          'reward_tier',
          [models.sequelize.fn('COUNT', models.sequelize.col('reward_tier')), 'tier_count']
        ],
        group: ['reward_tier'],
        raw: true
      }),
      models.LotteryDraw.count({
        where: { user_id: userId, guarantee_triggered: true }
      })
    ])

    const tierDistribution = {}
    tierCounts.forEach(t => {
      tierDistribution[t.reward_tier] = parseInt(t.tier_count)
    })

    const summary = {
      total_draws: totalCount,
      tier_distribution: tierDistribution,
      guarantee_triggered_count: guaranteeCount
    }

    /* 委托 UserDataQueryService 获取分页记录 */
    const records = await UserDataQueryService.getLotteryDraws(models, userId, {
      page: params.page || 1,
      page_size: params.page_size || 10,
      lottery_campaign_id: params.lottery_campaign_id,
      reward_tier: params.reward_tier
    })

    return { summary, records }
  }

  /**
   * 获取用户交易订单 + 市场挂单
   *
   * @param {Object} models - Sequelize models 对象
   * @param {number} userId - 用户ID
   * @param {Object} params - 查询参数
   * @returns {Object} { orders: {...}, listings: {...}, stats: {...} }
   */
  static async getTrades (models, userId, params = {}) {
    const UserDataQueryService = require('./UserDataQueryService')

    /* 委托 UserDataQueryService 获取交易订单和市场挂单 */
    const [orders, listings] = await Promise.all([
      UserDataQueryService.getTradeRecords(models, userId, {
        page: params.page || 1,
        page_size: params.page_size || 10,
        role: params.role || 'all',
        status: params.status
      }),
      UserDataQueryService.getMarketListings(models, userId, {
        page: 1,
        page_size: 10,
        status: params.listing_status
      })
    ])

    /* 计算交易统计 */
    const [buyCount, sellCount, completedCount, cancelledCount] = await Promise.all([
      models.TradeOrder.count({ where: { buyer_user_id: userId } }),
      models.TradeOrder.count({ where: { seller_user_id: userId } }),
      models.TradeOrder.count({
        where: {
          [models.Op.or]: [{ buyer_user_id: userId }, { seller_user_id: userId }],
          status: 'completed'
        }
      }),
      models.TradeOrder.count({
        where: {
          [models.Op.or]: [{ buyer_user_id: userId }, { seller_user_id: userId }],
          status: 'cancelled'
        }
      })
    ])

    return {
      orders,
      listings,
      stats: {
        buy_count: buyCount,
        sell_count: sellCount,
        completed_count: completedCount,
        cancelled_count: cancelledCount
      }
    }
  }

  /**
   * 获取用户混合业务时间线
   *
   * @param {Object} models - Sequelize models 对象
   * @param {number} userId - 用户ID
   * @param {Object} params - 查询参数（分页）
   * @returns {Object} { rows: [...], count, page, page_size }
   */
  static async getTimeline (models, userId, params = {}) {
    const page = parseInt(params.page) || 1
    const pageSize = parseInt(params.page_size) || 20

    /* 并行查询各业务维度的最近记录 */
    const [consumptions, feedbacks, lotteryDraws] = await Promise.all([
      models.ConsumptionRecord
        ? models.ConsumptionRecord.findAll({
          where: { user_id: userId },
          order: [['created_at', 'DESC']],
          limit: pageSize,
          raw: true
        })
        : [],
      models.Feedback.findAll({
        where: { user_id: userId },
        order: [['created_at', 'DESC']],
        limit: pageSize,
        raw: true
      }),
      models.LotteryDraw.findAll({
        where: { user_id: userId },
        order: [['created_at', 'DESC']],
        limit: pageSize,
        raw: true
      })
    ])

    /* 合并所有记录，统一格式，按时间倒序排列 */
    const timeline = [
      ...consumptions.map(r => ({
        type: 'consumption',
        data: r,
        created_at: r.created_at
      })),
      ...feedbacks.map(r => ({
        type: 'feedback',
        data: r,
        created_at: r.created_at
      })),
      ...lotteryDraws.map(r => ({
        type: 'lottery',
        data: r,
        created_at: r.created_at
      }))
    ]

    timeline.sort((a, b) => new Date(b.created_at) - new Date(a.created_at))

    const start = (page - 1) * pageSize
    const paged = timeline.slice(start, start + pageSize)

    return {
      rows: paged,
      count: timeline.length,
      page,
      page_size: pageSize
    }
  }

  /**
   * 获取用户风控信息
   *
   * @param {Object} models - Sequelize models 对象
   * @param {number} userId - 用户ID
   * @returns {Object} { risk_profile: {...}, alerts: [...] }
   */
  static async getRisk (models, userId) {
    const [riskProfile, alerts] = await Promise.all([
      models.UserRiskProfile
        ? models.UserRiskProfile.findOne({ where: { user_id: userId }, raw: true })
        : null,
      models.RiskAlert
        ? models.RiskAlert.findAll({
          where: { target_user_id: userId },
          order: [['created_at', 'DESC']],
          limit: 20,
          raw: true
        })
        : []
    ])

    return {
      risk_profile: riskProfile,
      alerts
    }
  }

  /**
   * 获取用户历史客服会话列表
   *
   * @param {Object} models - Sequelize models 对象
   * @param {number} userId - 用户ID
   * @param {Object} params - 查询参数（分页）
   * @returns {Object} { rows: [...], count, page, page_size }
   */
  static async getHistory (models, userId, params = {}) {
    const page = parseInt(params.page) || 1
    const pageSize = parseInt(params.page_size) || 10
    const offset = (page - 1) * pageSize

    const { count, rows } = await models.CustomerServiceSession.findAndCountAll({
      where: { user_id: userId },
      include: [
        {
          model: models.User,
          as: 'admin',
          attributes: ['user_id', 'nickname']
        }
      ],
      order: [['created_at', 'DESC']],
      limit: pageSize,
      offset
    })

    /* 为每个会话附加消息摘要（最后一条消息的前50字） */
    const sessionsWithSummary = await Promise.all(
      rows.map(async session => {
        const lastMessage = await models.ChatMessage.findOne({
          where: { customer_service_session_id: session.customer_service_session_id },
          order: [['created_at', 'DESC']],
          attributes: ['content', 'sender_type', 'created_at']
        })

        const plain = session.get({ plain: true })
        plain.last_message_preview = lastMessage
          ? {
              content: lastMessage.content
                ? lastMessage.content.substring(0, 50)
                : '',
              sender_type: lastMessage.sender_type,
              created_at: lastMessage.created_at
            }
          : null
        plain.message_count = await models.ChatMessage.count({
          where: { customer_service_session_id: session.customer_service_session_id }
        })
        return plain
      })
    )

    return {
      rows: sessionsWithSummary,
      count,
      page,
      page_size: pageSize
    }
  }
}

module.exports = CustomerServiceUserContextService
