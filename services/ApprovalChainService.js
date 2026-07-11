/**
 * 审核链服务（ApprovalChainService）- Facade（门面）
 *
 * 核心职责：
 *   - 匹配审核链模板（matchTemplate）
 *   - 创建审核链实例和步骤（createChainInstance）
 *   - 处理审核步骤（processStep）— 核心方法
 *   - 推进到下一步（advanceToNextStep）
 *   - 查询待审核步骤（按用户/角色）
 *
 * 架构说明（2026-07-11 技术债务方案 7.4-6 拆分）：
 * - 本文件保留为 Facade：对外静态方法签名全部不变（路由/ContentAuditEngine/
 *   TradeDisputeService/消费查询等调用方零改动），内部转发 services/approval/ 三个子模块：
 *   - approval/TemplateService：模板匹配/模板与节点 CRUD/冲突预检/批量配置审核人
 *   - approval/InstanceService：实例创建/步骤流转/实例与待办查询/展示辅助
 *   - approval/ActionService：审批动作执行（单签/会签/越级留痕）/批量审批/鉴权回避/审核统计与超时口径
 * - 子模块不独立注册服务键；getService 键 approval_chain 不变，仍指向本 Facade
 * - 事务边界不变：所有写操作仍强制要求外部事务传入（assertAndGetTransaction 在子模块内执行）
 *
 * 事务边界：所有写操作强制要求外部事务传入（assertAndGetTransaction）
 * 服务注册键：approval_chain（通过 ServiceManager 获取）
 *
 * @module services/ApprovalChainService
 */
const TemplateService = require('./approval/TemplateService')
const InstanceService = require('./approval/InstanceService')
const ActionService = require('./approval/ActionService')

/** 审核链服务（Facade，静态转发三个子模块） */
class ApprovalChainService {
  // ==================== 模板域（转发 approval/TemplateService）====================

  /**
   * 按业务类型和业务数据匹配审核链模板
   * @param {string} auditableType - 业务类型（consumption/merchant_points/exchange）
   * @param {Object} businessData - 业务数据（用于条件匹配，如 { amount: 300, store_id: 7 }）
   * @returns {Promise<Object|null>} 匹配到的模板，无匹配返回 null
   */
  static async matchTemplate(auditableType, businessData = {}) {
    return TemplateService.matchTemplate(auditableType, businessData)
  }

  /**
   * 查询审核链模板列表
   * @param {Object} [queryOptions] - 查询选项
   * @returns {Promise<Object>} 分页结果 { rows, count }
   */
  static async getTemplates(queryOptions = {}) {
    return TemplateService.getTemplates(queryOptions)
  }

  /**
   * 获取模板详情
   * @param {number} templateId - 模板ID
   * @returns {Promise<Object>} 模板详情
   */
  static async getTemplateById(templateId) {
    return TemplateService.getTemplateById(templateId)
  }

  /**
   * 创建审核链模板（含节点）
   * @param {Object} data - 模板数据
   * @param {Object} options - 含 transaction
   * @returns {Promise<Object>} 创建的模板
   */
  static async createTemplate(data, options = {}) {
    return TemplateService.createTemplate(data, options)
  }

  /**
   * 自动生成唯一的模板编码（template_code）
   * @param {string} auditableType - 业务类型（consumption/merchant_points）
   * @param {Object} transaction - Sequelize 事务
   * @returns {Promise<string>} 唯一模板编码
   * @private
   */
  static async _generateTemplateCode(auditableType, transaction) {
    return TemplateService._generateTemplateCode(auditableType, transaction)
  }

  /**
   * 审核链模板冲突预检（只读，不写库）— 保存前演练，提示运营潜在配置风险
   * @param {Object} candidate - 待保存模板 { auditable_type, priority, match_conditions, template_id? }
   * @returns {Promise<{has_risk: boolean, risks: Array}>} 预检结果
   */
  static async detectTemplateConflicts(candidate = {}) {
    return TemplateService.detectTemplateConflicts(candidate)
  }

  /**
   * 更新审核链模板
   * @param {number} templateId - 模板ID
   * @param {Object} data - 更新数据
   * @param {Object} options - 含 transaction
   * @returns {Promise<Object>} 更新后的模板
   */
  static async updateTemplate(templateId, data, options = {}) {
    return TemplateService.updateTemplate(templateId, data, options)
  }

  /**
   * 启用/禁用模板
   * @param {number} templateId - 模板ID
   * @param {Object} options - 含 transaction
   * @returns {Promise<Object>} 更新后的模板
   */
  static async toggleTemplate(templateId, options = {}) {
    return TemplateService.toggleTemplate(templateId, options)
  }

