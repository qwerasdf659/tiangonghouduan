/**
 * @file 批量操作服务 - 幂等性控制与操作审计核心服务
 * @description 提供批量操作的幂等性保障、状态管理、限流检查功能
 *
 * 业务职责：
 * - 幂等性检查（Redis + MySQL 双重校验）
 * - 批量操作日志管理
 * - 限流和并发控制
 * - 操作状态追踪和更新
 *
 * 技术决策来源：
 * - 需求文档阶段C技术决策：采用美团幂等性方案
 * - 独立幂等表 + Redis/MySQL 双重校验
 * - 支持"部分成功"模式：单条操作独立事务
 *
 * @version 1.0.0
 * @date 2026-01-30
 */

'use strict'

const crypto = require('crypto')
const { BatchOperationLog } = require('../models')
const SystemConfigService = require('./SystemConfigService')
const logger = require('../utils/logger').logger
const { getUnifiedRedisClient } = require('../utils/UnifiedRedisClient')
// BeijingTimeHelper 未在当前版本中使用，保留导入用于未来时间处理需求

/**
 * Redis 缓存配置
 */
const REDIS_CONFIG = {
  // 幂等键前缀
  IDEMPOTENCY_PREFIX: 'batch_idempotency:',
  // 处理中状态前缀
  PROCESSING_PREFIX: 'batch_processing:',
  // 幂等键默认TTL（秒）- 24小时
  IDEMPOTENCY_TTL: 86400,
  // 处理中状态TTL（秒）- 10分钟
  PROCESSING_TTL: 600
}

/**
 * 批量操作服务类
 * 提供批量操作的幂等性保障和状态管理
 */
class BatchOperationService {
  // ==================== Redis 操作 ====================

  /**
   * 获取 Redis 客户端
   * @returns {Object|null} Redis客户端实例
   */
  static getRedisClient() {
    try {
      return getUnifiedRedisClient()
    } catch (error) {
      logger.warn('Redis 客户端初始化失败', { error: error.message })
      return null
    }
  }

  /**
   * 检查 Redis 中幂等键是否存在
   * @param {string} idempotency_key - 幂等键
   * @returns {Promise<boolean>} 是否存在
   */
  static async checkIdempotencyInRedis(idempotency_key) {
    const redis = BatchOperationService.getRedisClient()
    if (!redis) return false

    try {
      const key = `${REDIS_CONFIG.IDEMPOTENCY_PREFIX}${idempotency_key}`
      const exists = await redis.exists(key)
      return exists === 1
    } catch (error) {
      logger.warn('Redis幂等检查失败', { idempotency_key, error: error.message })
      return false
    }
  }

  /**
   * 在 Redis 中设置幂等键
   * @param {string} idempotency_key - 幂等键
   * @param {Object} data - 关联数据
   * @param {number} [ttl] - TTL（秒）
   * @returns {Promise<boolean>} 是否设置成功
   */
  static async setIdempotencyInRedis(idempotency_key, data, ttl = REDIS_CONFIG.IDEMPOTENCY_TTL) {
    const redis = BatchOperationService.getRedisClient()
    if (!redis) return false

    try {
      const key = `${REDIS_CONFIG.IDEMPOTENCY_PREFIX}${idempotency_key}`
      await redis.set(key, JSON.stringify(data), 'EX', ttl, 'NX')
      return true
    } catch (error) {
      logger.warn('Redis幂等键设置失败', { idempotency_key, error: error.message })
      return false
    }
  }

  /**
   * 从 Redis 获取幂等键数据
   * @param {string} idempotency_key - 幂等键
   * @returns {Promise<Object|null>} 关联数据
   */
  static async getIdempotencyFromRedis(idempotency_key) {
    const redis = BatchOperationService.getRedisClient()
    if (!redis) return null

    try {
      const key = `${REDIS_CONFIG.IDEMPOTENCY_PREFIX}${idempotency_key}`
      const data = await redis.get(key)
      return data ? JSON.parse(data) : null
    } catch (error) {
      logger.warn('Redis幂等键获取失败', { idempotency_key, error: error.message })
      return null
    }
  }

