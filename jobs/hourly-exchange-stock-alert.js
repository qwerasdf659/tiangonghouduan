/**
 * 每小时库存预警检测 + 售罄自动下架任务（原定时任务40）
 *
 * 业务规则（2026-03-17 兑换市场增强）：
 * - 全部 active SKU 库存归零且 status='active' → 自动下架（售罄保护）
 * - 总库存 <= stock_alert_threshold 且 stock_alert_threshold > 0 → 创建管理员通知
 * - 统一商品中心：库存在 exchange_item_skus + 预警阈值在 exchange_items
 *
 * 调度频率：20 * * * *（每小时第20分钟，由 scripts/maintenance/scheduled_tasks.js 注册）
 *
 * 创建时间：2026-03-17
 * 任务体自 scripts/maintenance/scheduled_tasks.js 原样搬移（技术债务方案 7.4-1，2026-07-11）
 */

const logger = require('../utils/logger')

/**
 * 每小时库存预警检测任务类
 *
 * @class HourlyExchangeStockAlert
 * @description 兑换商品售罄自动下架与低库存预警通知
 */
class HourlyExchangeStockAlert {
  /**
   * 执行库存预警检测 + 售罄自动下架
   *
   * @returns {Promise<Object>} 执行结果（sold_out_count/low_stock_count）
   */
  static async execute() {
    const { ExchangeItem, ExchangeItemSku, AdminNotification, sequelize } = require('../models')
    const { Op } = sequelize.Sequelize

    // 售罄自动下架（库存在 exchange_item_skus，检查全部 SKU 归零的商品）
    const activeItems = await ExchangeItem.findAll({
      where: { status: 'active' },
      attributes: ['exchange_item_id', 'item_name'],
      include: [
        {
          model: ExchangeItemSku,
          as: 'skus',
          attributes: ['stock'],
          where: { status: 'active' },
          required: true
        }
      ],
      raw: false
    })
    const zeroStockIds = activeItems
      .filter(p => p.skus.every(s => s.stock <= 0))
      .map(p => p.exchange_item_id)
    let soldOutCount = 0
    if (zeroStockIds.length > 0) {
      ;[soldOutCount] = await ExchangeItem.update(
        { status: 'inactive' },
        { where: { exchange_item_id: { [Op.in]: zeroStockIds } } }
      )
    }

    if (soldOutCount > 0) {
      logger.info(`[定时任务40] 售罄自动下架: ${soldOutCount} 个商品`)
      const { BusinessCacheHelper } = require('../utils/BusinessCacheHelper')
      await BusinessCacheHelper.invalidateExchangeItems('sold_out_auto_unpublish').catch(() => {})
    }

    // 库存预警检测（统一商品中心：库存在 exchange_item_skus + 预警阈值在 exchange_items）
    const alertItems = await ExchangeItem.findAll({
      where: { status: 'active', stock_alert_threshold: { [Op.gt]: 0 } },
      attributes: ['exchange_item_id', 'item_name', 'stock_alert_threshold'],
      include: [
        {
          model: ExchangeItemSku,
          as: 'skus',
          attributes: ['stock'],
          where: { status: 'active' },
          required: false
        }
      ],
      raw: false
    })

    const lowStockItems = alertItems.filter(p => {
      const totalStock = (p.skus || []).reduce((sum, s) => sum + s.stock, 0)
      return totalStock > 0 && totalStock <= p.stock_alert_threshold
    })

    if (lowStockItems.length > 0 && AdminNotification) {
      for (const item of lowStockItems) {
        const totalStock = (item.skus || []).reduce((sum, s) => sum + s.stock, 0)
        await AdminNotification.create({
          title: `库存预警：${item.item_name}`,
          content: `商品「${item.item_name}」(ID:${item.exchange_item_id}) 库存仅剩 ${totalStock}，低于预警阈值 ${item.stock_alert_threshold}`,
          notification_type: 'stock_alert',
          priority: totalStock <= 1 ? 'high' : 'medium',
          target_type: 'exchange_item',
          target_id: item.exchange_item_id,
          is_read: false
        }).catch(e =>
          logger.warn(`库存预警通知创建失败(exchange_item ${item.exchange_item_id}):`, e.message)
        )
      }
      logger.info(`[定时任务40] 库存预警: ${lowStockItems.length} 个商品低于阈值`)
    }

    return { sold_out_count: soldOutCount, low_stock_count: lowStockItems.length }
  }
}

module.exports = HourlyExchangeStockAlert
