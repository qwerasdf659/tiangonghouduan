/**
 * 兑换审核回调处理器（空实现）
 *
 * 设计说明：
 * - 兑换订单不需要审核流程，是实时完成的交易
 * - exchange_records.status 表示订单履行状态（pending待发货/shipped已发货/completed已完成）
 * - 不是内容审核状态（pending审核中/approved通过/rejected拒绝）
 * - 此回调仅作为架构占位符，确保 ContentAuditEngine 回调机制不报错
 *
 * 业务流程：
 * - 用户发起兑换 → ExchangeService.exchangeItem() 直接完成资产扣减
 * - 订单状态流转：pending(待发货) → shipped(已发货) → completed(已完成)
 * - 无需人工审核，因为资产扣减在创建订单时已原子性完成
 *
 * 历史原因：
 * - ContentAuditEngine 的回调映射包含 exchange 类型
 * - 可能是早期设计预留，实际业务未使用
 * - 保留此空回调以兼容现有架构
 *
 * 创建时间：2026-01-09
 */

const logger = require('../utils/logger').logger

module.exports = {
  /**
   * 审核通过回调（空实现）
   *
   * @description 兑换订单不走审核流程，此回调为架构占位符
   * @param {number} exchangeId - 兑换记录ID
   * @param {Object} _auditRecord - 审核记录（未使用）
   * @param {Object} _transaction - 数据库事务（未使用）
   * @returns {Promise<{success: boolean}>} 回调处理结果
   */
  async approved(exchangeId, _auditRecord, _transaction) {
    logger.warn(
      `[兑换审核回调] 审核通过回调触发（空实现）: exchange_id=${exchangeId}，兑换订单不走审核流程`
    )

    /*
     * 空实现：兑换订单不需要审核，资产扣减在创建订单时已完成
     * 如果此回调被触发，说明存在配置错误或代码误用
     */

    return {
      success: true,
      message: '兑换审核通过回调（空实现）- 兑换订单不走审核流程'
    }
  },

  /**
   * 审核拒绝回调（空实现）
   *
   * @description 兑换订单不走审核流程，此回调为架构占位符
   * @param {number} exchangeId - 兑换记录ID
   * @param {Object} _auditRecord - 审核记录（未使用）
   * @param {Object} _transaction - 数据库事务（未使用）
   * @returns {Promise<{success: boolean}>} 回调处理结果
   */
  async rejected(exchangeId, _auditRecord, _transaction) {
    logger.warn(
      `[兑换审核回调] 审核拒绝回调触发（空实现）: exchange_id=${exchangeId}，兑换订单不走审核流程`
    )

    /*
     * 空实现：兑换订单不需要审核
     * 如果需要取消订单，应该调用 ExchangeService.cancelOrder（如有实现）
     */

    return {
      success: true,
      message: '兑换审核拒绝回调（空实现）- 兑换订单不走审核流程'
    }
  }
}