  // ==================== 幂等性检查 ====================

  /**
   * 生成幂等键
   * 格式：{operation_type}:{operator_id}:{content_hash}
   *
   * @param {string} operation_type - 操作类型
   * @param {number} operator_id - 操作人ID
   * @param {Object} operation_params - 操作参数（用于生成内容哈希）
   * @returns {string} 幂等键
   */
  static generateIdempotencyKey(operation_type, operator_id, operation_params) {
    // 对操作参数进行确定性序列化
    const sortedParams = JSON.stringify(operation_params, Object.keys(operation_params).sort())
    // 生成内容哈希（取前16位）
    const content_hash = crypto
      .createHash('sha256')
      .update(sortedParams)
      .digest('hex')
      .substring(0, 16)
    // 添加时间戳（精确到分钟，允许1分钟内的重复请求被拦截）
    const timestamp = Math.floor(Date.now() / 60000)

    return `${operation_type}:${operator_id}:${timestamp}:${content_hash}`
  }

  /**
   * 双重幂等检查（Redis + MySQL）
   * 先查 Redis，命中则返回；未命中则查 MySQL
   *
   * @param {string} idempotency_key - 幂等键
   * @returns {Promise<Object>} 检查结果 { exists: boolean, existing_log?: BatchOperationLog }
   */
  static async checkIdempotency(idempotency_key) {
    // 1. 先查 Redis（快速路径）
    const redisExists = await BatchOperationService.checkIdempotencyInRedis(idempotency_key)
    if (redisExists) {
      const redisData = await BatchOperationService.getIdempotencyFromRedis(idempotency_key)
      logger.info('幂等检查命中Redis', { idempotency_key, batch_log_id: redisData?.batch_log_id })
      return {
        exists: true,
        existing_log: redisData
      }
    }

    // 2. 查 MySQL（慢速路径）
    const existingLog = await BatchOperationLog.checkIdempotencyKey(idempotency_key)
    if (existingLog) {
      // 将 MySQL 结果写入 Redis 缓存
      await BatchOperationService.setIdempotencyInRedis(idempotency_key, {
        batch_log_id: existingLog.batch_log_id,
        status: existingLog.status,
        operation_type: existingLog.operation_type
      })

      logger.info('幂等检查命中MySQL', { idempotency_key, batch_log_id: existingLog.batch_log_id })
      return {
        exists: true,
        existing_log: existingLog
      }
    }

    logger.debug('幂等检查通过', { idempotency_key })
    return { exists: false }
  }

  // ==================== 限流检查 ====================

  /**
   * 检查操作限流
   * 检查操作人是否在冷却时间内
   *
   * @param {number} operator_id - 操作人ID
   * @param {string} operation_type - 操作类型
   * @returns {Promise<Object>} 检查结果 { allowed: boolean, remaining_seconds?: number, message?: string }
   */
  static async checkRateLimit(operator_id, operation_type) {
    try {
      // 获取限流配置
      const config = await SystemConfigService.getBatchRateLimitConfig(operation_type)
      const { cooldown_seconds } = config

      // 查询最近的操作
      const recentOps = await BatchOperationLog.getRecentOperations(
        operator_id,
        operation_type,
        cooldown_seconds
      )

      if (recentOps.length > 0) {
        const lastOp = recentOps[0]
        const lastOpTime = new Date(lastOp.created_at).getTime()
        const now = Date.now()
        const elapsedSeconds = Math.floor((now - lastOpTime) / 1000)
        const remainingSeconds = cooldown_seconds - elapsedSeconds

        if (remainingSeconds > 0) {
          logger.info('操作限流生效', {
            operator_id,
            operation_type,
            remaining_seconds: remainingSeconds
          })
          return {
            allowed: false,
            remaining_seconds: remainingSeconds,
            message: `操作过于频繁，请在 ${remainingSeconds} 秒后重试`
          }
        }
      }

      return { allowed: true }
    } catch (error) {
      logger.error('限流检查失败', { operator_id, operation_type, error: error.message })
      // 限流检查失败时允许通过（降级策略）
      return { allowed: true }
    }
  }

