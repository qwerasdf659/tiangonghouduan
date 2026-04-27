'use strict'

const BusinessError = require('../../utils/BusinessError')
const { LotteryPrize, LotteryCampaign } = require('../../models')
const AuditLogService = require('../AuditLogService')
const { assertAndGetTransaction } = require('../../utils/transactionHelpers')
const { BusinessCacheHelper } = require('../../utils/BusinessCacheHelper')

const logger = require('../../utils/logger').logger

/**
 * 奖品库存管理服务
 * 职责：库存补充、设置、批量更新、排序管理
 */
class PrizeStockService {
  /**
   * 补充库存
   *
   * 事务边界治理（2026-01-05 决策）：
   * - 强制要求外部事务传入（options.transaction）
   *
   * @param {number} prize_id - 奖品ID
   * @param {number} quantity - 补充数量
   * @param {Object} options - 选项
   * @param {Object} options.transaction - 事务对象（必填）
   * @param {number} options.operated_by - 操作者ID（可选）
   * @returns {Promise<Object>} 补充结果
   */
  static async addStock(prize_id, quantity, options = {}) {
    const transaction = assertAndGetTransaction(options, 'PrizeStockService.addStock')
    const { operated_by } = options

    logger.info('开始补充库存', { prize_id, quantity, operated_by })

    // 1. 验证补充数量
    if (!quantity || quantity <= 0) {
      throw new BusinessError('补充数量必须大于0', 'PRIZE_POOL_REQUIRED', 400)
    }

    // 2. 查找奖品
    const prize = await LotteryPrize.findByPk(prize_id, { transaction })
    if (!prize) {
      throw new BusinessError('奖品不存在', 'PRIZE_POOL_NOT_FOUND', 404)
    }

    const oldQuantity = prize.stock_quantity || 0
    const newQuantity = oldQuantity + parseInt(quantity)

    // 3. 更新库存
    await prize.update({ stock_quantity: newQuantity }, { transaction })

    /*
     * 4. 如果之前是 inactive 状态，补货后自动恢复为 active
     * 实物奖品(physical)需要有图片才能自动激活
     */
    if (prize.status === 'inactive' && newQuantity > 0) {
      const canActivate = prize.prize_type !== 'physical' || prize.primary_media_id != null
      if (canActivate) {
        await prize.update({ status: 'active' }, { transaction })
      } else {
        logger.warn('[PrizePool] 实物奖品补货但缺少图片，保持 inactive 状态', {
          prize_id: prize.lottery_prize_id,
          prize_name: prize.prize_name,
          prize_type: prize.prize_type
        })
      }
    }

    /*
     * 5. 记录审计日志（奖品库存调整）
     */
    await AuditLogService.logOperation({
      operator_id: operated_by || 1,
      operation_type: 'prize_stock_adjust',
      target_type: 'LotteryPrize',
      target_id: prize_id,
      action: 'adjust',
      before_data: { stock_quantity: oldQuantity },
      after_data: { stock_quantity: newQuantity },
      reason: `奖品库存调整: ${oldQuantity} → ${newQuantity}（补充${quantity}）`,
      idempotency_key: `stock_adjust_${prize_id}_from${oldQuantity}_to${newQuantity}`,
      is_critical_operation: true,
      transaction
    })

    logger.info('库存补充成功', {
      prize_id,
      old_quantity: oldQuantity,
      add_quantity: quantity,
      new_quantity: newQuantity,
      operated_by
    })

    // 6. 缓存失效
    try {
      await BusinessCacheHelper.invalidateLotteryCampaign(
        prize.lottery_campaign_id,
        'prize_stock_added'
      )
      logger.info('[缓存] 活动配置缓存已失效（库存补充）', {
        prize_id,
        lottery_campaign_id: prize.lottery_campaign_id
      })
    } catch (cacheError) {
      logger.warn('[缓存] 活动配置缓存失效失败（非致命）', {
        error: cacheError.message,
        prize_id,
        lottery_campaign_id: prize.lottery_campaign_id
      })
    }

    return {
      prize_id,
      old_quantity: oldQuantity,
      add_quantity: parseInt(quantity),
      new_quantity: newQuantity,
      remaining_quantity: newQuantity - (prize.total_win_count || 0)
    }
  }

  /**
   * 设置单个奖品的绝对库存值
   * 区别于 addStock 的增量模式
   *
   * @param {number} prize_id - 奖品ID
   * @param {number} stock_quantity - 目标库存值
   * @param {Object} options - { operated_by, transaction }
   * @returns {Promise<Object>} { old_stock, new_stock }
   */
  static async setPrizeStock(prize_id, stock_quantity, options = {}) {
    const transaction = assertAndGetTransaction(options, 'PrizeStockService.setPrizeStock')
    const { operated_by } = options

    logger.info('设置奖品绝对库存', { prize_id, stock_quantity })

    const prize = await LotteryPrize.findByPk(prize_id, { transaction })
    if (!prize) {
      throw new BusinessError('奖品不存在', 'PRIZE_POOL_NOT_FOUND', 404)
    }

    const oldStock = prize.stock_quantity || 0
    const newStock = parseInt(stock_quantity)

    if (isNaN(newStock) || newStock < 0) {
      throw new BusinessError('库存数量必须为非负整数', 'PRIZE_POOL_REQUIRED', 400)
    }

    const currentUsed = prize.total_win_count || 0
    if (newStock < currentUsed) {
      throw new BusinessError(
        `新库存(${newStock})不能小于已发放数量(${currentUsed})`,
        'PRIZE_POOL_NOT_ALLOWED',
        400
      )
    }

    await prize.update({ stock_quantity: newStock }, { transaction })

    const warnings = []
    if (newStock === 0 && (prize.win_weight || 0) > 0) {
      warnings.push({
        type: 'zero_stock_positive_weight',
        message: `${prize.prize_name}：库存为 0 但权重 ${prize.win_weight} > 0，算法选中后将触发降级`
      })
    }

    await AuditLogService.logOperation({
      operator_id: operated_by || 1,
      operation_type: 'prize_stock_adjust',
      target_type: 'LotteryPrize',
      target_id: prize_id,
      action: 'set_stock',
      before_data: { stock_quantity: oldStock },
      after_data: { stock_quantity: newStock },
      reason: `设置绝对库存: ${oldStock} → ${newStock}`,
      idempotency_key: `stock_set_${prize_id}_from${oldStock}_to${newStock}`,
      is_critical_operation: true,
      transaction
    })

    try {
      await BusinessCacheHelper.invalidateLotteryCampaign(
        prize.lottery_campaign_id,
        'prize_stock_set'
      )
    } catch (cacheError) {
      logger.warn('[缓存] 活动配置缓存失效失败（非致命）', { error: cacheError.message })
    }

    logger.info('奖品绝对库存设置成功', { prize_id, old_stock: oldStock, new_stock: newStock })

    return { prize_id, old_stock: oldStock, new_stock: newStock, warnings }
  }

