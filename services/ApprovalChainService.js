/**
 * 审核链服务（ApprovalChainService）
 *
 * 核心职责：
 *   - 匹配审核链模板（matchTemplate）
 *   - 创建审核链实例和步骤（createChainInstance）
 *   - 处理审核步骤（processStep）— 核心方法
 *   - 推进到下一步（advanceToNextStep）
 *   - 查询待审核步骤（按用户/角色）
 *
 * 事务边界：所有写操作强制要求外部事务传入（assertAndGetTransaction）
 * 服务注册键：approval_chain（通过 ServiceManager 获取）
 *
 * @module services/ApprovalChainService
 */
const BusinessError = require('../utils/BusinessError')
const logger = require('../utils/logger').logger
const { sanitize } = require('../utils/logger')
const {
  ApprovalChainTemplate,
  ApprovalChainNode,
  ApprovalChainInstance,
  ApprovalChainStep,
  ApprovalChainStepAction,
  AdminNotification,
  UserRole,
  Role,
  User,
  StoreStaff,
  UserHierarchy,
  sequelize
} = require('../models')
const { Op } = require('sequelize')
const { assertAndGetTransaction } = require('../utils/transactionHelpers')
const BeijingTimeHelper = require('../utils/timeHelper')
/*
 * 终审闭环依赖：终审通过/拒绝后触发统一审核引擎回调（消费记录发积分/改状态）
 * ContentAuditEngine 为静态服务，与本服务同层，直接 require 复用（符合"静态服务 + 顶部 require"约定）
 */
const ContentAuditEngine = require('./ContentAuditEngine')
const TransactionManager = require('../utils/TransactionManager')
/*
 * 中文化：审核链下发时把 auditable_type（英文业务码）经字典转出 auditable_type_display（中文），
 * 复用项目统一字典体系（system_dictionaries + displayNameHelper），前端零维护、零映射直接读。
 */
const { attachDisplayNames } = require('../utils/displayNameHelper')

/** 审核链服务 */
class ApprovalChainService {
  /**
   * 按业务类型和业务数据匹配审核链模板
   *
   * 匹配逻辑（按优先级降序）：
   *   1. auditable_type 必须匹配
   *   2. is_active = 1
   *   3. match_conditions 满足（JSON 条件匹配）
   *   4. priority DESC（数值大的优先）
   *
   * @param {string} auditableType - 业务类型（consumption/merchant_points/exchange）
   * @param {Object} businessData - 业务数据（用于条件匹配，如 { amount: 300, store_id: 7 }）
   * @returns {Promise<ApprovalChainTemplate|null>} 匹配到的模板，无匹配返回 null
   */
  static async matchTemplate(auditableType, businessData = {}) {
    const templates = await ApprovalChainTemplate.findAll({
      where: {
        auditable_type: auditableType,
        is_active: 1
      },
      include: [
        {
          model: ApprovalChainNode,
          as: 'nodes',
          order: [['step_number', 'ASC']]
        }
      ],
      order: [['priority', 'DESC']]
    })

    if (templates.length === 0) {
      logger.info(`[审核链] 未找到模板: auditable_type=${auditableType}`)
      return null
    }

    for (const template of templates) {
      if (ApprovalChainService._matchConditions(template.match_conditions, businessData)) {
        logger.info(
          `[审核链] 匹配到模板: ${template.template_code} (priority=${template.priority})`
        )
        return template
      }
    }

    logger.info(`[审核链] 所有模板条件不满足: auditable_type=${auditableType}`)
    return null
  }

  /**
   * 创建审核链实例及所有步骤
   *
   * @param {ApprovalChainTemplate} template - 匹配到的模板（含 nodes 关联）
   * @param {string} auditableType - 业务类型
   * @param {number} auditableId - 业务记录ID
   * @param {number} submittedBy - 提交人 user_id
   * @param {Object} options - 选项
   * @param {Object} options.transaction - Sequelize 事务（必填）
   * @param {number} [options.content_review_record_id] - 关联的审核记录ID
   * @param {Object} [options.business_snapshot] - 业务数据快照
   * @returns {Promise<ApprovalChainInstance>} 创建的实例
   */
  static async createChainInstance(
    template,
    auditableType,
    auditableId,
    submittedBy,
    options = {}
  ) {
    const transaction = assertAndGetTransaction(options, 'ApprovalChainService.createChainInstance')

    const idempotencyKey = `approval_chain:${auditableType}:${auditableId}`
    const now = BeijingTimeHelper.createDatabaseTime()

    const auditNodes = template.nodes
      ? template.nodes.filter(n => n.step_number > 1).sort((a, b) => a.step_number - b.step_number)
      : await ApprovalChainNode.findAll({
          where: { template_id: template.template_id, step_number: { [Op.gt]: 1 } },
          order: [['step_number', 'ASC']],
          transaction
        })

    if (auditNodes.length === 0) {
      throw new BusinessError(
        `模板 ${template.template_code} 无审核节点（step_number > 1 的节点为空）`,
        'APPROVAL_REQUIRED',
        400
      )
    }

    const instance = await ApprovalChainInstance.create(
      {
        template_id: template.template_id,
        auditable_type: auditableType,
        auditable_id: auditableId,
        content_review_record_id: options.content_review_record_id || null,
        /*
         * current_step 语义为「当前进行到第几步」的 1-based 序位（1..total_steps），
         * 而非节点的 step_number（step_number 仅为模板节点稀疏排序号，如 3/9，用于排序与定位下一步）。
         * 创建时第一个审核步骤即第 1 步。
         */
        current_step: 1,
        total_steps: auditNodes.length,
        status: 'in_progress',
        submitted_by: submittedBy,
        submitted_at: now,
        business_snapshot: options.business_snapshot || null,
        idempotency_key: idempotencyKey
      },
      { transaction }
    )

    /*
     * 门店隔离数据基础（2026-06-20 分级审核链升级）：
     * consumption 业务有门店维度 → 解析该消费单所属门店，冗余到每个 step 的 store_id，
     * 供门店隔离校验（submitter_manager / 店长店员角色池）与统计免回查。
     * merchant_points 无门店维度，storeId 保持 null（不做门店隔离）。
     */
    let storeId = null
    if (auditableType === 'consumption') {
      const ConsumptionRecord = require('../models').ConsumptionRecord
      const record = await ConsumptionRecord.findByPk(auditableId, {
        attributes: ['store_id'],
        transaction
      })
      storeId = record ? record.store_id : null
    }

    for (let i = 0; i < auditNodes.length; i++) {
      const node = auditNodes[i]
      const isFirst = i === 0
      const timeoutAt = isFirst ? new Date(Date.now() + node.timeout_hours * 3600 * 1000) : null

      // eslint-disable-next-line no-await-in-loop
      await ApprovalChainStep.create(
        {
          instance_id: instance.instance_id,
          node_id: node.node_id,
          step_number: node.step_number,
          /*
           * submitter_manager（提交人门店店长）分配方式：不预置 assignee_user_id/role_id，
           * 由 store_id + store_staff 在校验/通知时动态反查该门店在职 manager，实现"谁的店谁审"。
           */
          assignee_user_id: node.assignee_type === 'user' ? node.assignee_user_id : null,
          assignee_role_id: node.assignee_type === 'role' ? node.assignee_role_id : null,
          store_id: storeId,
          // 会签配置从节点固化到步骤（实例化后节点改动不影响进行中的实例）
          approve_mode: node.approve_mode || 'single',
          required_approvals: node.required_approvals || 1,
          approved_count: 0,
          status: isFirst ? 'pending' : 'waiting',
          is_final: node.is_final ? 1 : 0,
          timeout_at: timeoutAt,
          auto_approved: 0
        },
        { transaction }
      )
    }

    // 通知第一个审核人
    try {
      const firstNode = auditNodes[0]
      const notifyUserIds = await ApprovalChainService._resolveAssigneeUserIds(
        firstNode,
        transaction,
        storeId
      )
      for (const adminId of notifyUserIds) {
        // eslint-disable-next-line no-await-in-loop
        await AdminNotification.create(
          {
            admin_id: adminId,
            title: '新审核任务',
            content: `${auditableType}审核 #${auditableId} 已提交，请审核`,
            notification_type: 'task',
            priority: 'normal',
            source_type: 'approval_chain',
            source_id: instance.instance_id,
            extra_data: {
              event: 'approval_chain_created',
              instance_id: instance.instance_id,
              auditable_type: auditableType,
              auditable_id: auditableId
            }
          },
          { transaction }
        )
      }
    } catch (notifyError) {
      logger.warn(`[审核链] 创建实例后通知审核人失败（非致命）: ${notifyError.message}`)
    }

    logger.info(
      `[审核链] 实例创建成功: instance_id=${instance.instance_id}, template=${template.template_code}, steps=${auditNodes.length}`
    )
    return instance
  }

