/**
 * 平台收入与手续费管理服务
 *
 * @description 聚合 SYSTEM_PLATFORM_FEE 账户的收入数据，提供统计和趋势分析
 * @module services/PlatformRevenueService
 *
 * 数据来源：
 * - asset_transactions 表中 account_id = SYSTEM_PLATFORM_FEE 的记录
 * - business_type: order_settle_platform_fee_credit（交易手续费）
 * - business_type: material_convert_fee（材料转换手续费）
 */

/** 业务类型中文映射（平台收入相关） */
const BUSINESS_TYPE_DISPLAY = {
  order_settle_platform_fee_credit: '交易手续费',
  material_convert_fee: '材料转换手续费',
  data_migration: '数据迁移',
  historical_reconciliation: '历史对账',
  opening_balance: '期初余额',
  lottery_consume: '抽奖消耗',
  lottery_reward: '抽奖奖励',
  market_purchase_buyer_debit: '市场购买（买家扣款）',
  market_purchase_seller_credit: '市场购买（卖家入账）',
  market_purchase_fee: '市场交易手续费',
  exchange_debit: '兑换扣减',
  material_convert_debit: '材料转换（扣减）',
  material_convert_credit: '材料转换（入账）',
  admin_adjust: '管理员调整',
  points_grant: '积分发放',
  budget_grant: '预算发放',
  market_listing_freeze: '挂牌冻结',
  market_listing_unfreeze: '挂牌解冻',
  bid_freeze: '竞价冻结',
  bid_unfreeze: '竞价解冻'
}

const models = require('../models')

/**
 * 平台收入与手续费管理服务
 */
class PlatformRevenueService {
  /** Creates a new PlatformRevenueService instance */
  constructor() {
    this.models = models
    this.sequelize = models.sequelize
    this._platformFeeAccountId = null
  }

  /**
   * 获取平台手续费账户 ID（缓存）
   * @private
   * @returns {Promise<number|null>} 平台手续费账户ID
   */
  async _getPlatformFeeAccountId() {
    if (this._platformFeeAccountId) return this._platformFeeAccountId
    // models 已在构造函数中初始化

    const [rows] = await this.sequelize.query(
      "SELECT account_id FROM accounts WHERE system_code = 'SYSTEM_PLATFORM_FEE' AND account_type = 'system' LIMIT 1"
    )
    this._platformFeeAccountId = rows.length > 0 ? rows[0].account_id : null
    return this._platformFeeAccountId
  }

  /**
   * 获取资产代码→中文名称映射（缓存）
   * @private
   * @returns {Promise<Map<string, string>>} asset_code → display_name
   */
  async _getAssetDisplayNames() {
    if (this._assetNameMap) return this._assetNameMap
    // models 已在构造函数中初始化

    const [rows] = await this.sequelize.query(
      'SELECT asset_code, display_name FROM material_asset_types'
    )
    this._assetNameMap = new Map(rows.map(r => [r.asset_code, r.display_name]))
    return this._assetNameMap
  }

  /**
   * 获取收入概览（当前余额 + 累计收入）
   *
   * @returns {Promise<Object>} 收入概览数据
   * @returns {Array} return.balances - 各币种当前余额
   * @returns {Array} return.total_income - 各币种累计收入列表
   */
  async getRevenueOverview() {
    // models 已在构造函数中初始化
    const accountId = await this._getPlatformFeeAccountId()
    if (!accountId) return { balances: [], total_income: [] }

    const nameMap = await this._getAssetDisplayNames()

    const [balances] = await this.sequelize.query(
      'SELECT asset_code, available_amount, frozen_amount FROM account_asset_balances WHERE account_id = ?',
      { replacements: [accountId] }
    )

    const [income] = await this.sequelize.query(
      `SELECT asset_code, SUM(delta_amount) as total_amount, COUNT(*) as tx_count
       FROM asset_transactions
       WHERE account_id = ? AND delta_amount > 0
       GROUP BY asset_code`,
      { replacements: [accountId] }
    )

    return {
      balances: balances.map(b => ({
        asset_code: b.asset_code,
        display_name: nameMap.get(b.asset_code) || b.asset_code,
        available_amount: Number(b.available_amount),
        frozen_amount: Number(b.frozen_amount)
      })),
      total_income: income.map(r => ({
        asset_code: r.asset_code,
        display_name: nameMap.get(r.asset_code) || r.asset_code,
        total_amount: Number(r.total_amount),
        tx_count: Number(r.tx_count)
      }))
    }
  }

