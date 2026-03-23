/**
 * 资产查询服务 - AssetService 拆分子服务
 *
 * @description 处理所有资产查询和统计相关操作（从 AssetService 提取）
 * @module services/asset/QueryService
 * @version 1.0.0
 * @date 2026-01-31
 *
 * 职责范围：
 * - 预算积分查询：getTotalBudgetPoints, getBudgetPointsByCampaigns
 * - 流水查询：getTransactions, getTransactionByIdempotencyKey
 * - 资产总览：getAssetPortfolio
 * - 导出查询：getBalancesForExport
 * - 系统统计：getSystemStats
 *
 * 服务类型：静态类（无需实例化）
 * 服务键名：asset_query
 *
 * 依赖服务：
 * - BalanceService（用于获取账户）
 *
 * 数据模型：
 * - Account：账户
 * - AccountAssetBalance：账户余额
 * - AssetTransaction：资产交易记录
 * - Item：物品
 * - MaterialAssetType：材料资产类型
 *
 * 设计原则（继承自 AssetService）：
 * - 只读查询不强制事务边界
 * - 支持分页和筛选
 * - 返回格式化的统计数据
 */

'use strict'

const { Op } = require('sequelize')
const {
  Account,
  AccountAssetBalance,
  AssetTransaction,
  User,
  MaterialAssetType
} = require('../../models')
const logger = require('../../utils/logger')

/**
 * 资产查询服务类
 *
 * @class QueryService
 * @description 提供资产相关的所有查询和统计功能
 */
class QueryService {
  /**
   * 获取用户所有 BUDGET_POINTS 可用余额总和（跨所有活动）
   *
   * 业务场景：抽奖管线需要判断用户总预算积分是否充足
   * 方案1决策：V4.6 Pipeline 统一通过资产服务层访问资产数据（现 QueryService）
   *
   * @param {Object} params - 参数对象
   * @param {number} params.user_id - 用户ID
   * @param {Object} options - 选项
   * @param {Object} options.transaction - Sequelize事务对象（可选）
   * @returns {Promise<number>} BUDGET_POINTS 可用余额总和
   */
  static async getTotalBudgetPoints(params, options = {}) {
    const { user_id } = params
    const { transaction } = options

    if (!user_id) {
      throw new Error('getTotalBudgetPoints: user_id 参数必填')
    }

    // 获取用户账户
    const account = await Account.findOne({
      where: { user_id, account_type: 'user' },
      transaction
    })

    if (!account) {
      // 账户不存在时返回 0（符合决策G：0正常态）
      return 0
    }

    // 汇总所有 BUDGET_POINTS 可用余额
    const result = await AccountAssetBalance.sum('available_amount', {
      where: {
        account_id: account.account_id,
        asset_code: 'BUDGET_POINTS'
      },
      transaction
    })

    return Number(result) || 0
  }

  /**
   * 获取用户指定活动ID列表的 BUDGET_POINTS 可用余额总和
   *
   * 业务场景：抽奖管线按活动优先级扣减预算积分时，需要查询特定活动的余额
   * 方案1决策：V4.6 Pipeline 统一通过资产服务层访问资产数据（现 QueryService）
   *
   * @param {Object} params - 参数对象
   * @param {number} params.user_id - 用户ID
   * @param {Array<string|number>} params.lottery_campaign_ids - 允许的活动ID列表
   * @param {Object} options - 选项
   * @param {Object} options.transaction - Sequelize事务对象（可选）
   * @returns {Promise<number>} BUDGET_POINTS 可用余额总和
   */
  static async getBudgetPointsByCampaigns(params, options = {}) {
    const { user_id, lottery_campaign_ids } = params
    const { transaction } = options

    if (!user_id) {
      throw new Error('getBudgetPointsByCampaigns: user_id 参数必填')
    }

    if (
      !lottery_campaign_ids ||
      !Array.isArray(lottery_campaign_ids) ||
      lottery_campaign_ids.length === 0
    ) {
      return 0
    }

    // 获取用户账户
    const account = await Account.findOne({
      where: { user_id, account_type: 'user' },
      transaction
    })

    if (!account) {
      // 账户不存在时返回 0（符合决策G：0正常态）
      return 0
    }

    // 将 lottery_campaign_ids 转为字符串数组（lottery_campaign_id 在表中为字符串类型）
    const campaignIdStrings = lottery_campaign_ids.map(id => String(id))

    // 汇总指定活动的 BUDGET_POINTS 可用余额
    const result = await AccountAssetBalance.sum('available_amount', {
      where: {
        account_id: account.account_id,
        asset_code: 'BUDGET_POINTS',
        lottery_campaign_id: { [Op.in]: campaignIdStrings }
      },
      transaction
    })

    return Number(result) || 0
  }

