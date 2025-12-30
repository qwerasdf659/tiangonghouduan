/**
 * 图片资源审核回调处理器
 *
 * 功能说明：
 * - 处理图片资源审核通过后的业务逻辑
 * - 处理图片资源审核拒绝后的处理
 *
 * 业务流程：
 * - 审核通过：更新图片资源状态 → 发放积分奖励（如果有）
 * - 审核拒绝：更新图片资源状态 → 发送通知
 *
 * 创建时间：2025-10-11
 */

const { ImageResources } = require('../models')
const AssetService = require('../services/AssetService')
const NotificationService = require('../services/NotificationService')
const BeijingTimeHelper = require('../utils/timeHelper')

module.exports = {
  /**
   * 审核通过回调
   *
   * @param {number} imageId - 图片资源ID
   * @param {Object} auditRecord - 审核记录
   * @param {Object} transaction - 数据库事务
   * @returns {Promise<{success: boolean, points_awarded: number}>} 回调处理结果（含发放积分数量）
   */
  async approved(imageId, auditRecord, transaction) {
    console.log(`[图片审核回调] 审核通过: image_id=${imageId}`)

    try {
      // 1. 获取图片资源记录
      const image = await ImageResources.findByPk(imageId, { transaction })

      if (!image) {
        throw new Error(`图片资源不存在: image_id=${imageId}`)
      }

      // 2. 更新图片资源审核状态
      await image.update(
        {
          review_status: 'approved',
          reviewer_id: auditRecord.auditor_id,
          review_reason: auditRecord.audit_reason,
          reviewed_at: BeijingTimeHelper.createDatabaseTime()
        },
        { transaction }
      )

      console.log(`[图片审核回调] 图片状态已更新: image_id=${imageId}, status=approved`)

      // 3. 发放积分奖励（如果有配置）
      if (image.points_awarded && image.points_awarded > 0) {
        await AssetService.changeBalance(
          {
            user_id: image.uploaded_by,
            asset_code: 'POINTS',
            delta_amount: image.points_awarded,
            business_type: 'reward',
            idempotency_key: `image_reward_${imageId}`,
            meta: {
              source_type: 'image_review',
              title: '图片审核通过奖励',
              description: `图片${imageId}审核通过，奖励${image.points_awarded}积分`,
              operator_id: auditRecord.auditor_id
            }
          },
          { transaction }
        )

        console.log(
          `[图片审核回调] 积分奖励已发放: user_id=${image.uploaded_by}, points=${image.points_awarded}`
        )
      }

      // 4. 发送审核通过通知
      try {
        await NotificationService.sendAuditApprovedNotification(
          image.uploaded_by,
          {
            type: 'image',
            image_id: imageId,
            points_awarded: image.points_awarded || 0
          },
          { transaction }
        )
      } catch (notifyError) {
        console.warn(`[图片审核回调] 发送通知失败: ${notifyError.message}`)
      }

      console.log(`[图片审核回调] 审核通过处理完成: image_id=${imageId}`)

      return {
        success: true,
        points_awarded: image.points_awarded || 0
      }
    } catch (error) {
      console.error(`[图片审核回调] 审核通过处理失败: ${error.message}`)
      throw error
    }
  },

  /**
   * 审核拒绝回调
   *
   * @param {number} imageId - 图片资源ID
   * @param {Object} auditRecord - 审核记录
   * @param {Object} transaction - 数据库事务
   * @returns {Promise<{success: boolean}>} 回调处理结果（success=true 表示处理完成）
   */
  async rejected(imageId, auditRecord, transaction) {
    console.log(`[图片审核回调] 审核拒绝: image_id=${imageId}`)

    try {
      // 1. 获取图片资源记录
      const image = await ImageResources.findByPk(imageId, { transaction })

      if (!image) {
        throw new Error(`图片资源不存在: image_id=${imageId}`)
      }

      // 2. 更新图片资源审核状态
      await image.update(
        {
          review_status: 'rejected',
          reviewer_id: auditRecord.auditor_id,
          review_reason: auditRecord.audit_reason,
          reviewed_at: BeijingTimeHelper.createDatabaseTime()
        },
        { transaction }
      )

      console.log(`[图片审核回调] 图片状态已更新: image_id=${imageId}, status=rejected`)

      // 3. 发送审核拒绝通知
      try {
        await NotificationService.sendAuditRejectedNotification(
          image.uploaded_by,
          {
            type: 'image',
            image_id: imageId,
            reason: auditRecord.audit_reason
          },
          { transaction }
        )
      } catch (notifyError) {
        console.warn(`[图片审核回调] 发送通知失败: ${notifyError.message}`)
      }

      console.log(`[图片审核回调] 审核拒绝处理完成: image_id=${imageId}`)

      return {
        success: true
      }
    } catch (error) {
      console.error(`[图片审核回调] 审核拒绝处理失败: ${error.message}`)
      throw error
    }
  }
}
