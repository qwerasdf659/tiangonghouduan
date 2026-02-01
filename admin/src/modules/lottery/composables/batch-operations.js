/**
 * 批量操作模块
 *
 * @file admin/src/modules/lottery/composables/batch-operations.js
 * @description P3优先级 - 批量操作工具（赠送次数、状态切换、预算调整等）
 * @version 1.0.0
 * @date 2026-01-29
 */

import { logger } from '../../../utils/logger.js'
import { LOTTERY_ENDPOINTS } from '../../../api/lottery/index.js'
import { buildQueryString } from '../../../api/base.js'

/**
 * 批量操作状态
 * @returns {Object} 状态对象
 */
export function useBatchOperationsState() {
  return {
    // 批量操作相关
    /** @type {boolean} 显示批量操作面板 */
    showBatchOperationsPanel: false,
    /** @type {string} 当前批量操作类型 */
    currentBatchOperation: '', // quota-grant, campaign-status, budget-adjust
    /** @type {boolean} 正在执行批量操作 */
    executingBatchOperation: false,

    // 批量赠送抽奖次数
    /** @type {Object} 批量赠送表单 */
    batchQuotaGrantForm: {
      campaign_id: '',
      user_ids: '',
      bonus_count: 1,
      reason: ''
    },

    // 批量活动状态切换
    /** @type {Object} 批量状态切换表单 */
    batchCampaignStatusForm: {
      campaign_ids: [],
      target_status: 'active', // active, paused, ended
      reason: ''
    },

    // 批量预算调整
    /** @type {Object} 批量预算调整表单 */
    batchBudgetAdjustForm: {
      campaign_ids: [],
      adjust_type: 'add', // add, set
      amount: 0,
      reason: ''
    },

    // 批量操作结果
    /** @type {Object|null} 批量操作结果 */
    batchOperationResult: null,

    // 批量操作日志
    /** @type {Array<Object>} 批量操作日志列表 */
    batchOperationLogs: [],
    /** @type {boolean} 日志加载状态 */
    loadingBatchLogs: false,
    /** @type {Object} 日志分页 */
    batchLogsPagination: {
      current_page: 1,
      page_size: 10,
      total_count: 0,
      total_pages: 0
    }
  }
}

/**
 * 批量操作方法
 * @returns {Object} 方法对象
 */
