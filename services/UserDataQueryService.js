/**
 * 用户数据查询服务（管理后台 - 用户全维度数据检索）
 *
 * @description 聚合查询指定用户的全维度业务数据，包括：
 *   - 资产流水（积分来源、消耗、收入支出）
 *   - 抽奖记录（每次抽奖的详细情况）
 *   - 兑换记录（兑换商品和核销状态）
 *   - 交易记录（C2C 市场买卖情况）
 *   - 市场挂牌（上架/下架记录）
 *   - 材料转换（道具分解/合成记录）
 *   - 资产汇总（各类资产当前余额）
 *
 * 架构原则：
 *   - 纯读操作，不修改任何数据
 *   - 静态类 + 静态方法（无状态）
 *   - 通过 ServiceManager 统一注册（key: user_data_query）
 *   - 所有查询均支持分页和时间范围筛选
 *
 * @version 1.0.0
 * @date 2026-02-18
 */

'use strict'

const { Op } = require('sequelize')
const _logger = require('../utils/logger').logger

/**
 * 构建时间范围查询条件
 * @param {string} [start_date] - 起始日期（ISO8601）
 * @param {string} [end_date] - 截止日期（ISO8601）
 * @param {string} [field='created_at'] - 时间字段名
 * @returns {Object|null} Sequelize where 子句，无有效范围时返回 null
 */
function buildDateRange(start_date, end_date, field = 'created_at') {
  if (!start_date && !end_date) return null
  const condition = {}
  if (start_date) condition[Op.gte] = new Date(start_date)
  if (end_date) condition[Op.lte] = new Date(end_date)
  return { [field]: condition }
}

/**
 * 标准分页参数解析
 * @param {number|string} page - 页码（从 1 开始）
 * @param {number|string} page_size - 每页条数（最大 100）
 * @returns {{ offset: number, limit: number, pageNum: number, pageSizeNum: number }} 分页参数
 */
function parsePagination(page, page_size) {
  const pageNum = Math.max(1, parseInt(page) || 1)
  const pageSizeNum = Math.min(100, Math.max(1, parseInt(page_size) || 20))
  return { offset: (pageNum - 1) * pageSizeNum, limit: pageSizeNum, pageNum, pageSizeNum }
}

/** 用户全维度数据查询服务（静态类） */
class UserDataQueryService {
  /**
   * 获取用户概览信息（基本信息 + 资产余额汇总）
   *
   * @param {Object} models - Sequelize models
   * @param {number} user_id - 用户 ID
   * @returns {Promise<Object>} 用户概览数据
   */
  static async getUserOverview(models, user_id) {
    const { User, Account, AccountAssetBalance, MaterialAssetType } = models

    // 查询用户基本信息
    const user = await User.findByPk(user_id, {
      attributes: [
        'user_id',
        'mobile',
        'nickname',
        'avatar_url',
        'status',
        'user_level',
        'history_total_points',
        'consecutive_fail_count',
        'last_login',
        'last_active_at',
        'login_count',
        'created_at'
      ]
    })

    if (!user) {
      return null
    }

    // 查询用户账户及余额
    const account = await Account.findOne({
      where: { user_id, account_type: 'user' }
    })

    let balances = []
    if (account) {
      const rawBalances = await AccountAssetBalance.findAll({
        where: { account_id: account.account_id },
        attributes: ['asset_code', 'available_amount', 'frozen_amount'],
        order: [['asset_code', 'ASC']]
      })

      // 附加资产显示名称
      const assetCodes = rawBalances.map(b => b.asset_code)
      const assetTypes =
        assetCodes.length > 0
          ? await MaterialAssetType.findAll({
              where: { asset_code: { [Op.in]: assetCodes } },
              attributes: ['asset_code', 'display_name', 'group_code']
            })
          : []
      const typeMap = new Map(assetTypes.map(t => [t.asset_code, t]))

      balances = rawBalances.map(b => {
        const typeInfo = typeMap.get(b.asset_code)
        return {
          asset_code: b.asset_code,
          display_name: typeInfo?.display_name || b.asset_code,
          group_code: typeInfo?.group_code || 'unknown',
          available_amount: Number(b.available_amount),
          frozen_amount: Number(b.frozen_amount)
        }
      })
    }

    return {
      user: user.toJSON(),
      account_id: account?.account_id || null,
      balances
    }
  }

