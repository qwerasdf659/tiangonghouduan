/**
 * 消费审核回调处理器（审核链统一路径，2026-07-10 收口重构）
 *
 * 设计说明：
 * - 审核链终审通过 → ContentAuditEngine.approve() → triggerAuditCallback() → 本回调
 * - 本回调不再复制发放逻辑，直接委托 ConsumptionCoreService.approveConsumption /
 *   rejectConsumption（全库唯一发放路径 = CoreService 发放组合器）。
 *   历史上本文件曾复制过一份发放实现，后与 CoreService 漂移（漏掉活动预算归集判定），
 *   2026-07-10 按"单一路径零技术债"原则删除复制实现、改为真委托。
 *
 * 业务流程（审核链路径）：
 * - 终审通过 → approved() → CoreService.approveConsumption
 *   →（发放组合器）基础积分 + 等级加成 + 预算分配（活动归集）+ 星石配额 + 升级通知
 * - 终审拒绝 → rejected() → CoreService.rejectConsumption → 状态更新 + 审计日志
 *
 * @module callbacks/ConsumptionAuditCallback
 */

const logger = require('../utils/logger').logger
const { ConsumptionRecord } = require('../models')
const CoreService = require('../services/consumption/CoreService')

module.exports = {
  /**
   * 审核通过回调 — 委托 CoreService.approveConsumption（发放组合器）
   *
   * @param {number} consumptionId - 消费记录ID（auditable_id）
   * @param {Object} auditRecord - 审核记录（ContentReviewRecord 实例，引擎已更新为 approved）
   * @param {Object} transaction - 数据库事务（由 ContentAuditEngine 传入）
   * @returns {Promise<Object>} 回调处理结果
   */
  async approved(consumptionId, auditRecord, transaction) {
    logger.info(`[消费审核回调] 审核通过: consumption_id=${consumptionId}`)

    // 幂等跳过：记录已非 pending（重复回调/历史数据）时不重复发放
    const record = await ConsumptionRecord.findByPk(consumptionId, { transaction })
    if (!record) {
      throw new Error(`消费记录不存在（ID: ${consumptionId}）`)
    }
    if (record.status !== 'pending') {
      logger.warn(`[消费审核回调] 消费记录状态不是 pending: status=${record.status}，跳过回调`)
      return { success: true, message: `消费记录状态已为 ${record.status}，无需重复处理` }
    }

    const result = await CoreService.approveConsumption(
      consumptionId,
      {
        reviewer_id: auditRecord.auditor_id,
        admin_notes: auditRecord.audit_reason || '审核通过'
      },
      { transaction, review_record: auditRecord }
    )

    logger.info(
      `✅ [消费审核回调] 审核通过完成: consumption_id=${consumptionId}, 基础积分=${result.points_awarded}, 等级加成=${result.level_bonus_points}, 预算=${result.budget_points_allocated}, 配额=${result.star_stone_quota_allocated}`
    )

    return {
      success: true,
      consumption_record_id: consumptionId,
      points_awarded: result.points_awarded,
      level_bonus_points: result.level_bonus_points,
      budget_points_allocated: result.budget_points_allocated,
      star_stone_quota_allocated: result.star_stone_quota_allocated
    }
  },

  /**
   * 审核拒绝回调 — 委托 CoreService.rejectConsumption
   *
   * @param {number} consumptionId - 消费记录ID
   * @param {Object} auditRecord - 审核记录（引擎已更新为 rejected）
   * @param {Object} transaction - 数据库事务
   * @returns {Promise<Object>} 回调处理结果
   */
  async rejected(consumptionId, auditRecord, transaction) {
    logger.info(`[消费审核回调] 审核拒绝: consumption_id=${consumptionId}`)

    // 幂等跳过：记录已非 pending 时不重复处理
    const record = await ConsumptionRecord.findByPk(consumptionId, { transaction })
    if (!record) {
      throw new Error(`消费记录不存在（ID: ${consumptionId}）`)
    }
    if (record.status !== 'pending') {
      logger.warn(`[消费审核回调] 消费记录状态不是 pending: status=${record.status}，跳过回调`)
      return { success: true, message: `消费记录状态已为 ${record.status}，无需重复处理` }
    }

    await CoreService.rejectConsumption(
      consumptionId,
      {
        reviewer_id: auditRecord.auditor_id,
        admin_notes: auditRecord.audit_reason || '审核拒绝'
      },
      { transaction, review_record: auditRecord }
    )

    logger.info(`✅ [消费审核回调] 审核拒绝完成: consumption_id=${consumptionId}`)

    return {
      success: true,
      consumption_record_id: consumptionId,
      message: '消费审核拒绝'
    }
  }
}
