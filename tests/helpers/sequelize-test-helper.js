/**
 * Sequelize 事务隔离测试 Helper - P0-4.1
 *
 * 创建时间：2026-01-30 北京时间
 * 版本：1.0.0
 * 优先级：P0 - 测试基础设施
 *
 * 职责：
 * - 提供测试事务隔离机制（自动回滚）
 * - 支持测试在独立事务中运行，测试结束后自动回滚
 * - 保持数据库在测试前后状态一致
 * - 与现有测试基础设施（UnifiedTestManager、TestDataCleaner）协同工作
 *
 * 设计原则：
 * - 测试隔离：每个测试在独立事务中运行，互不影响
 * - 自动清理：事务回滚比删除记录更高效且更可靠
 * - 零污染：测试数据不会持久化到数据库
 * - 兼容性：与现有服务的事务参数兼容
 *
 * 使用场景：
 * - 需要数据库隔离的单元测试
 * - 市场交易相关的集成测试
 * - 资产变更相关的测试
 *
 * 使用方式：
 * ```javascript
 * const { createIsolatedTestContext, withTransactionRollback } = require('../helpers/sequelize-test-helper')
 *
 * describe('市场交易测试', () => {
 *   let testContext
 *
 *   beforeEach(async () => {
 *     testContext = await createIsolatedTestContext()
 *   })
 *
 *   afterEach(async () => {
 *     await testContext.rollback()
 *   })
 *
 *   it('应该能创建挂牌', async () => {
 *     // 使用 testContext.transaction 执行测试
 *     const result = await MarketListingService.createListing(
 *       { ... },
 *       { transaction: testContext.transaction }
 *     )
 *     expect(result).toBeDefined()
 *     // 测试结束后自动回滚，数据不会持久化
 *   })
 * })
 *
 * // 方式2：使用包装函数
 * it('应该能创建挂牌', async () => {
 *   await withTransactionRollback(async (transaction) => {
 *     const result = await MarketListingService.createListing(
 *       { ... },
 *       { transaction }
 *     )
 *     expect(result).toBeDefined()
 *   })
 * })
 * ```
 */

'use strict'

// 加载环境变量（测试环境需要）
if (!process.env.DB_HOST) {
  require('dotenv').config()
}

const { sequelize } = require('../../config/database')

/**
 * 事务隔离测试上下文
 *
 * 封装测试事务的生命周期管理，提供：
 * - transaction: 测试专用事务对象
 * - rollback(): 回滚事务的方法
 * - isActive: 事务是否仍活跃
 *
 * @class IsolatedTestContext
 */
class IsolatedTestContext {
  /**
   * 创建事务隔离测试上下文
   *
   * @param {Object} transaction - Sequelize 事务对象
   * @param {Object} options - 配置选项
   */
  constructor(transaction, options = {}) {
    /**
     * Sequelize 事务对象
     * 传递给服务方法的 { transaction } 选项
     * @type {Object}
     */
    this.transaction = transaction

    /**
     * 事务ID（用于日志追踪）
     * @type {string}
     */
    this.transactionId = transaction.id || `test_tx_${Date.now()}`

    /**
     * 上下文创建时间
     * @type {Date}
     */
    this.createdAt = new Date()

    /**
     * 配置选项
     * @type {Object}
     */
    this.options = {
      verbose: options.verbose || false,
      description: options.description || '测试事务上下文'
    }

    /**
     * 事务是否已完成（提交或回滚）
     * @type {boolean}
     */
    this._finished = false
  }

  /**
   * 获取事务是否仍活跃
   * @returns {boolean}
   */
  get isActive() {
    return !this._finished && !this.transaction.finished
  }

  /**
   * 回滚事务（测试结束后调用）
   *
   * 说明：
   * - 自动检查事务状态，避免重复回滚
   * - 回滚失败时记录警告，不抛出错误
   * - 保证测试数据不会持久化
   *
   * @returns {Promise<boolean>} 回滚是否成功
   */
  async rollback() {
    if (this._finished) {
      if (this.options.verbose) {
        console.log(`📋 [IsolatedTestContext] 事务已完成，跳过回滚: ${this.transactionId}`)
      }
      return true
    }

    if (this.transaction.finished) {
      this._finished = true
      if (this.options.verbose) {
        console.log(`📋 [IsolatedTestContext] Sequelize事务已完成: ${this.transactionId}`)
      }
      return true
    }

    try {
      await this.transaction.rollback()
      this._finished = true

      const duration = Date.now() - this.createdAt.getTime()
      if (this.options.verbose) {
        console.log(`↩️ [IsolatedTestContext] 事务回滚成功: ${this.transactionId} (${duration}ms)`)
      }
      return true
    } catch (error) {
      this._finished = true
      console.warn(`⚠️ [IsolatedTestContext] 事务回滚失败: ${this.transactionId}`, error.message)
      return false
    }
  }

