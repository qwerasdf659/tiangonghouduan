/**
 * 餐厅积分抽奖系统 V4.2 - 每小时清理未绑定媒体任务
 *
 * @description
 *   自动清理 media_files 中无 media_attachments 关联且超过 24 小时的孤立媒体
 *   同时删除 Sealos 对象存储文件和数据库记录
 *
 * @architecture 2026-03-16 媒体体系迁移
 *   - 使用 MediaService.cleanupOrphanedMedia 替代 ImageService.cleanupUnboundImages
 *   - 针对 media_files 表，无 media_attachments 关联视为孤立
 *   - 定时任务每小时执行一次（凌晨低峰期可能清理较多）
 *
 * 执行策略：
 *   - 定时执行：每小时（Cron: 30 * * * *，每小时第30分钟）
 *   - 清理条件：无 media_attachments 关联 AND status='active' AND created_at < (now - 24h)
 *   - 删除策略：物理删除（Sealos 对象 + media_files 记录）
 *
 * @version 2.0.0
 * @date 2026-03-16
 */

const logger = require('../utils/logger').logger

/**
 * 每小时清理未绑定媒体任务类
 *
 * @class HourlyCleanupUnboundMedia
 * @description 自动清理超时未绑定的孤立媒体资源（media_files）
 */
class HourlyCleanupUnboundMedia {
  /**
   * 执行清理任务
   *
   * @param {number} [hours=24] - 未绑定超过多少小时才清理
   * @returns {Promise<Object>} 清理报告
   * @returns {Object} report - 清理报告
   * @returns {number} report.cleaned_count - 清理的媒体数量
   * @returns {number} report.failed_count - 清理失败的数量
   * @returns {string} report.timestamp - 执行时间
   * @returns {number} report.duration_ms - 执行耗时(毫秒)
   * @returns {string} report.status - 执行状态（SUCCESS/ERROR）
   */
  static async execute(hours = 24) {
    const startTime = Date.now()
    logger.info('开始每小时清理未绑定媒体任务', { hours_threshold: hours })

    try {
      const MediaService = require('../services/MediaService')
      const SealosStorageService = require('../services/SealosStorageService')
      const mediaService = new MediaService({
        getService: name => {
          if (name === 'sealos_storage') return SealosStorageService
          return null
        }
      })

      const result = await mediaService.cleanupOrphanedMedia(hours)

      // 生成报告
      const duration_ms = Date.now() - startTime
      const report = {
        timestamp: new Date().toISOString(),
        cleaned_count: result.cleaned_count,
        failed_count: result.failed_count,
        total_found: result.total_found ?? result.cleaned_count + result.failed_count,
        duration_ms,
        status: 'SUCCESS'
      }

      // 输出报告
      this._outputReport(report)

      logger.info('每小时清理未绑定媒体任务完成', {
        cleaned_count: result.cleaned_count,
        failed_count: result.failed_count,
        duration_ms
      })

      return report
    } catch (error) {
      logger.error('每小时清理未绑定媒体任务失败', {
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

      // 即使失败也输出报告
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
    console.log('🖼️ 每小时清理未绑定媒体任务报告')
    console.log('='.repeat(80))
    console.log(`时间: ${report.timestamp}`)
    console.log(`耗时: ${report.duration_ms}ms`)
    console.log(`发现未绑定媒体数: ${report.total_found}`)
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
  // 加载环境变量
  require('dotenv').config()
  ;(async () => {
    try {
      // 支持命令行参数指定小时数，默认 24 小时
      const hours = parseInt(process.argv[2], 10) || 24
      console.log(`执行参数: hours=${hours}`)

      const report = await HourlyCleanupUnboundMedia.execute(hours)
      process.exit(report.status === 'SUCCESS' ? 0 : 1)
    } catch (error) {
      console.error('清理任务执行失败:', error)
      process.exit(1)
    }
  })()
}

module.exports = HourlyCleanupUnboundMedia
