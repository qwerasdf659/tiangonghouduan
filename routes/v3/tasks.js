/**
 * 🔥 任务管理系统API接口 v3 - 每日任务和进度跟踪
 * 创建时间：2025年08月22日 UTC
 * 特点：每日/周任务 + 进度自动跟踪 + 任务链条 + 自动奖励发放
 * 路径：/api/v3/tasks
 * 基于：TaskManagementService (新开发功能)
 */

'use strict'

const express = require('express')
const router = express.Router()
const TaskManagementService = require('../../services/TaskManagementService')
const { requireUser, requireAdmin } = require('../../middleware/auth')
const validationMiddleware = require('../../middleware/validation')

/**
 * GET /api/v3/tasks/user/:userId
 * 获取用户任务列表
 */
router.get('/user/:userId',
  requireUser,
  async (req, res) => {
    try {
      const { userId } = req.params
      const requestUserId = req.user.user_id
      const { type = 'all' } = req.query

      // 权限验证：用户只能查看自己的任务，管理员可以查看任何用户
      if (parseInt(userId) !== requestUserId && req.user.role !== 'admin') {
        return res.status(403).json({
          success: false,
          error: 'ACCESS_DENIED',
          message: '无权查看其他用户的任务',
          timestamp: new Date().toISOString()
        })
      }

      console.log(`📋 获取用户任务: 用户=${userId}, 类型=${type}`)

      const result = await TaskManagementService.getUserTasks(parseInt(userId), type)

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
        message: '任务列表获取成功',
        timestamp: new Date().toISOString()
      })
    } catch (error) {
      console.error('❌ 获取用户任务失败:', error)
      res.status(500).json({
        success: false,
        error: 'GET_USER_TASKS_ERROR',
        message: error.message,
        timestamp: new Date().toISOString()
      })
    }
  }
)

/**
 * POST /api/v3/tasks/user/:userId/init-daily
 * 初始化用户每日任务
 */
router.post('/user/:userId/init-daily',
  requireUser,
  async (req, res) => {
    try {
      const { userId } = req.params
      const requestUserId = req.user.user_id

      // 权限验证：用户只能初始化自己的任务，管理员可以为任何用户初始化
      if (parseInt(userId) !== requestUserId && req.user.role !== 'admin') {
        return res.status(403).json({
          success: false,
          error: 'ACCESS_DENIED',
          message: '无权为其他用户初始化任务',
          timestamp: new Date().toISOString()
        })
      }

      console.log(`📅 初始化每日任务: 用户=${userId}`)

      const result = await TaskManagementService.initializeDailyTasks(parseInt(userId))

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
        message: '每日任务初始化成功',
        timestamp: new Date().toISOString()
      })
    } catch (error) {
      console.error('❌ 初始化每日任务失败:', error)
      res.status(500).json({
        success: false,
        error: 'INIT_DAILY_TASKS_ERROR',
        message: error.message,
        timestamp: new Date().toISOString()
      })
    }
  }
)

/**
 * POST /api/v3/tasks/user/:userId/init-weekly
 * 初始化用户每周任务
 */
router.post('/user/:userId/init-weekly',
  requireUser,
  async (req, res) => {
    try {
      const { userId } = req.params
      const requestUserId = req.user.user_id

      // 权限验证
      if (parseInt(userId) !== requestUserId && req.user.role !== 'admin') {
        return res.status(403).json({
          success: false,
          error: 'ACCESS_DENIED',
          message: '无权为其他用户初始化任务',
          timestamp: new Date().toISOString()
        })
      }

      console.log(`📅 初始化每周任务: 用户=${userId}`)

      const result = await TaskManagementService.initializeWeeklyTasks(parseInt(userId))

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
        message: '每周任务初始化成功',
        timestamp: new Date().toISOString()
      })
    } catch (error) {
      console.error('❌ 初始化每周任务失败:', error)
      res.status(500).json({
        success: false,
        error: 'INIT_WEEKLY_TASKS_ERROR',
        message: error.message,
        timestamp: new Date().toISOString()
      })
    }
  }
)

/**
 * POST /api/v3/tasks/:taskId/complete
 * 手动完成任务（管理员或特殊情况）
 */
router.post('/:taskId/complete',
  requireUser,
  async (req, res) => {
    try {
      const { taskId } = req.params
      const userId = req.user.user_id

      console.log(`✅ 手动完成任务: 任务=${taskId}, 操作者=${userId}`)

      // 这里可以添加权限验证，比如只允许任务所有者或管理员完成

      const result = await TaskManagementService.completeTask(parseInt(taskId))

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
        message: '任务完成成功',
        timestamp: new Date().toISOString()
      })
    } catch (error) {
      console.error('❌ 手动完成任务失败:', error)
      res.status(500).json({
        success: false,
        error: 'COMPLETE_TASK_ERROR',
        message: error.message,
        timestamp: new Date().toISOString()
      })
    }
  }
)

/**
 * POST /api/v3/tasks/user/:userId/create
 * 创建自定义任务（管理员功能）
 */
