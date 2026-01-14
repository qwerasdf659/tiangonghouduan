const logger = require('../utils/logger').logger

/**
 * 内容审核引擎（通用审核基础设施层）
 *
 * 原名：AuditService
 * 重命名时间：2025-10-12
 * 重命名原因：提升命名清晰度，突出"引擎"职责
 *
 * 功能说明：
 * - 提供统一的审核流程管理
 * - 支持多种业务类型的审核（exchange、image、feedback等）
 * - 管理审核记录的生命周期
 * - 触发业务回调处理
 *
 * 设计原则：
 * - 通用性：适用于所有需要审核的业务场景
 * - 解耦性：审核逻辑与具体业务逻辑分离
 * - 可扩展性：通过回调机制支持新的业务类型
 *
 * 职责定位：
 * - 基础设施层：提供通用审核能力
 * - 区别于ExchangeOperationService（应用层运营工具）
 *
 * 事务边界治理（2026-01-05 决策）：
 * - 所有写操作 **强制要求** 外部事务传入（options.transaction）
 * - 未提供事务时直接报错（使用 assertAndGetTransaction）
 * - 服务层禁止自建事务，由入口层统一使用 TransactionManager.execute()
 *
 * 创建时间：2025-10-11
 * 最后更新：2026年01月05日（事务边界治理改造）
 */

const { ContentReviewRecord } = require('../models')
const BeijingTimeHelper = require('../utils/timeHelper')
const { assertAndGetTransaction } = require('../utils/transactionHelpers')

/**
 * 内容审核引擎类
 * 业务职责：提供统一的审核流程管理和回调机制
 * 设计模式：通用基础设施层，解耦审核逻辑与业务逻辑
 * 支持类型：exchange（兑换）、feedback（反馈）
 *
 * 支持类型：
 * - text: 文本内容审核（敏感词、违禁词检测）
 */
class ContentAuditEngine {
  /**
   * 提交审核
   *
   * @param {string} auditableType - 审核对象类型（exchange/image/feedback）
   * @param {number} auditableId - 审核对象ID
   * @param {Object} options - 审核选项
   * @param {string} options.priority - 优先级（high/medium/low）
   * @param {Object} options.auditData - 审核相关数据
   * @param {Object} options.transaction - 数据库事务
   * @returns {Promise<ContentReviewRecord>} 审核记录
   */
  static async submitForAudit(auditableType, auditableId, options = {}) {
    const { priority = 'medium', auditData = {}, transaction = null } = options

    logger.info(`[审核服务] 提交审核: ${auditableType} ID=${auditableId}, 优先级=${priority}`)

    /*
     * 验证审核对象类型
     * 2026-01-09 扩展：添加 consumption 和 merchant_points 类型（功能重复检查报告决策）
     * - consumption: 消费审核（ConsumptionService）
     * - merchant_points: 商家积分审核
     * - exchange: 兑换审核
     * - feedback: 反馈审核
     */
    const validTypes = ['exchange', 'feedback', 'consumption', 'merchant_points']
    if (!validTypes.includes(auditableType)) {
      throw new Error(`不支持的审核类型: ${auditableType}，仅支持: ${validTypes.join(', ')}`)
    }

    // 验证优先级
    const validPriorities = ['high', 'medium', 'low']
    if (!validPriorities.includes(priority)) {
      throw new Error(`无效的优先级: ${priority}，仅支持: ${validPriorities.join(', ')}`)
    }

    // 检查是否已存在待审核记录（防止重复提交）
    const existingAudit = await ContentReviewRecord.findOne({
      where: {
        auditable_type: auditableType,
        auditable_id: auditableId,
        audit_status: 'pending'
      },
      transaction
    })

    if (existingAudit) {
      logger.info(`[审核服务] 已存在待审核记录: audit_id=${existingAudit.audit_id}`)
      return existingAudit
    }

    // 创建审核记录
    const auditRecord = await ContentReviewRecord.create(
      {
        auditable_type: auditableType,
        auditable_id: auditableId,
        audit_status: 'pending',
        priority,
        audit_data: auditData,
        submitted_at: BeijingTimeHelper.createDatabaseTime()
      },
      { transaction }
    )

    logger.info(`[审核服务] 审核记录已创建: audit_id=${auditRecord.audit_id}`)

    return auditRecord
  }

