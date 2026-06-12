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
const {
  ApprovalChainTemplate,
  ApprovalChainNode,
  ApprovalChainInstance,
  ApprovalChainStep,
  AdminNotification,
  UserRole,
  Role,
  User
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
          assignee_user_id: node.assignee_type === 'user' ? node.assignee_user_id : null,
          assignee_role_id: node.assignee_type === 'role' ? node.assignee_role_id : null,
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
        transaction
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
   * 权限校验逻辑（Service 层精确鉴权）：
   *   - 角色池模式：operator 的任一角色 role_id 等于 step.assignee_role_id
   *   - 指定人模式：operator.user_id 等于 step.assignee_user_id
   *   - admin(role_level>=100) 可审核任何步骤（终极兜底）
   *
   * @param {number} stepId - 步骤ID
   * @param {string} action - 操作（'approve' 或 'reject'）
   * @param {string} reason - 审批意见
   * @param {number} operatorId - 操作人 user_id
   * @param {Object} options - 选项
   * @param {Object} options.transaction - Sequelize 事务（必填）
   * @returns {Promise<Object>} 处理结果
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

    await ApprovalChainService._verifyOperatorPermission(step, operatorId, transaction)

    const now = BeijingTimeHelper.createDatabaseTime()

    if (action === 'approve') {
      await step.update(
        {
          status: 'approved',
          action_reason: reason || '审核通过',
          actioned_by: operatorId,
          actioned_at: now
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
      await step.update(
        {
          status: 'rejected',
          action_reason: reason,
          actioned_by: operatorId,
          actioned_at: now
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
        const notifyUserIds = await ApprovalChainService._resolveAssigneeUserIds(node, transaction)
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
   * 查询用户的待审核步骤
   * 包含角色池模式（用户所拥有的角色对应的待审核步骤）和指定人模式
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
      attributes: ['role_id']
    })
    const roleIds = userRoles.map(ur => ur.role_id)

    const whereCondition = {
      status: 'pending',
      [Op.or]: [
        { assignee_user_id: userId },
        ...(roleIds.length > 0 ? [{ assignee_role_id: { [Op.in]: roleIds } }] : [])
      ]
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
    return { rows: displayRows, count, page, page_size, total_pages: Math.ceil(count / page_size) }
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
   * 验证操作人是否有权审核当前步骤
   * @param {Object} step - 审核步骤
   * @param {number} operatorId - 操作人ID
   * @param {Object} transaction - 事务
   * @returns {Promise<void>} 无返回，权限不足时抛异常
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
    if (isAdmin) return

    if (step.assignee_user_id) {
      if (step.assignee_user_id !== operatorId) {
        throw new BusinessError(
          `您不是当前步骤的指定审核人（指定人ID: ${step.assignee_user_id}）`,
          'APPROVAL_ERROR',
          400
        )
      }
      return
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
      return
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
   *
   * @param {Object} node - 审核节点
   * @param {Object} transaction - 事务
   * @returns {Promise<number[]>} 需要通知的 user_id 列表
   * @private
   */
  static async _resolveAssigneeUserIds(node, transaction) {
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

    return []
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
