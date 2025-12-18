const Logger = require('../services/UnifiedLotteryEngine/utils/Logger')
const logger = new Logger('AuditLogService')

/**
 * 餐厅积分抽奖系统 V4.0 - 统一审计日志服务（AuditLogService）
 *
 * 业务场景：为所有核心服务提供统一的审计日志记录功能，实现敏感操作的完整审计追溯
 *
 * 核心功能：
 * 1. 统一审计日志记录（支持所有业务类型）
 * 2. 积分操作审计（积分增加、消费、激活、退款）
 * 3. 库存操作审计（物品使用、转让、核销）
 * 4. 审核操作审计（消费审核、兑换审核）
 * 5. 商品配置审计（商品创建、修改、删除）
 * 6. 数据变更对比（自动生成前后数据对比）
 *
 * 设计原则：
 * - **服务层适配**：不依赖req对象，适用于服务层调用
 * - **事务支持**：支持在事务中记录审计日志
 * - **异步记录**：审计日志记录失败不影响业务操作
 * - **完整记录**：记录操作前后的完整数据、变更字段、操作原因
 * - **安全信息**：记录IP地址、用户代理等安全信息（如果有）
 *
 * 与auditLog中间件的关系：
 * - auditLog中间件：面向路由层，依赖req对象（适用于HTTP请求）
 * - AuditLogService：面向服务层，不依赖req对象（适用于内部调用）
 * - 两者底层都使用AdminOperationLog模型
 *
 * 使用示例：
 * ```javascript
 * // 示例1：记录积分增加操作
 * await AuditLogService.logPointsAdd({
 *   operator_id: userId,
 *   user_id: userId,
 *   before_points: 100,
 *   after_points: 200,
 *   points_amount: 100,
 *   reason: '消费奖励',
 *   business_id: 'consumption_12345',
 *   transaction
 * });
 *
 * // 示例2：记录物品转让操作
 * await AuditLogService.logInventoryTransfer({
 *   operator_id: fromUserId,
 *   item_id: itemId,
 *   from_user_id: fromUserId,
 *   to_user_id: toUserId,
 *   item_name: '优惠券',
 *   reason: '赠送朋友',
 *   transaction
 * });
 *
 * // 示例3：记录兑换审核操作
 * await AuditLogService.logExchangeAudit({
 *   operator_id: auditorId,
 *   exchange_id: exchangeId,
 *   action: 'approve',
 *   before_status: 'pending',
 *   after_status: 'approved',
 *   reason: '审核通过',
 *   transaction
 * });
 * ```
 *
 * 创建时间：2025年12月09日
 * 使用模型：Claude Sonnet 4.5
 */

const { AdminOperationLog } = require('../models')
const BeijingTimeHelper = require('../utils/timeHelper')

/**
 * 审计日志服务类
 * 职责：为服务层提供统一的审计日志记录接口
 * 设计模式：服务层模式 + 静态方法（无状态设计）
 */
