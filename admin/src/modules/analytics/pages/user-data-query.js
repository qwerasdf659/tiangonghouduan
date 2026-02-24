/**
 * 用户数据查询页面 - 管理后台用户全维度数据检索
 *
 * @description 支持按用户 ID / 手机号搜索，展示用户全维度业务数据：
 *   Tab1: 资产流水（积分来源 / 消耗 / 收入支出）
 *   Tab2: 抽奖记录
 *   Tab3: 兑换记录（含核销状态）
 *   Tab4: 交易记录（交易市场买卖）
 *   Tab5: 市场挂牌（上架/下架）
 *   Tab6: 材料转换（分解/合成）
 *
 * @version 1.0.0
 * @date 2026-02-18
 */

import { createPageMixin } from '@/alpine/mixins/index.js'
import { UserDataQueryAPI } from '@/api/user-data-query.js'
import { logger } from '@/utils/logger.js'

/** 业务类型中文映射 */
const BUSINESS_TYPE_MAP = {
  lottery_consume: '抽奖消耗',
  lottery_reward: '抽奖奖励',
  market_purchase_buyer_debit: '市场购买（买家扣款）',
  market_purchase_seller_credit: '市场购买（卖家入账）',
  market_purchase_fee: '市场交易手续费',
  exchange_debit: '兑换扣减',
  material_convert_debit: '材料转换（扣减）',
  material_convert_credit: '材料转换（入账）',
  material_convert_fee: '材料转换手续费',
  admin_adjust: '管理员调整',
  points_grant: '积分发放',
  budget_grant: '预算发放',
  market_listing_freeze: '挂牌冻结',
  market_listing_unfreeze: '挂牌解冻',
  bid_freeze: '竞价冻结',
  bid_unfreeze: '竞价解冻'
}

/** 奖励档位中文映射 */
const REWARD_TIER_MAP = {
  low: '普通奖',
  mid: '中等奖',
  high: '大奖',
  fallback: '保底奖'
}

/** 挂牌状态中文映射 */
const LISTING_STATUS_MAP = {
  on_sale: '在售',
  locked: '已锁定',
  sold: '已售出',
  withdrawn: '已下架',
  admin_withdrawn: '管理员下架'
}

/** 兑换状态中文映射 */
const EXCHANGE_STATUS_MAP = {
  pending: '待处理',
  completed: '已完成',
  shipped: '已发货',
  cancelled: '已取消'
}

/** 交易状态中文映射 */
const TRADE_STATUS_MAP = {
  created: '已创建',
  frozen: '已冻结',
  completed: '已完成',
  cancelled: '已取消',
  failed: '失败'
}

/**
 * 用户数据查询页面组件
 * @returns {Object} Alpine.js 组件数据
 */
