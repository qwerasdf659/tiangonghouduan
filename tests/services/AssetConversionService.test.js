/**
 * 餐厅积分抽奖系统 V4 - AssetConversionService 单元测试
 *
 * 测试范围（P0-3系列 任务编号55-59）：
 * - P0-3-6: 实现转换幂等性测试 - 相同幂等键重复请求
 * - P0-3-7: 实现手续费计算测试 - fee_rate 计算、fee_min_amount
 * - P0-3-8: 实现 convertRedCoreShardToStarStone 便捷方法测试 - 红源晶碎片→星石
 * - P0-3-9: 实现数量限制测试 - min_from_amount、max_from_amount
 * - P0-3-10: 运行测试并修复问题
 *
 * 业务场景：
 * - 材料转换（红源晶碎片→星石等）
 * - 幂等性保护（防止重复转换）
 * - 手续费三方记账（用户扣减 + 用户入账 + 系统手续费入账）
 *
 * 创建时间：2026-01-29
 * 版本：1.0.0
 *
 * 技术栈：Jest + Sequelize + MySQL (真实数据库)
 *
 * 测试规范：
 * - 服务通过 global.getTestService('asset_conversion') 获取（J2-RepoWide 规范）
 * - 使用 snake_case service key（E2-Strict 规范）
 * - 所有写操作必须在事务内执行（TransactionManager 规范）
 * - 测试数据通过 global.testData 动态获取，不硬编码
 * - 测试完成后清理测试产生的数据
 *
 * @see services/AssetConversionService.js - 被测服务
 * @see models/MaterialConversionRule.js - 转换规则模型
 */

'use strict'

// 加载环境变量（测试环境）
require('dotenv').config()

const { sequelize, User, AssetTransaction } = require('../../models')
const TransactionManager = require('../../utils/TransactionManager')

/**
 * 🔴 通过 ServiceManager 获取服务（替代直接 require）
 * 注意：在 beforeAll 中获取服务，确保 ServiceManager 已初始化
 */
let AssetConversionService
// V4.7.0 AssetService 拆分：使用 BalanceService（2026-01-31）
let BalanceService

// 测试超时配置（30秒）
jest.setTimeout(30000)

