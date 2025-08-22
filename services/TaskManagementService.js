/**
 * 🔥 任务管理系统Service v3 - 每日任务和进度跟踪
 * 创建时间：2025年08月22日 UTC
 * 特点：每日/周任务 + 进度自动跟踪 + 任务链条 + 自动奖励发放
 * 技术栈：Sequelize + 定时任务 + 事件驱动 + 缓存机制
 */

'use strict'

const { sequelize } = require('../models')
const EventBusService = require('./EventBusService')
const PointsSystemService = require('./PointsSystemService')
// const { v4: uuidv4 } = require('uuid') // 暂时未使用

class TaskManagementService {
  constructor () {
    this.models = require('../models')
    this.taskProgressCache = new Map() // 任务进度缓存
    this.init()
  }

  /**
   * 初始化任务管理系统
   */
  async init () {
    console.log('✅ 任务管理系统Service初始化完成')

    // 监听业务事件，自动更新任务进度
    EventBusService.on('lottery_draw_completed', (data) => {
      this.updateTaskProgress(data.userId, 'lottery_draw', 1)
    })

    EventBusService.on('points_earned', (data) => {
      this.updateTaskProgress(data.userId, 'points_earned', data.amount)
    })

    EventBusService.on('social_lottery_completed', (data) => {
      // 为所有参与者更新社交抽奖任务进度
      data.results.forEach(result => {
        this.updateTaskProgress(result.userId, 'social_lottery', 1)
      })
    })

    EventBusService.on('collection_item_added', (data) => {
      this.updateTaskProgress(data.userId, 'collection_items', 1)
    })
  }

  /**
   * 获取用户任务列表
   */
  async getUserTasks (userId, filters = {}) {
    try {
      // 构建查询条件
      const whereCondition = { user_id: userId, task_status: 'active' }

      if (filters.category) {
        whereCondition.category = filters.category
      }

      // 使用原生SQL获取详细任务信息
      const tasks = await sequelize.query(`
        SELECT 
          ut.*,
          tt.title as template_title,
          tt.description as template_description,
          tt.category,
          tt.difficulty,
          tt.reward_points,
          tt.reward_items
        FROM user_tasks ut
        LEFT JOIN task_templates tt ON ut.template_id = tt.template_id
        WHERE ut.user_id = ?
        AND ut.task_status = 'active'
        ORDER BY ut.created_at DESC
      `, {
        replacements: [userId],
        type: sequelize.QueryTypes.SELECT
      })

      return {
        success: true,
        data: { tasks },
        message: '用户任务获取成功'
      }
    } catch (error) {
      console.error('❌ 获取用户任务失败:', error)
      return {
        success: false,
        error: 'GET_USER_TASKS_FAILED',
        message: error.message
      }
    }
  }

  /**
   * 创建用户任务（基于模板或自定义）
   * @param {number} userId - 用户ID
   * @param {number|null} templateId - 任务模板ID，null表示自定义任务
   * @param {object} taskData - 任务数据
   */
  async createUserTask (userId, templateId = null, taskData = {}) {
    const transaction = await sequelize.transaction()

    try {
      console.log(`📝 创建用户任务: 用户=${userId}, 模板=${templateId}`)

      let taskInfo = {}

      if (templateId) {
        // 基于模板创建任务
        const template = await this.models.TaskTemplate.findByPk(templateId, { transaction })
        if (!template) {
          await transaction.rollback()
          return {
            success: false,
            error: 'TEMPLATE_NOT_FOUND',
            message: '任务模板不存在'
          }
        }

        taskInfo = {
          task_template_id: templateId,
          task_type: template.task_type,
          task_name: template.task_name,
          description: template.description,
          progress_target: template.target_value,
          reward_type: template.reward_type,
          reward_amount: template.reward_amount,
          reward_data: template.reward_data,
          expires_at: this.calculateTaskExpiry(template.task_type)
        }
      } else {
        // 自定义任务
        taskInfo = {
          task_template_id: null,
          task_type: taskData.task_type || 'custom',
          task_name: taskData.task_name,
          description: taskData.description,
          progress_target: taskData.progress_target,
          reward_type: taskData.reward_type || 'points',
          reward_amount: taskData.reward_amount || 0,
          reward_data: taskData.reward_data ? JSON.stringify(taskData.reward_data) : null,
          expires_at: taskData.expires_at || null
        }
      }

      // 检查是否已存在相同的任务
      if (templateId) {
        const existingTask = await this.models.UserTask.findOne({
          where: {
            user_id: userId,
            task_template_id: templateId,
            task_status: 'active',
            created_at: {
              [sequelize.Op.gte]: this.getTaskCreationStartTime(taskInfo.task_type)
            }
          },
          transaction
        })

        if (existingTask) {
          await transaction.rollback()
          return {
            success: false,
            error: 'TASK_ALREADY_EXISTS',
            message: '该任务已存在'
          }
        }
      }

      // 创建用户任务
      const userTask = await this.models.UserTask.create({
        user_id: userId,
        ...taskInfo,
        progress_current: 0,
        task_status: 'active'
      }, { transaction })

      await transaction.commit()

      // 发送任务创建事件
      await EventBusService.emit('user_task_created', {
        userId,
        taskId: userTask.task_id,
        taskType: taskInfo.task_type,
        taskName: taskInfo.task_name
      })

      console.log(`✅ 用户任务创建成功: ${userTask.task_id}`)

      return {
        success: true,
        data: { task: userTask },
        message: '任务创建成功'
      }
    } catch (error) {
      await transaction.rollback()
      console.error('❌ 创建用户任务失败:', error)
      return {
        success: false,
        error: 'CREATE_TASK_FAILED',
        message: error.message
      }
    }
  }

