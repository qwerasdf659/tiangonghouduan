'use strict'

/**
 * 天工商户营销平台 V4 - 商家操作日志服务（MerchantOperationLogService）
 *
 * 功能说明：
 * - 提供商家域操作日志的统一管理接口（operation_logs 单表 merchant 域，拍板 10 三表合并）
 * - 支持创建、查询操作日志
 * - 支持按门店/员工/时间范围/操作类型等多维度筛选
 * - 支持统计分析（操作频率、失败率等）
 *
 * 业务场景：
 * - AC4.2: 消费提交/扫码拿用户信息时，记录操作日志
 * - AC4.3: 后端提供商家操作日志查询 API，支持筛选
 * - AC4.4: 操作日志保留 180 天（定期清理）
 *
 * 数据形态（operation_logs 单表 + operator_type='merchant'）：
 * - 目标用户：target_type='user' + target_id（原 target_user_id）
 * - 操作结果：status（success/failed/blocked，原 result 列）
 * - 域专有低频字段入 detail JSON：consumption_record_id / consumption_amount / error_message / extra_data
 *
 * 设计模式：
 * - 静态服务类 + ServiceManager 统一入口（服务键 merchant_operation_log 不变）
 * - 所有写操作通过 TransactionManager 处理
 */

const { Op } = require('sequelize')
const logger = require('../utils/logger').logger
const BeijingTimeHelper = require('../utils/timeHelper')

const models = require('../models')
const { OperationLog, User, Store, ConsumptionRecord } = models

/** 商家域日志视图（operation_logs 单表 + operator_type='merchant'；读查询自动带域过滤，写入走 createMerchantLog） */
const MerchantOperationLog = OperationLog.scope('merchant')

/**
 * 序列化商家域操作日志为 API 响应（字段与数据库一致，前端零映射直读）
 *
 * @param {Object} log - OperationLog 实例（merchant 域）
 * @returns {Object} API 响应格式的日志数据
 */
function toMerchantLogResponse(log) {
  const detail = log.detail || {}
  return {
    operation_log_id: log.operation_log_id,
    operator_id: log.operator_id,
    store_id: log.store_id,
    operation_type: log.operation_type,
    operation_type_name: log.getOperationTypeDescription(),
    action: log.action,
    action_name: log.getActionDescription(),
    target_type: log.target_type, // merchant 域目标固定 'user'（无目标操作为 null）
    target_id: log.target_id,
    consumption_record_id: detail.consumption_record_id ?? null,
    consumption_amount:
      detail.consumption_amount != null ? parseFloat(detail.consumption_amount) : null,
    status: log.status,
    status_name: log.getStatusDescription(),
    error_message: detail.error_message ?? null,
    ip_address: log.ip_address,
    request_id: log.request_id,
    created_at: log.getDataValue('created_at')
  }
}

/**
 * 批量装配目标用户信息（target_type='user' 的多态目标手动批量查询，避免 N+1）
 *
 * @param {Array<Object>} logs - OperationLog 实例数组
 * @returns {Promise<Map<number, Object>>} target_id → 用户信息映射
 */
async function loadTargetUsers(logs) {
  const userIds = [
    ...new Set(
      logs.filter(l => l.target_type === 'user' && l.target_id).map(l => Number(l.target_id))
    )
  ]
  if (userIds.length === 0) return new Map()
  const users = await User.findAll({
    where: { user_id: userIds },
    attributes: ['user_id', 'nickname', 'mobile']
  })
  return new Map(
    users.map(u => [u.user_id, { user_id: u.user_id, nickname: u.nickname, mobile: u.mobile }])
  )
}

/**
 * 商家操作日志服务
 *
 * @description 提供商家域操作日志的统一管理接口
 */
