/**
 * 客服座席管理服务（CustomerServiceAgentManagementService）
 *
 * 业务场景：管理客服座席的注册/配置/状态，以及用户-客服的分配关系
 *
 * 核心能力：
 * 1. 座席管理：注册座席、更新配置、启用/停用、查看工作负载
 * 2. 用户分配：将用户分配给客服、批量分配、转移分配、解除分配
 * 3. 工作负载：统计各客服的当前会话数、历史处理量、满意度
 *
 * 服务类型：静态类（无状态，所有方法通过类名直接调用）
 * 服务键：cs_agent_management
 *
 * 依赖模型：CustomerServiceAgent, CustomerServiceUserAssignment, User, CustomerServiceSession
 */

const logger = require('../utils/logger').logger
const { Op } = require('sequelize')

/**
 * 客服座席管理服务类
 *
 * @class CustomerServiceAgentManagementService
 */
class CustomerServiceAgentManagementService {
  /* ===================== 用户查询 ===================== */

  /**
   * 根据手机号查找用户（用于座席注册和用户分配前的预检）
   *
   * @param {string} mobile - 手机号
   * @returns {Promise<Object>} 用户信息，包含是否已注册为座席的标记
   */
  static async lookupUserByMobile(mobile) {
    const models = require('../models')
    const { User, CustomerServiceAgent } = models

    const user = await User.findOne({
      where: { mobile },
      attributes: ['user_id', 'nickname', 'mobile', 'avatar_url']
    })

    if (!user) {
      const error = new Error('未找到该手机号对应的用户')
      error.statusCode = 404
      error.code = 'USER_NOT_FOUND'
      throw error
    }

    const existingAgent = await CustomerServiceAgent.findOne({
      where: { user_id: user.user_id }
    })

    return {
      ...user.toJSON(),
      is_already_agent: !!existingAgent
    }
  }

  /**
   * 根据手机号解析用户ID（内部辅助方法）
   *
   * @param {string} mobile - 手机号
   * @param {Object} [options] - 选项
   * @param {Object} [options.transaction] - 事务对象
   * @returns {Promise<number>} 用户ID
   */
  static async resolveUserIdByMobile(mobile, options = {}) {
    const models = require('../models')
    const { User } = models

    const user = await User.findOne({
      where: { mobile },
      attributes: ['user_id'],
      transaction: options.transaction
    })

    if (!user) {
      const error = new Error(`手机号 ${mobile} 对应的用户不存在`)
      error.statusCode = 404
      error.code = 'USER_NOT_FOUND'
      throw error
    }

    return user.user_id
  }

  /* ===================== 座席管理 ===================== */

  /**
   * 获取客服座席列表
   *
   * @param {Object} options - 查询选项
   * @param {number} [options.page=1] - 页码
   * @param {number} [options.page_size=20] - 每页数量
   * @param {string} [options.status] - 筛选座席状态（active/inactive/on_break）
   * @param {string} [options.search] - 搜索关键词（昵称/手机号）
   * @returns {Promise<{agents: Array, pagination: Object}>} 座席列表和分页信息
   */
  static async getAgentList(options = {}) {
    const { page = 1, page_size = 20, status, search } = options

    const models = require('../models')
    const { CustomerServiceAgent, User, CustomerServiceUserAssignment } = models

    const where = {}
    if (status) where.status = status

    const include = [
      {
        model: User,
        as: 'user',
        attributes: ['user_id', 'nickname', 'mobile', 'avatar_url'],
        where: search
          ? {
              [Op.or]: [
                { nickname: { [Op.like]: `%${search}%` } },
                { mobile: { [Op.like]: `%${search}%` } }
              ]
            }
          : undefined,
        required: !!search
      }
    ]

    const offset = (Math.max(1, parseInt(page)) - 1) * parseInt(page_size)
    const limit = parseInt(page_size)

    const { count, rows } = await CustomerServiceAgent.findAndCountAll({
      where,
      include,
      offset,
      limit,
      order: [
        ['priority', 'DESC'],
        ['created_at', 'ASC']
      ],
      distinct: true
    })

    const agentIds = rows.map(a => a.customer_service_agent_id)
    const assignmentCounts =
      agentIds.length > 0
        ? await CustomerServiceUserAssignment.count({
            where: { agent_id: { [Op.in]: agentIds }, status: 'active' },
            group: ['agent_id']
          })
        : []

    const countMap = new Map(assignmentCounts.map(c => [c.agent_id, c.count]))

    const agents = rows.map(agent => ({
      ...agent.toJSON(),
      active_assignment_count: countMap.get(agent.customer_service_agent_id) || 0
    }))

    return {
      agents,
      pagination: {
        total: count,
        current_page: parseInt(page),
        page_size: limit,
        total_pages: Math.ceil(count / limit)
      }
    }
  }

