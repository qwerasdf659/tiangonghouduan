/**
 * 客服工单管理服务（CustomerServiceIssueService）
 *
 * 业务说明：
 * - 工单是问题跟踪的核心实体，独立于会话存在
 * - 生命周期：open → processing → resolved → closed
 * - 一个工单可关联多个会话（用户多次来问同一个问题）
 * - 内部备注管理：客服之间传递信息，用户永远不可见
 *
 * 服务类型：静态类
 * ServiceManager Key: cs_issue
 *
 * @version 1.0.0
 * @date 2026-02-22
 */

const BusinessError = require('../utils/BusinessError')
const logger = require('../utils/logger').logger

/**
 * 客服工单管理服务
 * 工单独立于会话存在，支持跨会话跨班次跟踪问题处理进度
 */
class CustomerServiceIssueService {
  /**
   * 创建工单
   *
   * @param {Object} models - Sequelize models 对象
   * @param {Object} params - 工单数据
   * @param {number} params.user_id - 关联用户ID
   * @param {number} params.created_by - 创建人ID（客服管理员）
   * @param {string} params.issue_type - 问题类型
   * @param {string} params.title - 工单标题
   * @param {string} [params.description] - 详细描述
   * @param {string} [params.priority] - 优先级（默认 medium）
   * @param {number} [params.session_id] - 关联会话ID
   * @param {number} [params.assigned_to] - 指派给的客服ID
   * @param {string} [params.order_type] - 关联订单类型（trade/redemption/consumption）
   * @param {string} [params.order_id] - 关联订单ID（多态值）
   * @param {Object} options - 选项
   * @param {Object} [options.transaction] - 事务对象
   * @returns {Object} 创建的工单
   */
  static async create(models, params, options = {}) {
    const {
      user_id,
      created_by,
      issue_type,
      title,
      description,
      priority,
      session_id,
      assigned_to,
      order_type,
      order_id
    } = params

    /* 验证用户存在 */
    const user = await models.User.findByPk(user_id, { transaction: options.transaction })
    if (!user) {
      throw new BusinessError(`用户 ${user_id} 不存在`, 'SERVICE_NOT_FOUND', 404)
    }

    const issue = await models.CustomerServiceIssue.create(
      {
        user_id,
        created_by,
        assigned_to: assigned_to || created_by,
        session_id: session_id || null,
        issue_type,
        priority: priority || 'medium',
        status: 'open',
        title,
        description: description || null,
        order_type: order_type || null,
        order_id: order_id || null
      },
      { transaction: options.transaction }
    )

    /* 如果关联了会话，更新会话的 issue_id */
    if (session_id) {
      await models.CustomerServiceSession.update(
        { issue_id: issue.issue_id },
        {
          where: { customer_service_session_id: session_id },
          transaction: options.transaction
        }
      )
    }

    logger.info(`工单创建: issue_id=${issue.issue_id}, type=${issue_type}, user_id=${user_id}`)

    return issue.get({ plain: true })
  }

  /**
   * 获取工单列表（支持筛选、分页）
   *
   * @param {Object} models - Sequelize models 对象
   * @param {Object} params - 查询参数
   * @param {string} [params.status] - 状态筛选
   * @param {string} [params.issue_type] - 类型筛选
   * @param {string} [params.priority] - 优先级筛选
   * @param {number} [params.assigned_to] - 负责人筛选
   * @param {number} [params.user_id] - 用户ID筛选
   * @param {number} [params.page] - 页码（默认1）
   * @param {number} [params.page_size] - 每页数量（默认20）
   * @returns {Object} { rows, count, page, page_size }
   */
  static async list(models, params = {}) {
    const page = parseInt(params.page) || 1
    const pageSize = Math.min(parseInt(params.page_size) || 20, 100)
    const offset = (page - 1) * pageSize

    const where = {}
    if (params.status) where.status = params.status
    if (params.issue_type) where.issue_type = params.issue_type
    if (params.priority) where.priority = params.priority
    if (params.assigned_to) where.assigned_to = parseInt(params.assigned_to)
    if (params.user_id) where.user_id = parseInt(params.user_id)
    if (params.order_type) where.order_type = params.order_type
    if (params.order_id) where.order_id = params.order_id

    const { count, rows } = await models.CustomerServiceIssue.findAndCountAll({
      where,
      include: [
        { model: models.User, as: 'user', attributes: ['user_id', 'nickname', 'mobile'] },
        { model: models.User, as: 'creator', attributes: ['user_id', 'nickname'] },
        { model: models.User, as: 'assignee', attributes: ['user_id', 'nickname'] }
      ],
      order: [
        ['priority', 'DESC'],
        ['created_at', 'DESC']
      ],
      limit: pageSize,
      offset
    })

    return {
      rows: rows.map(r => r.get({ plain: true })),
      count,
      page,
      page_size: pageSize
    }
  }

