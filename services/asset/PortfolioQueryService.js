'use strict'

/**
 * 资产组合查询服务
 *
 * @description 提供资产组合分析的只读查询功能
 *
 * 遵循架构规范：读写分层策略 Phase 3
 * 热点分析查询启用缓存
 *
 * 涵盖查询：
 * - 用户资产组合概览
 * - 资产分布分析
 * - 资产变动趋势
 * - 资产价值评估
 *
 * @module services/asset/PortfolioQueryService
 * @version 1.0.0
 * @date 2026-02-01
 */

const { Op, fn, col } = require('sequelize')
const logger = require('../../utils/logger').logger
const { BusinessCacheHelper } = require('../../utils/BusinessCacheHelper')

/**
 * 缓存配置
 * @constant
 */
const CACHE_CONFIG = {
  /** 资产组合概览缓存 TTL (60秒) */
  PORTFOLIO_OVERVIEW: 60,
  /** 资产分布缓存 TTL (120秒) */
  ASSET_DISTRIBUTION: 120
}

/**
 * 资产组合查询服务类
 * 提供资产组合分析的只读查询功能
 *
 * @class AssetPortfolioQueryService
 */
class AssetPortfolioQueryService {
  /**
   * 获取用户资产组合概览
   *
   * @param {number} user_id - 用户ID
   * @returns {Promise<Object>} 资产组合概览
   */
  static async getUserPortfolioOverview(user_id) {
    const cacheKey = `asset:portfolio:${user_id}`

    // 尝试从缓存获取
    const cached = await BusinessCacheHelper.get(cacheKey)
    if (cached) {
      logger.debug('用户资产组合概览命中缓存', { user_id, cacheKey })
      return cached
    }

    const { Account, AccountAssetBalance, ItemInstance } = require('../../models')

    // 获取用户账户
    const account = await Account.findOne({
      where: {
        user_id: parseInt(user_id),
        account_type: 'user',
        status: 'active'
      }
    })

    if (!account) {
      return {
        user_id: parseInt(user_id),
        has_account: false,
        balances: [],
        items: [],
        summary: {
          total_asset_types: 0,
          total_items: 0
        }
      }
    }

    // 并行获取资产余额和物品
    const [balances, items] = await Promise.all([
      // 获取资产余额
      AccountAssetBalance.findAll({
        where: {
          account_id: account.account_id,
          balance: { [Op.gt]: 0 }
        },
        order: [['balance', 'DESC']]
      }),
      // 获取物品实例
      ItemInstance.findAll({
        where: {
          owner_user_id: parseInt(user_id),
          status: 'available'
        },
        order: [['created_at', 'DESC']],
        limit: 100
      })
    ])

    const result = {
      user_id: parseInt(user_id),
      has_account: true,
      account_id: account.account_id,
      balances: balances.map(b => ({
        asset_code: b.asset_code,
        balance: parseFloat(b.balance),
        frozen_balance: parseFloat(b.frozen_balance || 0)
      })),
      items: items.map(i => ({
        item_instance_id: i.item_instance_id,
        item_type: i.item_type,
        status: i.status,
        created_at: i.created_at
      })),
      summary: {
        total_asset_types: balances.length,
        total_items: items.length
      }
    }

    // 写入缓存
    await BusinessCacheHelper.set(cacheKey, result, CACHE_CONFIG.PORTFOLIO_OVERVIEW)

    return result
  }

