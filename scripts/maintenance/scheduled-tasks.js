/**
 * 定时任务配置
 *
 * 使用node-cron实现定时任务调度
 *
 * 功能：
 * 1. 超时订单告警（每小时检查）
 * 2. 数据一致性检查（每天凌晨3点）
 * 3. 抽奖管理设置过期清理（每小时检查）
 * 4. 抽奖管理缓存自动清理（每30秒）
 * 5. 数据库性能监控（每5分钟）- 2025-11-09新增
 * 6. 抽奖奖品每日中奖次数重置（每天凌晨0点）- 2025-12-11新增
 * 7. 抽奖活动状态同步（每小时检查）- 2025-12-11新增
 *
 * 创建时间：2025-10-10
 * 更新时间：2025-12-11（新增抽奖相关定时任务，符合架构重构任务2.1）
 */

const cron = require('node-cron')
// 服务重命名（2025-10-12）：AuditManagementService → ExchangeOperationService
const ExchangeOperationService = require('../../services/ExchangeOperationService')
const ManagementStrategy = require('../../services/UnifiedLotteryEngine/strategies/ManagementStrategy')
const AdminLotteryService = require('../../services/AdminLotteryService')
const logger = require('../../utils/logger')
const { UserPremiumStatus, sequelize } = require('../../models')
const { Op } = sequelize.Sequelize
const NotificationService = require('../../services/NotificationService')
const BeijingTimeHelper = require('../../utils/timeHelper')
// 2025-11-09新增：数据库性能监控
const { monitor: databaseMonitor } = require('./database-performance-monitor')

/**
 * 定时任务管理类
 *
 * @class ScheduledTasks
 * @description 负责管理所有定时任务的调度和执行
 */
class ScheduledTasks {
  /**
   * 初始化所有定时任务
   * @returns {void}
   */
  static initialize () {
    logger.info('开始初始化定时任务...')

    // 任务1: 每小时检查超时订单（24小时）
    this.scheduleTimeoutCheck()

    // 任务2: 每天检查超时订单（72小时，紧急告警）
    this.scheduleUrgentTimeoutCheck()

    // 任务3: 每天凌晨3点执行数据一致性检查
    this.scheduleDataConsistencyCheck()

    // 任务4: 每小时清理过期的抽奖管理设置（2025-11-08新增）
    this.scheduleLotteryManagementCleanup()

    // 任务5: 每小时检查即将过期的高级空间（2025-11-09新增）
    this.schedulePremiumExpiryReminder()

    // 任务6: 每天凌晨清理过期的高级空间状态（2025-11-09新增）
    this.schedulePremiumStatusCleanup()

    // 任务7: 每5分钟执行数据库性能监控（2025-11-09新增）
    this.scheduleDatabasePerformanceMonitor()

    // 任务8: 每天凌晨0点重置抽奖奖品每日中奖次数（2025-12-11新增）
    this.scheduleLotteryPrizesDailyReset()

    // 任务9: 每小时同步抽奖活动状态（2025-12-11新增）
    this.scheduleLotteryCampaignStatusSync()

    logger.info('所有定时任务已初始化完成')
  }

  /**
   * 定时任务1: 每小时检查超过24小时的待审核订单
   * Cron表达式: 0 * * * * (每小时的0分)
   * @returns {void}
   */
  static scheduleTimeoutCheck () {
    cron.schedule('0 * * * *', async () => {
      try {
        logger.info('[定时任务] 开始执行24小时超时订单检查...')
        const result = await ExchangeOperationService.checkTimeoutAndAlert(24)

        if (result.hasTimeout) {
          logger.warn(`[定时任务] 发现${result.count}个超时订单（24小时）`)
        } else {
          logger.info('[定时任务] 24小时超时订单检查完成，无超时订单')
        }
      } catch (error) {
        logger.error('[定时任务] 24小时超时订单检查失败', { error: error.message })
      }
    })

    logger.info('✅ 定时任务已设置: 24小时超时订单检查（每小时执行）')
  }

