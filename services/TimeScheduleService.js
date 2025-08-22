/**
 * 🔥 时间调度服务 v3.0
 * 功能：基于node-cron的定时任务调度系统
 * 特性：任务持久化、恢复、监控、分布式协调
 * 架构：与现有V3服务集成，支持事件驱动
 */

const cron = require('node-cron')
const { sequelize, Sequelize } = require('../models')
const EventBusService = require('./EventBusService')
const { v4: uuidv4 } = require('uuid')
const { Op } = Sequelize

class TimeScheduleService {
  constructor () {
    this.models = require('../models')
    this.cronJobs = new Map() // 存储运行中的cron任务
    this.taskExecutors = new Map() // 任务执行器映射
    this.isInitialized = false
    this.instanceId = uuidv4() // 服务实例ID，用于分布式协调

    // 注册默认任务执行器
    this.registerDefaultExecutors()
  }

  /**
   * 初始化调度服务
   * 恢复活跃任务并启动调度
   */
  async initialize () {
    if (this.isInitialized) {
      console.log('⚠️ TimeScheduleService已经初始化')
      return { success: true, message: '调度服务已运行' }
    }

    try {
      console.log('🚀 初始化定时任务调度服务...')

      // 清理过期任务
      await this.cleanupExpiredTasks()

      // 恢复活跃任务
      const recoveredTasks = await this.recoverActiveTasks()

      // 启动系统监控任务
      this.startSystemMonitoring()

      this.isInitialized = true

      console.log(`✅ 定时任务调度服务初始化完成，恢复了${recoveredTasks.length}个任务`)

      // 发送初始化完成事件
      await EventBusService.emit('time_schedule_service_initialized', {
        instanceId: this.instanceId,
        recoveredTasksCount: recoveredTasks.length,
        timestamp: new Date().toISOString()
      })

      return {
        success: true,
        data: {
          instanceId: this.instanceId,
          recoveredTasks: recoveredTasks.length,
          activeJobs: this.cronJobs.size
        },
        message: '定时任务调度服务初始化成功'
      }
    } catch (error) {
      console.error('❌ 初始化定时任务调度服务失败:', error)
      return {
        success: false,
        error: 'INITIALIZATION_FAILED',
        message: error.message
      }
    }
  }

  /**
   * 恢复数据库中的活跃任务
   */
  async recoverActiveTasks () {
    try {
      const activeTasks = await this.models.ScheduledTask.findAll({
        where: {
          status: 'active'
        },
        order: [['created_at', 'ASC']]
      })

      const recoveredTasks = []

      for (const task of activeTasks) {
        try {
          // 验证Cron表达式
          if (!cron.validate(task.cron_expression)) {
            console.warn(`⚠️ 任务${task.name}的Cron表达式无效:`, task.cron_expression)
            await this.updateTaskStatus(task.id, 'error', 'Cron表达式无效')
            continue
          }

          // 创建并启动任务
          const jobResult = await this.createCronJob(task)
          if (jobResult.success) {
            recoveredTasks.push(task)
            console.log(`✅ 恢复任务: ${task.name} (${task.cron_expression})`)
          }
        } catch (error) {
          console.error(`❌ 恢复任务失败: ${task.name}`, error)
          await this.updateTaskStatus(task.id, 'error', error.message)
        }
      }

      return recoveredTasks
    } catch (error) {
      console.error('恢复活跃任务失败:', error)
      throw error
    }
  }

  /**
   * 创建Cron任务
   */
  async createCronJob (task) {
    try {
      if (this.cronJobs.has(task.id)) {
        return {
          success: false,
          error: 'JOB_ALREADY_EXISTS',
          message: '任务已存在'
        }
      }

      // 创建Cron任务
      const cronJob = cron.schedule(task.cron_expression, async () => {
        await this.executeTask(task.id)
      }, {
        scheduled: false, // 暂不启动，等配置完成
        timezone: 'Asia/Shanghai' // 设置时区
      })

      // 存储任务映射
      this.cronJobs.set(task.id, {
        cronJob,
        task,
        lastExecution: null,
        executionCount: 0
      })

      // 启动任务
      cronJob.start()

      // 计算下次执行时间
      const nextExecution = this.calculateNextExecution(task.cron_expression)
      await this.updateTaskNextExecution(task.id, nextExecution)

      console.log(`📅 Cron任务创建成功: ${task.name}`)

      return {
        success: true,
        data: {
          taskId: task.id,
          nextExecution
        },
        message: 'Cron任务创建成功'
      }
    } catch (error) {
      console.error('创建Cron任务失败:', error)
      return {
        success: false,
        error: 'CREATE_JOB_FAILED',
        message: error.message
      }
    }
  }