  /**
   * 获取单个客服座席详情
   *
   * @param {number} agentId - 客服座席ID
   * @returns {Promise<Object>} 操作结果
   */
  static async getAgentDetail(agentId) {
    const models = require('../models')
    const { CustomerServiceAgent, User, CustomerServiceUserAssignment } = models

    const agent = await CustomerServiceAgent.findByPk(agentId, {
      include: [
        {
          model: User,
          as: 'user',
          attributes: ['user_id', 'nickname', 'mobile', 'avatar_url']
        }
      ]
    })

    if (!agent) {
      const error = new Error('客服座席不存在')
      error.statusCode = 404
      error.code = 'AGENT_NOT_FOUND'
      throw error
    }

    const activeAssignments = await CustomerServiceUserAssignment.findAll({
      where: { agent_id: agentId, status: 'active' },
      include: [{ model: User, as: 'user', attributes: ['user_id', 'nickname', 'mobile'] }],
      order: [['created_at', 'DESC']],
      limit: 50
    })

    return {
      ...agent.toJSON(),
      active_assignments: activeAssignments.map(a => a.toJSON())
    }
  }

  /**
   * 注册客服座席（将某个用户注册为客服）
   *
   * @param {Object} data - 座席数据
   * @param {number} data.user_id - 要注册为客服的用户ID
   * @param {string} data.display_name - 客服显示名称
   * @param {number} [data.max_concurrent_sessions=10] - 最大并发会话数
   * @param {string[]} [data.specialty] - 擅长领域标签
   * @param {number} [data.priority=0] - 分配优先级
   * @param {boolean} [data.is_auto_assign_enabled=true] - 是否参与自动分配
   * @param {Object} options - 操作选项
   * @param {Object} options.transaction - Sequelize 事务对象（必需）
   * @returns {Promise<Object>} 操作结果
   */
  static async createAgent(data, options = {}) {
    const { transaction } = options
    if (!transaction) throw new Error('createAgent 必须在事务内执行')

    const models = require('../models')
    const { CustomerServiceAgent, User } = models

    const user = await User.findByPk(data.user_id, { transaction })
    if (!user) {
      const error = new Error('用户不存在')
      error.statusCode = 404
      error.code = 'USER_NOT_FOUND'
      throw error
    }

    const existing = await CustomerServiceAgent.findOne({
      where: { user_id: data.user_id },
      transaction
    })
    if (existing) {
      const error = new Error('该用户已注册为客服座席')
      error.statusCode = 409
      error.code = 'AGENT_ALREADY_EXISTS'
      throw error
    }

    const agent = await CustomerServiceAgent.create(
      {
        user_id: data.user_id,
        display_name: data.display_name,
        max_concurrent_sessions: data.max_concurrent_sessions || 10,
        specialty: data.specialty || [],
        priority: data.priority || 0,
        is_auto_assign_enabled: data.is_auto_assign_enabled !== false
      },
      { transaction }
    )

    logger.info('客服座席注册成功', {
      agent_id: agent.customer_service_agent_id,
      user_id: data.user_id,
      display_name: data.display_name
    })

    return agent.toJSON()
  }

