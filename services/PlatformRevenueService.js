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

/**
 * 平台收入与手续费管理服务
 */
class PlatformRevenueService {
  /** Creates a new PlatformRevenueService instance */
  constructor() {
    this.models = null
    this.sequelize = null
    this._platformFeeAccountId = null
  }

  /**
   * @private 延迟初始化
   * @returns {void}
   */
  _ensureModels() {
    if (!this.models) {
      this.models = require('../models')
      this.sequelize = this.models.sequelize
    }
  }

  /**
   * 获取平台手续费账户 ID（缓存）
   * @private
   * @returns {Promise<number|null>} 平台手续费账户ID
   */
  async _getPlatformFeeAccountId() {
    if (this._platformFeeAccountId) return this._platformFeeAccountId
    this._ensureModels()

    const [rows] = await this.sequelize.query(
      "SELECT account_id FROM accounts WHERE system_code = 'SYSTEM_PLATFORM_FEE' AND account_type = 'system' LIMIT 1"
    )
    this._platformFeeAccountId = rows.length > 0 ? rows[0].account_id : null
    return this._platformFeeAccountId
  }

  /**
   * 获取收入概览（当前余额 + 累计收入）
   *
   * @returns {Promise<Object>} 收入概览数据
   */
  async getRevenueOverview() {
    this._ensureModels()
    const accountId = await this._getPlatformFeeAccountId()
    if (!accountId) return { balances: [], total_income: {} }

    // 当前各币种余额
    const [balances] = await this.sequelize.query(
      'SELECT asset_code, available_amount, frozen_amount FROM account_asset_balances WHERE account_id = ?',
      { replacements: [accountId] }
    )

    // 累计收入（按币种汇总所有入账流水）
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
        available_amount: Number(b.available_amount),
        frozen_amount: Number(b.frozen_amount)
      })),
      total_income: income.reduce((acc, r) => {
        acc[r.asset_code] = { total_amount: Number(r.total_amount), tx_count: Number(r.tx_count) }
        return acc
      }, {})
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
    this._ensureModels()
    const accountId = await this._getPlatformFeeAccountId()
    if (!accountId) return []

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
      asset_code: r.asset_code,
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
    this._ensureModels()
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

    const [rows] = await this.sequelize.query(sql, { replacements })

    return rows.map(r => ({
      period: r.period,
      asset_code: r.asset_code,
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
    this._ensureModels()
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

    return {
      fee_rate_configs: feeConfigs.reduce((acc, r) => {
        const code = r.setting_key.replace('marketplace/fee_rate_', '')
        acc[code] = parseFloat(r.setting_value)
        return acc
      }, {}),
      fee_stats_30d: feeStats.map(r => ({
        asset_code: r.asset_code,
        fee_total: Number(r.fee_total),
        fee_count: Number(r.fee_count),
        avg_fee: Number(parseFloat(r.avg_fee).toFixed(2))
      }))
    }
  }
}

module.exports = PlatformRevenueService
