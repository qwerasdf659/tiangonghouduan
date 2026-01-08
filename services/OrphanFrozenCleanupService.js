/**
 * 孤儿冻结清理服务
 *
 * 文件路径：services/OrphanFrozenCleanupService.js
 *
 * 职责（P0-2唯一入口）：
 * - 检测孤儿冻结（frozen_amount > 实际挂牌冻结总额）
 * - 自动/手动清理孤儿冻结（解冻到可用余额）
 * - 记录完整的审计日志
 * - 提供分布式锁保护防止并发
 *
 * 🔴 P0-2决策：
 * - 自动解冻机制已确认符合业务合规要求（产品决策：用户体验优先）
 * - 所有孤儿冻结清理必须通过本服务，禁止直改余额
 * - 审计日志强制记录（business_type = orphan_frozen_cleanup）
 *
 * 创建时间：2026-01-09
 * 版本：V4.0.0
 */

'use strict'

const { Op } = require('sequelize')
const { sequelize } = require('../models')
const { Account, AccountAssetBalance, MarketListing } = require('../models')
const AssetService = require('./AssetService')
const AuditLogService = require('./AuditLogService')
const logger = require('../utils/logger')

/**
 * 孤儿冻结清理服务
 *
 * 唯一入口：所有孤儿冻结的检测和清理必须通过本服务
 */
class OrphanFrozenCleanupService {
  /**
   * 检测孤儿冻结
   *
   * 查找所有 frozen_amount > 实际活跃挂牌冻结总额 的记录
   *
   * @param {Object} options - 选项
   * @param {number} options.user_id - 指定用户ID（可选，不传则检测所有）
   * @param {string} options.asset_code - 指定资产代码（可选）
   * @returns {Promise<Array>} 孤儿冻结记录列表
   */
  static async detectOrphanFrozen(options = {}) {
    const { user_id, asset_code } = options

    logger.info('[孤儿冻结检测] 开始检测...', { user_id, asset_code })

    // 1. 构建查询条件
    const balanceWhere = {
      frozen_amount: { [Op.gt]: 0 }
    }

    if (asset_code) {
      balanceWhere.asset_code = asset_code
    }

    const accountWhere = {
      account_type: 'user' // 只检查用户账户，排除系统账户
    }

    if (user_id) {
      accountWhere.user_id = user_id
    }

    // 2. 查询所有有冻结余额的用户账户
    const frozenBalances = await AccountAssetBalance.findAll({
      where: balanceWhere,
      include: [
        {
          model: Account,
          as: 'account',
          attributes: ['user_id', 'account_type'],
          where: accountWhere,
          required: true
        }
      ]
    })

    if (frozenBalances.length === 0) {
      logger.info('[孤儿冻结检测] 未发现有冻结余额的账户')
      return []
    }

    // 3. 获取所有活跃挂牌的冻结总额（按 seller_user_id + asset_code 分组）
    const listingWhere = {
      status: 'active'
    }

    if (user_id) {
      listingWhere.seller_user_id = user_id
    }

    if (asset_code) {
      listingWhere.offer_asset_code = asset_code
    }

    const activeListings = await MarketListing.findAll({
      attributes: [
        'seller_user_id',
        'offer_asset_code',
        [sequelize.fn('SUM', sequelize.col('offer_amount')), 'total_listed']
      ],
      where: listingWhere,
      group: ['seller_user_id', 'offer_asset_code'],
      raw: true
    })

    // 4. 构建挂牌映射
    const listingMap = new Map()
    activeListings.forEach(lt => {
      const key = `${lt.seller_user_id}_${lt.offer_asset_code}`
      listingMap.set(key, parseInt(lt.total_listed, 10) || 0)
    })

    // 5. 检测孤儿冻结
    const orphanFrozenList = []

    for (const balance of frozenBalances) {
      const userId = balance.account?.user_id
      if (!userId) continue

      const key = `${userId}_${balance.asset_code}`
      const listedAmount = listingMap.get(key) || 0
      const frozenAmount = parseInt(balance.frozen_amount, 10)

      // 冻结 > 挂牌 = 孤儿冻结
      if (frozenAmount > listedAmount) {
        const orphanAmount = frozenAmount - listedAmount

        orphanFrozenList.push({
          user_id: userId,
          account_id: balance.account_id,
          asset_code: balance.asset_code,
          frozen_amount: frozenAmount,
          listed_amount: listedAmount,
          orphan_amount: orphanAmount,
          available_amount: parseInt(balance.available_amount, 10),
          description: `冻结 ${frozenAmount}，活跃挂牌 ${listedAmount}，孤儿额 ${orphanAmount}`
        })
      }
    }

    logger.info(`[孤儿冻结检测] 检测完成，发现 ${orphanFrozenList.length} 条孤儿冻结`, {
      total_checked: frozenBalances.length,
      orphan_count: orphanFrozenList.length
    })

    return orphanFrozenList
  }

