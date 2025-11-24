/**
 * 🎯 积分业务测试套件（V4架构 - 业务域整合版本）
 *
 * 创建时间：2025年11月12日 北京时间
 * 版本：V4.0 - 按《测试体系优化方案实施指南》重构
 *
 * 业务模块：用户积分系统
 * 覆盖范围：积分获取、使用、查询、软删除、恢复、事务保护
 *
 * 业务背景：
 * - 用户通过抽奖、签到、分享等方式获得积分
 * - 积分可用于兑换奖品、抵扣订单金额
 * - 积分操作需要事务保护，确保数据一致性
 * - 支持软删除和恢复功能
 *
 * 技术架构：
 * - API层：routes/v4/unified-engine/points.js
 * - 服务层：services/PointsService.js
 * - 数据层：models/UserPointsAccount.js, models/UserPointsLog.js
 * - 引擎层：services/UnifiedLotteryEngine (积分发放)
 *
 * 测试数据：
 * - 使用真实数据库 restaurant_points_dev
 * - 测试账号：13612227930 (user_id: 31)
 * - 统一测试数据来源：tests/helpers/test-data.js
 */

const request = require('supertest')
const app = require('../../../app')
const { TEST_DATA, createTestData } = require('../../helpers/test-data')
const { TestAssertions, TestConfig } = require('../../helpers/test-setup')
const { getTestUserToken } = require('../../helpers/auth-helper')

/*
 * ==========================================
 * 🔧 测试环境设置
 * ==========================================
 */