  /**
   * 查询用户资产流水（积分来源 / 消耗 / 收入支出）
   *
   * @param {Object} models - Sequelize models
   * @param {number} user_id - 用户 ID
   * @param {Object} params - 查询参数
   * @param {string} [params.asset_code] - 资产代码筛选
   * @param {string} [params.business_type] - 业务类型筛选
   * @param {string} [params.direction] - 方向筛选：income（收入）/ expense（支出）
   * @param {string} [params.start_date] - 开始日期（ISO8601）
   * @param {string} [params.end_date] - 结束日期（ISO8601）
   * @param {number} [params.page=1] - 页码（从 1 开始）
   * @param {number} [params.page_size=20] - 每页条数（最大 100）
   * @returns {Promise<Object>} 分页资产流水列表 + 汇总统计
   */
  static async getAssetTransactions(models, user_id, params = {}) {
    const { Account, AssetTransaction, MaterialAssetType } = models
    const {
      asset_code,
      business_type,
      direction,
      start_date,
      end_date,
      page = 1,
      page_size = 20
    } = params

    // 先获取用户账户
    const account = await Account.findOne({
      where: { user_id, account_type: 'user' }
    })
    if (!account) {
      return { list: [], total: 0, page: 1, page_size: 20, summary: {} }
    }

    const { offset, limit, pageNum, pageSizeNum } = parsePagination(page, page_size)

    const where = { account_id: account.account_id }
    if (asset_code) where.asset_code = asset_code
    if (business_type) where.business_type = business_type
    if (direction === 'income') where.delta_amount = { [Op.gt]: 0 }
    if (direction === 'expense') where.delta_amount = { [Op.lt]: 0 }

    const dateRange = buildDateRange(start_date, end_date)
    if (dateRange) Object.assign(where, dateRange)

    const { count, rows } = await AssetTransaction.findAndCountAll({
      where,
      attributes: [
        'asset_transaction_id',
        'asset_code',
        'delta_amount',
        'balance_before',
        'balance_after',
        'business_type',
        'idempotency_key',
        'meta',
        'created_at'
      ],
      order: [['created_at', 'DESC']],
      offset,
      limit
    })

    // 附加资产显示名称
    const assetCodes = [...new Set(rows.map(r => r.asset_code))]
    const assetTypes =
      assetCodes.length > 0
        ? await MaterialAssetType.findAll({
            where: { asset_code: { [Op.in]: assetCodes } },
            attributes: ['asset_code', 'display_name']
          })
        : []
    const nameMap = new Map(assetTypes.map(t => [t.asset_code, t.display_name]))

    // 汇总统计（当前筛选条件下）
    const summaryWhere = { account_id: account.account_id }
    if (asset_code) summaryWhere.asset_code = asset_code
    if (dateRange) Object.assign(summaryWhere, dateRange)

    const [incomeResult, expenseResult] = await Promise.all([
      AssetTransaction.sum('delta_amount', {
        where: { ...summaryWhere, delta_amount: { [Op.gt]: 0 } }
      }),
      AssetTransaction.sum('delta_amount', {
        where: { ...summaryWhere, delta_amount: { [Op.lt]: 0 } }
      })
    ])

    return {
      list: rows.map(r => ({
        ...r.toJSON(),
        delta_amount: Number(r.delta_amount),
        balance_before: Number(r.balance_before),
        balance_after: Number(r.balance_after),
        asset_display_name: nameMap.get(r.asset_code) || r.asset_code
      })),
      total: count,
      page: pageNum,
      page_size: pageSizeNum,
      summary: {
        total_income: Number(incomeResult) || 0,
        total_expense: Math.abs(Number(expenseResult) || 0),
        net_change: (Number(incomeResult) || 0) + (Number(expenseResult) || 0)
      }
    }
  }