  /**
   * 更新客服座席配置
   *
   * @param {number} agentId - 客服座席ID
   * @param {Object} data - 要更新的字段
   * @param {Object} options - 操作选项
   * @param {Object} options.transaction - Sequelize 事务对象（必需）
   * @returns {Promise<Object>} 操作结果
   */
  static async updateAgent(agentId, data, options = {}) {
    const { transaction } = options
    if (!transaction) throw new Error('updateAgent 必须在事务内执行')

    const models = require('../models')
    const { CustomerServiceAgent } = models

    const agent = await CustomerServiceAgent.findByPk(agentId, { transaction })
    if (!agent) {
      const error = new Error('客服座席不存在')
      error.statusCode = 404
      error.code = 'AGENT_NOT_FOUND'
      throw error
    }

    const allowedFields = [
      'display_name',
      'max_concurrent_sessions',
      'specialty',
      'priority',
      'is_auto_assign_enabled',
      'status'
    ]

    const updateData = {}
    for (const field of allowedFields) {
      if (data[field] !== undefined) {
        updateData[field] = data[field]
      }
    }

    await agent.update(updateData, { transaction })

    logger.info('客服座席配置更新', {
      agent_id: agentId,
      updated_fields: Object.keys(updateData)
    })

    return agent.toJSON()
  }

  /**
   * 删除客服座席（硬删除）
   *
   * @param {number} agentId - 客服座席ID
   * @param {Object} options - 操作选项
   * @param {Object} options.transaction - Sequelize 事务对象（必需）
   * @returns {Promise<{success: boolean}>} 删除结果
   */
  static async deleteAgent(agentId, options = {}) {
    const { transaction } = options
    if (!transaction) throw new Error('deleteAgent 必须在事务内执行')

    const models = require('../models')
    const { CustomerServiceAgent, CustomerServiceUserAssignment } = models

    const agent = await CustomerServiceAgent.findByPk(agentId, { transaction })
    if (!agent) {
      const error = new Error('客服座席不存在')
      error.statusCode = 404
      error.code = 'AGENT_NOT_FOUND'
      throw error
    }

    const activeAssignments = await CustomerServiceUserAssignment.count({
      where: { agent_id: agentId, status: 'active' },
      transaction
    })
    if (activeAssignments > 0) {
      const error = new Error(`该客服座席仍有 ${activeAssignments} 个用户分配，请先转移或解除分配`)
      error.statusCode = 409
      error.code = 'AGENT_HAS_ACTIVE_ASSIGNMENTS'
      throw error
    }

    /* 硬删除所有非 active 的历史分配记录（孤儿数据清理） */
    await CustomerServiceUserAssignment.destroy({
      where: { agent_id: agentId },
      transaction
    })

    await agent.destroy({ transaction })

    logger.info('客服座席已删除', {
      agent_id: agentId,
      user_id: agent.user_id
    })

    return { success: true }
  }

  /* ===================== 用户分配管理 ===================== */