class AuditLogService {
  /**
   * 记录通用操作审计日志（核心方法）
   *
   * @param {Object} params - 审计日志参数
   * @param {number} params.operator_id - 操作员ID（必填）
   * @param {string} params.operation_type - 操作类型（必填，如'points_adjust'）
   * @param {string} params.target_type - 目标对象类型（必填，如'User'）
   * @param {number} params.target_id - 目标对象ID（必填）
   * @param {string} params.action - 操作动作（必填，如'update'）
   * @param {Object} params.before_data - 操作前数据（可选）
   * @param {Object} params.after_data - 操作后数据（可选）
   * @param {string} params.reason - 操作原因（可选）
   * @param {string} params.business_id - 业务关联ID（可选）
   * @param {string} params.ip_address - IP地址（可选）
   * @param {string} params.user_agent - 用户代理（可选）
   * @param {Object} params.transaction - 事务对象（可选）
   * @returns {Promise<AdminOperationLog|null>} 审计日志记录
   */
  static async logOperation(params) {
    try {
      const {
        operator_id,
        operation_type,
        target_type,
        target_id,
        action,
        before_data = null,
        after_data = null,
        reason = null,
        business_id = null,
        ip_address = null,
        user_agent = null,
        transaction = null
      } = params

      // 1. 验证必填参数
      if (!operator_id || !operation_type || !target_type || !target_id || !action) {
        logger.warn('[审计日志] 缺少必填参数，跳过记录')
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
        'prize_stock_adjust', // 奖品库存调整
        'campaign_config',
        'role_assign',
        'role_change', // 角色变更
        'system_config',
        'session_assign',
        'inventory_operation', // 库存操作
        'inventory_transfer', // 物品转让
        'consumption_audit' // 消费审核
      ]

      if (!validOperationTypes.includes(operation_type)) {
        logger.warn(`[审计日志] 无效的操作类型: ${operation_type}`)
        return null
      }

      // 3. 计算变更字段
      const changedFields = AdminOperationLog.compareObjects(before_data, after_data)

      // 4. 创建审计日志
      const auditLog = await AdminOperationLog.create(
        {
          operator_id,
          operation_type,
          target_type,
          target_id,
          action,
          before_data,
          after_data,
          changed_fields: changedFields,
          reason,
          ip_address,
          user_agent,
          business_id,
          created_at: BeijingTimeHelper.createDatabaseTime()
        },
        { transaction }
      )

      logger.info(
        `[审计日志] 记录成功: log_id=${auditLog.log_id}, 操作员=${operator_id}, 类型=${operation_type}, 动作=${action}`
      )

      return auditLog
    } catch (error) {
      // 审计日志记录失败不影响业务操作，只记录错误
      logger.error(`[审计日志] 记录失败: ${error.message}`)
      logger.error(error.stack)
      return null
    }
  }

  /**
   * 记录积分增加操作
   *
   * @param {Object} params - 参数
   * @param {number} params.operator_id - 操作员ID
   * @param {number} params.user_id - 用户ID
   * @param {number} params.before_points - 操作前积分
   * @param {number} params.after_points - 操作后积分
   * @param {number} params.points_amount - 积分数量
   * @param {string} params.reason - 操作原因
   * @param {string} params.business_id - 业务ID
   * @param {Object} params.transaction - 事务对象
   * @returns {Promise<AdminOperationLog|null>} 审计日志记录（失败返回null，不阻塞业务流程）
   */
  static async logPointsAdd(params) {
    const {
      operator_id,
      user_id,
      before_points,
      after_points,
      points_amount,
      reason,
      business_id,
      transaction
    } = params

    return this.logOperation({
      operator_id,
      operation_type: 'points_adjust',
      target_type: 'UserPointsAccount',
      target_id: user_id,
      action: 'add',
      before_data: {
        available_points: before_points
      },
      after_data: {
        available_points: after_points
      },
      reason: reason || `增加积分${points_amount}分`,
      business_id,
      transaction
    })
  }

  /**
   * 记录积分消费操作
   *
   * @param {Object} params - 参数
   * @param {number} params.operator_id - 操作员ID
   * @param {number} params.user_id - 用户ID
   * @param {number} params.before_points - 操作前积分
   * @param {number} params.after_points - 操作后积分
   * @param {number} params.points_amount - 积分数量
   * @param {string} params.reason - 操作原因
   * @param {string} params.business_id - 业务ID
   * @param {Object} params.transaction - 事务对象
   * @returns {Promise<AdminOperationLog|null>} 审计日志记录（失败返回null，不阻塞业务流程）
   */
  static async logPointsConsume(params) {
    const {
      operator_id,
      user_id,
      before_points,
      after_points,
      points_amount,
      reason,
      business_id,
      transaction
    } = params

    return this.logOperation({
      operator_id,
      operation_type: 'points_adjust',
      target_type: 'UserPointsAccount',
      target_id: user_id,
      action: 'consume',
      before_data: {
        available_points: before_points
      },
      after_data: {
        available_points: after_points
      },
      reason: reason || `消费积分${points_amount}分`,
      business_id,
      transaction
    })
  }

