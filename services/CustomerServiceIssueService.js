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
      assigned_to
    } = params

    /* 验证用户存在 */
    const user = await models.User.findByPk(user_id, { transaction: options.transaction })
    if (!user) {
      throw new Error(`用户 ${user_id} 不存在`)
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
        description: description || null
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
      throw new Error(`工单 ${issueId} 不存在`)
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
      throw new Error(`工单 ${issueId} 不存在`)
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
   * 用户端查看自己的工单列表（只返回脱敏数据）
   *
   * @param {Object} models - Sequelize models 对象
   * @param {number} userId - 用户ID
   * @param {Object} params - 查询参数
   * @returns {Object} { rows, count, page, page_size }
   */
  static async getUserIssues(models, userId, params = {}) {
    const page = parseInt(params.page) || 1
    const pageSize = parseInt(params.page_size) || 10
    const offset = (page - 1) * pageSize

    const { count, rows } = await models.CustomerServiceIssue.findAndCountAll({
      where: { user_id: userId },
      attributes: [
        'issue_id',
        'issue_type',
        'priority',
        'status',
        'title',
        'resolved_at',
        'created_at'
      ],
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
}

module.exports = CustomerServiceIssueService