describe('积分业务测试套件（V4架构）', () => {
  let testUserId
  let authToken

  // 所有测试前：初始化测试环境
  beforeAll(async () => {
    console.log('🚀 积分业务测试启动')
    console.log('='.repeat(70))
    console.log(`👤 测试账号: ${TEST_DATA.users.testUser.mobile}`)
    console.log(`🆔 用户ID: ${TEST_DATA.users.testUser.user_id}`)
    console.log(`🗄️ 数据库: ${TestConfig.database.database}`)
    console.log('='.repeat(70))

    testUserId = TEST_DATA.users.testUser.user_id

    // 🔐 获取测试用户的真实认证token
    authToken = await getTestUserToken(app)
  })

  // 所有测试后：清理资源
  afterAll(async () => {
    console.log('🏁 积分业务测试完成')
  })

  /*
   * ==========================================
   * 📊 积分查询功能测试（基础功能）
   * ==========================================
   */
  describe('积分查询功能', () => {
    /**
     * 业务场景：用户查看自己的积分余额
     * API路径：GET /api/v4/user/points
     * 预期行为：返回当前可用积分和累计积分
     * 技术细节：对应路由中的积分查询接口
     */
    test('应该能查询用户积分余额', async () => {
      const response = await request(app)
        .get('/api/v4/user/points')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200)

      // 验证业务标准API响应格式
      TestAssertions.validateApiResponse(response.body, true)

      // 验证积分数据结构
      expect(response.body.data).toHaveProperty('total_points')
      expect(response.body.data).toHaveProperty('available_points')
      expect(typeof response.body.data.total_points).toBe('number')
      expect(typeof response.body.data.available_points).toBe('number')

      console.log(`✅ 积分查询成功: 可用积分 ${response.body.data.available_points}`)
    })

    /**
     * 业务场景：查询积分交易历史
     * API路径：GET /api/v4/points/transactions
     * 预期行为：返回积分获取和使用的历史记录
     */
    test('应该能查询积分交易历史', async () => {
      const response = await request(app)
        .get('/api/v4/points/transactions')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200)

      TestAssertions.validateApiResponse(response.body, true)

      expect(response.body.data).toHaveProperty('transactions')
      expect(Array.isArray(response.body.data.transactions)).toBe(true)
      expect(response.body.data).toHaveProperty('total_count')

      console.log(`✅ 交易历史查询成功: 共 ${response.body.data.total_count} 条记录`)
    })

    /**
     * 业务场景：查询积分统计信息
     * API路径：GET /api/v4/points/statistics
     * 预期行为：返回累计获得、累计消费等统计数据
     */
    test('应该能查询积分统计信息', async () => {
      const response = await request(app)
        .get('/api/v4/points/statistics')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200)

      TestAssertions.validateApiResponse(response.body, true)

      expect(response.body.data).toHaveProperty('total_earned')
      expect(response.body.data).toHaveProperty('total_spent')

      console.log(`✅ 统计信息查询成功: 累计获得 ${response.body.data.total_earned}, 累计消费 ${response.body.data.total_spent}`)
    })

    /**
     * 安全测试：未认证用户不能查询积分
     * 预期行为：返回401未认证错误
     */
    test('未认证用户应该返回401错误', async () => {
      await request(app)
        .get('/api/v4/user/points')
        // 不设置Authorization header
        .expect(401)

      console.log('✅ 未认证用户被正确拒绝')
    })
  })

  /*
   * 注意：积分获取和使用功能的测试已集成到lottery_flow.test.js中
   * 这些功能通过抽奖流程进行完整的端到端测试
   */

  /*
   * ==========================================
   * 🎲 积分趋势分析测试（个人中心功能）
   * ==========================================
   */
  describe('积分趋势分析功能', () => {
    /**
     * 业务场景：个人中心积分趋势图展示
     * API路径：GET /api/v4/points/trend?days=30
     * 预期行为：返回指定天数的积分获得/消费趋势数据
     * 返回格式：
     * {
     *   labels: ["2025-10-13", "2025-10-14", ...],  // 日期标签数组
     *   earn_data: [100, 50, 200, ...],             // 每日获得积分
     *   consume_data: [20, 30, 10, ...]             // 每日消费积分
     * }
     */
    test('应该能查询30天积分趋势', async () => {
      const response = await request(app)
        .get('/api/v4/points/trend?days=30')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200)

      TestAssertions.validateApiResponse(response.body, true)

      // 验证趋势数据结构
      expect(response.body.data).toHaveProperty('labels')
      expect(response.body.data).toHaveProperty('earn_data')
      expect(response.body.data).toHaveProperty('consume_data')

      expect(Array.isArray(response.body.data.labels)).toBe(true)
      expect(Array.isArray(response.body.data.earn_data)).toBe(true)
      expect(Array.isArray(response.body.data.consume_data)).toBe(true)

      // 验证数据长度一致
      const labelsLength = response.body.data.labels.length
      expect(response.body.data.earn_data.length).toBe(labelsLength)
      expect(response.body.data.consume_data.length).toBe(labelsLength)

      console.log(`✅ 积分趋势查询成功: ${labelsLength}天数据`)
    })

    /**
     * 边界测试：查询天数应在7-90天之间
     */
    test('查询天数超出范围应该返回错误', async () => {
      // 测试天数过小
      await request(app)
        .get('/api/v4/points/trend?days=5')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(400)

      // 测试天数过大
      await request(app)
        .get('/api/v4/points/trend?days=100')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(400)

      console.log('✅ 参数验证: 天数范围限制生效')
    })
  })

  /*
   * 注意：软删除、恢复和事务保护功能的测试在shared/目录的专用测试套件中
   * - 软删除测试: tests/shared/soft_delete.test.js
   * - 事务保护测试: tests/shared/transaction.test.js
   * 这些通用功能使用共享测试工具进行验证
   */

  /*
   * ==========================================
   * 🔐 积分余额验证功能测试
   * ==========================================
   */
  describe('积分余额验证功能', () => {
    /**
     * 业务场景：抽奖前验证用户积分是否足够
     * API路径：POST /api/v4/points/validate
     * 请求参数：
     * {
     *   required_points: 100,        // 需要的积分数量
     *   operation_type: 'lottery'    // 操作类型（lottery, exchange等）
     * }
     * 返回格式：
     * {
     *   is_valid: true,              // 是否有效
     *   current_balance: 500         // 当前余额
     * }
     */
    test('应该能验证积分余额是否足够', async () => {
      const validateData = {
        required_points: 100,
        operation_type: 'lottery'
      }

      const response = await request(app)
        .post('/api/v4/points/validate')
        .set('Authorization', `Bearer ${authToken}`)
        .send(validateData)
        .expect(200)

      TestAssertions.validateApiResponse(response.body, true)

      expect(response.body.data).toHaveProperty('is_valid')
      expect(response.body.data).toHaveProperty('current_balance')
      expect(typeof response.body.data.is_valid).toBe('boolean')
      expect(typeof response.body.data.current_balance).toBe('number')

      console.log(`✅ 余额验证成功: 当前余额 ${response.body.data.current_balance}, 验证结果 ${response.body.data.is_valid}`)
    })

    /**
     * 边界测试：验证必需参数
     */
    test('缺少必需参数应该返回400错误', async () => {
      await request(app)
        .post('/api/v4/points/validate')
        .set('Authorization', `Bearer ${authToken}`)
        .send({}) // 缺少required_points参数
        .expect(400)

      console.log('✅ 参数验证: 缺少必需参数被正确拒绝')
    })
  })
})

// 测试辅助函数已集成到helpers/test-data.js和helpers/auth-helper.js中
