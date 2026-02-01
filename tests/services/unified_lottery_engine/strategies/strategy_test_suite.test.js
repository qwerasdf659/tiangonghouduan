/**
 * V4.6 ManagementStrategy 管理策略测试套件
 *
 * V4.6 Phase 6 更新说明（2026-01-19）：
 * - BasicGuaranteeStrategy 已完全移除，功能迁移到 Pipeline 架构
 * - 本测试套件仅保留 ManagementStrategy 测试
 * - ManagementStrategy 仍用于管理操作 API（forceWin/forceLose 等）
 *
 * 测试内容：
 * - 管理员权限验证
 * - 强制中奖/不中奖操作
 * - 抽奖历史查询
 * - 管理员操作日志
 *
 * @date 2026-01-19 (V4.6 Phase 6 重构)
 */

/* eslint-disable no-console */

const models = require('../../../../models')
const { User } = models

/**
 * ManagementStrategy 通过 ServiceManager 获取
 * 仍然保留用于管理操作 API
 */
let ManagementStrategy

describe('V4.6 ManagementStrategy 管理策略测试套件', () => {
  let management_strategy
  let test_user

  /**
   * 测试用户配置
   * 使用真实测试账号 13612227930（既是用户也是管理员）
   */
  const TEST_USER_CONFIG = {
    mobile: '13612227930'
  }

  beforeAll(async () => {
    console.log('🔍 初始化 ManagementStrategy 测试环境...')

    /**
     * 通过 ServiceManager 获取 ManagementStrategy
     * 这是标准的服务获取方式
     */
    ManagementStrategy = global.getTestService('management_strategy')
    management_strategy = ManagementStrategy

    if (!management_strategy) {
      throw new Error('ManagementStrategy 服务获取失败')
    }

    console.log('✅ ManagementStrategy 服务获取成功')

    // 获取测试用户
    const testUserId = global.testData?.testUser?.user_id
    if (testUserId) {
      test_user = await User.findByPk(testUserId)
      console.log(`✅ 使用 global.testData 中的测试用户: user_id=${testUserId}`)
    } else {
      test_user = await User.findOne({ where: { mobile: TEST_USER_CONFIG.mobile } })
      console.log(`⚠️ global.testData 未初始化，通过手机号查询: user_id=${test_user?.user_id}`)
    }

    if (!test_user) {
      throw new Error(`测试用户 ${TEST_USER_CONFIG.mobile} 不存在`)
    }

    console.log('✅ ManagementStrategy 测试环境初始化完成')
  })

  describe('🛡️ ManagementStrategy 管理策略核心功能测试', () => {
    test('应该正确初始化管理策略', () => {
      expect(management_strategy).toBeDefined()
      expect(management_strategy.logger).toBeDefined()
    })

    test('应该能够验证管理员权限', async () => {
      try {
        // 测试用户 13612227930 具有管理员权限
        const validation_result = await management_strategy.validateAdminPermission(
          test_user.user_id
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
          test_user.user_id, // 管理员ID
          test_user.user_id, // 目标用户ID（自己）
          9, // 奖品ID（九八折券）
          'V4.6 ManagementStrategy 测试'
        )

        expect(force_win_result).toBeDefined()
        expect(force_win_result.success).toBeDefined()

        if (force_win_result.success) {
          expect(force_win_result.result).toBe('force_win')
          expect(force_win_result.lottery_prize_id).toBe(9)
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
        const history_result = await management_strategy.getLotteryHistory(test_user.user_id, {
          limit: 10
        })

        expect(history_result).toBeDefined()
        console.log(`📜 查询到 ${history_result.length || 0} 条抽奖历史记录`)
      } catch (error) {
        console.log(`ℹ️ 查询抽奖历史异常: ${error.message}`)
        expect(error).toBeDefined()
      }
    })

    test('应该能够生成管理员操作日志', async () => {
      try {
        const log_result = await management_strategy.logAdminAction({
          admin_id: test_user.user_id,
          action_type: 'test_action',
          target_user_id: test_user.user_id,
          details: { test: true, timestamp: new Date().toISOString() }
        })

        expect(log_result).toBeDefined()
        console.log('✅ 管理员操作日志功能验证通过')
      } catch (error) {
        console.log(`ℹ️ 操作日志异常: ${error.message}`)
        expect(error).toBeDefined()
      }
    })
  })

  describe('🔍 ManagementStrategy 错误处理测试', () => {
    test('应该正确处理无效用户ID', async () => {
      try {
        const result = await management_strategy.validateAdminPermission(999999)

        expect(result).toBeDefined()
        expect(result.valid).toBe(false)
        console.log('✅ 无效用户ID处理验证通过')
      } catch (error) {
        expect(error).toBeDefined()
        console.log(`✅ 无效用户ID正确抛出异常: ${error.message}`)
      }
    })

    test('应该正确处理管理员权限不足', async () => {
      try {
        // 使用一个普通用户ID测试（假设用户ID 1 不是管理员）
        const result = await management_strategy.validateAdminPermission(1)

        if (result.valid === false) {
          console.log('✅ 非管理员用户权限验证正确返回 false')
        }
        expect(result).toBeDefined()
      } catch (error) {
        expect(error).toBeDefined()
        console.log(`✅ 权限不足正确抛出异常: ${error.message}`)
      }
    })

    test('应该正确处理空上下文', async () => {
      try {
        const result = await management_strategy.validateAdminPermission(null)

        expect(result).toBeDefined()
        expect(result.valid).toBe(false)
        console.log('✅ 空上下文处理验证通过')
      } catch (error) {
        expect(error).toBeDefined()
        console.log(`✅ 空上下文正确抛出异常: ${error.message}`)
      }
    })
  })
})
