/**
 * 商家积分审核回调（MerchantPointsAuditCallback）
 *
 * 功能说明：
 * - 处理商家积分申请审核通过/拒绝后的业务回调
 * - 由 ContentAuditEngine 在审核状态变更时自动触发
 * - 调用 MerchantPointsService 完成实际业务逻辑
 *
 * 设计模式：
 * - 回调作为审核引擎与业务服务之间的桥梁
 * - 业务逻辑实现在 MerchantPointsService 中
 * - 回调只负责调用服务方法，不包含复杂业务逻辑
 *
 * 回调参数说明：
 * - merchantPointsId: 对应 ContentReviewRecord.audit_id（审核记录ID）
 * - auditRecord: ContentReviewRecord 实例，包含审核详情
 * - transaction: 数据库事务对象，确保原子性
 *
 * 创建时间：2026年01月09日
 * 作者：AI Assistant
 */

const { logger } = require('../utils/logger')
const MerchantPointsService = require('../services/MerchantPointsService')

module.exports = {
  /**
   * 审核通过回调
   *
   * @description 商家积分申请审核通过后触发，发放积分给商家
   *
   * @param {number} auditableId - 审核记录ID（audit_id）
   * @param {Object} auditRecord - 审核记录对象（ContentReviewRecord实例）
   * @param {number} auditRecord.audit_id - 审核记录ID
   * @param {number} auditRecord.auditor_id - 审核员ID
   * @param {Object} auditRecord.audit_data - 审核数据（包含积分数量等）
   * @param {Object} transaction - 数据库事务对象
   * @returns {Promise<{success: boolean, message: string}>} 回调处理结果
   * @throws {Error} 处理失败时抛出错误，触发事务回滚
   */
  async approved(auditableId, auditRecord, transaction) {
    // 注意：第一个参数是 auditable_id（用户ID），audit_id 从 auditRecord 获取
    const auditId = auditRecord.audit_id
    logger.info(`[商家积分审核回调] 审核通过回调触发: audit_id=${auditId}, auditable_id=${auditableId}`)

    try {
      // 调用 MerchantPointsService 处理审核通过的业务逻辑
      // 传递 audit_id（审核记录ID），而不是 auditable_id（用户ID）
      await MerchantPointsService.processApprovedApplication(
        auditId,
        auditRecord.auditor_id,
        { transaction }
      )

      return {
        success: true,
        message: '商家积分审核通过回调处理成功'
      }
    } catch (error) {
      logger.error(
        `[商家积分审核回调] 审核通过回调处理失败: audit_id=${auditId}, error=${error.message}`
      )
      // 抛出错误，让上层事务回滚
      throw error
    }
  },

  /**
   * 审核拒绝回调
   *
   * @description 商家积分申请审核拒绝后触发，记录拒绝原因
   *
   * @param {number} auditableId - 审核记录ID（audit_id）
   * @param {Object} auditRecord - 审核记录对象（ContentReviewRecord实例）
   * @param {number} auditRecord.audit_id - 审核记录ID
   * @param {number} auditRecord.auditor_id - 审核员ID
   * @param {string} auditRecord.audit_reason - 拒绝原因
   * @param {Object} transaction - 数据库事务对象
   * @returns {Promise<{success: boolean, message: string}>} 回调处理结果
   * @throws {Error} 处理失败时抛出错误，触发事务回滚
   */
  async rejected(auditableId, auditRecord, transaction) {
    // 注意：第一个参数是 auditable_id（用户ID），audit_id 从 auditRecord 获取
    const auditId = auditRecord.audit_id
    logger.info(
      `[商家积分审核回调] 审核拒绝回调触发: audit_id=${auditId}, auditable_id=${auditableId}, reason=${auditRecord?.audit_reason || '未提供原因'}`
    )

    try {
      // 调用 MerchantPointsService 处理审核拒绝的业务逻辑
      // 传递 audit_id（审核记录ID），而不是 auditable_id（用户ID）
      await MerchantPointsService.processRejectedApplication(
        auditId,
        auditRecord.auditor_id,
        auditRecord.audit_reason || '未提供拒绝原因',
        { transaction }
      )

      return {
        success: true,
        message: '商家积分审核拒绝回调处理成功'
      }
    } catch (error) {
      logger.error(
        `[商家积分审核回调] 审核拒绝回调处理失败: audit_id=${auditId}, error=${error.message}`
      )
      // 抛出错误，让上层事务回滚
      throw error
    }
  }
}
