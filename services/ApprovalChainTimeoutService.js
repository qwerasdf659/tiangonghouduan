/**
 * 审核链超时自动升级服务（ApprovalChainTimeoutService）
 *
 * 功能：每30分钟扫描超时的审核步骤，按 timeout_action 执行处理
 * 决策 #5：12小时超时，非终审自动升级（escalate），终审仅通知（notify）
 *
 * 处理逻辑：
 *   - 非终审 + escalate → 标记当前步骤 timeout → 推进下一步为 pending → 通知下一审核人
 *   - 终审 + notify → 发通知提醒终审人（不改变状态，不自动通过）
 *   - none → 不做任何处理
 *
 * 定时任务基础设施：使用项目已有的 node-cron 包（^3.0.3）
 *
 * @module services/ApprovalChainTimeoutService
 */
const cron = require('node-cron')
const logger = require('../utils/logger').logger
const {
  ApprovalChainStep,
  ApprovalChainInstance,
  ApprovalChainNode,
  AdminNotification
} = require('../models')
const { Op } = require('sequelize')
const TransactionManager = require('../utils/TransactionManager')
const ApprovalChainService = require('./ApprovalChainService')
const BeijingTimeHelper = require('../utils/timeHelper')

/** 审核链超时自动升级服务 */
class ApprovalChainTimeoutService {
  static _cronJob = null

  /**
   * 启动超时扫描定时任务（每30分钟执行一次）
   * @returns {void} 启动定时任务
   */
  static start() {
    if (ApprovalChainTimeoutService._cronJob) {
      logger.warn('[审核链超时] 定时任务已在运行，跳过重复启动')
      return
    }

    ApprovalChainTimeoutService._cronJob = cron.schedule('*/30 * * * *', async () => {
      try {
        await ApprovalChainTimeoutService.scanAndProcess()
      } catch (error) {
        logger.error(`[审核链超时] 扫描执行失败: ${error.message}`)
      }
    })

    logger.info('[审核链超时] 定时任务已启动（每30分钟扫描）')
  }

  /**
   * 停止定时任务
   * @returns {void} 停止定时任务
   */
  static stop() {
    if (ApprovalChainTimeoutService._cronJob) {
      ApprovalChainTimeoutService._cronJob.stop()
      ApprovalChainTimeoutService._cronJob = null
      logger.info('[审核链超时] 定时任务已停止')
    }
  }

  /**
   * 扫描并处理超时步骤
   * @returns {Promise<void>} 扫描完成
   */
  static async scanAndProcess() {
    const now = new Date()

    const timeoutSteps = await ApprovalChainStep.findAll({
      where: {
        status: 'pending',
        timeout_at: { [Op.not]: null, [Op.lt]: now }
      },
      include: [
        { model: ApprovalChainInstance, as: 'instance' },
        { model: ApprovalChainNode, as: 'node' }
      ]
    })

    if (timeoutSteps.length === 0) return

    logger.info(`[审核链超时] 发现 ${timeoutSteps.length} 个超时步骤`)

    for (const step of timeoutSteps) {
      try {
        await ApprovalChainTimeoutService._processTimeoutStep(step)
      } catch (error) {
        logger.error(`[审核链超时] 处理步骤失败: step_id=${step.step_id}, error=${error.message}`)
      }
    }
  }

  /**
   * 处理单个超时步骤
   * @param {Object} step - 超时步骤
   * @returns {Promise<void>} 处理完成
   * @private
   */
  static async _processTimeoutStep(step) {
    const timeoutAction = step.node?.timeout_action || 'escalate'

    if (timeoutAction === 'none') {
      logger.info(`[审核链超时] 步骤 ${step.step_id} timeout_action=none，跳过`)
      return
    }

    if (step.is_final) {
      // 终审超时：仅通知提醒（不自动通过）
      await ApprovalChainTimeoutService._notifyFinalTimeout(step)
    } else if (timeoutAction === 'escalate') {
      // 非终审超时：自动升级到下一步
      await ApprovalChainTimeoutService._escalateStep(step)
    } else if (timeoutAction === 'notify') {
      await ApprovalChainTimeoutService._notifyTimeout(step)
    }
  }

