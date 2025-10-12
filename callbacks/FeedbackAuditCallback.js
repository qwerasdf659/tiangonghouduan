/**
 * 反馈审核回调处理器
 *
 * 功能说明：
 * - 处理用户反馈审核通过后的业务逻辑
 * - 处理用户反馈审核拒绝后的处理
 *
 * 业务流程：
 * - 审核通过：更新反馈状态 → 发送通知
 * - 审核拒绝：更新反馈状态 → 发送通知
 *
 * 创建时间：2025-10-11
 */

const { Feedback } = require('../models')
const NotificationService = require('../services/NotificationService')
const BeijingTimeHelper = require('../utils/timeHelper')

module.exports = {
  /**
   * 审核通过回调
   *
   * @param {number} feedbackId - 反馈ID
   * @param {Object} auditRecord - 审核记录
   * @param {Object} transaction - 数据库事务
   */
  async approved (feedbackId, auditRecord, transaction) {
    console.log(`[反馈审核回调] 审核通过: feedback_id=${feedbackId}`)

    try {
      // 1. 获取反馈记录
      const feedback = await Feedback.findByPk(feedbackId, { transaction })

      if (!feedback) {
        throw new Error(`反馈记录不存在: feedback_id=${feedbackId}`)
      }

      // 2. 更新反馈状态（审核通过后进入处理流程）
      await feedback.update({
        status: 'processing', // 审核通过后进入处理中状态
        admin_id: auditRecord.auditor_id,
        internal_notes: `${feedback.internal_notes || ''}\n\n[审核通过] ${auditRecord.audit_reason || ''}`.trim()
      }, { transaction })

      console.log(`[反馈审核回调] 反馈状态已更新: feedback_id=${feedbackId}, status=processing`)

      // 3. 发送审核通过通知
      try {
        await NotificationService.sendAuditApprovedNotification(
          feedback.user_id,
          {
            type: 'feedback',
            feedback_id: feedbackId,
            category: feedback.category
          },
          { transaction }
        )
      } catch (notifyError) {
        console.warn(`[反馈审核回调] 发送通知失败: ${notifyError.message}`)
      }

      console.log(`[反馈审核回调] 审核通过处理完成: feedback_id=${feedbackId}`)

      return {
        success: true
      }
    } catch (error) {
      console.error(`[反馈审核回调] 审核通过处理失败: ${error.message}`)
      throw error
    }
  },

  /**
   * 审核拒绝回调
   *
   * @param {number} feedbackId - 反馈ID
   * @param {Object} auditRecord - 审核记录
   * @param {Object} transaction - 数据库事务
   */
  async rejected (feedbackId, auditRecord, transaction) {
    console.log(`[反馈审核回调] 审核拒绝: feedback_id=${feedbackId}`)

    try {
      // 1. 获取反馈记录
      const feedback = await Feedback.findByPk(feedbackId, { transaction })

      if (!feedback) {
        throw new Error(`反馈记录不存在: feedback_id=${feedbackId}`)
      }

      // 2. 更新反馈状态（审核拒绝后直接关闭）
      await feedback.update({
        status: 'closed', // 审核拒绝后直接关闭
        admin_id: auditRecord.auditor_id,
        reply_content: `您的反馈未通过审核。原因：${auditRecord.audit_reason}`,
        replied_at: BeijingTimeHelper.createDatabaseTime(),
        internal_notes: `${feedback.internal_notes || ''}\n\n[审核拒绝] ${auditRecord.audit_reason}`.trim()
      }, { transaction })

      console.log(`[反馈审核回调] 反馈状态已更新: feedback_id=${feedbackId}, status=closed`)

      // 3. 发送审核拒绝通知
      try {
        await NotificationService.sendAuditRejectedNotification(
          feedback.user_id,
          {
            type: 'feedback',
            feedback_id: feedbackId,
            reason: auditRecord.audit_reason
          },
          { transaction }
        )
      } catch (notifyError) {
        console.warn(`[反馈审核回调] 发送通知失败: ${notifyError.message}`)
      }

      console.log(`[反馈审核回调] 审核拒绝处理完成: feedback_id=${feedbackId}`)

      return {
        success: true
      }
    } catch (error) {
      console.error(`[反馈审核回调] 审核拒绝处理失败: ${error.message}`)
      throw error
    }
  }
}