  /**
   * 批量配置审核人（9.3③，跨多条审核链统一指派某节点的审核人）
   * @param {Object} data - { template_ids[], target_step, assignee_type, assignee_role_id?, assignee_user_id? }
   * @param {Object} options - 含 transaction（入口层统一管理）
   * @returns {Promise<Object>} { results: [{template_id, success, node_id?, message?}], stats }
   */
  static async batchAssignNodeReviewer(data, options = {}) {
    return TemplateService.batchAssignNodeReviewer(data, options)
  }

  /**
   * 匹配条件检查
   * @param {Object} conditions - 匹配条件
   * @param {Object} businessData - 业务数据
   * @returns {boolean} 是否匹配
   * @private
   */
  static _matchConditions(conditions, businessData) {
    return TemplateService._matchConditions(conditions, businessData)
  }

  // ==================== 实例域（转发 approval/InstanceService）====================

  /**
   * 创建审核链实例及所有步骤
   * @param {Object} template - 匹配到的模板（含 nodes 关联）
   * @param {string} auditableType - 业务类型
   * @param {number} auditableId - 业务记录ID
   * @param {number} submittedBy - 提交人 user_id
   * @param {Object} options - 选项（transaction 必填，可含 content_review_record_id/business_snapshot）
   * @returns {Promise<Object>} 创建的实例
   */
  static async createChainInstance(
    template,
    auditableType,
    auditableId,
    submittedBy,
    options = {}
  ) {
    return InstanceService.createChainInstance(
      template,
      auditableType,
      auditableId,
      submittedBy,
      options
    )
  }

  /**
   * 推进到下一个审核步骤
   * @param {Object} instance - 审核链实例
   * @param {Object} currentStep - 当前步骤
   * @param {Object} options - 选项（含 transaction）
   * @returns {Promise<Object>} 推进结果
   */
  static async advanceToNextStep(instance, currentStep, options = {}) {
    return InstanceService.advanceToNextStep(instance, currentStep, options)
  }

  /**
   * 为审核链数据附加 auditable_type 的中文显示名（auditable_type_display）
   * @param {Object|Array|null} data - 实例对象、实例数组或待办步骤行数组
   * @returns {Promise<Object|Array|null>} 原数据（已附加中文字段）
   * @private
   */
  static async _attachAuditableTypeDisplay(data) {
    return InstanceService._attachAuditableTypeDisplay(data)
  }

  /**
   * 按业务记录查询审核链实例
   * @param {string} auditableType - 业务类型
   * @param {number} auditableId - 业务记录ID
   * @returns {Promise<Object|null>} 审核链实例或null
   */
  static async getInstanceByAuditable(auditableType, auditableId) {
    return InstanceService.getInstanceByAuditable(auditableType, auditableId)
  }

  /**
   * 批量按业务记录查询审核链进度（避免 N+1，供消费记录列表等场景装配 chain_info）
   * @param {string} auditableType - 业务类型（如 'consumption'）
   * @param {number[]} auditableIds - 业务记录ID数组
   * @returns {Promise<Map>} auditable_id → 进度对象 chain_info
   */
  static async getInstancesByAuditableIds(auditableType, auditableIds) {
    return InstanceService.getInstancesByAuditableIds(auditableType, auditableIds)
  }

  /**
   * 查询用户的待审核步骤（叠加门店/区域范围隔离）
   * @param {number} userId - 用户ID
   * @param {Object} [queryOptions] - 查询选项（page/page_size）
   * @returns {Promise<Object>} { rows, count }
   */
  static async getPendingStepsForUser(userId, queryOptions = {}) {
    return InstanceService.getPendingStepsForUser(userId, queryOptions)
  }

  /**
   * 为待办步骤行附加「零歧义进度字段」（progress_*）
   * @param {Array<Object>} rows - 待办步骤行数组（plain object，含嵌套 instance）
   * @returns {void} 原地附加字段
   * @private
   */
  static _attachStepProgress(rows) {
    return InstanceService._attachStepProgress(rows)
  }

  /**
   * 为待办步骤行附加「提交人 + 被审核人」信息（用户名 + 脱敏手机号）
   * @param {Array<Object>} rows - 待办步骤行（plain object，含嵌套 instance）
   * @returns {Promise<void>} 原地附加 submitter_info / target_user_info
   * @private
   */
  static async _attachParties(rows) {
    return InstanceService._attachParties(rows)
  }

  /**
   * 按角色查询待审核步骤
   * @param {number} roleId - 角色ID（如 business_manager 的 role_id）
   * @param {Object} [queryOptions] - 查询选项（page/page_size/auditable_type）
   * @returns {Promise<Object>} { rows, count, page, page_size, total_pages }
   */
  static async getPendingStepsForRole(roleId, queryOptions = {}) {
    return InstanceService.getPendingStepsForRole(roleId, queryOptions)
  }

  /**
   * 查询审核链实例列表
   * @param {Object} [queryOptions] - 查询选项
   * @returns {Promise<Object>} 分页结果
   */
  static async getInstances(queryOptions = {}) {
    return InstanceService.getInstances(queryOptions)
  }

