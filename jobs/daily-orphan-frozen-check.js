/**
 * 餐厅积分抽奖系统 V4.2 - 每日孤儿冻结检测与清理任务
 *
 * 职责：
 * - 每日检测孤儿冻结（frozen_amount > 实际挂牌冻结总额）
 * - 自动清理孤儿冻结资产
 * - 发送告警通知给管理员
 * - 记录完整审计日志
 *
 * 执行策略：
 * - 定时执行：每天凌晨2点（已拍板）
 * - 使用分布式锁防止并发执行
 * - 支持 dryRun 模式（仅检测不修复）
 * - 自动解冻机制已确认符合业务合规要求
 *
 * 关联文档：
 * - P0-2: 测试连接真实库导致"孤儿冻结"仍可能再次出现
 * - docs/P0级问题聚焦清单-2026-01-09.md
 *
 * 创建时间：2026-01-09
 * 版本：V4.2.0
 */

'use strict'

const logger = require('../utils/logger').logger
const NotificationService = require('../services/NotificationService')
const { ServiceManager } = require('../services')

/**
 * 每日孤儿冻结检测与清理任务类
 *
 * @class DailyOrphanFrozenCheck
 * @description 检测并自动清理孤儿冻结资产（资产冻结但无对应挂牌）
 */
class DailyOrphanFrozenCheck {
  /**
   * 执行孤儿冻结检测与清理任务
   *
   * @param {Object} options - 执行选项
   * @param {boolean} [options.dryRun=false] - 是否为演练模式（仅检测不清理）
   * @param {boolean} [options.sendNotification=true] - 是否发送通知
   * @returns {Promise<Object>} 执行报告
   */
  static async execute(options = {}) {
    const { dryRun = false, sendNotification = true } = options
    const startTime = Date.now()

    logger.info('开始每日孤儿冻结检测任务', { dryRun })

    try {
      // 获取孤儿冻结清理服务
      const orphanFrozenService = ServiceManager.getService('orphanFrozenCleanup')

      if (!orphanFrozenService) {
        throw new Error('OrphanFrozenCleanupService 未注册到 ServiceManager')
      }

      // 1. 先检测孤儿冻结
      const detectResult = await orphanFrozenService.detectOrphanFrozen({
        limit: 1000 // 单次最多检测1000条
      })

      const report = {
        timestamp: new Date().toISOString(),
        dryRun,
        detection: {
          orphan_count: detectResult.orphan_count,
          total_orphan_amount: detectResult.total_orphan_amount,
          orphan_items: detectResult.orphan_items.slice(0, 10) // 只保留前10条详情
        },
        cleanup: null,
        duration_ms: 0,
        status: 'OK'
      }

      // 2. 如果检测到孤儿冻结，执行清理
      if (detectResult.orphan_count > 0) {
        logger.warn(`检测到 ${detectResult.orphan_count} 个孤儿冻结资产`, {
          total_amount: detectResult.total_orphan_amount
        })

        if (!dryRun) {
          // 执行实际清理
          const cleanupResult = await orphanFrozenService.cleanupOrphanFrozen({
            reason: '每日定时任务自动清理',
            operator_id: null, // 系统自动执行
            operator_name: 'SYSTEM_DAILY_JOB',
            dryRun: false,
            limit: 100 // 单次清理最多100条
          })

          report.cleanup = {
            cleaned_count: cleanupResult.cleaned_count,
            total_unfrozen_amount: cleanupResult.total_unfrozen_amount,
            failed_count: cleanupResult.failed_count,
            skipped_count: cleanupResult.skipped_count
          }

          report.status = cleanupResult.failed_count > 0 ? 'WARNING' : 'OK'

          logger.info('孤儿冻结清理完成', {
            cleaned_count: cleanupResult.cleaned_count,
            failed_count: cleanupResult.failed_count
          })
        } else {
          report.cleanup = {
            skipped: true,
            reason: 'dryRun模式，未执行实际清理'
          }
          report.status = 'WARNING'
        }
      } else {
        logger.info('未检测到孤儿冻结，系统状态良好')
      }

      // 3. 获取统计信息
      const stats = await orphanFrozenService.getOrphanFrozenStats()
      report.stats = stats

      report.duration_ms = Date.now() - startTime

      // 4. 输出报告
      this._outputReport(report)

      // 5. 发送通知（如果有孤儿冻结）
      if (sendNotification && detectResult.orphan_count > 0) {
        await this._sendNotification(report)
      }

      return report
    } catch (error) {
      logger.error('每日孤儿冻结检测任务失败', {
        error_message: error.message,
        error_stack: error.stack
      })

      // 发送错误通知
      if (sendNotification) {
        await this._sendErrorNotification(error)
      }

      throw error
    }
  }

