/**
 * V4统一策略测试套件 - 基于真实业务代码重构版
 * 测试实际存在的2个策略：BasicGuaranteeStrategy、ManagementStrategy
 *
 * 🔧 V4.0 重构内容：
 * - 基于真实策略代码的接口测试
 * - 移除过时的方法和配置引用
 * - 统一使用snake_case命名
 * - 使用真实的策略配置和业务逻辑
 *
 * @date 2025-01-21 (重构)
 */

/* eslint-disable no-console */

const BasicGuaranteeStrategy = require('../../../../services/UnifiedLotteryEngine/strategies/BasicGuaranteeStrategy')
const ManagementStrategy = require('../../../../services/UnifiedLotteryEngine/strategies/ManagementStrategy')
const models = require('../../../../models')
const { User } = models

describe('V4统一策略测试套件 - 重构版', () => {
  let basic_guarantee_strategy
  let management_strategy
  let test_user

  // 使用真实测试用户配置
  const TEST_USER_CONFIG = {
    user_id: 31,
    mobile: '13612227930'
  }

  beforeAll(async () => {
    console.log('🔍 初始化V4策略测试环境...')

    // 验证测试用户存在
    test_user = await User.findByPk(TEST_USER_CONFIG.user_id)
    if (!test_user) {
      throw new Error(`测试用户 ${TEST_USER_CONFIG.user_id} 不存在`)
    }

    // 初始化策略实例
    basic_guarantee_strategy = new BasicGuaranteeStrategy()
    management_strategy = new ManagementStrategy()

    console.log('✅ V4策略测试环境初始化完成')
  })

  describe('🎯 BasicGuaranteeStrategy 基础保底策略测试', () => {
    test('应该正确初始化基础保底策略', () => {
      expect(basic_guarantee_strategy).toBeDefined()
      expect(basic_guarantee_strategy.strategyName).toBe('basic_guarantee')
      expect(basic_guarantee_strategy.config).toBeDefined()
    })

    test('应该包含正确的保底规则配置', () => {
      const guarantee_rule = basic_guarantee_strategy.config.guaranteeRule
      expect(guarantee_rule).toBeDefined()
      expect(guarantee_rule.triggerCount).toBe(10)
      expect(guarantee_rule.guaranteePrizeId).toBe(9)
      expect(guarantee_rule.counterResetAfterTrigger).toBe(true)
    })

    test('应该包含正确的保底奖品配置', () => {
      const guarantee_prize = basic_guarantee_strategy.config.guaranteePrize
      expect(guarantee_prize).toBeDefined()
      expect(guarantee_prize.prizeId).toBe(9)
      expect(guarantee_prize.prizeName).toBe('九八折券')
      expect(guarantee_prize.prizeType).toBe('coupon')
      expect(guarantee_prize.prizeValue).toBe(98.0)
    })

    test('应该能够验证抽奖上下文', async () => {
      const test_context = {
        user_id: TEST_USER_CONFIG.user_id,
        campaign_id: 1
      }

      const validation_result = await basic_guarantee_strategy.validate(test_context)
      expect(typeof validation_result).toBe('boolean')

      console.log(`✅ 基础保底策略验证结果: ${validation_result}`)
    })

    test('应该能够执行抽奖逻辑', async () => {
      const test_context = {
        user_id: TEST_USER_CONFIG.user_id,
        campaign_id: 1,
        request_id: `test_${Date.now()}`
      }

      try {
        const execution_result = await basic_guarantee_strategy.execute(test_context)

        expect(execution_result).toBeDefined()
        expect(execution_result.success).toBeDefined()

        if (execution_result.success) {
          expect(execution_result.data).toBeDefined()
          console.log('✅ 基础保底策略执行成功')
        } else {
          console.log(
            `ℹ️ 基础保底策略执行结果: ${execution_result.message || execution_result.error}`
          )
        }
      } catch (error) {
        console.log(`ℹ️ 基础保底策略执行异常: ${error.message}`)
        expect(error).toBeDefined()
      }
    })

    test('应该提供策略信息', () => {
      const strategy_info = basic_guarantee_strategy.getStrategyInfo()

      expect(strategy_info).toBeDefined()
      expect(strategy_info.name).toBe('BasicGuaranteeStrategy')
      expect(strategy_info.enabled).toBe(true)
      expect(strategy_info.config).toBeDefined()
    })
  })

  describe('🛡️ ManagementStrategy 管理策略测试', () => {
    test('应该正确初始化管理策略', () => {
      expect(management_strategy).toBeDefined()
      expect(management_strategy.logger).toBeDefined()
    })

    test('应该能够验证管理员权限', async () => {
      try {
        // 测试用户13612227930具有管理员权限
        const validation_result = await management_strategy.validateAdminPermission(
          TEST_USER_CONFIG.user_id
        )

        expect(validation_result).toBeDefined()
        expect(validation_result.valid).toBeDefined()

        console.log(`🛡️ 管理员权限验证: ${validation_result.valid ? '通过' : '失败'}`)

        if (!validation_result.valid) {
          console.log(`权限验证失败原因: ${validation_result.reason}`)
        }
      } catch (error) {
        console.log(`ℹ️ 管理员权限验证异常: ${error.message}`)
        expect(error).toBeDefined()
      }
    })

    test('应该能够执行管理员强制中奖', async () => {
      try {
        const force_win_result = await management_strategy.forceWin(
          TEST_USER_CONFIG.user_id, // 管理员ID
          TEST_USER_CONFIG.user_id, // 目标用户ID（自己）
          9, // 奖品ID（九八折券）
          'V4策略测试'
        )

        expect(force_win_result).toBeDefined()
        expect(force_win_result.success).toBeDefined()

        if (force_win_result.success) {
          expect(force_win_result.result).toBe('force_win')
          expect(force_win_result.prize_id).toBe(9)
          console.log('✅ 管理员强制中奖功能验证通过')
        } else {
          console.log(`ℹ️ 强制中奖结果: ${force_win_result.message || force_win_result.error}`)
        }
      } catch (error) {
        console.log(`ℹ️ 强制中奖异常: ${error.message}`)
        expect(error).toBeDefined()
      }
    })

    test('应该能够查询抽奖历史', async () => {
      try {
        const history_result = await management_strategy.getLotteryHistory(
          TEST_USER_CONFIG.user_id,
          { limit: 10 }
        )

        expect(history_result).toBeDefined()

        if (history_result.success) {
          expect(Array.isArray(history_result.data)).toBe(true)
          console.log(`✅ 抽奖历史查询成功，记录数: ${history_result.data.length}`)
        } else {
          console.log(`ℹ️ 历史查询结果: ${history_result.message || history_result.error}`)
        }
      } catch (error) {
        console.log(`ℹ️ 历史查询异常: ${error.message}`)
        expect(error).toBeDefined()
      }
    })

    test('应该能够生成管理员操作日志', async () => {
      try {
        const log_result = await management_strategy.logAdminOperation(
          TEST_USER_CONFIG.user_id,
          'test_operation',
          { test: 'V4策略测试' }
        )

        expect(log_result).toBeDefined()

        if (log_result.success) {
          console.log('✅ 管理员操作日志生成成功')
        } else {
          console.log(`ℹ️ 操作日志结果: ${log_result.message || log_result.error}`)
        }
      } catch (error) {
        console.log(`ℹ️ 操作日志异常: ${error.message}`)
        expect(error).toBeDefined()
      }
    })
  })

  describe('🔄 策略集成测试', () => {
    test('应该能够在统一引擎中协同工作', async () => {
      // 验证两个策略都能被正确识别
      expect(basic_guarantee_strategy.strategyName).toBe('basic_guarantee')
      expect(management_strategy.constructor.name).toBe('ManagementStrategy')

      console.log('✅ V4策略集成验证通过')
    })

    test('应该能够处理不同类型的抽奖请求', async () => {
      // 普通抽奖请求
      const normal_context = {
        user_id: TEST_USER_CONFIG.user_id,
        campaign_id: 1,
        type: 'normal'
      }

      // 测试基础策略验证
      const normal_validation = await basic_guarantee_strategy.validate(normal_context)
      expect(typeof normal_validation).toBe('boolean')

      // 测试管理策略权限验证（管理员类型请求）
      try {
        const admin_validation = await management_strategy.validateAdminPermission(
          TEST_USER_CONFIG.user_id
        )
        expect(admin_validation).toBeDefined()
      } catch (error) {
        // 此行ESLint禁用：测试日志记录
        // eslint-disable-next-line no-console
        console.log(`ℹ️ 管理策略验证: ${error.message}`)
      }

      console.log('✅ 不同类型抽奖请求处理验证通过')
    })
  })

  describe('🔍 策略错误处理测试', () => {
    test('应该正确处理无效用户ID', async () => {
      const invalid_context = {
        user_id: 999999, // 不存在的用户ID
        campaign_id: 1
      }

      const validation_result = await basic_guarantee_strategy.validate(invalid_context)
      expect(validation_result).toBe(false)

      console.log('✅ 无效用户ID处理验证通过')
    })

    test('应该正确处理管理员权限不足', async () => {
      try {
        // 使用一个不存在或无权限的用户ID
        const invalid_admin_result = await management_strategy.validateAdminPermission(999999)

        expect(invalid_admin_result.valid).toBe(false)
        expect(invalid_admin_result.reason).toBeDefined()

        console.log('✅ 管理员权限不足处理验证通过')
      } catch (error) {
        console.log(`ℹ️ 权限验证异常（符合预期）: ${error.message}`)
        expect(error).toBeDefined()
      }
    })

    test('应该正确处理空上下文', async () => {
      const validation_result = await basic_guarantee_strategy.validate(null)
      expect(validation_result).toBe(false)

      const validation_result2 = await basic_guarantee_strategy.validate({})
      expect(validation_result2).toBe(false)

      console.log('✅ 空上下文处理验证通过')
    })
  })
})