class MerchantOperationLogService {
  /**
   * 创建操作日志
   *
   * @description 记录商家员工的操作日志（operation_logs 单表 merchant 域）
   *
   * @param {Object} data - 日志数据
   * @param {number} data.operator_id - 操作员ID（商家员工 user_id）
   * @param {number} [data.store_id] - 门店ID（跨门店操作可为空）
   * @param {string} data.operation_type - 操作类型（scan_user/submit_consumption/等）
   * @param {string} [data.action='create'] - 操作动作（create/read/scan/update）
   * @param {number} [data.target_user_id] - 目标用户ID（被扫码/被录入消费的用户）
   * @param {number} [data.consumption_record_id] - 关联的消费记录ID
   * @param {number} [data.consumption_amount] - 消费金额
   * @param {string} [data.status='success'] - 操作结果（success/failed/blocked）
   * @param {string} [data.error_message] - 错误信息
   * @param {string} [data.ip_address] - IP地址
   * @param {string} [data.user_agent] - User-Agent
   * @param {string} [data.request_id] - 请求ID（用于全链路追踪）
   * @param {string} [data.idempotency_key] - 幂等键
   * @param {Object} [data.extra_data] - 扩展数据
   * @param {Object} [options={}] - Sequelize 选项（如 transaction）
   * @returns {Promise<Object>} 创建的日志实例
   */
  static async createLog(data, options = {}) {
    try {
      const logRecord = await OperationLog.createMerchantLog(data, options)

      logger.debug('商家操作日志已创建', {
        operation_log_id: logRecord.operation_log_id,
        operator_id: data.operator_id,
        store_id: data.store_id,
        operation_type: data.operation_type,
        status: data.status || 'success'
      })

      return logRecord
    } catch (error) {
      logger.error('创建商家操作日志失败', {
        error: error.message,
        data,
        stack: error.stack
      })
      throw error
    }
  }

  /**
   * 从请求对象中创建操作日志
   *
   * @description 从 Express 请求对象中提取上下文信息并创建操作日志
   *
   * @param {Object} req - Express 请求对象
   * @param {Object} data - 日志数据（字段同 createLog）
   * @param {Object} [options={}] - Sequelize 选项
   * @returns {Promise<Object>} 创建的日志实例
   */
  static async createLogFromRequest(req, data, options = {}) {
    const logData = {
      ...data,
      operator_id: data.operator_id || req.user?.user_id,
      ip_address: data.ip_address || req.ip || req.headers['x-forwarded-for']?.split(',')[0],
      user_agent: data.user_agent || req.headers['user-agent'],
      request_id: data.request_id || req.id || req.headers['x-request-id']
    }

    return await MerchantOperationLogService.createLog(logData, options)
  }

  /**
   * 查询操作日志列表
   *
   * @description 支持多维度筛选的商家域日志查询
   *
   * @param {Object} filters - 筛选条件
   * @param {number} [filters.store_id] - 门店ID
   * @param {number} [filters.operator_id] - 操作员ID
   * @param {number} [filters.target_user_id] - 目标用户ID
   * @param {string} [filters.operation_type] - 操作类型
   * @param {string} [filters.action] - 操作动作
   * @param {string} [filters.status] - 操作结果（success/failed/blocked）
   * @param {string} [filters.start_time] - 开始时间（北京时间）
   * @param {string} [filters.end_time] - 结束时间（北京时间）
   * @param {string} [filters.request_id] - 请求ID
   * @param {string} [filters.idempotency_key] - 幂等键
   * @param {number} [filters.page=1] - 页码
   * @param {number} [filters.page_size=20] - 每页数量
   * @returns {Promise<Object>} 日志列表和分页信息
   */
  static async queryLogs(filters = {}) {
    const {
      store_id,
      operator_id,
      target_user_id,
      operation_type,
      action,
      status,
      start_time,
      end_time,
      request_id,
      idempotency_key,
      page = 1,
      page_size = 20
    } = filters

    // 构建查询条件（operator_type='merchant' 由 scope 注入）
    const where = {}

    if (store_id) {
      where.store_id = store_id
    }

    if (operator_id) {
      where.operator_id = operator_id
    }

    if (target_user_id) {
      // 商家域目标用户为多态目标（target_type='user'）
      where.target_type = 'user'
      where.target_id = target_user_id
    }

    if (operation_type) {
      where.operation_type = operation_type
    }

    if (action) {
      where.action = action
    }

    if (status) {
      where.status = status
    }

    if (request_id) {
      where.request_id = request_id
    }

    if (idempotency_key) {
      where.idempotency_key = idempotency_key
    }

    // 时间范围筛选
    if (start_time || end_time) {
      where.created_at = {}
      if (start_time) {
        where.created_at[Op.gte] = BeijingTimeHelper.parseBeijingTime(start_time)
      }
      if (end_time) {
        where.created_at[Op.lte] = BeijingTimeHelper.parseBeijingTime(end_time)
      }
    }

    // 分页参数
    const pageNum = Math.max(1, parseInt(page))
    const pageSize = Math.min(100, Math.max(1, parseInt(page_size)))
    const offset = (pageNum - 1) * pageSize

    try {
      const { count, rows } = await MerchantOperationLog.findAndCountAll({
        where,
        include: [
          {
            model: User,
            as: 'operator',
            attributes: ['user_id', 'nickname', 'mobile']
          },
          {
            model: Store,
            as: 'store',
            attributes: ['store_id', 'store_name']
          }
        ],
        order: [['created_at', 'DESC']],
        limit: pageSize,
        offset
      })

      // 多态目标用户批量装配（target_type='user'，避免 N+1）
      const targetUserMap = await loadTargetUsers(rows)

      const items = rows.map(log => ({
        ...toMerchantLogResponse(log),
        operator_info: log.operator
          ? {
              user_id: log.operator.user_id,
              nickname: log.operator.nickname,
              mobile: log.operator.mobile
            }
          : null,
        store_info: log.store
          ? {
              store_id: log.store.store_id,
              store_name: log.store.store_name
            }
          : null,
        target_user_info:
          log.target_type === 'user' && log.target_id
            ? targetUserMap.get(Number(log.target_id)) || null
            : null
      }))

      return {
        items,
        pagination: {
          page: pageNum,
          page_size: pageSize,
          total: count,
          total_pages: Math.ceil(count / pageSize)
        }
      }
    } catch (error) {
      logger.error('查询商家操作日志失败', {
        error: error.message,
        filters,
        stack: error.stack
      })
      throw error
    }
  }