  /**
   * 获取收入来源分类统计
   *
   * @param {Object} [filters] - 筛选条件
   * @param {string} [filters.asset_code] - 按币种筛选
   * @param {number} [filters.days=30] - 统计天数
   * @returns {Promise<Array>} 按 business_type 分组的收入统计
   */
  async getRevenueBySource(filters = {}) {
    // models 已在构造函数中初始化
    const accountId = await this._getPlatformFeeAccountId()
    if (!accountId) return []

    const nameMap = await this._getAssetDisplayNames()
    const { asset_code, days = 30 } = filters
    const startDate = new Date()
    startDate.setDate(startDate.getDate() - days)

    let sql = `SELECT business_type, asset_code, SUM(delta_amount) as total_amount, COUNT(*) as tx_count
       FROM asset_transactions
       WHERE account_id = ? AND delta_amount > 0 AND created_at >= ?`
    const replacements = [accountId, startDate]

    if (asset_code) {
      sql += ' AND asset_code = ?'
      replacements.push(asset_code)
    }

    sql += ' GROUP BY business_type, asset_code ORDER BY total_amount DESC'

    const [rows] = await this.sequelize.query(sql, { replacements })

    return rows.map(r => ({
      business_type: r.business_type,
      business_type_display: BUSINESS_TYPE_DISPLAY[r.business_type] || r.business_type,
      asset_code: r.asset_code,
      asset_display_name: nameMap.get(r.asset_code) || r.asset_code,
      total_amount: Number(r.total_amount),
      tx_count: Number(r.tx_count)
    }))
  }

  /**
   * 获取收入趋势数据（按日/周/月）
   *
   * @param {Object} [filters] - 筛选条件
   * @param {string} [filters.granularity='daily'] - 粒度：daily/weekly/monthly
   * @param {string} [filters.asset_code] - 按币种筛选
   * @param {number} [filters.days=30] - 统计天数
   * @returns {Promise<Array>} 趋势数据 [{period, total_amount, tx_count}]
   */
  async getRevenueTrend(filters = {}) {
    // models 已在构造函数中初始化
    const accountId = await this._getPlatformFeeAccountId()
    if (!accountId) return []

    const { granularity = 'daily', asset_code, days = 30 } = filters
    const startDate = new Date()
    startDate.setDate(startDate.getDate() - days)

    // 按粒度选择日期格式化
    let dateFormat
    if (granularity === 'monthly') {
      dateFormat = '%Y-%m'
    } else if (granularity === 'weekly') {
      dateFormat = '%x-W%v'
    } else {
      dateFormat = '%Y-%m-%d'
    }

    let sql = `SELECT DATE_FORMAT(created_at, '${dateFormat}') as period,
       asset_code, SUM(delta_amount) as total_amount, COUNT(*) as tx_count
       FROM asset_transactions
       WHERE account_id = ? AND delta_amount > 0 AND created_at >= ?`
    const replacements = [accountId, startDate]

    if (asset_code) {
      sql += ' AND asset_code = ?'
      replacements.push(asset_code)
    }

    sql += ` GROUP BY period, asset_code ORDER BY period ASC`

    const nameMap = await this._getAssetDisplayNames()
    const [rows] = await this.sequelize.query(sql, { replacements })

    return rows.map(r => ({
      period: r.period,
      asset_code: r.asset_code,
      asset_display_name: nameMap.get(r.asset_code) || r.asset_code,
      total_amount: Number(r.total_amount),
      tx_count: Number(r.tx_count)
    }))
  }

  /**
   * 获取手续费率配置和实际收费统计
   *
   * @returns {Promise<Object>} 手续费配置和统计
   */
  async getFeeRateStats() {
    // models 已在构造函数中初始化
    const accountId = await this._getPlatformFeeAccountId()

    // 从 system_settings 读取当前费率配置
    const [feeConfigs] = await this.sequelize.query(
      "SELECT setting_key, setting_value FROM system_settings WHERE setting_key LIKE 'marketplace/fee_rate_%'"
    )

    // 近30天实际手续费收入
    const thirtyDaysAgo = new Date()
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

    let feeStats = []
    if (accountId) {
      const [rows] = await this.sequelize.query(
        `SELECT asset_code, SUM(delta_amount) as fee_total, COUNT(*) as fee_count, AVG(delta_amount) as avg_fee
         FROM asset_transactions
         WHERE account_id = ? AND business_type = 'order_settle_platform_fee_credit' AND created_at >= ?
         GROUP BY asset_code`,
        { replacements: [accountId, thirtyDaysAgo] }
      )
      feeStats = rows
    }

    const nameMap = await this._getAssetDisplayNames()

    return {
      fee_rate_configs: feeConfigs.map(r => ({
        asset_code: r.setting_key.replace('marketplace/fee_rate_', ''),
        display_name:
          nameMap.get(r.setting_key.replace('marketplace/fee_rate_', '')) ||
          r.setting_key.replace('marketplace/fee_rate_', ''),
        fee_rate: parseFloat(r.setting_value)
      })),
      fee_stats_30d: feeStats.map(r => ({
        asset_code: r.asset_code,
        display_name: nameMap.get(r.asset_code) || r.asset_code,
        fee_total: Number(r.fee_total),
        fee_count: Number(r.fee_count),
        avg_fee: Number(parseFloat(r.avg_fee).toFixed(2))
      }))
    }
  }
}

module.exports = PlatformRevenueService
