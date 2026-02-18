/**
 * 钻石账户模块
 *
 * @file admin/src/modules/analytics/composables/diamond-accounts.js
 * @description 用户钻石余额管理和调整
 * @version 2.0.0
 * @date 2026-01-25
 *
 * 后端API设计说明：
 * - /api/v4/console/assets/transactions 需要 user_id 必填参数
 * - /api/v4/console/assets/stats 返回全局资产统计
 * - /api/v4/console/asset-adjustment/user/:user_id/balances 获取用户资产余额
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
    /** @type {Array} 钻石账户列表（用户搜索结果） */
    diamondAccounts: [],
    /** @type {Object} 钻石账户筛选条件 - mobile 用于手机号搜索 */
    diamondFilters: { mobile: '' },
    /** @type {Object} 钻石账户统计（全局统计） */
    diamondStats: {
      holder_count: 0,
      total_circulation: 0,
      total_frozen: 0
    },
    /** @type {Object|null} 选中的钻石账户 */
    selectedDiamondAccount: null,
    /** @type {Object} 钻石调整表单 */
    diamondAdjustForm: {
      mobile: '',
      amount: 0,
      type: 'add',
      reason: ''
    },
    /** @type {boolean} 是否已搜索用户 */
    diamondSearched: false,
    /** @type {string} 搜索提示信息 */
    diamondSearchTip: '请输入手机号查询钻石账户'
  }
}

/**
 * 钻石账户方法
 * @returns {Object} 方法对象
 */
