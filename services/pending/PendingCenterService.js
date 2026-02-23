/**
 * 待处理中心服务（PendingCenterService）
 *
 * 业务场景：
 * - 为运营后台提供统一的待处理事项管理中心
 * - 支持多分类汇总、统一列表展示、紧急筛选
 * - 汇聚4大核心待处理数据源
 *
 * 技术特性：
 * - 使用 BusinessCacheHelper 进行 Redis L2 缓存（TTL=60秒）
 * - 并行查询多个数据源（Promise.all）
 * - 基于 BeijingTimeHelper 进行超时判定
 *
 * API 端点：
 * - GET /api/v4/admin/pending/summary - 分类汇总
 * - GET /api/v4/admin/pending/list - 统一列表（分页、筛选）
 *
 * 创建时间：2026年01月31日
 * 关联文档：后端数据库开发任务清单-2026年1月.md（P0-B6、P0-B7）
 *
 * @module services/pending/PendingCenterService
 */

'use strict'

const { Op } = require('sequelize')
const { BusinessCacheHelper, DEFAULT_TTL, KEY_PREFIX } = require('../../utils/BusinessCacheHelper')
const BeijingTimeHelper = require('../../utils/timeHelper')
const logger = require('../../utils/logger').logger

/**
 * 超时阈值配置（单位：分钟）
 * @description 基于 D-5 决策：使用硬编码配置 + system_config 表动态调整
 * @constant
 */
const TIMEOUT_THRESHOLDS = {
  /** 消费记录审核超时阈值（24小时） */
  consumption: 24 * 60,
  /** 客服会话超时阈值（30分钟） */
  customer_service: 30,
  /** 风控告警超时阈值（1小时） */
  risk_alert: 60,
  /** 抽奖告警超时阈值（2小时） */
  lottery_alert: 120,
  /** 兑换核销超时阈值（48小时，核销码有30天有效期但运营应48小时内处理） */
  redemption: 48 * 60,
  /** 用户反馈超时阈值（72小时，SLA标准：低优先级72小时内响应） */
  feedback: 72 * 60
}

/**
 * 待处理事项分类枚举
 * @constant
 */
const PENDING_CATEGORIES = {
  CONSUMPTION: 'consumption',
  CUSTOMER_SERVICE: 'customer_service',
  RISK_ALERT: 'risk_alert',
  LOTTERY_ALERT: 'lottery_alert',
  /** 兑换核销待处理（redemption_orders 表 status=pending） */
  REDEMPTION: 'redemption',
  /** 用户反馈待处理（feedbacks 表 status=pending） */
  FEEDBACK: 'feedback'
}

/**
 * 缓存 Key 前缀
 * @constant
 */
const CACHE_KEYS = {
  SEGMENT_STATS: 'pending_segment_stats',
  LIST_PREFIX: 'pending_list'
}

/**
 * 待处理中心服务
 *
 * @description 提供统一的待处理事项管理功能
 */
