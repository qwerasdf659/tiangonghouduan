/**
 * 客服工作台 - 补偿工具 Composable
 *
 * @file admin/src/modules/content/composables/cs-compensation.js
 * @description 来自游戏GM模型，解决问题的终极手段
 * 在事务中发放资产/物品补偿，自动记录审计日志
 */

import { logger } from '../../../utils/logger.js'
import { ContentAPI } from '../../../api/content.js'

/**
 * 补偿工具状态
 * @returns {Object} 状态对象
 */
export function useCsCompensationState() {
  return {
    showCompensationModal: false,
    compensationSubmitting: false,
    compensationForm: {
      user_id: null,
      session_id: null,
      issue_id: null,
      reason: '',
      items: []
    }
  }
}

/**
 * 补偿工具方法
 * @returns {Object} 方法对象
 */
export function useCsCompensationMethods() {
  return {
    /**
     * 打开补偿弹窗
     * @param {number} userId - 目标用户ID
     * @param {number} [sessionId] - 关联会话ID
     * @param {number} [issueId] - 关联工单ID
     */
    openCompensationModal(userId, sessionId, issueId) {
      this.compensationForm = {
        user_id: userId,
        session_id: sessionId || null,
        issue_id: issueId || null,
        reason: '',
        items: [{ type: 'asset', asset_code: 'DIAMOND', amount: 0 }]
      }
      this.showCompensationModal = true
    },

    /** 关闭补偿弹窗 */
    closeCompensationModal() {
      this.showCompensationModal = false
      this.compensationForm = { user_id: null, session_id: null, issue_id: null, reason: '', items: [] }
    },

    /** 添加补偿项 */
    addCompensationItem() {
      this.compensationForm.items.push({ type: 'asset', asset_code: 'DIAMOND', amount: 0 })
    },

    /**
     * 移除补偿项
     * @param {number} index - 项目索引
     */
    removeCompensationItem(index) {
      this.compensationForm.items.splice(index, 1)
    },

    /** 提交补偿 */
    async submitCompensation() {
      const { user_id, reason, items, session_id, issue_id } = this.compensationForm

      if (!user_id) { this.showError('用户ID不能为空'); return }
      if (!reason.trim()) { this.showError('请填写补偿原因'); return }
      if (!items.length || items.every(i => !i.amount || i.amount <= 0)) {
        this.showError('请至少添加一项有效补偿')
        return
      }

      this.compensationSubmitting = true
      try {
        const response = await ContentAPI.compensateUser({
          user_id,
          reason: reason.trim(),
          items: items.filter(i => i.amount > 0),
          session_id,
          issue_id
        })

        if (response?.success) {
          this.showSuccess('补偿发放成功')
          this.closeCompensationModal()
          /* 刷新用户资产数据 */
          if (this.contextUserId === user_id) {
            this.contextAssets = null
            this.loadContextTabData('assets')
          }
        } else {
          this.showError(response?.message || '补偿发放失败')
        }
      } catch (error) {
        logger.error('补偿发放失败:', error)
        this.showError(error.message || '补偿发放失败')
      } finally {
        this.compensationSubmitting = false
      }
    }
  }
}