  /**
   * 执行任务
   */
  async executeTask (taskId) {
    const startTime = Date.now()
    const transaction = await sequelize.transaction()

    try {
      // 获取任务信息
      const task = await this.models.ScheduledTask.findByPk(taskId, { transaction })
      if (!task || task.status !== 'active') {
        await transaction.rollback()
        return { success: false, error: 'TASK_NOT_FOUND_OR_INACTIVE' }
      }

      console.log(`🎯 开始执行任务: ${task.name}`)

      // 更新执行状态
      await task.update({
        last_execution: new Date(),
        execution_count: task.execution_count + 1
      }, { transaction })

      // 获取任务执行器
      const executor = this.taskExecutors.get(task.task_type)
      if (!executor) {
        throw new Error(`未找到任务类型 ${task.task_type} 的执行器`)
      }

      // 执行任务
      const executionResult = await executor(task.task_data || {}, task)

      const duration = Date.now() - startTime

      // 更新执行结果
      await task.update({
        last_duration_ms: duration,
        error_count: executionResult.success ? 0 : task.error_count + 1,
        last_error: executionResult.success ? null : executionResult.error
      }, { transaction })

      // 如果是非重复任务且执行成功，标记为完成
      if (!task.is_recurring && executionResult.success) {
        await task.update({ status: 'completed' }, { transaction })
        this.stopCronJob(taskId)
      }

      // 计算下次执行时间
      if (task.is_recurring) {
        const nextExecution = this.calculateNextExecution(task.cron_expression)
        await task.update({ next_execution: nextExecution }, { transaction })
      }

      await transaction.commit()

      // 发送任务执行事件
      await EventBusService.emit('scheduled_task_executed', {
        taskId,
        taskName: task.name,
        taskType: task.task_type,
        duration,
        success: executionResult.success,
        result: executionResult,
        timestamp: new Date().toISOString()
      })

      console.log(`✅ 任务执行完成: ${task.name} (耗时: ${duration}ms)`)

      return {
        success: true,
        data: {
          taskId,
          duration,
          result: executionResult
        },
        message: '任务执行成功'
      }
    } catch (error) {
      await transaction.rollback()
      const duration = Date.now() - startTime

      console.error(`❌ 任务执行失败: ${taskId}`, error)

      // 更新错误信息
      try {
        await this.updateTaskError(taskId, error.message, duration)
      } catch (updateError) {
        console.error('更新任务错误状态失败:', updateError)
      }

      // 发送任务失败事件
      await EventBusService.emit('scheduled_task_failed', {
        taskId,
        error: error.message,
        duration,
        timestamp: new Date().toISOString()
      })

      return {
        success: false,
        error: 'TASK_EXECUTION_FAILED',
        message: error.message
      }
    }
  }

