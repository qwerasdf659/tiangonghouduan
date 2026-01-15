/**
 * 餐厅积分抽奖系统 V4.2 - 每日孤儿冻结检测与告警任务
 *
 * 职责：
 * - 每日检测孤儿冻结（frozen_amount > 实际挂牌冻结总额）
 * - 根据三维阈值（影响面 + 严重度 + 趋势）进行告警分级（P0/P1/P2）
 * - 发送分级告警通知给管理员
 * - P0 级别可触发止损（暂停挂单，不改余额）
 * - 生成处置建议（不自动清理，修复走人工）
 *
 * 执行策略：
 * - 定时执行：每天凌晨2点（已拍板）
 * - 使用分布式锁防止并发执行
 * - 只检测 + 告警，不自动清理（2026-01-15 决策）
 * - 支持复发检测（Redis 存储上次检测摘要）
 *
 * 🔴 P0 决策（2026-01-15）：
 * - Service 为权威契约（领域服务），Job 适配 Service
 * - detectOrphanFrozen() 返回稳定 DTO 对象
 * - Job 只做检测 + 告警 + 处置建议，修复走人工/后台受控工具
 *
 * 关联文档：
 * - docs/孤儿冻结检测任务生产问题排查与修复方案-2026-01-15.md
 *
 * 创建时间：2026-01-09
 * 最后更新：2026-01-15（P0 决策实施）
 * 版本：V4.3.0
 */

'use strict'

// 加载环境变量（命令行直接运行时需要）
require('dotenv').config()

const logger = require('../utils/logger').logger
const NotificationService = require('../services/NotificationService')
const serviceManager = require('../services')
const { getRawClient } = require('../utils/UnifiedRedisClient')

/**
 * 复发检测 Redis Key（用于判断连续 2 次调度都发现孤儿冻结）
 * TTL: 48 小时（足够覆盖"连续 2 次调度"判断）
 */
const LAST_RUN_REDIS_KEY = 'orphan_frozen:last_run'
const LAST_RUN_TTL_SECONDS = 48 * 60 * 60 // 48 小时

/**
 * 每日孤儿冻结检测与告警任务类
 *
 * @class DailyOrphanFrozenCheck
 * @description 检测孤儿冻结并发送分级告警（不自动清理）
 */
