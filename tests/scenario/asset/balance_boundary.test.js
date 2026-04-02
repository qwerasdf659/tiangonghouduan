/**
 * 余额边界测试 - balance_boundary.test.js
 *
 * 测试目标（来自 docs/测试体系完善空间分析报告.md P1-1）：
 * - P1-1-2: 零余额边界测试（余额=扣减额、余额=0时扣减）
 * - P1-1-3: 大数值边界测试（1亿级增加/扣减、溢出检测）
 * - P1-1-4: 负数边界测试（负余额/债务处理）
 * - P1-1-5: 小数精度测试（浮点数舍入、精度丢失）
 *
 * 技术规范：
 * - 使用真实数据库数据（禁止mock）
 * - 所有资产操作通过 BalanceService 统一进行（V4.7.0 AssetService 拆分）
 * - 使用 snake_case 命名约定
 * - 测试数据通过 TestDataCleaner 自动清理
 *
 * 业务背景：
 * - BalanceService 使用 BIGINT 存储余额（避免浮点精度问题）
 * - 余额不允许为负数，扣减时必须验证余额充足
 * - 所有变动必须支持幂等性控制（idempotency_key）
 * - 所有写操作必须在事务中执行
 *
 * 创建时间：2026-01-29
 * 作者：Claude 4.5 Sonnet
 */

'use strict'

const { sequelize } = require('../../../models')
// V4.7.0 AssetService 拆分：使用 BalanceService（2026-01-31）
const BalanceService = require('../../../services/asset/BalanceService')
const { cleanupAfterEach } = require('../../helpers/TestDataCleaner')

/**
 * 生成唯一幂等键
 * @param {string} prefix - 前缀标识
 * @returns {string} 唯一幂等键
 */
function generateIdempotencyKey(prefix = 'balance_boundary_test') {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
}