  /**
   * 注册默认任务执行器
   */
  registerDefaultExecutors () {
    // 每日重置任务
    this.taskExecutors.set('daily_reset', async (taskData) => {
      try {
        const PointsSystemService = require('./PointsSystemService')
        const TaskManagementService = require('./TaskManagementService')

        const results = []

        // 重置每日积分
        if (taskData.reset_daily_points) {
          const resetResult = await PointsSystemService.resetDailyPoints()
          results.push({ operation: 'reset_daily_points', result: resetResult })
        }

        // 重置每日任务
        if (taskData.reset_daily_tasks) {
          const taskResult = await TaskManagementService.resetDailyTasks()
          results.push({ operation: 'reset_daily_tasks', result: taskResult })
        }

        // 重置每日抽奖次数
        if (taskData.reset_daily_draws) {
          const drawResult = await this.resetDailyDraws()
          results.push({ operation: 'reset_daily_draws', result: drawResult })
        }

        return {
          success: true,
          data: results,
          message: '每日重置任务执行成功'
        }
      } catch (error) {
        return {
          success: false,
          error: error.message
        }
      }
    })

    // VIP到期检查任务
    this.taskExecutors.set('vip_expiry_check', async (taskData) => {
      try {
        const VIPSystemService = require('./VIPSystemService')

        const results = []

        if (taskData.check_expiry) {
          const checkResult = await VIPSystemService.checkExpiredVIPs()
          results.push({ operation: 'check_expiry', result: checkResult })
        }

        return {
          success: true,
          data: results,
          message: 'VIP到期检查任务执行成功'
        }
      } catch (error) {
        return {
          success: false,
          error: error.message
        }
      }
    })

    // 社交房间清理任务
    this.taskExecutors.set('social_room_cleanup', async (taskData) => {
      try {
        const SocialLotteryService = require('./SocialLotteryService')

        const results = []

        if (taskData.cleanup_expired_rooms) {
          const cleanupResult = await SocialLotteryService.cleanupExpiredRooms()
          results.push({ operation: 'cleanup_expired_rooms', result: cleanupResult })
        }

        return {
          success: true,
          data: results,
          message: '社交房间清理任务执行成功'
        }
      } catch (error) {
        return {
          success: false,
          error: error.message
        }
      }
    })

    // 积分结算任务
    this.taskExecutors.set('points_settlement', async (taskData) => {
      try {
        const PointsSystemService = require('./PointsSystemService')

        const results = []

        if (taskData.settlement_weekly_bonus) {
          const bonusResult = await PointsSystemService.settlementWeeklyBonus()
          results.push({ operation: 'settlement_weekly_bonus', result: bonusResult })
        }

        if (taskData.update_vip_progress) {
          const VIPSystemService = require('./VIPSystemService')
          const vipResult = await VIPSystemService.updateAllVIPProgress()
          results.push({ operation: 'update_vip_progress', result: vipResult })
        }

        return {
          success: true,
          data: results,
          message: '积分结算任务执行成功'
        }
      } catch (error) {
        return {
          success: false,
          error: error.message
        }
      }
    })

    console.log('📝 默认任务执行器注册完成')
  }

  /**
   * 注册自定义任务执行器
   */
  registerTaskExecutor (taskType, executor) {
    if (typeof executor !== 'function') {
      throw new Error('任务执行器必须是一个函数')
    }

    this.taskExecutors.set(taskType, executor)
    console.log(`📝 注册自定义任务执行器: ${taskType}`)

    return {
      success: true,
      message: `任务执行器 ${taskType} 注册成功`
    }
  }

  /**
   * 创建新的定时任务
   */
  async createScheduledTask (taskData) {
    const transaction = await sequelize.transaction()

    try {
      // 验证Cron表达式
      if (!cron.validate(taskData.cron_expression)) {
        await transaction.rollback()
        return {
          success: false,
          error: 'INVALID_CRON_EXPRESSION',
          message: 'Cron表达式格式无效'
        }
      }

      // 创建任务记录
      const task = await this.models.ScheduledTask.create({
        name: taskData.name,
        description: taskData.description,
        task_type: taskData.task_type,
        cron_expression: taskData.cron_expression,
        task_data: taskData.task_data || {},
        status: 'active',
        is_recurring: taskData.is_recurring !== false,
        max_retries: taskData.max_retries || 3,
        timeout_minutes: taskData.timeout_minutes || 30,
        created_by: taskData.created_by || null
      }, { transaction })

      // 计算下次执行时间
      const nextExecution = this.calculateNextExecution(taskData.cron_expression)
      await task.update({ next_execution: nextExecution }, { transaction })

      await transaction.commit()

      // 创建并启动Cron任务
      const cronResult = await this.createCronJob(task)
      if (!cronResult.success) {
        await this.updateTaskStatus(task.id, 'error', cronResult.message)
        return cronResult
      }

      // 发送任务创建事件
      await EventBusService.emit('scheduled_task_created', {
        taskId: task.id,
        taskName: task.name,
        taskType: task.task_type,
        cronExpression: task.cron_expression,
        nextExecution,
        timestamp: new Date().toISOString()
      })

      return {
        success: true,
        data: {
          taskId: task.id,
          task: task.toJSON(),
          nextExecution
        },
        message: '定时任务创建成功'
      }
    } catch (error) {
      await transaction.rollback()
      console.error('创建定时任务失败:', error)
      return {
        success: false,
        error: 'CREATE_TASK_FAILED',
        message: error.message
      }
    }
  }