  /**
   * 更新任务进度
   * @param {number} userId - 用户ID
   * @param {string} progressType - 进度类型
   * @param {number} increment - 增量
   */
  async updateTaskProgress (userId, progressType, increment = 1) {
    try {
      console.log(`📈 更新任务进度: 用户=${userId}, 类型=${progressType}, 增量=${increment}`)

      // 获取用户相关的活跃任务
      const activeTasks = await this.models.UserTask.findAll({
        where: {
          user_id: userId,
          task_status: 'active',
          [sequelize.Op.or]: [
            { expires_at: { [sequelize.Op.is]: null } },
            { expires_at: { [sequelize.Op.gt]: new Date() } }
          ]
        },
        include: [{
          model: this.models.TaskTemplate,
          as: 'template',
          required: false
        }]
      })

      const updatedTasks = []

      for (const task of activeTasks) {
        // 检查任务是否与进度类型匹配
        const template = task.template
        if (!template) continue

        const config = template.config ? JSON.parse(template.config) : {}

        // 根据任务配置检查是否匹配进度类型
        if (this.isProgressTypeMatch(progressType, config.progress_type)) {
          const transaction = await sequelize.transaction()

          try {
            const newProgress = Math.min(
              task.progress_current + increment,
              task.progress_target
            )

            await task.update({
              progress_current: newProgress,
              last_updated: new Date()
            }, { transaction })

            // 检查是否完成任务
            if (newProgress >= task.progress_target && task.task_status === 'active') {
              await this.completeTask(task.task_id, transaction)
            }

            await transaction.commit()
            updatedTasks.push(task.task_id)

            console.log(`✅ 任务进度更新: ${task.task_id} (${task.progress_current} -> ${newProgress})`)
          } catch (error) {
            await transaction.rollback()
            console.error(`❌ 更新任务${task.task_id}进度失败:`, error)
          }
        }
      }

      return {
        success: true,
        data: { updated_tasks: updatedTasks }
      }
    } catch (error) {
      console.error('❌ 更新任务进度失败:', error)
      return {
        success: false,
        error: 'UPDATE_PROGRESS_FAILED',
        message: error.message
      }
    }
  }

  /**
   * 完成任务并发放奖励
   * @param {number} taskId - 任务ID
   * @param {object} transaction - 数据库事务
   */
  async completeTask (taskId, transaction = null) {
    const isExternalTransaction = !!transaction
    if (!transaction) {
      transaction = await sequelize.transaction()
    }

    try {
      const task = await this.models.UserTask.findByPk(taskId, {
        include: [{
          model: this.models.TaskTemplate,
          as: 'template'
        }],
        transaction
      })

      if (!task) {
        if (!isExternalTransaction) await transaction.rollback()
        return { success: false, error: 'TASK_NOT_FOUND' }
      }

      if (task.task_status === 'completed') {
        if (!isExternalTransaction) await transaction.rollback()
        return { success: false, error: 'TASK_ALREADY_COMPLETED' }
      }

      // 更新任务状态
      await task.update({
        task_status: 'completed',
        completed_at: new Date()
      }, { transaction })

      // 发放奖励
      let rewardResult = null
      if (task.reward_amount > 0) {
        rewardResult = await this.distributeTaskReward(task, transaction)
      }

      if (!isExternalTransaction) await transaction.commit()

      // 发送任务完成事件
      await EventBusService.emit('user_task_completed', {
        userId: task.user_id,
        taskId: task.task_id,
        taskType: task.task_type,
        taskName: task.task_name,
        reward: rewardResult
      })

      console.log(`🎉 任务完成: ${taskId}, 用户=${task.user_id}`)

      return {
        success: true,
        data: {
          task,
          reward: rewardResult
        }
      }
    } catch (error) {
      if (!isExternalTransaction) await transaction.rollback()
      console.error('❌ 完成任务失败:', error)
      return {
        success: false,
        error: 'COMPLETE_TASK_FAILED',
        message: error.message
      }
    }
  }

