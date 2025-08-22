/**
 * 🔥 事件总线服务 v3 - 全新分离式架构
 * 创建时间：2025年08月19日 UTC
 * 特点：系统间解耦通信 + 事件驱动架构 + 异步处理
 * 功能：事件发布、订阅、处理、日志记录
 */

'use strict'

const EventEmitter = require('events')
const { BusinessEvent } = require('../models')

class EventBusService extends EventEmitter {
  constructor () {
    super()
    this.eventHandlers = new Map()
    this.eventHistory = []
    this.maxHistorySize = 1000

    // 🔥 注册内置事件处理器
    this._registerBuiltinHandlers()
  }

  /**
   * 🔥 事件发布
   */

  /**
   * 发布事件到事件总线
   * @param {string} eventType - 事件类型
   * @param {object} eventData - 事件数据
   * @param {object} options - 发布选项
   * @returns {Promise<boolean>} 发布是否成功
   */
  async emit (eventType, eventData, options = {}) {
    try {
      const event = {
        event_id: this._generateEventId(),
        event_type: eventType,
        event_data: eventData,
        timestamp: new Date().toISOString(),
        source: options.source || 'system',
        priority: options.priority || 'normal',
        retry_count: 0
      }

      console.log(`📡 发布事件: ${eventType}`, {
        event_id: event.event_id,
        source: event.source,
        data_keys: Object.keys(eventData)
      })

      // 🔥 记录事件到数据库
      await this._recordEvent(event)

      // 🔥 添加到历史记录
      this._addToHistory(event)

      // 🔥 同步处理事件
      super.emit(eventType, event)

      // 🔥 异步处理事件
      if (options.async !== false) {
        process.nextTick(() => {
          this._processEventAsync(event)
        })
      }

      return true
    } catch (error) {
      console.error('事件发布失败:', error)
      return false
    }
  }

  /**
   * 🔥 事件订阅
   */

  /**
   * 订阅事件类型
   * @param {string} eventType - 事件类型
   * @param {function} handler - 事件处理器
   * @param {object} options - 订阅选项
   */
  subscribe (eventType, handler, options = {}) {
    const handlerInfo = {
      handler,
      priority: options.priority || 'normal',
      once: options.once || false,
      async: options.async || false,
      retry: options.retry || false,
      filter: options.filter || null
    }

    if (!this.eventHandlers.has(eventType)) {
      this.eventHandlers.set(eventType, [])
    }

    this.eventHandlers.get(eventType).push(handlerInfo)

    // 注册到 EventEmitter
    if (handlerInfo.once) {
      this.once(eventType, handler)
    } else {
      this.on(eventType, handler)
    }

    console.log(`📋 订阅事件: ${eventType}`, {
      handlers_count: this.eventHandlers.get(eventType).length,
      priority: handlerInfo.priority
    })
  }

  /**
   * 取消订阅事件
   * @param {string} eventType - 事件类型
   * @param {function} handler - 事件处理器
   */
  unsubscribe (eventType, handler) {
    if (this.eventHandlers.has(eventType)) {
      const handlers = this.eventHandlers.get(eventType)
      const index = handlers.findIndex(h => h.handler === handler)
      if (index !== -1) {
        handlers.splice(index, 1)
      }
    }

    this.removeListener(eventType, handler)
    console.log(`📋 取消订阅事件: ${eventType}`)
  }

  /**
   * 🔥 内置事件处理器
   */

  _registerBuiltinHandlers () {
    // 🔥 积分系统事件处理
    this.subscribe('points:earned', this._handlePointsEarned.bind(this), { async: true })
    this.subscribe('points:consumed', this._handlePointsConsumed.bind(this), { async: true })
    this.subscribe('points:expired', this._handlePointsExpired.bind(this), { async: true })

    // 🔥 抽奖系统事件处理
    this.subscribe('lottery:draw_completed', this._handleLotteryDrawCompleted.bind(this), {
      async: true
    })
    this.subscribe('lottery:campaign_created', this._handleLotteryCampaignCreated.bind(this), {
      async: true
    })
    this.subscribe('lottery:prize_distributed', this._handlePrizeDistributed.bind(this), {
      async: true
    })

    // 🔥 用户行为事件处理
    this.subscribe('user:login', this._handleUserLogin.bind(this), { async: true })
    this.subscribe('user:action', this._handleUserAction.bind(this), { async: true })

    console.log('🔥 事件总线内置处理器已注册')
  }

  /**
   * 🔥 积分相关事件处理器
   */

