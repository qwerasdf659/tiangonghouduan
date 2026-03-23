/**
 * 孤儿冻结清理服务
 *
 * 文件路径：services/OrphanFrozenCleanupService.js
 *
 * 职责（P0-2唯一入口）：
 * - 检测卖家孤儿冻结（frozen_amount > 实际挂牌冻结总额）
 * - 检测买家孤儿冻结（frozen_amount > 活跃订单冻结总额）
 * - 自动/手动清理孤儿冻结（解冻到可用余额）
 * - 记录完整的审计日志
 * - 提供分布式锁保护防止并发
 *
 * 🔴 P0-2决策：
 * - 自动解冻机制已确认符合业务合规要求（产品决策：用户体验优先）
 * - 所有孤儿冻结清理必须通过本服务，禁止直改余额
 * - 审计日志强制记录（business_type = orphan_frozen_cleanup）
 *
 * 🔴 2026-01-30 修复：
 * - 新增买家孤儿冻结检测（detectBuyerOrphanFrozen）
 * - 综合检测方法（detectAllOrphanFrozen）同时检测卖家和买家
 * - 根因：cleanup_historical_data.js 删除数据时未解冻买家资产
 *
 * 版本：V4.1.0
 */

'use strict'

const { Op } = require('sequelize')
const { sequelize } = require('../models')
const { Account, AccountAssetBalance, MarketListing, TradeOrder } = require('../models')
// V4.7.0 AssetService 拆分：使用子服务替代原 AssetService
const BalanceService = require('./asset/BalanceService')
const AuditLogService = require('./AuditLogService')
const logger = require('../utils/logger')
const UnifiedDistributedLock = require('../utils/UnifiedDistributedLock')

