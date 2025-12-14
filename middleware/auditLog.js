/**
 * 餐厅积分抽奖系统 V4.0 - 操作审计日志中间件
 *
 * 功能说明：
 * - 记录所有敏感操作的审计日志
 * - 追溯管理员操作历史
 * - 支持操作前后数据对比
 * - 记录IP地址、用户代理等安全信息
 *
 * 使用场景：
 * - 积分调整操作
 * - 兑换审核操作
 * - 商品配置修改
 * - 用户状态变更
 * - 奖品配置修改
 * - 角色分配操作
 *
 * 设计原则：
 * - 异步记录：审计日志记录失败不影响业务操作
 * - 完整记录：记录操作前后的完整数据
 * - 安全信息：记录IP地址、用户代理等安全信息
 *
 * 创建时间：2025-10-12
 */

const { AdminOperationLog } = require('../models')
const BeijingTimeHelper = require('../utils/timeHelper')

/**
 * 记录操作审计日志（主函数）
 *
 * @param {Object} req - Express请求对象
 * @param {string} operationType - 操作类型
 * @param {string} targetType - 目标对象类型
 * @param {number|string} targetId - 目标对象ID
 * @param {string} action - 操作动作
 * @param {Object} beforeData - 操作前数据
 * @param {Object} afterData - 操作后数据
 * @param {string} reason - 操作原因
 * @param {Object} options - 其他选项
 * @returns {Promise<AdminOperationLog>} 审计日志记录
 */
exports.logOperation = async (
  req,
  operationType,
  targetType,
  targetId,
  action,
  beforeData = null,
  afterData = null,
  reason = null,
  options = {}
) => {
  try {
    // 1. 验证操作员
    if (!req.user || !req.user.user_id) {
      console.warn('[审计日志] 无法记录：未找到操作员信息')
      return null
    }

    // 2. 验证操作类型
    const validOperationTypes = [
      'points_adjust',
      'exchange_audit',
      'product_update',
      'product_create',
      'product_delete',
      'user_status_change',
      'prize_config',
      'prize_create',
      'prize_delete',
      'campaign_config',
      'role_assign',
      'system_config',
      'session_assign', // 客服会话分配（P1优化）
      'inventory_operation', // 库存操作审计（使用/转让/核销）
      'consumption_audit' // 消费审核审计（审核通过/拒绝）
    ]

    if (!validOperationTypes.includes(operationType)) {
      console.warn(`[审计日志] 无效的操作类型: ${operationType}`)
      return null
    }

    // 3. 计算变更字段
    const changedFields = AdminOperationLog.compareObjects(beforeData, afterData)

    // 4. 获取安全信息
    const ipAddress = getClientIP(req)
    const userAgent = req.get('User-Agent') || null

    // 5. 创建审计日志
    const auditLog = await AdminOperationLog.create({
      operator_id: req.user.user_id,
      operation_type: operationType,
      target_type: targetType,
      target_id: targetId,
      action,
      before_data: beforeData,
      after_data: afterData,
      changed_fields: changedFields,
      reason,
      ip_address: ipAddress,
      user_agent: userAgent,
      business_id: options.businessId || null,
      created_at: BeijingTimeHelper.createDatabaseTime()
    })

    console.log(
      `[审计日志] 记录成功: log_id=${auditLog.log_id}, 操作员=${req.user.user_id}, 类型=${operationType}, 动作=${action}`
    )

    return auditLog
  } catch (error) {
    // 审计日志记录失败不影响业务操作，只记录错误
    console.error(`[审计日志] 记录失败: ${error.message}`)
    console.error(error.stack)
    return null
  }
}

/**
 * 记录积分调整操作
 *
 * @param {Object} req - Express请求对象
 * @param {number} userId - 用户ID
 * @param {Object} beforeAccount - 调整前账户数据
 * @param {Object} afterAccount - 调整后账户数据
 * @param {string} reason - 调整原因
 * @returns {Promise<AdminOperationLog>}
 */
