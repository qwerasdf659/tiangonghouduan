/**
 * 客服工作台 - 一键诊断 Composable
 *
 * @file admin/src/modules/content/composables/cs-diagnosis.js
 * @description 来自游戏GM模型，效率提升最大的功能
 * 并行检查用户5个模块状态（资产/交易/物品/抽奖/账号），2-3秒内返回结果
 */

import { logger } from '../../../utils/logger.js'
import { ContentAPI } from '../../../api/content.js'

/**
 * 一键诊断状态
 * @returns {Object} 状态对象
 */
export function useCsDiagnosisState() {
  return {
    diagnosisResult: null,
    diagnosisLoading: false,
    diagnosisUserId: null
  }
}

/**
 * 一键诊断方法
 * @returns {Object} 方法对象
 */
export function useCsDiagnosisMethods() {
  return {
    /**
     * 执行一键诊断
     * @param {number} userId - 用户ID
     */
    async runDiagnosis(userId) {
      if (!userId) {
        this.showError('请先选择一个用户')
        return
      }

      this.diagnosisLoading = true
      this.diagnosisUserId = userId
      try {
        const response = await ContentAPI.diagnoseUser(userId)
        if (response?.success) {
          this.diagnosisResult = response.data
          logger.info('一键诊断完成', response.data)
        } else {
          this.showError(response?.message || '诊断执行失败')
        }
      } catch (error) {
        logger.error('一键诊断失败:', error)
        this.showError(error.message || '诊断执行失败')
      } finally {
        this.diagnosisLoading = false
      }
    },

    /** 清空诊断结果 */
    clearDiagnosis() {
      this.diagnosisResult = null
      this.diagnosisUserId = null
    },

    /**
     * 获取诊断检查项的状态图标
     * @param {string} status - ok/warning/error
     * @returns {string} 状态图标文本
     */
    getDiagnosisIcon(status) {
      const icons = {
        ok: '✅',
        warning: '⚠️',
        error: '🔴'
      }
      return icons[status] || '❓'
    },

    /**
     * 获取诊断检查项的CSS类
     * @param {string} status - ok/warning/error
     * @returns {string} Tailwind CSS 类名
     */
    getDiagnosisClass(status) {
      const classes = {
        ok: 'text-green-600',
        warning: 'text-yellow-600',
        error: 'text-red-600'
      }
      return classes[status] || 'text-gray-600'
    },

    /**
     * 统计诊断中发现的问题数
     * @returns {number} 问题总数（warning + error）
     */
    get diagnosisIssueCount() {
      if (!this.diagnosisResult?.checks) return 0
      return this.diagnosisResult.checks.filter(c => c.status !== 'ok').length
    }
  }
}