// 分布式锁实例（防止多实例并发执行）
const distributedLock = new UnifiedDistributedLock()

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
   * 🔴 P0 决策：返回稳定 DTO 对象而非数组
   * - Service 为权威契约，Job 适配 Service
   * - DTO 包含检测结果汇总和明细列表
   *
   * @param {Object} options - 选项
   * @param {number} options.user_id - 指定用户ID（可选，不传则检测所有）
   * @param {string} options.asset_code - 指定资产代码（可选）
   * @param {number} options.limit - 最大返回条数（默认 1000）
   * @returns {Promise<OrphanFrozenDetectDTO>} 稳定 DTO 对象
   *
   * @typedef {Object} OrphanFrozenDetectDTO
   * @property {number} orphan_count - 孤儿冻结明细条数
   * @property {number} total_orphan_amount - 孤儿冻结总额
   * @property {Array<OrphanItem>} orphan_items - 孤儿冻结明细列表
   * @property {number} checked_count - 本次检测的账户数
   * @property {string} generated_at - DTO 生成时间（ISO8601 北京时间）
   * @property {number} affected_user_count - 受影响用户数
   * @property {Array<string>} affected_asset_codes - 受影响资产代码列表
   * @property {boolean} items_truncated - 明细是否被截断
   *
   * @typedef {Object} OrphanItem
   * @property {number} user_id - 用户 ID
   * @property {number} account_id - 账户 ID
   * @property {string} asset_code - 资产代码
   * @property {number} frozen_amount - 当前冻结金额
   * @property {number} listed_amount - 活跃挂牌金额
   * @property {number} orphan_amount - 孤儿金额（= frozen - listed）
   * @property {number} available_amount - 可用余额
   * @property {string} description - 描述信息
   */
  static async detectOrphanFrozen(options = {}) {
    const { user_id, asset_code, limit = 1000 } = options
    const startTime = Date.now()

    logger.info('[孤儿冻结检测] 开始检测...', { user_id, asset_code, limit })

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

    // 空结果返回空 DTO
    if (frozenBalances.length === 0) {
      logger.info('[孤儿冻结检测] 未发现有冻结余额的账户')
      return {
        orphan_count: 0,
        total_orphan_amount: 0,
        orphan_items: [],
        checked_count: 0,
        generated_at: new Date().toISOString(),
        affected_user_count: 0,
        affected_asset_codes: [],
        items_truncated: false,
        _meta: {
          query_options: { user_id, asset_code, limit },
          execution_time_ms: Date.now() - startTime
        }
      }
    }

    /*
     * 3. 获取所有活跃挂牌的冻结总额（按 seller_user_id + asset_code 分组）
     * 🔴 P0-2修复：MarketListing 状态枚举为 on_sale/locked/sold/withdrawn/admin_withdrawn
     * 只有 on_sale 状态的挂牌才有冻结（locked 状态已经有买家锁定）
     */
    const listingWhere = {
      status: 'on_sale'
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
    const affectedUserIds = new Set()
    const affectedAssetCodes = new Set()

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

        // 记录受影响的用户和资产
        affectedUserIds.add(userId)
        affectedAssetCodes.add(balance.asset_code)
      }
    }

    // 6. 构建稳定 DTO 对象（P0 决策）
    const dto = {
      // 必填字段
      orphan_count: orphanFrozenList.length,
      total_orphan_amount: orphanFrozenList.reduce((sum, item) => sum + item.orphan_amount, 0),
      orphan_items: orphanFrozenList.slice(0, limit),
      checked_count: frozenBalances.length,
      generated_at: new Date().toISOString(),

      // 新增字段（风控/告警重要）
      affected_user_count: affectedUserIds.size,
      affected_asset_codes: Array.from(affectedAssetCodes),
      items_truncated: orphanFrozenList.length > limit,

      // 元数据
      _meta: {
        query_options: { user_id, asset_code, limit },
        execution_time_ms: Date.now() - startTime
      }
    }

    logger.info(`[孤儿冻结检测] 检测完成，发现 ${dto.orphan_count} 条孤儿冻结`, {
      orphan_count: dto.orphan_count,
      total_orphan_amount: dto.total_orphan_amount,
      affected_user_count: dto.affected_user_count,
      affected_asset_codes: dto.affected_asset_codes,
      items_truncated: dto.items_truncated,
      checked_count: dto.checked_count
    })

    return dto
  }

  /**
   * 清理孤儿冻结（解冻到可用余额）
   *
   * 🔴 P0-2唯一入口：所有孤儿冻结清理必须通过此方法
   * 🔴 P0-2分布式锁：使用 Redis 分布式锁防止多实例并发执行
   * 🔴 P0 决策：统一返回契约字段
   *
   * @param {Object} options - 选项
   * @param {boolean} options.dry_run - 干跑模式（仅检测不清理，默认 true）
   * @param {number} options.user_id - 指定用户ID（可选）
   * @param {string} options.asset_code - 指定资产代码（可选）
   * @param {number} options.operator_id - 操作者用户ID（非 dry_run 时必填）
   * @param {string} options.reason - 清理原因（可选，默认"孤儿冻结清理"）
   * @param {number} options.limit - 最大清理条数（默认 100）
   * @returns {Promise<OrphanFrozenCleanupDTO>} 清理结果 DTO
   *
   * @typedef {Object} OrphanFrozenCleanupDTO
   * @property {number} cleaned_count - 成功清理条数
   * @property {number} failed_count - 清理失败条数
   * @property {number} total_unfrozen_amount - 总解冻金额
   * @property {number} detected_count - 检测到的孤儿冻结总数
   * @property {Array} details - 清理明细
   * @property {boolean} dry_run - 是否为演练模式
   */
  static async cleanupOrphanFrozen(options = {}) {
    const {
      dry_run = true,
      user_id,
      asset_code,
      operator_id,
      reason = '孤儿冻结清理',
      limit = 100
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
      reason,
      limit
    })

    // 🔴 P0-2：使用分布式锁防止并发执行
    const lockKey = 'orphan_frozen_cleanup'
    const lockTTL = 600000 // 10分钟超时，防止清理过程中锁过期

    try {
      return await distributedLock.withLock(
        lockKey,
        async () => {
          logger.info('[孤儿冻结清理] 成功获取分布式锁，开始执行清理')

          // 1. 检测孤儿冻结（返回 DTO）
          const detectDto = await this.detectOrphanFrozen({ user_id, asset_code, limit })

          // 2. 构建统一返回契约（P0 决策）
          const result = {
            cleaned_count: 0,
            failed_count: 0,
            total_unfrozen_amount: 0,
            detected_count: detectDto.orphan_count,
            details: [],
            dry_run
          }

          if (detectDto.orphan_count === 0) {
            logger.info('[孤儿冻结清理] 未发现孤儿冻结，无需清理')
            return result
          }

          if (dry_run) {
            logger.info(
              `[孤儿冻结清理] 干跑模式：发现 ${detectDto.orphan_count} 条孤儿冻结，总额 ${detectDto.total_orphan_amount}`
            )
            result.details = detectDto.orphan_items
            result.total_unfrozen_amount = detectDto.total_orphan_amount
            return result
          }

          // 3. 实际清理（事务保护）
          const transaction = await sequelize.transaction()

          try {
            for (const orphan of detectDto.orphan_items) {
              const detail = {
                user_id: orphan.user_id,
                account_id: orphan.account_id,
                asset_code: orphan.asset_code,
                orphan_amount: orphan.orphan_amount,
                status: 'pending'
              }

              try {
                // 3.1 执行解冻操作
                const idempotencyKey = `orphan_cleanup_service_${orphan.account_id}_${orphan.asset_code}_${Date.now()}`

                // eslint-disable-next-line no-await-in-loop, no-restricted-syntax -- 事务内串行执行，已传递 transaction
                await BalanceService.unfreeze(
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

                // 3.2 记录审计日志（使用 logOperation 方法）
                // eslint-disable-next-line no-await-in-loop -- 批量清理需要逐条审计
                await AuditLogService.logOperation({
                  operator_id: operator_id || 0, // 系统自动操作时使用 0
                  operation_type: 'asset_orphan_cleanup', // 使用标准操作类型
                  target_type: 'AccountAssetBalance',
                  target_id: orphan.account_id,
                  action: 'orphan_frozen_cleanup',
                  before_data: {
                    frozen_amount: orphan.frozen_amount,
                    available_amount: orphan.available_amount
                  },
                  after_data: {
                    frozen_amount: orphan.frozen_amount - orphan.orphan_amount,
                    available_amount: orphan.available_amount + orphan.orphan_amount
                  },
                  reason,
                  idempotency_key: idempotencyKey,
                  ip_address: '0.0.0.0', // 系统自动操作
                  transaction,
                  is_critical_operation: true // 关键操作，审计失败时阻断业务
                })

                detail.status = 'success'
                result.cleaned_count++
                result.total_unfrozen_amount += orphan.orphan_amount
                logger.info(
                  `[孤儿冻结清理] 清理成功：用户 ${orphan.user_id}, ${orphan.asset_code} 解冻 ${orphan.orphan_amount}`
                )
              } catch (error) {
                detail.status = 'failed'
                detail.error = error.message
                result.failed_count++
                logger.error(
                  `[孤儿冻结清理] 清理失败：用户 ${orphan.user_id}, ${orphan.asset_code}`,
                  {
                    error: error.message
                  }
                )
              }

              result.details.push(detail)
            }

            await transaction.commit()

            logger.info(
              `[孤儿冻结清理] 清理完成：成功 ${result.cleaned_count}，失败 ${result.failed_count}`
            )
            return result
          } catch (error) {
            await transaction.rollback()
            logger.error('[孤儿冻结清理] 清理事务失败，已回滚', { error: error.message })
            throw error
          }
        },
        {
          ttl: lockTTL,
          maxRetries: 3,
          retryDelay: 1000
        }
      )
    } catch (error) {
      // 检查是否是锁获取失败
      if (error.message.includes('Failed to acquire lock')) {
        logger.warn('[孤儿冻结清理] 获取分布式锁失败，可能有其他实例正在执行清理', {
          lockKey,
          error: error.message
        })
        throw new Error('孤儿冻结清理任务正在执行中，请稍后重试')
      }
      throw error
    }
  }

  /**
   * 获取孤儿冻结统计
   *
   * 🔴 P0 适配：使用 DTO 返回结构
   *
   * @returns {Promise<Object>} 统计信息
   */
  static async getOrphanFrozenStats() {
    // 调用检测方法（返回 DTO）
    const detectDto = await this.detectOrphanFrozen()

    // 按资产类型分组统计
    const statsByAsset = {}

    for (const orphan of detectDto.orphan_items) {
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
      total_orphan_count: detectDto.orphan_count,
      total_orphan_amount: detectDto.total_orphan_amount,
      affected_user_count: detectDto.affected_user_count,
      affected_asset_codes: detectDto.affected_asset_codes,
      by_asset: assetStats,
      checked_at: detectDto.generated_at
    }
  }

  /**
   * 检测买家孤儿冻结
   *
   * 🔴 2026-01-30 新增：检测买家侧的孤儿冻结
   * 场景：买家下单冻结了资产，但订单被删除/挂牌被删除，资产未解冻
   *
   * 检测逻辑：
   * - 查找所有有冻结余额的账户
   * - 对比该用户作为买家的活跃订单（status='frozen'）冻结总额
   * - 如果 frozen_amount > seller_listing_frozen + buyer_order_frozen，则为孤儿
   *
   * @param {Object} options - 选项
   * @param {number} options.user_id - 指定用户ID（可选）
   * @param {string} options.asset_code - 指定资产代码（可选）
   * @param {number} options.limit - 最大返回条数（默认 1000）
   * @returns {Promise<Object>} 检测结果 DTO
   */
  static async detectBuyerOrphanFrozen(options = {}) {
    const { user_id, asset_code, limit = 1000 } = options
    const startTime = Date.now()

    logger.info('[买家孤儿冻结检测] 开始检测...', { user_id, asset_code, limit })

    // 1. 构建查询条件
    const balanceWhere = {
      frozen_amount: { [Op.gt]: 0 }
    }

    if (asset_code) {
      balanceWhere.asset_code = asset_code
    }

    const accountWhere = {
      account_type: 'user'
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
      logger.info('[买家孤儿冻结检测] 未发现有冻结余额的账户')
      return {
        orphan_count: 0,
        total_orphan_amount: 0,
        orphan_items: [],
        checked_count: 0,
        generated_at: new Date().toISOString(),
        affected_user_count: 0,
        affected_asset_codes: [],
        items_truncated: false,
        orphan_type: 'buyer',
        _meta: {
          query_options: { user_id, asset_code, limit },
          execution_time_ms: Date.now() - startTime
        }
      }
    }

    // 3. 获取卖家活跃挂牌冻结（on_sale 状态）
    const sellerListingWhere = { status: 'on_sale' }
    if (user_id) {
      sellerListingWhere.seller_user_id = user_id
    }
    if (asset_code) {
      sellerListingWhere.offer_asset_code = asset_code
    }

    const activeSellerListings = await MarketListing.findAll({
      attributes: [
        'seller_user_id',
        'offer_asset_code',
        [sequelize.fn('SUM', sequelize.col('offer_amount')), 'total_listed']
      ],
      where: sellerListingWhere,
      group: ['seller_user_id', 'offer_asset_code'],
      raw: true
    })

    // 4. 获取买家活跃订单冻结（frozen 状态）
    const buyerOrderWhere = { status: 'frozen' }
    if (user_id) {
      buyerOrderWhere.buyer_user_id = user_id
    }
    if (asset_code) {
      buyerOrderWhere.asset_code = asset_code
    }

    const activeBuyerOrders = await TradeOrder.findAll({
      attributes: [
        'buyer_user_id',
        'asset_code',
        [sequelize.fn('SUM', sequelize.col('gross_amount')), 'total_frozen']
      ],
      where: buyerOrderWhere,
      group: ['buyer_user_id', 'asset_code'],
      raw: true
    })

    // 5. 构建映射
    const sellerListingMap = new Map()
    activeSellerListings.forEach(lt => {
      const key = `${lt.seller_user_id}_${lt.offer_asset_code}`
      sellerListingMap.set(key, parseInt(lt.total_listed, 10) || 0)
    })

    const buyerOrderMap = new Map()
    activeBuyerOrders.forEach(order => {
      const key = `${order.buyer_user_id}_${order.asset_code}`
      buyerOrderMap.set(key, parseInt(order.total_frozen, 10) || 0)
    })

    // 6. 检测孤儿冻结
    const orphanFrozenList = []
    const affectedUserIds = new Set()
    const affectedAssetCodes = new Set()

    for (const balance of frozenBalances) {
      const userId = balance.account?.user_id
      if (!userId) continue

      const key = `${userId}_${balance.asset_code}`
      const sellerListed = sellerListingMap.get(key) || 0
      const buyerFrozen = buyerOrderMap.get(key) || 0
      const totalValidFrozen = sellerListed + buyerFrozen
      const actualFrozen = parseInt(balance.frozen_amount, 10)

      // 实际冻结 > 有效冻结 = 孤儿冻结
      if (actualFrozen > totalValidFrozen) {
        const orphanAmount = actualFrozen - totalValidFrozen

        orphanFrozenList.push({
          user_id: userId,
          account_id: balance.account_id,
          asset_code: balance.asset_code,
          frozen_amount: actualFrozen,
          seller_listed_amount: sellerListed,
          buyer_order_frozen: buyerFrozen,
          valid_frozen_amount: totalValidFrozen,
          orphan_amount: orphanAmount,
          available_amount: parseInt(balance.available_amount, 10),
          orphan_type: 'buyer_order_deleted',
          description: `实际冻结 ${actualFrozen}，卖家挂牌 ${sellerListed}，买家订单 ${buyerFrozen}，孤儿额 ${orphanAmount}`
        })

        affectedUserIds.add(userId)
        affectedAssetCodes.add(balance.asset_code)
      }
    }

    const dto = {
      orphan_count: orphanFrozenList.length,
      total_orphan_amount: orphanFrozenList.reduce((sum, item) => sum + item.orphan_amount, 0),
      orphan_items: orphanFrozenList.slice(0, limit),
      checked_count: frozenBalances.length,
      generated_at: new Date().toISOString(),
      affected_user_count: affectedUserIds.size,
      affected_asset_codes: Array.from(affectedAssetCodes),
      items_truncated: orphanFrozenList.length > limit,
      orphan_type: 'buyer',
      _meta: {
        query_options: { user_id, asset_code, limit },
        execution_time_ms: Date.now() - startTime
      }
    }

    logger.info(`[买家孤儿冻结检测] 检测完成，发现 ${dto.orphan_count} 条孤儿冻结`, {
      orphan_count: dto.orphan_count,
      total_orphan_amount: dto.total_orphan_amount,
      affected_user_count: dto.affected_user_count,
      affected_asset_codes: dto.affected_asset_codes
    })

    return dto
  }

  /**
   * 综合检测所有孤儿冻结（卖家 + 买家）
   *
   * @param {Object} options - 选项
   * @param {number} options.user_id - 指定用户ID（可选）
   * @param {string} options.asset_code - 指定资产代码（可选）
   * @param {number} options.limit - 最大返回条数（默认 1000）
   * @returns {Promise<Object>} 综合检测结果
   */
  static async detectAllOrphanFrozen(options = {}) {
    const startTime = Date.now()

    logger.info('[综合孤儿冻结检测] 开始检测...', options)

    // 使用买家检测方法（已包含卖家挂牌和买家订单的综合分析）
    const buyerDto = await this.detectBuyerOrphanFrozen(options)

    return {
      ...buyerDto,
      orphan_type: 'comprehensive',
      _meta: {
        ...buyerDto._meta,
        detection_method: 'detectBuyerOrphanFrozen',
        execution_time_ms: Date.now() - startTime
      }
    }
  }

  /**
   * 清理买家孤儿冻结
   *
   * @param {Object} options - 选项
   * @param {boolean} options.dry_run - 干跑模式
   * @param {number} options.user_id - 指定用户ID
   * @param {string} options.asset_code - 指定资产代码
   * @param {number} options.operator_id - 操作者ID
   * @param {string} options.reason - 清理原因
   * @param {number} options.limit - 最大清理条数
   * @returns {Promise<Object>} 清理结果
   */
  static async cleanupBuyerOrphanFrozen(options = {}) {
    const {
      dry_run = true,
      user_id,
      asset_code,
      operator_id,
      reason = '买家孤儿冻结清理（订单/挂牌已删除）',
      limit = 100
    } = options

    if (!dry_run && !operator_id) {
      throw new Error('实际清理操作需要提供 operator_id')
    }

    logger.info('[买家孤儿冻结清理] 开始清理...', {
      dry_run,
      user_id,
      asset_code,
      operator_id,
      reason,
      limit
    })

    const lockKey = 'buyer_orphan_frozen_cleanup'
    const lockTTL = 600000

    try {
      return await distributedLock.withLock(
        lockKey,
        async () => {
          logger.info('[买家孤儿冻结清理] 成功获取分布式锁')

          const detectDto = await this.detectBuyerOrphanFrozen({ user_id, asset_code, limit })

          const result = {
            cleaned_count: 0,
            failed_count: 0,
            total_unfrozen_amount: 0,
            detected_count: detectDto.orphan_count,
            details: [],
            dry_run,
            orphan_type: 'buyer'
          }

          if (detectDto.orphan_count === 0) {
            logger.info('[买家孤儿冻结清理] 未发现买家孤儿冻结')
            return result
          }

          if (dry_run) {
            logger.info(
              `[买家孤儿冻结清理] 干跑模式：发现 ${detectDto.orphan_count} 条，总额 ${detectDto.total_orphan_amount}`
            )
            result.details = detectDto.orphan_items
            result.total_unfrozen_amount = detectDto.total_orphan_amount
            return result
          }

          const transaction = await sequelize.transaction()

          try {
            for (const orphan of detectDto.orphan_items) {
              const detail = {
                user_id: orphan.user_id,
                account_id: orphan.account_id,
                asset_code: orphan.asset_code,
                orphan_amount: orphan.orphan_amount,
                orphan_type: orphan.orphan_type,
                status: 'pending'
              }

              try {
                const idempotencyKey = `buyer_orphan_cleanup_${orphan.account_id}_${orphan.asset_code}_${Date.now()}`

                // eslint-disable-next-line no-await-in-loop, no-restricted-syntax -- 事务内串行执行
                await BalanceService.unfreeze(
                  {
                    user_id: orphan.user_id,
                    asset_code: orphan.asset_code,
                    amount: orphan.orphan_amount,
                    business_type: 'buyer_orphan_frozen_cleanup',
                    idempotency_key: idempotencyKey,
                    meta: {
                      cleanup_reason: reason,
                      operator_id,
                      original_frozen: orphan.frozen_amount,
                      seller_listed: orphan.seller_listed_amount,
                      buyer_order_frozen: orphan.buyer_order_frozen,
                      valid_frozen: orphan.valid_frozen_amount,
                      orphan_amount: orphan.orphan_amount,
                      cleanup_time: new Date().toISOString(),
                      cleanup_source: 'OrphanFrozenCleanupService.cleanupBuyerOrphanFrozen'
                    }
                  },
                  { transaction }
                )

                // eslint-disable-next-line no-await-in-loop -- 审计日志需串行
                await AuditLogService.logOperation({
                  operator_id: operator_id || 0,
                  operation_type: 'asset_orphan_cleanup',
                  target_type: 'AccountAssetBalance',
                  target_id: orphan.account_id,
                  action: 'buyer_orphan_frozen_cleanup',
                  before_data: {
                    frozen_amount: orphan.frozen_amount,
                    available_amount: orphan.available_amount
                  },
                  after_data: {
                    frozen_amount: orphan.frozen_amount - orphan.orphan_amount,
                    available_amount: orphan.available_amount + orphan.orphan_amount
                  },
                  reason,
                  idempotency_key: idempotencyKey,
                  ip_address: '0.0.0.0',
                  transaction,
                  is_critical_operation: true
                })

                detail.status = 'success'
                result.cleaned_count++
                result.total_unfrozen_amount += orphan.orphan_amount
                logger.info(
                  `[买家孤儿冻结清理] 成功：用户 ${orphan.user_id}, ${orphan.asset_code} 解冻 ${orphan.orphan_amount}`
                )
              } catch (error) {
                detail.status = 'failed'
                detail.error = error.message
                result.failed_count++
                logger.error(
                  `[买家孤儿冻结清理] 失败：用户 ${orphan.user_id}, ${orphan.asset_code}`,
                  { error: error.message }
                )
              }

              result.details.push(detail)
            }

            await transaction.commit()
            logger.info(
              `[买家孤儿冻结清理] 完成：成功 ${result.cleaned_count}，失败 ${result.failed_count}`
            )
            return result
          } catch (error) {
            await transaction.rollback()
            logger.error('[买家孤儿冻结清理] 事务失败，已回滚', { error: error.message })
            throw error
          }
        },
        { ttl: lockTTL, maxRetries: 3, retryDelay: 1000 }
      )
    } catch (error) {
      if (error.message.includes('Failed to acquire lock')) {
        logger.warn('[买家孤儿冻结清理] 获取锁失败', { error: error.message })
        throw new Error('买家孤儿冻结清理任务正在执行中，请稍后重试')
      }
      throw error
    }
  }
}

module.exports = OrphanFrozenCleanupService