exports.logPointsAdjust = async (req, userId, beforeAccount, afterAccount, reason) => {
  return exports.logOperation(
    req,
    'points_adjust',
    'UserPointsAccount',
    userId,
    'update',
    beforeAccount,
    afterAccount,
    reason
  )
}

/**
 * 记录兑换审核操作
 *
 * @param {Object} req - Express请求对象
 * @param {number} exchangeId - 兑换记录ID
 * @param {string} action - 操作动作（approve/reject）
 * @param {Object} beforeExchange - 审核前数据
 * @param {Object} afterExchange - 审核后数据
 * @param {string} reason - 审核意见
 * @returns {Promise<AdminOperationLog>}
 */
exports.logExchangeAudit = async (
  req,
  exchangeId,
  action,
  beforeExchange,
  afterExchange,
  reason
) => {
  return exports.logOperation(
    req,
    'exchange_audit',
    'ExchangeMarketRecord',
    exchangeId,
    action,
    beforeExchange,
    afterExchange,
    reason,
    { businessId: `exchange_${exchangeId}` }
  )
}

/**
 * 记录商品配置操作
 *
 * @param {Object} req - Express请求对象
 * @param {number} productId - 商品ID
 * @param {string} action - 操作动作（create/update/delete）
 * @param {Object} beforeProduct - 操作前数据
 * @param {Object} afterProduct - 操作后数据
 * @param {string} reason - 操作原因
 * @returns {Promise<AdminOperationLog>}
 */
exports.logProductConfig = async (req, productId, action, beforeProduct, afterProduct, reason) => {
  const operationTypeMap = {
    create: 'product_create',
    update: 'product_update',
    delete: 'product_delete'
  }

  return exports.logOperation(
    req,
    operationTypeMap[action] || 'product_update',
    'Product',
    productId,
    action,
    beforeProduct,
    afterProduct,
    reason
  )
}

/**
 * 记录用户状态变更操作
 *
 * @param {Object} req - Express请求对象
 * @param {number} userId - 用户ID
 * @param {string} action - 操作动作（freeze/unfreeze）
 * @param {Object} beforeUser - 操作前数据
 * @param {Object} afterUser - 操作后数据
 * @param {string} reason - 操作原因
 * @returns {Promise<AdminOperationLog>}
 */
exports.logUserStatusChange = async (req, userId, action, beforeUser, afterUser, reason) => {
  return exports.logOperation(
    req,
    'user_status_change',
    'User',
    userId,
    action,
    beforeUser,
    afterUser,
    reason
  )
}

/**
 * 记录奖品配置操作
 *
 * @param {Object} req - Express请求对象
 * @param {number} prizeId - 奖品ID
 * @param {string} action - 操作动作（create/update/delete）
 * @param {Object} beforePrize - 操作前数据
 * @param {Object} afterPrize - 操作后数据
 * @param {string} reason - 操作原因
 * @returns {Promise<AdminOperationLog>}
 */
exports.logPrizeConfig = async (req, prizeId, action, beforePrize, afterPrize, reason) => {
  const operationTypeMap = {
    create: 'prize_create',
    update: 'prize_config',
    delete: 'prize_delete'
  }

  return exports.logOperation(
    req,
    operationTypeMap[action] || 'prize_config',
    'LotteryPrize',
    prizeId,
    action,
    beforePrize,
    afterPrize,
    reason
  )
}

/**
 * 记录活动配置操作
 *
 * @param {Object} req - Express请求对象
 * @param {number} campaignId - 活动ID
 * @param {string} action - 操作动作（update）
 * @param {Object} beforeCampaign - 操作前数据
 * @param {Object} afterCampaign - 操作后数据
 * @param {string} reason - 操作原因
 * @returns {Promise<AdminOperationLog>}
 */
exports.logCampaignConfig = async (
  req,
  campaignId,
  action,
  beforeCampaign,
  afterCampaign,
  reason
) => {
  return exports.logOperation(
    req,
    'campaign_config',
    'LotteryCampaign',
    campaignId,
    action,
    beforeCampaign,
    afterCampaign,
    reason
  )
}