  /**
   * 查询用户抽奖记录
   *
   * @param {Object} models - Sequelize models
   * @param {number} user_id - 用户 ID
   * @param {Object} params - 查询参数
   * @param {string} [params.lottery_campaign_id] - 活动 ID 筛选
   * @param {string} [params.reward_tier] - 档位筛选
   * @param {string} [params.start_date] - 开始日期（ISO8601）
   * @param {string} [params.end_date] - 结束日期（ISO8601）
   * @param {number} [params.page=1] - 页码
   * @param {number} [params.page_size=20] - 每页条数
   * @returns {Promise<Object>} 分页抽奖记录列表 + 汇总统计
   */
  static async getLotteryDraws(models, user_id, params = {}) {
    const { LotteryDraw, LotteryPrize, LotteryCampaign } = models
    const {
      lottery_campaign_id,
      reward_tier,
      start_date,
      end_date,
      page = 1,
      page_size = 20
    } = params

    const { offset, limit, pageNum, pageSizeNum } = parsePagination(page, page_size)

    const where = { user_id }
    if (lottery_campaign_id) where.lottery_campaign_id = lottery_campaign_id
    if (reward_tier) where.reward_tier = reward_tier

    const dateRange = buildDateRange(start_date, end_date)
    if (dateRange) Object.assign(where, dateRange)

    const includeOpts = []

    if (LotteryPrize) {
      includeOpts.push({
        model: LotteryPrize,
        as: 'prize',
        attributes: ['lottery_prize_id', 'prize_name'],
        required: false
      })
    }

    if (LotteryCampaign) {
      includeOpts.push({
        model: LotteryCampaign,
        as: 'campaign',
        attributes: ['lottery_campaign_id', 'campaign_name'],
        required: false
      })
    }

    const { count, rows } = await LotteryDraw.findAndCountAll({
      where,
      include: includeOpts,
      order: [['created_at', 'DESC']],
      offset,
      limit
    })

    // 汇总统计
    const totalDraws = await LotteryDraw.count({ where: { user_id } })
    const tierCounts = await LotteryDraw.findAll({
      where: { user_id },
      attributes: [
        'reward_tier',
        [models.sequelize.fn('COUNT', models.sequelize.col('reward_tier')), 'count']
      ],
      group: ['reward_tier'],
      raw: true
    })

    return {
      list: rows.map(r => r.toJSON()),
      total: count,
      page: pageNum,
      page_size: pageSizeNum,
      summary: {
        total_draws: totalDraws,
        tier_distribution: tierCounts.reduce((acc, t) => {
          acc[t.reward_tier] = parseInt(t.count)
          return acc
        }, {})
      }
    }
  }

  /**
   * 查询用户兑换记录（含核销状态）
   *
   * @param {Object} models - Sequelize models
   * @param {number} user_id - 用户 ID
   * @param {Object} params - 查询参数
   * @param {string} [params.status] - 状态筛选（pending/completed/shipped/cancelled）
   * @param {string} [params.start_date] - 开始日期（ISO8601）
   * @param {string} [params.end_date] - 结束日期（ISO8601）
   * @param {number} [params.page=1] - 页码
   * @param {number} [params.page_size=20] - 每页条数
   * @returns {Promise<Object>} 分页兑换记录列表 + 汇总统计
   */
  static async getExchangeRecords(models, user_id, params = {}) {
    const { ExchangeRecord, ExchangeItem } = models
    const { status, start_date, end_date, page = 1, page_size = 20 } = params

    const { offset, limit, pageNum, pageSizeNum } = parsePagination(page, page_size)

    const where = { user_id }
    if (status) where.status = status

    const dateRange = buildDateRange(start_date, end_date)
    if (dateRange) Object.assign(where, dateRange)

    const includeOpts = []
    if (ExchangeItem) {
      includeOpts.push({
        model: ExchangeItem,
        as: 'item',
        attributes: ['exchange_item_id', 'item_name', 'cost_asset_code', 'cost_amount', 'category'],
        required: false
      })
    }

    const { count, rows } = await ExchangeRecord.findAndCountAll({
      where,
      include: includeOpts,
      order: [['created_at', 'DESC']],
      offset,
      limit,
      distinct: true
    })

    // 汇总统计
    const statusCounts = await ExchangeRecord.findAll({
      where: { user_id },
      attributes: [
        'status',
        [models.sequelize.fn('COUNT', models.sequelize.col('status')), 'count']
      ],
      group: ['status'],
      raw: true
    })

    const totalSpent = await ExchangeRecord.sum('pay_amount', {
      where: { user_id, status: { [Op.ne]: 'cancelled' } }
    })

    return {
      list: rows.map(r => ({
        ...r.toJSON(),
        pay_amount: Number(r.pay_amount)
      })),
      total: count,
      page: pageNum,
      page_size: pageSizeNum,
      summary: {
        status_distribution: statusCounts.reduce((acc, s) => {
          acc[s.status] = parseInt(s.count)
          return acc
        }, {}),
        total_spent: Number(totalSpent) || 0
      }
    }
  }