describe('AssetConversionService - 资产转换服务单元测试', () => {
  // 测试数据
  let test_user_id
  let test_user

  // 测试过程中创建的数据（用于清理）
  const created_transactions = []

  /**
   * 生成唯一的幂等键
   *
   * @param {string} prefix - 前缀
   * @returns {string} 幂等键（格式：prefix_timestamp_random）
   */
  const generateIdempotencyKey = prefix => {
    return `${prefix}_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`
  }

  // ==================== 测试生命周期 ====================

  beforeAll(async () => {
    // 连接测试数据库
    await sequelize.authenticate()
    console.log('✅ 数据库连接成功')

    // 🔴 通过 ServiceManager 获取服务实例（snake_case key）
    AssetConversionService = global.getTestService('asset_conversion')
    // V4.7.0 AssetService 拆分：使用 BalanceService（2026-01-31）
    BalanceService = global.getTestService('asset_balance')

    if (!AssetConversionService) {
      // 直接 require（兜底方案）
      AssetConversionService = require('../../services/AssetConversionService')
      console.log('⚠️ AssetConversionService 未注册到 ServiceManager，使用直接 require')
    }

    // V4.7.0 AssetService 拆分：使用 BalanceService（2026-01-31）
    if (!BalanceService) {
      BalanceService = require('../../services/asset/BalanceService')
      console.log('⚠️ BalanceService 未注册到 ServiceManager，使用直接 require')
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

    // 确保 red_core_shard → star_stone 转换规则已启用（测试依赖）
    await sequelize.query(
      "UPDATE material_conversion_rules SET is_enabled = 1 WHERE from_asset_code = 'red_core_shard' AND to_asset_code = 'star_stone'"
    )
    console.log('✅ 测试前已启用 red_core_shard → star_stone 转换规则')
  })

  afterEach(async () => {
    /*
     * 每个测试后清理创建的测试数据
     * 按 asset_transaction_id（主键）清理测试创建的流水记录
     */
    for (const tx_id of created_transactions) {
      try {
        await AssetTransaction.destroy({ where: { asset_transaction_id: tx_id }, force: true })
      } catch (error) {
        // 忽略清理错误
      }
    }
    created_transactions.length = 0
  })

  afterAll(async () => {
    // 清理所有测试创建的流水记录（通过幂等键前缀识别）
    try {
      await AssetTransaction.destroy({
        where: {
          idempotency_key: {
            [require('sequelize').Op.like]: 'convert_test_%'
          }
        },
        force: true
      })
      console.log('✅ 测试流水记录已清理')
    } catch (error) {
      console.warn('⚠️ 测试流水清理失败:', error.message)
    }

    // 恢复转换规则到测试前状态（禁用）
    try {
      await sequelize.query(
        "UPDATE material_conversion_rules SET is_enabled = 0 WHERE from_asset_code = 'red_core_shard' AND to_asset_code = 'star_stone'"
      )
      console.log('✅ 测试后已恢复转换规则状态')
    } catch (_e) {
      // 忽略恢复错误
    }

    // 关闭数据库连接
    await sequelize.close()
    console.log('✅ 数据库连接已关闭')
  })

  // ==================== P0-3-6: 转换幂等性测试 ====================

  describe('P0-3-6: 转换幂等性测试 - 相同幂等键重复请求', () => {
    /**
     * 测试前置：确保测试用户有足够的 red_core_shard 余额
     */
    let initial_red_core_shard_balance
    let initial_star_stone_balance

    beforeAll(async () => {
      // 获取初始余额（只是记录，不做修改）
      try {
        const redShardBalance = await TransactionManager.execute(async transaction => {
          return await BalanceService.getBalance(
            { user_id: test_user_id, asset_code: 'red_core_shard' },
            { transaction }
          )
        })
        initial_red_core_shard_balance = redShardBalance?.available_amount || 0

        const diamondBalance = await TransactionManager.execute(async transaction => {
          return await BalanceService.getBalance(
            { user_id: test_user_id, asset_code: 'star_stone' },
            { transaction }
          )
        })
        initial_star_stone_balance = diamondBalance?.available_amount || 0

        console.log(
          `✅ 测试用户初始余额: red_core_shard=${initial_red_core_shard_balance}, star_stone=${initial_star_stone_balance}`
        )
      } catch (error) {
        console.warn('⚠️ 获取初始余额失败:', error.message)
        initial_red_core_shard_balance = 0
        initial_star_stone_balance = 0
      }
    })

    it('相同幂等键的首次转换应成功执行', async () => {
      /*
       * 业务场景：用户首次发起材料转换请求
       * 期望行为：
       * 1. 转换成功执行
       * 2. 返回 is_duplicate = false
       * 3. 源材料扣减 + 目标资产增加
       */

      // 先为用户增加足够的 red_core_shard（确保有余额可转换）
      const prepare_key = generateIdempotencyKey('convert_prepare')

      await TransactionManager.execute(async transaction => {
        await BalanceService.changeBalance(
          {
            user_id: test_user_id,
            asset_code: 'red_core_shard',
            delta_amount: 100, // 增加 100 个 red_core_shard
            idempotency_key: prepare_key,
            business_type: 'test_mint',
            counterpart_account_id: 2,
            meta: { test: true, purpose: '测试前置准备' }
          },
          { transaction }
        )
      })

      // 执行首次转换
      const idempotency_key = generateIdempotencyKey('convert_test')
      const from_amount = 5 // 转换 5 个 red_core_shard

      const result = await TransactionManager.execute(async transaction => {
        return await AssetConversionService.convertMaterial(
          test_user_id,
          'red_core_shard', // 源材料
          'star_stone', // 目标资产
          from_amount, // 转换数量
          {
            transaction,
            idempotency_key,
            title: '幂等性测试-首次转换'
          }
        )
      })

      // 记录创建的流水ID（用于清理）
      if (result.from_tx_id) created_transactions.push(result.from_tx_id)
      if (result.to_tx_id) created_transactions.push(result.to_tx_id)
      if (result.fee_tx_id) created_transactions.push(result.fee_tx_id)

      // 验证：首次转换成功
      expect(result).toBeDefined()
      expect(result.success).toBe(true)
      expect(result.is_duplicate).toBe(false)
      expect(result.from_amount).toBe(from_amount)
      expect(result.from_asset_code).toBe('red_core_shard')
      expect(result.to_asset_code).toBe('star_stone')
      expect(result.to_amount).toBeGreaterThan(0) // 应该转换出 star_stone
      expect(result.from_tx_id).toBeDefined()
      expect(result.to_tx_id).toBeDefined()
    })

    it('相同幂等键的重复请求（参数相同）应返回幂等结果', async () => {
      /*
       * 业务场景：用户重复提交相同的转换请求（网络超时重试等）
       * 期望行为：
       * 1. 不重复执行转换逻辑
       * 2. 返回首次转换的结果
       * 3. is_duplicate = true
       */

      // 先为用户增加足够的 red_core_shard
      const prepare_key = generateIdempotencyKey('convert_prepare')

      await TransactionManager.execute(async transaction => {
        await BalanceService.changeBalance(
          {
            user_id: test_user_id,
            asset_code: 'red_core_shard',
            delta_amount: 50,
            idempotency_key: prepare_key,
            business_type: 'test_mint',
            counterpart_account_id: 2,
            meta: { test: true }
          },
          { transaction }
        )
      })

      // 使用相同的幂等键执行两次转换
      const idempotency_key = generateIdempotencyKey('convert_dup_test')
      const from_amount = 2

      // 首次转换
      const first_result = await TransactionManager.execute(async transaction => {
        return await AssetConversionService.convertMaterial(
          test_user_id,
          'red_core_shard',
          'star_stone',
          from_amount,
          {
            transaction,
            idempotency_key,
            title: '幂等性测试-首次'
          }
        )
      })

      // 记录用于清理
      if (first_result.from_tx_id) created_transactions.push(first_result.from_tx_id)
      if (first_result.to_tx_id) created_transactions.push(first_result.to_tx_id)

      // 重复转换（相同参数）
      const second_result = await TransactionManager.execute(async transaction => {
        return await AssetConversionService.convertMaterial(
          test_user_id,
          'red_core_shard',
          'star_stone',
          from_amount, // 相同数量
          {
            transaction,
            idempotency_key, // 相同幂等键
            title: '幂等性测试-重复'
          }
        )
      })

      // 验证：重复请求返回幂等结果
      expect(second_result.success).toBe(true)
      expect(second_result.is_duplicate).toBe(true) // 关键：标记为重复
      // 使用字符串比较，因为MySQL可能返回字符串或数字
      expect(String(second_result.from_tx_id)).toBe(String(first_result.from_tx_id)) // 相同流水ID
      expect(String(second_result.to_tx_id)).toBe(String(first_result.to_tx_id))
      expect(second_result.from_amount).toBe(first_result.from_amount)
      expect(second_result.to_amount).toBe(first_result.to_amount)
    })

    it('相同幂等键但参数不同应返回409冲突错误', async () => {
      /*
       * 业务场景：恶意或错误重用幂等键
       * 期望行为：
       * 1. 拒绝执行
       * 2. 返回 409 Conflict 错误
       * 3. 错误码为 IDEMPOTENCY_KEY_CONFLICT
       */

      // 先为用户增加足够的 red_core_shard
      const prepare_key = generateIdempotencyKey('convert_prepare')

      await TransactionManager.execute(async transaction => {
        await BalanceService.changeBalance(
          {
            user_id: test_user_id,
            asset_code: 'red_core_shard',
            delta_amount: 100,
            idempotency_key: prepare_key,
            business_type: 'test_mint',
            counterpart_account_id: 2,
            meta: { test: true }
          },
          { transaction }
        )
      })

      const idempotency_key = generateIdempotencyKey('convert_conflict_test')

      // 首次转换（数量=3）
      const first_result = await TransactionManager.execute(async transaction => {
        return await AssetConversionService.convertMaterial(
          test_user_id,
          'red_core_shard',
          'star_stone',
          3, // 首次转换 3 个
          {
            transaction,
            idempotency_key,
            title: '冲突测试-首次'
          }
        )
      })

      // 记录用于清理
      if (first_result.from_tx_id) created_transactions.push(first_result.from_tx_id)
      if (first_result.to_tx_id) created_transactions.push(first_result.to_tx_id)

      // 重复转换（数量不同=5）
      await expect(
        TransactionManager.execute(async transaction => {
          return await AssetConversionService.convertMaterial(
            test_user_id,
            'red_core_shard',
            'star_stone',
            5, // 不同数量
            {
              transaction,
              idempotency_key, // 相同幂等键
              title: '冲突测试-不同参数'
            }
          )
        })
      ).rejects.toMatchObject({
        statusCode: 409,
        errorCode: 'IDEMPOTENCY_KEY_CONFLICT'
      })
    })

    it('不同幂等键的相同参数请求应独立执行', async () => {
      /*
       * 业务场景：用户多次独立发起转换（使用不同幂等键）
       * 期望行为：
       * 1. 两次转换都成功执行
       * 2. 两次都是 is_duplicate = false
       * 3. 生成不同的流水ID
       */

      // 先为用户增加足够的 red_core_shard
      const prepare_key = generateIdempotencyKey('convert_prepare')

      await TransactionManager.execute(async transaction => {
        await BalanceService.changeBalance(
          {
            user_id: test_user_id,
            asset_code: 'red_core_shard',
            delta_amount: 100,
            idempotency_key: prepare_key,
            business_type: 'test_mint',
            counterpart_account_id: 2,
            meta: { test: true }
          },
          { transaction }
        )
      })

      const from_amount = 2

      // 第一次转换
      const first_key = generateIdempotencyKey('convert_independent_1')
      const first_result = await TransactionManager.execute(async transaction => {
        return await AssetConversionService.convertMaterial(
          test_user_id,
          'red_core_shard',
          'star_stone',
          from_amount,
          {
            transaction,
            idempotency_key: first_key,
            title: '独立转换测试-第一次'
          }
        )
      })

      // 第二次转换（不同幂等键）
      const second_key = generateIdempotencyKey('convert_independent_2')
      const second_result = await TransactionManager.execute(async transaction => {
        return await AssetConversionService.convertMaterial(
          test_user_id,
          'red_core_shard',
          'star_stone',
          from_amount, // 相同参数
          {
            transaction,
            idempotency_key: second_key, // 不同幂等键
            title: '独立转换测试-第二次'
          }
        )
      })

      // 记录用于清理
      if (first_result.from_tx_id) created_transactions.push(first_result.from_tx_id)
      if (first_result.to_tx_id) created_transactions.push(first_result.to_tx_id)
      if (second_result.from_tx_id) created_transactions.push(second_result.from_tx_id)
      if (second_result.to_tx_id) created_transactions.push(second_result.to_tx_id)

      // 验证：两次都是独立执行
      expect(first_result.is_duplicate).toBe(false)
      expect(second_result.is_duplicate).toBe(false)
      expect(first_result.from_tx_id).not.toBe(second_result.from_tx_id)
      expect(first_result.to_tx_id).not.toBe(second_result.to_tx_id)
    })
  })

  // ==================== P0-3-7: 手续费计算测试 ====================

  describe('P0-3-7: 手续费计算测试 - fee_rate 计算、fee_min_amount', () => {
    /**
     * 测试前置：需要有带手续费配置的转换规则
     * 数据库中现有规则：red_core_shard → star_stone，fee_rate=0.0000（无手续费）
     * 测试需要临时创建带手续费的规则
     */

    let fee_rule_id

    beforeAll(async () => {
      // 查询是否有带手续费的规则
      const [existingFeeRules] = await sequelize.query(`
        SELECT material_conversion_rule_id, from_asset_code, to_asset_code, fee_rate, fee_min_amount 
        FROM material_conversion_rules 
        WHERE fee_rate > 0 AND is_enabled = 1
      `)

      if (existingFeeRules.length > 0) {
        fee_rule_id = existingFeeRules[0].material_conversion_rule_id
        console.log(
          `✅ 使用现有带手续费的规则: rule_id=${fee_rule_id}, fee_rate=${existingFeeRules[0].fee_rate}`
        )
      } else {
        // 创建临时带手续费的规则（用于测试）
        const [result] = await sequelize.query(`
          INSERT INTO material_conversion_rules 
          (from_asset_code, to_asset_code, from_amount, to_amount, 
           fee_rate, fee_min_amount, fee_asset_code, 
           min_from_amount, max_from_amount, 
           is_enabled, effective_at, title, rounding_mode, created_at, updated_at)
          VALUES 
          ('red_core_shard', 'star_stone', 1, 20, 
           0.05, 5, 'star_stone',
           1, 1000,
           1, NOW(), '测试手续费规则', 'floor', NOW(), NOW())
        `)
        fee_rule_id = result
        console.log(
          `✅ 创建测试手续费规则: rule_id=${fee_rule_id}, fee_rate=0.05, fee_min_amount=5`
        )
      }
    })

    afterAll(async () => {
      // 清理测试创建的规则（如果是新创建的）
      if (fee_rule_id && typeof fee_rule_id === 'number' && fee_rule_id > 1) {
        try {
          await sequelize.query(
            `DELETE FROM material_conversion_rules WHERE rule_id = ? AND title = '测试手续费规则'`,
            {
              replacements: [fee_rule_id]
            }
          )
          console.log(`✅ 清理测试规则: rule_id=${fee_rule_id}`)
        } catch (error) {
          console.warn('⚠️ 清理测试规则失败:', error.message)
        }
      }
    })

    it('_calculateConversion 应正确计算手续费（基于 fee_rate）', () => {
      /*
       * 业务场景：转换时收取手续费
       * 计算逻辑：
       * 1. gross_to_amount = (from_amount / rule.from_amount) * rule.to_amount
       * 2. fee_amount = max(gross_to_amount * fee_rate, fee_min_amount)
       * 3. net_to_amount = gross_to_amount - fee_amount
       */

      // 构造测试规则对象
      const mockRule = {
        from_amount: 1,
        to_amount: 20,
        fee_rate: 0.05, // 5% 手续费
        fee_min_amount: 0,
        fee_asset_code: 'star_stone',
        rounding_mode: 'floor'
      }

      // 转换 10 个 red_core_shard
      const from_amount = 10

      // 调用内部计算方法
      const result = AssetConversionService._calculateConversion(from_amount, mockRule)

      /*
       * 验证计算结果
       * gross_to_amount = (10 / 1) * 20 = 200
       */
      expect(result.gross_to_amount).toBe(200)

      // fee_amount = floor(200 * 0.05) = 10
      expect(result.fee_amount).toBe(10)

      // net_to_amount = 200 - 10 = 190
      expect(result.net_to_amount).toBe(190)

      expect(result.fee_asset_code).toBe('star_stone')
    })

    it('_calculateConversion 应应用最低手续费（fee_min_amount）', () => {
      /*
       * 业务场景：当计算出的手续费低于最低手续费时，使用最低手续费
       */

      const mockRule = {
        from_amount: 1,
        to_amount: 20,
        fee_rate: 0.01, // 1% 手续费
        fee_min_amount: 10, // 最低手续费 10
        fee_asset_code: 'star_stone',
        rounding_mode: 'floor'
      }

      // 转换 2 个 red_core_shard
      const from_amount = 2

      const result = AssetConversionService._calculateConversion(from_amount, mockRule)

      // gross_to_amount = (2 / 1) * 20 = 40
      expect(result.gross_to_amount).toBe(40)

      /*
       * 计算手续费 = floor(40 * 0.01) = 0，但最低手续费 = 10
       * fee_amount = max(0, 10) = 10
       */
      expect(result.fee_amount).toBe(10)

      // net_to_amount = 40 - 10 = 30
      expect(result.net_to_amount).toBe(30)
    })

    it('_calculateConversion 无手续费时应返回 fee_amount=0', () => {
      /*
       * 业务场景：规则配置无手续费
       */

      const mockRule = {
        from_amount: 1,
        to_amount: 20,
        fee_rate: 0, // 无手续费
        fee_min_amount: 0,
        fee_asset_code: null,
        rounding_mode: 'floor'
      }

      const from_amount = 5

      const result = AssetConversionService._calculateConversion(from_amount, mockRule)

      // gross_to_amount = (5 / 1) * 20 = 100
      expect(result.gross_to_amount).toBe(100)

      // fee_amount = 0（无手续费）
      expect(result.fee_amount).toBe(0)

      // net_to_amount = 100 - 0 = 100
      expect(result.net_to_amount).toBe(100)
    })

    it('_calculateConversion 应正确应用舍入模式（floor/ceil/round）', () => {
      /*
       * 业务场景：转换数量不能整除时的舍入处理
       */

      const baseRule = {
        from_amount: 3, // 3 个 red_core_shard
        to_amount: 50, // 转换为 50 个 star_stone
        fee_rate: 0,
        fee_min_amount: 0,
        rounding_mode: 'floor'
      }

      // 转换 10 个（10/3 = 3.33...）
      const from_amount = 10

      // floor 模式：向下取整
      const floor_result = AssetConversionService._calculateConversion(from_amount, {
        ...baseRule,
        rounding_mode: 'floor'
      })
      // (10/3) * 50 = 166.67 → floor = 166
      expect(floor_result.gross_to_amount).toBe(166)

      // ceil 模式：向上取整
      const ceil_result = AssetConversionService._calculateConversion(from_amount, {
        ...baseRule,
        rounding_mode: 'ceil'
      })
      // (10/3) * 50 = 166.67 → ceil = 167
      expect(ceil_result.gross_to_amount).toBe(167)

      // round 模式：四舍五入
      const round_result = AssetConversionService._calculateConversion(from_amount, {
        ...baseRule,
        rounding_mode: 'round'
      })
      // (10/3) * 50 = 166.67 → round = 167
      expect(round_result.gross_to_amount).toBe(167)
    })
  })

  // ==================== P0-3-8: convertRedCoreShardToStarStone 便捷方法测试 ====================

  describe('P0-3-8: convertRedCoreShardToStarStone 便捷方法测试 - 红源晶碎片→星石', () => {
    it('应该成功将红源晶碎片转换为星石', async () => {
      /*
       * 业务场景：用户使用便捷方法将红源晶碎片分解为星石
       * 期望行为：
       * 1. 调用内部 convertMaterial 方法
       * 2. 固定源材料：red_core_shard
       * 3. 固定目标资产：star_stone
       */

      // 先为用户增加足够的 red_core_shard
      const prepare_key = generateIdempotencyKey('convert_prepare')

      await TransactionManager.execute(async transaction => {
        await BalanceService.changeBalance(
          {
            user_id: test_user_id,
            asset_code: 'red_core_shard',
            delta_amount: 50,
            idempotency_key: prepare_key,
            business_type: 'test_mint',
            counterpart_account_id: 2,
            meta: { test: true }
          },
          { transaction }
        )
      })

      const idempotency_key = generateIdempotencyKey('convert_convenient')
      const red_core_shard_amount = 3

      // 使用便捷方法
      const result = await TransactionManager.execute(async transaction => {
        return await AssetConversionService.convertRedCoreShardToStarStone(
          test_user_id,
          red_core_shard_amount,
          {
            transaction,
            idempotency_key
          }
        )
      })

      // 记录用于清理
      if (result.from_tx_id) created_transactions.push(result.from_tx_id)
      if (result.to_tx_id) created_transactions.push(result.to_tx_id)
      if (result.fee_tx_id) created_transactions.push(result.fee_tx_id)

      // 验证
      expect(result.success).toBe(true)
      expect(result.from_asset_code).toBe('red_core_shard')
      expect(result.to_asset_code).toBe('star_stone')
      expect(result.from_amount).toBe(red_core_shard_amount)
      expect(result.to_amount).toBeGreaterThan(0)
    })

    it('便捷方法缺少幂等键应抛出错误', async () => {
      /*
       * 业务场景：调用便捷方法时未提供幂等键
       * 期望行为：抛出参数错误
       */

      await expect(
        TransactionManager.execute(async transaction => {
          return await AssetConversionService.convertRedCoreShardToStarStone(
            test_user_id,
            5,
            { transaction } // 缺少 idempotency_key
          )
        })
      ).rejects.toThrow('idempotency_key不能为空')
    })

    it('便捷方法应自动设置默认标题', async () => {
      /*
       * 业务场景：未指定标题时使用默认标题
       */

      // 准备余额
      const prepare_key = generateIdempotencyKey('convert_prepare')

      await TransactionManager.execute(async transaction => {
        await BalanceService.changeBalance(
          {
            user_id: test_user_id,
            asset_code: 'red_core_shard',
            delta_amount: 50,
            idempotency_key: prepare_key,
            business_type: 'test_mint',
            counterpart_account_id: 2,
            meta: { test: true }
          },
          { transaction }
        )
      })

      const idempotency_key = generateIdempotencyKey('convert_title_test')

      const result = await TransactionManager.execute(async transaction => {
        return await AssetConversionService.convertRedCoreShardToStarStone(test_user_id, 2, {
          transaction,
          idempotency_key
          // 不传 title
        })
      })

      // 记录用于清理
      if (result.from_tx_id) created_transactions.push(result.from_tx_id)
      if (result.to_tx_id) created_transactions.push(result.to_tx_id)

      // 验证：应有标题（来自规则或默认）
      expect(result.title).toBeDefined()
    })
  })

  // ==================== P0-3-9: 数量限制测试 ====================

  describe('P0-3-9: 数量限制测试 - min_from_amount、max_from_amount', () => {
    it('转换数量低于最小限制应抛出错误', async () => {
      /*
       * 业务场景：用户尝试转换低于最小数量的材料
       * 期望行为：
       * 1. 拒绝转换
       * 2. 错误码为 AMOUNT_BELOW_MINIMUM
       */

      // 准备余额
      const prepare_key = generateIdempotencyKey('convert_prepare')

      await TransactionManager.execute(async transaction => {
        await BalanceService.changeBalance(
          {
            user_id: test_user_id,
            asset_code: 'red_core_shard',
            delta_amount: 100,
            idempotency_key: prepare_key,
            business_type: 'test_mint',
            counterpart_account_id: 2,
            meta: { test: true }
          },
          { transaction }
        )
      })

      // 获取规则的最小数量限制
      const [rules] = await sequelize.query(`
        SELECT min_from_amount FROM material_conversion_rules 
        WHERE from_asset_code = 'red_core_shard' AND to_asset_code = 'star_stone' AND is_enabled = 1
        LIMIT 1
      `)

      const min_amount = rules[0]?.min_from_amount || 1

      // 如果最小限制是 1，则跳过此测试（无法测试低于1的情况）
      if (min_amount <= 1) {
        console.log('⚠️ 规则最小限制为 1，跳过最小数量测试')
        return
      }

      const idempotency_key = generateIdempotencyKey('convert_min_test')

      // 尝试转换低于最小限制的数量
      await expect(
        TransactionManager.execute(async transaction => {
          return await AssetConversionService.convertMaterial(
            test_user_id,
            'red_core_shard',
            'star_stone',
            min_amount - 1, // 低于最小限制
            {
              transaction,
              idempotency_key
            }
          )
        })
      ).rejects.toMatchObject({
        errorCode: 'AMOUNT_BELOW_MINIMUM'
      })
    })

    it('转换数量超过最大限制应抛出错误', async () => {
      /*
       * 业务场景：用户尝试转换超过最大数量的材料
       * 期望行为：
       * 1. 拒绝转换
       * 2. 错误码为 AMOUNT_ABOVE_MAXIMUM
       */

      // 获取规则的最大数量限制
      const [rules] = await sequelize.query(`
        SELECT max_from_amount FROM material_conversion_rules 
        WHERE from_asset_code = 'red_core_shard' AND to_asset_code = 'star_stone' AND is_enabled = 1
        LIMIT 1
      `)

      const max_amount = rules[0]?.max_from_amount

      // 如果没有最大限制（null），则跳过此测试
      if (!max_amount) {
        console.log('⚠️ 规则无最大数量限制，跳过最大数量测试')
        return
      }

      // 准备大量余额（超过最大限制）
      const prepare_key = generateIdempotencyKey('convert_prepare')

      await TransactionManager.execute(async transaction => {
        await BalanceService.changeBalance(
          {
            user_id: test_user_id,
            asset_code: 'red_core_shard',
            delta_amount: max_amount + 100,
            idempotency_key: prepare_key,
            business_type: 'test_mint',
            counterpart_account_id: 2,
            meta: { test: true }
          },
          { transaction }
        )
      })

      const idempotency_key = generateIdempotencyKey('convert_max_test')

      // 尝试转换超过最大限制的数量
      await expect(
        TransactionManager.execute(async transaction => {
          return await AssetConversionService.convertMaterial(
            test_user_id,
            'red_core_shard',
            'star_stone',
            max_amount + 1, // 超过最大限制
            {
              transaction,
              idempotency_key
            }
          )
        })
      ).rejects.toMatchObject({
        errorCode: 'AMOUNT_ABOVE_MAXIMUM'
      })
    })

    it('转换数量在限制范围内应成功执行', async () => {
      /*
       * 业务场景：用户转换数量在合法范围内
       * 期望行为：转换成功
       */

      // 准备余额
      const prepare_key = generateIdempotencyKey('convert_prepare')

      await TransactionManager.execute(async transaction => {
        await BalanceService.changeBalance(
          {
            user_id: test_user_id,
            asset_code: 'red_core_shard',
            delta_amount: 50,
            idempotency_key: prepare_key,
            business_type: 'test_mint',
            counterpart_account_id: 2,
            meta: { test: true }
          },
          { transaction }
        )
      })

      // 获取规则的数量限制
      const [rules] = await sequelize.query(`
        SELECT min_from_amount, max_from_amount FROM material_conversion_rules 
        WHERE from_asset_code = 'red_core_shard' AND to_asset_code = 'star_stone' AND is_enabled = 1
        LIMIT 1
      `)

      const min_amount = rules[0]?.min_from_amount || 1
      const max_amount = rules[0]?.max_from_amount || 10000

      // 选择一个在范围内的数量
      const valid_amount = Math.min(min_amount + 1, max_amount - 1, 10)

      const idempotency_key = generateIdempotencyKey('convert_valid_range')

      const result = await TransactionManager.execute(async transaction => {
        return await AssetConversionService.convertMaterial(
          test_user_id,
          'red_core_shard',
          'star_stone',
          valid_amount,
          {
            transaction,
            idempotency_key
          }
        )
      })

      // 记录用于清理
      if (result.from_tx_id) created_transactions.push(result.from_tx_id)
      if (result.to_tx_id) created_transactions.push(result.to_tx_id)

      // 验证：转换成功
      expect(result.success).toBe(true)
      expect(result.from_amount).toBe(valid_amount)
    })

    it('转换数量为0应抛出参数错误', async () => {
      /*
       * 业务场景：用户传入无效的转换数量
       * 期望行为：参数校验失败
       */

      const idempotency_key = generateIdempotencyKey('convert_zero')

      await expect(
        TransactionManager.execute(async transaction => {
          return await AssetConversionService.convertMaterial(
            test_user_id,
            'red_core_shard',
            'star_stone',
            0, // 无效数量
            {
              transaction,
              idempotency_key
            }
          )
        })
      ).rejects.toThrow('转换数量必须大于0')
    })

    it('转换数量为负数应抛出参数错误', async () => {
      /*
       * 业务场景：用户传入负数的转换数量
       * 期望行为：参数校验失败
       */

      const idempotency_key = generateIdempotencyKey('convert_negative')

      await expect(
        TransactionManager.execute(async transaction => {
          return await AssetConversionService.convertMaterial(
            test_user_id,
            'red_core_shard',
            'star_stone',
            -5, // 负数
            {
              transaction,
              idempotency_key
            }
          )
        })
      ).rejects.toThrow('转换数量必须大于0')
    })
  })

  // ==================== P0-3-4: 错误处理测试 - 余额不足 ====================

  describe('P0-3-4: 余额不足错误测试', () => {
    it('材料余额不足时应抛出 INSUFFICIENT_BALANCE 错误', async () => {
      /*
       * 业务场景：用户尝试转换数量超过其持有量的材料
       * 期望行为：拒绝转换，抛出余额不足错误
       *
       * 策略：先把余额降到很低（3），再尝试转换 5。
       * 5 ≤ 任何 max_from_amount 限制（不触发超限），5 > 3（触发余额不足）
       */

      // 获取当前余额
      const balanceResult = await TransactionManager.execute(async transaction => {
        return await BalanceService.getBalance(
          { user_id: test_user_id, asset_code: 'red_core_shard' },
          { transaction }
        )
      })
      const current_balance = Number(balanceResult?.available_amount || 0)

      // 先把余额降到 3，确保后续转换 5 时触发"余额不足"
      const target_balance = 3
      if (current_balance > target_balance) {
        const reduction = current_balance - target_balance
        await TransactionManager.execute(async transaction => {
          await BalanceService.changeBalance(
            {
              user_id: test_user_id,
              asset_code: 'red_core_shard',
              delta_amount: -reduction,
              idempotency_key: generateIdempotencyKey('reduce_for_insufficient_test'),
              business_type: 'test_burn',
              counterpart_account_id: 2,
              meta: { test: true, purpose: '余额不足测试准备' }
            },
            { transaction }
          )
        })
      }

      // 转换 5 > 余额 3 → 应触发余额不足（5 远小于 max_from_amount，不会触发超限）
      const idempotency_key = generateIdempotencyKey('convert_insufficient')

      await expect(
        TransactionManager.execute(async transaction => {
          return await AssetConversionService.convertMaterial(
            test_user_id,
            'red_core_shard',
            'star_stone',
            5,
            {
              transaction,
              idempotency_key
            }
          )
        })
      ).rejects.toThrow(/余额不足|INSUFFICIENT_BALANCE|可用余额不足/)
    })

    it('余额刚好等于转换数量时应成功执行', async () => {
      /*
       * 边界场景：用户的余额刚好等于要转换的数量
       * 期望行为：转换成功
       */

      // 先创建一个新用户或清空余额后增加精确数量
      const exact_amount = 5
      const prepare_key = generateIdempotencyKey('convert_prepare_exact')

      // 增加精确数量的红源晶碎片
      await TransactionManager.execute(async transaction => {
        await BalanceService.changeBalance(
          {
            user_id: test_user_id,
            asset_code: 'red_core_shard',
            delta_amount: exact_amount,
            idempotency_key: prepare_key,
            business_type: 'test_mint',
            counterpart_account_id: 2,
            meta: { test: true, purpose: '边界测试准备' }
          },
          { transaction }
        )
      })

      // 获取增加后的余额
      const balanceResult = await TransactionManager.execute(async transaction => {
        return await BalanceService.getBalance(
          { user_id: test_user_id, asset_code: 'red_core_shard' },
          { transaction }
        )
      })

      const current_balance = Number(balanceResult?.available_amount || 0)

      // 转换刚好等于当前余额的数量（最多转换10个以避免测试数据污染）
      const convert_amount = Math.min(current_balance, 10)
      const idempotency_key = generateIdempotencyKey('convert_exact_balance')

      const result = await TransactionManager.execute(async transaction => {
        return await AssetConversionService.convertMaterial(
          test_user_id,
          'red_core_shard',
          'star_stone',
          convert_amount,
          {
            transaction,
            idempotency_key
          }
        )
      })

      // 记录用于清理
      if (result.from_tx_id) created_transactions.push(result.from_tx_id)
      if (result.to_tx_id) created_transactions.push(result.to_tx_id)

      // 验证：转换成功
      expect(result.success).toBe(true)
      expect(result.from_amount).toBe(convert_amount)
    })
  })

  // ==================== P0-3-5: 事务边界测试 ====================

  describe('P0-3-5: 事务边界测试', () => {
    describe('无事务报错', () => {
      it('convertMaterial 无事务调用应抛出 TRANSACTION_REQUIRED 错误', async () => {
        /*
         * 业务场景：开发者误用 - 调用写操作方法时未传入事务
         * 期望行为：
         * 1. 立即拒绝执行
         * 2. 抛出事务边界错误
         *
         * 设计原则：所有写操作必须显式在事务内执行，防止数据不一致
         */

        const idempotency_key = generateIdempotencyKey('convert_no_tx')

        await expect(
          // 注意：直接调用，不在 TransactionManager.execute 内
          AssetConversionService.convertMaterial(test_user_id, 'red_core_shard', 'star_stone', 5, {
            idempotency_key
            // 没有 transaction 参数
          })
        ).rejects.toThrow(/事务边界|TRANSACTION_REQUIRED|必须在事务中/)
      })

      it('convertRedCoreShardToStarStone 便捷方法无事务调用应抛出错误', async () => {
        /*
         * 便捷方法同样需要事务边界检查
         */

        const idempotency_key = generateIdempotencyKey('convert_shortcut_no_tx')

        await expect(
          AssetConversionService.convertRedCoreShardToStarStone(test_user_id, 5, {
            idempotency_key
            // 没有 transaction 参数
          })
        ).rejects.toThrow(/事务边界|TRANSACTION_REQUIRED|必须在事务中/)
      })
    })

    describe('事务回滚验证', () => {
      it('事务中发生错误应完全回滚所有变更', async () => {
        /*
         * 业务场景：转换过程中发生错误
         * 期望行为：
         * 1. 所有变更都应回滚
         * 2. 用户余额保持不变
         */

        // 记录初始余额
        const initial_shard_result = await TransactionManager.execute(async transaction => {
          return await BalanceService.getBalance(
            { user_id: test_user_id, asset_code: 'red_core_shard' },
            { transaction }
          )
        })
        const initial_diamond_result = await TransactionManager.execute(async transaction => {
          return await BalanceService.getBalance(
            { user_id: test_user_id, asset_code: 'star_stone' },
            { transaction }
          )
        })

        const initial_shard_amount = Number(initial_shard_result?.available_amount || 0)
        const initial_diamond_amount = Number(initial_diamond_result?.available_amount || 0)

        // 模拟事务中途失败的场景
        try {
          await TransactionManager.execute(async transaction => {
            // 先增加一些红源晶碎片
            await BalanceService.changeBalance(
              {
                user_id: test_user_id,
                asset_code: 'red_core_shard',
                delta_amount: 50,
                idempotency_key: generateIdempotencyKey('rollback_test_mint'),
                business_type: 'test_mint',
                counterpart_account_id: 2,
                meta: { test: true }
              },
              { transaction }
            )

            // 执行转换
            await AssetConversionService.convertMaterial(
              test_user_id,
              'red_core_shard',
              'star_stone',
              5,
              {
                transaction,
                idempotency_key: generateIdempotencyKey('rollback_test_convert')
              }
            )

            // 故意抛出错误以触发回滚
            throw new Error('测试事务回滚 - 模拟业务错误')
          })
        } catch (error) {
          // 预期捕获错误
          expect(error.message).toBe('测试事务回滚 - 模拟业务错误')
        }

        // 验证：余额应与初始状态一致（所有变更已回滚）
        const after_shard_result = await TransactionManager.execute(async transaction => {
          return await BalanceService.getBalance(
            { user_id: test_user_id, asset_code: 'red_core_shard' },
            { transaction }
          )
        })
        const after_diamond_result = await TransactionManager.execute(async transaction => {
          return await BalanceService.getBalance(
            { user_id: test_user_id, asset_code: 'star_stone' },
            { transaction }
          )
        })

        const after_shard_amount = Number(after_shard_result?.available_amount || 0)
        const after_diamond_amount = Number(after_diamond_result?.available_amount || 0)

        // 关键断言：余额应完全一致
        expect(after_shard_amount).toBe(initial_shard_amount)
        expect(after_diamond_amount).toBe(initial_diamond_amount)
      })

      it('成功的转换事务应正确提交', async () => {
        /*
         * 正向验证：成功的事务应该持久化变更
         */

        // 记录初始余额
        const initial_shard_result = await TransactionManager.execute(async transaction => {
          return await BalanceService.getBalance(
            { user_id: test_user_id, asset_code: 'red_core_shard' },
            { transaction }
          )
        })
        const initial_diamond_result = await TransactionManager.execute(async transaction => {
          return await BalanceService.getBalance(
            { user_id: test_user_id, asset_code: 'star_stone' },
            { transaction }
          )
        })

        const initial_shard_amount = Number(initial_shard_result?.available_amount || 0)
        const initial_diamond_amount = Number(initial_diamond_result?.available_amount || 0)

        // 准备余额
        const prepare_amount = 50
        await TransactionManager.execute(async transaction => {
          await BalanceService.changeBalance(
            {
              user_id: test_user_id,
              asset_code: 'red_core_shard',
              delta_amount: prepare_amount,
              idempotency_key: generateIdempotencyKey('commit_test_mint'),
              business_type: 'test_mint',
              counterpart_account_id: 2,
              meta: { test: true }
            },
            { transaction }
          )
        })

        // 执行转换
        const convert_amount = 5
        const result = await TransactionManager.execute(async transaction => {
          return await AssetConversionService.convertMaterial(
            test_user_id,
            'red_core_shard',
            'star_stone',
            convert_amount,
            {
              transaction,
              idempotency_key: generateIdempotencyKey('commit_test_convert')
            }
          )
        })

        // 记录用于清理
        if (result.from_tx_id) created_transactions.push(result.from_tx_id)
        if (result.to_tx_id) created_transactions.push(result.to_tx_id)

        // 验证：事务已提交，余额已变更
        const after_shard_result = await TransactionManager.execute(async transaction => {
          return await BalanceService.getBalance(
            { user_id: test_user_id, asset_code: 'red_core_shard' },
            { transaction }
          )
        })
        const after_diamond_result = await TransactionManager.execute(async transaction => {
          return await BalanceService.getBalance(
            { user_id: test_user_id, asset_code: 'star_stone' },
            { transaction }
          )
        })

        const after_shard_amount = Number(after_shard_result?.available_amount || 0)
        const after_diamond_amount = Number(after_diamond_result?.available_amount || 0)

        /*
         * 关键断言：余额应该正确变更
         * 红源晶碎片：初始 + 准备 - 转换
         */
        expect(after_shard_amount).toBe(initial_shard_amount + prepare_amount - convert_amount)
        // 星石：初始 + 转换产出
        expect(after_diamond_amount).toBe(initial_diamond_amount + result.to_amount)
      })
    })
  })

  // ==================== 附加测试：基础参数验证 ====================

  describe('基础参数验证测试', () => {
    it('缺少 idempotency_key 应抛出错误', async () => {
      await expect(
        TransactionManager.execute(async transaction => {
          return await AssetConversionService.convertMaterial(
            test_user_id,
            'red_core_shard',
            'star_stone',
            5,
            { transaction } // 缺少 idempotency_key
          )
        })
      ).rejects.toThrow('idempotency_key不能为空')
    })

    it('无效的 user_id 应抛出错误', async () => {
      const idempotency_key = generateIdempotencyKey('convert_invalid_user')

      await expect(
        TransactionManager.execute(async transaction => {
          return await AssetConversionService.convertMaterial(
            0, // 无效 user_id
            'red_core_shard',
            'star_stone',
            5,
            { transaction, idempotency_key }
          )
        })
      ).rejects.toThrow('用户ID无效')
    })

    it('空的源材料代码应抛出错误', async () => {
      const idempotency_key = generateIdempotencyKey('convert_empty_from')

      await expect(
        TransactionManager.execute(async transaction => {
          return await AssetConversionService.convertMaterial(
            test_user_id,
            '', // 空源材料
            'star_stone',
            5,
            { transaction, idempotency_key }
          )
        })
      ).rejects.toThrow('源材料资产代码不能为空')
    })

    it('空的目标资产代码应抛出错误', async () => {
      const idempotency_key = generateIdempotencyKey('convert_empty_to')

      await expect(
        TransactionManager.execute(async transaction => {
          return await AssetConversionService.convertMaterial(
            test_user_id,
            'red_core_shard',
            '', // 空目标资产
            5,
            { transaction, idempotency_key }
          )
        })
      ).rejects.toThrow('目标资产代码不能为空')
    })

    it('不存在的转换规则应抛出错误', async () => {
      const idempotency_key = generateIdempotencyKey('convert_no_rule')

      await expect(
        TransactionManager.execute(async transaction => {
          return await AssetConversionService.convertMaterial(
            test_user_id,
            'nonexistent_material', // 不存在的材料
            'star_stone',
            5,
            { transaction, idempotency_key }
          )
        })
      ).rejects.toMatchObject({
        errorCode: 'RULE_NOT_FOUND'
      })
    })
  })

  // ==================== 附加测试：getConversionRules 测试 ====================

  describe('getConversionRules - 获取转换规则列表', () => {
    it('应返回所有启用的转换规则', async () => {
      const rules = await AssetConversionService.getConversionRules()

      // 验证返回数组
      expect(Array.isArray(rules)).toBe(true)

      // 如果有规则，验证规则结构
      if (rules.length > 0) {
        const rule = rules[0]
        expect(rule.from_asset_code).toBeDefined()
        expect(rule.to_asset_code).toBeDefined()
        expect(rule.from_amount).toBeDefined()
        expect(rule.to_amount).toBeDefined()
        // MySQL TINYINT(1) 返回整数 1 而不是布尔 true
        expect(Number(rule.is_enabled)).toBe(1) // 只返回启用的规则
      }
    })

    it('应支持 visible_only 过滤', async () => {
      const visibleRules = await AssetConversionService.getConversionRules({
        visible_only: true
      })

      // 验证返回数组
      expect(Array.isArray(visibleRules)).toBe(true)

      /*
       * 如果有规则，验证都是前端可见的
       * MySQL TINYINT(1) 返回整数 1 而不是布尔 true
       */
      visibleRules.forEach(rule => {
        expect(Number(rule.is_visible)).toBe(1)
      })
    })

    it('应支持 as_of_time 时间点查询', async () => {
      const pastTime = new Date('2020-01-01')

      const pastRules = await AssetConversionService.getConversionRules({
        as_of_time: pastTime
      })

      // 验证返回数组（可能为空，因为2020年可能没有规则）
      expect(Array.isArray(pastRules)).toBe(true)
    })
  })
})