class PendingCenterService {
  /**
   * 获取分类汇总统计（按业务分类）
   *
   * @description 返回各业务分类的待处理数量统计
   *
   * @returns {Promise<Object>} 分类汇总数据
   * @returns {Array} return.segments - 分类统计数组
   * @returns {Object} return.total - 汇总统计
   *
   * @example
   * const stats = await PendingCenterService.getSegmentStats()
   * // { segments: [{ category: 'consumption', count: 5, urgent_count: 2 }, ...], total: {...} }
   */
  static async getSegmentStats() {
    const cacheKey = `${KEY_PREFIX}${CACHE_KEYS.SEGMENT_STATS}`

    try {
      // 1. 尝试从缓存获取
      const cached = await BusinessCacheHelper.get(cacheKey)
      if (cached) {
        logger.debug('[待处理中心] 使用缓存的分类统计')
        return cached
      }

      // 2. 并行查询各分类统计（6个数据源）
      const [consumption, customerService, riskAlerts, lotteryAlerts, redemption, feedback] =
        await Promise.all([
          this._getCategoryStats(PENDING_CATEGORIES.CONSUMPTION),
          this._getCategoryStats(PENDING_CATEGORIES.CUSTOMER_SERVICE),
          this._getCategoryStats(PENDING_CATEGORIES.RISK_ALERT),
          this._getCategoryStats(PENDING_CATEGORIES.LOTTERY_ALERT),
          this._getCategoryStats(PENDING_CATEGORIES.REDEMPTION),
          this._getCategoryStats(PENDING_CATEGORIES.FEEDBACK)
        ])

      // 3. 组装返回结构
      const segments = [
        {
          category: PENDING_CATEGORIES.CONSUMPTION,
          category_name: '消费记录审核',
          icon: 'receipt',
          ...consumption
        },
        {
          category: PENDING_CATEGORIES.CUSTOMER_SERVICE,
          category_name: '客服会话',
          icon: 'message',
          ...customerService
        },
        {
          category: PENDING_CATEGORIES.RISK_ALERT,
          category_name: '风控告警',
          icon: 'warning',
          ...riskAlerts
        },
        {
          category: PENDING_CATEGORIES.LOTTERY_ALERT,
          category_name: '抽奖告警',
          icon: 'trophy',
          ...lotteryAlerts
        },
        {
          category: PENDING_CATEGORIES.REDEMPTION,
          category_name: '兑换核销',
          icon: 'ticket',
          ...redemption
        },
        {
          category: PENDING_CATEGORIES.FEEDBACK,
          category_name: '用户反馈',
          icon: 'feedback',
          ...feedback
        }
      ]

      // 4. 计算总体统计
      const totalCount = segments.reduce((sum, s) => sum + s.count, 0)
      const urgentCount = segments.reduce((sum, s) => sum + s.urgent_count, 0)

      const result = {
        segments,
        total: {
          total_count: totalCount,
          urgent_count: urgentCount,
          updated_at: BeijingTimeHelper.apiTimestamp()
        }
      }

      // 5. 写入缓存
      await BusinessCacheHelper.set(cacheKey, result, DEFAULT_TTL.STATS)

      return result
    } catch (error) {
      logger.error('[待处理中心] 分类统计查询失败', { error: error.message })
      throw error
    }
  }

  /**
   * 获取统一待处理列表（分页、筛选）
   *
   * @description 返回所有待处理事项的统一列表，支持分页和筛选
   *
   * @param {Object} options - 查询选项
   * @param {string} [options.category] - 筛选分类（可选）
   * @param {boolean} [options.urgent_only] - 仅显示紧急项（默认：false）
   * @param {number} [options.page] - 页码（默认：1）
   * @param {number} [options.page_size] - 每页数量（默认：20）
   * @param {string} [options.sort_by] - 排序字段（默认：created_at）
   * @param {string} [options.sort_order] - 排序方向（默认：ASC，最早优先）
   * @returns {Promise<Object>} 分页列表数据
   *
   * @example
   * const list = await PendingCenterService.getUnifiedList({ category: 'consumption', page: 1 })
   */
  static async getUnifiedList(options = {}) {
    const { category = null, urgent_only = false, page = 1, page_size = 20 } = options

    try {
      // 1. 根据筛选条件并行获取数据
      const items = []

      // 如果指定了分类，只查询该分类
      if (category) {
        const categoryItems = await this._getCategoryItems(category, { urgent_only })
        items.push(...categoryItems)
      } else {
        // 否则查询所有分类（6个数据源）
        const [consumption, customerService, riskAlerts, lotteryAlerts, redemption, feedback] =
          await Promise.all([
            this._getCategoryItems(PENDING_CATEGORIES.CONSUMPTION, { urgent_only }),
            this._getCategoryItems(PENDING_CATEGORIES.CUSTOMER_SERVICE, { urgent_only }),
            this._getCategoryItems(PENDING_CATEGORIES.RISK_ALERT, { urgent_only }),
            this._getCategoryItems(PENDING_CATEGORIES.LOTTERY_ALERT, { urgent_only }),
            this._getCategoryItems(PENDING_CATEGORIES.REDEMPTION, { urgent_only }),
            this._getCategoryItems(PENDING_CATEGORIES.FEEDBACK, { urgent_only })
          ])

        items.push(
          ...consumption,
          ...customerService,
          ...riskAlerts,
          ...lotteryAlerts,
          ...redemption,
          ...feedback
        )
      }

      // 2. 按创建时间排序（紧急项优先，然后按时间升序）
      items.sort((a, b) => {
        // 紧急项优先
        if (a.is_urgent !== b.is_urgent) {
          return a.is_urgent ? -1 : 1
        }
        // 按创建时间升序（越早越靠前）
        return new Date(a.created_at) - new Date(b.created_at)
      })

      // 3. 分页处理
      const total = items.length
      const totalPages = Math.ceil(total / page_size)
      const startIndex = (page - 1) * page_size
      const paginatedItems = items.slice(startIndex, startIndex + page_size)

      return {
        items: paginatedItems,
        pagination: {
          page,
          page_size,
          total,
          total_pages: totalPages,
          has_next: page < totalPages,
          has_prev: page > 1
        },
        filter: {
          category,
          urgent_only
        },
        updated_at: BeijingTimeHelper.apiTimestamp()
      }
    } catch (error) {
      logger.error('[待处理中心] 列表查询失败', { error: error.message })
      throw error
    }
  }

