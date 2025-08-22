/**
 * 🔥 事件管理API接口 v3 - 事件总线管理
 * 创建时间：2025年08月19日 UTC
 * 特点：事件总线监控 + 事件历史查询 + 系统诊断
 * 路径：/api/v3/events
 */

'use strict'

const express = require('express')
const router = express.Router()
const EventBusService = require('../../services/EventBusService')
const { requireAdmin } = require('../../middleware/auth')
const validationMiddleware = require('../../middleware/validation')

/**
 * 🔥 事件总线状态查询
 */

/**
 * GET /api/v3/events/status
 * 获取事件总线健康状态（仅管理员）
 */
router.get('/status', requireAdmin, async (req, res) => {
  try {
    console.log('🔍 获取事件总线状态')

    const healthStatus = EventBusService.healthCheck()

    res.json({
      success: true,
      data: healthStatus,
      message: '获取事件总线状态成功',
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('获取事件总线状态失败:', error)
    res.status(500).json({
      success: false,
      error: 'GET_EVENT_BUS_STATUS_FAILED',
      message: '获取事件总线状态失败',
      timestamp: new Date().toISOString()
    })
  }
})

/**
 * 🔥 事件历史查询
 */

/**
 * GET /api/v3/events/history
 * 获取事件历史记录（仅管理员）
 */
router.get('/history', requireAdmin, async (req, res) => {
  try {
    const { event_type, source, limit = 50 } = req.query

    console.log(`🔍 获取事件历史: 类型=${event_type}, 来源=${source}, 限制=${limit}`)

    const eventHistory = EventBusService.getEventHistory({
      event_type,
      source,
      limit: parseInt(limit)
    })

    res.json({
      success: true,
      data: {
        events: eventHistory,
        total: eventHistory.length,
        filters: {
          event_type: event_type || 'all',
          source: source || 'all',
          limit: parseInt(limit)
        }
      },
      message: '获取事件历史成功',
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('获取事件历史失败:', error)
    res.status(500).json({
      success: false,
      error: 'GET_EVENT_HISTORY_FAILED',
      message: '获取事件历史失败',
      timestamp: new Date().toISOString()
    })
  }
})

/**
 * 🔥 事件统计分析
 */

/**
 * GET /api/v3/events/statistics
 * 获取事件统计信息（仅管理员）
 */
router.get('/statistics', requireAdmin, async (req, res) => {
  try {
    console.log('📊 获取事件统计信息')

    const eventStats = EventBusService.getEventStats()

    res.json({
      success: true,
      data: eventStats,
      message: '获取事件统计成功',
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('获取事件统计失败:', error)
    res.status(500).json({
      success: false,
      error: 'GET_EVENT_STATISTICS_FAILED',
      message: '获取事件统计失败',
      timestamp: new Date().toISOString()
    })
  }
})

/**
 * 🔥 手动事件触发（测试用）
 */

/**
 * POST /api/v3/events/emit
 * 手动触发事件（仅管理员，用于测试）
 */
router.post(
  '/emit',
  requireAdmin,
  validationMiddleware([
    { field: 'event_type', type: 'string', required: true },
    { field: 'event_data', type: 'object', required: true }
  ]),
  async (req, res) => {
    try {
      const { event_type, event_data, source = 'manual_admin' } = req.body
      const adminId = req.user.user_id

      console.log(`🔥 管理员手动触发事件: 类型=${event_type}, 管理员=${adminId}`)

      const success = await EventBusService.emit(
        event_type,
        {
          ...event_data,
          triggered_by: adminId,
          manual_trigger: true
        },
        {
          source,
          priority: 'high'
        }
      )

      if (success) {
        res.json({
          success: true,
          data: {
            event_type,
            triggered: true,
            triggered_by: adminId,
            triggered_at: new Date().toISOString()
          },
          message: '事件触发成功',
          timestamp: new Date().toISOString()
        })
      } else {
        res.status(500).json({
          success: false,
          error: 'EVENT_EMISSION_FAILED',
          message: '事件触发失败',
          timestamp: new Date().toISOString()
        })
      }
    } catch (error) {
      console.error('手动触发事件失败:', error)
      res.status(500).json({
        success: false,
        error: 'MANUAL_EVENT_TRIGGER_FAILED',
        message: '手动触发事件失败',
        timestamp: new Date().toISOString()
      })
    }
  }
)

/**
 * 🔥 事件模拟器（测试用）
 */

/**
 * POST /api/v3/events/simulate
 * 模拟常见事件场景（仅管理员，用于测试）
 */
router.post(
  '/simulate',
  requireAdmin,
  validationMiddleware([
    {
      field: 'scenario',
      type: 'string',
      enum: ['user_login', 'points_earned', 'lottery_draw', 'prize_distribution']
    }
  ]),
  async (req, res) => {
    try {
      const { scenario, user_id = 1 } = req.body
      const adminId = req.user.user_id

      console.log(`🎭 模拟事件场景: ${scenario}, 用户=${user_id}, 管理员=${adminId}`)

      let eventData = {}
      let eventType = ''

      switch (scenario) {
      case 'user_login':
        eventType = 'user:login'
        eventData = {
          user_id: parseInt(user_id),
          login_time: new Date().toISOString(),
          login_method: 'simulation'
        }
        break

      case 'points_earned':
        eventType = 'points:earned'
        eventData = {
          user_id: parseInt(user_id),
          points_amount: 50,
          source: 'simulation',
          total_points: 150
        }
        break

      case 'lottery_draw':
        eventType = 'lottery:draw_completed'
        eventData = {
          user_id: parseInt(user_id),
          campaign_id: 1,
          draw_id: `sim_${Date.now()}`,
          is_winner: Math.random() > 0.5,
          prize_id: Math.random() > 0.5 ? 1 : null,
          points_consumed: 10
        }
        break

      case 'prize_distribution':
        eventType = 'lottery:prize_distributed'
        eventData = {
          user_id: parseInt(user_id),
          prize_id: 1,
          distribution_status: 'completed',
          distribution_time: new Date().toISOString()
        }
        break

      default:
        return res.status(400).json({
          success: false,
          error: 'INVALID_SCENARIO',
          message: '无效的模拟场景',
          timestamp: new Date().toISOString()
        })
      }

      const success = await EventBusService.emit(
        eventType,
        {
          ...eventData,
          simulation: true,
          triggered_by: adminId
        },
        {
          source: 'event_simulator',
          priority: 'normal'
        }
      )

      if (success) {
        res.json({
          success: true,
          data: {
            scenario,
            event_type: eventType,
            event_data: eventData,
            simulated: true,
            triggered_by: adminId
          },
          message: `${scenario} 场景模拟成功`,
          timestamp: new Date().toISOString()
        })
      } else {
        res.status(500).json({
          success: false,
          error: 'EVENT_SIMULATION_FAILED',
          message: '事件模拟失败',
          timestamp: new Date().toISOString()
        })
      }
    } catch (error) {
      console.error('事件模拟失败:', error)
      res.status(500).json({
        success: false,
        error: 'EVENT_SIMULATION_ERROR',
        message: '事件模拟失败',
        timestamp: new Date().toISOString()
      })
    }
  }
)

/**
 * 🔥 事件监听器管理
 */

/**
 * GET /api/v3/events/listeners
 * 获取当前事件监听器列表（仅管理员）
 */
router.get('/listeners', requireAdmin, async (req, res) => {
  try {
    console.log('🔍 获取事件监听器列表')

    // 获取EventEmitter的监听器信息
    const listeners = {}
    const eventNames = EventBusService.eventNames()

    for (const eventName of eventNames) {
      listeners[eventName] = {
        listener_count: EventBusService.listenerCount(eventName),
        max_listeners: EventBusService.getMaxListeners()
      }
    }

    res.json({
      success: true,
      data: {
        listeners,
        total_event_types: eventNames.length,
        total_listeners: Object.values(listeners).reduce(
          (sum, info) => sum + info.listener_count,
          0
        )
      },
      message: '获取监听器列表成功',
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('获取事件监听器列表失败:', error)
    res.status(500).json({
      success: false,
      error: 'GET_EVENT_LISTENERS_FAILED',
      message: '获取监听器列表失败',
      timestamp: new Date().toISOString()
    })
  }
})

/**
 * 🔥 系统诊断接口
 */

/**
 * GET /api/v3/events/diagnostics
 * 系统事件总线诊断（仅管理员）
 */
router.get('/diagnostics', requireAdmin, async (req, res) => {
  try {
    console.log('🔧 执行事件总线诊断')

    const healthStatus = EventBusService.healthCheck()
    const eventStats = EventBusService.getEventStats()
    const recentEvents = EventBusService.getEventHistory({ limit: 10 })

    // 诊断分析
    const diagnostics = {
      health_status: healthStatus.status,
      performance: {
        memory_usage: healthStatus.memory_usage,
        event_processing_rate: eventStats.total_events > 0 ? 'normal' : 'low',
        listener_efficiency:
          healthStatus.event_handlers / Math.max(1, Object.keys(eventStats.event_types).length)
      },
      recent_activity: {
        events_last_hour: recentEvents.filter(
          e => new Date(e.timestamp) > new Date(Date.now() - 60 * 60 * 1000)
        ).length,
        most_active_event_type: Object.keys(eventStats.event_types).reduce(
          (a, b) => (eventStats.event_types[a] > eventStats.event_types[b] ? a : b),
          ''
        ),
        error_rate: 0 // 暂时设为0，将来可以统计错误事件
      },
      recommendations: []
    }

    // 生成建议
    if (diagnostics.recent_activity.events_last_hour === 0) {
      diagnostics.recommendations.push('事件活动较低，请检查系统是否正常运行')
    }

    if (healthStatus.event_history_size > 900) {
      diagnostics.recommendations.push('事件历史记录接近上限，建议清理旧记录')
    }

    if (Object.keys(eventStats.event_types).length < 3) {
      diagnostics.recommendations.push('事件类型较少，可能存在未注册的事件处理器')
    }

    res.json({
      success: true,
      data: diagnostics,
      message: '事件总线诊断完成',
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('事件总线诊断失败:', error)
    res.status(500).json({
      success: false,
      error: 'EVENT_BUS_DIAGNOSTICS_FAILED',
      message: '事件总线诊断失败',
      timestamp: new Date().toISOString()
    })
  }
})

module.exports = router