  /**
   * 获取工单详情（含关联会话和备注）
   *
   * @param {Object} models - Sequelize models 对象
   * @param {number} issueId - 工单ID
   * @returns {Object} 工单详情
   */
  static async getDetail(models, issueId) {
    const issue = await models.CustomerServiceIssue.findByPk(issueId, {
      include: [
        { model: models.User, as: 'user', attributes: ['user_id', 'nickname', 'mobile'] },
        { model: models.User, as: 'creator', attributes: ['user_id', 'nickname'] },
        { model: models.User, as: 'assignee', attributes: ['user_id', 'nickname'] },
        {
          model: models.CustomerServiceSession,
          as: 'session',
          attributes: ['customer_service_session_id', 'status', 'created_at', 'closed_at']
        },
        {
          model: models.CustomerServiceNote,
          as: 'notes',
          include: [{ model: models.User, as: 'author', attributes: ['user_id', 'nickname'] }],
          order: [['created_at', 'DESC']]
        }
      ]
    })

    if (!issue) {
      throw new BusinessError(`工单 ${issueId} 不存在`, 'SERVICE_NOT_FOUND', 404)
    }

    /* 查询关联此工单的所有会话 */
    const relatedSessions = await models.CustomerServiceSession.findAll({
      where: { issue_id: issueId },
      attributes: [
        'customer_service_session_id',
        'status',
        'created_at',
        'closed_at',
        'satisfaction_score'
      ],
      order: [['created_at', 'DESC']]
    })

    const result = issue.get({ plain: true })
    result.related_sessions = relatedSessions.map(s => s.get({ plain: true }))

    return result
  }

  /**
   * 更新工单（状态变更、指派、添加处理结果）
   *
   * @param {Object} models - Sequelize models 对象
   * @param {number} issueId - 工单ID
   * @param {Object} updates - 更新字段
   * @param {string} [updates.status] - 新状态
   * @param {number} [updates.assigned_to] - 新负责人
   * @param {string} [updates.resolution] - 处理结果
   * @param {string} [updates.priority] - 优先级
   * @param {Object} options - 选项
   * @param {Object} [options.transaction] - 事务对象
   * @returns {Object} 更新后的工单
   */
  static async update(models, issueId, updates, options = {}) {
    const issue = await models.CustomerServiceIssue.findByPk(issueId, {
      transaction: options.transaction
    })

    if (!issue) {
      throw new BusinessError(`工单 ${issueId} 不存在`, 'SERVICE_NOT_FOUND', 404)
    }

    const updateData = {}
    if (updates.status) {
      updateData.status = updates.status
      if (updates.status === 'resolved') {
        updateData.resolved_at = new Date()
      }
      if (updates.status === 'closed') {
        updateData.closed_at = new Date()
      }
    }
    if (updates.assigned_to !== undefined) updateData.assigned_to = updates.assigned_to
    if (updates.resolution !== undefined) updateData.resolution = updates.resolution
    if (updates.priority !== undefined) updateData.priority = updates.priority

    await issue.update(updateData, { transaction: options.transaction })

    logger.info(`工单更新: issue_id=${issueId}, updates=${JSON.stringify(Object.keys(updateData))}`)

    return issue.get({ plain: true })
  }