  /**
   * 获取单个分类的统计数据
   *
   * @private
   * @param {string} category - 分类标识
   * @returns {Promise<Object>} 统计数据
   */
  static async _getCategoryStats(category) {
    try {
      switch (category) {
        case PENDING_CATEGORIES.CONSUMPTION:
          return await this._getConsumptionStats()
        case PENDING_CATEGORIES.CUSTOMER_SERVICE:
          return await this._getCustomerServiceStats()
        case PENDING_CATEGORIES.RISK_ALERT:
          return await this._getRiskAlertStats()
        case PENDING_CATEGORIES.LOTTERY_ALERT:
          return await this._getLotteryAlertStats()
        case PENDING_CATEGORIES.REDEMPTION:
          return await this._getRedemptionStats()
        case PENDING_CATEGORIES.FEEDBACK:
          return await this._getFeedbackStats()
        default:
          return { count: 0, urgent_count: 0, oldest_minutes: 0 }
      }
    } catch (error) {
      logger.warn(`[待处理中心] ${category} 统计查询失败`, { error: error.message })
      return { count: 0, urgent_count: 0, oldest_minutes: 0, error: error.message }
    }
  }

  /**
   * 获取单个分类的具体列表项
   *
   * @private
   * @param {string} category - 分类标识
   * @param {Object} options - 查询选项
   * @returns {Promise<Array>} 列表项数组
   */
  static async _getCategoryItems(category, options = {}) {
    try {
      switch (category) {
        case PENDING_CATEGORIES.CONSUMPTION:
          return await this._getConsumptionItems(options)
        case PENDING_CATEGORIES.CUSTOMER_SERVICE:
          return await this._getCustomerServiceItems(options)
        case PENDING_CATEGORIES.RISK_ALERT:
          return await this._getRiskAlertItems(options)
        case PENDING_CATEGORIES.LOTTERY_ALERT:
          return await this._getLotteryAlertItems(options)
        case PENDING_CATEGORIES.REDEMPTION:
          return await this._getRedemptionItems(options)
        case PENDING_CATEGORIES.FEEDBACK:
          return await this._getFeedbackItems(options)
        default:
          return []
      }
    } catch (error) {
      logger.warn(`[待处理中心] ${category} 列表查询失败`, { error: error.message })
      return []
    }
  }

  // ==================== 消费记录审核 ====================