router.post('/user/:userId/create',
  requireAdmin,
  validationMiddleware([
    { field: 'taskName', type: 'string', required: true, maxLength: 100 },
    { field: 'description', type: 'string', required: false, maxLength: 500 },
    { field: 'taskType', type: 'string', required: true, enum: ['daily', 'weekly', 'achievement', 'limited_time', 'custom'] },
    { field: 'progressTarget', type: 'number', required: true, min: 1, max: 10000 },
    { field: 'rewardType', type: 'string', required: false, enum: ['points', 'items', 'vip_exp', 'lottery_tickets'] },
    { field: 'rewardAmount', type: 'number', required: false, min: 0, max: 100000 }
  ]),
  async (req, res) => {
    try {
      const { userId } = req.params
      const { taskName, description, taskType, progressTarget, rewardType, rewardAmount, rewardData, expiresAt } = req.body

      console.log(`📝 创建自定义任务: 用户=${userId}, 任务=${taskName}`)

      const taskData = {
        task_name: taskName,
        description,
        task_type: taskType,
        progress_target: progressTarget,
        reward_type: rewardType || 'points',
        reward_amount: rewardAmount || 0,
        reward_data: rewardData,
        expires_at: expiresAt
      }

      const result = await TaskManagementService.createUserTask(parseInt(userId), null, taskData)

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
        message: '自定义任务创建成功',
        timestamp: new Date().toISOString()
      })
    } catch (error) {
      console.error('❌ 创建自定义任务失败:', error)
      res.status(500).json({
        success: false,
        error: 'CREATE_CUSTOM_TASK_ERROR',
        message: error.message,
        timestamp: new Date().toISOString()
      })
    }
  }
)

/**
 * PUT /api/v3/tasks/:taskId/progress
 * 手动更新任务进度（测试用途，管理员功能）
 */
router.put('/:taskId/progress',
  requireAdmin,
  validationMiddleware([
    { field: 'increment', type: 'number', required: true, min: 1, max: 10000 }
  ]),
  async (req, res) => {
    try {
      const { taskId } = req.params
      const { increment } = req.body

      console.log(`📈 手动更新任务进度: 任务=${taskId}, 增量=${increment}`)

      // 先获取任务信息
      const taskQuery = await TaskManagementService.models.UserTask.findByPk(parseInt(taskId))
      if (!taskQuery) {
        return res.status(404).json({
          success: false,
          error: 'TASK_NOT_FOUND',
          message: '任务不存在',
          timestamp: new Date().toISOString()
        })
      }

      // 使用通用的进度更新方法
      const result = await TaskManagementService.updateTaskProgress(taskQuery.user_id, 'manual_update', increment)

      res.json({
        success: true,
        data: result.data,
        message: '任务进度更新成功',
        timestamp: new Date().toISOString()
      })
    } catch (error) {
      console.error('❌ 手动更新任务进度失败:', error)
      res.status(500).json({
        success: false,
        error: 'UPDATE_TASK_PROGRESS_ERROR',
        message: error.message,
        timestamp: new Date().toISOString()
      })
    }
  }
)

/**
 * GET /api/v3/tasks/statistics
 * 获取任务统计数据
 */
router.get('/statistics', async (req, res) => {
  try {
    const { userId } = req.query

    console.log(`📊 获取任务统计: 用户=${userId || 'all'}`)

    const result = await TaskManagementService.getTaskStatistics(userId ? parseInt(userId) : null)

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
      message: '任务统计获取成功',
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('❌ 获取任务统计失败:', error)
    res.status(500).json({
      success: false,
      error: 'GET_TASK_STATISTICS_ERROR',
      message: error.message,
      timestamp: new Date().toISOString()
    })
  }
})

/**
 * POST /api/v3/tasks/admin/cleanup
 * 管理员清理过期任务
 */
router.post('/admin/cleanup', requireAdmin, async (req, res) => {
  try {
    console.log('🧹 管理员清理过期任务')

    const result = await TaskManagementService.cleanupExpiredTasks()

    if (!result.success) {
      return res.status(500).json({
        success: false,
        error: result.error,
        message: result.message,
        timestamp: new Date().toISOString()
      })
    }

    res.json({
      success: true,
      data: result.data,
      message: '过期任务清理完成',
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('❌ 清理过期任务失败:', error)
    res.status(500).json({
      success: false,
      error: 'CLEANUP_EXPIRED_TASKS_ERROR',
      message: error.message,
      timestamp: new Date().toISOString()
    })
  }
})

/**
 * GET /api/v3/tasks/templates
 * 获取任务模板列表（管理员功能）
 */
router.get('/templates', requireAdmin, async (req, res) => {
  try {
    const { taskType, isActive } = req.query

    console.log(`📋 获取任务模板: 类型=${taskType}, 激活=${isActive}`)

    const whereCondition = {}

    if (taskType) {
      whereCondition.task_type = taskType
    }

    if (isActive !== undefined) {
      whereCondition.is_active = isActive === 'true'
    }

    const templates = await TaskManagementService.models.TaskTemplate.findAll({
      where: whereCondition,
      order: [['task_type', 'ASC'], ['created_at', 'ASC']]
    })

    res.json({
      success: true,
      data: { templates },
      message: '任务模板获取成功',
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('❌ 获取任务模板失败:', error)
    res.status(500).json({
      success: false,
      error: 'GET_TASK_TEMPLATES_ERROR',
      message: error.message,
      timestamp: new Date().toISOString()
    })
  }
})

module.exports = router