  /**
   * 审核通过
   *
   * 事务边界治理（2026-01-05 决策）：
   * - 强制要求外部事务传入（options.transaction）
   * - 未提供事务时直接报错，由入口层统一管理事务
   *
   * @param {number} auditId - 审核记录ID
   * @param {number} auditorId - 审核员ID
   * @param {string} reason - 审核意见
   * @param {Object} options - 选项
   * @param {Object} options.transaction - Sequelize事务对象（必填）
   * @returns {Promise<Object>} 审核结果
   */
  static async approve(auditId, auditorId, reason = null, options = {}) {
    // 强制要求事务边界 - 2026-01-05 治理决策
    const transaction = assertAndGetTransaction(options, 'ContentAuditEngine.approve')

    logger.info(`[审核服务] 审核通过: audit_id=${auditId}, auditor_id=${auditorId}`)

    // 1. 获取审核记录
    const auditRecord = await ContentReviewRecord.findByPk(auditId, { transaction })

    if (!auditRecord) {
      throw new Error(`审核记录不存在: audit_id=${auditId}`)
    }

    // 2. 验证审核状态
    if (auditRecord.audit_status !== 'pending') {
      throw new Error(`审核记录状态不正确: 当前状态=${auditRecord.audit_status}，期望状态=pending`)
    }

    // 3. 更新审核记录
    await auditRecord.update(
      {
        audit_status: 'approved',
        auditor_id: auditorId,
        audit_reason: reason,
        audited_at: BeijingTimeHelper.createDatabaseTime()
      },
      { transaction }
    )

    // 4. 触发审核通过回调
    await this.triggerAuditCallback(auditRecord, 'approved', transaction)

    logger.info(`[审核服务] 审核通过成功: audit_id=${auditId}`)

    return {
      success: true,
      audit_record: auditRecord,
      message: '审核通过'
    }
  }

  /**
   * 审核拒绝
   *
   * 事务边界治理（2026-01-05 决策）：
   * - 强制要求外部事务传入（options.transaction）
   * - 未提供事务时直接报错，由入口层统一管理事务
   *
   * @param {number} auditId - 审核记录ID
   * @param {number} auditorId - 审核员ID
   * @param {string} reason - 拒绝原因（必需）
   * @param {Object} options - 选项
   * @param {Object} options.transaction - Sequelize事务对象（必填）
   * @returns {Promise<Object>} 审核结果
   */
  static async reject(auditId, auditorId, reason, options = {}) {
    if (!reason || reason.trim().length < 5) {
      throw new Error('拒绝原因必须提供，且不少于5个字符')
    }

    // 强制要求事务边界 - 2026-01-05 治理决策
    const transaction = assertAndGetTransaction(options, 'ContentAuditEngine.reject')

    logger.info(`[审核服务] 审核拒绝: audit_id=${auditId}, auditor_id=${auditorId}`)

    // 1. 获取审核记录
    const auditRecord = await ContentReviewRecord.findByPk(auditId, { transaction })

    if (!auditRecord) {
      throw new Error(`审核记录不存在: audit_id=${auditId}`)
    }

    // 2. 验证审核状态
    if (auditRecord.audit_status !== 'pending') {
      throw new Error(`审核记录状态不正确: 当前状态=${auditRecord.audit_status}，期望状态=pending`)
    }

    // 3. 更新审核记录
    await auditRecord.update(
      {
        audit_status: 'rejected',
        auditor_id: auditorId,
        audit_reason: reason,
        audited_at: BeijingTimeHelper.createDatabaseTime()
      },
      { transaction }
    )

    // 4. 触发审核拒绝回调
    await this.triggerAuditCallback(auditRecord, 'rejected', transaction)

    logger.info(`[审核服务] 审核拒绝成功: audit_id=${auditId}`)

    return {
      success: true,
      audit_record: auditRecord,
      message: '审核拒绝'
    }
  }

  /**
   * 取消审核
   *
   * @param {number} auditId - 审核记录ID
   * @param {string} reason - 取消原因
   * @param {Object} options - 选项
   * @returns {Promise<Object>} 取消结果
   */
  static async cancel(auditId, reason = null, options = {}) {
    const transaction = options.transaction || null

    logger.info(`[审核服务] 取消审核: audit_id=${auditId}`)

    // 1. 获取审核记录
    const auditRecord = await ContentReviewRecord.findByPk(auditId, { transaction })

    if (!auditRecord) {
      throw new Error(`审核记录不存在: audit_id=${auditId}`)
    }

    // 2. 验证审核状态
    if (auditRecord.audit_status !== 'pending') {
      throw new Error(`只能取消待审核记录: 当前状态=${auditRecord.audit_status}`)
    }

    // 3. 更新审核记录
    await auditRecord.update(
      {
        audit_status: 'cancelled',
        audit_reason: reason || '用户取消审核',
        audited_at: BeijingTimeHelper.createDatabaseTime()
      },
      { transaction }
    )

    logger.info(`[审核服务] 审核取消成功: audit_id=${auditId}`)

    return {
      success: true,
      audit_record: auditRecord,
      message: '审核已取消'
    }
  }