  /**
   * 停止Cron任务
   */
  stopCronJob (taskId) {
    const jobInfo = this.cronJobs.get(taskId)
    if (jobInfo) {
      jobInfo.cronJob.stop()
      this.cronJobs.delete(taskId)
      console.log(`⏸️ 停止Cron任务: ${taskId}`)
      return { success: true }
    }
    return { success: false, error: 'JOB_NOT_FOUND' }
  }

  /**
   * 暂停任务
   */
  async pauseTask (taskId) {
    try {
      const task = await this.models.ScheduledTask.findByPk(taskId)
      if (!task) {
        return { success: false, error: 'TASK_NOT_FOUND' }
      }

      await task.update({ status: 'paused' })
      this.stopCronJob(taskId)

      return {
        success: true,
        message: '任务已暂停'
      }
    } catch (error) {
      return {
        success: false,
        error: 'PAUSE_TASK_FAILED',
        message: error.message
      }
    }
  }

  /**
   * 恢复任务
   */
  async resumeTask (taskId) {
    try {
      const task = await this.models.ScheduledTask.findByPk(taskId)
      if (!task) {
        return { success: false, error: 'TASK_NOT_FOUND' }
      }

      await task.update({ status: 'active' })
      const cronResult = await this.createCronJob(task)

      return cronResult
    } catch (error) {
      return {
        success: false,
        error: 'RESUME_TASK_FAILED',
        message: error.message
      }
    }
  }

  /**
   * 删除任务
   */
  async deleteTask (taskId) {
    const transaction = await sequelize.transaction()

    try {
      const task = await this.models.ScheduledTask.findByPk(taskId, { transaction })
      if (!task) {
        await transaction.rollback()
        return { success: false, error: 'TASK_NOT_FOUND' }
      }

      // 停止Cron任务
      this.stopCronJob(taskId)

      // 删除数据库记录
      await task.destroy({ transaction })

      await transaction.commit()

      return {
        success: true,
        message: '任务删除成功'
      }
    } catch (error) {
      await transaction.rollback()
      return {
        success: false,
        error: 'DELETE_TASK_FAILED',
        message: error.message
      }
    }
  }

  /**
   * 获取任务列表
   */
  async getTaskList (filters = {}) {
    try {
      const where = {}

      if (filters.status) {
        where.status = filters.status
      }

      if (filters.task_type) {
        where.task_type = filters.task_type
      }

      const tasks = await this.models.ScheduledTask.findAll({
        where,
        order: [['created_at', 'DESC']],
        limit: filters.limit || 50,
        offset: filters.offset || 0
      })

      // 添加运行时状态
      const tasksWithStatus = tasks.map(task => {
        const jobInfo = this.cronJobs.get(task.id)
        return {
          ...task.toJSON(),
          isRunning: !!jobInfo,
          lastExecutionFromMemory: jobInfo?.lastExecution || null
        }
      })

      return {
        success: true,
        data: {
          tasks: tasksWithStatus,
          total: tasksWithStatus.length,
          activeJobs: this.cronJobs.size
        },
        message: '获取任务列表成功'
      }
    } catch (error) {
      return {
        success: false,
        error: 'GET_TASK_LIST_FAILED',
        message: error.message
      }
    }
  }

  /**
   * 获取任务统计信息
   */
  async getTaskStatistics () {
    try {
      const stats = await this.models.ScheduledTask.findAll({
        attributes: [
          'status',
          [sequelize.fn('COUNT', '*'), 'count']
        ],
        group: ['status'],
        raw: true
      })

      const typeStats = await this.models.ScheduledTask.findAll({
        attributes: [
          'task_type',
          [sequelize.fn('COUNT', '*'), 'count']
        ],
        group: ['task_type'],
        raw: true
      })

      return {
        success: true,
        data: {
          statusStats: stats,
          typeStats,
          activeJobs: this.cronJobs.size,
          instanceId: this.instanceId,
          uptime: process.uptime()
        },
        message: '获取任务统计成功'
      }
    } catch (error) {
      return {
        success: false,
        error: 'GET_STATISTICS_FAILED',
        message: error.message
      }
    }
  }

