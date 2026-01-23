/**
 * 核销码管理模块
 *
 * @file admin/src/modules/lottery/composables/redemption.js
 * @description 核销码的查询、核销、批量操作
 * @version 1.0.0
 * @date 2026-01-24
 */

import { logger } from '../../../utils/logger.js'
import { LOTTERY_ENDPOINTS } from '../../../api/lottery.js'
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
    redemptionFilters: { status: '', prizeType: '', code: '', userId: '' },
    /** @type {Array} 选中的核销码ID */
    redemptionSelectedIds: [],
    /** @type {Object|null} 核销码详情 */
    redemptionDetail: null,
    /** @type {Object} 核销表单 */
    redeemForm: { orderId: '', codeDisplay: '', storeId: '', remark: '' },
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
     */
    async loadStores() {
      try {
        const response = await this.apiGet(
          STORE_ENDPOINTS.STORE_LIST,
          {},
          { showLoading: false, showError: false }
        )
        if (response?.success) {
          this.stores = response.data?.items || response.data?.stores || []
        }
      } catch (error) {
        logger.error('加载门店失败:', error)
        this.stores = []
      }
    },

    /**
     * 加载核销码列表
     * @param {number} pageNum - 页码
     */
    async loadRedemptionCodes(pageNum = 1) {
      try {
        this.page = pageNum
        this.redemptionSelectedIds = []

        const params = new URLSearchParams()
        params.append('page', pageNum)
        params.append('limit', this.pageSize)
        if (this.redemptionFilters.status) {
          params.append('status', this.redemptionFilters.status)
        }
        if (this.redemptionFilters.prizeType) {
          params.append('prize_type', this.redemptionFilters.prizeType)
        }
        if (this.redemptionFilters.code) {
          params.append('code', this.redemptionFilters.code)
        }
        if (this.redemptionFilters.userId) {
          params.append('user_id', this.redemptionFilters.userId)
        }

        const response = await this.apiGet(
          `${LOTTERY_ENDPOINTS.BUSINESS_RECORDS_LIST}?${params}`,
          {},
          { showLoading: false }
        )

        if (response?.success) {
          this.redemptionCodes =
            response.data?.orders || response.data?.records || response.data?.codes || []
          this.total = response.data?.pagination?.total || this.redemptionCodes.length
          this.totalPages =
            response.data?.pagination?.total_pages || Math.ceil(this.total / this.pageSize)

          this.redemptionStats = {
            total: this.total,
            pending: this.redemptionCodes.filter(c => c.status === 'pending').length,
            fulfilled: this.redemptionCodes.filter(
              c => c.status === 'fulfilled' || c.status === 'redeemed'
            ).length,
            expired: this.redemptionCodes.filter(c => c.status === 'expired').length
          }
        }
      } catch (error) {
        logger.error('加载核销码失败:', error)
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
     */
    async viewRedemptionDetail(orderId) {
      try {
        const response = await this.apiGet(
          buildURL(LOTTERY_ENDPOINTS.BUSINESS_RECORDS_DETAIL, { id: orderId }),
          {},
          { showLoading: true }
        )
        if (response?.success) {
          this.redemptionDetail = response.data
          this.showModal('redemptionDetailModal')
        } else {
          this.showError(response?.message || '获取详情失败')
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
    openRedeemModal(orderId, codeDisplay) {
      this.redeemForm = {
        orderId,
        codeDisplay,
        storeId: '',
        remark: ''
      }
      this.showModal('redeemModal')
    },

    /**
     * 提交核销
     */
    async submitRedeem() {
      if (this.submitting) return
      this.submitting = true

      try {
        const response = await this.apiCall(
          buildURL(LOTTERY_ENDPOINTS.BUSINESS_RECORDS_REDEEM, {
            id: this.redeemForm.orderId
          }),
          {
            method: 'POST',
            data: {
              store_id: this.redeemForm.storeId ? parseInt(this.redeemForm.storeId) : null,
              remark: this.redeemForm.remark
            }
          }
        )

        if (response?.success) {
          this.hideModal('redeemModal')
          this.showSuccess('核销成功')
          await this.loadRedemptionCodes(this.page)
        } else {
          this.showError(response?.message || '核销失败')
        }
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
     */
    async cancelRedemptionCode(orderId) {
      await this.confirmAndExecute(
        '确定要取消此核销码吗？',
        async () => {
          const response = await this.apiCall(
            buildURL(LOTTERY_ENDPOINTS.BUSINESS_RECORDS_CANCEL, { id: orderId }),
            { method: 'POST' }
          )
          if (response?.success) {
            await this.loadRedemptionCodes(this.page)
          }
        },
        { successMessage: '已取消', confirmText: '确认取消' }
      )
    },

    /**
     * 切换选中状态
     * @param {string} orderId - 订单ID
     */
    toggleRedemptionSelect(orderId) {
      const index = this.redemptionSelectedIds.indexOf(orderId)
      if (index > -1) {
        this.redemptionSelectedIds.splice(index, 1)
      } else {
        this.redemptionSelectedIds.push(orderId)
      }
    },

    /**
     * 全选/取消全选
     */
    toggleRedemptionSelectAll() {
      if (this.isAllRedemptionSelected) {
        this.redemptionSelectedIds = []
      } else {
        this.redemptionSelectedIds = this.redemptionCodes.map(c => c.order_id)
      }
    },

    /**
     * 是否全选
     * @returns {boolean}
     */
    get isAllRedemptionSelected() {
      return (
        this.redemptionCodes.length > 0 &&
        this.redemptionSelectedIds.length === this.redemptionCodes.length
      )
    },

    /**
     * 批量过期
     */
    async batchExpireRedemption() {
      if (this.redemptionSelectedIds.length === 0) {
        this.showWarning('请先选择要处理的核销码')
        return
      }

      await this.confirmAndExecute(
        `确定要将选中的 ${this.redemptionSelectedIds.length} 个核销码设为过期吗？`,
        async () => {
          const response = await this.apiCall(LOTTERY_ENDPOINTS.BUSINESS_RECORDS_BATCH_EXPIRE, {
            method: 'POST',
            data: { order_ids: this.redemptionSelectedIds }
          })
          if (response?.success) {
            this.redemptionSelectedIds = []
            await this.loadRedemptionCodes(this.page)
          }
        },
        { successMessage: '批量过期成功', confirmText: '确认过期' }
      )
    },

    /**
     * 导出核销码
     */
    exportRedemptionCodes() {
      const params = new URLSearchParams()
      if (this.redemptionFilters.status) params.append('status', this.redemptionFilters.status)
      params.append('format', 'csv')

      const exportUrl = LOTTERY_ENDPOINTS.BUSINESS_RECORDS_EXPORT + '?' + params.toString()
      window.open(exportUrl, '_blank')
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
     * 获取核销状态CSS类
     * @param {string} status - 核销状态代码
     * @returns {string} CSS类名
     */
    getRedemptionStatusClass(status) {
      const classes = {
        pending: 'bg-warning text-dark',
        fulfilled: 'bg-success',
        redeemed: 'bg-success',
        expired: 'bg-danger',
        cancelled: 'bg-secondary'
      }
      return classes[status] || 'bg-secondary'
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

