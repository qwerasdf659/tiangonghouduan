/**
 * 消费记录模块
 *
 * @file admin/src/modules/analytics/composables/consumption.js
 * @description 用户消费流水查询和统计
 * @version 1.0.0
 * @date 2026-01-24
 */

import { logger } from '../../../utils/logger.js'
import { STORE_ENDPOINTS } from '../../../api/store.js'
import { buildURL } from '../../../api/base.js'

/**
 * 消费记录状态
 * @returns {Object} 状态对象
 */
export function useConsumptionState() {
  return {
    /** @type {Array} 消费记录列表 */
    consumptions: [],
    /** @type {Object} 消费记录筛选条件 */
    consumptionFilters: {
      user_id: '',
      status: '',
      payment_method: '',
      start_date: '',
      end_date: '',
      anomaly_type: ''  // F-41: 异常类型筛选
    },
    // ========== F-43: 异常统计面板状态 ==========
    /** @type {Object} 异常统计数据 */
    anomalyStats: {
      total_anomaly: 0,
      high_frequency: 0,
      high_amount: 0,
      unusual_time: 0,
      other: 0
    },
    /** @type {Object} 消费统计 */
    consumptionStats: { total: 0, totalAmount: 0, pendingCount: 0, todayCount: 0 },
    /** @type {Object|null} 选中的消费记录详情 */
    selectedConsumption: null,
    /** @type {Object} 财务汇总统计（用于财务统计页面） */
    financeStats: { todayRevenue: 0, monthRevenue: 0, pendingCount: 0, totalDebt: 0 },
    /** @type {Object} 拒绝表单 */
    rejectForm: { reason: '' },
    // ========== 批量操作状态（P0-4） ==========
    /** @type {Array} 选中的记录ID列表 */
    selectedIds: [],
    /** @type {boolean} 是否全选 */
    isAllSelected: false,
    /** @type {boolean} 批量操作进行中 */
    batchProcessing: false,
    /** @type {Object|null} 批量操作结果 */
    batchResult: null
  }
}

/**
 * 消费记录方法
 * @returns {Object} 方法对象
 */