class DailyOrphanFrozenCheck {
  /**
   * 执行孤儿冻结检测与告警任务
   *
   * 🔴 P0 决策（2026-01-15）：
   * - 只检测 + 告警，不自动清理
   * - 根据三维阈值分级告警（P0/P1/P2）
   * - 生成处置建议供人工修复
   *
   * @param {Object} options - 执行选项
   * @param {boolean} [options.sendNotification=true] - 是否发送告警通知
   * @returns {Promise<Object>} 执行报告
   */
  static async execute(options = {}) {
    const { sendNotification = true } = options
    const startTime = Date.now()

    logger.info('开始每日孤儿冻结检测任务')

    try {
      // 获取孤儿冻结清理服务（通过 serviceManager 实例获取，snake_case key）
      const orphanFrozenService = serviceManager.getService('orphan_frozen_cleanup')

      if (!orphanFrozenService) {
        throw new Error('OrphanFrozenCleanupService 未注册到 ServiceManager')
      }

      // 1. 检测孤儿冻结（返回 DTO）
      const dto = await orphanFrozenService.detectOrphanFrozen({
        limit: 1000
      })

      // 2. 构建报告
      const report = {
        timestamp: new Date().toISOString(),
        detection: {
          orphan_count: dto.orphan_count,
          total_orphan_amount: dto.total_orphan_amount,
          affected_user_count: dto.affected_user_count,
          affected_asset_codes: dto.affected_asset_codes,
          orphan_items: dto.orphan_items.slice(0, 10), // 报告只取前 10 条
          items_truncated: dto.items_truncated,
          checked_count: dto.checked_count
        },
        alert_level: null, // 告警级别
        actions: [], // 建议动作
        is_recurring: false, // 是否复发
        duration_ms: 0,
        status: 'OK'
      }

      // 3. 告警分级（不自动清理）
      if (dto.orphan_count > 0) {
        // 3.1 检查是否复发
        report.is_recurring = await this._checkRecurring()

        // 3.2 判断告警级别
        report.alert_level = this._determineAlertLevel(dto, report.is_recurring)
        report.actions = this._generateActionSuggestions(dto, report.alert_level)
        report.status =
          report.alert_level === 'P0'
            ? 'CRITICAL'
            : report.alert_level === 'P1'
              ? 'WARNING'
              : 'INFO'

        logger.warn(`检测到孤儿冻结 [${report.alert_level}]`, {
          orphan_count: dto.orphan_count,
          total_orphan_amount: dto.total_orphan_amount,
          affected_users: dto.affected_user_count,
          affected_assets: dto.affected_asset_codes.length,
          is_recurring: report.is_recurring
        })

        // 3.3 P0 级别可选止损（暂停受影响资产的新挂单）
        report.stop_loss_executed = false
        if (report.alert_level === 'P0' && dto.affected_asset_codes.length > 0) {
          const stopLossResult = await this._executeStopLossIfEnabled(dto)
          report.stop_loss_executed = stopLossResult.executed
          report.stop_loss_details = stopLossResult
        }

        // 3.4 发送分级告警（不执行清理）
        if (sendNotification) {
          await this._sendAlertNotification(report)
        }

        // 3.5 保存本次检测摘要（用于下次复发检测）
        await this._saveLastRunSummary(dto)
      } else {
        logger.info('未检测到孤儿冻结，系统状态良好')
        // 清除上次检测摘要（无孤儿冻结时重置复发计数）
        await this._clearLastRunSummary()
      }

      report.duration_ms = Date.now() - startTime
      this._outputReport(report)

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
   * 判断告警级别
   *
   * 🔴 P0 决策（2026-01-15）：三维阈值
   *
   * P0（1小时内响应）：
   * - affected_asset_codes >= 3（多资产同时异常，强烈像系统 bug）
   * - 或 affected_users >= 5
   * - 或 orphan_items_count >= 20
   * - 或 连续 2 次调度都发现孤儿冻结（复发）
   *
   * P1（4小时内响应）：
   * - affected_asset_codes == 2
   * - 或 affected_users 2~4
   * - 或 orphan_items_count 5~19
   *
   * P2（24小时内响应）：
   * - affected_asset_codes == 1 且 affected_users == 1 且 orphan_items_count < 5
   *
   * @param {Object} dto - 检测结果 DTO
   * @param {boolean} isRecurring - 是否复发
   * @returns {string} 告警级别 ('P0' | 'P1' | 'P2')
   * @private
   */
  static _determineAlertLevel(dto, isRecurring = false) {
    const { orphan_count, affected_user_count, affected_asset_codes } = dto
    const assetCount = affected_asset_codes.length

    // P0 判定
    if (assetCount >= 3 || affected_user_count >= 5 || orphan_count >= 20 || isRecurring) {
      return 'P0'
    }

    // P1 判定
    if (
      assetCount === 2 ||
      (affected_user_count >= 2 && affected_user_count <= 4) ||
      (orphan_count >= 5 && orphan_count < 20)
    ) {
      return 'P1'
    }

    // P2（默认）
    return 'P2'
  }

  /**
   * 生成处置建议
   *
   * @param {Object} dto - 检测结果 DTO
   * @param {string} alertLevel - 告警级别
   * @returns {Array<string>} 处置建议列表
   * @private
   */
  static _generateActionSuggestions(dto, alertLevel) {
    const actions = []

    switch (alertLevel) {
      case 'P0':
        actions.push('⚠️ 立刻通知值班人员（1小时内响应）')
        actions.push('🔍 检查是否存在系统级 bug（多资产同时异常）')
        actions.push('📋 登录后台执行人工修复：控制台 > 孤儿冻结管理')
        if (dto.affected_asset_codes.length > 0) {
          actions.push(`🔒 建议暂停相关资产的新挂单：${dto.affected_asset_codes.join(', ')}`)
        }
        break
      case 'P1':
        actions.push('⚠️ 请在 4 小时内处理')
        actions.push('📋 登录后台查看处理清单：控制台 > 孤儿冻结管理')
        break
      case 'P2':
        actions.push('📋 可合并至日报处理（24小时内）')
        break
      default:
        break
    }

    return actions
  }

  /**
   * P0 级别可选止损：暂停受影响资产的新挂单
   *
   * 业务场景：
   * - P0 级别异常时可自动暂停受影响资产的新挂单
   * - 通过环境变量 ORPHAN_FROZEN_STOP_LOSS_ENABLED 控制开关
   * - 默认关闭（false），需显式开启
   *
   * @param {Object} dto - 检测结果 DTO
   * @returns {Promise<Object>} 止损执行结果
   * @private
   */
  static async _executeStopLossIfEnabled(dto) {
    const result = {
      executed: false,
      enabled: false,
      paused_assets: [],
      failed_assets: [],
      reason: null
    }

    // 检查止损开关是否启用
    const stopLossEnabled = process.env.ORPHAN_FROZEN_STOP_LOSS_ENABLED === 'true'
    result.enabled = stopLossEnabled

    if (!stopLossEnabled) {
      result.reason = 'STOP_LOSS_DISABLED'
      logger.info('[孤儿冻结止损] 止损功能未启用（设置 ORPHAN_FROZEN_STOP_LOSS_ENABLED=true 开启）')
      return result
    }

    // 获取止损时长配置（默认24小时）
    const stopLossDuration = parseInt(
      process.env.ORPHAN_FROZEN_STOP_LOSS_DURATION_HOURS || '24',
      10
    )

    try {
      const MarketListingService = require('../services/MarketListingService')

      // 并行执行所有资产的止损操作
      const stopLossPromises = dto.affected_asset_codes.map(assetCode =>
        MarketListingService.pauseListingForAsset(assetCode, {
          reason: `孤儿冻结P0止损：检测到${dto.orphan_count}条孤儿冻结，总额${dto.total_orphan_amount}`,
          duration_hours: stopLossDuration,
          operator_id: parseInt(process.env.SYSTEM_DAILY_JOB_USER_ID || '0', 10)
        })
          .then(() => ({ status: 'fulfilled', asset_code: assetCode }))
          .catch(error => ({ status: 'rejected', asset_code: assetCode, error: error.message }))
      )

      const stopLossResults = await Promise.all(stopLossPromises)

      // 分类成功和失败的资产
      for (const stopLossResult of stopLossResults) {
        if (stopLossResult.status === 'fulfilled') {
          result.paused_assets.push(stopLossResult.asset_code)
          logger.warn(`[孤儿冻结止损] 已暂停资产 ${stopLossResult.asset_code} 的新挂单`, {
            asset_code: stopLossResult.asset_code,
            duration_hours: stopLossDuration
          })
        } else {
          result.failed_assets.push({
            asset_code: stopLossResult.asset_code,
            error: stopLossResult.error
          })
          logger.error(`[孤儿冻结止损] 暂停资产 ${stopLossResult.asset_code} 失败`, {
            error: stopLossResult.error
          })
        }
      }

      result.executed = result.paused_assets.length > 0
      result.reason = result.executed ? 'STOP_LOSS_EXECUTED' : 'ALL_ASSETS_FAILED'

      logger.info('[孤儿冻结止损] 止损执行完成', {
        paused_count: result.paused_assets.length,
        failed_count: result.failed_assets.length
      })

      return result
    } catch (error) {
      result.reason = 'STOP_LOSS_ERROR'
      result.error = error.message
      logger.error('[孤儿冻结止损] 止损执行异常', { error: error.message })
      return result
    }
  }

  /**
   * 检查是否复发（连续 2 次调度都发现孤儿冻结）
   *
   * @returns {Promise<boolean>} 是否复发
   * @private
   */
  static async _checkRecurring() {
    try {
      const redis = getRawClient()
      const lastRunData = await redis.get(LAST_RUN_REDIS_KEY)

      if (lastRunData) {
        const lastRun = JSON.parse(lastRunData)
        // 上次也检测到孤儿冻结 = 复发
        if (lastRun.orphan_count > 0) {
          logger.warn('[孤儿冻结检测] 检测到复发（连续2次发现孤儿冻结）', {
            last_run_at: lastRun.generated_at,
            last_orphan_count: lastRun.orphan_count
          })
          return true
        }
      }
      return false
    } catch (error) {
      logger.error('[孤儿冻结检测] 检查复发状态失败', { error: error.message })
      return false
    }
  }

  /**
   * 保存本次检测摘要（用于下次复发检测）
   *
   * @param {Object} dto - 检测结果 DTO
   * @returns {Promise<void>} 无返回值
   * @private
   */
  static async _saveLastRunSummary(dto) {
    try {
      const redis = getRawClient()
      const summary = {
        generated_at: dto.generated_at,
        orphan_count: dto.orphan_count,
        affected_user_count: dto.affected_user_count,
        affected_asset_codes: dto.affected_asset_codes,
        total_orphan_amount: dto.total_orphan_amount
      }
      await redis.setex(LAST_RUN_REDIS_KEY, LAST_RUN_TTL_SECONDS, JSON.stringify(summary))
      logger.info('[孤儿冻结检测] 保存检测摘要成功', { ttl_hours: LAST_RUN_TTL_SECONDS / 3600 })
    } catch (error) {
      logger.error('[孤儿冻结检测] 保存检测摘要失败', { error: error.message })
    }
  }

  /**
   * 清除上次检测摘要（无孤儿冻结时重置）
   *
   * @returns {Promise<void>} 无返回值
   * @private
   */
  static async _clearLastRunSummary() {
    try {
      const redis = getRawClient()
      await redis.del(LAST_RUN_REDIS_KEY)
      logger.info('[孤儿冻结检测] 清除检测摘要（系统状态正常）')
    } catch (error) {
      logger.error('[孤儿冻结检测] 清除检测摘要失败', { error: error.message })
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
    console.log(`耗时: ${report.duration_ms}ms`)
    console.log(`状态: ${this._getStatusEmoji(report.status)} ${report.status}`)

    if (report.alert_level) {
      console.log(`告警级别: ${this._getAlertLevelEmoji(report.alert_level)} ${report.alert_level}`)
      console.log(`复发: ${report.is_recurring ? '是（连续2次）' : '否'}`)
    }

    console.log('\n🔍 检测结果:')
    console.log(`   检测账户数: ${report.detection.checked_count}`)
    console.log(`   孤儿冻结数量: ${report.detection.orphan_count}`)
    console.log(`   孤儿冻结总额: ${report.detection.total_orphan_amount}`)
    console.log(`   受影响用户数: ${report.detection.affected_user_count}`)
    console.log(`   受影响资产种类: ${report.detection.affected_asset_codes.length}`)

    if (report.detection.affected_asset_codes.length > 0) {
      console.log(`   受影响资产: ${report.detection.affected_asset_codes.join(', ')}`)
    }

    if (report.detection.orphan_items.length > 0) {
      console.log('\n   孤儿冻结详情（前10条）:')
      report.detection.orphan_items.forEach((item, index) => {
        console.log(
          `     ${index + 1}. 用户${item.user_id} - ${item.asset_code}: 冻结${item.frozen_amount}, 挂牌${item.listed_amount}, 孤儿额${item.orphan_amount}`
        )
      })
      if (report.detection.items_truncated) {
        console.log('     ... (更多详情已截断)')
      }
    }

    // 显示止损信息
    if (report.stop_loss_details) {
      console.log('\n🔒 止损状态:')
      if (report.stop_loss_executed) {
        console.log('   已执行止损: ✅')
        console.log(`   暂停资产: ${report.stop_loss_details.paused_assets.join(', ')}`)
        if (report.stop_loss_details.failed_assets.length > 0) {
          console.log(
            `   失败资产: ${report.stop_loss_details.failed_assets.map(f => f.asset_code).join(', ')}`
          )
        }
      } else {
        console.log('   已执行止损: ❌')
        console.log(`   原因: ${report.stop_loss_details.reason}`)
        if (!report.stop_loss_details.enabled) {
          console.log('   提示: 设置 ORPHAN_FROZEN_STOP_LOSS_ENABLED=true 启用止损')
        }
      }
    }

    if (report.actions.length > 0) {
      console.log('\n🔧 处置建议:')
      report.actions.forEach((action, index) => {
        console.log(`   ${index + 1}. ${action}`)
      })
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
      INFO: 'ℹ️',
      WARNING: '⚠️',
      CRITICAL: '🔴',
      ERROR: '❌'
    }
    return emojiMap[status] || '❓'
  }

  /**
   * 获取告警级别Emoji
   *
   * @param {string} level - 告警级别
   * @returns {string} Emoji
   * @private
   */
  static _getAlertLevelEmoji(level) {
    const emojiMap = {
      P0: '🔴',
      P1: '🟠',
      P2: '🟡'
    }
    return emojiMap[level] || '❓'
  }

  /**
   * 发送分级告警通知
   *
   * @param {Object} report - 执行报告
   * @returns {Promise<void>} 无返回值
   * @private
   */
  static async _sendAlertNotification(report) {
    try {
      const alertLevel = report.alert_level
      const responseTimeMap = { P0: '1小时内', P1: '4小时内', P2: '24小时内' }

      // 构建止损信息（如果有）
      let stopLossInfo = ''
      if (report.stop_loss_details) {
        if (report.stop_loss_executed) {
          stopLossInfo = `\n🔒 已自动止损: 暂停 ${report.stop_loss_details.paused_assets.join(', ')} 的新挂单`
          if (report.stop_loss_details.failed_assets.length > 0) {
            stopLossInfo += `\n⚠️ 止损失败资产: ${report.stop_loss_details.failed_assets.map(f => f.asset_code).join(', ')}`
          }
        } else if (report.stop_loss_details.enabled === false) {
          stopLossInfo =
            '\n💡 提示: 止损功能未启用（设置 ORPHAN_FROZEN_STOP_LOSS_ENABLED=true 开启）'
        }
      }

      await NotificationService.sendToAdmins({
        type: 'orphan_frozen_alert',
        title: `[${alertLevel}] 孤儿冻结检测告警`,
        content:
          `检测到 ${report.detection.orphan_count} 个孤儿冻结资产，` +
          `总额 ${report.detection.total_orphan_amount}。\n\n` +
          `告警级别: ${alertLevel}（${responseTimeMap[alertLevel]}响应）\n` +
          `受影响用户: ${report.detection.affected_user_count} 人\n` +
          `受影响资产: ${report.detection.affected_asset_codes.join(', ') || '无'}\n` +
          `复发: ${report.is_recurring ? '是（连续2次）' : '否'}` +
          stopLossInfo +
          `\n\n处置建议:\n${report.actions.map((a, i) => `${i + 1}. ${a}`).join('\n')}\n\n` +
          '请登录后台处理: 控制台 > 孤儿冻结管理',
        data: {
          alert_level: alertLevel,
          orphan_count: report.detection.orphan_count,
          total_orphan_amount: report.detection.total_orphan_amount,
          affected_user_count: report.detection.affected_user_count,
          affected_asset_codes: report.detection.affected_asset_codes,
          is_recurring: report.is_recurring,
          stop_loss_executed: report.stop_loss_executed || false,
          stop_loss_details: report.stop_loss_details || null,
          actions: report.actions,
          timestamp: report.timestamp
        }
      })
      logger.info(`孤儿冻结 [${alertLevel}] 告警已发送给管理员`)
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
      // 错误类型分析
      let errorType = 'UNKNOWN_ERROR'
      let suggestion = '请检查应用日志获取详细信息'

      if (error.message.includes('服务管理器尚未初始化')) {
        errorType = 'SERVICE_NOT_INITIALIZED'
        suggestion = '请检查应用启动日志，确认服务初始化是否成功'
      } else if (error.message.includes('operator_id')) {
        errorType = 'MISSING_OPERATOR_ID'
        suggestion = '请在 .env 中配置 SYSTEM_DAILY_JOB_USER_ID'
      } else if (error.message.includes('Failed to acquire lock')) {
        errorType = 'LOCK_ACQUISITION_FAILED'
        suggestion = '其他实例正在执行，本次跳过'
      } else if (error.message.includes('ECONNREFUSED') || error.message.includes('ETIMEDOUT')) {
        errorType = 'DATABASE_CONNECTION_ERROR'
        suggestion = '请检查数据库服务状态和网络连接'
      }

      await NotificationService.sendToAdmins({
        type: 'orphan_frozen_error',
        title: '[ERROR] 孤儿冻结检测任务失败',
        content:
          '每日孤儿冻结检测任务执行失败\n\n' +
          `错误类型: ${errorType}\n` +
          `错误信息: ${error.message}\n\n` +
          `建议: ${suggestion}`,
        data: {
          error_type: errorType,
          error_message: error.message,
          suggestion,
          timestamp: new Date().toISOString()
        }
      })
      logger.info('孤儿冻结任务错误通知已发送', { error_type: errorType })
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
      const noNotify = args.includes('--no-notify') || args.includes('-n')

      if (args.includes('--help') || args.includes('-h')) {
        console.log('用法: node jobs/daily-orphan-frozen-check.js [options]')
        console.log('选项:')
        console.log('  --no-notify, -n   不发送通知')
        console.log('  --help, -h        显示帮助')
        console.log('')
        console.log('说明:')
        console.log('  此任务只做检测和告警，不自动清理。')
        console.log('  修复操作请通过后台管理界面执行。')
        process.exit(0)
      }

      // 初始化服务管理器
      await serviceManager.initialize()

      console.log(`发送通知: ${noNotify ? '否' : '是'}`)

      const report = await DailyOrphanFrozenCheck.execute({
        sendNotification: !noNotify
      })

      process.exit(report.status === 'OK' || report.status === 'INFO' ? 0 : 1)
    } catch (error) {
      console.error('孤儿冻结检测任务执行失败:', error)
      process.exit(1)
    }
  })()
}

module.exports = DailyOrphanFrozenCheck
