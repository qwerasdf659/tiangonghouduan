/**
 * 审核链实例服务（InstanceService）
 *
 * 职责（从 ApprovalChainService 拆分，2026-07-11 技术债务方案 7.4-6）：
 * - 审核链实例创建（createChainInstance，含步骤实例化 + 首审人通知）
 * - 步骤流转（advanceToNextStep，含下一步审核人通知）
 * - 实例/待办查询（getInstanceByAuditable / getInstancesByAuditableIds / getInstances /
 *   getInstanceById / getPendingStepsForUser / getPendingStepsForRole）
 * - 展示辅助（_attachAuditableTypeDisplay / _attachStepProgress / _attachParties）
 * - 审核人解析（_resolveAssigneeUserIds）与可审门店集合（_getUserScopedStoreIds）
 *
 * 设计说明：
 * - 本模块不独立注册服务键，由 ApprovalChainService Facade（服务键 approval_chain）转发调用
 * - 事务边界不变：所有写操作仍要求外部事务传入（assertAndGetTransaction）
 * - 纯搬移拆分：所有方法逻辑与拆分前 ApprovalChainService 完全一致
 *
 * @module services/approval/InstanceService
 */
const BusinessError = require('../../utils/BusinessError')
const logger = require('../../utils/logger').logger
const { sanitize } = require('../../utils/logger')
const {
  ApprovalChainTemplate,
  ApprovalChainNode,
  ApprovalChainInstance,
  ApprovalChainStep,
  AdminNotification,
  UserRole,
  Role,
  User,
  StoreStaff
} = require('../../models')
const { Op } = require('sequelize')
const { assertAndGetTransaction } = require('../../utils/transactionHelpers')
const BeijingTimeHelper = require('../../utils/timeHelper')
/*
 * 中文化：审核链下发时把 auditable_type（英文业务码）经字典转出 auditable_type_display（中文），
 * 复用项目统一字典体系（system_dictionaries + displayNameHelper），前端零维护、零映射直接读。
 */
const { attachDisplayNames } = require('../../utils/displayNameHelper')

/** 审核链实例服务 */
class InstanceService {
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
      const ConsumptionRecord = require('../../models').ConsumptionRecord
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
      const notifyUserIds = await InstanceService._resolveAssigneeUserIds(
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
        const notifyUserIds = await InstanceService._resolveAssigneeUserIds(
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
    return InstanceService._attachAuditableTypeDisplay(instance)
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
    const scopedStoreIds = isAdmin ? null : await InstanceService._getUserScopedStoreIds(userId)
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

    const displayRows = await InstanceService._attachAuditableTypeDisplay(rows)
    InstanceService._attachStepProgress(displayRows)
    await InstanceService._attachParties(displayRows)
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
    const models = require('../../models')
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

    const displayRows = await InstanceService._attachAuditableTypeDisplay(rows)
    InstanceService._attachStepProgress(displayRows)
    return { rows: displayRows, count, page, page_size, total_pages: Math.ceil(count / page_size) }
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

    const displayRows = await InstanceService._attachAuditableTypeDisplay(rows)
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
    return InstanceService._attachAuditableTypeDisplay(instance)
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
    const DataScopeService = require('../DataScopeService')
    const scopeResult = await DataScopeService.getAccessibleStoreIds(userId, { transaction })
    return new Set(scopeResult.scope === 'all' ? [] : scopeResult.store_ids)
  }
}

module.exports = InstanceService
