/**
 * 餐厅积分抽奖系统 V4 - BalanceService 单元测试（原 BalanceService 余额部分）
 *
 * 测试范围：
 * - P0-1-2: getOrCreateAccount - 账户获取/创建（用户账户、系统账户、参数校验）
 * - P0-1-3: getOrCreateBalance - 余额获取（points、star_stone、red_core_shard）
 * - P0-1-4: getBalance - 余额查询（可用/冻结/总计）
 * - P0-1-5: changeBalance - 增加余额测试（正常增加、大额增加、幂等检查）
 *
 * 创建时间：2026-01-29
 * 更新时间：2026-01-31（V4.7.0 BalanceService 拆分）
 * 技术栈：Jest + Sequelize + MySQL (真实数据库)
 *
 * 测试规范：
 * - 服务通过 global.getTestService('asset_balance') 获取（J2-RepoWide 规范）
 * - 使用 snake_case service key（E2-Strict 规范）
 * - 所有写操作必须在事务内执行（TransactionManager 规范）
 * - 测试数据通过 global.testData 动态获取，不硬编码
 * - 测试完成后清理测试产生的数据
 *
 * 返回结构说明：
 * - getBalance 返回: { available_amount, frozen_amount, total_amount, lottery_campaign_id }
 * - changeBalance 返回: { account, balance, transaction_record, is_duplicate }
 */

'use strict'

const { sequelize, Account, AccountAssetBalance, AssetTransaction, User } = require('../../models')
const TransactionManager = require('../../utils/TransactionManager')

/**
 * 🔴 P1-9：通过 ServiceManager 获取服务（替代直接 require）
 * 注意：在 beforeAll 中获取服务，确保 ServiceManager 已初始化
 * V4.7.0 BalanceService 拆分：使用 BalanceService 替代原 BalanceService（2026-01-31）
 */
let BalanceService

// 测试超时配置（30秒）
jest.setTimeout(30000)