  /**
   * 检查并发限制
   * 检查操作人是否有过多处理中的操作
   *
   * @param {number} operator_id - 操作人ID
   * @returns {Promise<Object>} 检查结果 { allowed: boolean, processing_count?: number, message?: string }
   */
  static async checkConcurrencyLimit(operator_id) {
    try {
      // 获取全局配置
      const globalConfig = await SystemConfigService.getBatchGlobalConfig()
      const { max_concurrent_batches } = globalConfig

      // 查询处理中的操作
      const processingOps = await BatchOperationLog.getProcessingOperations(operator_id)

      if (processingOps.length >= max_concurrent_batches) {
        logger.info('并发限制生效', {
          operator_id,
          processing_count: processingOps.length,
          max_concurrent: max_concurrent_batches
        })
        return {
          allowed: false,
          processing_count: processingOps.length,
          message: `已有 ${processingOps.length} 个操作正在处理中，请等待完成后再提交`
        }
      }

      return { allowed: true, processing_count: processingOps.length }
    } catch (error) {
      logger.error('并发检查失败', { operator_id, error: error.message })
      // 并发检查失败时允许通过（降级策略）
      return { allowed: true, processing_count: 0 }
    }
  }

  /**
   * 检查批量大小限制
   * 检查请求的批量大小是否超过配置限制
   *
   * @param {string} operation_type - 操作类型
   * @param {number} items_count - 请求的项目数量
   * @returns {Promise<Object>} 检查结果 { allowed: boolean, max_items?: number, message?: string }
   */
  static async checkBatchSizeLimit(operation_type, items_count) {
    try {
      // 获取限流配置
      const config = await SystemConfigService.getBatchRateLimitConfig(operation_type)
      const { max_items_per_request } = config

      if (items_count > max_items_per_request) {
        logger.info('批量大小超限', {
          operation_type,
          items_count,
          max_items: max_items_per_request
        })
        return {
          allowed: false,
          max_items: max_items_per_request,
          message: `单次批量操作最多 ${max_items_per_request} 项，当前请求 ${items_count} 项`
        }
      }

      return { allowed: true, max_items: max_items_per_request }
    } catch (error) {
      logger.error('批量大小检查失败', { operation_type, items_count, error: error.message })
      // 检查失败时使用默认限制
      return { allowed: items_count <= 50, max_items: 50 }
    }
  }

  // ==================== 批量操作日志管理 ====================

  /**
   * 创建批量操作日志
   *
   * @param {Object} params - 创建参数
   * @param {string} params.operation_type - 操作类型
   * @param {number} params.operator_id - 操作人ID
   * @param {number} params.total_count - 总操作数量
   * @param {Object} params.operation_params - 操作参数
   * @param {string} [params.idempotency_key] - 幂等键（可选，不传则自动生成）
   * @param {Object} [options] - Sequelize 选项
   * @returns {Promise<BatchOperationLog>} 创建的日志记录
   */
  static async createOperationLog(params, options = {}) {
    const { operation_type, operator_id, total_count, operation_params, idempotency_key } = params

    // 生成幂等键（如果未提供）
    const key =
      idempotency_key ||
      BatchOperationService.generateIdempotencyKey(operation_type, operator_id, operation_params)

    try {
      // 创建日志记录
      const log = await BatchOperationLog.createOperation(
        {
          operation_type,
          operator_id,
          total_count,
          operation_params,
          idempotency_key: key
        },
        options
      )

      // 在 Redis 中设置幂等键
      await BatchOperationService.setIdempotencyInRedis(key, {
        batch_log_id: log.batch_log_id,
        status: log.status,
        operation_type: log.operation_type
      })

      logger.info('创建批量操作日志', {
        batch_log_id: log.batch_log_id,
        operation_type,
        operator_id,
        total_count,
        idempotency_key: key
      })

      return log
    } catch (error) {
      // 如果是唯一约束冲突，说明幂等键已存在
      if (error.name === 'SequelizeUniqueConstraintError') {
        logger.warn('幂等键冲突，操作已存在', { idempotency_key: key })
        const existingLog = await BatchOperationLog.checkIdempotencyKey(key)
        return existingLog
      }

      logger.error('创建批量操作日志失败', { operation_type, operator_id, error: error.message })
      throw error
    }
  }