  /**
   * 批量更新多个奖品库存
   * 在单一事务内原子执行
   *
   * @param {string} campaign_code - 活动业务码
   * @param {Array<{lottery_prize_id: number, stock_quantity: number}>} updates - 更新列表
   * @param {Object} options - { operated_by, transaction }
   * @returns {Promise<Object>} { updated_count, warnings }
   */
  static async batchUpdatePrizeStock(campaign_code, updates, options = {}) {
    const transaction = assertAndGetTransaction(options, 'PrizeStockService.batchUpdatePrizeStock')
    const { operated_by } = options

    logger.info('批量更新奖品库存', { campaign_code, update_count: updates.length })

    const campaign = await LotteryCampaign.findOne({
      where: { campaign_code },
      transaction
    })
    if (!campaign) {
      throw new BusinessError(`活动不存在: ${campaign_code}`, 'PRIZE_POOL_NOT_FOUND', 404)
    }

    const warnings = []
    let updatedCount = 0

    for (const update of updates) {
      // eslint-disable-next-line no-await-in-loop -- 事务内顺序更新，保证原子性
      const result = await PrizeStockService.setPrizeStock(
        update.lottery_prize_id,
        update.stock_quantity,
        { operated_by, transaction }
      )
      updatedCount++
      if (result.warnings?.length) {
        warnings.push(...result.warnings)
      }
    }

    logger.info('批量库存更新成功', { campaign_code, updated_count: updatedCount })

    return { updated_count: updatedCount, warnings }
  }

  /**
   * 批量更新奖品排序
   * 使用两阶段更新避免唯一索引中间态冲突
   *
   * @param {string} campaign_code - 活动业务码
   * @param {Array<{lottery_prize_id: number, sort_order: number}>} updates - 排序更新列表
   * @param {Object} options - { updated_by, transaction }
   * @returns {Promise<Object>} { updated_count }
   */
  static async batchUpdateSortOrder(campaign_code, updates, options = {}) {
    const transaction = assertAndGetTransaction(options, 'PrizeStockService.batchUpdateSortOrder')
    const { updated_by } = options

    logger.info('批量更新奖品排序', { campaign_code, update_count: updates.length })

    const campaign = await LotteryCampaign.findOne({
      where: { campaign_code },
      transaction
    })
    if (!campaign) {
      throw new BusinessError(`活动不存在: ${campaign_code}`, 'PRIZE_POOL_NOT_FOUND', 404)
    }

    if (!updates || updates.length === 0) {
      throw new BusinessError('排序更新列表不能为空', 'PRIZE_POOL_NOT_ALLOWED', 400)
    }

    // 阶段1：设置临时负值
    for (let i = 0; i < updates.length; i++) {
      // eslint-disable-next-line no-await-in-loop -- 事务内顺序执行避免索引冲突
      await LotteryPrize.update(
        { sort_order: -(i + 1) },
        {
          where: {
            lottery_prize_id: updates[i].lottery_prize_id,
            lottery_campaign_id: campaign.lottery_campaign_id
          },
          transaction
        }
      )
    }

    // 阶段2：设置正式目标值
    for (const update of updates) {
      // eslint-disable-next-line no-await-in-loop -- 事务内顺序执行避免索引冲突
      await LotteryPrize.update(
        { sort_order: update.sort_order },
        {
          where: {
            lottery_prize_id: update.lottery_prize_id,
            lottery_campaign_id: campaign.lottery_campaign_id
          },
          transaction
        }
      )
    }

    await AuditLogService.logOperation({
      operator_id: updated_by || 1,
      operation_type: 'prize_sort_order',
      target_type: 'LotteryCampaign',
      target_id: campaign.lottery_campaign_id,
      action: 'batch_sort',
      before_data: { note: '排序值已变更' },
      after_data: { updates },
      reason: `批量更新${updates.length}个奖品排序`,
      idempotency_key: `sort_order_${campaign_code}_${Date.now()}`,
      is_critical_operation: false,
      transaction
    })

    try {
      await BusinessCacheHelper.invalidateLotteryCampaign(
        campaign.lottery_campaign_id,
        'prize_sort_updated'
      )
    } catch (cacheError) {
      logger.warn('[缓存] 活动配置缓存失效失败（非致命）', { error: cacheError.message })
    }

    logger.info('批量排序更新成功', { campaign_code, updated_count: updates.length })

    return { updated_count: updates.length }
  }
}

module.exports = PrizeStockService
