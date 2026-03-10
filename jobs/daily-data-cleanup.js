'use strict'

/**
 * 数据自动清理定时任务
 *
 * 每日凌晨 3:10（北京时间）执行 L3 级别表的自动清理
 * 读取 system_configs.data_cleanup_policies 策略配置，按保留天数分批删除过期数据
 *
 * 环境变量控制：
 * - ENABLE_DATA_CLEANUP=true 时启用（默认禁用）
 *
 * @see docs/数据一键删除功能设计方案.md 第八节（定时清理 Job）
 * @module jobs/daily-data-cleanup
 */

const cron = require('node-cron')
const logger = require('../utils/logger').logger

const ENABLE_DATA_CLEANUP = process.env.ENABLE_DATA_CLEANUP === 'true'

if (!ENABLE_DATA_CLEANUP) {
  logger.info('[DataCleanup] 数据自动清理定时任务已禁用（设置 ENABLE_DATA_CLEANUP=true 启用）')
  module.exports = {}
} else {
  /**
   * 数据自动清理定时任务
   * 每日凌晨 3:10 执行（错开 3:00 的通知清理任务）
   */
  class DataCleanupJob {
    /**
     * 初始化定时任务
     * @returns {void}
     */
    static init() {
      logger.info('[DataCleanup] 初始化数据自动清理定时任务')

      cron.schedule('10 3 * * *', async () => {
        await DataCleanupJob.run()
      })

      logger.info('[DataCleanup] 定时任务已注册（每日 03:10 执行）')
    }

    /**
     * 执行自动清理逻辑
     *
     * 通过 ServiceManager 获取 DataManagementService，调用 runAutoCleanup()
     * 如果 ServiceManager 未就绪，则延迟加载 DataManagementService
     *
     * @returns {Promise<void>}
     */
    static async run() {
      const startTime = Date.now()
      logger.info('[DataCleanup] 开始执行数据自动清理')

      try {
        const DataManagementService = require('../services/DataManagementService')
        const models = require('../models')
        const service = new DataManagementService(models)

        const result = await service.runAutoCleanup(300)

        const elapsed = Date.now() - startTime
        logger.info('[DataCleanup] 数据自动清理完成', {
          total_deleted: result.total_deleted,
          duration_ms: elapsed,
          tables_processed: result.results?.length || 0
        })
      } catch (error) {
        logger.error('[DataCleanup] 数据自动清理失败', {
          error: error.message,
          stack: error.stack
        })
      }
    }
  }

  DataCleanupJob.init()
  module.exports = DataCleanupJob
}