/**
 * 记录角色分配操作
 *
 * @param {Object} req - Express请求对象
 * @param {number} userId - 用户ID
 * @param {string} action - 操作动作（assign/remove）
 * @param {Object} beforeRoles - 操作前角色
 * @param {Object} afterRoles - 操作后角色
 * @param {string} reason - 操作原因
 * @returns {Promise<AdminOperationLog>}
 */
exports.logRoleAssign = async (req, userId, action, beforeRoles, afterRoles, reason) => {
  return exports.logOperation(
    req,
    'role_assign',
    'User',
    userId,
    action,
    beforeRoles,
    afterRoles,
    reason
  )
}

/**
 * 获取客户端真实IP地址
 *
 * @param {Object} req - Express请求对象
 * @returns {string} IP地址
 */
function getClientIP (req) {
  // 优先从代理头获取真实IP
  const forwarded = req.headers['x-forwarded-for']
  if (forwarded) {
    // x-forwarded-for可能包含多个IP，取第一个
    return forwarded.split(',')[0].trim()
  }

  const realIP = req.headers['x-real-ip']
  if (realIP) {
    return realIP
  }

  // 最后使用连接的远程地址
  return req.connection.remoteAddress || req.socket.remoteAddress || req.ip || 'unknown'
}

/**
 * 审计日志查询工具
 */
exports.queryAdminOperationLogs = async (options = {}) => {
  const {
    operatorId = null,
    operationType = null,
    targetType = null,
    targetId = null,
    startDate = null,
    endDate = null,
    limit = 50,
    offset = 0
  } = options

  const whereClause = {}

  if (operatorId) {
    whereClause.operator_id = operatorId
  }

  if (operationType) {
    whereClause.operation_type = operationType
  }

  if (targetType) {
    whereClause.target_type = targetType
  }

  if (targetId) {
    whereClause.target_id = targetId
  }

  if (startDate || endDate) {
    whereClause.created_at = {}
    if (startDate) {
      whereClause.created_at[require('sequelize').Op.gte] = startDate
    }
    if (endDate) {
      whereClause.created_at[require('sequelize').Op.lte] = endDate
    }
  }

  try {
    const logs = await AdminOperationLog.findAll({
      where: whereClause,
      order: [['created_at', 'DESC']],
      limit,
      offset,
      include: [
        {
          model: require('../models').User,
          as: 'operator',
          attributes: ['user_id', 'nickname', 'mobile']
        }
      ]
    })

    return logs
  } catch (error) {
    console.error('[审计日志查询] 失败:', error.message)
    throw error
  }
}

/**
 * 获取审计日志统计信息
 */
exports.getAuditStatistics = async (options = {}) => {
  const { operatorId = null, startDate = null, endDate = null } = options

  try {
    const whereClause = {}

    if (operatorId) {
      whereClause.operator_id = operatorId
    }

    if (startDate || endDate) {
      whereClause.created_at = {}
      if (startDate) {
        whereClause.created_at[require('sequelize').Op.gte] = startDate
      }
      if (endDate) {
        whereClause.created_at[require('sequelize').Op.lte] = endDate
      }
    }

    const [total, byType, byAction] = await Promise.all([
      // 总数
      AdminOperationLog.count({ where: whereClause }),

      // 按操作类型统计
      AdminOperationLog.findAll({
        where: whereClause,
        attributes: [
          'operation_type',
          [require('sequelize').fn('COUNT', require('sequelize').col('log_id')), 'count']
        ],
        group: ['operation_type']
      }),

      // 按操作动作统计
      AdminOperationLog.findAll({
        where: whereClause,
        attributes: [
          'action',
          [require('sequelize').fn('COUNT', require('sequelize').col('log_id')), 'count']
        ],
        group: ['action']
      })
    ])

    return {
      total,
      by_operation_type: byType.map(item => ({
        operation_type: item.operation_type,
        count: parseInt(item.get('count'))
      })),
      by_action: byAction.map(item => ({
        action: item.action,
        count: parseInt(item.get('count'))
      }))
    }
  } catch (error) {
    console.error('[审计日志统计] 失败:', error.message)
    throw error
  }
}
