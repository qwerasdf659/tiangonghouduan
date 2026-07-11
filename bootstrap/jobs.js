/**
 * 定时任务与运行时监控启动（bootstrap 模块，2026-07-11 自 app.js 拆分，纯搬移不改行为）
 *
 * 职责：
 * - isCronWorker：PM2 cluster 多进程防重判定（仅 0 号 worker 注册 cron）
 * - startTimeoutServices：审核链/售后申诉超时扫描服务（应用初始化阶段启动）
 * - startCronJobs：ScheduledTasks 全量定时任务 + 4 个按 .env 开关启用的 job 模块（服务器监听后启动）
 * - startPoolMonitoring：数据库连接池持续监控（每 60s 打点 + 阈值告警）
 *
 * @module bootstrap/jobs
 */

'use strict'

const appLogger = require('../utils/logger')

/**
 * 判断当前进程是否为「定时任务唯一执行 worker」
 *
 * 业务场景（PM2 cluster 多进程防重）：
 * - cluster 模式下 PM2 会 fork 多个 worker，每个 worker 都会执行 app.js
 * - 若每个 worker 都注册 cron，同一任务会被执行 N 次（重复扣费/发奖/对账，造成资损）
 * - 通过 PM2 注入的 NODE_APP_INSTANCE 环境变量，只让 0 号 worker 注册定时任务
 *
 * 兼容性：
 * - fork 单进程模式下 NODE_APP_INSTANCE 为 undefined，此时放行（保持原有行为）
 * - cluster 模式下仅 '0' 号 worker 返回 true，其余 worker 不注册 cron
 *
 * @returns {boolean} 当前进程是否应注册定时任务
 */
function isCronWorker() {
  const instanceId = process.env.NODE_APP_INSTANCE
  return instanceId === undefined || instanceId === '0'
}

/**
 * 启动超时扫描服务（审核链 + 售后申诉，每30分钟扫描）
 *
 * R1（cluster 防重）：仅在定时任务 worker 注册，避免多 worker 重复升级审批/仲裁状态
 *
 * @returns {void}
 */
function startTimeoutServices() {
  if (!isCronWorker()) {
    appLogger.info('当前 worker 非定时任务执行节点，跳过审核链超时任务注册', {
      node_app_instance: process.env.NODE_APP_INSTANCE
    })
    return
  }

  // 审核链超时自动升级定时任务
  try {
    const ApprovalChainTimeoutService = require('../services/ApprovalChainTimeoutService')
    ApprovalChainTimeoutService.start()
    appLogger.info('审核链超时扫描定时任务已启动')
  } catch (timeoutError) {
    appLogger.warn(`审核链超时服务启动失败（非致命）: ${timeoutError.message}`)
  }

  /*
   * 售后申诉超时自动升级仲裁定时任务
   * 方案A 第11项二期：超时未处理申诉自动升级仲裁
   */
  try {
    const DisputeTimeoutService = require('../services/DisputeTimeoutService')
    DisputeTimeoutService.start()
    appLogger.info('售后申诉超时自动升级定时任务已启动')
  } catch (disputeTimeoutError) {
    appLogger.warn(`售后申诉超时服务启动失败（非致命）: ${disputeTimeoutError.message}`)
  }
}

/**
 * 启动全部 cron 定时任务（服务器监听成功后调用）
 *
 * R1（cluster 防重）：全部 cron 注册点统一收口到单 worker 守卫，避免多 worker 重复执行
 *
 * @returns {void}
 */
