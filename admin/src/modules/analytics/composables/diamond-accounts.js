/**
 * 钻石账户模块
 *
 * @file admin/src/modules/analytics/composables/diamond-accounts.js
 * @description 用户钻石余额管理和调整
 * @version 1.0.0
 * @date 2026-01-24
 */

import { logger } from '../../../utils/logger.js'
import { ASSET_ENDPOINTS } from '../../../api/asset.js'
import { buildURL } from '../../../api/base.js'

/**
 * 钻石账户状态
 * @returns {Object} 状态对象
 */
export function useDiamondAccountsState() {
  return {
    /** @type {Array} 钻石账户列表 */
    diamondAccounts: [],
    /** @type {Object} 钻石账户筛选条件 */
    diamondFilters: { user_id: '', minBalance: '', maxBalance: '' },
    /** @type {Object} 钻石账户统计 */
    diamondStats: { totalAccounts: 0, totalBalance: 0, activeAccounts: 0 },
    /** @type {Object|null} 选中的钻石账户 */
    selectedDiamondAccount: null,
    /** @type {Object} 钻石调整表单 */
    diamondAdjustForm: {
      user_id: '',
      amount: 0,
      type: 'add',
      reason: ''
    }
  }
}

/**
 * 钻石账户方法
 * @returns {Object} 方法对象
 */
export function useDiamondAccountsMethods() {
  return {
    /**
     * 加载钻石账户列表（通过资产流水查询有钻石资产的用户）
     * 后端已将钻石合并到asset-adjustment统一管理
     */
    async loadDiamondAccounts() {
      try {
        const params = new URLSearchParams()
        params.append('page', this.page)
        params.append('page_size', this.pageSize)
        params.append('asset_code', 'DIAMOND') // 筛选钻石资产
        if (this.diamondFilters.user_id) params.append('user_id', this.diamondFilters.user_id)

        const response = await this.apiGet(
          `${ASSET_ENDPOINTS.TRANSACTIONS}?${params}`,
          {},
          { showLoading: false }
        )

        if (response?.success) {
          // 从交易记录中提取用户钻石余额信息
          const transactions = response.data?.transactions || response.data?.list || []
          // 按用户分组，获取最新余额
          const userMap = new Map()
          transactions.forEach(tx => {
            if (!userMap.has(tx.user_id)) {
              userMap.set(tx.user_id, {
                user_id: tx.user_id,
                nickname: tx.nickname || `用户${tx.user_id}`,
                balance: tx.balance_after ?? 0,
                last_updated: tx.created_at
              })
            }
          })
          this.diamondAccounts = Array.from(userMap.values())
          if (response.data?.pagination) {
            this.total = response.data.pagination.total || 0
            this.totalPages = response.data.pagination.total_pages || 1
          }
        }
      } catch (error) {
        logger.error('加载钻石账户失败:', error)
        this.diamondAccounts = []
      }
    },

    /**
     * 加载钻石账户统计（使用通用资产统计API）
     */
    async loadDiamondStats() {
      try {
        const response = await this.apiGet(
          `${ASSET_ENDPOINTS.STATS}?asset_code=DIAMOND`,
          {},
          { showLoading: false, showError: false }
        )
        if (response?.success && response.data) {
          // 适配通用资产统计返回格式
          const stats = response.data
          this.diamondStats = {
            totalAccounts: stats.total_users ?? stats.total_accounts ?? 0,
            totalBalance: stats.total_balance ?? stats.diamond_total ?? 0,
            activeAccounts: stats.active_users ?? stats.active_accounts ?? 0
          }
        }
      } catch (error) {
        logger.error('加载钻石统计失败:', error)
      }
    },

    /**
     * 搜索钻石账户
     */
    searchDiamondAccounts() {
      this.page = 1
      this.loadDiamondAccounts()
    },

    /**
     * 查看钻石账户详情（获取用户所有资产余额）
     * @param {Object} account - 钻石账户对象
     */
    async viewDiamondDetail(account) {
      try {
        const response = await this.apiGet(
          buildURL(ASSET_ENDPOINTS.ADJUSTMENT_USER_BALANCES, { user_id: account.user_id }),
          {},
          { showLoading: true }
        )
        if (response?.success) {
          // 从用户资产余额中提取钻石信息
          const balances = response.data?.balances || response.data || []
          const diamondBalance = balances.find(b => b.asset_code === 'DIAMOND') || {}
          this.selectedDiamondAccount = {
            user_id: account.user_id,
            nickname: account.nickname,
            balance: diamondBalance.balance ?? 0,
            asset_code: 'DIAMOND',
            all_balances: balances // 保留所有资产余额供参考
          }
          this.showModal('diamondDetailModal')
        }
      } catch (error) {
        logger.error('加载钻石账户详情失败:', error)
        this.showError('加载钻石账户详情失败')
      }
    },

    /**
     * 打开钻石调整模态框
     * @param {Object} account - 钻石账户对象
     */
    openDiamondAdjustModal(account) {
      this.diamondAdjustForm = {
        user_id: account.user_id,
        amount: 0,
        type: 'add',
        reason: ''
      }
      this.showModal('diamondAdjustModal')
    },

    /**
     * 提交钻石调整（使用统一资产调整API）
     */
    async submitDiamondAdjust() {
      if (!this.diamondAdjustForm.user_id) {
        this.showError('用户信息无效')
        return
      }
      if (!this.diamondAdjustForm.amount || this.diamondAdjustForm.amount <= 0) {
        this.showError('请输入有效的调整金额')
        return
      }
      if (!this.diamondAdjustForm.reason) {
        this.showError('请输入调整原因')
        return
      }

      try {
        this.saving = true
        // 后端统一资产调整API：正数=增加，负数=扣减
        const adjustAmount = this.diamondAdjustForm.type === 'add'
          ? Math.abs(this.diamondAdjustForm.amount)
          : -Math.abs(this.diamondAdjustForm.amount)

        const response = await this.apiCall(
          ASSET_ENDPOINTS.ADJUSTMENT_ADJUST,
          {
            method: 'POST',
            data: {
              user_id: this.diamondAdjustForm.user_id,
              asset_code: 'DIAMOND', // 指定资产类型为钻石
              amount: adjustAmount,
              reason: this.diamondAdjustForm.reason
            }
          }
        )

        if (response?.success) {
          this.showSuccess(
            `钻石${this.diamondAdjustForm.type === 'add' ? '增加' : '扣除'}成功`
          )
          this.hideModal('diamondAdjustModal')
          await this.loadDiamondAccounts()
          await this.loadDiamondStats()
        }
      } catch (error) {
        this.showError('钻石调整失败: ' + (error.message || '未知错误'))
      } finally {
        this.saving = false
      }
    }
  }
}

export default { useDiamondAccountsState, useDiamondAccountsMethods }

