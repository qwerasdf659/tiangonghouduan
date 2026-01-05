/**
 * 事务助手函数 - transactionHelpers
 *
 * 职责：
 * - 提供事务相关的运行时断言
 * - 强制检查事务边界
 * - 在开发阶段暴露事务传递问题
 *
 * 使用方式：
 * ```javascript
 * const { requireTransaction } = require('../utils/transactionHelpers')
 *
 * class AssetService {
 *   static async changeBalance(params, options = {}) {
 *     const transaction = options.transaction || TransactionContext.getTransaction()
 *     requireTransaction(transaction, 'AssetService.changeBalance')
 *     // ... 业务逻辑 ...
 *   }
 * }
 * ```
 *
 * @since 2026-01-03
 * @version 1.0.0
 */

'use strict'

const TransactionContext = require('./TransactionContext')

/**
 * 运行时断言：要求必须在事务中调用
 *
 * 业务规则：
 * - 关键服务方法必须在事务中调用
 * - 漏传 transaction 直接报错（开发阶段暴露问题）
 * - 事务已完成也报错（防止重复提交/回滚）
 *
 * @param {Object} transaction - 事务对象
 * @param {string} methodName - 方法名（用于错误提示）
 * @returns {void} 无返回值，验证失败时抛出错误
 * @throws {Error} 当事务不存在或已完成时抛出错误
 */
function requireTransaction (transaction, methodName) {
  if (!transaction) {
    const error = new Error(
      '[事务边界错误] ' +
        methodName +
        ' 必须在事务中调用，但未传入 transaction 参数。\n' +
        '请检查调用链路，确保从 TransactionManager.execute() 传递 transaction。\n' +
        '如果是入口方法，请使用 TransactionManager.execute() 包裹业务逻辑。'
    )
    error.code = 'TRANSACTION_REQUIRED'
    error.methodName = methodName
    throw error
  }

  if (transaction.finished) {
    const error = new Error(
      '[事务边界错误] ' +
        methodName +
        ' 收到的 transaction 已完成 (committed/rolled back)。\n' +
        '请检查是否存在事务嵌套或重复提交问题。\n' +
        '确保所有操作都在同一事务生命周期内完成。'
    )
    error.code = 'TRANSACTION_FINISHED'
    error.methodName = methodName
    throw error
  }
}

/**
 * 获取有效事务（优先显式传入，其次从上下文获取）
 *
 * 业务规则：
 * - 优先使用 options.transaction（显式传入）
 * - 其次从 TransactionContext 获取（AsyncLocalStorage）
 * - required=true 时强制要求必须存在
 *
 * @param {Object} options - 选项
 * @param {Object} options.transaction - 显式传入的事务
 * @param {boolean} required - 是否强制要求
 * @returns {Object|null} 事务对象 - 返回有效事务对象，不存在时返回 null
 * @throws {Error} 当 required=true 且不存在事务时抛出错误
 */
function getEffectiveTransaction (options = {}, required = false) {
  // 优先使用显式传入的事务
  if (options.transaction) {
    return options.transaction
  }

  // 其次从上下文获取
  return TransactionContext.getTransaction({ required })
}

/**
 * 断言并获取事务（结合 require + get）
 *
 * 推荐使用场景：服务方法开头统一获取事务
 *
 * @param {Object} options - 选项
 * @param {Object} options.transaction - 显式传入的事务
 * @param {string} methodName - 方法名（用于错误提示）
 * @returns {Object} 事务对象 - 返回有效事务对象
 * @throws {Error} 当事务不存在或已完成时抛出错误
 */
function assertAndGetTransaction (options = {}, methodName) {
  const transaction = getEffectiveTransaction(options, true)
  requireTransaction(transaction, methodName)
  return transaction
}

module.exports = {
  requireTransaction,
  getEffectiveTransaction,
  assertAndGetTransaction
}