  /**
   * 更新操作进度
   *
   * @param {number} batch_log_id - 批量日志ID
   * @param {Object} progress - 进度数据
   * @param {number} progress.success_count - 成功数量
   * @param {number} progress.fail_count - 失败数量
   * @param {Object} [progress.result_summary] - 结果摘要
   * @param {Object} [options] - Sequelize 选项
   * @returns {Promise<BatchOperationLog>} 更新后的日志记录
   */
  static async updateProgress(batch_log_id, progress, options = {}) {
    const { success_count, fail_count, result_summary } = progress

    try {
      const log = await BatchOperationLog.findByPk(batch_log_id, options)
      if (!log) {
        throw new Error(`批量操作日志不存在: batch_log_id=${batch_log_id}`)
      }

      await log.updateProgress(success_count, fail_count, result_summary, options)

      // 更新 Redis 中的状态
      if (log.idempotency_key) {
        await BatchOperationService.setIdempotencyInRedis(log.idempotency_key, {
          batch_log_id: log.batch_log_id,
          status: log.status,
          operation_type: log.operation_type
        })
      }

      logger.info('更新批量操作进度', {
        batch_log_id,
        success_count,
        fail_count,
        status: log.status
      })

      return log
    } catch (error) {
      logger.error('更新批量操作进度失败', { batch_log_id, error: error.message })
      throw error
    }
  }

  /**
   * 标记操作失败
   *
   * @param {number} batch_log_id - 批量日志ID
   * @param {string} error_message - 错误信息
   * @param {Object} [options] - Sequelize 选项
   * @returns {Promise<BatchOperationLog>} 更新后的日志记录
   */
  static async markAsFailed(batch_log_id, error_message, options = {}) {
    try {
      const log = await BatchOperationLog.findByPk(batch_log_id, options)
      if (!log) {
        throw new Error(`批量操作日志不存在: batch_log_id=${batch_log_id}`)
      }

      await log.markAsFailed(error_message, options)

      // 更新 Redis 中的状态
      if (log.idempotency_key) {
        await BatchOperationService.setIdempotencyInRedis(log.idempotency_key, {
          batch_log_id: log.batch_log_id,
          status: 'failed',
          operation_type: log.operation_type,
          error: error_message
        })
      }

      logger.info('标记批量操作失败', { batch_log_id, error_message })

      return log
    } catch (error) {
      logger.error('标记批量操作失败出错', { batch_log_id, error: error.message })
      throw error
    }
  }

  /**
   * 获取批量操作日志详情
   *
   * @param {number} batch_log_id - 批量日志ID
   * @returns {Promise<Object|null>} 日志详情
   */
  static async getOperationDetail(batch_log_id) {
    try {
      const log = await BatchOperationLog.findByPk(batch_log_id, {
        include: [
          {
            model: require('../models').User,
            as: 'operator',
            attributes: ['user_id', 'nickname', 'mobile']
          }
        ]
      })

      if (!log) {
        return null
      }

      return {
        batch_log_id: log.batch_log_id,
        idempotency_key: log.idempotency_key,
        operation_type: log.operation_type,
        operation_type_name: log.getOperationTypeName(),
        status: log.status,
        status_name: log.getStatusDisplayName(),
        total_count: log.total_count,
        success_count: log.success_count,
        fail_count: log.fail_count,
        success_rate: log.getSuccessRate(),
        operation_params: log.operation_params,
        result_summary: log.result_summary,
        operator_id: log.operator_id,
        operator_name: log.operator?.nickname || null,
        created_at: log.created_at,
        completed_at: log.completed_at,
        updated_at: log.updated_at
      }
    } catch (error) {
      logger.error('获取批量操作详情失败', { batch_log_id, error: error.message })
      throw error
    }
  }

