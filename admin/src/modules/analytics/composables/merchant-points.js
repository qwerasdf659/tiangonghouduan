/**
 * 商户积分模块
 *
 * @file admin/src/modules/analytics/composables/merchant-points.js
 * @description 商户积分余额和历史查询
 * @version 1.1.0
 * @date 2026-01-24
 *
 * 使用 STORE_ENDPOINTS 端点
 */

import { logger } from '../../../utils/logger.js'
import { STORE_ENDPOINTS } from '../../../api/store.js'
import { buildURL } from '../../../api/base.js'

/**
 * 商户积分状态
 * @returns {Object} 状态对象
 */
export function useMerchantPointsState() {
  return {
    /** @type {Array} 商户积分申请列表 */
    merchantPoints: [],
    /** @type {Object} 商户积分筛选条件 - mobile 用于手机号搜索 */
    merchantFilters: { mobile: '', keyword: '' },
    /**
     * 商户积分审核统计 - 与后端API字段一致
     * @property {number} pending_count - 待审核数量
     * @property {number} approved_count - 已通过数量
     * @property {number} rejected_count - 已拒绝数量
     * @property {number} today_points - 今日发放积分
     */
    merchantStats: { pending_count: 0, approved_count: 0, rejected_count: 0, today_points: 0 },
    /** @type {Object|null} 选中的商户积分申请 */
    selectedMerchant: null,
    /** @type {Array} 商户积分历史 */
    merchantPointsHistory: []
  }
}

/**
 * 商户积分方法
 * @returns {Object} 方法对象
 */