  /**
   * 记录pending积分激活操作
   *
   * @param {Object} params - 参数
   * @param {number} params.operator_id - 操作员ID（审核员）
   * @param {number} params.user_id - 用户ID
   * @param {number} params.transaction_id - 积分交易ID
   * @param {number} params.points_amount - 激活的积分数量
   * @param {string} params.reason - 操作原因
   * @param {string} params.business_id - 业务ID
   * @param {Object} params.transaction - 事务对象
   * @returns {Promise<AdminOperationLog|null>} 审计日志记录（失败返回null，不阻塞业务流程）
   */
  static async logPointsActivate(params) {
    const {
      operator_id,
      user_id,
      transaction_id,
      points_amount,
      reason,
      business_id,
      transaction
    } = params

    return this.logOperation({
      operator_id,
      operation_type: 'points_adjust',
      target_type: 'PointsTransaction',
      target_id: transaction_id,
      action: 'activate',
      before_data: {
        status: 'pending',
        points_amount
      },
      after_data: {
        status: 'completed',
        points_amount
      },
      reason: reason || `激活pending积分${points_amount}分（用户${user_id}）`,
      business_id,
      transaction
    })
  }

  /**
   * 记录物品使用操作
   *
   * @param {Object} params - 参数
   * @param {number} params.operator_id - 操作员ID
   * @param {number} params.item_id - 物品ID
   * @param {string} params.item_name - 物品名称
   * @param {string} params.reason - 操作原因
   * @param {string} params.business_id - 业务ID
   * @param {Object} params.transaction - 事务对象
   * @returns {Promise<AdminOperationLog|null>} 审计日志记录（失败返回null，不阻塞业务流程）
   */
  static async logInventoryUse(params) {
    const { operator_id, item_id, item_name, reason, business_id, transaction } = params

    return this.logOperation({
      operator_id,
      operation_type: 'inventory_operation',
      target_type: 'UserInventory',
      target_id: item_id,
      action: 'use',
      before_data: {
        status: 'available'
      },
      after_data: {
        status: 'used'
      },
      reason: reason || `使用物品：${item_name}`,
      business_id,
      transaction
    })
  }

  /**
   * 记录物品转让操作
   *
   * ⚠️ 注意：此方法已更新为使用独立的 'inventory_transfer' 操作类型
   * 用于物品转让的审计日志记录，提供更清晰的审计追溯
   *
   * @param {Object} params - 参数
   * @param {number} params.operator_id - 操作员ID（转让方）
   * @param {number} params.item_id - 物品ID
   * @param {number} params.from_user_id - 转让方ID
   * @param {number} params.to_user_id - 接收方ID
   * @param {string} params.item_name - 物品名称
   * @param {string} params.reason - 操作原因
   * @param {string} params.business_id - 业务ID
   * @param {Object} params.transaction - 事务对象
   * @returns {Promise<AdminOperationLog|null>} 审计日志记录（失败返回null，不阻塞业务流程）
   */
  static async logInventoryTransfer(params) {
    const {
      operator_id,
      item_id,
      from_user_id,
      to_user_id,
      item_name,
      reason,
      business_id,
      transaction
    } = params

    return this.logOperation({
      operator_id,
      operation_type: 'inventory_transfer', // ✅ 使用独立的物品转让审计类型（P0-4整改）
      target_type: 'UserInventory',
      target_id: item_id,
      action: 'transfer',
      before_data: {
        user_id: from_user_id
      },
      after_data: {
        user_id: to_user_id
      },
      reason: reason || `物品转让：${item_name}（${from_user_id} → ${to_user_id}）`,
      business_id,
      transaction
    })
  }