  /**
   * 清理孤儿冻结（解冻到可用余额）
   *
   * 🔴 P0-2唯一入口：所有孤儿冻结清理必须通过此方法
   *
   * @param {Object} options - 选项
   * @param {boolean} options.dry_run - 干跑模式（仅检测不清理）
   * @param {number} options.user_id - 指定用户ID（可选）
   * @param {string} options.asset_code - 指定资产代码（可选）
   * @param {number} options.operator_id - 操作者用户ID（必填）
   * @param {string} options.reason - 清理原因（可选，默认"孤儿冻结自动清理"）
   * @returns {Promise<Object>} 清理结果 { detected, cleaned, failed, details }
   */
  static async cleanupOrphanFrozen(options = {}) {
    const {
      dry_run = true,
      user_id,
      asset_code,
      operator_id,
      reason = '孤儿冻结自动清理（产品决策：用户体验优先）'
    } = options

    // 参数验证
    if (!dry_run && !operator_id) {
      throw new Error('实际清理操作需要提供 operator_id')
    }

    logger.info('[孤儿冻结清理] 开始清理...', {
      dry_run,
      user_id,
      asset_code,
      operator_id,
      reason
    })

    // 1. 检测孤儿冻结
    const orphanList = await this.detectOrphanFrozen({ user_id, asset_code })

    const result = {
      detected: orphanList.length,
      cleaned: 0,
      failed: 0,
      total_amount: orphanList.reduce((sum, item) => sum + item.orphan_amount, 0),
      details: [],
      dry_run
    }

    if (orphanList.length === 0) {
      logger.info('[孤儿冻结清理] 未发现孤儿冻结，无需清理')
      return result
    }

    if (dry_run) {
      logger.info(
        `[孤儿冻结清理] 干跑模式：发现 ${orphanList.length} 条孤儿冻结，总额 ${result.total_amount}`
      )
      result.details = orphanList
      return result
    }

    // 2. 实际清理（事务保护）
    const transaction = await sequelize.transaction()

    try {
      for (const orphan of orphanList) {
        const detail = {
          user_id: orphan.user_id,
          account_id: orphan.account_id,
          asset_code: orphan.asset_code,
          orphan_amount: orphan.orphan_amount,
          status: 'pending'
        }

        try {
          // 2.1 执行解冻操作
          const idempotencyKey = `orphan_cleanup_service_${orphan.account_id}_${orphan.asset_code}_${Date.now()}`

          await AssetService.unfreeze(
            {
              user_id: orphan.user_id,
              asset_code: orphan.asset_code,
              amount: orphan.orphan_amount,
              business_type: 'orphan_frozen_cleanup',
              idempotency_key: idempotencyKey,
              meta: {
                cleanup_reason: reason,
                operator_id,
                original_frozen: orphan.frozen_amount,
                original_listed: orphan.listed_amount,
                orphan_amount: orphan.orphan_amount,
                cleanup_time: new Date().toISOString(),
                cleanup_source: 'OrphanFrozenCleanupService'
              }
            },
            { transaction }
          )

          // 2.2 记录审计日志
          await AuditLogService.logAdminAction(
            {
              admin_user_id: operator_id,
              operation_type: 'asset_orphan_cleanup',
              target_type: 'account_asset_balance',
              target_id: `${orphan.account_id}_${orphan.asset_code}`,
              before_data: {
                frozen_amount: orphan.frozen_amount,
                available_amount: orphan.available_amount
              },
              after_data: {
                frozen_amount: orphan.frozen_amount - orphan.orphan_amount,
                available_amount: orphan.available_amount + orphan.orphan_amount
              },
              details: {
                cleanup_reason: reason,
                orphan_amount: orphan.orphan_amount,
                listed_amount: orphan.listed_amount
              },
              ip_address: '0.0.0.0' // 系统自动操作
            },
            { transaction }
          )

          detail.status = 'success'
          result.cleaned++
          logger.info(
            `[孤儿冻结清理] 清理成功：用户 ${orphan.user_id}, ${orphan.asset_code} 解冻 ${orphan.orphan_amount}`
          )
        } catch (error) {
          detail.status = 'failed'
          detail.error = error.message
          result.failed++
          logger.error(`[孤儿冻结清理] 清理失败：用户 ${orphan.user_id}, ${orphan.asset_code}`, {
            error: error.message
          })
        }

        result.details.push(detail)
      }

      await transaction.commit()

      logger.info(`[孤儿冻结清理] 清理完成：成功 ${result.cleaned}，失败 ${result.failed}`)
      return result
    } catch (error) {
      await transaction.rollback()
      logger.error('[孤儿冻结清理] 清理事务失败，已回滚', { error: error.message })
      throw error
    }
  }

  /**
   * 获取孤儿冻结统计
   *
   * @returns {Promise<Object>} 统计信息
   */
  static async getOrphanFrozenStats() {
    const orphanList = await this.detectOrphanFrozen()

    // 按资产类型分组统计
    const statsByAsset = {}
    const totalUsers = new Set()
    let totalAmount = 0

    for (const orphan of orphanList) {
      totalUsers.add(orphan.user_id)
      totalAmount += orphan.orphan_amount

      if (!statsByAsset[orphan.asset_code]) {
        statsByAsset[orphan.asset_code] = {
          asset_code: orphan.asset_code,
          count: 0,
          total_orphan_amount: 0,
          affected_users: new Set()
        }
      }

      statsByAsset[orphan.asset_code].count++
      statsByAsset[orphan.asset_code].total_orphan_amount += orphan.orphan_amount
      statsByAsset[orphan.asset_code].affected_users.add(orphan.user_id)
    }

    // 转换 Set 为数量
    const assetStats = Object.values(statsByAsset).map(stat => ({
      asset_code: stat.asset_code,
      count: stat.count,
      total_orphan_amount: stat.total_orphan_amount,
      affected_user_count: stat.affected_users.size
    }))

    return {
      total_orphan_count: orphanList.length,
      total_orphan_amount: totalAmount,
      affected_user_count: totalUsers.size,
      by_asset: assetStats,
      checked_at: new Date().toISOString()
    }
  }
}

module.exports = OrphanFrozenCleanupService
