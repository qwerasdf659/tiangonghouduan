/**
 * 商家积分申请服务（MerchantPointsService）
 *
 * 功能说明：
 * - 处理商家积分申请的业务逻辑
 * - 集成统一审核引擎（ContentAuditEngine）进行审核流程管理
 * - 审核通过后通过 BalanceService 发放积分（V4.7.0 AssetService 拆分）
 * - 记录审计日志到 AuditLogService
 *
 * 设计模式：
 * - 业务逻辑在 Service 中完成
 * - 审核引擎（ContentAuditEngine）只做状态机，不包含业务逻辑
 * - 审核回调（MerchantPointsAuditCallback）调用本服务的方法完成业务处理
 *
 * 数据存储：
 * - 使用 content_review_records 表存储审核记录
 * - auditable_type = 'merchant_points'
 * - auditable_id = user_id（申请商家的用户ID）
 * - audit_data = JSON格式存储申请详情（points_amount, description等）
 *
 * 创建时间：2026年01月09日
 * 作者：AI Assistant
 */

const { ContentReviewRecord, User } = require('../models')
// V4.7.0 AssetService 拆分：使用子服务替代原 AssetService（2026-01-31）
const BalanceService = require('./asset/BalanceService')
const AuditLogService = require('./AuditLogService')
const ContentAuditEngine = require('./ContentAuditEngine')
const BeijingTimeHelper = require('../utils/timeHelper')
const { assertAndGetTransaction } = require('../utils/transactionHelpers')
const { logger } = require('../utils/logger')

/**
 * 商家积分申请服务
 * @class MerchantPointsService
 */
class MerchantPointsService {
  /**
   * 提交商家积分申请
   *
   * @description 商家提交积分申请，系统创建审核记录并进入统一审核流程
   *
   * @param {number} userId - 提交申请的用户ID（商家ID）
   * @param {number} pointsAmount - 申请的积分数量
   * @param {string} description - 申请描述/说明
   * @param {Object} [options={}] - 可选参数
   * @param {Object} options.transaction - 数据库事务对象
   * @returns {Promise<ContentReviewRecord>} 创建的审核记录
   * @throws {Error} 用户不存在时抛出错误
   * @throws {Error} 积分数量无效时抛出错误
   *
   * @example
   * const auditRecord = await MerchantPointsService.submitApplication(
   *   123,      // userId
   *   500,      // pointsAmount
   *   '销售奖励'  // description
   * );
   */
  static async submitApplication(userId, pointsAmount, description, options = {}) {
    const transaction = assertAndGetTransaction(options, 'MerchantPointsService.submitApplication')

    // 1. 参数校验
    if (!userId || typeof userId !== 'number') {
      throw new Error('用户ID不能为空且必须为数字')
    }
    if (!pointsAmount || typeof pointsAmount !== 'number' || pointsAmount <= 0) {
      throw new Error('申请积分数量必须为正整数')
    }
    if (!description || typeof description !== 'string' || description.trim().length === 0) {
      throw new Error('申请描述不能为空')
    }

    // 2. 验证用户存在
    const user = await User.findByPk(userId, { transaction })
    if (!user) {
      throw new Error(`用户不存在: user_id=${userId}`)
    }

    /*
     * 3. 提交到统一审核引擎
     * auditable_id 使用 userId，audit_data 存储申请详情
     */
    const auditRecord = await ContentAuditEngine.submitForAudit(
      'merchant_points', // auditable_type
      userId, // auditable_id（使用用户ID作为业务实体ID）
      {
        priority: 'medium',
        auditData: {
          user_id: userId,
          points_amount: pointsAmount,
          description: description.trim(),
          submitted_at: BeijingTimeHelper.apiTimestamp()
        },
        transaction
      }
    )

    // 4. 记录审计日志
    await AuditLogService.logOperation({
      operator_id: userId,
      operation_type: 'merchant_points_submit',
      target_type: 'ContentReviewRecord',
      target_id: auditRecord.audit_id,
      action: 'create',
      after_data: {
        audit_id: auditRecord.audit_id,
        points_amount: pointsAmount,
        description: description.trim(),
        status: 'pending'
      }
    })

    logger.info(
      `[商家积分] 提交申请成功: audit_id=${auditRecord.audit_id}, user_id=${userId}, points=${pointsAmount}`
    )

    return auditRecord
  }