  /**
   * 记录物品核销操作
   *
   * @param {Object} params - 参数
   * @param {number} params.operator_id - 操作员ID（商家）
   * @param {number} params.item_id - 物品ID
   * @param {number} params.user_id - 用户ID
   * @param {string} params.item_name - 物品名称
   * @param {string} params.verification_code - 核销码
   * @param {string} params.reason - 操作原因
   * @param {string} params.business_id - 业务ID
   * @param {Object} params.transaction - 事务对象
   * @returns {Promise<AdminOperationLog|null>} 审计日志记录（失败返回null，不阻塞业务流程）
   */
  static async logInventoryVerify(params) {
    const {
      operator_id,
      item_id,
      user_id,
      item_name,
      verification_code,
      reason,
      business_id,
      transaction
    } = params

    return this.logOperation({
      operator_id,
      operation_type: 'inventory_operation',
      target_type: 'UserInventory',
      target_id: item_id,
      action: 'verify',
      before_data: {
        status: 'available',
        verification_code
      },
      after_data: {
        status: 'used',
        verification_code: null
      },
      reason: reason || `核销物品：${item_name}（用户${user_id}）`,
      business_id,
      transaction
    })
  }

  /**
   * 记录兑换审核操作
   *
   * @param {Object} params - 参数
   * @param {number} params.operator_id - 操作员ID（审核员）
   * @param {number} params.exchange_id - 兑换记录ID
   * @param {string} params.action - 操作动作（approve/reject）
   * @param {string} params.before_status - 审核前状态
   * @param {string} params.after_status - 审核后状态
   * @param {string} params.reason - 操作原因
   * @param {string} params.business_id - 业务ID
   * @param {Object} params.transaction - 事务对象
   * @returns {Promise<AdminOperationLog|null>} 审计日志记录（失败返回null，不阻塞业务流程）
   */
  static async logExchangeAudit(params) {
    const {
      operator_id,
      exchange_id,
      action,
      before_status,
      after_status,
      reason,
      business_id,
      transaction
    } = params

    return this.logOperation({
      operator_id,
      operation_type: 'exchange_audit',
      target_type: 'ExchangeMarketRecord',
      target_id: exchange_id,
      action,
      before_data: {
        audit_status: before_status
      },
      after_data: {
        audit_status: after_status
      },
      reason,
      business_id,
      transaction
    })
  }

  /**
   * 记录消费审核操作
   *
   * @param {Object} params - 参数
   * @param {number} params.operator_id - 操作员ID（审核员）
   * @param {number} params.consumption_id - 消费记录ID
   * @param {string} params.action - 操作动作（approve/reject）
   * @param {string} params.before_status - 审核前状态
   * @param {string} params.after_status - 审核后状态
   * @param {number} params.points_amount - 涉及积分数量
   * @param {string} params.reason - 操作原因
   * @param {string} params.business_id - 业务ID
   * @param {Object} params.transaction - 事务对象
   * @returns {Promise<AdminOperationLog|null>} 审计日志记录（失败返回null，不阻塞业务流程）
   */
  static async logConsumptionAudit(params) {
    const {
      operator_id,
      consumption_id,
      action,
      before_status,
      after_status,
      points_amount,
      reason,
      business_id,
      transaction
    } = params

    return this.logOperation({
      operator_id,
      operation_type: 'consumption_audit',
      target_type: 'ConsumptionRecord',
      target_id: consumption_id,
      action,
      before_data: {
        status: before_status
      },
      after_data: {
        status: after_status,
        points_awarded: points_amount
      },
      reason,
      business_id,
      transaction
    })
  }

  /**
   * 记录商品配置操作
   *
   * @param {Object} params - 参数
   * @param {number} params.operator_id - 操作员ID
   * @param {number} params.product_id - 商品ID
   * @param {string} params.action - 操作动作（create/update/delete）
   * @param {Object} params.before_data - 操作前数据
   * @param {Object} params.after_data - 操作后数据
   * @param {string} params.reason - 操作原因
   * @param {Object} params.transaction - 事务对象
   * @returns {Promise<AdminOperationLog|null>} 审计日志记录（失败返回null，不阻塞业务流程）
   */
  static async logProductConfig(params) {
    const { operator_id, product_id, action, before_data, after_data, reason, transaction } = params

    const operationTypeMap = {
      create: 'product_create',
      update: 'product_update',
      delete: 'product_delete'
    }

    return this.logOperation({
      operator_id,
      operation_type: operationTypeMap[action] || 'product_update',
      target_type: 'Product',
      target_id: product_id,
      action,
      before_data,
      after_data,
      reason,
      transaction
    })
  }