  /**
   * 发放任务奖励
   * @param {object} task - 任务对象
   * @param {object} transaction - 数据库事务
   */
  async distributeTaskReward (task, transaction) {
    try {
      const rewardData = task.reward_data ? JSON.parse(task.reward_data) : {}

      switch (task.reward_type) {
      case 'points': {
        // 发放积分奖励
        const pointsResult = await PointsSystemService.addPoints(
          task.user_id,
          task.reward_amount,
          'task_completion',
          `完成任务: ${task.task_name}`,
          transaction
        )
        return {
          type: 'points',
          amount: task.reward_amount,
          result: pointsResult
        }
      }

      case 'items': {
        // 发放物品奖励
        const items = rewardData.items || []
        for (const item of items) {
          // 这里应该调用库存服务添加物品
          console.log(`📦 发放物品奖励: 用户=${task.user_id}, 物品=${item.id}, 数量=${item.quantity}`)
        }
        return {
          type: 'items',
          items
        }
      }

      case 'vip_exp': {
        // 发放VIP经验
        console.log(`⭐ 发放VIP经验: 用户=${task.user_id}, 经验=${task.reward_amount}`)
        return {
          type: 'vip_exp',
          amount: task.reward_amount
        }
      }

      case 'lottery_tickets': {
        // 发放抽奖券
        console.log(`🎫 发放抽奖券: 用户=${task.user_id}, 数量=${task.reward_amount}`)
        return {
          type: 'lottery_tickets',
          amount: task.reward_amount
        }
      }

      default:
        console.warn(`⚠️ 未知奖励类型: ${task.reward_type}`)
        return null
      }
    } catch (error) {
      console.error('❌ 发放任务奖励失败:', error)
      return null
    }
  }

  /**
   * 初始化每日任务
   * @param {number} userId - 用户ID
   */
  async initializeDailyTasks (userId) {
    try {
      console.log(`📅 初始化每日任务: 用户=${userId}`)

      // 获取所有每日任务模板
      const dailyTemplates = await this.models.TaskTemplate.findAll({
        where: {
          task_type: 'daily',
          is_active: true
        }
      })

      const results = []

      for (const template of dailyTemplates) {
        const result = await this.createUserTask(userId, template.id)
        if (result.success) {
          results.push(result.data.task)
        }
      }

      console.log(`✅ 每日任务初始化完成: 用户=${userId}, 创建${results.length}个任务`)

      return {
        success: true,
        data: { tasks: results }
      }
    } catch (error) {
      console.error('❌ 初始化每日任务失败:', error)
      return {
        success: false,
        error: 'INIT_DAILY_TASKS_FAILED',
        message: error.message
      }
    }
  }

  /**
   * 初始化每周任务
   * @param {number} userId - 用户ID
   */
  async initializeWeeklyTasks (userId) {
    try {
      console.log(`📅 初始化每周任务: 用户=${userId}`)

      // 获取所有每周任务模板
      const weeklyTemplates = await this.models.TaskTemplate.findAll({
        where: {
          task_type: 'weekly',
          is_active: true
        }
      })

      const results = []

      for (const template of weeklyTemplates) {
        const result = await this.createUserTask(userId, template.id)
        if (result.success) {
          results.push(result.data.task)
        }
      }

      console.log(`✅ 每周任务初始化完成: 用户=${userId}, 创建${results.length}个任务`)

      return {
        success: true,
        data: { tasks: results }
      }
    } catch (error) {
      console.error('❌ 初始化每周任务失败:', error)
      return {
        success: false,
        error: 'INIT_WEEKLY_TASKS_FAILED',
        message: error.message
      }
    }
  }

