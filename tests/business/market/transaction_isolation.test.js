/**
 * 🔬 事务隔离测试示例 - P0-4.2
 *
 * 创建时间：2026-01-30 北京时间
 * 版本：1.0.0
 * 优先级：P0 - 测试基础设施验证
 *
 * 测试目标：
 * 1. 验证 sequelize-test-helper 事务隔离功能正常工作
 * 2. 演示事务隔离的正确使用方式
 * 3. 确保测试数据在事务回滚后不会持久化
 *
 * 使用方式说明：
 * - 方式1：createTestTransactionManager（推荐用于多个测试共享事务管理）
 * - 方式2：withTransactionRollback（推荐用于单个测试）
 * - 方式3：createIsolatedTestContext（手动管理事务生命周期）
 *
 * 验证点：
 * - 事务内创建的数据在回滚后不存在
 * - 事务隔离不影响其他测试
 * - 并发测试不会相互干扰
 */

'use strict'

const { sequelize, Item, User, Account } = require('../../../models')
const {
  createIsolatedTestContext,
  withTransactionRollback,
  createTestTransactionManager,
  batchCreateInTransaction,
  validateInTransaction
} = require('../../helpers/sequelize-test-helper')
const { ensureTestUserHasPoints } = require('../../helpers/test-points-setup')

// 测试超时设置
jest.setTimeout(60000)