  /**
   * 非终审超时自动升级
   * @param {Object} step - 超时步骤
   * @returns {Promise<void>} 升级完成
   * @private
   */
  static async _escalateStep(step) {
    await TransactionManager.execute(
      async transaction => {
        await step.update(
          {
            status: 'timeout',
            action_reason: '超时自动升级（12小时未处理）',
            actioned_at: BeijingTimeHelper.createDatabaseTime()
          },
          { transaction }
        )

        await ApprovalChainService.advanceToNextStep(step.instance, step, { transaction })

        // 通知下一审核人
        try {
          const nextStep = await ApprovalChainStep.findOne({
            where: { instance_id: step.instance_id, status: 'pending' },
            transaction
          })
          if (nextStep) {
            const targetAdminId = nextStep.assignee_user_id
            if (targetAdminId) {
              await AdminNotification.create(
                {
                  admin_id: targetAdminId,
                  title: '审核任务超时升级',
                  content: `${step.instance.auditable_type}审核 #${step.instance.auditable_id} 已超时升级到您，原审核人12小时未处理`,
                  type: 'approval_timeout_escalation',
                  priority: 'high',
                  source: 'approval_chain_timeout',
                  source_id: step.instance_id
                },
                { transaction }
              )
            }
          }
        } catch (notifyError) {
          logger.warn(`[审核链超时] 通知发送失败（非致命）: ${notifyError.message}`)
        }

        logger.info(
          `[审核链超时] 步骤自动升级: step_id=${step.step_id}, instance_id=${step.instance_id}`
        )
      },
      { description: '审核链超时自动升级' }
    )
  }

  /**
   * 终审超时通知（不改变状态）
   * @param {Object} step - 超时步骤
   * @returns {Promise<void>} 通知完成
   * @private
   */
  static async _notifyFinalTimeout(step) {
    // 检查是否已经在12小时内发过通知，避免重复
    const recentNotification = await AdminNotification.findOne({
      where: {
        source: 'approval_chain_timeout',
        source_id: step.instance_id,
        type: 'approval_final_timeout_reminder',
        created_at: { [Op.gt]: new Date(Date.now() - 12 * 3600 * 1000) }
      }
    })

    if (recentNotification) {
      logger.info(`[审核链超时] 终审步骤 ${step.step_id} 已在12小时内通知过，跳过`)
      return
    }

    try {
      const targetAdminId = step.assignee_user_id
      if (targetAdminId) {
        await AdminNotification.create({
          admin_id: targetAdminId,
          title: '终审超时提醒',
          content: `${step.instance.auditable_type}审核 #${step.instance.auditable_id} 已超时12小时，请尽快处理`,
          type: 'approval_final_timeout_reminder',
          priority: 'high',
          source: 'approval_chain_timeout',
          source_id: step.instance_id
        })
      }
    } catch (error) {
      logger.warn(`[审核链超时] 终审通知失败: ${error.message}`)
    }

    logger.info(`[审核链超时] 终审超时提醒已发送: step_id=${step.step_id}`)
  }

  /**
   * 普通超时通知（仅通知，不改变状态）
   * @param {Object} step - 超时步骤
   * @returns {Promise<void>} 通知完成
   * @private
   */
  static async _notifyTimeout(step) {
    try {
      const targetAdminId = step.assignee_user_id
      if (targetAdminId) {
        await AdminNotification.create({
          admin_id: targetAdminId,
          title: '审核超时提醒',
          content: `您负责的${step.instance.auditable_type}审核 #${step.instance.auditable_id} 已超时，请尽快处理`,
          type: 'approval_timeout_reminder',
          priority: 'medium',
          source: 'approval_chain_timeout',
          source_id: step.instance_id
        })
      }
    } catch (error) {
      logger.warn(`[审核链超时] 通知失败: ${error.message}`)
    }
  }
}

module.exports = ApprovalChainTimeoutService