  /**
   * 处理审核步骤（核心方法）
   *
   * 权限校验逻辑（Service 层精确鉴权，_verifyOperatorPermission 返回越级上下文）：
   *   - 角色池模式：operator 的任一角色 role_id 等于 step.assignee_role_id（叠加门店/区域隔离）
   *   - 指定人模式：operator.user_id 等于 step.assignee_user_id
   *   - 提交人门店店长（submitter_manager）：operator 为该门店在职店长
   *   - admin(role_level>=100) 可审核任何步骤（终极兜底；顶替低等级节点时标记越级留痕）
   *
   * 会签（countersign）：approve 写 approval_chain_step_actions 子记录 + 累加 approved_count，
   *   凑够 required_approvals 才推进；任一 reject 整体拒绝；admin 越级一次满足整个会签节点。
   *
   * @param {number} stepId - 步骤ID
   * @param {string} action - 操作（'approve' 或 'reject'）
   * @param {string} reason - 审批意见
   * @param {number} operatorId - 操作人 user_id
   * @param {Object} options - 选项
   * @param {Object} options.transaction - Sequelize 事务（必填）
   * @returns {Promise<Object>} 处理结果（含 countersign_pending 标识会签未凑够）
   */
  static async processStep(stepId, action, reason, operatorId, options = {}) {
    const transaction = assertAndGetTransaction(options, 'ApprovalChainService.processStep')

    if (!['approve', 'reject'].includes(action)) {
      throw new BusinessError(
        `无效的审核操作: ${action}，仅支持 approve/reject`,
        'APPROVAL_INVALID',
        400
      )
    }

    const step = await ApprovalChainStep.findByPk(stepId, {
      include: [
        { model: ApprovalChainInstance, as: 'instance' },
        { model: ApprovalChainNode, as: 'node' }
      ],
      transaction,
      lock: transaction.LOCK.UPDATE
    })

    if (!step) {
      throw new BusinessError(`审核步骤不存在: step_id=${stepId}`, 'APPROVAL_NOT_FOUND', 404)
    }
    if (step.status !== 'pending') {
      throw new BusinessError(
        `审核步骤状态不是 pending: 当前状态=${step.status}`,
        'APPROVAL_ERROR',
        400
      )
    }
    if (step.instance.status !== 'in_progress') {
      throw new BusinessError(
        `审核链已结束: 当前状态=${step.instance.status}`,
        'APPROVAL_ERROR',
        400
      )
    }

    const permCtx = await ApprovalChainService._verifyOperatorPermission(
      step,
      operatorId,
      transaction
    )

    const now = BeijingTimeHelper.createDatabaseTime()

    if (action === 'approve') {
      /*
       * 会签子记录（2026-06-20 会签支持）：每个审批动作写一条 approval_chain_step_actions，
       * DB 唯一约束 uk_step_actor(step_id, actioned_by) 防同一人重复投票（并发安全）。
       * 单签节点也写一条，保持审批留痕统一。
       */
      try {
        await ApprovalChainStepAction.create(
          {
            step_id: step.step_id,
            actioned_by: operatorId,
            action: 'approve',
            action_reason: reason || '审核通过',
            is_escalated: permCtx.is_escalated ? 1 : 0,
            actioned_at: now
          },
          { transaction }
        )
      } catch (err) {
        if (err.name === 'SequelizeUniqueConstraintError') {
          throw new BusinessError('您已审批过该步骤，请勿重复操作', 'APPROVAL_ERROR', 400)
        }
        throw err
      }

      /*
       * 会签满足判定（决策 8.6）：
       * - 单签（single）：1 个 approve 即满足。
       * - 会签（countersign）：approved_count + 1 凑够 required_approvals 才满足。
       * - admin 越级（is_escalated）：一次越级直接满足整个会签节点（异常兜底通道，决策 8.6.3）。
       */
      const isCountersign = step.approve_mode === 'countersign'
      const required = step.required_approvals || 1
      const newApprovedCount = (step.approved_count || 0) + 1
      const nodeSatisfied = !isCountersign || permCtx.is_escalated || newApprovedCount >= required

      // 越级留痕字段（仅在越级时写入，记录原应审角色与代审人）
      const escalationFields = permCtx.is_escalated
        ? {
            is_escalated: 1,
            original_assignee_role_id: permCtx.original_assignee_role_id,
            escalated_from_user_id: operatorId
          }
        : {}

      if (!nodeSatisfied) {
        /*
         * 会签未凑够人数：仅累加 approved_count，步骤保持 pending 不推进，等待其他会签人审批。
         * 当前操作人信息记到 step（最近一次审批人），完整审批名单在 step_actions 子表。
         */
        await step.update(
          {
            approved_count: newApprovedCount,
            action_reason: reason || '审核通过',
            actioned_by: operatorId,
            actioned_at: now,
            ...escalationFields
          },
          { transaction }
        )

        logger.info(
          `[审核链] 会签进度: step_id=${stepId}, approved=${newApprovedCount}/${required}（未满，保持 pending）`
        )

        return {
          action: 'approved',
          is_chain_completed: false,
          countersign_pending: true,
          approved_count: newApprovedCount,
          required_approvals: required,
          instance: step.instance,
          step
        }
      }

      // 满足（单签 / 会签凑够 / 越级）：标记步骤 approved
      await step.update(
        {
          status: 'approved',
          approved_count: newApprovedCount,
          action_reason: reason || '审核通过',
          actioned_by: operatorId,
          actioned_at: now,
          ...escalationFields
        },
        { transaction }
      )

      if (step.is_final) {
        await step.instance.update(
          {
            status: 'completed',
            final_result: 'approved',
            final_reason: reason || '审核通过',
            completed_at: now
          },
          { transaction }
        )

        logger.info(`[审核链] 终审通过: instance_id=${step.instance_id}, step_id=${stepId}`)

        // 通知提交人：审核链已完成（通过）
        try {
          if (step.instance.submitted_by) {
            await AdminNotification.create(
              {
                admin_id: step.instance.submitted_by,
                title: '审核已通过',
                content: `${step.instance.auditable_type}审核 #${step.instance.auditable_id} 已通过终审`,
                notification_type: 'system',
                priority: 'normal',
                source_type: 'approval_chain',
                source_id: step.instance_id,
                extra_data: {
                  event: 'approval_chain_approved',
                  instance_id: step.instance_id,
                  final_result: 'approved'
                }
              },
              { transaction }
            )
          }
        } catch (notifyError) {
          logger.warn(`[审核链] 终审通过通知提交人失败（非致命）: ${notifyError.message}`)
        }

        return {
          action: 'approved',
          is_chain_completed: true,
          final_result: 'approved',
          instance: step.instance,
          step
        }
      } else {
        const nextResult = await ApprovalChainService.advanceToNextStep(step.instance, step, {
          transaction
        })
        logger.info(
          `[审核链] 推进到下一步: instance_id=${step.instance_id}, next_step=${nextResult.next_step_number}`
        )

        return {
          action: 'approved',
          is_chain_completed: false,
          next_step_number: nextResult.next_step_number,
          instance: step.instance,
          step
        }
      }
    } else {
      /*
       * 拒绝：写会签子记录（同样防重复投票）。任一 reject 即整体拒绝（会签也是一票否决）。
       */
      try {
        await ApprovalChainStepAction.create(
          {
            step_id: step.step_id,
            actioned_by: operatorId,
            action: 'reject',
            action_reason: reason,
            is_escalated: permCtx.is_escalated ? 1 : 0,
            actioned_at: now
          },
          { transaction }
        )
      } catch (err) {
        if (err.name === 'SequelizeUniqueConstraintError') {
          throw new BusinessError('您已审批过该步骤，请勿重复操作', 'APPROVAL_ERROR', 400)
        }
        throw err
      }

      const rejectEscalationFields = permCtx.is_escalated
        ? {
            is_escalated: 1,
            original_assignee_role_id: permCtx.original_assignee_role_id,
            escalated_from_user_id: operatorId
          }
        : {}

      await step.update(
        {
          status: 'rejected',
          action_reason: reason,
          actioned_by: operatorId,
          actioned_at: now,
          ...rejectEscalationFields
        },
        { transaction }
      )

      await step.instance.update(
        {
          status: 'rejected',
          final_result: 'rejected',
          final_reason: reason,
          completed_at: now
        },
        { transaction }
      )

      const remainingSteps = await ApprovalChainStep.findAll({
        where: {
          instance_id: step.instance_id,
          status: 'waiting'
        },
        transaction
      })
      for (const remainingStep of remainingSteps) {
        // eslint-disable-next-line no-await-in-loop
        await remainingStep.update({ status: 'skipped' }, { transaction })
      }

      logger.info(`[审核链] 审核拒绝: instance_id=${step.instance_id}, step_id=${stepId}`)

      // 通知提交人：审核链已拒绝
      try {
        if (step.instance.submitted_by) {
          await AdminNotification.create(
            {
              admin_id: step.instance.submitted_by,
              title: '审核已拒绝',
              content: `${step.instance.auditable_type}审核 #${step.instance.auditable_id} 已被拒绝，原因：${reason}`,
              notification_type: 'alert',
              priority: 'high',
              source_type: 'approval_chain',
              source_id: step.instance_id,
              extra_data: {
                event: 'approval_chain_rejected',
                instance_id: step.instance_id,
                final_result: 'rejected',
                reason
              }
            },
            { transaction }
          )
        }
      } catch (notifyError) {
        logger.warn(`[审核链] 审核拒绝通知提交人失败（非致命）: ${notifyError.message}`)
      }

      return {
        action: 'rejected',
        is_chain_completed: true,
        final_result: 'rejected',
        instance: step.instance,
        step
      }
    }
  }

  /**
   * 推进到下一个审核步骤
   *
   * @param {ApprovalChainInstance} instance - 审核链实例
   * @param {ApprovalChainStep} currentStep - 当前步骤
   * @param {Object} options - 选项（含 transaction）
   * @returns {Promise<Object>} 推进结果
   */
  static async advanceToNextStep(instance, currentStep, options = {}) {
    const transaction = assertAndGetTransaction(options, 'ApprovalChainService.advanceToNextStep')

    const nextStep = await ApprovalChainStep.findOne({
      where: {
        instance_id: instance.instance_id,
        status: 'waiting',
        step_number: { [Op.gt]: currentStep.step_number }
      },
      include: [{ model: ApprovalChainNode, as: 'node' }],
      order: [['step_number', 'ASC']],
      transaction
    })

    if (!nextStep) {
      throw new BusinessError(
        `[审核链] 无下一步骤，但当前步骤不是终审: instance_id=${instance.instance_id}`,
        'APPROVAL_ERROR',
        400
      )
    }

    const timeoutAt = new Date(Date.now() + (nextStep.node?.timeout_hours || 12) * 3600 * 1000)

    await nextStep.update(
      {
        status: 'pending',
        timeout_at: timeoutAt
      },
      { transaction }
    )

    /*
     * current_step 为「当前进行到第几步」的 1-based 序位（1..total_steps），
     * 通过统计本实例中 step_number <= 下一步 step_number 的步骤数得到其序位，
     * 避免把稀疏的 step_number（如 3/9）直接当作进度序位（会出现"第9步/共2步"的矛盾显示）。
     */
    const nextOrdinal = await ApprovalChainStep.count({
      where: {
        instance_id: instance.instance_id,
        step_number: { [Op.lte]: nextStep.step_number }
      },
      transaction
    })

    await instance.update(
      {
        current_step: nextOrdinal
      },
      { transaction }
    )

    // 通知下一步审核人
    try {
      const node =
        nextStep.node || (await ApprovalChainNode.findByPk(nextStep.node_id, { transaction }))
      if (node) {
        const notifyUserIds = await ApprovalChainService._resolveAssigneeUserIds(
          node,
          transaction,
          nextStep.store_id
        )
        for (const adminId of notifyUserIds) {
          // eslint-disable-next-line no-await-in-loop
          await AdminNotification.create(
            {
              admin_id: adminId,
              title: '审核任务推进',
              content: `${instance.auditable_type}审核 #${instance.auditable_id} 已推进到您，请审核`,
              notification_type: 'task',
              priority: 'normal',
              source_type: 'approval_chain',
              source_id: instance.instance_id,
              extra_data: {
                event: 'approval_chain_advanced',
                instance_id: instance.instance_id,
                step_number: nextStep.step_number
              }
            },
            { transaction }
          )
        }
      }
    } catch (notifyError) {
      logger.warn(`[审核链] 推进步骤后通知审核人失败（非致命）: ${notifyError.message}`)
    }

    return { next_step_number: nextStep.step_number, next_step: nextStep }
  }

  /**
   * 为审核链数据附加 auditable_type 的中文显示名（auditable_type_display）
   *
   * 复用统一字典体系（system_dictionaries.dict_type='auditable_type' + displayNameHelper），
   * 前端直接读 auditable_type_display 中文，不做本地映射。
   * 兼容两种结构：① 顶层实例（含 auditable_type）；② 待办步骤行（含 instance.auditable_type）。
   *
   * @param {Object|Array|null} data - 实例对象、实例数组或待办步骤行数组
   * @returns {Promise<Object|Array|null>} 原数据（已附加中文字段）
   * @private
   */
  static async _attachAuditableTypeDisplay(data) {
    if (!data) return data
    // 统一转为 plain object（Sequelize 实例直接挂属性不会进入 toJSON 输出，必须先 plain 化）
    const toPlain = row => (row && typeof row.get === 'function' ? row.get({ plain: true }) : row)
    const isArray = Array.isArray(data)
    const plainData = isArray ? data.map(toPlain) : toPlain(data)
    const list = isArray ? plainData : [plainData]
    // 收集承载 auditable_type 的目标对象：顶层实例本身，或步骤行的 instance 子对象
    const targets = list
      .map(row => {
        if (row && row.auditable_type) return row
        if (row && row.instance && row.instance.auditable_type) return row.instance
        return null
      })
      .filter(Boolean)
    if (targets.length > 0) {
      await attachDisplayNames(targets, [{ field: 'auditable_type', dictType: 'auditable_type' }])
    }
    return plainData
  }

  /**
   * 按业务记录查询审核链实例
   *
   * @param {string} auditableType - 业务类型
   * @param {number} auditableId - 业务记录ID
   * @returns {Promise<Object|null>} 审核链实例或null
   */
  static async getInstanceByAuditable(auditableType, auditableId) {
    const instance = await ApprovalChainInstance.findOne({
      where: { auditable_type: auditableType, auditable_id: auditableId },
      include: [
        {
          model: ApprovalChainStep,
          as: 'steps',
          include: [
            { model: ApprovalChainNode, as: 'node' },
            { model: User, as: 'assignee', attributes: ['user_id', 'nickname', 'mobile'] },
            { model: User, as: 'actor', attributes: ['user_id', 'nickname', 'mobile'] }
          ],
          order: [['step_number', 'ASC']]
        },
        {
          model: ApprovalChainTemplate,
          as: 'template'
        }
      ],
      order: [['created_at', 'DESC']]
    })
    return ApprovalChainService._attachAuditableTypeDisplay(instance)
  }