  /**
   * 提交事务（特殊场景：需要持久化测试数据时使用）
   *
   * ⚠️ 警告：正常测试不应该调用此方法
   * 仅用于需要跨事务验证的特殊场景
   *
   * @returns {Promise<boolean>} 提交是否成功
   */
  async commit() {
    if (this._finished || this.transaction.finished) {
      console.warn(`⚠️ [IsolatedTestContext] 事务已完成，无法提交: ${this.transactionId}`)
      return false
    }

    try {
      await this.transaction.commit()
      this._finished = true

      console.log(`⚠️ [IsolatedTestContext] 事务已提交（数据将持久化）: ${this.transactionId}`)
      return true
    } catch (error) {
      this._finished = true
      console.error(`❌ [IsolatedTestContext] 事务提交失败: ${this.transactionId}`, error.message)
      return false
    }
  }

  /**
   * 获取事务统计信息
   * @returns {Object}
   */
  getStats() {
    return {
      transactionId: this.transactionId,
      isActive: this.isActive,
      duration: Date.now() - this.createdAt.getTime(),
      description: this.options.description
    }
  }
}

/**
 * 创建事务隔离测试上下文
 *
 * 业务场景：
 * - 在 beforeEach 中创建，在 afterEach 中回滚
 * - 确保每个测试在独立事务中运行
 * - 测试数据不会持久化到数据库
 *
 * @param {Object} options - 配置选项
 * @param {string} options.isolationLevel - 事务隔离级别（默认 READ_COMMITTED）
 * @param {number} options.timeout - 事务超时时间（默认 60000ms）
 * @param {boolean} options.verbose - 是否输出详细日志
 * @param {string} options.description - 事务描述
 * @returns {Promise<IsolatedTestContext>} 测试上下文
 *
 * @example
 * let testContext
 * beforeEach(async () => {
 *   testContext = await createIsolatedTestContext({ description: '挂牌测试' })
 * })
 * afterEach(async () => {
 *   await testContext.rollback()
 * })
 */
async function createIsolatedTestContext(options = {}) {
  const {
    isolationLevel = 'READ_COMMITTED',
    timeout = 60000,
    verbose = false,
    description = '测试事务'
  } = options

  try {
    // 创建事务
    const transaction = await sequelize.transaction({
      isolationLevel: sequelize.Sequelize.Transaction.ISOLATION_LEVELS[isolationLevel],
      timeout
    })

    const context = new IsolatedTestContext(transaction, { verbose, description })

    if (verbose) {
      console.log(`🔄 [SequelizeTestHelper] 创建测试事务: ${context.transactionId}`)
    }

    return context
  } catch (error) {
    console.error('❌ [SequelizeTestHelper] 创建测试事务失败:', error.message)
    throw error
  }
}

/**
 * 在事务中执行测试操作并自动回滚
 *
 * 业务场景：
 * - 一次性测试：不需要在 beforeEach/afterEach 中管理事务
 * - 自动回滚：无论测试成功还是失败都回滚事务
 * - 适合简单的单元测试
 *
 * @param {Function} operation - 测试操作函数 (transaction) => Promise
 * @param {Object} options - 配置选项
 * @returns {Promise<any>} 操作返回值
 *
 * @example
 * it('应该能创建挂牌', async () => {
 *   await withTransactionRollback(async (transaction) => {
 *     const result = await MarketListingService.createListing(
 *       { seller_user_id: 1, ... },
 *       { transaction }
 *     )
 *     expect(result.listing).toBeDefined()
 *   })
 * })
 */
async function withTransactionRollback(operation, options = {}) {
  const context = await createIsolatedTestContext(options)

  try {
    // 执行测试操作
    const result = await operation(context.transaction)
    return result
  } finally {
    // 无论成功失败都回滚
    await context.rollback()
  }
}

/**
 * 创建嵌套事务测试上下文（Savepoint）
 *
 * 业务场景：
 * - 在一个大事务内创建检查点
 * - 支持部分回滚到 savepoint
 * - 用于复杂的多步骤测试
 *
 * @param {Object} parentTransaction - 父事务对象
 * @param {Object} options - 配置选项
 * @returns {Promise<IsolatedTestContext>} 嵌套事务上下文
 *
 * @example
 * await withTransactionRollback(async (transaction) => {
 *   // 步骤1：创建挂牌
 *   await MarketListingService.createListing({ ... }, { transaction })
 *
 *   // 创建 savepoint
 *   const checkpoint = await createNestedContext(transaction)
 *
 *   try {
 *     // 步骤2：创建订单（可能失败）
 *     await TradeOrderService.createOrder({ ... }, { transaction })
 *   } catch (error) {
 *     // 回滚到 savepoint，挂牌仍然保留
 *     await checkpoint.rollback()
 *   }
 * })
 */
