/**
 * item_holds 过期自动释放任务（原定时任务36）
 *
 * 业务用途：
 * - 检查 item_holds 表中已过期的锁定记录（expires_at < NOW()），自动释放
 * - 释放后若物品无其他 hold 且 status='held'，恢复为 available
 * - 业务场景：交易市场挂牌超时、抽奖锁定超时等
 *
 * 调度频率：每10分钟（由 scripts/maintenance/scheduled_tasks.js 注册，支持分布式锁）
 *
 * 创建时间：2026-02-23
 * 任务体自 scripts/maintenance/scheduled_tasks.js 原样搬移（技术债务方案 7.4-1，2026-07-11）
 */

const logger = require('../utils/logger')

/**
 * item_holds 过期自动释放任务类
 *
 * @class ItemHoldsExpiration
 * @description 批量释放过期的物品锁定记录并恢复物品状态
 */
class ItemHoldsExpiration {
  /**
   * 执行过期锁定释放
   *
   * @returns {Promise<number>} 释放的过期 hold 数量
   */
  static async execute() {
    const { sequelize } = require('../config/database')

    const [expiredHolds] = await sequelize.query(`
      SELECT hold_id, item_id, hold_type, holder_ref, expires_at
      FROM item_holds
      WHERE expires_at IS NOT NULL AND expires_at < NOW()
      LIMIT 100
    `)

    if (expiredHolds.length === 0) {
      return 0
    }

    logger.info(`[定时任务] 发现 ${expiredHolds.length} 个过期的 item_holds，开始释放...`)

    const holdIds = expiredHolds.map(h => h.hold_id)
    await sequelize.query(
      `
      DELETE FROM item_holds WHERE hold_id IN (:holdIds)
    `,
      { replacements: { holdIds } }
    )

    // 更新 items 表的 status（如果该物品没有其他 hold 了，恢复为 available）
    const itemIds = [...new Set(expiredHolds.map(h => h.item_id))]
    await sequelize.query(
      `
      UPDATE items i
      SET i.status = 'available', i.updated_at = NOW()
      WHERE i.item_id IN (:itemIds)
        AND NOT EXISTS (SELECT 1 FROM item_holds h WHERE h.item_id = i.item_id)
        AND i.status = 'held'
    `,
      { replacements: { itemIds } }
    )

    logger.info(`[定时任务] 已释放 ${expiredHolds.length} 个过期 item_holds`)
    return expiredHolds.length
  }
}

module.exports = ItemHoldsExpiration