  /**
   * 获取资产流水记录
   *
   * @param {Object} params - 参数对象
   * @param {number} params.user_id - 用户ID（用户账户）
   * @param {string} params.system_code - 系统账户代码（系统账户）
   * @param {Object} filters - 筛选条件
   * @param {string} filters.asset_code - 资产代码（可选）
   * @param {string} filters.business_type - 业务类型（可选）
   * @param {Date|string} filters.start_date - 开始日期（可选）
   * @param {Date|string} filters.end_date - 结束日期（可选）
   * @param {number} filters.page - 页码（默认1）
   * @param {number} filters.page_size - 每页数量（默认20）
   * @param {Object} options - 选项
   * @param {Object} options.transaction - Sequelize事务对象（可选）
   * @returns {Promise<Object>} { transactions, total, page, page_size, total_pages }
   */
  static async getTransactions(params, filters = {}, options = {}) {
    const { user_id, system_code } = params
    const { asset_code, business_type, start_date, end_date, page = 1, page_size = 20 } = filters
    const { transaction } = options

    // 获取账户（使用 BalanceService 的方法）
    const BalanceService = require('./BalanceService')
    const account = await BalanceService.getOrCreateAccount(
      { user_id, system_code },
      { transaction }
    )

    const where = {
      account_id: account.account_id,
      [Op.or]: [{ is_test_data: 0 }, { is_test_data: null }]
    }

    if (asset_code) {
      where.asset_code = asset_code
    }

    if (business_type) {
      where.business_type = business_type
    }

    // 支持日期范围筛选（管理员视角资产流水查询需要）
    if (start_date || end_date) {
      where.created_at = {}
      if (start_date) {
        where.created_at[Op.gte] = start_date instanceof Date ? start_date : new Date(start_date)
      }
      if (end_date) {
        where.created_at[Op.lte] = end_date instanceof Date ? end_date : new Date(end_date)
      }
    }

    const { count, rows } = await AssetTransaction.findAndCountAll({
      where,
      limit: page_size,
      offset: (page - 1) * page_size,
      order: [['created_at', 'DESC']],
      transaction
    })

    return {
      transactions: rows,
      total: count,
      page,
      page_size,
      total_pages: Math.ceil(count / page_size)
    }
  }

  /**
   * 通过幂等键点查交易记录
   *
   * 业务场景：
   * - 材料转换服务的幂等性重放检查（从"扫描"优化为"点查"）
   * - 任何需要根据 idempotency_key 快速查询是否已存在的场景
   *
   * 设计背景（来自 2026-01-13 材料转换系统降维护成本方案）：
   * - 改造前：getTransactions 扫描 page_size=1000 条记录后内存遍历查找
   * - 改造后：直接通过 idempotency_key 唯一索引点查（O(1) 复杂度）
   *
   * @param {string} idempotency_key - 幂等键（必填，精确匹配）
   * @param {Object} options - 选项
   * @param {Object} options.transaction - Sequelize事务对象（可选）
   * @returns {Promise<Object|null>} 交易记录对象，不存在返回 null
   */
  static async getTransactionByIdempotencyKey(idempotency_key, options = {}) {
    const { transaction } = options

    if (!idempotency_key) {
      throw new Error('idempotency_key是必填参数')
    }

    const transactionRecord = await AssetTransaction.findOne({
      where: { idempotency_key },
      transaction
    })

    if (transactionRecord) {
      logger.debug('🔍 幂等键点查命中', {
        service: 'QueryService',
        method: 'getTransactionByIdempotencyKey',
        idempotency_key,
        transaction_id: transactionRecord.transaction_id,
        business_type: transactionRecord.business_type
      })
    }

    return transactionRecord
  }