  /**
   * 处理审核通过的商家积分申请（由回调触发）
   *
   * @description 审核通过后，发放积分给商家，更新相关状态
   * 注意：此方法由 MerchantPointsAuditCallback.approved() 调用，不应直接调用
   *
   * @param {number} auditId - 审核记录ID
   * @param {number} auditorId - 审核员ID
   * @param {Object} [options={}] - 可选参数
   * @param {Object} options.transaction - 数据库事务对象
   * @returns {Promise<void>} 无返回值
   * @throws {Error} 审核记录不存在时抛出错误
   * @throws {Error} 审核记录状态不正确时抛出错误
   */
  static async processApprovedApplication(auditId, auditorId, options = {}) {
    const transaction = assertAndGetTransaction(
      options,
      'MerchantPointsService.processApprovedApplication'
    )

    // 1. 获取审核记录
    const auditRecord = await ContentReviewRecord.findByPk(auditId, { transaction })
    if (!auditRecord) {
      throw new Error(`审核记录不存在: audit_id=${auditId}`)
    }

    // 2. 验证审核类型
    if (auditRecord.auditable_type !== 'merchant_points') {
      throw new Error(`审核类型不匹配: 期望=merchant_points, 实际=${auditRecord.auditable_type}`)
    }

    // 3. 提取申请信息
    const auditData = auditRecord.audit_data || {}
    const userId = auditData.user_id || auditRecord.auditable_id
    const pointsAmount = auditData.points_amount

    if (!pointsAmount || pointsAmount <= 0) {
      throw new Error(`申请积分数量无效: audit_id=${auditId}, points_amount=${pointsAmount}`)
    }

    // 4. 发放积分
    // eslint-disable-next-line no-restricted-syntax
    await BalanceService.changeBalance(
      {
        user_id: userId,
        asset_code: 'POINTS',
        delta_amount: pointsAmount,
        business_type: 'merchant_points_reward',
        idempotency_key: `merchant_points_reward:${auditId}`,
        meta: {
          audit_id: auditId,
          description: auditData.description || '商家积分申请通过',
          auditor_id: auditorId
        }
      },
      { transaction }
    )

    // 5. 记录审计日志
    await AuditLogService.logOperation({
      operator_id: auditorId,
      operation_type: 'merchant_points_approve',
      target_type: 'ContentReviewRecord',
      target_id: auditId,
      action: 'approve',
      after_data: {
        status: 'approved',
        points_awarded: pointsAmount,
        user_id: userId
      }
    })

    logger.info(
      `[商家积分] 申请已通过，积分已发放: audit_id=${auditId}, user_id=${userId}, points=${pointsAmount}`
    )
  }

  /**
   * 处理审核拒绝的商家积分申请（由回调触发）
   *
   * @description 审核拒绝后，记录拒绝原因，不发放积分
   * 注意：此方法由 MerchantPointsAuditCallback.rejected() 调用，不应直接调用
   *
   * @param {number} auditId - 审核记录ID
   * @param {number} auditorId - 审核员ID
   * @param {string} reason - 拒绝原因
   * @param {Object} [options={}] - 可选参数
   * @param {Object} options.transaction - 数据库事务对象
   * @returns {Promise<void>} 无返回值
   * @throws {Error} 审核记录不存在时抛出错误
   */
  static async processRejectedApplication(auditId, auditorId, reason, options = {}) {
    const transaction = assertAndGetTransaction(
      options,
      'MerchantPointsService.processRejectedApplication'
    )

    // 1. 获取审核记录
    const auditRecord = await ContentReviewRecord.findByPk(auditId, { transaction })
    if (!auditRecord) {
      throw new Error(`审核记录不存在: audit_id=${auditId}`)
    }

    // 2. 验证审核类型
    if (auditRecord.auditable_type !== 'merchant_points') {
      throw new Error(`审核类型不匹配: 期望=merchant_points, 实际=${auditRecord.auditable_type}`)
    }

    // 3. 提取申请信息用于日志
    const auditData = auditRecord.audit_data || {}
    const userId = auditData.user_id || auditRecord.auditable_id

    // 4. 记录审计日志
    await AuditLogService.logOperation({
      operator_id: auditorId,
      operation_type: 'merchant_points_reject',
      target_type: 'ContentReviewRecord',
      target_id: auditId,
      action: 'reject',
      after_data: {
        status: 'rejected',
        reason,
        user_id: userId,
        points_requested: auditData.points_amount
      }
    })

    logger.info(`[商家积分] 申请已拒绝: audit_id=${auditId}, user_id=${userId}, reason=${reason}`)
  }

