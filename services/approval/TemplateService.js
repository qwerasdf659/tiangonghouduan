/**
 * 审核链模板服务（TemplateService）
 *
 * 职责（从 ApprovalChainService 拆分，2026-07-11 技术债务方案 7.4-6）：
 * - 审核链模板匹配（matchTemplate + _matchConditions 条件引擎）
 * - 模板/节点 CRUD（getTemplates / getTemplateById / createTemplate / updateTemplate / toggleTemplate）
 * - 模板编码自动生成（_generateTemplateCode）
 * - 模板冲突预检（detectTemplateConflicts，只读演练）
 * - 批量配置节点审核人（batchAssignNodeReviewer）
 *
 * 设计说明：
 * - 本模块不独立注册服务键，由 ApprovalChainService Facade（服务键 approval_chain）转发调用
 * - 事务边界不变：所有写操作仍要求外部事务传入（assertAndGetTransaction）
 * - 纯搬移拆分：所有方法逻辑与拆分前 ApprovalChainService 完全一致
 *
 * @module services/approval/TemplateService
 */
const BusinessError = require('../../utils/BusinessError')
const logger = require('../../utils/logger').logger
const {
  ApprovalChainTemplate,
  ApprovalChainNode,
  ApprovalChainInstance,
  User,
  Role
} = require('../../models')
const { assertAndGetTransaction } = require('../../utils/transactionHelpers')
// 中文显示名附加复用实例服务的统一实现（单向依赖：Template → Instance，无循环）
const InstanceService = require('./InstanceService')

/** 审核链模板服务 */
class TemplateService {
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
      if (TemplateService._matchConditions(template.match_conditions, businessData)) {
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

    const displayRows = await InstanceService._attachAuditableTypeDisplay(rows)
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
    return InstanceService._attachAuditableTypeDisplay(template)
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
    templateData.template_code = await TemplateService._generateTemplateCode(
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
}

module.exports = TemplateService