  /**
   * 获取用户资产总览（统一资产域入口）
   *
   * 整合三个资产域：
   * 1. 积分（POINTS） - 来自 account_asset_balances（asset_code='POINTS'）
   * 2. 可叠加资产（DIAMOND、材料） - 来自 account_asset_balances
   * 3. 不可叠加物品 - 来自 items（三表模型：items + item_ledger + item_holds）
   *
   * 业务场景：
   * - 用户背包页面展示
   * - 资产统计仪表盘
   * - 用户资产概览
   *
   * @param {Object} params - 参数对象
   * @param {number} params.user_id - 用户ID（必填）
   * @param {Object} options - 选项
   * @param {Object} options.transaction - Sequelize事务对象（可选）
   * @param {boolean} options.include_items - 是否包含物品列表（默认false，仅返回统计数据）
   * @returns {Promise<Object>} 资产总览对象
   */
  static async getAssetPortfolio(params, options = {}) {
    const { user_id } = params
    const { transaction, include_items = false } = options

    if (!user_id) {
      throw new Error('user_id是必填参数')
    }

    // 需要动态引入模型（避免循环依赖）
    const { Item, MaterialAssetType } = require('../../models')
    const BalanceService = require('./BalanceService')

    // 1. 获取或创建用户账户
    let account = null
    try {
      account = await BalanceService.getOrCreateAccount({ user_id }, { transaction })
    } catch (e) {
      // 用户可能没有账户，返回空余额
      logger.info('用户暂无资产账户', {
        service: 'QueryService',
        method: 'getAssetPortfolio',
        user_id
      })
    }

    // 2. 获取所有可叠加资产余额
    const fungible_assets = []
    let points = { available: 0, total_earned: 0, total_consumed: 0 }

    if (account) {
      const balances = await AccountAssetBalance.findAll({
        where: { account_id: account.account_id },
        transaction,
        order: [['asset_code', 'ASC']]
      })

      // 获取材料类型的显示名称
      const materialTypes = await MaterialAssetType.findAll({
        where: { is_enabled: true },
        transaction
      })
      const materialTypeMap = new Map(
        materialTypes.map(t => [t.asset_code, { display_name: t.display_name }])
      )

      for (const balance of balances) {
        // 跳过系统内部资产类型（BUDGET_POINTS 不暴露给前端）
        if (balance.asset_code === 'BUDGET_POINTS') {
          continue
        }

        const materialInfo = materialTypeMap.get(balance.asset_code)

        // 🆕 方案C：从 POINTS 资产中提取积分数据
        if (balance.asset_code === 'POINTS') {
          points = {
            available: Number(balance.available_amount),
            frozen: Number(balance.frozen_amount),
            total_earned: Number(balance.total_earned || 0),
            total_consumed: Number(balance.total_consumed || 0)
          }
        }

        fungible_assets.push({
          asset_code: balance.asset_code,
          display_name: materialInfo?.display_name || balance.asset_code,
          available_amount: Number(balance.available_amount),
          frozen_amount: Number(balance.frozen_amount),
          total_amount: Number(balance.available_amount) + Number(balance.frozen_amount),
          lottery_campaign_id: balance.lottery_campaign_id || null // 仅 BUDGET_POINTS 有值
        })
      }
    }

    // 3. 获取不可叠加物品统计（通过 account_id 关联查询）
    const sequelize = require('sequelize')
    const itemWhere = {
      status: { [Op.in]: ['available', 'locked'] }
    }
    if (account) {
      itemWhere.owner_account_id = account.account_id
    } else {
      itemWhere.owner_account_id = -1
    }

    const itemCounts = await Item.findAll({
      attributes: [
        'item_type',
        'status',
        [sequelize.fn('COUNT', sequelize.col('item_id')), 'count']
      ],
      where: itemWhere,
      group: ['item_type', 'status'],
      raw: true,
      transaction
    })

    // 整理物品统计
    const non_fungible_items = {
      total: 0,
      available_count: 0,
      locked_count: 0,
      by_type: {}
    }

    for (const item of itemCounts) {
      const count = Number(item.count)
      non_fungible_items.total_count += count

      if (item.status === 'available') {
        non_fungible_items.available_count += count
      } else if (item.status === 'locked') {
        non_fungible_items.locked_count += count
      }

      if (!non_fungible_items.by_type[item.item_type]) {
        non_fungible_items.by_type[item.item_type] = { available: 0, locked: 0 }
      }
      non_fungible_items.by_type[item.item_type][item.status] = count
    }

    // 4. 可选：获取物品详细列表（通过 account_id 关联查询）
    let items_list = null
    if (include_items && account) {
      items_list = await Item.findAll({
        where: {
          owner_account_id: account.account_id,
          status: { [Op.in]: ['available', 'locked'] }
        },
        order: [['created_at', 'DESC']],
        limit: 100,
        transaction
      })
    }

    logger.info('✅ 获取用户资产总览成功', {
      service: 'QueryService',
      method: 'getAssetPortfolio',
      user_id,
      points_available: points.available,
      fungible_count: fungible_assets.length,
      item_total: non_fungible_items.total
    })

    return {
      user_id,
      points,
      fungible_assets,
      non_fungible_items,
      items_list,
      retrieved_at: new Date().toISOString()
    }
  }