  /**
   * 获取用户分配列表
   *
   * @param {Object} options - 查询选项
   * @param {number} [options.page=1] - 页码
   * @param {number} [options.page_size=20] - 每页数量
   * @param {number} [options.agent_id] - 按客服座席筛选
   * @param {string} [options.status] - 按分配状态筛选
   * @param {string} [options.search] - 搜索（用户昵称/手机号）
   * @returns {Promise<{assignments: Array, pagination: Object}>} 分配列表和分页信息
   */
  static async getAssignmentList(options = {}) {
    const { page = 1, page_size = 20, agent_id, status, search } = options

    const models = require('../models')
    const { CustomerServiceUserAssignment, User, CustomerServiceAgent } = models

    const where = {}
    if (agent_id) where.agent_id = parseInt(agent_id)
    if (status) where.status = status

    const include = [
      {
        model: User,
        as: 'user',
        attributes: ['user_id', 'nickname', 'mobile', 'avatar_url'],
        where: search
          ? {
              [Op.or]: [
                { nickname: { [Op.like]: `%${search}%` } },
                { mobile: { [Op.like]: `%${search}%` } }
              ]
            }
          : undefined,
        required: !!search
      },
      {
        model: CustomerServiceAgent,
        as: 'agent',
        include: [{ model: User, as: 'user', attributes: ['user_id', 'nickname'] }]
      },
      {
        model: User,
        as: 'assigner',
        attributes: ['user_id', 'nickname']
      }
    ]

    const offset = (Math.max(1, parseInt(page)) - 1) * parseInt(page_size)
    const limit = parseInt(page_size)

    const { count, rows } = await CustomerServiceUserAssignment.findAndCountAll({
      where,
      include,
      offset,
      limit,
      order: [['created_at', 'DESC']],
      distinct: true
    })

    return {
      assignments: rows.map(a => a.toJSON()),
      pagination: {
        total: count,
        current_page: parseInt(page),
        page_size: limit,
        total_pages: Math.ceil(count / limit)
      }
    }
  }

  /**
   * 分配用户给客服座席
   *
   * @param {Object} data - 分配数据
   * @param {number} data.user_id - 被分配的用户ID
   * @param {number} data.agent_id - 目标客服座席ID
   * @param {number} data.assigned_by - 执行分配的管理员ID
   * @param {string} [data.notes] - 分配备注
   * @param {string} [data.expired_at] - 过期时间
   * @param {Object} options - 操作选项
   * @param {Object} options.transaction - Sequelize 事务对象（必需）
   * @returns {Promise<Object>} 操作结果
   */
  static async createAssignment(data, options = {}) {
    const { transaction } = options
    if (!transaction) throw new Error('createAssignment 必须在事务内执行')

    const models = require('../models')
    const { CustomerServiceUserAssignment, CustomerServiceAgent, User } = models

    const user = await User.findByPk(data.user_id, { transaction })
    if (!user) {
      const error = new Error('用户不存在')
      error.statusCode = 404
      error.code = 'USER_NOT_FOUND'
      throw error
    }

    const agent = await CustomerServiceAgent.findByPk(data.agent_id, { transaction })
    if (!agent) {
      const error = new Error('客服座席不存在')
      error.statusCode = 404
      error.code = 'AGENT_NOT_FOUND'
      throw error
    }

    /* 将该用户之前的 active 分配标记为 transferred */
    await CustomerServiceUserAssignment.update(
      { status: 'transferred' },
      { where: { user_id: data.user_id, status: 'active' }, transaction }
    )

    const assignment = await CustomerServiceUserAssignment.create(
      {
        user_id: data.user_id,
        agent_id: data.agent_id,
        assigned_by: data.assigned_by,
        notes: data.notes || null,
        expired_at: data.expired_at || null
      },
      { transaction }
    )

    logger.info('用户分配成功', {
      assignment_id: assignment.customer_service_user_assignment_id,
      user_id: data.user_id,
      agent_id: data.agent_id,
      assigned_by: data.assigned_by
    })

    return assignment.toJSON()
  }