  /**
   * 获取操作日志详情
   *
   * @description 根据日志ID获取完整的操作日志信息
   *
   * @param {number} operationLogId - 日志ID
   * @returns {Promise<Object|null>} 日志详情，不存在则返回 null
   */
  static async getLogDetail(operationLogId) {
    try {
      const log = await MerchantOperationLog.findByPk(operationLogId, {
        include: [
          {
            model: User,
            as: 'operator',
            attributes: ['user_id', 'nickname', 'mobile']
          },
          {
            model: Store,
            as: 'store',
            attributes: ['store_id', 'store_name', 'address']
          }
        ]
      })

      if (!log) {
        return null
      }

      const detail = log.detail || {}

      // 多态目标用户 + detail 内关联消费记录，手动装配（详情页单行查询，无 N+1 问题）
      const [targetUserMap, consumptionRecord] = await Promise.all([
        loadTargetUsers([log]),
        detail.consumption_record_id
          ? ConsumptionRecord.findByPk(detail.consumption_record_id, {
              attributes: [
                'consumption_record_id',
                'consumption_amount',
                'points_to_award',
                'status'
              ]
            })
          : Promise.resolve(null)
      ])

      return {
        ...toMerchantLogResponse(log),
        user_agent: log.user_agent,
        idempotency_key: log.idempotency_key,
        extra_data: detail.extra_data ?? null,
        operator_info: log.operator
          ? {
              user_id: log.operator.user_id,
              nickname: log.operator.nickname,
              mobile: log.operator.mobile
            }
          : null,
        store_info: log.store
          ? {
              store_id: log.store.store_id,
              store_name: log.store.store_name,
              address: log.store.address
            }
          : null,
        target_user_info:
          log.target_type === 'user' && log.target_id
            ? targetUserMap.get(Number(log.target_id)) || null
            : null,
        consumption_record_info: consumptionRecord
          ? {
              consumption_record_id: consumptionRecord.consumption_record_id,
              consumption_amount: parseFloat(consumptionRecord.consumption_amount),
              points_to_award: consumptionRecord.points_to_award,
              status: consumptionRecord.status
            }
          : null
      }
    } catch (error) {
      logger.error('获取商家操作日志详情失败', {
        error: error.message,
        operation_log_id: operationLogId,
        stack: error.stack
      })
      throw error
    }
  }

