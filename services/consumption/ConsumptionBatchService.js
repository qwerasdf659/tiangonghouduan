/**
 * 消费记录批量审核服务（ConsumptionBatchService）
 *
 * 业务场景：
 * - 管理员批量审核多条消费记录
 * - 支持部分成功模式（单条失败不影响其他）
 * - 自动幂等性检查，防止重复处理
 * - 审批通过自动发放积分
 *
 * 技术特性：
 * - 使用 BatchOperationService 进行幂等性检查
 * - 使用 TransactionManager 进行事务管理（每条记录独立事务）
 * - 使用 AuditLogService 记录审核操作
 * - 部分成功模式：返回成功/失败/跳过的详细统计
 *
 * API 端点：
 * - POST /api/v4/admin/consumption/batch-review
 *
 * 创建时间：2026年01月31日
 * 关联文档：后端数据库开发任务清单-2026年1月.md（P0-B10）
 *
 * @module services/consumption/ConsumptionBatchService
 */

'use strict'

const { Op } = require('sequelize')
const { sequelize } = require('../../config/database')
const BeijingTimeHelper = require('../../utils/timeHelper')
const logger = require('../../utils/logger').logger

/**
 * 批量审核操作类型
 * @constant
 */
const BATCH_REVIEW_ACTIONS = {
  APPROVE: 'approve',
  REJECT: 'reject'
}

/**
 * 批量操作限制
 * @constant
 */
const BATCH_LIMITS = {
  /** 单次批量最大记录数 */
  MAX_RECORDS: 100,
  /** 单条记录处理超时（毫秒） */
  RECORD_TIMEOUT: 10000
}

/**
 * 消费记录批量审核服务
 *
 * @description 处理消费记录的批量审核操作
 */
class ConsumptionBatchService {
  /**
   * 批量审核消费记录
   *
   * @description 对多条消费记录进行批量审核（通过或拒绝）
   *
   * @param {Object} params - 审核参数
   * @param {Array<number>} params.record_ids - 要审核的记录 ID 列表
   * @param {string} params.action - 审核动作（'approve' | 'reject'）
   * @param {string} [params.reason] - 审核原因（拒绝时必填）
   * @param {number} params.operator_id - 操作员（管理员）ID
   * @param {string} [params.idempotency_key] - 幂等性键（防止重复提交）
   * @returns {Promise<Object>} 批量处理结果
   *
   * @example
   * const result = await ConsumptionBatchService.batchReview({
   *   record_ids: [1, 2, 3],
   *   action: 'approve',
   *   operator_id: 1
   * })
   */
  static async batchReview(params) {
    const { record_ids, action, reason, operator_id, idempotency_key } = params
    const startTime = Date.now()

    // 1. 参数验证（提前验证，避免访问未定义属性）
    this._validateBatchParams(params)

    logger.info('[批量审核] 开始批量审核', {
      record_count: record_ids.length,
      action,
      operator_id,
      idempotency_key
    })

    // 2. 幂等性检查（如果提供了幂等键）
    if (idempotency_key) {
      const duplicate = await this._checkIdempotency(idempotency_key)
      if (duplicate) {
        logger.warn('[批量审核] 检测到重复操作', { idempotency_key })
        return duplicate
      }
    }

    // 3. 获取待审核记录
    const { ConsumptionRecord } = require('../../models')
    const records = await ConsumptionRecord.findAll({
      where: {
        consumption_record_id: { [Op.in]: record_ids },
        status: 'pending' // 只处理待审核的
      }
    })

    // 4. 初始化处理结果
    const result = {
      operation_id: this._generateOperationId(),
      idempotency_key,
      action,
      total_requested: record_ids.length,
      total_found: records.length,
      processed: {
        success: [],
        failed: [],
        skipped: []
      },
      stats: {
        success_count: 0,
        failed_count: 0,
        skipped_count: 0,
        total_points_awarded: 0
      },
      started_at: BeijingTimeHelper.apiTimestamp(),
      completed_at: null,
      duration_ms: 0
    }

    // 5. 标记跳过的记录（ID存在但状态不是pending）
    const foundIds = new Set(records.map(r => r.consumption_record_id))
    record_ids.forEach(id => {
      if (!foundIds.has(id)) {
        result.processed.skipped.push({
          record_id: id,
          reason: '记录不存在或状态非待审核'
        })
        result.stats.skipped_count++
      }
    })

    // 6. 逐条处理（部分成功模式）
    for (const record of records) {
      try {
        const processResult = await this._processSingleRecord(record, {
          action,
          reason,
          operator_id
        })

        result.processed.success.push(processResult)
        result.stats.success_count++

        if (processResult.points_awarded) {
          result.stats.total_points_awarded += processResult.points_awarded
        }
      } catch (error) {
        logger.error('[批量审核] 单条记录处理失败', {
          record_id: record.consumption_record_id,
          error: error.message
        })

        result.processed.failed.push({
          record_id: record.consumption_record_id,
          error: error.message,
          error_code: error.code || 'PROCESSING_ERROR'
        })
        result.stats.failed_count++
      }
    }

    // 7. 完成统计
    result.completed_at = BeijingTimeHelper.apiTimestamp()
    result.duration_ms = Date.now() - startTime

    // 8. 记录审计日志
    await this._logBatchOperation(result, operator_id)

    // 9. 缓存幂等结果（如果有幂等键）
    if (idempotency_key) {
      await this._cacheIdempotencyResult(idempotency_key, result)
    }

    logger.info('[批量审核] 批量审核完成', {
      operation_id: result.operation_id,
      success: result.stats.success_count,
      failed: result.stats.failed_count,
      skipped: result.stats.skipped_count,
      duration_ms: result.duration_ms
    })

    return result
  }