  /**
   * 批量分配用户给客服座席
   *
   * @param {Object} data - 批量分配数据
   * @param {number[]} data.user_ids - 用户ID列表
   * @param {number} data.agent_id - 目标客服座席ID
   * @param {number} data.assigned_by - 执行分配的管理员ID
   * @param {string} [data.notes] - 分配备注
   * @param {Object} options - 操作选项
   * @param {Object} options.transaction - Sequelize 事务对象（必需）
   * @returns {Promise<{success_count: number, fail_count: number, results: Array}>} 批量分配结果
   */
  static async batchCreateAssignment(data, options = {}) {
    const { transaction } = options
    if (!transaction) throw new Error('batchCreateAssignment 必须在事务内执行')

    const results = []
    let successCount = 0
    let failCount = 0

    for (const userId of data.user_ids) {
      try {
        const assignment = await this.createAssignment(
          {
            user_id: userId,
            agent_id: data.agent_id,
            assigned_by: data.assigned_by,
            notes: data.notes
          },
          { transaction }
        )

        results.push({
          user_id: userId,
          success: true,
          assignment_id: assignment.customer_service_user_assignment_id
        })
        successCount++
      } catch (error) {
        results.push({ user_id: userId, success: false, error: error.message })
        failCount++
      }
    }

    logger.info('批量分配完成', {
      agent_id: data.agent_id,
      success_count: successCount,
      fail_count: failCount
    })

    return { success_count: successCount, fail_count: failCount, results }
  }

  /**
   * 解除用户分配
   *
   * @param {number} assignmentId - 分配记录ID
   * @param {Object} options - 操作选项
   * @param {Object} options.transaction - Sequelize 事务对象（必需）
   * @returns {Promise<{success: boolean}>} 删除结果
   */
  static async removeAssignment(assignmentId, options = {}) {
    const { transaction } = options
    if (!transaction) throw new Error('removeAssignment 必须在事务内执行')

    const models = require('../models')
    const { CustomerServiceUserAssignment } = models

    const assignment = await CustomerServiceUserAssignment.findByPk(assignmentId, { transaction })
    if (!assignment) {
      const error = new Error('分配记录不存在')
      error.statusCode = 404
      error.code = 'ASSIGNMENT_NOT_FOUND'
      throw error
    }

    await assignment.update({ status: 'expired' }, { transaction })

    logger.info('用户分配已解除', {
      assignment_id: assignmentId,
      user_id: assignment.user_id,
      agent_id: assignment.agent_id
    })

    return { success: true }
  }

  /* ===================== 统计查询 ===================== */

  /**
   * 获取客服工作负载概览
   *
   * @returns {Promise<Object>} 工作负载统计
   */
  static async getWorkloadOverview() {
    const models = require('../models')
    const { CustomerServiceAgent, User, CustomerServiceSession } = models

    const agents = await CustomerServiceAgent.findAll({
      include: [{ model: User, as: 'user', attributes: ['user_id', 'nickname', 'mobile'] }],
      order: [
        ['priority', 'DESC'],
        ['current_session_count', 'ASC']
      ]
    })

    /* 实时查询各客服的活跃会话数 */
    const activeSessionCounts = await CustomerServiceSession.count({
      where: { status: { [Op.in]: ['waiting', 'assigned', 'active'] } },
      group: ['admin_id']
    })
    const sessionCountMap = new Map(activeSessionCounts.map(c => [c.admin_id, c.count]))

    const agentWorkloads = agents.map(agent => {
      const realCount = sessionCountMap.get(agent.user_id) || 0
      return {
        ...agent.toJSON(),
        real_active_sessions: realCount,
        load_percentage:
          agent.max_concurrent_sessions > 0
            ? Math.round((realCount / agent.max_concurrent_sessions) * 100)
            : 0
      }
    })

    const totalAgents = agents.length
    const activeAgents = agents.filter(a => a.status === 'active').length
    const totalCapacity = agents.reduce((sum, a) => sum + a.max_concurrent_sessions, 0)
    const totalLoad = agentWorkloads.reduce((sum, a) => sum + a.real_active_sessions, 0)

    return {
      summary: {
        total_agents: totalAgents,
        active_agents: activeAgents,
        inactive_agents: totalAgents - activeAgents,
        total_capacity: totalCapacity,
        total_load: totalLoad,
        overall_load_percentage:
          totalCapacity > 0 ? Math.round((totalLoad / totalCapacity) * 100) : 0
      },
      agents: agentWorkloads
    }
  }
}

module.exports = CustomerServiceAgentManagementService