  async _handlePointsEarned (event) {
    try {
      const { user_id, points_amount, source } = event.event_data

      console.log(`💰 处理积分获得事件: 用户=${user_id}, 积分=${points_amount}, 来源=${source}`)

      // 🔥 可以在这里触发其他相关事件
      if (points_amount >= 100) {
        // 积分达到一定数量时，推荐参与抽奖
        await this.emit('user:points_milestone_reached', {
          user_id,
          milestone: 100,
          current_points: event.event_data.total_points || 0
        })
      }
    } catch (error) {
      console.error('处理积分获得事件失败:', error)
    }
  }

  async _handlePointsConsumed (event) {
    try {
      const { user_id, points_amount, source } = event.event_data

      console.log(`💸 处理积分消费事件: 用户=${user_id}, 积分=${points_amount}, 用途=${source}`)

      // 🔥 分析用户消费行为
      if (source === 'lottery_draw') {
        await this.emit('user:lottery_participation', {
          user_id,
          points_spent: points_amount,
          participation_time: new Date().toISOString()
        })
      }
    } catch (error) {
      console.error('处理积分消费事件失败:', error)
    }
  }

  async _handlePointsExpired (event) {
    try {
      const { user_id, expired_points } = event.event_data

      console.log(`⏰ 处理积分过期事件: 用户=${user_id}, 过期积分=${expired_points}`)

      // 🔥 积分过期提醒
      await this.emit('notification:points_expiry_warning', {
        user_id,
        expired_amount: expired_points,
        reminder_type: 'points_expired'
      })
    } catch (error) {
      console.error('处理积分过期事件失败:', error)
    }
  }

  /**
   * 🔥 抽奖相关事件处理器
   */

  async _handleLotteryDrawCompleted (event) {
    try {
      const { user_id, campaign_id, is_winner, prize_id } = event.event_data

      console.log(`🎲 处理抽奖完成事件: 用户=${user_id}, 活动=${campaign_id}, 中奖=${is_winner}`)

      if (is_winner && prize_id) {
        // 🔥 中奖事件处理
        await this.emit('lottery:winner_announced', {
          user_id,
          campaign_id,
          prize_id,
          win_time: new Date().toISOString()
        })

        // 🔥 发送中奖通知
        await this.emit('notification:lottery_win', {
          user_id,
          campaign_id,
          prize_id,
          notification_type: 'lottery_win'
        })
      } else {
        // 🔥 未中奖安慰机制
        await this.emit('user:lottery_consolation', {
          user_id,
          campaign_id,
          consolation_type: 'next_time_bonus'
        })
      }
    } catch (error) {
      console.error('处理抽奖完成事件失败:', error)
    }
  }

  async _handleLotteryCampaignCreated (event) {
    try {
      const { campaign_id, campaign_name } = event.event_data

      console.log(`🎪 处理抽奖活动创建事件: 活动=${campaign_id}, 名称=${campaign_name}`)

      // 🔥 活动开始通知
      await this.emit('notification:new_campaign', {
        campaign_id,
        campaign_name,
        notification_type: 'new_lottery_campaign'
      })
    } catch (error) {
      console.error('处理抽奖活动创建事件失败:', error)
    }
  }

  async _handlePrizeDistributed (event) {
    try {
      const { user_id, prize_id, distribution_status } = event.event_data

      console.log(
        `🎁 处理奖品分发事件: 用户=${user_id}, 奖品=${prize_id}, 状态=${distribution_status}`
      )

      if (distribution_status === 'completed') {
        await this.emit('notification:prize_received', {
          user_id,
          prize_id,
          notification_type: 'prize_distributed'
        })
      }
    } catch (error) {
      console.error('处理奖品分发事件失败:', error)
    }
  }

  /**
   * 🔥 用户行为事件处理器
   */

  async _handleUserLogin (event) {
    try {
      const { user_id, login_time } = event.event_data

      console.log(`👤 处理用户登录事件: 用户=${user_id}, 时间=${login_time}`)

      // 🔥 签到积分奖励检查
      await this.emit('points:check_daily_signin', {
        user_id,
        login_time
      })
    } catch (error) {
      console.error('处理用户登录事件失败:', error)
    }
  }

  async _handleUserAction (event) {
    try {
      const { user_id, action_type, action_data: _action_data } = event.event_data

      console.log(`🎯 处理用户行为事件: 用户=${user_id}, 行为=${action_type}`)

      // 🔥 行为分析和积分奖励
      switch (action_type) {
      case 'photo_upload':
        await this.emit('points:earn_from_action', {
          user_id,
          action: 'photo_upload',
          points: 10,
          source: 'user_activity'
        })
        break
      case 'review_submit':
        await this.emit('points:earn_from_action', {
          user_id,
          action: 'review_submit',
          points: 15,
          source: 'user_engagement'
        })
        break
      default:
        // 其他行为暂不处理
        break
      }
    } catch (error) {
      console.error('处理用户行为事件失败:', error)
    }
  }

