/**
 * 售后申诉超时自动升级仲裁服务（DisputeTimeoutService）
 *
 * 功能：定时扫描超过处理截止时间（deadline）仍未处理（open/reviewing）的售后申诉，
 *       自动升级为仲裁（接入 approval_chain），并通知申诉人；升级失败兜底告警。
 *
 * 方案A 第11项二期落地：一期人工升级，二期由本定时任务自动化。
 *
 * 处理逻辑：
 *   - 扫描 trade_disputes 中 status ∈ (open, reviewing) 且 deadline < now 且未进入仲裁的申诉
 *   - 逐条调用 TradeDisputeService.escalateToArbitration 升级（事务内）
 *   - 升级人（submitted_by）取申诉 assigned_to（已指派客服）→ 否则 created_by（发起人）
 *   - 单条失败不影响其它；连续失败记录告警日志
 *
 * 定时任务基础设施：复用项目已有 node-cron（^3.0.3），与 ApprovalChainTimeoutService 同款模式。
 * cluster 防重：仅在定时任务 worker（NODE_APP_INSTANCE=0/undefined）注册启动（见 app.js）。
 *
 * @module services/DisputeTimeoutService
 */
const cron = require('node-cron')
const logger = require('../utils/logger').logger
const { Op } = require('sequelize')
const { TradeDispute } = require('../models')
const TransactionManager = require('../utils/TransactionManager')
const TradeDisputeService = require('./TradeDisputeService')

/** 售后申诉超时自动升级仲裁服务 */
class DisputeTimeoutService {
  static _cronJob = null

  /** 单实例（复用 TradeDisputeService 的 C 端/管理端同一套业务方法） */
  static _disputeService = new TradeDisputeService()

  /**
   * 启动超时扫描定时任务（每30分钟执行一次，与审核链超时同频）
   * @returns {void} 启动定时任务
   */
  static start() {
    if (DisputeTimeoutService._cronJob) {
      logger.warn('[售后超时] 定时任务已在运行，跳过重复启动')
      return
    }

    DisputeTimeoutService._cronJob = cron.schedule('*/30 * * * *', async () => {
      try {
        await DisputeTimeoutService.scanAndProcess()
      } catch (error) {
        logger.error(`[售后超时] 扫描执行失败: ${error.message}`)
      }
    })

    logger.info('[售后超时] 定时任务已启动（每30分钟扫描超时未处理申诉）')
  }

  /**
   * 停止定时任务
   * @returns {void} 停止定时任务
   */
  static stop() {
    if (DisputeTimeoutService._cronJob) {
      DisputeTimeoutService._cronJob.stop()
      DisputeTimeoutService._cronJob = null
      logger.info('[售后超时] 定时任务已停止')
    }
  }

  /**
   * 扫描并处理超时未处理的售后申诉
   * @returns {Promise<Object>} 处理结果统计 { scanned, escalated, failed }
   */
  static async scanAndProcess() {
    const now = new Date()

    // 超时未处理：状态仍在 open/reviewing，已过 deadline，且尚未进入仲裁
    const timeoutDisputes = await TradeDispute.findAll({
      where: {
        status: { [Op.in]: ['open', 'reviewing'] },
        deadline: { [Op.not]: null, [Op.lt]: now },
        approval_chain_instance_id: { [Op.is]: null }
      },
      order: [['deadline', 'ASC']]
    })

    if (timeoutDisputes.length === 0) {
      return { scanned: 0, escalated: 0, failed: 0 }
    }

    logger.info(`[售后超时] 发现 ${timeoutDisputes.length} 个超时未处理申诉，开始自动升级仲裁`)

    let escalated = 0
    let failed = 0

    for (const dispute of timeoutDisputes) {
      try {
        // 升级人：优先已指派客服，否则发起人（保证 approval_chain.submitted_by 非空且可追溯）
        const operatorId = dispute.assigned_to || dispute.created_by || dispute.user_id

        // eslint-disable-next-line no-await-in-loop
        await TransactionManager.execute(
          async transaction =>
            DisputeTimeoutService._disputeService.escalateToArbitration(
              dispute.trade_dispute_id,
              operatorId,
              { transaction }
            ),
          { description: `售后申诉超时自动升级仲裁（申诉#${dispute.trade_dispute_id}）` }
        )
        escalated++
        logger.info(`[售后超时] 申诉自动升级仲裁成功: trade_dispute_id=${dispute.trade_dispute_id}`)
      } catch (error) {
        failed++
        logger.error(
          `[售后超时] 申诉自动升级失败（兜底告警，需人工介入）: trade_dispute_id=${dispute.trade_dispute_id}, error=${error.message}`
        )
      }
    }

    logger.info(
      `[售后超时] 本轮处理完成: 扫描${timeoutDisputes.length} 升级${escalated} 失败${failed}`
    )

    return { scanned: timeoutDisputes.length, escalated, failed }
  }

  /**
   * 获取任务状态信息
   * @returns {Object} 任务状态
   */
  static getJobInfo() {
    return {
      name: 'dispute-timeout-escalation',
      description: '售后申诉超时自动升级仲裁',
      schedule: '*/30 * * * *',
      dependencies: ['TradeDisputeService', 'ApprovalChainService'],
      is_running: !!DisputeTimeoutService._cronJob
    }
  }
}

module.exports = DisputeTimeoutService