  /**
   * 获取门店的操作日志统计
   *
   * @description 统计门店的操作日志情况
   *
   * @param {number} storeId - 门店ID
   * @param {Object} [options={}] - 可选参数
   * @param {string} [options.start_time] - 统计开始时间
   * @param {string} [options.end_time] - 统计结束时间
   * @returns {Promise<Object>} 操作日志统计信息
   */
  static async getStoreStats(storeId, options = {}) {
    const { start_time, end_time } = options

    // 构建时间条件
    const timeCondition = {}
    if (start_time) {
      timeCondition[Op.gte] = BeijingTimeHelper.parseBeijingTime(start_time)
    }
    if (end_time) {
      timeCondition[Op.lte] = BeijingTimeHelper.parseBeijingTime(end_time)
    }

    const where = { store_id: storeId }
    if (Object.keys(timeCondition).length > 0) {
      where.created_at = timeCondition
    }

    try {
      // 总数统计
      const totalCount = await MerchantOperationLog.count({ where })

      // 按操作类型统计
      const byOperationType = await MerchantOperationLog.findAll({
        attributes: ['operation_type', [OperationLog.sequelize.fn('COUNT', '*'), 'count']],
        where,
        group: ['operation_type'],
        raw: true
      })

      // 按操作结果统计
      const byStatus = await MerchantOperationLog.findAll({
        attributes: ['status', [OperationLog.sequelize.fn('COUNT', '*'), 'count']],
        where,
        group: ['status'],
        raw: true
      })

      // 按操作员统计（TOP 10）
      const byOperator = await MerchantOperationLog.findAll({
        attributes: ['operator_id', [OperationLog.sequelize.fn('COUNT', '*'), 'count']],
        where,
        group: ['operator_id'],
        order: [[OperationLog.sequelize.literal('count'), 'DESC']],
        limit: 10,
        raw: true
      })

      // 格式化统计结果
      const operationTypeStats = {}
      byOperationType.forEach(item => {
        operationTypeStats[item.operation_type] = parseInt(item.count)
      })

      const statusStats = {}
      byStatus.forEach(item => {
        statusStats[item.status] = parseInt(item.count)
      })

      return {
        store_id: storeId,
        total: totalCount,
        by_operation_type: operationTypeStats,
        by_status: statusStats,
        success_rate:
          totalCount > 0
            ? (((statusStats.success || 0) / totalCount) * 100).toFixed(2) + '%'
            : '0%',
        top_operators: byOperator.map(item => ({
          operator_id: item.operator_id,
          operation_count: parseInt(item.count)
        })),
        time_range: {
          start_time: start_time || null,
          end_time: end_time || null
        }
      }
    } catch (error) {
      logger.error('获取门店操作日志统计失败', {
        error: error.message,
        store_id: storeId,
        stack: error.stack
      })
      throw error
    }
  }

  /**
   * 获取操作员的操作日志统计
   *
   * @description 统计操作员的操作日志情况
   *
   * @param {number} operatorId - 操作员ID
   * @param {Object} [options={}] - 可选参数
   * @param {string} [options.start_time] - 统计开始时间
   * @param {string} [options.end_time] - 统计结束时间
   * @returns {Promise<Object>} 操作日志统计信息
   */
  static async getOperatorStats(operatorId, options = {}) {
    const { start_time, end_time } = options

    // 构建时间条件
    const timeCondition = {}
    if (start_time) {
      timeCondition[Op.gte] = BeijingTimeHelper.parseBeijingTime(start_time)
    }
    if (end_time) {
      timeCondition[Op.lte] = BeijingTimeHelper.parseBeijingTime(end_time)
    }

    const where = { operator_id: operatorId }
    if (Object.keys(timeCondition).length > 0) {
      where.created_at = timeCondition
    }

    try {
      // 总数统计
      const totalCount = await MerchantOperationLog.count({ where })

      // 按操作类型统计
      const byOperationType = await MerchantOperationLog.findAll({
        attributes: ['operation_type', [OperationLog.sequelize.fn('COUNT', '*'), 'count']],
        where,
        group: ['operation_type'],
        raw: true
      })

      // 按操作结果统计
      const byStatus = await MerchantOperationLog.findAll({
        attributes: ['status', [OperationLog.sequelize.fn('COUNT', '*'), 'count']],
        where,
        group: ['status'],
        raw: true
      })

      // 按门店统计
      const byStore = await MerchantOperationLog.findAll({
        attributes: ['store_id', [OperationLog.sequelize.fn('COUNT', '*'), 'count']],
        where: { ...where, store_id: { [Op.ne]: null } },
        group: ['store_id'],
        raw: true
      })

      // 格式化统计结果
      const operationTypeStats = {}
      byOperationType.forEach(item => {
        operationTypeStats[item.operation_type] = parseInt(item.count)
      })

      const statusStats = {}
      byStatus.forEach(item => {
        statusStats[item.status] = parseInt(item.count)
      })

      return {
        operator_id: operatorId,
        total: totalCount,
        by_operation_type: operationTypeStats,
        by_status: statusStats,
        success_rate:
          totalCount > 0
            ? (((statusStats.success || 0) / totalCount) * 100).toFixed(2) + '%'
            : '0%',
        blocked_rate:
          totalCount > 0
            ? (((statusStats.blocked || 0) / totalCount) * 100).toFixed(2) + '%'
            : '0%',
        by_store: byStore.map(item => ({
          store_id: item.store_id,
          operation_count: parseInt(item.count)
        })),
        time_range: {
          start_time: start_time || null,
          end_time: end_time || null
        }
      }
    } catch (error) {
      logger.error('获取操作员日志统计失败', {
        error: error.message,
        operator_id: operatorId,
        stack: error.stack
      })
      throw error
    }
  }