  /**
   * 获取消费记录审核统计
   * @private
   * @returns {Promise<Object>} 消费记录审核统计信息
   */
  static async _getConsumptionStats() {
    const { ConsumptionRecord } = require('../../models')

    const records = await ConsumptionRecord.scope('pending').findAll({
      attributes: ['consumption_record_id', 'created_at']
    })

    const now = new Date()
    const threshold = TIMEOUT_THRESHOLDS.consumption

    let urgentCount = 0
    let oldestMinutes = 0

    records.forEach(record => {
      const waitMinutes = Math.floor((now - new Date(record.created_at)) / 60000)
      if (waitMinutes >= threshold) urgentCount++
      if (waitMinutes > oldestMinutes) oldestMinutes = waitMinutes
    })

    return {
      count: records.length,
      urgent_count: urgentCount,
      oldest_minutes: oldestMinutes,
      timeout_threshold_minutes: threshold
    }
  }

  /**
   * 获取消费记录审核列表项
   * @private
   * @param {Object} options - 查询选项
   * @param {boolean} [options.urgent_only=false] - 是否只返回紧急项
   * @returns {Promise<Array<Object>>} 消费记录审核列表项
   */
  static async _getConsumptionItems(options = {}) {
    const { ConsumptionRecord } = require('../../models')
    const { urgent_only = false } = options

    const records = await ConsumptionRecord.scope(['pending', 'withUser']).findAll({
      order: [['created_at', 'ASC']],
      limit: 100 // 限制最多100条
    })

    const now = new Date()
    const threshold = TIMEOUT_THRESHOLDS.consumption

    return records
      .map(record => {
        const waitMinutes = Math.floor((now - new Date(record.created_at)) / 60000)
        const isUrgent = waitMinutes >= threshold

        return {
          id: record.consumption_record_id,
          category: PENDING_CATEGORIES.CONSUMPTION,
          category_name: '消费记录审核',
          title: `消费金额 ¥${record.consumption_amount}`,
          description: record.merchant_notes || '待审核消费记录',
          user_id: record.user_id,
          user_info: record.user
            ? {
                nickname: record.user.nickname,
                mobile: record.user.mobile
              }
            : null,
          created_at: BeijingTimeHelper.format(record.created_at),
          waiting_time: this._formatWaitingTime(waitMinutes),
          waiting_minutes: waitMinutes,
          is_urgent: isUrgent,
          action_url: `/admin/consumption/review/${record.consumption_record_id}`
        }
      })
      .filter(item => (urgent_only ? item.is_urgent : true))
  }

  // ==================== 客服会话 ====================

  /**
   * 获取客服会话统计
   * @private
   * @returns {Promise<Object>} 客服会话统计信息
   */
  static async _getCustomerServiceStats() {
    const { CustomerServiceSession } = require('../../models')

    const sessions = await CustomerServiceSession.findAll({
      where: {
        status: { [Op.in]: ['waiting', 'assigned', 'active'] }
      },
      attributes: ['customer_service_session_id', 'status', 'created_at', 'last_message_at']
    })

    const now = new Date()
    const threshold = TIMEOUT_THRESHOLDS.customer_service

    let urgentCount = 0
    let oldestMinutes = 0

    sessions.forEach(session => {
      const refTime = session.last_message_at || session.created_at
      const waitMinutes = Math.floor((now - new Date(refTime)) / 60000)
      if (waitMinutes >= threshold) urgentCount++
      if (waitMinutes > oldestMinutes) oldestMinutes = waitMinutes
    })

    return {
      count: sessions.length,
      urgent_count: urgentCount,
      oldest_minutes: oldestMinutes,
      timeout_threshold_minutes: threshold
    }
  }