  /**
   * 定时任务2: 每天9点和18点检查超过72小时的待审核订单（紧急告警）
   * Cron表达式: 0 9,18 * * * (每天9点和18点)
   * @returns {void}
   */
  static scheduleUrgentTimeoutCheck () {
    cron.schedule('0 9,18 * * *', async () => {
      try {
        logger.info('[定时任务] 开始执行72小时紧急超时订单检查...')
        const result = await ExchangeOperationService.checkTimeoutAndAlert(72)

        if (result.hasTimeout) {
          logger.error(`[定时任务] 🚨 发现${result.count}个紧急超时订单（72小时）`)
          // TODO: 发送紧急通知给管理员
        } else {
          logger.info('[定时任务] 72小时超时订单检查完成，无超时订单')
        }
      } catch (error) {
        logger.error('[定时任务] 72小时超时订单检查失败', { error: error.message })
      }
    })

    logger.info('✅ 定时任务已设置: 72小时紧急超时订单检查（每天9点和18点执行）')
  }

  /**
   * 定时任务3: 每天凌晨3点执行数据一致性检查
   * Cron表达式: 0 3 * * * (每天凌晨3点)
   * @returns {void}
   */
  static scheduleDataConsistencyCheck () {
    cron.schedule('0 3 * * *', async () => {
      try {
        logger.info('[定时任务] 开始执行每日数据一致性检查...')

        // 执行完整的数据一致性检查（包括自动修复）
        const DataConsistencyChecker = require('../archived/data-consistency-check')
        const results = await DataConsistencyChecker.performFullCheck()

        logger.info('[定时任务] 数据一致性检查完成', {
          total_checks: results.checks.length,
          total_fixes: results.fixes.length,
          total_errors: results.errors.length
        })

        // 获取待审核订单统计
        const statistics = await ExchangeOperationService.getPendingOrdersStatistics()

        logger.info('[定时任务] 待审核订单统计', {
          total: statistics.total,
          within24h: statistics.within24h,
          over24h: statistics.over24h,
          over72h: statistics.over72h
        })

        // 如果有大量超时订单，发送告警
        if (statistics.over24h > 10) {
          logger.warn('[定时任务] ⚠️ 待审核订单积压', {
            over24h: statistics.over24h,
            message: '超过24小时的待审核订单数量较多，请及时处理'
          })
        }

        if (statistics.over72h > 5) {
          logger.error('[定时任务] 🚨 待审核订单严重积压', {
            over72h: statistics.over72h,
            message: '超过72小时的待审核订单数量较多，需要紧急处理'
          })
        }

        logger.info('[定时任务] 每日数据一致性检查完成')
      } catch (error) {
        logger.error('[定时任务] 每日数据一致性检查失败', { error: error.message })
      }
    })

    logger.info('✅ 定时任务已设置: 每日数据一致性检查（每天凌晨3点执行）')
  }

  /**
   * 手动触发24小时超时检查（用于测试）
   * @returns {Promise<Object>} 检查结果对象
   */
  static async manualTimeoutCheck () {
    logger.info('[手动触发] 执行24小时超时订单检查...')
    try {
      const result = await ExchangeOperationService.checkTimeoutAndAlert(24)
      logger.info('[手动触发] 检查完成', { result })
      return result
    } catch (error) {
      logger.error('[手动触发] 检查失败', { error: error.message })
      throw error
    }
  }

  /**
   * 手动触发72小时紧急超时检查（用于测试）
   * @returns {Promise<Object>} 检查结果对象
   */
  static async manualUrgentTimeoutCheck () {
    logger.info('[手动触发] 执行72小时紧急超时订单检查...')
    try {
      const result = await ExchangeOperationService.checkTimeoutAndAlert(72)
      logger.info('[手动触发] 检查完成', { result })
      return result
    } catch (error) {
      logger.error('[手动触发] 检查失败', { error: error.message })
      throw error
    }
  }