  /**
   * 处理单条记录的审核
   *
   * @private
   * @param {Object} record - 消费记录实例
   * @param {Object} options - 审核选项
   * @returns {Promise<Object>} 处理结果
   */
  static async _processSingleRecord(record, options) {
    const { action, reason, operator_id } = options
    const transaction = await sequelize.transaction()

    try {
      const updateData = {
        reviewed_by: operator_id,
        reviewed_at: BeijingTimeHelper.createDatabaseTime()
      }

      let pointsAwarded = 0

      if (action === BATCH_REVIEW_ACTIONS.APPROVE) {
        // 审核通过
        updateData.status = 'approved'
        updateData.final_status = 'approved'
        updateData.admin_notes = reason || '批量审核通过'

        // 发放积分
        pointsAwarded = await this._awardPoints(record, operator_id, transaction)
      } else if (action === BATCH_REVIEW_ACTIONS.REJECT) {
        // 审核拒绝
        updateData.status = 'rejected'
        updateData.final_status = 'rejected'
        updateData.admin_notes = reason || '批量审核拒绝'
      }

      // 更新记录
      await record.update(updateData, { transaction })

      await transaction.commit()

      return {
        consumption_record_id: record.consumption_record_id,
        action,
        previous_status: 'pending',
        new_status: updateData.status,
        points_awarded: pointsAwarded,
        processed_at: BeijingTimeHelper.apiTimestamp()
      }
    } catch (error) {
      await transaction.rollback()
      throw error
    }
  }

  /**
   * 发放消费积分
   *
   * @private
   * @param {Object} record - 消费记录
   * @param {number} operator_id - 操作员 ID
   * @param {Object} transaction - 事务实例
   * @returns {Promise<number>} 发放的积分数量
   */
  static async _awardPoints(record, operator_id, transaction) {
    try {
      // 计算积分（如果记录中没有预设积分值）
      const pointsToAward = record.points_to_award || Math.floor(record.consumption_amount * 10) // 默认1元=10积分

      if (pointsToAward <= 0) {
        return 0
      }

      /*
       * 通过 BalanceService.changeBalance 发放积分
       * 资产模块已拆分（V4.7.0）：
       * - BalanceService：余额操作
       * - ItemService：物品操作
       * - QueryService：查询统计
       */
      const BalanceService = require('../asset/BalanceService')

      // 生成幂等键：业务类型_记录ID_操作员ID
      const idempotencyKey = `consumption_reward_${record.consumption_record_id}_${operator_id}`

      const mintAccount = await BalanceService.getOrCreateAccount(
        { system_code: 'SYSTEM_MINT' },
        { transaction }
      )
      await BalanceService.changeBalance(
        {
          user_id: record.user_id,
          asset_code: 'POINTS',
          delta_amount: pointsToAward,
          business_type: 'consumption_reward',
          idempotency_key: idempotencyKey,
          counterpart_account_id: mintAccount.account_id,
          meta: {
            reference_id: record.consumption_record_id,
            reference_type: 'consumption_record',
            description: `消费奖励: ¥${record.consumption_amount}`,
            operator_id
          }
        },
        { transaction }
      )

      // 更新记录的积分交易关联
      record.reward_transaction_id = record.consumption_record_id

      return pointsToAward
    } catch (error) {
      logger.error('[批量审核] 积分发放失败', {
        record_id: record.consumption_record_id,
        error: error.message
      })
      throw new Error(`积分发放失败: ${error.message}`)
    }
  }