  /**
   * 添加内部备注
   *
   * @param {Object} models - Sequelize models 对象
   * @param {Object} params - 备注数据
   * @param {number} params.issue_id - 工单ID（可选）
   * @param {number} params.user_id - 关于哪个用户
   * @param {number} params.author_id - 备注作者ID
   * @param {string} params.content - 备注内容
   * @param {number} [params.session_id] - 关联会话ID
   * @param {Object} options - 选项
   * @param {Object} [options.transaction] - 事务对象
   * @returns {Object} 创建的备注
   */
  static async addNote(models, params, options = {}) {
    const note = await models.CustomerServiceNote.create(
      {
        user_id: params.user_id,
        issue_id: params.issue_id || null,
        session_id: params.session_id || null,
        author_id: params.author_id,
        content: params.content
      },
      { transaction: options.transaction }
    )

    return note.get({ plain: true })
  }

  /**
   * 获取工单/用户的内部备注列表
   *
   * @param {Object} models - Sequelize models 对象
   * @param {Object} params - 查询参数
   * @param {number} [params.issue_id] - 按工单筛选
   * @param {number} [params.user_id] - 按用户筛选
   * @param {number} [params.page] - 页码
   * @param {number} [params.page_size] - 每页数量
   * @returns {Object} { rows, count, page, page_size }
   */
  static async getNotes(models, params = {}) {
    const page = parseInt(params.page) || 1
    const pageSize = parseInt(params.page_size) || 20
    const offset = (page - 1) * pageSize

    const where = {}
    if (params.issue_id) where.issue_id = parseInt(params.issue_id)
    if (params.user_id) where.user_id = parseInt(params.user_id)

    const { count, rows } = await models.CustomerServiceNote.findAndCountAll({
      where,
      include: [{ model: models.User, as: 'author', attributes: ['user_id', 'nickname'] }],
      order: [['created_at', 'DESC']],
      limit: pageSize,
      offset
    })

    return {
      rows: rows.map(r => r.get({ plain: true })),
      count,
      page,
      page_size: pageSize
    }
  }

  /**
   * 工单统计看板（按状态/类型/优先级分组计数 + 平均处理时长 + 待处理积压）
   *
   * @description 看板数据源（客服看板 B 类 issues/stats）：复用 customer_service_issues，零新表。
   * @param {Object} models - Sequelize models 对象
   * @param {Object} [params] - 查询参数
   * @param {number} [params.days=30] - 统计天数（按 created_at 北京时区范围）
   * @returns {Object} { range_days, total, by_status, by_type, by_priority, avg_resolution_hours, pending_backlog, updated_at }
   */
  static async getStats(models, params = {}) {
    const { Op, fn, col, literal } = require('sequelize')
    const BeijingTimeHelper = require('../utils/timeHelper')
    const days = parseInt(params.days, 10) || 30
    const startDate = BeijingTimeHelper.daysAgo(days)
    const where = { created_at: { [Op.gte]: startDate } }

    const groupCount = async groupCol => {
      const rows = await models.CustomerServiceIssue.findAll({
        attributes: [groupCol, [fn('COUNT', col('issue_id')), 'cnt']],
        where,
        group: [groupCol],
        raw: true
      })
      return rows.map(r => ({ key: r[groupCol], count: parseInt(r.cnt, 10) }))
    }

    const [byStatus, byType, byPriority] = await Promise.all([
      groupCount('status'),
      groupCount('issue_type'),
      groupCount('priority')
    ])

    // 平均处理时长（已解决：resolved_at - created_at，小时）
    const resolvedRow = await models.CustomerServiceIssue.findOne({
      attributes: [
        [fn('AVG', literal('TIMESTAMPDIFF(HOUR, created_at, resolved_at)')), 'avg_hours'],
        [fn('COUNT', col('issue_id')), 'resolved_count']
      ],
      where: { ...where, resolved_at: { [Op.ne]: null } },
      raw: true
    })

    // 待处理积压（open/processing，不限时间窗，反映当前压力）
    const pendingBacklog = await models.CustomerServiceIssue.count({
      where: { status: { [Op.in]: ['open', 'processing'] } }
    })

    const total = byStatus.reduce((s, r) => s + r.count, 0)

    return {
      range_days: days,
      total,
      by_status: byStatus,
      by_type: byType,
      by_priority: byPriority,
      avg_resolution_hours: Math.round(parseFloat(resolvedRow?.avg_hours || 0) * 10) / 10,
      resolved_count: parseInt(resolvedRow?.resolved_count || 0, 10),
      pending_backlog: pendingBacklog,
      updated_at: BeijingTimeHelper.apiTimestamp()
    }
  }
}

module.exports = CustomerServiceIssueService
