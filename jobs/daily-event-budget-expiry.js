'use strict'

/**
 * @file 活动专属预算/活动积分到期清零定时任务（水晶奖品倍率活动设计方案 §18.5 / 防2 / D-7）
 * @description 每日扫描"配置过归集规则 + end_time 已到期"的抽奖活动，
 * 清零其专属预算桶 EVENT_<活动code> 内的 budget_points + event_points（直接清零，不折算）。
 *
 * 业务场景（防囤积套利 §12）：
 * - 限时翻倍活动的专属预算/活动积分只在活动内有效，活动结束即失效清零（同游戏活动代币）
 * - 清零走 BalanceService 双录（对手方 SYSTEM_BURN）+ 幂等，保证余额与流水互锁不破、可对账追溯
 * - 活动池 pool_budget_remaining 到期由运营手动回收（D-7），不在本任务范围
 *
 * 执行策略：
 * - 定时执行：每天凌晨 1 点（北京时间，与其他每日 job 对齐）
 * - 环境开关：ENABLE_EVENT_BUDGET_EXPIRY=true 时启用（默认禁用）
 * - 幂等安全：清零幂等键含活动+账户+资产，重复执行不会重复扣减
 *
 * 参考模板：jobs/ad-campaign-expiry-jobs.js（cron 自注册）+ jobs/daily-decoration-expiry.js（事务执行）
 */

const cron = require('node-cron')
const logger = require('../utils/logger').logger

const ENABLE_EVENT_BUDGET_EXPIRY = process.env.ENABLE_EVENT_BUDGET_EXPIRY === 'true'

if (!ENABLE_EVENT_BUDGET_EXPIRY) {
  logger.info(
    '[EventBudgetExpiryJob] 活动专属预算到期清零任务已禁用（设置 ENABLE_EVENT_BUDGET_EXPIRY=true 启用）'
  )
  module.exports = {}
} else {
  /**
   * 活动专属预算到期清零定时任务调度器
   */
  class EventBudgetExpiryJob {
    /**
     * 初始化定时任务（每天凌晨 1 点执行）
     * @returns {void} 无返回值
     */
    static init() {
      logger.info('[EventBudgetExpiryJob] 初始化活动专属预算到期清零任务')

      cron.schedule('0 1 * * *', async () => {
        await EventBudgetExpiryJob.runExpiryClear()
      })

      logger.info('[EventBudgetExpiryJob] 活动专属预算到期清零任务初始化完成（每天凌晨1点执行）')
    }

    /**
     * 执行到期清零任务
     *
     * 通过 EventBudgetService.clearExpiredEventBudgets 在单事务内完成：
     * 找到期活动 → 扫专属桶非零余额 → 双录清零（budget_points + event_points）
     *
     * @returns {Promise<Object>} 清零报告 { campaigns_processed, balances_cleared, total_cleared_amount, details }
     */
    static async runExpiryClear() {
      const startTime = Date.now()
      logger.info('[EventBudgetExpiryJob] 开始执行活动专属预算到期清零')

      try {
        const EventBudgetService = require('../services/lottery/EventBudgetService')
        const TransactionManager = require('../utils/TransactionManager')

        const report = await TransactionManager.execute(
          async transaction => {
            return EventBudgetService.clearExpiredEventBudgets({ transaction })
          },
          { description: 'daily_event_budget_expiry' }
        )

        const duration = Date.now() - startTime
        if (report.balances_cleared > 0) {
          logger.info('[EventBudgetExpiryJob] 活动专属预算到期清零完成', {
            campaigns_processed: report.campaigns_processed,
            balances_cleared: report.balances_cleared,
            total_cleared_amount: report.total_cleared_amount,
            details: report.details,
            duration_ms: duration
          })
        } else {
          logger.debug('[EventBudgetExpiryJob] 无到期活动专属预算需要清零', {
            duration_ms: duration
          })
        }
        return report
      } catch (error) {
        logger.error('[EventBudgetExpiryJob] 活动专属预算到期清零失败', {
          error: error.message,
          stack: error.stack,
          duration_ms: Date.now() - startTime
        })
        throw error
      }
    }
  }

  EventBudgetExpiryJob.init()
  module.exports = EventBudgetExpiryJob
}
