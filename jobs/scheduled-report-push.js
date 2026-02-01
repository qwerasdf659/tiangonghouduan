'use strict'

/**
 * 定时报表推送任务
 *
 * @module jobs/scheduled-report-push
 * @version 1.0.0
 * @date 2026-01-31
 *
 * 业务场景：
 * - 检查配置了定时推送的报表模板
 * - 根据调度配置自动生成并推送报表
 * - 支持日报、周报、月报等不同频率
 *
 * 执行频率：每小时第 5 分钟执行
 *
 * 设计原则：
 * - 幂等性：多次执行结果一致
 * - 容错性：单个报表失败不影响其他报表处理
 * - 可追溯：完整的日志记录
 *
 * 任务编号：B-39 定时推送任务
 * 创建时间：2026年01月31日
 *
 * 依赖服务：
 * - CustomReportService.getScheduledTemplates()
 * - CustomReportService.executeScheduledReport()
 * - NotificationService（通知推送）
 */

const logger = require('../utils/logger')
const BeijingTimeHelper = require('../utils/timeHelper')
const ServiceManager = require('../services')

/**
 * 定时报表推送任务类
 *
 * @class ScheduledReportPush
 */
class ScheduledReportPush {
  /**
   * 任务名称（用于日志和监控）
   * @type {string}
   */
  static JOB_NAME = 'scheduled-report-push'

  /**
   * 执行定时任务
   *
   * @description 检查并执行待推送的定时报表
   * @returns {Promise<Object>} 执行结果
   */
  static async execute() {
    const start_time = Date.now()
    const job_id = `${this.JOB_NAME}_${BeijingTimeHelper.format(new Date()).replace(/[:\s]/g, '-')}`

    logger.info(`[${this.JOB_NAME}] 开始执行定时报表推送任务`, {
      job_id,
      start_time: BeijingTimeHelper.format(new Date())
    })

    const results = {
      templates_checked: 0,
      reports_generated: 0,
      reports_pushed: 0,
      errors: []
    }

    try {
      // 获取 CustomReportService
      const reportService = ServiceManager.getService('custom_report')

      if (!reportService) {
        throw new Error('CustomReportService 未初始化')
      }

      // 获取配置了定时推送的模板
      const templates = await reportService.getScheduledTemplates()
      results.templates_checked = templates.length

      logger.info(`[${this.JOB_NAME}] 找到 ${templates.length} 个定时报表模板`, { job_id })

      // 检查每个模板是否需要执行
      for (const template of templates) {
        try {
          // 检查是否到达执行时间
          if (!ScheduledReportPush.shouldExecute(template)) {
            continue
          }

          // 执行报表生成
          const reportResult = await reportService.executeScheduledReport(template.template_id)
          results.reports_generated++

          // 推送报表通知
          const pushResult = await ScheduledReportPush.pushReportNotification(
            template,
            reportResult
          )
          if (pushResult.success) {
            results.reports_pushed++
          }

          logger.info(`[${this.JOB_NAME}] 报表生成成功`, {
            job_id,
            template_id: template.template_id,
            template_name: template.name,
            data_count: reportResult.data_count
          })
        } catch (templateError) {
          results.errors.push({
            template_id: template.template_id,
            template_name: template.name,
            error: templateError.message
          })

          logger.error(`[${this.JOB_NAME}] 模板处理失败`, {
            job_id,
            template_id: template.template_id,
            error: templateError.message
          })
        }
      }

      const duration_ms = Date.now() - start_time

      logger.info(`[${this.JOB_NAME}] 定时报表推送任务执行完成`, {
        job_id,
        duration_ms,
        ...results
      })

      return {
        success: true,
        job_id,
        duration_ms,
        ...results
      }
    } catch (error) {
      const duration_ms = Date.now() - start_time

      logger.error(`[${this.JOB_NAME}] 定时报表推送任务执行失败`, {
        job_id,
        duration_ms,
        error: error.message,
        stack: error.stack
      })

      return {
        success: false,
        job_id,
        duration_ms,
        error: error.message,
        ...results
      }
    }
  }

  /**
   * 检查模板是否应该执行
   *
   * @param {Object} template - 报表模板
   * @returns {boolean} 是否应该执行
   */
  static shouldExecute(template) {
    const scheduleConfig = template.schedule_config || {}
    const period = scheduleConfig.period || 'daily'
    const executeHour = scheduleConfig.execute_hour || 8 // 默认早上8点
    const executeDay = scheduleConfig.execute_day || 1 // 默认周一/月初

    const now = new Date()
    const currentHour = now.getHours()

    // 只在指定小时执行
    if (currentHour !== executeHour) {
      return false
    }

    switch (period) {
      case 'daily':
        // 每天执行
        return true

      case 'weekly':
        // 每周指定日执行（0=周日, 1=周一, ...）
        return now.getDay() === executeDay

      case 'monthly':
        // 每月指定日执行
        return now.getDate() === executeDay

      default:
        return false
    }
  }

  /**
   * 推送报表通知
   *
   * @param {Object} template - 报表模板
   * @param {Object} reportResult - 报表结果
   * @returns {Promise<Object>} 推送结果
   */
  static async pushReportNotification(template, reportResult) {
    try {
      const notificationService = ServiceManager.getService('notification')

      if (!notificationService) {
        logger.warn(`[${this.JOB_NAME}] NotificationService 不可用，跳过通知推送`)
        return { success: false, reason: 'service_unavailable' }
      }

      // 获取接收者配置
      const scheduleConfig = template.schedule_config || {}
      const recipients = scheduleConfig.recipients || []

      if (recipients.length === 0) {
        logger.info(`[${this.JOB_NAME}] 模板未配置接收者，跳过通知`, {
          template_id: template.template_id
        })
        return { success: false, reason: 'no_recipients' }
      }

      // 发送通知给每个接收者
      for (const recipientId of recipients) {
        await notificationService.notifyUser({
          user_id: recipientId,
          title: `定时报表: ${template.name}`,
          content: `您的定时报表已生成，包含 ${reportResult.data_count || 0} 条数据。`,
          type: 'report',
          data: {
            template_id: template.template_id,
            template_name: template.name,
            executed_at: reportResult.executed_at,
            data_count: reportResult.data_count
          }
        })
      }

      return { success: true, recipients_count: recipients.length }
    } catch (error) {
      logger.error(`[${this.JOB_NAME}] 报表通知推送失败`, {
        template_id: template.template_id,
        error: error.message
      })
      return { success: false, error: error.message }
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
      description: '定时报表推送任务',
      schedule: '5 * * * *', // 每小时第5分钟执行
      dependencies: ['CustomReportService', 'NotificationService'],
      created_at: '2026-01-31',
      task_number: 'B-39'
    }
  }
}

module.exports = ScheduledReportPush