  /**
   * 定时任务4: 每小时清理过期的抽奖管理设置
   * Cron表达式: 0 * * * * (每小时的0分)
   *
   * 业务场景：自动清理数据库中已过期的active状态管理设置，释放存储空间
   *
   * 功能：
   * 1. 查询所有过期的active状态设置（expires_at < 当前时间）
   * 2. 批量更新状态为expired
   * 3. 清除相关的内存缓存
   * 4. 记录清理日志
   *
   * 创建时间：2025-11-08
   * @returns {void}
   */
  static scheduleLotteryManagementCleanup () {
    cron.schedule('0 * * * *', async () => {
      try {
        logger.info('[定时任务] 开始清理过期的抽奖管理设置...')

        // 创建ManagementStrategy实例并执行清理
        const managementStrategy = new ManagementStrategy()
        const result = await managementStrategy.cleanupExpiredSettings()

        if (result.cleaned_count > 0) {
          logger.info(`[定时任务] 清理完成：${result.cleaned_count}个过期设置已更新为expired状态`)
        } else {
          logger.info('[定时任务] 清理完成：无过期设置需要清理')
        }
      } catch (error) {
        logger.error('[定时任务] 抽奖管理设置清理失败', { error: error.message })
      }
    })

    logger.info('✅ 定时任务已设置: 抽奖管理设置过期清理（每小时执行）')
  }

  /**
   * 手动触发抽奖管理设置清理（用于测试）
   *
   * 业务场景：手动清理过期设置，用于开发调试和即时清理
   *
   * @returns {Promise<Object>} 清理结果对象
   * @returns {number} return.cleaned_count - 清理的设置数量
   * @returns {string} return.timestamp - 清理时间戳
   *
   * @example
   * const ScheduledTasks = require('./scripts/maintenance/scheduled-tasks')
   * const result = await ScheduledTasks.manualLotteryManagementCleanup()
   * console.log(`清理了${result.cleaned_count}个过期设置`)
   *
   * 创建时间：2025-11-08
   */
  static async manualLotteryManagementCleanup () {
    logger.info('[手动触发] 执行抽奖管理设置清理...')
    try {
      const managementStrategy = new ManagementStrategy()
      const result = await managementStrategy.cleanupExpiredSettings()
      logger.info('[手动触发] 清理完成', { result })
      return result
    } catch (error) {
      logger.error('[手动触发] 清理失败', { error: error.message })
      throw error
    }
  }

  /**
   * 定时任务5: 每小时检查即将过期的高级空间（提前2小时提醒）
   * Cron表达式: 0 * * * * (每小时的0分)
   *
   * 业务场景：提前通知用户高级空间即将过期（距离过期<2小时），提升用户体验
   *
   * 功能：
   * 1. 查询即将过期的高级空间（expires_at < 当前时间+2小时 AND expires_at > 当前时间）
   * 2. 通过NotificationService发送提醒通知
   * 3. 记录提醒日志
   *
   * ⚠️ 关键字段说明：
   * - UserPremiumStatus表没有status字段，使用is_unlocked字段
   * - is_unlocked: true=已解锁且有效，false=未解锁或已过期
   *
   * 创建时间：2025-11-09
   * @returns {void}
   */
  static schedulePremiumExpiryReminder () {
    cron.schedule('0 * * * *', async () => {
      try {
        logger.info('[定时任务] 开始检查即将过期的高级空间...')

        const now = new Date()
        const twoHoursLater = new Date(now.getTime() + 2 * 60 * 60 * 1000)

        // 查询即将过期的高级空间（距离过期<2小时）
        const expiringStatuses = await UserPremiumStatus.findAll({
          where: {
            is_unlocked: true,
            expires_at: {
              [Op.gt]: now,
              [Op.lte]: twoHoursLater
            }
          },
          attributes: ['user_id', 'expires_at', 'total_unlock_count']
        })

        if (expiringStatuses.length > 0) {
          logger.info(`[定时任务] 发现${expiringStatuses.length}个即将过期的高级空间`)

          // 发送提醒通知
          let successCount = 0
          for (const status of expiringStatuses) {
            try {
              const expiresAt = new Date(status.expires_at)
              const remainingMs = expiresAt - now
              const remainingHours = Math.ceil(remainingMs / (1000 * 60 * 60))
              const remainingMinutes = Math.ceil(remainingMs / (1000 * 60))

              await NotificationService.notifyPremiumExpiringSoon(status.user_id, {
                expires_at: BeijingTimeHelper.formatForAPI(status.expires_at).iso,
                remaining_hours: remainingHours,
                remaining_minutes: remainingMinutes
              })

              successCount++
            } catch (error) {
              logger.error(`[定时任务] 发送过期提醒失败 (user_id: ${status.user_id})`, { error: error.message })
            }
          }

          logger.info(`[定时任务] 高级空间过期提醒发送完成：${successCount}/${expiringStatuses.length}`)
        } else {
          logger.info('[定时任务] 无即将过期的高级空间')
        }
      } catch (error) {
        logger.error('[定时任务] 高级空间过期提醒失败', { error: error.message })
      }
    })

    logger.info('✅ 定时任务已设置: 高级空间过期提醒（每小时执行）')
  }