  /**
   * 获取资产分布分析
   * 热点查询 - 启用缓存
   *
   * @param {Object} options - 查询选项
   * @param {string} [options.asset_code] - 资产代码
   * @returns {Promise<Object>} 资产分布分析
   */
  static async getAssetDistributionAnalysis(options = {}) {
    const { asset_code } = options
    const cacheKey = `asset:distribution:${asset_code || 'all'}`

    const cached = await BusinessCacheHelper.get(cacheKey)
    if (cached) {
      logger.debug('资产分布分析命中缓存', { cacheKey })
      return cached
    }

    const { AccountAssetBalance } = require('../../models')

    // 构建查询条件
    const where = { balance: { [Op.gt]: 0 } }
    if (asset_code) where.asset_code = asset_code

    // 按资产代码分组统计
    const distribution = await AccountAssetBalance.findAll({
      attributes: [
        'asset_code',
        [fn('COUNT', col('balance_id')), 'holder_count'],
        [fn('SUM', col('balance')), 'total_balance'],
        [fn('AVG', col('balance')), 'avg_balance'],
        [fn('MAX', col('balance')), 'max_balance'],
        [fn('MIN', col('balance')), 'min_balance']
      ],
      where,
      group: ['asset_code'],
      order: [[fn('SUM', col('balance')), 'DESC']],
      raw: true
    })

    const result = {
      asset_code: asset_code || 'all',
      assets: distribution.map(item => ({
        asset_code: item.asset_code,
        holder_count: parseInt(item.holder_count) || 0,
        total_balance: parseFloat(item.total_balance) || 0,
        avg_balance: parseFloat(item.avg_balance) || 0,
        max_balance: parseFloat(item.max_balance) || 0,
        min_balance: parseFloat(item.min_balance) || 0
      })),
      summary: {
        total_asset_types: distribution.length,
        total_holders: distribution.reduce((sum, item) => sum + parseInt(item.holder_count), 0)
      }
    }

    // 写入缓存
    await BusinessCacheHelper.set(cacheKey, result, CACHE_CONFIG.ASSET_DISTRIBUTION)

    return result
  }

  /**
   * 获取资产变动历史
   *
   * @param {number} user_id - 用户ID
   * @param {Object} options - 查询选项
   * @param {string} [options.asset_code] - 资产代码
   * @param {string} [options.start_date] - 开始日期
   * @param {string} [options.end_date] - 结束日期
   * @param {number} [options.page=1] - 页码
   * @param {number} [options.page_size=20] - 每页数量
   * @returns {Promise<Object>} 资产变动历史
   */
  static async getAssetTransactionHistory(user_id, options = {}) {
    const { AssetTransaction, Account } = require('../../models')

    const { asset_code, start_date, end_date, page = 1, page_size = 20 } = options

    // 获取用户账户
    const account = await Account.findOne({
      where: {
        user_id: parseInt(user_id),
        account_type: 'user',
        status: 'active'
      }
    })

    if (!account) {
      return {
        user_id: parseInt(user_id),
        transactions: [],
        pagination: { total: 0, page: 1, page_size: 20, total_pages: 0 }
      }
    }

    // 构建查询条件
    const where = { account_id: account.account_id }
    if (asset_code) where.asset_code = asset_code
    if (start_date || end_date) {
      where.created_at = {}
      if (start_date) where.created_at[Op.gte] = new Date(start_date)
      if (end_date) where.created_at[Op.lte] = new Date(end_date + ' 23:59:59')
    }

    // 分页参数
    const pageNum = Math.max(1, parseInt(page))
    const pageSizeNum = Math.min(100, Math.max(1, parseInt(page_size)))
    const offset = (pageNum - 1) * pageSizeNum

    const { count, rows } = await AssetTransaction.findAndCountAll({
      where,
      order: [['created_at', 'DESC']],
      limit: pageSizeNum,
      offset
    })

    return {
      user_id: parseInt(user_id),
      transactions: rows,
      pagination: {
        total: count,
        page: pageNum,
        page_size: pageSizeNum,
        total_pages: Math.ceil(count / pageSizeNum)
      }
    }
  }

  /**
   * 获取物品持有分析
   *
   * @param {number} user_id - 用户ID
   * @returns {Promise<Object>} 物品持有分析
   */
  static async getItemHoldingAnalysis(user_id) {
    const { ItemInstance } = require('../../models')

    // 按物品类型分组统计
    const [typeStats, statusStats, totalItems] = await Promise.all([
      // 按类型统计
      ItemInstance.findAll({
        attributes: ['item_type', [fn('COUNT', col('item_instance_id')), 'count']],
        where: { owner_user_id: parseInt(user_id) },
        group: ['item_type'],
        raw: true
      }),
      // 按状态统计
      ItemInstance.findAll({
        attributes: ['status', [fn('COUNT', col('item_instance_id')), 'count']],
        where: { owner_user_id: parseInt(user_id) },
        group: ['status'],
        raw: true
      }),
      // 总物品数
      ItemInstance.count({
        where: { owner_user_id: parseInt(user_id) }
      })
    ])

    return {
      user_id: parseInt(user_id),
      total_items: totalItems,
      by_type: typeStats.reduce((acc, item) => {
        acc[item.item_type] = parseInt(item.count)
        return acc
      }, {}),
      by_status: statusStats.reduce((acc, item) => {
        acc[item.status] = parseInt(item.count)
        return acc
      }, {})
    }
  }
}

module.exports = AssetPortfolioQueryService