  /**
   * 输出执行报告
   *
   * @param {Object} report - 执行报告
   * @returns {void}
   * @private
   */
  static _outputReport(report) {
    console.log('\n' + '='.repeat(80))
    console.log('📊 每日孤儿冻结检测报告')
    console.log('='.repeat(80))
    console.log(`时间: ${report.timestamp}`)
    console.log(`模式: ${report.dryRun ? '演练模式' : '正式执行'}`)
    console.log(`耗时: ${report.duration_ms}ms`)
    console.log(`状态: ${this._getStatusEmoji(report.status)} ${report.status}`)

    console.log('\n🔍 检测结果:')
    console.log(`   孤儿冻结数量: ${report.detection.orphan_count}`)
    console.log(`   孤儿冻结总额: ${report.detection.total_orphan_amount}`)

    if (report.detection.orphan_items.length > 0) {
      console.log('   孤儿冻结详情（前10条）:')
      report.detection.orphan_items.forEach((item, index) => {
        console.log(
          `     ${index + 1}. 账户${item.account_id} - ${item.asset_code}: 冻结${item.frozen_amount}, 实际挂牌${item.actual_frozen}`
        )
      })
    }

    if (report.cleanup) {
      console.log('\n🧹 清理结果:')
      if (report.cleanup.skipped) {
        console.log(`   跳过清理: ${report.cleanup.reason}`)
      } else {
        console.log(`   已清理数量: ${report.cleanup.cleaned_count}`)
        console.log(`   解冻总额: ${report.cleanup.total_unfrozen_amount}`)
        console.log(`   失败数量: ${report.cleanup.failed_count}`)
        console.log(`   跳过数量: ${report.cleanup.skipped_count}`)
      }
    }

    if (report.stats) {
      console.log('\n📈 系统统计:')
      console.log(`   总冻结账户数: ${report.stats.total_frozen_accounts}`)
      console.log(`   总冻结金额: ${report.stats.total_frozen_amount}`)
      console.log(`   活跃挂牌数: ${report.stats.active_listings_count}`)
    }

    console.log('\n' + '='.repeat(80))
  }

  /**
   * 获取状态Emoji
   *
   * @param {string} status - 状态
   * @returns {string} Emoji
   * @private
   */
  static _getStatusEmoji(status) {
    const emojiMap = {
      OK: '✅',
      WARNING: '⚠️',
      ERROR: '❌'
    }
    return emojiMap[status] || '❓'
  }

  /**
   * 发送孤儿冻结通知
   *
   * @param {Object} report - 执行报告
   * @returns {Promise<void>} 无返回值
   * @private
   */
  static async _sendNotification(report) {
    try {
      await NotificationService.sendToAdmins({
        type: 'orphan_frozen_alert',
        title: '孤儿冻结检测告警',
        content:
          `检测到${report.detection.orphan_count}个孤儿冻结资产，` +
          `总额${report.detection.total_orphan_amount}。` +
          (report.dryRun
            ? '（演练模式，未清理）'
            : `已清理${report.cleanup?.cleaned_count || 0}个`),
        data: {
          orphan_count: report.detection.orphan_count,
          total_orphan_amount: report.detection.total_orphan_amount,
          cleaned_count: report.cleanup?.cleaned_count || 0,
          dryRun: report.dryRun,
          timestamp: report.timestamp
        }
      })
      logger.info('孤儿冻结告警已发送给管理员')
    } catch (notifyError) {
      logger.error('发送孤儿冻结告警失败', { error: notifyError.message })
    }
  }

  /**
   * 发送错误通知
   *
   * @param {Error} error - 错误对象
   * @returns {Promise<void>} 无返回值
   * @private
   */
  static async _sendErrorNotification(error) {
    try {
      await NotificationService.sendToAdmins({
        type: 'orphan_frozen_error',
        title: '孤儿冻结检测任务失败',
        content: `每日孤儿冻结检测任务执行失败: ${error.message}`,
        data: {
          error_message: error.message,
          timestamp: new Date().toISOString()
        }
      })
      logger.info('孤儿冻结任务错误通知已发送')
    } catch (notifyError) {
      logger.error('发送错误通知失败', { error: notifyError.message })
    }
  }
}

// 直接执行（供定时任务调用或命令行执行）
if (require.main === module) {
  ;(async () => {
    try {
      // 解析命令行参数
      const args = process.argv.slice(2)
      const dryRun = args.includes('--dry-run') || args.includes('-d')
      const noNotify = args.includes('--no-notify') || args.includes('-n')

      if (args.includes('--help') || args.includes('-h')) {
        console.log('用法: node jobs/daily-orphan-frozen-check.js [options]')
        console.log('选项:')
        console.log('  --dry-run, -d     演练模式（仅检测不清理）')
        console.log('  --no-notify, -n   不发送通知')
        console.log('  --help, -h        显示帮助')
        process.exit(0)
      }

      console.log(`执行模式: ${dryRun ? '演练' : '正式'}`)
      console.log(`发送通知: ${noNotify ? '否' : '是'}`)

      const report = await DailyOrphanFrozenCheck.execute({
        dryRun,
        sendNotification: !noNotify
      })

      process.exit(report.status === 'OK' ? 0 : 1)
    } catch (error) {
      console.error('孤儿冻结检测任务执行失败:', error)
      process.exit(1)
    }
  })()
}

module.exports = DailyOrphanFrozenCheck
