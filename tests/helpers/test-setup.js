/**
 * 测试环境配置和工具函数
 * V4版本 - 移除Mock数据，使用真实数据库
 * 创建时间：2025年01月21日
 * 🔴 更新（2026-01-09）：统一从 .env 加载配置，作为单一真相源
 */

// 🔧 2026-01-09：统一从 .env 加载配置（单一真相源）
// 注意：jest.setup.js 已经加载了 dotenv，此处仅作为备用保障
if (!process.env.DB_HOST) {
  require('dotenv').config()
}

const BeijingTimeHelper = require('../../utils/timeHelper')

// 🔧 设置测试环境标识
process.env.NODE_ENV = 'test'

// 🔧 仅设置非敏感的测试专用配置（.env 中未配置时的兜底）
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret-key-for-development-only'
// 决策25：全环境强制PII_HASH_SECRET（测试环境使用固定测试密钥）
process.env.PII_HASH_SECRET = process.env.PII_HASH_SECRET || 'test-pii-hash-secret-key-32chars!'
// ✅ 测试环境关闭限流（避免 429 干扰业务断言）
process.env.DISABLE_RATE_LIMITER = 'true'

// 🔧 设置测试超时时间（仅在jest环境中）
if (typeof jest !== 'undefined') {
  jest.setTimeout(30000)
}

// ✅ Redis配置：优先使用 .env 中的配置
process.env.REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379'

/**
 * 测试断言工具
 */
class TestAssertions {
  /**
   * 验证API响应格式 - 符合业务标准（接口规范文档）
   * @param {Object} response - API响应对象
   * @param {boolean} expectSuccess - 是否期望成功响应
   */
  static validateApiResponse(response, expectSuccess = true) {
    // 验证业务标准必需字段
    expect(response).toHaveProperty('success')
    expect(response).toHaveProperty('code')
    expect(response).toHaveProperty('message')
    expect(response).toHaveProperty('data')
    expect(response).toHaveProperty('timestamp')
    expect(response).toHaveProperty('version')
    expect(response).toHaveProperty('request_id')

    // 验证字段类型符合业务标准
    expect(typeof response.success).toBe('boolean')
    expect(typeof response.code).toBe('string') // 业务代码是字符串
    expect(typeof response.message).toBe('string') // 用户友好消息
    expect(typeof response.timestamp).toBe('string')
    expect(typeof response.version).toBe('string')
    expect(typeof response.request_id).toBe('string')

    if (expectSuccess) {
      // 业务成功响应：success = true
      expect(response.success).toBe(true)
      expect(response.data).not.toBeNull()
    } else {
      // 业务失败响应：success = false
      expect(response.success).toBe(false)
      // 错误响应的data可以包含错误详情
      expect(response.data).toBeDefined()
    }
  }

  /**
   * 验证数据库记录
   */
  static validateDatabaseRecord(record, requiredFields = []) {
    expect(record).toBeTruthy()

    requiredFields.forEach(field => {
      expect(record).toHaveProperty(field)
      expect(record[field]).not.toBeNull()
    })
  }

  /**
   * 验证时间戳格式
   */
  static validateTimestamp(timestamp) {
    expect(timestamp).toBeTruthy()
    expect(new Date(timestamp).toString()).not.toBe('Invalid Date')
  }

  /**
   * 🚨 验证业务语义一致性 - 防止测试适配错误实现
   */
  static validateBusinessSemantics(actualValue, businessContext) {
    // 业务语义映射表
    const businessTerminology = {
      // 奖品发放状态
      prize_status: {
        correct: 'distributed', // 业务正确术语
        incorrect: ['completed', 'finished', 'done'], // 技术术语
        message: '奖品状态应使用业务术语 "distributed"（已分发）'
      },
      /**
       * V4.6 Phase 5 统一管线架构（2026-01-19）
       * - 使用 1 条统一管线（NormalDrawPipeline）处理所有抽奖请求
       * - 决策来源：preset / guarantee / normal（per-user 暗箱干预已下线）
       */
      pipeline_names: {
        correct: ['NormalDrawPipeline'], // Phase 5: 统一管线
        decision_sources: ['normal', 'preset', 'guarantee'], // 决策来源类型
        incorrect: ['basic', 'guarantee', 'management', 'pipeline'],
        message: 'V4.6 Phase 5: 应使用统一管线 NormalDrawPipeline'
      }
    }

    const terminology = businessTerminology[businessContext]
    if (!terminology) return

    // 检查是否使用了错误的技术术语
    if (terminology.incorrect.includes(actualValue)) {
      throw new Error(
        `❌ 业务语义错误: ${terminology.message}.\n` +
          `实际值: "${actualValue}"\n` +
          `正确值应该是: ${JSON.stringify(terminology.correct)}`
      )
    }
  }

