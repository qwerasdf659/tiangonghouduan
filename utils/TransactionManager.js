/* eslint-disable no-await-in-loop -- 事务重试逻辑必须串行执行 */

/**
 * 统一事务管理器 - TransactionManager
 *
 * 职责：
 * - 统一事务创建（超时保护、隔离级别配置）
 * - 智能重试策略（死锁/超时可重试，业务错误不重试）
 * - 错误分析（区分可重试/不可重试错误）
 * - 事务状态检查（防止重复提交/回滚）
 * - 集成事务上下文（AsyncLocalStorage）
 *
 * 重试策略（P0-3 决策 2026-01-09）：
 * - 4xx/业务码：永不重试（立即抛出）
 * - 未知错误：最多重试 1 次（总共执行 2 次）
 * - 死锁/超时类：重试 3 次（指数退避）
 *
 * 设计原则：
 * - 事务创建权收敛到"入口编排层"
 * - 内部服务方法必须接受 transaction 参数
 * - 事务边界清晰，每个业务入口明确标注事务边界
 *
 * 使用方式：
 * ```javascript
 * const result = await TransactionManager.execute(
 *   async (transaction) => {
 *     await BalanceService.changeBalance({...}, { transaction })
 *     await LotteryQuotaService.deductQuota({...}, { transaction })
 *     return result
 *   },
 *   { maxRetries: 3, timeout: 30000, isolationLevel: 'READ_COMMITTED' }
 * )
 * ```
 *
 * @since 2026-01-03
 * @version 1.1.0（P0-3 重试策略优化）
 */

'use strict'

const { sequelize, Sequelize } = require('../config/database')
const logger = require('./logger')
const TransactionContext = require('./TransactionContext')
const { getRetryStrategy } = require('../constants/ErrorCodes')

/**
 * 事务配置选项
 * @typedef {Object} TransactionOptions
 * @property {number} maxRetries - 最大重试次数 (默认 3)
 * @property {number} timeout - 超时时间毫秒 (默认 30000)
 * @property {string} isolationLevel - 隔离级别 (默认 'READ_COMMITTED')
 * @property {string} description - 事务描述（用于日志）
 * @property {boolean} enableRetry - 是否启用重试 (默认 true)
 */

/**
 * 错误分析结果
 * @typedef {Object} ErrorAnalysis
 * @property {boolean} retryable - 是否可重试
 * @property {string} reason - 错误原因分类
 * @property {string} code - 错误代码
 */

/**
 * 统一事务管理器类
 */
class TransactionManager {
  /**
   * 执行事务操作（P0-3 优化：智能重试策略）
   *
   * 重试策略（P0-3 决策 2026-01-09）：
   * - 4xx/业务码：永不重试（立即抛出）
   * - 未知错误：最多重试 1 次（总共执行 2 次）
   * - 死锁/超时类：重试 3 次（指数退避）
   *
   * @param {Function} operation - 事务操作函数 (transaction) => Promise<result>
   * @param {TransactionOptions} options - 选项
   * @returns {Promise<any>} 操作结果
   */
  static async execute(operation, options = {}) {
    const {
      maxRetries = 3, // 最大重试次数上限（实际重试次数由错误类型决定）
      timeout = 30000,
      isolationLevel = 'READ_COMMITTED',
      description = 'TransactionManager.execute',
      enableRetry = true
    } = options

    const startTime = Date.now()
    let transaction = null
    let attempt = 0
    let effectiveMaxRetries = maxRetries // 实际使用的重试次数，首次执行后由错误类型决定

    while (attempt < effectiveMaxRetries) {
      try {
        // 创建事务
        transaction = await sequelize.transaction({
          isolationLevel: Sequelize.Transaction.ISOLATION_LEVELS[isolationLevel],
          timeout
        })

        const transactionId = transaction.id || 'unknown'

        logger.info('🔄 事务开始', {
          transactionId,
          attempt: attempt + 1,
          maxRetries: effectiveMaxRetries,
          timeout,
          isolationLevel,
          description
        })

        // 设置超时保护
        const timeoutPromise = new Promise(function (resolve, reject) {
          setTimeout(function () {
            const error = new Error('事务超时：超过 ' + timeout + 'ms')
            error.code = 'TRANSACTION_TIMEOUT'
            reject(error)
          }, timeout)
        })

        // 在事务上下文中执行业务操作
        const result = await Promise.race([
          TransactionContext.run(() => operation(transaction), transaction),
          timeoutPromise
        ])

        // 检查事务状态避免重复提交
        if (!transaction.finished) {
          await transaction.commit()

          const duration = Date.now() - startTime
          logger.info('✅ 事务提交成功', {
            transactionId,
            attempt: attempt + 1,
            duration: `${duration}ms`,
            description
          })
        }

        return result
      } catch (error) {
        const duration = Date.now() - startTime

        // 安全回滚逻辑
        if (transaction && !transaction.finished) {
          try {
            await transaction.rollback()
            logger.warn('↩️ 事务回滚成功', {
              attempt: attempt + 1,
              duration: duration + 'ms',
              error: error.message,
              description
            })
          } catch (rollbackError) {
            logger.error('❌ 事务回滚失败', {
              error: rollbackError.message,
              originalError: error.message,
              description
            })
          }
        }

        // 错误分析（P0-3：使用智能重试策略）
        const errorAnalysis = this.analyzeError(error)

        /*
         * P0-3 优化：根据错误类型动态调整重试次数
         * 首次失败时，根据错误类型设置实际重试次数
         */
        if (attempt === 0 && errorAnalysis.maxRetries !== undefined) {
          /*
           * 使用错误类型建议的重试次数，但不超过配置的上限
           * +1 是因为第一次执行不算重试
           */
          effectiveMaxRetries = Math.min(errorAnalysis.maxRetries + 1, maxRetries)
        }

        // 计算剩余重试次数
        const remainingRetries = effectiveMaxRetries - attempt - 1

        // 判断是否应该重试
        const shouldRetry = enableRetry && errorAnalysis.retryable && remainingRetries > 0

        if (shouldRetry) {
          const delay = Math.min(1000 * Math.pow(2, attempt), 5000)
          logger.warn('⏳ 事务失败，' + delay + 'ms 后重试', {
            attempt: attempt + 1 + '/' + effectiveMaxRetries,
            remainingRetries,
            error: error.message,
            reason: errorAnalysis.reason,
            code: errorAnalysis.code,
            errorMaxRetries: errorAnalysis.maxRetries,
            description
          })
          await this.sleep(delay)
          attempt++
          continue
        }

        // 不可重试或达到最大重试次数
        logger.error('❌ 事务最终失败', {
          attempts: attempt + 1,
          duration: duration + 'ms',
          error: error.message,
          retryable: errorAnalysis.retryable,
          reason: errorAnalysis.reason,
          code: errorAnalysis.code,
          errorMaxRetries: errorAnalysis.maxRetries,
          description
        })

        // 增强错误信息
        error.transactionAttempts = attempt + 1
        error.transactionDuration = duration
        error.transactionErrorCode = errorAnalysis.code
        error.transactionErrorReason = errorAnalysis.reason
        throw error
      }
    }
  }