export function useBatchOperationsMethods() {
  return {
    /**
     * 打开批量操作面板
     * @param {string} operationType - 操作类型
     */
    openBatchOperationsPanel(operationType = 'quota-grant') {
      this.currentBatchOperation = operationType
      this.showBatchOperationsPanel = true
      this.batchOperationResult = null
      this.resetBatchForms()
    },

    /**
     * 关闭批量操作面板
     */
    closeBatchOperationsPanel() {
      this.showBatchOperationsPanel = false
      this.currentBatchOperation = ''
      this.batchOperationResult = null
    },

    /**
     * 重置批量操作表单
     */
    resetBatchForms() {
      this.batchQuotaGrantForm = {
        campaign_id: '',
        user_ids: '',
        bonus_count: 1,
        reason: ''
      }
      this.batchCampaignStatusForm = {
        campaign_ids: [],
        target_status: 'active',
        reason: ''
      }
      this.batchBudgetAdjustForm = {
        campaign_ids: [],
        adjust_type: 'add',
        amount: 0,
        reason: ''
      }
    },

    /**
     * 执行批量赠送抽奖次数
     */
    async executeBatchQuotaGrant() {
      const form = this.batchQuotaGrantForm

      // 验证
      if (!form.campaign_id) {
        this.showError('请选择活动')
        return
      }
      if (!form.user_ids.trim()) {
        this.showError('请输入用户ID列表')
        return
      }
      if (!form.bonus_count || form.bonus_count < 1) {
        this.showError('请输入有效的赠送次数')
        return
      }
      if (!form.reason.trim()) {
        this.showError('请输入赠送原因')
        return
      }

      // 解析用户ID列表（支持逗号、换行、空格分隔）
      const userIds = form.user_ids
        .split(/[,\n\s]+/)
        .map(id => parseInt(id.trim()))
        .filter(id => !isNaN(id) && id > 0)

      if (userIds.length === 0) {
        this.showError('用户ID列表格式不正确')
        return
      }

      if (userIds.length > 100) {
        this.showError('单次最多支持100个用户')
        return
      }

      this.executingBatchOperation = true
      try {
        const response = await this.apiPost(
          LOTTERY_ENDPOINTS.BATCH_QUOTA_GRANT,
          {
            campaign_id: parseInt(form.campaign_id),
            user_ids: userIds,
            bonus_count: parseInt(form.bonus_count),
            reason: form.reason.trim()
          },
          { showLoading: true }
        )

        if (response?.success) {
          this.batchOperationResult = response.data
          this.showSuccess(
            `批量赠送完成：成功 ${response.data.success_count}/${response.data.total_count}`
          )
          logger.info('[BatchOps] 批量赠送成功', response.data)
        } else {
          this.showError('批量赠送失败: ' + (response?.message || '未知错误'))
        }
      } catch (error) {
        logger.error('[BatchOps] 批量赠送失败:', error)
        this.showError('批量赠送失败: ' + (error.message || '网络错误'))
      } finally {
        this.executingBatchOperation = false
      }
    },

    /**
     * 执行批量活动状态切换
     */
    async executeBatchCampaignStatus() {
      const form = this.batchCampaignStatusForm

      if (!form.campaign_ids || form.campaign_ids.length === 0) {
        this.showError('请选择至少一个活动')
        return
      }
      if (!form.target_status) {
        this.showError('请选择目标状态')
        return
      }
      if (!form.reason.trim()) {
        this.showError('请输入操作原因')
        return
      }

      this.executingBatchOperation = true
      try {
        const response = await this.apiPost(
          LOTTERY_ENDPOINTS.BATCH_CAMPAIGN_STATUS,
          {
            campaign_ids: form.campaign_ids.map(id => parseInt(id)),
            target_status: form.target_status,
            reason: form.reason.trim()
          },
          { showLoading: true }
        )

        if (response?.success) {
          this.batchOperationResult = response.data
          this.showSuccess(
            `批量状态切换完成：成功 ${response.data.success_count}/${response.data.total_count}`
          )
          logger.info('[BatchOps] 批量状态切换成功', response.data)
          // 刷新活动列表
          await this.loadCampaigns?.()
        } else {
          this.showError('批量状态切换失败: ' + (response?.message || '未知错误'))
        }
      } catch (error) {
        logger.error('[BatchOps] 批量状态切换失败:', error)
        this.showError('批量状态切换失败: ' + (error.message || '网络错误'))
      } finally {
        this.executingBatchOperation = false
      }
    },

    /**
     * 执行批量预算调整
     */
    async executeBatchBudgetAdjust() {
      const form = this.batchBudgetAdjustForm

      if (!form.campaign_ids || form.campaign_ids.length === 0) {
        this.showError('请选择至少一个活动')
        return
      }
      if (!form.adjust_type) {
        this.showError('请选择调整类型')
        return
      }
      if (form.amount === undefined || form.amount === null) {
        this.showError('请输入调整金额')
        return
      }
      if (!form.reason.trim()) {
        this.showError('请输入操作原因')
        return
      }

      this.executingBatchOperation = true
      try {
        const response = await this.apiPost(
          LOTTERY_ENDPOINTS.BATCH_BUDGET_ADJUST,
          {
            campaign_ids: form.campaign_ids.map(id => parseInt(id)),
            adjust_type: form.adjust_type,
            amount: parseFloat(form.amount),
            reason: form.reason.trim()
          },
          { showLoading: true }
        )

        if (response?.success) {
          this.batchOperationResult = response.data
          this.showSuccess(
            `批量预算调整完成：成功 ${response.data.success_count}/${response.data.total_count}`
          )
          logger.info('[BatchOps] 批量预算调整成功', response.data)
        } else {
          this.showError('批量预算调整失败: ' + (response?.message || '未知错误'))
        }
      } catch (error) {
        logger.error('[BatchOps] 批量预算调整失败:', error)
        this.showError('批量预算调整失败: ' + (error.message || '网络错误'))
      } finally {
        this.executingBatchOperation = false
      }
    },

    /**
     * 加载批量操作日志
     */
    async loadBatchOperationLogs() {
      this.loadingBatchLogs = true
      try {
        const params = {
          page: this.batchLogsPagination.current_page,
          page_size: this.batchLogsPagination.page_size
        }
        const queryString = buildQueryString(params)
        const response = await this.apiGet(
          `${LOTTERY_ENDPOINTS.BATCH_OPERATION_LOGS}${queryString}`,
          {},
          { showLoading: false }
        )

        if (response?.success) {
          this.batchOperationLogs = response.data.logs || []
          this.batchLogsPagination = response.data.pagination || this.batchLogsPagination
          logger.info('[BatchOps] 批量操作日志加载成功')
        } else {
          this.showError('加载批量操作日志失败')
        }
      } catch (error) {
        logger.error('[BatchOps] 加载批量操作日志失败:', error)
        this.showError('加载批量操作日志失败')
      } finally {
        this.loadingBatchLogs = false
      }
    },

    /**
     * 切换活动选中状态（用于批量操作）
     * @param {number} campaignId - 活动ID
     */
    toggleCampaignSelection(campaignId) {
      const index = this.batchCampaignStatusForm.campaign_ids.indexOf(campaignId)
      if (index > -1) {
        this.batchCampaignStatusForm.campaign_ids.splice(index, 1)
      } else {
        this.batchCampaignStatusForm.campaign_ids.push(campaignId)
      }
      // 同步到预算调整表单
      this.batchBudgetAdjustForm.campaign_ids = [...this.batchCampaignStatusForm.campaign_ids]
    },

    /**
     * 全选/取消全选活动
     * @param {boolean} selectAll - 是否全选
     */
    toggleAllCampaignsSelection(selectAll) {
      if (selectAll) {
        const allIds = this.campaigns.map(c => c.campaign_id)
        this.batchCampaignStatusForm.campaign_ids = allIds
        this.batchBudgetAdjustForm.campaign_ids = [...allIds]
      } else {
        this.batchCampaignStatusForm.campaign_ids = []
        this.batchBudgetAdjustForm.campaign_ids = []
      }
    },

    /**
     * 检查活动是否被选中
     * @param {number} campaignId - 活动ID
     * @returns {boolean} 是否选中
     */
    isCampaignSelected(campaignId) {
      return this.batchCampaignStatusForm.campaign_ids.includes(campaignId)
    },

    /**
     * 获取批量操作类型文本
     * @param {string} type - 操作类型
     * @returns {string} 文本
     */
    getBatchOperationTypeText(type) {
      const map = {
        'quota-grant': '批量赠送抽奖次数',
        'campaign-status': '批量状态切换',
        'budget-adjust': '批量预算调整',
        'preset-rules': '批量设置干预规则',
        'redemption-verify': '批量核销确认'
      }
      return map[type] || type
    },

    /**
     * 获取状态文本
     * @param {string} status - 状态
     * @returns {string} 文本
     */
    getCampaignStatusText(status) {
      const map = {
        active: '进行中',
        paused: '已暂停',
        ended: '已结束',
        pending: '待开始'
      }
      return map[status] || status
    },

    /**
     * 格式化批量操作时间
     * @param {string} isoString - ISO时间字符串
     * @returns {string} 格式化时间
     */
    formatBatchOperationTime(isoString) {
      if (!isoString) return '-'
      const date = new Date(isoString)
      return date.toLocaleString('zh-CN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
        timeZone: 'Asia/Shanghai'
      })
    }
  }
}

export default { useBatchOperationsState, useBatchOperationsMethods }
