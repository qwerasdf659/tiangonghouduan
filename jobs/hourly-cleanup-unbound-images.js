/**
 * 餐厅积分抽奖系统 V4.2 - 每小时清理未绑定图片任务
 *
 * @description
 *   自动清理 context_id=0 且超过 24 小时未绑定的孤立图片资源
 *   同时删除 Sealos 对象存储文件和数据库记录
 *
 * @architecture 架构决策（2026-01-08 最终拍板）
 *   - context_id=0 表示图片已上传但未绑定到任何业务实体
 *   - 超过 24 小时未绑定视为孤立资源，应自动清理
 *   - 定时任务每小时执行一次（凌晨低峰期可能清理较多）
 *
 * 执行策略：
 *   - 定时执行：每小时（Cron: 30 * * * *，每小时第30分钟）
 *   - 清理条件：context_id=0 AND status='active' AND created_at < (now - 24h)
 *   - 删除策略：物理删除（Sealos 对象 + 数据库记录）
 *
 * @version 1.0.0
 * @date 2026-01-08
 */

const logger = require('../utils/logger').logger

/**
 * 每小时清理未绑定图片任务类
 *
 * @class HourlyCleanupUnboundImages
 * @description 自动清理超时未绑定的孤立图片资源
 */
class HourlyCleanupUnboundImages {
  /**
   * 执行清理任务
   *
   * @param {number} [hours=24] - 未绑定超过多少小时才清理
   * @returns {Promise<Object>} 清理报告
   * @returns {Object} report - 清理报告
   * @returns {number} report.cleaned_count - 清理的图片数量
   * @returns {number} report.failed_count - 清理失败的数量
   * @returns {string} report.timestamp - 执行时间
   * @returns {number} report.duration_ms - 执行耗时(毫秒)
   * @returns {string} report.status - 执行状态（SUCCESS/ERROR）
   */
  static async execute(hours = 24) {
    const startTime = Date.now()
    logger.info('开始每小时清理未绑定图片任务', { hours_threshold: hours })

    try {
      // 动态导入 ImageService，避免循环依赖
      const ImageService = require('../services/ImageService')

      // 调用服务层方法执行清理
      const result = await ImageService.cleanupUnboundImages(hours)

      // 生成报告
      const duration_ms = Date.now() - startTime
      const report = {
        timestamp: new Date().toISOString(),
        cleaned_count: result.cleaned_count,
        failed_count: result.failed_count,
        total_found: result.total_found || result.cleaned_count + result.failed_count,
        duration_ms,
        status: 'SUCCESS'
      }

      // 输出报告
      this._outputReport(report)

      logger.info('每小时清理未绑定图片任务完成', {
        cleaned_count: result.cleaned_count,
        failed_count: result.failed_count,
        duration_ms
      })

      return report
    } catch (error) {
      logger.error('每小时清理未绑定图片任务失败', {
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
    console.log('🖼️ 每小时清理未绑定图片任务报告')
    console.log('='.repeat(80))
    console.log(`时间: ${report.timestamp}`)
    console.log(`耗时: ${report.duration_ms}ms`)
    console.log(`发现未绑定图片数: ${report.total_found}`)
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

      const report = await HourlyCleanupUnboundImages.execute(hours)
      process.exit(report.status === 'SUCCESS' ? 0 : 1)
    } catch (error) {
      console.error('清理任务执行失败:', error)
      process.exit(1)
    }
  })()
}

module.exports = HourlyCleanupUnboundImages