export function useDiamondAccountsMethods() {
  return {
    /**
     * 加载钻石账户
     * 后端设计：/api/v4/console/assets/transactions 需要 user_id 必填
     * 前端适配：用户搜索模式，需要先输入手机号 → resolve → 用 user_id 调业务API
     */
    async loadDiamondAccounts() {
      // 如果没有提供手机号，显示提示信息
      if (!this.diamondFilters.mobile) {
        this.diamondAccounts = []
        this.diamondSearched = false
        this.diamondSearchTip = '请输入手机号查询钻石账户'
        this.financePagination.total = 0
        logger.debug('[DiamondAccounts] 未提供手机号，等待用户搜索')
        return
      }

      // 手机号 → resolve 获取 user_id
      const user = await this.resolveUserByMobile(this.diamondFilters.mobile)
      if (!user) {
        this.diamondAccounts = []
        this.diamondSearched = true
        this.diamondSearchTip = this.resolveError || '未找到该手机号对应的用户'
        this.financePagination.total = 0
        return
      }

      try {
        this.diamondSearched = true
        this.diamondSearchTip = ''

        // 1. 获取用户资产余额（包含钻石）
        const balanceResponse = await this.apiGet(
          buildURL(ASSET_ENDPOINTS.ADJUSTMENT_USER_BALANCES, {
            user_id: user.user_id
          }),
          {},
          { showLoading: true, showError: false }
        )

        if (balanceResponse?.success) {
          const userData = balanceResponse.data?.user || {}
          const balances = balanceResponse.data?.balances || []
          const diamondBalance = balances.find(b => b.asset_code === 'DIAMOND')

          // 构建账户信息
          this.diamondAccounts = [
            {
              user_id: userData.user_id || user.user_id,
              nickname: userData.nickname || user.nickname,
              mobile: userData.mobile || '',
              status: userData.status || '',
              balance: diamondBalance?.available_amount ?? 0,
              frozen: diamondBalance?.frozen_amount ?? 0,
              total: diamondBalance?.total ?? diamondBalance?.available_amount ?? 0,
              has_diamond: !!diamondBalance
            }
          ]
          this.financePagination.total = 1
        } else {
          this.diamondAccounts = []
          this.financePagination.total = 0
          this.diamondSearchTip = balanceResponse?.message || '用户不存在'
        }

        // 2. 获取用户钻石流水（可选，用于详情展示）
        // 流水会在 viewDiamondDetail 中加载
      } catch (error) {
        logger.error('[DiamondAccounts] 加载失败:', error)
        this.diamondAccounts = []
        this.financePagination.total = 0
        if (error.message?.includes('不存在') || error.message?.includes('404')) {
          this.diamondSearchTip = '用户不存在'
        } else {
          this.diamondSearchTip = '查询失败: ' + (error.message || '未知错误')
        }
      }
    },

    /**
     * 加载钻石全局统计
     * 使用 /api/v4/console/assets/stats 获取全局资产统计
     */
    async loadDiamondStats() {
      try {
        const response = await this.apiGet(
          ASSET_ENDPOINTS.STATS,
          {},
          { showLoading: false, showError: false }
        )
        if (response?.success && response.data) {
          // 从资产统计中提取钻石数据
          const assetStats = response.data.asset_stats || []
          const diamondStat = assetStats.find(s => s.asset_code === 'DIAMOND')

          if (diamondStat) {
            this.diamondStats = {
              holder_count: diamondStat.holder_count ?? 0,
              total_circulation: diamondStat.total_circulation ?? 0,
              total_frozen: diamondStat.total_frozen ?? 0,
              total_issued: diamondStat.total_issued ?? 0
            }
          } else {
            this.diamondStats = {
              holder_count: 0,
              total_circulation: 0,
              total_frozen: 0,
              total_issued: 0
            }
          }
        }
      } catch (error) {
        logger.error('[DiamondAccounts] 加载统计失败:', error)
      }
    },

    /**
     * 搜索钻石账户（用户输入手机号后触发）
     */
    searchDiamondAccounts() {
      if (!this.diamondFilters.mobile) {
        this.showError('请输入手机号')
        return
      }
      this.financePagination.page = 1
      this.loadDiamondAccounts()
    },

    /**
     * 清空钻石账户搜索
     */
    clearDiamondSearch() {
      this.diamondFilters.mobile = ''
      this.diamondAccounts = []
      this.diamondSearched = false
      this.diamondSearchTip = '请输入手机号查询钻石账户'
      this.financePagination.total = 0
      this.clearResolvedUser()
    },

    /**
     * 查看钻石账户详情（获取用户钻石流水）
     * @param {Object} account - 钻石账户对象
     */
    async viewDiamondDetail(account) {
      try {
        // 获取用户钻石流水
        const params = new URLSearchParams()
        params.append('user_id', account.user_id)
        params.append('asset_code', 'DIAMOND')
        params.append('page', '1')
        params.append('page_size', '20')

        const response = await this.apiGet(
          `${ASSET_ENDPOINTS.TRANSACTIONS}?${params}`,
          {},
          { showLoading: true }
        )

        if (response?.success) {
          const transactions = response.data?.transactions || []

          this.selectedDiamondAccount = {
            user_id: account.user_id,
            nickname: account.nickname,
            mobile: account.mobile,
            balance: account.balance,
            frozen: account.frozen,
            asset_code: 'DIAMOND',
            transactions: transactions.map(tx => ({
              asset_transaction_id: tx.asset_transaction_id,
              delta_amount: tx.delta_amount,
              balance_before: tx.balance_before,
              balance_after: tx.balance_after,
              tx_type: tx.tx_type,
              tx_type_display: tx.tx_type_display || tx.tx_type || '-',
              description: tx.description || tx.title || '-',
              created_at: tx.created_at
            }))
          }
          this.showModal('diamondDetailModal')
        }
      } catch (error) {
        logger.error('[DiamondAccounts] 加载详情失败:', error)
        this.showError('加载钻石账户详情失败')
      }
    },

    /**
     * 打开钻石调整模态框
     * @param {Object} account - 钻石账户对象
     */
    openDiamondAdjustModal(account) {
      this.diamondAdjustForm = {
        mobile: account?.mobile || '',
        user_id: account?.user_id || '',
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
      // 如果表单中有 user_id（从列表带入），直接使用；否则通过手机号解析
      let targetUserId = this.diamondAdjustForm.user_id
      if (!targetUserId && this.diamondAdjustForm.mobile) {
        const user = await this.resolveUserByMobile(this.diamondAdjustForm.mobile)
        if (!user) return
        targetUserId = user.user_id
      }

      if (!targetUserId) {
        this.showError('请输入手机号')
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
        const adjustAmount =
          this.diamondAdjustForm.type === 'add'
            ? Math.abs(this.diamondAdjustForm.amount)
            : -Math.abs(this.diamondAdjustForm.amount)

        // 生成幂等键（后端要求必填）
        const idempotencyKey = `admin_adjust_diamond_${targetUserId}_${Date.now()}`

        const response = await this.apiCall(ASSET_ENDPOINTS.ADJUSTMENT_ADJUST, {
          method: 'POST',
          data: {
            user_id: Number(targetUserId),
            asset_code: 'DIAMOND',
            amount: adjustAmount,
            reason: this.diamondAdjustForm.reason,
            idempotency_key: idempotencyKey
          }
        })

        if (response?.success) {
          this.showSuccess(`钻石${this.diamondAdjustForm.type === 'add' ? '增加' : '扣除'}成功`)
          this.hideModal('diamondAdjustModal')

          // 如果当前有搜索的用户，刷新数据
          if (this.diamondFilters.mobile) {
            await this.loadDiamondAccounts()
          }
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
