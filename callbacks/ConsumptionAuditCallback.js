/**
 * 消费审核回调处理器（真实实现 — 2026-03-10 审核链统一路径改造）
 *
 * 设计说明：
 * - 2026-03-10 决策#1：统一到 ContentAuditEngine 路径
 * - 将 ConsumptionCoreService.approveConsumption 的核心业务逻辑迁移到此回调
 * - 审核链终审通过 → ContentAuditEngine.approve() → triggerAuditCallback() → 本回调
 * - 兼容无审核链的存量数据（路由层直接调用 CoreService.approveConsumption 仍可用）
 *
 * 业务流程（审核链路径）：
 * - 终审通过 → ContentAuditEngine.approve() → triggerAuditCallback('approved')
 *   → ConsumptionAuditCallback.approved() → 积分发放 + 预算分配 + 状态更新
 *
 * @module callbacks/ConsumptionAuditCallback
 */

const logger = require('../utils/logger').logger
const { ConsumptionRecord } = require('../models')
const { AssetCode } = require('../constants/AssetCode')
const BalanceService = require('../services/asset/BalanceService')
const BeijingTimeHelper = require('../utils/timeHelper')
const AuditLogService = require('../services/AuditLogService')

module.exports = {
  /**
   * 审核通过回调 — 执行积分发放、预算分配、状态更新
   *
   * 从 ConsumptionCoreService.approveConsumption 迁移的核心逻辑：
   *   1. 查询消费记录
   *   2. 发放积分（1元=1分）
   *   3. 更新消费记录状态
   *   4. 预算分配（BUDGET_POINTS）
   *   5. 星石配额发放（STAR_STONE_QUOTA）
   *   6. 审计日志
   *
   * @param {number} consumptionId - 消费记录ID（auditable_id）
   * @param {Object} auditRecord - 审核记录（ContentReviewRecord 实例）
   * @param {Object} transaction - 数据库事务（由 ContentAuditEngine 传入）
   * @returns {Promise<Object>} 回调处理结果
   */
  async approved(consumptionId, auditRecord, transaction) {
    logger.info(`[消费审核回调] 审核通过: consumption_id=${consumptionId}`)

    const record = await ConsumptionRecord.findByPk(consumptionId, {
      transaction,
      lock: transaction.LOCK.UPDATE
    })

    if (!record) {
      throw new Error(`消费记录不存在（ID: ${consumptionId}）`)
    }

    if (record.status !== 'pending') {
      logger.warn(`[消费审核回调] 消费记录状态不是 pending: status=${record.status}，跳过回调`)
      return { success: true, message: `消费记录状态已为 ${record.status}，无需重复处理` }
    }

    // 1. 发放积分（1元=1分）
    const mintAccount = await BalanceService.getOrCreateAccount(
      { system_code: 'SYSTEM_MINT' },
      { transaction }
    )

    const pointsResult = await BalanceService.changeBalance(
      {
        user_id: record.user_id,
        asset_code: AssetCode.POINTS,
        delta_amount: record.points_to_award,
        business_type: 'consumption_reward',
        idempotency_key: `consumption_reward:approve:${consumptionId}`,
        counterpart_account_id: mintAccount.account_id,
        meta: {
          reference_type: 'consumption',
          reference_id: consumptionId,
          title: `消费奖励${record.points_to_award}分`,
          description: `【审核通过】消费${record.consumption_amount}元，奖励${record.points_to_award}积分`,
          operator_id: auditRecord.auditor_id
        }
      },
      { transaction }
    )

    const rewardTransactionId = pointsResult.transaction_record?.asset_transaction_id || null
    if (!rewardTransactionId) {
      throw new Error('积分发放成功但未获取到流水ID，无法完成审核')
    }

    // 2. 更新消费记录状态
    await record.update(
      {
        status: 'approved',
        reviewed_by: auditRecord.auditor_id,
        reviewed_at: BeijingTimeHelper.createDatabaseTime(),
        admin_notes: auditRecord.audit_reason || null,
        reward_transaction_id: rewardTransactionId,
        final_status: 'approved',
        settled_at: BeijingTimeHelper.createDatabaseTime(),
        updated_at: BeijingTimeHelper.createDatabaseTime()
      },
      { transaction }
    )

    // 3. 预算分配（从 system_settings 读取比例）
    let budgetPointsAllocated = 0
    try {
      const CoreService = require('../services/consumption/CoreService')
      const globalBudgetRatio = await CoreService.getBudgetRatio()
      const budgetRatio = await CoreService.getEffectiveRatio(
        record.user_id,
        'budget_allocation_ratio',
        globalBudgetRatio
      )
      const budgetPointsToAllocate = Math.round(record.consumption_amount * budgetRatio)

      if (budgetPointsToAllocate > 0) {
        await BalanceService.changeBalance(
          {
            user_id: record.user_id,
            asset_code: AssetCode.BUDGET_POINTS,
            delta_amount: budgetPointsToAllocate,
            business_type: 'consumption_budget_allocation',
            idempotency_key: `consumption_budget:approve:${consumptionId}`,
            lottery_campaign_id: 'CONSUMPTION_DEFAULT',
            counterpart_account_id: mintAccount.account_id,
            meta: {
              reference_type: 'consumption',
              reference_id: consumptionId,
              consumption_amount: record.consumption_amount,
              budget_ratio: budgetRatio,
              description: `消费${record.consumption_amount}元，分配预算积分${budgetPointsToAllocate}`
            }
          },
          { transaction }
        )
        budgetPointsAllocated = budgetPointsToAllocate
      }
    } catch (budgetError) {
      logger.error(`[消费审核回调] 预算分配失败（非致命）: ${budgetError.message}`)
    }

    // 4. 星石配额发放
    let starStoneQuotaAllocated = 0
    try {
      const CoreService = require('../services/consumption/CoreService')
      const quotaConfig = await CoreService._getStarStoneQuotaConfig()
      if (quotaConfig.enabled) {
        const effectiveRatio = await CoreService.getEffectiveRatio(
          record.user_id,
          'star_stone_quota_ratio',
          quotaConfig.ratio
        )
        const quotaAmount = Math.floor(parseFloat(record.consumption_amount) * effectiveRatio)
        if (quotaAmount > 0) {
          await BalanceService.changeBalance(
            {
              user_id: record.user_id,
              asset_code: 'STAR_STONE_QUOTA',
              delta_amount: quotaAmount,
              business_type: 'consumption_quota_allocation',
              idempotency_key: `consumption_quota:approve:${consumptionId}`,
              counterpart_account_id: mintAccount.account_id,
              meta: {
                reference_type: 'consumption',
                reference_id: consumptionId,
                consumption_amount: record.consumption_amount,
                quota_ratio: effectiveRatio,
                description: `消费${record.consumption_amount}元，发放星石配额${quotaAmount}`
              }
            },
            { transaction }
          )
          starStoneQuotaAllocated = quotaAmount
        }
      }
    } catch (quotaError) {
      logger.error(`[消费审核回调] 星石配额发放失败（非致命）: ${quotaError.message}`)
    }

    // 5. 审计日志
    try {
      await AuditLogService.logOperation({
        operator_id: auditRecord.auditor_id,
        operation_type: 'consumption_audit',
        target_type: 'ContentReviewRecord',
        target_id: auditRecord.content_review_record_id,
        action: 'approve',
        changes: {
          audit_status: 'approved',
          points_awarded: record.points_to_award
        },
        details: {
          consumption_record_id: consumptionId,
          amount: record.consumption_amount,
          points_to_award: record.points_to_award,
          budget_points_allocated: budgetPointsAllocated,
          star_stone_quota_allocated: starStoneQuotaAllocated,
          source: 'approval_chain_callback'
        },
        reason: auditRecord.audit_reason || '审核通过',
        idempotency_key: `consumption_audit:chain_approve:${consumptionId}`,
        transaction
      })
    } catch (auditError) {
      logger.error(`[消费审核回调] 审计日志失败（非致命）: ${auditError.message}`)
    }

    logger.info(
      `✅ [消费审核回调] 审核通过完成: consumption_id=${consumptionId}, 积分=${record.points_to_award}, 预算=${budgetPointsAllocated}, 配额=${starStoneQuotaAllocated}`
    )

    return {
      success: true,
      consumption_record_id: consumptionId,
      points_awarded: record.points_to_award,
      budget_points_allocated: budgetPointsAllocated,
      star_stone_quota_allocated: starStoneQuotaAllocated
    }
  },

  /**
   * 审核拒绝回调 — 更新消费记录状态为 rejected
   *
   * @param {number} consumptionId - 消费记录ID
   * @param {Object} auditRecord - 审核记录
   * @param {Object} transaction - 数据库事务
   * @returns {Promise<Object>} 回调处理结果
   */
  async rejected(consumptionId, auditRecord, transaction) {
    logger.info(`[消费审核回调] 审核拒绝: consumption_id=${consumptionId}`)

    const record = await ConsumptionRecord.findByPk(consumptionId, {
      transaction,
      lock: transaction.LOCK.UPDATE
    })

    if (!record) {
      throw new Error(`消费记录不存在（ID: ${consumptionId}）`)
    }

    if (record.status !== 'pending') {
      logger.warn(`[消费审核回调] 消费记录状态不是 pending: status=${record.status}，跳过回调`)
      return { success: true, message: `消费记录状态已为 ${record.status}，无需重复处理` }
    }

    await record.update(
      {
        status: 'rejected',
        reviewed_by: auditRecord.auditor_id,
        reviewed_at: BeijingTimeHelper.createDatabaseTime(),
        admin_notes: auditRecord.audit_reason || '审核拒绝',
        final_status: 'rejected',
        settled_at: BeijingTimeHelper.createDatabaseTime(),
        updated_at: BeijingTimeHelper.createDatabaseTime()
      },
      { transaction }
    )

    try {
      await AuditLogService.logOperation({
        operator_id: auditRecord.auditor_id,
        operation_type: 'consumption_audit',
        target_type: 'ContentReviewRecord',
        target_id: auditRecord.content_review_record_id,
        action: 'reject',
        changes: { audit_status: 'rejected' },
        details: {
          consumption_record_id: consumptionId,
          amount: record.consumption_amount,
          source: 'approval_chain_callback'
        },
        reason: auditRecord.audit_reason || '审核拒绝',
        idempotency_key: `consumption_audit:chain_reject:${consumptionId}`,
        transaction
      })
    } catch (auditError) {
      logger.error(`[消费审核回调] 审计日志失败（非致命）: ${auditError.message}`)
    }

    logger.info(`✅ [消费审核回调] 审核拒绝完成: consumption_id=${consumptionId}`)

    return {
      success: true,
      consumption_record_id: consumptionId,
      message: '消费审核拒绝'
    }
  }
}