  /**
   * 查询用户交易记录（C2C 市场买卖）
   *
   * @param {Object} models - Sequelize models
   * @param {number} user_id - 用户 ID
   * @param {Object} params - 查询参数
   * @param {string} [params.role] - 角色筛选：buyer / seller / all
   * @param {string} [params.status] - 状态筛选
   * @param {string} [params.start_date] - 开始日期（ISO8601）
   * @param {string} [params.end_date] - 结束日期（ISO8601）
   * @param {number} [params.page=1] - 页码
   * @param {number} [params.page_size=20] - 每页条数
   * @returns {Promise<Object>} 分页交易列表 + 汇总统计
   */
  static async getTradeRecords(models, user_id, params = {}) {
    const { TradeOrder } = models
    const { role = 'all', status, start_date, end_date, page = 1, page_size = 20 } = params

    const { offset, limit, pageNum, pageSizeNum } = parsePagination(page, page_size)

    const where = {}
    if (role === 'buyer') {
      where.buyer_user_id = user_id
    } else if (role === 'seller') {
      where.seller_user_id = user_id
    } else {
      where[Op.or] = [{ buyer_user_id: user_id }, { seller_user_id: user_id }]
    }
    if (status) where.status = status

    const dateRange = buildDateRange(start_date, end_date)
    if (dateRange) Object.assign(where, dateRange)

    const { count, rows } = await TradeOrder.findAndCountAll({
      where,
      order: [['created_at', 'DESC']],
      offset,
      limit
    })

    // 汇总统计
    const buyCount = await TradeOrder.count({ where: { buyer_user_id: user_id } })
    const sellCount = await TradeOrder.count({ where: { seller_user_id: user_id } })

    return {
      list: rows.map(r => ({
        ...r.toJSON(),
        user_role: r.buyer_user_id === user_id ? 'buyer' : 'seller'
      })),
      total: count,
      page: pageNum,
      page_size: pageSizeNum,
      summary: {
        as_buyer_count: buyCount,
        as_seller_count: sellCount,
        total_trades: buyCount + sellCount
      }
    }
  }

  /**
   * 查询用户市场挂牌（上架/下架记录）
   *
   * @param {Object} models - Sequelize models
   * @param {number} user_id - 用户 ID
   * @param {Object} params - 查询参数
   * @param {string} [params.status] - 状态筛选（on_sale/locked/sold/withdrawn/admin_withdrawn）
   * @param {string} [params.start_date] - 开始日期（ISO8601）
   * @param {string} [params.end_date] - 结束日期（ISO8601）
   * @param {number} [params.page=1] - 页码
   * @param {number} [params.page_size=20] - 每页条数
   * @returns {Promise<Object>} 分页挂牌记录列表 + 汇总统计
   */
  static async getMarketListings(models, user_id, params = {}) {
    const { MarketListing } = models
    const { status, start_date, end_date, page = 1, page_size = 20 } = params

    const { offset, limit, pageNum, pageSizeNum } = parsePagination(page, page_size)

    const where = { seller_user_id: user_id }
    if (status) where.status = status

    const dateRange = buildDateRange(start_date, end_date)
    if (dateRange) Object.assign(where, dateRange)

    const { count, rows } = await MarketListing.findAndCountAll({
      where,
      attributes: [
        'market_listing_id',
        'listing_kind',
        'status',
        'offer_item_display_name',
        'offer_asset_display_name',
        'offer_asset_code',
        'offer_amount',
        'price_asset_code',
        'price_amount',
        'created_at',
        'updated_at'
      ],
      order: [['created_at', 'DESC']],
      offset,
      limit
    })

    // 汇总统计
    const statusCounts = await MarketListing.findAll({
      where: { seller_user_id: user_id },
      attributes: [
        'status',
        [models.sequelize.fn('COUNT', models.sequelize.col('status')), 'count']
      ],
      group: ['status'],
      raw: true
    })

    return {
      list: rows.map(r => ({
        ...r.toJSON(),
        offer_amount: Number(r.offer_amount),
        price_amount: Number(r.price_amount)
      })),
      total: count,
      page: pageNum,
      page_size: pageSizeNum,
      summary: {
        status_distribution: statusCounts.reduce((acc, s) => {
          acc[s.status] = parseInt(s.count)
          return acc
        }, {})
      }
    }
  }