  /**
   * 获取客服会话列表项
   * @private
   * @param {Object} options - 查询选项
   * @param {boolean} [options.urgent_only=false] - 是否只返回紧急项
   * @returns {Promise<Array<Object>>} 客服会话列表项
   */
  static async _getCustomerServiceItems(options = {}) {
    const { CustomerServiceSession } = require('../../models')
    const { urgent_only = false } = options

    const sessions = await CustomerServiceSession.findAll({
      where: {
        status: { [Op.in]: ['waiting', 'assigned', 'active'] }
      },
      include: [
        {
          association: 'user',
          attributes: ['user_id', 'nickname', 'mobile']
        }
      ],
      order: [['created_at', 'ASC']],
      limit: 100
    })

    const now = new Date()
    const threshold = TIMEOUT_THRESHOLDS.customer_service

    return sessions
      .map(session => {
        const refTime = session.last_message_at || session.created_at
        const waitMinutes = Math.floor((now - new Date(refTime)) / 60000)
        const isUrgent = waitMinutes >= threshold

        const statusMap = {
          waiting: '等待接入',
          assigned: '已分配',
          active: '对话中'
        }

        return {
          id: session.customer_service_session_id,
          category: PENDING_CATEGORIES.CUSTOMER_SERVICE,
          category_name: '客服会话',
          title: statusMap[session.status] || session.status,
          description: `用户咨询会话`,
          user_id: session.user_id,
          user_info: session.user
            ? {
                nickname: session.user.nickname,
                mobile: session.user.mobile
              }
            : null,
          created_at: BeijingTimeHelper.format(session.created_at),
          waiting_time: this._formatWaitingTime(waitMinutes),
          waiting_minutes: waitMinutes,
          is_urgent: isUrgent,
          action_url: `/admin/customer-service/session/${session.customer_service_session_id}`
        }
      })
      .filter(item => (urgent_only ? item.is_urgent : true))
  }

  // ==================== 风控告警 ====================

  /**
   * 获取风控告警统计
   * @private
   * @returns {Promise<Object>} 风控告警统计信息
   */
  static async _getRiskAlertStats() {
    try {
      const LotteryAlertService = require('../LotteryAlertService')
      const result = await LotteryAlertService.getAlertList({
        type: 'user',
        status: 'active',
        limit: 100
      })
      const alerts = result.alerts || []

      const now = new Date()
      const threshold = TIMEOUT_THRESHOLDS.risk_alert

      let urgentCount = 0
      let oldestMinutes = 0

      if (alerts && alerts.length > 0) {
        alerts.forEach(alert => {
          const waitMinutes = Math.floor((now - new Date(alert.created_at)) / 60000)
          if (waitMinutes >= threshold) urgentCount++
          if (waitMinutes > oldestMinutes) oldestMinutes = waitMinutes
        })
      }

      return {
        count: alerts?.length || 0,
        urgent_count: urgentCount,
        oldest_minutes: oldestMinutes,
        timeout_threshold_minutes: threshold
      }
    } catch (error) {
      return { count: 0, urgent_count: 0, oldest_minutes: 0, error: error.message }
    }
  }

  /**
   * 获取风控告警列表项
   * @private
   * @param {Object} options - 查询选项
   * @param {boolean} [options.urgent_only=false] - 是否只返回紧急项
   * @returns {Promise<Array<Object>>} 风控告警列表项
   */
  static async _getRiskAlertItems(options = {}) {
    try {
      const LotteryAlertService = require('../LotteryAlertService')
      const { urgent_only = false } = options
      const result = await LotteryAlertService.getAlertList({
        type: 'user',
        status: 'active',
        limit: 100
      })
      const alerts = result.alerts || []

      if (alerts.length === 0) return []

      const now = new Date()
      const threshold = TIMEOUT_THRESHOLDS.risk_alert

      return alerts
        .map(alert => {
          const waitMinutes = Math.floor((now - new Date(alert.created_at)) / 60000)
          const isUrgent = waitMinutes >= threshold

          return {
            id: alert.alert_id,
            category: PENDING_CATEGORIES.RISK_ALERT,
            category_name: '风控告警',
            title: alert.alert_type || '风控告警',
            description: alert.message || '待处理风控告警',
            user_id: alert.user_id,
            created_at: BeijingTimeHelper.format(alert.created_at),
            waiting_time: this._formatWaitingTime(waitMinutes),
            waiting_minutes: waitMinutes,
            is_urgent: isUrgent,
            action_url: `/admin/risk/alert/${alert.alert_id}`
          }
        })
        .filter(item => (urgent_only ? item.is_urgent : true))
    } catch (error) {
      return []
    }
  }