  /**
   * 执行只读事务（不重试，隔离级别较低）
   *
   * @param {Function} operation - 事务操作函数
   * @param {TransactionOptions} options - 选项
   * @returns {Promise<any>} 操作结果
   */
  static async executeReadOnly(operation, options = {}) {
    return this.execute(operation, {
      maxRetries: 1,
      timeout: options.timeout || 10000,
      isolationLevel: 'READ_COMMITTED',
      enableRetry: false,
      description: options.description || 'TransactionManager.executeReadOnly',
      ...options
    })
  }

  /**
   * 分析错误类型（P0-3 优化：使用统一错误码系统）
   *
   * 决策规则（P0-3 2026-01-09 已拍板）：
   * - 4xx/业务码：永不重试（maxRetries=0）
   * - 可重试错误（死锁/超时）：重试 3 次（maxRetries=3）
   * - 未知错误：重试 1 次（maxRetries=1，总共执行 2 次）
   *
   * @param {Error} error - 错误对象
   * @returns {ErrorAnalysis} 错误分析结果（含 maxRetries）
   */
  static analyzeError(error) {
    const msg = (error.message || '').toLowerCase()
    const code = error.code || ''

    // ========== 特殊处理：事务已完成错误（立即返回，不重试）==========
    if (
      msg.includes('transaction cannot be rolled back') ||
      msg.includes('has been finished') ||
      code === 'TRANSACTION_FINISHED'
    ) {
      return {
        retryable: false,
        maxRetries: 0,
        reason: 'transaction_already_finished',
        code: 'TX_FINISHED'
      }
    }

    // ========== 特殊处理：唯一约束冲突（幂等性触发，不重试）==========
    if (
      msg.includes('unique constraint') ||
      msg.includes('duplicate entry') ||
      code === 'ER_DUP_ENTRY'
    ) {
      return {
        retryable: false,
        maxRetries: 0,
        reason: 'unique_constraint_violation',
        code: 'TX_DUPLICATE'
      }
    }

    // ========== 使用统一错误码系统进行分类 ==========
    const strategy = getRetryStrategy(error)

    // 转换为 TransactionManager 内部格式
    return {
      retryable: strategy.retryable,
      maxRetries: strategy.maxRetries,
      reason: strategy.reason,
      code: strategy.code
    }
  }

  /**
   * 延迟工具函数
   *
   * @param {number} ms - 毫秒数
   * @returns {Promise<void>} 延迟后解析的 Promise
   */
  static sleep(ms) {
    return new Promise(function (resolve) {
      setTimeout(resolve, ms)
    })
  }

  /**
   * 获取当前事务（从上下文获取）
   *
   * @param {Object} options - 选项
   * @param {boolean} options.required - 是否必需
   * @returns {Object|null} 事务对象
   */
  static getCurrentTransaction(options = {}) {
    return TransactionContext.getTransaction(options)
  }

  /**
   * 检查是否在事务中
   *
   * @returns {boolean} 是否在事务中
   */
  static isInTransaction() {
    return TransactionContext.hasTransaction()
  }
}

module.exports = TransactionManager