  /**
   * 查询用户材料转换记录（道具分解/合成）
   *
   * 说明：材料转换没有独立表，通过 AssetTransaction 的 business_type
   * 匹配 material_convert_debit / material_convert_credit 来追踪
   *
   * @param {Object} models - Sequelize models
   * @param {number} user_id - 用户 ID
   * @param {Object} params - 查询参数
   * @param {string} [params.start_date] - 开始日期（ISO8601）
   * @param {string} [params.end_date] - 结束日期（ISO8601）
   * @param {number} [params.page=1] - 页码
   * @param {number} [params.page_size=20] - 每页条数
   * @returns {Promise<Object>} 分页转换记录列表 + 汇总统计
   */
  static async getConversionRecords(models, user_id, params = {}) {
    const { Account, AssetTransaction, MaterialAssetType } = models
    const { start_date, end_date, page = 1, page_size = 20 } = params

    const account = await Account.findOne({
      where: { user_id, account_type: 'user' }
    })
    if (!account) {
      return { list: [], total: 0, page: 1, page_size: 20, summary: {} }
    }

    const { offset, limit, pageNum, pageSizeNum } = parsePagination(page, page_size)

    const where = {
      account_id: account.account_id,
      business_type: {
        [Op.in]: ['material_convert_debit', 'material_convert_credit', 'material_convert_fee']
      }
    }

    const dateRange = buildDateRange(start_date, end_date)
    if (dateRange) Object.assign(where, dateRange)

    const { count, rows } = await AssetTransaction.findAndCountAll({
      where,
      attributes: [
        'asset_transaction_id',
        'asset_code',
        'delta_amount',
        'balance_before',
        'balance_after',
        'business_type',
        'meta',
        'created_at'
      ],
      order: [['created_at', 'DESC']],
      offset,
      limit
    })

    // 附加资产显示名称
    const assetCodes = [...new Set(rows.map(r => r.asset_code))]
    const assetTypes =
      assetCodes.length > 0
        ? await MaterialAssetType.findAll({
            where: { asset_code: { [Op.in]: assetCodes } },
            attributes: ['asset_code', 'display_name']
          })
        : []
    const nameMap = new Map(assetTypes.map(t => [t.asset_code, t.display_name]))

    // 汇总
    const totalConversions = await AssetTransaction.count({
      where: {
        account_id: account.account_id,
        business_type: 'material_convert_debit'
      }
    })

    return {
      list: rows.map(r => ({
        ...r.toJSON(),
        delta_amount: Number(r.delta_amount),
        balance_before: Number(r.balance_before),
        balance_after: Number(r.balance_after),
        asset_display_name: nameMap.get(r.asset_code) || r.asset_code
      })),
      total: count,
      page: pageNum,
      page_size: pageSizeNum,
      summary: {
        total_conversions: totalConversions
      }
    }
  }

  /**
   * 搜索用户（支持手机号或用户 ID）
   *
   * @param {Object} models - Sequelize models
   * @param {string} keyword - 搜索关键词（手机号或用户 ID）
   * @returns {Promise<Array>} 匹配的用户列表
   */
  static async searchUser(models, keyword) {
    const { User } = models

    if (!keyword || !keyword.trim()) {
      return []
    }

    const trimmed = keyword.trim()
    const where = {}

    if (/^\d+$/.test(trimmed) && trimmed.length <= 10) {
      // 纯数字且长度 <= 10，按 user_id 精确匹配
      where.user_id = parseInt(trimmed)
    } else if (/^1\d{10}$/.test(trimmed)) {
      // 11 位手机号
      where.mobile = trimmed
    } else {
      // 模糊搜索（手机号或昵称）
      where[Op.or] = [
        { mobile: { [Op.like]: `%${trimmed}%` } },
        { nickname: { [Op.like]: `%${trimmed}%` } }
      ]
    }

    const users = await User.findAll({
      where,
      attributes: [
        'user_id',
        'mobile',
        'nickname',
        'avatar_url',
        'status',
        'user_level',
        'created_at'
      ],
      limit: 10,
      order: [['user_id', 'ASC']]
    })

    return users.map(u => u.toJSON())
  }
}

module.exports = UserDataQueryService
