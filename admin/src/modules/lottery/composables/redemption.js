/**
 * 核销码管理模块
 *
 * @file admin/src/modules/lottery/composables/redemption.js
 * @description 核销码的查询、核销、批量操作
 * @version 1.0.0
 * @date 2026-01-24
 */

import { logger } from '../../../utils/logger.js'
import { LOTTERY_ENDPOINTS } from '../../../api/lottery/index.js'
import { buildURL } from '../../../api/base.js'
import { STORE_ENDPOINTS } from '../../../api/store.js'

/**
 * 核销码管理状态
 * @returns {Object} 状态对象
 */
export function useRedemptionState() {
  return {
    /** @type {Array} 核销码列表 */
    redemptionCodes: [],
    /** @type {Object} 核销码统计 */
    redemptionStats: { total: 0, pending: 0, fulfilled: 0, expired: 0 },
    /** @type {Object} 核销码筛选条件 */
    redemptionFilters: { status: '', prize_type: '', code: '', user_id: '' },
    /** @type {Array} 选中的核销码ID */
    redemptionSelectedIds: [],
    /** @type {Object|null} 核销码详情 */
    redemptionDetail: null,
    /** @type {Object} 核销表单 */
    redeemForm: { order_id: '', code_display: '', store_id: '', remark: '' },
    /** @type {Array} 门店列表 */
    stores: []
  }
}

/**
 * 核销码管理方法
 * @returns {Object} 方法对象
 */