  /**
   * 批量按业务记录查询审核链进度（避免 N+1，供消费记录列表等场景装配 chain_info）
   *
   * 一次查询本页全部 auditable_id 的审核链实例（含 steps + node），在内存按 auditable_id 归并，
   * 组装「当前进度」结构。复用现有实例/步骤/节点关联，不新增表、不改表结构。
   *
   * @param {string} auditableType - 业务类型（如 'consumption'）
   * @param {number[]} auditableIds - 业务记录ID数组（如本页 consumption_record_id 列表）
   * @returns {Promise<Map>} auditable_id → 进度对象 chain_info（无审核链的 id 不在 Map 中）
   */
  static async getInstancesByAuditableIds(auditableType, auditableIds) {
    const map = new Map()
    const ids = [...new Set((auditableIds || []).map(Number).filter(Boolean))]
    if (ids.length === 0) {
      return map
    }

    const instances = await ApprovalChainInstance.findAll({
      where: { auditable_type: auditableType, auditable_id: { [Op.in]: ids } },
      include: [
        {
          model: ApprovalChainStep,
          as: 'steps',
          include: [{ model: ApprovalChainNode, as: 'node' }],
          order: [['step_number', 'ASC']]
        }
      ],
      order: [['created_at', 'DESC']]
    })

    for (const inst of instances) {
      const auditableId = Number(inst.auditable_id)
      // 同一业务记录可能有历史实例，按 created_at DESC 取最新一条（首次写入即最新）
      if (map.has(auditableId)) {
        continue
      }
      /*
       * current_step 是「当前进行到第几步」的 1-based 序位（1..total_steps），
       * 而 steps.step_number 是模板节点的稀疏排序号（如 3/9），两者不相等。
       * 取「按 step_number 升序排列后的第 current_step 个步骤」的节点名才是当前节点。
       */
      const orderedSteps = (inst.steps || []).slice().sort((a, b) => a.step_number - b.step_number)
      const currentStep = orderedSteps[inst.current_step - 1]
      map.set(auditableId, {
        current_step: inst.current_step,
        total_steps: inst.total_steps,
        status: inst.status,
        current_node_name: currentStep?.node?.node_name || null
      })
    }

    return map
  }

  /**
   * 查询用户的待审核步骤（叠加门店/区域范围隔离）
   *
   * 包含角色池模式（用户所拥有的角色对应的待审核步骤）、指定人模式，
   * 以及 submitter_manager 模式（按"我管辖门店"命中）。非 admin 用户的 consumption 待办
   * 会按 _getUserScopedStoreIds 计算的"可审门店集合"过滤，杜绝跨店串信息/串审核；
   * admin(lv100+) 不隔离，看全部待办。
   *
   * @param {number} userId - 用户ID
   * @param {Object} [queryOptions] - 查询选项
   * @param {number} [queryOptions.page=1] - 页码
   * @param {number} [queryOptions.page_size=20] - 每页数量
   * @returns {Promise<Object>} { rows, count }
   */
  static async getPendingStepsForUser(userId, queryOptions = {}) {
    const page = parseInt(queryOptions.page, 10) || 1
    const page_size = parseInt(queryOptions.page_size, 10) || 20

    const userRoles = await UserRole.findAll({
      where: { user_id: userId, is_active: 1 },
      include: [{ model: Role, as: 'role', attributes: ['role_id', 'role_level'] }]
    })
    const roleIds = userRoles.map(ur => ur.role_id)
    const operatorLevel = userRoles.reduce((max, ur) => Math.max(max, ur.role?.role_level || 0), 0)
    const isAdmin = operatorLevel >= 100

    /*
     * 待办范围隔离（2026-06-20 分级审核链升级，杜绝串信息/串审核）：
     * - admin(lv100+)：看全部待办（终极兜底，不隔离）。
     * - 非 admin：先按"分配给我"（指定人/角色池）筛出候选，再叠加门店/区域范围隔离——
     *   consumption 步骤（step.store_id 有值）只保留我管辖门店内的；
     *   merchant_points 等无门店步骤（store_id 为空）按原角色/指定人语义保留。
     *   submitter_manager 步骤无 assignee_role_id/user_id，靠"我管辖门店"命中纳入待办。
     */
    const scopedStoreIds = isAdmin
      ? null
      : await ApprovalChainService._getUserScopedStoreIds(userId)
    const scopedStoreArr = scopedStoreIds ? Array.from(scopedStoreIds) : []

    let whereCondition
    if (isAdmin) {
      whereCondition = { status: 'pending' }
    } else {
      // "分配给我"的候选条件：指定人是我 / 角色池命中我的角色 / 我管辖门店的步骤（覆盖 submitter_manager）
      const assignedOr = [
        { assignee_user_id: userId },
        ...(roleIds.length > 0 ? [{ assignee_role_id: { [Op.in]: roleIds } }] : []),
        ...(scopedStoreArr.length > 0 ? [{ store_id: { [Op.in]: scopedStoreArr } }] : [])
      ]
      whereCondition = {
        status: 'pending',
        [Op.and]: [
          { [Op.or]: assignedOr },
          // 门店步骤必须落在我管辖门店内；无门店步骤（store_id 为空）不受门店隔离约束
          {
            [Op.or]: [
              { store_id: null },
              ...(scopedStoreArr.length > 0 ? [{ store_id: { [Op.in]: scopedStoreArr } }] : [])
            ]
          }
        ]
      }
    }

    const { count, rows } = await ApprovalChainStep.findAndCountAll({
      where: whereCondition,
      include: [
        {
          model: ApprovalChainInstance,
          as: 'instance',
          include: [{ model: ApprovalChainTemplate, as: 'template' }]
        },
        { model: ApprovalChainNode, as: 'node' }
      ],
      order: [['created_at', 'ASC']],
      limit: page_size,
      offset: (page - 1) * page_size
    })

    const displayRows = await ApprovalChainService._attachAuditableTypeDisplay(rows)
    ApprovalChainService._attachStepProgress(displayRows)
    await ApprovalChainService._attachParties(displayRows)
    return { rows: displayRows, count, page, page_size, total_pages: Math.ceil(count / page_size) }
  }

  /**
   * 为待办步骤行附加「零歧义进度字段」（progress_*），供前端直读，避免误用步骤的 step_number 当进度。
   *
   * 背景：每行的 step.step_number 是模板节点的稀疏排序号（如 9=管理员终审），仅用于排序/定位下一步，
   * 不是「当前进行到第几步」。真正的进度是 instance.current_step（1-based 序位，1..total_steps）。
   * 前端若误取 step_number 会显示「第9步/共2步」的矛盾。这里统一在顶层下发权威进度，前端零计算。
   *
   * @param {Array<Object>} rows - 待办步骤行数组（plain object，含嵌套 instance）
   * @returns {void} 原地附加字段
   * @private
   */
  static _attachStepProgress(rows) {
    if (!Array.isArray(rows)) return
    for (const row of rows) {
      const inst = row && row.instance
      if (!inst) continue
      const current = Number(inst.current_step) || null
      const total = Number(inst.total_steps) || null
      row.progress_current_step = current
      row.progress_total_steps = total
      row.progress_text = current && total ? `第${current}步/共${total}步` : null
    }
  }

  /**
   * 为待办步骤行附加「提交人 + 被审核人」信息（用户名 + 脱敏手机号），供小程序审批详情展示。
   *
   * 背景（2026-06-24）：/my-pending 原查询只带 instance/template/node，未下发任何用户信息，
   * 导致小程序审批详情看不到「提交人 / 被审核人」。本方法批量补齐，避免 N+1。
   *
   * 字段语义：
   * - submitter_info：审批发起人（instance.submitted_by；消费审核场景=录入该单的店员）
   * - target_user_info：被审核业务的当事人（仅 consumption 场景=消费顾客 consumption_records.user_id）
   *
   * 🔐 安全：手机号一律经 sanitize.mobile 脱敏为 136****7930 后下发（发小程序，防泄露完整号）。
   *
   * @param {Array<Object>} rows - 待办步骤行（plain object，含嵌套 instance）
   * @returns {Promise<void>} 原地附加 submitter_info / target_user_info
   * @private
   */
  static async _attachParties(rows) {
    if (!Array.isArray(rows) || rows.length === 0) return
    const models = require('../models')
    const ConsumptionRecord = models.ConsumptionRecord

    // 1. 收集提交人 user_id（来自 instance.submitted_by）
    const submitterIds = new Set()
    // 2. 收集 consumption 类待办的 auditable_id（用于反查被审核顾客）
    const consumptionInstanceIds = []
    for (const row of rows) {
      const inst = row && row.instance
      if (!inst) continue
      if (inst.submitted_by) submitterIds.add(Number(inst.submitted_by))
      if (inst.auditable_type === 'consumption' && inst.auditable_id) {
        consumptionInstanceIds.push({ row, auditable_id: Number(inst.auditable_id) })
      }
    }

    // 3. 一次性查消费记录 → 顾客 user_id（被审核人）
    const targetUserIdByRow = new Map()
    if (consumptionInstanceIds.length > 0 && ConsumptionRecord) {
      const crIds = [...new Set(consumptionInstanceIds.map(x => x.auditable_id))]
      const crs = await ConsumptionRecord.findAll({
        where: { consumption_record_id: { [Op.in]: crIds } },
        attributes: ['consumption_record_id', 'user_id'],
        raw: true
      })
      const crUserMap = new Map(crs.map(r => [Number(r.consumption_record_id), Number(r.user_id)]))
      for (const { row, auditable_id } of consumptionInstanceIds) {
        const uid = crUserMap.get(auditable_id)
        if (uid) {
          targetUserIdByRow.set(row, uid)
          submitterIds.add(uid)
        }
      }
    }

    // 4. 一次性查所有涉及的 User（提交人 + 被审核人），脱敏手机号
    /*
     * 注意：User.mobile 是虚拟字段（读时解密 mobile_encrypted），不能用 raw:true（否则拿到密文/空），
     * 须用模型实例经 getter 解密后再脱敏。
     */
    const allUserIds = [...submitterIds]
    if (allUserIds.length === 0) return
    const users = await User.findAll({
      where: { user_id: { [Op.in]: allUserIds } },
      attributes: ['user_id', 'nickname', 'mobile_encrypted']
    })
    const userMap = new Map(
      users.map(u => [
        Number(u.user_id),
        { user_id: Number(u.user_id), nickname: u.nickname, mobile: sanitize.mobile(u.mobile) }
      ])
    )

    // 5. 原地附加（前端零映射直读）
    for (const row of rows) {
      const inst = row && row.instance
      if (!inst) continue
      row.submitter_info = inst.submitted_by ? userMap.get(Number(inst.submitted_by)) || null : null
      const targetUid = targetUserIdByRow.get(row)
      row.target_user_info = targetUid ? userMap.get(targetUid) || null : null
    }
  }

