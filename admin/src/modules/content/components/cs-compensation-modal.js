/**
 * 客服补偿弹窗组件
 *
 * @file admin/src/modules/content/components/cs-compensation-modal.js
 * @description 客服工作台C区补偿操作弹窗（资产/物品发放），
 *              依赖 cs-compensation composable 提供的状态和方法
 * @version 1.0.0
 * @date 2026-02-23
 */

import { logger } from '../../../utils/logger.js'

/**
 * 初始化补偿弹窗（在客服工作台 Alpine 组件中调用）
 *
 * @param {Object} ctx - Alpine 组件上下文（this），需要包含 compensation composable
 * @returns {Object} 弹窗控制方法
 */
export function initCompensationModal(ctx) {
  return {
    /**
     * 打开补偿弹窗
     * @param {number} userId - 目标用户 ID
     * @param {number} sessionId - 关联的客服会话 ID
     */
    openCompensationModal(userId, sessionId) {
      if (typeof ctx.openCompensation === 'function') {
        ctx.openCompensation(userId, sessionId)
      } else {
        logger.warn('[CompensationModal] cs-compensation composable 未混入')
      }
    },

    /**
     * 关闭补偿弹窗
     */
    closeCompensationModal() {
      if (typeof ctx.closeCompensation === 'function') {
        ctx.closeCompensation()
      }
    }
  }
}