  // ==================== 抽奖告警 ====================

  /**
   * 获取抽奖告警统计
   * @private
   * @returns {Promise<Object>} 抽奖告警统计信息
   */
  static async _getLotteryAlertStats() {
    try {
      const LotteryAlertService = require('../LotteryAlertService')
      const result = await LotteryAlertService.getAlertList({
        status: 'active',
        limit: 100
      })

      // 过滤出抽奖相关类型的告警
      const lotteryTypes = ['win_rate', 'budget', 'inventory']
      const alerts = (result.alerts || []).filter(a => lotteryTypes.includes(a.alert_type))

      const now = new Date()
      const threshold = TIMEOUT_THRESHOLDS.lottery_alert

      let urgentCount = 0
      let oldestMinutes = 0

      alerts.forEach(alert => {
        const waitMinutes = Math.floor((now - new Date(alert.created_at)) / 60000)
        if (waitMinutes >= threshold) urgentCount++
        if (waitMinutes > oldestMinutes) oldestMinutes = waitMinutes
      })

      return {
        count: alerts.length,
        urgent_count: urgentCount,
        oldest_minutes: oldestMinutes,
        timeout_threshold_minutes: threshold
      }
    } catch (error) {
      return { count: 0, urgent_count: 0, oldest_minutes: 0, error: error.message }
    }
  }

  /**
   * 获取抽奖告警列表项
   * @private
   * @param {Object} options - 查询选项
   * @param {boolean} [options.urgent_only=false] - 是否只返回紧急项
   * @returns {Promise<Array<Object>>} 抽奖告警列表项
   */
  static async _getLotteryAlertItems(options = {}) {
    try {
      const LotteryAlertService = require('../LotteryAlertService')
      const { urgent_only = false } = options
      const result = await LotteryAlertService.getAlertList({
        status: 'active',
        limit: 100
      })
      const lotteryTypes = ['win_rate', 'budget', 'inventory']
      const alerts = (result.alerts || []).filter(a => lotteryTypes.includes(a.alert_type))

      if (alerts.length === 0) return []

      const now = new Date()
      const threshold = TIMEOUT_THRESHOLDS.lottery_alert

      return alerts
        .map(alert => {
          const waitMinutes = Math.floor((now - new Date(alert.created_at)) / 60000)
          const isUrgent = waitMinutes >= threshold

          return {
            id: alert.alert_id,
            category: PENDING_CATEGORIES.LOTTERY_ALERT,
            category_name: '抽奖告警',
            title: alert.alert_type || '抽奖告警',
            description: alert.message || '待处理抽奖告警',
            lottery_campaign_id: alert.lottery_campaign_id,
            created_at: BeijingTimeHelper.format(alert.created_at),
            waiting_time: this._formatWaitingTime(waitMinutes),
            waiting_minutes: waitMinutes,
            is_urgent: isUrgent,
            action_url: `/admin/lottery/alert/${alert.alert_id}`
          }
        })
        .filter(item => (urgent_only ? item.is_urgent : true))
    } catch (error) {
      return []
    }
  }

  // ==================== 兑换核销 ====================