  /**
   * 按角色查询待审核步骤
   *
   * 查询指定角色 ID 被分配为审核人的所有 pending 步骤，
   * 用于角色维度的待办统计和审核队列展示。
   *
   * @param {number} roleId - 角色ID（如 business_manager 的 role_id）
   * @param {Object} [queryOptions] - 查询选项
   * @param {number} [queryOptions.page=1] - 页码
   * @param {number} [queryOptions.page_size=20] - 每页数量
   * @param {string} [queryOptions.auditable_type] - 按业务类型筛选
   * @returns {Promise<Object>} { rows, count, page, page_size, total_pages }
   */
  static async getPendingStepsForRole(roleId, queryOptions = {}) {
    const page = parseInt(queryOptions.page, 10) || 1
    const page_size = parseInt(queryOptions.page_size, 10) || 20
    const { auditable_type } = queryOptions

    const whereCondition = {
      status: 'pending',
      assignee_role_id: roleId
    }

    const instanceWhere = {}
    if (auditable_type) instanceWhere.auditable_type = auditable_type

    const { count, rows } = await ApprovalChainStep.findAndCountAll({
      where: whereCondition,
      include: [
        {
          model: ApprovalChainInstance,
          as: 'instance',
          where: Object.keys(instanceWhere).length > 0 ? instanceWhere : undefined,
          include: [{ model: ApprovalChainTemplate, as: 'template' }]
        },
        { model: ApprovalChainNode, as: 'node' }
      ],
      order: [['created_at', 'ASC']],
      limit: page_size,
      offset: (page - 1) * page_size
    })

    const displayRows = await ApprovalChainService._attachAuditableTypeDisplay(rows)
    ApprovalChainService._attachStepProgress(displayRows)
    return { rows: displayRows, count, page, page_size, total_pages: Math.ceil(count / page_size) }
  }

  /**
   * 查询审核链模板列表
   *
   * @param {Object} [queryOptions] - 查询选项
   * @returns {Promise<Object>} 分页结果 { rows, count }
   */
  static async getTemplates(queryOptions = {}) {
    const { auditable_type, is_active } = queryOptions
    const page = parseInt(queryOptions.page, 10) || 1
    const page_size = parseInt(queryOptions.page_size, 10) || 20
    const where = {}
    if (auditable_type) where.auditable_type = auditable_type
    if (is_active !== undefined) where.is_active = is_active

    const { count, rows } = await ApprovalChainTemplate.findAndCountAll({
      where,
      include: [
        {
          model: ApprovalChainNode,
          as: 'nodes',
          order: [['step_number', 'ASC']]
        }
      ],
      order: [
        ['priority', 'DESC'],
        ['created_at', 'DESC']
      ],
      limit: page_size,
      offset: (page - 1) * page_size
    })

    const displayRows = await ApprovalChainService._attachAuditableTypeDisplay(rows)
    return { rows: displayRows, count, page, page_size, total_pages: Math.ceil(count / page_size) }
  }

  /**
   * 获取模板详情
   *
   * @param {number} templateId - 模板ID
   * @returns {Promise<Object>} 模板详情
   */
  static async getTemplateById(templateId) {
    const template = await ApprovalChainTemplate.findByPk(templateId, {
      include: [
        {
          model: ApprovalChainNode,
          as: 'nodes',
          include: [
            {
              model: Role,
              as: 'assignee_role',
              attributes: ['role_id', 'role_name', 'role_level']
            },
            { model: User, as: 'assignee_user', attributes: ['user_id', 'nickname', 'mobile'] }
          ],
          order: [['step_number', 'ASC']]
        },
        {
          model: User,
          as: 'creator',
          attributes: ['user_id', 'nickname']
        }
      ]
    })
    if (!template) {
      throw new BusinessError(
        `审核链模板不存在: template_id=${templateId}`,
        'APPROVAL_NOT_FOUND',
        404
      )
    }
    return ApprovalChainService._attachAuditableTypeDisplay(template)
  }

  /**
   * 创建审核链模板（含节点）
   *
   * @param {Object} data - 模板数据
   * @param {Object} options - 含 transaction
   * @returns {Promise<Object>} 创建的模板
   */
  static async createTemplate(data, options = {}) {
    const transaction = assertAndGetTransaction(options, 'ApprovalChainService.createTemplate')

    const { nodes = [], ...templateData } = data
    templateData.total_nodes = nodes.filter(n => n.step_number > 1).length

    /*
     * 模板编码（template_code）由后端自动生成，运营无需填写。
     * 业务背景：template_code 是给系统识别的唯一英文 ID，要求唯一且格式规范，
     * 让业务运营手填易出错（重复/格式乱）。改为按"业务类型 + 递增序号"自动生成，
     * 如 consumption_001 / merchant_points_002，运营只需填中文名称即可。
     * 前端不再传 template_code；即便传了也以自动生成为准，保证唯一性与命名一致性。
     */
    templateData.template_code = await ApprovalChainService._generateTemplateCode(
      templateData.auditable_type,
      transaction
    )

    const template = await ApprovalChainTemplate.create(templateData, { transaction })

    for (const nodeData of nodes) {
      // eslint-disable-next-line no-await-in-loop
      await ApprovalChainNode.create(
        {
          ...nodeData,
          template_id: template.template_id
        },
        { transaction }
      )
    }

    logger.info(
      `[审核链] 模板创建成功: template_id=${template.template_id}, code=${template.template_code}`
    )
    return template
  }

  /**
   * 自动生成唯一的模板编码（template_code）
   *
   * 规则：{auditable_type}_{三位递增序号}，如 consumption_001、merchant_points_003。
   * 取该业务类型下已有 _\d+ 后缀编码的最大序号 +1；为兼容历史语义化编码
   * （如 consumption_default/large）做唯一性兜底，冲突则继续递增直到不冲突。
   *
   * @param {string} auditableType - 业务类型（consumption/merchant_points）
   * @param {Object} transaction - Sequelize 事务
   * @returns {Promise<string>} 唯一模板编码
   * @private
   */
  static async _generateTemplateCode(auditableType, transaction) {
    const existing = await ApprovalChainTemplate.findAll({
      where: { auditable_type: auditableType },
      attributes: ['template_code'],
      transaction
    })
    const codes = new Set(existing.map(t => t.template_code))

    // 取已有 {type}_数字 后缀的最大序号
    let maxSeq = 0
    const re = new RegExp(`^${auditableType}_(\\d+)$`)
    for (const code of codes) {
      const m = code.match(re)
      if (m) {
        maxSeq = Math.max(maxSeq, parseInt(m[1], 10))
      }
    }

    // 从 maxSeq+1 起找一个不冲突的编码（兜底历史语义化编码占位）
    let seq = maxSeq + 1
    let candidate = `${auditableType}_${String(seq).padStart(3, '0')}`
    while (codes.has(candidate)) {
      seq += 1
      candidate = `${auditableType}_${String(seq).padStart(3, '0')}`
    }
    return candidate
  }

  /**
   * 审核链模板冲突预检（只读，不写库）— 保存前演练，提示运营潜在配置风险
   *
   * 复用与运行时一致的匹配规则（priority DESC + match_conditions），分析"待保存的这条链"
   * 与该业务类型下现有启用链的关系，检测 4 类风险：
   *   1. shadow        架空：本链 priority 更高且条件更宽（含无条件），会让更低优先级的链永远匹配不到
   *   2. shadowed      被架空：已有更高优先级且条件更宽的链，会让本链永远匹配不到
   *   3. no_fallback   兜底缺失：保存后该业务类型仍无任何"无条件兜底链"，部分业务可能匹配不到链
   *   4. dup_priority  优先级重复：与现有链 priority 相同，匹配顺序不确定
   *   5. overlap       条件重叠：与现有链金额区间存在重叠（同优先级时尤其需注意）
   *
   * @param {Object} candidate - 待保存模板 { auditable_type, priority, match_conditions, template_id? }
   *   template_id 存在表示"编辑"场景，比较时排除自身。
   * @returns {Promise<{has_risk: boolean, risks: Array}>} 预检结果：has_risk 是否有风险，risks 风险明细列表
   */
  static async detectTemplateConflicts(candidate = {}) {
    const auditableType = candidate.auditable_type
    const priority = Number(candidate.priority) || 0
    const cond = candidate.match_conditions || {}
    const selfId = candidate.template_id ? Number(candidate.template_id) : null

    const risks = []
    if (!auditableType) {
      return { has_risk: false, risks }
    }

    // 取该业务类型下现有启用链（编辑场景排除自身）
    const existing = await ApprovalChainTemplate.findAll({
      where: { auditable_type: auditableType, is_active: 1 },
      attributes: ['template_id', 'template_code', 'template_name', 'priority', 'match_conditions'],
      order: [['priority', 'DESC']]
    })
    const others = existing.filter(t => selfId == null || t.template_id !== selfId)

    // 条件"宽窄"用 min_amount 表达：无 min_amount=最宽（门槛0）；min_amount 越小越宽
    const selfMin = cond.min_amount != null ? Number(cond.min_amount) : 0
    const isUnconditional = c => {
      const mc = c || {}
      return mc.min_amount == null && !mc.store_ids && !mc.merchant_ids
    }

    for (const t of others) {
      const oMc = t.match_conditions || {}
      const oMin = oMc.min_amount != null ? Number(oMc.min_amount) : 0
      const tag = `「${t.template_name}（${t.template_code}, 优先级${t.priority}）」`

      // 1. 本链架空别人：本链优先级更高，且本链门槛更低/相等（更宽）→ 低优先链永远轮不到
      if (priority > t.priority && selfMin <= oMin) {
        risks.push({
          type: 'shadow',
          level: 'high',
          message: `本链优先级(${priority})高于${tag}且触发门槛更宽，将使其永远无法匹配（被架空）。建议本链设更高的金额门槛，或调低本链优先级。`
        })
      }

      // 2. 本链被别人架空：已有更高优先级链且其门槛更宽 → 本链永远轮不到
      if (t.priority > priority && oMin <= selfMin) {
        risks.push({
          type: 'shadowed',
          level: 'high',
          message: `${tag}优先级更高且触发门槛更宽，本链将永远无法匹配（被架空）。建议提高本链优先级，或让本链门槛比它更低。`
        })
      }

      // 3. 优先级重复
      if (t.priority === priority) {
        risks.push({
          type: 'dup_priority',
          level: 'medium',
          message: `本链与${tag}优先级相同(${priority})，匹配顺序不确定。建议设置不同优先级。`
        })
      }

      // 4. 条件重叠（同优先级且金额门槛相同/相近时，二者会争抢同一批业务）
      if (t.priority === priority && selfMin === oMin) {
        risks.push({
          type: 'overlap',
          level: 'medium',
          message: `本链与${tag}优先级与金额门槛均相同，触发条件完全重叠，会随机命中其一。建议区分条件或优先级。`
        })
      }
    }

    // 5. 兜底缺失：保存后该业务类型是否仍无任何"无条件兜底链"
    const selfUnconditional = isUnconditional(cond)
    const anyOtherUnconditional = others.some(t => isUnconditional(t.match_conditions))
    if (!selfUnconditional && !anyOtherUnconditional) {
      risks.push({
        type: 'no_fallback',
        level: 'high',
        message: `该业务类型缺少"无条件兜底链"（触发条件留空的链）。低于所有门槛的业务将匹配不到任何审核链，导致提交失败。建议保留一条触发条件留空的兜底链。`
      })
    }

    // 去重（同 type+message 只报一次）
    const seen = new Set()
    const dedup = risks.filter(r => {
      const k = `${r.type}|${r.message}`
      if (seen.has(k)) return false
      seen.add(k)
      return true
    })

    return { has_risk: dedup.length > 0, risks: dedup }
  }

