/**
 * 兑换商品定时上下架任务（原定时任务39）
 *
 * 业务规则（2026-03-17 兑换市场增强）：
 * - publish_at <= NOW() 且 status='inactive' → 自动上架（status='active'）
 * - unpublish_at <= NOW() 且 status='active' → 自动下架（status='inactive'）
 * - 执行后清空对应的时间字段，避免重复触发
 * - 有变更时失效兑换商品业务缓存
 *
 * 调度频率：每10分钟（由 scripts/maintenance/scheduled_tasks.js 注册）
 *
 * 创建时间：2026-03-17
 * 任务体自 scripts/maintenance/scheduled_tasks.js 原样搬移（技术债务方案 7.4-1，2026-07-11）
 */

const logger = require('../utils/logger')

/**
 * 兑换商品定时上下架任务类
 *
 * @class ExchangeItemAutoPublish
 * @description 按 publish_at/unpublish_at 时间字段自动上下架兑换商品
 */
class ExchangeItemAutoPublish {
  /**
   * 执行定时上下架检测
   *
   * @returns {Promise<Object>} 执行结果（published_count/unpublished_count）
   */
  static async execute() {
    const { ExchangeItem, sequelize } = require('../models')
    const { Op } = sequelize.Sequelize
    const now = new Date()

    const [publishedCount] = await ExchangeItem.update(
      { status: 'active', publish_at: null },
      { where: { publish_at: { [Op.lte]: now }, status: 'inactive' } }
    )

    const [unpublishedCount] = await ExchangeItem.update(
      { status: 'inactive', unpublish_at: null },
      { where: { unpublish_at: { [Op.lte]: now }, status: 'active' } }
    )

    if (publishedCount > 0 || unpublishedCount > 0) {
      logger.info(
        `[定时任务39] 定时上下架执行完成: 上架 ${publishedCount} 个, 下架 ${unpublishedCount} 个`
      )
      const { BusinessCacheHelper } = require('../utils/BusinessCacheHelper')
      await BusinessCacheHelper.invalidateExchangeItems('auto_publish').catch(() => {})
    }

    return { published_count: publishedCount, unpublished_count: unpublishedCount }
  }
}

module.exports = ExchangeItemAutoPublish