  /**
   * 获取资产余额数据（用于导出）
   *
   * 业务场景：后台运营导出资产报表
   *
   * @param {Object} params - 筛选参数
   * @param {string} [params.asset_type] - 资产类型筛选（如 POINTS, DIAMOND）
   * @param {string} [params.status] - 状态筛选（预留，暂不使用）
   * @param {number} [params.user_id] - 指定用户ID筛选
   * @param {number} [params.limit=1000] - 返回数据条数限制
   * @param {Object} [options] - 可选配置
   * @param {Object} [options.transaction] - Sequelize事务对象
   * @returns {Promise<Array>} 资产余额数据列表（含用户信息）
   *
   * @example
   * // 导出所有POINTS资产
   * const data = await QueryService.getBalancesForExport({ asset_type: 'POINTS', limit: 5000 })
   *
   * @since 2026
   */
  static async getBalancesForExport(params = {}, options = {}) {
    const { asset_type, user_id, limit = 1000 } = params
    const { transaction } = options

    // 构建查询条件
    const whereConditions = {}

    if (asset_type) {
      whereConditions.asset_code = asset_type
    }

    // 查询资产余额，关联账户和用户信息
    const balances = await AccountAssetBalance.findAll({
      where: whereConditions,
      include: [
        {
          model: Account,
          as: 'account',
          required: true,
          where: {
            account_type: 'user', // 只导出用户账户资产
            ...(user_id ? { user_id } : {})
          },
          include: [
            {
              model: User,
              as: 'user',
              attributes: ['user_id', 'nickname', 'mobile']
            }
          ]
        }
      ],
      order: [
        ['asset_code', 'ASC'],
        ['account_id', 'ASC']
      ],
      limit: Math.min(limit, 10000), // 硬上限10000条
      transaction
    })

    // 批量查询资产类型的 display_name（避免 N+1 查询）
    const assetCodes = [...new Set(balances.map(b => b.asset_code))]
    const materialTypes = await MaterialAssetType.findAll({
      where: { asset_code: { [Op.in]: assetCodes } },
      attributes: ['asset_code', 'display_name'],
      transaction
    })
    // 构建 asset_code -> display_name 映射
    const assetNameMap = new Map(materialTypes.map(t => [t.asset_code, t.display_name]))

    // 格式化返回数据
    return balances.map(balance => ({
      user_id: balance.account?.user?.user_id || balance.account?.user_id,
      nickname: balance.account?.user?.nickname || null,
      asset_code: balance.asset_code,
      asset_name: assetNameMap.get(balance.asset_code) || balance.asset_code, // 优先使用配置表的显示名称
      available_amount: balance.available_amount,
      frozen_amount: balance.frozen_amount,
      lottery_campaign_id: balance.lottery_campaign_id,
      updated_at: balance.updated_at
    }))
  }

