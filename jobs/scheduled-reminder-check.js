'use strict'

/**
 * 智能提醒定时检测任务
 *
 * @module jobs/scheduled-reminder-check
 * @version 1.0.0
 * @date 2026-01-31
 *
 * 业务场景：
 * - 定期检查启用的提醒规则
 * - 根据规则的 check_interval 和 last_checked_at 判断是否需要执行
 * - 执行符合条件的规则并发送提醒通知
 *
 * 执行频率：每分钟执行一次（检查是否有规则需要执行）
 *
 * 设计原则：
 * - 幂等性：多次执行结果一致
 * - 容错性：单个规则失败不影响其他规则处理
 * - 可追溯：完整的日志记录
 * - 分布式安全：使用分布式锁防止重复执行
 *
 * 任务编号：B-32 定时检测任务
 * 创建时间：2026年01月31日
 *
 * 依赖服务：
 * - ReminderEngineService.runPendingRules()
 */

const logger = require('../utils/logger')
const BeijingTimeHelper = require('../utils/timeHelper')
const ServiceManager = require('../services')

/**
 * 智能提醒定时检测任务类
 *
 * @class ScheduledReminderCheck
 */
class ScheduledReminderCheck {
  /**
   * 任务名称（用于日志和监控）
   * @type {string}
   */
  static JOB_NAME = 'scheduled-reminder-check'

  /**
   * 执行定时任务
   *
   * @description 检查并执行待处理的提醒规则
   * @returns {Promise<Object>} 执行结果
   */
  static async execute() {
    const start_time = Date.now()
    const job_id = `${this.JOB_NAME}_${BeijingTimeHelper.format(new Date()).replace(/[:\s]/g, '-')}`

    logger.info(`[${this.JOB_NAME}] 开始执行智能提醒检测任务`, {
      job_id,
      start_time: BeijingTimeHelper.format(new Date())
    })

    try {
      // 获取 ReminderEngineService
      const reminderService = ServiceManager.getService('reminder_engine')

      if (!reminderService) {
        throw new Error('ReminderEngineService 未初始化')
      }

      // 执行待处理的提醒规则
      const result = await reminderService.runPendingRules()

      const duration_ms = Date.now() - start_time

      logger.info(`[${this.JOB_NAME}] 智能提醒检测任务执行完成`, {
        job_id,
        duration_ms,
        rules_checked: result.rules_checked,
        rules_triggered: result.rules_triggered,
        notifications_sent: result.notifications_sent,
        errors_count: result.errors?.length || 0
      })

      return {
        success: true,
        job_id,
        duration_ms,
        ...result
      }
    } catch (error) {
      const duration_ms = Date.now() - start_time

      logger.error(`[${this.JOB_NAME}] 智能提醒检测任务执行失败`, {
        job_id,
        duration_ms,
        error: error.message,
        stack: error.stack
      })

      return {
        success: false,
        job_id,
        duration_ms,
        error: error.message
      }
    }
  }

  /**
   * 获取任务状态信息
   *
   * @returns {Object} 任务状态
   */
  static getJobInfo() {
    return {
      name: this.JOB_NAME,
      description: '智能提醒定时检测任务',
      schedule: '* * * * *', // 每分钟执行
      dependencies: ['ReminderEngineService'],
      created_at: '2026-01-31',
      task_number: 'B-32'
    }
  }
}

module.exports = ScheduledReminderCheck
