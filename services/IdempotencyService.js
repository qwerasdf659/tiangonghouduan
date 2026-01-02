/**
 * 入口幂等服务 - IdempotencyService
 * 管理API请求的幂等性，实现"重试返回首次结果"
 *
 * 业务场景：
 * - 抽奖请求幂等：相同幂等键的重复请求返回首次抽奖结果
 * - 支付请求幂等：防止重复扣费
 * - 任何需要幂等性保证的POST/PUT/DELETE请求
 *
 * 核心功能：
 * - getOrCreateRequest：尝试获取或创建幂等请求记录
 * - markAsCompleted：标记请求为完成状态，保存结果快照
 * - markAsFailed：标记请求为失败状态
 * - cleanupExpired：清理过期记录（completed + failed）
 * - autoFailProcessingTimeout：自动将超时 processing 转为 failed
 *
 * 状态机：
 * - processing → completed：正常完成
 * - processing → failed：处理失败或超时
 * - failed → processing：重试（更新状态）
 *
 * 业界标准形态升级（2026-01-02）：
 * - TTL 从 24h 升级到 7 天
 * - fingerprint 包含 user_id, method, path, query, body
 * - 清理策略包含 failed 记录
 * - processing 超时自动转 failed（60秒）
 *
 * 创建时间：2025-12-26
 * 更新时间：2026-01-02 - 业界标准形态破坏性重构
 * 版本：2.0.0 - 业界标准幂等架构
 */

'use strict'

const crypto = require('crypto')
const { sequelize } = require('../config/database')
const logger = require('../utils/logger')

// 配置常量
const TTL_DAYS = 7 // 幂等记录保留天数
const PROCESSING_TIMEOUT_SECONDS = 60 // processing 状态超时阈值（秒）

/**
 * 入口幂等服务类
 * 职责：管理API请求的幂等性，实现"重试返回首次结果"
 */
class IdempotencyService {
  /**
   * 过滤请求体，剔除非业务语义字段
   *
   * @param {Object} body - 原始请求体
   * @returns {Object} 过滤后的请求体
   */
  static filterBodyForFingerprint(body) {
    if (!body || typeof body !== 'object') {
      return {}
    }

    // 需要剔除的非业务字段（不影响业务结果的元数据字段）
    const excludeFields = [
      'idempotency_key',
      'timestamp',
      'nonce',
      'signature',
      'trace_id',
      'request_id',
      '_csrf'
    ]

    const filtered = {}
    for (const [key, value] of Object.entries(body)) {
      if (!excludeFields.includes(key)) {
        filtered[key] = value
      }
    }
    return filtered
  }

  /**
   * 规范化API路径，去掉资源ID
   *
   * @param {string} path - 原始API路径
   * @returns {string} 规范化后的路径
   */
  static normalizePath(path) {
    if (!path) return ''

    /*
     * 将路径中的纯数字/UUID替换为占位符
     * 例如: /api/v4/market/listings/123/purchase -> /api/v4/market/listings/:id/purchase
     */
    return path
      .replace(/\/\d+/g, '/:id')
      .replace(/\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '/:uuid')
  }

  /**
   * 递归深度排序对象的键
   * 确保相同内容的对象生成相同的序列化结果
   *
   * @param {*} obj - 需要排序的对象
   * @returns {*} 排序后的对象
   */
  static deepSortObject(obj) {
    if (obj === null || obj === undefined) {
      return obj
    }

    if (Array.isArray(obj)) {
      return obj.map(item => this.deepSortObject(item))
    }

    if (typeof obj === 'object') {
      const sorted = {}
      const keys = Object.keys(obj).sort()
      for (const key of keys) {
        sorted[key] = this.deepSortObject(obj[key])
      }
      return sorted
    }

    return obj
  }

  /**
   * 生成请求指纹（用于检测参数冲突）
   * 【业界标准形态】包含 user_id, method, path, query, body
   *
   * @param {Object} context - 请求上下文
   * @param {number} context.user_id - 用户ID
   * @param {string} context.http_method - HTTP方法
   * @param {string} context.api_path - API路径
   * @param {Object} context.query - 查询参数
   * @param {Object} context.body - 请求体
   * @returns {string} SHA-256哈希值
   */
  static generateRequestFingerprint(context) {
    const { user_id, http_method, api_path, query, body } = context

    // 过滤请求体
    const body_filtered = this.filterBodyForFingerprint(body)

    // 规范化路径
    const normalized_path = this.normalizePath(api_path)

    // 构建规范化的 canonical 对象
    const canonical = {
      user_id,
      method: http_method,
      path: normalized_path,
      query: query || {},
      body: body_filtered
    }

    // 递归深度排序所有嵌套对象的键，确保相同内容生成相同哈希
    const sortedCanonical = this.deepSortObject(canonical)
    const sortedJson = JSON.stringify(sortedCanonical)

    return crypto.createHash('sha256').update(sortedJson).digest('hex')
  }