  /**
   * 获取兑换核销待处理统计（redemption_orders 表 status='pending'）
   *
   * @private
   * @returns {Promise<Object>} 兑换核销统计信息
   */
  static async _getRedemptionStats() {
    try {
      const { RedemptionOrder } = require('../../models')

      const pendingOrders = await RedemptionOrder.findAll({
        where: { status: 'pending' },
        attributes: ['redemption_order_id', 'created_at'],
        raw: true
      })

      const now = new Date()
      const threshold = TIMEOUT_THRESHOLDS.redemption
      let urgentCount = 0
      let oldestMinutes = 0

      pendingOrders.forEach(order => {
        const waitMinutes = Math.floor((now - new Date(order.created_at)) / 60000)
        if (waitMinutes >= threshold) urgentCount++
        if (waitMinutes > oldestMinutes) oldestMinutes = waitMinutes
      })

      return {
        count: pendingOrders.length,
        urgent_count: urgentCount,
        oldest_minutes: oldestMinutes,
        timeout_threshold_minutes: threshold
      }
    } catch (error) {
      return { count: 0, urgent_count: 0, oldest_minutes: 0, error: error.message }
    }
  }

  /**
   * 获取兑换核销待处理列表项
   *
   * @private
   * @param {Object} options - 查询选项
   * @param {boolean} [options.urgent_only=false] - 是否只返回紧急项
   * @returns {Promise<Array<Object>>} 兑换核销列表项
   */
  static async _getRedemptionItems(options = {}) {
    try {
      const { RedemptionOrder, User, Item } = require('../../models')
      const { urgent_only = false } = options

      const pendingOrders = await RedemptionOrder.findAll({
        where: { status: 'pending' },
        include: [
          {
            model: User,
            as: 'redeemer',
            attributes: ['user_id', 'nickname', 'mobile'],
            required: false
          },
          {
            model: Item,
            as: 'item',
            attributes: ['item_id', 'item_name', 'item_type', 'meta'],
            required: false
          }
        ],
        order: [['created_at', 'ASC']],
        limit: 100
      })

      if (pendingOrders.length === 0) return []

      const now = new Date()
      const threshold = TIMEOUT_THRESHOLDS.redemption

      return pendingOrders
        .map(order => {
          const orderData = order.toJSON()
          const waitMinutes = Math.floor((now - new Date(order.created_at)) / 60000)
          const isUrgent = waitMinutes >= threshold
          const prizeName =
            orderData.item?.item_name || orderData.item?.meta?.prize_name || '未知奖品'

          return {
            id: orderData.redemption_order_id,
            category: PENDING_CATEGORIES.REDEMPTION,
            category_name: '兑换核销',
            title: `核销订单 - ${prizeName}`,
            description: `用户${orderData.redeemer?.nickname || orderData.redeemer?.mobile || '未知'}的核销订单待处理`,
            user_id: orderData.redeemer?.user_id || null,
            created_at: BeijingTimeHelper.format(order.created_at),
            waiting_time: this._formatWaitingTime(waitMinutes),
            waiting_minutes: waitMinutes,
            is_urgent: isUrgent,
            action_url: `/admin/redemption-management.html`
          }
        })
        .filter(item => (urgent_only ? item.is_urgent : true))
    } catch (error) {
      logger.warn('[待处理中心] 兑换核销列表查询失败', { error: error.message })
      return []
    }
  }

  // ==================== 用户反馈 ====================

  /**
   * 获取用户反馈待处理统计（feedbacks 表 status='pending'）
   *
   * @private
   * @returns {Promise<Object>} 用户反馈统计信息
   */
  static async _getFeedbackStats() {
    try {
      const { Feedback } = require('../../models')

      const pendingFeedbacks = await Feedback.findAll({
        where: { status: 'pending' },
        attributes: ['feedback_id', 'created_at'],
        raw: true
      })

      const now = new Date()
      const threshold = TIMEOUT_THRESHOLDS.feedback
      let urgentCount = 0
      let oldestMinutes = 0

      pendingFeedbacks.forEach(fb => {
        const waitMinutes = Math.floor((now - new Date(fb.created_at)) / 60000)
        if (waitMinutes >= threshold) urgentCount++
        if (waitMinutes > oldestMinutes) oldestMinutes = waitMinutes
      })

      return {
        count: pendingFeedbacks.length,
        urgent_count: urgentCount,
        oldest_minutes: oldestMinutes,
        timeout_threshold_minutes: threshold
      }
    } catch (error) {
      return { count: 0, urgent_count: 0, oldest_minutes: 0, error: error.message }
    }
  }