  /**
   * 更新审核链模板
   *
   * @param {number} templateId - 模板ID
   * @param {Object} data - 更新数据
   * @param {Object} options - 含 transaction
   * @returns {Promise<Object>} 更新后的模板
   */
  static async updateTemplate(templateId, data, options = {}) {
    const transaction = assertAndGetTransaction(options, 'ApprovalChainService.updateTemplate')

    const template = await ApprovalChainTemplate.findByPk(templateId, { transaction })
    if (!template) {
      throw new BusinessError(
        `审核链模板不存在: template_id=${templateId}`,
        'APPROVAL_NOT_FOUND',
        404
      )
    }

    const activeInstances = await ApprovalChainInstance.count({
      where: { template_id: templateId, status: 'in_progress' },
      transaction
    })
    if (activeInstances > 0) {
      throw new BusinessError(
        `该模板有 ${activeInstances} 个进行中的审核实例，不可修改节点。请先完成或取消这些实例。`,
        'APPROVAL_NOT_ALLOWED',
        400
      )
    }

    const { nodes, ...templateData } = data

    if (nodes) {
      templateData.total_nodes = nodes.filter(n => n.step_number > 1).length
      await ApprovalChainNode.destroy({ where: { template_id: templateId }, transaction })
      for (const nodeData of nodes) {
        // eslint-disable-next-line no-await-in-loop
        await ApprovalChainNode.create(
          {
            ...nodeData,
            template_id: templateId
          },
          { transaction }
        )
      }
    }

    await template.update(templateData, { transaction })
    logger.info(`[审核链] 模板更新成功: template_id=${templateId}`)
    return template
  }

  /**
   * 启用/禁用模板
   *
   * @param {number} templateId - 模板ID
   * @param {Object} options - 含 transaction
   * @returns {Promise<Object>} 更新后的模板
   */
  static async toggleTemplate(templateId, options = {}) {
    const transaction = assertAndGetTransaction(options, 'ApprovalChainService.toggleTemplate')
    const template = await ApprovalChainTemplate.findByPk(templateId, { transaction })
    if (!template) {
      throw new BusinessError(
        `审核链模板不存在: template_id=${templateId}`,
        'APPROVAL_NOT_FOUND',
        404
      )
    }

    await template.update({ is_active: template.is_active ? 0 : 1 }, { transaction })
    logger.info(`[审核链] 模板${template.is_active ? '启用' : '禁用'}: template_id=${templateId}`)
    return template
  }

  /**
   * 查询审核链实例列表
   *
   * @param {Object} [queryOptions] - 查询选项
   * @returns {Promise<Object>} 分页结果
   */
  static async getInstances(queryOptions = {}) {
    const { auditable_type, status } = queryOptions
    const page = parseInt(queryOptions.page, 10) || 1
    const page_size = parseInt(queryOptions.page_size, 10) || 20
    const where = {}
    if (auditable_type) where.auditable_type = auditable_type
    if (status) where.status = status

    const { count, rows } = await ApprovalChainInstance.findAndCountAll({
      where,
      include: [
        {
          model: ApprovalChainTemplate,
          as: 'template',
          attributes: ['template_id', 'template_code', 'template_name']
        },
        { model: User, as: 'submitter', attributes: ['user_id', 'nickname', 'mobile'] }
      ],
      order: [['created_at', 'DESC']],
      limit: page_size,
      offset: (page - 1) * page_size
    })

    const displayRows = await ApprovalChainService._attachAuditableTypeDisplay(rows)
    return { rows: displayRows, count, page, page_size, total_pages: Math.ceil(count / page_size) }
  }

  /**
   * 获取实例详情（含完整步骤和审核历史）
   *
   * @param {number} instanceId - 实例ID
   * @returns {Promise<Object>} 实例详情
   */
  static async getInstanceById(instanceId) {
    const instance = await ApprovalChainInstance.findByPk(instanceId, {
      include: [
        { model: ApprovalChainTemplate, as: 'template' },
        {
          model: ApprovalChainStep,
          as: 'steps',
          include: [
            { model: ApprovalChainNode, as: 'node' },
            { model: User, as: 'assignee', attributes: ['user_id', 'nickname', 'mobile'] },
            { model: User, as: 'actor', attributes: ['user_id', 'nickname', 'mobile'] },
            { model: Role, as: 'assigned_role', attributes: ['role_id', 'role_name', 'role_level'] }
          ],
          order: [['step_number', 'ASC']]
        },
        { model: User, as: 'submitter', attributes: ['user_id', 'nickname', 'mobile'] }
      ]
    })
    if (!instance) {
      throw new BusinessError(
        `审核链实例不存在: instance_id=${instanceId}`,
        'APPROVAL_NOT_FOUND',
        404
      )
    }
    return ApprovalChainService._attachAuditableTypeDisplay(instance)
  }

  /**
   * 审核统计聚合（Web 管理端数据看板，2026-06-20 决策 8.4/8.4.3/11.2）
   *
   * 按门店或区域维度聚合消费审核数据，供运营/管理层看板。读操作收口本 Service。
   * 数据来源：
   *   - consumption_records：按 store_id 分组的 待审/已审/通过/拒绝 数量、消费金额、奖励积分
   *   - approval_chain_steps（store_id + timeout_at）：各门店"超时未处理"步骤数（决策 8.6.3）
   * 区域维度（dimension='region'）：经 user_hierarchy 把门店聚合到其上级（区域负责人）下。
   *
   * @param {Object} [options] - 选项
   * @param {string} [options.dimension='store'] - 聚合维度：store=按门店，region=按区域
   * @returns {Promise<Object>} { dimension, rows: [...], summary: {...} }
   */
  static async getApprovalStats(options = {}) {
    const dimension = options.dimension === 'region' ? 'region' : 'store'
    const models = require('../models')
    const ConsumptionRecord = models.ConsumptionRecord
    const Store = models.Store

    // 1. 按门店聚合消费审核状态分布 + 金额 + 积分
    const byStore = await ConsumptionRecord.findAll({
      attributes: [
        'store_id',
        'status',
        [sequelize.fn('COUNT', sequelize.col('consumption_record_id')), 'cnt'],
        [sequelize.fn('SUM', sequelize.col('consumption_amount')), 'amount'],
        [sequelize.fn('SUM', sequelize.col('points_to_award')), 'points']
      ],
      where: { is_deleted: 0, store_id: { [Op.not]: null } },
      group: ['store_id', 'status'],
      raw: true
    })

    // 2. 各门店"超时未处理"步骤数（pending 且 timeout_at 已过期）
    const now = new Date()
    const timeoutByStore = await ApprovalChainStep.findAll({
      attributes: ['store_id', [sequelize.fn('COUNT', sequelize.col('step_id')), 'cnt']],
      where: { status: 'pending', store_id: { [Op.not]: null }, timeout_at: { [Op.lt]: now } },
      group: ['store_id'],
      raw: true
    })
    const timeoutMap = new Map()
    timeoutByStore.forEach(r => timeoutMap.set(Number(r.store_id), parseInt(r.cnt, 10) || 0))

    /*
     * 2.1 各门店审核时效（9.3 审核时效统计）：基于 approval_chain_steps 已审结步骤
     *     (created_at→actioned_at) 的平均耗时（秒），以及"已审结步骤里超时的占比" timeout_rate。
     *     复用客服响应时长同款写法 AVG(TIMESTAMPDIFF(SECOND, ...))。
     */
    const durationByStore = await ApprovalChainStep.findAll({
      attributes: [
        'store_id',
        [
          sequelize.fn('AVG', sequelize.literal('TIMESTAMPDIFF(SECOND, created_at, actioned_at)')),
          'avg_seconds'
        ],
        [sequelize.fn('COUNT', sequelize.col('step_id')), 'finished_cnt'],
        [
          sequelize.literal(
            "SUM(CASE WHEN status = 'timeout' OR (actioned_at IS NOT NULL AND timeout_at IS NOT NULL AND actioned_at > timeout_at) THEN 1 ELSE 0 END)"
          ),
          'overtime_cnt'
        ]
      ],
      where: {
        store_id: { [Op.not]: null },
        actioned_at: { [Op.not]: null },
        status: { [Op.in]: ['approved', 'rejected', 'timeout'] }
      },
      group: ['store_id'],
      raw: true
    })
    const durationMap = new Map()
    durationByStore.forEach(r => {
      durationMap.set(Number(r.store_id), {
        avg_seconds: Math.round(parseFloat(r.avg_seconds) || 0),
        finished_cnt: parseInt(r.finished_cnt, 10) || 0,
        overtime_cnt: parseInt(r.overtime_cnt, 10) || 0
      })
    })

    // 3. 门店元信息（名称）
    const stores = await Store.findAll({ attributes: ['store_id', 'store_name'], raw: true })
    const storeNameMap = new Map(stores.map(s => [Number(s.store_id), s.store_name]))

    // 4. 组装"按门店"统计行
    const storeStatsMap = new Map()
    const ensureStoreRow = sid => {
      const id = Number(sid)
      if (!storeStatsMap.has(id)) {
        storeStatsMap.set(id, {
          store_id: id,
          store_name: storeNameMap.get(id) || null,
          pending: 0,
          approved: 0,
          rejected: 0,
          expired: 0,
          timeout: timeoutMap.get(id) || 0,
          total: 0,
          amount: 0,
          points: 0,
          // 审核时效（9.3）：平均审核耗时（秒）+ 已审结步骤数 + 超时步骤数（用于算超时率）
          avg_duration_seconds: durationMap.get(id) ? durationMap.get(id).avg_seconds : 0,
          finished_steps: durationMap.get(id) ? durationMap.get(id).finished_cnt : 0,
          overtime_steps: durationMap.get(id) ? durationMap.get(id).overtime_cnt : 0
        })
      }
      return storeStatsMap.get(id)
    }
    byStore.forEach(r => {
      const row = ensureStoreRow(r.store_id)
      const cnt = parseInt(r.cnt, 10) || 0
      if (row[r.status] !== undefined) row[r.status] = cnt
      row.total += cnt
      row.amount += parseFloat(r.amount) || 0
      row.points += parseInt(r.points, 10) || 0
    })
    // 确保有超时但无消费分组的门店也出现
    timeoutMap.forEach((_v, sid) => ensureStoreRow(sid))

    // 通过率（已通过 / 已审结(通过+拒绝)）+ 审核时效（平均耗时友好文案 + 超时率）
    const finalizeRow = row => {
      const finished = row.approved + row.rejected
      row.pass_rate = finished > 0 ? Math.round((row.approved / finished) * 10000) / 100 : 0
      // 超时率 = 超时步骤数 / 已审结步骤数（按 approval_chain_steps 口径）
      row.timeout_rate =
        row.finished_steps > 0
          ? Math.round((row.overtime_steps / row.finished_steps) * 10000) / 100
          : 0
      row.avg_duration_text = ApprovalChainService._formatDurationSeconds(row.avg_duration_seconds)
      return row
    }
    const storeRows = Array.from(storeStatsMap.values()).map(finalizeRow)

    if (dimension === 'store') {
      return {
        dimension: 'store',
        rows: storeRows,
        summary: ApprovalChainService._sumStatsRows(storeRows)
      }
    }

    /*
     * 5. 区域维度：把门店聚合到其上级（区域负责人）
     *    user_hierarchy 中业务员挂 store_id，其 superior_user_id 即所属区域负责人
     */
    const hierarchies = await UserHierarchy.findAll({
      where: { is_active: true, store_id: { [Op.not]: null } },
      attributes: ['store_id', 'superior_user_id'],
      raw: true
    })
    const storeToSuperior = new Map()
    hierarchies.forEach(h => {
      if (h.store_id != null) storeToSuperior.set(Number(h.store_id), h.superior_user_id || null)
    })

    const regionMap = new Map()
    for (const row of storeRows) {
      const superiorId = storeToSuperior.get(row.store_id) ?? null
      const key = superiorId == null ? 'unassigned' : `region_${superiorId}`
      if (!regionMap.has(key)) {
        regionMap.set(key, {
          region_key: key,
          superior_user_id: superiorId,
          store_count: 0,
          pending: 0,
          approved: 0,
          rejected: 0,
          expired: 0,
          timeout: 0,
          total: 0,
          amount: 0,
          points: 0,
          // 时效聚合：跨门店按已审结步骤数加权平均
          finished_steps: 0,
          overtime_steps: 0,
          _duration_weighted_sum: 0
        })
      }
      const region = regionMap.get(key)
      region.store_count += 1
      region.pending += row.pending
      region.approved += row.approved
      region.rejected += row.rejected
      region.expired += row.expired
      region.timeout += row.timeout
      region.total += row.total
      region.amount += row.amount
      region.points += row.points
      region.finished_steps += row.finished_steps
      region.overtime_steps += row.overtime_steps
      region._duration_weighted_sum += row.avg_duration_seconds * row.finished_steps
    }
    const regionRows = Array.from(regionMap.values()).map(region => {
      // 区域平均耗时 = 各门店(平均耗时×已审结步骤数)之和 / 区域已审结步骤总数（加权平均）
      region.avg_duration_seconds =
        region.finished_steps > 0
          ? Math.round(region._duration_weighted_sum / region.finished_steps)
          : 0
      delete region._duration_weighted_sum
      return finalizeRow(region)
    })

    return {
      dimension: 'region',
      rows: regionRows,
      summary: ApprovalChainService._sumStatsRows(regionRows)
    }
  }

