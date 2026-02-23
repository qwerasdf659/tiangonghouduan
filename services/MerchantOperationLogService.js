'use strict'

/**
 * 餐厅积分抽奖系统 V4 - 商家操作审计日志服务（MerchantOperationLogService）
 *
 * 功能说明：
 * - 提供商家域审计日志的统一管理接口
 * - 支持创建、查询审计日志
 * - 支持按门店/员工/时间范围/操作类型等多维度筛选
 * - 支持统计分析（操作频率、失败率等）
 *
 * 业务场景：
 * - AC4.2: 消费提交/扫码拿用户信息时，记录审计日志
 * - AC4.3: 后端提供商家操作日志查询 API，支持筛选
 * - AC4.4: 审计日志保留 180 天（定期清理）
 *
 * 设计模式：
 * - 静态服务类 + ServiceManager 统一入口
 * - 所有写操作通过 TransactionManager 处理
 *
 * 创建时间：2026-01-12
 * 依据文档：docs/商家员工域权限体系升级方案.md
 */

const { Op } = require('sequelize')
const logger = require('../utils/logger').logger
const BeijingTimeHelper = require('../utils/timeHelper')

// 延迟加载模型，避免循环依赖
let modelsCache = null

/**
 * 获取模型（延迟加载）
 *
 * @returns {Object} 模型对象
 */
function getModels() {
  if (!modelsCache) {
    modelsCache = require('../models')
  }
  return modelsCache
}

/**
 * 商家操作审计日志服务
 *
 * @description 提供商家域审计日志的统一管理接口
 */
class MerchantOperationLogService {
  /**
   * 创建审计日志
   *
   * @description 记录商家员工的操作日志
   *
   * @param {Object} data - 审计日志数据
   * @param {number} data.operator_id - 操作员ID（商家员工 user_id）
   * @param {number} [data.store_id] - 门店ID（跨门店操作可为空）
   * @param {string} data.operation_type - 操作类型（scan_user/submit_consumption/等）
   * @param {string} [data.action='create'] - 操作动作（create/read/scan/update）
   * @param {number} [data.target_user_id] - 目标用户ID（被扫码/被录入消费的用户）
   * @param {number} [data.related_record_id] - 关联的消费记录ID
   * @param {number} [data.consumption_amount] - 消费金额
   * @param {string} [data.result='success'] - 操作结果（success/failed/blocked）
   * @param {string} [data.error_message] - 错误信息
   * @param {string} [data.ip_address] - IP地址
   * @param {string} [data.user_agent] - User-Agent
   * @param {string} [data.request_id] - 请求ID（用于全链路追踪）
   * @param {string} [data.idempotency_key] - 幂等键
   * @param {Object} [data.extra_data] - 扩展数据
   * @param {Object} [options={}] - Sequelize 选项（如 transaction）
   * @returns {Promise<Object>} 创建的审计日志实例
   */
  static async createLog(data, options = {}) {
    const { MerchantOperationLog } = getModels()

    try {
      const logRecord = await MerchantOperationLog.createLog(data, options)

      logger.debug('商家操作审计日志已创建', {
        merchant_log_id: logRecord.merchant_log_id,
        operator_id: data.operator_id,
        store_id: data.store_id,
        operation_type: data.operation_type,
        result: data.result || 'success'
      })

      return logRecord
    } catch (error) {
      logger.error('创建商家操作审计日志失败', {
        error: error.message,
        data,
        stack: error.stack
      })
      throw error
    }
  }