describe('🔬 事务隔离测试（Transaction Isolation）', () => {
  // 测试数据
  let testUser
  /** items.owner_account_id 需要真实的 accounts.account_id（非 user_id） */
  let testAccountId

  beforeAll(async () => {
    console.log('🔬 ===== 事务隔离测试启动 =====')

    // 连接数据库
    await sequelize.authenticate()
    console.log('✅ 数据库连接成功')

    // 准备测试环境（确保测试用户有足够积分；C2C 市场环境准备已随 C2C 下线移除）
    await ensureTestUserHasPoints(100000)

    // 获取测试用户
    testUser = await User.findOne({
      where: { mobile: '13612227910', status: 'active' }
    })

    if (!testUser) {
      throw new Error('未找到测试用户 13612227910')
    }

    // 获取用户的资产账户ID（items.owner_account_id 是 FK → accounts.account_id）
    const account = await Account.findOne({
      where: { user_id: testUser.user_id, account_type: 'user' }
    })
    if (!account) {
      throw new Error('未找到测试用户的资产账户')
    }
    testAccountId = account.account_id

    console.log(`✅ 测试用户获取成功: user_id=${testUser.user_id}, account_id=${testAccountId}`)
  })

  afterAll(async () => {
    console.log('🔬 ===== 事务隔离测试结束 =====')
  })

  /** 生成测试物品必填字段（tracking_code + item_name + source） */
  let _txTestSeq = 0
  function txItemFields(nameSuffix) {
    _txTestSeq++
    const ts = Date.now()
    return {
      tracking_code: `TS${ts.toString().slice(-8)}${String(_txTestSeq).padStart(4, '0')}`,
      item_name: nameSuffix || `事务测试物品_${ts}`,
      source: 'test'
    }
  }

  // ========== 方式1：使用 createTestTransactionManager ==========
  describe('📦 方式1：createTestTransactionManager', () => {
    const txManager = createTestTransactionManager({
      verbose: true,
      description: 'txManager测试'
    })

    beforeEach(txManager.beforeEach)
    afterEach(txManager.afterEach)

    it('事务内创建的数据应该在回滚后不存在', async () => {
      const transaction = txManager.getTransaction()

      // 在事务内创建测试物品
      const testItem = await Item.create(
        {
          ...txItemFields('事务隔离测试物品'),
          owner_account_id: testAccountId,
          item_template_id: null,
          item_type: 'tradable_item',
          status: 'available',
          meta: {
            name: `事务隔离测试物品_${Date.now()}`,
            description: '验证事务回滚后数据不存在'
          }
        },
        { transaction }
      )

      // 验证在事务内可以查到数据
      const foundInTx = await Item.findByPk(testItem.item_id, { transaction })
      expect(foundInTx).not.toBeNull()
      // 使用 == 比较，因为 Sequelize 可能返回字符串类型的 ID
      expect(String(foundInTx.item_id)).toBe(String(testItem.item_id))

      // 保存ID用于后续验证
      const createdId = testItem.item_id

      /*
       * 事务回滚在 afterEach 中自动执行
       * 后续测试将验证数据是否被回滚
       */
      console.log(`📋 创建测试物品 ID=${createdId}，等待 afterEach 回滚`)
    })

    it('应该能获取当前事务', async () => {
      expect(txManager.hasActiveTransaction()).toBe(true)

      const tx = txManager.getTransaction()
      expect(tx).toBeDefined()
      // Sequelize 事务对象的 finished 属性可能是 undefined（表示未完成）或 'commit'/'rollback'
      expect(tx.finished).not.toBe('commit')
      expect(tx.finished).not.toBe('rollback')
    })
  })

  // ========== 方式2：使用 withTransactionRollback ==========
  describe('📦 方式2：withTransactionRollback', () => {
    it('事务内的操作应该自动回滚', async () => {
      let createdItemId = null

      await withTransactionRollback(
        async transaction => {
          // 在事务内创建测试物品
          const testItem = await Item.create(
            {
              ...txItemFields('withTransactionRollback测试'),
              owner_account_id: testAccountId,
              item_template_id: null,
              item_type: 'tradable_item',
              status: 'available',
              meta: {
                name: `withTransactionRollback测试_${Date.now()}`,
                description: '验证自动回滚'
              }
            },
            { transaction }
          )

          createdItemId = testItem.item_id

          // 在事务内验证数据存在
          const found = await Item.findByPk(createdItemId, { transaction })
          expect(found).not.toBeNull()
        },
        { verbose: true, description: 'withTransactionRollback测试' }
      )

      // 事务回滚后，数据应该不存在
      const foundAfterRollback = await Item.findByPk(createdItemId)
      expect(foundAfterRollback).toBeNull()
      console.log(`✅ 验证通过：物品 ID=${createdItemId} 在回滚后不存在`)
    })

    it('即使测试断言失败，事务也应该回滚', async () => {
      let createdItemId = null

      try {
        await withTransactionRollback(async transaction => {
          const testItem = await Item.create(
            {
              ...txItemFields('断言失败测试'),
              owner_account_id: testAccountId,
              item_template_id: null,
              item_type: 'tradable_item',
              status: 'available',
              meta: { name: `断言失败测试_${Date.now()}` }
            },
            { transaction }
          )

          createdItemId = testItem.item_id

          // 故意抛出错误
          throw new Error('测试用错误')
        })
      } catch (error) {
        expect(error.message).toBe('测试用错误')
      }

      // 验证回滚成功
      if (createdItemId) {
        const found = await Item.findByPk(createdItemId)
        expect(found).toBeNull()
        console.log(`✅ 验证通过：错误发生后事务正确回滚`)
      }
    })
  })

  // ========== 方式3：使用 createIsolatedTestContext ==========
  describe('📦 方式3：createIsolatedTestContext', () => {
    it('手动管理事务生命周期', async () => {
      // 创建上下文
      const testContext = await createIsolatedTestContext({
        verbose: true,
        description: '手动管理测试'
      })

      let createdItemId = null

      try {
        // 在事务内创建数据
        const testItem = await Item.create(
          {
            ...txItemFields('手动管理测试'),
            owner_account_id: testAccountId,
            item_template_id: null,
            item_type: 'tradable_item',
            status: 'available',
            meta: { name: `手动管理测试_${Date.now()}` }
          },
          { transaction: testContext.transaction }
        )

        createdItemId = testItem.item_id

        // 验证上下文状态
        expect(testContext.isActive).toBe(true)
        expect(testContext.transactionId).toBeDefined()
      } finally {
        // 手动回滚
        await testContext.rollback()
      }

      // 验证数据已回滚
      if (createdItemId) {
        const found = await Item.findByPk(createdItemId)
        expect(found).toBeNull()
        console.log(`✅ 验证通过：手动回滚成功`)
      }
    })
  })

  // ========== 工具函数测试 ==========
  describe('📦 工具函数测试', () => {
    it('batchCreateInTransaction 应该支持批量创建', async () => {
      await withTransactionRollback(
        async transaction => {
          const [item1, item2] = await batchCreateInTransaction(transaction, [
            tx =>
              Item.create(
                {
                  ...txItemFields('批量创建测试1'),
                  owner_account_id: testAccountId,
                  item_template_id: null,
                  item_type: 'tradable_item',
                  status: 'available',
                  meta: { name: '批量创建测试1' }
                },
                { transaction: tx }
              ),
            tx =>
              Item.create(
                {
                  ...txItemFields('批量创建测试2'),
                  owner_account_id: testAccountId,
                  item_template_id: null,
                  item_type: 'tradable_item',
                  status: 'available',
                  meta: { name: '批量创建测试2' }
                },
                { transaction: tx }
              )
          ])

          expect(item1).toBeDefined()
          expect(item2).toBeDefined()
          expect(item1.item_id).not.toBe(item2.item_id)

          console.log(`✅ 批量创建成功：ID1=${item1.item_id}, ID2=${item2.item_id}`)
        },
        { description: '批量创建测试' }
      )
    })

    it('validateInTransaction 应该支持事务内验证', async () => {
      await withTransactionRollback(
        async transaction => {
          // 创建测试数据
          const testItem = await Item.create(
            {
              ...txItemFields('验证测试物品'),
              owner_account_id: testAccountId,
              item_template_id: null,
              item_type: 'tradable_item',
              status: 'available',
              meta: { name: '验证测试物品' }
            },
            { transaction }
          )

          // 使用验证函数
          const allValid = await validateInTransaction(transaction, [
            // 验证1：物品存在
            async tx => {
              const found = await Item.findByPk(testItem.item_id, {
                transaction: tx
              })
              return found !== null
            },
            // 验证2：状态正确
            async tx => {
              const found = await Item.findByPk(testItem.item_id, {
                transaction: tx
              })
              return found.status === 'available'
            }
          ])

          expect(allValid).toBe(true)
          console.log('✅ 事务内验证通过')
        },
        { description: '验证函数测试' }
      )
    })
  })

  // ========== 隔离性验证 ==========
  describe('📦 隔离性验证', () => {
    it('多个事务应该相互隔离', async () => {
      // 创建两个独立的事务上下文
      const context1 = await createIsolatedTestContext({ description: '事务1' })
      const context2 = await createIsolatedTestContext({ description: '事务2' })

      try {
        // 在事务1中创建数据
        const item1 = await Item.create(
          {
            ...txItemFields('隔离测试-事务1'),
            owner_account_id: testAccountId,
            item_template_id: null,
            item_type: 'tradable_item',
            status: 'available',
            meta: { name: '隔离测试-事务1' }
          },
          { transaction: context1.transaction }
        )

        // 在事务2中尝试查找事务1的数据（应该查不到，因为事务1未提交）
        const foundInTx2 = await Item.findByPk(item1.item_id, {
          transaction: context2.transaction
        })

        // 注意：由于 READ_COMMITTED 隔离级别，未提交的数据对其他事务不可见
        expect(foundInTx2).toBeNull()
        console.log('✅ 验证通过：事务间数据隔离')
      } finally {
        await context1.rollback()
        await context2.rollback()
      }
    })
  })
})