export function useConsumptionMethods() {
  return {
    /**
     * 加载消费记录
     * 后端接口: GET /api/v4/console/consumption/records
     * 返回: { records: [...], pagination: {...}, statistics: {...} }
     */
    async loadConsumptions() {
      try {
        const params = new URLSearchParams()
        params.append('page', this.financePagination?.page || 1)
        params.append('page_size', this.financePagination?.page_size || 20)
        // 使用后端字段名 user_id
        if (this.consumptionFilters.user_id) {
          params.append('search', this.consumptionFilters.user_id) // 后端使用 search 参数
        }
        if (this.consumptionFilters.status) params.append('status', this.consumptionFilters.status)
        if (this.consumptionFilters.start_date) {
          params.append('start_date', this.consumptionFilters.start_date)
        }
        if (this.consumptionFilters.end_date) {
          params.append('end_date', this.consumptionFilters.end_date)
        }
        // F-41: 异常类型筛选参数
        if (this.consumptionFilters.anomaly_type) {
          params.append('anomaly_type', this.consumptionFilters.anomaly_type)
        }

        const response = await this.apiGet(
          `${STORE_ENDPOINTS.CONSUMPTION_RECORDS}?${params}`,
          {},
          { showLoading: false }
        )

        if (response?.success) {
          // 后端返回 records 数组，字段: record_id, consumption_amount, status, created_at, user, merchant
          const rawRecords = response.data?.records || response.data?.list || []
          // 映射字段以兼容 HTML 模板
          this.consumptions = rawRecords.map(r => ({
            ...r,
            id: r.record_id,
            amount: r.consumption_amount, // 后端返回分，HTML 会 /100
            user_name: r.user?.nickname || r.user?.mobile || r.user_id,
            store_name: r.merchant?.nickname || r.merchant?.mobile || `商户${r.merchant_id || '-'}`
          }))
          if (response.data?.pagination) {
            // 只更新 total，total_pages 由 getter 计算
            this.financePagination.total = response.data.pagination.total || 0
          }
          // 同时获取统计数据（后端在同一接口返回）
          if (response.data?.statistics) {
            this.consumptionStats = {
              total: this.financePagination.total,
              totalAmount: 0,
              pendingCount: response.data.statistics.pending ?? 0,
              todayCount: response.data.statistics.today ?? 0
            }
          }
        }
      } catch (error) {
        logger.error('加载消费记录失败:', error)
        this.consumptions = []
      }
    },

    /**
     * 加载消费统计（从 records 接口获取，后端不单独提供 stats 接口）
     */
    async loadConsumptionStats() {
      // 统计数据已在 loadConsumptions 中获取，这里只做空实现避免报错
      logger.debug('loadConsumptionStats: 统计数据已在 loadConsumptions 中获取')
    },

    /**
     * 搜索消费记录
     */
    searchConsumptions() {
      this.financePagination.page = 1
      this.loadConsumptions()
    },

    /**
     * 重置消费筛选
     */
    resetConsumptionFilters() {
      this.consumptionFilters = {
        user_id: '',
        status: '',
        payment_method: '',
        start_date: '',
        end_date: '',
        anomaly_type: ''  // F-41: 异常类型筛选
      }
      this.financePagination.page = 1
      this.loadConsumptions()
    },

    // ========== F-43: 异常统计面板方法 ==========

    /**
     * 加载异常统计数据
     * 后端接口: GET /api/v4/console/consumption-anomaly/summary
     * 后端返回: { total_count, anomaly_count, risk_distribution, flag_distribution }
     */
    async loadAnomalyStats() {
      try {
        const response = await this.apiGet(
          STORE_ENDPOINTS.CONSUMPTION_ANOMALY_SUMMARY,
          {},
          { showLoading: false }
        )

        if (response?.success && response.data) {
          const data = response.data
          // 适配后端数据格式到前端展示格式
          const flagDist = data.flag_distribution || {}
          const riskDist = data.risk_distribution || {}

          this.anomalyStats = {
            total_anomaly: data.anomaly_count || 0,
            high_frequency: flagDist.high_frequency || 0,
            high_amount: (flagDist.large_amount || 0) + (flagDist.new_user_large || 0),
            unusual_time: riskDist.high || 0, // 高风险记录数
            other: (flagDist.cross_store || 0) + (riskDist.medium || 0)
          }
        }
      } catch (error) {
        logger.warn('加载异常统计失败:', error)
        // 如果接口不存在，从消费记录中统计
        this.calculateAnomalyStatsFromRecords()
      }
    },

    /**
     * 从消费记录中计算异常统计（备用方案）
     */
    calculateAnomalyStatsFromRecords() {
      const stats = {
        total_anomaly: 0,
        high_frequency: 0,
        high_amount: 0,
        unusual_time: 0,
        other: 0
      }

      this.consumptions.forEach(record => {
        if (record.is_suspicious || record.risk_level === 'high' || record.anomaly_type) {
          stats.total_anomaly++
          if (record.anomaly_type === 'high_frequency' || record.anomaly_type === 'rapid_succession') {
            stats.high_frequency++
          } else if (record.anomaly_type === 'high_amount' || record.anomaly_type === 'first_time_high') {
            stats.high_amount++
          } else if (record.anomaly_type === 'unusual_time') {
            stats.unusual_time++
          } else {
            stats.other++
          }
        }
      })

      this.anomalyStats = stats
    },

    /**
     * 查看消费详情
     * @param {Object} record - 消费记录对象
     */
    async viewConsumptionDetail(record) {
      try {
        const response = await this.apiGet(
          buildURL(STORE_ENDPOINTS.CONSUMPTION_DETAIL, { id: record.id }),
          {},
          { showLoading: true }
        )
        if (response?.success) {
          this.selectedConsumption = response.data
          this.showModal('consumptionDetailModal')
        }
      } catch (error) {
        logger.error('加载消费详情失败:', error)
        this.showError('加载消费详情失败')
      }
    },

    /**
     * 通过消费记录审核
     * 后端接口: POST /api/v4/console/consumption/approve/:id
     * @param {Object} record - 消费记录对象
     */
    async approveConsumption(record) {
      const recordId = record.record_id || record.id
      await this.confirmAndExecute(
        '确定通过此消费记录？',
        async () => {
          const response = await this.apiCall(
            buildURL(STORE_ENDPOINTS.CONSUMPTION_APPROVE, { id: recordId }),
            { method: 'POST', data: {} }
          )
          if (response?.success) {
            await this.loadConsumptions()
          }
        },
        { successMessage: '消费记录已通过' }
      )
    },

    /**
     * 拒绝消费记录审核（打开弹窗）
     * @param {Object} record - 消费记录对象
     */
    async rejectConsumption(record) {
      this.selectedConsumption = record
      this.rejectForm = { reason: '' }
      this.showModal('rejectModal')
    },

    /**
     * 显示拒绝模态框
     * @param {Object} record - 消费记录对象
     */
    showRejectModal(record) {
      this.selectedConsumption = record
      this.rejectForm = { reason: '' }
      this.showModal('rejectModal')
    },

    /**
     * 确认拒绝
     * 后端接口: POST /api/v4/console/consumption/reject/:id
     */
    async confirmReject() {
      if (!this.rejectForm.reason || this.rejectForm.reason.trim().length < 5) {
        this.showError('请输入拒绝原因（至少5个字符）')
        return
      }

      try {
        this.saving = true
        const recordId = this.selectedConsumption.record_id || this.selectedConsumption.id
        const response = await this.apiCall(
          buildURL(STORE_ENDPOINTS.CONSUMPTION_REJECT, { id: recordId }),
          {
            method: 'POST',
            data: { admin_notes: this.rejectForm.reason }
          }
        )

        if (response?.success) {
          this.showSuccess('消费记录已拒绝')
          this.hideModal('rejectModal')
          await this.loadConsumptions()
        }
      } catch (error) {
        this.showError('操作失败: ' + (error.message || '未知错误'))
      } finally {
        this.saving = false
      }
    },

    /**
     * 获取支付方式文本
     * @param {string} method - 支付方式代码
     * @returns {string} 支付方式文本
     */
    getPaymentMethodText(method) {
      const map = {
        wechat: '微信',
        alipay: '支付宝',
        cash: '现金',
        card: '银行卡',
        points: '积分'
      }
      return map[method] || method || '-'
    },

    /**
     * 获取消费状态CSS类
     * @param {string} status - 消费状态
     * @returns {string} CSS类名
     */
    getConsumptionStatusClass(status) {
      const map = { pending: 'bg-warning', approved: 'bg-success', rejected: 'bg-danger' }
      return map[status] || 'bg-secondary'
    },

    /**
     * 获取消费状态文本
     * @param {string} status - 消费状态
     * @returns {string} 状态文本
     */
    getConsumptionStatusText(status) {
      const map = { pending: '待审核', approved: '已通过', rejected: '已拒绝' }
      return map[status] || status
    },

    // ========== 批量操作方法（P0-4） ==========

    /**
     * 切换单个记录选中状态
     * @param {number|string} recordId - 记录ID
     */
    toggleSelection(recordId) {
      const index = this.selectedIds.indexOf(recordId)
      if (index > -1) {
        this.selectedIds.splice(index, 1)
      } else {
        this.selectedIds.push(recordId)
      }
      // 更新全选状态
      const pendingRecords = this.consumptions.filter(r => r.status === 'pending')
      this.isAllSelected =
        pendingRecords.length > 0 &&
        pendingRecords.every(r => this.selectedIds.includes(r.record_id || r.id))
    },

    /**
     * 切换全选状态
     */
    toggleSelectAll() {
      const pendingRecords = this.consumptions.filter(r => r.status === 'pending')
      if (this.isAllSelected) {
        // 取消全选
        this.selectedIds = []
        this.isAllSelected = false
      } else {
        // 全选所有待审核记录
        this.selectedIds = pendingRecords.map(r => r.record_id || r.id)
        this.isAllSelected = true
      }
    },

    /**
     * 检查记录是否被选中
     * @param {Object} record - 记录对象
     * @returns {boolean}
     */
    isSelected(record) {
      const recordId = record.record_id || record.id
      return this.selectedIds.includes(recordId)
    },

    /**
     * 批量通过审核
     * 后端接口: POST /api/v4/console/consumption/batch-review
     */
    async batchApprove() {
      if (this.selectedIds.length === 0) {
        this.showError('请先选择要通过的记录')
        return
      }

      await this.confirmAndExecute(
        `确定批量通过 ${this.selectedIds.length} 条消费记录？`,
        async () => {
          this.batchProcessing = true
          try {
            const response = await this.apiCall(
              '/api/v4/console/consumption/batch-review',
              {
                method: 'POST',
                data: {
                  record_ids: this.selectedIds,
                  action: 'approve'
                }
              }
            )

            if (response?.success) {
              this.batchResult = response.data
              const { success_count, fail_count } = response.data
              if (fail_count > 0) {
                this.showWarning(`成功 ${success_count} 项，失败 ${fail_count} 项`)
              } else {
                this.showSuccess(`成功通过 ${success_count} 条记录`)
              }
              // 清空选择并刷新
              this.selectedIds = []
              this.isAllSelected = false
              await this.loadConsumptions()
            }
          } finally {
            this.batchProcessing = false
          }
        }
      )
    },

    /**
     * 批量拒绝审核
     * 后端接口: POST /api/v4/console/consumption/batch-review
     */
    async batchReject() {
      if (this.selectedIds.length === 0) {
        this.showError('请先选择要拒绝的记录')
        return
      }

      // 先弹出输入原因的提示
      const reason = prompt('请输入拒绝原因（至少5个字符）：')
      if (!reason || reason.trim().length < 5) {
        this.showError('拒绝原因至少需要5个字符')
        return
      }

      await this.confirmAndExecute(
        `确定批量拒绝 ${this.selectedIds.length} 条消费记录？`,
        async () => {
          this.batchProcessing = true
          try {
            const response = await this.apiCall(
              '/api/v4/console/consumption/batch-review',
              {
                method: 'POST',
                data: {
                  record_ids: this.selectedIds,
                  action: 'reject',
                  reason: reason.trim()
                }
              }
            )

            if (response?.success) {
              this.batchResult = response.data
              const { success_count, fail_count } = response.data
              if (fail_count > 0) {
                this.showWarning(`成功 ${success_count} 项，失败 ${fail_count} 项`)
              } else {
                this.showSuccess(`成功拒绝 ${success_count} 条记录`)
              }
              // 清空选择并刷新
              this.selectedIds = []
              this.isAllSelected = false
              await this.loadConsumptions()
            }
          } finally {
            this.batchProcessing = false
          }
        }
      )
    },

    /**
     * 清空选择
     */
    clearSelection() {
      this.selectedIds = []
      this.isAllSelected = false
    },

    // ==================== 风控标记相关方法 (P1-4) ====================

    /**
     * 获取异常类型标签
     * @param {string} anomalyType - 异常类型
     * @returns {string} 标签文本
     */
    getAnomalyLabel(anomalyType) {
      const labels = {
        high_frequency: '高频消费',
        high_amount: '大额异常',
        unusual_time: '异常时段',
        location_mismatch: '位置异常',
        device_change: '设备变更',
        rapid_succession: '短时多次',
        first_time_high: '首次大额',
        pattern_break: '行为异常'
      }
      return labels[anomalyType] || anomalyType || '未知异常'
    },

    // ========== F-42: 异常详情提示方法 ==========

    /**
     * 获取异常详情提示文本（用于鼠标悬停显示）
     * @param {Object} record - 消费记录
     * @returns {string} 提示文本
     */
    getAnomalyTooltip(record) {
      const tips = []
      
      if (record.anomaly_type) {
        tips.push(`异常类型: ${this.getAnomalyLabel(record.anomaly_type)}`)
      }
      
      if (record.risk_reasons && record.risk_reasons.length > 0) {
        tips.push(`风险原因: ${record.risk_reasons.join('、')}`)
      }
      
      if (record.risk_level) {
        const levelText = { high: '高风险', medium: '中风险', low: '低风险' }
        tips.push(`风险级别: ${levelText[record.risk_level] || record.risk_level}`)
      }

      if (record.anomaly_score) {
        tips.push(`异常评分: ${record.anomaly_score}`)
      }

      if (record.anomaly_flags && Array.isArray(record.anomaly_flags)) {
        tips.push(`标记: ${record.anomaly_flags.map(f => this.getAnomalyLabel(f)).join('、')}`)
      }

      return tips.length > 0 ? tips.join('\n') : '存在异常，请仔细审核'
    },

    /**
     * 获取风险等级样式类
     * @param {string} level - 风险等级
     * @returns {string} 样式类名
     */
    getRiskLevelClass(level) {
      const classes = {
        high: 'bg-red-100 text-red-700',
        medium: 'bg-yellow-100 text-yellow-700',
        low: 'bg-green-100 text-green-700'
      }
      return classes[level] || 'bg-gray-100 text-gray-700'
    }
  }
}

export default { useConsumptionState, useConsumptionMethods }
