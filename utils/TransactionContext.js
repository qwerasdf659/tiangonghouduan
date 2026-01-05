/**
 * 事务上下文管理器 - TransactionContext
 *
 * 职责：
 * - 使用 Node.js AsyncLocalStorage 自动传递事务上下文
 * - 避免手动逐层传参
 * - 支持嵌套上下文管理
 *
 * 设计原则：
 * - 入口层通过 TransactionManager.execute() 设置上下文
 * - 服务层可通过 getTransaction() 获取当前事务
 * - 强制模式：getTransaction({ required: true }) 不存在时抛错
 *
 * 使用方式：
 * ```javascript
 * // 入口层（由 TransactionManager 自动调用）
 * await TransactionContext.run(() => operation(transaction), transaction)
 *
 * // 服务层
 * const transaction = TransactionContext.getTransaction({ required: true })
 * ```
 *
 * @since 2026-01-03
 * @version 1.0.0
 */

'use strict'

const { AsyncLocalStorage } = require('async_hooks')

/**
 * 事务上下文存储
 * @type {AsyncLocalStorage<{transaction: Object}>}
 */
const transactionStorage = new AsyncLocalStorage()

/**
 * 事务上下文管理器类
 */
class TransactionContext {
  /**
   * 在事务上下文中执行操作
   *
   * @param {Function} operation - 操作函数
   * @param {Object} transaction - Sequelize 事务对象
   * @returns {Promise<any>} 操作结果 - 返回操作函数的执行结果
   */
  static async run (operation, transaction) {
    return transactionStorage.run({ transaction }, operation)
  }

  /**
   * 获取当前事务
   *
   * @param {Object} options - 选项
   * @param {boolean} options.required - 是否必需 (默认 false)
   * @returns {Object|null} 事务对象 - 返回当前上下文中的事务对象，不存在时返回 null
   * @throws {Error} 当 required=true 且不存在事务时抛出错误
   */
  static getTransaction (options = {}) {
    const store = transactionStorage.getStore()
    const transaction = store?.transaction

    if (options.required && !transaction) {
      const error = new Error(
        '[事务边界错误] 当前上下文缺少事务对象。\n' +
          '请确保此方法是从 TransactionManager.execute() 内部调用的。\n' +
          '如果需要独立调用，请使用 { transaction } 参数显式传递事务。'
      )
      error.code = 'TRANSACTION_REQUIRED'
      throw error
    }

    return transaction || null
  }

  /**
   * 检查是否在事务中
   *
   * @returns {boolean} 是否在事务中 - true 表示当前在事务上下文中
   */
  static hasTransaction () {
    const store = transactionStorage.getStore()
    return !!store?.transaction
  }

  /**
   * 获取事务ID（用于日志追踪）
   *
   * @returns {string|null} 事务ID - 返回当前事务的ID，不存在时返回 null
   */
  static getTransactionId () {
    const transaction = this.getTransaction()
    return transaction?.id || null
  }

  /**
   * 获取当前存储对象（仅用于调试）
   *
   * @returns {Object|undefined} 存储对象 - 返回 AsyncLocalStorage 中的存储对象
   */
  static getStore () {
    return transactionStorage.getStore()
  }
}

module.exports = TransactionContext