  /**
   * 批量记录审计日志（用于批量操作）
   *
   * @param {Array<Object>} logItems - 日志项数组
   * @returns {Promise<Object>} 批量记录结果
   */
  static async batchLogOperation(logItems) {
    const results = {
      total: logItems.length,
      success: 0,
      failed: 0,
      errors: []
    }

    for (const item of logItems) {
      try {
        await this.logOperation(item)
        results.success++
      } catch (error) {
        results.failed++
        results.errors.push({
          item,
          error: error.message
        })
      }
    }

    logger.info(
      `[审计日志] 批量记录完成: 总数=${results.total}, 成功=${results.success}, 失败=${results.failed}`
    )

    return results
  }

  /**
   * 获取操作审计日志
   *
   * @param {Object} filters - 过滤条件
   * @param {number} filters.operator_id - 操作员ID
   * @param {string} filters.operation_type - 操作类型
   * @param {string} filters.target_type - 目标对象类型
   * @param {number} filters.target_id - 目标对象ID
   * @param {string} filters.start_date - 开始日期
   * @param {string} filters.end_date - 结束日期
   * @param {number} filters.limit - 每页数量（默认50）
   * @param {number} filters.offset - 偏移量（默认0）
   * @returns {Promise<Array>} 审计日志列表
   */
  static async queryAuditLogs(filters = {}) {
    const {
      operator_id = null,
      operation_type = null,
      target_type = null,
      target_id = null,
      start_date = null,
      end_date = null,
      limit = 50,
      offset = 0
    } = filters

    const whereClause = {}

    if (operator_id) {
      whereClause.operator_id = operator_id
    }

    if (operation_type) {
      whereClause.operation_type = operation_type
    }

    if (target_type) {
      whereClause.target_type = target_type
    }

    if (target_id) {
      whereClause.target_id = target_id
    }

    if (start_date || end_date) {
      whereClause.created_at = {}
      if (start_date) {
        whereClause.created_at[require('sequelize').Op.gte] = start_date
      }
      if (end_date) {
        whereClause.created_at[require('sequelize').Op.lte] = end_date
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
      logger.error('[审计日志查询] 失败:', error.message)
      throw error
    }
  }

  /**
   * 根据ID获取审计日志详情
   *
   * @param {number} logId - 日志ID
   * @returns {Promise<AdminOperationLog>} 审计日志详情
   * @throws {Error} 当日志不存在时抛出错误
   */
  static async getById(logId) {
    try {
      // 验证参数
      if (!logId || isNaN(logId) || logId <= 0) {
        throw new Error('无效的日志ID')
      }

      const log = await AdminOperationLog.findByPk(logId, {
        include: [
          {
            model: require('../models').User,
            as: 'operator',
            attributes: ['user_id', 'nickname', 'mobile']
          }
        ]
      })

      if (!log) {
        throw new Error('审计日志不存在')
      }

      return log
    } catch (error) {
      logger.error(`[审计日志详情] 查询失败: log_id=${logId}, 错误=${error.message}`)
      throw error
    }
  }

  /**
   * 获取审计日志统计信息
   *
   * @param {Object} filters - 过滤条件
   * @param {number} filters.operator_id - 操作员ID
   * @param {string} filters.start_date - 开始日期
   * @param {string} filters.end_date - 结束日期
   * @returns {Promise<Object>} 统计信息
   */
  static async getAuditStatistics(filters = {}) {
    const { operator_id = null, start_date = null, end_date = null } = filters

    try {
      const whereClause = {}

      if (operator_id) {
        whereClause.operator_id = operator_id
      }

      if (start_date || end_date) {
        whereClause.created_at = {}
        if (start_date) {
          whereClause.created_at[require('sequelize').Op.gte] = start_date
        }
        if (end_date) {
          whereClause.created_at[require('sequelize').Op.lte] = end_date
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
      logger.error('[审计日志统计] 失败:', error.message)
      throw error
    }
  }
}

module.exports = AuditLogService