describe('BalanceService - 资产余额服务核心功能测试', () => {
  // 测试数据
  let test_user_id
  let test_user

  // 测试过程中创建的数据（用于清理）
  const created_accounts = []
  const created_balances = []
  const created_transactions = []

  /**
   * 生成唯一的幂等键
   * @param {string} prefix - 前缀
   * @returns {string} 幂等键
   */
  const generateIdempotencyKey = prefix => {
    return `${prefix}_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`
  }

  // ==================== 测试生命周期 ====================

  beforeAll(async () => {
    // 连接测试数据库
    await sequelize.authenticate()
    console.log('✅ 数据库连接成功')

    /*
     * 🔴 P1-9：通过 ServiceManager 获取服务实例（snake_case key）
     * V4.7.0 BalanceService 拆分：使用 asset_balance key（2026-01-31）
     */
    BalanceService = global.getTestService('asset_balance')

    if (!BalanceService) {
      throw new Error('BalanceService 未注册到 ServiceManager，请检查 jest.setup.js 配置')
    }

    // 获取测试用户 ID（从 global.testData 动态获取）
    if (global.testData && global.testData.testUser && global.testData.testUser.user_id) {
      test_user_id = global.testData.testUser.user_id
      console.log(`✅ 使用动态测试用户: user_id=${test_user_id}`)
    } else {
      // 回退方案：从数据库查询测试用户
      test_user = await User.findOne({
        where: { mobile: '13612227930', status: 'active' }
      })

      if (!test_user) {
        throw new Error('测试用户不存在，请先创建 mobile=13612227930 的用户')
      }

      test_user_id = test_user.user_id
      console.log(`✅ 从数据库获取测试用户: user_id=${test_user_id}`)
    }
  })

  afterEach(async () => {
    /*
     * 每个测试后清理创建的测试数据
     * 注意：按依赖顺序清理（先删除流水，再删除余额，最后删除账户）
     */

    // 清理流水记录
    for (const transaction_id of created_transactions) {
      try {
        await AssetTransaction.destroy({
          where: { asset_transaction_id: transaction_id },
          force: true
        })
      } catch (error) {
        // 忽略清理错误
      }
    }
    created_transactions.length = 0

    // 清理余额记录
    for (const balance_id of created_balances) {
      try {
        await AccountAssetBalance.destroy({ where: { balance_id }, force: true })
      } catch (error) {
        // 忽略清理错误
      }
    }
    created_balances.length = 0

    // 清理账户记录（仅清理测试创建的临时账户，不清理测试用户的主账户）
    for (const account_id of created_accounts) {
      try {
        await Account.destroy({ where: { account_id }, force: true })
      } catch (error) {
        // 忽略清理错误
      }
    }
    created_accounts.length = 0
  })

  afterAll(async () => {
    // 关闭数据库连接
    await sequelize.close()
    console.log('✅ 数据库连接已关闭')
  })

  // ==================== P0-1-2: getOrCreateAccount 测试 ====================

  describe('getOrCreateAccount - 账户获取/创建', () => {
    describe('用户账户场景', () => {
      it('应该为用户创建新账户（首次获取）', async () => {
        // 准备：使用事务确保原子性
        const result = await TransactionManager.execute(async transaction => {
          // 执行：获取或创建用户账户
          const account = await BalanceService.getOrCreateAccount(
            { user_id: test_user_id },
            { transaction }
          )

          return account
        })

        // 验证：账户存在且关联正确
        expect(result).toBeDefined()
        expect(result.account_id).toBeDefined()
        expect(result.account_type).toBe('user')
        expect(result.user_id).toBe(test_user_id)
        expect(result.status).toBe('active')
      })

      it('应该返回已存在的用户账户（幂等性）', async () => {
        // 准备：先获取一次账户
        const first_account = await TransactionManager.execute(async transaction => {
          return await BalanceService.getOrCreateAccount({ user_id: test_user_id }, { transaction })
        })

        // 执行：再次获取相同用户的账户
        const second_account = await TransactionManager.execute(async transaction => {
          return await BalanceService.getOrCreateAccount({ user_id: test_user_id }, { transaction })
        })

        // 验证：两次获取的账户 ID 相同（幂等性）
        expect(second_account.account_id).toBe(first_account.account_id)
        expect(second_account.user_id).toBe(first_account.user_id)
      })

      it('不同用户应该获得不同的账户', async () => {
        // 准备：查找另一个测试用户
        const another_user = await User.findOne({
          where: { status: 'active' },
          order: [['user_id', 'DESC']]
        })

        if (!another_user || another_user.user_id === test_user_id) {
          console.log('⚠️ 跳过测试：未找到第二个测试用户')
          return
        }

        // 执行：分别获取两个用户的账户
        const [account_1, account_2] = await Promise.all([
          TransactionManager.execute(async transaction => {
            return await BalanceService.getOrCreateAccount(
              { user_id: test_user_id },
              { transaction }
            )
          }),
          TransactionManager.execute(async transaction => {
            return await BalanceService.getOrCreateAccount(
              { user_id: another_user.user_id },
              { transaction }
            )
          })
        ])

        // 验证：两个账户 ID 不同
        expect(account_1.account_id).not.toBe(account_2.account_id)
        expect(account_1.user_id).toBe(test_user_id)
        expect(account_2.user_id).toBe(another_user.user_id)
      })
    })

    describe('系统账户场景', () => {
      it('应该获取平台手续费系统账户（SYSTEM_PLATFORM_FEE）', async () => {
        // 执行：获取系统账户
        const result = await TransactionManager.execute(async transaction => {
          return await BalanceService.getOrCreateAccount(
            { system_code: 'SYSTEM_PLATFORM_FEE' },
            { transaction }
          )
        })

        // 验证：系统账户存在且类型正确
        expect(result).toBeDefined()
        expect(result.account_id).toBeDefined()
        expect(result.account_type).toBe('system')
        expect(result.system_code).toBe('SYSTEM_PLATFORM_FEE')
        expect(result.user_id).toBeNull()
      })

      it('应该获取系统发放账户（SYSTEM_MINT）', async () => {
        // 执行：获取系统发放账户
        const result = await TransactionManager.execute(async transaction => {
          return await BalanceService.getOrCreateAccount(
            { system_code: 'SYSTEM_MINT' },
            { transaction }
          )
        })

        // 验证
        expect(result).toBeDefined()
        expect(result.account_type).toBe('system')
        expect(result.system_code).toBe('SYSTEM_MINT')
      })
    })

    describe('参数校验', () => {
      it('应该拒绝空参数调用', async () => {
        // 执行并验证：没有 user_id 和 system_code 应该抛出错误
        await expect(
          TransactionManager.execute(async transaction => {
            return await BalanceService.getOrCreateAccount({}, { transaction })
          })
        ).rejects.toThrow('user_id 或 system_code 必须提供其中之一')
      })

      it('同时提供 user_id 和 system_code 应抛出错误', async () => {
        // 执行并验证：同时传入 user_id 和 system_code 应该抛出错误
        await expect(
          TransactionManager.execute(async transaction => {
            return await BalanceService.getOrCreateAccount(
              { user_id: test_user_id, system_code: 'SYSTEM_PLATFORM_FEE' },
              { transaction }
            )
          })
        ).rejects.toThrow('user_id 和 system_code 不能同时提供')
      })
    })
  })

  // ==================== P0-1-3: getOrCreateBalance 测试 ====================

  describe('getOrCreateBalance - 余额获取/创建', () => {
    let test_account_id

    beforeEach(async () => {
      // 获取测试账户 ID
      const account = await TransactionManager.execute(async transaction => {
        return await BalanceService.getOrCreateAccount({ user_id: test_user_id }, { transaction })
      })
      test_account_id = account.account_id
    })

    describe('不同资产类型', () => {
      it('应该为 points 资产创建余额记录', async () => {
        // 执行：getOrCreateBalance(account_id, asset_code, options) 非对象形式
        const result = await TransactionManager.execute(async transaction => {
          return await BalanceService.getOrCreateBalance(test_account_id, 'points', { transaction })
        })

        // 验证
        expect(result).toBeDefined()
        expect(result.balance_id).toBeDefined()
        expect(result.account_id).toBe(test_account_id)
        expect(result.asset_code).toBe('points')
        expect(Number(result.available_amount)).toBeGreaterThanOrEqual(0)
        expect(Number(result.frozen_amount)).toBeGreaterThanOrEqual(0)
      })

      it('应该为 star_stone 资产创建余额记录', async () => {
        // 执行
        const result = await TransactionManager.execute(async transaction => {
          return await BalanceService.getOrCreateBalance(test_account_id, 'star_stone', {
            transaction
          })
        })

        // 验证
        expect(result).toBeDefined()
        expect(result.asset_code).toBe('star_stone')
        expect(Number(result.available_amount)).toBeGreaterThanOrEqual(0)
      })

      it('应该为 red_core_shard 材料资产创建余额记录', async () => {
        // 执行
        const result = await TransactionManager.execute(async transaction => {
          return await BalanceService.getOrCreateBalance(test_account_id, 'red_core_shard', {
            transaction
          })
        })

        // 验证
        expect(result).toBeDefined()
        expect(result.asset_code).toBe('red_core_shard')
      })
    })

    describe('幂等性验证', () => {
      it('相同账户和资产类型应返回相同余额记录', async () => {
        // 执行：两次获取相同余额
        const first_balance = await TransactionManager.execute(async transaction => {
          return await BalanceService.getOrCreateBalance(test_account_id, 'points', { transaction })
        })

        const second_balance = await TransactionManager.execute(async transaction => {
          return await BalanceService.getOrCreateBalance(test_account_id, 'points', { transaction })
        })

        // 验证：balance_id 相同
        expect(second_balance.balance_id).toBe(first_balance.balance_id)
      })

      it('相同账户不同资产类型应返回不同余额记录', async () => {
        // 执行：获取两种不同资产的余额
        const points_balance = await TransactionManager.execute(async transaction => {
          return await BalanceService.getOrCreateBalance(test_account_id, 'points', { transaction })
        })

        const star_stone_balance = await TransactionManager.execute(async transaction => {
          return await BalanceService.getOrCreateBalance(test_account_id, 'star_stone', {
            transaction
          })
        })

        // 验证：balance_id 不同
        expect(star_stone_balance.balance_id).not.toBe(points_balance.balance_id)
        expect(star_stone_balance.asset_code).toBe('star_stone')
        expect(points_balance.asset_code).toBe('points')
      })
    })

    describe('初始值验证', () => {
      it('新创建的余额记录可用余额应为0或已有值', async () => {
        // 执行：获取余额
        const result = await TransactionManager.execute(async transaction => {
          return await BalanceService.getOrCreateBalance(test_account_id, 'points', { transaction })
        })

        // 验证：余额应为非负整数
        expect(Number(result.available_amount)).toBeGreaterThanOrEqual(0)
        expect(Number.isInteger(Number(result.available_amount))).toBe(true)
      })

      it('新创建的余额记录冻结余额应为0或已有值', async () => {
        // 执行
        const result = await TransactionManager.execute(async transaction => {
          return await BalanceService.getOrCreateBalance(test_account_id, 'points', { transaction })
        })

        // 验证
        expect(Number(result.frozen_amount)).toBeGreaterThanOrEqual(0)
        expect(Number.isInteger(Number(result.frozen_amount))).toBe(true)
      })
    })
  })

  // ==================== P0-1-4: getBalance 测试 ====================

  describe('getBalance - 余额查询', () => {
    describe('正常查询场景', () => {
      it('应该返回用户的可用余额（available_amount）', async () => {
        // 执行：getBalance 返回 { available_amount, frozen_amount, total_amount }
        const result = await BalanceService.getBalance({
          user_id: test_user_id,
          asset_code: 'points'
        })

        // 验证：结果包含 available_amount 字段
        expect(result).toBeDefined()
        expect(result).toHaveProperty('available_amount')
        expect(Number(result.available_amount)).toBeGreaterThanOrEqual(0)
      })

      it('应该返回用户的冻结余额（frozen_amount）', async () => {
        // 执行
        const result = await BalanceService.getBalance({
          user_id: test_user_id,
          asset_code: 'points'
        })

        // 验证
        expect(result).toBeDefined()
        expect(result).toHaveProperty('frozen_amount')
        expect(Number(result.frozen_amount)).toBeGreaterThanOrEqual(0)
      })

      it('应该返回余额（available + frozen 可计算得出 total）', async () => {
        // 执行
        const result = await BalanceService.getBalance({
          user_id: test_user_id,
          asset_code: 'points'
        })

        /*
         * 验证：getBalance 返回数据库记录，包含 available_amount 和 frozen_amount
         * total_amount 不是数据库字段，需要通过计算得出
         */
        expect(result).toBeDefined()
        expect(result).toHaveProperty('available_amount')
        expect(result).toHaveProperty('frozen_amount')
        // 业务计算：total = available + frozen
        const total_amount = Number(result.available_amount) + Number(result.frozen_amount)
        expect(total_amount).toBeGreaterThanOrEqual(0)
      })
    })

    describe('不同资产类型查询', () => {
      it('应该能查询 star_stone 余额', async () => {
        // 执行
        const result = await BalanceService.getBalance({
          user_id: test_user_id,
          asset_code: 'star_stone'
        })

        // 验证：返回数据库记录，包含 available_amount 和 frozen_amount
        expect(result).toBeDefined()
        expect(result).toHaveProperty('available_amount')
        expect(result).toHaveProperty('frozen_amount')
        // 注意：total_amount 不是数据库字段，需要业务层计算
      })

      it('应该能查询 red_core_shard 余额', async () => {
        // 执行
        const result = await BalanceService.getBalance({
          user_id: test_user_id,
          asset_code: 'red_core_shard'
        })

        // 验证：结果为对象，包含标准字段
        expect(result).toBeDefined()
        expect(typeof result).toBe('object')
        expect(result).toHaveProperty('available_amount')
      })
    })

    describe('边界情况', () => {
      it('不存在的资产类型应返回null', async () => {
        /*
         * 执行：查询一个用户没有的资产类型
         * 业务行为：getBalance 返回 null 表示没有该资产的余额记录
         * 业务层可将 null 解读为 0 余额（业务决策）
         */
        const result = await BalanceService.getBalance({
          user_id: test_user_id,
          asset_code: 'NON_EXISTENT_ASSET_XYZ'
        })

        // 验证：不存在的资产返回 null
        expect(result).toBeNull()
      })

      it('不存在的用户应返回null', async () => {
        /*
         * 执行：使用一个不存在的用户 ID
         * 业务行为：getBalance 捕获 "用户不存在" 错误并返回 null（非致命错误）
         * 这样调用方可以安全地处理新用户或不存在的用户
         */
        const result = await BalanceService.getBalance({
          user_id: 999999999,
          asset_code: 'points'
        })

        // 验证：不存在的用户返回 null
        expect(result).toBeNull()
      })
    })
  })

  // ==================== P0-1-5: changeBalance 增加余额测试 ====================

  describe('changeBalance - 增加余额测试', () => {
    describe('正常增加余额', () => {
      it('应该能增加 points 余额', async () => {
        // 准备：记录变更前余额
        const before_balance = await BalanceService.getBalance({
          user_id: test_user_id,
          asset_code: 'points'
        })
        const before_available = Number(before_balance.available_amount)

        // 执行：增加余额
        const delta_amount = 100
        const idempotency_key = generateIdempotencyKey('test_add_points')

        const result = await TransactionManager.execute(async transaction => {
          return await BalanceService.changeBalance(
            {
              user_id: test_user_id,
              asset_code: 'points',
              delta_amount,
              idempotency_key,
              business_type: 'test_increase',
              counterpart_account_id: 2,
              meta: { description: '单元测试-增加积分' }
            },
            { transaction }
          )
        })

        // 记录创建的流水（用于清理）
        if (result && result.transaction_record && result.transaction_record.asset_transaction_id) {
          created_transactions.push(result.transaction_record.asset_transaction_id)
        }

        // 验证：返回结构包含 { account, balance, transaction_record, is_duplicate }
        expect(result).toBeDefined()
        expect(result.transaction_record).toBeDefined()
        expect(result.transaction_record.asset_transaction_id).toBeDefined()
        expect(Number(result.transaction_record.delta_amount)).toBe(delta_amount)
        expect(result.transaction_record.asset_code).toBe('points')
        expect(result.transaction_record.business_type).toBe('test_increase')
        expect(result.is_duplicate).toBe(false)

        // 验证：变更后余额
        const after_balance = await BalanceService.getBalance({
          user_id: test_user_id,
          asset_code: 'points'
        })

        expect(Number(after_balance.available_amount)).toBe(before_available + delta_amount)
      })

      it('应该能增加 star_stone 余额', async () => {
        // 准备
        const before_balance = await BalanceService.getBalance({
          user_id: test_user_id,
          asset_code: 'star_stone'
        })
        const before_available = Number(before_balance.available_amount)

        // 执行
        const delta_amount = 50
        const idempotency_key = generateIdempotencyKey('test_add_star_stone')

        const result = await TransactionManager.execute(async transaction => {
          return await BalanceService.changeBalance(
            {
              user_id: test_user_id,
              asset_code: 'star_stone',
              delta_amount,
              idempotency_key,
              business_type: 'test_increase',
              counterpart_account_id: 2,
              meta: { description: '单元测试-增加星石' }
            },
            { transaction }
          )
        })

        // 记录创建的流水
        if (result && result.transaction_record && result.transaction_record.asset_transaction_id) {
          created_transactions.push(result.transaction_record.asset_transaction_id)
        }

        // 验证
        expect(result).toBeDefined()
        expect(result.transaction_record).toBeDefined()
        expect(Number(result.transaction_record.delta_amount)).toBe(delta_amount)
        expect(result.transaction_record.asset_code).toBe('star_stone')

        // 验证余额变化
        const after_balance = await BalanceService.getBalance({
          user_id: test_user_id,
          asset_code: 'star_stone'
        })

        expect(Number(after_balance.available_amount)).toBe(before_available + delta_amount)
      })
    })

    describe('大额增加余额', () => {
      it('应该能处理大额增加（10000）', async () => {
        // 准备
        const before_balance = await BalanceService.getBalance({
          user_id: test_user_id,
          asset_code: 'points'
        })
        const before_available = Number(before_balance.available_amount)

        // 执行：大额增加
        const delta_amount = 10000
        const idempotency_key = generateIdempotencyKey('test_large_amount')

        const result = await TransactionManager.execute(async transaction => {
          return await BalanceService.changeBalance(
            {
              user_id: test_user_id,
              asset_code: 'points',
              delta_amount,
              idempotency_key,
              business_type: 'test_large_increase',
              counterpart_account_id: 2,
              meta: { description: '单元测试-大额增加' }
            },
            { transaction }
          )
        })

        // 记录创建的流水
        if (result && result.transaction_record && result.transaction_record.asset_transaction_id) {
          created_transactions.push(result.transaction_record.asset_transaction_id)
        }

        // 验证
        expect(result).toBeDefined()
        expect(result.transaction_record).toBeDefined()
        expect(Number(result.transaction_record.delta_amount)).toBe(delta_amount)

        // 验证余额变化
        const after_balance = await BalanceService.getBalance({
          user_id: test_user_id,
          asset_code: 'points'
        })

        expect(Number(after_balance.available_amount)).toBe(before_available + delta_amount)
      })

      it('应该能处理最小增加金额（1）', async () => {
        // 准备
        const before_balance = await BalanceService.getBalance({
          user_id: test_user_id,
          asset_code: 'points'
        })
        const before_available = Number(before_balance.available_amount)

        // 执行：最小金额增加
        const delta_amount = 1
        const idempotency_key = generateIdempotencyKey('test_min_amount')

        const result = await TransactionManager.execute(async transaction => {
          return await BalanceService.changeBalance(
            {
              user_id: test_user_id,
              asset_code: 'points',
              delta_amount,
              idempotency_key,
              business_type: 'test_min_increase',
              counterpart_account_id: 2,
              meta: { description: '单元测试-最小增加' }
            },
            { transaction }
          )
        })

        // 记录创建的流水
        if (result && result.transaction_record && result.transaction_record.asset_transaction_id) {
          created_transactions.push(result.transaction_record.asset_transaction_id)
        }

        // 验证
        expect(result).toBeDefined()
        expect(result.transaction_record).toBeDefined()
        expect(Number(result.transaction_record.delta_amount)).toBe(1)

        // 验证余额变化
        const after_balance = await BalanceService.getBalance({
          user_id: test_user_id,
          asset_code: 'points'
        })

        expect(Number(after_balance.available_amount)).toBe(before_available + 1)
      })
    })

    describe('幂等性检查', () => {
      it('相同 idempotency_key 不应重复增加余额', async () => {
        // 准备：记录初始余额
        const initial_balance = await BalanceService.getBalance({
          user_id: test_user_id,
          asset_code: 'points'
        })
        const initial_available = Number(initial_balance.available_amount)

        // 执行：第一次增加
        const delta_amount = 200
        const idempotency_key = generateIdempotencyKey('test_idempotent')

        const first_result = await TransactionManager.execute(async transaction => {
          return await BalanceService.changeBalance(
            {
              user_id: test_user_id,
              asset_code: 'points',
              delta_amount,
              idempotency_key,
              business_type: 'test_idempotent',
              counterpart_account_id: 2,
              meta: { description: '幂等性测试-第一次' }
            },
            { transaction }
          )
        })

        // 记录创建的流水
        if (
          first_result &&
          first_result.transaction_record &&
          first_result.transaction_record.asset_transaction_id
        ) {
          created_transactions.push(first_result.transaction_record.asset_transaction_id)
        }

        // 验证：第一次执行成功
        expect(first_result).toBeDefined()
        expect(first_result.transaction_record).toBeDefined()
        expect(Number(first_result.transaction_record.delta_amount)).toBe(delta_amount)
        expect(first_result.is_duplicate).toBe(false)

        // 记录第一次执行后的余额
        const after_first = await BalanceService.getBalance({
          user_id: test_user_id,
          asset_code: 'points'
        })
        const after_first_available = Number(after_first.available_amount)

        // 执行：使用相同 idempotency_key 再次调用
        const second_result = await TransactionManager.execute(async transaction => {
          return await BalanceService.changeBalance(
            {
              user_id: test_user_id,
              asset_code: 'points',
              delta_amount,
              idempotency_key, // 相同的幂等键
              business_type: 'test_idempotent',
              counterpart_account_id: 2,
              meta: { description: '幂等性测试-第二次' }
            },
            { transaction }
          )
        })

        // 验证：第二次调用应返回 is_duplicate: true，且 asset_transaction_id 相同
        expect(second_result).toBeDefined()
        expect(second_result.is_duplicate).toBe(true)
        // 使用 == 比较，因为 asset_transaction_id 可能是数字或字符串
        expect(String(second_result.transaction_record.asset_transaction_id)).toBe(
          String(first_result.transaction_record.asset_transaction_id)
        )

        // 验证：余额应该与第一次执行后相同（没有重复增加）
        const after_second = await BalanceService.getBalance({
          user_id: test_user_id,
          asset_code: 'points'
        })

        expect(Number(after_second.available_amount)).toBe(after_first_available)
        expect(Number(after_second.available_amount)).toBe(initial_available + delta_amount)
      })

      it('不同 idempotency_key 应该分别增加余额', async () => {
        // 准备
        const initial_balance = await BalanceService.getBalance({
          user_id: test_user_id,
          asset_code: 'points'
        })
        const initial_available = Number(initial_balance.available_amount)

        // 执行：使用两个不同的幂等键
        const delta_amount = 100

        const result_1 = await TransactionManager.execute(async transaction => {
          return await BalanceService.changeBalance(
            {
              user_id: test_user_id,
              asset_code: 'points',
              delta_amount,
              idempotency_key: generateIdempotencyKey('test_diff_key_1'),
              business_type: 'test_diff_key',
              counterpart_account_id: 2,
              meta: { description: '不同幂等键-1' }
            },
            { transaction }
          )
        })

        const result_2 = await TransactionManager.execute(async transaction => {
          return await BalanceService.changeBalance(
            {
              user_id: test_user_id,
              asset_code: 'points',
              delta_amount,
              idempotency_key: generateIdempotencyKey('test_diff_key_2'),
              business_type: 'test_diff_key',
              counterpart_account_id: 2,
              meta: { description: '不同幂等键-2' }
            },
            { transaction }
          )
        })

        // 记录创建的流水
        if (
          result_1 &&
          result_1.transaction_record &&
          result_1.transaction_record.asset_transaction_id
        ) {
          created_transactions.push(result_1.transaction_record.asset_transaction_id)
        }
        if (
          result_2 &&
          result_2.transaction_record &&
          result_2.transaction_record.asset_transaction_id
        ) {
          created_transactions.push(result_2.transaction_record.asset_transaction_id)
        }

        // 验证：两次执行的 asset_transaction_id 不同
        expect(result_1.transaction_record.asset_transaction_id).not.toBe(
          result_2.transaction_record.asset_transaction_id
        )
        expect(result_1.is_duplicate).toBe(false)
        expect(result_2.is_duplicate).toBe(false)

        // 验证：余额应该增加两次
        const final_balance = await BalanceService.getBalance({
          user_id: test_user_id,
          asset_code: 'points'
        })

        expect(Number(final_balance.available_amount)).toBe(initial_available + delta_amount * 2)
      })
    })

    describe('事务边界验证', () => {
      it('没有事务时 changeBalance 应该抛出错误', async () => {
        // 执行：不在事务中调用 changeBalance
        await expect(
          BalanceService.changeBalance({
            user_id: test_user_id,
            asset_code: 'points',
            delta_amount: 100,
            idempotency_key: generateIdempotencyKey('test_no_transaction'),
            business_type: 'test'
          })
        ).rejects.toThrow()
      })
    })

    describe('流水记录验证', () => {
      it('增加余额应生成正确的流水记录', async () => {
        // 执行
        const delta_amount = 150
        const idempotency_key = generateIdempotencyKey('test_transaction_record')

        const result = await TransactionManager.execute(async transaction => {
          return await BalanceService.changeBalance(
            {
              user_id: test_user_id,
              asset_code: 'points',
              delta_amount,
              idempotency_key,
              business_type: 'lottery_reward',
              meta: { description: '测试流水记录', source: 'unit_test' }
            },
            { transaction }
          )
        })

        // 记录创建的流水
        if (result && result.transaction_record && result.transaction_record.asset_transaction_id) {
          created_transactions.push(result.transaction_record.asset_transaction_id)
        }

        // 验证流水记录字段
        const tx = result.transaction_record
        expect(tx).toBeDefined()
        expect(tx.asset_transaction_id).toBeDefined()
        expect(tx.account_id).toBeDefined()
        expect(tx.asset_code).toBe('points')
        expect(Number(tx.delta_amount)).toBe(delta_amount)
        expect(tx.business_type).toBe('lottery_reward')
        expect(tx.idempotency_key).toBe(idempotency_key)

        // 验证 balance_after 大于等于 delta_amount
        expect(Number(tx.balance_after)).toBeGreaterThanOrEqual(delta_amount)
      })
    })
  })

  // ==================== P0-1-6: changeBalance 扣减余额测试 ====================

  describe('P0-1-6: changeBalance - 扣减余额测试', () => {
    describe('正常扣减余额', () => {
      it('应该能扣减 points 余额', async () => {
        // 准备：先增加足够的余额
        const setup_key = generateIdempotencyKey('setup_deduct')
        await TransactionManager.execute(async transaction => {
          return await BalanceService.changeBalance(
            {
              user_id: test_user_id,
              asset_code: 'points',
              delta_amount: 500,
              idempotency_key: setup_key,
              business_type: 'test_setup',
              counterpart_account_id: 2,
              meta: { description: '准备扣减测试' }
            },
            { transaction }
          )
        })

        // 记录变更前余额
        const before_balance = await BalanceService.getBalance({
          user_id: test_user_id,
          asset_code: 'points'
        })
        const before_available = Number(before_balance.available_amount)

        // 执行：扣减余额（delta_amount 为负数）
        const delta_amount = -100
        const idempotency_key = generateIdempotencyKey('test_deduct_points')

        const result = await TransactionManager.execute(async transaction => {
          return await BalanceService.changeBalance(
            {
              user_id: test_user_id,
              asset_code: 'points',
              delta_amount,
              idempotency_key,
              business_type: 'test_deduct',
              counterpart_account_id: 2,
              meta: { description: '单元测试-扣减积分' }
            },
            { transaction }
          )
        })

        // 记录创建的流水
        if (result && result.transaction_record && result.transaction_record.asset_transaction_id) {
          created_transactions.push(result.transaction_record.asset_transaction_id)
        }

        // 验证
        expect(result).toBeDefined()
        expect(result.transaction_record).toBeDefined()
        expect(Number(result.transaction_record.delta_amount)).toBe(delta_amount)
        expect(result.is_duplicate).toBe(false)

        // 验证余额变化
        const after_balance = await BalanceService.getBalance({
          user_id: test_user_id,
          asset_code: 'points'
        })
        expect(Number(after_balance.available_amount)).toBe(before_available + delta_amount)
      })
    })

    describe('余额不足拦截', () => {
      it('扣减金额超过可用余额时应抛出错误', async () => {
        // 获取当前余额
        const current_balance = await BalanceService.getBalance({
          user_id: test_user_id,
          asset_code: 'points'
        })
        const current_available = Number(current_balance.available_amount)

        // 执行：尝试扣减超过可用余额的金额
        const excessive_amount = -(current_available + 10000)
        const idempotency_key = generateIdempotencyKey('test_insufficient')

        await expect(
          TransactionManager.execute(async transaction => {
            return await BalanceService.changeBalance(
              {
                user_id: test_user_id,
                asset_code: 'points',
                delta_amount: excessive_amount,
                idempotency_key,
                business_type: 'test_insufficient',
                counterpart_account_id: 2,
                meta: { description: '余额不足测试' }
              },
              { transaction }
            )
          })
        ).rejects.toThrow(/余额不足|insufficient/i)

        // 验证：余额应保持不变
        const after_balance = await BalanceService.getBalance({
          user_id: test_user_id,
          asset_code: 'points'
        })
        expect(Number(after_balance.available_amount)).toBe(current_available)
      })
    })

    describe('边界值测试', () => {
      it('扣减金额恰好等于可用余额时应成功（余额归零）', async () => {
        // 准备：创建一个新的资产类型用于边界测试，避免影响其他测试
        const test_asset_code = 'star_stone' // 使用 star_stone 进行边界测试

        // 先增加一个固定金额
        const setup_amount = 500
        const setup_key = generateIdempotencyKey('setup_boundary')
        await TransactionManager.execute(async transaction => {
          return await BalanceService.changeBalance(
            {
              user_id: test_user_id,
              asset_code: test_asset_code,
              delta_amount: setup_amount,
              idempotency_key: setup_key,
              business_type: 'test_setup',
              counterpart_account_id: 2,
              meta: { description: '边界测试准备' }
            },
            { transaction }
          )
        })

        // 获取当前余额
        const before_balance = await BalanceService.getBalance({
          user_id: test_user_id,
          asset_code: test_asset_code
        })
        const available_to_deduct = Number(before_balance.available_amount)

        // 执行：扣减全部可用余额
        const idempotency_key = generateIdempotencyKey('test_boundary_exact')
        const result = await TransactionManager.execute(async transaction => {
          return await BalanceService.changeBalance(
            {
              user_id: test_user_id,
              asset_code: test_asset_code,
              delta_amount: -available_to_deduct,
              idempotency_key,
              business_type: 'test_boundary',
              counterpart_account_id: 2,
              meta: { description: '边界值-扣减全部余额' }
            },
            { transaction }
          )
        })

        // 记录创建的流水
        if (result && result.transaction_record && result.transaction_record.asset_transaction_id) {
          created_transactions.push(result.transaction_record.asset_transaction_id)
        }

        // 验证
        expect(result).toBeDefined()
        expect(result.transaction_record).toBeDefined()
        expect(Number(result.transaction_record.delta_amount)).toBe(-available_to_deduct)

        // 验证余额归零（或恢复到增加前的值）
        const after_balance = await BalanceService.getBalance({
          user_id: test_user_id,
          asset_code: test_asset_code
        })
        expect(Number(after_balance.available_amount)).toBe(0)
      })

      it('零余额时扣减任意金额应失败', async () => {
        // 使用一个不常用的资产类型进行测试
        const rare_asset_code = 'orange_core_shard'

        // 获取当前余额（可能返回 null 表示没有该资产）
        const balance = await BalanceService.getBalance({
          user_id: test_user_id,
          asset_code: rare_asset_code
        })

        // 如果余额为 null 或 0，测试扣减（null 表示没有该资产，等同于 0 余额）
        const available = balance ? Number(balance.available_amount) : 0
        if (available === 0) {
          const idempotency_key = generateIdempotencyKey('test_zero_deduct')

          await expect(
            TransactionManager.execute(async transaction => {
              return await BalanceService.changeBalance(
                {
                  user_id: test_user_id,
                  asset_code: rare_asset_code,
                  delta_amount: -1,
                  idempotency_key,
                  business_type: 'test_zero_deduct',
                  counterpart_account_id: 2,
                  meta: { description: '零余额扣减测试' }
                },
                { transaction }
              )
            })
          ).rejects.toThrow(/余额不足|insufficient/i)
        } else {
          console.log(`⚠️ ${rare_asset_code} 余额不为0，跳过零余额扣减测试`)
        }
      })
    })
  })

  // ==================== P0-1-7: freeze/unfreeze 测试 ====================

  describe('P0-1-7: freeze/unfreeze - 冻结解冻测试', () => {
    describe('冻结资产', () => {
      it('应该能冻结 points 资产', async () => {
        // 准备：确保有足够的可用余额
        const setup_key = generateIdempotencyKey('setup_freeze')
        await TransactionManager.execute(async transaction => {
          return await BalanceService.changeBalance(
            {
              user_id: test_user_id,
              asset_code: 'points',
              delta_amount: 300,
              idempotency_key: setup_key,
              business_type: 'test_setup',
              counterpart_account_id: 2,
              meta: { description: '冻结测试准备' }
            },
            { transaction }
          )
        })

        // 记录冻结前余额
        const before_balance = await BalanceService.getBalance({
          user_id: test_user_id,
          asset_code: 'points'
        })
        const before_available = Number(before_balance.available_amount)
        const before_frozen = Number(before_balance.frozen_amount)

        // 执行冻结
        const freeze_amount = 100
        const idempotency_key = generateIdempotencyKey('test_freeze')

        const result = await TransactionManager.execute(async transaction => {
          return await BalanceService.freeze(
            {
              user_id: test_user_id,
              asset_code: 'points',
              amount: freeze_amount,
              idempotency_key,
              business_type: 'test_freeze',
              meta: { description: '单元测试-冻结资产' }
            },
            { transaction }
          )
        })

        // 记录创建的流水
        if (result && result.transaction_record && result.transaction_record.asset_transaction_id) {
          created_transactions.push(result.transaction_record.asset_transaction_id)
        }

        // 验证
        expect(result).toBeDefined()
        expect(result.is_duplicate).toBe(false)

        // 验证余额变化
        const after_balance = await BalanceService.getBalance({
          user_id: test_user_id,
          asset_code: 'points'
        })

        // 可用余额减少，冻结余额增加
        expect(Number(after_balance.available_amount)).toBe(before_available - freeze_amount)
        expect(Number(after_balance.frozen_amount)).toBe(before_frozen + freeze_amount)
        // 总余额不变
        expect(Number(after_balance.total_amount)).toBe(Number(before_balance.total_amount))
      })

      it('冻结金额超过可用余额时应抛出错误', async () => {
        // 获取当前余额
        const current_balance = await BalanceService.getBalance({
          user_id: test_user_id,
          asset_code: 'points'
        })
        const current_available = Number(current_balance.available_amount)

        // 尝试冻结超过可用余额的金额
        const excessive_amount = current_available + 10000
        const idempotency_key = generateIdempotencyKey('test_freeze_insufficient')

        await expect(
          TransactionManager.execute(async transaction => {
            return await BalanceService.freeze(
              {
                user_id: test_user_id,
                asset_code: 'points',
                amount: excessive_amount,
                idempotency_key,
                business_type: 'test_freeze_insufficient',
                meta: { description: '冻结不足测试' }
              },
              { transaction }
            )
          })
        ).rejects.toThrow(/余额不足|insufficient/i)
      })
    })

    describe('解冻资产', () => {
      it('应该能解冻已冻结的资产', async () => {
        // 准备：先增加并冻结一些资产
        const setup_add_key = generateIdempotencyKey('setup_unfreeze_add')
        const setup_freeze_key = generateIdempotencyKey('setup_unfreeze_freeze')

        await TransactionManager.execute(async transaction => {
          await BalanceService.changeBalance(
            {
              user_id: test_user_id,
              asset_code: 'points',
              delta_amount: 200,
              idempotency_key: setup_add_key,
              business_type: 'test_setup',
              counterpart_account_id: 2,
              meta: { description: '解冻测试准备-增加' }
            },
            { transaction }
          )

          await BalanceService.freeze(
            {
              user_id: test_user_id,
              asset_code: 'points',
              amount: 150,
              idempotency_key: setup_freeze_key,
              business_type: 'test_setup',
              meta: { description: '解冻测试准备-冻结' }
            },
            { transaction }
          )
        })

        // 记录解冻前余额
        const before_balance = await BalanceService.getBalance({
          user_id: test_user_id,
          asset_code: 'points'
        })
        const before_available = Number(before_balance.available_amount)
        const before_frozen = Number(before_balance.frozen_amount)

        // 执行解冻
        const unfreeze_amount = 50
        const idempotency_key = generateIdempotencyKey('test_unfreeze')

        const result = await TransactionManager.execute(async transaction => {
          return await BalanceService.unfreeze(
            {
              user_id: test_user_id,
              asset_code: 'points',
              amount: unfreeze_amount,
              idempotency_key,
              business_type: 'test_unfreeze',
              meta: { description: '单元测试-解冻资产' }
            },
            { transaction }
          )
        })

        // 记录创建的流水
        if (result && result.transaction_record && result.transaction_record.asset_transaction_id) {
          created_transactions.push(result.transaction_record.asset_transaction_id)
        }

        // 验证
        expect(result).toBeDefined()
        expect(result.is_duplicate).toBe(false)

        // 验证余额变化
        const after_balance = await BalanceService.getBalance({
          user_id: test_user_id,
          asset_code: 'points'
        })

        // 可用余额增加，冻结余额减少
        expect(Number(after_balance.available_amount)).toBe(before_available + unfreeze_amount)
        expect(Number(after_balance.frozen_amount)).toBe(before_frozen - unfreeze_amount)
        // 总余额不变
        expect(Number(after_balance.total_amount)).toBe(Number(before_balance.total_amount))
      })

      it('解冻金额超过冻结余额时应抛出错误', async () => {
        // 获取当前余额
        const current_balance = await BalanceService.getBalance({
          user_id: test_user_id,
          asset_code: 'points'
        })
        const current_frozen = Number(current_balance.frozen_amount)

        // 尝试解冻超过冻结余额的金额
        const excessive_amount = current_frozen + 10000
        const idempotency_key = generateIdempotencyKey('test_unfreeze_insufficient')

        await expect(
          TransactionManager.execute(async transaction => {
            return await BalanceService.unfreeze(
              {
                user_id: test_user_id,
                asset_code: 'points',
                amount: excessive_amount,
                idempotency_key,
                business_type: 'test_unfreeze_insufficient',
                meta: { description: '解冻不足测试' }
              },
              { transaction }
            )
          })
        ).rejects.toThrow(/冻结余额不足|insufficient frozen|frozen balance/i)
      })
    })
  })

  // ==================== P0-1-8: settleFromFrozen 测试 ====================

  describe('P0-1-8: settleFromFrozen - 从冻结余额结算测试', () => {
    describe('正常结算', () => {
      it('应该能从冻结余额中结算扣款', async () => {
        // 准备：增加余额并冻结
        const setup_add_key = generateIdempotencyKey('setup_settle_add')
        const setup_freeze_key = generateIdempotencyKey('setup_settle_freeze')

        await TransactionManager.execute(async transaction => {
          await BalanceService.changeBalance(
            {
              user_id: test_user_id,
              asset_code: 'points',
              delta_amount: 400,
              idempotency_key: setup_add_key,
              business_type: 'test_setup',
              counterpart_account_id: 2,
              meta: { description: '结算测试准备-增加' }
            },
            { transaction }
          )

          await BalanceService.freeze(
            {
              user_id: test_user_id,
              asset_code: 'points',
              amount: 300,
              idempotency_key: setup_freeze_key,
              business_type: 'test_setup',
              meta: { description: '结算测试准备-冻结' }
            },
            { transaction }
          )
        })

        // 记录结算前余额
        const before_balance = await BalanceService.getBalance({
          user_id: test_user_id,
          asset_code: 'points'
        })
        const before_frozen = Number(before_balance.frozen_amount)
        const before_total = Number(before_balance.total_amount)

        // 执行结算
        const settle_amount = 100
        const idempotency_key = generateIdempotencyKey('test_settle')

        const result = await TransactionManager.execute(async transaction => {
          return await BalanceService.settleFromFrozen(
            {
              user_id: test_user_id,
              asset_code: 'points',
              amount: settle_amount,
              idempotency_key,
              business_type: 'test_settle',
              meta: { description: '单元测试-从冻结结算' }
            },
            { transaction }
          )
        })

        // 记录创建的流水
        if (result && result.transaction_record && result.transaction_record.asset_transaction_id) {
          created_transactions.push(result.transaction_record.asset_transaction_id)
        }

        // 验证
        expect(result).toBeDefined()
        expect(result.is_duplicate).toBe(false)

        // 验证余额变化
        const after_balance = await BalanceService.getBalance({
          user_id: test_user_id,
          asset_code: 'points'
        })

        // 冻结余额减少，总余额减少（已结算扣款）
        expect(Number(after_balance.frozen_amount)).toBe(before_frozen - settle_amount)
        expect(Number(after_balance.total_amount)).toBe(before_total - settle_amount)
      })
    })

    describe('结算不足', () => {
      it('结算金额超过冻结余额时应抛出错误', async () => {
        // 获取当前余额
        const current_balance = await BalanceService.getBalance({
          user_id: test_user_id,
          asset_code: 'points'
        })
        const current_frozen = Number(current_balance.frozen_amount)

        // 尝试结算超过冻结余额的金额
        const excessive_amount = current_frozen + 10000
        const idempotency_key = generateIdempotencyKey('test_settle_insufficient')

        await expect(
          TransactionManager.execute(async transaction => {
            return await BalanceService.settleFromFrozen(
              {
                user_id: test_user_id,
                asset_code: 'points',
                amount: excessive_amount,
                idempotency_key,
                business_type: 'test_settle_insufficient',
                meta: { description: '结算不足测试' }
              },
              { transaction }
            )
          })
        ).rejects.toThrow(/冻结余额不足|insufficient frozen|frozen balance/i)
      })
    })
  })

  // ==================== P0-1-9: 幂等性保护测试 ====================

  describe('P0-1-9: 幂等性保护测试', () => {
    describe('changeBalance 幂等性', () => {
      it('相同幂等键多次调用 changeBalance 应只执行一次', async () => {
        // 记录初始余额
        const initial_balance = await BalanceService.getBalance({
          user_id: test_user_id,
          asset_code: 'points'
        })
        const initial_available = Number(initial_balance.available_amount)

        // 使用固定幂等键
        const idempotency_key = generateIdempotencyKey('test_idempotent_change')
        const delta_amount = 100

        // 第一次调用
        const result_1 = await TransactionManager.execute(async transaction => {
          return await BalanceService.changeBalance(
            {
              user_id: test_user_id,
              asset_code: 'points',
              delta_amount,
              idempotency_key,
              business_type: 'test_idempotent',
              counterpart_account_id: 2,
              meta: { attempt: 1 }
            },
            { transaction }
          )
        })

        if (
          result_1 &&
          result_1.transaction_record &&
          result_1.transaction_record.asset_transaction_id
        ) {
          created_transactions.push(result_1.transaction_record.asset_transaction_id)
        }

        expect(result_1.is_duplicate).toBe(false)

        // 第二次调用（相同幂等键）
        const result_2 = await TransactionManager.execute(async transaction => {
          return await BalanceService.changeBalance(
            {
              user_id: test_user_id,
              asset_code: 'points',
              delta_amount,
              idempotency_key,
              business_type: 'test_idempotent',
              counterpart_account_id: 2,
              meta: { attempt: 2 }
            },
            { transaction }
          )
        })

        expect(result_2.is_duplicate).toBe(true)
        expect(String(result_2.transaction_record.asset_transaction_id)).toBe(
          String(result_1.transaction_record.asset_transaction_id)
        )

        // 第三次调用（相同幂等键）
        const result_3 = await TransactionManager.execute(async transaction => {
          return await BalanceService.changeBalance(
            {
              user_id: test_user_id,
              asset_code: 'points',
              delta_amount,
              idempotency_key,
              business_type: 'test_idempotent',
              counterpart_account_id: 2,
              meta: { attempt: 3 }
            },
            { transaction }
          )
        })

        expect(result_3.is_duplicate).toBe(true)

        // 验证余额只增加一次
        const final_balance = await BalanceService.getBalance({
          user_id: test_user_id,
          asset_code: 'points'
        })
        expect(Number(final_balance.available_amount)).toBe(initial_available + delta_amount)
      })

      it('不同幂等键应各自独立执行', async () => {
        // 记录初始余额
        const initial_balance = await BalanceService.getBalance({
          user_id: test_user_id,
          asset_code: 'points'
        })
        const initial_available = Number(initial_balance.available_amount)

        const delta_amount = 50
        const results = []

        // 使用不同幂等键调用三次
        for (let i = 1; i <= 3; i++) {
          const result = await TransactionManager.execute(async transaction => {
            return await BalanceService.changeBalance(
              {
                user_id: test_user_id,
                asset_code: 'points',
                delta_amount,
                idempotency_key: generateIdempotencyKey(`test_diff_key_${i}`),
                business_type: 'test_diff_key',
                counterpart_account_id: 2,
                meta: { attempt: i }
              },
              { transaction }
            )
          })

          if (
            result &&
            result.transaction_record &&
            result.transaction_record.asset_transaction_id
          ) {
            created_transactions.push(result.transaction_record.asset_transaction_id)
          }

          results.push(result)
        }

        // 所有调用都不是重复的
        results.forEach(result => {
          expect(result.is_duplicate).toBe(false)
        })

        // 每次调用的 asset_transaction_id 都不同
        const tx_ids = results.map(r => String(r.transaction_record.asset_transaction_id))
        const unique_tx_ids = [...new Set(tx_ids)]
        expect(unique_tx_ids.length).toBe(3)

        // 验证余额增加了三次
        const final_balance = await BalanceService.getBalance({
          user_id: test_user_id,
          asset_code: 'points'
        })
        expect(Number(final_balance.available_amount)).toBe(initial_available + delta_amount * 3)
      })
    })

    describe('freeze/unfreeze 幂等性', () => {
      it('相同幂等键多次调用 freeze 应只执行一次', async () => {
        // 准备
        const setup_key = generateIdempotencyKey('setup_freeze_idempotent')
        await TransactionManager.execute(async transaction => {
          return await BalanceService.changeBalance(
            {
              user_id: test_user_id,
              asset_code: 'points',
              delta_amount: 200,
              idempotency_key: setup_key,
              business_type: 'test_setup',
              counterpart_account_id: 2,
              meta: { description: '幂等冻结测试准备' }
            },
            { transaction }
          )
        })

        const idempotency_key = generateIdempotencyKey('test_freeze_idempotent')
        const freeze_amount = 80

        // 第一次冻结
        const result_1 = await TransactionManager.execute(async transaction => {
          return await BalanceService.freeze(
            {
              user_id: test_user_id,
              asset_code: 'points',
              amount: freeze_amount,
              idempotency_key,
              business_type: 'test_freeze_idempotent',
              meta: { attempt: 1 }
            },
            { transaction }
          )
        })

        if (
          result_1 &&
          result_1.transaction_record &&
          result_1.transaction_record.asset_transaction_id
        ) {
          created_transactions.push(result_1.transaction_record.asset_transaction_id)
        }

        expect(result_1.is_duplicate).toBe(false)

        // 第二次冻结（相同幂等键）
        const result_2 = await TransactionManager.execute(async transaction => {
          return await BalanceService.freeze(
            {
              user_id: test_user_id,
              asset_code: 'points',
              amount: freeze_amount,
              idempotency_key,
              business_type: 'test_freeze_idempotent',
              meta: { attempt: 2 }
            },
            { transaction }
          )
        })

        expect(result_2.is_duplicate).toBe(true)
      })
    })

    describe('并发幂等性测试', () => {
      it('并发调用相同幂等键应只有一个成功执行', async () => {
        // 准备
        const setup_key = generateIdempotencyKey('setup_concurrent')
        await TransactionManager.execute(async transaction => {
          return await BalanceService.changeBalance(
            {
              user_id: test_user_id,
              asset_code: 'points',
              delta_amount: 500,
              idempotency_key: setup_key,
              business_type: 'test_setup',
              counterpart_account_id: 2,
              meta: { description: '并发幂等测试准备' }
            },
            { transaction }
          )
        })

        const idempotency_key = generateIdempotencyKey('test_concurrent')
        const delta_amount = 30
        const concurrent_count = 5

        // 记录初始余额
        const initial_balance = await BalanceService.getBalance({
          user_id: test_user_id,
          asset_code: 'points'
        })
        const initial_available = Number(initial_balance.available_amount)

        // 并发调用
        const promises = Array.from({ length: concurrent_count }, (_, i) =>
          TransactionManager.execute(async transaction => {
            return await BalanceService.changeBalance(
              {
                user_id: test_user_id,
                asset_code: 'points',
                delta_amount,
                idempotency_key,
                business_type: 'test_concurrent',
                counterpart_account_id: 2,
                meta: { concurrent_index: i }
              },
              { transaction }
            )
          }).catch(error => ({ error: error.message }))
        )

        const results = await Promise.all(promises)

        // 记录成功创建的流水
        results.forEach(result => {
          if (
            result &&
            !result.error &&
            result.transaction_record &&
            result.transaction_record.asset_transaction_id
          ) {
            created_transactions.push(result.transaction_record.asset_transaction_id)
          }
        })

        // 统计成功执行（非重复）和重复执行的数量
        const successful_results = results.filter(r => r && !r.error)
        const non_duplicate_count = successful_results.filter(r => !r.is_duplicate).length
        const duplicate_count = successful_results.filter(r => r.is_duplicate).length

        // 只有一个成功执行（非重复）
        expect(non_duplicate_count).toBe(1)
        // 其余为重复执行
        expect(duplicate_count).toBe(successful_results.length - 1)

        // 验证余额只增加一次
        const final_balance = await BalanceService.getBalance({
          user_id: test_user_id,
          asset_code: 'points'
        })
        expect(Number(final_balance.available_amount)).toBe(initial_available + delta_amount)
      })
    })
  })

  // ==================== P0-1-10: 事务边界测试 ====================

  describe('P0-1-10: 事务边界测试', () => {
    describe('无事务报错', () => {
      it('changeBalance 无事务调用应抛出 TRANSACTION_REQUIRED 错误', async () => {
        await expect(
          BalanceService.changeBalance({
            user_id: test_user_id,
            asset_code: 'points',
            delta_amount: 10,
            idempotency_key: generateIdempotencyKey('test_no_tx_change'),
            business_type: 'test_no_tx',
            counterpart_account_id: 2
          })
        ).rejects.toThrow(/事务边界|TRANSACTION_REQUIRED|必须在事务中/i)
      })

      it('freeze 无事务调用应抛出 TRANSACTION_REQUIRED 错误', async () => {
        await expect(
          BalanceService.freeze({
            user_id: test_user_id,
            asset_code: 'points',
            amount: 10,
            idempotency_key: generateIdempotencyKey('test_no_tx_freeze'),
            business_type: 'test_no_tx'
          })
        ).rejects.toThrow(/事务边界|TRANSACTION_REQUIRED|必须在事务中/i)
      })

      it('unfreeze 无事务调用应抛出 TRANSACTION_REQUIRED 错误', async () => {
        await expect(
          BalanceService.unfreeze({
            user_id: test_user_id,
            asset_code: 'points',
            amount: 10,
            idempotency_key: generateIdempotencyKey('test_no_tx_unfreeze'),
            business_type: 'test_no_tx'
          })
        ).rejects.toThrow(/事务边界|TRANSACTION_REQUIRED|必须在事务中/i)
      })

      it('settleFromFrozen 无事务调用应抛出 TRANSACTION_REQUIRED 错误', async () => {
        await expect(
          BalanceService.settleFromFrozen({
            user_id: test_user_id,
            asset_code: 'points',
            amount: 10,
            idempotency_key: generateIdempotencyKey('test_no_tx_settle'),
            business_type: 'test_no_tx'
          })
        ).rejects.toThrow(/事务边界|TRANSACTION_REQUIRED|必须在事务中/i)
      })
    })

    describe('事务回滚验证', () => {
      it('事务中发生错误应完全回滚所有变更', async () => {
        // 记录初始余额
        const initial_balance = await BalanceService.getBalance({
          user_id: test_user_id,
          asset_code: 'points'
        })
        const initial_available = Number(initial_balance.available_amount)

        // 执行一个会失败的事务
        try {
          await TransactionManager.execute(async transaction => {
            // 第一步：增加余额（应该会被回滚）
            await BalanceService.changeBalance(
              {
                user_id: test_user_id,
                asset_code: 'points',
                delta_amount: 1000,
                idempotency_key: generateIdempotencyKey('test_rollback_add'),
                business_type: 'test_rollback',
                counterpart_account_id: 2,
                meta: { step: 1 }
              },
              { transaction }
            )

            // 第二步：故意抛出错误以触发回滚
            throw new Error('测试事务回滚')
          })
        } catch (error) {
          // 预期会捕获错误
          expect(error.message).toBe('测试事务回滚')
        }

        // 验证余额没有变化（已回滚）
        const after_balance = await BalanceService.getBalance({
          user_id: test_user_id,
          asset_code: 'points'
        })

        expect(Number(after_balance.available_amount)).toBe(initial_available)
      })

      it('多步骤事务失败应全部回滚', async () => {
        // 记录初始余额
        const initial_balance = await BalanceService.getBalance({
          user_id: test_user_id,
          asset_code: 'points'
        })
        const initial_available = Number(initial_balance.available_amount)
        const initial_frozen = Number(initial_balance.frozen_amount)

        // 执行一个多步骤事务
        try {
          await TransactionManager.execute(async transaction => {
            // 第一步：增加余额
            await BalanceService.changeBalance(
              {
                user_id: test_user_id,
                asset_code: 'points',
                delta_amount: 500,
                idempotency_key: generateIdempotencyKey('test_multi_rollback_1'),
                business_type: 'test_rollback',
                counterpart_account_id: 2,
                meta: { step: 1 }
              },
              { transaction }
            )

            // 第二步：冻结部分余额
            await BalanceService.freeze(
              {
                user_id: test_user_id,
                asset_code: 'points',
                amount: 200,
                idempotency_key: generateIdempotencyKey('test_multi_rollback_2'),
                business_type: 'test_rollback',
                meta: { step: 2 }
              },
              { transaction }
            )

            // 第三步：故意抛出错误
            throw new Error('多步骤事务测试回滚')
          })
        } catch (error) {
          expect(error.message).toBe('多步骤事务测试回滚')
        }

        // 验证所有操作都已回滚
        const after_balance = await BalanceService.getBalance({
          user_id: test_user_id,
          asset_code: 'points'
        })

        expect(Number(after_balance.available_amount)).toBe(initial_available)
        expect(Number(after_balance.frozen_amount)).toBe(initial_frozen)
      })
    })

    describe('事务提交验证', () => {
      it('成功的多步骤事务应全部提交', async () => {
        // 记录初始余额
        const initial_balance = await BalanceService.getBalance({
          user_id: test_user_id,
          asset_code: 'points'
        })
        const initial_available = Number(initial_balance.available_amount)

        const add_amount = 300
        const freeze_amount = 100

        // 执行成功的多步骤事务
        const results = await TransactionManager.execute(async transaction => {
          const add_result = await BalanceService.changeBalance(
            {
              user_id: test_user_id,
              asset_code: 'points',
              delta_amount: add_amount,
              idempotency_key: generateIdempotencyKey('test_commit_add'),
              business_type: 'test_commit',
              counterpart_account_id: 2,
              meta: { step: 1 }
            },
            { transaction }
          )

          const freeze_result = await BalanceService.freeze(
            {
              user_id: test_user_id,
              asset_code: 'points',
              amount: freeze_amount,
              idempotency_key: generateIdempotencyKey('test_commit_freeze'),
              business_type: 'test_commit',
              meta: { step: 2 }
            },
            { transaction }
          )

          return { add_result, freeze_result }
        })

        // 记录创建的流水
        if (results.add_result?.transaction_record?.asset_transaction_id) {
          created_transactions.push(results.add_result.transaction_record.asset_transaction_id)
        }
        if (results.freeze_result?.transaction_record?.asset_transaction_id) {
          created_transactions.push(results.freeze_result.transaction_record.asset_transaction_id)
        }

        // 验证事务已提交
        const after_balance = await BalanceService.getBalance({
          user_id: test_user_id,
          asset_code: 'points'
        })

        // 可用余额 = 初始余额 + 增加金额 - 冻结金额
        expect(Number(after_balance.available_amount)).toBe(
          initial_available + add_amount - freeze_amount
        )
        // 冻结余额增加
        expect(Number(after_balance.frozen_amount)).toBeGreaterThanOrEqual(freeze_amount)
      })
    })
  })

  // ==================== 综合场景测试 ====================

  describe('综合场景测试', () => {
    it('应该能完成完整的账户-余额-变更流程', async () => {
      // 1. 获取账户
      const account = await TransactionManager.execute(async transaction => {
        return await BalanceService.getOrCreateAccount({ user_id: test_user_id }, { transaction })
      })

      expect(account).toBeDefined()
      expect(account.account_id).toBeDefined()

      // 2. 获取余额：getOrCreateBalance(account_id, asset_code, options)
      const balance = await TransactionManager.execute(async transaction => {
        return await BalanceService.getOrCreateBalance(account.account_id, 'points', {
          transaction
        })
      })

      expect(balance).toBeDefined()
      expect(balance.balance_id).toBeDefined()

      // 3. 变更余额
      const idempotency_key = generateIdempotencyKey('test_full_flow')
      const change_result = await TransactionManager.execute(async transaction => {
        return await BalanceService.changeBalance(
          {
            user_id: test_user_id,
            asset_code: 'points',
            delta_amount: 500,
            idempotency_key,
            business_type: 'test_full_flow',
            counterpart_account_id: 2,
            meta: { description: '完整流程测试' }
          },
          { transaction }
        )
      })

      // 记录创建的流水
      if (
        change_result &&
        change_result.transaction_record &&
        change_result.transaction_record.asset_transaction_id
      ) {
        created_transactions.push(change_result.transaction_record.asset_transaction_id)
      }

      expect(change_result).toBeDefined()
      expect(change_result.transaction_record).toBeDefined()
      expect(change_result.transaction_record.asset_transaction_id).toBeDefined()

      // 4. 查询余额验证
      const final_balance = await BalanceService.getBalance({
        user_id: test_user_id,
        asset_code: 'points'
      })

      expect(final_balance).toBeDefined()
      expect(Number(final_balance.available_amount)).toBeGreaterThanOrEqual(500)
    })
  })
})