  /**
   * 定时任务6: 每天凌晨3点清理过期的高级空间状态
   * Cron表达式: 0 3 * * * (每天凌晨3点)
   *
   * 业务场景：自动清理已过期的高级空间状态，更新is_unlocked为false，发送过期通知
   *
   * 功能：
   * 1. 批量更新过期状态（is_unlocked: true → false）
   * 2. 发送过期通知给用户
   * 3. 记录清理日志
   *
   * ⚠️ 关键字段说明：
   * - UserPremiumStatus表没有status字段，使用is_unlocked字段
   * - is_unlocked: true=已解锁且有效，false=未解锁或已过期
   *
   * 创建时间：2025-11-09
   * @returns {void}
   */
  static schedulePremiumStatusCleanup () {
    cron.schedule('0 3 * * *', async () => {
      try {
        logger.info('[定时任务] 开始清理过期的高级空间状态...')

        const now = new Date()

        // 批量更新过期状态
        const [updatedCount] = await UserPremiumStatus.update(
          { is_unlocked: false },
          {
            where: {
              is_unlocked: true,
              expires_at: {
                [Op.lt]: now
              }
            }
          }
        )

        if (updatedCount > 0) {
          logger.info(`[定时任务] 清理完成：${updatedCount}个过期高级空间状态已更新`)

          // 查询被更新的用户ID，发送过期通知
          const expiredUsers = await UserPremiumStatus.findAll({
            where: {
              is_unlocked: false,
              expires_at: {
                [Op.lt]: now,
                [Op.gt]: new Date(now.getTime() - 24 * 60 * 60 * 1000) // 最近24小时过期的
              }
            },
            attributes: ['user_id', 'expires_at', 'total_unlock_count']
          })

          // 发送过期通知
          let notifiedCount = 0
          for (const expired of expiredUsers) {
            try {
              await NotificationService.notifyPremiumExpired(expired.user_id, {
                expired_at: BeijingTimeHelper.formatForAPI(expired.expires_at).iso,
                total_unlock_count: expired.total_unlock_count
              })
              notifiedCount++
            } catch (error) {
              logger.error(`[定时任务] 发送过期通知失败 (user_id: ${expired.user_id})`, { error: error.message })
            }
          }

          logger.info(`[定时任务] 过期通知发送完成：${notifiedCount}/${expiredUsers.length}`)
        } else {
          logger.info('[定时任务] 清理完成：无过期高级空间需要清理')
        }
      } catch (error) {
        logger.error('[定时任务] 高级空间状态清理失败', { error: error.message })
      }
    })

    logger.info('✅ 定时任务已设置: 高级空间状态清理（每天凌晨3点执行）')
  }