function startCronJobs() {
  if (!isCronWorker()) {
    appLogger.info('当前 worker 非定时任务执行节点，跳过全部 cron 注册', {
      node_app_instance: process.env.NODE_APP_INSTANCE
    })
    return
  }

  // 初始化 ScheduledTasks 全量定时任务
  try {
    const ScheduledTasks = require('../scripts/maintenance/scheduled_tasks')
    ScheduledTasks.initialize()
    appLogger.info('定时任务初始化完成')
  } catch (error) {
    appLogger.error('定时任务初始化失败', { error: error.message })
  }

  // 初始化广告系统定时任务（ENABLE_AD_CRON_JOBS=true 时启用）
  try {
    require('../jobs/ad-cron-jobs')
    appLogger.info('广告定时任务模块已加载', {
      enabled: process.env.ENABLE_AD_CRON_JOBS === 'true'
    })
  } catch (error) {
    appLogger.error('广告定时任务加载失败', { error: error.message })
  }

  // 初始化内容过期清理定时任务（ENABLE_CONTENT_CRON_JOBS=true 时启用）
  try {
    require('../jobs/ad-campaign-expiry-jobs')
    appLogger.info('内容过期清理定时任务模块已加载', {
      enabled: process.env.ENABLE_CONTENT_CRON_JOBS === 'true'
    })
  } catch (error) {
    appLogger.error('内容过期清理定时任务加载失败', { error: error.message })
  }

  // 初始化管理员通知清理定时任务（ENABLE_NOTIFICATION_CLEANUP=true 时启用）
  try {
    require('../jobs/daily-notification-cleanup')
    appLogger.info('管理员通知清理定时任务模块已加载', {
      enabled: process.env.ENABLE_NOTIFICATION_CLEANUP === 'true'
    })
  } catch (error) {
    appLogger.error('管理员通知清理定时任务加载失败', { error: error.message })
  }

  // 初始化活动专属预算到期清零任务（ENABLE_EVENT_BUDGET_EXPIRY=true 时启用，水晶奖品倍率活动 §18.5 防囤积套利）
  try {
    require('../jobs/daily-event-budget-expiry')
    appLogger.info('活动专属预算到期清零任务模块已加载', {
      enabled: process.env.ENABLE_EVENT_BUDGET_EXPIRY === 'true'
    })
  } catch (error) {
    appLogger.error('活动专属预算到期清零任务加载失败', { error: error.message })
  }
}

/**
 * 启动数据库连接池持续监控（2025-12-30 方案A已拍板）
 *
 * 功能：每60s打点到应用日志，建立连接池可观测性
 * 告警条件：waiting > 5（严重）、usage_rate > 80%（警告）
 *
 * R10（cluster 监控噪音治理，2026-05-30）：
 * cluster 下每个 worker 各有独立连接池，都会跑此监控（这是正确的，需观测每个 worker 的池），
 * 日志带 worker_id 区分来源；worker_id 取 PM2 注入的 NODE_APP_INSTANCE，fork 单进程下为 'fork'。
 *
 * @returns {void}
 */
function startPoolMonitoring() {
  if (process.env.ENABLE_POOL_MONITORING === 'false') {
    return
  }

  const { sequelize } = require('../models')
  const workerId = process.env.NODE_APP_INSTANCE ?? 'fork'

  setInterval(() => {
    const pool = sequelize.connectionManager.pool
    if (!pool) return

    const metrics = {
      worker_id: workerId,
      size: pool.size || 0,
      available: pool.available || 0,
      using: pool.using || 0,
      waiting: pool.waiting || 0,
      max: pool.max || 0,
      usage_rate: pool.max > 0 ? ((pool.using / pool.max) * 100).toFixed(1) + '%' : '0%'
    }

    // 正常状态：info 级别（可通过日志级别过滤）
    appLogger.info('连接池状态', metrics)

    // 告警条件1：等待连接过多（严重）- 阈值已拍板
    if (metrics.waiting > 5) {
      appLogger.error('连接池告警: 等待连接过多', {
        ...metrics,
        alert_type: 'HIGH_WAITING_COUNT',
        severity: 'CRITICAL',
        recommendation: '立即排查慢查询或增加 pool.max',
        threshold: 'waiting > 5（已拍板，先跑一周再调整）'
      })
    }

    // 告警条件2：使用率过高（警告）- 阈值已拍板
    if (pool.using / pool.max > 0.8) {
      appLogger.warn('连接池告警: 使用率过高', {
        ...metrics,
        alert_type: 'HIGH_USAGE_RATE',
        severity: 'WARNING',
        recommendation: '评估是否需要增加 pool.max 或优化查询',
        threshold: 'usage_rate > 80%（已拍板，先跑一周再调整）'
      })
    }
  }, 60000) // 每分钟

  appLogger.info(' 连接池监控已启动', {
    worker_id: workerId,
    interval: '60s',
    alert_thresholds: { waiting: 5, usage_rate: '80%' },
    log_level: 'info',
    environment: process.env.NODE_ENV,
    disable_with: 'ENABLE_POOL_MONITORING=false'
  })
}

module.exports = { isCronWorker, startTimeoutServices, startCronJobs, startPoolMonitoring }
