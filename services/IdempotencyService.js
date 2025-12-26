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
 * - cleanupExpired：清理过期记录
 *
 * 状态机：
 * - processing → completed：正常完成
 * - processing → failed：处理失败
 * - failed → processing：重试（更新状态）
 *
 * 命名规范（snake_case）：
 * - 所有方法、参数、字段使用snake_case
 * - 符合项目统一命名规范
 *
 * 创建时间：2025-12-26
 * 版本：1.0.0 - 业界标准幂等架构（方案B）
 */

'use strict'

const crypto = require('crypto')
const { sequelize } = require('../config/database')
const logger = require('../utils/logger')

/**
 * 入口幂等服务类
 * 职责：管理API请求的幂等性，实现"重试返回首次结果"
 */
class IdempotencyService {
  /**
   * 生成请求参数哈希（用于检测参数冲突）
   *
   * @param {Object} params - 请求参数
   * @returns {string} SHA-256哈希值
   */
  static generateRequestHash(params) {
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
   * @param {Object} request_data.request_params - 请求参数
   * @param {number} request_data.user_id - 用户ID
   * @returns {Promise<Object>} { is_new, request, should_process, response }
   */
  static async getOrCreateRequest(idempotency_key, request_data) {
    // 延迟加载模型，避免循环依赖
    const { ApiIdempotencyRequest } = require('../models')

    const { api_path, http_method = 'POST', request_params, user_id } = request_data
    const request_hash = this.generateRequestHash(request_params)

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
          throw error
        } else if (existingRequest.status === 'failed') {
          // 失败状态，允许重试（更新为 processing）
          await existingRequest.update(
            {
              status: 'processing'
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

      // 不存在，创建新记录
      const expires_at = new Date()
      expires_at.setHours(expires_at.getHours() + 24) // 24小时后过期

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
        api_path
      })

      return {
        is_new: true,
        request: new_request,
        should_process: true
      }
    } catch (error) {
      await transaction.rollback()
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
   * 清理过期记录（定时任务调用）
   *
   * @returns {Promise<Object>} { deleted_count }
   */
  static async cleanupExpired() {
    const { ApiIdempotencyRequest } = require('../models')
    const { Op } = require('sequelize')

    const result = await ApiIdempotencyRequest.destroy({
      where: {
        expires_at: { [Op.lt]: new Date() },
        status: 'completed'
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