  /**
   * 导出操作日志数据（用于 CSV 导出）
   *
   * @description 获取日志数据用于导出，支持大数据量（最多 50000 条）
   *
   * @param {Object} filters - 筛选条件
   * @param {number} [filters.store_id] - 门店ID
   * @param {Date} [filters.start_time] - 开始时间
   * @param {Date} [filters.end_time] - 结束时间
   * @param {string} [filters.operation_type] - 操作类型
   * @param {string} [filters.status] - 操作结果（success/failed/blocked）
   * @param {number} [filters.limit=10000] - 最大导出条数
   * @returns {Promise<Array>} 日志列表（OperationLog 实例数组）
   *
   * @since 2026
   */
  static async exportLogs(filters = {}) {
    const { store_id, start_time, end_time, operation_type, status, limit = 10000 } = filters

    // 构建查询条件（operator_type='merchant' 由 scope 注入）
    const where = {}
    if (store_id) where.store_id = store_id
    if (operation_type) where.operation_type = operation_type
    if (status) where.status = status

    // 时间范围筛选
    if (start_time || end_time) {
      where.created_at = {}
      if (start_time) {
        where.created_at[Op.gte] = start_time
      }
      if (end_time) {
        where.created_at[Op.lte] = end_time
      }
    }

    // 限制导出条数
    const exportLimit = Math.min(Math.max(parseInt(limit) || 10000, 100), 50000)

    try {
      const logs = await MerchantOperationLog.findAll({
        where,
        include: [
          {
            model: User,
            as: 'operator',
            attributes: ['user_id', 'nickname']
          },
          {
            model: Store,
            as: 'store',
            attributes: ['store_id', 'store_name']
          }
        ],
        order: [['created_at', 'DESC']],
        limit: exportLimit,
        raw: false
      })

      logger.info('操作日志导出数据获取完成', {
        store_id,
        start_time: start_time || null,
        end_time: end_time || null,
        exported_count: logs.length
      })

      return logs
    } catch (error) {
      logger.error('获取导出操作日志数据失败', {
        error: error.message,
        filters,
        stack: error.stack
      })
      throw error
    }
  }

  /**
   * 清理过期的操作日志
   *
   * @description 删除超过保留期的商家域日志（默认 180 天；仅清理 merchant 域，admin 审计日志永久保留）
   *
   * @param {Object} [options={}] - 可选参数
   * @param {number} [options.retention_days=180] - 保留天数
   * @param {boolean} [options.dry_run=false] - 干跑模式（只统计不删除）
   * @returns {Promise<Object>} 清理结果
   */
  static async cleanupExpiredLogs(options = {}) {
    const { retention_days = 180, dry_run = false } = options

    // 计算截止时间
    const cutoffDate = new Date()
    cutoffDate.setDate(cutoffDate.getDate() - retention_days)

    // scope 仅作用于查询构建，destroy 显式带域过滤（防误删 admin/batch 域日志）
    const where = {
      operator_type: 'merchant',
      created_at: {
        [Op.lt]: cutoffDate
      }
    }

    try {
      // 统计待清理数量
      const countToDelete = await OperationLog.count({ where })

      if (dry_run) {
        logger.info('商家操作日志清理（干跑模式）', {
          retention_days,
          cutoff_date: cutoffDate,
          count_to_delete: countToDelete
        })

        return {
          dry_run: true,
          retention_days,
          cutoff_date: cutoffDate,
          count_to_delete: countToDelete,
          deleted_count: 0
        }
      }

      // 执行删除（硬删除，日志类数据无软删除语义）
      const deletedCount = await OperationLog.destroy({ where })

      logger.info('商家操作日志清理完成', {
        retention_days,
        cutoff_date: cutoffDate,
        deleted_count: deletedCount
      })

      return {
        dry_run: false,
        retention_days,
        cutoff_date: cutoffDate,
        count_to_delete: countToDelete,
        deleted_count: deletedCount
      }
    } catch (error) {
      logger.error('清理商家操作日志失败', {
        error: error.message,
        retention_days,
        dry_run,
        stack: error.stack
      })
      throw error
    }
  }

  /**
   * 获取所有支持的操作类型列表（供路由层使用，常量统一挂载在 OperationLog 模型静态属性上）
   *
   * @returns {Array<{code: string, name: string, key: string}>} 操作类型列表
   */
  static getOperationTypes() {
    return Object.entries(OperationLog.MERCHANT_OPERATION_TYPES).map(([key, value]) => ({
      code: value,
      name: OperationLog.MERCHANT_OPERATION_TYPE_DESCRIPTIONS[value] || value,
      key
    }))
  }
}

module.exports = MerchantOperationLogService