  /**
   * 运营分析看板（8.4.3 丰富分析，Web 管理端，2026-06-20）
   *
   * 一次性返回 4 类运营分析，供审核链管理页"数据统计"tab 的分析区（读操作收口本 Service）：
   *   - staff_ranking：员工录入排行（按 merchant_id 聚合录入单数/通过/驳回，帮店长/区域管人）
   *   - trend：消费/积分发放的日走势（按 created_at 分天，非快照）
   *   - reject_reasons：拒绝原因 TOP（基于 approval_chain_steps 被驳回步骤的 action_reason 聚合）
   *   - user_activity：用户复购/活跃（回头客数/新客数/消费次数分布）——
   *       ⚠️ 仅返回聚合数字，不含 user_id/mobile/nickname 等 PII，满足"脱敏、仅管理端可见、不下发小程序"。
   *
   * @param {Object} [options] - 选项
   * @param {number} [options.days=30] - 分析时间窗（天），默认近 30 天
   * @param {number} [options.store_id] - 可选，限定门店
   * @returns {Promise<Object>} { window_days, staff_ranking, trend, reject_reasons, user_activity }
   */
  static async getOperationAnalytics(options = {}) {
    const models = require('../models')
    const ConsumptionRecord = models.ConsumptionRecord
    const User = models.User
    const days = Math.min(Math.max(parseInt(options.days, 10) || 30, 1), 365)
    const since = new Date(Date.now() - days * 24 * 3600 * 1000)
    const storeId = options.store_id ? parseInt(options.store_id, 10) : null

    const baseWhere = { is_deleted: 0, created_at: { [Op.gte]: since } }
    if (storeId) baseWhere.store_id = storeId

    // 1. 员工录入排行（按 merchant_id 录入人聚合：录入数 + 各状态数）
    const staffRaw = await ConsumptionRecord.findAll({
      attributes: [
        'merchant_id',
        'status',
        [sequelize.fn('COUNT', sequelize.col('consumption_record_id')), 'cnt']
      ],
      where: { ...baseWhere, merchant_id: { [Op.not]: null } },
      group: ['merchant_id', 'status'],
      raw: true
    })
    const staffMap = new Map()
    staffRaw.forEach(r => {
      const id = Number(r.merchant_id)
      if (!staffMap.has(id)) {
        staffMap.set(id, { merchant_id: id, total: 0, approved: 0, rejected: 0, pending: 0 })
      }
      const row = staffMap.get(id)
      const cnt = parseInt(r.cnt, 10) || 0
      row.total += cnt
      if (row[r.status] !== undefined) row[r.status] += cnt
    })
    // 附录入人昵称（管理端可见，非小程序下发）
    const merchantIds = Array.from(staffMap.keys())
    if (merchantIds.length > 0) {
      const users = await User.findAll({
        where: { user_id: { [Op.in]: merchantIds } },
        attributes: ['user_id', 'nickname'],
        raw: true
      })
      const nameMap = new Map(users.map(u => [Number(u.user_id), u.nickname]))
      staffMap.forEach((row, id) => {
        row.merchant_nickname = nameMap.get(id) || null
      })
    }
    const staffRanking = Array.from(staffMap.values())
      .sort((a, b) => b.total - a.total)
      .slice(0, 20)

    // 2. 趋势（按天分组：录入单数、消费金额、奖励积分）
    const trendRaw = await ConsumptionRecord.findAll({
      attributes: [
        [sequelize.fn('DATE', sequelize.col('created_at')), 'day'],
        [sequelize.fn('COUNT', sequelize.col('consumption_record_id')), 'cnt'],
        [sequelize.fn('SUM', sequelize.col('consumption_amount')), 'amount'],
        [sequelize.fn('SUM', sequelize.col('points_to_award')), 'points']
      ],
      where: baseWhere,
      group: [sequelize.fn('DATE', sequelize.col('created_at'))],
      order: [[sequelize.fn('DATE', sequelize.col('created_at')), 'ASC']],
      raw: true
    })
    const trend = trendRaw.map(r => ({
      day: BeijingTimeHelper.formatDate ? BeijingTimeHelper.formatDate(r.day) : r.day,
      count: parseInt(r.cnt, 10) || 0,
      amount: parseFloat(r.amount) || 0,
      points: parseInt(r.points, 10) || 0
    }))

    // 3. 拒绝原因 TOP（基于审核链被驳回步骤的 action_reason 聚合）
    const rejectStepWhere = { status: 'rejected', actioned_at: { [Op.gte]: since } }
    if (storeId) rejectStepWhere.store_id = storeId
    const rejectRaw = await ApprovalChainStep.findAll({
      attributes: ['action_reason', [sequelize.fn('COUNT', sequelize.col('step_id')), 'cnt']],
      where: rejectStepWhere,
      group: ['action_reason'],
      order: [[sequelize.fn('COUNT', sequelize.col('step_id')), 'DESC']],
      limit: 10,
      raw: true
    })
    const rejectReasons = rejectRaw.map(r => ({
      reason: r.action_reason || '(未填写原因)',
      count: parseInt(r.cnt, 10) || 0
    }))

    // 4. 用户复购/活跃（仅聚合数字，无 PII）
    const userAgg = await ConsumptionRecord.findAll({
      attributes: [
        'user_id',
        [sequelize.fn('COUNT', sequelize.col('consumption_record_id')), 'cnt']
      ],
      where: { ...baseWhere, user_id: { [Op.not]: null } },
      group: ['user_id'],
      raw: true
    })
    let repeatCustomers = 0
    let singleCustomers = 0
    const distribution = { '1次': 0, '2-3次': 0, '4-5次': 0, '6次以上': 0 }
    userAgg.forEach(r => {
      const c = parseInt(r.cnt, 10) || 0
      if (c >= 2) repeatCustomers++
      else singleCustomers++
      if (c === 1) distribution['1次']++
      else if (c <= 3) distribution['2-3次']++
      else if (c <= 5) distribution['4-5次']++
      else distribution['6次以上']++
    })
    const totalCustomers = userAgg.length
    const userActivity = {
      total_customers: totalCustomers,
      repeat_customers: repeatCustomers,
      single_customers: singleCustomers,
      repeat_rate:
        totalCustomers > 0 ? Math.round((repeatCustomers / totalCustomers) * 10000) / 100 : 0,
      consumption_distribution: distribution
    }

    /*
     * 5. 审核人时效排行（9.3"各审核人平均审核耗时、超时率"）：
     *    基于 approval_chain_steps 已审结步骤，按 actioned_by(审核人) 聚合平均耗时与超时率。
     *    复用客服响应时长同款 AVG(TIMESTAMPDIFF(SECOND, created_at, actioned_at))。
     */
    const reviewerStepWhere = {
      actioned_by: { [Op.not]: null },
      actioned_at: { [Op.not]: null, [Op.gte]: since },
      status: { [Op.in]: ['approved', 'rejected', 'timeout'] }
    }
    if (storeId) reviewerStepWhere.store_id = storeId
    const reviewerRaw = await ApprovalChainStep.findAll({
      attributes: [
        'actioned_by',
        [sequelize.fn('COUNT', sequelize.col('step_id')), 'finished_cnt'],
        [
          sequelize.fn('AVG', sequelize.literal('TIMESTAMPDIFF(SECOND, created_at, actioned_at)')),
          'avg_seconds'
        ],
        [
          sequelize.literal(
            "SUM(CASE WHEN status = 'timeout' OR (timeout_at IS NOT NULL AND actioned_at > timeout_at) THEN 1 ELSE 0 END)"
          ),
          'overtime_cnt'
        ]
      ],
      where: reviewerStepWhere,
      group: ['actioned_by'],
      order: [[sequelize.fn('COUNT', sequelize.col('step_id')), 'DESC']],
      limit: 20,
      raw: true
    })
    const reviewerIds = reviewerRaw.map(r => Number(r.actioned_by))
    const reviewerNameMap = new Map()
    if (reviewerIds.length > 0) {
      const rUsers = await User.findAll({
        where: { user_id: { [Op.in]: reviewerIds } },
        attributes: ['user_id', 'nickname'],
        raw: true
      })
      rUsers.forEach(u => reviewerNameMap.set(Number(u.user_id), u.nickname))
    }
    const reviewerDuration = reviewerRaw.map(r => {
      const finished = parseInt(r.finished_cnt, 10) || 0
      const overtime = parseInt(r.overtime_cnt, 10) || 0
      const avgSeconds = Math.round(parseFloat(r.avg_seconds) || 0)
      return {
        reviewer_id: Number(r.actioned_by),
        reviewer_nickname: reviewerNameMap.get(Number(r.actioned_by)) || null,
        finished_count: finished,
        avg_duration_seconds: avgSeconds,
        avg_duration_text: ApprovalChainService._formatDurationSeconds(avgSeconds),
        timeout_rate: finished > 0 ? Math.round((overtime / finished) * 10000) / 100 : 0
      }
    })

    return {
      window_days: days,
      store_id: storeId,
      staff_ranking: staffRanking,
      trend,
      reject_reasons: rejectReasons,
      user_activity: userActivity,
      reviewer_duration: reviewerDuration
    }
  }

  /**
   * 把秒数格式化为友好耗时文案（如 "2小时30分"、"45分钟"、"30秒"），供审核时效展示
   * @param {number} seconds - 秒数
   * @returns {string} 友好文案
   * @private
   */
  static _formatDurationSeconds(seconds) {
    const s = Math.round(Number(seconds) || 0)
    if (s <= 0) return '0秒'
    const d = Math.floor(s / 86400)
    const h = Math.floor((s % 86400) / 3600)
    const m = Math.floor((s % 3600) / 60)
    const sec = s % 60
    if (d > 0) return `${d}天${h}小时`
    if (h > 0) return `${h}小时${m}分`
    if (m > 0) return `${m}分钟`
    return `${sec}秒`
  }

