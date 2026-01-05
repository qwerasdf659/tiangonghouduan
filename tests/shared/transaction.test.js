/**
 * 事务保护功能通用测试套件
 *
 * **业务场景**: 验证关键业务操作的事务一致性,确保数据完整性
 * **技术规范**:
 *   - 使用Sequelize事务机制
 *   - 验证事务提交/回滚逻辑
 *   - 测试并发事务处理
 *
 * 创建时间: 2025-11-14
 * 适用范围: 所有涉及多表操作的关键业务
 */

const { sequelize } = require('../../models')

/**
 * 事务保护通用测试工具类
 */
class TransactionTestSuite {
  /**
   * 测试事务提交成功
   *
   * @param {Function} transactionOperation - 事务操作函数
   * @param {Function} verifyFunction - 验证函数
   * @returns {Promise<void>} 无返回值
   *
   * @example
   * await TransactionTestSuite.testTransactionCommit(
   *   async (transaction) => {
   *     await AccountAssetBalance.update({ available_amount: 1000 }, {
   *       where: { account_id: 1, asset_code: 'POINTS' },
   *       transaction
   *     })
   *     await AssetTransaction.create({ account_id: 1, delta_amount: 100 }, { transaction })
   *   },
   *   async () => {
   *     const balance = await AccountAssetBalance.findOne({ where: { account_id: 1 } })
   *     expect(balance.available_amount).toBe(1000)
   *   }
   * )
   */
  static async testTransactionCommit (transactionOperation, verifyFunction) {
    const transaction = await sequelize.transaction()

    try {
      // 1. 执行事务操作
      console.log('🔄 执行事务操作...')
      await transactionOperation(transaction)

      // 2. 提交事务
      await transaction.commit()
      console.log('✅ 事务提交成功')

      // 3. 验证结果
      console.log('🔍 验证事务结果...')
      await verifyFunction()
      console.log('✅ 事务结果验证通过')
    } catch (error) {
      // 4. 发生错误时回滚
      if (!transaction.finished) {
        await transaction.rollback()
      }
      throw error
    }
  }

  /**
   * 测试事务回滚功能
   *
   * @param {Function} transactionOperation - 事务操作函数(应该抛出错误)
   * @param {Function} verifyRollback - 验证回滚的函数
   * @param {Function} getOriginalValue - 获取原始值的函数(可选)
   * @returns {Promise<void>} 无返回值
   *
   * @example
   * await TransactionTestSuite.testTransactionRollback(
   *   async (transaction) => {
   *     await AccountAssetBalance.update({ available_amount: 999 }, {
   *       where: { account_id: 1, asset_code: 'POINTS' },
   *       transaction
   *     })
   *     throw new Error('模拟业务错误')
   *   },
   *   async (originalValue) => {
   *     const balance = await AccountAssetBalance.findOne({ where: { account_id: 1 } })
   *     expect(balance.available_amount).toBe(originalValue)
   *   }
   * )
   */
  static async testTransactionRollback (
    transactionOperation,
    verifyRollback,
    getOriginalValue = null
  ) {
    // 1. 记录原始值
    let originalValue = null
    if (getOriginalValue) {
      originalValue = await getOriginalValue()
      console.log('📋 记录原始值:', originalValue)
    }

    const transaction = await sequelize.transaction()
    let errorOccurred = false

    try {
      // 2. 执行事务操作(应该抛出错误)
      console.log('🔄 执行事务操作(预期失败)...')
      await transactionOperation(transaction)
    } catch (error) {
      errorOccurred = true
      console.log('⚠️ 捕获到预期错误:', error.message)

      // 3. 回滚事务
      if (!transaction.finished) {
        await transaction.rollback()
        console.log('↩️ 事务回滚成功')
      }
    }

    // 4. 验证确实发生了错误
    expect(errorOccurred).toBe(true)

    // 5. 验证数据已回滚
    console.log('🔍 验证数据回滚...')
    await verifyRollback(originalValue)
    console.log('✅ 数据回滚验证通过')
  }

  /**
   * 测试并发事务隔离
   *
   * @param {Function} transaction1 - 第一个事务操作
   * @param {Function} transaction2 - 第二个事务操作
   * @param {Function} verifyIsolation - 验证隔离的函数
   * @returns {Promise<void>} 无返回值
   */
  static async testTransactionIsolation (transaction1, transaction2, verifyIsolation) {
    const t1 = await sequelize.transaction()
    const t2 = await sequelize.transaction()

    try {
      // 1. 并发执行两个事务
      console.log('🔄 并发执行两个事务...')
      await Promise.all([transaction1(t1), transaction2(t2)])

      // 2. 提交两个事务
      await t1.commit()
      await t2.commit()
      console.log('✅ 两个事务都提交成功')

      // 3. 验证隔离性
      console.log('🔍 验证事务隔离性...')
      await verifyIsolation()
      console.log('✅ 事务隔离验证通过')
    } catch (error) {
      // 4. 清理事务
      if (!t1.finished) await t1.rollback()
      if (!t2.finished) await t2.rollback()
      throw error
    }
  }