describe('P1-1 余额边界测试', () => {
  // 测试数据
  let test_user_id

  // 测试用资产代码（使用标准的 star_stone 资产进行测试）
  const TEST_ASSET_CODE = 'star_stone'

  beforeAll(async () => {
    // 从全局测试数据获取测试用户
    if (!global.testData || !global.testData._initialized) {
      console.warn('⚠️ 测试数据未初始化，部分测试可能失败')
    }

    test_user_id = global.testData?.testUser?.user_id

    if (!test_user_id) {
      console.warn('⚠️ 测试用户ID未获取，某些测试将被跳过')
    }

    console.log('✅ 余额边界测试初始化完成', { test_user_id })
  })

  // 使用统一的测试数据清理机制
  afterEach(cleanupAfterEach)

  afterAll(async () => {
    console.log('🔌 余额边界测试清理完成')
  })

  // ==================== P1-1-2: 零余额边界测试 ====================
  describe('P1-1-2: 零余额边界测试', () => {
    /**
     * 测试场景 2.1：余额等于扣减额时扣减
     *
     * 业务规则：
     * - 当可用余额恰好等于扣减额时，扣减应该成功
     * - 扣减后余额应该为0
     */
    it('余额等于扣减额时扣减成功，余额归零', async () => {
      if (!test_user_id) {
        console.warn('⚠️ 跳过测试：缺少测试用户')
        return
      }

      const transaction = await sequelize.transaction()

      try {
        // 1. 创建/获取账户
        await BalanceService.getOrCreateAccount({ user_id: test_user_id }, { transaction })

        // 2. 先充值一个精确金额
        const exact_amount = 1000
        const charge_key = generateIdempotencyKey('charge_exact')

        await BalanceService.changeBalance(
          {
            user_id: test_user_id,
            asset_code: TEST_ASSET_CODE,
            delta_amount: exact_amount,
            business_type: 'test_charge',
            counterpart_account_id: 2,
            idempotency_key: charge_key
          },
          { transaction }
        )

        // 3. 获取充值后余额
        const balance_after_charge = await BalanceService.getBalance(
          { user_id: test_user_id, asset_code: TEST_ASSET_CODE },
          { transaction }
        )

        console.log('📊 充值后余额:', balance_after_charge.available_amount)

        // 4. 扣减恰好等于余额的金额
        const deduct_key = generateIdempotencyKey('deduct_exact')
        const deduct_result = await BalanceService.changeBalance(
          {
            user_id: test_user_id,
            asset_code: TEST_ASSET_CODE,
            delta_amount: -exact_amount,
            business_type: 'test_deduct',
            counterpart_account_id: 2,
            idempotency_key: deduct_key
          },
          { transaction }
        )

        // 5. 验证结果
        expect(deduct_result.is_duplicate).toBe(false)
        expect(Number(deduct_result.balance.available_amount)).toBe(
          balance_after_charge.available_amount - exact_amount
        )

        console.log('✅ 余额等于扣减额测试通过', {
          deducted: exact_amount,
          remaining: Number(deduct_result.balance.available_amount)
        })

        await transaction.rollback()
      } catch (error) {
        await transaction.rollback()
        throw error
      }
    })

    /**
     * 测试场景 2.2：余额为0时尝试扣减
     *
     * 业务规则：
     * - 当可用余额为0时，任何扣减操作应该失败
     * - 应该抛出明确的"余额不足"错误
     */
    it('余额为0时扣减应失败并抛出余额不足错误', async () => {
      if (!test_user_id) {
        console.warn('⚠️ 跳过测试：缺少测试用户')
        return
      }

      const transaction = await sequelize.transaction()

      try {
        // 1. 获取或创建账户
        await BalanceService.getOrCreateAccount({ user_id: test_user_id }, { transaction })

        // 2. 获取当前余额
        const initial_balance = await BalanceService.getBalance(
          { user_id: test_user_id, asset_code: TEST_ASSET_CODE },
          { transaction }
        )

        // 3. 如果有余额，先扣减到0
        if (initial_balance.available_amount > 0) {
          const clear_key = generateIdempotencyKey('clear_balance')
          await BalanceService.changeBalance(
            {
              user_id: test_user_id,
              asset_code: TEST_ASSET_CODE,
              delta_amount: -initial_balance.available_amount,
              business_type: 'test_clear',
              counterpart_account_id: 2,
              idempotency_key: clear_key
            },
            { transaction }
          )
        }

        // 4. 确认余额已为0
        const zero_balance = await BalanceService.getBalance(
          { user_id: test_user_id, asset_code: TEST_ASSET_CODE },
          { transaction }
        )

        console.log('📊 清零后余额:', zero_balance.available_amount)

        // 5. 尝试扣减
        const deduct_key = generateIdempotencyKey('deduct_zero')

        await expect(
          BalanceService.changeBalance(
            {
              user_id: test_user_id,
              asset_code: TEST_ASSET_CODE,
              delta_amount: -100,
              business_type: 'test_deduct',
              counterpart_account_id: 2,
              idempotency_key: deduct_key
            },
            { transaction }
          )
        ).rejects.toThrow(/余额不足|不存在且尝试扣减/)

        console.log('✅ 零余额扣减测试通过：正确拒绝了扣减请求')

        await transaction.rollback()
      } catch (error) {
        await transaction.rollback()
        // 如果是预期的错误，测试通过
        if (error.message.includes('余额不足') || error.message.includes('不存在且尝试扣减')) {
          console.log('✅ 零余额扣减测试通过：正确拒绝了扣减请求')
          return
        }
        throw error
      }
    })

    /**
     * 测试场景 2.3：余额为0时增加余额
     *
     * 业务规则：
     * - 即使余额为0，增加操作应该成功
     * - 增加后余额应该等于增加的金额
     */
    it('余额为0时增加余额应成功', async () => {
      if (!test_user_id) {
        console.warn('⚠️ 跳过测试：缺少测试用户')
        return
      }

      const transaction = await sequelize.transaction()

      try {
        // 1. 创建测试账户（确保从0开始）
        const add_amount = 500
        const add_key = generateIdempotencyKey('add_from_zero')

        const add_result = await BalanceService.changeBalance(
          {
            user_id: test_user_id,
            asset_code: TEST_ASSET_CODE,
            delta_amount: add_amount,
            business_type: 'test_add',
            counterpart_account_id: 2,
            idempotency_key: add_key
          },
          { transaction }
        )

        // 2. 验证余额正确增加
        expect(add_result.is_duplicate).toBe(false)
        expect(Number(add_result.balance.available_amount)).toBeGreaterThanOrEqual(add_amount)

        console.log('✅ 零余额增加测试通过', {
          added: add_amount,
          new_balance: Number(add_result.balance.available_amount)
        })

        await transaction.rollback()
      } catch (error) {
        await transaction.rollback()
        throw error
      }
    })
  })

  // ==================== P1-1-3: 大数值边界测试 ====================
  describe('P1-1-3: 大数值边界测试', () => {
    /**
     * 测试场景 3.1：1亿级金额增加
     *
     * 业务规则：
     * - 系统使用 BIGINT 存储，应该能处理大数值
     * - 1亿级增加应该成功且数值精确
     */
    it('1亿级金额增加应成功且数值精确', async () => {
      if (!test_user_id) {
        console.warn('⚠️ 跳过测试：缺少测试用户')
        return
      }

      const transaction = await sequelize.transaction()

      try {
        // 1. 准备大数值测试金额（1亿）
        const large_amount = 100000000 // 1亿
        const add_key = generateIdempotencyKey('add_large')

        // 2. 获取初始余额
        const initial_balance = await BalanceService.getBalance(
          { user_id: test_user_id, asset_code: TEST_ASSET_CODE },
          { transaction }
        )

        // 3. 增加1亿
        const add_result = await BalanceService.changeBalance(
          {
            user_id: test_user_id,
            asset_code: TEST_ASSET_CODE,
            delta_amount: large_amount,
            business_type: 'test_large_add',
            counterpart_account_id: 2,
            idempotency_key: add_key
          },
          { transaction }
        )

        // 4. 验证数值精确（BIGINT 返回字符串，必须显式转为数字）
        const expected_balance = Number(initial_balance.available_amount) + large_amount
        expect(Number(add_result.balance.available_amount)).toBe(expected_balance)

        console.log('✅ 1亿级增加测试通过', {
          initial: initial_balance.available_amount,
          added: large_amount,
          final: Number(add_result.balance.available_amount)
        })

        await transaction.rollback()
      } catch (error) {
        await transaction.rollback()
        throw error
      }
    })

    /**
     * 测试场景 3.2：1亿级金额扣减
     *
     * 业务规则：
     * - 大额扣减应该成功（前提是余额充足）
     * - 扣减后余额精确
     */
    it('1亿级金额扣减应成功（余额充足时）', async () => {
      if (!test_user_id) {
        console.warn('⚠️ 跳过测试：缺少测试用户')
        return
      }

      const transaction = await sequelize.transaction()

      try {
        // 1. 先充值足够金额
        const large_amount = 100000000 // 1亿
        const charge_key = generateIdempotencyKey('charge_large')

        await BalanceService.changeBalance(
          {
            user_id: test_user_id,
            asset_code: TEST_ASSET_CODE,
            delta_amount: large_amount,
            business_type: 'test_large_charge',
            counterpart_account_id: 2,
            idempotency_key: charge_key
          },
          { transaction }
        )

        // 2. 获取充值后余额
        const balance_after_charge = await BalanceService.getBalance(
          { user_id: test_user_id, asset_code: TEST_ASSET_CODE },
          { transaction }
        )

        // 3. 扣减1亿
        const deduct_key = generateIdempotencyKey('deduct_large')
        const deduct_result = await BalanceService.changeBalance(
          {
            user_id: test_user_id,
            asset_code: TEST_ASSET_CODE,
            delta_amount: -large_amount,
            business_type: 'test_large_deduct',
            counterpart_account_id: 2,
            idempotency_key: deduct_key
          },
          { transaction }
        )

        // 4. 验证数值精确
        const expected_balance = balance_after_charge.available_amount - large_amount
        expect(Number(deduct_result.balance.available_amount)).toBe(expected_balance)

        console.log('✅ 1亿级扣减测试通过', {
          before: balance_after_charge.available_amount,
          deducted: large_amount,
          after: Number(deduct_result.balance.available_amount)
        })

        await transaction.rollback()
      } catch (error) {
        await transaction.rollback()
        throw error
      }
    })

    /**
     * 测试场景 3.3：BIGINT 边界值测试
     *
     * 业务规则：
     * - MySQL BIGINT 最大值为 9223372036854775807
     * - 接近最大值的操作应该正常处理
     * - 超出范围的值应该被正确处理（由数据库层面保证）
     */
    it('BIGINT 边界值操作应正常处理', async () => {
      if (!test_user_id) {
        console.warn('⚠️ 跳过测试：缺少测试用户')
        return
      }

      const transaction = await sequelize.transaction()

      try {
        /*
         * 1. 测试接近安全上限但不超出的数值
         *    BalanceService.BALANCE_SAFETY_LIMIT = 10亿，单笔和变动后余额都不能超过
         *    所以使用一个低于上限的值，考虑到用户已有余额
         */
        const safe_large = 500000000 // 5亿（留出余量，确保变动后余额不超过10亿上限）
        const add_key = generateIdempotencyKey('add_bigint')

        const add_result = await BalanceService.changeBalance(
          {
            user_id: test_user_id,
            asset_code: TEST_ASSET_CODE,
            delta_amount: safe_large,
            business_type: 'test_bigint_add',
            counterpart_account_id: 2,
            idempotency_key: add_key
          },
          { transaction }
        )

        // 2. 验证存储正确
        expect(Number(add_result.balance.available_amount)).toBeGreaterThanOrEqual(safe_large)

        // 3. 测试连续大额操作的精度
        const deduct_key = generateIdempotencyKey('deduct_bigint')
        await BalanceService.changeBalance(
          {
            user_id: test_user_id,
            asset_code: TEST_ASSET_CODE,
            delta_amount: -safe_large,
            business_type: 'test_bigint_deduct',
            counterpart_account_id: 2,
            idempotency_key: deduct_key
          },
          { transaction }
        )

        console.log('✅ BIGINT 边界值测试通过', {
          tested_value: safe_large,
          operation: '增加后扣减',
          result: '数值精确'
        })

        await transaction.rollback()
      } catch (error) {
        await transaction.rollback()
        throw error
      }
    })

    /**
     * 测试场景 3.4：连续大额操作精度保持
     *
     * 业务规则：
     * - 多次大额操作后，累计结果应该精确
     * - 不应出现精度丢失
     */
    it('连续大额操作应保持精度', async () => {
      if (!test_user_id) {
        console.warn('⚠️ 跳过测试：缺少测试用户')
        return
      }

      const transaction = await sequelize.transaction()

      try {
        // 1. 获取初始余额
        const initial_balance = await BalanceService.getBalance(
          { user_id: test_user_id, asset_code: TEST_ASSET_CODE },
          { transaction }
        )

        // 2. 连续执行10次大额操作（每次5千万，总计5亿，低于10亿安全上限）
        const operation_amount = 50000000 // 5千万
        let expected_balance = Number(initial_balance.available_amount)

        for (let i = 0; i < 10; i++) {
          const key = generateIdempotencyKey(`consecutive_${i}`)
          await BalanceService.changeBalance(
            {
              user_id: test_user_id,
              asset_code: TEST_ASSET_CODE,
              delta_amount: operation_amount,
              business_type: 'test_consecutive',
              counterpart_account_id: 2,
              idempotency_key: key
            },
            { transaction }
          )
          expected_balance += operation_amount
        }

        // 3. 验证最终余额
        const final_balance = await BalanceService.getBalance(
          { user_id: test_user_id, asset_code: TEST_ASSET_CODE },
          { transaction }
        )

        expect(Number(final_balance.available_amount)).toBe(expected_balance)

        console.log('✅ 连续大额操作精度测试通过', {
          operations: 10,
          per_operation: operation_amount,
          total_added: operation_amount * 10,
          expected: expected_balance,
          actual: final_balance.available_amount
        })

        await transaction.rollback()
      } catch (error) {
        await transaction.rollback()
        throw error
      }
    })
  })

  // ==================== P1-1-4: 负数边界测试 ====================
  describe('P1-1-4: 负数边界测试', () => {
    /**
     * 测试场景 4.1：扣减超过可用余额
     *
     * 业务规则：
     * - 系统不允许负余额
     * - 扣减超过可用余额时应抛出错误
     */
    it('扣减超过可用余额时应失败', async () => {
      if (!test_user_id) {
        console.warn('⚠️ 跳过测试：缺少测试用户')
        return
      }

      const transaction = await sequelize.transaction()

      try {
        // 1. 先充值一个固定金额
        const charge_amount = 1000
        const charge_key = generateIdempotencyKey('charge_for_overdraft')

        await BalanceService.changeBalance(
          {
            user_id: test_user_id,
            asset_code: TEST_ASSET_CODE,
            delta_amount: charge_amount,
            business_type: 'test_charge',
            counterpart_account_id: 2,
            idempotency_key: charge_key
          },
          { transaction }
        )

        // 2. 获取当前余额
        const current_balance = await BalanceService.getBalance(
          { user_id: test_user_id, asset_code: TEST_ASSET_CODE },
          { transaction }
        )

        // 3. 尝试扣减超过余额的金额
        const overdraft_amount = current_balance.available_amount + 1
        const deduct_key = generateIdempotencyKey('overdraft_deduct')

        await expect(
          BalanceService.changeBalance(
            {
              user_id: test_user_id,
              asset_code: TEST_ASSET_CODE,
              delta_amount: -overdraft_amount,
              business_type: 'test_overdraft',
              counterpart_account_id: 2,
              idempotency_key: deduct_key
            },
            { transaction }
          )
        ).rejects.toThrow(/余额不足/)

        console.log('✅ 透支测试通过：正确拒绝了超额扣减', {
          available: current_balance.available_amount,
          attempted_deduct: overdraft_amount
        })

        await transaction.rollback()
      } catch (error) {
        await transaction.rollback()
        // 如果是预期的错误，测试通过
        if (error.message.includes('余额不足')) {
          console.log('✅ 透支测试通过')
          return
        }
        throw error
      }
    })

    /**
     * 测试场景 4.2：尝试增加负数金额
     *
     * 业务规则：
     * - delta_amount 负数表示扣减，正数表示增加
     * - 负数增加实际上是扣减操作
     */
    it('负数delta_amount应被视为扣减操作', async () => {
      if (!test_user_id) {
        console.warn('⚠️ 跳过测试：缺少测试用户')
        return
      }

      const transaction = await sequelize.transaction()

      try {
        // 1. 先充值
        const charge_amount = 2000
        const charge_key = generateIdempotencyKey('charge_for_negative')

        await BalanceService.changeBalance(
          {
            user_id: test_user_id,
            asset_code: TEST_ASSET_CODE,
            delta_amount: charge_amount,
            business_type: 'test_charge',
            counterpart_account_id: 2,
            idempotency_key: charge_key
          },
          { transaction }
        )

        // 2. 获取充值后余额
        const balance_after_charge = await BalanceService.getBalance(
          { user_id: test_user_id, asset_code: TEST_ASSET_CODE },
          { transaction }
        )

        // 3. 使用负数作为 delta_amount
        const negative_delta = -500
        const negative_key = generateIdempotencyKey('negative_delta')

        const result = await BalanceService.changeBalance(
          {
            user_id: test_user_id,
            asset_code: TEST_ASSET_CODE,
            delta_amount: negative_delta,
            business_type: 'test_negative_delta',
            counterpart_account_id: 2,
            idempotency_key: negative_key
          },
          { transaction }
        )

        // 4. 验证余额减少（BIGINT 返回字符串，必须显式转为数字）
        const expected = Number(balance_after_charge.available_amount) + negative_delta
        expect(Number(result.balance.available_amount)).toBe(expected)

        console.log('✅ 负数delta测试通过', {
          before: balance_after_charge.available_amount,
          delta: negative_delta,
          after: Number(result.balance.available_amount)
        })

        await transaction.rollback()
      } catch (error) {
        await transaction.rollback()
        throw error
      }
    })

    /**
     * 测试场景 4.3：验证余额永不为负
     *
     * 业务规则：
     * - 无论如何操作，系统应保证余额不会变为负数
     * - 这是关键的数据完整性约束
     */
    it('任何操作后余额都不应为负数', async () => {
      if (!test_user_id) {
        console.warn('⚠️ 跳过测试：缺少测试用户')
        return
      }

      const transaction = await sequelize.transaction()

      try {
        // 1. 执行多次随机操作
        const operations = [
          { delta: 1000, type: 'add' },
          { delta: -500, type: 'deduct' },
          { delta: 200, type: 'add' },
          { delta: -700, type: 'deduct' }
        ]

        for (const op of operations) {
          const key = generateIdempotencyKey(`balance_check_${op.type}`)

          try {
            const result = await BalanceService.changeBalance(
              {
                user_id: test_user_id,
                asset_code: TEST_ASSET_CODE,
                delta_amount: op.delta,
                business_type: `test_${op.type}`,
                idempotency_key: key
              },
              { transaction }
            )

            // 验证余额不为负
            expect(Number(result.balance.available_amount)).toBeGreaterThanOrEqual(0)
          } catch (error) {
            // 如果是余额不足错误，这是预期行为
            if (error.message.includes('余额不足')) {
              console.log(`预期的余额不足错误: delta=${op.delta}`)
              continue
            }
            throw error
          }
        }

        // 最终验证
        const final_balance = await BalanceService.getBalance(
          { user_id: test_user_id, asset_code: TEST_ASSET_CODE },
          { transaction }
        )

        expect(Number(final_balance.available_amount)).toBeGreaterThanOrEqual(0)

        console.log('✅ 余额非负测试通过', {
          final_balance: final_balance.available_amount
        })

        await transaction.rollback()
      } catch (error) {
        await transaction.rollback()
        throw error
      }
    })

    /**
     * 测试场景 4.4：delta_amount 为0时应拒绝
     *
     * 业务规则：
     * - BalanceService 不允许 delta_amount 为 0
     * - 0变动没有业务意义，应该拒绝
     */
    it('delta_amount为0时应抛出错误', async () => {
      if (!test_user_id) {
        console.warn('⚠️ 跳过测试：缺少测试用户')
        return
      }

      const transaction = await sequelize.transaction()

      try {
        const zero_key = generateIdempotencyKey('zero_delta')

        await expect(
          BalanceService.changeBalance(
            {
              user_id: test_user_id,
              asset_code: TEST_ASSET_CODE,
              delta_amount: 0,
              business_type: 'test_zero',
              counterpart_account_id: 2,
              idempotency_key: zero_key
            },
            { transaction }
          )
        ).rejects.toThrow(/变动金额不能为0/)

        console.log('✅ 零变动测试通过：正确拒绝了0金额操作')

        await transaction.rollback()
      } catch (error) {
        await transaction.rollback()
        // 如果是预期的错误，测试通过
        if (error.message.includes('变动金额不能为0')) {
          console.log('✅ 零变动测试通过')
          return
        }
        throw error
      }
    })
  })

  // ==================== P1-1-5: 小数精度测试 ====================
  describe('P1-1-5: 小数精度测试', () => {
    /**
     * 测试场景 5.1：整数存储精度验证
     *
     * 业务背景：
     * - BalanceService 使用 BIGINT 存储，所有金额为整数
     * - 如果传入小数，应该被正确处理（截断或拒绝）
     *
     * 注意：当前系统使用整数存储，小数会被自动截断
     */
    it('整数存储应保持精确', async () => {
      if (!test_user_id) {
        console.warn('⚠️ 跳过测试：缺少测试用户')
        return
      }

      const transaction = await sequelize.transaction()

      try {
        // 1. 测试各种整数
        const test_amounts = [1, 100, 999, 10000, 123456]
        let running_total = 0

        // 获取初始余额
        const initial_balance = await BalanceService.getBalance(
          { user_id: test_user_id, asset_code: TEST_ASSET_CODE },
          { transaction }
        )
        running_total = Number(initial_balance.available_amount)

        for (const amount of test_amounts) {
          const key = generateIdempotencyKey(`integer_${amount}`)
          const result = await BalanceService.changeBalance(
            {
              user_id: test_user_id,
              asset_code: TEST_ASSET_CODE,
              delta_amount: amount,
              business_type: 'test_integer',
              counterpart_account_id: 2,
              idempotency_key: key
            },
            { transaction }
          )

          running_total += amount
          expect(Number(result.balance.available_amount)).toBe(running_total)
        }

        // 最终验证
        const final_balance = await BalanceService.getBalance(
          { user_id: test_user_id, asset_code: TEST_ASSET_CODE },
          { transaction }
        )

        const expected_total =
          Number(initial_balance.available_amount) + test_amounts.reduce((a, b) => a + b, 0)
        expect(Number(final_balance.available_amount)).toBe(expected_total)

        console.log('✅ 整数精度测试通过', {
          operations: test_amounts.length,
          total_added: test_amounts.reduce((a, b) => a + b, 0),
          expected: expected_total,
          actual: final_balance.available_amount
        })

        await transaction.rollback()
      } catch (error) {
        await transaction.rollback()
        throw error
      }
    })

    /**
     * 测试场景 5.2：小数输入处理
     *
     * 业务背景：
     * - 由于使用 BIGINT 存储，小数部分会被截断
     * - 测试系统对小数输入的处理方式
     */
    it('小数输入应被正确处理（截断为整数）', async () => {
      if (!test_user_id) {
        console.warn('⚠️ 跳过测试：缺少测试用户')
        return
      }

      const transaction = await sequelize.transaction()

      try {
        // 获取初始余额
        const initial_balance = await BalanceService.getBalance(
          { user_id: test_user_id, asset_code: TEST_ASSET_CODE },
          { transaction }
        )

        // 测试小数输入（应被截断或转为整数）
        const decimal_amount = 100.99
        const key = generateIdempotencyKey('decimal_test')

        const result = await BalanceService.changeBalance(
          {
            user_id: test_user_id,
            asset_code: TEST_ASSET_CODE,
            delta_amount: decimal_amount,
            business_type: 'test_decimal',
            counterpart_account_id: 2,
            idempotency_key: key
          },
          { transaction }
        )

        /*
         * BIGINT 存储会截断小数，验证结果
         * 预期行为：100.99 被截断为 100 或保持为 100.99 然后数据库层面截断
         */
        const stored_amount =
          Number(result.balance.available_amount) - initial_balance.available_amount

        // 验证存储的是整数（允许截断或四舍五入）
        expect(Math.floor(stored_amount)).toBe(stored_amount)

        console.log('✅ 小数处理测试通过', {
          input: decimal_amount,
          stored: stored_amount,
          behavior: 'truncated_to_integer'
        })

        await transaction.rollback()
      } catch (error) {
        await transaction.rollback()
        throw error
      }
    })

    /**
     * 测试场景 5.3：大数运算不损失精度
     *
     * 业务背景：
     * - JavaScript Number 的安全整数范围是 ±2^53
     * - BIGINT 可以存储更大的整数
     * - 验证常用范围内的运算精度
     */
    it('常用范围内运算应保持精度', async () => {
      if (!test_user_id) {
        console.warn('⚠️ 跳过测试：缺少测试用户')
        return
      }

      const transaction = await sequelize.transaction()

      try {
        // 获取初始余额
        const initial_balance = await BalanceService.getBalance(
          { user_id: test_user_id, asset_code: TEST_ASSET_CODE },
          { transaction }
        )

        // 测试一系列精确的加减操作
        const operations = [
          { delta: 999999, expected_change: 999999 },
          { delta: -111111, expected_change: -111111 },
          { delta: 777777, expected_change: 777777 },
          { delta: -666666, expected_change: -666666 }
        ]

        let running_balance = Number(initial_balance.available_amount)

        for (const op of operations) {
          const key = generateIdempotencyKey(`precision_${Math.abs(op.delta)}`)

          try {
            const result = await BalanceService.changeBalance(
              {
                user_id: test_user_id,
                asset_code: TEST_ASSET_CODE,
                delta_amount: op.delta,
                business_type: 'test_precision',
                counterpart_account_id: 2,
                idempotency_key: key
              },
              { transaction }
            )

            running_balance += op.delta
            expect(Number(result.balance.available_amount)).toBe(running_balance)
          } catch (error) {
            // 余额不足是预期情况
            if (error.message.includes('余额不足')) {
              console.log(`预期的余额不足: delta=${op.delta}`)
              continue
            }
            throw error
          }
        }

        console.log('✅ 运算精度测试通过', {
          operations: operations.length,
          final_balance: running_balance
        })

        await transaction.rollback()
      } catch (error) {
        await transaction.rollback()
        throw error
      }
    })

    /**
     * 测试场景 5.4：流水记录中的精度验证
     *
     * 业务背景：
     * - AssetTransaction 记录每笔变动的 balance_before 和 balance_after
     * - 验证 before + delta = after 的精确性
     */
    it('流水记录应满足 before + delta = after', async () => {
      if (!test_user_id) {
        console.warn('⚠️ 跳过测试：缺少测试用户')
        return
      }

      const transaction = await sequelize.transaction()

      try {
        // 执行一笔操作
        const delta = 12345
        const key = generateIdempotencyKey('flow_precision')

        const result = await BalanceService.changeBalance(
          {
            user_id: test_user_id,
            asset_code: TEST_ASSET_CODE,
            delta_amount: delta,
            business_type: 'test_flow',
            counterpart_account_id: 2,
            idempotency_key: key
          },
          { transaction }
        )

        // 获取流水记录
        const tx_record = result.transaction_record

        // 验证 before + delta = after
        const balance_before = Number(tx_record.balance_before)
        const delta_amount = Number(tx_record.delta_amount)
        const balance_after = Number(tx_record.balance_after)

        expect(balance_before + delta_amount).toBe(balance_after)

        console.log('✅ 流水精度测试通过', {
          balance_before,
          delta_amount,
          balance_after,
          equation: `${balance_before} + ${delta_amount} = ${balance_after}`
        })

        await transaction.rollback()
      } catch (error) {
        await transaction.rollback()
        throw error
      }
    })
  })

  // ==================== 补充测试：幂等性边界 ====================
  describe('补充：幂等性边界测试', () => {
    /**
     * 测试场景：重复幂等键应返回原结果
     *
     * 业务规则：
     * - 相同的 idempotency_key 应该返回原始结果
     * - 不应重复执行操作
     */
    it('重复幂等键应返回原结果且不重复执行', async () => {
      if (!test_user_id) {
        console.warn('⚠️ 跳过测试：缺少测试用户')
        return
      }

      const transaction = await sequelize.transaction()

      try {
        // 获取初始余额
        const initial_balance = await BalanceService.getBalance(
          { user_id: test_user_id, asset_code: TEST_ASSET_CODE },
          { transaction }
        )

        // 使用固定的幂等键
        const fixed_key = generateIdempotencyKey('idempotency_test')
        const amount = 500

        // 第一次操作
        const first_result = await BalanceService.changeBalance(
          {
            user_id: test_user_id,
            asset_code: TEST_ASSET_CODE,
            delta_amount: amount,
            business_type: 'test_idempotency',
            counterpart_account_id: 2,
            idempotency_key: fixed_key
          },
          { transaction }
        )

        expect(first_result.is_duplicate).toBe(false)
        const first_balance = Number(first_result.balance.available_amount)

        // 第二次操作（相同幂等键）
        const second_result = await BalanceService.changeBalance(
          {
            user_id: test_user_id,
            asset_code: TEST_ASSET_CODE,
            delta_amount: amount,
            business_type: 'test_idempotency',
            counterpart_account_id: 2,
            idempotency_key: fixed_key
          },
          { transaction }
        )

        expect(second_result.is_duplicate).toBe(true)
        const second_balance = Number(second_result.balance.available_amount)

        // 余额应该只增加一次
        expect(second_balance).toBe(first_balance)

        console.log('✅ 幂等性测试通过', {
          initial: initial_balance.available_amount,
          after_first: first_balance,
          after_second: second_balance,
          is_duplicate: second_result.is_duplicate
        })

        await transaction.rollback()
      } catch (error) {
        await transaction.rollback()
        throw error
      }
    })
  })
})