  /**
   * 触发审核回调
   * 业务场景：审核通过/拒绝后，触发对应业务逻辑的回调处理
   * 设计模式：回调机制，实现审核引擎与具体业务的解耦
   * @param {ContentReviewRecord} auditRecord - 审核记录
   * @param {string} result - 审核结果（approved/rejected）
   * @param {Object} transaction - 数据库事务
   * @returns {Promise<void>} 无返回值，回调执行失败不影响审核结果
   * @private
   */
  static async triggerAuditCallback(auditRecord, result, transaction) {
    try {
      logger.info(`[审核回调] 触发回调: type=${auditRecord.auditable_type}, result=${result}`)

      /*
       * 动态加载对应的回调处理器
       * 支持类型：exchange, feedback, consumption, merchant_points
       */
      const callbackMap = {
        exchange: '../callbacks/ExchangeAuditCallback',
        feedback: '../callbacks/FeedbackAuditCallback',
        consumption: '../callbacks/ConsumptionAuditCallback',
        merchant_points: '../callbacks/MerchantPointsAuditCallback'
      }

      const callbackPath = callbackMap[auditRecord.auditable_type]
      if (!callbackPath) {
        logger.warn(`[审核回调] 未找到回调处理器: ${auditRecord.auditable_type}`)
        return
      }

      // 动态require，如果文件不存在则跳过
      let callback
      try {
        callback = require(callbackPath)
      } catch (err) {
        if (err.code === 'MODULE_NOT_FOUND') {
          logger.warn(`[审核回调] 回调处理器未实现: ${callbackPath}`)
          return
        }
        throw err
      }

      // 执行回调
      if (callback && typeof callback[result] === 'function') {
        await callback[result](auditRecord.auditable_id, auditRecord, transaction)
        logger.info(`[审核回调] 回调执行成功: ${auditRecord.auditable_type}.${result}`)
      } else {
        logger.warn(`[审核回调] 回调方法未实现: ${auditRecord.auditable_type}.${result}`)
      }
    } catch (error) {
      logger.error(`[审核回调] 回调执行失败: ${error.message}`)
      // 回调失败不影响审核结果，记录错误但不抛出
    }
  }

  /**
   * 获取待审核记录列表
   *
   * @param {Object} options - 查询选项
   * @returns {Promise<Array>} 审核记录列表
   */
  static async getPendingAudits(options = {}) {
    const { auditableType = null, priority = null, limit = 20, offset = 0 } = options

    const whereClause = {
      audit_status: 'pending'
    }

    if (auditableType) {
      whereClause.auditable_type = auditableType
    }

    if (priority) {
      whereClause.priority = priority
    }

    const audits = await ContentReviewRecord.findAll({
      where: whereClause,
      order: [
        ['priority', 'DESC'], // 高优先级优先
        ['submitted_at', 'ASC'] // 早提交的优先
      ],
      limit,
      offset
    })

    return audits
  }

  /**
   * 获取审核记录详情
   *
   * @param {number} auditId - 审核记录ID
   * @returns {Promise<ContentReviewRecord>} 审核记录
   */
  static async getAuditById(auditId) {
    const audit = await ContentReviewRecord.findByPk(auditId)

    if (!audit) {
      throw new Error(`审核记录不存在: audit_id=${auditId}`)
    }

    return audit
  }

  /**
   * 获取指定对象的审核记录
   *
   * @param {string} auditableType - 审核对象类型
   * @param {number} auditableId - 审核对象ID
   * @returns {Promise<Array>} 审核记录列表
   */
  static async getAuditsByAuditable(auditableType, auditableId) {
    const audits = await ContentReviewRecord.findAll({
      where: {
        auditable_type: auditableType,
        auditable_id: auditableId
      },
      order: [['created_at', 'DESC']]
    })

    return audits
  }

  /**
   * 获取审核统计信息
   *
   * @param {string} auditableType - 审核对象类型（可选）
   * @returns {Promise<Object>} 统计信息
   */
  static async getAuditStatistics(auditableType = null) {
    const whereClause = auditableType ? { auditable_type: auditableType } : {}

    const [total, pending, approved, rejected, cancelled] = await Promise.all([
      ContentReviewRecord.count({ where: whereClause }),
      ContentReviewRecord.count({ where: { ...whereClause, audit_status: 'pending' } }),
      ContentReviewRecord.count({ where: { ...whereClause, audit_status: 'approved' } }),
      ContentReviewRecord.count({ where: { ...whereClause, audit_status: 'rejected' } }),
      ContentReviewRecord.count({ where: { ...whereClause, audit_status: 'cancelled' } })
    ])

    return {
      total,
      pending,
      approved,
      rejected,
      cancelled,
      approval_rate: total > 0 ? ((approved / total) * 100).toFixed(2) + '%' : '0%',
      rejection_rate: total > 0 ? ((rejected / total) * 100).toFixed(2) + '%' : '0%'
    }
  }
}

module.exports = ContentAuditEngine