  /**
   * 汇总统计行（求总计），供 getApprovalStats 复用
   * @param {Array<Object>} rows - 统计行
   * @returns {Object} 汇总对象
   * @private
   */
  static _sumStatsRows(rows) {
    const summary = {
      pending: 0,
      approved: 0,
      rejected: 0,
      expired: 0,
      timeout: 0,
      total: 0,
      amount: 0,
      points: 0,
      finished_steps: 0,
      overtime_steps: 0
    }
    let durationWeightedSum = 0
    rows.forEach(r => {
      summary.pending += r.pending
      summary.approved += r.approved
      summary.rejected += r.rejected
      summary.expired += r.expired
      summary.timeout += r.timeout
      summary.total += r.total
      summary.amount += r.amount
      summary.points += r.points
      summary.finished_steps += r.finished_steps || 0
      summary.overtime_steps += r.overtime_steps || 0
      durationWeightedSum += (r.avg_duration_seconds || 0) * (r.finished_steps || 0)
    })
    const finished = summary.approved + summary.rejected
    summary.pass_rate = finished > 0 ? Math.round((summary.approved / finished) * 10000) / 100 : 0
    // 全局平均审核耗时（按已审结步骤数加权）+ 超时率
    summary.avg_duration_seconds =
      summary.finished_steps > 0 ? Math.round(durationWeightedSum / summary.finished_steps) : 0
    summary.avg_duration_text = ApprovalChainService._formatDurationSeconds(
      summary.avg_duration_seconds
    )
    summary.timeout_rate =
      summary.finished_steps > 0
        ? Math.round((summary.overtime_steps / summary.finished_steps) * 10000) / 100
        : 0
    return summary
  }

  /**
   * 批量配置审核人（9.3③，跨多条审核链统一指派某节点的审核人）
   *
   * 设计（范式1 规则引擎，零破坏匹配模型、零新建门店级链表）：
   *   - 选定多条审核链模板（template_ids）+ 目标节点定位（target_step：'final' 终审 / 数字步号）
   *   - 统一把这些链的目标节点改派为：role 角色池 / user 指定人 / submitter_manager 提交人门店店长
   *   - 仅改"目标节点的 assignee_*"单字段，不动其它节点、不重建节点（与 updateTemplate 的整表重建不同），
   *     因此对进行中的实例无影响（实例步骤已在创建时固化 assignee，仅影响后续新建实例）。
   *
   * @param {Object} data - { template_ids[], target_step, assignee_type, assignee_role_id?, assignee_user_id? }
   * @param {Object} options - 含 transaction（入口层统一管理）
   * @returns {Promise<Object>} { results: [{template_id, success, node_id?, message?}], stats }
   */
  static async batchAssignNodeReviewer(data, options = {}) {
    const transaction = assertAndGetTransaction(
      options,
      'ApprovalChainService.batchAssignNodeReviewer'
    )

    const { template_ids, target_step, assignee_type, assignee_role_id, assignee_user_id } = data

    if (!Array.isArray(template_ids) || template_ids.length === 0) {
      throw new BusinessError('template_ids 必须是非空数组', 'APPROVAL_INVALID', 400)
    }
    if (!['role', 'user', 'submitter_manager'].includes(assignee_type)) {
      throw new BusinessError(
        'assignee_type 必须是 role / user / submitter_manager',
        'APPROVAL_INVALID',
        400
      )
    }
    if (assignee_type === 'role' && !assignee_role_id) {
      throw new BusinessError('角色池模式必须提供 assignee_role_id', 'APPROVAL_INVALID', 400)
    }
    if (assignee_type === 'user' && !assignee_user_id) {
      throw new BusinessError('指定人模式必须提供 assignee_user_id', 'APPROVAL_INVALID', 400)
    }

    // 统一的节点改派字段（role/user 互斥；submitter_manager 两者皆空，按门店动态派人）
    const patch = {
      assignee_type,
      assignee_role_id: assignee_type === 'role' ? assignee_role_id : null,
      assignee_user_id: assignee_type === 'user' ? assignee_user_id : null
    }

    const results = []
    let successCount = 0

    for (const rawId of template_ids) {
      const templateId = parseInt(rawId, 10)
      // eslint-disable-next-line no-await-in-loop
      const nodes = await ApprovalChainNode.findAll({
        where: { template_id: templateId },
        transaction
      })
      if (nodes.length === 0) {
        results.push({ template_id: templateId, success: false, message: '模板不存在或无节点' })
        continue
      }

      // 定位目标节点：'final' 取终审节点；数字取对应 step_number 节点
      let targetNode = null
      if (target_step === 'final' || target_step === undefined || target_step === null) {
        targetNode = nodes.find(n => n.is_final === 1 || n.is_final === true)
      } else {
        const sn = parseInt(target_step, 10)
        targetNode = nodes.find(n => n.step_number === sn)
      }

      if (!targetNode) {
        results.push({
          template_id: templateId,
          success: false,
          message: target_step === 'final' ? '未找到终审节点' : `未找到步号 ${target_step} 的节点`
        })
        continue
      }

      // eslint-disable-next-line no-await-in-loop
      await targetNode.update(patch, { transaction })
      results.push({ template_id: templateId, success: true, node_id: targetNode.node_id })
      successCount++
    }

    logger.info('[审核链] 批量配置审核人', {
      total: template_ids.length,
      success_count: successCount,
      assignee_type
    })

    return {
      results,
      stats: {
        total: template_ids.length,
        success_count: successCount,
        failed_count: template_ids.length - successCount
      }
    }
  }

  // ==================== 私有方法 ====================
  /**
   * 匹配条件检查
   * @param {Object} conditions - 匹配条件
   * @param {Object} businessData - 业务数据
   * @returns {boolean} 是否匹配
   * @private
   */
  static _matchConditions(conditions, businessData) {
    if (!conditions || Object.keys(conditions).length === 0) return true

    /*
     * 金额取数兼容多业务字段：
     * - consumption 传 consumption_amount（消费金额）
     * - merchant_points 传 points_amount（申请积分数）
     * - 通用 amount 作为最高优先级
     * 三者按业务语义各取其一，统一参与 min_amount/max_amount 阈值比较，
     * 使"按金额/数量分级选链"对消费与商家积分都生效。
     */
    const amount = parseFloat(
      businessData.amount ?? businessData.consumption_amount ?? businessData.points_amount ?? 0
    )

    if (conditions.min_amount !== undefined) {
      if (amount < conditions.min_amount) return false
    }
    if (conditions.max_amount !== undefined) {
      if (amount > conditions.max_amount) return false
    }
    if (conditions.store_ids && Array.isArray(conditions.store_ids)) {
      if (!conditions.store_ids.includes(businessData.store_id)) return false
    }
    if (conditions.merchant_ids && Array.isArray(conditions.merchant_ids)) {
      if (!conditions.merchant_ids.includes(businessData.merchant_id)) return false
    }
    return true
  }

  /**
   * 验证操作人是否有权审核当前步骤，并返回审核上下文（用于会签计数与越级留痕）
   *
   * @param {Object} step - 审核步骤
   * @param {number} operatorId - 操作人ID
   * @param {Object} transaction - 事务
   * @returns {Promise<Object>} 审核上下文 { is_escalated, original_assignee_role_id }
   *   - is_escalated：true 表示 admin 越级顶替了本不该由其审的低等级节点（需留痕）
   *   - original_assignee_role_id：越级时该步原应审角色ID（留痕，submitter_manager 时为 null）
   *   权限不足时抛 BusinessError。
   * @private
   */
  static async _verifyOperatorPermission(step, operatorId, transaction) {
    const userRoles = await UserRole.findAll({
      where: { user_id: operatorId, is_active: 1 },
      include: [{ model: Role, as: 'role', attributes: ['role_id', 'role_level'] }],
      transaction
    })

    // 操作人有效级别 = 其多个角色里的最高 role_level
    const operatorLevel = userRoles.reduce((max, ur) => Math.max(max, ur.role?.role_level || 0), 0)
    /*
     * 超级管理员（super_admin, lv≥110）豁免当事人回避：顶层唯一超管可审任何业务（含与自己相关的），
     * 避免"唯一超管被回避挡住导致无人可审"的死锁。普通 admin(100) 及以下仍受回避约束。
     */
    const SUPER_ADMIN_LEVEL = 110
    const isSuperAdmin = operatorLevel >= SUPER_ADMIN_LEVEL

    /*
     * 当事人回避校验（exclude_parties，默认开启）：
     * 审核人不得是该 auditable 业务的当事人（发起人/消费者/纠纷方/积分申请人）。
     * 即使操作人持 admin(100) 角色也拒绝，防止"自己审自己"（仲裁中立性 / 积分申请人=受益人）。
     * 例外：super_admin(lv≥110) 豁免（见上）。节点 exclude_parties=0 时也跳过回避。
     * 放在角色判定之前，确保 admin 当事人也被拦截。
     */
    const excludeParties = step.node ? step.node.exclude_parties !== 0 : true
    if (!isSuperAdmin && excludeParties && step.instance) {
      const partyIds = await ApprovalChainService._resolveAuditableParties(
        step.instance,
        transaction
      )
      if (partyIds.includes(operatorId)) {
        throw new BusinessError(
          '您是该业务的当事人，按回避规则不能审核与自己相关的业务',
          'APPROVAL_ERROR',
          400
        )
      }
    }

    const isAdmin = operatorLevel >= 100
    if (isAdmin) {
      /*
       * 越级代审判定（2026-06-20 越级留痕，决策 8.1）：
       * admin 顶替"本不该由 admin 审"的低等级节点时，标记越级并记录原应审角色，供 processStep 留痕。
       * 判定：该步配置了具体审核角色(assignee_role_id) 且该角色非 admin 自身角色池命中，
       *       或该步是 submitter_manager（本应门店店长审）。指定人步骤(assignee_user_id≠admin)也算越级。
       */
      const adminHasAssignedRole =
        step.assignee_role_id != null && userRoles.some(ur => ur.role_id === step.assignee_role_id)
      const adminIsAssignedUser =
        step.assignee_user_id != null && step.assignee_user_id === operatorId
      const stepAssigneeType = step.node ? step.node.assignee_type : null
      const isEscalated =
        !adminHasAssignedRole && !adminIsAssignedUser
          ? step.assignee_role_id != null ||
            step.assignee_user_id != null ||
            stepAssigneeType === 'submitter_manager'
          : false
      return {
        is_escalated: isEscalated,
        original_assignee_role_id: isEscalated ? step.assignee_role_id || null : null
      }
    }

    /*
     * ops(lv30, role_id=9) 只读角色排除（2026-06-20 分级审核链升级，决策 6/8.1）：
     * 审核接口门槛降到 lv20 后，ops(lv30) 能进路由，但 ops 是"只读运营"角色，
     * 业务上绝不应成为审核人（审核=发积分=发钱）。这里在 Service 层显式排除：
     * 操作人持 ops 角色，且不具备其它任何"可审核角色"（除 ops 外、role_level >= 店员 lv20 的角色）时，拒绝。
     * 仅持 ops 的用户被挡；若用户同时还兼任店员/店长等审核角色，则按其审核角色正常走精校。
     */
    const OPS_ROLE_ID = 9
    const STAFF_MIN_LEVEL = 20
    const hasOpsRole = userRoles.some(ur => ur.role_id === OPS_ROLE_ID)
    if (hasOpsRole) {
      const hasOtherAuditRole = userRoles.some(
        ur => ur.role_id !== OPS_ROLE_ID && (ur.role?.role_level || 0) >= STAFF_MIN_LEVEL
      )
      if (!hasOtherAuditRole) {
        throw new BusinessError(
          'ops 为只读运营角色，不具备审核权限，不能成为审核人',
          'APPROVAL_ERROR',
          400
        )
      }
    }

    if (step.assignee_user_id) {
      if (step.assignee_user_id !== operatorId) {
        throw new BusinessError(
          `您不是当前步骤的指定审核人（指定人ID: ${step.assignee_user_id}）`,
          'APPROVAL_ERROR',
          400
        )
      }
      return { is_escalated: false, original_assignee_role_id: null }
    }

    /*
     * submitter_manager（提交人门店店长）分配方式（2026-06-20 补全门店隔离半成品）：
     * 操作人必须是该消费单所属门店（step.store_id）的"在职店长"（store_staff.role_in_store='manager'）。
     * 天然实现"谁的店谁审"，从根上杜绝 A 店店长审 B 店单的跨店越权。
     */
    const assigneeType = step.node ? step.node.assignee_type : null
    if (assigneeType === 'submitter_manager') {
      if (!step.store_id) {
        throw new BusinessError(
          '该审核步骤缺少门店信息（store_id 为空），无法按"提交人门店店长"校验',
          'APPROVAL_ERROR',
          400
        )
      }
      const managerRecord = await StoreStaff.findOne({
        where: {
          user_id: operatorId,
          store_id: step.store_id,
          role_in_store: 'manager',
          status: 'active'
        },
        transaction
      })
      if (!managerRecord) {
        throw new BusinessError(
          '您不是该消费单所属门店的在职店长，无权审核该单',
          'APPROVAL_ERROR',
          400
        )
      }
      return { is_escalated: false, original_assignee_role_id: null }
    }

    if (step.assignee_role_id) {
      const hasRole = userRoles.some(ur => ur.role_id === step.assignee_role_id)
      if (!hasRole) {
        throw new BusinessError(
          `您不具备当前步骤要求的审核角色（要求角色ID: ${step.assignee_role_id}）`,
          'APPROVAL_ERROR',
          400
        )
      }

      /*
       * 门店/区域隔离（2026-06-20 角色池分支叠加范围校验，堵跨店越权）：
       * consumption 业务（step.store_id 有值）下，角色池模式的非 admin 审核人，
       * 必须管辖该门店才放行——
       *   - 店长/店员：本人在 store_staff 该门店在职；
       *   - 区域负责人/业务经理：该门店在其 user_hierarchy 管辖集合内。
       * 二者统一由 _getUserScopedStoreIds 计算"可审门店集合"，命中才放行。
       * merchant_points 无门店维度（step.store_id 为空），跳过隔离，保持原角色池语义。
       */
      if (step.store_id) {
        const scopedStoreIds = await ApprovalChainService._getUserScopedStoreIds(
          operatorId,
          transaction
        )
        if (!scopedStoreIds.has(Number(step.store_id))) {
          throw new BusinessError(
            '该审核单不属于您管辖的门店/区域范围，无权审核（请确认门店任职或区域层级配置）',
            'APPROVAL_ERROR',
            400
          )
        }
      }
      return { is_escalated: false, original_assignee_role_id: null }
    }

    throw new BusinessError('当前步骤无法确定审核人分配方式', 'APPROVAL_ERROR', 400)
  }