  /**
   * 生成请求参数哈希（兼容旧接口，内部调用 generateRequestFingerprint）
   *
   * @param {Object} params - 请求参数
   * @returns {string} SHA-256哈希值
   * @deprecated 使用 generateRequestFingerprint 替代
   */
  static generateRequestHash(params) {
    // 兼容旧调用方式，仅对 body 进行哈希
    const sortedParams = JSON.stringify(params, Object.keys(params || {}).sort())
    return crypto.createHash('sha256').update(sortedParams).digest('hex')
  }

  /**
   * 尝试获取或创建幂等请求记录
   *
   * 处理逻辑：
   * 1. 如果不存在 → 创建新记录（status=processing）
   * 2. 如果存在且completed → 返回首次结果（response_snapshot）
   * 3. 如果存在且processing → 抛出409错误
   * 4. 如果存在且failed → 允许重试（更新状态为processing）
   *
   * @param {string} idempotency_key - 幂等键
   * @param {Object} request_data - 请求数据
   * @param {string} request_data.api_path - API路径
   * @param {string} request_data.http_method - HTTP方法
   * @param {Object} request_data.request_params - 请求参数（body）
   * @param {Object} request_data.query - 查询参数（可选）
   * @param {number} request_data.user_id - 用户ID
   * @returns {Promise<Object>} { is_new, request, should_process, response }
   */
  static async getOrCreateRequest(idempotency_key, request_data) {
    // 延迟加载模型，避免循环依赖
    const { ApiIdempotencyRequest } = require('../models')

    const { api_path, http_method = 'POST', request_params, query, user_id } = request_data

    // 使用新的 fingerprint 算法
    const request_hash = this.generateRequestFingerprint({
      user_id,
      http_method,
      api_path,
      query,
      body: request_params
    })

    const transaction = await sequelize.transaction()

    try {
      // 尝试查找已存在的请求（加锁防止并发）
      const existingRequest = await ApiIdempotencyRequest.findOne({
        where: { idempotency_key },
        lock: transaction.LOCK.UPDATE,
        transaction
      })

      if (existingRequest) {
        // 检查参数是否一致（防止幂等键冲突）
        if (existingRequest.request_hash !== request_hash) {
          await transaction.rollback()
          const error = new Error(
            '幂等键冲突：相同的 idempotency_key 但参数不同。' +
              '请使用不同的幂等键或确认请求参数正确。'
          )
          error.statusCode = 409
          error.errorCode = 'IDEMPOTENCY_KEY_CONFLICT'
          throw error
        }

        // 参数一致，检查处理状态
        if (existingRequest.status === 'completed') {
          // 已完成，返回快照结果
          await transaction.commit()
          logger.info('🔄 入口幂等拦截：请求已完成，返回首次结果', {
            idempotency_key,
            user_id,
            api_path
          })
          return {
            is_new: false,
            request: existingRequest,
            should_process: false,
            response: existingRequest.response_snapshot
          }
        } else if (existingRequest.status === 'processing') {
          // 正在处理中，拒绝重复请求
          await transaction.commit()
          const error = new Error('请求正在处理中，请稍后重试')
          error.statusCode = 409
          error.errorCode = 'REQUEST_PROCESSING'
          error.retryAfter = 1 // 建议1秒后重试
          throw error
        } else if (existingRequest.status === 'failed') {
          // 失败状态，允许重试（更新为 processing）
          await existingRequest.update(
            {
              status: 'processing',
              updated_at: new Date()
            },
            { transaction }
          )
          await transaction.commit()
          logger.info('🔄 入口幂等：失败请求重试', {
            idempotency_key,
            user_id,
            api_path
          })
          return {
            is_new: false,
            request: existingRequest,
            should_process: true
          }
        }
      }

      /*
       * 不存在，创建新记录
       * 【业界标准形态】TTL 从 24h 升级到 7 天
       */
      const expires_at = new Date()
      expires_at.setDate(expires_at.getDate() + TTL_DAYS)

      const new_request = await ApiIdempotencyRequest.create(
        {
          idempotency_key,
          api_path,
          http_method,
          request_hash,
          request_params,
          user_id,
          status: 'processing',
          expires_at
        },
        { transaction }
      )

      await transaction.commit()

      logger.info('✅ 入口幂等：创建新请求记录', {
        request_id: new_request.request_id,
        idempotency_key,
        user_id,
        api_path,
        expires_at
      })

      return {
        is_new: true,
        request: new_request,
        should_process: true
      }
    } catch (error) {
      // 只有在事务未完成时才回滚（避免重复回滚错误）
      if (!transaction.finished) {
        await transaction.rollback()
      }
      throw error
    }
  }

