/**
 * 客服工单弹窗组件
 *
 * @file admin/src/modules/content/components/cs-issue-modal.js
 * @description 客服工作台C区工单创建/详情弹窗，
 *              依赖 cs-issues composable 提供的状态和方法
 * @version 1.0.0
 * @date 2026-02-23
 */

import { logger } from '../../../utils/logger.js'

/**
 * 初始化工单弹窗（在客服工作台 Alpine 组件中调用）
 *
 * @param {Object} ctx - Alpine 组件上下文（this），需要包含 cs-issues composable
 * @returns {Object} 弹窗控制方法
 */
export function initIssueModal(ctx) {
  return {
    /**
     * 打开创建工单弹窗
     * @param {number} sessionId - 关联的客服会话 ID
     * @param {number} userId - 目标用户 ID
     */
    openCreateIssueModal(sessionId, userId) {
      if (typeof ctx.openCreateIssue === 'function') {
        ctx.openCreateIssue(sessionId, userId)
      } else {
        logger.warn('[IssueModal] cs-issues composable 未混入')
      }
    },

    /**
     * 打开工单详情弹窗
     * @param {number} issueId - 工单 ID
     */
    openIssueDetailModal(issueId) {
      if (typeof ctx.openIssueDetail === 'function') {
        ctx.openIssueDetail(issueId)
      } else {
        logger.warn('[IssueModal] cs-issues composable 未混入')
      }
    },

    /**
     * 关闭工单弹窗
     */
    closeIssueModal() {
      if (typeof ctx.closeIssue === 'function') {
        ctx.closeIssue()
      }
    }
  }
}