export function useRedemptionMethods() {
  return {
    /**
     * 加载门店列表
     * @description apiGet 返回的是 response.data（已解包），不是完整响应对象
     */
    async loadStores() {
      try {
        // apiGet 通过 withLoading 包装，返回 { success: true, data: {...} }
        const response = await this.apiGet(
          STORE_ENDPOINTS.LIST,
          {},
          { showLoading: false, showError: false }
        )
        // 解包 withLoading 返回的结构
        const data = response?.success ? response.data : response
        if (data) {
          this.stores = data.items || data.stores || data.list || []
        }
      } catch (error) {
        logger.error('加载门店失败:', error)
        this.stores = []
      }
    },

    /**
     * 加载核销码统计
     * @description apiGet 返回的是 response.data（已解包），不是完整响应对象
     */
    async loadRedemptionStats() {
      try {
        logger.debug('[Redemption] 开始加载核销码统计...')
        logger.debug(
          '[Redemption] 统计API端点:',
          LOTTERY_ENDPOINTS.BUSINESS_RECORDS_REDEMPTION_STATISTICS
        )

        // apiGet 返回的是 { success, data } 格式
        const response = await this.apiGet(
          LOTTERY_ENDPOINTS.BUSINESS_RECORDS_REDEMPTION_STATISTICS,
          {},
          { showLoading: false, showError: false }
        )
        logger.debug('[Redemption] 统计API响应:', response)

        // 从 response.data 中提取统计数据
        if (response?.success && response.data) {
          const stats = response.data
          this.redemptionStats = {
            total: stats.total || 0,
            pending: stats.pending || 0,
            fulfilled: stats.fulfilled || 0,
            expired: stats.expired || 0
          }
          logger.debug('[Redemption] 统计数据已更新:', this.redemptionStats)
        } else {
          logger.warn('[Redemption] 统计API响应无效或为空')
        }
      } catch (error) {
        logger.error('[Redemption] 加载核销码统计失败:', error.message)
      }
    },

    /**
     * 加载核销码列表
     * @param {number} pageNum - 页码
     */
    async loadRedemptionCodes(pageNum = 1) {
      try {
        logger.debug('[Redemption] 开始加载核销码列表, 页码:', pageNum)
        this.page = pageNum
        this.redemptionSelectedIds = []

        // 先加载统计数据
        await this.loadRedemptionStats()

        const params = new URLSearchParams()
        params.append('page', pageNum)
        params.append('page_size', this.page_size || 20)
        if (this.redemptionFilters?.status) {
          params.append('status', this.redemptionFilters.status)
        }
        if (this.redemptionFilters?.prize_type) {
          params.append('prize_type', this.redemptionFilters.prize_type)
        }
        if (this.redemptionFilters?.code) {
          params.append('code', this.redemptionFilters.code)
        }
        if (this.redemptionFilters?.user_id) {
          // 使用后端期望的参数名 redeemer_user_id（不是 user_id）
          params.append('redeemer_user_id', this.redemptionFilters.user_id)
        }

        const url = `${LOTTERY_ENDPOINTS.BUSINESS_RECORDS_REDEMPTION_ORDERS}?${params}`
        logger.debug('[Redemption] 列表API URL:', url)

        // apiGet 通过 withLoading 包装，返回 { success: true, data: {...} }
        const response = await this.apiGet(url, {}, { showLoading: false })
        logger.debug('[Redemption] 列表API响应:', response)

        // 解包 withLoading 返回的结构
        const data = response?.success ? response.data : response
        logger.debug('[Redemption] 解包后数据:', data)

        if (data) {
          this.redemptionCodes = data.orders || data.records || data.codes || []
          this.total = data.pagination?.total || this.redemptionCodes.length
          this.total_pages =
            data.pagination?.total_pages || Math.ceil(this.total / (this.page_size || 20))
          logger.debug('[Redemption] 核销码列表已更新, 数量:', this.redemptionCodes.length)
          logger.debug(
            '[Redemption] 分页信息: total=',
            this.total,
            'total_pages=',
            this.total_pages
          )
        } else {
          logger.warn('[Redemption] 列表API响应无效或为空')
          this.redemptionCodes = []
        }
      } catch (error) {
        logger.error('[Redemption] 加载核销码失败:', error.message)
        this.redemptionCodes = []
      }
    },

    /**
     * 搜索核销码
     */
    searchRedemptionCodes() {
      this.loadRedemptionCodes(1)
    },

    /**
     * 查看核销码详情
     * @param {string} orderId - 订单ID
     * @description apiGet 返回的是 response.data（已解包），不是完整响应对象
     */
    async viewRedemptionDetail(orderId) {
      try {
        // apiGet 返回的是 response.data，不是完整 response 对象
        const data = await this.apiGet(
          buildURL(LOTTERY_ENDPOINTS.BUSINESS_RECORDS_REDEMPTION_DETAIL, { order_id: orderId }),
          {},
          { showLoading: true }
        )
        // data 直接就是 response.data 的内容
        if (data) {
          this.redemptionDetail = data
          this.showModal('redemptionDetailModal')
        } else {
          this.showError('获取详情失败：无数据')
        }
      } catch (error) {
        logger.error('加载详情失败:', error)
        this.showError(error.message || '加载详情失败')
      }
    },

    /**
     * 打开手动核销模态框
     * @param {string} orderId - 订单ID
     * @param {string} codeDisplay - 核销码显示文本
     */
    openRedeemModal(order_id, code_display) {
      this.redeemForm = {
        order_id,
        code_display,
        store_id: '',
        remark: ''
      }
      this.showModal('redeemModal')
    },

    /**
     * 提交核销
     * @description apiCall 成功时返回 response.data，失败时抛出错误
     */
    async submitRedeem() {
      if (this.submitting) return
      this.submitting = true

      try {
        // apiCall 成功时返回 response.data，失败时抛出错误
        await this.apiCall(
          buildURL(LOTTERY_ENDPOINTS.BUSINESS_RECORDS_REDEMPTION_REDEEM, {
            order_id: this.redeemForm.order_id
          }),
          {
            method: 'POST',
            data: {
              store_id: this.redeemForm.store_id ? parseInt(this.redeemForm.store_id) : null,
              remark: this.redeemForm.remark
            }
          }
        )

        // 如果没有抛出错误，则表示成功
        this.hideModal('redeemModal')
        this.showSuccess('核销成功')
        await this.loadRedemptionCodes(this.page)
      } catch (error) {
        logger.error('核销失败:', error)
        this.showError(error.message || '核销失败')
      } finally {
        this.submitting = false
      }
    },

    /**
     * 取消核销码
     * @param {string} orderId - 订单ID
     * @description apiCall 成功时返回 response.data，失败时抛出错误
     */
    async cancelRedemptionCode(orderId) {
      await this.confirmAndExecute(
        '确定要取消此核销码吗？',
        async () => {
          // apiCall 成功时返回 response.data，失败时抛出错误
          await this.apiCall(
            buildURL(LOTTERY_ENDPOINTS.BUSINESS_RECORDS_REDEMPTION_CANCEL, { order_id: orderId }),
            { method: 'POST' }
          )
          // 如果没有抛出错误，则表示成功
          await this.loadRedemptionCodes(this.page)
        },
        { successMessage: '已取消', confirmText: '确认取消' }
      )
    },

    /**
     * 切换选中状态
     * @param {string} orderId - 订单ID
     */
    toggleRedemptionSelect(orderId) {
      logger.debug('[Redemption] 切换选中状态:', orderId)
      const index = this.redemptionSelectedIds.indexOf(orderId)
      if (index > -1) {
        this.redemptionSelectedIds.splice(index, 1)
      } else {
        this.redemptionSelectedIds.push(orderId)
      }
      logger.debug('[Redemption] 当前选中数量:', this.redemptionSelectedIds.length)
    },

    /**
     * 全选/取消全选
     */
    toggleRedemptionSelectAll() {
      logger.debug('[Redemption] 全选/取消全选')
      if (this.checkIsAllRedemptionSelected()) {
        this.redemptionSelectedIds = []
      } else {
        this.redemptionSelectedIds = (this.redemptionCodes || []).map(c => c.order_id)
      }
      logger.debug('[Redemption] 当前选中数量:', this.redemptionSelectedIds.length)
    },

    /**
     * 是否全选（方法形式，避免getter在对象展开时报错）
     * @returns {boolean}
     */
    checkIsAllRedemptionSelected() {
      const codes = this.redemptionCodes || []
      const selectedIds = this.redemptionSelectedIds || []
      return codes.length > 0 && selectedIds.length === codes.length
    },

    /**
     * 批量过期
     */
    async batchExpireRedemption() {
      logger.debug('[Redemption] 批量过期被点击, 选中数量:', this.redemptionSelectedIds.length)

      if (this.redemptionSelectedIds.length === 0) {
        logger.debug('[Redemption] 没有选中任何核销码')
        this.showWarning('请先选择要处理的核销码')
        return
      }

      logger.debug('[Redemption] 选中的核销码ID:', this.redemptionSelectedIds)

      await this.confirmAndExecute(
        `确定要将选中的 ${this.redemptionSelectedIds.length} 个核销码设为过期吗？`,
        async () => {
          logger.debug('[Redemption] 执行批量过期API调用...')
          // apiCall 成功时返回 response.data，失败时抛出错误
          await this.apiCall(LOTTERY_ENDPOINTS.BUSINESS_RECORDS_BATCH_EXPIRE, {
            method: 'POST',
            data: { order_ids: this.redemptionSelectedIds }
          })
          logger.debug('[Redemption] 批量过期成功')
          // 如果没有抛出错误，则表示成功
          this.redemptionSelectedIds = []
          await this.loadRedemptionCodes(this.page)
        },
        { successMessage: '批量过期成功', confirmText: '确认过期' }
      )
    },

    /**
     * 导出核销码（带Token认证下载）
     */
    async exportRedemptionCodes() {
      try {
        const params = new URLSearchParams()
        if (this.redemptionFilters.status) params.append('status', this.redemptionFilters.status)
        params.append('format', 'csv')

        const exportUrl = LOTTERY_ENDPOINTS.BUSINESS_RECORDS_EXPORT + '?' + params.toString()

        // 获取Token
        const token = localStorage.getItem('admin_token')
        if (!token) {
          this.showError('请先登录')
          return
        }

        this.showSuccess('正在准备导出文件...')

        // 使用 fetch 带 Token 下载
        const response = await fetch(exportUrl, {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: 'text/csv, application/json'
          }
        })

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}))
          throw new Error(errorData.message || `导出失败 (${response.status})`)
        }

        // 检查响应类型
        const contentType = response.headers.get('content-type') || ''

        if (contentType.includes('application/json')) {
          // API返回JSON错误
          const errorData = await response.json()
          throw new Error(errorData.message || '导出失败')
        }

        // 获取文件内容
        const blob = await response.blob()

        // 生成文件名
        const filename = `redemption_codes_${new Date().toISOString().slice(0, 10)}.csv`

        // 触发下载
        const url = window.URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = filename
        document.body.appendChild(a)
        a.click()
        window.URL.revokeObjectURL(url)
        document.body.removeChild(a)

        this.showSuccess('导出成功')
      } catch (error) {
        logger.error('[Redemption] 导出失败:', error)
        this.showError(error.message || '导出失败')
      }
    },

    /**
     * 获取核销码显示文本
     * @param {string|null} codeHash - 核销码哈希值
     * @returns {string} 显示用的短码
     */
    getCodeDisplay(codeHash) {
      if (!codeHash) return '-'
      return codeHash.substring(0, 8) + '...'
    },

    /**
     * 获取核销人姓名
     * @param {Object|null} item - 核销码记录对象
     * @returns {string} 核销人姓名
     */
    getRedeemerName(item) {
      if (!item) return ''
      const redeemer = item.redeemer || {}
      return redeemer.nickname || redeemer.mobile || ''
    },

    /**
     * 获取核销码对应奖品名称
     * @param {Object|null} item - 核销码记录对象
     * @returns {string} 奖品名称
     */
    getRedemptionPrizeName(item) {
      if (!item) return '-'
      const itemInfo = item.item_instance || {}
      const itemMeta = itemInfo.meta || {}
      return itemMeta.prize_name || itemMeta.name || itemInfo.item_type || '-'
    },

    /**
     * 获取核销码对应活动名称
     * @param {Object|null} item - 核销码记录对象
     * @returns {string} 活动名称
     */
    getRedemptionCampaignName(item) {
      if (!item) return '-'
      const itemInfo = item.item_instance || {}
      const itemMeta = itemInfo.meta || {}
      return itemMeta.campaign_name || '-'
    },

    /**
     * 获取核销状态CSS类（Tailwind CSS）
     * @param {string} status - 核销状态代码
     * @returns {string} CSS类名
     */
    getRedemptionStatusClass(status) {
      const classes = {
        pending: 'bg-yellow-100 text-yellow-800',
        fulfilled: 'bg-green-100 text-green-800',
        redeemed: 'bg-green-100 text-green-800',
        expired: 'bg-red-100 text-red-800',
        cancelled: 'bg-gray-100 text-gray-800'
      }
      return classes[status] || 'bg-gray-100 text-gray-800'
    },

    /**
     * 获取核销状态文本
     * @param {string} status - 核销状态代码
     * @returns {string} 状态文本
     */
    getRedemptionStatusText(status) {
      const labels = {
        pending: '待核销',
        fulfilled: '已核销',
        redeemed: '已核销',
        expired: '已过期',
        cancelled: '已取消'
      }
      return labels[status] || status
    }
  }
}

export default { useRedemptionState, useRedemptionMethods }