  /**
   * 解析审核链实例对应业务的"当事人" user_id 列表（用于回避校验）
   *
   * 按 auditable_type 取该业务的利益相关方：
   * - 通用：instance.submitted_by（提交人/发起人，所有业务都有）
   * - trade_dispute：trade_disputes.user_id（纠纷发起方）+ created_by
   * - consumption：consumption_records.user_id（消费者）
   * - merchant_points：content_review_records.audit_data.user_id（申请人=受益人）
   *
   * @param {Object} instance - 审核链实例（含 auditable_type/auditable_id/submitted_by/content_review_record_id）
   * @param {Object} transaction - 事务
   * @returns {Promise<number[]>} 去重后的当事人 user_id 列表
   * @private
   */
  static async _resolveAuditableParties(instance, transaction) {
    const models = require('../models')
    const parties = new Set()
    if (instance.submitted_by) parties.add(Number(instance.submitted_by))

    try {
      if (instance.auditable_type === 'trade_dispute') {
        const d = await models.TradeDispute.findByPk(instance.auditable_id, {
          attributes: ['user_id', 'created_by'],
          transaction
        })
        if (d) {
          if (d.user_id) parties.add(Number(d.user_id))
          if (d.created_by) parties.add(Number(d.created_by))
        }
      } else if (instance.auditable_type === 'consumption') {
        const r = await models.ConsumptionRecord.findByPk(instance.auditable_id, {
          attributes: ['user_id'],
          transaction
        })
        if (r && r.user_id) parties.add(Number(r.user_id))
      } else if (instance.auditable_type === 'merchant_points') {
        if (instance.content_review_record_id) {
          const cr = await models.ContentReviewRecord.findByPk(instance.content_review_record_id, {
            attributes: ['audit_data'],
            transaction
          })
          const applicantId = cr?.audit_data?.user_id
          if (applicantId) parties.add(Number(applicantId))
        }
      }
    } catch (err) {
      // 当事人解析失败不应阻断审核，但需告警（回避降级为仅按 submitted_by）
      logger.warn('[审核链] 解析当事人失败，回避仅按 submitted_by', {
        auditable_type: instance.auditable_type,
        auditable_id: instance.auditable_id,
        error: err.message
      })
    }
    return Array.from(parties)
  }

  /**
   * 根据审核节点解析实际需要通知的用户ID列表
   *
   * - 指定人模式（assignee_type='user'）：直接返回 [assignee_user_id]
   * - 角色池模式（assignee_type='role'）：查找拥有该角色的所有用户
   * - 提交人门店店长（assignee_type='submitter_manager'）：按 storeId 反查该门店在职 manager
   *
   * @param {Object} node - 审核节点
   * @param {Object} transaction - 事务
   * @param {number|null} [storeId] - 该步所属门店（submitter_manager 模式必需）
   * @returns {Promise<number[]>} 需要通知的 user_id 列表
   * @private
   */
  static async _resolveAssigneeUserIds(node, transaction, storeId = null) {
    if (node.assignee_type === 'user' && node.assignee_user_id) {
      return [node.assignee_user_id]
    }

    if (node.assignee_type === 'role' && node.assignee_role_id) {
      const userRoles = await UserRole.findAll({
        where: { role_id: node.assignee_role_id, is_active: 1 },
        attributes: ['user_id'],
        transaction
      })
      return userRoles.map(ur => ur.user_id)
    }

    /*
     * submitter_manager：通知该消费单所属门店的在职店长（store_staff.role_in_store='manager'）。
     * 无 storeId（如 merchant_points 误配）时返回空，调用方降级为不通知（不报错）。
     */
    if (node.assignee_type === 'submitter_manager' && storeId) {
      const managers = await StoreStaff.findAll({
        where: { store_id: storeId, role_in_store: 'manager', status: 'active' },
        attributes: ['user_id'],
        transaction
      })
      return managers.map(m => m.user_id)
    }

    return []
  }

  /**
   * 计算用户"可审门店集合"（门店/区域隔离统一口径，2026-06-20 分级审核链升级）
   *
   * 合并两类管辖来源（去重）：
   *   1. store_staff：用户作为店长/店员在职的门店（role_in_store 不限，status='active'）
   *   2. user_hierarchy：用户在组织层级中管辖的门店——
   *      - 直接挂在自己名下的 store_id（业务员本人门店，is_active=1）
   *      - 作为上级（superior_user_id=自己）时，其直接下属挂的 store_id（区域负责人/业务经理管片区）
   *
   * 说明：按既有 user_hierarchy 设计，区域负责人/业务经理的 store_id 为 NULL，
   * 其管辖门店通过"下属的 store_id"体现，故取下属门店集合即为其辖区（贴合后台手动指派的管辖关系）。
   * 不按地理行政区划（stores.province/city/district）判定。
   *
   * @param {number} userId - 操作人 user_id
   * @param {Object} [transaction] - 事务（可选）
   * @returns {Promise<Set<number>>} 可审门店 store_id 集合
   * @private
   */
  static async _getUserScopedStoreIds(userId, transaction) {
    /*
     * 数据范围收口（2026-06-24 §12.4 拍板）：原私有实现已提升为 DataScopeService（单一事实源）。
     * 升级点：原逻辑仅取「直接下级」一层门店；DataScopeService 经 getAllSubordinates 递归收集
     * 所有层级下级门店（区域→经理→店长多级），更符合「数据范围按组织层级树逐级收窄」诉求。
     * 行为等价性：审核链上层 isAdmin 分支单独处理全局不隔离，本方法只负责返回「受限门店集合」，
     * 故 DataScopeService 返回 scope='all'（管理员）时这里返回空集合（与原逻辑一致：管理员不走此分支）。
     */
    const DataScopeService = require('./DataScopeService')
    const scopeResult = await DataScopeService.getAccessibleStoreIds(userId, { transaction })
    return new Set(scopeResult.scope === 'all' ? [] : scopeResult.store_ids)
  }

  /**
   * 批量处理审核步骤（收口到审核链，批量=逐条循环 processStep）
   *
   * 设计要点（符合项目约束）：
   * - 复用单步核心逻辑 processStep，零重写业务规则（鉴权/状态机/留痕全部一致）
   * - 每条步骤独立事务（TransactionManager.execute），单条失败不影响其它（部分成功语义）
   * - 终审通过/拒绝后，在同一条事务内复刻"路由层终审触发"：调 ContentAuditEngine.approve/reject
   *   触发消费记录发积分/改状态闭环，保证批量与单条结果完全一致
   * - 仅处理"当前轮到操作人的步骤"，多级链下批量只推进操作人负责的那一步
   *
   * @param {number[]} stepIds - 待审核步骤ID数组（来自 my-pending）
   * @param {string} action - 审核动作：approve | reject
   * @param {string} reason - 审核原因（reject 必填）
   * @param {number} operatorId - 操作人用户ID（从 JWT 解析）
   * @returns {Promise<Object>} { results: [...], stats: {...} }
   */
  static async processStepsBatch(stepIds, action, reason, operatorId) {
    if (!Array.isArray(stepIds) || stepIds.length === 0) {
      throw new BusinessError('step_ids 必须是非空数组', 'APPROVAL_INVALID', 400)
    }
    if (!['approve', 'reject'].includes(action)) {
      throw new BusinessError(
        `无效的审核操作: ${action}，仅支持 approve/reject`,
        'APPROVAL_INVALID',
        400
      )
    }
    if (action === 'reject' && (!reason || reason.trim().length < 5)) {
      throw new BusinessError('拒绝原因必须提供，且不少于5个字符', 'APPROVAL_INVALID', 400)
    }

    const results = []
    let successCount = 0
    let failedCount = 0

    for (const rawStepId of stepIds) {
      const stepId = parseInt(rawStepId, 10)
      try {
        // eslint-disable-next-line no-await-in-loop
        const processResult = await TransactionManager.execute(
          async transaction => {
            const r = await ApprovalChainService.processStep(stepId, action, reason, operatorId, {
              transaction
            })
            // 终审完成 → 复刻路由层闭环：触发统一审核引擎回调（消费记录发积分/改状态）
            if (r.is_chain_completed && r.instance?.content_review_record_id) {
              if (r.final_result === 'approved') {
                await ContentAuditEngine.approve(
                  r.instance.content_review_record_id,
                  operatorId,
                  reason || '审核链终审通过',
                  { transaction }
                )
              } else if (r.final_result === 'rejected') {
                await ContentAuditEngine.reject(
                  r.instance.content_review_record_id,
                  operatorId,
                  reason,
                  { transaction }
                )
              }
            }
            return r
          },
          { description: `审核链批量处理步骤 step_id=${stepId}` }
        )

        results.push({
          step_id: stepId,
          success: true,
          action: processResult.action,
          is_chain_completed: processResult.is_chain_completed,
          final_result: processResult.final_result || null,
          next_step_number: processResult.next_step_number || null
        })
        successCount++
      } catch (error) {
        results.push({
          step_id: stepId,
          success: false,
          error_code: error.code || error.errorCode || 'APPROVAL_ERROR',
          message: error.message
        })
        failedCount++
      }
    }

    logger.info('[审核链] 批量处理完成', {
      operator_id: operatorId,
      action,
      total: stepIds.length,
      success_count: successCount,
      failed_count: failedCount
    })

    return {
      results,
      stats: { total: stepIds.length, success_count: successCount, failed_count: failedCount }
    }
  }
}

module.exports = ApprovalChainService