async function createNestedContext(parentTransaction, options = {}) {
  const { verbose = false, description = '嵌套事务' } = options

  try {
    // MySQL 支持嵌套事务（通过 SAVEPOINT）
    const nestedTransaction = await sequelize.transaction({
      transaction: parentTransaction // 在父事务内创建
    })

    const context = new IsolatedTestContext(nestedTransaction, { verbose, description })

    if (verbose) {
      console.log(`🔄 [SequelizeTestHelper] 创建嵌套事务: ${context.transactionId}`)
    }

    return context
  } catch (error) {
    console.error('❌ [SequelizeTestHelper] 创建嵌套事务失败:', error.message)
    throw error
  }
}

/**
 * 测试事务管理器工厂
 *
 * 提供 Jest 钩子集成，简化测试文件中的事务管理
 *
 * @example
 * describe('市场交易测试', () => {
 *   const txManager = createTestTransactionManager()
 *
 *   beforeEach(txManager.beforeEach)
 *   afterEach(txManager.afterEach)
 *
 *   it('应该能创建挂牌', async () => {
 *     const tx = txManager.getTransaction()
 *     const result = await MarketListingService.createListing(
 *       { ... },
 *       { transaction: tx }
 *     )
 *     expect(result).toBeDefined()
 *   })
 * })
 */
function createTestTransactionManager(options = {}) {
  let currentContext = null

  return {
    /**
     * beforeEach 钩子函数
     * 在每个测试开始前创建事务
     */
    beforeEach: async function () {
      currentContext = await createIsolatedTestContext(options)
    },

    /**
     * afterEach 钩子函数
     * 在每个测试结束后回滚事务
     */
    afterEach: async function () {
      if (currentContext) {
        await currentContext.rollback()
        currentContext = null
      }
    },

    /**
     * 获取当前测试事务
     * @returns {Object|null} 事务对象
     */
    getTransaction: function () {
      if (!currentContext) {
        throw new Error('测试事务未初始化，请确保在 beforeEach 中调用 txManager.beforeEach')
      }
      return currentContext.transaction
    },

    /**
     * 获取当前测试上下文
     * @returns {IsolatedTestContext|null}
     */
    getContext: function () {
      return currentContext
    },

    /**
     * 检查是否有活跃事务
     * @returns {boolean}
     */
    hasActiveTransaction: function () {
      return currentContext && currentContext.isActive
    }
  }
}

/**
 * 在事务中批量执行测试数据创建
 *
 * 业务场景：
 * - 创建多个相关的测试数据
 * - 任何创建失败都会回滚所有数据
 * - 返回创建的所有实体
 *
 * @param {Object} transaction - 事务对象
 * @param {Array<Function>} creators - 创建函数数组 [(tx) => Promise<entity>]
 * @returns {Promise<Array>} 创建的实体数组
 *
 * @example
 * const [seller, buyer, item] = await batchCreateInTransaction(
 *   transaction,
 *   [
 *     tx => User.create({ ... }, { transaction: tx }),
 *     tx => User.create({ ... }, { transaction: tx }),
 *     tx => ItemInstance.create({ ... }, { transaction: tx })
 *   ]
 * )
 */
async function batchCreateInTransaction(transaction, creators) {
  const results = []

  for (const creator of creators) {
    const entity = await creator(transaction)
    results.push(entity)
  }

  return results
}

/**
 * 验证事务中的数据状态
 *
 * 业务场景：
 * - 在事务回滚前验证数据是否符合预期
 * - 支持多个验证函数
 * - 所有验证通过才返回 true
 *
 * @param {Object} transaction - 事务对象
 * @param {Array<Function>} validators - 验证函数数组 [(tx) => Promise<boolean>]
 * @returns {Promise<boolean>} 所有验证是否通过
 *
 * @example
 * const allValid = await validateInTransaction(transaction, [
 *   async tx => {
 *     const listing = await MarketListing.findOne({ where: { ... }, transaction: tx })
 *     return listing.status === 'on_sale'
 *   },
 *   async tx => {
 *     const item = await ItemInstance.findOne({ where: { ... }, transaction: tx })
 *     return item.status === 'listed'
 *   }
 * ])
 * expect(allValid).toBe(true)
 */
async function validateInTransaction(transaction, validators) {
  for (const validator of validators) {
    const isValid = await validator(transaction)
    if (!isValid) {
      return false
    }
  }
  return true
}

/**
 * 等待事务可见性（用于测试读已提交隔离级别）
 *
 * 业务场景：
 * - 某些测试需要等待数据在事务外可见
 * - 用于跨事务验证场景
 *
 * @param {number} ms - 等待毫秒数（默认 100ms）
 * @returns {Promise<void>}
 */
async function waitForTransactionVisibility(ms = 100) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

// ========== 导出 ==========

module.exports = {
  // 核心类
  IsolatedTestContext,

  // 核心函数
  createIsolatedTestContext,
  withTransactionRollback,
  createNestedContext,

  // Jest 集成
  createTestTransactionManager,

  // 工具函数
  batchCreateInTransaction,
  validateInTransaction,
  waitForTransactionVisibility,

  // 便捷导出（常用）
  sequelize
}