  /**
   * 获取用户反馈待处理列表项
   *
   * @private
   * @param {Object} options - 查询选项
   * @param {boolean} [options.urgent_only=false] - 是否只返回紧急项
   * @returns {Promise<Array<Object>>} 用户反馈列表项
   */
  static async _getFeedbackItems(options = {}) {
    try {
      const { Feedback, User } = require('../../models')
      const { urgent_only = false } = options

      const pendingFeedbacks = await Feedback.findAll({
        where: { status: 'pending' },
        include: [
          {
            model: User,
            as: 'user',
            attributes: ['user_id', 'nickname', 'mobile']
          }
        ],
        order: [
          ['priority', 'DESC'],
          ['created_at', 'ASC']
        ],
        limit: 100
      })

      if (pendingFeedbacks.length === 0) return []

      const now = new Date()
      const threshold = TIMEOUT_THRESHOLDS.feedback

      /** 反馈分类中文映射 */
      const categoryMap = {
        technical: '技术问题',
        feature: '功能建议',
        bug: '错误报告',
        complaint: '投诉',
        suggestion: '建议',
        other: '其他'
      }

      return pendingFeedbacks
        .map(fb => {
          const fbData = fb.toJSON()
          const waitMinutes = Math.floor((now - new Date(fb.created_at)) / 60000)
          const isUrgent = waitMinutes >= threshold
          const categoryLabel = categoryMap[fbData.category] || fbData.category

          return {
            id: fbData.feedback_id,
            category: PENDING_CATEGORIES.FEEDBACK,
            category_name: '用户反馈',
            title: `[${categoryLabel}] ${fbData.content?.substring(0, 30) || '用户反馈'}`,
            description: fbData.content?.substring(0, 80) || '待处理用户反馈',
            user_id: fbData.user?.user_id || fbData.user_id,
            priority: fbData.priority,
            created_at: BeijingTimeHelper.format(fb.created_at),
            waiting_time: this._formatWaitingTime(waitMinutes),
            waiting_minutes: waitMinutes,
            is_urgent: isUrgent,
            action_url: `/admin/feedback-management.html`
          }
        })
        .filter(item => (urgent_only ? item.is_urgent : true))
    } catch (error) {
      logger.warn('[待处理中心] 用户反馈列表查询失败', { error: error.message })
      return []
    }
  }

  // ==================== 工具方法 ====================

  /**
   * 格式化等待时间为友好显示
   *
   * @private
   * @param {number} minutes - 等待分钟数
   * @returns {string} 友好的时间显示
   */
  static _formatWaitingTime(minutes) {
    if (minutes < 60) {
      return `${minutes}分钟`
    } else if (minutes < 60 * 24) {
      const hours = Math.floor(minutes / 60)
      const mins = minutes % 60
      return mins > 0 ? `${hours}小时${mins}分钟` : `${hours}小时`
    } else {
      const days = Math.floor(minutes / (60 * 24))
      const hours = Math.floor((minutes % (60 * 24)) / 60)
      return hours > 0 ? `${days}天${hours}小时` : `${days}天`
    }
  }

  /**
   * 手动失效缓存
   *
   * @param {string} reason - 失效原因（用于日志记录）
   * @returns {Promise<boolean>} 是否成功失效缓存
   */
  static async invalidateCache(reason = 'manual_invalidation') {
    const cacheKey = `${KEY_PREFIX}${CACHE_KEYS.SEGMENT_STATS}`
    return await BusinessCacheHelper.del(cacheKey, reason)
  }
}

module.exports = PendingCenterService
module.exports.PENDING_CATEGORIES = PENDING_CATEGORIES
module.exports.TIMEOUT_THRESHOLDS = TIMEOUT_THRESHOLDS