  /**
   * 验证批量审核参数
   *
   * @private
   * @param {Object} params - 审核参数
   * @returns {void}
   * @throws {Error} 参数无效时抛出错误
   */
  static _validateBatchParams(params) {
    const { record_ids, action, reason, operator_id } = params

    if (!Array.isArray(record_ids) || record_ids.length === 0) {
      throw new Error('record_ids 必须是非空数组')
    }

    if (record_ids.length > BATCH_LIMITS.MAX_RECORDS) {
      throw new Error(`单次批量最多处理 ${BATCH_LIMITS.MAX_RECORDS} 条记录`)
    }

    if (!Object.values(BATCH_REVIEW_ACTIONS).includes(action)) {
      throw new Error(`action 必须是 ${Object.values(BATCH_REVIEW_ACTIONS).join(' 或 ')}`)
    }

    if (action === BATCH_REVIEW_ACTIONS.REJECT && !reason) {
      throw new Error('拒绝操作必须提供 reason')
    }

    if (!operator_id) {
      throw new Error('operator_id 是必填项')
    }
  }

  /**
   * 检查幂等性（是否重复操作）
   *
   * @private
   * @param {string} idempotencyKey - 幂等键
   * @returns {Promise<Object|null>} 如果是重复操作，返回之前的结果
   */
  static async _checkIdempotency(idempotencyKey) {
    try {
      const { BusinessCacheHelper } = require('../../utils/BusinessCacheHelper')
      const cacheKey = `batch_review:idempotency:${idempotencyKey}`
      const cached = await BusinessCacheHelper.get(cacheKey)

      if (cached) {
        return {
          ...cached,
          is_duplicate: true,
          duplicate_message: '此操作已执行，返回原结果'
        }
      }

      return null
    } catch (error) {
      logger.warn('[批量审核] 幂等性检查失败', { error: error.message })
      return null
    }
  }

  /**
   * 缓存幂等性结果
   *
   * @private
   * @param {string} idempotencyKey - 幂等键
   * @param {Object} result - 操作结果
   * @returns {Promise<void>} 无返回值
   */
  static async _cacheIdempotencyResult(idempotencyKey, result) {
    try {
      const { BusinessCacheHelper } = require('../../utils/BusinessCacheHelper')
      const cacheKey = `batch_review:idempotency:${idempotencyKey}`
      // 缓存 24 小时
      await BusinessCacheHelper.set(cacheKey, result, 24 * 60 * 60)
    } catch (error) {
      logger.warn('[批量审核] 幂等性结果缓存失败', { error: error.message })
    }
  }

  /**
   * 记录批量操作审计日志
   *
   * @private
   * @param {Object} result - 操作结果
   * @param {number} operator_id - 操作员 ID
   * @returns {Promise<void>} 无返回值
   */
  static async _logBatchOperation(result, operator_id) {
    try {
      const AuditLogService = require('../AuditLogService')
      await AuditLogService.logOperation({
        operator_id,
        operation_type: 'consumption_batch_review',
        operation_name: '消费记录批量审核',
        resource_type: 'consumption_record',
        resource_ids: result.processed.success.map(s => s.consumption_record_id),
        details: {
          operation_id: result.operation_id,
          action: result.action,
          stats: result.stats,
          duration_ms: result.duration_ms
        },
        ip_address: null // 由路由层传入
      })
    } catch (error) {
      logger.warn('[批量审核] 审计日志记录失败', { error: error.message })
    }
  }

  /**
   * 生成操作 ID
   *
   * @private
   * @returns {string} 操作 ID
   */
  static _generateOperationId() {
    const timestamp = Date.now().toString(36)
    const random = Math.random().toString(36).substring(2, 8)
    return `batch_${timestamp}_${random}`
  }

  /**
   * 获取批量操作历史（可选功能）
   *
   * @param {Object} options - 查询选项
   * @param {number} [options.operator_id] - 操作员 ID 筛选
   * @param {number} [options.page] - 页码
   * @param {number} [options.page_size] - 每页数量
   * @returns {Promise<Object>} 操作历史列表
   */
  static async getBatchHistory(options = {}) {
    const { operator_id, page = 1, page_size = 20 } = options

    try {
      const { AdminOperationLog } = require('../../models')

      const where = {
        operation_type: 'consumption_batch_review'
      }

      if (operator_id) {
        where.operator_id = operator_id
      }

      const { count, rows } = await AdminOperationLog.findAndCountAll({
        where,
        order: [['created_at', 'DESC']],
        offset: (page - 1) * page_size,
        limit: page_size
      })

      return {
        items: rows,
        pagination: {
          page,
          page_size,
          total: count,
          total_pages: Math.ceil(count / page_size)
        }
      }
    } catch (error) {
      logger.error('[批量审核] 历史查询失败', { error: error.message })
      throw error
    }
  }
}

module.exports = ConsumptionBatchService
module.exports.BATCH_REVIEW_ACTIONS = BATCH_REVIEW_ACTIONS
module.exports.BATCH_LIMITS = BATCH_LIMITS