  /**
   * 获取实例详情（含完整步骤和审核历史）
   * @param {number} instanceId - 实例ID
   * @returns {Promise<Object>} 实例详情
   */
  static async getInstanceById(instanceId) {
    return InstanceService.getInstanceById(instanceId)
  }

  /**
   * 根据审核节点解析实际需要通知的用户ID列表
   * @param {Object} node - 审核节点
   * @param {Object} transaction - 事务
   * @param {number|null} [storeId] - 该步所属门店（submitter_manager 模式必需）
   * @returns {Promise<number[]>} 需要通知的 user_id 列表
   * @private
   */
  static async _resolveAssigneeUserIds(node, transaction, storeId = null) {
    return InstanceService._resolveAssigneeUserIds(node, transaction, storeId)
  }

  /**
   * 计算用户"可审门店集合"（门店/区域隔离统一口径）
   * @param {number} userId - 操作人 user_id
   * @param {Object} [transaction] - 事务（可选）
   * @returns {Promise<Set<number>>} 可审门店 store_id 集合
   * @private
   */
  static async _getUserScopedStoreIds(userId, transaction) {
    return InstanceService._getUserScopedStoreIds(userId, transaction)
  }

  // ==================== 动作域（转发 approval/ActionService）====================

  /**
   * 处理审核步骤（核心方法：单签/会签/越级留痕/终审闭环/一票否决）
   * @param {number} stepId - 步骤ID
   * @param {string} action - 操作（'approve' 或 'reject'）
   * @param {string} reason - 审批意见
   * @param {number} operatorId - 操作人 user_id
   * @param {Object} options - 选项（transaction 必填）
   * @returns {Promise<Object>} 处理结果（含 countersign_pending 标识会签未凑够）
   */
  static async processStep(stepId, action, reason, operatorId, options = {}) {
    return ActionService.processStep(stepId, action, reason, operatorId, options)
  }

  /**
   * 批量处理审核步骤（收口到审核链，批量=逐条循环 processStep，每条独立事务）
   * @param {number[]} stepIds - 待审核步骤ID数组（来自 my-pending）
   * @param {string} action - 审核动作：approve | reject
   * @param {string} reason - 审核原因（reject 必填）
   * @param {number} operatorId - 操作人用户ID（从 JWT 解析）
   * @returns {Promise<Object>} { results: [...], stats: {...} }
   */
  static async processStepsBatch(stepIds, action, reason, operatorId) {
    return ActionService.processStepsBatch(stepIds, action, reason, operatorId)
  }

  /**
   * 审核统计聚合（Web 管理端数据看板，含超时步骤数/超时率/平均审核耗时）
   * @param {Object} [options] - 选项（dimension: store/region）
   * @returns {Promise<Object>} { dimension, rows: [...], summary: {...} }
   */
  static async getApprovalStats(options = {}) {
    return ActionService.getApprovalStats(options)
  }

  /**
   * 运营分析看板（员工排行/趋势/拒绝原因 TOP/用户活跃/审核人时效排行）
   * @param {Object} [options] - 选项（days/store_id）
   * @returns {Promise<Object>} { window_days, staff_ranking, trend, reject_reasons, user_activity, reviewer_duration }
   */
  static async getOperationAnalytics(options = {}) {
    return ActionService.getOperationAnalytics(options)
  }

  /**
   * 把秒数格式化为友好耗时文案（如 "2小时30分"、"45分钟"、"30秒"）
   * @param {number} seconds - 秒数
   * @returns {string} 友好文案
   * @private
   */
  static _formatDurationSeconds(seconds) {
    return ActionService._formatDurationSeconds(seconds)
  }

  /**
   * 汇总统计行（求总计），供 getApprovalStats 复用
   * @param {Array<Object>} rows - 统计行
   * @returns {Object} 汇总对象
   * @private
   */
  static _sumStatsRows(rows) {
    return ActionService._sumStatsRows(rows)
  }

  /**
   * 验证操作人是否有权审核当前步骤，并返回审核上下文（用于会签计数与越级留痕）
   * @param {Object} step - 审核步骤
   * @param {number} operatorId - 操作人ID
   * @param {Object} transaction - 事务
   * @returns {Promise<Object>} 审核上下文 { is_escalated, original_assignee_role_id }
   * @private
   */
  static async _verifyOperatorPermission(step, operatorId, transaction) {
    return ActionService._verifyOperatorPermission(step, operatorId, transaction)
  }

  /**
   * 解析审核链实例对应业务的"当事人" user_id 列表（用于回避校验）
   * @param {Object} instance - 审核链实例
   * @param {Object} transaction - 事务
   * @returns {Promise<number[]>} 去重后的当事人 user_id 列表
   * @private
   */
  static async _resolveAuditableParties(instance, transaction) {
    return ActionService._resolveAuditableParties(instance, transaction)
  }
}

module.exports = ApprovalChainService
