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
 * 设计原则：
 * - 事务创建权收敛到"入口编排层"
 * - 内部服务方法必须接受 transaction 参数
 * - 事务边界清晰，每个业务入口明确标注事务边界
 *
 * 使用方式：
 * ```javascript
 * const result = await TransactionManager.execute(
 *   async (transaction) => {
 *     await AssetService.changeBalance({...}, { transaction })
 *     await LotteryQuotaService.deductQuota({...}, { transaction })
 *     return result
 *   },
 *   { maxRetries: 3, timeout: 30000, isolationLevel: 'READ_COMMITTED' }
 * )
 * ```
 *
 * @since 2026-01-03
 * @version 1.0.0
 */

'use strict'

const { sequelize, Sequelize } = require('../config/database')
const logger = require('./logger')
const TransactionContext = require('./TransactionContext')

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
   * 执行事务操作
   *
   * @param {Function} operation - 事务操作函数 (transaction) => Promise<result>
   * @param {TransactionOptions} options - 选项
   * @returns {Promise<any>} 操作结果
   */
  static async execute(operation, options = {}) {
    const {
      maxRetries = 3,
      timeout = 30000,
      isolationLevel = 'READ_COMMITTED',
      description = 'TransactionManager.execute',
      enableRetry = true
    } = options

    const startTime = Date.now()
    let transaction = null

    for (let attempt = 0; attempt < maxRetries; attempt++) {
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
          maxRetries,
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

        // 错误分析
        const errorAnalysis = this.analyzeError(error)

        // 可重试错误且未达到最大重试次数
        if (enableRetry && errorAnalysis.retryable && attempt < maxRetries - 1) {
          const delay = Math.min(1000 * Math.pow(2, attempt), 5000)
          logger.warn('⏳ 事务失败，' + delay + 'ms 后重试', {
            attempt: attempt + 1 + '/' + maxRetries,
            error: error.message,
            reason: errorAnalysis.reason,
            code: errorAnalysis.code,
            description
          })
          await this.sleep(delay)
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
          description
        })

        // 增强错误信息
        error.transactionAttempts = attempt + 1
        error.transactionDuration = duration
        error.transactionErrorCode = errorAnalysis.code
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
   * 分析错误类型
   *
   * @param {Error} error - 错误对象
   * @returns {ErrorAnalysis} 错误分析结果
   */
  static analyzeError(error) {
    const msg = (error.message || '').toLowerCase()
    const code = error.code || ''

    // 事务已完成错误 (不可重试)
    if (
      msg.includes('transaction cannot be rolled back') ||
      msg.includes('has been finished') ||
      code === 'TRANSACTION_FINISHED'
    ) {
      return {
        retryable: false,
        reason: 'transaction_already_finished',
        code: 'TX_FINISHED'
      }
    }

    // 死锁错误 (可重试)
    if (msg.includes('deadlock') || msg.includes('lock wait timeout')) {
      return {
        retryable: true,
        reason: 'database_deadlock',
        code: 'TX_DEADLOCK'
      }
    }

    // 连接超时 (可重试)
    if (msg.includes('timeout') || msg.includes('connection') || code === 'TRANSACTION_TIMEOUT') {
      return {
        retryable: true,
        reason: 'connection_timeout',
        code: 'TX_TIMEOUT'
      }
    }

    // 业务逻辑错误 (不可重试)
    if (
      msg.includes('余额不足') ||
      msg.includes('库存不足') ||
      msg.includes('权限不足') ||
      msg.includes('不存在') ||
      msg.includes('已存在') ||
      msg.includes('状态不正确') ||
      code === 'BUSINESS_ERROR'
    ) {
      return {
        retryable: false,
        reason: 'business_logic_error',
        code: 'TX_BUSINESS'
      }
    }

    // 事务边界错误 (不可重试 - 开发阶段问题)
    if (
      msg.includes('必须在事务中调用') ||
      msg.includes('transaction 参数') ||
      code === 'TRANSACTION_REQUIRED'
    ) {
      return {
        retryable: false,
        reason: 'transaction_boundary_error',
        code: 'TX_REQUIRED'
      }
    }

    // 唯一约束冲突 (不可重试 - 幂等性触发)
    if (
      msg.includes('unique constraint') ||
      msg.includes('duplicate entry') ||
      code === 'ER_DUP_ENTRY'
    ) {
      return {
        retryable: false,
        reason: 'unique_constraint_violation',
        code: 'TX_DUPLICATE'
      }
    }

    // 其他未知错误 (默认可重试一次)
    return {
      retryable: true,
      reason: 'unknown_error',
      code: 'TX_UNKNOWN'
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