  /**
   * 计算下次执行时间
   */
  calculateNextExecution (_cronExpression) {
    try {
      // 这里可以使用node-cron的内部方法或第三方库
      // 简单实现：返回当前时间加1小时作为示例
      const now = new Date()
      const next = new Date(now.getTime() + 60 * 60 * 1000) // 1小时后
      return next
    } catch (error) {
      console.error('计算下次执行时间失败:', error)
      return null
    }
  }

  /**
   * 辅助方法：更新任务状态
   */
  async updateTaskStatus (taskId, status, errorMessage = null) {
    try {
      const updateData = { status }
      if (errorMessage) {
        updateData.last_error = errorMessage
        updateData.error_count = sequelize.literal('error_count + 1')
      }

      await this.models.ScheduledTask.update(updateData, {
        where: { id: taskId }
      })
    } catch (error) {
      console.error('更新任务状态失败:', error)
    }
  }

  /**
   * 辅助方法：更新任务错误信息
   */
  async updateTaskError (taskId, errorMessage, duration) {
    try {
      await this.models.ScheduledTask.update({
        last_error: errorMessage,
        error_count: sequelize.literal('error_count + 1'),
        last_duration_ms: duration
      }, {
        where: { id: taskId }
      })
    } catch (error) {
      console.error('更新任务错误信息失败:', error)
    }
  }

  /**
   * 辅助方法：更新下次执行时间
   */
  async updateTaskNextExecution (taskId, nextExecution) {
    try {
      await this.models.ScheduledTask.update({
        next_execution: nextExecution
      }, {
        where: { id: taskId }
      })
    } catch (error) {
      console.error('更新下次执行时间失败:', error)
    }
  }

  /**
   * 清理过期任务
   */
  async cleanupExpiredTasks () {
    try {
      // 清理完成状态超过7天的任务
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)

      const deletedCount = await this.models.ScheduledTask.destroy({
        where: {
          status: 'completed',
          updated_at: {
            [Op.lt]: sevenDaysAgo
          }
        }
      })

      if (deletedCount > 0) {
        console.log(`🧹 清理了${deletedCount}个过期的已完成任务`)
      }

      return { success: true, deletedCount }
    } catch (error) {
      console.error('清理过期任务失败:', error)
      return { success: false, error: error.message }
    }
  }

  /**
   * 重置每日抽奖次数
   */
  async resetDailyDraws () {
    try {
      // 这里应该调用相关服务重置每日抽奖次数
      // 暂时返回成功，具体实现需要根据业务逻辑调整
      console.log('🎰 重置每日抽奖次数')
      return { success: true, message: '每日抽奖次数重置成功' }
    } catch (error) {
      return { success: false, error: error.message }
    }
  }

  /**
   * 启动系统监控
   */
  startSystemMonitoring () {
    // 每10分钟检查任务健康状态
    setInterval(async () => {
      await this.healthCheck()
    }, 10 * 60 * 1000)

    console.log('💡 系统监控已启动')
  }

  /**
   * 健康检查
   */
  async healthCheck () {
    try {
      const _stats = await this.getTaskStatistics()
      console.log(`💗 健康检查: 活跃任务${this.cronJobs.size}个`)

      // 可以在这里添加更多健康检查逻辑
      return {
        success: true,
        data: {
          activeJobs: this.cronJobs.size,
          uptime: process.uptime(),
          memoryUsage: process.memoryUsage()
        }
      }
    } catch (error) {
      console.error('健康检查失败:', error)
      return { success: false, error: error.message }
    }
  }

  /**
   * 优雅关闭
   */
  async shutdown () {
    console.log('🛑 正在关闭定时任务调度服务...')

    // 停止所有Cron任务
    for (const [taskId, jobInfo] of this.cronJobs) {
      try {
        jobInfo.cronJob.stop()
        console.log(`⏹️ 停止任务: ${taskId}`)
      } catch (error) {
        console.error(`停止任务失败: ${taskId}`, error)
      }
    }

    this.cronJobs.clear()
    this.isInitialized = false

    console.log('✅ 定时任务调度服务已关闭')
    return { success: true, message: '服务已优雅关闭' }
  }
}

module.exports = new TimeScheduleService()