export function useMerchantPointsMethods() {
  return {
    /**
     * 加载商户积分申请列表
     * 后端API: GET /api/v4/console/merchant-points
     * 返回格式: { rows: [...], count: number, pagination: {...} }
     */
    async loadMerchantPoints() {
      try {
        const params = new URLSearchParams()
        params.append('page', this.financePagination?.page || 1)
        params.append('page_size', this.financePagination?.page_size || 20)
        // 手机号搜索：先 resolve 获取 user_id，再传给后端
        if (this.merchantFilters.mobile) {
          const user = await this.resolveUserByMobile(this.merchantFilters.mobile)
          if (user) {
            params.append('user_id', user.user_id)
          } else {
            // resolve 失败，不继续请求
            this.merchantPoints = []
            return
          }
        }
        if (this.merchantFilters.keyword) {
          params.append('keyword', this.merchantFilters.keyword)
        }

        const response = await this.apiGet(
          `${STORE_ENDPOINTS.MERCHANT_POINT_LIST}?${params}`,
          {},
          { showLoading: false }
        )

        if (response?.success) {
          // 后端返回 rows 字段
          this.merchantPoints = response.data?.rows || []
          if (response.data?.pagination) {
            // 只更新 total，total_pages 由 getter 计算
            this.financePagination.total = response.data.pagination.total || 0
          } else if (response.data?.count !== undefined) {
            this.financePagination.total = response.data.count
          }
        }
      } catch (error) {
        logger.error('加载商户积分申请列表失败:', error)
        this.merchantPoints = []
      }
    },

    /**
     * 加载商户积分审核统计
     * 后端API: GET /api/v4/console/merchant-points/stats/pending
     * 返回格式: { pending_count, approved_count, rejected_count, today_points }
     */
    async loadMerchantStats() {
      try {
        const response = await this.apiGet(
          STORE_ENDPOINTS.MERCHANT_POINT_STATS,
          {},
          { showLoading: false, showError: false }
        )
        if (response?.success && response.data) {
          // 直接使用后端返回的字段名（snake_case）
          this.merchantStats = {
            pending_count: response.data.pending_count ?? 0,
            approved_count: response.data.approved_count ?? 0,
            rejected_count: response.data.rejected_count ?? 0,
            today_points: response.data.today_points ?? 0
          }
        }
      } catch (error) {
        logger.error('加载商户积分审核统计失败:', error)
      }
    },

    /**
     * 搜索商户
     */
    searchMerchants() {
      this.financePagination.page = 1
      this.loadMerchantPoints()
    },

    /**
     * 查看商户积分申请详情
     * 后端API: GET /api/v4/console/merchant-points/:audit_id
     * @param {Object} item - 商户积分申请对象
     */
    async viewMerchantDetail(item) {
      try {
        // 后端使用 audit_id 作为主键
        const auditId = item.audit_id || item.id
        logger.debug('[商户积分] 查看详情, audit_id:', auditId)
        const response = await this.apiGet(
          buildURL(STORE_ENDPOINTS.MERCHANT_POINT_DETAIL, { id: auditId }),
          {},
          { showLoading: true }
        )
        if (response?.success) {
          this.selectedMerchant = response.data
          // 修复：模态框名称与HTML保持一致（merchantPointDetailModal）
          this.showModal('merchantPointDetailModal')
        }
      } catch (error) {
        logger.error('加载商户积分申请详情失败:', error)
        this.showError('加载商户积分申请详情失败')
      }
    },

    /**
     * 查看商户积分历史
     * 后端API: GET /api/v4/console/merchant-points/:id/history
     * @param {Object} item - 商户积分申请对象
     */
    async viewMerchantHistory(item) {
      try {
        const auditId = item.audit_id || item.id
        logger.debug('[商户积分] 查看历史, audit_id:', auditId)
        const response = await this.apiGet(
          buildURL(STORE_ENDPOINTS.MERCHANT_POINT_HISTORY, { id: auditId }),
          {},
          { showLoading: true }
        )
        if (response?.success) {
          this.selectedMerchant = item
          this.merchantPointsHistory = response.data?.rows || response.data?.history || []
          // 修复：模态框名称与HTML保持一致（merchantPointHistoryModal）
          this.showModal('merchantPointHistoryModal')
        }
      } catch (error) {
        logger.error('加载商户积分历史失败:', error)
        this.showError('加载商户积分历史失败')
      }
    },

    /**
     * 审核通过商户积分申请
     * 后端API: POST /api/v4/console/merchant-points/:audit_id/approve
     * @param {Object} item - 商户积分申请对象
     */
    async approveMerchantPoints(item) {
      if (!confirm('确认通过该商户积分申请？')) return
      try {
        const auditId = item.audit_id || item.id
        const response = await this.apiPost(
          buildURL(STORE_ENDPOINTS.MERCHANT_POINT_APPROVE, { id: auditId }),
          {},
          { showLoading: true }
        )
        if (response?.success) {
          this.showSuccess('审核通过成功')
          // 刷新列表和统计
          await Promise.all([this.loadMerchantPoints(), this.loadMerchantStats()])
        }
      } catch (error) {
        logger.error('审核通过失败:', error)
        this.showError('审核通过失败')
      }
    },

    /**
     * 审核拒绝商户积分申请
     * 后端API: POST /api/v4/console/merchant-points/:audit_id/reject
     * @param {Object} item - 商户积分申请对象
     */
    async rejectMerchantPoints(item) {
      const reason = prompt('请输入拒绝原因：')
      if (!reason || reason.trim() === '') {
        this.showError('拒绝原因不能为空')
        return
      }
      try {
        const auditId = item.audit_id || item.id
        const response = await this.apiPost(
          buildURL(STORE_ENDPOINTS.MERCHANT_POINT_REJECT, { id: auditId }),
          { reason: reason.trim() },
          { showLoading: true }
        )
        if (response?.success) {
          this.showSuccess('审核拒绝成功')
          // 刷新列表和统计
          await Promise.all([this.loadMerchantPoints(), this.loadMerchantStats()])
        }
      } catch (error) {
        logger.error('审核拒绝失败:', error)
        this.showError('审核拒绝失败')
      }
    }
  }
}

export default { useMerchantPointsState, useMerchantPointsMethods }
