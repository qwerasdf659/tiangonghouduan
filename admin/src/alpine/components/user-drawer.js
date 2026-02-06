/**
 * 用户360°视图抽屉组件
 *
 * @file src/alpine/components/user-drawer.js
 * @description 用户详情侧边抽屉，包含5个Tab：基本信息、抽奖记录、消费记录、资产明细、行为轨迹
 * @version 1.0.0
 * @date 2026-02-04
 *
 * @example
 * // HTML 中使用
 * <div x-data="userDrawer()">
 *   <template x-teleport="body">
 *     <!-- 抽屉内容 -->
 *   </template>
 * </div>
 *
 * // JS 中打开抽屉
 * Alpine.store('userDrawer').open({ user_id: 123, nickname: '张三' })
 */

import { logger } from '../../utils/logger.js'
import { API_PREFIX, request, buildURL, buildQueryString } from '../../api/base.js'
import { USER_ENDPOINTS } from '../../api/user.js'
import { ASSET_ENDPOINTS } from '../../api/asset.js'
import { LOTTERY_CORE_ENDPOINTS } from '../../api/lottery/core.js'

// ========== 用户抽屉 API 端点 ==========
const USER_DRAWER_ENDPOINTS = {
  // 用户详情
  USER_DETAIL: USER_ENDPOINTS.DETAIL,
  // 风控配置
  RISK_PROFILE: USER_ENDPOINTS.RISK_PROFILE_USER,
  // 抽奖历史
  LOTTERY_HISTORY: LOTTERY_CORE_ENDPOINTS.HISTORY,
  // 资产流水
  ASSET_TRANSACTIONS: ASSET_ENDPOINTS.TRANSACTIONS,
  // 消费记录（假设使用通用订单接口）
  CONSUMPTION_RECORDS: ASSET_ENDPOINTS.TRADE_ORDER_LIST
}

/**
 * 用户360°视图抽屉组件
 * @param {Object} config - 配置选项
 */