  /**
   * 定时任务7: 每10分钟执行数据库性能监控
   * Cron表达式: 0,10,20,30,40,50 * * * * (每10分钟)
   *
   * 业务场景：
   * - 实施《数据库性能问题排查和优化方案.md》中的方案0（持续监控方案）
   * - 监控数据库连接数、慢查询频率等关键性能指标
   * - 在发现实际性能问题时提供数据支撑，判断是否需要优化
   *
   * 监控内容：
   * 1. 数据库连接数监控（告警阈值：>32为warning，>35为critical）
   * 2. 慢查询频率统计（告警阈值：>5次/小时为warning，>10次/小时为critical）
   *
   * 优化触发条件（基于文档3.4节）：
   * - 连接数>35持续1小时 → 执行方案1（调整连接池配置）
   * - 慢查询>10次/小时持续1天 → 执行方案1或2
   * - 登录响应>3秒持续1周 → 执行方案2（代码优化）
   *
   * ⚠️ 重要说明：
   * - 这是预防性监控，不是紧急优化
   * - 当前系统运行稳定，无需立即优化
   * - 只在监控数据达到触发条件时才执行优化
   *
   * 参考文档：docs/数据库性能问题排查和优化方案.md
   *
   * 创建时间：2025-11-09
   * @returns {void}
   */
  static scheduleDatabasePerformanceMonitor () {
    cron.schedule('0,10,20,30,40,50 * * * *', async () => {
      try {
        logger.info('[定时任务] 开始执行数据库性能监控...')

        // 执行性能监控检查
        const results = await databaseMonitor.performFullCheck()

        // 只在发现异常时输出详细信息
        if (results.overall_status !== 'normal') {
          logger.warn('[定时任务] ⚠️ 发现数据库性能异常', {
            overall_status: results.overall_status,
            connection_status: results.checks.connection_count.status,
            current_connections: results.checks.connection_count.current_connections,
            slow_query_count: results.checks.slow_query_stats.count,
            slow_query_hourly_rate: results.checks.slow_query_stats.hourly_rate
          })
        } else {
          logger.info('[定时任务] 数据库性能监控完成：状态正常')
        }
      } catch (error) {
        logger.error('[定时任务] 数据库性能监控失败', { error: error.message })
      }
    })

    logger.info('✅ 定时任务已设置: 数据库性能监控（每10分钟执行）')
  }

  /**
   * 手动触发数据库性能监控（用于测试和调试）
   *
   * 业务场景：
   * - 手动检查数据库性能
   * - 生成性能监控报告
   * - 开发调试和验证监控功能
   *
   * @returns {Promise<string>} 格式化的性能监控报告
   *
   * @example
   * const ScheduledTasks = require('./scripts/maintenance/scheduled-tasks')
   * const report = await ScheduledTasks.manualDatabasePerformanceCheck()
   * console.log(report)
   *
   * 创建时间：2025-11-09
   */
  static async manualDatabasePerformanceCheck () {
    logger.info('[手动触发] 执行数据库性能监控...')
    try {
      const results = await databaseMonitor.performFullCheck()
      const report = databaseMonitor.generateReport(results)
      console.log(report)
      logger.info('[手动触发] 数据库性能监控完成')
      return report
    } catch (error) {
      logger.error('[手动触发] 数据库性能监控失败', { error: error.message })
      throw error
    }
  }

  /**
   * 定时任务8: 每天凌晨0点重置抽奖奖品每日中奖次数
   * Cron表达式: 0 0 * * * (每天凌晨0点)
   *
   * 业务场景：
   * - 每日凌晨自动重置所有奖品的今日中奖次数
   * - 确保每日中奖限制（max_daily_wins）正常工作
   * - 为新的一天的抽奖活动做准备
   *
   * 功能：
   * 1. 批量更新所有奖品的daily_win_count为0
   * 2. 记录重置日志和统计信息
   *
   * 架构设计：
   * - 从LotteryPrize模型迁移到AdminLotteryService（符合任务2.1）
   * - 批处理逻辑应在Service层，Model层只保留字段定义
   *
   * 参考文档：docs/架构重构待办清单.md - 任务2.1
   *
   * 创建时间：2025-12-11
   * @returns {void}
   */
  static scheduleLotteryPrizesDailyReset () {
    cron.schedule('0 0 * * *', async () => {
      try {
        logger.info('[定时任务] 开始重置抽奖奖品每日中奖次数...')

        // 调用AdminLotteryService的方法
        const result = await AdminLotteryService.resetDailyWinCounts()

        logger.info('[定时任务] 抽奖奖品每日中奖次数重置完成', {
          updated_count: result.updated_count,
          timestamp: result.timestamp
        })
      } catch (error) {
        logger.error('[定时任务] 抽奖奖品每日中奖次数重置失败', { error: error.message })
      }
    })

    logger.info('✅ 定时任务已设置: 抽奖奖品每日中奖次数重置（每天凌晨0点执行）')
  }