  /**
   * 🚨 验证测试标准不被降低
   */
  static validateTestStandards(testExpectation, context) {
    const dangerousPatterns = [
      {
        pattern: /basic|guarantee|management/, // 简化的策略名
        context: 'strategy_validation',
        message: '测试标准被降低：应验证完整策略类名而不是简化名称'
      },
      {
        pattern: /undefined.*toBe\(true\)/, // 允许undefined值
        context: 'value_validation',
        message: '危险的测试：允许undefined值可能掩盖实现问题'
      },
      {
        pattern: /completed/, // 技术术语在业务场景中
        context: 'business_status',
        message: '可能使用了技术术语而非业务术语'
      }
    ]

    const testString =
      typeof testExpectation === 'string' ? testExpectation : JSON.stringify(testExpectation)

    dangerousPatterns.forEach(({ pattern, context: patternContext, message }) => {
      if (patternContext === context && pattern.test(testString)) {
        console.warn(`⚠️ 测试质量警告: ${message}`)
        console.warn(`   检查内容: ${testString}`)
        console.warn(`   上下文: ${context}`)
      }
    })
  }

  /**
   * 🚨 验证API响应格式一致性 - 业务标准验证
   */
  static validateApiResponseConsistency(response) {
    // 验证业务标准的API响应格式：{success, code, message, data, timestamp, version, request_id}
    const requiredFields = [
      'success',
      'code',
      'message',
      'data',
      'timestamp',
      'version',
      'request_id'
    ]
    const missingFields = requiredFields.filter(
      field => !Object.prototype.hasOwnProperty.call(response, field)
    )

    if (missingFields.length > 0) {
      throw new Error(`API响应不符合业务标准，缺少字段: ${missingFields.join(', ')}`)
    }

    // 验证业务标准字段类型
    if (typeof response.success !== 'boolean') {
      throw new Error('业务标准错误：success字段必须是boolean类型')
    }

    if (typeof response.code !== 'string') {
      throw new Error('业务标准错误：code字段必须是string类型（业务代码）')
    }

    if (typeof response.message !== 'string') {
      throw new Error('业务标准错误：message字段必须是string类型（用户友好消息）')
    }

    if (typeof response.timestamp !== 'string') {
      throw new Error('业务标准错误：timestamp字段必须是string类型')
    }

    if (typeof response.version !== 'string') {
      throw new Error('业务标准错误：version字段必须是string类型')
    }

    if (typeof response.request_id !== 'string') {
      throw new Error('业务标准错误：request_id字段必须是string类型')
    }

    // 检查是否误用了旧的技术格式
    if (typeof response.code === 'number') {
      console.warn('⚠️ 检测到旧的技术格式：code应该是业务代码（string），不是数字状态码')
    }

    if (Object.prototype.hasOwnProperty.call(response, 'msg')) {
      console.warn('⚠️ 检测到旧的技术格式：应使用message字段，不是msg字段')
    }
  }
}

/**
 * 测试时间工具
 */
class TestTimeHelper {
  static getCurrentBeijingTime() {
    return BeijingTimeHelper.now()
  }

  static isValidTimestamp(timestamp) {
    return !isNaN(Date.parse(timestamp))
  }

  static getTimeDifference(time1, time2) {
    return Math.abs(new Date(time1) - new Date(time2))
  }
}

/**
 * 性能测试工具
 */
class PerformanceHelper {
  static async measureExecutionTime(fn) {
    const start = process.hrtime.bigint()
    const result = await fn()
    const end = process.hrtime.bigint()
    const duration = Number(end - start) / 1000000 // 转换为毫秒

    return { result, duration }
  }

  static validateResponseTime(duration, maxTime = 1000) {
    expect(duration).toBeLessThan(maxTime)
  }
}

/**
 * 测试配置
 */
