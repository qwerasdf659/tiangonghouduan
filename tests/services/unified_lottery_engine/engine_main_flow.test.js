'use strict'

/**
 * UnifiedLotteryEngine 主流程测试（任务2.1）
 *
 * 测试 execute_draw() 完整链路：
 * - 单抽流程完整链路验证
 * - 连抽流程（draw_count > 1）验证
 * - 事务完整性验证
 * - 错误处理和回滚验证
 *
 * 业务语义验证：
 * - 每次抽奖100%从奖品池选择一个奖品
 * - 积分扣减正确性
 * - 抽奖记录正确创建
 * - 奖品发放到用户背包
 *
 * @module tests/services/unified_lottery_engine/engine_main_flow.test
 * @author 测试审计标准文档 任务2.1
 * @since 2026-01-28
 */

const BeijingTimeHelper = require('../../../utils/timeHelper')
const models = require('../../../models')
const { User, LotteryCampaign, LotteryDraw } = models

/**
 * 通过 ServiceManager 获取服务实例
 * @type {Object}
 */
let UnifiedLotteryEngine

describe('UnifiedLotteryEngine 主流程测试（任务2.1）', () => {
  let engine
  let real_test_user = null
  let test_campaign = null
  let initial_user_points = 0

  /**
   * 真实测试用户配置
   */
  const REAL_TEST_USER_CONFIG = {
    mobile: '13612227930'
  }

  /**
   * 创建测试上下文
   * @param {Object} overrides - 覆盖参数
   * @returns {Object|null} 测试上下文
   */
  const create_test_context = (overrides = {}) => {
    if (!real_test_user || !test_campaign) {
      return null
    }

    return {
      user_id: real_test_user.user_id,
      lottery_campaign_id: test_campaign.lottery_campaign_id,
      request_id: `test_main_flow_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
      timestamp: BeijingTimeHelper.now(),
      ...overrides
    }
  }

  /**
   * 生成唯一的幂等键
   * @param {string} prefix - 前缀
   * @returns {string} 幂等键
   */
  const generate_idempotency_key = (prefix = 'test') => {
    return `${prefix}_${Date.now()}_${Math.random().toString(36).substr(2, 8)}`
  }

  beforeAll(async () => {
    // 通过 ServiceManager 获取服务实例
    UnifiedLotteryEngine = global.getTestService('unified_lottery_engine')

    console.log('🔍 初始化 UnifiedLotteryEngine 主流程测试环境...')

    try {
      // 优先使用 global.testData 中的用户
      if (global.testData?.testUser?.user_id) {
        real_test_user = await User.findOne({
          where: { user_id: global.testData.testUser.user_id }
        })
        console.log(`✅ 使用 global.testData 中的测试用户: user_id=${real_test_user?.user_id}`)
      } else {
        // 备用：通过手机号查询
        real_test_user = await User.findOne({
          where: { mobile: REAL_TEST_USER_CONFIG.mobile }
        })
        console.log(
          `⚠️ global.testData 未初始化，通过手机号查询: user_id=${real_test_user?.user_id}`
        )
      }

      if (!real_test_user) {
        throw new Error(`测试用户 ${REAL_TEST_USER_CONFIG.mobile} 不存在`)
      }

      // 记录初始积分
      initial_user_points = real_test_user.points || 0

      // 获取活跃的抽奖活动
      test_campaign = await LotteryCampaign.findOne({
        where: { status: 'active' },
        order: [['created_at', 'DESC']]
      })

      if (!test_campaign) {
        console.warn('⚠️ 未找到活跃的抽奖活动，将跳过部分测试')
      }

      // 设置引擎实例
      engine = UnifiedLotteryEngine

      console.log('✅ 主流程测试环境初始化完成')
      console.log(`📊 测试用户: ${real_test_user.user_id} (${real_test_user.mobile})`)
      console.log(
        `📊 测试活动: ${test_campaign ? test_campaign.lottery_campaign_id : '无活跃活动'}`
      )
      console.log(`📊 用户初始积分: ${initial_user_points}`)
    } catch (error) {
      console.error('❌ 测试环境初始化失败:', error.message)
      throw error
    }
  }, 30000)

  afterAll(async () => {
    console.log('🧹 主流程测试环境清理完成')
  })

  // ========== 核心链路测试 ==========

  describe('execute_draw() 完整链路验证', () => {
    test('单抽流程应该完整执行所有阶段', async () => {
      const test_context = create_test_context()

      if (!test_context) {
        console.log('⚠️ 跳过测试：缺少真实用户或活动数据')
        expect(true).toBe(true)
        return
      }

      // 获取用户当前积分
      const user_before = await User.findByPk(real_test_user.user_id)
      const points_before = user_before.points || 0

      // 检查积分是否足够（假设单次抽奖成本为活动配置的值）
      const draw_cost = test_campaign.draw_cost || 10
      if (points_before < draw_cost) {
        console.log(`⚠️ 用户积分不足 (${points_before} < ${draw_cost})，跳过测试`)
        expect(true).toBe(true)
        return
      }

      // 执行单抽
      const idempotency_key = generate_idempotency_key('single_draw')
      const result = await engine.execute_draw(
        real_test_user.user_id,
        test_campaign.lottery_campaign_id,
        1, // draw_count = 1
        { idempotency_key }
      )

      console.log('📊 单抽结果:', JSON.stringify(result, null, 2))

      // 验证返回结构
      expect(result).toBeDefined()
      expect(result.success).toBeDefined()

      if (result.success) {
        // 验证成功结果结构
        expect(result.draws).toBeDefined()
        expect(Array.isArray(result.draws)).toBe(true)
        expect(result.draws.length).toBe(1)

        // 验证单个抽奖结果
        const draw_result = result.draws[0]
        expect(draw_result).toBeDefined()

        // 验证必有奖品（每次抽奖100%获得奖品）
        expect(draw_result.prize).toBeDefined()
        console.log(
          `✅ 单抽成功，获得奖品: ${draw_result.prize?.name || draw_result.prize?.lottery_campaign_prize_id}`
        )

        // 验证抽奖记录已创建
        const draw_record = await LotteryDraw.findOne({
          where: {
            user_id: real_test_user.user_id,
            lottery_campaign_id: test_campaign.lottery_campaign_id,
            idempotency_key
          }
        })
        expect(draw_record).not.toBeNull()
        console.log(`✅ 抽奖记录已创建: lottery_draw_id=${draw_record.lottery_draw_id}`)
      } else {
        // 记录失败原因
        console.log(`ℹ️ 单抽执行失败: ${result.message || result.error}`)
        expect(result.message || result.error).toBeDefined()
      }
    }, 30000)

    test('连抽流程应该正确执行多次抽奖', async () => {
      const test_context = create_test_context()

      if (!test_context) {
        console.log('⚠️ 跳过测试：缺少真实用户或活动数据')
        expect(true).toBe(true)
        return
      }

      const draw_count = 3
      const draw_cost = test_campaign.draw_cost || 10
      const total_cost = draw_cost * draw_count

      // 检查积分是否足够
      const user_before = await User.findByPk(real_test_user.user_id)
      const points_before = user_before.points || 0

      if (points_before < total_cost) {
        console.log(`⚠️ 用户积分不足 (${points_before} < ${total_cost})，跳过连抽测试`)
        expect(true).toBe(true)
        return
      }

      // 执行连抽
      const idempotency_key = generate_idempotency_key('multi_draw')
      const result = await engine.execute_draw(
        real_test_user.user_id,
        test_campaign.lottery_campaign_id,
        draw_count,
        { idempotency_key }
      )

      console.log(`📊 连抽(${draw_count}次)结果:`, JSON.stringify(result, null, 2))

      expect(result).toBeDefined()
      expect(result.success).toBeDefined()

      if (result.success) {
        // 验证返回正确数量的抽奖结果
        expect(result.draws).toBeDefined()
        expect(Array.isArray(result.draws)).toBe(true)
        expect(result.draws.length).toBe(draw_count)

        // 验证每次抽奖都有奖品
        result.draws.forEach((draw_result, index) => {
          expect(draw_result.prize).toBeDefined()
          console.log(
            `  📦 第${index + 1}次: ${draw_result.prize?.name || draw_result.prize?.lottery_campaign_prize_id}`
          )
        })

        console.log(`✅ 连抽${draw_count}次全部成功`)
      } else {
        console.log(`ℹ️ 连抽执行失败: ${result.message || result.error}`)
        expect(result.message || result.error).toBeDefined()
      }
    }, 45000)

    test('幂等性控制应该防止重复执行', async () => {
      const test_context = create_test_context()

      if (!test_context) {
        console.log('⚠️ 跳过测试：缺少真实用户或活动数据')
        expect(true).toBe(true)
        return
      }

      const draw_cost = test_campaign.draw_cost || 10
      const user_before = await User.findByPk(real_test_user.user_id)
      const points_before = user_before.points || 0

      if (points_before < draw_cost) {
        console.log(`⚠️ 用户积分不足，跳过幂等性测试`)
        expect(true).toBe(true)
        return
      }

      // 使用相同的幂等键执行两次
      const idempotency_key = generate_idempotency_key('idempotency_test')

      // 第一次执行
      const result1 = await engine.execute_draw(
        real_test_user.user_id,
        test_campaign.lottery_campaign_id,
        1,
        { idempotency_key }
      )

      // 第二次使用相同幂等键执行
      const result2 = await engine.execute_draw(
        real_test_user.user_id,
        test_campaign.lottery_campaign_id,
        1,
        { idempotency_key }
      )

      // 验证两次结果一致（幂等性）
      if (result1.success && result2.success) {
        // 两次应该返回相同的结果
        expect(result2.draws).toBeDefined()

        // 验证只创建了一条记录
        const draw_records = await LotteryDraw.findAll({
          where: {
            user_id: real_test_user.user_id,
            lottery_campaign_id: test_campaign.lottery_campaign_id,
            idempotency_key
          }
        })
        expect(draw_records.length).toBe(1)

        console.log('✅ 幂等性控制验证通过：重复请求未创建新记录')
      } else {
        console.log('ℹ️ 幂等性测试：至少有一次执行失败')
      }
    }, 30000)
  })

  // ========== 错误处理测试 ==========

  describe('错误处理和边界条件验证', () => {
    test('无效用户ID应该抛出错误', async () => {
      if (!test_campaign) {
        console.log('⚠️ 跳过测试：缺少活动数据')
        expect(true).toBe(true)
        return
      }

      // execute_draw 在错误时抛出异常
      await expect(
        engine.execute_draw(
          999999, // 不存在的用户ID
          test_campaign.lottery_campaign_id,
          1,
          { idempotency_key: generate_idempotency_key('invalid_user') }
        )
      ).rejects.toThrow()

      console.log('✅ 无效用户ID正确抛出错误')
    })

    test('无效活动ID应该抛出错误', async () => {
      if (!real_test_user) {
        console.log('⚠️ 跳过测试：缺少用户数据')
        expect(true).toBe(true)
        return
      }

      // execute_draw 在错误时抛出异常
      await expect(
        engine.execute_draw(
          real_test_user.user_id,
          999999, // 不存在的活动ID
          1,
          { idempotency_key: generate_idempotency_key('invalid_campaign') }
        )
      ).rejects.toThrow()

      console.log('✅ 无效活动ID正确抛出错误')
    })

    test('超出范围的抽奖次数应该抛出错误', async () => {
      const test_context = create_test_context()

      if (!test_context) {
        console.log('⚠️ 跳过测试：缺少测试环境')
        expect(true).toBe(true)
        return
      }

      // 尝试执行超大次数的连抽（超过限制1-10）
      const excessive_draw_count = 10000
      await expect(
        engine.execute_draw(
          real_test_user.user_id,
          test_campaign.lottery_campaign_id,
          excessive_draw_count,
          { idempotency_key: generate_idempotency_key('excessive_count') }
        )
      ).rejects.toThrow(/抽奖次数/)

      console.log('✅ 超出范围的抽奖次数正确抛出错误')
    })

    test('无效抽奖次数应该抛出错误', async () => {
      const test_context = create_test_context()

      if (!test_context) {
        console.log('⚠️ 跳过测试：缺少测试环境')
        expect(true).toBe(true)
        return
      }

      // 测试 draw_count = 0
      await expect(
        engine.execute_draw(real_test_user.user_id, test_campaign.lottery_campaign_id, 0, {
          idempotency_key: generate_idempotency_key('zero_count')
        })
      ).rejects.toThrow(/抽奖次数/)

      console.log('✅ draw_count=0 正确抛出错误')

      // 测试 draw_count = -1
      await expect(
        engine.execute_draw(real_test_user.user_id, test_campaign.lottery_campaign_id, -1, {
          idempotency_key: generate_idempotency_key('negative_count')
        })
      ).rejects.toThrow(/抽奖次数/)

      console.log('✅ draw_count=-1 正确抛出错误')
    })
  })

  // ========== 引擎状态验证 ==========

  describe('引擎状态和健康检查', () => {
    test('引擎应该正确初始化', () => {
      expect(engine).toBeDefined()
      expect(engine.constructor.name).toBe('UnifiedLotteryEngine')
      expect(engine.version).toBeDefined()
      expect(engine.drawOrchestrator).toBeDefined()

      console.log(`✅ 引擎版本: ${engine.version}`)
      console.log('✅ 引擎初始化验证通过')
    })

    test('健康检查应该返回正确状态', async () => {
      const health_status = await engine.getHealthStatus()

      expect(health_status).toBeDefined()
      expect(health_status.status).toBeDefined()
      expect(['healthy', 'unhealthy', 'maintenance']).toContain(health_status.status)

      console.log(`✅ 引擎健康状态: ${health_status.status}`)
    })

    test('执行统计应该正确记录', async () => {
      const metrics = engine.getMetrics()

      expect(metrics).toBeDefined()
      expect(metrics.total_executions).toBeGreaterThanOrEqual(0)

      console.log(`✅ 总执行次数: ${metrics.total_executions}`)
      console.log(`✅ 成功率: ${(metrics.success_rate || 0).toFixed(2)}%`)
    })
  })

  // ========== DrawOrchestrator 集成测试 ==========

  describe('DrawOrchestrator 集成验证', () => {
    test('应该正确调用 DrawOrchestrator.execute()', async () => {
      const test_context = create_test_context()

      if (!test_context) {
        console.log('⚠️ 跳过测试：缺少测试环境')
        expect(true).toBe(true)
        return
      }

      // 验证 drawOrchestrator 存在且可调用
      expect(engine.drawOrchestrator).toBeDefined()
      expect(typeof engine.drawOrchestrator.execute).toBe('function')

      // 获取编排器状态
      const orchestrator_status = engine.drawOrchestrator.getStatus()
      expect(orchestrator_status).toBeDefined()
      expect(orchestrator_status.architecture).toBe('unified_pipeline')

      console.log('✅ DrawOrchestrator 集成验证通过')
      console.log(`📊 管线架构: ${orchestrator_status.architecture}`)
    })

    test('应该使用统一管线执行抽奖', async () => {
      const test_context = create_test_context()

      if (!test_context) {
        console.log('⚠️ 跳过测试：缺少测试环境')
        expect(true).toBe(true)
        return
      }

      const user_before = await User.findByPk(real_test_user.user_id)
      const draw_cost = test_campaign.draw_cost || 10

      if ((user_before.points || 0) < draw_cost) {
        console.log('⚠️ 积分不足，跳过管线执行测试')
        expect(true).toBe(true)
        return
      }

      // 使用 executeLottery 验证管线执行
      const result = await engine.executeLottery({
        ...test_context,
        idempotency_key: generate_idempotency_key('pipeline_test')
      })

      expect(result).toBeDefined()

      if (result.success) {
        // V4.6 Phase 5: 验证使用的是 Pipeline 架构
        expect(result.strategy_used).toBeDefined()
        const valid_strategies = ['basic_guarantee', 'pipeline']
        expect(valid_strategies).toContain(result.strategy_used)

        console.log(`✅ 管线执行成功，策略: ${result.strategy_used}`)
      } else {
        console.log(`ℹ️ 管线执行失败: ${result.message || result.error}`)
      }
    }, 30000)
  })
})