  /**
   * 定时任务9: 每小时同步抽奖活动状态
   * Cron表达式: 0 * * * * (每小时的0分)
   *
   * 业务场景：
   * - 每小时自动检查并同步抽奖活动状态
   * - 自动开启到达开始时间的draft活动
   * - 自动结束已过结束时间的active活动
   * - 确保活动状态与时间保持一致
   *
   * 功能：
   * 1. 将符合条件的draft活动更新为active（start_time <= 现在 < end_time）
   * 2. 将过期的active活动更新为ended（end_time < 现在）
   * 3. 记录状态变更日志和统计信息
   *
   * 架构设计：
   * - 从LotteryCampaign模型迁移到AdminLotteryService（符合任务2.1）
   * - 批处理逻辑应在Service层，Model层只保留字段定义
   *
   * 参考文档：docs/架构重构待办清单.md - 任务2.1
   *
   * 创建时间：2025-12-11
   * @returns {void}
   */
  static scheduleLotteryCampaignStatusSync () {
    cron.schedule('0 * * * *', async () => {
      try {
        logger.info('[定时任务] 开始同步抽奖活动状态...')

        // 调用AdminLotteryService的方法
        const result = await AdminLotteryService.syncCampaignStatus()

        if (result.started > 0 || result.ended > 0) {
          logger.info('[定时任务] 抽奖活动状态同步完成', {
            started_count: result.started,
            ended_count: result.ended,
            timestamp: result.timestamp
          })
        } else {
          logger.info('[定时任务] 抽奖活动状态同步完成：无需更新')
        }
      } catch (error) {
        logger.error('[定时任务] 抽奖活动状态同步失败', { error: error.message })
      }
    })

    logger.info('✅ 定时任务已设置: 抽奖活动状态同步（每小时执行）')
  }

  /**
   * 手动触发抽奖奖品每日中奖次数重置（用于测试）
   *
   * 业务场景：手动重置奖品每日中奖次数，用于开发调试和即时重置
   *
   * @returns {Promise<Object>} 重置结果对象
   * @returns {boolean} return.success - 是否成功
   * @returns {number} return.updated_count - 更新的奖品数量
   * @returns {Date} return.timestamp - 重置时间戳
   *
   * @example
   * const ScheduledTasks = require('./scripts/maintenance/scheduled-tasks')
   * const result = await ScheduledTasks.manualLotteryPrizesDailyReset()
   * console.log(`重置了${result.updated_count}个奖品的每日中奖次数`)
   *
   * 创建时间：2025-12-11
   */
  static async manualLotteryPrizesDailyReset () {
    logger.info('[手动触发] 执行抽奖奖品每日中奖次数重置...')
    try {
      const result = await AdminLotteryService.resetDailyWinCounts()
      logger.info('[手动触发] 重置完成', { result })
      return result
    } catch (error) {
      logger.error('[手动触发] 重置失败', { error: error.message })
      throw error
    }
  }

  /**
   * 手动触发抽奖活动状态同步（用于测试）
   *
   * 业务场景：手动同步活动状态，用于开发调试和即时同步
   *
   * @returns {Promise<Object>} 同步结果对象
   * @returns {boolean} return.success - 是否成功
   * @returns {number} return.started - 开始的活动数量
   * @returns {number} return.ended - 结束的活动数量
   * @returns {Date} return.timestamp - 同步时间戳
   *
   * @example
   * const ScheduledTasks = require('./scripts/maintenance/scheduled-tasks')
   * const result = await ScheduledTasks.manualLotteryCampaignStatusSync()
   * console.log(`启动了${result.started}个活动，结束了${result.ended}个活动`)
   *
   * 创建时间：2025-12-11
   */
  static async manualLotteryCampaignStatusSync () {
    logger.info('[手动触发] 执行抽奖活动状态同步...')
    try {
      const result = await AdminLotteryService.syncCampaignStatus()
      logger.info('[手动触发] 同步完成', { result })
      return result
    } catch (error) {
      logger.error('[手动触发] 同步失败', { error: error.message })
      throw error
    }
  }
}

module.exports = ScheduledTasks