const TestConfig = {
  // 数据库配置 - 使用真实数据库
  database: {
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 3306,
    database: process.env.DB_NAME || 'restaurant_points_dev',
    username: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    dialect: 'mysql',
    logging: process.env.NODE_ENV === 'test' ? false : console.log
  },

  // 测试超时配置
  defaultTimeout: 30000, // 30秒
  longRunningTimeout: 60000, // 60秒

  // API测试配置
  api: {
    baseUrl: process.env.API_BASE_URL || 'http://localhost:3000',
    timeout: 10000
  },

  /**
   * 🔴 P0-1修复：真实测试数据配置
   * 说明：这里只保存 mobile 作为查询key，user_id 和 lottery_campaign_id 通过 initRealTestData() 动态获取
   * 避免硬编码导致的测试数据不一致问题
   */
  realData: {
    // ✅ 统一测试用户手机号 - 实际 user_id 通过 initRealTestData() 查询
    testUser: {
      mobile: '13612227930', // 统一测试用户手机号
      user_id: null // 🔴 P0-1修复：移除硬编码，通过 initRealTestData() 动态获取
    },

    // ✅ 统一管理员信息 - 同一账号既是用户也是管理员
    adminUser: {
      mobile: '13612227930', // 统一管理员手机号
      user_id: null // 🔴 P0-1修复：移除硬编码，通过 initRealTestData() 动态获取
    },

    // ✅ 测试活动信息 - 通过 initRealTestData() 动态获取活跃活动
    testCampaign: {
      lottery_campaign_id: null, // 🔴 P0-1修复：移除硬编码，通过 initRealTestData() 动态获取
      campaignName: null // 测试活动名称，动态获取
    },

    // 🔴 P0-2新增：测试门店信息 - 通过 initRealTestData() 动态获取活跃门店
    testStore: {
      store_id: null, // 🔴 P0-2修复：移除硬编码，通过 initRealTestData() 动态获取
      store_name: null // 测试门店名称，动态获取
    },

    // 🔴 P0-1新增：标记测试数据是否已初始化
    _initialized: false
  },

  /**
   * V4.6 Phase 5 抽奖架构配置验证（2026-01-19）
   *
   * Phase 5 统一管线架构：
   * - 使用 1 条统一管线（NormalDrawPipeline）处理所有抽奖请求
   * - 决策来源由 LoadDecisionSourceStage 在管线内判断（preset/guarantee/normal）
   */
  pipelineValidation: {
    // V4.6 Phase 5 统一管线（新架构）
    pipelines: ['NormalDrawPipeline'], // Phase 5：统一管线
    expectedPipelineCount: 1, // Phase 5：1 条统一管线
    decisionSources: ['normal', 'preset', 'guarantee'] // 决策来源类型
  }
}

/**
 * 🔴 P0-1修复：初始化真实测试数据
 *
 * 解决问题（P0-1原因）：
 * - 原先测试数据硬编码（user_id=31, lottery_campaign_id=2）
 * - 数据库变更后测试失败
 *
 * 解决方案（已实施 2026-01-08）：
 * - 通过 mobile 查询用户真实 user_id
 * - 通过 status='active' 查询活跃活动
 * - 返回值存入 global.testData 供所有测试文件使用
 *
 * @param {string} mobile - 测试用户手机号，默认 '13612227930'
 * @returns {Promise<Object>} 真实测试数据 { testUser, adminUser, testCampaign }
 */
async function initRealTestData(mobile = '13612227930') {
  // 避免重复初始化
  if (TestConfig.realData._initialized) {
    return TestConfig.realData
  }

  try {
    // 延迟加载 models，避免循环依赖
    const { User, LotteryCampaign, Store } = require('../../models')

    // 1. 查询测试用户（PII 改造：mobile 为加密虚拟字段，按盲索引查询，复用 User.findByMobile）
    const user = await User.findByMobile(mobile)

    if (!user) {
      console.warn(`⚠️ initRealTestData: 未找到测试用户 mobile=${mobile}`)
      // 不抛错，允许测试继续（某些测试可能不需要用户）
    } else {
      TestConfig.realData.testUser.user_id = user.user_id
      TestConfig.realData.testUser.mobile = user.mobile
      TestConfig.realData.adminUser.user_id = user.user_id
      TestConfig.realData.adminUser.mobile = user.mobile
      console.log(`✅ initRealTestData: 测试用户 user_id=${user.user_id}, mobile=${user.mobile}`)
    }

    // 2. 查询活跃的测试活动
    const campaign = await LotteryCampaign.findOne({
      where: { status: 'active' },
      order: [['lottery_campaign_id', 'ASC']], // 取第一个活跃活动
      attributes: ['lottery_campaign_id', 'campaign_name', 'campaign_code', 'status']
    })

    if (!campaign) {
      console.warn('⚠️ initRealTestData: 未找到活跃的测试活动')
      // 不抛错，允许测试继续（某些测试可能不需要活动）
    } else {
      TestConfig.realData.testCampaign.lottery_campaign_id = campaign.lottery_campaign_id
      TestConfig.realData.testCampaign.campaignName = campaign.campaign_name
      TestConfig.realData.testCampaign.campaign_code = campaign.campaign_code
      console.log(
        `✅ initRealTestData: 测试活动 lottery_campaign_id=${campaign.lottery_campaign_id}, code=${campaign.campaign_code}, name=${campaign.campaign_name}`
      )
    }

    // 3. 🔴 P0-2新增：查询活跃的测试门店
    const store = await Store.findOne({
      where: { status: 'active' },
      order: [['store_id', 'ASC']], // 取第一个活跃门店
      attributes: ['store_id', 'store_name', 'status']
    })

    if (!store) {
      console.warn('⚠️ initRealTestData: 未找到活跃的测试门店')
      // 不抛错，允许测试继续（某些测试可能不需要门店）
    } else {
      TestConfig.realData.testStore.store_id = store.store_id
      TestConfig.realData.testStore.store_name = store.store_name
      console.log(
        `✅ initRealTestData: 测试门店 store_id=${store.store_id}, name=${store.store_name}`
      )
    }

    TestConfig.realData._initialized = true
    return TestConfig.realData
  } catch (error) {
    console.error('❌ initRealTestData 失败:', error.message)
    // 不抛错，允许测试继续
    return TestConfig.realData
  }
}

