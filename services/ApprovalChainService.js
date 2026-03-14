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
      throw new Error(`模板 ${template.template_code} 无审核节点（step_number > 1 的节点为空）`)
    }

    const instance = await ApprovalChainInstance.create(
      {
        template_id: template.template_id,
        auditable_type: auditableType,
        auditable_id: auditableId,
        content_review_record_id: options.content_review_record_id || null,
        current_step: auditNodes[0].step_number,
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
      throw new Error(`无效的审核操作: ${action}，仅支持 approve/reject`)
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
      throw new Error(`审核步骤不存在: step_id=${stepId}`)
    }
    if (step.status !== 'pending') {
      throw new Error(`审核步骤状态不是 pending: 当前状态=${step.status}`)
    }
    if (step.instance.status !== 'in_progress') {
      throw new Error(`审核链已结束: 当前状态=${step.instance.status}`)
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
      throw new Error(
        `[审核链] 无下一步骤，但当前步骤不是终审: instance_id=${instance.instance_id}`
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

    await instance.update(
      {
        current_step: nextStep.step_number
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
   * 按业务记录查询审核链实例
   *
   * @param {string} auditableType - 业务类型
   * @param {number} auditableId - 业务记录ID
   * @returns {Promise<Object|null>} 审核链实例或null
   */
  static async getInstanceByAuditable(auditableType, auditableId) {
    return ApprovalChainInstance.findOne({
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
    const { page = 1, page_size = 20 } = queryOptions

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

    return { rows, count, page, page_size, total_pages: Math.ceil(count / page_size) }
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
    const { page = 1, page_size = 20, auditable_type } = queryOptions

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

    return { rows, count, page, page_size, total_pages: Math.ceil(count / page_size) }
  }

  /**
   * 查询审核链模板列表
   *
   * @param {Object} [queryOptions] - 查询选项
   * @returns {Promise<Object>} 分页结果 { rows, count }
   */
  static async getTemplates(queryOptions = {}) {
    const { auditable_type, is_active, page = 1, page_size = 20 } = queryOptions
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

    return { rows, count, page, page_size, total_pages: Math.ceil(count / page_size) }
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
    if (!template) throw new Error(`审核链模板不存在: template_id=${templateId}`)
    return template
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
    if (!template) throw new Error(`审核链模板不存在: template_id=${templateId}`)

    const activeInstances = await ApprovalChainInstance.count({
      where: { template_id: templateId, status: 'in_progress' },
      transaction
    })
    if (activeInstances > 0) {
      throw new Error(
        `该模板有 ${activeInstances} 个进行中的审核实例，不可修改节点。请先完成或取消这些实例。`
      )
    }

    const { nodes, ...templateData } = data

    if (nodes) {
      templateData.total_nodes = nodes.filter(n => n.step_number > 1).length
      await ApprovalChainNode.destroy({ where: { template_id: templateId }, transaction })
      for (const nodeData of nodes) {
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
    if (!template) throw new Error(`审核链模板不存在: template_id=${templateId}`)

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
    const { auditable_type, status, page = 1, page_size = 20 } = queryOptions
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

    return { rows, count, page, page_size, total_pages: Math.ceil(count / page_size) }
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
    if (!instance) throw new Error(`审核链实例不存在: instance_id=${instanceId}`)
    return instance
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

    if (conditions.min_amount !== undefined) {
      const amount = parseFloat(businessData.amount || businessData.consumption_amount || 0)
      if (amount < conditions.min_amount) return false
    }
    if (conditions.max_amount !== undefined) {
      const amount = parseFloat(businessData.amount || businessData.consumption_amount || 0)
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

    const isAdmin = userRoles.some(ur => ur.role?.role_level >= 100)
    if (isAdmin) return

    if (step.assignee_user_id) {
      if (step.assignee_user_id !== operatorId) {
        throw new Error(`您不是当前步骤的指定审核人（指定人ID: ${step.assignee_user_id}）`)
      }
      return
    }

    if (step.assignee_role_id) {
      const hasRole = userRoles.some(ur => ur.role_id === step.assignee_role_id)
      if (!hasRole) {
        throw new Error(`您不具备当前步骤要求的审核角色（要求角色ID: ${step.assignee_role_id}）`)
      }
      return
    }

    throw new Error('当前步骤无法确定审核人分配方式')
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
}

module.exports = ApprovalChainService