  /**
   * 从请求对象中创建审计日志
   *
   * @description 从 Express 请求对象中提取上下文信息并创建审计日志
   *
   * @param {Object} req - Express 请求对象
   * @param {Object} data - 审计日志数据
   * @param {Object} [options={}] - Sequelize 选项
   * @returns {Promise<Object>} 创建的审计日志实例
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
   * 查询审计日志列表
   *
   * @description 支持多维度筛选的审计日志查询
   *
   * @param {Object} filters - 筛选条件
   * @param {number} [filters.store_id] - 门店ID
   * @param {number} [filters.operator_id] - 操作员ID
   * @param {number} [filters.target_user_id] - 目标用户ID
   * @param {string} [filters.operation_type] - 操作类型
   * @param {string} [filters.action] - 操作动作
   * @param {string} [filters.result] - 操作结果
   * @param {string} [filters.start_time] - 开始时间（北京时间）
   * @param {string} [filters.end_time] - 结束时间（北京时间）
   * @param {string} [filters.request_id] - 请求ID
   * @param {string} [filters.idempotency_key] - 幂等键
   * @param {number} [filters.page=1] - 页码
   * @param {number} [filters.page_size=20] - 每页数量
   * @returns {Promise<Object>} 审计日志列表和分页信息
   */
  static async queryLogs(filters = {}) {
    const { MerchantOperationLog, User, Store } = getModels()

    const {
      store_id,
      operator_id,
      target_user_id,
      operation_type,
      action,
      result,
      start_time,
      end_time,
      request_id,
      idempotency_key,
      page = 1,
      page_size = 20
    } = filters

    // 构建查询条件
    const where = {}

    if (store_id) {
      where.store_id = store_id
    }

    if (operator_id) {
      where.operator_id = operator_id
    }

    if (target_user_id) {
      where.target_user_id = target_user_id
    }

    if (operation_type) {
      where.operation_type = operation_type
    }

    if (action) {
      where.action = action
    }

    if (result) {
      where.result = result
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
          },
          {
            model: User,
            as: 'targetUser',
            attributes: ['user_id', 'nickname', 'mobile']
          }
        ],
        order: [['created_at', 'DESC']],
        limit: pageSize,
        offset
      })

      const items = rows.map(log => ({
        ...log.toAPIResponse(),
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
        target_user_info: log.targetUser
          ? {
              user_id: log.targetUser.user_id,
              nickname: log.targetUser.nickname,
              mobile: log.targetUser.mobile
            }
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
      logger.error('查询商家操作审计日志失败', {
        error: error.message,
        filters,
        stack: error.stack
      })
      throw error
    }
  }

  /**
   * 获取审计日志详情
   *
   * @description 根据日志ID获取完整的审计日志信息
   *
   * @param {number} merchantLogId - 审计日志ID
   * @returns {Promise<Object|null>} 审计日志详情，不存在则返回 null
   */
  static async getLogDetail(merchantLogId) {
    const { MerchantOperationLog, User, Store, ConsumptionRecord } = getModels()

    try {
      const log = await MerchantOperationLog.findByPk(merchantLogId, {
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
          },
          {
            model: User,
            as: 'targetUser',
            attributes: ['user_id', 'nickname', 'mobile']
          },
          {
            model: ConsumptionRecord,
            as: 'consumptionRecord',
            attributes: ['consumption_record_id', 'consumption_amount', 'points_earned', 'status']
          }
        ]
      })

      if (!log) {
        return null
      }

      return {
        ...log.toAPIResponse(),
        user_agent: log.user_agent,
        idempotency_key: log.idempotency_key,
        extra_data: log.extra_data,
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
        target_user_info: log.targetUser
          ? {
              user_id: log.targetUser.user_id,
              nickname: log.targetUser.nickname,
              mobile: log.targetUser.mobile
            }
          : null,
        consumption_record_info: log.consumptionRecord
          ? {
              record_id: log.consumptionRecord.consumption_record_id,
              consumption_amount: parseFloat(log.consumptionRecord.consumption_amount),
              points_earned: log.consumptionRecord.points_earned,
              status: log.consumptionRecord.status
            }
          : null
      }
    } catch (error) {
      logger.error('获取商家操作审计日志详情失败', {
        error: error.message,
        merchant_log_id: merchantLogId,
        stack: error.stack
      })
      throw error
    }
  }

  /**
   * 获取门店的审计日志统计
   *
   * @description 统计门店的操作日志情况
   *
   * @param {number} storeId - 门店ID
   * @param {Object} [options={}] - 可选参数
   * @param {string} [options.start_time] - 统计开始时间
   * @param {string} [options.end_time] - 统计结束时间
   * @returns {Promise<Object>} 审计日志统计信息
   */
  static async getStoreStats(storeId, options = {}) {
    const { MerchantOperationLog } = getModels()
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
        attributes: ['operation_type', [MerchantOperationLog.sequelize.fn('COUNT', '*'), 'count']],
        where,
        group: ['operation_type'],
        raw: true
      })

      // 按操作结果统计
      const byResult = await MerchantOperationLog.findAll({
        attributes: ['result', [MerchantOperationLog.sequelize.fn('COUNT', '*'), 'count']],
        where,
        group: ['result'],
        raw: true
      })

      // 按操作员统计（TOP 10）
      const byOperator = await MerchantOperationLog.findAll({
        attributes: ['operator_id', [MerchantOperationLog.sequelize.fn('COUNT', '*'), 'count']],
        where,
        group: ['operator_id'],
        order: [[MerchantOperationLog.sequelize.literal('count'), 'DESC']],
        limit: 10,
        raw: true
      })

      // 格式化统计结果
      const operationTypeStats = {}
      byOperationType.forEach(item => {
        operationTypeStats[item.operation_type] = parseInt(item.count)
      })

      const resultStats = {}
      byResult.forEach(item => {
        resultStats[item.result] = parseInt(item.count)
      })

      return {
        store_id: storeId,
        total_count: totalCount,
        by_operation_type: operationTypeStats,
        by_result: resultStats,
        success_rate:
          totalCount > 0
            ? (((resultStats.success || 0) / totalCount) * 100).toFixed(2) + '%'
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
      logger.error('获取门店审计日志统计失败', {
        error: error.message,
        store_id: storeId,
        stack: error.stack
      })
      throw error
    }
  }

  /**
   * 获取操作员的审计日志统计
   *
   * @description 统计操作员的操作日志情况
   *
   * @param {number} operatorId - 操作员ID
   * @param {Object} [options={}] - 可选参数
   * @param {string} [options.start_time] - 统计开始时间
   * @param {string} [options.end_time] - 统计结束时间
   * @returns {Promise<Object>} 审计日志统计信息
   */
  static async getOperatorStats(operatorId, options = {}) {
    const { MerchantOperationLog } = getModels()
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
        attributes: ['operation_type', [MerchantOperationLog.sequelize.fn('COUNT', '*'), 'count']],
        where,
        group: ['operation_type'],
        raw: true
      })

      // 按操作结果统计
      const byResult = await MerchantOperationLog.findAll({
        attributes: ['result', [MerchantOperationLog.sequelize.fn('COUNT', '*'), 'count']],
        where,
        group: ['result'],
        raw: true
      })

      // 按门店统计
      const byStore = await MerchantOperationLog.findAll({
        attributes: ['store_id', [MerchantOperationLog.sequelize.fn('COUNT', '*'), 'count']],
        where: { ...where, store_id: { [Op.ne]: null } },
        group: ['store_id'],
        raw: true
      })

      // 格式化统计结果
      const operationTypeStats = {}
      byOperationType.forEach(item => {
        operationTypeStats[item.operation_type] = parseInt(item.count)
      })

      const resultStats = {}
      byResult.forEach(item => {
        resultStats[item.result] = parseInt(item.count)
      })

      return {
        operator_id: operatorId,
        total_count: totalCount,
        by_operation_type: operationTypeStats,
        by_result: resultStats,
        success_rate:
          totalCount > 0
            ? (((resultStats.success || 0) / totalCount) * 100).toFixed(2) + '%'
            : '0%',
        blocked_rate:
          totalCount > 0
            ? (((resultStats.blocked || 0) / totalCount) * 100).toFixed(2) + '%'
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
      logger.error('获取操作员审计日志统计失败', {
        error: error.message,
        operator_id: operatorId,
        stack: error.stack
      })
      throw error
    }
  }

  /**
   * 导出审计日志数据（用于 CSV 导出）
   *
   * @description 获取审计日志数据用于导出，支持大数据量（最多 50000 条）
   *
   * @param {Object} filters - 筛选条件
   * @param {number} [filters.store_id] - 门店ID
   * @param {Date} [filters.start_time] - 开始时间
   * @param {Date} [filters.end_time] - 结束时间
   * @param {string} [filters.operation_type] - 操作类型
   * @param {string} [filters.result] - 操作结果
   * @param {number} [filters.limit=10000] - 最大导出条数
   * @returns {Promise<Array>} 审计日志列表
   *
   * @since 2026-01-18 路由层合规性治理：支持 CSV 导出功能
   */
  static async exportLogs(filters = {}) {
    const { MerchantOperationLog, User, Store } = getModels()

    const { store_id, start_time, end_time, operation_type, result, limit = 10000 } = filters

    // 构建查询条件
    const where = {}
    if (store_id) where.store_id = store_id
    if (operation_type) where.operation_type = operation_type
    if (result) where.result = result

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

      logger.info('审计日志导出数据获取完成', {
        store_id,
        start_time: start_time ? BeijingTimeHelper.formatForAPI(start_time) : null,
        end_time: end_time ? BeijingTimeHelper.formatForAPI(end_time) : null,
        exported_count: logs.length
      })

      return logs
    } catch (error) {
      logger.error('获取导出审计日志数据失败', {
        error: error.message,
        filters,
        stack: error.stack
      })
      throw error
    }
  }

  /**
   * 清理过期的审计日志
   *
   * @description 删除超过保留期的审计日志（默认 180 天）
   *
   * @param {Object} [options={}] - 可选参数
   * @param {number} [options.retention_days=180] - 保留天数
   * @param {boolean} [options.dry_run=false] - 干跑模式（只统计不删除）
   * @returns {Promise<Object>} 清理结果
   */
  static async cleanupExpiredLogs(options = {}) {
    const { MerchantOperationLog } = getModels()
    const { retention_days = 180, dry_run = false } = options

    // 计算截止时间
    const cutoffDate = new Date()
    cutoffDate.setDate(cutoffDate.getDate() - retention_days)

    const where = {
      created_at: {
        [Op.lt]: cutoffDate
      }
    }

    try {
      // 统计待清理数量
      const countToDelete = await MerchantOperationLog.count({ where })

      if (dry_run) {
        logger.info('审计日志清理（干跑模式）', {
          retention_days,
          cutoff_date: BeijingTimeHelper.formatForAPI(cutoffDate),
          count_to_delete: countToDelete
        })

        return {
          dry_run: true,
          retention_days,
          cutoff_date: BeijingTimeHelper.formatForAPI(cutoffDate),
          count_to_delete: countToDelete,
          deleted_count: 0
        }
      }

      // 执行删除
      const deletedCount = await MerchantOperationLog.destroy({ where })

      logger.info('审计日志清理完成', {
        retention_days,
        cutoff_date: BeijingTimeHelper.formatForAPI(cutoffDate),
        deleted_count: deletedCount
      })

      return {
        dry_run: false,
        retention_days,
        cutoff_date: BeijingTimeHelper.formatForAPI(cutoffDate),
        count_to_delete: countToDelete,
        deleted_count: deletedCount
      }
    } catch (error) {
      logger.error('清理审计日志失败', {
        error: error.message,
        retention_days,
        dry_run,
        stack: error.stack
      })
      throw error
    }
  }

  /**
   * 获取所有支持的操作类型列表（供路由层使用，避免路由直接 require 模型文件常量）
   *
   * @returns {Array<{code: string, name: string, key: string}>} 操作类型列表
   */
  static getOperationTypes() {
    const {
      MERCHANT_OPERATION_TYPES,
      OPERATION_TYPE_DESCRIPTIONS
    } = require('../models/MerchantOperationLog')

    return Object.entries(MERCHANT_OPERATION_TYPES).map(([key, value]) => ({
      code: value,
      name: OPERATION_TYPE_DESCRIPTIONS[value] || value,
      key
    }))
  }
}

module.exports = MerchantOperationLogService