/**
 * 🔴 P0-1新增：获取真实测试用户ID
 *
 * @param {string} mobile - 测试用户手机号
 * @returns {Promise<number|null>} 用户ID
 */
async function getRealTestUserId(mobile = '13612227930') {
  if (!TestConfig.realData._initialized) {
    await initRealTestData(mobile)
  }
  return TestConfig.realData.testUser.user_id
}

/**
 * 🔴 P0-1新增：获取真实测试活动ID
 *
 * @returns {Promise<number|null>} 活动ID
 */
async function getRealTestCampaignId() {
  if (!TestConfig.realData._initialized) {
    await initRealTestData()
  }
  return TestConfig.realData.testCampaign.lottery_campaign_id
}

/**
 * 🔴 P0-2新增：获取真实测试门店ID
 *
 * @returns {Promise<number|null>} 门店ID
 */
async function getRealTestStoreId() {
  if (!TestConfig.realData._initialized) {
    await initRealTestData()
  }
  return TestConfig.realData.testStore.store_id
}

/**
 * 🔧 修复测试超时问题 - 清理定时器
 *
 * 问题根因:
 * - routes/v4/system.js中有多个setInterval定时任务
 * - 部分服务在初始化时启动了缓存清理 setInterval
 * - 这些定时器在测试环境中不会自动清理，导致Jest超时
 *
 * 解决方案:
 * - 在测试环境中mock所有定时器函数
 * - 测试完成后清理所有定时器
 *
 * 创建时间: 2025-11-14
 */
if (typeof jest !== 'undefined') {
  // 保存原始的定时器函数
  const originalSetInterval = global.setInterval
  const originalSetTimeout = global.setTimeout
  const timers = []

  // Mock setInterval - 记录所有定时器
  global.setInterval = function (...args) {
    const timer = originalSetInterval.apply(this, args)
    timers.push({ type: 'interval', timer })
    return timer
  }

  // Mock setTimeout - 记录所有定时器
  global.setTimeout = function (...args) {
    const timer = originalSetTimeout.apply(this, args)
    timers.push({ type: 'timeout', timer })
    return timer
  }

  // 在每个测试套件结束后清理定时器
  afterAll(() => {
    console.log(`🧹 清理${timers.length}个定时器...`)
    timers.forEach(({ type, timer }) => {
      try {
        if (type === 'interval') {
          clearInterval(timer)
        } else {
          clearTimeout(timer)
        }
      } catch (error) {
        // 忽略清理错误
      }
    })
    timers.length = 0

    // 恢复原始函数
    global.setInterval = originalSetInterval
    global.setTimeout = originalSetTimeout
  })

  // 🔧 清理 Redis 连接（避免 open handles 导致 Jest 报告 TCPWRAP）
  afterAll(async () => {
    try {
      const { getRedisClient } = require('../../utils/UnifiedRedisClient')
      const redisClient = getRedisClient()
      if (redisClient && typeof redisClient.disconnect === 'function') {
        await redisClient.disconnect()
      }
    } catch (error) {
      // 忽略清理错误，避免影响测试结果
    }
  })
}

// 导出工具类 - 只保留真实数据工具
module.exports = {
  TestAssertions,
  TestTimeHelper,
  PerformanceHelper,
  TestConfig,
  // 🔴 P0-1修复：导出测试数据初始化函数
  initRealTestData,
  getRealTestUserId,
  getRealTestCampaignId,
  // 🔴 P0-2新增：导出获取测试门店ID函数
  getRealTestStoreId
}
