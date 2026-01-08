/**
 * 消费审核回调处理器（空实现）
 *
 * 设计说明：
 * - 消费审核的业务逻辑已在 ConsumptionService.approveConsumption/rejectConsumption 中完成
 * - 路由直接调用 Service 方法，不通过 ContentAuditEngine 触发
 * - 此回调仅作为架构占位符，确保 ContentAuditEngine 回调机制不报错
 *
 * 业务流程：
 * - 商家提交消费记录 → ConsumptionService.merchantSubmitConsumption()
 * - 管理员审核 → 路由直接调用 ConsumptionService.approveConsumption/rejectConsumption
 * - 积分发放、状态更新、审计日志 均在 Service 内完成
 *
 * 创建时间：2026-01-09
 * 维护说明：如需通过 ContentAuditEngine 统一审批，可在此添加回调逻辑
 */

const logger = require('../utils/logger').logger

module.exports = {
  /**
   * 审核通过回调（空实现）
   *
   * @description 消费审核通过的业务逻辑已在 ConsumptionService.approveConsumption 中完成
   * @param {number} consumptionId - 消费记录ID
   * @param {Object} _auditRecord - 审核记录（未使用）
   * @param {Object} _transaction - 数据库事务（未使用）
   * @returns {Promise<{success: boolean}>} 回调处理结果
   */
  async approved(consumptionId, _auditRecord, _transaction) {
    logger.info(
      `[消费审核回调] 审核通过回调触发（空实现）: consumption_id=${consumptionId}, 业务逻辑已在ConsumptionService完成`
    )

    /*
     * 空实现：业务逻辑已在 ConsumptionService.approveConsumption 中完成
     * 包含：积分发放、预算分配、状态更新、审计日志
     */

    return {
      success: true,
      message: '消费审核通过回调（空实现）- 业务逻辑已在Service完成'
    }
  },

  /**
   * 审核拒绝回调（空实现）
   *
   * @description 消费审核拒绝的业务逻辑已在 ConsumptionService.rejectConsumption 中完成
   * @param {number} consumptionId - 消费记录ID
   * @param {Object} _auditRecord - 审核记录（未使用）
   * @param {Object} _transaction - 数据库事务（未使用）
   * @returns {Promise<{success: boolean}>} 回调处理结果
   */
  async rejected(consumptionId, _auditRecord, _transaction) {
    logger.info(
      `[消费审核回调] 审核拒绝回调触发（空实现）: consumption_id=${consumptionId}, 业务逻辑已在ConsumptionService完成`
    )

    /*
     * 空实现：业务逻辑已在 ConsumptionService.rejectConsumption 中完成
     * 包含：状态更新、审计日志
     */

    return {
      success: true,
      message: '消费审核拒绝回调（空实现）- 业务逻辑已在Service完成'
    }
  }
}