  /**
   * 获取系统级资产统计（运营中心使用）
   *
   * @description 查询系统所有资产的统计数据，用于运营资产中心仪表盘
   *              从 account_asset_balances 表聚合统计各资产类型的流通量、持有用户数、冻结量
   *
   * @returns {Promise<Object>} 各资产类型的统计数据和汇总
   *
   * @since 2026
   */
  static async getSystemStats() {
    const { sequelize } = require('../../models')

    logger.info('📊 获取系统级资产统计', {
      service: 'QueryService',
      method: 'getSystemStats'
    })

    /*
     * 从 account_asset_balances 表聚合统计
     * 使用 CAST 转换为 DECIMAL 避免 BIGINT 溢出问题
     */
    const [stats] = await sequelize.query(`
      SELECT 
        asset_code,
        COUNT(DISTINCT account_id) as holder_count,
        CAST(SUM(available_amount) AS DECIMAL(30,4)) as total_circulation,
        CAST(SUM(frozen_amount) AS DECIMAL(30,4)) as total_frozen,
        CAST(SUM(available_amount) AS DECIMAL(30,4)) + CAST(SUM(frozen_amount) AS DECIMAL(30,4)) as total_issued
      FROM account_asset_balances
      WHERE available_amount > 0 OR frozen_amount > 0
      GROUP BY asset_code
      ORDER BY asset_code
    `)

    // 转换为前端需要的格式
    const assetStats = stats.map(stat => ({
      asset_code: stat.asset_code,
      holder_count: parseInt(stat.holder_count, 10) || 0,
      total_circulation: parseFloat(stat.total_circulation) || 0,
      total_frozen: parseFloat(stat.total_frozen) || 0,
      total_issued: parseFloat(stat.total_issued) || 0,
      destroyed: 0 // 暂无销毁数据
    }))

    // 汇总数据
    const summary = {
      total_asset_types: assetStats.length,
      total_holders: assetStats.reduce((sum, s) => sum + s.holder_count, 0),
      total_circulation: assetStats.reduce((sum, s) => sum + s.total_circulation, 0),
      total_frozen: assetStats.reduce((sum, s) => sum + s.total_frozen, 0)
    }

    return {
      asset_stats: assetStats,
      summary,
      retrieved_at: new Date().toISOString()
    }
  }

  /**
   * 获取用户今日资产变动汇总（基于北京时间）
   *
   * 从 asset_transactions 表聚合当天（北京时间 00:00:00 ~ 23:59:59）的收支数据
   *
   * @param {Object} params - 参数对象
   * @param {number} params.user_id - 用户ID（必填）
   * @param {string} [params.asset_code='POINTS'] - 资产代码（默认查询 POINTS）
   * @returns {Promise<Object>} 今日汇总 {today_earned, today_consumed, transaction_count}
   */
  static async getTodaySummary(params) {
    const { user_id, asset_code = 'POINTS' } = params

    if (!user_id) {
      throw new Error('getTodaySummary: user_id 参数必填')
    }

    const account = await Account.findOne({
      where: { user_id, account_type: 'user' },
      attributes: ['account_id']
    })

    if (!account) {
      return { today_earned: 0, today_consumed: 0, transaction_count: 0 }
    }

    const { sequelize } = require('../../models')
    const BeijingTimeHelper = require('../../utils/timeHelper')

    const todayStart = BeijingTimeHelper.todayStart()
    const todayEnd = BeijingTimeHelper.todayEnd()

    const [result] = await sequelize.query(
      `SELECT
         COALESCE(SUM(CASE WHEN delta_amount > 0 THEN delta_amount ELSE 0 END), 0) AS today_earned,
         COALESCE(SUM(CASE WHEN delta_amount < 0 THEN ABS(delta_amount) ELSE 0 END), 0) AS today_consumed,
         COUNT(*) AS transaction_count
       FROM asset_transactions
       WHERE account_id = :account_id
         AND asset_code = :asset_code
         AND created_at >= :today_start
         AND created_at < :today_end
         AND (is_test_data = 0 OR is_test_data IS NULL)`,
      {
        replacements: {
          account_id: account.account_id,
          asset_code,
          today_start: todayStart,
          today_end: todayEnd
        },
        type: sequelize.QueryTypes.SELECT
      }
    )

    return {
      today_earned: Number(result?.today_earned) || 0,
      today_consumed: Number(result?.today_consumed) || 0,
      transaction_count: Number(result?.transaction_count) || 0
    }
  }
}

module.exports = QueryService