  /**
   * 获取商家积分申请列表
   *
   * @description 根据筛选条件查询商家积分申请列表，支持分页
   *
   * @param {Object} [filters={}] - 筛选条件
   * @param {string} [filters.status] - 审核状态（pending/approved/rejected/cancelled）
   * @param {number} [filters.userId] - 申请用户ID
   * @param {number} [filters.auditorId] - 审核员ID
   * @param {number} [page=1] - 页码（从1开始）
   * @param {number} [pageSize=10] - 每页数量
   * @returns {Promise<{rows: ContentReviewRecord[], count: number, pagination: Object}>} 申请列表和分页信息
   */
  static async getApplications(filters = {}, page = 1, pageSize = 10) {
    const where = {
      auditable_type: 'merchant_points' // 固定筛选商家积分类型
    }

    // 状态筛选
    if (filters.status) {
      where.audit_status = filters.status
    }

    // 用户筛选（通过 auditable_id）
    if (filters.userId) {
      where.auditable_id = filters.userId
    }

    // 审核员筛选
    if (filters.auditorId) {
      where.auditor_id = filters.auditorId
    }

    const offset = (page - 1) * pageSize
    const { rows, count } = await ContentReviewRecord.findAndCountAll({
      where,
      limit: pageSize,
      offset,
      order: [['submitted_at', 'DESC']],
      include: [
        {
          model: User,
          as: 'auditor',
          attributes: ['user_id', 'nickname', 'mobile'],
          required: false
        }
      ]
    })

    /*
     * 批量获取申请用户信息
     * 注意：auditable_id 可能是字符串类型，需要转换为数字进行查询
     */
    const userIds = [
      ...new Set(rows.map(r => parseInt(r.auditable_id, 10)).filter(id => !isNaN(id)))
    ]
    const users = await User.findAll({
      where: { user_id: userIds },
      attributes: ['user_id', 'nickname', 'mobile']
    })
    // 使用数字类型作为 Map 的键
    const userMap = new Map(users.map(u => [u.user_id, u]))

    /*
     * 组装返回数据
     * 注意：数据库主键是 content_review_record_id，业务上使用 audit_id 作为别名
     */
    const enrichedRows = rows.map(record => {
      const plainRecord = record.toJSON()
      const auditData = plainRecord.audit_data || {}
      // 确保使用数字类型从 userMap 获取用户信息
      const userId = parseInt(plainRecord.auditable_id, 10)
      return {
        // 使用数据库实际主键字段名 content_review_record_id
        audit_id: plainRecord.content_review_record_id,
        user_id: plainRecord.auditable_id,
        applicant: userMap.get(userId) || null,
        points_amount: auditData.points_amount,
        description: auditData.description,
        status: plainRecord.audit_status,
        priority: plainRecord.priority,
        auditor: plainRecord.auditor || null,
        audit_reason: plainRecord.audit_reason,
        submitted_at: plainRecord.submitted_at,
        audited_at: plainRecord.audited_at,
        created_at: plainRecord.created_at
      }
    })

    return {
      rows: enrichedRows,
      count,
      pagination: {
        page,
        page_size: pageSize,
        total: count,
        total_pages: Math.ceil(count / pageSize)
      }
    }
  }

  /**
   * 获取单个商家积分申请详情
   *
   * @param {number} auditId - 审核记录ID
   * @returns {Promise<Object|null>} 申请详情，不存在时返回null
   */
  static async getApplicationById(auditId) {
    // 注意：auditId 对应数据库的 content_review_record_id 主键
    const record = await ContentReviewRecord.findOne({
      where: {
        content_review_record_id: auditId,
        auditable_type: 'merchant_points'
      },
      include: [
        {
          model: User,
          as: 'auditor',
          attributes: ['user_id', 'nickname', 'mobile'],
          required: false
        }
      ]
    })

    if (!record) {
      return null
    }

    // 获取申请用户信息
    const applicant = await User.findByPk(record.auditable_id, {
      attributes: ['user_id', 'nickname', 'mobile']
    })

    const plainRecord = record.toJSON()
    const auditData = plainRecord.audit_data || {}

    return {
      // 使用数据库实际主键字段名 content_review_record_id
      audit_id: plainRecord.content_review_record_id,
      user_id: plainRecord.auditable_id,
      applicant: applicant ? applicant.toJSON() : null,
      points_amount: auditData.points_amount,
      description: auditData.description,
      status: plainRecord.audit_status,
      priority: plainRecord.priority,
      auditor: plainRecord.auditor || null,
      audit_reason: plainRecord.audit_reason,
      submitted_at: plainRecord.submitted_at,
      audited_at: plainRecord.audited_at,
      created_at: plainRecord.created_at
    }
  }

  /**
   * 获取用户的申请统计
   *
   * @param {number} userId - 用户ID
   * @returns {Promise<Object>} 统计信息
   */
  static async getUserApplicationStats(userId) {
    const { Sequelize } = require('sequelize')

    const stats = await ContentReviewRecord.findAll({
      where: {
        auditable_type: 'merchant_points',
        auditable_id: userId
      },
      attributes: ['audit_status', [Sequelize.fn('COUNT', Sequelize.col('audit_id')), 'count']],
      group: ['audit_status'],
      raw: true
    })

    const result = {
      total: 0,
      pending: 0,
      approved: 0,
      rejected: 0,
      cancelled: 0
    }

    stats.forEach(stat => {
      const count = parseInt(stat.count, 10)
      result[stat.audit_status] = count
      result.total += count
    })

    return result
  }
}

module.exports = MerchantPointsService