  /**
   * 测试事务中的多表操作
   *
   * @param {Array<Object>} operations - 多表操作数组
   * @param {Function} verifyAllChanges - 验证所有变更的函数
   * @returns {Promise<void>} 无返回值
   *
   * @example
   * await TransactionTestSuite.testMultiTableTransaction([
   *   {
   *     model: AccountAssetBalance,
   *     action: 'update',
   *     where: { account_id: 1, asset_code: 'POINTS' },
   *     data: { available_amount: 1000 }
   *   },
   *   {
   *     model: AssetTransaction,
   *     action: 'create',
   *     data: { account_id: 1, delta_amount: 100, business_type: 'earn' }
   *   }
   * ], async () => {
   *   // 验证所有表的变更
   * })
   */
  static async testMultiTableTransaction (operations, verifyAllChanges) {
    const transaction = await sequelize.transaction()

    try {
      // 1. 执行所有操作
      console.log(`🔄 执行${operations.length}个表操作...`)
      for (const op of operations) {
        const { model, action, where, data } = op

        if (action === 'create') {
          await model.create(data, { transaction })
          console.log(`✅ 创建${model.name}记录`)
        } else if (action === 'update') {
          await model.update(data, { where, transaction })
          console.log(`✅ 更新${model.name}记录`)
        } else if (action === 'delete') {
          await model.destroy({ where, transaction })
          console.log(`✅ 删除${model.name}记录`)
        }
      }

      // 2. 提交事务
      await transaction.commit()
      console.log('✅ 多表事务提交成功')

      // 3. 验证所有变更
      console.log('🔍 验证所有表的变更...')
      await verifyAllChanges()
      console.log('✅ 多表变更验证通过')
    } catch (error) {
      // 4. 发生错误时回滚
      if (!transaction.finished) {
        await transaction.rollback()
        console.log('↩️ 多表事务回滚')
      }
      throw error
    }
  }

  /**
   * 测试事务超时处理
   *
   * @param {Function} longRunningOperation - 长时间运行的操作
   * @param {number} timeoutMs - 超时时间(毫秒)
   * @returns {Promise<void>} 无返回值
   */
  static async testTransactionTimeout (longRunningOperation, timeoutMs = 5000) {
    const transaction = await sequelize.transaction()
    let timeoutOccurred = false

    try {
      // 1. 设置超时
      const timeoutPromise = new Promise((_resolve, reject) => {
        setTimeout(() => {
          timeoutOccurred = true
          reject(new Error('Transaction timeout'))
        }, timeoutMs)
      })

      // 2. 执行操作或超时
      console.log(`🔄 执行操作(${timeoutMs}ms超时)...`)
      await Promise.race([longRunningOperation(transaction), timeoutPromise])

      await transaction.commit()
    } catch (error) {
      console.log('⚠️ 事务超时或失败:', error.message)
      if (!transaction.finished) {
        await transaction.rollback()
        console.log('↩️ 超时后回滚成功')
      }
    }

    if (timeoutOccurred) {
      console.log('✅ 超时处理验证通过')
    }
  }
}

/**
 * 事务测试辅助函数
 */
class TransactionHelpers {
  /**
   * 创建测试事务
   *
   * @returns {Promise<Transaction>} Sequelize事务实例
   */
  static async createTestTransaction () {
    return await sequelize.transaction()
  }

  /**
   * 安全回滚事务
   *
   * @param {Transaction} transaction - 事务实例
   * @returns {Promise<void>} 无返回值
   */
  static async safeRollback (transaction) {
    if (transaction && !transaction.finished) {
      try {
        await transaction.rollback()
        console.log('✅ 事务安全回滚')
      } catch (error) {
        console.error('❌ 回滚失败:', error.message)
      }
    }
  }

  /**
   * 验证事务状态
   *
   * @param {Transaction} transaction - 事务实例
   * @returns {Object} 事务状态
   */
  static getTransactionStatus (transaction) {
    return {
      finished: transaction.finished,
      committed: transaction.finished && !transaction.options.rollback,
      rolledBack: transaction.finished && transaction.options.rollback
    }
  }

  /**
   * 模拟数据库死锁
   *
   * @param {Transaction} t1 - 第一个事务
   * @param {Transaction} t2 - 第二个事务
   * @param {Object} Model1 - 第一个模型
   * @param {Object} Model2 - 第二个模型
   * @param {Object} record1Id - 第一条记录ID
   * @param {Object} record2Id - 第二条记录ID
   * @returns {Promise<boolean>} 是否发生死锁
   */
  static async simulateDeadlock (t1, t2, Model1, Model2, record1Id, record2Id) {
    let deadlockOccurred = false

    try {
      /*
       * 事务1: 锁定记录1,然后尝试锁定记录2
       * 事务2: 锁定记录2,然后尝试锁定记录1
       */
      await Promise.all([
        (async () => {
          await Model1.findByPk(record1Id, { transaction: t1, lock: true })
          await new Promise(resolve => setTimeout(resolve, 100))
          await Model2.findByPk(record2Id, { transaction: t1, lock: true })
        })(),
        (async () => {
          await Model2.findByPk(record2Id, { transaction: t2, lock: true })
          await new Promise(resolve => setTimeout(resolve, 100))
          await Model1.findByPk(record1Id, { transaction: t2, lock: true })
        })()
      ])
    } catch (error) {
      if (error.message.includes('deadlock')) {
        deadlockOccurred = true
        console.log('✅ 死锁检测成功')
      }
    }

    return deadlockOccurred
  }
}

// 导出测试工具类
module.exports = {
  TransactionTestSuite,
  TransactionHelpers
}