  /**
   * 查询批量操作日志列表
   *
   * @param {Object} params - 查询参数
   * @param {number} [params.operator_id] - 操作人ID
   * @param {string} [params.operation_type] - 操作类型
   * @param {string} [params.status] - 状态
   * @param {number} [params.limit=20] - 返回数量
   * @param {number} [params.offset=0] - 偏移量
   * @returns {Promise<Object>} 查询结果 { total, logs }
   */
  static async queryOperationLogs(params = {}) {
    const { operator_id, operation_type, status, limit = 20, offset = 0 } = params

    try {
      const whereConditions = {}

      if (operator_id) {
        whereConditions.operator_id = parseInt(operator_id)
      }
      if (operation_type) {
        whereConditions.operation_type = operation_type
      }
      if (status) {
        whereConditions.status = status
      }

      const { count, rows } = await BatchOperationLog.findAndCountAll({
        where: whereConditions,
        include: [
          {
            model: require('../models').User,
            as: 'operator',
            attributes: ['user_id', 'nickname']
          }
        ],
        order: [['created_at', 'DESC']],
        limit: parseInt(limit),
        offset: parseInt(offset)
      })

      const logs = rows.map(log => ({
        batch_log_id: log.batch_log_id,
        operation_type: log.operation_type,
        operation_type_name: log.getOperationTypeName(),
        status: log.status,
        status_name: log.getStatusDisplayName(),
        total_count: log.total_count,
        success_count: log.success_count,
        fail_count: log.fail_count,
        success_rate: log.getSuccessRate(),
        operator_id: log.operator_id,
        operator_name: log.operator?.nickname || null,
        created_at: log.created_at,
        completed_at: log.completed_at
      }))

      return { total: count, logs }
    } catch (error) {
      logger.error('查询批量操作日志失败', { params, error: error.message })
      throw error
    }
  }

  // ==================== 预检查综合方法 ====================

  /**
   * 执行批量操作预检查
   * 综合检查：幂等性 + 限流 + 并发 + 批量大小
   *
   * @param {Object} params - 检查参数
   * @param {string} params.operation_type - 操作类型
   * @param {number} params.operator_id - 操作人ID
   * @param {Object} params.operation_params - 操作参数
   * @param {number} params.items_count - 项目数量
   * @returns {Promise<Object>} 检查结果 { passed: boolean, errors: [], idempotency_key: string }
   */
  static async preCheck(params) {
    const { operation_type, operator_id, operation_params, items_count } = params
    const errors = []

    // 1. 生成幂等键
    const idempotency_key = BatchOperationService.generateIdempotencyKey(
      operation_type,
      operator_id,
      operation_params
    )

    // 2. 幂等性检查
    const idempotencyResult = await BatchOperationService.checkIdempotency(idempotency_key)
    if (idempotencyResult.exists) {
      errors.push({
        code: 'IDEMPOTENCY_CONFLICT',
        message: '操作已存在或正在处理中',
        existing_log: idempotencyResult.existing_log
      })
    }

    // 3. 限流检查
    const rateLimitResult = await BatchOperationService.checkRateLimit(operator_id, operation_type)
    if (!rateLimitResult.allowed) {
      errors.push({
        code: 'RATE_LIMIT_EXCEEDED',
        message: rateLimitResult.message,
        remaining_seconds: rateLimitResult.remaining_seconds
      })
    }

    // 4. 并发检查
    const concurrencyResult = await BatchOperationService.checkConcurrencyLimit(operator_id)
    if (!concurrencyResult.allowed) {
      errors.push({
        code: 'CONCURRENCY_LIMIT_EXCEEDED',
        message: concurrencyResult.message,
        processing_count: concurrencyResult.processing_count
      })
    }

    // 5. 批量大小检查
    const batchSizeResult = await BatchOperationService.checkBatchSizeLimit(
      operation_type,
      items_count
    )
    if (!batchSizeResult.allowed) {
      errors.push({
        code: 'BATCH_SIZE_EXCEEDED',
        message: batchSizeResult.message,
        max_items: batchSizeResult.max_items
      })
    }

    const passed = errors.length === 0

    logger.info('批量操作预检查', {
      operation_type,
      operator_id,
      items_count,
      passed,
      error_count: errors.length
    })

    return {
      passed,
      errors,
      idempotency_key,
      max_items: batchSizeResult.max_items
    }
  }
}

module.exports = BatchOperationService