  /**
   * 🔥 事件处理工具方法
   */

  /**
   * 异步处理事件
   * @param {object} event - 事件对象
   */
  async _processEventAsync (event) {
    try {
      const handlers = this.eventHandlers.get(event.event_type) || []

      // 🔥 优化：并行处理异步事件处理器，提高性能
      const asyncHandlers = handlers.filter(h => h.async)
      const handlerPromises = asyncHandlers.map(async (handlerInfo) => {
        try {
          // 应用过滤器
          if (handlerInfo.filter && !handlerInfo.filter(event)) {
            return
          }

          await handlerInfo.handler(event)
        } catch (error) {
          console.error(`异步事件处理失败: ${event.event_type}`, error)

          // 重试机制
          if (handlerInfo.retry && event.retry_count < 3) {
            event.retry_count++
            setTimeout(() => {
              this._processEventAsync(event)
            }, 1000 * event.retry_count)
          }
        }
      })

      // 并行等待所有处理器完成
      await Promise.allSettled(handlerPromises)
    } catch (error) {
      console.error('异步事件处理失败:', error)
    }
  }

  /**
   * 记录事件到数据库
   * @param {object} event - 事件对象
   */
  async _recordEvent (event) {
    try {
      // 修复外键约束问题 - 验证用户是否存在
      const eventData = event.event_data || {}
      const userId = eventData.user_id

      if (userId) {
        const { User } = require('../models')
        const userExists = await User.findByPk(userId)
        if (!userExists) {
          console.warn(`⚠️ 用户ID ${userId} 不存在，跳过事件记录: ${event.event_type}`)
          return
        }
      }

      await BusinessEvent.create({
        event_id: event.event_id,
        event_type: event.event_type,
        event_data: JSON.stringify(event.event_data),
        event_source: event.source || 'points_system',
        event_target: event.target || 'user_system',
        user_id: userId || 1, // 系统事件使用默认用户ID 1
        status: 'processed', // 修复字段名：event_status -> status
        event_time: new Date(event.timestamp),
        created_at: new Date(),
        updated_at: new Date()
      })
    } catch (error) {
      console.error('记录事件到数据库失败:', error)
    }
  }

  /**
   * 添加事件到历史记录
   * @param {object} event - 事件对象
   */
  _addToHistory (event) {
    this.eventHistory.unshift(event)
    if (this.eventHistory.length > this.maxHistorySize) {
      this.eventHistory = this.eventHistory.slice(0, this.maxHistorySize)
    }
  }

  /**
   * 生成事件ID
   * @returns {string} 事件ID
   */
  _generateEventId () {
    return `evt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  }

  /**
   * 🔥 事件查询和统计
   */

  /**
   * 获取事件历史记录
   * @param {object} options - 查询选项
   * @returns {Array} 事件历史
   */
  getEventHistory (options = {}) {
    const { event_type, limit = 100, source } = options

    let history = this.eventHistory

    if (event_type) {
      history = history.filter(event => event.event_type === event_type)
    }

    if (source) {
      history = history.filter(event => event.source === source)
    }

    return history.slice(0, limit)
  }

  /**
   * 获取事件统计信息
   * @returns {object} 统计信息
   */
  getEventStats () {
    const stats = {
      total_events: this.eventHistory.length,
      event_types: {},
      sources: {},
      recent_events: this.eventHistory.slice(0, 10)
    }

    for (const event of this.eventHistory) {
      // 按类型统计
      if (!stats.event_types[event.event_type]) {
        stats.event_types[event.event_type] = 0
      }
      stats.event_types[event.event_type]++

      // 按来源统计
      if (!stats.sources[event.source]) {
        stats.sources[event.source] = 0
      }
      stats.sources[event.source]++
    }

    return stats
  }

  /**
   * 🔥 健康检查
   */

  /**
   * 检查事件总线健康状态
   * @returns {object} 健康状态
   */
  healthCheck () {
    return {
      status: 'healthy',
      event_handlers: this.eventHandlers.size,
      event_history_size: this.eventHistory.length,
      listeners_count: this.listenerCount(),
      memory_usage: process.memoryUsage(),
      uptime: process.uptime(),
      timestamp: new Date().toISOString()
    }
  }
}

// 🔥 创建全局单例
const eventBus = new EventBusService()

module.exports = eventBus