  /**
   * 清理过期任务
   */
  async cleanupExpiredTasks () {
    try {
      console.log('🧹 清理过期任务')

      const [result] = await sequelize.query(`
        UPDATE user_tasks 
        SET task_status = 'expired' 
        WHERE task_status = 'active' 
          AND expires_at IS NOT NULL 
          AND expires_at < NOW()
      `)

      console.log(`✅ 清理过期任务完成: ${result.affectedRows || 0}个任务`)

      return {
        success: true,
        data: { expired_count: result.affectedRows || 0 }
      }
    } catch (error) {
      console.error('❌ 清理过期任务失败:', error)
      return {
        success: false,
        error: 'CLEANUP_EXPIRED_TASKS_FAILED',
        message: error.message
      }
    }
  }

  /**
   * 获取任务统计信息
   */
  async getTaskStatistics (userId = null) {
    try {
      let whereCondition = ''
      let replacements = []

      if (userId) {
        whereCondition = 'WHERE ut.user_id = ?'
        replacements = [userId]
      }

      const [stats] = await sequelize.query(`
        SELECT 
          COUNT(*) as total_tasks,
          COUNT(CASE WHEN ut.task_status = 'active' THEN 1 END) as active_tasks,
          COUNT(CASE WHEN ut.task_status = 'completed' THEN 1 END) as completed_tasks,
          COUNT(CASE WHEN ut.task_status = 'expired' THEN 1 END) as expired_tasks,
          COUNT(CASE WHEN tt.category = 'daily' THEN 1 END) as daily_tasks,
          COUNT(CASE WHEN tt.category = 'weekly' THEN 1 END) as weekly_tasks,
          COUNT(CASE WHEN tt.task_type = 'lottery' THEN 1 END) as lottery_tasks,
          COUNT(CASE WHEN tt.task_type = 'points' THEN 1 END) as points_tasks,
          COUNT(CASE WHEN tt.task_type = 'social' THEN 1 END) as social_tasks,
          AVG(CASE WHEN ut.target_value > 0 THEN ut.current_progress / ut.target_value ELSE 0 END) as avg_completion_rate
        FROM user_tasks ut
        LEFT JOIN task_templates tt ON ut.template_id = tt.template_id
        ${whereCondition}
      `, {
        replacements
      })

      return {
        success: true,
        data: {
          statistics: stats[0],
          period: userId ? 'user_specific' : 'global'
        }
      }
    } catch (error) {
      console.error('❌ 获取任务统计失败:', error)
      return {
        success: false,
        error: 'GET_TASK_STATISTICS_FAILED',
        message: error.message
      }
    }
  }

  // =============== 工具方法 ===============

  /**
   * 检查进度类型是否匹配
   */
  isProgressTypeMatch (progressType, taskProgressType) {
    const typeMapping = {
      lottery_draw: ['lottery_draw', 'lottery_participation'],
      points_earned: ['points_earned', 'daily_points'],
      social_lottery: ['social_lottery', 'social_participation'],
      collection_items: ['collection_items', 'collect_fragments']
    }

    const mappedTypes = typeMapping[progressType] || [progressType]
    return mappedTypes.includes(taskProgressType)
  }

  /**
   * 计算任务过期时间
   */
  calculateTaskExpiry (taskType) {
    const now = new Date()

    switch (taskType) {
    case 'daily': {
      // 今日23:59:59
      const endOfDay = new Date(now)
      endOfDay.setHours(23, 59, 59, 999)
      return endOfDay
    }

    case 'weekly': {
      // 本周日23:59:59
      const endOfWeek = new Date(now)
      const daysUntilSunday = 7 - now.getDay()
      endOfWeek.setDate(now.getDate() + daysUntilSunday)
      endOfWeek.setHours(23, 59, 59, 999)
      return endOfWeek
    }

    case 'achievement':
      // 成就任务不过期
      return null

    case 'limited_time':
      // 限时任务需要在创建时指定
      return new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000) // 默认7天

    default:
      return null
    }
  }

  /**
   * 获取任务创建时间起点
   */
  getTaskCreationStartTime (taskType) {
    const now = new Date()

    switch (taskType) {
    case 'daily': {
      // 今日00:00:00
      const startOfDay = new Date(now)
      startOfDay.setHours(0, 0, 0, 0)
      return startOfDay
    }

    case 'weekly': {
      // 本周一00:00:00
      const startOfWeek = new Date(now)
      const daysSinceMonday = (now.getDay() + 6) % 7 // 让周一为0
      startOfWeek.setDate(now.getDate() - daysSinceMonday)
      startOfWeek.setHours(0, 0, 0, 0)
      return startOfWeek
    }

    default:
      return new Date(0) // 很久以前
    }
  }
}

module.exports = new TaskManagementService()
