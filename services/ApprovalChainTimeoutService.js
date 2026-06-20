/**
 * 审核链超时自动升级服务（ApprovalChainTimeoutService）
 *
 * 功能：每30分钟扫描超时的审核步骤，按 timeout_action 执行处理
 * 决策 #5：12小时超时，非终审自动升级（escalate），终审仅通知（notify）
 *
 * 处理逻辑：
 *   - 非终审 + escalate → 升级给"上级"代审同一步（user_hierarchy.superior_user_id），受门店/层级隔离约束，留痕
 *   - 终审 + notify → 发通知提醒终审人（不改变状态，不自动通过）
 *   - none → 不做任何处理
 *
 * 定时任务基础设施：使用项目已有的 node-cron 包；仅 PM2 worker 0 注册（见 app.js），cluster 下不会重复扫描。
 *
 * @module services/ApprovalChainTimeoutService
 */
const cron = require('node-cron')
const logger = require('../utils/logger').logger
const {
  ApprovalChainStep,
  ApprovalChainInstance,
  ApprovalChainNode,
  AdminNotification,
  StoreStaff,
  UserHierarchy
} = require('../models')
const { Op } = require('sequelize')
const TransactionManager = require('../utils/TransactionManager')

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
        // eslint-disable-next-line no-await-in-loop
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
   * 非终审超时：升级给"上级"代审同一步（2026-06-20 改造，决策 8.6.1）
   *
   * 改造前：标记 timeout → advanceToNextStep（跳过当前步，推进到下一节点）。
   * 改造后：找到当前审核人的"上级"（user_hierarchy.superior_user_id），把同一步改派给上级代审，
   *   设置 assignee_user_id=上级、escalated_from_user_id、is_escalated、重置 timeout_at，状态保持 pending。
   *   升级仍受门店/层级隔离约束（上级须是管辖该单的上级）。找不到上级时降级为通知（不跳过、不卡死）。
   *
   * @param {Object} step - 超时步骤
   * @returns {Promise<void>} 升级完成
   * @private
   */
  static async _escalateStep(step) {
    await TransactionManager.execute(
      async transaction => {
        // 1. 确定"当前审核人"——指定人步骤取 assignee_user_id；门店步骤取该门店在职店长
        let currentReviewerId = step.assignee_user_id || null
        if (!currentReviewerId && step.store_id) {
          const manager = await StoreStaff.findOne({
            where: { store_id: step.store_id, role_in_store: 'manager', status: 'active' },
            attributes: ['user_id'],
            transaction
          })
          currentReviewerId = manager ? manager.user_id : null
        }

        // 2. 查当前审核人的上级（user_hierarchy.superior_user_id，激活态）
        let superiorId = null
        let originalRoleId = step.assignee_role_id || null
        if (currentReviewerId) {
          const hierarchy = await UserHierarchy.findOne({
            where: { user_id: currentReviewerId, is_active: true },
            attributes: ['superior_user_id', 'role_id'],
            transaction
          })
          if (hierarchy) {
            superiorId = hierarchy.superior_user_id || null
            if (!originalRoleId) originalRoleId = hierarchy.role_id || null
          }
        }

        if (!superiorId) {
          /*
           * 找不到上级（顶层或未配层级）：不跳过、不卡死，降级为"超时提醒"通知当前审核人，
           * 步骤保持 pending 等待人工处理（避免无上级时把单子跳过造成漏审）。
           */
          logger.warn(
            `[审核链超时] 步骤 ${step.step_id} 无可升级上级（reviewer=${currentReviewerId}），降级为通知`
          )
          await ApprovalChainTimeoutService._notifyTimeout(step)
          return
        }

        // 3. 改派同一步给上级代审（留痕 + 重置超时窗口）
        const timeoutHours = step.node?.timeout_hours || 12
        await step.update(
          {
            assignee_user_id: superiorId,
            assignee_role_id: null,
            is_escalated: 1,
            escalated_from_user_id: currentReviewerId,
            original_assignee_role_id: originalRoleId,
            action_reason: '超时升级给上级代审（原审核人12小时未处理）',
            timeout_at: new Date(Date.now() + timeoutHours * 3600 * 1000)
          },
          { transaction }
        )

        // 4. 通知上级
        try {
          await AdminNotification.create(
            {
              admin_id: superiorId,
              title: '审核任务超时升级',
              content: `${step.instance.auditable_type}审核 #${step.instance.auditable_id} 已超时升级给您代审，原审核人12小时未处理`,
              notification_type: 'task',
              priority: 'high',
              source_type: 'approval_chain_timeout',
              source_id: step.instance_id,
              extra_data: {
                event: 'approval_timeout_escalation',
                instance_id: step.instance_id,
                step_id: step.step_id,
                escalated_from_user_id: currentReviewerId
              }
            },
            { transaction }
          )
        } catch (notifyError) {
          logger.warn(`[审核链超时] 升级通知发送失败（非致命）: ${notifyError.message}`)
        }

        logger.info(
          `[审核链超时] 步骤升级给上级代审: step_id=${step.step_id}, from_user=${currentReviewerId}, to_superior=${superiorId}`
        )
      },
      { description: '审核链超时升级给上级代审' }
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
        source_type: 'approval_chain_timeout',
        source_id: step.instance_id,
        notification_type: 'alert',
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
          notification_type: 'alert',
          priority: 'high',
          source_type: 'approval_chain_timeout',
          source_id: step.instance_id,
          extra_data: { event: 'approval_final_timeout_reminder', instance_id: step.instance_id }
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
          notification_type: 'reminder',
          priority: 'medium',
          source_type: 'approval_chain_timeout',
          source_id: step.instance_id,
          extra_data: { event: 'approval_timeout_reminder', instance_id: step.instance_id }
        })
      }
    } catch (error) {
      logger.warn(`[审核链超时] 通知失败: ${error.message}`)
    }
  }
}

module.exports = ApprovalChainTimeoutService
