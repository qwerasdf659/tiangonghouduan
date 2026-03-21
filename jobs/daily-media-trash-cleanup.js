/**
 * 每日媒体回收站自动清理任务
 *
 * @description
 *   自动物理删除 media_files 中 status='trashed' 且 trashed_at 超过 7 天的记录
 *   同时删除 Sealos 对象存储文件（主文件 + 缩略图）和数据库记录
 *
 * @architecture 2026-03-18 媒体回收站自动清理
 *   - 使用 MediaService.cleanup(olderThanDays) 执行物理清理
 *   - 定时执行：每天凌晨 3:00（Cron: 0 3 * * *）
 *   - 清理条件：status='trashed' AND trashed_at < (now - 7天)
 *   - 删除策略：物理删除（Sealos 对象 + media_files 记录）
 *
 * @version 1.0.0
 * @date 2026-03-18
 */

const logger = require('../utils/logger').logger

/**
 * 每日媒体回收站自动清理任务类
 *
 * @class DailyMediaTrashCleanup
 * @description 自动物理清理回收站中超过保留期的媒体文件
 */
class DailyMediaTrashCleanup {
  /**
   * 执行回收站清理任务
   *
   * @param {number} [days=7] - 回收站保留天数，超过此天数的记录将被物理删除
   * @returns {Promise<Object>} 清理报告
   * @returns {number} report.cleaned_count - 清理成功的媒体数量
   * @returns {number} report.failed_count - 清理失败的数量
   * @returns {number} report.total_found - 发现的过期回收站记录总数
   * @returns {string} report.timestamp - 执行时间
   * @returns {number} report.duration_ms - 执行耗时(毫秒)
   * @returns {string} report.status - 执行状态（SUCCESS/ERROR）
   */
  static async execute(days = 7) {
    const startTime = Date.now()
    logger.info('[回收站清理] 开始每日媒体回收站自动清理', { retention_days: days })

    try {
      const MediaService = require('../services/MediaService')
      const SealosStorageService = require('../services/SealosStorageService')
      const mediaService = new MediaService({
        getService: name => {
          if (name === 'sealos_storage') return SealosStorageService
          return null
        }
      })

      const result = await mediaService.cleanup(days)

      const duration_ms = Date.now() - startTime
      const report = {
        timestamp: new Date().toISOString(),
        cleaned_count: result.cleaned_count,
        failed_count: result.failed_count,
        total_found: result.total_found,
        duration_ms,
        status: 'SUCCESS'
      }

      this._outputReport(report)

      logger.info('[回收站清理] 每日媒体回收站自动清理完成', {
        cleaned_count: result.cleaned_count,
        failed_count: result.failed_count,
        total_found: result.total_found,
        duration_ms
      })

      return report
    } catch (error) {
      logger.error('[回收站清理] 每日媒体回收站自动清理失败', {
        error_message: error.message,
        error_stack: error.stack
      })

      const report = {
        timestamp: new Date().toISOString(),
        cleaned_count: 0,
        failed_count: 0,
        total_found: 0,
        duration_ms: Date.now() - startTime,
        status: 'ERROR',
        error: error.message
      }

      this._outputReport(report)
      throw error
    }
  }

  /**
   * 输出清理报告
   *
   * @param {Object} report - 清理报告
   * @returns {void}
   * @private
   */
  static _outputReport(report) {
    console.log('\n' + '='.repeat(80))
    console.log('🗑️ 每日媒体回收站自动清理报告')
    console.log('='.repeat(80))
    console.log(`时间: ${report.timestamp}`)
    console.log(`耗时: ${report.duration_ms}ms`)
    console.log(`发现过期回收站记录数: ${report.total_found}`)
    console.log(`清理成功数: ${report.cleaned_count}`)
    console.log(`清理失败数: ${report.failed_count}`)
    console.log(`状态: ${report.status === 'SUCCESS' ? '✅ SUCCESS' : '❌ ERROR'}`)

    if (report.error) {
      console.log(`错误: ${report.error}`)
    }

    console.log('='.repeat(80) + '\n')
  }
}

// 支持直接执行（供命令行或测试调用）
if (require.main === module) {
  require('dotenv').config()
  ;(async () => {
    try {
      const days = parseInt(process.argv[2], 10) || 7
      console.log(`执行参数: days=${days}`)

      const report = await DailyMediaTrashCleanup.execute(days)
      process.exit(report.status === 'SUCCESS' ? 0 : 1)
    } catch (error) {
      console.error('回收站清理任务执行失败:', error)
      process.exit(1)
    }
  })()
}

module.exports = DailyMediaTrashCleanup