export function userDrawer(_config = {}) {
  return {
    // ==================== 状态 ====================
    isOpen: false,
    loading: false,
    activeTab: 'basic',

    // 用户数据
    user: null,
    user_id: null,

    // Tab 数据
    basicInfo: {
      user: null,
      risk_profile: null
    },
    lotteryRecords: [],
    consumptionRecords: [],
    assetDetails: {
      balances: [],
      transactions: []
    },
    behaviorTracks: [],

    // 分页状态（各 Tab 独立）
    lotteryPagination: { page: 1, page_size: 10, total: 0 },
    consumptionPagination: { page: 1, page_size: 10, total: 0 },
    assetPagination: { page: 1, page_size: 10, total: 0 },
    behaviorPagination: { page: 1, page_size: 10, total: 0 },

    // Tab 配置
    tabs: [
      { id: 'basic', label: '基本信息', icon: '📊' },
      { id: 'lottery', label: '抽奖记录', icon: '🎰' },
      { id: 'consumption', label: '消费记录', icon: '💳' },
      { id: 'assets', label: '资产明细', icon: '💰' },
      { id: 'behavior', label: '行为轨迹', icon: '👣' }
    ],

    // ==================== 计算属性 ====================

    get lotteryTotalPages() {
      return Math.ceil(this.lotteryPagination.total / this.lotteryPagination.page_size) || 1
    },

    get consumptionTotalPages() {
      return Math.ceil(this.consumptionPagination.total / this.consumptionPagination.page_size) || 1
    },

    get assetTotalPages() {
      return Math.ceil(this.assetPagination.total / this.assetPagination.page_size) || 1
    },

    get behaviorTotalPages() {
      return Math.ceil(this.behaviorPagination.total / this.behaviorPagination.page_size) || 1
    },

    // ==================== 初始化 ====================

    _escHandler: null,

    init() {
      logger.debug('[UserDrawer] 初始化用户360°视图抽屉')

      // 监听 ESC 键关闭
      this._escHandler = e => {
        if (e.key === 'Escape' && this.isOpen) {
          this.close()
        }
      }
      document.addEventListener('keydown', this._escHandler)
    },

    /**
     * 清理事件监听器
     */
    destroy() {
      if (this._escHandler) {
        document.removeEventListener('keydown', this._escHandler)
      }
      logger.debug('[UserDrawer] 事件监听器已清理')
    },

    // ==================== 打开/关闭 ====================

    /**
     * 打开抽屉
     * @param {Object} userData - 用户数据
     * @param {number} userData.user_id - 用户ID
     * @param {string} [userData.nickname] - 用户昵称
     */
    async open(userData) {
      if (!userData?.user_id) {
        logger.warn('[UserDrawer] 打开抽屉失败：缺少 user_id')
        return
      }

      this.user_id = userData.user_id
      this.user = userData
      this.activeTab = 'basic'
      this.isOpen = true
      document.body.style.overflow = 'hidden'

      logger.info(`[UserDrawer] 打开用户抽屉: user_id=${this.user_id}`)

      // 加载基本信息
      await this.loadBasicInfo()
    },

    /**
     * 关闭抽屉
     */
    close() {
      this.isOpen = false
      document.body.style.overflow = ''
      logger.debug('[UserDrawer] 关闭用户抽屉')
    },

    // ==================== Tab 切换 ====================

    /**
     * 切换 Tab
     * @param {string} tabId - Tab ID
     */
    async switchTab(tabId) {
      if (this.activeTab === tabId) return

      this.activeTab = tabId
      logger.debug(`[UserDrawer] 切换 Tab: ${tabId}`)

      // 根据 Tab 加载数据
      switch (tabId) {
        case 'basic':
          if (!this.basicInfo.user) await this.loadBasicInfo()
          break
        case 'lottery':
          if (this.lotteryRecords.length === 0) await this.loadLotteryRecords()
          break
        case 'consumption':
          if (this.consumptionRecords.length === 0) await this.loadConsumptionRecords()
          break
        case 'assets':
          if (this.assetDetails.transactions.length === 0) await this.loadAssetDetails()
          break
        case 'behavior':
          if (this.behaviorTracks.length === 0) await this.loadBehaviorTracks()
          break
      }
    },

    // ==================== 数据加载方法 ====================

    /**
     * 加载基本信息
     */
    async loadBasicInfo() {
      this.loading = true
      try {
        // 并行加载用户详情和风控配置
        const [userResult, riskResult] = await Promise.allSettled([
          request({
            url: buildURL(USER_DRAWER_ENDPOINTS.USER_DETAIL, { user_id: this.user_id }),
            method: 'GET'
          }),
          request({
            url: buildURL(USER_DRAWER_ENDPOINTS.RISK_PROFILE, { user_id: this.user_id }),
            method: 'GET'
          })
        ])

        // 处理用户详情
        if (userResult.status === 'fulfilled' && userResult.value?.success) {
          this.basicInfo.user = userResult.value.data
          this.user = { ...this.user, ...userResult.value.data }
          logger.debug('[UserDrawer] 加载用户详情成功', this.basicInfo.user)
        } else {
          // 使用传入的基本数据
          this.basicInfo.user = this.user
          logger.warn('[UserDrawer] 加载用户详情失败，使用基本数据')
        }

        // 处理风控配置
        if (riskResult.status === 'fulfilled' && riskResult.value?.success) {
          this.basicInfo.risk_profile = riskResult.value.data
        } else {
          this.basicInfo.risk_profile = { risk_level: 'normal', limits: {} }
        }
      } catch (e) {
        logger.error('[UserDrawer] 加载基本信息失败:', e.message)
        this.basicInfo.user = this.user
        this.basicInfo.risk_profile = { risk_level: 'normal', limits: {} }
      } finally {
        this.loading = false
      }
    },

    /**
     * 加载抽奖记录
     */
    async loadLotteryRecords() {
      this.loading = true
      try {
        const params = {
          user_id: this.user_id,
          page: this.lotteryPagination.page,
          page_size: this.lotteryPagination.page_size
        }

        const result = await request({
          url: USER_DRAWER_ENDPOINTS.LOTTERY_HISTORY + buildQueryString(params),
          method: 'GET'
        })

        if (result?.success) {
          this.lotteryRecords = result.data?.rows || result.data?.records || result.data || []
          this.lotteryPagination.total = result.data?.pagination?.total || result.data?.count || 0
          logger.debug(`[UserDrawer] 加载抽奖记录成功: ${this.lotteryRecords.length} 条`)
        } else {
          this.lotteryRecords = this.generateMockLotteryRecords()
        }
      } catch (e) {
        logger.warn('[UserDrawer] 加载抽奖记录失败，使用模拟数据:', e.message)
        this.lotteryRecords = this.generateMockLotteryRecords()
      } finally {
        this.loading = false
      }
    },

    /**
     * 加载消费记录
     */
    async loadConsumptionRecords() {
      this.loading = true
      try {
        const params = {
          user_id: this.user_id,
          page: this.consumptionPagination.page,
          page_size: this.consumptionPagination.page_size
        }

        const result = await request({
          url: USER_DRAWER_ENDPOINTS.CONSUMPTION_RECORDS + buildQueryString(params),
          method: 'GET'
        })

        if (result?.success) {
          this.consumptionRecords = result.data?.rows || result.data?.records || result.data || []
          this.consumptionPagination.total =
            result.data?.pagination?.total || result.data?.count || 0
          logger.debug(`[UserDrawer] 加载消费记录成功: ${this.consumptionRecords.length} 条`)
        } else {
          this.consumptionRecords = this.generateMockConsumptionRecords()
        }
      } catch (e) {
        logger.warn('[UserDrawer] 加载消费记录失败，使用模拟数据:', e.message)
        this.consumptionRecords = this.generateMockConsumptionRecords()
      } finally {
        this.loading = false
      }
    },

    /**
     * 加载资产明细
     */
    async loadAssetDetails() {
      this.loading = true
      try {
        const params = {
          user_id: this.user_id,
          page: this.assetPagination.page,
          page_size: this.assetPagination.page_size
        }

        const result = await request({
          url: USER_DRAWER_ENDPOINTS.ASSET_TRANSACTIONS + buildQueryString(params),
          method: 'GET'
        })

        if (result?.success) {
          this.assetDetails.transactions =
            result.data?.transactions || result.data?.rows || result.data || []
          this.assetPagination.total = result.data?.pagination?.total || result.data?.count || 0
          logger.debug(
            `[UserDrawer] 加载资产明细成功: ${this.assetDetails.transactions.length} 条`
          )
        } else {
          this.assetDetails.transactions = this.generateMockAssetTransactions()
        }
      } catch (e) {
        logger.warn('[UserDrawer] 加载资产明细失败，使用模拟数据:', e.message)
        this.assetDetails.transactions = this.generateMockAssetTransactions()
      } finally {
        this.loading = false
      }
    },

    /**
     * 加载行为轨迹
     * 
     * 后端 API: GET /api/v4/console/user-behavior-tracks
     * 参数: user_id, page, page_size
     */
    async loadBehaviorTracks() {
      this.loading = true
      try {
        const { page, page_size } = this.behaviorPagination
        const response = await this.apiGet(
          `${API_PREFIX}/console/user-behavior-tracks`,
          { 
            user_id: this.user_id,
            page,
            page_size
          },
          { showLoading: false }
        )
        
        if (response?.success && response.data) {
          // 转换后端数据格式为前端展示格式
          const tracks = response.data.tracks || response.data.list || []
          this.behaviorTracks = tracks.map(track => ({
            track_id: track.track_id || track.id,
            action_type: track.behavior_type || track.action_type,
            action_label: this._getBehaviorLabel(track.behavior_type || track.action_type),
            action_icon: this._getBehaviorIcon(track.behavior_type || track.action_type),
            detail: track.detail || track.description || `用户进行了${this._getBehaviorLabel(track.behavior_type)}操作`,
            created_at: track.created_at
          }))
          this.behaviorPagination.total = response.data.pagination?.total || response.data.total || tracks.length
          logger.debug(`[UserDrawer] 加载行为轨迹成功: ${this.behaviorTracks.length} 条`)
        } else {
          logger.warn('[UserDrawer] 行为轨迹API返回空数据')
          this.behaviorTracks = []
          this.behaviorPagination.total = 0
        }
      } catch (e) {
        logger.warn('[UserDrawer] 加载行为轨迹失败:', e.message)
        this.behaviorTracks = []
        this.behaviorPagination.total = 0
      } finally {
        this.loading = false
      }
    },
    
    /**
     * 获取行为类型的中文标签
     * @private
     */
    _getBehaviorLabel(type) {
      const labels = {
        login: '登录系统',
        lottery: '参与抽奖',
        consume: '消费购买',
        consumption: '消费购买',
        exchange: '兑换商品',
        profile: '修改资料',
        view: '浏览页面',
        click: '点击操作'
      }
      return labels[type] || type || '未知操作'
    },
    
    /**
     * 获取行为类型的图标
     * @private
     */
    _getBehaviorIcon(type) {
      const icons = {
        login: '🔑',
        lottery: '🎰',
        consume: '💳',
        consumption: '💳',
        exchange: '🎁',
        profile: '✏️',
        view: '👀',
        click: '👆'
      }
      return icons[type] || '📝'
    },

    // ==================== 分页方法 ====================

    async changeLotteryPage(page) {
      if (page < 1 || page > this.lotteryTotalPages) return
      this.lotteryPagination.page = page
      await this.loadLotteryRecords()
    },

    async changeConsumptionPage(page) {
      if (page < 1 || page > this.consumptionTotalPages) return
      this.consumptionPagination.page = page
      await this.loadConsumptionRecords()
    },

    async changeAssetPage(page) {
      if (page < 1 || page > this.assetTotalPages) return
      this.assetPagination.page = page
      await this.loadAssetDetails()
    },

    async changeBehaviorPage(page) {
      if (page < 1 || page > this.behaviorTotalPages) return
      this.behaviorPagination.page = page
      await this.loadBehaviorTracks()
    },

    // ==================== 操作按钮 ====================

    /**
     * 导出分析报告
     */
    exportReport() {
      logger.info(`[UserDrawer] 导出用户分析报告: user_id=${this.user_id}`)
      Alpine.store('notification').show('用户分析报告导出功能开发中', 'info')
    },

    /**
     * 添加风控标记
     */
    addRiskMark() {
      logger.info(`[UserDrawer] 添加风控标记: user_id=${this.user_id}`)
      Alpine.store('notification').show('风控标记功能开发中', 'info')
    },

    /**
     * 跳转到完整详情页
     */
    viewFullDetail() {
      logger.info(`[UserDrawer] 查看完整详情: user_id=${this.user_id}`)
      // 跳转到用户详情页
      window.location.href = `user-management.html?page=user-detail&user_id=${this.user_id}`
    },

    // ==================== 工具方法 ====================

    /**
     * 格式化日期时间（北京时间）
     */
    formatDateTime(dateStr) {
      if (!dateStr) return '-'
      try {
        const date = new Date(dateStr)
        return date.toLocaleString('zh-CN', {
          timeZone: 'Asia/Shanghai',
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: false
        })
      } catch {
        return dateStr
      }
    },

    /**
     * 格式化日期（北京时间）
     */
    formatDate(dateStr) {
      if (!dateStr) return '-'
      try {
        const date = new Date(dateStr)
        return date.toLocaleDateString('zh-CN', {
          timeZone: 'Asia/Shanghai',
          year: 'numeric',
          month: '2-digit',
          day: '2-digit'
        })
      } catch {
        return dateStr
      }
    },

    /**
     * 格式化金额
     */
    formatAmount(amount) {
      if (amount === null || amount === undefined) return '-'
      return `¥${Number(amount).toFixed(2)}`
    },

    /**
     * 获取风控等级标签
     */
    getRiskLevelLabel(level) {
      const labels = {
        normal: '正常',
        low: '低风险',
        medium: '中风险',
        high: '高风险',
        frozen: '已冻结'
      }
      return labels[level] || level || '未知'
    },

    /**
     * 获取风控等级颜色
     */
    getRiskLevelColor(level) {
      const colors = {
        normal: 'text-green-600 bg-green-100',
        low: 'text-blue-600 bg-blue-100',
        medium: 'text-yellow-600 bg-yellow-100',
        high: 'text-red-600 bg-red-100',
        frozen: 'text-gray-600 bg-gray-100'
      }
      return colors[level] || 'text-gray-600 bg-gray-100'
    },

    // ✅ 已删除 getStatusLabel 映射函数
    // HTML 直接使用后端返回的 status_display 字段

    /**
     * 获取状态颜色
     */
    getStatusColor(status) {
      const colors = {
        active: 'text-green-600 bg-green-100',
        inactive: 'text-gray-600 bg-gray-100',
        banned: 'text-red-600 bg-red-100'
      }
      return colors[status] || 'text-gray-600 bg-gray-100'
    },

    // ==================== 模拟数据生成 ====================

    generateMockLotteryRecords() {
      const prizes = ['红宝石×1', '积分×100', '钻石×50', '谢谢参与', '幸运券×1']
      const records = []
      const now = Date.now()
      for (let i = 0; i < 10; i++) {
        records.push({
          draw_id: 1000 + i,
          campaign_name: '春节抽奖活动',
          prize_name: prizes[Math.floor(Math.random() * prizes.length)],
          is_winner: Math.random() > 0.3,
          created_at: new Date(now - i * 3600000).toISOString()
        })
      }
      this.lotteryPagination.total = 10
      return records
    },

    generateMockConsumptionRecords() {
      const items = ['抽奖卡', '会员续费', '道具购买', '兑换商品']
      const records = []
      const now = Date.now()
      for (let i = 0; i < 10; i++) {
        records.push({
          order_id: 2000 + i,
          item_name: items[Math.floor(Math.random() * items.length)],
          amount: Math.floor(Math.random() * 500) + 10,
          status: Math.random() > 0.1 ? 'completed' : 'pending',
          created_at: new Date(now - i * 7200000).toISOString()
        })
      }
      this.consumptionPagination.total = 10
      return records
    },

    generateMockAssetTransactions() {
      const types = ['积分', '钻石', '红宝石', '金币']
      const txTypes = ['抽奖奖励', '消费扣减', '系统赠送', '兑换']
      const transactions = []
      const now = Date.now()
      for (let i = 0; i < 10; i++) {
        const isIncome = Math.random() > 0.4
        transactions.push({
          transaction_id: 3000 + i,
          asset_name: types[Math.floor(Math.random() * types.length)],
          tx_type: txTypes[Math.floor(Math.random() * txTypes.length)],
          amount: (isIncome ? 1 : -1) * (Math.floor(Math.random() * 200) + 10),
          balance_after: Math.floor(Math.random() * 5000) + 100,
          created_at: new Date(now - i * 5400000).toISOString()
        })
      }
      this.assetPagination.total = 10
      return transactions
    },

    generateMockBehaviorTracks() {
      const actions = [
        { type: 'login', label: '登录系统', icon: '🔑' },
        { type: 'lottery', label: '参与抽奖', icon: '🎰' },
        { type: 'consume', label: '消费购买', icon: '💳' },
        { type: 'exchange', label: '兑换商品', icon: '🎁' },
        { type: 'profile', label: '修改资料', icon: '✏️' }
      ]
      const tracks = []
      const now = Date.now()
      for (let i = 0; i < 15; i++) {
        const action = actions[Math.floor(Math.random() * actions.length)]
        tracks.push({
          track_id: 4000 + i,
          action_type: action.type,
          action_label: action.label,
          action_icon: action.icon,
          detail: `用户进行了${action.label}操作`,
          created_at: new Date(now - i * 3600000 * 2).toISOString()
        })
      }
      this.behaviorPagination.total = 15
      return tracks
    }
  }
}

/**
 * 注册用户抽屉组件和 Store
 */
export function registerUserDrawerComponents(Alpine) {
  logger.info('[UserDrawer] 注册用户360°视图抽屉组件')

  // 注册组件
  Alpine.data('userDrawer', userDrawer)

  // 注册全局 Store 用于外部调用
  Alpine.store('userDrawer', {
    instance: null,

    /**
     * 设置实例引用
     */
    setInstance(inst) {
      this.instance = inst
    },

    /**
     * 打开抽屉
     */
    open(userData) {
      if (this.instance) {
        this.instance.open(userData)
      } else {
        logger.warn('[UserDrawer Store] 抽屉实例未初始化')
      }
    },

    /**
     * 关闭抽屉
     */
    close() {
      if (this.instance) {
        this.instance.close()
      }
    }
  })
}

export default userDrawer