  /**
   * 标记请求为完成状态（保存结果快照）
   *
   * @param {string} idempotency_key - 幂等键
   * @param {string} business_event_id - 业务事件ID（如 lottery_session_id）
   * @param {Object} response_data - 响应数据
   * @returns {Promise<void>} 无返回值
   */
  static async markAsCompleted(idempotency_key, business_event_id, response_data) {
    const { ApiIdempotencyRequest } = require('../models')

    await ApiIdempotencyRequest.update(
      {
        status: 'completed',
        business_event_id: business_event_id || null,
        response_snapshot: response_data,
        response_code: response_data?.code || 'SUCCESS',
        completed_at: new Date()
      },
      {
        where: { idempotency_key }
      }
    )

    logger.info('✅ 入口幂等：请求标记为完成', {
      idempotency_key,
      business_event_id,
      response_code: response_data?.code || 'SUCCESS'
    })
  }

  /**
   * 标记请求为失败状态
   *
   * @param {string} idempotency_key - 幂等键
   * @param {string} error_message - 错误信息
   * @returns {Promise<void>} 无返回值
   */
  static async markAsFailed(idempotency_key, error_message) {
    const { ApiIdempotencyRequest } = require('../models')

    await ApiIdempotencyRequest.update(
      {
        status: 'failed',
        response_snapshot: { error: error_message },
        completed_at: new Date()
      },
      {
        where: { idempotency_key }
      }
    )

    logger.info('⚠️ 入口幂等：请求标记为失败', {
      idempotency_key,
      error_message
    })
  }

  /**
   * 自动将超时的 processing 状态转为 failed
   * 【业界标准形态】超时阈值为 60 秒
   *
   * @returns {Promise<Object>} { updated_count }
   */
  static async autoFailProcessingTimeout() {
    const { ApiIdempotencyRequest } = require('../models')
    const { Op } = require('sequelize')

    const timeoutThreshold = new Date()
    timeoutThreshold.setSeconds(timeoutThreshold.getSeconds() - PROCESSING_TIMEOUT_SECONDS)

    const [updated_count] = await ApiIdempotencyRequest.update(
      {
        status: 'failed',
        response_snapshot: { error: 'Processing timeout' },
        completed_at: new Date()
      },
      {
        where: {
          status: 'processing',
          created_at: { [Op.lt]: timeoutThreshold }
        }
      }
    )

    if (updated_count > 0) {
      logger.info('⏰ 入口幂等：processing 超时自动转 failed', {
        updated_count,
        timeout_seconds: PROCESSING_TIMEOUT_SECONDS
      })
    }

    return { updated_count }
  }

  /**
   * 清理过期记录（定时任务调用）
   * 【业界标准形态】清理 completed 和 failed 状态的过期记录
   *
   * @returns {Promise<Object>} { deleted_count }
   */
  static async cleanupExpired() {
    const { ApiIdempotencyRequest } = require('../models')
    const { Op } = require('sequelize')

    // 先处理超时的 processing
    await this.autoFailProcessingTimeout()

    // 清理过期的 completed 和 failed 记录
    const result = await ApiIdempotencyRequest.destroy({
      where: {
        expires_at: { [Op.lt]: new Date() },
        status: { [Op.in]: ['completed', 'failed'] }
      }
    })

    logger.info('🧹 入口幂等：清理过期记录', {
      deleted_count: result
    })

    return { deleted_count: result }
  }

  /**
   * 根据幂等键查询请求记录
   *
   * @param {string} idempotency_key - 幂等键
   * @returns {Promise<Object|null>} 请求记录或null
   */
  static async findByKey(idempotency_key) {
    const { ApiIdempotencyRequest } = require('../models')

    return await ApiIdempotencyRequest.findOne({
      where: { idempotency_key }
    })
  }

  /**
   * 根据业务事件ID查询请求记录
   *
   * @param {string} business_event_id - 业务事件ID
   * @returns {Promise<Object|null>} 请求记录或null
   */
  static async findByBusinessEventId(business_event_id) {
    const { ApiIdempotencyRequest } = require('../models')

    return await ApiIdempotencyRequest.findOne({
      where: { business_event_id }
    })
  }
}

module.exports = IdempotencyService