export function userDataQueryPage() {
  return createPageMixin(
    {
      pagination: { page_size: 20 },
      modal: true,
      authGuard: true
    },
    {
      // ========== 搜索相关 ==========
      search_keyword: '',
      search_results: [],
      searching: false,

      // ========== 当前选中用户 ==========
      selected_user_id: null,
      user_overview: null,

      // ========== Tab 管理 ==========
      active_tab: 'asset_transactions',

      // ========== 各 Tab 数据 ==========
      asset_transactions: { list: [], total: 0, summary: {} },
      lottery_draws: { list: [], total: 0, summary: {} },
      exchange_records: { list: [], total: 0, summary: {} },
      trade_records: { list: [], total: 0, summary: {} },
      market_listings: { list: [], total: 0, summary: {} },
      conversions: { list: [], total: 0, summary: {} },

      // ========== 筛选参数 ==========
      filters: {
        asset_code: '',
        business_type: '',
        direction: '',
        status: '',
        role: 'all',
        reward_tier: '',
        start_date: '',
        end_date: ''
      },

      // ========== 兑换订单审核 ==========
      review_modal: {
        visible: false,
        order_no: '',
        current_status: '',
        target_status: '',
        admin_remark: '',
        submitting: false
      },

      // ========== 加载状态 ==========
      tab_loading: false,

      // ========== 生命周期 ==========
      async init() {
        logger.info('[UserDataQuery] 页面初始化')
        if (!this.checkAuth()) return

        const params = new URLSearchParams(window.location.search)
        const uid = params.get('user_id')
        if (uid) {
          this.search_keyword = uid
          await this.selectUser(parseInt(uid))
        }
      },

      // ========== 搜索用户 ==========
      async searchUser() {
        if (!this.search_keyword.trim()) {
          Alpine.store('notification').show('请输入用户 ID 或手机号', 'warning')
          return
        }

        this.searching = true
        try {
          const res = await UserDataQueryAPI.searchUser(this.search_keyword.trim())
          if (res.success && res.data) {
            this.search_results = res.data
            if (res.data.length === 0) {
              Alpine.store('notification').show('未找到匹配用户', 'warning')
            } else if (res.data.length === 1) {
              await this.selectUser(res.data[0].user_id)
            }
          }
        } catch (err) {
          logger.error('[UserDataQuery] 搜索失败', err)
          Alpine.store('notification').show(`搜索失败: ${err.message}`, 'error')
        } finally {
          this.searching = false
        }
      },

      // ========== 选择用户 ==========
      async selectUser(user_id) {
        this.selected_user_id = user_id
        this.search_results = []

        try {
          const res = await UserDataQueryAPI.getOverview(user_id)
          if (res.success && res.data) {
            this.user_overview = res.data
          } else {
            Alpine.store('notification').show('获取用户信息失败', 'error')
            return
          }
        } catch (err) {
          logger.error('[UserDataQuery] 获取概览失败', err)
          Alpine.store('notification').show(`获取用户信息失败: ${err.message}`, 'error')
          return
        }

        this.resetPagination()
        await this.loadTabData()
      },

      // ========== Tab 切换 ==========
      async switchTab(tab) {
        if (this.active_tab === tab) return
        this.active_tab = tab
        this.resetPagination()
        this.resetFilters()
        await this.loadTabData()
      },

      resetFilters() {
        this.filters = {
          asset_code: '',
          business_type: '',
          direction: '',
          status: '',
          role: 'all',
          reward_tier: '',
          start_date: '',
          end_date: ''
        }
      },

      // ========== 数据加载 ==========
      async loadTabData() {
        if (!this.selected_user_id) return
        this.tab_loading = true

        const params = {
          page: this.current_page || 1,
          page_size: this.page_size || 20,
          start_date: this.filters.start_date || undefined,
          end_date: this.filters.end_date || undefined
        }

        try {
          switch (this.active_tab) {
            case 'asset_transactions':
              await this._loadAssetTransactions(params)
              break
            case 'lottery_draws':
              await this._loadLotteryDraws(params)
              break
            case 'exchange_records':
              await this._loadExchangeRecords(params)
              break
            case 'trade_records':
              await this._loadTradeRecords(params)
              break
            case 'market_listings':
              await this._loadMarketListings(params)
              break
            case 'conversions':
              await this._loadConversions(params)
              break
          }
        } catch (err) {
          logger.error(`[UserDataQuery] 加载 ${this.active_tab} 失败`, err)
          Alpine.store('notification').show(`数据加载失败: ${err.message}`, 'error')
        } finally {
          this.tab_loading = false
        }
      },

      async _loadAssetTransactions(params) {
        if (this.filters.asset_code) params.asset_code = this.filters.asset_code
        if (this.filters.business_type) params.business_type = this.filters.business_type
        if (this.filters.direction) params.direction = this.filters.direction

        const res = await UserDataQueryAPI.getAssetTransactions(this.selected_user_id, params)
        if (res.success && res.data) {
          this.asset_transactions = res.data
          this.updatePagination(res.data)
        }
      },

      async _loadLotteryDraws(params) {
        if (this.filters.reward_tier) params.reward_tier = this.filters.reward_tier

        const res = await UserDataQueryAPI.getLotteryDraws(this.selected_user_id, params)
        if (res.success && res.data) {
          this.lottery_draws = res.data
          this.updatePagination(res.data)
        }
      },

      async _loadExchangeRecords(params) {
        if (this.filters.status) params.status = this.filters.status

        const res = await UserDataQueryAPI.getExchangeRecords(this.selected_user_id, params)
        if (res.success && res.data) {
          this.exchange_records = res.data
          this.updatePagination(res.data)
        }
      },

      async _loadTradeRecords(params) {
        if (this.filters.role) params.role = this.filters.role
        if (this.filters.status) params.status = this.filters.status

        const res = await UserDataQueryAPI.getTradeRecords(this.selected_user_id, params)
        if (res.success && res.data) {
          this.trade_records = res.data
          this.updatePagination(res.data)
        }
      },

      async _loadMarketListings(params) {
        if (this.filters.status) params.status = this.filters.status

        const res = await UserDataQueryAPI.getMarketListings(this.selected_user_id, params)
        if (res.success && res.data) {
          this.market_listings = res.data
          this.updatePagination(res.data)
        }
      },

      async _loadConversions(params) {
        const res = await UserDataQueryAPI.getConversions(this.selected_user_id, params)
        if (res.success && res.data) {
          this.conversions = res.data
          this.updatePagination(res.data)
        }
      },

      // ========== 筛选/换页 ==========
      async applyFilter() {
        this.resetPagination()
        await this.loadTabData()
      },

      async changePage(newPage) {
        this.current_page = newPage
        await this.loadTabData()
      },

      /**
       * 计算总页数（方法而非 getter，避免 Object.assign 丢失）
       * @returns {number} 总页数
       */
      getTotalPages() {
        return Math.ceil((this.total_records || 0) / (this.page_size || 20)) || 1
      },

      // ========== 兑换订单审核操作 ==========

      /**
       * 打开审核模态框
       * @param {string} order_no - 订单号
       * @param {string} current_status - 当前状态
       * @param {string} target_status - 目标状态（completed / shipped / cancelled）
       */
      openReviewModal(order_no, current_status, target_status) {
        this.review_modal = {
          visible: true,
          order_no,
          current_status,
          target_status,
          admin_remark: '',
          submitting: false
        }
      },

      closeReviewModal() {
        this.review_modal.visible = false
      },

      /** 获取审核操作的中文描述 */
      reviewActionLabel(target_status) {
        const map = { completed: '完成', shipped: '发货', cancelled: '取消' }
        return map[target_status] || target_status
      },

      /** 提交审核操作 */
      async submitReview() {
        if (this.review_modal.submitting) return
        this.review_modal.submitting = true

        try {
          const { order_no, target_status, admin_remark } = this.review_modal
          const res = await UserDataQueryAPI.reviewExchangeRecord(
            this.selected_user_id,
            order_no,
            { status: target_status, admin_remark }
          )

          if (res.success) {
            Alpine.store('notification').show(
              `订单 ${order_no} 已${this.reviewActionLabel(target_status)}`,
              'success'
            )
            this.closeReviewModal()
            await this.loadTabData()
          } else {
            Alpine.store('notification').show(res.message || '审核操作失败', 'error')
          }
        } catch (err) {
          logger.error('[UserDataQuery] 审核操作失败', err)
          Alpine.store('notification').show(`审核失败: ${err.message}`, 'error')
        } finally {
          this.review_modal.submitting = false
        }
      },

      /** 判断兑换订单是否可执行指定审核操作 */
      canReview(current_status, target_status) {
        const transitions = {
          pending: ['completed', 'shipped', 'cancelled'],
          shipped: ['completed'],
          completed: [],
          cancelled: []
        }
        return (transitions[current_status] || []).includes(target_status)
      },

      // ========== 格式化辅助 ==========
      formatBusinessType(type) {
        return BUSINESS_TYPE_MAP[type] || type || '-'
      },

      formatRewardTier(tier) {
        return REWARD_TIER_MAP[tier] || tier || '-'
      },

      formatListingStatus(status) {
        return LISTING_STATUS_MAP[status] || status || '-'
      },

      formatExchangeStatus(status) {
        return EXCHANGE_STATUS_MAP[status] || status || '-'
      },

      formatTradeStatus(status) {
        return TRADE_STATUS_MAP[status] || status || '-'
      },

      formatAmount(amount) {
        if (amount == null) return '-'
        const num = Number(amount)
        return num >= 0 ? `+${num.toLocaleString()}` : num.toLocaleString()
      },

      formatAbsAmount(amount) {
        if (amount == null) return '-'
        return Math.abs(Number(amount)).toLocaleString()
      },

      amountClass(amount) {
        const num = Number(amount)
        if (num > 0) return 'text-green-600 font-medium'
        if (num < 0) return 'text-red-600 font-medium'
        return 'themed-text-muted'
      },

      statusBadgeClass(status) {
        const map = {
          on_sale: 'bg-green-100 text-green-800',
          locked: 'bg-yellow-100 text-yellow-800',
          sold: 'bg-blue-100 text-blue-800',
          withdrawn: 'bg-gray-100 text-gray-800',
          admin_withdrawn: 'bg-red-100 text-red-800',
          pending: 'bg-yellow-100 text-yellow-800',
          completed: 'bg-green-100 text-green-800',
          shipped: 'bg-blue-100 text-blue-800',
          cancelled: 'bg-gray-100 text-gray-800',
          created: 'bg-blue-100 text-blue-800',
          frozen: 'bg-yellow-100 text-yellow-800',
          failed: 'bg-red-100 text-red-800',
          active: 'bg-green-100 text-green-800',
          inactive: 'bg-gray-100 text-gray-800',
          banned: 'bg-red-100 text-red-800'
        }
        return map[status] || 'bg-gray-100 text-gray-800'
      },

      tierBadgeClass(tier) {
        const map = {
          low: 'bg-gray-100 text-gray-700',
          mid: 'bg-blue-100 text-blue-700',
          high: 'bg-purple-100 text-purple-700',
          fallback: 'bg-yellow-100 text-yellow-700'
        }
        return map[tier] || 'bg-gray-100 text-gray-700'
      },

      /**
       * 加载数据入口（供 paginationMixin.goToPage 回调使用）
       */
      loadData() {
        return this.loadTabData()
      }
    }
  )
}

// Alpine.js 注册
document.addEventListener('alpine:init', () => {
  Alpine.data('userDataQueryPage', userDataQueryPage)
  logger.info('[UserDataQuery] Alpine 组件已注册')
})
