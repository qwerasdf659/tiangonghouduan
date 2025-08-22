/**
 * 🔥 定时任务调度API路由 v3.0
 * 功能：提供定时任务管理的REST API接口
 * 特性：CRUD操作、监控、统计、健康检查
 * 架构：基于现有V3 API规范，统一错误处理和响应格式
 */

const express = require('express')
const router = express.Router()
const TimeScheduleService = require('../../services/TimeScheduleService')
const { requireUser, requireAdmin } = require('../../middleware/auth')
const validationMiddleware = require('../../middleware/validation')

/**
 * GET /api/v3/schedule/tasks
 * 获取定时任务列表
 */
router.get('/tasks', requireAdmin, async (req, res) => {
  try {
    const { status, task_type, limit = 50, offset = 0 } = req.query

    const filters = {
      limit: parseInt(limit),
      offset: parseInt(offset)
    }

    if (status) filters.status = status
    if (task_type) filters.task_type = task_type

    const result = await TimeScheduleService.getTaskList(filters)

    if (!result.success) {
      return res.status(400).json({
        success: false,
        error: result.error,
        message: result.message,
        timestamp: new Date().toISOString()
      })
    }

    res.json({
      success: true,
      data: result.data,
      message: '获取任务列表成功',
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('获取任务列表失败:', error)
    res.status(500).json({
      success: false,
      error: 'GET_TASK_LIST_ERROR',
      message: error.message,
      timestamp: new Date().toISOString()
    })
  }
})

/**
 * POST /api/v3/schedule/tasks
 * 创建新的定时任务
 */
router.post('/tasks',
  requireAdmin,
  validationMiddleware([
    { field: 'name', type: 'string', required: true, maxLength: 100 },
    { field: 'task_type', type: 'string', required: true },
    { field: 'cron_expression', type: 'string', required: true },
    { field: 'description', type: 'string', required: false },
    { field: 'task_data', type: 'object', required: false },
    { field: 'is_recurring', type: 'boolean', required: false },
    { field: 'max_retries', type: 'number', required: false, min: 0, max: 10 },
    { field: 'timeout_minutes', type: 'number', required: false, min: 1, max: 1440 }
  ]),
  async (req, res) => {
    try {
      const taskData = {
        name: req.body.name,
        description: req.body.description,
        task_type: req.body.task_type,
        cron_expression: req.body.cron_expression,
        task_data: req.body.task_data || {},
        is_recurring: req.body.is_recurring !== false,
        max_retries: req.body.max_retries || 3,
        timeout_minutes: req.body.timeout_minutes || 30,
        created_by: req.user.user_id
      }

      const result = await TimeScheduleService.createScheduledTask(taskData)

      if (!result.success) {
        return res.status(400).json({
          success: false,
          error: result.error,
          message: result.message,
          timestamp: new Date().toISOString()
        })
      }

      res.status(201).json({
        success: true,
        data: result.data,
        message: '定时任务创建成功',
        timestamp: new Date().toISOString()
      })
    } catch (error) {
      console.error('创建定时任务失败:', error)
      res.status(500).json({
        success: false,
        error: 'CREATE_TASK_ERROR',
        message: error.message,
        timestamp: new Date().toISOString()
      })
    }
  }
)

/**
 * GET /api/v3/schedule/tasks/:taskId
 * 获取单个任务详情
 */
router.get('/tasks/:taskId', requireAdmin, async (req, res) => {
  try {
    const { taskId } = req.params

    const result = await TimeScheduleService.getTaskList({
      filters: { id: parseInt(taskId) },
      limit: 1
    })

    if (!result.success) {
      return res.status(400).json({
        success: false,
        error: result.error,
        message: result.message,
        timestamp: new Date().toISOString()
      })
    }

    if (!result.data.tasks || result.data.tasks.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'TASK_NOT_FOUND',
        message: '任务不存在',
        timestamp: new Date().toISOString()
      })
    }

    res.json({
      success: true,
      data: result.data.tasks[0],
      message: '获取任务详情成功',
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('获取任务详情失败:', error)
    res.status(500).json({
      success: false,
      error: 'GET_TASK_DETAIL_ERROR',
      message: error.message,
      timestamp: new Date().toISOString()
    })
  }
})

/**
 * PUT /api/v3/schedule/tasks/:taskId/pause
 * 暂停任务
 */
router.put('/tasks/:taskId/pause', requireAdmin, async (req, res) => {
  try {
    const { taskId } = req.params

    const result = await TimeScheduleService.pauseTask(parseInt(taskId))

    if (!result.success) {
      return res.status(400).json({
        success: false,
        error: result.error,
        message: result.message,
        timestamp: new Date().toISOString()
      })
    }

    res.json({
      success: true,
      data: { taskId: parseInt(taskId), status: 'paused' },
      message: '任务已暂停',
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('暂停任务失败:', error)
    res.status(500).json({
      success: false,
      error: 'PAUSE_TASK_ERROR',
      message: error.message,
      timestamp: new Date().toISOString()
    })
  }
})

/**
 * PUT /api/v3/schedule/tasks/:taskId/resume
 * 恢复任务
 */
router.put('/tasks/:taskId/resume', requireAdmin, async (req, res) => {
  try {
    const { taskId } = req.params

    const result = await TimeScheduleService.resumeTask(parseInt(taskId))

    if (!result.success) {
      return res.status(400).json({
        success: false,
        error: result.error,
        message: result.message,
        timestamp: new Date().toISOString()
      })
    }

    res.json({
      success: true,
      data: { taskId: parseInt(taskId), status: 'active' },
      message: '任务已恢复',
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('恢复任务失败:', error)
    res.status(500).json({
      success: false,
      error: 'RESUME_TASK_ERROR',
      message: error.message,
      timestamp: new Date().toISOString()
    })
  }
})

/**
 * DELETE /api/v3/schedule/tasks/:taskId
 * 删除任务
 */
router.delete('/tasks/:taskId', requireAdmin, async (req, res) => {
  try {
    const { taskId } = req.params

    const result = await TimeScheduleService.deleteTask(parseInt(taskId))

    if (!result.success) {
      return res.status(400).json({
        success: false,
        error: result.error,
        message: result.message,
        timestamp: new Date().toISOString()
      })
    }

    res.json({
      success: true,
      data: { taskId: parseInt(taskId), deleted: true },
      message: '任务删除成功',
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('删除任务失败:', error)
    res.status(500).json({
      success: false,
      error: 'DELETE_TASK_ERROR',
      message: error.message,
      timestamp: new Date().toISOString()
    })
  }
})

/**
 * POST /api/v3/schedule/tasks/:taskId/execute
 * 手动执行任务
 */
router.post('/tasks/:taskId/execute', requireAdmin, async (req, res) => {
  try {
    const { taskId } = req.params

    // 手动执行任务
    const result = await TimeScheduleService.executeTask(parseInt(taskId))

    if (!result.success) {
      return res.status(400).json({
        success: false,
        error: result.error,
        message: result.message,
        timestamp: new Date().toISOString()
      })
    }

    res.json({
      success: true,
      data: result.data,
      message: '任务手动执行完成',
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('手动执行任务失败:', error)
    res.status(500).json({
      success: false,
      error: 'EXECUTE_TASK_ERROR',
      message: error.message,
      timestamp: new Date().toISOString()
    })
  }
})

/**
 * GET /api/v3/schedule/statistics
 * 获取任务统计信息
 */
router.get('/statistics', requireAdmin, async (req, res) => {
  try {
    const result = await TimeScheduleService.getTaskStatistics()

    if (!result.success) {
      return res.status(400).json({
        success: false,
        error: result.error,
        message: result.message,
        timestamp: new Date().toISOString()
      })
    }

    res.json({
      success: true,
      data: result.data,
      message: '获取任务统计成功',
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('获取任务统计失败:', error)
    res.status(500).json({
      success: false,
      error: 'GET_STATISTICS_ERROR',
      message: error.message,
      timestamp: new Date().toISOString()
    })
  }
})

/**
 * GET /api/v3/schedule/health
 * 调度服务健康检查
 */
router.get('/health', requireAdmin, async (req, res) => {
  try {
    const result = await TimeScheduleService.healthCheck()

    if (!result.success) {
      return res.status(503).json({
        success: false,
        error: result.error,
        message: result.message,
        timestamp: new Date().toISOString()
      })
    }

    res.json({
      success: true,
      data: result.data,
      message: '调度服务健康状态正常',
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('健康检查失败:', error)
    res.status(503).json({
      success: false,
      error: 'HEALTH_CHECK_ERROR',
      message: error.message,
      timestamp: new Date().toISOString()
    })
  }
})

/**
 * POST /api/v3/schedule/initialize
 * 初始化调度服务
 */
router.post('/initialize', requireAdmin, async (req, res) => {
  try {
    const result = await TimeScheduleService.initialize()

    if (!result.success) {
      return res.status(400).json({
        success: false,
        error: result.error,
        message: result.message,
        timestamp: new Date().toISOString()
      })
    }

    res.json({
      success: true,
      data: result.data,
      message: '调度服务初始化成功',
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('初始化调度服务失败:', error)
    res.status(500).json({
      success: false,
      error: 'INITIALIZE_ERROR',
      message: error.message,
      timestamp: new Date().toISOString()
    })
  }
})

/**
 * GET /api/v3/schedule/types
 * 获取支持的任务类型列表
 */
router.get('/types', requireUser, async (req, res) => {
  try {
    const taskTypes = [
      {
        type: 'lottery_campaign_start',
        name: '抽奖活动开始',
        description: '自动开始抽奖活动'
      },
      {
        type: 'lottery_campaign_end',
        name: '抽奖活动结束',
        description: '自动结束抽奖活动'
      },
      {
        type: 'daily_reset',
        name: '每日重置',
        description: '重置每日积分、任务和抽奖次数'
      },
      {
        type: 'vip_expiry_check',
        name: 'VIP到期检查',
        description: '检查VIP会员到期状态'
      },
      {
        type: 'social_room_cleanup',
        name: '社交房间清理',
        description: '清理过期的社交抽奖房间'
      },
      {
        type: 'points_settlement',
        name: '积分结算',
        description: '进行积分结算和统计'
      },
      {
        type: 'system_maintenance',
        name: '系统维护',
        description: '执行系统维护任务'
      },
      {
        type: 'custom',
        name: '自定义任务',
        description: '用户自定义的任务'
      }
    ]

    res.json({
      success: true,
      data: {
        taskTypes,
        cronExamples: {
          '0 0 * * *': '每天00:00',
          '0 * * * *': '每小时',
          '*/5 * * * *': '每5分钟',
          '0 0 * * 0': '每周日00:00',
          '0 0 1 * *': '每月1日00:00'
        }
      },
      message: '获取任务类型成功',
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('获取任务类型失败:', error)
    res.status(500).json({
      success: false,
      error: 'GET_TASK_TYPES_ERROR',
      message: error.message,
      timestamp: new Date().toISOString()
    })
  }
})

module.exports = router
